//! Automatic updater support and release metadata validation.
//!
//! Follows the Tauri 2 updater manifest specification while enforcing Kinora's
//! network security guarantees (guarded client, HTTPS-only, no loopback or private SSRF).

use crate::fetch;
use crate::ingest::{ErrorCode, IngestError};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Default official update manifest endpoint for Kinora stable releases on GitHub.
pub const DEFAULT_UPDATE_ENDPOINT: &str =
    "https://github.com/millsydotdev/KinoraTV/releases/latest/download/latest.json";

/// Official GitHub Releases API endpoint used to discover opt-in prereleases (since GitHub's
/// `/releases/latest` redirect never serves prereleases).
pub const GITHUB_RELEASES_API: &str =
    "https://api.github.com/repos/millsydotdev/KinoraTV/releases?per_page=15";

/// Standard Tauri 2 update manifest structure published by GitHub Actions release workflows.
#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct UpdateManifest {
    pub version: String,
    pub notes: Option<String>,
    #[serde(rename = "pub_date")]
    pub pub_date: Option<String>,
    pub platforms: HashMap<String, PlatformAsset>,
}

/// Asset details for a specific operating system and architecture target.
#[derive(Deserialize, Serialize, Debug, Clone)]
pub struct PlatformAsset {
    pub signature: Option<String>,
    pub url: String,
}

/// Structured outcome of an update check returned to the frontend.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    /// Status: "upToDate", "available", "unsupportedPlatform", or "error"
    pub status: String,
    pub current_version: String,
    pub latest_version: Option<String>,
    pub release_date: Option<String>,
    pub release_notes: Option<String>,
    pub download_url: Option<String>,
    pub has_signature: bool,
    pub platform_key: String,
    pub platform_supported: bool,
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manifest_url: Option<String>,
}

#[derive(Deserialize, Debug)]
struct GitHubReleaseEntry {
    tag_name: String,
    draft: bool,
    prerelease: bool,
    #[serde(default)]
    assets: Vec<GitHubReleaseAsset>,
}

#[derive(Deserialize, Debug)]
struct GitHubReleaseAsset {
    name: String,
    browser_download_url: String,
}

fn is_trusted_github_manifest_url(raw: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(raw.trim()) else {
        return false;
    };
    url.scheme() == "https"
        && matches!(url.host_str(), Some("github.com"))
        && url
            .path()
            .starts_with("/millsydotdev/KinoraTV/releases/download/")
        && url.path().ends_with("/latest.json")
}

/// Selects the highest-SemVer release with a trusted `latest.json` manifest asset from a GitHub
/// Releases API payload, enforcing channel compatibility (`stable` vs opt-in `prerelease`).
pub fn select_best_manifest_url_from_github_releases(
    releases_json: &str,
    current_version: &str,
    allow_prereleases: bool,
) -> Result<Option<(String, String)>, IngestError> {
    let releases: Vec<GitHubReleaseEntry> = serde_json::from_str(releases_json).map_err(|e| {
        IngestError::new(
            ErrorCode::Network,
            format!("GitHub releases response could not be parsed: {e}"),
        )
    })?;

    let mut best: Option<(String, String)> = None;

    for rel in releases {
        if rel.draft {
            continue;
        }
        let Some(ver) = parse_semver_full(&rel.tag_name) else {
            continue;
        };
        let is_pre = rel.prerelease || ver.is_prerelease();
        if is_pre && !allow_prereleases {
            // Stable installs never select prereleases unless explicitly opted in
            if !parse_semver_full(current_version)
                .map(|c| c.is_prerelease())
                .unwrap_or(false)
            {
                continue;
            }
        }
        if !is_channel_compatible(&rel.tag_name, current_version, allow_prereleases) {
            continue;
        }

        let Some(asset) = rel.assets.iter().find(|a| {
            a.name == "latest.json" && is_trusted_github_manifest_url(&a.browser_download_url)
        }) else {
            continue;
        };

        let replace = match &best {
            None => true,
            Some((best_ver, _)) => is_newer(&rel.tag_name, best_ver),
        };
        if replace {
            best = Some((rel.tag_name.clone(), asset.browser_download_url.clone()));
        }
    }

    Ok(best)
}

/// Parsed Semantic Version according to SemVer 2.0.0.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SemVer {
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
    pub prerelease: Option<String>,
    pub build: Option<String>,
}

impl SemVer {
    pub fn is_prerelease(&self) -> bool {
        self.prerelease.is_some()
    }
}

/// Parses a version string like "v1.2.3", "0.5.0-rc.1", or "1.0.0+build.1" into SemVer.
pub fn parse_semver_full(version_str: &str) -> Option<SemVer> {
    let clean = version_str.trim().trim_start_matches(['v', 'V']);
    let mut build_parts = clean.splitn(2, '+');
    let without_build = build_parts.next()?;
    let build = build_parts.next().map(|s| s.to_string());

    let mut parts = without_build.splitn(2, '-');
    let numeric_part = parts.next()?;
    let prerelease = parts.next().map(|s| s.to_string());

    let nums: Vec<&str> = numeric_part.split('.').collect();
    if nums.len() < 2 {
        return None;
    }
    let major: u32 = nums[0].parse().ok()?;
    let minor: u32 = nums[1].parse().ok()?;
    let patch: u32 = if nums.len() >= 3 {
        nums[2].parse().ok()?
    } else {
        0
    };
    Some(SemVer {
        major,
        minor,
        patch,
        prerelease,
        build,
    })
}

/// Parses a version string into numeric (major, minor, patch) for backward compatibility.
#[allow(dead_code)]
pub fn parse_semver(version_str: &str) -> Option<(u32, u32, u32)> {
    parse_semver_full(version_str).map(|s| (s.major, s.minor, s.patch))
}

fn compare_prerelease_identifiers(r_pre: &str, c_pre: &str) -> std::cmp::Ordering {
    let r_parts: Vec<&str> = r_pre.split('.').collect();
    let c_parts: Vec<&str> = c_pre.split('.').collect();
    let min_len = r_parts.len().min(c_parts.len());
    for i in 0..min_len {
        let r = r_parts[i];
        let c = c_parts[i];
        if r != c {
            match (r.parse::<u32>(), c.parse::<u32>()) {
                (Ok(rn), Ok(cn)) => return rn.cmp(&cn),
                (Ok(_), Err(_)) => return std::cmp::Ordering::Less,
                (Err(_), Ok(_)) => return std::cmp::Ordering::Greater,
                (Err(_), Err(_)) => return r.cmp(c),
            }
        }
    }
    r_parts.len().cmp(&c_parts.len())
}

/// Returns true if `remote` is strictly newer than `current` according to SemVer 2.0.0.
pub fn is_newer(remote: &str, current: &str) -> bool {
    let (r, c) = match (parse_semver_full(remote), parse_semver_full(current)) {
        (Some(r), Some(c)) => (r, c),
        _ => return false,
    };

    if (r.major, r.minor, r.patch) != (c.major, c.minor, c.patch) {
        return (r.major, r.minor, r.patch) > (c.major, c.minor, c.patch);
    }

    match (r.prerelease, c.prerelease) {
        (None, Some(_)) => true, // Normal version has higher precedence than prerelease
        (Some(_), None) => false,
        (None, None) => false,
        (Some(r_pre), Some(c_pre)) => {
            compare_prerelease_identifiers(&r_pre, &c_pre) == std::cmp::Ordering::Greater
        }
    }
}

/// Enforces channel separation: stable installations never receive prerelease updates.
pub fn is_channel_compatible(remote: &str, current: &str, allow_prereleases: bool) -> bool {
    let (r, c) = match (parse_semver_full(remote), parse_semver_full(current)) {
        (Some(r), Some(c)) => (r, c),
        _ => return false,
    };

    if !c.is_prerelease() && r.is_prerelease() && !allow_prereleases {
        return false;
    }

    true
}

/// Identifies the build channel from version and profile.
#[allow(dead_code)]
pub fn version_channel(version_str: &str, profile: &str) -> &'static str {
    if profile == "debug" {
        return "development";
    }
    let lower = version_str.to_lowercase();
    if lower.contains("-dev") {
        "development"
    } else if lower.contains("-alpha") {
        "alpha"
    } else if lower.contains("-beta") {
        "beta"
    } else if lower.contains("-rc") {
        "release-candidate"
    } else {
        "stable"
    }
}

/// Returns the standard platform key matching Tauri updater asset matrices.
pub fn current_platform_key() -> &'static str {
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        "linux-x86_64"
    }
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    {
        "linux-aarch64"
    }
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        "windows-x86_64"
    }
    #[cfg(all(target_os = "windows", target_arch = "aarch64"))]
    {
        "windows-aarch64"
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        "darwin-x86_64"
    }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        "darwin-aarch64"
    }
    #[cfg(not(any(
        all(
            target_os = "linux",
            any(target_arch = "x86_64", target_arch = "aarch64")
        ),
        all(
            target_os = "windows",
            any(target_arch = "x86_64", target_arch = "aarch64")
        ),
        all(
            target_os = "macos",
            any(target_arch = "x86_64", target_arch = "aarch64")
        ),
    )))]
    {
        "unknown"
    }
}

/// Evaluates a parsed manifest against the local application version and platform.
#[allow(dead_code)]
pub fn evaluate_manifest(manifest: &UpdateManifest, current_version: &str) -> UpdateCheckResult {
    evaluate_manifest_with_options(manifest, current_version, false)
}

/// Evaluates a parsed manifest with explicit channel opt-in (stable vs prerelease).
pub fn evaluate_manifest_with_options(
    manifest: &UpdateManifest,
    current_version: &str,
    allow_prereleases: bool,
) -> UpdateCheckResult {
    let platform = current_platform_key();
    let asset = manifest.platforms.get(platform);
    let channel_compatible =
        is_channel_compatible(&manifest.version, current_version, allow_prereleases);
    let newer = channel_compatible && is_newer(&manifest.version, current_version);

    if newer {
        if let Some(target_asset) = asset {
            UpdateCheckResult {
                status: "available".into(),
                current_version: current_version.to_owned(),
                latest_version: Some(manifest.version.clone()),
                release_date: manifest.pub_date.clone(),
                release_notes: manifest.notes.clone(),
                download_url: Some(target_asset.url.clone()),
                has_signature: target_asset.signature.is_some(),
                platform_key: platform.into(),
                platform_supported: true,
                error: None,
                manifest_url: None,
            }
        } else {
            UpdateCheckResult {
                status: "unsupportedPlatform".into(),
                current_version: current_version.to_owned(),
                latest_version: Some(manifest.version.clone()),
                release_date: manifest.pub_date.clone(),
                release_notes: manifest.notes.clone(),
                download_url: None,
                has_signature: false,
                platform_key: platform.into(),
                platform_supported: false,
                error: Some(format!(
                    "Release {} exists but has no package for platform {platform}.",
                    manifest.version
                )),
                manifest_url: None,
            }
        }
    } else {
        UpdateCheckResult {
            status: "upToDate".into(),
            current_version: current_version.to_owned(),
            latest_version: Some(manifest.version.clone()),
            release_date: manifest.pub_date.clone(),
            release_notes: manifest.notes.clone(),
            download_url: asset.map(|a| a.url.clone()),
            has_signature: asset.map(|a| a.signature.is_some()).unwrap_or(false),
            platform_key: platform.into(),
            platform_supported: asset.is_some(),
            error: None,
            manifest_url: None,
        }
    }
}

/// Checks the release manifest for updates through Kinora's guarded HTTP client.
/// When `allow_prereleases` is enabled (or the running app is itself a prerelease) and no
/// explicit endpoint override is supplied, discovers the highest compatible GitHub release
/// (including prereleases) via the GitHub Releases API before fetching its `latest.json`.
pub async fn check_for_updates(
    endpoint_override: Option<String>,
    current_version: &str,
    allow_prereleases: bool,
) -> Result<UpdateCheckResult, IngestError> {
    let current_is_prerelease = parse_semver_full(current_version)
        .map(|v| v.is_prerelease())
        .unwrap_or(false);

    let resolved_endpoint = if let Some(custom) = endpoint_override {
        custom
    } else if allow_prereleases || current_is_prerelease {
        match fetch::fetch_updater_manifest(GITHUB_RELEASES_API).await {
            Ok(releases_json) => match select_best_manifest_url_from_github_releases(
                &releases_json,
                current_version,
                true,
            ) {
                Ok(Some((_, manifest_url))) => manifest_url,
                _ => DEFAULT_UPDATE_ENDPOINT.to_string(),
            },
            Err(_) => DEFAULT_UPDATE_ENDPOINT.to_string(),
        }
    } else {
        DEFAULT_UPDATE_ENDPOINT.to_string()
    };

    let json_text = fetch::fetch_updater_manifest(&resolved_endpoint).await?;
    let manifest: UpdateManifest = serde_json::from_str(&json_text).map_err(|e| {
        IngestError::new(
            ErrorCode::Network,
            format!("Update manifest structure is invalid: {e}"),
        )
    })?;

    let mut result = evaluate_manifest_with_options(&manifest, current_version, allow_prereleases);
    result.manifest_url = Some(resolved_endpoint);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_compares_semver_accurately() {
        assert_eq!(parse_semver("0.1.0"), Some((0, 1, 0)));
        assert_eq!(parse_semver("v1.20.5"), Some((1, 20, 5)));
        assert_eq!(parse_semver("2.0.0-rc1"), Some((2, 0, 0)));
        assert_eq!(parse_semver("invalid"), None);

        assert!(is_newer("0.2.0", "0.1.0"));
        assert!(is_newer("1.0.0", "0.9.9"));
        assert!(is_newer("0.1.1", "0.1.0"));
        assert!(!is_newer("0.1.0", "0.1.0"));
        assert!(!is_newer("0.1.0", "0.2.0"));
    }

    #[test]
    fn parses_semver_full_with_prerelease_and_build_metadata() {
        let v1 = parse_semver_full("1.2.3-rc.1+20261116").unwrap();
        assert_eq!((v1.major, v1.minor, v1.patch), (1, 2, 3));
        assert_eq!(v1.prerelease.as_deref(), Some("rc.1"));
        assert_eq!(v1.build.as_deref(), Some("20261116"));
        assert!(v1.is_prerelease());

        let v2 = parse_semver_full("v0.5.0").unwrap();
        assert_eq!((v2.major, v2.minor, v2.patch), (0, 5, 0));
        assert!(!v2.is_prerelease());
    }

    #[test]
    fn evaluates_semver_precedence_rules() {
        // Normal version has higher precedence than a prerelease of the same version
        assert!(is_newer("1.0.0", "1.0.0-rc.1"));
        assert!(!is_newer("1.0.0-rc.1", "1.0.0"));

        // Numeric identifier comparison: 11 is greater than 2
        assert!(is_newer("1.0.0-beta.11", "1.0.0-beta.2"));
        assert!(!is_newer("1.0.0-beta.2", "1.0.0-beta.11"));

        // Alphabetical comparison: rc > beta
        assert!(is_newer("1.0.0-rc.1", "1.0.0-beta.1"));
        assert!(!is_newer("1.0.0-beta.1", "1.0.0-rc.1"));

        // Sequential release candidate progression
        assert!(is_newer("1.0.0-rc.2", "1.0.0-rc.1"));
    }

    #[test]
    fn enforces_channel_compatibility_rules() {
        // Stable rejects prerelease updates when allow_prereleases is false
        assert!(!is_channel_compatible("1.0.1-rc.1", "1.0.0", false));
        assert!(is_channel_compatible("1.0.1-rc.1", "1.0.0", true));

        // Stable accepts stable updates
        assert!(is_channel_compatible("1.0.1", "1.0.0", false));

        // Prerelease installations accept both newer prereleases and stable releases
        assert!(is_channel_compatible("1.0.0-rc.2", "1.0.0-rc.1", false));
        assert!(is_channel_compatible("1.0.0", "1.0.0-rc.1", false));
    }

    #[test]
    fn classifies_version_channels_accurately() {
        assert_eq!(version_channel("0.5.0", "debug"), "development");
        assert_eq!(version_channel("0.5.0-dev", "release"), "development");
        assert_eq!(version_channel("0.5.0-alpha.1", "release"), "alpha");
        assert_eq!(version_channel("0.5.0-beta.2", "release"), "beta");
        assert_eq!(
            version_channel("0.5.0-rc.1", "release"),
            "release-candidate"
        );
        assert_eq!(version_channel("0.5.0", "release"), "stable");
    }

    #[test]
    fn stable_install_ignores_newer_prerelease_manifest() {
        let mut platforms = HashMap::new();
        platforms.insert(
            current_platform_key().to_string(),
            PlatformAsset {
                signature: Some("sig123".into()),
                url: "https://example.com/kinora-rc.tar.gz".into(),
            },
        );

        let manifest = UpdateManifest {
            version: "0.6.0-rc.1".into(),
            notes: Some("Prerelease candidate".into()),
            pub_date: Some("2026-11-16T00:00:00Z".into()),
            platforms,
        };

        // Stable installation (0.5.0) should remain upToDate when only a prerelease is available
        let res = evaluate_manifest(&manifest, "0.5.0");
        assert_eq!(res.status, "upToDate");
        assert_eq!(res.current_version, "0.5.0");
    }

    #[test]
    fn evaluates_update_available_with_platform_match() {
        let mut platforms = HashMap::new();
        platforms.insert(
            current_platform_key().to_string(),
            PlatformAsset {
                signature: Some("sig123".into()),
                url: "https://example.com/kinora-update.tar.gz".into(),
            },
        );

        let manifest = UpdateManifest {
            version: "0.2.0".into(),
            notes: Some("Added Windows and macOS release candidates".into()),
            pub_date: Some("2026-11-15T19:00:00Z".into()),
            platforms,
        };

        let res = evaluate_manifest(&manifest, "0.1.0");
        assert_eq!(res.status, "available");
        assert_eq!(res.current_version, "0.1.0");
        assert_eq!(res.latest_version.as_deref(), Some("0.2.0"));
        assert!(res.has_signature);
        assert!(res.platform_supported);
        assert_eq!(
            res.download_url.as_deref(),
            Some("https://example.com/kinora-update.tar.gz")
        );
    }

    #[test]
    fn evaluates_up_to_date_when_equal_or_older() {
        let mut platforms = HashMap::new();
        platforms.insert(
            current_platform_key().to_string(),
            PlatformAsset {
                signature: Some("sig123".into()),
                url: "https://example.com/kinora-update.tar.gz".into(),
            },
        );

        let manifest = UpdateManifest {
            version: "0.1.0".into(),
            notes: Some("Current version".into()),
            pub_date: Some("2026-11-15T19:00:00Z".into()),
            platforms,
        };

        let res = evaluate_manifest(&manifest, "0.1.0");
        assert_eq!(res.status, "upToDate");
        assert_eq!(res.current_version, "0.1.0");
        assert_eq!(res.latest_version.as_deref(), Some("0.1.0"));
    }

    #[test]
    fn detects_unsupported_platform_when_missing_from_manifest() {
        let mut platforms = HashMap::new();
        platforms.insert(
            "unrelated-os-arch".into(),
            PlatformAsset {
                signature: None,
                url: "https://example.com/bin".into(),
            },
        );

        let manifest = UpdateManifest {
            version: "0.9.0".into(),
            notes: Some("New version".into()),
            pub_date: Some("2026-11-15T19:00:00Z".into()),
            platforms,
        };

        let res = evaluate_manifest(&manifest, "0.1.0");
        assert_eq!(res.status, "unsupportedPlatform");
        assert!(!res.platform_supported);
        assert!(res.error.is_some());
    }

    #[test]
    fn v059_validation_release_detects_v060_with_signature() {
        let mut platforms = HashMap::new();
        platforms.insert(
            current_platform_key().to_string(),
            PlatformAsset {
                signature: Some("dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk=".into()),
                url: "https://github.com/millsydotdev/KinoraTV/releases/download/v0.6.0/kinora-0.6.0.AppImage.tar.gz".into(),
            },
        );

        let manifest = UpdateManifest {
            version: "0.6.0".into(),
            notes: Some("Kinora v0.6.0 Official Release".into()),
            pub_date: Some("2026-11-19T19:00:00Z".into()),
            platforms,
        };

        let res = evaluate_manifest(&manifest, "0.5.9");
        assert_eq!(res.status, "available");
        assert_eq!(res.current_version, "0.5.9");
        assert_eq!(res.latest_version.as_deref(), Some("0.6.0"));
        assert!(res.has_signature);
        assert!(res.platform_supported);
        assert_eq!(
            res.download_url.as_deref(),
            Some("https://github.com/millsydotdev/KinoraTV/releases/download/v0.6.0/kinora-0.6.0.AppImage.tar.gz")
        );
    }

    #[test]
    fn github_releases_selector_distinguishes_stable_and_prerelease_channels() {
        let releases_json = r#"[
          {
            "tag_name": "v0.7.0-draft.1",
            "draft": true,
            "prerelease": true,
            "assets": [{ "name": "latest.json", "browser_download_url": "https://github.com/millsydotdev/KinoraTV/releases/download/v0.7.0-draft.1/latest.json" }]
          },
          {
            "tag_name": "v0.7.0-rc.1",
            "draft": false,
            "prerelease": true,
            "assets": [{ "name": "latest.json", "browser_download_url": "https://github.com/millsydotdev/KinoraTV/releases/download/v0.7.0-rc.1/latest.json" }]
          },
          {
            "tag_name": "v0.6.1",
            "draft": false,
            "prerelease": false,
            "assets": [{ "name": "latest.json", "browser_download_url": "https://github.com/millsydotdev/KinoraTV/releases/download/v0.6.1/latest.json" }]
          },
          {
            "tag_name": "v9.9.9-evil.1",
            "draft": false,
            "prerelease": true,
            "assets": [{ "name": "latest.json", "browser_download_url": "https://evil.example/latest.json" }]
          }
        ]"#;

        // Stable channel ignores prereleases, drafts, and untrusted URLs
        let stable = select_best_manifest_url_from_github_releases(releases_json, "0.6.0", false)
            .unwrap()
            .unwrap();
        assert_eq!(stable.0, "v0.6.1");
        assert!(stable.1.ends_with("/v0.6.1/latest.json"));

        // Opt-in prerelease channel discovers v0.7.0-rc.1 while rejecting drafts and evil URLs
        let pre = select_best_manifest_url_from_github_releases(releases_json, "0.6.0", true)
            .unwrap()
            .unwrap();
        assert_eq!(pre.0, "v0.7.0-rc.1");
        assert!(pre.1.ends_with("/v0.7.0-rc.1/latest.json"));
    }
}
