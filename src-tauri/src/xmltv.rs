//! Pure XMLTV parser: guide bytes in, channels and per-channel schedules out. No I/O.
//!
//! Safety: quick-xml never loads a DTD, external entity or any other resource, and expands only the
//! five predefined entities and character references. A `<!DOCTYPE>` with an internal subset (where
//! entities would be declared) is refused outright, and so is any reference to an undeclared entity,
//! so entity-expansion attacks have nothing to expand. Input size, nesting depth, channel and
//! programme counts and every kept text field are capped. Programme `<icon src="...">` URLs
//! are validated and kept for guarded client fetching; channels, channel icons and other URLs
//! are ignored, never stored or fetched.
//!
//! Times: `YYYYMMDDhhmmss` (or a leading part of it down to `YYYYMMDD`) with an optional offset
//! (`+0100`, `-05:30`, `Z`). The XMLTV DTD says a time without an offset is UTC, so it is read as UTC,
//! not as local time. Everything is converted to UTC milliseconds; the page shows local time.

use std::collections::HashMap;
use std::io::Read;

use quick_xml::escape::resolve_predefined_entity;
use quick_xml::events::{BytesStart, Event};
use quick_xml::{Reader, XmlVersion};
use serde::{Deserialize, Serialize};

use crate::ingest::{ErrorCode, IngestError};

/// Largest guide text after decompression.
pub const MAX_XML_BYTES: usize = 128 * 1024 * 1024;
const HOUR: i64 = 3_600_000;
const DAY: i64 = 24 * HOUR;
/// Programmes are kept from 12 hours ago to 8 days ahead: the guide shows today and the next 6 days.
pub const KEEP_BEFORE_MS: i64 = 12 * HOUR;
pub const KEEP_AFTER_MS: i64 = 8 * DAY;
/// A missing stop time is taken from the next programme only if that starts within a day.
const MAX_INFERRED_MS: i64 = DAY;
/// Longer than this is treated as a broken time rather than a programme.
const MAX_DURATION_MS: i64 = 3 * DAY;

// Longest kept text, in characters. Longer text is cut and marked with an ellipsis.
pub const MAX_ID_CHARS: usize = 256;
const MAX_NAME_CHARS: usize = 200;
pub const MAX_TITLE_CHARS: usize = 300;
pub const MAX_DESC_CHARS: usize = 1000;
pub const MAX_CATEGORY_CHARS: usize = 80;
pub const MAX_EPISODE_CHARS: usize = 40;

#[derive(Debug, Clone, Copy)]
pub struct Limits {
    pub max_channels: usize,
    /// Programmes kept in the window, across all channels.
    pub max_programmes: usize,
    pub max_depth: usize,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            max_channels: 20_000,
            max_programmes: 150_000,
            max_depth: 16,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GuideChannel {
    /// As written in the guide; matching uses `normalize_id` of it.
    pub id: String,
    /// The first (most canonical) display name, or the id when there is none.
    pub name: String,
}

/// Mirrored by `GuideProgramme` in `src/lib/native.ts` (with the channel added).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Programme {
    /// UTC milliseconds.
    pub start: i64,
    pub stop: i64,
    /// The guide gave no stop time; it is the next programme's start (XMLTV's own convention).
    pub stop_estimated: bool,
    pub title: String,
    pub subtitle: Option<String>,
    pub desc: Option<String>,
    pub category: Option<String>,
    pub episode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Guide {
    pub channels: Vec<GuideChannel>,
    /// `schedules[i]` belongs to `channels[i]`: sorted by start, no overlaps, within the window.
    pub schedules: Vec<Vec<Programme>>,
    /// Programmes dropped for missing or invalid data.
    pub skipped: u32,
    /// Repeated programmes (same channel, start and title) and repeated channel ids.
    pub duplicates: u32,
    /// Plain-language notes with counts only, never guide content or addresses.
    pub warnings: Vec<String>,
}

/// The channel-id comparison Kinora makes: surrounding whitespace removed and ASCII letters
/// lower-cased, so `BBC1.uk` matches ` bbc1.UK`. Nothing else is changed (no punctuation stripping),
/// and display names are never used for matching. The fallbacks are `without_feed`, then `loose_keys`.
pub fn normalize_id(id: &str) -> String {
    id.trim().to_ascii_lowercase()
}

/// iptv-org playlists write `<channel>@<feed>` (`BBCNews.uk@UKHD`) where guides usually list only the
/// channel (`BBCNews.uk`). Used only when the full id matches nothing: the channel part, if any.
pub fn without_feed(id: &str) -> Option<&str> {
    id.trim()
        .split_once('@')
        .map(|(channel, _)| channel)
        .filter(|c| !c.is_empty())
}

/// Last-resort id comparison for guides that spell ids differently from the playlist: `BBC.Two.HD.uk`,
/// `BBCTwo.uk@HD`, `[BBC2].BBC.Two.uk2`. Ignores punctuation, `[..]` tags and a trailing quality, but
/// the country must agree and channels are still compared by id, never by display name. Feed-specific
/// key first (`BBCOne.uk@London` is `bbconelondon.uk`), then the channel on its own.
pub fn loose_keys(id: &str) -> Vec<String> {
    let (channel, feed) = id.trim().split_once('@').unwrap_or((id.trim(), ""));
    let Some((stem, country)) = channel.rsplit_once('.') else {
        return Vec::new();
    };
    let country = country.trim_end_matches(|c: char| c.is_ascii_digit());
    if country.len() != 2 || !country.chars().all(|c| c.is_ascii_alphabetic()) {
        return Vec::new();
    }
    let country = country.to_ascii_lowercase();
    let key = |text: &str| {
        let mut plain = String::new();
        let mut depth = 0u32;
        for c in text.chars() {
            match c {
                '[' => depth += 1,
                ']' => depth = depth.saturating_sub(1),
                c if depth == 0 && c.is_alphanumeric() => plain.push(c),
                _ => {}
            }
        }
        // Case-sensitive, so a name merely ending in those letters keeps them.
        let plain = ["FHD", "UHD", "HD", "SD", "4K"]
            .iter()
            .find_map(|q| plain.strip_suffix(q))
            .filter(|rest| !rest.is_empty())
            .unwrap_or(&plain);
        (!plain.is_empty()).then(|| format!("{}.{country}", plain.to_lowercase()))
    };
    let mut keys = Vec::new();
    if !feed.is_empty() {
        keys.extend(key(&format!("{stem}{feed}")));
    }
    keys.extend(key(stem).filter(|k| !keys.contains(k)));
    keys
}

/// Additional conservative normalized keys for unambiguous country/service suffixes
/// (such as `QVCUK.uk` ↔ `QVC.uk`, `France24English.fr` ↔ `France24.fr`, `BBCOne.uk` ↔ `BBCOneLondon.uk`,
/// or `BBCRadio1.uk` ↔ `BBCR1.uk`). Always requires the 2-letter country code to match.
pub fn alias_keys(id: &str) -> Vec<String> {
    let base = loose_keys(id);
    let mut out = Vec::new();
    let mut push = |s: String| {
        if !base.contains(&s) && !out.contains(&s) {
            out.push(s);
        }
    };
    for k in &base {
        let Some((stem, country)) = k.rsplit_once('.') else {
            continue;
        };
        if let Some(stripped) = stem.strip_suffix(country) {
            if stripped.len() >= 2 {
                push(format!("{stripped}.{country}"));
            }
        }
        for suffix in ["international", "english", "world", "news", "tv", "channel"] {
            if let Some(stripped) = stem.strip_suffix(suffix) {
                if stripped.len() >= 2 {
                    push(format!("{stripped}.{country}"));
                }
            }
        }
        if country == "uk" {
            match stem {
                "bbcone" => {
                    push("bbconelondon.uk".to_owned());
                    push("bbconelon.uk".to_owned());
                }
                "bbconelondon" | "bbconelon" => {
                    push("bbcone.uk".to_owned());
                }
                "bbctwo" => {
                    push("bbctwolondon.uk".to_owned());
                    push("bbctwoengland.uk".to_owned());
                }
                "bbctwolondon" | "bbctwoengland" => {
                    push("bbctwo.uk".to_owned());
                }
                "bbcthree" => {
                    push("bbcthreehd.uk".to_owned());
                }
                "bbcthreehd" => {
                    push("bbcthree.uk".to_owned());
                }
                "bbcfour" => {
                    push("bbcfourhd.uk".to_owned());
                }
                "bbcfourhd" => {
                    push("bbcfour.uk".to_owned());
                }
                "channel5" | "five" => {
                    push("5.uk".to_owned());
                }
                "5" => {
                    push("channel5.uk".to_owned());
                }
                "channel4" | "four" => {
                    push("4.uk".to_owned());
                }
                "4" => {
                    push("channel4.uk".to_owned());
                }
                "itv1" | "itv" => {
                    push("itv1london.uk".to_owned());
                    push("itvlondon.uk".to_owned());
                }
                "itv1london" | "itvlondon" => {
                    push("itv1.uk".to_owned());
                }
                "itv2" => {
                    push("itv2hd.uk".to_owned());
                }
                "itv2hd" => {
                    push("itv2.uk".to_owned());
                }
                "itv3" => {
                    push("itv3hd.uk".to_owned());
                }
                "itv3hd" => {
                    push("itv3.uk".to_owned());
                }
                "itv4" => {
                    push("itv4hd.uk".to_owned());
                }
                "itv4hd" => {
                    push("itv4.uk".to_owned());
                }
                "greatmovies" => {
                    push("sonymovies.uk".to_owned());
                }
                "greatromance" => {
                    push("sonymoviesromance.uk".to_owned());
                }
                "skynews" => {
                    push("skynewshd.uk".to_owned());
                }
                "skynewshd" => {
                    push("skynews.uk".to_owned());
                }
                s if s.starts_with("bbcradio") => {
                    let rest = &s["bbcradio".len()..];
                    if !rest.is_empty() {
                        push(format!("bbcr{rest}.uk"));
                    }
                    let rest_no_fms = rest.trim_end_matches("fm").trim_end_matches("extra");
                    if !rest_no_fms.is_empty() && rest_no_fms != rest {
                        push(format!("bbcr{rest_no_fms}.uk"));
                    }
                    if rest == "1extra" {
                        push("bbcr1x.uk".to_owned());
                    } else if rest == "5live" {
                        push("bbcr5l.uk".to_owned());
                    } else if rest == "5livesportsextra" {
                        push("bbcr5lsx.uk".to_owned());
                    } else if rest == "6music" {
                        push("bbcr6m.uk".to_owned());
                    }
                }
                _ => {}
            }
        }
    }
    out
}

/// Normalizes an XMLTV `<display-name>` paired with the 2-letter country suffix from its `<channel id>`
/// so unambiguous display names in that country can be matched as Tier 3 when ID matching finds nothing.
pub fn display_name_key(name: &str, channel_id: &str) -> Option<String> {
    let (ch, _) = channel_id
        .trim()
        .split_once('@')
        .unwrap_or((channel_id.trim(), ""));
    let (_, raw_country) = ch.rsplit_once('.')?;
    let country = raw_country.trim_end_matches(|c: char| c.is_ascii_digit());
    if country.len() != 2 || !country.chars().all(|c| c.is_ascii_alphabetic()) {
        return None;
    }
    let country = country.to_ascii_lowercase();
    let mut plain = String::new();
    let mut depth = 0u32;
    for c in name.trim().chars() {
        match c {
            '[' | '(' => depth += 1,
            ']' | ')' => depth = depth.saturating_sub(1),
            c if depth == 0 && c.is_ascii_alphanumeric() => plain.push(c),
            _ => {}
        }
    }
    let plain = ["FHD", "UHD", "HD", "SD", "4K"]
        .iter()
        .find_map(|q| plain.strip_suffix(q))
        .filter(|rest| !rest.is_empty())
        .unwrap_or(&plain);
    let low = plain.to_ascii_lowercase();
    if low.len() < 2 {
        return None;
    }
    Some(format!("{low}.{country}"))
}

fn not_guide(message: impl Into<String>) -> IngestError {
    IngestError::new(ErrorCode::NotGuide, message)
}

fn too_large() -> IngestError {
    IngestError::new(
        ErrorCode::TooLarge,
        format!(
            "The guide is larger than {} MB once uncompressed.",
            MAX_XML_BYTES / (1024 * 1024)
        ),
    )
}

/// Turns downloaded or picked bytes into guide text: gzip is decompressed (capped, so a small file
/// cannot expand without limit) and the text must be UTF-8.
pub fn decode(bytes: Vec<u8>) -> Result<String, IngestError> {
    let bytes = if bytes.starts_with(&[0x1f, 0x8b]) {
        let mut out = Vec::new();
        flate2::read::MultiGzDecoder::new(bytes.as_slice())
            .take(MAX_XML_BYTES as u64 + 1)
            .read_to_end(&mut out)
            .map_err(|_| not_guide("The guide is compressed, but it could not be decompressed."))?;
        out
    } else {
        bytes
    };
    if bytes.len() > MAX_XML_BYTES {
        return Err(too_large());
    }
    if bytes.starts_with(&[0xff, 0xfe]) || bytes.starts_with(&[0xfe, 0xff]) {
        return Err(not_guide(
            "The guide uses UTF-16 text. Kinora reads UTF-8 guides only.",
        ));
    }
    let start = if bytes.starts_with(&[0xef, 0xbb, 0xbf]) {
        3
    } else {
        0
    };
    let mut bytes = bytes;
    bytes.drain(..start);
    String::from_utf8(bytes)
        .map_err(|_| not_guide("The guide is not UTF-8 text. Kinora reads UTF-8 guides only."))
}

const fn is_leap(y: i64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

fn days_in_month(y: i64, m: i64) -> i64 {
    match m {
        2 if is_leap(y) => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

/// Days since 1970-01-01 for a proleptic Gregorian date (Howard Hinnant's algorithm).
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// Parses an XMLTV time to UTC milliseconds, or `None` if it is not a real time.
pub fn parse_time(raw: &str) -> Option<i64> {
    let raw = raw.trim();
    let digits = raw.bytes().take_while(u8::is_ascii_digit).count();
    if !matches!(digits, 8 | 10 | 12 | 14) {
        return None;
    }
    let (num, rest) = raw.split_at(digits);
    let field = |from: usize, to: usize| -> Option<i64> {
        match num.get(from..to) {
            Some(s) => s.parse().ok(),
            None => Some(0),
        }
    };
    let (y, mo, d) = (field(0, 4)?, field(4, 6)?, field(6, 8)?);
    let (h, mi, s) = (field(8, 10)?, field(10, 12)?, field(12, 14)?);
    if !(1900..=2200).contains(&y) || !(1..=12).contains(&mo) || d < 1 || d > days_in_month(y, mo) {
        return None;
    }
    if h > 23 || mi > 59 || s > 59 {
        return None;
    }
    let rest = rest.trim();
    let offset_mins = match rest {
        "" | "Z" | "UTC" | "GMT" => 0,
        _ => {
            let (sign, tz) = match rest.as_bytes().first()? {
                b'+' => (1, &rest[1..]),
                b'-' => (-1, &rest[1..]),
                _ => return None,
            };
            let tz = tz.replacen(':', "", 1);
            if tz.len() != 4 || !tz.bytes().all(|b| b.is_ascii_digit()) {
                return None;
            }
            let (oh, om): (i64, i64) = (tz[..2].parse().ok()?, tz[2..].parse().ok()?);
            if oh > 14 || om > 59 {
                return None;
            }
            sign * (oh * 60 + om)
        }
    };
    let secs = days_from_civil(y, mo, d) * 86_400 + h * 3600 + mi * 60 + s - offset_mins * 60;
    Some(secs * 1000)
}

/// Collapses runs of whitespace and cuts to `max` characters (adding an ellipsis when cut).
fn clean(raw: &str, max: usize) -> Option<String> {
    let mut out = String::new();
    let mut chars = 0;
    for word in raw.split_whitespace() {
        if chars > 0 {
            out.push(' ');
            chars += 1;
        }
        for ch in word.chars() {
            if chars >= max {
                out.pop();
                out.push('…');
                return Some(out);
            }
            out.push(ch);
            chars += 1;
        }
    }
    (!out.is_empty()).then_some(out)
}

/// `xmltv_ns` episode numbers are zero-based `season.episode.part`, each optionally `n/total`.
fn episode_from_ns(raw: &str) -> Option<String> {
    let mut parts = raw.split('.').map(|p| {
        p.split('/')
            .next()
            .and_then(|n| n.trim().parse::<u32>().ok())
    });
    let season = parts.next().flatten();
    let episode = parts.next().flatten();
    match (season, episode) {
        (Some(s), Some(e)) => Some(format!("S{} E{}", s + 1, e + 1)),
        (None, Some(e)) => Some(format!("E{}", e + 1)),
        (Some(s), None) => Some(format!("S{}", s + 1)),
        (None, None) => None,
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Field {
    DisplayName,
    Title,
    SubTitle,
    Desc,
    Category,
    Onscreen,
    XmltvNs,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Elem {
    Tv,
    Channel,
    Programme,
    Other,
}

#[derive(Default)]
struct Pending {
    channel: Option<String>,
    start: Option<i64>,
    /// `Some(None)`: a stop attribute was given but is not a valid time.
    stop: Option<Option<i64>>,
    title: Option<String>,
    subtitle: Option<String>,
    desc: Option<String>,
    category: Option<String>,
    onscreen: Option<String>,
    xmltv_ns: Option<String>,
    icon: Option<String>,
}

struct Raw {
    start: i64,
    stop: Option<i64>,
    title: String,
    subtitle: Option<String>,
    desc: Option<String>,
    category: Option<String>,
    episode: Option<String>,
    icon: Option<String>,
}

#[derive(Default)]
struct Counts {
    bad_time: u32,
    no_title: u32,
    no_channel: u32,
    no_stop: u32,
    estimated: u32,
    overlaps: u32,
    repeats: u32,
    repeated_channels: u32,
    undeclared: u32,
    bad_channels: u32,
}

struct Builder {
    limits: Limits,
    now: i64,
    channels: Vec<GuideChannel>,
    raw: Vec<Vec<Raw>>,
    index: HashMap<String, usize>,
    /// Channels declared by `<channel>` (the rest only appear in programmes).
    declared: Vec<bool>,
    kept: usize,
    counts: Counts,
}

impl Builder {
    fn channel_index(
        &mut self,
        id: &str,
        name: Option<String>,
        declare: bool,
    ) -> Result<usize, IngestError> {
        let key = normalize_id(id);
        if let Some(&i) = self.index.get(&key) {
            if declare {
                if self.declared[i] {
                    self.counts.repeated_channels += 1;
                } else {
                    self.declared[i] = true;
                    if let Some(name) = name {
                        self.channels[i].name = name;
                    }
                }
            }
            return Ok(i);
        }
        if self.channels.len() >= self.limits.max_channels {
            return Err(IngestError::new(
                ErrorCode::TooManyEntries,
                format!(
                    "The guide lists more than {} channels.",
                    self.limits.max_channels
                ),
            ));
        }
        let id = id.trim().to_owned();
        self.channels.push(GuideChannel {
            name: name.unwrap_or_else(|| id.clone()),
            id,
        });
        self.raw.push(Vec::new());
        self.declared.push(declare);
        self.index.insert(key, self.channels.len() - 1);
        Ok(self.channels.len() - 1)
    }

    fn programme(&mut self, p: Pending) -> Result<(), IngestError> {
        let Some(channel) = p.channel else {
            self.counts.no_channel += 1;
            return Ok(());
        };
        let stop = match p.stop {
            None => None, // no stop attribute: taken from the next programme later
            Some(Some(s)) => Some(s),
            Some(None) => {
                self.counts.bad_time += 1;
                return Ok(());
            }
        };
        let Some(start) = p.start else {
            self.counts.bad_time += 1;
            return Ok(());
        };
        let Some(title) = p.title else {
            self.counts.no_title += 1;
            return Ok(());
        };
        // Clearly outside the window: drop now rather than hold it.
        if start >= self.now + KEEP_AFTER_MS || stop.is_some_and(|s| s <= self.now - KEEP_BEFORE_MS)
        {
            return Ok(());
        }
        let i = self.channel_index(&channel, None, false)?;
        self.kept += 1;
        if self.kept > self.limits.max_programmes {
            return Err(IngestError::new(
                ErrorCode::TooManyEntries,
                format!(
                    "The guide lists more than {} programmes for the next week.",
                    self.limits.max_programmes
                ),
            ));
        }
        let episode = p
            .onscreen
            .or_else(|| p.xmltv_ns.as_deref().and_then(episode_from_ns));
        self.raw[i].push(Raw {
            start,
            stop,
            title,
            subtitle: p.subtitle,
            desc: p.desc,
            category: p.category,
            episode: episode.and_then(|e| clean(&e, MAX_EPISODE_CHARS)),
            icon: p.icon,
        });
        Ok(())
    }

    fn finish(mut self) -> Guide {
        let (now, counts) = (self.now, &mut self.counts);
        counts.undeclared = self.declared.iter().filter(|d| !**d).count() as u32;
        let schedules = self
            .raw
            .into_iter()
            .map(|mut list| {
                // Broken times go first, so they are never used to fill in another programme's stop.
                list.retain(|p| {
                    let ok = p
                        .stop
                        .is_none_or(|s| s > p.start && s - p.start <= MAX_DURATION_MS);
                    counts.bad_time += u32::from(!ok);
                    ok
                });
                list.sort_by_key(|p| (p.start, p.stop.unwrap_or(i64::MAX)));
                let mut out: Vec<Programme> = Vec::new();
                let mut last: Option<(i64, i64)> = None;
                for i in 0..list.len() {
                    let p = &list[i];
                    let (stop, estimated) = match p.stop {
                        Some(s) => (s, false),
                        None => match list[i + 1..].iter().find(|n| n.start > p.start) {
                            Some(n) if n.start - p.start <= MAX_INFERRED_MS => (n.start, true),
                            _ => {
                                counts.no_stop += 1;
                                continue;
                            }
                        },
                    };
                    if stop <= p.start || stop - p.start > MAX_DURATION_MS {
                        counts.bad_time += 1;
                        continue;
                    }
                    if let Some((last_start, last_stop)) = last {
                        let prev_title = out
                            .last()
                            .filter(|o| o.start == last_start)
                            .map(|o| &o.title);
                        if p.start == last_start
                            && (prev_title.is_none() || prev_title == Some(&p.title))
                        {
                            counts.repeats += 1;
                            continue;
                        }
                        if p.start < last_stop {
                            counts.overlaps += 1;
                            continue;
                        }
                    }
                    last = Some((p.start, stop));
                    if stop <= now - KEEP_BEFORE_MS || p.start >= now + KEEP_AFTER_MS {
                        continue;
                    }
                    counts.estimated += u32::from(estimated);
                    out.push(Programme {
                        start: p.start,
                        stop,
                        stop_estimated: estimated,
                        title: p.title.clone(),
                        subtitle: p.subtitle.clone(),
                        desc: p.desc.clone(),
                        category: p.category.clone(),
                        episode: p.episode.clone(),
                        icon: p.icon.clone(),
                    });
                }
                out
            })
            .collect();
        let c = &self.counts;
        let mut warnings = Vec::new();
        let mut note = |n: u32, one: &str, many: &str| {
            if n > 0 {
                warnings.push(if n == 1 {
                    one.to_owned()
                } else {
                    many.replace('#', &n.to_string())
                });
            }
        };
        note(
            c.bad_time,
            "1 programme had a missing or invalid time and was skipped.",
            "# programmes had missing or invalid times and were skipped.",
        );
        note(
            c.no_title,
            "1 programme had no title and was skipped.",
            "# programmes had no title and were skipped.",
        );
        note(
            c.no_channel,
            "1 programme named no channel and was skipped.",
            "# programmes named no channel and were skipped.",
        );
        note(c.no_stop, "1 programme had no end time and nothing after it on its channel, so it was skipped.", "# programmes had no end time and nothing after them on their channel, so they were skipped.");
        note(
            c.estimated,
            "1 programme had no end time; the next programme’s start is used.",
            "# programmes had no end time; the next programme’s start is used.",
        );
        note(
            c.overlaps,
            "1 programme overlapped an earlier one on the same channel and was skipped.",
            "# programmes overlapped an earlier one on the same channel and were skipped.",
        );
        note(
            c.repeated_channels,
            "1 channel id appeared more than once; the first entry was kept.",
            "# channel ids appeared more than once; the first entry of each was kept.",
        );
        note(
            c.bad_channels,
            "1 channel entry had no usable id and was skipped.",
            "# channel entries had no usable id and were skipped.",
        );
        note(
            c.undeclared,
            "1 channel has programmes but no channel entry; its id is used as its name.",
            "# channels have programmes but no channel entry; their ids are used as names.",
        );
        Guide {
            channels: self.channels,
            schedules,
            skipped: c.bad_time + c.no_title + c.no_channel + c.no_stop + c.overlaps,
            duplicates: c.repeats + c.repeated_channels,
            warnings,
        }
    }
}

fn attr(e: &BytesStart<'_>, name: &str) -> Result<Option<String>, IngestError> {
    let bad = || not_guide("The guide contains an attribute Kinora cannot read.");
    match e.try_get_attribute(name).map_err(|_| bad())? {
        Some(a) => Ok(Some(
            a.normalized_value(XmlVersion::Implicit1_0)
                .map_err(|_| bad())?
                .into_owned(),
        )),
        None => Ok(None),
    }
}

fn valid_id(raw: Option<String>) -> Option<String> {
    raw.map(|s| s.trim().to_owned()).filter(|s| {
        !s.is_empty() && s.chars().count() <= MAX_ID_CHARS && !s.chars().any(char::is_control)
    })
}

pub const MAX_ICON_URL_CHARS: usize = 2048;

fn clean_icon_url(raw: Option<String>) -> Option<String> {
    let raw = raw?;
    if raw.chars().any(char::is_control) {
        return None;
    }
    let s = raw.trim();
    if s.is_empty() || s.len() > MAX_ICON_URL_CHARS {
        return None;
    }
    let url = reqwest::Url::parse(s).ok()?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return None;
    }
    if !url.username().is_empty() || url.password().is_some() {
        return None;
    }
    Some(s.to_owned())
}

/// Parses guide text. `now` (UTC ms) sets the window of programmes kept.
pub fn parse(text: &str, now: i64, limits: Limits) -> Result<Guide, IngestError> {
    let mut reader = Reader::from_str(text);
    let malformed = |pos: u64| {
        not_guide(format!(
            "The guide is not well-formed XML (near byte {pos})."
        ))
    };
    let mut b = Builder {
        limits,
        now,
        channels: Vec::new(),
        raw: Vec::new(),
        index: HashMap::new(),
        declared: Vec::new(),
        kept: 0,
        counts: Counts::default(),
    };
    let mut stack: Vec<Elem> = Vec::new();
    let mut seen_root = false;
    let mut channel: Option<(Option<String>, Option<String>)> = None; // (id, display name)
    let mut programme: Option<Pending> = None;
    // The field being read, the stack depth of its element, and its text so far.
    let mut field: Option<(Field, usize)> = None;
    let mut text_buf = String::new();

    loop {
        let event = reader
            .read_event()
            .map_err(|_| malformed(reader.error_position()))?;
        let (start, empty) = match &event {
            Event::Start(e) => (Some(e), false),
            Event::Empty(e) => (Some(e), true),
            _ => (None, false),
        };
        if let Some(e) = start {
            let name = e.name().0.to_owned();
            if stack.len() >= limits.max_depth {
                return Err(not_guide(
                    "The guide is nested too deeply to be an XMLTV guide.",
                ));
            }
            let parent = stack.last().copied();
            let elem = match (parent, name.as_str()) {
                (None, "tv") if !seen_root => {
                    seen_root = true;
                    Elem::Tv
                }
                (None, n) if n.eq_ignore_ascii_case("html") => {
                    return Err(not_guide(
                        "The address returned a web page, not an XMLTV guide.",
                    ))
                }
                (None, _) => {
                    return Err(not_guide(
                        "This is XML, but not an XMLTV guide (it does not start with <tv>).",
                    ))
                }
                (Some(Elem::Tv), "channel") => {
                    channel = Some((attr(e, "id")?, None));
                    Elem::Channel
                }
                (Some(Elem::Tv), "programme") => {
                    let start = attr(e, "start")?.and_then(|t| parse_time(&t));
                    let stop = attr(e, "stop")?.map(|t| parse_time(&t));
                    programme = Some(Pending {
                        channel: valid_id(attr(e, "channel")?),
                        start,
                        stop,
                        ..Pending::default()
                    });
                    Elem::Programme
                }
                (Some(Elem::Channel), "display-name") => {
                    if field.is_none() && channel.as_ref().is_some_and(|c| c.1.is_none()) {
                        field = Some((Field::DisplayName, stack.len() + 1));
                    }
                    Elem::Other
                }
                (Some(Elem::Programme), n) => {
                    let wanted = match (n, programme.as_ref()) {
                        ("title", Some(p)) if p.title.is_none() => Some(Field::Title),
                        ("sub-title", Some(p)) if p.subtitle.is_none() => Some(Field::SubTitle),
                        ("desc", Some(p)) if p.desc.is_none() => Some(Field::Desc),
                        ("category", Some(p)) if p.category.is_none() => Some(Field::Category),
                        ("episode-num", Some(p)) => match attr(e, "system")?.as_deref() {
                            Some("onscreen") if p.onscreen.is_none() => Some(Field::Onscreen),
                            Some("xmltv_ns") if p.xmltv_ns.is_none() => Some(Field::XmltvNs),
                            _ => None,
                        },
                        _ => None,
                    };
                    if field.is_none() {
                        field = wanted.map(|f| (f, stack.len() + 1));
                    }
                    if n == "icon" {
                        if let Some(p) = programme.as_mut() {
                            if p.icon.is_none() {
                                p.icon = clean_icon_url(attr(e, "src")?);
                            }
                        }
                    }
                    Elem::Other
                }
                _ => Elem::Other,
            };
            stack.push(elem);
            if field.is_some_and(|(_, d)| d == stack.len()) {
                text_buf.clear();
            }
            if !empty {
                continue;
            }
        }
        match event {
            Event::Start(_) => {}
            Event::Empty(_) | Event::End(_) => {
                let depth = stack.len();
                let Some(elem) = stack.pop() else {
                    return Err(malformed(reader.buffer_position()));
                };
                if let Some((f, d)) = field {
                    if d == depth {
                        field = None;
                        let max = match f {
                            Field::DisplayName => MAX_NAME_CHARS,
                            Field::Title | Field::SubTitle => MAX_TITLE_CHARS,
                            Field::Desc => MAX_DESC_CHARS,
                            Field::Category => MAX_CATEGORY_CHARS,
                            Field::Onscreen | Field::XmltvNs => MAX_EPISODE_CHARS,
                        };
                        let value = clean(&text_buf, max);
                        text_buf.clear();
                        if let (Field::DisplayName, Some(c)) = (f, channel.as_mut()) {
                            c.1 = value;
                        } else if let Some(p) = programme.as_mut() {
                            match f {
                                Field::Title => p.title = value,
                                Field::SubTitle => p.subtitle = value,
                                Field::Desc => p.desc = value,
                                Field::Category => p.category = value,
                                Field::Onscreen => p.onscreen = value,
                                Field::XmltvNs => p.xmltv_ns = value,
                                Field::DisplayName => {}
                            }
                        }
                    }
                }
                match elem {
                    Elem::Channel => {
                        if let Some((id, name)) = channel.take() {
                            match valid_id(id) {
                                Some(id) => {
                                    b.channel_index(&id, name, true)?;
                                }
                                None => b.counts.bad_channels += 1,
                            }
                        }
                    }
                    Elem::Programme => {
                        if let Some(p) = programme.take() {
                            b.programme(p)?;
                        }
                    }
                    Elem::Tv | Elem::Other => {}
                }
            }
            Event::Text(t) => {
                if field.is_some() {
                    push_capped(&mut text_buf, &t.xml10_content());
                }
            }
            Event::CData(t) => {
                if field.is_some() {
                    push_capped(&mut text_buf, &t.xml10_content());
                }
            }
            Event::GeneralRef(r) => {
                let resolved = match r.resolve_char_ref() {
                    Ok(Some(ch)) => ch.to_string(),
                    Ok(None) => match resolve_predefined_entity(&r) {
                        Some(s) => s.to_owned(),
                        None => {
                            return Err(not_guide(
                                "The guide refers to an entity that is not defined, so it is not well-formed XML.",
                            ))
                        }
                    },
                    Err(_) => return Err(malformed(reader.buffer_position())),
                };
                if field.is_some() {
                    push_capped(&mut text_buf, &resolved);
                }
            }
            Event::Decl(d) => {
                if let Some(enc) = d.encoding() {
                    let enc = enc.map_err(|_| malformed(reader.buffer_position()))?;
                    if !["utf-8", "utf8", "us-ascii", "ascii"]
                        .contains(&enc.to_ascii_lowercase().as_str())
                    {
                        return Err(not_guide("The guide uses a text encoding other than UTF-8, which Kinora does not read."));
                    }
                }
            }
            Event::DocType(t) => {
                // An internal subset is where entities are declared; XMLTV guides never need one.
                if t.contains('[') {
                    return Err(not_guide(
                        "The guide declares its own XML entities, which Kinora does not allow.",
                    ));
                }
            }
            Event::Eof => break,
            Event::Comment(_) | Event::PI(_) => {}
        }
    }
    if !seen_root {
        return Err(not_guide("This file does not contain an XMLTV guide."));
    }
    if !stack.is_empty() {
        return Err(not_guide(
            "The guide ends before its closing </tv> tag; the download may be incomplete.",
        ));
    }
    Ok(b.finish())
}

/// Field text is gathered up to a bound well above any kept length, so one huge text node cannot
/// grow memory beyond the input itself.
fn push_capped(buf: &mut String, s: &str) {
    const MAX_GATHER: usize = 16 * 1024;
    if buf.len() < MAX_GATHER {
        let room = MAX_GATHER - buf.len();
        let mut end = s.len().min(room);
        while !s.is_char_boundary(end) {
            end -= 1;
        }
        buf.push_str(&s[..end]);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // 2026-03-29 12:00 UTC: the day after the UK's clocks went forward.
    const NOW: i64 = 1_774_785_600_000;

    fn t(raw: &str) -> i64 {
        parse_time(raw).unwrap_or_else(|| panic!("{raw} should parse"))
    }

    fn guide(body: &str) -> Guide {
        parse(&format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE tv SYSTEM \"xmltv.dtd\">\n<tv generator-info-name=\"test\">{body}</tv>"), NOW, Limits::default()).unwrap()
    }

    fn err(text: &str) -> IngestError {
        parse(text, NOW, Limits::default()).expect_err("should be refused")
    }

    #[test]
    fn reads_channels_and_programmes() {
        let g = guide(
            r#"<channel id="one.uk"><display-name lang="en">One</display-name><display-name>BBC One</display-name><icon src="https://img.example/1.png"/><url>https://one.example/</url></channel>
               <channel id="two.uk"><display-name>Two</display-name></channel>
               <programme start="20260329120000 +0000" stop="20260329130000 +0000" channel="one.uk">
                 <title lang="en">News &amp; Weather</title><title lang="cy">Newyddion</title>
                 <sub-title>Midday</sub-title><desc>The   latest
                 headlines.</desc><category>News</category><category>Current affairs</category>
                 <episode-num system="xmltv_ns">1.4.0/1</episode-num><icon src="https://img.example/p.png"/>
               </programme>
               <programme start="20260329130000 +0000" stop="20260329133000 +0000" channel="one.uk"><title>Film &#38; &#x41;rt</title><episode-num system="onscreen">S2 E5</episode-num><episode-num system="xmltv_ns">0.0.</episode-num></programme>
               <programme start="20260329120000 +0000" stop="20260329140000 +0000" channel="two.uk"><title><![CDATA[Sport <Live>]]></title></programme>"#,
        );
        assert_eq!(
            g.channels,
            vec![
                GuideChannel {
                    id: "one.uk".into(),
                    name: "One".into()
                },
                GuideChannel {
                    id: "two.uk".into(),
                    name: "Two".into()
                },
            ]
        );
        let one = &g.schedules[0];
        assert_eq!(one.len(), 2);
        assert_eq!(
            one[0],
            Programme {
                start: t("20260329120000 +0000"),
                stop: t("20260329130000 +0000"),
                stop_estimated: false,
                title: "News & Weather".into(),
                subtitle: Some("Midday".into()),
                desc: Some("The latest headlines.".into()),
                category: Some("News".into()),
                episode: Some("S2 E5".into()),
                icon: Some("https://img.example/p.png".into()),
            }
        );
        assert_eq!(one[1].title, "Film & Art");
        assert_eq!(
            one[1].episode.as_deref(),
            Some("S2 E5"),
            "onscreen wins over xmltv_ns"
        );
        assert_eq!(g.schedules[1][0].title, "Sport <Live>");
        assert_eq!((g.skipped, g.duplicates), (0, 0));
        let json = serde_json::to_string(&g).unwrap();
        assert!(
            !json.contains("one.example") && !json.contains("1.png"),
            "channel icons and urls are not kept"
        );
        assert!(json.contains("p.png"), "programme artwork icon is kept");
    }

    #[test]
    fn cleans_and_validates_icon_urls() {
        assert_eq!(clean_icon_url(None), None);
        assert_eq!(clean_icon_url(Some("".into())), None);
        assert_eq!(clean_icon_url(Some("   ".into())), None);
        assert_eq!(clean_icon_url(Some("not-a-url".into())), None);
        assert_eq!(
            clean_icon_url(Some("ftp://example.com/pic.jpg".into())),
            None
        );
        assert_eq!(clean_icon_url(Some("javascript:alert(1)".into())), None);
        assert_eq!(clean_icon_url(Some("file:///etc/passwd".into())), None);
        assert_eq!(
            clean_icon_url(Some("https://user:pass@example.com/pic.jpg".into())),
            None
        );
        assert_eq!(
            clean_icon_url(Some("https://example.com/pic.jpg\n".into())),
            None
        );
        assert_eq!(
            clean_icon_url(Some("https://example.com/pic.jpg".into())),
            Some("https://example.com/pic.jpg".into())
        );
        assert_eq!(
            clean_icon_url(Some("  http://example.com/pic.png  ".into())),
            Some("http://example.com/pic.png".into())
        );

        let g = guide(
            r#"<channel id="one.uk"><display-name>One</display-name></channel>
               <programme start="20260329120000 +0000" stop="20260329130000 +0000" channel="one.uk">
                 <title>Show 1</title>
                 <icon src="https://user:pass@bad.example/icon.jpg"/>
               </programme>
               <programme start="20260329130000 +0000" stop="20260329140000 +0000" channel="one.uk">
                 <title>Show 2</title>
                 <icon src="not-a-url"/>
               </programme>"#,
        );
        assert_eq!(g.schedules[0][0].icon, None);
        assert_eq!(g.schedules[0][1].icon, None);
    }

    #[test]
    fn times_with_offsets_without_offsets_and_truncated() {
        let base = t("20260329120000 +0000");
        assert_eq!(base, NOW);
        assert_eq!(t("20260329130000 +0100"), base, "offset applied");
        assert_eq!(t("20260329070000 -0500"), base);
        assert_eq!(t("20260329173000 +05:30"), base);
        assert_eq!(
            t("20260329120000"),
            base,
            "no offset means UTC, as the XMLTV DTD says"
        );
        assert_eq!(t("20260329120000Z"), base);
        assert_eq!(t("202603291200 +0000"), base, "seconds may be left out");
        assert_eq!(t("2026032912"), base);
        assert_eq!(t("20260329"), base - 12 * HOUR);
        assert_eq!(
            t("20240229000000 +0000") - t("20240228000000 +0000"),
            DAY,
            "leap day"
        );
        assert_eq!(t("19700101000000 +0000"), 0);
        for bad in [
            "",
            "2026",
            "2026032912000",
            "20261329120000",
            "20260230120000",
            "20250229120000",
            "20260329250000",
            "20260329126000",
            "20260329120060",
            "20260329120000 +1500",
            "20260329120000 +01",
            "20260329120000 0100",
            "20260329120000 EST",
            "18000101000000",
            "２０２６０３２９",
            "20260329120000 +01:0x",
        ] {
            assert_eq!(parse_time(bad), None, "{bad:?} should be refused");
        }
    }

    #[test]
    fn daylight_saving_changes_keep_real_durations() {
        // UK clocks went forward at 01:00 UTC on 2026-03-29 (GMT +0000 to BST +0100).
        let g = guide(
            r#"<channel id="c"/>
               <programme start="20260329003000 +0000" stop="20260329020000 +0100" channel="c"><title>Across the change</title></programme>
               <programme start="20260329020000 +0100" stop="20260329030000 +0100" channel="c"><title>After</title></programme>"#,
        );
        let s = &g.schedules[0];
        assert_eq!(
            s[0].stop - s[0].start,
            30 * 60_000,
            "00:30 GMT to 02:00 BST is half an hour"
        );
        assert_eq!(s[1].start, s[0].stop, "no gap or overlap across the change");
        // Autumn: 01:30 happens twice; the offsets tell the two apart.
        let a = t("20261025013000 +0100");
        let b = t("20261025013000 +0000");
        assert_eq!(b - a, HOUR);
    }

    #[test]
    fn missing_stop_times_overlaps_repeats_and_bad_programmes() {
        let g = guide(
            r#"<channel id="c"/>
               <programme start="20260329120000" channel="c"><title>No stop, next follows</title></programme>
               <programme start="20260329130000" stop="20260329140000" channel="c"><title>Second</title></programme>
               <programme start="20260329130000" stop="20260329140000" channel="c"><title>Second</title></programme>
               <programme start="20260329133000" stop="20260329143000" channel="c"><title>Overlapping</title></programme>
               <programme start="20260329150000" channel="c"><title>Last without stop</title></programme>
               <programme start="20260329160000" stop="20260329150000" channel="c"><title>Ends before it starts</title></programme>
               <programme start="nonsense" stop="20260329150000" channel="c"><title>Bad start</title></programme>
               <programme start="20260329170000" stop="garbage" channel="c"><title>Bad stop</title></programme>
               <programme start="20260329180000" stop="20260329190000" channel="c"></programme>
               <programme start="20260329180000" stop="20260329190000"><title>No channel</title></programme>"#,
        );
        let s = &g.schedules[0];
        let titles: Vec<_> = s.iter().map(|p| p.title.as_str()).collect();
        assert_eq!(titles, ["No stop, next follows", "Second"]);
        assert!(s[0].stop_estimated);
        assert_eq!(s[0].stop, s[1].start, "a missing stop is the next start");
        assert!(!s[1].stop_estimated);
        assert_eq!(g.duplicates, 1);
        // Overlapping, last without stop, ends before start, bad start, bad stop, no title, no channel.
        assert_eq!(g.skipped, 7);
        let notes = g.warnings.join("\n");
        assert!(notes.contains("overlapped"), "{notes}");
        assert!(
            notes.contains("no end time and nothing after it"),
            "{notes}"
        );
        assert!(
            notes.contains("the next programme’s start is used"),
            "{notes}"
        );
    }

    #[test]
    fn gaps_are_kept_as_gaps() {
        let g = guide(
            r#"<programme start="20260329120000" stop="20260329130000" channel="c"><title>A</title></programme>
               <programme start="20260329150000" stop="20260329160000" channel="c"><title>B</title></programme>"#,
        );
        let s = &g.schedules[0];
        assert_eq!(s.len(), 2);
        assert_eq!(
            s[1].start - s[0].stop,
            2 * HOUR,
            "nothing is invented for the gap"
        );
    }

    #[test]
    fn only_the_window_is_kept() {
        let g = guide(
            r#"<programme start="20260320120000" stop="20260320130000" channel="c"><title>Long gone</title></programme>
               <programme start="20260328234000" stop="20260328235000" channel="c"><title>Ended over twelve hours ago</title></programme>
               <programme start="20260329000000" stop="20260329001000" channel="c"><title>Ended under twelve hours ago</title></programme>
               <programme start="20260329080000" stop="20260329090000" channel="c"><title>This morning</title></programme>
               <programme start="20260405110000" stop="20260405120000" channel="c"><title>In a week</title></programme>
               <programme start="20260406130000" stop="20260406140000" channel="c"><title>Too far ahead</title></programme>"#,
        );
        let titles: Vec<_> = g.schedules[0].iter().map(|p| p.title.as_str()).collect();
        assert_eq!(
            titles,
            ["Ended under twelve hours ago", "This morning", "In a week"]
        );
        assert_eq!(g.skipped, 0, "programmes outside the window are not errors");
    }

    #[test]
    fn channel_ids_repeats_and_undeclared_channels() {
        let g = guide(
            r#"<channel id=" BBC1.uk "><display-name>BBC One</display-name></channel>
               <channel id="bbc1.UK"><display-name>Repeat</display-name></channel>
               <channel id=""><display-name>No id</display-name></channel>
               <channel><display-name>Missing id</display-name></channel>
               <programme start="20260329120000" stop="20260329130000" channel="BBC1.uk"><title>A</title></programme>
               <programme start="20260329120000" stop="20260329130000" channel="only.in.programmes"><title>B</title></programme>"#,
        );
        assert_eq!(
            g.channels,
            vec![
                GuideChannel {
                    id: "BBC1.uk".into(),
                    name: "BBC One".into()
                },
                GuideChannel {
                    id: "only.in.programmes".into(),
                    name: "only.in.programmes".into()
                },
            ]
        );
        assert_eq!(
            g.schedules[0].len(),
            1,
            "programme matched to the channel despite case"
        );
        assert_eq!(g.duplicates, 1);
        let notes = g.warnings.join("\n");
        assert!(
            notes.contains("2 channel entries had no usable id"),
            "{notes}"
        );
        assert!(
            notes.contains("has programmes but no channel entry"),
            "{notes}"
        );
        assert_eq!(normalize_id("  BBC1.uk "), "bbc1.uk");
        assert_ne!(
            normalize_id("bbc1"),
            normalize_id("bbc1.uk"),
            "no suffix stripping"
        );
        assert_ne!(
            normalize_id("bbc-1.uk"),
            normalize_id("bbc1.uk"),
            "no punctuation stripping"
        );
    }

    #[test]
    fn loose_keys_ignore_spelling_but_never_the_country() {
        let first = |id: &str| loose_keys(id).first().cloned();
        assert_eq!(first("BBC.Two.HD.uk"), first("BBCTwo.uk@HD"));
        assert_eq!(first("[BBC2].BBC.Two.uk"), first("BBCTwo.uk"));
        assert_eq!(first("Daystar.HD.[CHARTER].us2"), first("Daystar.us"));
        assert_eq!(first("BBCOne.uk@London"), first("BBC.One.London.HD.uk"));
        assert_eq!(loose_keys("BBCOne.uk@Mars"), ["bbconemars.uk", "bbcone.uk"]);
        assert_ne!(first("Star.uk"), first("Star.us"));
        assert_ne!(
            first("Wisd.uk"),
            first("Wi.uk"),
            "lower-case endings are part of the name"
        );
        assert!(loose_keys("plex.tv.Z.Nation.plex").is_empty());
        assert!(loose_keys("no-country").is_empty());
    }

    #[test]
    fn long_text_is_cut_and_whitespace_collapsed() {
        let desc = "word ".repeat(1000);
        let g = guide(&format!(
            r#"<programme start="20260329120000" stop="20260329130000" channel="c"><title>  Spaced   out  </title><desc>{desc}</desc></programme>"#
        ));
        let p = &g.schedules[0][0];
        assert_eq!(p.title, "Spaced out");
        let d = p.desc.as_deref().unwrap();
        assert_eq!(d.chars().count(), MAX_DESC_CHARS);
        assert!(d.ends_with('…'));
    }

    #[test]
    fn entity_attacks_and_external_resources_are_refused() {
        let laughs = r#"<?xml version="1.0"?><!DOCTYPE tv [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">]><tv><programme start="20260329120000" stop="20260329130000" channel="c"><title>&lol2;</title></programme></tv>"#;
        assert!(err(laughs)
            .message
            .contains("declares its own XML entities"));
        let xxe = r#"<?xml version="1.0"?><!DOCTYPE tv [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><tv><channel id="&xxe;"/></tv>"#;
        let e = err(xxe);
        assert_eq!(e.code, ErrorCode::NotGuide);
        // An external DTD is never loaded, so a reference to an entity it might declare is undefined.
        let external = r#"<?xml version="1.0"?><!DOCTYPE tv SYSTEM "http://169.254.169.254/evil.dtd"><tv><programme start="20260329120000" stop="20260329130000" channel="c"><title>&secret;</title></programme></tv>"#;
        assert!(err(external).message.contains("entity that is not defined"));
        let in_attr = r#"<tv><channel id="&secret;"/></tv>"#;
        assert_eq!(err(in_attr).code, ErrorCode::NotGuide);
        for e in [err(laughs), err(xxe), err(external)] {
            assert!(
                !e.message.contains("passwd")
                    && !e.message.contains("169.254")
                    && !e.message.contains("lol")
            );
        }
    }

    #[test]
    fn malformed_truncated_and_foreign_documents_are_refused() {
        let truncated =
            r#"<tv><programme start="20260329120000" stop="20260329130000" channel="c"><title>Cut"#;
        assert!(err(truncated).message.contains("closing </tv>"));
        assert!(err("<tv><channel id=\"a\"></tv>")
            .message
            .contains("not well-formed"));
        assert!(err("<tv><channel id=\"a\" id=\"b\"/>").message.len() < 200);
        assert!(err("<!doctype html><html><body>Sign in</body></html>")
            .message
            .contains("web page"));
        assert!(err("<rss><channel/></rss>")
            .message
            .contains("not an XMLTV guide"));
        assert!(err("#EXTM3U\n#EXTINF:-1,One\nhttp://x/1.ts")
            .message
            .contains("does not contain"));
        assert!(err("").message.contains("does not contain"));
        assert!(err("<?xml version=\"1.0\" encoding=\"ISO-8859-1\"?><tv/>")
            .message
            .contains("encoding other than UTF-8"));
        assert!(err(&format!("{}{}", "<tv>", "<a>".repeat(40)))
            .message
            .contains("nested too deeply"));
        assert_eq!(
            guide("").channels.len(),
            0,
            "an empty guide parses; the page says it lists nothing"
        );
    }

    #[test]
    fn limits_on_channels_and_programmes() {
        let limits = Limits {
            max_channels: 3,
            max_programmes: 4,
            max_depth: 16,
        };
        let channels: String = (0..4).map(|i| format!(r#"<channel id="c{i}"/>"#)).collect();
        let e = parse(&format!("<tv>{channels}</tv>"), NOW, limits).unwrap_err();
        assert_eq!(e.code, ErrorCode::TooManyEntries);
        let programmes: String = (0..5)
            .map(|i| format!(r#"<programme start="2026032912{i:02}00" stop="2026032912{:02}00" channel="c"><title>P</title></programme>"#, i + 1))
            .collect();
        let e = parse(&format!("<tv>{programmes}</tv>"), NOW, limits).unwrap_err();
        assert_eq!(e.code, ErrorCode::TooManyEntries);
        // Programmes outside the window do not count towards the limit.
        let old: String = (0..10)
            .map(|i| format!(r#"<programme start="2026030112{i:02}00" stop="2026030112{:02}00" channel="c"><title>Old</title></programme>"#, i + 1))
            .collect();
        assert!(parse(&format!("<tv>{old}</tv>"), NOW, limits).is_ok());
    }

    #[test]
    fn decoding_gzip_utf8_and_size_limits() {
        use flate2::{write::GzEncoder, Compression};
        use std::io::Write;
        let xml = "<tv><channel id=\"c\"><display-name>Caf\u{e9}</display-name></channel></tv>";
        let mut gz = GzEncoder::new(Vec::new(), Compression::default());
        gz.write_all(xml.as_bytes()).unwrap();
        assert_eq!(decode(gz.finish().unwrap()).unwrap(), xml);
        assert_eq!(decode(xml.as_bytes().to_vec()).unwrap(), xml);
        let mut bom = vec![0xef, 0xbb, 0xbf];
        bom.extend_from_slice(xml.as_bytes());
        assert_eq!(decode(bom).unwrap(), xml);
        assert!(decode(vec![0xff, 0xfe, b'<', 0])
            .unwrap_err()
            .message
            .contains("UTF-16"));
        assert!(decode(b"<tv>\xff\xfe\xfd</tv>".to_vec())
            .unwrap_err()
            .message
            .contains("not UTF-8"));
        assert!(decode(vec![0x1f, 0x8b, 1, 2, 3])
            .unwrap_err()
            .message
            .contains("could not be decompressed"));
        // A small compressed file that expands past the limit is cut off, not fully inflated.
        let mut bomb = GzEncoder::new(Vec::new(), Compression::best());
        let zeros = vec![b' '; 1024 * 1024];
        for _ in 0..(MAX_XML_BYTES / zeros.len() + 2) {
            bomb.write_all(&zeros).unwrap();
        }
        let bomb = bomb.finish().unwrap();
        assert!(
            bomb.len() < 1024 * 1024,
            "the bomb is small: {}",
            bomb.len()
        );
        assert_eq!(decode(bomb).unwrap_err().code, ErrorCode::TooLarge);
    }

    #[test]
    fn episode_numbers() {
        assert_eq!(episode_from_ns("0.0.0/1").as_deref(), Some("S1 E1"));
        assert_eq!(episode_from_ns("1 . 4 . 0/2").as_deref(), Some("S2 E5"));
        assert_eq!(episode_from_ns(".11/24.").as_deref(), Some("E12"));
        assert_eq!(episode_from_ns("2..").as_deref(), Some("S3"));
        assert_eq!(episode_from_ns("..").as_deref(), None);
        assert_eq!(episode_from_ns("x.y.z").as_deref(), None);
    }
}
