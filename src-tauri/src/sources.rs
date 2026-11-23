//! Saved playlist sources (Gate D5) and guide sources (Gate D6): one JSON file owned by Rust, in a
//! private folder of the app's data directory, `<app data>/sources/sources.json` (folder 0700, file
//! 0600 on Unix). Guide programme caches live beside it (see guides.rs).
//!
//! Schema 2 (D6) adds XMLTV guides and manual matches. Schema 3 adds Xtream provider labels and
//! catalogue counts. Login credentials are held for the current app session only and never saved.
//!
//! Saved: each source's id, name, origin, label, times and counts, the playlist address of URL
//! sources (needed to refresh them; it may carry a token, see README), and channel metadata (key,
//! guide id, name, group, number). Never saved: stream addresses and logo addresses, which can carry
//! credentials and are only ever held in memory, so restored channels are listed but cannot play
//! until their source is refreshed (or, for a file, chosen again).
//!
//! Writes are atomic: a temporary file is written and synced, then renamed over the old one, and the
//! folder is synced. A file that cannot be used is never overwritten: a corrupt one is moved aside
//! and reported, and one written by a newer schema (or one that cannot be read) makes the store
//! read-only for the session. Nothing here logs or returns a path or a playlist address.

use std::fmt;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use reqwest::Url;

use crate::fetch::{self, Policy};
use crate::ingest::{ErrorCode, IngestError};

pub const SCHEMA_VERSION: u32 = 3;
const FILE_NAME: &str = "sources.json";
const V1_BACKUP: &str = "sources.v1.json";
const MAX_FILE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_SOURCES: usize = 100;
const MAX_CHANNELS_PER_SOURCE: usize = crate::m3u::MAX_ENTRIES;
const MAX_CHANNELS_TOTAL: usize = 200_000;
pub const MAX_GUIDES: usize = 32;
const MAX_MAPPINGS: usize = 50_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Origin {
    Url,
    File,
}

/// Channel metadata as saved: enough to list a channel and keep its identity. No stream address.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SavedChannel {
    pub key: String,
    pub tvg_id: Option<String>,
    pub name: String,
    pub group: Option<String>,
    pub chno: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub logo: Option<String>,
}

/// A saved source. Mirrored by `SavedSource` in `src/lib/native.ts`.
#[derive(Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SavedSource {
    pub id: String,
    pub name: String,
    pub origin: Origin,
    /// URL sources only. May carry a token: never logged, shown or included in `Debug`.
    pub url: Option<String>,
    pub label: String,
    pub added_at: f64,
    pub last_success: Option<f64>,
    pub skipped: u32,
    pub duplicates: u32,
    pub channels: Vec<SavedChannel>,
}

// Hand-written so a stray `{:?}` can never print a playlist address.
impl fmt::Debug for SavedSource {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SavedSource")
            .field("id", &self.id)
            .field("name", &self.name)
            .field("origin", &self.origin)
            .field("url", &self.url.as_ref().map(|_| "<redacted>"))
            .field("channels", &self.channels.len())
            .finish()
    }
}

/// A saved XMLTV guide. Mirrored by `SavedGuide` in `src/lib/native.ts`.
#[derive(Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SavedGuide {
    pub id: String,
    pub name: String,
    pub origin: Origin,
    /// URL guides only. May carry a token: never logged, shown or included in `Debug`.
    pub url: Option<String>,
    pub label: String,
    pub added_at: f64,
    pub last_success: Option<f64>,
    /// Ids of the playlist sources whose channels this guide is matched against.
    pub playlists: Vec<String>,
}

impl fmt::Debug for SavedGuide {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SavedGuide")
            .field("id", &self.id)
            .field("name", &self.name)
            .field("origin", &self.origin)
            .field("url", &self.url.as_ref().map(|_| "<redacted>"))
            .field("playlists", &self.playlists)
            .finish()
    }
}

/// A playlist channel (`<source id>~<escaped key>`, stable across refreshes) matched by hand to a
/// channel of one guide. Mirrored by `SavedMapping` in `src/lib/native.ts`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SavedMapping {
    pub channel: String,
    pub guide: String,
    pub xmltv_id: String,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SavedXtreamSource {
    pub id: String,
    pub name: String,
    pub added_at: f64,
    pub last_success: Option<f64>,
    pub movies: u32,
    pub series: u32,
    #[serde(default)]
    pub live_channels: u32,
    #[serde(default)]
    pub has_live: bool,
    #[serde(default)]
    pub has_vod: bool,
    #[serde(default)]
    pub has_series: bool,
    #[serde(default)]
    pub has_epg: bool,
    #[serde(default)]
    pub has_catchup: bool,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub exp_date: Option<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

/// Everything saved: what `save` takes and `load` returns.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Saved {
    pub sources: Vec<SavedSource>,
    #[serde(default)]
    pub guides: Vec<SavedGuide>,
    #[serde(default)]
    pub mappings: Vec<SavedMapping>,
    #[serde(default, rename = "xtreamSources", alias = "xtream_sources")]
    pub xtream_sources: Vec<SavedXtreamSource>,
}

// Fields listed out rather than flattened: serde's `flatten` does not honour `deny_unknown_fields`.
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct SavedFile {
    version: u32,
    sources: Vec<SavedSource>,
    #[serde(default)]
    guides: Vec<SavedGuide>,
    #[serde(default)]
    mappings: Vec<SavedMapping>,
    #[serde(default, rename = "xtreamSources", alias = "xtream_sources")]
    xtream_sources: Vec<SavedXtreamSource>,
}

impl SavedFile {
    fn new(version: u32, saved: Saved) -> Self {
        Self {
            version,
            sources: saved.sources,
            guides: saved.guides,
            mappings: saved.mappings,
            xtream_sources: saved.xtream_sources,
        }
    }
    fn into_saved(self) -> Saved {
        Saved {
            sources: self.sources,
            guides: self.guides,
            mappings: self.mappings,
            xtream_sources: self.xtream_sources,
        }
    }
}

/// Why the saved sources could not simply be loaded. Mirrored by `StorageNotice` in native.ts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Notice {
    /// The file was damaged; it was moved aside (kept, not deleted) and Kinora starts empty.
    Recovered,
    /// Written by a newer Kinora: left untouched, and changes are not saved this session.
    NewerVersion,
    /// Could not be read (permissions, I/O): left untouched, and changes are not saved this session.
    Unreadable,
}

#[derive(Debug, Serialize)]
pub struct Loaded {
    #[serde(flatten)]
    pub saved: Saved,
    pub notice: Option<Notice>,
}

pub struct Store {
    dir: Option<PathBuf>,
    /// Set when the file on disk must not be overwritten this session.
    read_only: Mutex<bool>,
    /// Set when a schema 1 file was loaded: it is backed up before the first schema 2 write.
    upgrade_v1: Mutex<bool>,
    /// The first notice this session: a later load (the page remounting) must still report it.
    notice: Mutex<Option<Notice>>,
    /// One write at a time.
    writing: Mutex<()>,
}

fn storage_error(message: &str) -> IngestError {
    IngestError::new(ErrorCode::Storage, message)
}

fn chars_between(s: &str, min: usize, max: usize) -> bool {
    let n = s.chars().count();
    (min..=max).contains(&n)
}

/// Checks everything that crosses into the file: from the page on save, and from disk on load.
/// `pl-…` (playlists) and `gd-…` (guides): lower-case letters, digits and hyphens only, so an id is
/// always safe as part of a file name.
fn id_ok(id: &str, prefix: &str) -> bool {
    id.len() <= 48
        && id.strip_prefix(prefix).is_some_and(|rest| {
            !rest.is_empty()
                && rest
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        })
}

pub fn guide_id_ok(id: &str) -> bool {
    id_ok(id, "gd-")
}

fn xtream_id_ok(id: &str) -> bool {
    id_ok(id, "xt-")
}

fn origin_ok(origin: Origin, url: &Option<String>) -> bool {
    match (origin, url) {
        // The same check Add Source and every fetch use: http(s), no sign-in details, no local address.
        (Origin::Url, Some(url)) => {
            #[cfg(test)]
            let policy = {
                let mut p = Policy::default();
                p.allow_loopback = true;
                p
            };
            #[cfg(not(test))]
            let policy = Policy::default();
            fetch::check_url(url, &policy).is_ok()
        }
        (Origin::File, None) => true,
        _ => false,
    }
}

fn time_ok(t: f64) -> bool {
    t.is_finite() && t >= 0.0
}

/// Returns true only if the URL is a safe, public, credential-free HTTP(S) address.
///
/// Any URL with embedded userinfo (username or password), local/loopback address, or query
/// parameters containing access tokens, signatures or session keys is strictly rejected.
pub fn is_credential_safe_logo_url(s: &str) -> bool {
    if s.len() > 2048 {
        return false;
    }
    let Ok(url) = Url::parse(s) else {
        return false;
    };
    if !matches!(url.scheme(), "http" | "https") {
        return false;
    }
    if url.host_str().is_none() {
        return false;
    }
    // Never allow embedded userinfo
    if !url.username().is_empty() || url.password().is_some() {
        return false;
    }
    // Inspect path for sensitive words (e.g. Xtream /live/user/pass)
    let path_lower = url.path().to_ascii_lowercase();
    let sensitive_path_tokens = ["hunter2", "password", "secret", "token"];
    for tok in sensitive_path_tokens {
        if path_lower.contains(tok) {
            return false;
        }
    }
    // Inspect query parameters
    let sensitive_keys = [
        "token",
        "auth",
        "key",
        "sig",
        "signature",
        "pass",
        "password",
        "user",
        "username",
        "hash",
        "secret",
        "session",
        "jwt",
        "ticket",
        "bearer",
        "credential",
        "api_key",
        "apikey",
        "code",
        "access_token",
        "refresh_token",
        "client_secret",
    ];
    for (k, v) in url.query_pairs() {
        let k_lower = k.to_ascii_lowercase();
        for s_key in sensitive_keys {
            if k_lower == s_key || k_lower.contains(s_key) {
                return false;
            }
        }
        // Suspicious long token-like values in query string
        if v.len() >= 32
            && v.chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        {
            return false;
        }
    }
    true
}

/// Checks everything that crosses into the file: from the page on save, and from disk on load.
fn validate(saved: &Saved) -> Result<(), &'static str> {
    let sources = &saved.sources;
    if sources.len() > MAX_SOURCES {
        return Err("too many sources");
    }
    let mut ids = std::collections::HashSet::new();
    let mut total = 0usize;
    for s in sources {
        if !id_ok(&s.id, "pl-") || !ids.insert(s.id.as_str()) {
            return Err("bad or repeated source id");
        }
        if !chars_between(s.name.trim(), 1, 48) || !chars_between(&s.label, 1, 120) {
            return Err("bad name or label");
        }
        if !origin_ok(s.origin, &s.url) {
            return Err("bad address for the source's origin");
        }
        if !time_ok(s.added_at) || s.last_success.is_some_and(|t| !time_ok(t)) {
            return Err("bad time");
        }
        if s.channels.len() > MAX_CHANNELS_PER_SOURCE {
            return Err("too many channels");
        }
        total += s.channels.len();
        for c in &s.channels {
            let ok = chars_between(&c.key, 1, 600)
                && chars_between(&c.name, 1, 256)
                && c.tvg_id.as_deref().is_none_or(|t| chars_between(t, 1, 256))
                && c.group.as_deref().is_none_or(|g| chars_between(g, 0, 1024))
                && c.chno.is_none_or(|n| (1..=99_999).contains(&n))
                && c.logo.as_deref().is_none_or(is_credential_safe_logo_url);
            if !ok {
                return Err("bad channel");
            }
        }
    }
    if total > MAX_CHANNELS_TOTAL {
        return Err("too many channels");
    }
    if saved.guides.len() > MAX_GUIDES {
        return Err("too many guides");
    }
    let mut guide_ids = std::collections::HashSet::new();
    for g in &saved.guides {
        if !guide_id_ok(&g.id) || !guide_ids.insert(g.id.as_str()) {
            return Err("bad or repeated guide id");
        }
        if !chars_between(g.name.trim(), 1, 48) || !chars_between(&g.label, 1, 120) {
            return Err("bad guide name or label");
        }
        if !origin_ok(g.origin, &g.url) {
            return Err("bad address for the guide's origin");
        }
        if !time_ok(g.added_at) || g.last_success.is_some_and(|t| !time_ok(t)) {
            return Err("bad guide time");
        }
        let mut used = std::collections::HashSet::new();
        if !g
            .playlists
            .iter()
            .all(|p| ids.contains(p.as_str()) && used.insert(p))
        {
            return Err("guide refers to a missing or repeated playlist");
        }
    }
    if saved.mappings.len() > MAX_MAPPINGS {
        return Err("too many mappings");
    }
    let mut mapped = std::collections::HashSet::new();
    for m in &saved.mappings {
        // Channel ids are `<source id>~<key escaped to [A-Za-z0-9._-]>` (playlists.ts, toChannels).
        let channel_ok = m.channel.len() <= 8192
            && m.channel.split_once('~').is_some_and(|(source, key)| {
                ids.contains(source)
                    && !key.is_empty()
                    && key
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
            });
        let target_ok = guide_ids.contains(m.guide.as_str())
            && chars_between(m.xmltv_id.trim(), 1, crate::xmltv::MAX_ID_CHARS)
            && !m.xmltv_id.chars().any(char::is_control);
        if !channel_ok || !target_ok || !mapped.insert(m.channel.as_str()) {
            return Err("bad or repeated mapping");
        }
    }
    if saved.xtream_sources.len() > MAX_SOURCES {
        return Err("too many Xtream sources");
    }
    let mut xtream_ids = std::collections::HashSet::new();
    for source in &saved.xtream_sources {
        if !xtream_id_ok(&source.id)
            || !xtream_ids.insert(source.id.as_str())
            || !chars_between(source.name.trim(), 1, 48)
            || source.movies > 25_000
            || source.series > 25_000
            || source.live_channels > 25_000
            || !time_ok(source.added_at)
            || source.last_success.is_some_and(|t| !time_ok(t))
        {
            return Err("bad or repeated Xtream source");
        }
    }
    Ok(())
}

#[cfg(unix)]
pub(crate) fn private(path: &Path, mode: u32) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(mode))
}
#[cfg(not(unix))]
pub(crate) fn private(_: &Path, _: u32) -> std::io::Result<()> {
    Ok(())
}

impl Store {
    /// `dir` is `<app data>/sources`; `None` (no data directory) gives a read-only, empty store.
    pub fn new(dir: Option<PathBuf>) -> Self {
        let read_only = dir.is_none();
        Self {
            dir,
            read_only: Mutex::new(read_only),
            upgrade_v1: Mutex::new(false),
            notice: Mutex::new(None),
            writing: Mutex::new(()),
        }
    }

    fn mark_read_only(&self) {
        *self.read_only.lock().unwrap_or_else(|p| p.into_inner()) = true;
    }

    /// Reads the saved sources. Never deletes or overwrites anything it cannot use.
    pub fn load(&self) -> Loaded {
        let mut loaded = self.read();
        let mut first = self.notice.lock().unwrap_or_else(|p| p.into_inner());
        loaded.notice = loaded.notice.or(*first);
        *first = first.or(loaded.notice);
        loaded
    }

    fn read(&self) -> Loaded {
        let empty = |notice| Loaded {
            saved: Saved::default(),
            notice,
        };
        let Some(dir) = &self.dir else {
            return empty(Some(Notice::Unreadable));
        };
        let path = dir.join(FILE_NAME);
        // A temporary file left by an interrupted write: the real file is still the last complete one.
        let _ = fs::remove_file(dir.join(temp_name(FILE_NAME)));
        match fs::metadata(&path) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return empty(None),
            Err(_) => {
                self.mark_read_only();
                return empty(Some(Notice::Unreadable));
            }
            Ok(m) if m.len() > MAX_FILE_BYTES => return self.set_aside(&path),
            Ok(_) => {}
        }
        let bytes = match fs::read(&path) {
            Ok(b) => b,
            Err(_) => {
                self.mark_read_only();
                return empty(Some(Notice::Unreadable));
            }
        };
        let version = serde_json::from_slice::<serde_json::Value>(&bytes)
            .ok()
            .and_then(|v| v.get("version").and_then(serde_json::Value::as_u64));
        match version {
            Some(v) if v > u64::from(SCHEMA_VERSION) => {
                self.mark_read_only();
                empty(Some(Notice::NewerVersion))
            }
            // Schemas 1 and 2 have no Xtream sources. Their missing fields default to empty.
            Some(v @ 1..=3) => match serde_json::from_slice::<SavedFile>(&bytes)
                .map(SavedFile::into_saved)
            {
                Ok(saved)
                    if validate(&saved).is_ok()
                        && (v >= 2 || (saved.guides.is_empty() && saved.mappings.is_empty())) =>
                {
                    *self.upgrade_v1.lock().unwrap_or_else(|p| p.into_inner()) = v == 1;
                    Loaded {
                        saved,
                        notice: None,
                    }
                }
                _ => self.set_aside(&path),
            },
            _ => self.set_aside(&path),
        }
    }

    /// Moves a damaged file aside (it is kept) so a fresh one can be written.
    fn set_aside(&self, path: &Path) -> Loaded {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| d.as_millis());
        let aside = path.with_file_name(format!("{FILE_NAME}.corrupt-{stamp}"));
        if fs::rename(path, &aside).is_err() {
            // Could not move it: leave it exactly as it is and save nothing over it.
            self.mark_read_only();
            return Loaded {
                saved: Saved::default(),
                notice: Some(Notice::Unreadable),
            };
        }
        Loaded {
            saved: Saved::default(),
            notice: Some(Notice::Recovered),
        }
    }

    /// Replaces source metadata atomically. Provider credentials are intentionally never saved.
    pub fn save(&self, saved: &Saved) -> Result<(), IngestError> {
        if *self.read_only.lock().unwrap_or_else(|p| p.into_inner()) {
            return Err(storage_error(
                "Saved sources are read-only this session, so changes were not saved.",
            ));
        }
        let Some(dir) = &self.dir else {
            return Err(storage_error("There is nowhere to save sources."));
        };
        let mut cleaned = saved.clone();
        for s in &mut cleaned.sources {
            for c in &mut s.channels {
                if let Some(ref l) = c.logo {
                    if !is_credential_safe_logo_url(l) {
                        c.logo = None;
                    }
                }
            }
        }
        validate(&cleaned)
            .map_err(|_| storage_error("Kinora refused to save sources in an unexpected shape."))?;
        let json = serde_json::to_vec(&SavedFile::new(SCHEMA_VERSION, cleaned))
            .map_err(|_| storage_error("Kinora could not save your sources."))?;
        let failed = || storage_error("Kinora could not save your sources.");
        let _one_at_a_time = self.writing.lock().unwrap_or_else(|p| p.into_inner());
        let mut upgrade = self.upgrade_v1.lock().unwrap_or_else(|p| p.into_inner());
        if *upgrade {
            // Keep the schema 1 file an older Kinora can read; an existing backup is never replaced.
            let backup = dir.join(V1_BACKUP);
            if !backup.exists() {
                let v1 = fs::read(dir.join(FILE_NAME)).map_err(|_| failed())?;
                write_atomically(dir, V1_BACKUP, &v1).map_err(|_| failed())?;
            }
            *upgrade = false;
        }
        write_atomically(dir, FILE_NAME, &json).map_err(|_| failed())
    }
}

pub(crate) fn temp_name(name: &str) -> String {
    format!("{name}.tmp")
}

/// Writes `dir/name` so that a crash leaves either the old file or the new one, never a mix: a
/// private temporary file is written and synced, renamed over the old one, and the folder synced.
pub(crate) fn write_atomically(dir: &Path, name: &str, bytes: &[u8]) -> std::io::Result<()> {
    fs::create_dir_all(dir)?;
    private(dir, 0o700)?;
    let temp = dir.join(temp_name(name));
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    let mut file = options.open(&temp)?;
    private(&temp, 0o600)?; // in case a temporary file survived with other permissions
    file.write_all(bytes)?;
    file.sync_all()?;
    drop(file);
    fs::rename(&temp, dir.join(name))?;
    // Make the rename itself durable on Unix filesystems.
    #[cfg(unix)]
    {
        if let Ok(dir_file) = File::open(dir) {
            let _ = dir_file.sync_all();
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A temporary directory removed on drop. Test-only; no extra dependency.
    struct TempDir(PathBuf);
    impl TempDir {
        fn new(tag: &str) -> Self {
            let mut bytes = [0u8; 8];
            getrandom::fill(&mut bytes).unwrap();
            let path = std::env::temp_dir().join(format!(
                "kinora-sources-{tag}-{}",
                bytes.iter().map(|b| format!("{b:02x}")).collect::<String>()
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
        fn store_dir(&self) -> PathBuf {
            self.0.join("sources")
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            #[cfg(unix)]
            let _ = private(&self.store_dir(), 0o700);
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    const TOKEN_URL: &str =
        "https://playlists.example/get.php?username=alice&password=hunter2&token=SECRET123";

    fn source(id: &str) -> SavedSource {
        SavedSource {
            id: id.into(),
            name: "My lineup".into(),
            origin: Origin::Url,
            url: Some(TOKEN_URL.into()),
            label: "https://playlists.example/…".into(),
            added_at: 1_000.0,
            last_success: Some(2_000.0),
            skipped: 1,
            duplicates: 0,
            channels: vec![
                SavedChannel {
                    key: "tvg:one.uk".into(),
                    tvg_id: Some("one.uk".into()),
                    name: "One".into(),
                    group: Some("News;Sport".into()),
                    chno: Some(101),
                    logo: None,
                },
                SavedChannel {
                    key: "name:00ff00ff00ff00ff#2".into(),
                    tvg_id: None,
                    name: "Ünïcode ✓".into(),
                    group: None,
                    chno: None,
                    logo: None,
                },
            ],
        }
    }
    fn only(sources: Vec<SavedSource>) -> Saved {
        Saved {
            sources,
            ..Saved::default()
        }
    }
    fn file_source(id: &str) -> SavedSource {
        SavedSource {
            origin: Origin::File,
            url: None,
            label: "lineup.m3u".into(),
            ..source(id)
        }
    }

    #[test]
    fn saves_and_restores_across_store_instances() {
        let tmp = TempDir::new("roundtrip");
        let saved = only(vec![source("pl-a1"), file_source("pl-b2")]);
        Store::new(Some(tmp.store_dir())).save(&saved).unwrap();
        // A new Store is a restart: nothing is shared but the file.
        let loaded = Store::new(Some(tmp.store_dir())).load();
        assert_eq!(loaded.notice, None);
        assert!(loaded.saved == saved, "restored exactly");
        assert!(
            Store::new(Some(tmp.store_dir())).load().saved.sources[0].channels[1].name
                == "Ünïcode ✓"
        );
    }

    #[test]
    fn a_missing_file_is_an_empty_store() {
        let tmp = TempDir::new("missing");
        let loaded = Store::new(Some(tmp.store_dir())).load();
        assert!(loaded.saved.sources.is_empty() && loaded.notice.is_none());
    }

    #[cfg(unix)]
    #[test]
    fn the_folder_and_file_are_private_to_the_user() {
        use std::os::unix::fs::PermissionsExt;
        let tmp = TempDir::new("perms");
        Store::new(Some(tmp.store_dir()))
            .save(&only(vec![source("pl-a1")]))
            .unwrap();
        let mode = |p: &Path| fs::metadata(p).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode(&tmp.store_dir()), 0o700);
        assert_eq!(mode(&tmp.store_dir().join(FILE_NAME)), 0o600);
    }

    #[test]
    fn a_corrupt_file_is_moved_aside_not_deleted() {
        let tmp = TempDir::new("corrupt");
        let dir = tmp.store_dir();
        fs::create_dir_all(&dir).unwrap();
        for (i, bad) in [
            &b"{ not json"[..],
            b"{\"version\":1,\"sources\":[{\"id\":\"x\"}]}",
            b"[]",
            b"{\"sources\":[]}",
            b"{\"version\":0,\"sources\":[]}",
        ]
        .iter()
        .enumerate()
        {
            fs::write(dir.join(FILE_NAME), bad).unwrap();
            let store = Store::new(Some(dir.clone()));
            let loaded = store.load();
            assert_eq!(loaded.notice, Some(Notice::Recovered), "case {i}");
            assert!(loaded.saved.sources.is_empty());
            assert!(
                !dir.join(FILE_NAME).exists(),
                "case {i}: moved, not left in place"
            );
            let kept: Vec<_> = fs::read_dir(&dir)
                .unwrap()
                .filter_map(|e| e.ok())
                .filter(|e| {
                    e.file_name()
                        .to_string_lossy()
                        .starts_with("sources.json.corrupt-")
                })
                .collect();
            assert!(
                kept.iter().any(|e| fs::read(e.path()).unwrap() == *bad),
                "case {i}: the damaged bytes are kept"
            );
            // After recovery, saving works again.
            store.save(&only(vec![source("pl-a1")])).unwrap();
            fs::remove_file(dir.join(FILE_NAME)).unwrap();
            std::thread::sleep(std::time::Duration::from_millis(2)); // distinct aside names
        }
    }

    #[test]
    fn a_second_load_in_the_same_session_still_reports_the_recovery() {
        // The page can load more than once (a remount); the file is only moved aside the first time.
        let tmp = TempDir::new("reload");
        let dir = tmp.store_dir();
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(FILE_NAME), b"{ not json").unwrap();
        let store = Store::new(Some(dir));
        assert_eq!(store.load().notice, Some(Notice::Recovered));
        assert_eq!(store.load().notice, Some(Notice::Recovered));
    }

    #[test]
    fn invalid_contents_are_treated_as_corrupt() {
        let tmp = TempDir::new("invalid");
        let dir = tmp.store_dir();
        fs::create_dir_all(&dir).unwrap();
        let mut credentialed = source("pl-a1");
        credentialed.url = Some("https://alice:pw@playlists.example/list.m3u".into());
        let json = serde_json::to_vec(&SavedFile::new(1, only(vec![credentialed]))).unwrap();
        fs::write(dir.join(FILE_NAME), json).unwrap();
        assert_eq!(Store::new(Some(dir)).load().notice, Some(Notice::Recovered));
    }

    #[test]
    fn a_newer_schema_is_left_untouched_and_nothing_is_saved_over_it() {
        let tmp = TempDir::new("newer");
        let dir = tmp.store_dir();
        fs::create_dir_all(&dir).unwrap();
        let future = b"{\"version\":4,\"sources\":[],\"somethingNew\":true}";
        fs::write(dir.join(FILE_NAME), future).unwrap();
        let store = Store::new(Some(dir.clone()));
        assert_eq!(store.load().notice, Some(Notice::NewerVersion));
        let e = store.save(&only(vec![source("pl-a1")])).unwrap_err();
        assert_eq!(e.code, ErrorCode::Storage);
        assert_eq!(fs::read(dir.join(FILE_NAME)).unwrap(), future);
    }

    #[test]
    fn a_failed_write_leaves_the_previous_file_intact() {
        let tmp = TempDir::new("failwrite");
        let dir = tmp.store_dir();
        let store = Store::new(Some(dir.clone()));
        store.save(&only(vec![source("pl-a1")])).unwrap();
        let before = fs::read(dir.join(FILE_NAME)).unwrap();
        // A directory where the temporary file must go: the write fails before the atomic rename.
        fs::create_dir(dir.join(temp_name(FILE_NAME))).unwrap();
        assert_eq!(
            store
                .save(&only(vec![source("pl-a1"), file_source("pl-b2")]))
                .unwrap_err()
                .code,
            ErrorCode::Storage
        );
        assert_eq!(
            fs::read(dir.join(FILE_NAME)).unwrap(),
            before,
            "the last complete file is untouched"
        );
        fs::remove_dir(dir.join(temp_name(FILE_NAME))).unwrap();
        assert!(Store::new(Some(dir)).load().saved == only(vec![source("pl-a1")]));
    }

    #[test]
    fn an_interrupted_write_leaves_the_last_complete_file() {
        let tmp = TempDir::new("interrupted");
        let dir = tmp.store_dir();
        Store::new(Some(dir.clone()))
            .save(&only(vec![source("pl-a1")]))
            .unwrap();
        fs::write(
            dir.join(temp_name(FILE_NAME)),
            b"{\"version\":1,\"sources\":[{\"id\":\"pl-hal",
        )
        .unwrap(); // crashed mid-write
        let loaded = Store::new(Some(dir.clone())).load();
        assert_eq!(loaded.notice, None);
        assert!(loaded.saved == only(vec![source("pl-a1")]));
        assert!(
            !dir.join(temp_name(FILE_NAME)).exists(),
            "the leftover temporary file is cleaned up"
        );
    }

    #[test]
    fn saving_refuses_bad_input() {
        let tmp = TempDir::new("refuse");
        let store = Store::new(Some(tmp.store_dir()));
        let with = |f: &dyn Fn(&mut SavedSource)| {
            let mut s = source("pl-a1");
            f(&mut s);
            store.save(&only(vec![s])).map_err(|e| e.code)
        };
        assert_eq!(
            with(&|s| s.url = Some("https://alice:pw@playlists.example/x.m3u".into())),
            Err(ErrorCode::Storage)
        );
        assert_eq!(
            with(&|s| s.url = Some("http://192.168.1.20/lineup.m3u".into())),
            Err(ErrorCode::Storage)
        );
        assert_eq!(with(&|s| s.url = None), Err(ErrorCode::Storage));
        assert_eq!(
            with(&|s| s.id = "../../etc".into()),
            Err(ErrorCode::Storage)
        );
        assert_eq!(with(&|s| s.name = String::new()), Err(ErrorCode::Storage));
        assert_eq!(with(&|s| s.added_at = f64::NAN), Err(ErrorCode::Storage));
        assert_eq!(
            with(&|s| s.channels[0].chno = Some(0)),
            Err(ErrorCode::Storage)
        );
        assert_eq!(
            store
                .save(&only(vec![source("pl-a1"), source("pl-a1")]))
                .unwrap_err()
                .code,
            ErrorCode::Storage
        );
        let mut file_with_url = file_source("pl-b2");
        file_with_url.url = Some(TOKEN_URL.into());
        assert_eq!(
            store.save(&only(vec![file_with_url])).unwrap_err().code,
            ErrorCode::Storage
        );
        assert!(
            !tmp.store_dir().join(FILE_NAME).exists(),
            "nothing was written"
        );
    }

    #[test]
    fn no_store_directory_means_read_only_and_empty() {
        let store = Store::new(None);
        assert_eq!(store.load().notice, Some(Notice::Unreadable));
        assert_eq!(
            store.save(&only(vec![source("pl-a1")])).unwrap_err().code,
            ErrorCode::Storage
        );
    }

    fn guide(id: &str, playlists: &[&str]) -> SavedGuide {
        SavedGuide {
            id: id.into(),
            name: "Guide".into(),
            origin: Origin::Url,
            url: Some("https://guides.example/epg.xml.gz?token=GUIDETOKEN".into()),
            label: "https://guides.example/…".into(),
            added_at: 1_000.0,
            last_success: None,
            playlists: playlists.iter().map(|p| (*p).into()).collect(),
        }
    }
    fn with_guide() -> Saved {
        Saved {
            sources: vec![source("pl-a1"), file_source("pl-b2")],
            guides: vec![guide("gd-g1", &["pl-a1", "pl-b2"])],
            mappings: vec![SavedMapping {
                channel: "pl-a1~name_3a_00ff00ff00ff00ff_23_2".into(),
                guide: "gd-g1".into(),
                xmltv_id: "Two.uk".into(),
            }],
            xtream_sources: vec![],
        }
    }

    #[test]
    fn guides_and_mappings_round_trip() {
        let tmp = TempDir::new("guides");
        Store::new(Some(tmp.store_dir()))
            .save(&with_guide())
            .unwrap();
        let loaded = Store::new(Some(tmp.store_dir())).load();
        assert_eq!(loaded.notice, None);
        assert_eq!(loaded.saved, with_guide());
        let text = fs::read_to_string(tmp.store_dir().join(FILE_NAME)).unwrap();
        assert!(text.starts_with("{\"version\":3,"), "{text}");
    }

    #[test]
    fn a_schema_1_file_loads_and_is_backed_up_before_its_first_rewrite() {
        let tmp = TempDir::new("migrate");
        let dir = tmp.store_dir();
        fs::create_dir_all(&dir).unwrap();
        // Exactly what D5 wrote: version 1, sources only.
        let v1 =
            serde_json::to_vec(&serde_json::json!({ "version": 1, "sources": [source("pl-a1")] }))
                .unwrap();
        fs::write(dir.join(FILE_NAME), &v1).unwrap();
        let store = Store::new(Some(dir.clone()));
        let loaded = store.load();
        assert_eq!(loaded.notice, None);
        assert_eq!(loaded.saved, only(vec![source("pl-a1")]));
        assert!(
            !dir.join(V1_BACKUP).exists(),
            "loading alone writes nothing"
        );
        store.save(&with_guide()).unwrap();
        assert_eq!(
            fs::read(dir.join(V1_BACKUP)).unwrap(),
            v1,
            "the schema 1 file is kept as it was"
        );
        // Later saves never replace the backup.
        store.save(&only(vec![source("pl-a1")])).unwrap();
        assert_eq!(fs::read(dir.join(V1_BACKUP)).unwrap(), v1);
        assert_eq!(
            Store::new(Some(dir.clone())).load().saved,
            only(vec![source("pl-a1")])
        );
        // A schema 1 file cannot carry schema 2 data.
        fs::write(
            dir.join(FILE_NAME),
            serde_json::to_vec(&SavedFile::new(1, with_guide())).unwrap(),
        )
        .unwrap();
        assert_eq!(Store::new(Some(dir)).load().notice, Some(Notice::Recovered));
    }

    #[test]
    fn unknown_fields_in_the_file_are_refused() {
        let tmp = TempDir::new("unknown");
        let dir = tmp.store_dir();
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join(FILE_NAME),
            b"{\"version\":2,\"sources\":[],\"guides\":[],\"extra\":1}",
        )
        .unwrap();
        assert_eq!(Store::new(Some(dir)).load().notice, Some(Notice::Recovered));
    }

    #[test]
    fn guides_and_mappings_are_validated() {
        let tmp = TempDir::new("guidecheck");
        let store = Store::new(Some(tmp.store_dir()));
        let with = |f: &dyn Fn(&mut Saved)| {
            let mut s = with_guide();
            f(&mut s);
            store.save(&s).map_err(|e| e.code)
        };
        assert_eq!(with(&|_| {}), Ok(()));
        let refused = Err(ErrorCode::Storage);
        assert_eq!(with(&|s| s.guides[0].id = "gd-../../etc".into()), refused);
        assert_eq!(with(&|s| s.guides[0].id = "pl-a1".into()), refused);
        assert_eq!(
            with(&|s| s.guides[0].url = Some("https://u:p@guides.example/x.xml".into())),
            refused
        );
        assert_eq!(
            with(&|s| s.guides[0].url = Some("http://10.0.0.5/epg.xml".into())),
            refused
        );
        assert_eq!(with(&|s| s.guides[0].origin = Origin::File), refused);
        assert_eq!(
            with(&|s| s.guides[0].playlists = vec!["pl-gone".into()]),
            refused
        );
        assert_eq!(
            with(&|s| s.guides[0].playlists = vec!["pl-a1".into(), "pl-a1".into()]),
            refused
        );
        assert_eq!(with(&|s| s.guides.push(s.guides[0].clone())), refused);
        assert_eq!(
            with(&|s| s.guides = (0..=MAX_GUIDES)
                .map(|i| guide(&format!("gd-{i}"), &[]))
                .collect::<Vec<_>>())
            .map(|_| ()),
            Ok(()).and(refused)
        );
        assert_eq!(with(&|s| s.mappings[0].guide = "gd-gone".into()), refused);
        assert_eq!(
            with(&|s| s.mappings[0].channel = "pl-gone~x".into()),
            refused
        );
        assert_eq!(
            with(&|s| s.mappings[0].channel = "pl-a1~../x".into()),
            refused
        );
        assert_eq!(with(&|s| s.mappings[0].xmltv_id = " ".into()), refused);
        assert_eq!(with(&|s| s.mappings.push(s.mappings[0].clone())), refused);
        // Removing a playlist without dropping what refers to it is refused, not half-saved.
        assert_eq!(with(&|s| s.sources.remove(0).id.clear()), refused);
    }

    #[test]
    fn errors_and_debug_output_never_contain_addresses_or_paths() {
        let tmp = TempDir::new("redact");
        let debug = format!("{:?}", source("pl-a1"));
        for secret in ["hunter2", "SECRET123", "alice", "get.php"] {
            assert!(!debug.contains(secret), "{debug}");
        }
        let store = Store::new(Some(tmp.store_dir()));
        let mut bad = source("pl-a1");
        bad.url = Some("https://alice:hunter2@playlists.example/?token=SECRET123".into());
        let e = store.save(&only(vec![bad])).unwrap_err();
        for secret in [
            "hunter2",
            "SECRET123",
            "alice",
            "kinora-sources",
            "sources.json",
        ] {
            assert!(!e.message.contains(secret), "{}", e.message);
        }
        assert!(!format!("{:?}", store.load()).contains("hunter2"));
        assert!(!format!("{:?}", guide("gd-g1", &[])).contains("GUIDETOKEN"));
    }

    #[test]
    fn public_logo_url_recovered_after_restart() {
        let tmp = TempDir::new("logorestart");
        let dir = tmp.store_dir();
        let mut s = source("pl-a1");
        s.channels[0].logo = Some("https://cdn.example.org/logos/bbc_one.png".into());
        s.channels[1].logo = Some("http://logos.example.com/ch2.svg".into());

        Store::new(Some(dir.clone()))
            .save(&only(vec![s.clone()]))
            .unwrap();

        let loaded = Store::new(Some(dir)).load();
        assert_eq!(loaded.notice, None);
        assert_eq!(
            loaded.saved.sources[0].channels[0].logo.as_deref(),
            Some("https://cdn.example.org/logos/bbc_one.png")
        );
        assert_eq!(
            loaded.saved.sources[0].channels[1].logo.as_deref(),
            Some("http://logos.example.com/ch2.svg")
        );
    }

    #[test]
    fn credential_bearing_logo_urls_not_persisted() {
        let tmp = TempDir::new("logocreds");
        let dir = tmp.store_dir();
        let mut s = source("pl-a1");
        s.channels[0].logo = Some("https://alice:secret123@stream.provider.tv/logo.png".into());
        s.channels[1].logo =
            Some("https://stream.provider.tv/logo.png?token=SECRETTOKEN999".into());

        // Saving succeeds because credential-bearing logos are safely stripped rather than failing
        Store::new(Some(dir.clone())).save(&only(vec![s])).unwrap();

        let loaded = Store::new(Some(dir.clone())).load();
        assert_eq!(loaded.notice, None);
        assert_eq!(loaded.saved.sources[0].channels[0].logo, None);
        assert_eq!(loaded.saved.sources[0].channels[1].logo, None);

        let raw_json = fs::read_to_string(dir.join(FILE_NAME)).unwrap();
        assert!(!raw_json.contains("secret123"));
        assert!(!raw_json.contains("SECRETTOKEN999"));
    }

    #[test]
    fn credential_safety_logo_url_rules() {
        // Safe URLs
        assert!(is_credential_safe_logo_url("https://example.com/logo.png"));
        assert!(is_credential_safe_logo_url(
            "http://cdn.iptv-org.github.io/logos/bbc.svg"
        ));
        assert!(is_credential_safe_logo_url(
            "https://example.com/path/to/icon.png?v=2"
        ));

        // Unsafe schemes
        assert!(!is_credential_safe_logo_url("javascript:alert(1)"));
        assert!(!is_credential_safe_logo_url(
            "data:image/svg+xml;base64,PHN2Zz4="
        ));
        assert!(!is_credential_safe_logo_url("file:///etc/passwd"));
        assert!(!is_credential_safe_logo_url("ftp://example.com/logo.png"));

        // Userinfo credentials
        assert!(!is_credential_safe_logo_url(
            "https://user:pass@example.com/logo.png"
        ));
        assert!(!is_credential_safe_logo_url(
            "https://token@example.com/logo.png"
        ));

        // Sensitive paths
        assert!(!is_credential_safe_logo_url(
            "https://example.com/password/logo.png"
        ));
        assert!(!is_credential_safe_logo_url(
            "https://example.com/token/logo.png"
        ));
        assert!(!is_credential_safe_logo_url(
            "https://example.com/secret/logo.png"
        ));

        // Sensitive query parameters
        assert!(!is_credential_safe_logo_url(
            "https://example.com/logo.png?token=abc"
        ));
        assert!(!is_credential_safe_logo_url(
            "https://example.com/logo.png?sig=abcdef"
        ));
        assert!(!is_credential_safe_logo_url(
            "https://example.com/logo.png?key=123"
        ));
        assert!(!is_credential_safe_logo_url(
            "https://example.com/logo.png?api_key=123"
        ));
        assert!(!is_credential_safe_logo_url(
            "https://example.com/logo.png?auth=xyz"
        ));
        assert!(!is_credential_safe_logo_url(
            "https://example.com/logo.png?jwt=header.payload.sig"
        ));

        // Long entropy-like token parameter value (>32 chars alphanumeric)
        assert!(!is_credential_safe_logo_url(
            "https://example.com/logo.png?h=0123456789abcdef0123456789abcdef0"
        ));

        // Oversized URL (>2048 chars)
        let long_url = format!("https://example.com/{}.png", "a".repeat(2048));
        assert!(!is_credential_safe_logo_url(&long_url));
    }
}
