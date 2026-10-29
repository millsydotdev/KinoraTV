//! Playlist ingestion entry points used by the IPC commands: fetch or receive M3U text, parse it,
//! and report what was found. Nothing here persists sources or touches stream URLs.

use serde::Serialize;

use crate::{fetch, m3u};

/// Upper bound for playlist text, fetched or picked from a file. Mirrored in `src/lib/native.ts`.
pub const MAX_PLAYLIST_BYTES: usize = 25 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ErrorCode {
    InvalidUrl,
    Blocked,
    TooManyRedirects,
    Timeout,
    TooLarge,
    TooManyEntries,
    HttpStatus,
    WebPage,
    HlsMedia,
    HlsMaster,
    NotPlaylist,
    Network,
    /// The stream session's in-flight memory budget is spent; the request can be retried.
    Busy,
    /// The stream is not something Kinora can play (not HLS, an unsupported scheme, sign-in in the address).
    UnsupportedStream,
    /// Saved sources could not be written (read-only store, disk error, or input in an unexpected shape).
    Storage,
    /// The data is not a usable XMLTV guide (not XML, wrong root, unsupported encoding or XML features).
    NotGuide,
    /// The source catalogue could not be read (format changed, or not the catalogue at all).
    NotCatalogue,
}

/// Safe to show the user: messages name at most the host, never a path, query or credential.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct IngestError {
    pub code: ErrorCode,
    pub message: String,
}

impl IngestError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

impl std::fmt::Display for IngestError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

// Lets the resolver and redirect policy hand this error to reqwest and get it back intact.
impl std::error::Error for IngestError {}

/// Mirrored by `PlaylistReport` in `src/lib/native.ts`.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub channels: Vec<m3u::Channel>,
    /// Entries dropped because they were malformed or had an unusable stream address.
    pub skipped: u32,
    /// Exact repeats (same guide id and stream address) that were dropped.
    pub duplicates: u32,
    pub warnings: Vec<String>,
    /// Host the playlist came from; `None` for a local file.
    pub host: Option<String>,
}

fn report(playlist: m3u::Playlist, host: Option<String>) -> Report {
    Report {
        channels: playlist.channels,
        skipped: playlist.skipped,
        duplicates: playlist.duplicates,
        warnings: playlist.warnings,
        host,
    }
}

pub async fn from_url(raw_url: &str, policy: &fetch::Policy) -> Result<Report, IngestError> {
    let (text, host) = fetch::download(raw_url, policy).await?;
    Ok(report(m3u::parse(&text)?, Some(host)))
}

/// Text from a file the user picked in the webview; Rust never sees a path.
pub fn from_text(text: &str) -> Result<Report, IngestError> {
    if text.len() > MAX_PLAYLIST_BYTES {
        return Err(IngestError::new(
            ErrorCode::TooLarge,
            "That file is larger than the 25 MB playlist limit.",
        ));
    }
    Ok(report(m3u::parse(text)?, None))
}
