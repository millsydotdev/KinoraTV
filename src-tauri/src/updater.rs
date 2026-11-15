//! Automatic updater support and release metadata validation.
//!
//! Follows the Tauri 2 updater manifest specification while enforcing Kinora's
//! network security guarantees (guarded client, HTTPS-only, no loopback or private SSRF).

use crate::fetch;
use crate::ingest::{ErrorCode, IngestError};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Default official update manifest endpoint for Kinora releases on GitHub.
pub const DEFAULT_UPDATE_ENDPOINT: &str =
    "https://github.com/millsydotdev/KinoraTV/releases/latest/download/latest.json";

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
}

/// Parses a version string like "v1.2.3" or "0.1.0" into numeric (major, minor, patch).
pub fn parse_semver(version_str: &str) -> Option<(u32, u32, u32)> {
    let clean = version_str.trim().trim_start_matches(['v', 'V']);
    // Drop any build or prerelease suffix for basic triple comparison
    let numeric_part = clean.split(['-', '+']).next()?;
    let parts: Vec<&str> = numeric_part.split('.').collect();
    if parts.len() < 2 {
        return None;
    }
    let major: u32 = parts[0].parse().ok()?;
    let minor: u32 = parts[1].parse().ok()?;
    let patch: u32 = if parts.len() >= 3 {
        parts[2].parse().ok()?
    } else {
        0
    };
    Some((major, minor, patch))
}

/// Returns true if `remote` is strictly newer than `current`.
pub fn is_newer(remote: &str, current: &str) -> bool {
    match (parse_semver(remote), parse_semver(current)) {
        (Some((r_maj, r_min, r_pat)), Some((c_maj, c_min, c_pat))) => {
            (r_maj, r_min, r_pat) > (c_maj, c_min, c_pat)
        }
        _ => false,
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
pub fn evaluate_manifest(manifest: &UpdateManifest, current_version: &str) -> UpdateCheckResult {
    let platform = current_platform_key();
    let asset = manifest.platforms.get(platform);
    let newer = is_newer(&manifest.version, current_version);

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
        }
    }
}

/// Checks the release manifest for updates through Kinora's guarded HTTP client.
pub async fn check_for_updates(
    endpoint_override: Option<String>,
    current_version: &str,
) -> Result<UpdateCheckResult, IngestError> {
    let endpoint = endpoint_override
        .as_deref()
        .unwrap_or(DEFAULT_UPDATE_ENDPOINT);

    let json_text = fetch::fetch_updater_manifest(endpoint).await?;
    let manifest: UpdateManifest = serde_json::from_str(&json_text).map_err(|e| {
        IngestError::new(
            ErrorCode::Network,
            format!("Update manifest structure is invalid: {e}"),
        )
    })?;

    Ok(evaluate_manifest(&manifest, current_version))
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
}
