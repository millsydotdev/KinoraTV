//! M3U channel-list parser (`#EXTM3U` / `#EXTINF`). Pure: no I/O, and every byte is untrusted.
//! Nothing here fetches or opens the stream addresses it reads.

use std::collections::{HashMap, HashSet};
use std::fmt;

use reqwest::Url;
use serde::Serialize;

use crate::ingest::{ErrorCode, IngestError};

pub const MAX_ENTRIES: usize = 50_000;
const MAX_LINE: usize = 8 * 1024;
const MAX_TEXT: usize = 256;
const MAX_LOGO_URL: usize = 2048;
const MAX_STREAM_URL: usize = 4096;
const MAX_WARNINGS: usize = 20;
/// Stream schemes worth keeping for a future player. Anything else (file:, javascript:, data:...) is dropped.
const STREAM_SCHEMES: &[&str] = &[
    "http", "https", "rtmp", "rtmps", "rtsp", "rtp", "udp", "mms", "mmsh", "srt",
];

/// One channel entry. Mirrored by `PlaylistChannel` in `src/lib/native.ts`.
#[derive(Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Channel {
    /// Stable within one playlist: from `tvg-id` when present, otherwise from name and group.
    /// Never derived from the stream address, which can carry credentials.
    pub key: String,
    /// Guide id for later XMLTV matching.
    pub tvg_id: Option<String>,
    pub name: String,
    pub group: Option<String>,
    /// http(s) logo address, or `None` (the UI shows initials instead).
    pub logo: Option<String>,
    pub language: Option<String>,
    pub country: Option<String>,
    pub chno: Option<u32>,
    pub catchup: Option<String>,
    pub catchup_days: Option<u32>,
    pub catchup_source: Option<String>,
    /// The address as written in the playlist, kept for a future player. May contain account
    /// names, passwords or tokens: never log it or show it; show `stream_display` instead.
    pub stream_url: String,
    /// `scheme://host[:port]/…`, safe to show.
    pub stream_display: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub http_user_agent: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub http_referrer: Option<String>,
}

// Hand-written so a stray `{:?}` can never print a stream or logo address.
impl fmt::Debug for Channel {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Channel")
            .field("key", &self.key)
            .field("tvg_id", &self.tvg_id)
            .field("name", &self.name)
            .field("group", &self.group)
            .field("logo", &self.logo.as_ref().map(|_| "<redacted>"))
            .field("language", &self.language)
            .field("country", &self.country)
            .field("chno", &self.chno)
            .field("catchup", &self.catchup)
            .field("catchup_days", &self.catchup_days)
            .field(
                "catchup_source",
                &self.catchup_source.as_ref().map(|_| "<redacted>"),
            )
            .field("stream", &self.stream_display)
            .field("http_user_agent", &self.http_user_agent)
            .field(
                "http_referrer",
                &self.http_referrer.as_ref().map(|_| "<redacted>"),
            )
            .finish()
    }
}

#[derive(Debug, Default)]
pub struct Playlist {
    pub channels: Vec<Channel>,
    pub skipped: u32,
    pub duplicates: u32,
    pub warnings: Vec<String>,
}

impl Playlist {
    fn skip(&mut self, line: usize, why: &str) {
        self.skipped += 1;
        if self.warnings.len() < MAX_WARNINGS {
            self.warnings.push(format!("Line {line}: {why}"));
        }
    }
}

struct Pending {
    line: usize,
    attrs: HashMap<String, String>,
    title: Option<String>,
    group: Option<String>,
    http_user_agent: Option<String>,
    http_referrer: Option<String>,
}

pub fn parse(text: &str) -> Result<Playlist, IngestError> {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let start = text.trim_start();
    if start.is_empty() {
        return Err(IngestError::new(
            ErrorCode::NotPlaylist,
            "The playlist is empty.",
        ));
    }
    if start.starts_with('<') {
        let head = start
            .chars()
            .take(512)
            .collect::<String>()
            .to_ascii_lowercase();
        return Err(
            if head.contains("<html") || head.contains("<!doctype html") {
                IngestError::new(
                    ErrorCode::WebPage,
                    "The address returned a web page, not a playlist.",
                )
            } else {
                IngestError::new(ErrorCode::NotPlaylist, "This looks like an XML document. Programme guides (XMLTV) are not supported yet.")
            },
        );
    }
    // HLS playlists also use #EXTINF, so check for their tags before reading entries.
    let tag = |t: &str| text.lines().any(|l| l.trim_start().starts_with(t));
    if tag("#EXT-X-STREAM-INF") {
        return Err(IngestError::new(
            ErrorCode::HlsMaster,
            "This is a single HLS stream with quality variants, not a channel list.",
        ));
    }
    if tag("#EXT-X-TARGETDURATION") || tag("#EXT-X-MEDIA-SEQUENCE") {
        return Err(IngestError::new(
            ErrorCode::HlsMedia,
            "This is an HLS media playlist (video segments of one stream), not a channel list.",
        ));
    }

    let has_header = start.starts_with("#EXTM3U");
    let mut out = Playlist::default();
    let mut pending: Option<Pending> = None;
    let mut seen_extinf = false;
    let mut exact: HashSet<(Option<String>, String)> = HashSet::new();
    let mut keys: HashMap<String, u32> = HashMap::new();

    for (i, raw) in text.lines().enumerate() {
        let n = i + 1;
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        if line.len() > MAX_LINE {
            if pending.take().is_some() || line.starts_with("#EXTINF") {
                out.skip(n, "line is too long; entry skipped.");
            }
            continue;
        }
        if let Some(rest) = line.strip_prefix("#EXTINF:") {
            seen_extinf = true;
            if let Some(p) = pending.take() {
                out.skip(p.line, "entry has no stream address.");
            }
            let (head, title) = split_extinf(rest);
            pending = Some(Pending {
                line: n,
                attrs: attributes(head),
                title: title.map(str::to_owned),
                group: None,
                http_user_agent: None,
                http_referrer: None,
            });
            continue;
        }
        if let Some(group) = line.strip_prefix("#EXTGRP:") {
            if let Some(p) = pending.as_mut() {
                p.group = clean(group);
            }
            continue;
        }
        if let Some(opt) = line.strip_prefix("#EXTVLCOPT:") {
            if let Some(p) = pending.as_mut() {
                let opt = opt.trim();
                if let Some(val) = opt
                    .strip_prefix("http-user-agent=")
                    .or_else(|| opt.strip_prefix("user-agent="))
                {
                    p.http_user_agent = clean(val);
                } else if let Some(val) = opt
                    .strip_prefix("http-referrer=")
                    .or_else(|| opt.strip_prefix("http-referer="))
                    .or_else(|| opt.strip_prefix("referrer="))
                    .or_else(|| opt.strip_prefix("referer="))
                {
                    p.http_referrer = clean(val);
                }
            }
            continue;
        }
        if let Some(http) = line.strip_prefix("#EXTHTTP:") {
            if let Some(p) = pending.as_mut() {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(http.trim()) {
                    if let Some(ua) = v
                        .get("User-Agent")
                        .or_else(|| v.get("user-agent"))
                        .and_then(|s| s.as_str())
                    {
                        p.http_user_agent = clean(ua);
                    }
                    if let Some(rf) = v
                        .get("Referer")
                        .or_else(|| v.get("referer"))
                        .or_else(|| v.get("Referrer"))
                        .or_else(|| v.get("referrer"))
                        .and_then(|s| s.as_str())
                    {
                        p.http_referrer = clean(rf);
                    }
                }
            }
            continue;
        }
        if line.starts_with('#') {
            continue;
        }
        // A stream address line.
        let Some(p) = pending.take() else {
            out.skip(n, "stream address without #EXTINF details.");
            continue;
        };
        let Some((stream_url, stream_display)) = stream_address(line) else {
            out.skip(
                p.line,
                "stream address is missing, too long or uses an unsupported scheme.",
            );
            continue;
        };
        let (pipe_ua, pipe_ref) = if let Some((_, pipe)) = line.split_once('|') {
            parse_pipe_headers(pipe)
        } else {
            (None, None)
        };
        let attr = |k: &str| p.attrs.get(k).and_then(|v| clean(v));
        let attr_ua = attr("tvg-user-agent")
            .or_else(|| attr("http-user-agent"))
            .or_else(|| attr("user-agent"));
        let attr_ref = attr("tvg-referrer")
            .or_else(|| attr("tvg-referer"))
            .or_else(|| attr("http-referrer"))
            .or_else(|| attr("http-referer"))
            .or_else(|| attr("referrer"))
            .or_else(|| attr("referer"));
        let final_ua = pipe_ua.or(p.http_user_agent).or(attr_ua);
        let final_ref = pipe_ref.or(p.http_referrer).or(attr_ref);

        let mut final_stream_url = stream_url;
        if !final_stream_url.contains('|') {
            let mut parts = Vec::new();
            if let Some(ref u) = final_ua {
                parts.push(format!("User-Agent={u}"));
            }
            if let Some(ref r) = final_ref {
                parts.push(format!("Referer={r}"));
            }
            if !parts.is_empty() {
                final_stream_url = format!("{final_stream_url}|{}", parts.join("&"));
            }
        }

        let tvg_id = attr("tvg-id");
        let Some(name) = p
            .title
            .as_deref()
            .and_then(clean)
            .or_else(|| attr("tvg-name"))
            .or_else(|| tvg_id.clone())
        else {
            out.skip(p.line, "entry has no channel name.");
            continue;
        };
        if !exact.insert((tvg_id.clone(), final_stream_url.clone())) {
            out.duplicates += 1;
            continue;
        }
        if out.channels.len() == MAX_ENTRIES {
            return Err(IngestError::new(
                ErrorCode::TooManyEntries,
                "The playlist has more than 50,000 channels, which is over Kinora's limit.",
            ));
        }
        let group = attr("group-title").or(p.group);
        let base = match &tvg_id {
            Some(id) => format!("tvg:{id}"),
            None => format!(
                "name:{:016x}",
                fnv1a(&format!("{name}\n{}", group.as_deref().unwrap_or_default()))
            ),
        };
        // Same guide id with a different stream address: keep both as alternates, never merge.
        let uses = keys.entry(base.clone()).or_insert(0);
        *uses += 1;
        let key = if *uses == 1 {
            base
        } else {
            format!("{base}#{uses}")
        };
        out.channels.push(Channel {
            key,
            name,
            group,
            logo: attr("tvg-logo")
                .or_else(|| attr("logo"))
                .filter(|l| is_http_url(l, MAX_LOGO_URL)),
            language: attr("tvg-language"),
            country: attr("tvg-country"),
            chno: attr("tvg-chno")
                .and_then(|c| c.parse::<u32>().ok())
                .filter(|c| (1..=99_999).contains(c)),
            catchup: attr("catchup")
                .or_else(|| attr("catchup-type"))
                .map(|s| s.to_ascii_lowercase()),
            catchup_days: attr("catchup-days")
                .or_else(|| attr("timeshift"))
                .and_then(|c| c.parse::<u32>().ok())
                .filter(|&c| (1..=365).contains(&c)),
            catchup_source: attr("catchup-source"),
            tvg_id,
            stream_url: final_stream_url,
            stream_display,
            http_user_agent: final_ua,
            http_referrer: final_ref,
        });
    }
    if let Some(p) = pending {
        out.skip(p.line, "entry has no stream address.");
    }
    if !has_header {
        if !seen_extinf {
            return Err(IngestError::new(ErrorCode::NotPlaylist, "No #EXTM3U header or channel entries were found. Only M3U channel playlists are supported."));
        }
        out.warnings.insert(
            0,
            "The #EXTM3U header is missing; entries were read anyway.".into(),
        );
        out.warnings.truncate(MAX_WARNINGS);
    }
    Ok(out)
}

/// Formats an M3U catchup stream URL using standard timeshift interpolation patterns.
/// Replaces {utc}, ${start}, ${timestamp}, ${duration}, {duration}, ${end}, ${offset}.
pub fn format_m3u_catchup_url(
    base_stream_url: &str,
    catchup_type: Option<&str>,
    catchup_source: Option<&str>,
    start_timestamp: i64,
    duration_mins: u32,
    stop_timestamp: i64,
) -> String {
    let duration_secs = (duration_mins as i64) * 60;
    let stop_ts = if stop_timestamp > start_timestamp {
        stop_timestamp
    } else {
        start_timestamp + duration_secs
    };
    let now_ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(start_timestamp + duration_secs);
    let offset_secs = (now_ts - start_timestamp).max(0);

    let substitute = |template: &str| -> String {
        template
            .replace("${start}", &start_timestamp.to_string())
            .replace("{utc}", &start_timestamp.to_string())
            .replace("${timestamp}", &now_ts.to_string())
            .replace("{lutc}", &now_ts.to_string())
            .replace("${duration}", &duration_secs.to_string())
            .replace("{duration}", &duration_secs.to_string())
            .replace("${end}", &stop_ts.to_string())
            .replace("${stop}", &stop_ts.to_string())
            .replace("{utcend}", &stop_ts.to_string())
            .replace("${offset}", &offset_secs.to_string())
    };

    if let Some(src) = catchup_source {
        let interpolated = substitute(src);
        if interpolated.starts_with("http://") || interpolated.starts_with("https://") {
            return interpolated;
        }
        if interpolated.starts_with('?') || interpolated.starts_with('&') {
            let sep = if base_stream_url.contains('?') {
                "&"
            } else {
                "?"
            };
            let query = interpolated.trim_start_matches(['?', '&']);
            return format!("{base_stream_url}{sep}{query}");
        }
        if base_stream_url.contains('?') {
            format!("{base_stream_url}&{interpolated}")
        } else {
            format!("{base_stream_url}?{interpolated}")
        }
    } else {
        match catchup_type.unwrap_or("default") {
            "shift" => {
                let sep = if base_stream_url.contains('?') {
                    "&"
                } else {
                    "?"
                };
                format!("{base_stream_url}{sep}timeshift={offset_secs}&duration={duration_secs}")
            }
            "flussonic" => {
                if let Some(idx) = base_stream_url.rfind('/') {
                    let prefix = &base_stream_url[..idx];
                    format!("{prefix}/archive/{start_timestamp}/{duration_secs}.m3u8")
                } else {
                    let sep = if base_stream_url.contains('?') {
                        "&"
                    } else {
                        "?"
                    };
                    format!("{base_stream_url}{sep}utc={start_timestamp}&lutc={now_ts}")
                }
            }
            _ => {
                let sep = if base_stream_url.contains('?') {
                    "&"
                } else {
                    "?"
                };
                format!("{base_stream_url}{sep}utc={start_timestamp}&lutc={now_ts}")
            }
        }
    }
}

/// Splits `-1 tvg-id="a,b" group-title="News",Channel Name` at the first comma outside quotes.
fn split_extinf(rest: &str) -> (&str, Option<&str>) {
    let mut quoted = false;
    for (i, c) in rest.char_indices() {
        match c {
            '"' => quoted = !quoted,
            ',' if !quoted => return (&rest[..i], Some(&rest[i + 1..])),
            _ => {}
        }
    }
    (rest, None)
}

/// `key="value"` or `key=value` pairs after the duration. First occurrence of a key wins.
fn attributes(head: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    let mut rest = head.trim_start();
    // Skip the duration (`-1`, `0`...) unless the line went straight into attributes.
    if let Some((first, after)) = rest.split_once(char::is_whitespace) {
        if !first.contains('=') {
            rest = after;
        }
    } else if !rest.contains('=') {
        return out;
    }
    loop {
        rest = rest.trim_start();
        let Some(eq) = rest.find('=') else { break };
        let key = rest[..eq]
            .rsplit(char::is_whitespace)
            .next()
            .unwrap_or("")
            .to_ascii_lowercase();
        let after = &rest[eq + 1..];
        let (value, next) = match after.strip_prefix('"') {
            Some(q) => q
                .find('"')
                .map_or((q, ""), |end| (&q[..end], &q[end + 1..])),
            None => after
                .find(char::is_whitespace)
                .map_or((after, ""), |end| (&after[..end], &after[end..])),
        };
        if !key.is_empty()
            && key
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        {
            out.entry(key).or_insert_with(|| value.to_owned());
        }
        rest = next;
    }
    out
}

/// Trimmed, control characters removed, capped at 256 characters; `None` when nothing is left.
fn clean(s: &str) -> Option<String> {
    let s: String = s
        .chars()
        .filter(|c| !c.is_control())
        .collect::<String>()
        .trim()
        .chars()
        .take(MAX_TEXT)
        .collect();
    (!s.is_empty()).then_some(s)
}

/// Extracts User-Agent and Referer headers from pipe syntax (`url|User-Agent=...&Referer=...` or `|Header1=Val1|Header2=Val2`).
fn parse_pipe_headers(pipe: &str) -> (Option<String>, Option<String>) {
    let mut ua = None;
    let mut referrer = None;
    for token in pipe.split(['&', '|']) {
        let token = token.trim();
        if let Some((k, v)) = token.split_once('=') {
            let k = k.trim().to_ascii_lowercase();
            let v = v.trim();
            if v.is_empty() {
                continue;
            }
            if k == "user-agent" || k == "http-user-agent" {
                ua = clean(v);
            } else if k == "referer"
                || k == "referrer"
                || k == "http-referer"
                || k == "http-referrer"
            {
                referrer = clean(v);
            }
        }
    }
    (ua, referrer)
}

/// The address as written, plus its safe display form.
fn stream_address(line: &str) -> Option<(String, String)> {
    if line.len() > MAX_STREAM_URL {
        return None;
    }
    let (raw_url, _) = line.split_once('|').unwrap_or((line, ""));
    let url = Url::parse(raw_url).ok()?;
    STREAM_SCHEMES
        .contains(&url.scheme())
        .then(|| (line.to_owned(), display_address(&url)))
}

/// Keeps scheme, host and port only. Paths and queries often carry credentials
/// (`/live/<user>/<pass>/1.ts`, `?token=`), and userinfo is dropped by `host_str`.
pub fn display_address(url: &Url) -> String {
    match (url.host_str(), url.port()) {
        (Some(host), Some(port)) => format!("{}://{host}:{port}/…", url.scheme()),
        (Some(host), None) => format!("{}://{host}/…", url.scheme()),
        (None, _) => format!("{}:…", url.scheme()),
    }
}

fn is_http_url(s: &str, max: usize) -> bool {
    s.len() <= max
        && Url::parse(s).is_ok_and(|u| matches!(u.scheme(), "http" | "https") && u.host().is_some())
}

/// FNV-1a: stable across Rust releases, unlike `DefaultHasher`, so keys survive app updates.
fn fnv1a(s: &str) -> u64 {
    s.bytes().fold(0xcbf2_9ce4_8422_2325, |h, b| {
        (h ^ u64::from(b)).wrapping_mul(0x0100_0000_01b3)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ok(text: &str) -> Playlist {
        parse(text).expect("playlist should parse")
    }
    fn code(text: &str) -> ErrorCode {
        parse(text).expect_err("playlist should be rejected").code
    }

    #[test]
    fn reads_a_typical_playlist_with_metadata() {
        let p = ok(concat!(
            "#EXTM3U x-tvg-url=\"https://guide.example/epg.xml\"\n",
            "#EXTINF:-1 tvg-id=\"news.uk\" tvg-name=\"News HD\" tvg-logo=\"https://img.example/news.png\" group-title=\"News\" tvg-language=\"English\" tvg-country=\"GB\" tvg-chno=\"101\",News HD\n",
            "https://streams.example/news.m3u8\n",
            "#EXTINF:-1,Plain Channel\n",
            "http://streams.example/plain.ts\n",
        ));
        assert_eq!(p.channels.len(), 2);
        assert_eq!((p.skipped, p.duplicates), (0, 0));
        assert_eq!(
            p.channels[0],
            Channel {
                key: "tvg:news.uk".into(),
                tvg_id: Some("news.uk".into()),
                name: "News HD".into(),
                group: Some("News".into()),
                logo: Some("https://img.example/news.png".into()),
                language: Some("English".into()),
                country: Some("GB".into()),
                chno: Some(101),
                catchup: None,
                catchup_days: None,
                catchup_source: None,
                stream_url: "https://streams.example/news.m3u8".into(),
                stream_display: "https://streams.example/…".into(),
                http_user_agent: None,
                http_referrer: None,
            }
        );
        let plain = &p.channels[1];
        assert_eq!(
            (
                plain.name.as_str(),
                plain.tvg_id.as_ref(),
                plain.group.as_ref(),
                plain.logo.as_ref()
            ),
            ("Plain Channel", None, None, None)
        );
        assert!(
            plain.key.starts_with("name:") && plain.key.len() == 21,
            "{}",
            plain.key
        );
    }

    #[test]
    fn credentials_in_stream_addresses_stay_out_of_keys_display_and_debug() {
        let entry = |token: &str| {
            format!("#EXTM3U\n#EXTINF:-1 group-title=\"News\" tvg-logo=\"https://img.example/l.png?sig=LOGOSIG\",News\nhttp://alice:pw1@provider.example:8080/live/alice/hunter2/123.ts?token={token}\n")
        };
        let a = ok(&entry("SECRET1")).channels.remove(0);
        let b = ok(&entry("SECRET2")).channels.remove(0);
        // The real address is kept for a future player...
        assert_eq!(
            a.stream_url,
            "http://alice:pw1@provider.example:8080/live/alice/hunter2/123.ts?token=SECRET1"
        );
        // ...but identity and display never depend on it.
        assert_eq!(
            a.key, b.key,
            "a rotated token must not change the channel's identity"
        );
        assert_eq!(a.stream_display, "http://provider.example:8080/…");
        let debug = format!("{a:?}");
        for secret in ["alice", "pw1", "hunter2", "SECRET1", "/live", "LOGOSIG"] {
            assert!(
                !debug.contains(secret)
                    && !a.key.contains(secret)
                    && !a.stream_display.contains(secret),
                "{secret} leaked: {debug}"
            );
        }
        assert_eq!(
            display_address(&Url::parse("udp://@239.0.0.1:1234").unwrap()),
            "udp://239.0.0.1:1234/…"
        );
        assert_eq!(
            display_address(&Url::parse("rtsp://user:pass@[2001:db8::1]/cam").unwrap()),
            "rtsp://[2001:db8::1]/…"
        );
    }

    #[test]
    fn keys_are_stable_between_parses() {
        let text = "#EXTM3U\n#EXTINF:-1,A\nhttp://s.example/a\n";
        assert_eq!(ok(text).channels[0].key, ok(text).channels[0].key);
        // Published FNV-1a 64-bit vectors: keys must not change if this function is ever touched.
        assert_eq!(fnv1a(""), 0xcbf2_9ce4_8422_2325);
        assert_eq!(fnv1a("a"), 0xaf63_dc4c_8601_ec8c);
        assert_eq!(fnv1a("foobar"), 0x8594_4171_f739_67e8);
    }

    #[test]
    fn empty_input_and_header_only_playlists() {
        assert_eq!(code(""), ErrorCode::NotPlaylist);
        assert_eq!(code(" \n\r\n"), ErrorCode::NotPlaylist);
        let p = ok("#EXTM3U\n");
        assert!(p.channels.is_empty() && p.skipped == 0);
    }

    #[test]
    fn malformed_entries_are_skipped_not_fatal() {
        let p = ok(concat!(
            "#EXTM3U\n",
            "#EXTINF:-1 tvg-id=\"a\",\n", // no title; falls back to tvg-id
            "http://s.example/a\n",
            "#EXTINF:-1 group-title=\"Lost\"\n", // no comma, no name at all
            "http://s.example/b\n",
            "#EXTINF:-1,No address\n", // followed by another EXTINF
            "#EXTINF:-1,Bad scheme\n",
            "javascript:alert(1)\n",
            "#EXTINF:-1,Local file\n",
            "file:///etc/passwd\n",
            "http://s.example/orphan\n", // address without EXTINF
            "#EXTINF:-1 tvg-id=\"unterminated,Broken quote\n", // quote never closes
            "http://s.example/c\n",
            "#EXTINF:-1,Trailing entry\n", // file ends before its address
        ));
        assert_eq!(
            p.channels
                .iter()
                .map(|c| c.name.as_str())
                .collect::<Vec<_>>(),
            ["a", "unterminated,Broken quote"]
        );
        assert_eq!(p.skipped, 6);
        assert_eq!(p.warnings.len(), 6);
        assert!(
            p.warnings
                .iter()
                .all(|w| !w.contains("s.example") && !w.contains("passwd")),
            "warnings must not echo addresses: {:?}",
            p.warnings
        );
    }

    #[test]
    fn unicode_names_and_control_characters() {
        let p = ok("#EXTM3U\n#EXTINF:-1 group-title=\"ニュース\",Телеканал \u{1F4FA} Ελλάδα\u{0007}\u{200B}\nhttp://s.example/u\n");
        assert_eq!(p.channels[0].name, "Телеканал \u{1F4FA} Ελλάδα\u{200B}");
        assert_eq!(p.channels[0].group.as_deref(), Some("ニュース"));
        let long = "x".repeat(1000);
        assert_eq!(
            ok(&format!("#EXTM3U\n#EXTINF:-1,{long}\nhttp://s.example/l\n")).channels[0]
                .name
                .chars()
                .count(),
            256
        );
    }

    #[test]
    fn group_and_logo_metadata() {
        let p = ok(concat!(
            "#EXTM3U\n",
            "#EXTINF:-1 tvg-logo=\"javascript:alert(1)\",Bad logo\n#EXTGRP:Sport\nhttp://s.example/1\n",
            "#EXTINF:-1 logo=\"http://img.example/l.png\" group-title=\"Film, Drama\",Quoted comma\nhttp://s.example/2\n",
            "#EXTINF:-1 tvg-logo=\"data:image/png;base64,AAAA\",Data logo\nhttp://s.example/3\n",
        ));
        let c = &p.channels;
        assert_eq!(
            (c[0].logo.as_ref(), c[0].group.as_deref()),
            (None, Some("Sport"))
        );
        assert_eq!(
            (
                c[1].logo.as_deref(),
                c[1].group.as_deref(),
                c[1].name.as_str()
            ),
            (
                Some("http://img.example/l.png"),
                Some("Film, Drama"),
                "Quoted comma"
            )
        );
        assert_eq!(c[2].logo, None);
    }

    #[test]
    fn duplicate_identifiers() {
        let p = ok(concat!(
            "#EXTM3U\n",
            "#EXTINF:-1 tvg-id=\"one\",One\nhttp://s.example/1\n",
            "#EXTINF:-1 tvg-id=\"one\",One again\nhttp://s.example/1\n", // exact repeat: dropped
            "#EXTINF:-1 tvg-id=\"one\",One backup\nhttp://s.example/1b\n", // alternate stream: kept
            "#EXTINF:-1,No id\nhttp://s.example/x\n",
            "#EXTINF:-1,No id copy\nhttp://s.example/x\n", // exact repeat by address
        ));
        assert_eq!(p.duplicates, 2);
        assert_eq!(
            p.channels
                .iter()
                .map(|c| c.key.as_str())
                .collect::<Vec<_>>()[..2],
            ["tvg:one", "tvg:one#2"]
        );
        assert_eq!(p.channels.len(), 3);
    }

    #[test]
    fn stream_address_schemes_and_lengths() {
        for good in [
            "https://s.example/a",
            "rtmp://s.example/live",
            "udp://239.0.0.1:1234",
            "rtsp://s.example/x",
        ] {
            assert_eq!(
                ok(&format!("#EXTM3U\n#EXTINF:-1,A\n{good}\n"))
                    .channels
                    .len(),
                1,
                "{good}"
            );
        }
        for bad in [
            "ftp://s.example/a",
            "data:text/plain,hi",
            "not a url",
            "/relative/path.ts",
        ] {
            let p = ok(&format!("#EXTM3U\n#EXTINF:-1,A\n{bad}\n"));
            assert_eq!((p.channels.len(), p.skipped), (0, 1), "{bad}");
        }
        let long = format!(
            "#EXTM3U\n#EXTINF:-1,A\nhttp://s.example/{}\n",
            "a".repeat(5000)
        );
        assert_eq!(ok(&long).skipped, 1);
        let huge_line = format!(
            "#EXTM3U\n#EXTINF:-1 tvg-name=\"{}\",A\nhttp://s.example/a\n",
            "a".repeat(9000)
        );
        let p = ok(&huge_line);
        assert_eq!((p.channels.len(), p.skipped), (0, 2));
    }

    #[test]
    fn excessive_entries_are_refused() {
        let mut text = String::from("#EXTM3U\n");
        for i in 0..=MAX_ENTRIES {
            text.push_str(&format!("#EXTINF:-1,C{i}\nhttp://s.example/{i}\n"));
        }
        assert_eq!(code(&text), ErrorCode::TooManyEntries);
        let at_limit = text.rsplitn(3, '\n').nth(2).unwrap().to_owned(); // drop the last entry
        assert_eq!(ok(&at_limit).channels.len(), MAX_ENTRIES);
    }

    #[test]
    fn hls_playlists_are_not_channel_lists() {
        let media = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:1\n#EXTINF:6.0,\nseg1.ts\n#EXTINF:6.0,\nseg2.ts\n";
        assert_eq!(code(media), ErrorCode::HlsMedia);
        let master = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1280000,RESOLUTION=1280x720\nhttps://s.example/720.m3u8\n";
        assert_eq!(code(master), ErrorCode::HlsMaster);
    }

    #[test]
    fn web_pages_xml_and_plain_text_are_rejected() {
        assert_eq!(
            code("<!DOCTYPE html><html><body>Login</body></html>"),
            ErrorCode::WebPage
        );
        assert_eq!(code("\n  <html lang=\"en\"><head>"), ErrorCode::WebPage);
        assert_eq!(
            code("<?xml version=\"1.0\"?><tv></tv>"),
            ErrorCode::NotPlaylist
        );
        assert_eq!(
            code("http://s.example/a\nhttp://s.example/b\n"),
            ErrorCode::NotPlaylist
        );
    }

    #[test]
    fn tolerates_bom_crlf_and_a_missing_header() {
        let p = ok("\u{feff}#EXTM3U\r\n#EXTINF:-1,Windows\r\nhttp://s.example/w\r\n");
        assert_eq!(p.channels[0].name, "Windows");
        assert_eq!(p.channels[0].stream_url, "http://s.example/w");
        let p = ok("#EXTINF:-1,No header\nhttp://s.example/n\n");
        assert_eq!(p.channels.len(), 1);
        assert!(p.warnings[0].contains("#EXTM3U header is missing"));
    }

    #[test]
    fn attributes_without_a_duration_or_quotes() {
        let p = ok("#EXTM3U\n#EXTINF:tvg-id=bare group-title=Kids,Cartoons\nhttp://s.example/k\n");
        assert_eq!(
            (
                p.channels[0].tvg_id.as_deref(),
                p.channels[0].group.as_deref()
            ),
            (Some("bare"), Some("Kids"))
        );
        let p = ok("#EXTM3U\n#EXTINF:-1 tvg-chno=\"0\" tvg-id=\"\",Zero\nhttp://s.example/z\n");
        assert_eq!(
            (p.channels[0].chno, p.channels[0].tvg_id.as_ref()),
            (None, None)
        );
    }

    #[test]
    fn parses_catchup_attributes_and_formats_timeshift_urls() {
        let text = "#EXTM3U\n#EXTINF:-1 tvg-id=\"bbc1\" catchup=\"append\" catchup-days=\"7\" catchup-source=\"?playpath=${start}&duration=${duration}\",BBC One\nhttp://example.com/live/bbc1.m3u8\n";
        let p = ok(text);
        let ch = &p.channels[0];
        assert_eq!(ch.catchup.as_deref(), Some("append"));
        assert_eq!(ch.catchup_days, Some(7));
        assert_eq!(
            ch.catchup_source.as_deref(),
            Some("?playpath=${start}&duration=${duration}")
        );

        let formatted = format_m3u_catchup_url(
            &ch.stream_url,
            ch.catchup.as_deref(),
            ch.catchup_source.as_deref(),
            1731636000,
            60,
            1731639600,
        );
        assert_eq!(
            formatted,
            "http://example.com/live/bbc1.m3u8?playpath=1731636000&duration=3600"
        );

        // Flussonic mode
        let flussonic = format_m3u_catchup_url(
            "http://stream.example/live/stream1/index.m3u8",
            Some("flussonic"),
            None,
            1731636000,
            30,
            1731637800,
        );
        assert_eq!(
            flussonic,
            "http://stream.example/live/stream1/archive/1731636000/1800.m3u8"
        );

        // Shift mode
        let shift = format_m3u_catchup_url(
            "http://stream.example/live/stream2",
            Some("shift"),
            None,
            1731636000,
            45,
            1731638700,
        );
        assert!(shift.contains("http://stream.example/live/stream2?timeshift="));
        assert!(shift.contains("&duration=2700"));
    }

    #[test]
    fn parses_extvlcopt_headers() {
        let text = "#EXTM3U\n#EXTINF:-1,Channel 1\n#EXTVLCOPT:http-user-agent=CustomUA/2.0\n#EXTVLCOPT:http-referrer=https://ref.example/\nhttp://stream.example/live.m3u8\n";
        let p = ok(text);
        let ch = &p.channels[0];
        assert_eq!(ch.http_user_agent.as_deref(), Some("CustomUA/2.0"));
        assert_eq!(ch.http_referrer.as_deref(), Some("https://ref.example/"));
        assert_eq!(
            ch.stream_url,
            "http://stream.example/live.m3u8|User-Agent=CustomUA/2.0&Referer=https://ref.example/"
        );
        assert_eq!(ch.stream_display, "http://stream.example/…");
    }

    #[test]
    fn parses_exthttp_json_headers() {
        let text = "#EXTM3U\n#EXTINF:-1,Channel 2\n#EXTHTTP:{\"User-Agent\": \"KPlayer/1.0\", \"Referer\": \"https://portal.example/\"}\nhttp://stream.example/live2.m3u8\n";
        let p = ok(text);
        let ch = &p.channels[0];
        assert_eq!(ch.http_user_agent.as_deref(), Some("KPlayer/1.0"));
        assert_eq!(ch.http_referrer.as_deref(), Some("https://portal.example/"));
        assert_eq!(
            ch.stream_url,
            "http://stream.example/live2.m3u8|User-Agent=KPlayer/1.0&Referer=https://portal.example/"
        );
        assert_eq!(ch.stream_display, "http://stream.example/…");
    }

    #[test]
    fn parses_pipe_syntax_headers_and_preserves_clean_display() {
        let text = "#EXTM3U\n#EXTINF:-1,Pipe Channel\nhttp://stream.example/live.m3u8|User-Agent=CustomPlayer/1.0&Referer=https://portal.example/\n";
        let p = ok(text);
        let ch = &p.channels[0];
        assert_eq!(ch.http_user_agent.as_deref(), Some("CustomPlayer/1.0"));
        assert_eq!(ch.http_referrer.as_deref(), Some("https://portal.example/"));
        assert_eq!(
            ch.stream_url,
            "http://stream.example/live.m3u8|User-Agent=CustomPlayer/1.0&Referer=https://portal.example/"
        );
        assert_eq!(ch.stream_display, "http://stream.example/…");
    }
}
