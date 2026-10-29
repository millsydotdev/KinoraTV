//! Public source catalogue (Gate D7): the index of playlists published by iptv-org
//! (https://github.com/iptv-org/iptv, released under the Unlicense). The index is the project's
//! generated `PLAYLISTS.md`, the only list of the per-country, per-language, per-category and other
//! playlists that actually exist (the iptv-org API lists codes that have none).
//!
//! It is fetched from one fixed https address through the guarded client (`Policy::catalogue()`:
//! that host only, https only, every destination check unchanged) and treated as untrusted text.
//! Only lines whose `<code>` address matches `https://iptv-org.github.io/iptv/<kind>/<code>.m3u`
//! exactly become entries; nothing else in the file is followed or fetched. Importing an entry is an
//! ordinary playlist import through `fetch_playlist`. The parsed catalogue is cached beside the saved
//! sources (`catalogue.json`, 0600, atomic) so Discovery works offline; it is derived data, and a
//! cache that cannot be used is ignored and replaced by the next successful refresh.

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::fetch::{self, Policy};
use crate::ingest::{ErrorCode, IngestError};
use crate::sources;

pub const HOST: &str = "raw.githubusercontent.com";
pub const URL: &str = "https://raw.githubusercontent.com/iptv-org/iptv/master/PLAYLISTS.md";
const PLAYLIST_PREFIX: &str = "https://iptv-org.github.io/iptv/";
const MAX_ENTRIES: usize = 5000;
const MAX_LINES: usize = 200_000;
const MAX_NAME_CHARS: usize = 100;
const MAX_CODE_LEN: usize = 32;
const CACHE_NAME: &str = "catalogue.json";
const CACHE_VERSION: u32 = 1;
const MAX_CACHE_BYTES: u64 = 4 * 1024 * 1024;

/// How the playlist groups its channels; the folder in the playlist's address.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Category,
    Language,
    Country,
    Region,
    Subdivision,
    City,
}

impl Kind {
    fn from_folder(folder: &str) -> Option<Self> {
        Some(match folder {
            "categories" => Self::Category,
            "languages" => Self::Language,
            "countries" => Self::Country,
            "regions" => Self::Region,
            "subdivisions" => Self::Subdivision,
            "cities" => Self::City,
            _ => return None,
        })
    }
}

/// One catalogue playlist. Mirrored by `CatalogueEntry` in `src/lib/native.ts`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Entry {
    /// `<folder>/<code>`, from the address: the entry's stable identity.
    pub id: String,
    pub kind: Kind,
    pub code: String,
    pub name: String,
    /// The flag emoji iptv-org shows for countries, if any.
    pub flag: Option<String>,
    /// The entry this one is listed under (a subdivision's country, a city's subdivision).
    pub parent: Option<String>,
    /// The channel count iptv-org prints for categories and languages; `None` where it gives none.
    pub channels: Option<u32>,
    pub url: String,
}

/// Mirrored by `Catalogue` in `src/lib/native.ts`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Catalogue {
    /// When Kinora fetched it (UTC ms). The provider does not publish an update time for the index.
    pub fetched_at: i64,
    pub entries: Vec<Entry>,
    /// Lines with a playlist-like address that did not pass the checks.
    pub skipped: u32,
}

fn not_catalogue() -> IngestError {
    IngestError::new(
        ErrorCode::NotCatalogue,
        "The catalogue could not be read. Its format may have changed; your sources are not affected.",
    )
}

/// `(kind, code)` when `url` is exactly an iptv-org playlist address Kinora accepts.
pub fn playlist_address(url: &str) -> Option<(Kind, &str)> {
    let rest = url.strip_prefix(PLAYLIST_PREFIX)?;
    let (folder, file) = rest.split_once('/')?;
    let code = file.strip_suffix(".m3u")?;
    let code_ok = !code.is_empty()
        && code.len() <= MAX_CODE_LEN
        && code
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-');
    Some((Kind::from_folder(folder)?, code)).filter(|_| code_ok)
}

fn decode_entities(s: &str) -> String {
    s.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&amp;", "&")
}

fn strip_tags(s: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for ch in s.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out
}

fn clean_name(raw: &str) -> Option<String> {
    let name = decode_entities(&strip_tags(raw));
    let name = name.split_whitespace().collect::<Vec<_>>().join(" ");
    let ok = !name.is_empty()
        && name.chars().count() <= MAX_NAME_CHARS
        && !name.chars().any(char::is_control);
    ok.then_some(name)
}

/// The text of each `<td …>…</td>` cell in a table row.
fn cells(line: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let mut rest = line;
    while let Some(open) = rest.find("<td") {
        let after = &rest[open..];
        let Some(gt) = after.find('>') else { break };
        let body = &after[gt + 1..];
        let Some(close) = body.find("</td>") else {
            break;
        };
        out.push(&body[..close]);
        rest = &body[close + 5..];
    }
    out
}

fn is_flag(token: &str) -> bool {
    let regional = |c: char| ('\u{1F1E6}'..='\u{1F1FF}').contains(&c);
    token == "\u{1F310}" || (token.chars().count() == 2 && token.chars().all(regional))
}

/// Parses the generated index. Untrusted: every entry is checked, and the result is bounded.
pub fn parse(text: &str, now: i64) -> Result<Catalogue, IngestError> {
    let mut entries: Vec<Entry> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut skipped = 0u32;
    // Nesting of the broadcast-area list: (indent, entry id).
    let mut parents: Vec<(usize, String)> = Vec::new();
    for line in text.lines().take(MAX_LINES) {
        let Some(start) = line.find("<code>") else {
            continue;
        };
        let after = &line[start + 6..];
        let Some(end) = after.find("</code>") else {
            continue;
        };
        let address = after[..end].trim();
        // Code blocks also hold `<FILENAME>` templates and other text; only playlist-like addresses count.
        if !address.contains(".m3u") {
            continue;
        }
        let Some((kind, code)) = playlist_address(address) else {
            skipped += 1;
            continue;
        };
        let id = format!(
            "{}/{code}",
            address[PLAYLIST_PREFIX.len()..]
                .split('/')
                .next()
                .unwrap_or_default()
        );
        let trimmed = line.trim_start();
        let (name, flag, channels, parent) = if trimmed.starts_with("<tr>") {
            // Cells are told apart by what they hold, so reordered or added columns read the same:
            // the address cell holds `<code>`, the count is all digits, the name is the first other text.
            let texts: Vec<String> = cells(line)
                .into_iter()
                .filter(|c| !c.contains("<code>"))
                .map(|c| strip_tags(c).trim().to_owned())
                .filter(|t| !t.is_empty())
                .collect();
            let digits = |t: &str| t.bytes().all(|b| b.is_ascii_digit());
            let count = texts
                .iter()
                .find(|t| digits(t))
                .and_then(|t| t.parse::<u32>().ok());
            let name = texts
                .iter()
                .find(|t| !digits(t))
                .and_then(|t| clean_name(t));
            (name, None, count, None)
        } else if let Some(item) = trimmed.strip_prefix("- ") {
            let indent = line.len() - trimmed.len();
            while parents.last().is_some_and(|(i, _)| *i >= indent) {
                parents.pop();
            }
            let label = &item[..item.find("<code>").unwrap_or(item.len())];
            let (flag, name) = match label.trim().split_once(' ') {
                Some((first, rest)) if is_flag(first) => (Some(first.to_owned()), rest),
                _ => (None, label),
            };
            let parent = parents.last().map(|(_, p)| p.clone());
            parents.push((indent, id.clone()));
            (clean_name(name), flag, None, parent)
        } else {
            (None, None, None, None)
        };
        let Some(name) = name else {
            skipped += 1;
            continue;
        };
        // An empty playlist (iptv-org lists its withdrawn NSFW category with 0 channels) has nothing to add.
        if channels == Some(0) {
            continue;
        }
        if !seen.insert(id.clone()) {
            skipped += 1;
            continue;
        }
        if entries.len() >= MAX_ENTRIES {
            return Err(IngestError::new(
                ErrorCode::TooManyEntries,
                format!("The catalogue lists more than {MAX_ENTRIES} playlists."),
            ));
        }
        entries.push(Entry {
            id,
            kind,
            code: code.to_owned(),
            name,
            flag,
            parent,
            channels,
            url: address.to_owned(),
        });
    }
    if entries.is_empty() {
        return Err(not_catalogue());
    }
    // A parent that was itself skipped is dropped rather than left dangling.
    let ids: std::collections::HashSet<String> = entries.iter().map(|e| e.id.clone()).collect();
    for e in &mut entries {
        if e.parent.as_ref().is_some_and(|p| !ids.contains(p)) {
            e.parent = None;
        }
    }
    Ok(Catalogue {
        fetched_at: now,
        entries,
        skipped,
    })
}

/// Checks an entry read back from the cache as strictly as one just parsed.
fn entry_ok(e: &Entry) -> bool {
    playlist_address(&e.url).is_some_and(|(kind, code)| {
        kind == e.kind && code == e.code && e.id.ends_with(&format!("/{code}"))
    }) && clean_name(&e.name).as_deref() == Some(e.name.as_str())
        && e.flag.as_deref().is_none_or(is_flag)
        && e.parent.as_ref().is_none_or(|p| p.len() <= 64)
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CacheFile {
    version: u32,
    catalogue: Catalogue,
}

pub struct CatalogueStore {
    /// The saved-sources folder; `None` keeps the catalogue in memory only.
    dir: Option<PathBuf>,
    /// One refresh at a time: a second request waits, then fetches again, so results land in order.
    refreshing: tokio::sync::Mutex<()>,
}

impl CatalogueStore {
    pub fn new(dir: Option<PathBuf>) -> Self {
        Self {
            dir,
            refreshing: tokio::sync::Mutex::new(()),
        }
    }

    /// The cached catalogue, if there is a usable one.
    pub fn load(&self) -> Option<Catalogue> {
        let path = self.dir.as_ref()?.join(CACHE_NAME);
        if fs::metadata(&path).ok()?.len() > MAX_CACHE_BYTES {
            return None;
        }
        let file: CacheFile = serde_json::from_slice(&fs::read(&path).ok()?).ok()?;
        let c = file.catalogue;
        let ok = file.version == CACHE_VERSION
            && !c.entries.is_empty()
            && c.entries.len() <= MAX_ENTRIES
            && c.entries.iter().all(entry_ok);
        ok.then_some(c)
    }

    /// Fetches and parses the catalogue, then caches it (best effort). A failure leaves the cache as it was.
    pub async fn refresh(&self, policy: &Policy, now: i64) -> Result<Catalogue, IngestError> {
        self.refresh_from(URL, policy, now).await
    }

    async fn refresh_from(
        &self,
        url: &str,
        policy: &Policy,
        now: i64,
    ) -> Result<Catalogue, IngestError> {
        let _one_at_a_time = self.refreshing.lock().await;
        let (bytes, _host) =
            fetch::download_bytes(url, policy, "text/markdown, text/plain;q=0.9").await?;
        let text = String::from_utf8(bytes).map_err(|_| not_catalogue())?;
        let catalogue = parse(&text, now)?;
        if let Some(dir) = &self.dir {
            let file = CacheFile {
                version: CACHE_VERSION,
                catalogue: catalogue.clone(),
            };
            if let Ok(json) = serde_json::to_vec(&file) {
                let _ = sources::write_atomically(dir, CACHE_NAME, &json);
            }
        }
        Ok(catalogue)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fetch::test_support::{http, run, server};

    const NOW: i64 = 1_800_000_000_000;

    /// A cut-down copy of the real index's shapes: tables, nested lists, flags and code blocks.
    const INDEX: &str = r#"## Playlists

```
https://iptv-org.github.io/iptv/index.category.m3u
```

    <tr><td>Animation</td><td align="right">177</td><td nowrap><code>https://iptv-org.github.io/iptv/categories/animation.m3u</code></td></tr>
    <tr><td>News &amp; Weather</td><td align="right">1049</td><td nowrap><code>https://iptv-org.github.io/iptv/categories/news.m3u</code></td></tr>
    <tr><td align="left">English</td><td align="right">3016</td><td align="left" nowrap><code>https://iptv-org.github.io/iptv/languages/eng.m3u</code></td></tr>
    <tr><td>Evil</td><td>1</td><td><code>https://evil.example/iptv/languages/x.m3u</code></td></tr>
    <tr><td>Query</td><td>1</td><td><code>https://iptv-org.github.io/iptv/languages/abc.m3u?token=SECRET</code></td></tr>
    <tr><td>Climb</td><td>1</td><td><code>https://iptv-org.github.io/iptv/../../x.m3u</code></td></tr>
    <tr><td>Upper</td><td>1</td><td><code>https://iptv-org.github.io/iptv/languages/ENG.m3u</code></td></tr>
    <tr><td>Plain http</td><td>1</td><td><code>http://iptv-org.github.io/iptv/languages/fra.m3u</code></td></tr>
    <tr><td>Unknown kind</td><td>1</td><td><code>https://iptv-org.github.io/iptv/raw/abc.m3u</code></td></tr>
    <tr><td></td><td>1</td><td><code>https://iptv-org.github.io/iptv/languages/nameless.m3u</code></td></tr>
    <tr><td>English again</td><td>1</td><td><code>https://iptv-org.github.io/iptv/languages/eng.m3u</code></td></tr>
    <tr><td>XXX</td><td align="right">0</td><td nowrap><code>https://iptv-org.github.io/iptv/categories/xxx.m3u</code></td></tr>

- 🇦🇱 Albania <code>https://iptv-org.github.io/iptv/countries/al.m3u</code>
  - Fier <code>https://iptv-org.github.io/iptv/subdivisions/al-04.m3u</code>
    - Fier <code>https://iptv-org.github.io/iptv/cities/alfie.m3u</code>
- 🇬🇧 United Kingdom <code>https://iptv-org.github.io/iptv/countries/uk.m3u</code>
- 🌐 International <code>https://iptv-org.github.io/iptv/countries/int.m3u</code>
- Africa <code>https://iptv-org.github.io/iptv/regions/afr.m3u</code>
- <script>alert(1)</script>Tagged <code>https://iptv-org.github.io/iptv/regions/tag.m3u</code>
"#;

    #[test]
    fn reads_tables_and_nested_lists_and_keeps_only_exact_addresses() {
        let c = parse(INDEX, NOW).unwrap();
        let ids: Vec<_> = c.entries.iter().map(|e| e.id.as_str()).collect();
        assert_eq!(
            ids,
            [
                "categories/animation",
                "categories/news",
                "languages/eng",
                "countries/al",
                "subdivisions/al-04",
                "cities/alfie",
                "countries/uk",
                "countries/int",
                "regions/afr",
                "regions/tag",
            ]
        );
        let get = |id: &str| c.entries.iter().find(|e| e.id == id).unwrap();
        assert_eq!(get("categories/news").name, "News & Weather");
        assert_eq!(get("categories/news").channels, Some(1049));
        assert_eq!(get("languages/eng").kind, Kind::Language);
        assert_eq!(get("countries/uk").flag.as_deref(), Some("🇬🇧"));
        assert_eq!(get("countries/uk").name, "United Kingdom");
        assert_eq!(
            get("countries/uk").channels,
            None,
            "no count is invented where the provider gives none"
        );
        assert_eq!(get("countries/int").flag.as_deref(), Some("🌐"));
        assert_eq!(
            get("subdivisions/al-04").parent.as_deref(),
            Some("countries/al")
        );
        assert_eq!(
            get("cities/alfie").parent.as_deref(),
            Some("subdivisions/al-04")
        );
        assert_eq!(get("countries/uk").parent, None);
        assert_eq!(
            get("regions/tag").name,
            "alert(1)Tagged",
            "markup is stripped, never kept"
        );
        assert_eq!(
            get("countries/uk").url,
            "https://iptv-org.github.io/iptv/countries/uk.m3u"
        );
        // Other host, query, climbing path, upper case, http, unknown folder, no name, repeat.
        assert_eq!(c.skipped, 8);
        assert_eq!(c.fetched_at, NOW);
        let json = serde_json::to_string(&c).unwrap();
        for bad in ["evil.example", "SECRET", "..", "http://"] {
            assert!(!json.contains(bad), "{bad}");
        }
    }

    #[test]
    fn an_upstream_format_change_is_read_safely() {
        // Columns reordered, a count missing, an extra column, CRLF endings, tab-indented nesting,
        // headings renamed and unrelated tables: each field is found by what it holds, not by position.
        let changed = concat!(
            "## Something new\r\n",
            "<tr><td align=\"right\">177</td><td>Animation</td><td><code>https://iptv-org.github.io/iptv/categories/animation.m3u</code></td></tr>\r\n",
            "<tr><td><code>https://iptv-org.github.io/iptv/categories/news.m3u</code></td><td>News</td></tr>\r\n",
            "<tr><td>Kids</td><td>12</td><td>extra</td><td><code>https://iptv-org.github.io/iptv/categories/kids.m3u</code></td></tr>\r\n",
            "<tr><td></td><td>5</td><td><code>https://iptv-org.github.io/iptv/categories/nameless.m3u</code></td></tr>\r\n",
            "<tr><td>Owner</td><td>Licence</td></tr>\r\n",
            "- \u{1F1E6}\u{1F1F1} Albania <code>https://iptv-org.github.io/iptv/countries/al.m3u</code> (new note)\r\n",
            "\t- Fier <code>https://iptv-org.github.io/iptv/subdivisions/al-04.m3u</code>\r\n",
        );
        let c = parse(changed, NOW).unwrap();
        let got: Vec<_> = c
            .entries
            .iter()
            .map(|e| (e.id.as_str(), e.name.as_str(), e.channels))
            .collect();
        assert_eq!(
            got,
            [
                ("categories/animation", "Animation", Some(177)),
                ("categories/news", "News", None),
                ("categories/kids", "Kids", Some(12)),
                ("countries/al", "Albania", None),
                ("subdivisions/al-04", "Fier", None),
            ]
        );
        assert_eq!(c.skipped, 1, "the row with no name");
        assert_eq!(c.entries[3].flag.as_deref(), Some("\u{1F1E6}\u{1F1F1}"));
        assert_eq!(
            c.entries[4].parent.as_deref(),
            Some("countries/al"),
            "tab indentation still nests"
        );
        assert!(c.entries.iter().all(|e| !e.name.contains('\r')));
        // A format with no recognisable entries at all is refused as a whole, never half-read.
        let markdown_table = "| Country | Playlist |\n| --- | --- |\n| UK | https://iptv-org.github.io/iptv/countries/uk.m3u |";
        assert_eq!(
            parse(markdown_table, NOW).unwrap_err().code,
            ErrorCode::NotCatalogue
        );
    }

    #[test]
    fn playlist_addresses_are_checked_exactly() {
        assert_eq!(
            playlist_address("https://iptv-org.github.io/iptv/countries/uk.m3u"),
            Some((Kind::Country, "uk"))
        );
        for bad in [
            "https://iptv-org.github.io/iptv/countries/uk.m3u8",
            "https://iptv-org.github.io/iptv/countries/uk.m3u#x",
            "https://iptv-org.github.io/iptv/countries/a/b.m3u",
            "https://iptv-org.github.io/iptv/countries/.m3u",
            "https://iptv-org.github.io/iptv/countries/u_k.m3u",
            "https://iptv-org.github.io.evil.example/iptv/countries/uk.m3u",
            "https://user:pw@iptv-org.github.io/iptv/countries/uk.m3u",
            "https://iptv-org.github.io/iptv/index.m3u",
        ] {
            assert_eq!(playlist_address(bad), None, "{bad}");
        }
    }

    #[test]
    fn unusable_or_oversized_indexes_are_refused() {
        for bad in [
            "",
            "# Nothing here",
            "<html><body>Sign in</body></html>",
            "- Fake <code>https://evil.example/x.m3u</code>",
        ] {
            assert_eq!(
                parse(bad, NOW).unwrap_err().code,
                ErrorCode::NotCatalogue,
                "{bad:?}"
            );
        }
        let many: String = (0..=MAX_ENTRIES)
            .map(|i| {
                format!(
                    "- Place {i} <code>https://iptv-org.github.io/iptv/cities/c{i}.m3u</code>\n"
                )
            })
            .collect();
        assert_eq!(
            parse(&many, NOW).unwrap_err().code,
            ErrorCode::TooManyEntries
        );
        let long = format!("- {} <code>https://iptv-org.github.io/iptv/cities/long.m3u</code>\n- Ok <code>https://iptv-org.github.io/iptv/cities/ok.m3u</code>", "x".repeat(200));
        let c = parse(&long, NOW).unwrap();
        assert_eq!((c.entries.len(), c.skipped), (1, 1));
    }

    struct TempDir(PathBuf);
    impl TempDir {
        fn new() -> Self {
            let mut b = [0u8; 8];
            getrandom::fill(&mut b).unwrap();
            let p = std::env::temp_dir().join(format!(
                "kinora-catalogue-{}",
                b.iter().map(|x| format!("{x:02x}")).collect::<String>()
            ));
            fs::create_dir_all(&p).unwrap();
            Self(p)
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    /// The real catalogue policy, pointed at the local test server under the real host name.
    fn local_policy(port_dns: bool) -> Policy {
        Policy {
            https_only: false,
            allow_loopback: true,
            fake_dns: port_dns.then(|| vec!["127.0.0.1".parse().unwrap()]),
            total_timeout: std::time::Duration::from_millis(1500),
            ..Policy::catalogue()
        }
    }

    #[test]
    fn the_catalogue_policy_only_reaches_its_one_host_over_https() {
        let p = Policy::catalogue();
        let check = |u: &str| fetch::check_url(u, &p).map(|_| ()).map_err(|e| e.code);
        assert_eq!(check(URL), Ok(()));
        assert_eq!(
            check("http://raw.githubusercontent.com/iptv-org/iptv/master/PLAYLISTS.md"),
            Err(ErrorCode::InvalidUrl)
        );
        assert_eq!(
            check("https://evil.example/PLAYLISTS.md"),
            Err(ErrorCode::Blocked)
        );
        assert_eq!(
            check("https://iptv-org.github.io/iptv/countries/uk.m3u"),
            Err(ErrorCode::Blocked)
        );
        assert_eq!(
            check("https://raw.githubusercontent.com.evil.example/x"),
            Err(ErrorCode::Blocked)
        );
        assert_eq!(check("https://127.0.0.1/x"), Err(ErrorCode::Blocked));
        assert_eq!(
            check("https://u:p@raw.githubusercontent.com/x"),
            Err(ErrorCode::InvalidUrl)
        );
        assert!(p.max_bytes <= 2 * 1024 * 1024);
        // The general playlist policy is unchanged: any public host, http allowed.
        assert!(fetch::check_url("http://playlists.example/list.m3u", &Policy::default()).is_ok());
    }

    #[test]
    fn redirects_away_from_the_catalogue_host_are_refused() {
        let (port, _) = server(|path, port, _| match path {
            "/elsewhere" => http(
                "302 Found",
                "Location: http://other.test/PLAYLISTS.md\r\n",
                "",
            ),
            "/private" => http(
                "302 Found",
                "Location: http://10.0.0.1/PLAYLISTS.md\r\n",
                "",
            ),
            "/same" => http(
                "302 Found",
                &format!("Location: http://{HOST}:{port}/index\r\n"),
                "",
            ),
            "/index" => http("200 OK", "", INDEX),
            _ => http("404 Not Found", "", ""),
        });
        let get = |p: &str| {
            run(fetch::download_bytes(
                &format!("http://{HOST}:{port}{p}"),
                &local_policy(true),
                "text/plain",
            ))
        };
        assert_eq!(get("/elsewhere").unwrap_err().code, ErrorCode::Blocked);
        assert_eq!(get("/private").unwrap_err().code, ErrorCode::Blocked);
        assert_eq!(get("/same").unwrap().0, INDEX.as_bytes());
    }

    #[test]
    fn caches_survive_restarts_and_unusable_caches_are_ignored() {
        let tmp = TempDir::new();
        let store = CatalogueStore::new(Some(tmp.0.clone()));
        assert!(store.load().is_none());
        let c = parse(INDEX, NOW).unwrap();
        let json = serde_json::to_vec(&CacheFile {
            version: CACHE_VERSION,
            catalogue: c.clone(),
        })
        .unwrap();
        sources::write_atomically(&tmp.0, CACHE_NAME, &json).unwrap();
        assert_eq!(
            CatalogueStore::new(Some(tmp.0.clone())).load(),
            Some(c.clone())
        );
        let good = String::from_utf8(json).unwrap();
        for bad in [
            "{ nope".to_owned(),
            good.replace("\"version\":1", "\"version\":2"),
            good.replace(
                "https://iptv-org.github.io/iptv/countries/uk.m3u",
                "https://evil.example/iptv/countries/uk.m3u",
            ),
            good.replace("\"kind\":\"country\"", "\"kind\":\"language\""),
            good.replace("\"fetchedAt\"", "\"extra\":1,\"fetchedAt\""),
        ] {
            fs::write(tmp.0.join(CACHE_NAME), bad).unwrap();
            assert_eq!(store.load(), None);
        }
        fs::write(
            tmp.0.join(CACHE_NAME),
            vec![b' '; MAX_CACHE_BYTES as usize + 1],
        )
        .unwrap();
        assert_eq!(store.load(), None, "oversized caches are not read");
    }

    #[test]
    fn a_refresh_caches_the_result_and_a_failed_one_keeps_the_old_cache() {
        let tmp = TempDir::new();
        let (port, _) = server(|path, _, _| match path {
            "/master/PLAYLISTS.md" => http("200 OK", "", INDEX),
            "/big" => http("200 OK", "", &"x".repeat(3 * 1024 * 1024)),
            _ => http("200 OK", "", "<html>not the index</html>"),
        });
        let store = CatalogueStore::new(Some(tmp.0.clone()));
        let at = |p: &str| format!("http://{HOST}:{port}{p}");
        let c =
            run(store.refresh_from(&at("/master/PLAYLISTS.md"), &local_policy(true), NOW)).unwrap();
        assert_eq!(store.load(), Some(c.clone()), "the refresh was cached");
        let before = fs::read(tmp.0.join(CACHE_NAME)).unwrap();
        let changed =
            run(store.refresh_from(&at("/changed"), &local_policy(true), NOW + 1)).unwrap_err();
        assert_eq!(changed.code, ErrorCode::NotCatalogue);
        assert_eq!(
            run(store.refresh_from(&at("/big"), &local_policy(true), NOW + 1))
                .unwrap_err()
                .code,
            ErrorCode::TooLarge
        );
        assert_eq!(
            fs::read(tmp.0.join(CACHE_NAME)).unwrap(),
            before,
            "failures leave the last good cache"
        );
        assert_eq!(store.load(), Some(c));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(tmp.0.join(CACHE_NAME))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }
    }

    #[test]
    fn concurrent_refreshes_land_in_the_order_they_were_asked_for() {
        let tmp = TempDir::new();
        let newer = INDEX.replace("United Kingdom", "Newer Kingdom");
        let (port, _) = server(move |path, _, _| match path {
            "/slow/PLAYLISTS.md" => http("200 OK", "", INDEX), // the test server holds /slow… for 3 s
            _ => http("200 OK", "", &newer),
        });
        let store = std::sync::Arc::new(CatalogueStore::new(Some(tmp.0.clone())));
        let policy = Policy {
            total_timeout: std::time::Duration::from_secs(6),
            ..local_policy(true)
        };
        let (a, b) = (store.clone(), store.clone());
        let (p1, p2) = (policy.clone(), policy);
        let older = format!("http://{HOST}:{port}/slow/PLAYLISTS.md");
        let fast = format!("http://{HOST}:{port}/master/PLAYLISTS.md");
        run(async move {
            let first =
                tauri::async_runtime::spawn(async move { a.refresh_from(&older, &p1, NOW).await });
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
            let second =
                tauri::async_runtime::spawn(
                    async move { b.refresh_from(&fast, &p2, NOW + 1).await },
                );
            first.await.unwrap().unwrap();
            second.await.unwrap().unwrap();
        });
        let cached = store.load().unwrap();
        assert_eq!(
            cached.fetched_at,
            NOW + 1,
            "the later request's result is the one kept"
        );
        assert!(cached.entries.iter().any(|e| e.name == "Newer Kingdom"));
    }

    #[test]
    fn the_real_refresh_refuses_without_the_network_and_writes_nothing() {
        // The fixed address resolves through the guarded resolver; here it is pointed at a closed port.
        let tmp = TempDir::new();
        let store = CatalogueStore::new(Some(tmp.0.clone()));
        let policy = Policy {
            fake_dns: Some(vec!["127.0.0.1".parse().unwrap()]),
            allow_loopback: true,
            connect_timeout: std::time::Duration::from_millis(300),
            total_timeout: std::time::Duration::from_millis(600),
            ..Policy::catalogue()
        };
        let e = run(store.refresh(&policy, NOW)).unwrap_err();
        assert!(
            matches!(e.code, ErrorCode::Network | ErrorCode::Timeout),
            "{e:?}"
        );
        assert!(!e.message.contains("PLAYLISTS"), "{}", e.message);
        assert!(!tmp.0.join(CACHE_NAME).exists());
    }
}
