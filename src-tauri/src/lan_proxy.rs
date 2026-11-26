//! Server-side guarded LAN stream proxy and Tauri client LAN stream bridge.
//!
//! Server side (`LanStreamProxy`):
//! - Keeps upstream provider URLs and credentials strictly on the Kinora Server.
//! - Fetches upstream playlists and media through `fetch.rs` (proxies off, guarded DNS,
//!   per-redirect re-checking, bounded size and memory budget).
//! - Rewrites HLS playlists via `hls::rewrite_with_base` so every rendition, segment,
//!   init map, and AES-128 key becomes `/api/stream/h/<session_key>/<handle>`.
//! - Ties every session to a `device_id` so device revocation terminates active streams immediately.
//!
//! Client side (`ClientLanStreamBridge`):
//! - Lets a Tauri desktop app in Client mode play streams from its paired LAN Kinora Server
//!   through `kstream://localhost/server-stream/<session_key>/<handle>` without loosening
//!   `tauri.conf.json` CSP or adding LAN bypasses to `fetch.rs`.

use std::collections::{HashMap, VecDeque};
use std::net::IpAddr;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use reqwest::Url;
use serde::{Deserialize, Serialize};
use tokio::sync::Semaphore;

use crate::dlna::is_safe_lan_ip;
use crate::fetch::{self, Policy};
use crate::hls::{self, Kind, MintError, RewriteError};
use crate::ingest::ErrorCode;

const MAX_LAN_SESSIONS: usize = 8;
const MAX_HANDLES_PER_SESSION: usize = 2_000;
const MAX_URIS_PER_PLAYLIST: usize = 10_000;
const MAX_VARIANTS: usize = 32;
const PLAYLIST_MAX_BYTES: usize = 4 * 1024 * 1024;
const SEGMENT_MAX_BYTES: usize = 32 * 1024 * 1024;
const KEY_MAX_BYTES: usize = 1024;
const SESSION_BUDGET_BYTES: usize = 64 * 1024 * 1024;
const CONCURRENT_PER_SESSION: usize = 6;
const PLAYLIST_TIMEOUT: Duration = Duration::from_secs(12);
const SEGMENT_TIMEOUT: Duration = Duration::from_secs(45);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const IDLE_TIMEOUT: Duration = Duration::from_secs(15);

const PLAYLIST_TYPE: &str = "application/vnd.apple.mpegurl";
const LOCAL_FILE_MAX_CHUNK_BYTES: u64 = 4 * 1024 * 1024;

const DIRECT_MEDIA: &[&str] = &[
    ".ts", ".mp4", ".m4v", ".mkv", ".webm", ".avi", ".mov", ".flv", ".mp3", ".aac", ".m4a",
];

/// Verifies that `file_path` resolves to an existing regular file strictly contained within
/// at least one directory in `allowed_roots` (canonicalizing symlinks and `..` segments).
pub fn canonicalize_contained_path(
    file_path: &Path,
    allowed_roots: &[PathBuf],
) -> Result<PathBuf, String> {
    if allowed_roots.is_empty() {
        return Err("No authorized local media library folders are configured.".to_string());
    }
    let canonical_file = file_path
        .canonicalize()
        .map_err(|_| "Requested local media file could not be accessed.".to_string())?;
    if !canonical_file.is_file() {
        return Err("Requested local media target is not a readable file.".to_string());
    }
    for root in allowed_roots {
        if let Ok(canonical_root) = root.canonicalize() {
            if canonical_root.is_dir() && canonical_file.starts_with(&canonical_root) {
                return Ok(canonical_file);
            }
        }
    }
    Err("Requested local media file is outside authorized library folders.".to_string())
}

fn local_media_content_type(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    match ext.as_str() {
        "mp4" | "m4v" => Some("video/mp4"),
        "mkv" => Some("video/x-matroska"),
        "webm" => Some("video/webm"),
        "mov" => Some("video/quicktime"),
        "ts" | "m2ts" => Some("video/mp2t"),
        "avi" => Some("video/x-msvideo"),
        "mp3" => Some("audio/mpeg"),
        "flac" => Some("audio/flac"),
        "m4a" => Some("audio/mp4"),
        "ogg" => Some("audio/ogg"),
        "aac" => Some("audio/aac"),
        "wav" => Some("audio/wav"),
        _ => None,
    }
}

fn parse_byte_range(header: &str, total_len: u64) -> Result<(u64, u64), ()> {
    if total_len == 0 {
        return Err(());
    }
    let spec = header.trim().strip_prefix("bytes=").ok_or(())?;
    let first = spec.split(',').next().ok_or(())?.trim();
    let (start_str, end_str) = first.split_once('-').ok_or(())?;
    if start_str.is_empty() {
        let suffix: u64 = end_str.trim().parse().map_err(|_| ())?;
        if suffix == 0 {
            return Err(());
        }
        let start = total_len.saturating_sub(suffix);
        return Ok((start, total_len - 1));
    }
    let start: u64 = start_str.trim().parse().map_err(|_| ())?;
    if start >= total_len {
        return Err(());
    }
    let end = if end_str.trim().is_empty() {
        total_len - 1
    } else {
        let parsed: u64 = end_str.trim().parse().map_err(|_| ())?;
        if parsed < start {
            return Err(());
        }
        parsed.min(total_len - 1)
    };
    Ok((start, end))
}

async fn serve_local_file(
    path: &Path,
    content_type: &'static str,
    range: Option<&str>,
) -> ProxyReply {
    let path_owned = path.to_path_buf();
    let range_owned = range.map(|s| s.to_string());

    tokio::task::spawn_blocking(move || {
        use std::io::{Read, Seek, SeekFrom};

        let mut file = match std::fs::File::open(&path_owned) {
            Ok(f) => f,
            Err(_) => return ProxyReply::error(404, "Local media file is unavailable."),
        };
        let total_len = match file.metadata() {
            Ok(m) if m.is_file() => m.len(),
            _ => return ProxyReply::error(404, "Local media file is unavailable."),
        };
        if total_len == 0 {
            return ProxyReply {
                status: 200,
                content_type: content_type.to_string(),
                content_range: None,
                extra_headers: vec![("Accept-Ranges", "bytes".to_string())],
                body: Vec::new(),
            };
        }

        let (start, end, is_partial) = match range_owned.as_deref() {
            Some(hdr) => match parse_byte_range(hdr, total_len) {
                Ok((s, e)) => {
                    let capped_end = e
                        .min(s.saturating_add(LOCAL_FILE_MAX_CHUNK_BYTES - 1))
                        .min(total_len - 1);
                    (s, capped_end, true)
                }
                Err(()) => {
                    return ProxyReply {
                        status: 416,
                        content_type: "text/plain; charset=utf-8".to_string(),
                        content_range: Some(format!("bytes */{total_len}")),
                        extra_headers: vec![("Accept-Ranges", "bytes".to_string())],
                        body: b"Range Not Satisfiable".to_vec(),
                    };
                }
            },
            None => {
                if total_len <= LOCAL_FILE_MAX_CHUNK_BYTES {
                    (0, total_len - 1, false)
                } else {
                    (0, LOCAL_FILE_MAX_CHUNK_BYTES - 1, true)
                }
            }
        };

        let read_len = (end - start + 1) as usize;
        if file.seek(SeekFrom::Start(start)).is_err() {
            return ProxyReply::error(500, "Failed to seek local media file.");
        }
        let mut buf = vec![0u8; read_len];
        if file.read_exact(&mut buf).is_err() {
            return ProxyReply::error(500, "Failed to read local media file.");
        }

        ProxyReply {
            status: if is_partial { 206 } else { 200 },
            content_type: content_type.to_string(),
            content_range: if is_partial {
                Some(format!("bytes {start}-{end}/{total_len}"))
            } else {
                None
            },
            extra_headers: vec![("Accept-Ranges", "bytes".to_string())],
            body: buf,
        }
    })
    .await
    .unwrap_or_else(|_| ProxyReply::error(500, "Failed to serve local media file."))
}

const MEDIA_TYPES: &[&str] = &[
    "video/mp2t",
    "video/mp4",
    "video/webm",
    "video/x-matroska",
    "video/quicktime",
    "video/x-msvideo",
    "audio/mp4",
    "audio/aac",
    "audio/mpeg",
    "audio/ogg",
    "audio/wav",
    "video/iso.segment",
    "application/octet-stream",
];

fn random_hex_128() -> String {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).expect("operating system random source is unavailable");
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn is_valid_hex_token(s: &str) -> bool {
    s.len() == 32 && s.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

fn safe_media_type(ct: Option<&str>) -> &'static str {
    let raw = ct
        .unwrap_or_default()
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    MEDIA_TYPES
        .iter()
        .copied()
        .find(|&allowed| allowed == raw)
        .unwrap_or("application/octet-stream")
}

/// Returned when opening a proxied LAN stream on the Kinora Server.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OpenedLanStream {
    pub session_key: String,
    pub root_handle: String,
    pub proxy_path: String,
    pub format: String,
}

/// HTTP-like response produced by the LAN stream proxy or client bridge.
pub struct ProxyReply {
    pub status: u16,
    pub content_type: String,
    pub content_range: Option<String>,
    pub extra_headers: Vec<(&'static str, String)>,
    pub body: Vec<u8>,
}

impl ProxyReply {
    fn error(status: u16, message: &str) -> Self {
        Self {
            status,
            content_type: "text/plain; charset=utf-8".to_string(),
            content_range: None,
            extra_headers: Vec::new(),
            body: message.as_bytes().to_vec(),
        }
    }
}

#[derive(Clone)]
enum ProxyTarget {
    Remote {
        url: Url,
        kind: Kind,
    },
    LocalFile {
        path: PathBuf,
        content_type: &'static str,
    },
}

struct ProxyEntry {
    target: ProxyTarget,
}

struct LanSession {
    device_id: String,
    handles: HashMap<String, ProxyEntry>,
    by_url: HashMap<(String, Kind), String>,
    order: VecDeque<String>,
    client: reqwest::Client,
    requests: Arc<Semaphore>,
    budget: Arc<Semaphore>,
    policy: Policy,
}

#[derive(Clone)]
pub struct LanStreamProxy {
    sessions: Arc<Mutex<HashMap<String, LanSession>>>,
    session_order: Arc<Mutex<VecDeque<String>>>,
    policy: Policy,
}

impl Default for LanStreamProxy {
    fn default() -> Self {
        Self::new(Policy::default())
    }
}

impl LanStreamProxy {
    pub fn new(policy: Policy) -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            session_order: Arc::new(Mutex::new(VecDeque::new())),
            policy,
        }
    }

    /// Opens a guarded proxy session for `raw_url` bound to `device_id`.
    /// Upstream addresses and credentials never leave the server.
    pub fn open(&self, device_id: &str, raw_url: &str) -> Result<OpenedLanStream, String> {
        let base_url = raw_url.split('|').next().unwrap_or(raw_url).trim();
        let url = fetch::check_url(base_url, &self.policy).map_err(|e| e.message)?;

        let path_lower = url.path().to_ascii_lowercase();
        let root_kind = if DIRECT_MEDIA.iter().any(|ext| path_lower.ends_with(ext)) {
            Kind::Direct
        } else {
            Kind::Playlist { depth: 0 }
        };

        let stream_policy = Policy {
            connect_timeout: CONNECT_TIMEOUT,
            read_timeout: Some(IDLE_TIMEOUT),
            total_timeout: SEGMENT_TIMEOUT,
            ..self.policy.clone()
        };

        let client = fetch::guarded_client(&stream_policy).map_err(|e| e.message)?;
        let session_key = random_hex_128();
        let root_handle = random_hex_128();

        let mut handles = HashMap::new();
        let mut by_url = HashMap::new();
        by_url.insert((url.to_string(), root_kind), root_handle.clone());
        handles.insert(
            root_handle.clone(),
            ProxyEntry {
                target: ProxyTarget::Remote {
                    url,
                    kind: root_kind,
                },
            },
        );

        let session = LanSession {
            device_id: device_id.to_string(),
            handles,
            by_url,
            order: VecDeque::new(),
            client,
            requests: Arc::new(Semaphore::new(CONCURRENT_PER_SESSION)),
            budget: Arc::new(Semaphore::new(SESSION_BUDGET_BYTES)),
            policy: stream_policy,
        };

        let mut sessions = self.sessions.lock().unwrap_or_else(|p| p.into_inner());
        let mut order = self.session_order.lock().unwrap_or_else(|p| p.into_inner());

        // Replace any existing session owned by the same device so one client cannot exhaust slots.
        let prev_keys: Vec<String> = sessions
            .iter()
            .filter(|(_, s)| s.device_id == device_id)
            .map(|(k, _)| k.clone())
            .collect();
        for k in prev_keys {
            sessions.remove(&k);
            order.retain(|item| item != &k);
        }

        // Enforce global session cap, evicting oldest first.
        while sessions.len() >= MAX_LAN_SESSIONS {
            if let Some(old_key) = order.pop_front() {
                sessions.remove(&old_key);
            } else {
                break;
            }
        }

        sessions.insert(session_key.clone(), session);
        order.push_back(session_key.clone());

        let format = match root_kind {
            Kind::Direct => "direct",
            _ => "hls",
        };

        Ok(OpenedLanStream {
            proxy_path: format!("/api/stream/h/{session_key}/{root_handle}"),
            session_key,
            root_handle,
            format: format.to_string(),
        })
    }

    /// Opens a guarded direct-file proxy session for a local media file strictly contained
    /// within `allowed_roots`. Host filesystem paths never leave the server.
    pub fn open_local_file(
        &self,
        device_id: &str,
        file_path: &Path,
        allowed_roots: &[PathBuf],
    ) -> Result<OpenedLanStream, String> {
        let canonical = canonicalize_contained_path(file_path, allowed_roots)?;
        let content_type = local_media_content_type(&canonical)
            .ok_or_else(|| "Unsupported local media file format.".to_string())?;

        let stream_policy = Policy {
            connect_timeout: CONNECT_TIMEOUT,
            read_timeout: Some(IDLE_TIMEOUT),
            total_timeout: SEGMENT_TIMEOUT,
            ..self.policy.clone()
        };
        let client = fetch::guarded_client(&stream_policy).map_err(|e| e.message)?;
        let session_key = random_hex_128();
        let root_handle = random_hex_128();

        let mut handles = HashMap::new();
        handles.insert(
            root_handle.clone(),
            ProxyEntry {
                target: ProxyTarget::LocalFile {
                    path: canonical,
                    content_type,
                },
            },
        );

        let session = LanSession {
            device_id: device_id.to_string(),
            handles,
            by_url: HashMap::new(),
            order: VecDeque::new(),
            client,
            requests: Arc::new(Semaphore::new(CONCURRENT_PER_SESSION)),
            budget: Arc::new(Semaphore::new(SESSION_BUDGET_BYTES)),
            policy: stream_policy,
        };

        let mut sessions = self.sessions.lock().unwrap_or_else(|p| p.into_inner());
        let mut order = self.session_order.lock().unwrap_or_else(|p| p.into_inner());

        let prev_keys: Vec<String> = sessions
            .iter()
            .filter(|(_, s)| s.device_id == device_id)
            .map(|(k, _)| k.clone())
            .collect();
        for k in prev_keys {
            sessions.remove(&k);
            order.retain(|item| item != &k);
        }

        while sessions.len() >= MAX_LAN_SESSIONS {
            if let Some(old_key) = order.pop_front() {
                sessions.remove(&old_key);
            } else {
                break;
            }
        }

        sessions.insert(session_key.clone(), session);
        order.push_back(session_key.clone());

        Ok(OpenedLanStream {
            proxy_path: format!("/api/stream/h/{session_key}/{root_handle}"),
            session_key,
            root_handle,
            format: "direct".to_string(),
        })
    }

    /// Returns the owning device_id for `session_key`, if the session exists.
    pub fn session_owner(&self, session_key: &str) -> Option<String> {
        if !is_valid_hex_token(session_key) {
            return None;
        }
        let sessions = self.sessions.lock().unwrap_or_else(|p| p.into_inner());
        sessions.get(session_key).map(|s| s.device_id.clone())
    }

    /// Closes a session if it belongs to `device_id`.
    pub fn close(&self, session_key: &str, device_id: &str) -> bool {
        let mut sessions = self.sessions.lock().unwrap_or_else(|p| p.into_inner());
        let owns = sessions
            .get(session_key)
            .is_some_and(|s| s.device_id == device_id);
        if owns {
            sessions.remove(session_key);
            let mut order = self.session_order.lock().unwrap_or_else(|p| p.into_inner());
            order.retain(|k| k != session_key);
            true
        } else {
            false
        }
    }

    /// Immediately terminates every active stream session owned by a revoked device.
    pub fn revoke_device(&self, device_id: &str) {
        let mut sessions = self.sessions.lock().unwrap_or_else(|p| p.into_inner());
        let mut order = self.session_order.lock().unwrap_or_else(|p| p.into_inner());
        let to_remove: Vec<String> = sessions
            .iter()
            .filter(|(_, s)| s.device_id == device_id)
            .map(|(k, _)| k.clone())
            .collect();
        for k in to_remove {
            sessions.remove(&k);
            order.retain(|item| item != &k);
        }
    }

    fn mint(&self, session_key: &str, url: Url, kind: Kind) -> Result<String, MintError> {
        let url = fetch::check_url(url.as_str(), &self.policy).map_err(|_| MintError::Blocked)?;
        let mut sessions = self.sessions.lock().unwrap_or_else(|p| p.into_inner());
        let session = sessions.get_mut(session_key).ok_or(MintError::Gone)?;

        let key = (url.to_string(), kind);
        if let Some(existing) = session.by_url.get(&key) {
            return Ok(existing.clone());
        }

        while session.handles.len() >= MAX_HANDLES_PER_SESSION {
            if let Some(old) = session.order.pop_front() {
                if let Some(entry) = session.handles.remove(&old) {
                    if let ProxyTarget::Remote {
                        url: old_url,
                        kind: old_kind,
                    } = entry.target
                    {
                        session.by_url.remove(&(old_url.to_string(), old_kind));
                    }
                }
            } else {
                break;
            }
        }

        let handle = random_hex_128();
        session.order.push_back(handle.clone());
        session.by_url.insert(key, handle.clone());
        session.handles.insert(
            handle.clone(),
            ProxyEntry {
                target: ProxyTarget::Remote { url, kind },
            },
        );
        Ok(handle)
    }

    /// Serves one proxied HLS playlist, segment, key, or direct media resource.
    pub async fn serve(&self, session_key: &str, handle: &str, range: Option<&str>) -> ProxyReply {
        if !is_valid_hex_token(session_key) || !is_valid_hex_token(handle) {
            return ProxyReply::error(404, "Stream resource not found.");
        }

        let (target, client, requests, budget, policy) = {
            let sessions = self.sessions.lock().unwrap_or_else(|p| p.into_inner());
            let Some(session) = sessions.get(session_key) else {
                return ProxyReply::error(410, "Stream session has ended.");
            };
            let Some(entry) = session.handles.get(handle) else {
                return ProxyReply::error(404, "Stream resource not found.");
            };
            (
                entry.target.clone(),
                session.client.clone(),
                session.requests.clone(),
                session.budget.clone(),
                session.policy.clone(),
            )
        };

        let Ok(_req_permit) = requests.acquire_owned().await else {
            return ProxyReply::error(503, "Stream proxy is busy.");
        };

        let (url, kind) = match target {
            ProxyTarget::LocalFile { path, content_type } => {
                return serve_local_file(&path, content_type, range).await;
            }
            ProxyTarget::Remote { url, kind } => (url, kind),
        };

        let (max_bytes, timeout, allow_range) = match kind {
            Kind::Playlist { .. } => (PLAYLIST_MAX_BYTES, PLAYLIST_TIMEOUT, false),
            Kind::Key => (KEY_MAX_BYTES, PLAYLIST_TIMEOUT, false),
            Kind::Segment | Kind::Init | Kind::Direct => (SEGMENT_MAX_BYTES, SEGMENT_TIMEOUT, true),
            Kind::Manifest | Kind::Prefix => (PLAYLIST_MAX_BYTES, PLAYLIST_TIMEOUT, false),
        };

        let range_arg = if allow_range { range } else { None };
        let fetched = match fetch::fetch_media(
            &client, &url, &policy, range_arg, timeout, max_bytes, &budget,
        )
        .await
        {
            Ok(f) => f,
            Err(err) => {
                let status = match err.code {
                    ErrorCode::Blocked | ErrorCode::InvalidUrl => 403,
                    ErrorCode::Timeout => 504,
                    ErrorCode::Busy => 503,
                    ErrorCode::TooLarge => 413,
                    _ => 502,
                };
                return ProxyReply::error(status, &err.message);
            }
        };

        match kind {
            Kind::Playlist { depth } => {
                let Ok(text) = std::str::from_utf8(&fetched.body) else {
                    // Non-UTF8 binary media (e.g. direct MPEG-TS on an extensionless URL).
                    let ct = safe_media_type(fetched.content_type.as_deref());
                    return ProxyReply {
                        status: fetched.status,
                        content_type: ct.to_string(),
                        content_range: fetched.content_range,
                        extra_headers: Vec::new(),
                        body: fetched.body,
                    };
                };

                let base_prefix = format!("/api/stream/h/{session_key}/");
                let hls_limits = hls::Limits {
                    max_uris: MAX_URIS_PER_PLAYLIST,
                    max_variants: MAX_VARIANTS,
                };
                let rewritten = hls::rewrite_with_base(
                    text,
                    &fetched.final_url,
                    depth,
                    hls_limits,
                    &base_prefix,
                    &mut |target_url, target_kind| self.mint(session_key, target_url, target_kind),
                );

                match rewritten {
                    Ok(playlist_text) => ProxyReply {
                        status: 200,
                        content_type: PLAYLIST_TYPE.to_string(),
                        content_range: None,
                        extra_headers: Vec::new(),
                        body: playlist_text.into_bytes(),
                    },
                    Err(RewriteError::NotHls) => {
                        ProxyReply::error(415, "Upstream stream is not a supported HLS playlist.")
                    }
                    Err(RewriteError::Drm) => {
                        ProxyReply::error(415, "DRM-protected streams are not supported.")
                    }
                    Err(RewriteError::Unsupported(reason)) => {
                        ProxyReply::error(415, &format!("Unsupported HLS feature: {reason}."))
                    }
                    Err(RewriteError::TooMany(what)) => {
                        ProxyReply::error(413, &format!("Playlist has too many {what}."))
                    }
                    Err(RewriteError::Mint(MintError::Blocked)) => {
                        ProxyReply::error(403, "A stream reference points to a blocked address.")
                    }
                    Err(RewriteError::Mint(MintError::Gone)) => {
                        ProxyReply::error(410, "Stream session has ended.")
                    }
                }
            }
            Kind::Key => ProxyReply {
                status: 200,
                content_type: "application/octet-stream".to_string(),
                content_range: None,
                extra_headers: Vec::new(),
                body: fetched.body,
            },
            _ => ProxyReply {
                status: fetched.status,
                content_type: safe_media_type(fetched.content_type.as_deref()).to_string(),
                content_range: fetched.content_range,
                extra_headers: Vec::new(),
                body: fetched.body,
            },
        }
    }
}

/// Validates that a client-configured Kinora Server URL points to a safe LAN IP address.
pub fn validate_lan_server_url(raw_url: &str) -> Result<Url, String> {
    let parsed =
        Url::parse(raw_url.trim()).map_err(|_| "Invalid Kinora Server URL.".to_string())?;
    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return Err("Kinora Server URL must use http or https.".to_string());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Kinora Server URL must not embed credentials.".to_string());
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "Kinora Server URL is missing a host.".to_string())?;

    let ip: IpAddr = host
        .trim_matches(|c| c == '[' || c == ']')
        .parse()
        .map_err(|_| "Kinora Server address must be a local network IP address.".to_string())?;

    let allow_loopback = cfg!(test) || (cfg!(dev) && cfg!(feature = "loopback-fixtures"));
    if !(is_safe_lan_ip(ip) || (allow_loopback && ip.is_loopback())) {
        return Err("Kinora Server address must be on the local network.".to_string());
    }

    Ok(parsed)
}

struct ActiveClientLanSession {
    id: u64,
    server_base: String,
    session_key: String,
    client: reqwest::Client,
}

/// Returned to the React webview when opening a stream from a paired LAN Kinora Server.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OpenedClientServerStream {
    pub url: String,
    pub session: u64,
    pub format: String,
}

/// Tauri desktop client bridge that proxies `kstream://localhost/server-stream/<key>/<handle>`
/// exclusively to the paired LAN Kinora Server without loosening CSP or `fetch.rs`.
pub struct ClientLanStreamBridge {
    active: Mutex<Option<ActiveClientLanSession>>,
    next_id: Mutex<u64>,
    origin: String,
}

impl ClientLanStreamBridge {
    pub fn new(origin: String) -> Self {
        Self {
            active: Mutex::new(None),
            next_id: Mutex::new(1),
            origin,
        }
    }

    fn build_lan_client() -> Result<reqwest::Client, String> {
        reqwest::Client::builder()
            .no_proxy()
            .referer(false)
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(CONNECT_TIMEOUT)
            .timeout(SEGMENT_TIMEOUT)
            .build()
            .map_err(|_| "Failed to initialize LAN stream client.".to_string())
    }

    /// Calls `POST <server_url>/api/stream/open` on the paired Kinora Server and binds a local
    /// `kstream://localhost/server-stream/<session_key>/<root_handle>` address for playback.
    pub async fn open_from_server(
        &self,
        server_url: &str,
        auth_token: &str,
        channel_id: Option<&str>,
        media_id: Option<&str>,
    ) -> Result<OpenedClientServerStream, String> {
        let parsed = validate_lan_server_url(server_url)?;
        let server_base = format!(
            "{}://{}{}",
            parsed.scheme(),
            parsed.host_str().unwrap_or_default(),
            parsed.port().map(|p| format!(":{p}")).unwrap_or_default()
        );

        let payload = if let Some(cid) = channel_id {
            serde_json::json!({ "channelId": cid })
        } else if let Some(mid) = media_id {
            serde_json::json!({ "mediaId": mid })
        } else {
            return Err("Either channelId or mediaId is required.".to_string());
        };

        let client = Self::build_lan_client()?;
        let open_endpoint = format!("{server_base}/api/stream/open");
        let resp = client
            .post(&open_endpoint)
            .header("Authorization", format!("Bearer {}", auth_token.trim()))
            .header("Content-Type", "application/json")
            .body(payload.to_string())
            .send()
            .await
            .map_err(|_| "Unable to reach Kinora Server to open stream.".to_string())?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            return Err(match status {
                401 => "Device authorization rejected by Kinora Server.".to_string(),
                403 => "Device lacks streaming permission on Kinora Server.".to_string(),
                404 => "Channel stream is unavailable on Kinora Server.".to_string(),
                _ => format!("Kinora Server could not open stream (HTTP {status})."),
            });
        }

        let body_bytes = resp
            .bytes()
            .await
            .map_err(|_| "Failed to read stream response from Kinora Server.".to_string())?;
        let parsed_resp: serde_json::Value = serde_json::from_slice(&body_bytes)
            .map_err(|_| "Malformed stream response from Kinora Server.".to_string())?;

        let session_key = parsed_resp
            .get("sessionKey")
            .and_then(|v| v.as_str())
            .filter(|s| is_valid_hex_token(s))
            .ok_or_else(|| "Kinora Server returned an invalid stream session key.".to_string())?
            .to_string();

        let proxy_path = parsed_resp
            .get("proxyPath")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Kinora Server did not return a proxy stream path.".to_string())?;

        let expected_prefix = format!("/api/stream/h/{session_key}/");
        let root_handle = proxy_path
            .strip_prefix(&expected_prefix)
            .filter(|h| is_valid_hex_token(h))
            .ok_or_else(|| "Kinora Server returned an invalid stream handle.".to_string())?
            .to_string();

        let format = match parsed_resp.get("format").and_then(|v| v.as_str()) {
            Some("direct") => "direct".to_string(),
            _ => "hls".to_string(),
        };

        let id = {
            let mut next = self.next_id.lock().unwrap_or_else(|p| p.into_inner());
            let cur = *next;
            *next += 1;
            cur
        };

        {
            let mut active = self.active.lock().unwrap_or_else(|p| p.into_inner());
            *active = Some(ActiveClientLanSession {
                id,
                server_base,
                session_key: session_key.clone(),
                client,
            });
        }

        Ok(OpenedClientServerStream {
            url: format!("kstream://localhost/server-stream/{session_key}/{root_handle}"),
            session: id,
            format,
        })
    }

    pub fn close(&self, session: u64) {
        let mut active = self.active.lock().unwrap_or_else(|p| p.into_inner());
        if active.as_ref().is_some_and(|s| s.id == session) {
            *active = None;
        }
    }

    /// Serves `kstream://localhost/server-stream/<session_key>/<handle>` by fetching only from
    /// the active paired LAN Kinora Server and rewriting playlist prefixes for `kstream://`.
    pub async fn serve(
        &self,
        method: &str,
        uri_path: &str,
        origin: Option<&str>,
        ranges: &[&str],
    ) -> ProxyReply {
        let cors_headers = vec![
            ("Access-Control-Allow-Origin", self.origin.clone()),
            ("Vary", "Origin".to_string()),
            ("Cache-Control", "no-store".to_string()),
            ("X-Content-Type-Options", "nosniff".to_string()),
        ];

        if let Some(req_origin) = origin {
            if req_origin != self.origin {
                return ProxyReply {
                    status: 403,
                    content_type: "text/plain; charset=utf-8".to_string(),
                    content_range: None,
                    extra_headers: cors_headers,
                    body: b"Forbidden origin.".to_vec(),
                };
            }
        }

        if method == "OPTIONS" {
            let mut hdrs = cors_headers;
            hdrs.push(("Access-Control-Allow-Methods", "GET, OPTIONS".to_string()));
            hdrs.push(("Access-Control-Allow-Headers", "Range".to_string()));
            return ProxyReply {
                status: 204,
                content_type: "text/plain; charset=utf-8".to_string(),
                content_range: None,
                extra_headers: hdrs,
                body: Vec::new(),
            };
        }

        if method != "GET" {
            return ProxyReply {
                status: 405,
                content_type: "text/plain; charset=utf-8".to_string(),
                content_range: None,
                extra_headers: cors_headers,
                body: b"Method not allowed.".to_vec(),
            };
        }

        let Some(rest) = uri_path.strip_prefix("/server-stream/") else {
            return ProxyReply {
                status: 404,
                content_type: "text/plain; charset=utf-8".to_string(),
                content_range: None,
                extra_headers: cors_headers,
                body: b"Not found.".to_vec(),
            };
        };

        let Some((session_key, handle)) = rest.split_once('/') else {
            return ProxyReply {
                status: 404,
                content_type: "text/plain; charset=utf-8".to_string(),
                content_range: None,
                extra_headers: cors_headers,
                body: b"Not found.".to_vec(),
            };
        };

        if !is_valid_hex_token(session_key) || !is_valid_hex_token(handle) {
            return ProxyReply {
                status: 404,
                content_type: "text/plain; charset=utf-8".to_string(),
                content_range: None,
                extra_headers: cors_headers,
                body: b"Invalid stream handle.".to_vec(),
            };
        }

        let (server_base, client) = {
            let active = self.active.lock().unwrap_or_else(|p| p.into_inner());
            let Some(sess) = active.as_ref().filter(|s| s.session_key == session_key) else {
                return ProxyReply {
                    status: 410,
                    content_type: "text/plain; charset=utf-8".to_string(),
                    content_range: None,
                    extra_headers: cors_headers,
                    body: b"Stream session has ended.".to_vec(),
                };
            };
            (sess.server_base.clone(), sess.client.clone())
        };

        let target = format!("{server_base}/api/stream/h/{session_key}/{handle}");
        let mut req = client.get(&target);
        if let Some(range) = ranges.first() {
            req = req.header("Range", *range);
        }

        let resp = match req.send().await {
            Ok(r) => r,
            Err(_) => {
                return ProxyReply {
                    status: 502,
                    content_type: "text/plain; charset=utf-8".to_string(),
                    content_range: None,
                    extra_headers: cors_headers,
                    body: b"Kinora Server stream unreachable.".to_vec(),
                };
            }
        };

        let status = resp.status().as_u16();
        let content_type = resp
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("application/octet-stream")
            .to_string();
        let content_range = resp
            .headers()
            .get("content-range")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        let bytes = match resp.bytes().await {
            Ok(b) if b.len() <= SEGMENT_MAX_BYTES => b.to_vec(),
            Ok(_) => {
                return ProxyReply {
                    status: 413,
                    content_type: "text/plain; charset=utf-8".to_string(),
                    content_range: None,
                    extra_headers: cors_headers,
                    body: b"Stream segment exceeded limit.".to_vec(),
                };
            }
            Err(_) => {
                return ProxyReply {
                    status: 502,
                    content_type: "text/plain; charset=utf-8".to_string(),
                    content_range: None,
                    extra_headers: cors_headers,
                    body: b"Failed to read stream bytes from Kinora Server.".to_vec(),
                };
            }
        };

        let body = if content_type.contains("mpegurl") {
            let text = String::from_utf8_lossy(&bytes);
            rewrite_lan_playlist_for_kstream(&text, session_key).into_bytes()
        } else {
            bytes
        };

        ProxyReply {
            status,
            content_type,
            content_range,
            extra_headers: cors_headers,
            body,
        }
    }
}

/// Fetches a cached raster artwork asset from a paired LAN Kinora Server (`GET /api/artwork`)
/// with strict LAN IP validation, no redirects, 4 MiB cap, and raster magic-byte verification.
pub async fn fetch_server_artwork(
    server_url: &str,
    auth_token: &str,
    artwork_key: &str,
) -> Result<Option<crate::artwork::Artwork>, String> {
    let trimmed_key = artwork_key.trim();
    if trimmed_key.is_empty() || trimmed_key.len() > 256 {
        return Ok(None);
    }

    let parsed = validate_lan_server_url(server_url)?;
    let server_base = format!(
        "{}://{}{}",
        parsed.scheme(),
        parsed.host_str().unwrap_or_default(),
        parsed.port().map(|p| format!(":{p}")).unwrap_or_default()
    );

    let mut url = Url::parse(&format!("{server_base}/api/artwork"))
        .map_err(|_| "Invalid artwork endpoint.".to_string())?;
    url.query_pairs_mut().append_pair("key", trimmed_key);

    let client = reqwest::Client::builder()
        .no_proxy()
        .referer(false)
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|_| "Failed to initialize artwork client.".to_string())?;

    let resp = client
        .get(url)
        .header("Authorization", format!("Bearer {}", auth_token.trim()))
        .send()
        .await
        .map_err(|_| "Unable to reach Kinora Server for artwork.".to_string())?;

    if resp.status().as_u16() == 404 {
        return Ok(None);
    }
    if !resp.status().is_success() {
        return Err(format!(
            "Kinora Server refused artwork request (HTTP {}).",
            resp.status().as_u16()
        ));
    }

    const MAX_ARTWORK_BYTES: usize = 4 * 1024 * 1024;
    let bytes = resp
        .bytes()
        .await
        .map_err(|_| "Failed to read artwork bytes.".to_string())?;
    if bytes.len() > MAX_ARTWORK_BYTES {
        return Ok(None);
    }
    let Some(mime_type) = crate::artwork::detect_raster_mime(&bytes) else {
        return Ok(None);
    };
    Ok(Some(crate::artwork::Artwork {
        mime_type,
        bytes: bytes.to_vec(),
    }))
}

/// Structured HTTP response returned by `client_server_request` to the Tauri webview.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClientServerResponse {
    pub status: u16,
    pub ok: bool,
    pub body: String,
}

/// Validates that a client-requested API path stays strictly within Kinora Server routes.
pub fn validate_api_path(path: &str) -> Result<&str, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() || trimmed.len() > 1024 {
        return Err("Invalid API path length.".to_string());
    }
    if !trimmed.starts_with('/') {
        return Err("API path must start with '/'.".to_string());
    }
    if trimmed.contains("://")
        || trimmed.contains('@')
        || trimmed.contains("..")
        || trimmed.bytes().any(|b| b < 0x20 || b == 0x7f)
    {
        return Err("API path contains disallowed characters.".to_string());
    }
    let route = trimmed.split('?').next().unwrap_or(trimmed);
    let allowed =
        route == "/pair" || route == "/info" || route == "/status" || route.starts_with("/api/");
    if !allowed {
        return Err("API path is outside permitted Kinora Server routes.".to_string());
    }
    Ok(trimmed)
}

/// Executes a CSP-safe JSON API request against a validated LAN Kinora Server.
/// Keeps `tauri.conf.json` CSP and `fetch.rs` completely locked down.
pub async fn client_server_request(
    server_url: &str,
    method: &str,
    path: &str,
    auth_token: Option<&str>,
    body: Option<&str>,
) -> Result<ClientServerResponse, String> {
    let parsed = validate_lan_server_url(server_url)?;
    let safe_path = validate_api_path(path)?;
    let server_base = format!(
        "{}://{}{}",
        parsed.scheme(),
        parsed.host_str().unwrap_or_default(),
        parsed.port().map(|p| format!(":{p}")).unwrap_or_default()
    );
    let target = format!("{server_base}{safe_path}");

    let client = reqwest::Client::builder()
        .no_proxy()
        .referer(false)
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|_| "Failed to initialize LAN API client.".to_string())?;

    let mut req = match method.trim().to_ascii_uppercase().as_str() {
        "GET" => client.get(&target),
        "POST" => client.post(&target),
        "DELETE" => client.delete(&target),
        _ => return Err("Unsupported HTTP method for Kinora Server request.".to_string()),
    };

    if let Some(tok) = auth_token.map(str::trim).filter(|t| !t.is_empty()) {
        req = req.header("Authorization", format!("Bearer {tok}"));
    }
    if let Some(b) = body {
        req = req
            .header("Content-Type", "application/json")
            .body(b.to_string());
    }

    let resp = req
        .send()
        .await
        .map_err(|_| "Unable to reach Kinora Server on the local network.".to_string())?;

    const MAX_JSON_BYTES: usize = 8 * 1024 * 1024;
    let status = resp.status().as_u16();
    let ok = resp.status().is_success();
    let bytes = resp
        .bytes()
        .await
        .map_err(|_| "Failed to read response from Kinora Server.".to_string())?;
    if bytes.len() > MAX_JSON_BYTES {
        return Err("Kinora Server response exceeded 8 MiB limit.".to_string());
    }

    Ok(ClientServerResponse {
        status,
        ok,
        body: String::from_utf8_lossy(&bytes).to_string(),
    })
}

/// Manages a single background SSE event stream from the paired LAN Kinora Server
/// so Tauri desktop clients receive real-time sync events under strict CSP.
#[derive(Default)]
pub struct ClientSseBridge {
    cancel_tx: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
}

impl ClientSseBridge {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn disconnect(&self) {
        if let Some(tx) = self
            .cancel_tx
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .take()
        {
            let _ = tx.send(());
        }
    }

    pub async fn connect<F>(
        &self,
        server_url: &str,
        auth_token: &str,
        on_event: F,
    ) -> Result<bool, String>
    where
        F: Fn(serde_json::Value) + Send + Sync + 'static,
    {
        let parsed = validate_lan_server_url(server_url)?;
        let server_base = format!(
            "{}://{}{}",
            parsed.scheme(),
            parsed.host_str().unwrap_or_default(),
            parsed.port().map(|p| format!(":{p}")).unwrap_or_default()
        );
        let tok = auth_token.trim().to_string();
        if tok.is_empty() {
            return Err("Missing authorization token for SSE connection.".to_string());
        }

        // Cancel any previous SSE stream before opening a new one.
        self.disconnect();

        let client = reqwest::Client::builder()
            .no_proxy()
            .referer(false)
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(5))
            .build()
            .map_err(|_| "Failed to initialize LAN SSE client.".to_string())?;

        let target = format!("{server_base}/api/events");
        let mut resp = client
            .get(&target)
            .header("Authorization", format!("Bearer {tok}"))
            .header("Accept", "text/event-stream")
            .send()
            .await
            .map_err(|_| "Unable to connect to Kinora Server event stream.".to_string())?;

        if !resp.status().is_success() {
            return Err(format!(
                "Kinora Server rejected event stream (HTTP {}).",
                resp.status().as_u16()
            ));
        }

        let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel::<()>();
        {
            let mut slot = self.cancel_tx.lock().unwrap_or_else(|p| p.into_inner());
            *slot = Some(cancel_tx);
        }

        tokio::spawn(async move {
            let mut buf = String::new();
            loop {
                tokio::select! {
                    _ = &mut cancel_rx => break,
                    chunk_res = resp.chunk() => {
                        match chunk_res {
                            Ok(Some(chunk)) => {
                                if buf.len() + chunk.len() > 256 * 1024 {
                                    buf.clear();
                                    continue;
                                }
                                buf.push_str(&String::from_utf8_lossy(&chunk));
                                while let Some(idx) = buf.find('\n') {
                                    let line = buf[..idx].trim_end_matches('\r').to_string();
                                    buf.drain(..=idx);
                                    if let Some(json_str) = line.strip_prefix("data: ") {
                                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(json_str) {
                                            on_event(val);
                                        }
                                    }
                                }
                            }
                            _ => break,
                        }
                    }
                }
            }
        });

        Ok(true)
    }
}

/// Rewrites server-side `/api/stream/h/<session_key>/` paths in an HLS playlist into
/// `kstream://localhost/server-stream/<session_key>/` paths for Tauri WebKitGTK playback.
pub fn rewrite_lan_playlist_for_kstream(playlist: &str, session_key: &str) -> String {
    let from = format!("/api/stream/h/{session_key}/");
    let to = format!("kstream://localhost/server-stream/{session_key}/");
    playlist.replace(&from, &to)
}

#[cfg(feature = "desktop")]
pub fn into_tauri_response(reply: ProxyReply) -> tauri::http::Response<Vec<u8>> {
    let mut builder = tauri::http::Response::builder()
        .status(reply.status)
        .header("Content-Type", reply.content_type);
    if let Some(cr) = reply.content_range {
        builder = builder.header("Content-Range", cr);
    }
    for (k, v) in reply.extra_headers {
        builder = builder.header(k, v);
    }
    builder.body(reply.body).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::SocketAddr;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    async fn start_fixture_http_server(
        routes: HashMap<String, (&'static str, Vec<u8>)>,
    ) -> SocketAddr {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let routes = Arc::new(routes);
        tokio::spawn(async move {
            loop {
                let Ok((mut sock, _)) = listener.accept().await else {
                    break;
                };
                let routes = routes.clone();
                tokio::spawn(async move {
                    let mut buf = [0u8; 4096];
                    let Ok(n) = sock.read(&mut buf).await else {
                        return;
                    };
                    let req = String::from_utf8_lossy(&buf[..n]);
                    let path = req
                        .lines()
                        .next()
                        .and_then(|l| l.split_whitespace().nth(1))
                        .unwrap_or("/");
                    if let Some((ct, body)) = routes.get(path) {
                        let hdr = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: {ct}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                            body.len()
                        );
                        let _ = sock.write_all(hdr.as_bytes()).await;
                        let _ = sock.write_all(body).await;
                    } else {
                        let _ = sock
                            .write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
                            .await;
                    }
                });
            }
        });
        addr
    }

    #[test]
    fn production_policy_blocks_private_and_loopback_upstream() {
        let proxy = LanStreamProxy::default();
        #[cfg(not(feature = "loopback-fixtures"))]
        assert!(proxy
            .open("dev-1", "http://127.0.0.1:8080/live.m3u8")
            .is_err());
        assert!(proxy
            .open("dev-1", "http://192.168.1.50/secret.m3u8")
            .is_err());
        assert!(proxy
            .open("dev-1", "http://169.254.169.254/latest/meta-data")
            .is_err());
    }

    #[tokio::test]
    async fn lan_proxy_rewrites_hls_and_hides_upstream_credentials() {
        let mut routes = HashMap::new();
        routes.insert(
            "/secret-token/index.m3u8".to_string(),
            (
                "application/vnd.apple.mpegurl",
                b"#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:4\n#EXTINF:4.0,\nseg1.ts?key=supersecret\n".to_vec(),
            ),
        );
        routes.insert(
            "/secret-token/seg1.ts?key=supersecret".to_string(),
            ("video/mp2t", b"TS_SEGMENT_BYTES_OK".to_vec()),
        );
        let addr = start_fixture_http_server(routes).await;

        let test_policy = Policy {
            allow_loopback: true,
            ..Policy::default()
        };
        let proxy = LanStreamProxy::new(test_policy);

        let opened = proxy
            .open(
                "dev-tablet",
                &format!("http://{addr}/secret-token/index.m3u8"),
            )
            .unwrap();
        assert_eq!(opened.format, "hls");
        assert!(opened.proxy_path.starts_with("/api/stream/h/"));
        assert!(!opened.proxy_path.contains("secret-token"));

        let playlist_reply = proxy
            .serve(&opened.session_key, &opened.root_handle, None)
            .await;
        assert_eq!(playlist_reply.status, 200);
        assert_eq!(playlist_reply.content_type, PLAYLIST_TYPE);
        let playlist_text = String::from_utf8(playlist_reply.body).unwrap();
        assert!(!playlist_text.contains("secret-token"));
        assert!(!playlist_text.contains("supersecret"));
        assert!(!playlist_text.contains(&addr.to_string()));

        let seg_line = playlist_text
            .lines()
            .find(|l| l.starts_with("/api/stream/h/"))
            .expect("rewritten segment URL present");
        let seg_handle = seg_line.rsplit('/').next().unwrap();

        let seg_reply = proxy.serve(&opened.session_key, seg_handle, None).await;
        assert_eq!(seg_reply.status, 200);
        assert_eq!(seg_reply.content_type, "video/mp2t");
        assert_eq!(seg_reply.body, b"TS_SEGMENT_BYTES_OK");

        // Revoking the device immediately ends the stream session.
        proxy.revoke_device("dev-tablet");
        let after_revoke = proxy
            .serve(&opened.session_key, &opened.root_handle, None)
            .await;
        assert_eq!(after_revoke.status, 410);
    }

    #[test]
    fn validates_lan_server_urls_and_rewrites_kstream_playlists() {
        assert!(validate_lan_server_url("http://192.168.1.50:5198").is_ok());
        assert!(validate_lan_server_url("http://10.0.0.12:5198").is_ok());
        assert!(validate_lan_server_url("http://169.254.169.254:80").is_err());
        assert!(validate_lan_server_url("http://8.8.8.8:5198").is_err());
        assert!(validate_lan_server_url("http://user:pass@192.168.1.50:5198").is_err());
        assert!(validate_lan_server_url("ftp://192.168.1.50:5198").is_err());

        let key = "0123456789abcdef0123456789abcdef";
        let input = format!("#EXTM3U\n/api/stream/h/{key}/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n");
        let rewritten = rewrite_lan_playlist_for_kstream(&input, key);
        assert_eq!(
            rewritten,
            format!("#EXTM3U\nkstream://localhost/server-stream/{key}/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n")
        );
    }

    #[test]
    fn validates_allowed_client_server_api_paths() {
        assert_eq!(validate_api_path("/pair").unwrap(), "/pair");
        assert_eq!(validate_api_path("/api/info").unwrap(), "/api/info");
        assert_eq!(
            validate_api_path("/api/channels?group=News").unwrap(),
            "/api/channels?group=News"
        );
        assert!(validate_api_path("http://evil.example/api/info").is_err());
        assert!(validate_api_path("//evil.example/api/info").is_err());
        assert!(validate_api_path("/api/../etc/passwd").is_err());
        assert!(validate_api_path("/api/info@evil").is_err());
        assert!(validate_api_path("/unknown").is_err());
        assert!(validate_api_path("/api/info\r\nX-Injected: 1").is_err());
    }

    #[tokio::test]
    async fn client_server_request_and_sse_bridge_roundtrip_over_loopback() {
        use crate::remote_server::{RemoteChannelSummary, RemoteServerManager};

        // Pick an ephemeral free port for the test server instance.
        let free_port = {
            let sock = TcpListener::bind("127.0.0.1:0").await.unwrap();
            sock.local_addr().unwrap().port()
        };

        let server = RemoteServerManager::new(None);
        server
            .update_channels(vec![RemoteChannelSummary {
                id: "ch-bbc1".to_string(),
                name: "BBC One".to_string(),
                number: Some(101),
                group: Some("News".to_string()),
                logo: None,
                stream_url: Some("https://secret.example/live.m3u8?token=xyz".to_string()),
                current_programme: None,
            }])
            .await;

        let _status = server
            .start(Some(free_port), Some("4321".to_string()), |_| {})
            .await
            .expect("test server starts");

        let server_url = format!("http://127.0.0.1:{free_port}");

        // 1. Pair through the CSP-safe Rust bridge.
        let pair_resp = client_server_request(
            &server_url,
            "POST",
            "/pair",
            None,
            Some(r#"{"pin":"4321","deviceName":"Bridge Client","deviceType":"desktopclient"}"#),
        )
        .await
        .expect("pair request succeeds");
        assert!(pair_resp.ok);
        let pair_json: serde_json::Value = serde_json::from_str(&pair_resp.body).unwrap();
        let token = pair_json["token"]
            .as_str()
            .expect("token issued")
            .to_string();

        // 2. Fetch channels through the CSP-safe bridge and confirm streamUrl is stripped.
        let ch_resp =
            client_server_request(&server_url, "GET", "/api/channels", Some(&token), None)
                .await
                .expect("channels request succeeds");
        assert!(ch_resp.ok);
        assert!(ch_resp.body.contains("BBC One"));
        assert!(!ch_resp.body.contains("secret.example"));
        assert!(!ch_resp.body.contains("token=xyz"));

        // 3. Connect SSE bridge and confirm real-time sync_progress broadcast arrives.
        let sse = ClientSseBridge::new();
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<serde_json::Value>();
        let connected = sse
            .connect(&server_url, &token, move |val| {
                let _ = tx.send(val);
            })
            .await
            .expect("SSE bridge connects");
        assert!(connected);

        // Give the server a brief moment to register the SSE subscriber, then push progress.
        tokio::time::sleep(Duration::from_millis(60)).await;
        let prog_resp = client_server_request(
            &server_url,
            "POST",
            "/api/sync/progress",
            Some(&token),
            Some(r#"{"itemRef":"movie:solaris","title":"Solaris","position":180,"duration":6000}"#),
        )
        .await
        .expect("sync progress succeeds");
        assert!(prog_resp.ok);

        let received = tokio::time::timeout(Duration::from_secs(3), async {
            while let Some(ev) = rx.recv().await {
                if ev.get("type").and_then(|t| t.as_str()) == Some("sync_progress") {
                    return Some(ev);
                }
            }
            None
        })
        .await
        .expect("SSE event arrived in time")
        .expect("sync_progress event received");

        assert_eq!(received["data"]["itemRef"], "movie:solaris");
        assert_eq!(received["data"]["position"].as_f64(), Some(180.0));

        sse.disconnect();
        server.stop().await;
    }

    #[tokio::test]
    async fn client_lan_stream_bridge_rewrites_and_serves_kstream_playlist() {
        let session_key = "0123456789abcdef0123456789abcdef";
        let root_handle = "11111111111111111111111111111111";
        let seg_handle = "22222222222222222222222222222222";
        let open_body = serde_json::json!({
            "ok": true,
            "channelId": "ch-1",
            "sessionKey": session_key,
            "proxyPath": format!("/api/stream/h/{session_key}/{root_handle}"),
            "format": "hls"
        })
        .to_string()
        .into_bytes();
        let playlist_body = format!(
            "#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:4.0,\n/api/stream/h/{session_key}/{seg_handle}\n"
        )
        .into_bytes();

        let mut routes = HashMap::new();
        routes.insert(
            "/api/stream/open".to_string(),
            ("application/json", open_body),
        );
        routes.insert(
            format!("/api/stream/h/{session_key}/{root_handle}"),
            (PLAYLIST_TYPE, playlist_body),
        );
        routes.insert(
            format!("/api/stream/h/{session_key}/{seg_handle}"),
            ("video/mp2t", b"LAN_BRIDGE_SEGMENT_OK".to_vec()),
        );
        let addr = start_fixture_http_server(routes).await;
        let server_url = format!("http://{addr}");

        let bridge = ClientLanStreamBridge::new("tauri://localhost".to_string());
        let opened = bridge
            .open_from_server(&server_url, "tok-test", Some("ch-1"), None)
            .await
            .expect("bridge opens channel");
        assert_eq!(opened.format, "hls");
        assert_eq!(
            opened.url,
            format!("kstream://localhost/server-stream/{session_key}/{root_handle}")
        );

        let pl_reply = bridge
            .serve(
                "GET",
                &format!("/server-stream/{session_key}/{root_handle}"),
                Some("tauri://localhost"),
                &[],
            )
            .await;
        assert_eq!(pl_reply.status, 200);
        let pl_text = String::from_utf8(pl_reply.body).unwrap();
        assert!(pl_text.contains(&format!(
            "kstream://localhost/server-stream/{session_key}/{seg_handle}"
        )));

        let seg_reply = bridge
            .serve(
                "GET",
                &format!("/server-stream/{session_key}/{seg_handle}"),
                Some("tauri://localhost"),
                &[],
            )
            .await;
        assert_eq!(seg_reply.status, 200);
        assert_eq!(seg_reply.body, b"LAN_BRIDGE_SEGMENT_OK");

        bridge.close(opened.session);
        let after_close = bridge
            .serve(
                "GET",
                &format!("/server-stream/{session_key}/{seg_handle}"),
                Some("tauri://localhost"),
                &[],
            )
            .await;
        assert_eq!(after_close.status, 410);
    }

    #[tokio::test]
    async fn local_file_proxy_streams_ranges_and_enforces_root_containment() {
        let base = std::env::temp_dir().join(format!(
            "kinora_lan_local_file_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let lib_root = base.join("library");
        let outside_dir = base.join("outside");
        std::fs::create_dir_all(&lib_root).unwrap();
        std::fs::create_dir_all(&outside_dir).unwrap();

        let movie_path = lib_root.join("Solaris.mp4");
        let payload = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        std::fs::write(&movie_path, payload).unwrap();

        let text_path = lib_root.join("notes.txt");
        std::fs::write(&text_path, b"not a video").unwrap();

        let outside_path = outside_dir.join("secret.mp4");
        std::fs::write(&outside_path, b"secret video").unwrap();

        let proxy = LanStreamProxy::default();
        let roots = vec![lib_root.clone()];

        // Reject file outside authorized library roots
        assert!(proxy
            .open_local_file("dev-tv", &outside_path, &roots)
            .is_err());
        // Reject unsupported file extension inside root
        assert!(proxy.open_local_file("dev-tv", &text_path, &roots).is_err());
        // Reject empty allowed roots
        assert!(proxy.open_local_file("dev-tv", &movie_path, &[]).is_err());

        // Valid media file inside root succeeds and serves full & partial HTTP ranges
        let opened = proxy
            .open_local_file("dev-tv", &movie_path, &roots)
            .unwrap();
        assert_eq!(opened.format, "direct");
        assert!(!opened.proxy_path.contains("Solaris"));

        let full = proxy
            .serve(&opened.session_key, &opened.root_handle, None)
            .await;
        assert_eq!(full.status, 200);
        assert_eq!(full.content_type, "video/mp4");
        assert_eq!(full.body, payload);
        assert!(full
            .extra_headers
            .iter()
            .any(|(k, v)| *k == "Accept-Ranges" && v == "bytes"));

        let partial = proxy
            .serve(
                &opened.session_key,
                &opened.root_handle,
                Some("bytes=10-19"),
            )
            .await;
        assert_eq!(partial.status, 206);
        assert_eq!(partial.content_range.as_deref(), Some("bytes 10-19/36"));
        assert_eq!(partial.body, b"ABCDEFGHIJ");

        let invalid = proxy
            .serve(
                &opened.session_key,
                &opened.root_handle,
                Some("bytes=999-1000"),
            )
            .await;
        assert_eq!(invalid.status, 416);

        proxy.revoke_device("dev-tv");
        let revoked = proxy
            .serve(&opened.session_key, &opened.root_handle, None)
            .await;
        assert_eq!(revoked.status, 410);

        let _ = std::fs::remove_dir_all(&base);
    }
}
