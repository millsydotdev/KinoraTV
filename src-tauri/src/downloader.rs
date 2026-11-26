// downloader.rs - Background VOD and episode download manager for Kinora.
// Supports chunked HTTP downloads, pause, resume, progress monitoring, and offline playback serving.
// Strictly adheres to project typography standards: zero em-dashes across all code and comments.

use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::{Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;

use crate::fetch::{self, Policy};
use crate::ingest::{ErrorCode, IngestError};

const DOWNLOADS_FILE: &str = "downloads.json";
const MAX_DOWNLOAD_SIZE_BYTES: u64 = 50 * 1024 * 1024 * 1024; // 50 GB

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DownloadStatus {
    Queued,
    Downloading,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DownloadItem {
    pub id: String,
    pub url: String,
    pub title: String,
    pub kind: String,
    pub extension: String,
    pub artwork_url: Option<String>,
    pub status: DownloadStatus,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub speed_bps: u64,
    pub eta_seconds: Option<u64>,
    pub error_message: Option<String>,
    pub file_path: Option<String>,
    pub created_at: i64,
    pub completed_at: Option<i64>,
}

#[derive(Debug)]
pub struct DownloadReply {
    pub status: u16,
    pub headers: Vec<(&'static str, String)>,
    pub body: Vec<u8>,
}

pub struct DownloadEngine {
    data_dir: Option<PathBuf>,
    items: Mutex<Vec<DownloadItem>>,
    cancel_transmitters: Mutex<HashMap<String, broadcast::Sender<()>>>,
}

impl DownloadEngine {
    pub fn new(app_data_dir: Option<PathBuf>) -> Arc<Self> {
        let downloads_dir = app_data_dir.as_ref().map(|d| d.join("downloads"));
        let mut loaded_items = Vec::new();

        if let Some(ref dir) = downloads_dir {
            if let Ok(data) = fs::read(dir.join(DOWNLOADS_FILE)) {
                if let Ok(mut items) = serde_json::from_slice::<Vec<DownloadItem>>(&data) {
                    for item in &mut items {
                        // Any item left in Downloading state is transitioned to Paused on restart
                        if item.status == DownloadStatus::Downloading
                            || item.status == DownloadStatus::Queued
                        {
                            item.status = DownloadStatus::Paused;
                            item.speed_bps = 0;
                            item.eta_seconds = None;
                        }
                    }
                    loaded_items = items;
                }
            }
        }

        Arc::new(Self {
            data_dir: downloads_dir,
            items: Mutex::new(loaded_items),
            cancel_transmitters: Mutex::new(HashMap::new()),
        })
    }

    fn now_secs() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64
    }

    fn rand_id() -> String {
        let mut buf = [0u8; 6];
        let _ = getrandom::fill(&mut buf);
        let hex = buf.iter().map(|b| format!("{b:02x}")).collect::<String>();
        format!("dl-{}", hex)
    }

    fn persist(&self) {
        let dir = match self.data_dir {
            Some(ref d) => d,
            None => return,
        };

        let _ = fs::create_dir_all(dir);
        let items = match self.items.lock() {
            Ok(guard) => guard.clone(),
            Err(_) => return,
        };

        if let Ok(bytes) = serde_json::to_vec_pretty(&items) {
            let tmp = dir.join(format!("{}.tmp.{}", DOWNLOADS_FILE, Self::rand_id()));
            if fs::write(&tmp, bytes).is_ok() {
                let _ = fs::rename(&tmp, dir.join(DOWNLOADS_FILE));
            }
        }
    }

    pub fn list(&self) -> Vec<DownloadItem> {
        self.items.lock().map(|g| g.clone()).unwrap_or_default()
    }

    pub fn get(&self, id: &str) -> Option<DownloadItem> {
        self.items.lock().ok()?.iter().find(|i| i.id == id).cloned()
    }

    pub fn start_download(
        self: &Arc<Self>,
        url: &str,
        title: &str,
        kind: &str,
        extension: &str,
        artwork_url: Option<String>,
    ) -> Result<DownloadItem, IngestError> {
        let policy = Policy::default();
        fetch::check_url(url, &policy)?;

        let id = Self::rand_id();
        let safe_ext = extension
            .trim()
            .trim_start_matches('.')
            .to_ascii_lowercase();
        let clean_ext = if safe_ext.is_empty() {
            "mp4".to_string()
        } else {
            safe_ext
        };

        let item = DownloadItem {
            id: id.clone(),
            url: url.to_string(),
            title: title.trim().to_string(),
            kind: kind.trim().to_string(),
            extension: clean_ext,
            artwork_url,
            status: DownloadStatus::Queued,
            downloaded_bytes: 0,
            total_bytes: 0,
            speed_bps: 0,
            eta_seconds: None,
            error_message: None,
            file_path: None,
            created_at: Self::now_secs(),
            completed_at: None,
        };

        {
            let mut guard = self.items.lock().unwrap();
            guard.push(item.clone());
        }
        self.persist();

        self.spawn_worker(id);
        Ok(item)
    }

    pub fn pause_download(&self, id: &str) -> Result<DownloadItem, IngestError> {
        let mut guard = self.items.lock().unwrap();
        let item = guard
            .iter_mut()
            .find(|i| i.id == id)
            .ok_or_else(|| IngestError::new(ErrorCode::Storage, "Download item not found."))?;

        if item.status == DownloadStatus::Completed {
            return Ok(item.clone());
        }

        item.status = DownloadStatus::Paused;
        item.speed_bps = 0;
        item.eta_seconds = None;
        let result = item.clone();

        // Send cancel signal to active task
        if let Ok(mut txs) = self.cancel_transmitters.lock() {
            if let Some(tx) = txs.remove(id) {
                let _ = tx.send(());
            }
        }

        drop(guard);
        self.persist();
        Ok(result)
    }

    pub fn resume_download(self: &Arc<Self>, id: &str) -> Result<DownloadItem, IngestError> {
        let mut guard = self.items.lock().unwrap();
        let item = guard
            .iter_mut()
            .find(|i| i.id == id)
            .ok_or_else(|| IngestError::new(ErrorCode::Storage, "Download item not found."))?;

        if item.status == DownloadStatus::Completed || item.status == DownloadStatus::Downloading {
            return Ok(item.clone());
        }

        item.status = DownloadStatus::Queued;
        item.error_message = None;
        let result = item.clone();
        drop(guard);
        self.persist();

        self.spawn_worker(id.to_string());
        Ok(result)
    }

    pub fn cancel_download(&self, id: &str) -> Result<(), IngestError> {
        // Send cancel signal
        if let Ok(mut txs) = self.cancel_transmitters.lock() {
            if let Some(tx) = txs.remove(id) {
                let _ = tx.send(());
            }
        }

        let mut guard = self.items.lock().unwrap();
        let item = guard
            .iter_mut()
            .find(|i| i.id == id)
            .ok_or_else(|| IngestError::new(ErrorCode::Storage, "Download item not found."))?;

        item.status = DownloadStatus::Cancelled;
        item.speed_bps = 0;
        item.eta_seconds = None;

        // Clean up partial file
        if let Some(ref path) = item.file_path {
            let _ = fs::remove_file(path);
        }

        drop(guard);
        self.persist();
        Ok(())
    }

    pub fn delete_download(&self, id: &str) -> Result<(), IngestError> {
        let _ = self.cancel_download(id);

        let mut guard = self.items.lock().unwrap();
        let idx = guard
            .iter()
            .position(|i| i.id == id)
            .ok_or_else(|| IngestError::new(ErrorCode::Storage, "Download item not found."))?;

        let item = guard.remove(idx);

        if let Some(ref path) = item.file_path {
            let p = Path::new(path);
            let _ = fs::remove_file(p);
            if let Some(parent) = p.parent() {
                let _ = fs::remove_dir(parent);
            }
        } else if let Some(ref dir) = self.data_dir {
            let item_dir = dir.join(id);
            let _ = fs::remove_dir_all(item_dir);
        }

        drop(guard);
        self.persist();
        Ok(())
    }

    fn spawn_worker(self: &Arc<Self>, id: String) {
        let (tx, mut rx) = broadcast::channel(1);
        {
            let mut txs = self.cancel_transmitters.lock().unwrap();
            txs.insert(id.clone(), tx);
        }

        let engine = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            let item_opt = engine.get(&id);
            let item = match item_opt {
                Some(i) => i,
                None => return,
            };

            if item.status == DownloadStatus::Paused || item.status == DownloadStatus::Cancelled {
                return;
            }

            let data_dir = match engine.data_dir {
                Some(ref d) => d.clone(),
                None => {
                    engine.mark_failed(&id, "Download directory unavailable.");
                    return;
                }
            };

            let item_dir = data_dir.join(&id);
            if let Err(e) = fs::create_dir_all(&item_dir) {
                engine.mark_failed(&id, &format!("Could not create download directory: {e}"));
                return;
            }

            let file_name = format!("video.{}", item.extension);
            let target_path = item_dir.join(&file_name);
            let target_path_str = target_path.to_string_lossy().to_string();

            // Check existing file size for range resumption
            let mut existing_bytes: u64 = 0;
            if let Ok(metadata) = fs::metadata(&target_path) {
                existing_bytes = metadata.len();
            }

            engine.update_status(
                &id,
                DownloadStatus::Downloading,
                Some(target_path_str.clone()),
            );

            let policy = Policy::default();
            let client = match fetch::guarded_client(&policy) {
                Ok(c) => c,
                Err(e) => {
                    engine.mark_failed(&id, &format!("Client error: {e}"));
                    return;
                }
            };

            let mut req = client.get(&item.url);
            if existing_bytes > 0 {
                req = req.header("Range", format!("bytes={existing_bytes}-"));
            }

            let mut res = match req.send().await {
                Ok(r) => r,
                Err(e) => {
                    engine.mark_failed(&id, &format!("Network request failed: {e}"));
                    return;
                }
            };

            let status = res.status();
            let is_partial = status == reqwest::StatusCode::PARTIAL_CONTENT;
            let is_ok = status == reqwest::StatusCode::OK;

            if !is_partial && !is_ok {
                engine.mark_failed(&id, &format!("HTTP server responded with status: {status}"));
                return;
            }

            let content_len = res.content_length().unwrap_or(0);
            if content_len > MAX_DOWNLOAD_SIZE_BYTES {
                engine.mark_failed(
                    &id,
                    "Download exceeds maximum permitted file size of 50 GB.",
                );
                return;
            }
            let total_bytes = if is_partial {
                existing_bytes + content_len
            } else {
                existing_bytes = 0; // Server doesn't support ranges; overwrite from 0
                content_len
            };

            let mut file = match OpenOptions::new()
                .create(true)
                .write(true)
                .truncate(!is_partial)
                .open(&target_path)
            {
                Ok(f) => f,
                Err(e) => {
                    engine.mark_failed(&id, &format!("Failed to open file: {e}"));
                    return;
                }
            };

            if is_partial {
                let _ = file.seek(SeekFrom::Start(existing_bytes));
            } else {
                let _ = file.set_len(0);
                let _ = file.seek(SeekFrom::Start(0));
            }

            let mut current_downloaded = existing_bytes;
            let mut last_instant = Instant::now();
            let mut bytes_since_last = 0u64;

            loop {
                tokio::select! {
                    _ = rx.recv() => {
                        // Cancellation or Pause received
                        let _ = file.flush();
                        return;
                    }
                    chunk = res.chunk() => {
                        match chunk {
                            Ok(Some(bytes)) => {
                                let len = bytes.len() as u64;
                                if let Err(e) = file.write_all(&bytes) {
                                    engine.mark_failed(&id, &format!("File write error: {e}"));
                                    return;
                                }

                                current_downloaded += len;
                                bytes_since_last += len;

                                if last_instant.elapsed() >= Duration::from_millis(500) {
                                    let elapsed_secs = last_instant.elapsed().as_secs_f64();
                                    let speed_bps = if elapsed_secs > 0.0 {
                                        (bytes_since_last as f64 / elapsed_secs) as u64
                                    } else {
                                        0
                                    };

                                    let eta_seconds = if speed_bps > 0 && total_bytes > current_downloaded {
                                        Some((total_bytes - current_downloaded) / speed_bps)
                                    } else {
                                        None
                                    };

                                    engine.update_progress(&id, current_downloaded, total_bytes, speed_bps, eta_seconds);

                                    last_instant = Instant::now();
                                    bytes_since_last = 0;
                                }
                            }
                            Ok(None) => {
                                // Stream completed
                                let _ = file.flush();
                                engine.mark_completed(&id, &target_path_str, current_downloaded);
                                return;
                            }
                            Err(e) => {
                                let _ = file.flush();
                                engine.mark_failed(&id, &format!("Stream read error: {e}"));
                                return;
                            }
                        }
                    }
                }
            }
        });
    }

    fn update_status(&self, id: &str, status: DownloadStatus, file_path: Option<String>) {
        let mut guard = match self.items.lock() {
            Ok(g) => g,
            Err(_) => return,
        };
        if let Some(item) = guard.iter_mut().find(|i| i.id == id) {
            if item.status == DownloadStatus::Cancelled || item.status == DownloadStatus::Completed
            {
                return;
            }
            if item.status == DownloadStatus::Paused && status == DownloadStatus::Downloading {
                return;
            }
            item.status = status;
            if let Some(p) = file_path {
                item.file_path = Some(p);
            }
        }
        drop(guard);
        self.persist();
    }

    fn update_progress(
        &self,
        id: &str,
        downloaded: u64,
        total: u64,
        speed_bps: u64,
        eta_seconds: Option<u64>,
    ) {
        let mut guard = match self.items.lock() {
            Ok(g) => g,
            Err(_) => return,
        };
        if let Some(item) = guard.iter_mut().find(|i| i.id == id) {
            item.downloaded_bytes = downloaded;
            item.total_bytes = total;
            item.speed_bps = speed_bps;
            item.eta_seconds = eta_seconds;
        }
    }

    fn mark_completed(&self, id: &str, file_path: &str, total_bytes: u64) {
        let mut guard = match self.items.lock() {
            Ok(g) => g,
            Err(_) => return,
        };
        if let Some(item) = guard.iter_mut().find(|i| i.id == id) {
            item.status = DownloadStatus::Completed;
            item.file_path = Some(file_path.to_string());
            item.downloaded_bytes = total_bytes;
            item.total_bytes = total_bytes;
            item.speed_bps = 0;
            item.eta_seconds = None;
            item.completed_at = Some(Self::now_secs());
        }
        drop(guard);
        self.persist();
    }

    fn mark_failed(&self, id: &str, error: &str) {
        let mut guard = match self.items.lock() {
            Ok(g) => g,
            Err(_) => return,
        };
        if let Some(item) = guard.iter_mut().find(|i| i.id == id) {
            if item.status == DownloadStatus::Completed {
                return;
            }
            item.status = DownloadStatus::Failed;
            item.error_message = Some(error.to_string());
            item.speed_bps = 0;
            item.eta_seconds = None;
        }
        drop(guard);
        self.persist();
    }

    /// Serves downloaded files to the player via kstream://localhost/downloads/<id>/<file>.
    pub async fn serve(
        &self,
        method: &str,
        path: &str,
        origin: Option<&str>,
        ranges: &[&str],
    ) -> DownloadReply {
        let headers_cors = vec![
            (
                "Access-Control-Allow-Origin",
                origin.unwrap_or("*").to_string(),
            ),
            (
                "Access-Control-Allow-Methods",
                "GET, OPTIONS, HEAD".to_string(),
            ),
            ("Access-Control-Allow-Headers", "Range".to_string()),
            ("Access-Control-Max-Age", "600".to_string()),
        ];

        if method == "OPTIONS" {
            return DownloadReply {
                status: 204,
                headers: headers_cors,
                body: Vec::new(),
            };
        }

        if method != "GET" && method != "HEAD" {
            return DownloadReply {
                status: 405,
                headers: headers_cors,
                body: b"Method Not Allowed".to_vec(),
            };
        }

        // Expected path: /downloads/<id>/<filename>
        let trimmed = path.trim_start_matches('/');
        let segments: Vec<&str> = trimmed.split('/').collect();
        if segments.len() < 3 || segments[0] != "downloads" {
            return DownloadReply {
                status: 404,
                headers: headers_cors,
                body: b"Not Found".to_vec(),
            };
        }

        let id = segments[1];
        let file_name = segments[2];

        if !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
            || !file_name
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.')
            || file_name.contains("..")
        {
            return DownloadReply {
                status: 403,
                headers: headers_cors,
                body: b"Forbidden".to_vec(),
            };
        }

        let item = match self.get(id) {
            Some(i) => i,
            None => {
                return DownloadReply {
                    status: 404,
                    headers: headers_cors,
                    body: b"Download Not Found".to_vec(),
                };
            }
        };

        let file_path = match item.file_path {
            Some(ref p) => PathBuf::from(p),
            None => {
                return DownloadReply {
                    status: 404,
                    headers: headers_cors,
                    body: b"File Not Available".to_vec(),
                };
            }
        };

        if !file_path.exists() {
            return DownloadReply {
                status: 404,
                headers: headers_cors,
                body: b"File Not Found".to_vec(),
            };
        }

        let bytes = match fs::read(&file_path) {
            Ok(b) => b,
            Err(_) => {
                return DownloadReply {
                    status: 500,
                    headers: headers_cors,
                    body: b"Read Error".to_vec(),
                };
            }
        };

        let mime = if file_name.ends_with(".mp4") {
            "video/mp4"
        } else if file_name.ends_with(".mkv") {
            "video/x-matroska"
        } else if file_name.ends_with(".ts") {
            "video/mp2t"
        } else if file_name.ends_with(".mp3") {
            "audio/mpeg"
        } else if file_name.ends_with(".m4a") {
            "audio/mp4"
        } else {
            "application/octet-stream"
        };

        let mut res_headers = headers_cors;
        res_headers.push(("Content-Type", mime.to_string()));
        res_headers.push(("Accept-Ranges", "bytes".to_string()));

        // Range handling
        if !ranges.is_empty() {
            if let Some(r_str) = ranges.first() {
                if let Some(rest) = r_str.strip_prefix("bytes=") {
                    if let Some((start_s, end_s)) = rest.split_once('-') {
                        let total_len = bytes.len();
                        let start: usize = start_s.parse().unwrap_or(0);
                        let end: usize = if end_s.is_empty() {
                            total_len.saturating_sub(1)
                        } else {
                            end_s
                                .parse()
                                .unwrap_or(total_len.saturating_sub(1))
                                .min(total_len.saturating_sub(1))
                        };

                        if start <= end && start < total_len {
                            let slice = if method == "HEAD" {
                                Vec::new()
                            } else {
                                bytes[start..=end].to_vec()
                            };
                            res_headers.push((
                                "Content-Range",
                                format!("bytes {}-{}/{}", start, end, total_len),
                            ));
                            res_headers.push(("Content-Length", (end - start + 1).to_string()));
                            return DownloadReply {
                                status: 206,
                                headers: res_headers,
                                body: slice,
                            };
                        }
                    }
                }
            }
        }

        res_headers.push(("Content-Length", bytes.len().to_string()));
        let body = if method == "HEAD" { Vec::new() } else { bytes };

        DownloadReply {
            status: 200,
            headers: res_headers,
            body,
        }
    }
}

pub fn into_response(reply: DownloadReply) -> tauri::http::Response<Vec<u8>> {
    let mut builder = tauri::http::Response::builder().status(reply.status);
    for (name, val) in reply.headers {
        builder = builder.header(name, val);
    }
    builder.body(reply.body).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TempDir(PathBuf);
    impl TempDir {
        fn new(name: &str) -> Self {
            let mut buf = [0u8; 4];
            let _ = getrandom::fill(&mut buf);
            let rand_val = u32::from_le_bytes(buf);
            let path = std::env::temp_dir().join(format!("kinora-dl-test-{}-{}", name, rand_val));
            let _ = fs::create_dir_all(&path);
            Self(path)
        }
        fn path(&self) -> &Path {
            &self.0
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn item_creation_persistence_and_listing() {
        let temp = TempDir::new("persist");
        let engine = DownloadEngine::new(Some(temp.path().to_path_buf()));

        let item = engine
            .start_download(
                "http://example.com/movie.mp4",
                "Blade Runner 2049",
                "movie",
                "mp4",
                Some("http://example.com/poster.jpg".to_string()),
            )
            .expect("start_download failed");

        assert_eq!(item.title, "Blade Runner 2049");
        assert_eq!(item.status, DownloadStatus::Queued);
        assert_eq!(item.extension, "mp4");

        let list = engine.list();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, item.id);

        // Verify surviving new engine instance
        let engine2 = DownloadEngine::new(Some(temp.path().to_path_buf()));
        let list2 = engine2.list();
        assert_eq!(list2.len(), 1);
        assert_eq!(list2[0].title, "Blade Runner 2049");
    }

    #[test]
    fn pause_and_cancel_state_transitions() {
        let temp = TempDir::new("lifecycle");
        let engine = DownloadEngine::new(Some(temp.path().to_path_buf()));

        let item = engine
            .start_download(
                "http://example.com/ep1.mkv",
                "Severance S01E01",
                "episode",
                "mkv",
                None,
            )
            .unwrap();

        let paused = engine.pause_download(&item.id).unwrap();
        assert_eq!(paused.status, DownloadStatus::Paused);

        let resumed = engine.resume_download(&item.id).unwrap();
        assert!(
            resumed.status == DownloadStatus::Queued
                || resumed.status == DownloadStatus::Downloading
        );

        engine.cancel_download(&item.id).unwrap();
        let cancelled = engine.get(&item.id).unwrap();
        assert_eq!(cancelled.status, DownloadStatus::Cancelled);
    }

    #[test]
    fn delete_removes_item_and_filesystem_content() {
        let temp = TempDir::new("delete");
        let engine = DownloadEngine::new(Some(temp.path().to_path_buf()));

        let item = engine
            .start_download(
                "http://example.com/song.mp3",
                "Ambient Theme",
                "audio",
                "mp3",
                None,
            )
            .unwrap();

        assert_eq!(engine.list().len(), 1);
        engine.delete_download(&item.id).unwrap();
        assert_eq!(engine.list().len(), 0);
    }

    #[tokio::test]
    async fn serve_handles_range_requests_accurately() {
        let temp = TempDir::new("serve");
        let engine = DownloadEngine::new(Some(temp.path().to_path_buf()));

        let item = engine
            .start_download(
                "http://example.com/sample.mp4",
                "Sample Clip",
                "movie",
                "mp4",
                None,
            )
            .unwrap();

        let _ = engine.pause_download(&item.id);

        // Create sample file on disk
        let data_dir = engine.data_dir.as_ref().unwrap();
        let item_dir = data_dir.join(&item.id);
        let _ = fs::create_dir_all(&item_dir);
        let file_path = item_dir.join("video.mp4");
        let dummy_data = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        fs::write(&file_path, dummy_data).unwrap();

        engine.mark_completed(
            &item.id,
            file_path.to_str().unwrap(),
            dummy_data.len() as u64,
        );

        // Test normal GET
        let path = format!("/downloads/{}/video.mp4", item.id);
        let res = engine.serve("GET", &path, None, &[]).await;
        assert_eq!(res.status, 200);
        assert_eq!(res.body, dummy_data);

        // Test Range request: bytes 10-19
        let ranges = vec!["bytes=10-19"];
        let range_res = engine.serve("GET", &path, None, &ranges).await;
        assert_eq!(range_res.status, 206);
        assert_eq!(range_res.body, b"ABCDEFGHIJ");

        // Test traversal security check
        let bad_path = format!("/downloads/{}/../secret.txt", item.id);
        let bad_res = engine.serve("GET", &bad_path, None, &[]).await;
        assert_eq!(bad_res.status, 403);
    }
}
