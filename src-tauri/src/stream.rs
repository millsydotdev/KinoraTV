//! Guarded HLS playback transport (`kstream`). The webview never receives an upstream address: it
//! asks for `kstream://localhost/<handle>`, and this module fetches the resource through the D2
//! guarded client (`fetch.rs`), rewrites playlists so every nested resource gets its own handle
//! (`hls.rs`), and answers with a bounded, buffered response.
//!
//! Verified in the D4A spike on WebKitGTK 2.54.1 / Tauri 2.12.5 / wry 0.57.0:
//! - fetch/XHR can load custom-scheme resources; WebKit enforces CORS on them and sends
//!   `Origin: tauri://localhost`. `<video src>` cannot use the scheme, so playback is hls.js + MSE.
//! - wry hands Tauri one complete body per response and never reports a cancelled request. So
//!   every response is bounded (size, time, session byte budget), and cancellation is ours: a
//!   session owns a watch sender, and dropping the session (close, or opening the next stream)
//!   ends every in-flight wait at once; the handler then answers 410 straight away.

use std::collections::{HashMap, VecDeque};
use std::future::Future;
use std::pin::pin;
use std::sync::{Arc, Mutex};
use std::task::Poll;
use std::time::Duration;

use reqwest::Url;
use serde::Serialize;
use tokio::sync::{watch, Semaphore};

use crate::dash;
use crate::fetch::{self, Fetched, Policy};
use crate::hls::{self, Kind, MintError, RewriteError, HANDLE_BASE};
use crate::ingest::{ErrorCode, IngestError};

/// Limits for one stream session. Each has a reason; see the D4A report for the numbers.
#[derive(Debug, Clone)]
pub struct Limits {
    pub connect: Duration,
    /// Longest silence while reading a response: live segments arrive every 2-10 s.
    pub idle: Duration,
    pub playlist_total: Duration,
    pub segment_total: Duration,
    pub playlist_bytes: usize,
    pub segment_bytes: usize,
    pub key_bytes: usize,
    /// Bytes buffered across all in-flight requests of the session.
    pub budget_bytes: usize,
    pub concurrent: usize,
    pub handles: usize,
    pub uris_per_playlist: usize,
    pub variants: usize,
}

impl Default for Limits {
    fn default() -> Self {
        const MIB: usize = 1024 * 1024;
        Self {
            connect: Duration::from_secs(10),
            idle: Duration::from_secs(15),
            playlist_total: Duration::from_secs(10),
            segment_total: Duration::from_secs(60),
            playlist_bytes: 4 * MIB,
            segment_bytes: 32 * MIB,
            key_bytes: 1024, // an AES-128 key is 16 bytes
            budget_bytes: 64 * MIB,
            concurrent: 4,
            handles: 20_000,
            uris_per_playlist: 20_000,
            variants: 32,
        }
    }
}

/// Returned by `open_stream`. Mirrored by `OpenedStream` in `src/lib/native.ts`.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Opened {
    /// `kstream://localhost/<handle>` for the root playlist; the only address the page gets.
    pub url: String,
    /// Pass to `close_stream`; closing an older session never touches a newer one.
    pub session: u64,
    /// `hls` or `dash`: which player the page needs.
    pub format: &'static str,
}

struct Entry {
    url: Url,
    kind: Kind,
}

struct Session {
    id: u64,
    handles: HashMap<String, Entry>,
    by_url: HashMap<(String, Kind), String>,
    /// Insertion order of minted handles, for deterministic oldest-first eviction. The root is not
    /// in it, so it is never evicted.
    order: VecDeque<String>,
    /// Dropped with the session: every in-flight wait on `cancelled` then ends.
    _cancel: watch::Sender<()>,
    cancelled: watch::Receiver<()>,
    client: reqwest::Client,
    requests: Arc<Semaphore>,
    budget: Arc<Semaphore>,
}

/// One HTTP-style answer for the protocol handler.
pub struct Reply {
    pub status: u16,
    pub headers: Vec<(&'static str, String)>,
    pub body: Vec<u8>,
    /// Keeps the bytes charged to the session budget until the reply is handed to the webview.
    _budget: Option<tokio::sync::OwnedSemaphorePermit>,
}

pub struct Streams {
    session: Mutex<Option<Session>>,
    next_id: Mutex<u64>,
    policy: Policy,
    limits: Limits,
    /// The exact page origin allowed to read stream responses (no wildcard, never reflected).
    origin: String,
}

/// Paths that are clearly not HLS. Anything else is tried as HLS and refused with 415 if it is not.
const NOT_HLS: &[&str] = &[
    ".ts", ".mp4", ".m4v", ".mkv", ".webm", ".avi", ".mov", ".flv", ".mp3", ".aac", ".m4a",
];
const PLAYLIST_TYPE: &str = "application/vnd.apple.mpegurl";
/// Upstream content types passed through for segments; anything else becomes octet-stream.
const MEDIA_TYPES: &[&str] = &[
    "video/mp2t",
    "video/mp4",
    "audio/mp4",
    "video/iso.segment",
    "audio/aac",
    "audio/mpeg",
    "application/octet-stream",
];

fn unsupported(message: &str) -> IngestError {
    IngestError::new(ErrorCode::UnsupportedStream, message)
}

fn new_handle() -> String {
    let mut bytes = [0u8; 16];
    // The OS random source; without it there is no safe handle, so fail loudly.
    getrandom::fill(&mut bytes).expect("the operating system random source is unavailable");
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Runs `work` unless the session is cancelled first; `None` means cancelled.
async fn unless_cancelled<T>(
    cancelled: &mut watch::Receiver<()>,
    work: impl Future<Output = T>,
) -> Option<T> {
    let mut work = pin!(work);
    // `changed` only fails once the sender (owned by the session) is dropped.
    let mut gone = pin!(async move { while cancelled.changed().await.is_ok() {} });
    std::future::poll_fn(|cx| {
        if let Poll::Ready(v) = work.as_mut().poll(cx) {
            return Poll::Ready(Some(v));
        }
        if gone.as_mut().poll(cx).is_ready() {
            return Poll::Ready(None);
        }
        Poll::Pending
    })
    .await
}

/// A single, well-formed `bytes=start-end` or `bytes=start-` range; anything else is refused.
fn parse_range(values: &[&str]) -> Result<Option<(u64, Option<u64>)>, ()> {
    match values {
        [] => Ok(None),
        [one] => {
            let spec = one.trim().strip_prefix("bytes=").ok_or(())?;
            let (a, b) = spec.split_once('-').ok_or(())?;
            let start = a.parse::<u64>().map_err(|_| ())?;
            let end = if b.is_empty() {
                None
            } else {
                Some(b.parse::<u64>().map_err(|_| ())?)
            };
            if end.is_some_and(|e| e < start) {
                return Err(());
            }
            Ok(Some((start, end)))
        }
        _ => Err(()),
    }
}

impl Streams {
    pub fn new(policy: Policy, limits: Limits, origin: String) -> Self {
        Self {
            session: Mutex::new(None),
            next_id: Mutex::new(0),
            policy,
            limits,
            origin,
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Option<Session>> {
        // A panic while holding the lock cannot leave the table half-written in a harmful way.
        self.session.lock().unwrap_or_else(|p| p.into_inner())
    }

    /// Starts a session for `raw` (an http(s) HLS address) and ends the previous one, cancelling
    /// its in-flight work. Nothing is fetched until the page asks for the returned address.
    pub fn open(&self, raw: &str) -> Result<Opened, IngestError> {
        let scheme = raw
            .trim()
            .split_once(':')
            .map(|(s, _)| s.to_ascii_lowercase())
            .unwrap_or_default();
        if !matches!(scheme.as_str(), "http" | "https") {
            let shown = if scheme
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "+.-".contains(c))
                && !scheme.is_empty()
            {
                scheme
            } else {
                "this".into()
            };
            return Err(unsupported(&format!("This stream uses a {shown} address, which Kinora cannot play. Only HLS streams over http(s) are supported.")));
        }
        let url = fetch::check_url(raw, &self.policy).map_err(|e| {
            if e.code == ErrorCode::InvalidUrl && e.message.contains("username and password") {
                unsupported(
                    "This stream's address contains sign-in details, which Kinora does not use.",
                )
            } else {
                e
            }
        })?;
        let path = url.path().to_ascii_lowercase();
        if NOT_HLS.iter().any(|ext| path.ends_with(ext)) {
            return Err(unsupported(
                "This is a direct video file. Kinora plays HLS and DASH streams, not video files.",
            ));
        }
        let root_kind = if path.ends_with(".mpd") {
            Kind::Manifest
        } else {
            Kind::Playlist { depth: 0 }
        };
        let stream_policy = Policy {
            connect_timeout: self.limits.connect,
            read_timeout: Some(self.limits.idle),
            total_timeout: self.limits.segment_total,
            ..self.policy.clone()
        };
        let client = fetch::guarded_client(&stream_policy)?;
        let id = {
            let mut next = self.next_id.lock().unwrap_or_else(|p| p.into_inner());
            *next += 1;
            *next
        };
        let (sender, cancelled) = watch::channel(());
        let root = new_handle();
        let mut session = Session {
            id,
            handles: HashMap::new(),
            by_url: HashMap::new(),
            order: VecDeque::new(),
            _cancel: sender,
            cancelled,
            client,
            requests: Arc::new(Semaphore::new(self.limits.concurrent)),
            budget: Arc::new(Semaphore::new(self.limits.budget_bytes)),
        };
        session
            .by_url
            .insert((url.to_string(), root_kind), root.clone());
        session.handles.insert(
            root.clone(),
            Entry {
                url,
                kind: root_kind,
            },
        );
        *self.lock() = Some(session); // drops the previous session, cancelling its work
        Ok(Opened {
            url: format!("{HANDLE_BASE}{root}"),
            session: id,
            format: if root_kind == Kind::Manifest {
                "dash"
            } else {
                "hls"
            },
        })
    }

    /// Ends `session` if it is still the current one; an older id never closes a newer session.
    pub fn close(&self, session: u64) {
        let mut current = self.lock();
        if current.as_ref().is_some_and(|s| s.id == session) {
            *current = None;
        }
    }

    /// Gives `url` a handle in `session`, reusing one for the same address and kind.
    fn mint(&self, session: u64, url: Url, kind: Kind) -> Result<String, MintError> {
        let url = fetch::check_url(url.as_str(), &self.policy).map_err(|_| MintError::Blocked)?;
        let mut current = self.lock();
        let s = current
            .as_mut()
            .filter(|s| s.id == session)
            .ok_or(MintError::Gone)?;
        let key = (url.to_string(), kind);
        if let Some(existing) = s.by_url.get(&key) {
            return Ok(existing.clone());
        }
        // Full: retire the oldest handles first. A request already in flight holds its own copy
        // of the address, so it completes; later requests for a retired handle get 404 and hls.js
        // reloads the playlist, which mints fresh handles.
        while s.handles.len() >= self.limits.handles {
            let Some(old) = s.order.pop_front() else {
                break;
            };
            if let Some(entry) = s.handles.remove(&old) {
                s.by_url.remove(&(entry.url.to_string(), entry.kind));
            }
        }
        let handle = new_handle();
        s.order.push_back(handle.clone());
        s.by_url.insert(key, handle.clone());
        s.handles.insert(handle.clone(), Entry { url, kind });
        Ok(handle)
    }

    fn reply(&self, status: u16, mut headers: Vec<(&'static str, String)>, body: Vec<u8>) -> Reply {
        headers.extend([
            ("Access-Control-Allow-Origin", self.origin.clone()),
            ("Vary", "Origin".into()),
            ("Cache-Control", "no-store".into()),
            ("X-Content-Type-Options", "nosniff".into()),
        ]);
        Reply {
            status,
            headers,
            body,
            _budget: None,
        }
    }

    fn fail(&self, status: u16, message: &str) -> Reply {
        self.reply(
            status,
            vec![("Content-Type", "text/plain; charset=utf-8".into())],
            message.as_bytes().to_vec(),
        )
    }

    /// Answers one `kstream` request. `ranges` holds every Range header value the request had.
    pub async fn serve(
        &self,
        method: &str,
        path: &str,
        origin: Option<&str>,
        ranges: &[&str],
    ) -> Reply {
        if origin.is_some_and(|o| o != self.origin) {
            return self.fail(403, "This origin may not read streams.");
        }
        if method == "OPTIONS" {
            let headers = vec![
                ("Access-Control-Allow-Methods", "GET".into()),
                ("Access-Control-Allow-Headers", "Range".into()),
                ("Access-Control-Max-Age", "600".into()),
            ];
            return self.reply(204, headers, Vec::new());
        }
        if method != "GET" {
            return self.fail(405, "Only GET is supported.");
        }
        let path = path.trim_start_matches('/');
        let (handle, rest) = path.split_once('/').unwrap_or((path, ""));
        if handle.len() != 32
            || !handle
                .bytes()
                .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
        {
            return self.fail(404, "Unknown stream resource.");
        }
        let Ok(range) = parse_range(ranges) else {
            return self.fail(416, "Only a single byte range is supported.");
        };
        let found = self.lock().as_ref().and_then(|s| {
            s.handles.get(handle).map(|e| {
                (
                    e.url.clone(),
                    e.kind,
                    s.id,
                    s.cancelled.clone(),
                    s.client.clone(),
                    s.requests.clone(),
                    s.budget.clone(),
                )
            })
        });
        let Some((url, kind, session, mut cancelled, client, requests, budget)) = found else {
            return self.fail(404, "Unknown or expired stream resource.");
        };
        // Only a prefix handle has anything after it, and nothing can leave its host.
        let url = match (kind, rest.is_empty()) {
            (Kind::Prefix, false) => {
                let Some(target) = dash::under_prefix(&url, rest) else {
                    return self.fail(
                        403,
                        "The stream refers to an address Kinora does not fetch from.",
                    );
                };
                let Ok(target) = fetch::check_url(target.as_str(), &self.policy) else {
                    return self.fail(
                        403,
                        "The stream refers to an address Kinora does not fetch from.",
                    );
                };
                target
            }
            (Kind::Prefix, true) => return self.fail(404, "Unknown stream resource."),
            (_, false) => return self.fail(404, "Unknown stream resource."),
            (_, true) => url,
        };
        let (total, cap) = match kind {
            Kind::Playlist { .. } | Kind::Manifest => {
                (self.limits.playlist_total, self.limits.playlist_bytes)
            }
            Kind::Key => (self.limits.playlist_total, self.limits.key_bytes),
            Kind::Segment | Kind::Init | Kind::Prefix => {
                (self.limits.segment_total, self.limits.segment_bytes)
            }
        };
        if range.is_some() && !matches!(kind, Kind::Segment | Kind::Init | Kind::Prefix) {
            return self.fail(416, "Byte ranges apply to media segments only.");
        }
        let range_header = range.map(|(s, e)| match e {
            Some(e) => format!("bytes={s}-{e}"),
            None => format!("bytes={s}-"),
        });
        let work = async {
            // Waiting for a request slot counts towards the request's own time limit.
            let _slot = tokio::time::timeout(total, requests.acquire_owned())
                .await
                .ok()?
                .ok()?;
            Some(
                fetch::fetch_media(
                    &client,
                    &url,
                    &self.policy,
                    range_header.as_deref(),
                    total,
                    cap,
                    &budget,
                )
                .await,
            )
        };
        let fetched = match unless_cancelled(&mut cancelled, work).await {
            None => return self.fail(410, "The stream was closed."),
            Some(None) => return self.fail(503, "The stream is busy; try again."),
            Some(Some(Err(e))) => return self.upstream_error(&e),
            Some(Some(Ok(f))) => f,
        };
        match kind {
            Kind::Playlist { depth } => self.playlist(session, depth, fetched),
            Kind::Key => {
                let Fetched { body, budget, .. } = fetched;
                let mut r = self.reply(
                    200,
                    vec![("Content-Type", "application/octet-stream".into())],
                    body,
                );
                r._budget = Some(budget);
                r
            }
            Kind::Manifest => self.manifest(session, fetched),
            Kind::Segment | Kind::Init | Kind::Prefix => self.media(range, fetched),
        }
    }

    fn manifest(&self, session: u64, fetched: Fetched) -> Reply {
        let text = String::from_utf8_lossy(&fetched.body);
        let mut mint = |url: Url, kind: Kind| self.mint(session, url, kind);
        match dash::rewrite(
            &text,
            &fetched.final_url,
            self.limits.uris_per_playlist,
            &mut mint,
        ) {
            Ok(out) => self.reply(
                200,
                vec![("Content-Type", "application/dash+xml".into())],
                out.into_bytes(),
            ),
            Err(e) => self.rewrite_failure(e, "This stream's manifest could not be read."),
        }
    }

    fn upstream_error(&self, e: &IngestError) -> Reply {
        match e.code {
            ErrorCode::Blocked | ErrorCode::InvalidUrl => self.fail(
                403,
                "The stream refers to an address Kinora does not fetch from.",
            ),
            ErrorCode::TooLarge => self.fail(413, "A stream resource is larger than the limit."),
            ErrorCode::Timeout => self.fail(504, "The stream server did not answer in time."),
            ErrorCode::Busy => {
                self.fail(503, "Too much stream data is in flight; try again shortly.")
            }
            _ => self.fail(
                502,
                "The stream server could not be reached or refused the request.",
            ),
        }
    }

    fn playlist(&self, session: u64, depth: u8, fetched: Fetched) -> Reply {
        let text = String::from_utf8_lossy(&fetched.body);
        let limits = hls::Limits {
            max_uris: self.limits.uris_per_playlist,
            max_variants: self.limits.variants,
        };
        let mut mint = |url: Url, kind: Kind| self.mint(session, url, kind);
        match hls::rewrite(&text, &fetched.final_url, depth, limits, &mut mint) {
            Ok(out) => self.reply(
                200,
                vec![("Content-Type", PLAYLIST_TYPE.into())],
                out.into_bytes(),
            ),
            Err(e) => self.rewrite_failure(
                e,
                "This stream is not in a format Kinora can play: HLS or DASH.",
            ),
        }
    }

    fn rewrite_failure(&self, e: RewriteError, not_stream: &str) -> Reply {
        match e {
            RewriteError::NotHls => self.fail(415, not_stream),
            RewriteError::Drm => self.fail(
                422,
                "This stream is DRM-protected, which Kinora does not support.",
            ),
            RewriteError::Unsupported(what) => self.fail(
                422,
                &format!("This stream uses {what}, which Kinora does not support."),
            ),
            RewriteError::TooMany(what) => {
                self.fail(422, &format!("This stream lists too many {what}."))
            }
            RewriteError::Mint(MintError::Blocked) => self.fail(
                403,
                "The stream refers to an address Kinora does not fetch from.",
            ),
            RewriteError::Mint(MintError::Gone) => self.fail(410, "The stream was closed."),
        }
    }

    fn media(&self, range: Option<(u64, Option<u64>)>, fetched: Fetched) -> Reply {
        let Fetched {
            status,
            content_type,
            content_range,
            body,
            budget,
            ..
        } = fetched;
        let ctype = content_type
            .map(|t| {
                t.split(';')
                    .next()
                    .unwrap_or_default()
                    .trim()
                    .to_ascii_lowercase()
            })
            .filter(|t| MEDIA_TYPES.contains(&t.as_str()))
            .unwrap_or_else(|| "application/octet-stream".into());
        let mut headers = vec![("Content-Type", ctype)];
        let (status, body) = match (range, status) {
            // The server honoured the range: pass its Content-Range on if it is well formed.
            (Some(_), 206) => match content_range.filter(|c| valid_content_range(c)) {
                Some(c) => {
                    headers.push(("Content-Range", c));
                    (206, body)
                }
                None => return self.fail(502, "The stream server sent an unreadable byte range."),
            },
            // The server ignored the range and sent everything: cut the range out here.
            (Some((start, end)), _) => {
                let len = body.len() as u64;
                let end = end.map_or(len.saturating_sub(1), |e| e.min(len.saturating_sub(1)));
                if start >= len || start > end {
                    return self.fail(416, "The requested range is outside the resource.");
                }
                headers.push(("Content-Range", format!("bytes {start}-{end}/{len}")));
                (206, body[start as usize..=end as usize].to_vec())
            }
            (None, _) => (200, body),
        };
        let mut r = self.reply(status, headers, body);
        r._budget = Some(budget);
        r
    }
}

fn valid_content_range(value: &str) -> bool {
    let Some(rest) = value.strip_prefix("bytes ") else {
        return false;
    };
    let Some((span, total)) = rest.split_once('/') else {
        return false;
    };
    let Some((a, b)) = span.split_once('-') else {
        return false;
    };
    a.parse::<u64>().is_ok()
        && b.parse::<u64>().is_ok()
        && (total == "*" || total.parse::<u64>().is_ok())
}

/// Builds the webview response. Only the headers assembled by `Streams` are sent.
pub fn into_response(reply: Reply) -> tauri::http::Response<Vec<u8>> {
    let mut builder = tauri::http::Response::builder().status(reply.status);
    for (name, value) in &reply.headers {
        builder = builder.header(*name, value.as_str());
    }
    builder.body(reply.body).unwrap_or_else(|_| {
        tauri::http::Response::builder()
            .status(500)
            .body(Vec::new())
            .unwrap_or_default()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fetch::test_support::{http, http_bytes, run, server};
    use std::sync::atomic::Ordering;
    use std::time::Instant;

    const ORIGIN: &str = "tauri://localhost";
    const SECRET: &str = "token=SECRET123";

    fn policy() -> Policy {
        Policy {
            allow_loopback: true,
            ..Policy::default()
        }
    }
    fn small() -> Limits {
        Limits {
            playlist_total: Duration::from_secs(2),
            segment_total: Duration::from_secs(2),
            idle: Duration::from_secs(1),
            ..Limits::default()
        }
    }
    fn streams(limits: Limits) -> Streams {
        Streams::new(policy(), limits, ORIGIN.into())
    }
    fn handle_of(url: &str) -> String {
        url.strip_prefix(HANDLE_BASE).unwrap().to_owned()
    }
    fn get(s: &Streams, handle: &str) -> Reply {
        run(s.serve("GET", &format!("/{handle}"), Some(ORIGIN), &[]))
    }
    fn text(r: &Reply) -> String {
        String::from_utf8_lossy(&r.body).into_owned()
    }
    fn header(r: &Reply, name: &str) -> Option<String> {
        r.headers
            .iter()
            .find(|(n, _)| *n == name)
            .map(|(_, v)| v.clone())
    }
    /// Handles from a rewritten playlist, in order.
    fn handles(body: &str) -> Vec<String> {
        body.split(['\n', '"'])
            .filter_map(|p| p.strip_prefix(HANDLE_BASE))
            .map(str::to_owned)
            .collect()
    }

    const SEGMENT: &[u8] = b"\x47\x40\x00\x10fake transport stream payload 0123456789";

    fn hls_server() -> u16 {
        server(|path, port, head| match path.split('?').next().unwrap_or_default() {
            "/live/master.m3u8" => http("200 OK", "Content-Type: application/vnd.apple.mpegurl\r\n", "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\nlow/media.m3u8?token=SECRET123\n"),
            "/moved.m3u8" => http("302 Found", &format!("Location: http://127.0.0.1:{port}/live/master.m3u8\r\n"), ""),
            p if p.starts_with("/live/low/media.m3u8") => http("200 OK", "", concat!(
                "#EXTM3U\n#EXT-X-TARGETDURATION:2\n",
                "#EXT-X-KEY:METHOD=AES-128,URI=\"../key.bin\"\n",
                "#EXTINF:2,\nseg1.ts\n#EXTINF:2,\n/abs/seg2.ts\n#EXT-X-ENDLIST\n",
            )),
            "/live/key.bin" => http_bytes("200 OK", "Content-Type: application/octet-stream\r\n", &[7u8; 16]),
            "/live/low/seg1.ts" => {
                // Echo the Range header so tests can see exactly what was forwarded.
                let range = head.lines().find(|l| l.to_ascii_lowercase().starts_with("range:")).and_then(|l| l.split_once(':')).map(|(_, v)| v.trim().to_owned());
                if let Some(r) = range.as_deref().and_then(|v| v.strip_prefix("bytes=")) {
                    let (a, b) = r.split_once('-').unwrap();
                    let (a, b): (usize, usize) = (a.parse().unwrap(), b.parse().unwrap_or(SEGMENT.len() - 1));
                    http_bytes("206 Partial Content", &format!("Content-Type: video/MP2T; x=1\r\nContent-Range: bytes {a}-{b}/{}\r\nSet-Cookie: s=1\r\nX-Upstream: secret\r\n", SEGMENT.len()), &SEGMENT[a..=b])
                } else {
                    http_bytes("200 OK", "Content-Type: video/mp2t\r\nSet-Cookie: s=1\r\nX-Upstream: secret\r\n", SEGMENT)
                }
            }
            "/abs/seg2.ts" => http_bytes("200 OK", "Content-Type: text/html\r\n", SEGMENT),
            "/ignores-range.ts" => http_bytes("200 OK", "Content-Type: video/mp2t\r\n", SEGMENT),
            "/big.ts" => http_bytes("200 OK", "Content-Type: video/mp2t\r\n", &vec![0u8; 3000]),
            "/to-private.m3u8" => http("302 Found", "Location: http://10.1.2.3/x.m3u8\r\n", ""),
            "/private-segment.m3u8" => http("200 OK", "", "#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2,\nhttp://192.168.1.1/seg.ts\n"),
            "/channels.m3u" => http("200 OK", "", "#EXTM3U\n#EXTINF:-1,Channel\nhttp://c.example/a.m3u8\n"),
            "/drm.m3u8" => http("200 OK", "", "#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI=\"skd://k\"\n#EXTINF:2,\na.ts\n"),
            _ => http("404 Not Found", "", "no"),
        }).0
    }

    #[test]
    fn handles_are_random_hex_and_never_carry_the_address() {
        let a = new_handle();
        let b = new_handle();
        assert_eq!((a.len(), b.len()), (32, 32));
        assert_ne!(a, b);
        assert!(a
            .bytes()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
        let s = streams(small());
        let opened = s
            .open("https://cdn.example/live/master.m3u8?token=SECRET123")
            .unwrap();
        assert!(
            opened.url.starts_with(HANDLE_BASE)
                && !opened.url.contains("cdn.example")
                && !opened.url.contains("SECRET")
        );
        assert_eq!(handle_of(&opened.url).len(), 32);
    }

    #[test]
    fn open_refuses_what_cannot_be_played_without_fetching() {
        let s = streams(small());
        for (url, code) in [
            (
                "rtmp://live.example/app/stream",
                ErrorCode::UnsupportedStream,
            ),
            ("udp://@239.0.0.1:1234", ErrorCode::UnsupportedStream),
            (
                "https://alice:pw@cdn.example/a.m3u8",
                ErrorCode::UnsupportedStream,
            ),
            (
                "http://provider.example/live/user/pass/123.ts",
                ErrorCode::UnsupportedStream,
            ),
            (
                "https://cdn.example/movie.mp4",
                ErrorCode::UnsupportedStream,
            ),
            ("http://192.168.1.10/live.m3u8", ErrorCode::Blocked),
            ("http://localhost/live.m3u8", ErrorCode::Blocked),
            ("not a url", ErrorCode::UnsupportedStream),
        ] {
            let e = s.open(url).unwrap_err();
            assert_eq!(e.code, code, "{url}: {}", e.message);
            for secret in ["alice", "pw", "user/pass", "239.0.0.1"] {
                assert!(
                    !e.message.contains(secret),
                    "{url}: message leaks {secret}: {}",
                    e.message
                );
            }
        }
    }

    #[test]
    fn a_master_playlist_plays_through_handles_after_a_redirect() {
        let port = hls_server();
        let s = streams(small());
        let opened = s
            .open(&format!("http://127.0.0.1:{port}/moved.m3u8"))
            .unwrap();
        let master = get(&s, &handle_of(&opened.url));
        assert_eq!(master.status, 200, "{}", text(&master));
        assert_eq!(
            header(&master, "Content-Type").as_deref(),
            Some(PLAYLIST_TYPE)
        );
        let body = text(&master);
        assert!(
            !body.contains("127.0.0.1") && !body.contains("SECRET"),
            "{body}"
        );
        // The variant was resolved against the redirected address (/live/), not /moved.m3u8.
        let media = get(&s, &handles(&body)[0]);
        assert_eq!(media.status, 200, "{}", text(&media));
        let media_body = text(&media);
        let hs = handles(&media_body);
        assert_eq!(hs.len(), 3, "key + two segments: {media_body}");
        let key = get(&s, &hs[0]);
        assert_eq!((key.status, key.body.clone()), (200, vec![7u8; 16]));
        let seg = get(&s, &hs[1]);
        assert_eq!((seg.status, seg.body.as_slice()), (200, SEGMENT));
        assert_eq!(header(&seg, "Content-Type").as_deref(), Some("video/mp2t"));
        // Upstream headers outside the allowlist never come through.
        for r in [&master, &media, &key, &seg] {
            let names: Vec<_> = r.headers.iter().map(|(n, _)| *n).collect();
            assert!(
                names.iter().all(|n| [
                    "Content-Type",
                    "Content-Range",
                    "Access-Control-Allow-Origin",
                    "Vary",
                    "Cache-Control",
                    "X-Content-Type-Options"
                ]
                .contains(n)),
                "{names:?}"
            );
            assert_eq!(
                header(r, "Access-Control-Allow-Origin").as_deref(),
                Some(ORIGIN)
            );
        }
        // An unexpected upstream content type is not passed on.
        assert_eq!(
            header(&get(&s, &hs[2]), "Content-Type").as_deref(),
            Some("application/octet-stream")
        );
    }

    #[test]
    fn exact_origin_cors_and_methods() {
        let s = streams(small());
        let opened = s.open("https://cdn.example/a.m3u8").unwrap();
        let path = format!("/{}", handle_of(&opened.url));
        let other = run(s.serve("GET", &path, Some("https://evil.example"), &[]));
        assert_eq!(other.status, 403);
        assert_eq!(
            header(&other, "Access-Control-Allow-Origin").as_deref(),
            Some(ORIGIN),
            "never reflected"
        );
        let pre = run(s.serve("OPTIONS", &path, Some(ORIGIN), &[]));
        assert_eq!(
            (
                pre.status,
                header(&pre, "Access-Control-Allow-Headers").as_deref()
            ),
            (204, Some("Range"))
        );
        assert_eq!(run(s.serve("POST", &path, Some(ORIGIN), &[])).status, 405);
        assert_eq!(
            run(s.serve("GET", "/../../etc/passwd", Some(ORIGIN), &[])).status,
            404
        );
        assert_eq!(
            run(s.serve("GET", "/https://cdn.example/a.m3u8", Some(ORIGIN), &[])).status,
            404
        );
        assert_eq!(
            run(s.serve("GET", &format!("/{}", "0".repeat(32)), Some(ORIGIN), &[])).status,
            404
        );
    }

    #[test]
    fn byte_ranges_are_validated_forwarded_and_honoured() {
        let port = hls_server();
        let s = streams(small());
        let opened = s
            .open(&format!("http://127.0.0.1:{port}/live/master.m3u8"))
            .unwrap();
        let media = text(&get(
            &s,
            &handles(&text(&get(&s, &handle_of(&opened.url))))[0],
        ));
        let seg = format!("/{}", handles(&media)[1]);
        let r = run(s.serve("GET", &seg, Some(ORIGIN), &["bytes=4-9"]));
        assert_eq!((r.status, r.body.as_slice()), (206, &SEGMENT[4..=9]));
        assert_eq!(
            header(&r, "Content-Range"),
            Some(format!("bytes 4-9/{}", SEGMENT.len()))
        );
        for bad in [
            &["bytes=0-1,4-5"][..],
            &["bytes=-5"],
            &["bytes=9-4"],
            &["items=0-4"],
            &["bytes=0-1", "bytes=2-3"],
        ] {
            assert_eq!(
                run(s.serve("GET", &seg, Some(ORIGIN), bad)).status,
                416,
                "{bad:?}"
            );
        }
        // Ranges on playlists are refused; a server that ignores Range is cut down here.
        assert_eq!(
            run(s.serve(
                "GET",
                &format!("/{}", handle_of(&opened.url)),
                Some(ORIGIN),
                &["bytes=0-1"]
            ))
            .status,
            416
        );
        let ignoring = s
            .mint(
                opened.session,
                Url::parse(&format!("http://127.0.0.1:{port}/ignores-range.ts")).unwrap(),
                Kind::Segment,
            )
            .unwrap();
        let cut = run(s.serve("GET", &format!("/{ignoring}"), Some(ORIGIN), &["bytes=2-5"]));
        assert_eq!((cut.status, cut.body.as_slice()), (206, &SEGMENT[2..=5]));
        assert_eq!(
            run(s.serve(
                "GET",
                &format!("/{ignoring}"),
                Some(ORIGIN),
                &["bytes=999-"]
            ))
            .status,
            416
        );
    }

    #[test]
    #[cfg_attr(
        feature = "loopback-fixtures",
        ignore = "loopback-fixtures opens 127.0.0.1, which this test checks is refused"
    )]
    fn private_destinations_and_redirects_to_them_are_refused() {
        let port = hls_server();
        let s = Streams::new(
            Policy {
                allow_loopback: true,
                ..Policy::default()
            },
            small(),
            ORIGIN.into(),
        );
        let to_private = s
            .open(&format!("http://127.0.0.1:{port}/to-private.m3u8"))
            .unwrap();
        assert_eq!(get(&s, &handle_of(&to_private.url)).status, 403);
        let private_segment = s
            .open(&format!("http://127.0.0.1:{port}/private-segment.m3u8"))
            .unwrap();
        assert_eq!(
            get(&s, &handle_of(&private_segment.url)).status,
            403,
            "no handle is minted for a private address"
        );
        // The production policy refuses loopback outright.
        let prod = Streams::new(Policy::default(), small(), ORIGIN.into());
        assert_eq!(
            prod.open(&format!("http://127.0.0.1:{port}/live/master.m3u8"))
                .unwrap_err()
                .code,
            ErrorCode::Blocked
        );
    }

    #[test]
    fn non_hls_drm_and_oversize_are_reported_by_status() {
        let port = hls_server();
        let s = streams(Limits {
            segment_bytes: 1000,
            ..small()
        });
        let status = |path: &str| {
            let opened = s.open(&format!("http://127.0.0.1:{port}{path}")).unwrap();
            let r = get(&s, &handle_of(&opened.url));
            (r.status, text(&r))
        };
        assert_eq!(status("/channels.m3u").0, 415);
        let drm = status("/drm.m3u8");
        assert_eq!(drm.0, 422);
        assert!(drm.1.contains("DRM"));
        assert_eq!(status("/missing.m3u8").0, 502);
        let opened = s
            .open(&format!("http://127.0.0.1:{port}/live/master.m3u8"))
            .unwrap();
        let big = s
            .mint(
                opened.session,
                Url::parse(&format!("http://127.0.0.1:{port}/big.ts")).unwrap(),
                Kind::Segment,
            )
            .unwrap();
        assert_eq!(get(&s, &big).status, 413);
    }

    #[test]
    fn the_session_byte_budget_is_enforced_as_data_arrives() {
        let port = hls_server();
        // A budget smaller than one 3000-byte segment, though under the per-segment cap.
        let s = streams(Limits {
            budget_bytes: 2000,
            segment_bytes: 10_000,
            ..small()
        });
        let opened = s
            .open(&format!("http://127.0.0.1:{port}/live/master.m3u8"))
            .unwrap();
        let big = s
            .mint(
                opened.session,
                Url::parse(&format!("http://127.0.0.1:{port}/big.ts")).unwrap(),
                Kind::Segment,
            )
            .unwrap();
        assert_eq!(get(&s, &big).status, 503);
        // Once a reply is dropped its bytes go back to the budget.
        let ok = streams(Limits {
            budget_bytes: 4000,
            segment_bytes: 10_000,
            ..small()
        });
        let opened = ok
            .open(&format!("http://127.0.0.1:{port}/live/master.m3u8"))
            .unwrap();
        let big = ok
            .mint(
                opened.session,
                Url::parse(&format!("http://127.0.0.1:{port}/big.ts")).unwrap(),
                Kind::Segment,
            )
            .unwrap();
        for _ in 0..3 {
            assert_eq!(get(&ok, &big).status, 200);
        }
    }

    #[test]
    fn concurrent_requests_are_limited_per_session() {
        let port = hls_server();
        // The slow segment holds the only slot for its 2 s limit; the key's 300 ms limit runs out first.
        let s = Arc::new(streams(Limits {
            concurrent: 1,
            segment_total: Duration::from_secs(2),
            playlist_total: Duration::from_millis(300),
            ..small()
        }));
        let opened = s
            .open(&format!("http://127.0.0.1:{port}/live/master.m3u8"))
            .unwrap();
        let slow = s
            .mint(
                opened.session,
                Url::parse(&format!("http://127.0.0.1:{port}/slow.ts")).unwrap(),
                Kind::Segment,
            )
            .unwrap();
        let fast = s
            .mint(
                opened.session,
                Url::parse(&format!("http://127.0.0.1:{port}/live/key.bin")).unwrap(),
                Kind::Key,
            )
            .unwrap();
        let s2 = s.clone();
        let held = std::thread::spawn(move || {
            run(s2.serve("GET", &format!("/{slow}"), Some(ORIGIN), &[])).status
        });
        std::thread::sleep(Duration::from_millis(150));
        // The only slot is taken by the slow request, so this one times out waiting for it.
        assert_eq!(get(&s, &fast).status, 503);
        assert_eq!(held.join().unwrap(), 504);
    }

    #[test]
    fn closing_cancels_in_flight_work_promptly_and_invalidates_handles() {
        let (port, hits) = server(|_, _, _| {
            http(
                "200 OK",
                "",
                "#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2,\na.ts\n",
            )
        });
        let s = Arc::new(streams(Limits {
            playlist_total: Duration::from_secs(10),
            ..small()
        }));
        let opened = s
            .open(&format!("http://127.0.0.1:{port}/slow/live.m3u8"))
            .unwrap();
        let root = handle_of(&opened.url);
        let s2 = s.clone();
        let started = Instant::now();
        let pending = std::thread::spawn(move || {
            run(s2.serve("GET", &format!("/{root}"), Some(ORIGIN), &[]))
        });
        std::thread::sleep(Duration::from_millis(200));
        assert_eq!(
            hits.load(Ordering::SeqCst),
            1,
            "the request reached the server"
        );
        s.close(opened.session);
        let reply = pending.join().unwrap();
        assert_eq!(reply.status, 410);
        assert!(
            started.elapsed() < Duration::from_secs(1),
            "answered without waiting for the 3 s server: {:?}",
            started.elapsed()
        );
        assert_eq!(
            get(&s, &handle_of(&opened.url)).status,
            404,
            "revoked handles are gone"
        );
    }

    #[test]
    fn a_new_session_ends_the_old_one_but_an_old_close_cannot_end_the_new() {
        let s = streams(small());
        let first = s.open("https://cdn.example/one.m3u8").unwrap();
        let second = s.open("https://cdn.example/two.m3u8").unwrap();
        assert_ne!(first.session, second.session);
        let a = run(s.serve(
            "GET",
            &format!("/{}", handle_of(&first.url)),
            Some(ORIGIN),
            &[],
        ));
        assert_eq!(a.status, 404);
        s.close(first.session); // stale close from the previous channel
        assert!(s.lock().as_ref().is_some_and(|x| x.id == second.session));
        assert_eq!(
            s.mint(
                first.session,
                Url::parse("https://cdn.example/x.ts").unwrap(),
                Kind::Segment
            ),
            Err(MintError::Gone)
        );
        s.close(second.session);
        assert!(s.lock().is_none());
    }

    #[test]
    fn handles_are_reused_per_address_and_evicted_oldest_first() {
        let s = streams(Limits {
            handles: 3,
            ..small()
        });
        let opened = s.open("https://cdn.example/root.m3u8").unwrap();
        let seg = |n: u32| Url::parse(&format!("https://cdn.example/s{n}.ts")).unwrap();
        let h1 = s.mint(opened.session, seg(1), Kind::Segment).unwrap();
        assert_eq!(
            s.mint(opened.session, seg(1), Kind::Segment).unwrap(),
            h1,
            "same address and kind, same handle"
        );
        assert_ne!(
            s.mint(opened.session, seg(1), Kind::Init).unwrap(),
            h1,
            "a different kind gets its own"
        );
        s.mint(opened.session, seg(2), Kind::Segment).unwrap();
        s.mint(opened.session, seg(3), Kind::Segment).unwrap();
        let guard = s.lock();
        let session = guard.as_ref().unwrap();
        assert!(session.handles.len() <= 3);
        assert!(!session.handles.contains_key(&h1), "the oldest went first");
        assert!(
            session.handles.contains_key(&handle_of(&opened.url)),
            "the root is never evicted"
        );
    }

    #[test]
    fn replies_never_contain_upstream_addresses_or_tokens() {
        let port = hls_server();
        let s = streams(small());
        let opened = s
            .open(&format!(
                "http://127.0.0.1:{port}/live/master.m3u8?{SECRET}"
            ))
            .unwrap();
        let mut seen = vec![get(&s, &handle_of(&opened.url))];
        let media = get(&s, &handles(&text(&seen[0]))[0]);
        seen.push(media);
        for path in [
            "/missing.m3u8",
            "/to-private.m3u8",
            "/drm.m3u8",
            "/channels.m3u",
        ] {
            let o = s
                .open(&format!("http://127.0.0.1:{port}{path}?{SECRET}"))
                .unwrap();
            seen.push(get(&s, &handle_of(&o.url)));
        }
        for r in &seen {
            let all = format!("{} {:?}", text(r), r.headers);
            for leak in ["127.0.0.1", "SECRET", "/live/", "low/media", "10.1.2.3"] {
                assert!(
                    !all.contains(leak),
                    "status {} leaks {leak}: {all}",
                    r.status
                );
            }
        }
    }
}
