//! Guarded artwork resolution and persistent disk caching.
//!
//! Owns private disk caching for channel logos, movie posters, series posters, backdrops,
//! and episode stills in `<app data>/artwork/` (0700 dir, 0600 files).
//!
//! Guarantees:
//! - Resolves artwork against stable entity keys and URLs.
//! - Caches raster bytes locally so images survive restarts and work offline.
//! - Bounds disk usage with LRU / size-based pruning (capped at 150 MB).
//! - Enforces strict network guards: proxy off, IP prohibited check, size limits (256KB for logos,
//!   4MB for posters/backdrops).
//! - Never leaks URLs, credentials or query tokens into logs or errors.
//! - Raster signature validation (PNG, JPEG, GIF, WebP); rejects HTML, SVG, unknown formats,
//!   and region blocks (e.g. Imgur UK region block).

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use tokio::sync::Semaphore;

use crate::fetch::{self, Policy};
use crate::ingest::{ErrorCode, IngestError};
use crate::sources;

static REQUESTS: Semaphore = Semaphore::const_new(20);
const MAX_CACHE_BYTES: u64 = 150 * 1024 * 1024;
const PRUNE_TARGET_BYTES: u64 = 100 * 1024 * 1024;
const MAX_CACHE_FILES: usize = 3000;
const FAILED_RETRY_TTL: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Artwork {
    pub mime_type: &'static str,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ArtworkCacheStats {
    pub file_count: usize,
    pub total_bytes: u64,
    pub max_bytes: u64,
    pub failed_count: usize,
}

pub fn detect_raster_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        Some("image/jpeg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    }
}

/// Extracts (width, height) in pixels from valid raster image bytes.
#[allow(dead_code)]
pub fn extract_raster_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() >= 24 && bytes.starts_with(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR") {
        let w = u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]);
        let h = u32::from_be_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]);
        if w > 0 && h > 0 {
            return Some((w, h));
        }
    } else if bytes.len() >= 10 && (bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a")) {
        let w = u16::from_le_bytes([bytes[6], bytes[7]]) as u32;
        let h = u16::from_le_bytes([bytes[8], bytes[9]]) as u32;
        if w > 0 && h > 0 {
            return Some((w, h));
        }
    } else if bytes.len() >= 4 && bytes.starts_with(b"\xff\xd8") {
        let mut i = 2;
        while i + 9 < bytes.len() {
            if bytes[i] != 0xff {
                break;
            }
            let marker = bytes[i + 1];
            if marker == 0xd9 || marker == 0xda {
                break;
            }
            if (0xc0..=0xc3).contains(&marker) {
                let h = u16::from_be_bytes([bytes[i + 5], bytes[i + 6]]) as u32;
                let w = u16::from_be_bytes([bytes[i + 7], bytes[i + 8]]) as u32;
                if w > 0 && h > 0 {
                    return Some((w, h));
                }
            }
            let len = u16::from_be_bytes([bytes[i + 2], bytes[i + 3]]) as usize;
            i += 2 + len;
        }
    } else if bytes.len() >= 30 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        if &bytes[12..16] == b"VP8 " && bytes.len() >= 30 {
            let w = (u16::from_le_bytes([bytes[26], bytes[27]]) & 0x3fff) as u32;
            let h = (u16::from_le_bytes([bytes[28], bytes[29]]) & 0x3fff) as u32;
            if w > 0 && h > 0 {
                return Some((w, h));
            }
        } else if &bytes[12..16] == b"VP8X" && bytes.len() >= 30 {
            let w = 1 + (bytes[24] as u32 | ((bytes[25] as u32) << 8) | ((bytes[26] as u32) << 16));
            let h = 1 + (bytes[27] as u32 | ((bytes[28] as u32) << 8) | ((bytes[29] as u32) << 16));
            return Some((w, h));
        }
    }
    None
}

/// Identifies standard display aspect ratio from dimensions.
#[allow(dead_code)]
pub fn detect_aspect_ratio(width: u32, height: u32) -> &'static str {
    if width == 0 || height == 0 {
        return "custom";
    }
    let ratio = (width as f64) / (height as f64);
    if (ratio - (16.0 / 9.0)).abs() < 0.15 {
        "16:9"
    } else if (ratio - (2.0 / 3.0)).abs() < 0.10 {
        "2:3"
    } else if (ratio - 1.0).abs() < 0.08 {
        "1:1"
    } else {
        "custom"
    }
}

/// Identifies orientation: portrait, landscape, or square.
#[allow(dead_code)]
pub fn detect_orientation(width: u32, height: u32) -> &'static str {
    if width > height * 115 / 100 {
        "landscape"
    } else if height > width * 115 / 100 {
        "portrait"
    } else {
        "square"
    }
}

/// Derives a typed, isolated cache key preventing collision between channel logos,
/// movie posters, series backdrops, episode stills, and EPG programme images.
#[allow(dead_code)]
pub fn cache_key_for_content(content_type: &str, content_id: &str) -> String {
    format!("{content_type}:{content_id}")
}

/// Detects if the given bytes look like an SVG document.
pub fn is_svg(bytes: &[u8]) -> bool {
    let Ok(s) = std::str::from_utf8(bytes) else {
        return false;
    };
    let trimmed = s.trim_start_matches('\u{feff}').trim_start();
    if trimmed.starts_with("<svg") {
        return true;
    }
    if (trimmed.starts_with("<?xml")
        || trimmed.starts_with("<!DOCTYPE")
        || trimmed.starts_with("<!--"))
        && trimmed.contains("<svg")
    {
        return true;
    }
    false
}

/// Validates and sanitizes untrusted SVG bytes before rasterization.
///
/// Refuses:
/// - Input larger than 256 KB.
/// - Active content tags (<script>, <foreignObject>, <iframe>, <object>, <embed>...).
/// - Event handler attributes (onload=, onclick=, onerror=...).
/// - External references in href / xlink:href (http:, https:, data:, javascript:, file:).
/// - Entity expansions (XXE / DTD attacks).
/// - Malformed XML or deeply nested trees (>2,000 elements).
pub fn sanitize_and_validate_svg(bytes: &[u8]) -> Result<&str, &'static str> {
    if bytes.len() > 256 * 1024 {
        return Err("SVG is larger than 256 KB limit");
    }
    let s = std::str::from_utf8(bytes).map_err(|_| "SVG is not valid UTF-8")?;
    let lower = s.to_ascii_lowercase();

    // Check for entity / DTD attacks
    if lower.contains("<!entity")
        || (lower.contains("<!doctype") && (lower.contains("system") || lower.contains("public")))
    {
        return Err("SVG contains entity or external DTD declaration");
    }

    // Check for active content tags
    let banned_tags = [
        "<script",
        "<foreignobject",
        "<iframe",
        "<object",
        "<embed",
        "<applet",
        "<meta",
        "<link",
        "<audio",
        "<video",
        "<form",
        "<input",
        "<button",
    ];
    for tag in banned_tags {
        if lower.contains(tag) {
            return Err("SVG contains active or embedded content");
        }
    }

    // Parse XML tree with roxmltree (part of usvg)
    let doc = resvg::usvg::roxmltree::Document::parse(s).map_err(|_| "malformed SVG XML")?;
    if !doc
        .root_element()
        .tag_name()
        .name()
        .eq_ignore_ascii_case("svg")
    {
        return Err("root element is not svg");
    }

    let mut element_count = 0usize;
    for node in doc.root().descendants() {
        if node.is_element() {
            element_count += 1;
            if element_count > 2000 {
                return Err("too many elements in SVG");
            }
            let tag = node.tag_name().name().to_ascii_lowercase();
            if banned_tags.iter().any(|b| b.trim_start_matches('<') == tag) {
                return Err("prohibited element in SVG");
            }

            for attr in node.attributes() {
                let name = attr.name().to_ascii_lowercase();
                if name.starts_with("on") {
                    return Err("event handler attribute in SVG");
                }
                if name == "href" || name.ends_with(":href") {
                    let val = attr.value().trim().to_ascii_lowercase();
                    if val.starts_with("http:")
                        || val.starts_with("https:")
                        || val.starts_with("//")
                        || val.starts_with("javascript:")
                        || val.starts_with("data:")
                        || val.starts_with("file:")
                    {
                        return Err("external reference in SVG href");
                    }
                }
                if name == "style" {
                    let style_lower = attr.value().to_ascii_lowercase();
                    if style_lower.contains("@import")
                        || (style_lower.contains("url(")
                            && (style_lower.contains("http:")
                                || style_lower.contains("https:")
                                || style_lower.contains("data:")
                                || style_lower.contains("javascript:")
                                || style_lower.contains("//")))
                    {
                        return Err("external reference in SVG style attribute");
                    }
                }
            }

            if tag == "style" {
                if let Some(text) = node.text() {
                    let style_lower = text.to_ascii_lowercase();
                    if style_lower.contains("@import")
                        || (style_lower.contains("url(")
                            && (style_lower.contains("http:")
                                || style_lower.contains("https:")
                                || style_lower.contains("data:")
                                || style_lower.contains("javascript:")
                                || style_lower.contains("//")))
                    {
                        return Err("external reference in SVG style element");
                    }
                }
            }
        }
    }

    Ok(s)
}

/// Converts validated SVG text into a safe raster PNG image.
pub fn rasterize_svg_to_png(svg_str: &str, target_size: u32) -> Option<Vec<u8>> {
    let opt = resvg::usvg::Options::default();
    let tree = resvg::usvg::Tree::from_str(svg_str, &opt).ok()?;
    let size = tree.size();
    let orig_w = size.width();
    let orig_h = size.height();
    if !orig_w.is_finite() || !orig_h.is_finite() || orig_w <= 0.0 || orig_h <= 0.0 {
        return None;
    }
    let target = target_size.clamp(16, 512) as f32;
    let scale = (target / orig_w).min(target / orig_h).min(8.0);
    let width = ((orig_w * scale).round() as u32).clamp(1, target_size);
    let height = ((orig_h * scale).round() as u32).clamp(1, target_size);
    let mut pixmap = resvg::tiny_skia::Pixmap::new(width, height)?;
    let transform = resvg::tiny_skia::Transform::from_scale(scale, scale);
    resvg::render(&tree, transform, &mut pixmap.as_mut());
    pixmap.encode_png().ok()
}

/// Imgur answers 200 with a "Content not viewable in your region" picture from the UK, which must not
/// pass for a channel's logo or artwork. shortcut: recognised by host and its 336x478 PNG size.
pub fn is_region_block(host: Option<&str>, bytes: &[u8]) -> bool {
    host == Some("i.imgur.com")
        && bytes.len() > 24
        && bytes.starts_with(b"\x89PNG")
        && bytes[16..20] == 336u32.to_be_bytes()
        && bytes[20..24] == 478u32.to_be_bytes()
}

fn fnv1a(s: &str, seed: u64) -> u64 {
    s.bytes().fold(seed, |h, b| {
        (h ^ u64::from(b)).wrapping_mul(0x0100_0000_01b3)
    })
}

pub fn cache_filename(key: &str) -> String {
    let h1 = fnv1a(key, 0xcbf2_9ce4_8422_2325);
    let h2 = fnv1a(key, 0x8422_2325_cbf2_9ce4);
    format!("{h1:016x}{h2:016x}.bin")
}

pub struct ArtworkStore {
    dir: Option<PathBuf>,
    pruning: Mutex<()>,
    failed: Mutex<HashMap<String, Instant>>,
}

impl ArtworkStore {
    pub fn new(app_dir: Option<PathBuf>) -> Self {
        let dir = app_dir.map(|d| d.join("artwork"));
        if let Some(ref path) = dir {
            let _ = fs::create_dir_all(path);
            #[cfg(unix)]
            let _ = sources::private(path, 0o700);
        }
        Self {
            dir,
            pruning: Mutex::new(()),
            failed: Mutex::new(HashMap::new()),
        }
    }

    fn is_failed(&self, key: &str) -> bool {
        let mut map = self.failed.lock().unwrap_or_else(|p| p.into_inner());
        if let Some(failed_at) = map.get(key) {
            if failed_at.elapsed() < FAILED_RETRY_TTL {
                return true;
            }
            map.remove(key);
        }
        false
    }

    fn mark_failed(&self, key: String) {
        let mut map = self.failed.lock().unwrap_or_else(|p| p.into_inner());
        if map.len() > 8192 {
            map.retain(|_, t| t.elapsed() < FAILED_RETRY_TTL);
            if map.len() > 8192 {
                map.clear();
            }
        }
        map.insert(key, Instant::now());
    }

    pub fn clear_failed(&self) {
        self.failed
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clear();
    }

    pub fn cache_stats(&self) -> ArtworkCacheStats {
        let failed_count = {
            let mut map = self.failed.lock().unwrap_or_else(|p| p.into_inner());
            map.retain(|_, t| t.elapsed() < FAILED_RETRY_TTL);
            map.len()
        };
        let mut file_count = 0usize;
        let mut total_bytes = 0u64;
        if let Some(ref dir) = self.dir {
            if let Ok(entries) = fs::read_dir(dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().and_then(|e| e.to_str()) == Some("bin") {
                        if let Ok(meta) = entry.metadata() {
                            file_count += 1;
                            total_bytes = total_bytes.saturating_add(meta.len());
                        }
                    }
                }
            }
        }
        ArtworkCacheStats {
            file_count,
            total_bytes,
            max_bytes: MAX_CACHE_BYTES,
            failed_count,
        }
    }

    pub fn clear_cache(&self) -> u64 {
        self.clear_failed();
        let Some(ref dir) = self.dir else { return 0 };
        let _lock = self.pruning.lock().unwrap_or_else(|p| p.into_inner());
        let Ok(entries) = fs::read_dir(dir) else {
            return 0;
        };
        let mut freed = 0u64;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("bin") {
                if let Ok(meta) = entry.metadata() {
                    freed = freed.saturating_add(meta.len());
                }
                let _ = fs::remove_file(path);
            }
        }
        freed
    }

    pub fn read_cached(&self, key: &str) -> Option<Artwork> {
        let dir = self.dir.as_ref()?;
        let path = dir.join(cache_filename(key));
        let bytes = fs::read(&path).ok()?;
        let mime_type = detect_raster_mime(&bytes)?;
        Some(Artwork { mime_type, bytes })
    }

    pub fn write_cached(&self, key: &str, bytes: &[u8]) {
        let Some(dir) = self.dir.as_ref() else { return };
        let filename = cache_filename(key);
        let _ = sources::write_atomically(dir, &filename, bytes);
        self.prune_if_needed();
    }

    fn prune_if_needed(&self) {
        let Some(dir) = self.dir.as_ref() else { return };
        let _lock = self.pruning.lock().unwrap_or_else(|p| p.into_inner());
        let Ok(entries) = fs::read_dir(dir) else {
            return;
        };
        let mut files = Vec::new();
        let mut total_bytes = 0u64;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("bin") {
                if let Ok(meta) = entry.metadata() {
                    let len = meta.len();
                    let modified = meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                    total_bytes = total_bytes.saturating_add(len);
                    files.push((path, modified, len));
                }
            }
        }
        if total_bytes > MAX_CACHE_BYTES || files.len() > MAX_CACHE_FILES {
            files.sort_by_key(|(_, modified, _)| *modified);
            for (path, _, len) in files {
                let _ = fs::remove_file(path);
                total_bytes = total_bytes.saturating_sub(len);
                if total_bytes <= PRUNE_TARGET_BYTES {
                    break;
                }
            }
        }
    }

    pub async fn get_or_fetch_logo(
        &self,
        url: Option<&str>,
        channel_key: Option<&str>,
        tvg_id: Option<&str>,
    ) -> Result<Option<Artwork>, IngestError> {
        if let Some(key) = channel_key {
            let cache_key = format!("channel:{key}");
            if let Some(cached) = self.read_cached(&cache_key) {
                return Ok(Some(cached));
            }
        }

        if let Some(id) = tvg_id {
            let cache_key = format!("tvg:{id}");
            if let Some(cached) = self.read_cached(&cache_key) {
                return Ok(Some(cached));
            }
        }

        if let Some(u) = url {
            let cache_key = format!("url:{u}");
            if let Some(cached) = self.read_cached(&cache_key) {
                if let Some(key) = channel_key {
                    self.write_cached(&format!("channel:{key}"), &cached.bytes);
                }
                if let Some(id) = tvg_id {
                    self.write_cached(&format!("tvg:{id}"), &cached.bytes);
                }
                return Ok(Some(cached));
            }

            if !self.is_failed(&cache_key) {
                let policy = Policy::logo();
                if let Ok(checked) = fetch::check_url(u, &policy) {
                    let _permit = REQUESTS.acquire().await.map_err(|_| {
                        IngestError::new(ErrorCode::Busy, "Logo loading is busy. Try again later.")
                    })?;
                    if let Ok((raw_bytes, _)) = fetch::download_bytes(
                        checked.as_str(),
                        &policy,
                        "image/png,image/jpeg,image/webp,image/gif,image/svg+xml;q=0.9",
                    )
                    .await
                    {
                        if !is_region_block(checked.host_str(), &raw_bytes) {
                            let decoded = if let Some(raster_mime) = detect_raster_mime(&raw_bytes)
                            {
                                Some((raw_bytes, raster_mime))
                            } else if is_svg(&raw_bytes) {
                                sanitize_and_validate_svg(&raw_bytes)
                                    .ok()
                                    .and_then(|svg_str| rasterize_svg_to_png(svg_str, 128))
                                    .map(|png_bytes| (png_bytes, "image/png"))
                            } else {
                                None
                            };

                            if let Some((bytes, mime_type)) = decoded {
                                self.write_cached(&cache_key, &bytes);
                                if let Some(key) = channel_key {
                                    self.write_cached(&format!("channel:{key}"), &bytes);
                                }
                                if let Some(id) = tvg_id {
                                    self.write_cached(&format!("tvg:{id}"), &bytes);
                                }
                                return Ok(Some(Artwork { mime_type, bytes }));
                            }
                        }
                    }
                }
                self.mark_failed(cache_key);
            }
        }

        if let Some(id) = tvg_id {
            let cache_key = format!("tvg:{id}");
            if let Some(cached) = self.read_cached(&cache_key) {
                return Ok(Some(cached));
            }
            if let Some(matched) = conservative_logo_for_id(id) {
                return Ok(Some(matched));
            }
        }

        Ok(None)
    }

    pub async fn get_or_fetch_artwork(
        &self,
        artwork_key: &str,
        remote_url: Option<&str>,
    ) -> Result<Option<Artwork>, IngestError> {
        self.get_or_fetch_artwork_opts(artwork_key, remote_url, false)
            .await
    }

    pub async fn get_or_fetch_artwork_opts(
        &self,
        artwork_key: &str,
        remote_url: Option<&str>,
        force_refresh: bool,
    ) -> Result<Option<Artwork>, IngestError> {
        let url_key = remote_url.map(|u| format!("url:{u}"));

        if !force_refresh {
            if let Some(cached) = self.read_cached(artwork_key) {
                return Ok(Some(cached));
            }
            if let Some(ref uk) = url_key {
                if uk != artwork_key {
                    if let Some(cached) = self.read_cached(uk) {
                        self.write_cached(artwork_key, &cached.bytes);
                        return Ok(Some(cached));
                    }
                }
            }
            if self.is_failed(artwork_key) {
                return Ok(None);
            }
            if let Some(ref uk) = url_key {
                if self.is_failed(uk) {
                    return Ok(None);
                }
            }
        } else {
            let mut map = self.failed.lock().unwrap_or_else(|p| p.into_inner());
            map.remove(artwork_key);
            if let Some(ref uk) = url_key {
                map.remove(uk);
            }
        }

        let Some(u) = remote_url else { return Ok(None) };
        let policy = Policy::artwork();
        let checked = match fetch::check_url(u, &policy) {
            Ok(url) => url,
            Err(_) => {
                self.mark_failed(artwork_key.to_string());
                if let Some(uk) = url_key {
                    self.mark_failed(uk);
                }
                return Ok(None);
            }
        };
        let _permit = REQUESTS.acquire().await.map_err(|_| {
            IngestError::new(ErrorCode::Busy, "Artwork loading is busy. Try again later.")
        })?;
        let download_result = fetch::download_bytes(
            checked.as_str(),
            &policy,
            "image/png,image/jpeg,image/webp,image/gif,image/svg+xml;q=0.9",
        )
        .await;
        let (raw_bytes, _) = match download_result {
            Ok(res) => res,
            Err(_) => {
                self.mark_failed(artwork_key.to_string());
                if let Some(uk) = url_key {
                    self.mark_failed(uk);
                }
                return Ok(None);
            }
        };
        if is_region_block(checked.host_str(), &raw_bytes) {
            self.mark_failed(artwork_key.to_string());
            if let Some(uk) = url_key {
                self.mark_failed(uk);
            }
            return Ok(None);
        }
        let (bytes, mime_type) = if let Some(raster_mime) = detect_raster_mime(&raw_bytes) {
            (raw_bytes, raster_mime)
        } else if is_svg(&raw_bytes) {
            match sanitize_and_validate_svg(&raw_bytes) {
                Ok(svg_str) => match rasterize_svg_to_png(svg_str, 512) {
                    Some(png_bytes) => (png_bytes, "image/png"),
                    None => {
                        self.mark_failed(artwork_key.to_string());
                        return Ok(None);
                    }
                },
                Err(_) => {
                    self.mark_failed(artwork_key.to_string());
                    return Ok(None);
                }
            }
        } else {
            self.mark_failed(artwork_key.to_string());
            return Ok(None);
        };
        self.write_cached(artwork_key, &bytes);
        if let Some(ref uk) = url_key {
            if uk != artwork_key {
                self.write_cached(uk, &bytes);
            }
        }
        Ok(Some(Artwork { mime_type, bytes }))
    }
}

/// Conservative matching against known verified broadcasters by tvg-id.
/// Kinora never hardcodes third-party broadcaster trademark/logo URLs; logos come
/// only from a user's own playlist or local cache, falling back to typographic initials.
pub fn conservative_logo_for_id(_id: &str) -> Option<Artwork> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TempDir(PathBuf);
    impl TempDir {
        fn new(tag: &str) -> Self {
            let mut bytes = [0u8; 8];
            getrandom::fill(&mut bytes).unwrap();
            let path = std::env::temp_dir().join(format!(
                "kinora-artwork-{tag}-{}",
                bytes.iter().map(|b| format!("{b:02x}")).collect::<String>()
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn raster_signatures_detection() {
        assert_eq!(
            detect_raster_mime(b"\x89PNG\r\n\x1a\nrest"),
            Some("image/png")
        );
        assert_eq!(
            detect_raster_mime(b"\xff\xd8\xff\xe0rest"),
            Some("image/jpeg")
        );
        assert_eq!(detect_raster_mime(b"GIF89arest"), Some("image/gif"));
        assert_eq!(detect_raster_mime(b"GIF87arest"), Some("image/gif"));
        assert_eq!(detect_raster_mime(b"RIFF0000WEBPrest"), Some("image/webp"));
        assert_eq!(
            detect_raster_mime(b"<svg xmlns='http://www.w3.org/2000/svg'>"),
            None
        );
        assert_eq!(detect_raster_mime(b"<!doctype html>"), None);
        assert_eq!(detect_raster_mime(b""), None);
    }

    const TEST_PNG: &[u8] = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82";

    #[test]
    fn cache_round_trip_and_survives_new_store_instance() {
        let tmp = TempDir::new("roundtrip");
        let store1 = ArtworkStore::new(Some(tmp.0.clone()));

        let png_bytes = TEST_PNG;
        store1.write_cached("channel:one.uk", png_bytes);

        // Can read from same instance
        let read1 = store1
            .read_cached("channel:one.uk")
            .expect("should read cached");
        assert_eq!(read1.mime_type, "image/png");
        assert_eq!(read1.bytes, png_bytes);

        // Survives app restart (new ArtworkStore instance pointing to same directory)
        let store2 = ArtworkStore::new(Some(tmp.0.clone()));
        let read2 = store2
            .read_cached("channel:one.uk")
            .expect("survives restart");
        assert_eq!(read2.mime_type, "image/png");
        assert_eq!(read2.bytes, png_bytes);

        // Missing key returns None
        assert!(store2.read_cached("channel:missing").is_none());
    }

    #[test]
    fn corrupt_cache_file_is_handled_safely() {
        let tmp = TempDir::new("corrupt");
        let store = ArtworkStore::new(Some(tmp.0.clone()));
        // Write corrupt bytes
        let filename = cache_filename("channel:bad");
        fs::write(tmp.0.join("artwork").join(filename), b"not an image").unwrap();

        // read_cached rejects corrupt bytes
        assert!(store.read_cached("channel:bad").is_none());
    }

    #[test]
    fn valid_svg_accepted_and_rasterized_to_png() {
        let svg = br##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
            <circle cx="50" cy="50" r="40" fill="#0066cc"/>
            <rect x="20" y="20" width="60" height="60" fill="#ffffff" opacity="0.8"/>
        </svg>"##;

        assert!(is_svg(svg));
        let validated = sanitize_and_validate_svg(svg).expect("valid SVG should pass validation");
        let png = rasterize_svg_to_png(validated, 128).expect("valid SVG should rasterize to PNG");
        assert!(png.starts_with(b"\x89PNG\r\n\x1a\n"));
        assert_eq!(detect_raster_mime(&png), Some("image/png"));

        // Caching round-trip as safe raster image
        let tmp = TempDir::new("svg-cache");
        let store = ArtworkStore::new(Some(tmp.0.clone()));
        store.write_cached("channel:svg-test", &png);
        let cached = store
            .read_cached("channel:svg-test")
            .expect("should read cached raster");
        assert_eq!(cached.mime_type, "image/png");
        assert_eq!(cached.bytes, png);
    }

    #[test]
    fn svg_security_rejections_active_content() {
        // 1. Script tag
        let script_svg =
            b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script><circle/></svg>";
        assert!(sanitize_and_validate_svg(script_svg).is_err());

        // 2. Event handler on root
        let onload_svg =
            b"<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'><circle/></svg>";
        assert!(sanitize_and_validate_svg(onload_svg).is_err());

        // 3. Event handler on child
        let onclick_svg =
            b"<svg xmlns='http://www.w3.org/2000/svg'><circle onclick='alert(1)' r='10'/></svg>";
        assert!(sanitize_and_validate_svg(onclick_svg).is_err());

        // 4. External reference in href
        let href_svg = b"<svg xmlns='http://www.w3.org/2000/svg'><image href='https://evil.example/track.png'/></svg>";
        assert!(sanitize_and_validate_svg(href_svg).is_err());

        // 5. External reference in xlink:href
        let xlink_svg = b"<svg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'><use xlink:href='//evil.example/icon.svg#x'/></svg>";
        assert!(sanitize_and_validate_svg(xlink_svg).is_err());

        // 6. ForeignObject embedding
        let foreign_svg = b"<svg xmlns='http://www.w3.org/2000/svg'><foreignObject width='100' height='100'><iframe src='http://evil.example'/></foreignObject></svg>";
        assert!(sanitize_and_validate_svg(foreign_svg).is_err());

        // 7. XML Entity expansion attack
        let xxe_svg = b"<!DOCTYPE svg [ <!ENTITY xxe SYSTEM 'file:///etc/passwd'> ]><svg xmlns='http://www.w3.org/2000/svg'>&xxe;</svg>";
        assert!(sanitize_and_validate_svg(xxe_svg).is_err());

        // 8. External CSS @import
        let css_svg = b"<svg xmlns='http://www.w3.org/2000/svg'><style>@import url('https://evil.example/style.css');</style></svg>";
        assert!(sanitize_and_validate_svg(css_svg).is_err());
    }

    #[test]
    fn svg_oversized_and_malformed_fails_safely() {
        // Malformed XML
        assert!(sanitize_and_validate_svg(b"<svg><rect<<<<").is_err());
        assert!(sanitize_and_validate_svg(b"<svg><circle").is_err());

        // Non-SVG XML
        assert!(
            sanitize_and_validate_svg(b"<?xml version='1.0'?><catalog><item/></catalog>").is_err()
        );

        // HTML masquerading
        assert!(
            sanitize_and_validate_svg(b"<!doctype html><html><body>not svg</body></html>").is_err()
        );

        // Oversized SVG (>256KB)
        let mut big = Vec::from(&b"<svg xmlns='http://www.w3.org/2000/svg'><!-- "[..]);
        big.resize(300 * 1024, b'x');
        big.extend_from_slice(b" --></svg>");
        assert!(sanitize_and_validate_svg(&big).is_err());
    }

    #[test]
    fn uncached_logo_with_no_valid_primary_url_returns_none_without_hardcoded_broadcaster_fallback() {
        let tmp = TempDir::new("no-hardcoded-fallback");
        let store = ArtworkStore::new(Some(tmp.0.clone()));
        let result = tauri::async_runtime::block_on(store.get_or_fetch_logo(
            Some("http://127.0.0.1:9/blocked.png"),
            Some("pl-1~bbc1"),
            Some("BBCOne.uk@HD"),
        ))
        .expect("should not error");
        assert!(result.is_none());
    }

    #[test]
    fn blocked_or_unusable_primary_logo_falls_back_to_tvg_id_cache() {
        let tmp = TempDir::new("fallback-flow");
        let store = ArtworkStore::new(Some(tmp.0.clone()));
        store.write_cached("tvg:5USA.uk@SD", TEST_PNG);

        // Even when a primary logo URL is invalid or blocked, get_or_fetch_logo falls back to the tvg_id logo
        let result = tauri::async_runtime::block_on(store.get_or_fetch_logo(
            Some("http://127.0.0.1:9/blocked.png"),
            Some("pl-1~5usa"),
            Some("5USA.uk@SD"),
        ))
        .expect("should not error");
        let art = result.expect("should resolve fallback logo");
        assert_eq!(art.mime_type, "image/png");
        assert_eq!(art.bytes, TEST_PNG);
    }

    #[test]
    fn dimension_extraction_and_aspect_ratio_classification() {
        // PNG dimensions from TEST_PNG (1x1)
        let png_dim = extract_raster_dimensions(TEST_PNG);
        assert_eq!(png_dim, Some((1, 1)));
        assert_eq!(detect_aspect_ratio(1, 1), "1:1");
        assert_eq!(detect_orientation(1, 1), "square");

        // 16:9 landscape dimensions
        assert_eq!(detect_aspect_ratio(1920, 1080), "16:9");
        assert_eq!(detect_aspect_ratio(1280, 720), "16:9");
        assert_eq!(detect_orientation(1920, 1080), "landscape");

        // 2:3 portrait dimensions (theatrical poster)
        assert_eq!(detect_aspect_ratio(600, 900), "2:3");
        assert_eq!(detect_aspect_ratio(1000, 1500), "2:3");
        assert_eq!(detect_orientation(600, 900), "portrait");

        // Custom / irregular aspect ratio
        assert_eq!(detect_aspect_ratio(500, 200), "custom");
        assert_eq!(detect_orientation(500, 200), "landscape");

        // GIF test dimensions
        let mut gif_bytes = Vec::from(&b"GIF89a"[..]);
        gif_bytes.extend_from_slice(&320u16.to_le_bytes()); // width = 320
        gif_bytes.extend_from_slice(&240u16.to_le_bytes()); // height = 240
        assert_eq!(extract_raster_dimensions(&gif_bytes), Some((320, 240)));

        // Corrupt or non-image bytes
        assert_eq!(extract_raster_dimensions(b"not an image"), None);
        assert_eq!(extract_raster_dimensions(b""), None);
    }

    #[test]
    fn cache_key_namespacing_prevents_cross_type_collision() {
        let channel_key = cache_key_for_content("channel", "bbc-one");
        let poster_key = cache_key_for_content("movie:poster", "bbc-one");
        let backdrop_key = cache_key_for_content("movie:backdrop", "bbc-one");
        let prog_key = cache_key_for_content("prog", "bbc-one");

        assert_ne!(channel_key, poster_key);
        assert_ne!(poster_key, backdrop_key);
        assert_ne!(backdrop_key, prog_key);

        let f_channel = cache_filename(&channel_key);
        let f_poster = cache_filename(&poster_key);
        let f_backdrop = cache_filename(&backdrop_key);
        let f_prog = cache_filename(&prog_key);

        // Every content type gets its own unique disk cache file
        let mut unique_files = std::collections::HashSet::new();
        unique_files.insert(f_channel);
        unique_files.insert(f_poster);
        unique_files.insert(f_backdrop);
        unique_files.insert(f_prog);
        assert_eq!(unique_files.len(), 4);
    }

    #[test]
    fn cache_stats_clear_and_failed_reset_work() {
        let dir = std::env::temp_dir().join(format!("kinora-art-stats-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let store = ArtworkStore::new(Some(dir.clone()));

        let initial = store.cache_stats();
        assert_eq!(initial.file_count, 0);
        assert_eq!(initial.total_bytes, 0);

        let png = b"\x89PNG\r\n\x1a\nfake-png-body";
        store.write_cached("movie-poster:test-1", png);
        store.mark_failed("url:https://example.invalid/bad.jpg".to_string());

        let populated = store.cache_stats();
        assert_eq!(populated.file_count, 1);
        assert_eq!(populated.total_bytes, png.len() as u64);
        assert_eq!(populated.failed_count, 1);

        store.clear_failed();
        assert_eq!(store.cache_stats().failed_count, 0);

        let freed = store.clear_cache();
        assert_eq!(freed, png.len() as u64);
        assert_eq!(store.cache_stats().file_count, 0);

        let _ = fs::remove_dir_all(&dir);
    }
}
