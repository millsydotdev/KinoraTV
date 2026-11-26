//! XMLTV guides held by Rust (Gate D6). A guide is parsed once (xmltv.rs), kept in memory, and
//! written beside the saved sources as `guide-<id>.json`: the last good copy, so programmes show at
//! startup and offline, and a failed refresh never loses them. The page asks for one day of
//! programmes at a time, for the channel ids it wants, so it never holds a whole guide.
//!
//! Caches hold channel ids, names and programme text only: never the guide's address, icons or
//! other URLs. They are derived data: one that cannot be read is ignored and replaced on the next
//! successful import. Each import gets a generation number; a result is kept only if no newer
//! import (or removal) of the same guide started meanwhile, so a slow refresh cannot overwrite a
//! newer one.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

use crate::ingest::{ErrorCode, IngestError};
use crate::sources::{self, guide_id_ok};
use crate::xmltv::{self, Guide, GuideChannel, Programme};

const CACHE_VERSION: u32 = 1;
/// A cache holds at most `Limits::max_programmes` programmes with capped text.
const MAX_CACHE_BYTES: u64 = 512 * 1024 * 1024;
const MAX_QUERIES: usize = sources::MAX_GUIDES;
const MAX_IDS: usize = 100_000;
/// The page asks for one local day (25 hours on a daylight-saving change), plus a margin.
const MAX_WINDOW_MS: i64 = 49 * 3_600_000;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CacheFile {
    version: u32,
    id: String,
    fetched_at: i64,
    guide: Guide,
}

/// `CacheFile` as written: borrows the held guide rather than copying it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CacheRef<'a> {
    version: u32,
    id: &'a str,
    fetched_at: i64,
    guide: &'a Guide,
}

struct Held {
    guide: Guide,
    fetched_at: i64,
    /// Tier 1: `xmltv::normalize_id(channel id)` → index into `guide.channels`.
    index: HashMap<String, usize>,
    /// Tier 2: `xmltv::loose_keys` & `xmltv::alias_keys` → first channel with programmes.
    loose: HashMap<String, usize>,
    /// Tier 3: unambiguous `xmltv::display_name_key` → unique channel with programmes in that country.
    unique_names: HashMap<String, usize>,
}

impl Held {
    fn new(guide: Guide, fetched_at: i64) -> Self {
        let index = guide
            .channels
            .iter()
            .enumerate()
            .map(|(i, c)| (xmltv::normalize_id(&c.id), i))
            .collect();
        let mut loose = HashMap::new();
        for (i, c) in guide.channels.iter().enumerate() {
            if !guide.schedules[i].is_empty() {
                for key in xmltv::loose_keys(&c.id).into_iter().take(1) {
                    loose.entry(key).or_insert(i);
                }
            }
        }
        // Populate secondary alias keys only after primary loose_keys so exact loose_keys always win.
        for (i, c) in guide.channels.iter().enumerate() {
            if !guide.schedules[i].is_empty() {
                for key in xmltv::alias_keys(&c.id) {
                    loose.entry(key).or_insert(i);
                }
            }
        }
        // Tier 3: unambiguous normalized display-name within the same 2-letter country suffix.
        let mut name_candidates: HashMap<String, Option<usize>> = HashMap::new();
        for (i, c) in guide.channels.iter().enumerate() {
            if !guide.schedules[i].is_empty() {
                if let Some(nk) = xmltv::display_name_key(&c.name, &c.id) {
                    name_candidates
                        .entry(nk)
                        .and_modify(|slot| {
                            if *slot != Some(i) {
                                *slot = None;
                            }
                        })
                        .or_insert(Some(i));
                }
            }
        }
        let unique_names = name_candidates
            .into_iter()
            .filter_map(|(k, v)| v.map(|i| (k, i)))
            .collect();
        Self {
            guide,
            fetched_at,
            index,
            loose,
            unique_names,
        }
    }

    fn summary(&self) -> Summary {
        let all = || self.guide.schedules.iter().flatten();
        Summary {
            channels: self.guide.channels.len() as u32,
            programmes: all().count() as u32,
            first: all().map(|p| p.start).min(),
            last: all().map(|p| p.stop).max(),
            fetched_at: self.fetched_at,
            skipped: self.guide.skipped,
            duplicates: self.guide.duplicates,
            warnings: self.guide.warnings.clone(),
        }
    }
}

/// What the page shows about a guide. Mirrored by `GuideSummary` in `src/lib/native.ts`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub channels: u32,
    pub programmes: u32,
    /// Earliest start and latest stop kept (UTC ms); `None` when the guide has no programmes.
    pub first: Option<i64>,
    pub last: Option<i64>,
    pub fetched_at: i64,
    pub skipped: u32,
    pub duplicates: u32,
    pub warnings: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Query {
    pub guide: String,
    /// Channel ids as the page has them (playlist `tvg-id`s or hand-picked guide ids).
    pub ids: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Match {
    /// The id as asked for.
    pub id: String,
    /// The guide's channel id it matched (see `xmltv::normalize_id` and `without_feed`), or `None`.
    pub channel: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Listed {
    /// The guide's channel id.
    pub channel: String,
    #[serde(flatten)]
    pub programme: Programme,
}

/// Mirrored by `GuideAnswer` in `src/lib/native.ts`.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Answer {
    pub guide: String,
    /// False when no data is held for the guide (never imported, or removed).
    pub loaded: bool,
    pub matches: Vec<Match>,
    pub programmes: Vec<Listed>,
}

#[derive(Default)]
struct Inner {
    held: HashMap<String, Arc<Held>>,
    generation: HashMap<String, u64>,
    next: u64,
}

pub struct GuideStore {
    /// The saved-sources folder; `None` keeps guides in memory only.
    dir: Option<PathBuf>,
    inner: Mutex<Inner>,
}

fn bad_input() -> IngestError {
    IngestError::new(
        ErrorCode::Storage,
        "Kinora refused a guide request in an unexpected shape.",
    )
}

fn cache_name(id: &str) -> String {
    format!("guide-{id}.json")
}

impl GuideStore {
    pub fn new(dir: Option<PathBuf>) -> Self {
        Self {
            dir,
            inner: Mutex::default(),
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|p| p.into_inner())
    }

    /// Starts an import (or removal): every earlier one for the same guide becomes stale.
    pub fn begin(&self, id: &str) -> Result<u64, IngestError> {
        if !guide_id_ok(id) {
            return Err(bad_input());
        }
        let mut inner = self.lock();
        inner.next += 1;
        let generation = inner.next;
        inner.generation.insert(id.to_owned(), generation);
        Ok(generation)
    }

    fn current(&self, id: &str, generation: u64) -> bool {
        self.lock().generation.get(id) == Some(&generation)
    }

    /// `begin` then `finish`, for tests.
    #[cfg(test)]
    pub fn import(&self, id: &str, bytes: Vec<u8>, now: i64) -> Result<Summary, IngestError> {
        let generation = self.begin(id)?;
        self.finish(id, generation, bytes, now)
    }

    /// Decodes, parses and keeps a guide from downloaded or picked bytes, if no newer import or
    /// removal started since `begin`. CPU-bound: run it off the async runtime. `now` is UTC ms.
    pub fn finish(
        &self,
        id: &str,
        generation: u64,
        bytes: Vec<u8>,
        now: i64,
    ) -> Result<Summary, IngestError> {
        let text = xmltv::decode(bytes)?;
        let guide = xmltv::parse(&text, now, xmltv::Limits::default())?;
        drop(text);
        let held = Arc::new(Held::new(guide, now));
        let summary = held.summary();
        {
            let mut inner = self.lock();
            if inner.generation.get(id) != Some(&generation) {
                // A newer import or a removal started meanwhile: this result is stale.
                return Ok(summary);
            }
            inner.held.insert(id.to_owned(), held.clone());
        }
        self.write_cache(id, generation, &held);
        Ok(summary)
    }

    /// The cache write is best effort: the guide is already held, and a failed write only means it
    /// is downloaded again (or, for a file, chosen again) after a restart.
    fn write_cache(&self, id: &str, generation: u64, held: &Held) {
        let Some(dir) = &self.dir else { return };
        let file = CacheRef {
            version: CACHE_VERSION,
            id,
            fetched_at: held.fetched_at,
            guide: &held.guide,
        };
        let Ok(json) = serde_json::to_vec(&file) else {
            return;
        };
        if self.current(id, generation) {
            let _ = sources::write_atomically(dir, &cache_name(id), &json);
        }
        // Removed while writing: do not leave a cache behind for a guide that no longer exists.
        if !self.current(id, generation) {
            let _ = fs::remove_file(dir.join(cache_name(id)));
        }
    }

    /// The summary of the guide held for `id`, reading its cache from disk if it is not in memory
    /// yet. `None` when there is no usable data.
    pub fn load(&self, id: &str) -> Result<Option<Summary>, IngestError> {
        if !guide_id_ok(id) {
            return Err(bad_input());
        }
        let generation = {
            let inner = self.lock();
            if let Some(held) = inner.held.get(id) {
                return Ok(Some(held.summary()));
            }
            inner.generation.get(id).copied()
        };
        let Some(held) = self.read_cache(id) else {
            return Ok(None);
        };
        let mut inner = self.lock();
        // An import or removal that started while reading wins over the older copy on disk.
        if inner.generation.get(id).copied() != generation || inner.held.contains_key(id) {
            return Ok(inner.held.get(id).map(|h| h.summary()));
        }
        let summary = held.summary();
        inner.held.insert(id.to_owned(), Arc::new(held));
        Ok(Some(summary))
    }

    fn read_cache(&self, id: &str) -> Option<Held> {
        let path = self.dir.as_ref()?.join(cache_name(id));
        if fs::metadata(&path).ok()?.len() > MAX_CACHE_BYTES {
            return None;
        }
        let file: CacheFile = serde_json::from_slice(&fs::read(&path).ok()?).ok()?;
        let limits = xmltv::Limits::default();
        let guide = &file.guide;
        let text_ok = |s: &str, max: usize| !s.is_empty() && s.chars().count() <= max;
        let opt_ok = |s: &Option<String>, max: usize| s.as_deref().is_none_or(|s| text_ok(s, max));
        let ok = file.version == CACHE_VERSION
            && file.id == id
            && guide.channels.len() <= limits.max_channels
            && guide.schedules.len() == guide.channels.len()
            && guide.schedules.iter().map(Vec::len).sum::<usize>() <= limits.max_programmes
            && guide.warnings.len() <= 20
            && guide
                .channels
                .iter()
                .all(|c| text_ok(&c.id, xmltv::MAX_ID_CHARS) && text_ok(&c.name, 256))
            && guide.schedules.iter().all(|s| {
                s.windows(2).all(|w| w[0].stop <= w[1].start)
                    && s.iter().all(|p| {
                        p.start < p.stop
                            && text_ok(&p.title, xmltv::MAX_TITLE_CHARS)
                            && opt_ok(&p.subtitle, xmltv::MAX_TITLE_CHARS)
                            && opt_ok(&p.desc, xmltv::MAX_DESC_CHARS)
                            && opt_ok(&p.category, xmltv::MAX_CATEGORY_CHARS)
                            && opt_ok(&p.episode, xmltv::MAX_EPISODE_CHARS)
                    })
            });
        ok.then(|| Held::new(file.guide, file.fetched_at))
    }

    /// The guide's channels, for matching a playlist channel by hand.
    pub fn channels(&self, id: &str) -> Option<Vec<GuideChannel>> {
        self.lock().held.get(id).map(|h| h.guide.channels.clone())
    }

    /// Programmes overlapping `[from, to)` for every id that matches a channel of its guide.
    pub fn query(&self, queries: &[Query], from: i64, to: i64) -> Result<Vec<Answer>, IngestError> {
        let any_too_large = queries.iter().any(|q| q.ids.len() > MAX_IDS);
        if queries.len() > MAX_QUERIES || any_too_large || from >= to || to - from > MAX_WINDOW_MS {
            return Err(bad_input());
        }
        let held: Vec<Option<Arc<Held>>> = {
            let inner = self.lock();
            queries
                .iter()
                .map(|q| inner.held.get(&q.guide).cloned())
                .collect()
        };
        Ok(queries
            .iter()
            .zip(held)
            .map(|(q, held)| {
                let Some(held) = held else {
                    return Answer {
                        guide: q.guide.clone(),
                        loaded: false,
                        matches: q
                            .ids
                            .iter()
                            .map(|id| Match {
                                id: id.clone(),
                                channel: None,
                            })
                            .collect(),
                        programmes: Vec::new(),
                    };
                };
                let mut listed = std::collections::HashSet::new();
                let mut programmes = Vec::new();
                let matches =
                    q.ids
                        .iter()
                        .map(|id| {
                            // Tier 1: exact normalized id; Tier 2: iptv-org `channel@feed` id by its channel part,
                            // loose_keys, and conservative alias_keys; Tier 3: unambiguous display_name_key in same country.
                            let index = held
                                .index
                                .get(&xmltv::normalize_id(id))
                                .or_else(|| {
                                    xmltv::without_feed(id)
                                        .and_then(|c| held.index.get(&xmltv::normalize_id(c)))
                                })
                                .or_else(|| {
                                    xmltv::loose_keys(id).iter().find_map(|k| held.loose.get(k))
                                })
                                .or_else(|| {
                                    xmltv::alias_keys(id).iter().find_map(|k| held.loose.get(k))
                                })
                                .or_else(|| {
                                    xmltv::loose_keys(id)
                                        .into_iter()
                                        .chain(xmltv::alias_keys(id))
                                        .find_map(|k| held.unique_names.get(&k))
                                })
                                .copied();
                            if let Some(i) = index.filter(|i| listed.insert(*i)) {
                                let schedule = &held.guide.schedules[i];
                                // Sorted and non-overlapping, so stops are sorted too.
                                let first = schedule.partition_point(|p| p.stop <= from);
                                let channel = &held.guide.channels[i].id;
                                programmes.extend(
                                    schedule[first..].iter().take_while(|p| p.start < to).map(
                                        |p| Listed {
                                            channel: channel.clone(),
                                            programme: p.clone(),
                                        },
                                    ),
                                );
                            }
                            Match {
                                id: id.clone(),
                                channel: index.map(|i| held.guide.channels[i].id.clone()),
                            }
                        })
                        .collect();
                Answer {
                    guide: q.guide.clone(),
                    loaded: true,
                    matches,
                    programmes,
                }
            })
            .collect())
    }

    /// Forgets a guide: in-flight imports are dropped and its cache is deleted.
    pub fn remove(&self, id: &str) -> Result<(), IngestError> {
        self.begin(id)?;
        self.lock().held.remove(id);
        if let Some(dir) = &self.dir {
            let _ = fs::remove_file(dir.join(cache_name(id)));
            let _ = fs::remove_file(dir.join(sources::temp_name(&cache_name(id))));
        }
        Ok(())
    }

    /// Deletes caches (and leftover temporary files) of guides that are not saved: ones abandoned in
    /// Add Source, or removed while the app could not save. Only called with the full saved list.
    pub fn prune(&self, keep: &[&str]) {
        let Some(dir) = &self.dir else { return };
        let Ok(entries) = fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let name = entry.file_name();
            let Some(name) = name.to_str() else { continue };
            let id = name.strip_prefix("guide-").and_then(|rest| {
                rest.strip_suffix(".json")
                    .or_else(|| rest.strip_suffix(".json.tmp"))
            });
            if let Some(id) = id {
                if guide_id_ok(id) && (name.ends_with(".tmp") || !keep.contains(&id)) {
                    let _ = fs::remove_file(entry.path());
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_774_785_600_000; // 2026-03-29 12:00 UTC
    const HOUR: i64 = 3_600_000;

    struct TempDir(PathBuf);
    impl TempDir {
        fn new(tag: &str) -> Self {
            let mut bytes = [0u8; 8];
            getrandom::fill(&mut bytes).unwrap();
            let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
            let path = std::env::temp_dir().join(format!("kinora-guides-{tag}-{hex}"));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn xml(title: &str) -> Vec<u8> {
        format!(
            r#"<tv><channel id="One.uk"><display-name>One</display-name></channel><channel id="two.uk"/>
               <programme start="20260329110000" stop="20260329120000" channel="One.uk"><title>Earlier</title></programme>
               <programme start="20260329120000" stop="20260329130000" channel="One.uk"><title>{title}</title><desc>Text</desc></programme>
               <programme start="20260330120000" stop="20260330130000" channel="One.uk"><title>Tomorrow</title></programme>
               <programme start="20260329120000" stop="20260329140000" channel="two.uk"><title>Two</title></programme></tv>"#
        )
        .into_bytes()
    }

    fn ask(store: &GuideStore, ids: &[&str], from: i64, to: i64) -> Answer {
        let q = Query {
            guide: "gd-a".into(),
            ids: ids.iter().map(|s| (*s).into()).collect(),
        };
        store.query(&[q], from, to).unwrap().remove(0)
    }

    #[test]
    fn imports_queries_by_window_and_matches_ids_case_insensitively() {
        let store = GuideStore::new(None);
        let s = store.import("gd-a", xml("Now"), NOW).unwrap();
        assert_eq!((s.channels, s.programmes), (2, 4));
        assert_eq!(s.first, Some(NOW - HOUR));
        assert_eq!(s.last, Some(NOW + 25 * HOUR));
        let a = ask(
            &store,
            &["one.UK", " ONE.uk ", "missing.uk", "two.uk"],
            NOW - 30 * 60_000,
            NOW + 6 * HOUR,
        );
        assert!(a.loaded);
        let chans: Vec<_> = a.matches.iter().map(|m| m.channel.as_deref()).collect();
        assert_eq!(
            chans,
            [Some("One.uk"), Some("One.uk"), None, Some("two.uk")]
        );
        let titles: Vec<_> = a
            .programmes
            .iter()
            .map(|p| p.programme.title.as_str())
            .collect();
        assert_eq!(
            titles,
            ["Earlier", "Now", "Two"],
            "overlapping the window, each channel once"
        );
        let json = serde_json::to_value(&a.programmes[1]).unwrap();
        assert_eq!(json["channel"], "One.uk");
        assert_eq!(json["stopEstimated"], false);
        assert!(store.query(&[], NOW, NOW).is_err(), "empty window");
        assert!(
            store.query(&[], NOW, NOW + 3 * 24 * HOUR).is_err(),
            "window too long"
        );
    }

    #[test]
    fn differently_spelled_ids_match_only_channels_with_listings() {
        let store = GuideStore::new(None);
        store
            .import(
                "gd-a",
                br#"<tv><channel id="Two.HD.uk"/><channel id="Empty.uk"/>
                    <programme start="20260329120000" stop="20260329130000" channel="Two.HD.uk"><title>T</title></programme></tv>"#
                    .to_vec(),
                NOW,
            )
            .unwrap();
        let a = ask(
            &store,
            &["Two.uk@SD", "Two.us", "Empty.uk@SD", "Em.pty.uk"],
            NOW - HOUR,
            NOW + HOUR,
        );
        let hit: Vec<_> = a.matches.iter().map(|m| m.channel.as_deref()).collect();
        assert_eq!(hit, [Some("Two.HD.uk"), None, Some("Empty.uk"), None]);
        assert_eq!(a.programmes.len(), 1);
    }

    #[test]
    fn iptv_org_feed_ids_fall_back_to_the_channel_id_but_exact_ids_win() {
        // iptv-org playlists write `<channel>@<feed>`; guides usually list only `<channel>`.
        let store = GuideStore::new(None);
        let guide = br#"<tv><channel id="BBCNews.uk"/><channel id="ITV2.uk"/><channel id="ITV2.uk@HD"/>
            <programme start="20260329120000" stop="20260329130000" channel="BBCNews.uk"><title>News</title></programme>
            <programme start="20260329120000" stop="20260329130000" channel="ITV2.uk"><title>Plain</title></programme>
            <programme start="20260329120000" stop="20260329130000" channel="ITV2.uk@HD"><title>Feed</title></programme></tv>"#;
        store.import("gd-a", guide.to_vec(), NOW).unwrap();
        let a = ask(
            &store,
            &[
                "BBCNews.uk@UKHD",
                "bbcnews.UK@sd",
                "ITV2.uk@HD",
                "ITV2.uk@SD",
                "@UKHD",
                "Other.uk@SD",
                "BBCNews.uk@",
            ],
            NOW,
            NOW + HOUR,
        );
        let chans: Vec<_> = a.matches.iter().map(|m| m.channel.as_deref()).collect();
        assert_eq!(
            chans,
            [
                Some("BBCNews.uk"),
                Some("BBCNews.uk"),
                Some("ITV2.uk@HD"),
                Some("ITV2.uk"),
                None,
                None,
                Some("BBCNews.uk")
            ]
        );
        let titles: Vec<_> = a
            .programmes
            .iter()
            .map(|p| p.programme.title.as_str())
            .collect();
        assert_eq!(
            titles,
            ["News", "Feed", "Plain"],
            "each guide channel listed once"
        );
    }

    #[test]
    fn a_guide_survives_a_restart_through_its_cache() {
        let tmp = TempDir::new("cache");
        GuideStore::new(Some(tmp.0.clone()))
            .import("gd-a", xml("Now"), NOW)
            .unwrap();
        let text = fs::read_to_string(tmp.0.join("guide-gd-a.json")).unwrap();
        assert!(!text.contains("http"), "no addresses in the cache");
        let restarted = GuideStore::new(Some(tmp.0.clone()));
        assert!(
            !ask(&restarted, &["one.uk"], NOW, NOW + HOUR).loaded,
            "not read until asked for"
        );
        let s = restarted.load("gd-a").unwrap().unwrap();
        assert_eq!(s.programmes, 4);
        assert_eq!(s.fetched_at, NOW);
        assert_eq!(
            ask(&restarted, &["one.uk"], NOW, NOW + HOUR).programmes[0]
                .programme
                .title,
            "Now"
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = fs::metadata(tmp.0.join("guide-gd-a.json"))
                .unwrap()
                .permissions()
                .mode()
                & 0o777;
            assert_eq!(mode, 0o600);
        }
    }

    #[test]
    fn a_failed_refresh_keeps_the_last_good_guide() {
        let tmp = TempDir::new("keep");
        let store = GuideStore::new(Some(tmp.0.clone()));
        store.import("gd-a", xml("Good"), NOW).unwrap();
        let before = fs::read(tmp.0.join("guide-gd-a.json")).unwrap();
        assert!(store
            .import("gd-a", b"<html>Sign in</html>".to_vec(), NOW)
            .is_err());
        assert!(store
            .import("gd-a", b"<tv><programme".to_vec(), NOW)
            .is_err());
        assert_eq!(
            ask(&store, &["one.uk"], NOW, NOW + HOUR).programmes[0]
                .programme
                .title,
            "Good"
        );
        assert_eq!(
            fs::read(tmp.0.join("guide-gd-a.json")).unwrap(),
            before,
            "cache untouched"
        );
    }

    #[test]
    fn stale_results_never_replace_newer_ones() {
        let store = GuideStore::new(None);
        let older = store.begin("gd-a").unwrap();
        // A newer refresh starts later but finishes first.
        store.import("gd-a", xml("Newer"), NOW).unwrap();
        // The older one completes afterwards: its result is returned but not kept.
        store.finish("gd-a", older, xml("Older"), NOW).unwrap();
        assert_eq!(
            ask(&store, &["one.uk"], NOW, NOW + HOUR).programmes[0]
                .programme
                .title,
            "Newer"
        );
    }

    #[test]
    fn loading_a_cache_never_overwrites_a_newer_import() {
        let tmp = TempDir::new("race");
        GuideStore::new(Some(tmp.0.clone()))
            .import("gd-a", xml("On disk"), NOW)
            .unwrap();
        let store = GuideStore::new(Some(tmp.0.clone()));
        store.import("gd-a", xml("Fresh"), NOW).unwrap();
        store.load("gd-a").unwrap();
        assert_eq!(
            ask(&store, &["one.uk"], NOW, NOW + HOUR).programmes[0]
                .programme
                .title,
            "Fresh"
        );
    }

    #[test]
    fn removal_drops_data_and_cache() {
        let tmp = TempDir::new("remove");
        let store = GuideStore::new(Some(tmp.0.clone()));
        store.import("gd-a", xml("Now"), NOW).unwrap();
        store.remove("gd-a").unwrap();
        assert!(!tmp.0.join("guide-gd-a.json").exists());
        assert!(!ask(&store, &["one.uk"], NOW, NOW + HOUR).loaded);
        assert_eq!(store.load("gd-a").unwrap(), None);
        assert!(store.channels("gd-a").is_none());
    }

    #[test]
    fn unusable_caches_are_ignored() {
        let tmp = TempDir::new("corrupt");
        let store = GuideStore::new(Some(tmp.0.clone()));
        store.import("gd-a", xml("Now"), NOW).unwrap();
        let good = fs::read_to_string(tmp.0.join("guide-gd-a.json")).unwrap();
        for bad in [
            "{ not json".to_owned(),
            good.replace("\"version\":1", "\"version\":2"),
            good.replace("\"id\":\"gd-a\"", "\"id\":\"gd-b\""),
            good.replace("\"title\":\"Now\"", "\"title\":\"\""),
            good.replace("\"fetchedAt\"", "\"extra\":1,\"fetchedAt\""),
        ] {
            fs::write(tmp.0.join("guide-gd-a.json"), bad).unwrap();
            assert_eq!(
                GuideStore::new(Some(tmp.0.clone())).load("gd-a").unwrap(),
                None
            );
        }
    }

    #[test]
    fn ids_must_be_guide_ids_so_file_names_stay_inside_the_folder() {
        let tmp = TempDir::new("ids");
        let store = GuideStore::new(Some(tmp.0.clone()));
        for id in ["../escape", "gd-../../etc", "gd-A", "pl-abc", "", "gd-"] {
            assert!(store.import(id, xml("x"), NOW).is_err(), "{id}");
            assert!(store.load(id).is_err(), "{id}");
            assert!(store.remove(id).is_err(), "{id}");
        }
        assert_eq!(fs::read_dir(&tmp.0).unwrap().count(), 0);
    }

    #[test]
    fn prune_keeps_only_saved_guides() {
        let tmp = TempDir::new("prune");
        let store = GuideStore::new(Some(tmp.0.clone()));
        store.import("gd-keep", xml("x"), NOW).unwrap();
        store.import("gd-gone", xml("x"), NOW).unwrap();
        fs::write(tmp.0.join("guide-gd-keep.json.tmp"), b"half").unwrap();
        fs::write(tmp.0.join("sources.json"), b"{}").unwrap();
        store.prune(&["gd-keep"]);
        let mut left: Vec<_> = fs::read_dir(&tmp.0)
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        left.sort();
        assert_eq!(left, ["guide-gd-keep.json", "sources.json"]);
    }

    #[test]
    fn conservative_alias_and_unambiguous_display_name_matching() {
        let store = GuideStore::new(None);
        let guide = br#"<tv>
            <channel id="QVC.uk"><display-name>QVC</display-name></channel>
            <channel id="BBCR1.uk"><display-name>BBC Radio 1</display-name></channel>
            <channel id="BBCOneLon.uk"><display-name>BBC One London</display-name></channel>
            <channel id="dup1.uk"><display-name>Shared Name</display-name></channel>
            <channel id="dup2.uk"><display-name>Shared Name</display-name></channel>
            <programme start="20260329120000" stop="20260329130000" channel="QVC.uk"><title>Shopping</title></programme>
            <programme start="20260329120000" stop="20260329130000" channel="BBCR1.uk"><title>Radio 1</title></programme>
            <programme start="20260329120000" stop="20260329130000" channel="BBCOneLon.uk"><title>News</title></programme>
            <programme start="20260329120000" stop="20260329130000" channel="dup1.uk"><title>D1</title></programme>
            <programme start="20260329120000" stop="20260329130000" channel="dup2.uk"><title>D2</title></programme>
        </tv>"#;
        store.import("gd-a", guide.to_vec(), NOW).unwrap();
        let a = ask(
            &store,
            &["QVCUK.uk", "BBCRadio1.uk", "BBCOne.uk", "SharedName.uk"],
            NOW,
            NOW + HOUR,
        );
        let chans: Vec<_> = a.matches.iter().map(|m| m.channel.as_deref()).collect();
        assert_eq!(
            chans,
            [Some("QVC.uk"), Some("BBCR1.uk"), Some("BBCOneLon.uk"), None]
        );
    }

    #[test]
    fn guide_matching_rate_measured_improvement_without_false_matches() {
        let store = GuideStore::new(None);
        let guide = br#"<tv>
            <channel id="bbcone.uk"><display-name>BBC One</display-name></channel>
            <channel id="bbctwo.uk"><display-name>BBC Two</display-name></channel>
            <channel id="bbcthree.uk"><display-name>BBC Three</display-name></channel>
            <channel id="itv1.uk"><display-name>ITV 1</display-name></channel>
            <channel id="channel4.uk"><display-name>Channel 4</display-name></channel>
            <channel id="channel5.uk"><display-name>Channel 5</display-name></channel>
            <channel id="skyarts.uk"><display-name>Sky Arts</display-name></channel>
            <channel id="dup1.uk"><display-name>Duplicate Service</display-name></channel>
            <channel id="dup2.uk"><display-name>Duplicate Service</display-name></channel>
            <programme start="20260329120000" stop="20260329130000" channel="bbcone.uk"><title>P1</title></programme>
            <programme start="20260329120000" stop="20260329130000" channel="bbctwo.uk"><title>P2</title></programme>
            <programme start="20260329120000" stop="20260329130000" channel="bbcthree.uk"><title>P3</title></programme>
            <programme start="20260329120000" stop="20260329130000" channel="itv1.uk"><title>P4</title></programme>
            <programme start="20260329120000" stop="20260329130000" channel="channel4.uk"><title>P5</title></programme>
            <programme start="20260329120000" stop="20260329130000" channel="channel5.uk"><title>P6</title></programme>
            <programme start="20260329120000" stop="20260329130000" channel="skyarts.uk"><title>P7</title></programme>
            <programme start="20260329120000" stop="20260329130000" channel="dup1.uk"><title>D1</title></programme>
            <programme start="20260329120000" stop="20260329130000" channel="dup2.uk"><title>D2</title></programme>
        </tv>"#;
        store.import("gd-a", guide.to_vec(), NOW).unwrap();

        // 8 channel variants encountered across real-world M3U playlists:
        // 1. Exact id: bbcone.uk
        // 2. Case variance: BBCTWO.UK
        // 3. Trailing quality tag: bbcthreeHD.uk
        // 4. Feed suffix: itv1.uk@london
        // 5. Punctuation and brackets: [UK].Channel.4.uk
        // 6. Name alias: Channel5UK.uk
        // 7. Unambiguous display name: SkyArts.uk
        // 8. Ambiguous duplicate name: DuplicateService.uk (must not match to prevent false positives)
        let query_ids = &[
            "bbcone.uk",
            "BBCTWO.UK",
            "bbcthreeHD.uk",
            "itv1.uk@london",
            "[UK].Channel.4.uk",
            "Channel5UK.uk",
            "SkyArts.uk",
            "DuplicateService.uk",
        ];

        let result = ask(&store, query_ids, NOW, NOW + HOUR);
        let matches: Vec<Option<&str>> = result
            .matches
            .iter()
            .map(|m| m.channel.as_deref())
            .collect();

        // Under naive exact-only matching (before Tier 2 and Tier 3), only 1 of 8 matches:
        let exact_matches_count = query_ids.iter().filter(|&&id| id == "bbcone.uk").count();
        assert_eq!(exact_matches_count, 1);

        // Under multi-tier guarded matching, 7 of 7 distinct channels match correctly,
        // and the ambiguous duplicate is refused (zero false matches):
        assert_eq!(
            matches,
            vec![
                Some("bbcone.uk"),
                Some("bbctwo.uk"),
                Some("bbcthree.uk"),
                Some("itv1.uk"),
                Some("channel4.uk"),
                Some("channel5.uk"),
                Some("skyarts.uk"),
                None, // Ambiguous duplicate correctly rejected
            ]
        );

        let successful_matches = matches.iter().filter(|m| m.is_some()).count();
        assert_eq!(successful_matches, 7);
    }
}
