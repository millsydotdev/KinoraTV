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
    /// The address as written in the playlist, kept for a future player. May contain account
    /// names, passwords or tokens: never log it or show it; show `stream_display` instead.
    pub stream_url: String,
    /// `scheme://host[:port]/…`, safe to show.
    pub stream_display: String,
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
            .field("stream", &self.stream_display)
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
            });
            continue;
        }
        if let Some(group) = line.strip_prefix("#EXTGRP:") {
            if let Some(p) = pending.as_mut() {
                p.group = clean(group);
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
        let attr = |k: &str| p.attrs.get(k).and_then(|v| clean(v));
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
        if !exact.insert((tvg_id.clone(), stream_url.clone())) {
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
            tvg_id,
            stream_url,
            stream_display,
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

/// The address as written, plus its safe display form.
fn stream_address(line: &str) -> Option<(String, String)> {
    if line.len() > MAX_STREAM_URL {
        return None;
    }
    let url = Url::parse(line).ok()?;
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
                stream_url: "https://streams.example/news.m3u8".into(),
                stream_display: "https://streams.example/…".into(),
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
}
