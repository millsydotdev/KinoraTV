//! Saved playlist sources (Gate D5): one JSON file owned by Rust, in a private folder of the app's
//! data directory, `<app data>/sources/sources.json` (folder 0700, file 0600 on Unix).
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

use crate::fetch::{self, Policy};
use crate::ingest::{ErrorCode, IngestError};

pub const SCHEMA_VERSION: u32 = 1;
const FILE_NAME: &str = "sources.json";
const TEMP_NAME: &str = "sources.json.tmp";
const MAX_FILE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_SOURCES: usize = 100;
const MAX_CHANNELS_PER_SOURCE: usize = crate::m3u::MAX_ENTRIES;
const MAX_CHANNELS_TOTAL: usize = 200_000;

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

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct SavedFile {
    version: u32,
    sources: Vec<SavedSource>,
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
    pub sources: Vec<SavedSource>,
    pub notice: Option<Notice>,
}

pub struct Store {
    dir: Option<PathBuf>,
    /// Set when the file on disk must not be overwritten this session.
    read_only: Mutex<bool>,
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
fn validate(sources: &[SavedSource]) -> Result<(), &'static str> {
    if sources.len() > MAX_SOURCES {
        return Err("too many sources");
    }
    let mut ids = std::collections::HashSet::new();
    let mut total = 0usize;
    for s in sources {
        let id_ok = s.id.len() <= 48
            && s.id.strip_prefix("pl-").is_some_and(|rest| {
                !rest.is_empty()
                    && rest
                        .bytes()
                        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
            });
        if !id_ok || !ids.insert(s.id.as_str()) {
            return Err("bad or repeated source id");
        }
        if !chars_between(s.name.trim(), 1, 48) || !chars_between(&s.label, 1, 120) {
            return Err("bad name or label");
        }
        match (s.origin, &s.url) {
            // The same check Add Source and every fetch use: http(s), no sign-in details, no local address.
            (Origin::Url, Some(url)) if fetch::check_url(url, &Policy::default()).is_ok() => {}
            (Origin::File, None) => {}
            _ => return Err("bad address for the source's origin"),
        }
        let time_ok = |t: f64| t.is_finite() && t >= 0.0;
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
                && c.chno.is_none_or(|n| (1..=99_999).contains(&n));
            if !ok {
                return Err("bad channel");
            }
        }
    }
    if total > MAX_CHANNELS_TOTAL {
        return Err("too many channels");
    }
    Ok(())
}

#[cfg(unix)]
fn private(path: &Path, mode: u32) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(mode))
}
#[cfg(not(unix))]
fn private(_: &Path, _: u32) -> std::io::Result<()> {
    Ok(())
}

impl Store {
    /// `dir` is `<app data>/sources`; `None` (no data directory) gives a read-only, empty store.
    pub fn new(dir: Option<PathBuf>) -> Self {
        let read_only = dir.is_none();
        Self {
            dir,
            read_only: Mutex::new(read_only),
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
            sources: Vec::new(),
            notice,
        };
        let Some(dir) = &self.dir else {
            return empty(Some(Notice::Unreadable));
        };
        let path = dir.join(FILE_NAME);
        // A temporary file left by an interrupted write: the real file is still the last complete one.
        let _ = fs::remove_file(dir.join(TEMP_NAME));
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
            // Version 1 is the first schema; a future migration from it belongs here.
            Some(v) if v == u64::from(SCHEMA_VERSION) => {
                match serde_json::from_slice::<SavedFile>(&bytes) {
                    Ok(file) if validate(&file.sources).is_ok() => Loaded {
                        sources: file.sources,
                        notice: None,
                    },
                    _ => self.set_aside(&path),
                }
            }
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
                sources: Vec::new(),
                notice: Some(Notice::Unreadable),
            };
        }
        Loaded {
            sources: Vec::new(),
            notice: Some(Notice::Recovered),
        }
    }

    /// Replaces the saved sources atomically.
    pub fn save(&self, sources: &[SavedSource]) -> Result<(), IngestError> {
        if *self.read_only.lock().unwrap_or_else(|p| p.into_inner()) {
            return Err(storage_error(
                "Saved sources are read-only this session, so changes were not saved.",
            ));
        }
        let Some(dir) = &self.dir else {
            return Err(storage_error("There is nowhere to save sources."));
        };
        validate(sources)
            .map_err(|_| storage_error("Kinora refused to save sources in an unexpected shape."))?;
        let json = serde_json::to_vec(&SavedFile {
            version: SCHEMA_VERSION,
            sources: sources.to_vec(),
        })
        .map_err(|_| storage_error("Kinora could not save your sources."))?;
        let _one_at_a_time = self.writing.lock().unwrap_or_else(|p| p.into_inner());
        write_atomically(dir, &json)
            .map_err(|_| storage_error("Kinora could not save your sources."))
    }
}

fn write_atomically(dir: &Path, bytes: &[u8]) -> std::io::Result<()> {
    fs::create_dir_all(dir)?;
    private(dir, 0o700)?;
    let temp = dir.join(TEMP_NAME);
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    let mut file = options.open(&temp)?;
    private(&temp, 0o600)?; // in case a temporary file survived with other permissions
    file.write_all(bytes)?;
    file.sync_all()?;
    drop(file);
    fs::rename(&temp, dir.join(FILE_NAME))?;
    // Make the rename itself durable.
    File::open(dir)?.sync_all()
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
                },
                SavedChannel {
                    key: "name:00ff00ff00ff00ff#2".into(),
                    tvg_id: None,
                    name: "Ünïcode ✓".into(),
                    group: None,
                    chno: None,
                },
            ],
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
        let saved = vec![source("pl-a1"), file_source("pl-b2")];
        Store::new(Some(tmp.store_dir())).save(&saved).unwrap();
        // A new Store is a restart: nothing is shared but the file.
        let loaded = Store::new(Some(tmp.store_dir())).load();
        assert_eq!(loaded.notice, None);
        assert!(loaded.sources == saved, "restored exactly");
        assert!(
            Store::new(Some(tmp.store_dir())).load().sources[0].channels[1].name == "Ünïcode ✓"
        );
    }

    #[test]
    fn a_missing_file_is_an_empty_store() {
        let tmp = TempDir::new("missing");
        let loaded = Store::new(Some(tmp.store_dir())).load();
        assert!(loaded.sources.is_empty() && loaded.notice.is_none());
    }

    #[cfg(unix)]
    #[test]
    fn the_folder_and_file_are_private_to_the_user() {
        use std::os::unix::fs::PermissionsExt;
        let tmp = TempDir::new("perms");
        Store::new(Some(tmp.store_dir()))
            .save(&[source("pl-a1")])
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
            assert!(loaded.sources.is_empty());
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
            store.save(&[source("pl-a1")]).unwrap();
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
        let json = serde_json::to_vec(&SavedFile {
            version: 1,
            sources: vec![credentialed],
        })
        .unwrap();
        fs::write(dir.join(FILE_NAME), json).unwrap();
        assert_eq!(Store::new(Some(dir)).load().notice, Some(Notice::Recovered));
    }

    #[test]
    fn a_newer_schema_is_left_untouched_and_nothing_is_saved_over_it() {
        let tmp = TempDir::new("newer");
        let dir = tmp.store_dir();
        fs::create_dir_all(&dir).unwrap();
        let future = b"{\"version\":2,\"sources\":[],\"somethingNew\":true}";
        fs::write(dir.join(FILE_NAME), future).unwrap();
        let store = Store::new(Some(dir.clone()));
        assert_eq!(store.load().notice, Some(Notice::NewerVersion));
        let e = store.save(&[source("pl-a1")]).unwrap_err();
        assert_eq!(e.code, ErrorCode::Storage);
        assert_eq!(fs::read(dir.join(FILE_NAME)).unwrap(), future);
    }

    #[test]
    fn a_failed_write_leaves_the_previous_file_intact() {
        let tmp = TempDir::new("failwrite");
        let dir = tmp.store_dir();
        let store = Store::new(Some(dir.clone()));
        store.save(&[source("pl-a1")]).unwrap();
        let before = fs::read(dir.join(FILE_NAME)).unwrap();
        // A directory where the temporary file must go: the write fails before the atomic rename.
        fs::create_dir(dir.join(TEMP_NAME)).unwrap();
        assert_eq!(
            store
                .save(&[source("pl-a1"), file_source("pl-b2")])
                .unwrap_err()
                .code,
            ErrorCode::Storage
        );
        assert_eq!(
            fs::read(dir.join(FILE_NAME)).unwrap(),
            before,
            "the last complete file is untouched"
        );
        fs::remove_dir(dir.join(TEMP_NAME)).unwrap();
        assert!(Store::new(Some(dir)).load().sources == vec![source("pl-a1")]);
    }

    #[test]
    fn an_interrupted_write_leaves_the_last_complete_file() {
        let tmp = TempDir::new("interrupted");
        let dir = tmp.store_dir();
        Store::new(Some(dir.clone()))
            .save(&[source("pl-a1")])
            .unwrap();
        fs::write(
            dir.join(TEMP_NAME),
            b"{\"version\":1,\"sources\":[{\"id\":\"pl-hal",
        )
        .unwrap(); // crashed mid-write
        let loaded = Store::new(Some(dir.clone())).load();
        assert_eq!(loaded.notice, None);
        assert!(loaded.sources == vec![source("pl-a1")]);
        assert!(
            !dir.join(TEMP_NAME).exists(),
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
            store.save(&[s]).map_err(|e| e.code)
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
                .save(&[source("pl-a1"), source("pl-a1")])
                .unwrap_err()
                .code,
            ErrorCode::Storage
        );
        let mut file_with_url = file_source("pl-b2");
        file_with_url.url = Some(TOKEN_URL.into());
        assert_eq!(
            store.save(&[file_with_url]).unwrap_err().code,
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
            store.save(&[source("pl-a1")]).unwrap_err().code,
            ErrorCode::Storage
        );
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
        let e = store.save(&[bad]).unwrap_err();
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
    }
}
