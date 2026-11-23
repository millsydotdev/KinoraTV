//! Local media library and real storage management.
//!
//! Provides Plex-style local Movies and TV Shows library management,
//! recursive file scanning, metadata and artwork extraction from folder
//! structures, incremental indexing, and real storage capacity measurements.
//!
//! Strict invariants:
//! - Never modifies, renames, or deletes original media files on disk.
//! - Restricts scanning exclusively to roots explicitly configured by the user.
//! - Canonicalises paths to prevent directory traversal outside library roots.
//! - Cross-platform storage metrics for Linux, macOS, and Windows.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::ingest::{ErrorCode, IngestError};

const SUPPORTED_VIDEO_EXTENSIONS: &[&str] = &[
    "mkv", "mp4", "m4v", "mov", "avi", "webm", "ts", "wmv", "mpg", "mpeg",
];

const POSTER_NAMES: &[&str] = &[
    "poster.jpg",
    "poster.png",
    "cover.jpg",
    "cover.png",
    "folder.jpg",
    "folder.png",
];

const BACKDROP_NAMES: &[&str] = &[
    "backdrop.jpg",
    "backdrop.png",
    "fanart.jpg",
    "fanart.png",
    "background.jpg",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LocalMediaType {
    Movies,
    Tv,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLibrary {
    pub id: String,
    pub name: String,
    pub media_type: LocalMediaType,
    pub folders: Vec<String>,
    pub last_scanned_at: Option<i64>,
    pub auto_scan: bool,
    pub scan_interval_hours: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalMovie {
    pub id: String,
    pub library_id: String,
    pub file_path: String,
    pub title: String,
    pub year: Option<u32>,
    pub edition: Option<String>,
    pub resolution: Option<String>,
    pub container: String,
    pub file_size_bytes: u64,
    pub duration_secs: Option<u64>,
    pub art_path: Option<String>,
    pub backdrop_path: Option<String>,
    pub discovered_at: i64,
    pub modified_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalEpisode {
    pub id: String,
    pub series_id: String,
    pub file_path: String,
    pub season_number: u32,
    pub episode_number: u32,
    pub title: Option<String>,
    pub file_size_bytes: u64,
    pub duration_secs: Option<u64>,
    pub art_path: Option<String>,
    pub resolution: Option<String>,
    pub container: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalSeason {
    pub season_number: u32,
    pub episodes: Vec<LocalEpisode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalSeries {
    pub id: String,
    pub library_id: String,
    pub folder_path: String,
    pub title: String,
    pub year: Option<u32>,
    pub art_path: Option<String>,
    pub backdrop_path: Option<String>,
    pub seasons: Vec<LocalSeason>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalMediaCatalogue {
    pub movies: Vec<LocalMovie>,
    pub series: Vec<LocalSeries>,
    pub total_media_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalScanResult {
    pub library_id: String,
    pub items_indexed: usize,
    pub items_removed: usize,
    pub errors: Vec<String>,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageVolumeInfo {
    pub id: String,
    pub mount_point: String,
    pub label: String,
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub used_bytes: u64,
    pub percent_used: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageVolumesSummary {
    pub volumes: Vec<StorageVolumeInfo>,
    pub total_disk_bytes: u64,
    pub available_disk_bytes: u64,
    pub used_disk_bytes: u64,
    pub percent_used: f64,
    pub media_indexed_bytes: u64,
    pub media_item_count: usize,
}

#[derive(Debug, Clone)]
pub struct LocalMediaReply {
    pub status: u16,
    pub headers: Vec<(&'static str, String)>,
    pub body: Vec<u8>,
}

pub fn into_response(reply: LocalMediaReply) -> tauri::http::Response<Vec<u8>> {
    let mut builder = tauri::http::Response::builder().status(reply.status);
    for (name, val) in reply.headers {
        builder = builder.header(name, val);
    }
    builder.body(reply.body).unwrap_or_default()
}

/// Lightweight folder signature used for real-time change detection.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderFingerprint {
    pub file_count: usize,
    pub total_bytes: u64,
    pub latest_mtime: u64,
    pub path_hash: u64,
}

fn hash_str(s: &str) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in s.bytes() {
        h = (h ^ (b as u64)).wrapping_mul(0x100000001b3);
    }
    h
}

/// Recursively computes a directory fingerprint based on metadata and entries.
pub fn compute_folder_fingerprint(root: &Path, depth: usize) -> FolderFingerprint {
    if depth > 10 || !root.exists() {
        return FolderFingerprint::default();
    }
    let mut fp = FolderFingerprint::default();
    if let Ok(m) = root.metadata() {
        if let Ok(modified) = m.modified() {
            if let Ok(dur) = modified.duration_since(UNIX_EPOCH) {
                fp.latest_mtime = dur.as_secs();
            }
        }
    }
    let entries = match fs::read_dir(root) {
        Ok(e) => e,
        Err(_) => return fp,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            if let Ok(m) = entry.metadata() {
                fp.file_count += 1;
                fp.total_bytes += m.len();
                if let Ok(mod_time) = m.modified() {
                    if let Ok(dur) = mod_time.duration_since(UNIX_EPOCH) {
                        fp.latest_mtime = fp.latest_mtime.max(dur.as_secs());
                    }
                }
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    fp.path_hash = fp.path_hash.wrapping_add(hash_str(name));
                }
            }
        } else if path.is_dir() {
            let sub_fp = compute_folder_fingerprint(&path, depth + 1);
            fp.file_count += sub_fp.file_count;
            fp.total_bytes += sub_fp.total_bytes;
            fp.latest_mtime = fp.latest_mtime.max(sub_fp.latest_mtime);
            fp.path_hash = fp.path_hash.wrapping_add(sub_fp.path_hash);
        }
    }
    fp
}

#[derive(Clone)]
pub struct LocalMediaEngine {
    dir: Option<PathBuf>,
    libraries: Arc<Mutex<Vec<LocalLibrary>>>,
    catalogue: Arc<Mutex<LocalMediaCatalogue>>,
    fingerprints: Arc<Mutex<HashMap<String, FolderFingerprint>>>,
}

impl LocalMediaEngine {
    pub fn new(app_data_dir: Option<PathBuf>) -> Self {
        let dir = app_data_dir.map(|p| p.join("sources"));
        let mut engine = Self {
            dir,
            libraries: Arc::new(Mutex::new(Vec::new())),
            catalogue: Arc::new(Mutex::new(LocalMediaCatalogue::default())),
            fingerprints: Arc::new(Mutex::new(HashMap::new())),
        };
        engine.load();
        engine
    }

    fn load(&mut self) {
        if let Some(ref d) = self.dir {
            let lib_file = d.join("local_libraries.json");
            if let Ok(content) = fs::read_to_string(&lib_file) {
                if let Ok(libs) = serde_json::from_str::<Vec<LocalLibrary>>(&content) {
                    *self.libraries.lock().unwrap_or_else(|p| p.into_inner()) = libs;
                }
            }

            let cat_file = d.join("local_catalogue.json");
            if let Ok(content) = fs::read_to_string(&cat_file) {
                if let Ok(cat) = serde_json::from_str::<LocalMediaCatalogue>(&content) {
                    *self.catalogue.lock().unwrap_or_else(|p| p.into_inner()) = cat;
                }
            }
        }
    }

    fn save_libraries(&self) -> Result<(), IngestError> {
        let dir = match &self.dir {
            Some(d) => d,
            None => return Ok(()),
        };
        fs::create_dir_all(dir).map_err(|_| {
            IngestError::new(ErrorCode::Storage, "Failed to create storage directory.")
        })?;

        let libs = self.get_libraries();
        let json = serde_json::to_string_pretty(&libs).map_err(|_| {
            IngestError::new(ErrorCode::Storage, "Failed to serialise library list.")
        })?;

        let path = dir.join("local_libraries.json");
        let tmp = dir.join("local_libraries.json.tmp");
        fs::write(&tmp, json)
            .map_err(|_| IngestError::new(ErrorCode::Storage, "Failed to write temp libraries."))?;
        fs::rename(&tmp, &path)
            .map_err(|_| IngestError::new(ErrorCode::Storage, "Failed to commit libraries."))?;
        Ok(())
    }

    fn save_catalogue(&self) -> Result<(), IngestError> {
        let dir = match &self.dir {
            Some(d) => d,
            None => return Ok(()),
        };
        fs::create_dir_all(dir).map_err(|_| {
            IngestError::new(ErrorCode::Storage, "Failed to create storage directory.")
        })?;

        let cat = self.get_catalogue();
        let json = serde_json::to_string_pretty(&cat).map_err(|_| {
            IngestError::new(ErrorCode::Storage, "Failed to serialise media catalogue.")
        })?;

        let path = dir.join("local_catalogue.json");
        let tmp = dir.join("local_catalogue.json.tmp");
        fs::write(&tmp, json)
            .map_err(|_| IngestError::new(ErrorCode::Storage, "Failed to write temp catalogue."))?;
        fs::rename(&tmp, &path)
            .map_err(|_| IngestError::new(ErrorCode::Storage, "Failed to commit catalogue."))?;
        Ok(())
    }

    pub fn get_libraries(&self) -> Vec<LocalLibrary> {
        self.libraries
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone()
    }

    pub fn save_library(&self, library: LocalLibrary) -> Result<LocalLibrary, IngestError> {
        if library.name.trim().is_empty() {
            return Err(IngestError::new(
                ErrorCode::Storage,
                "Library name cannot be empty.",
            ));
        }

        {
            let mut libs = self.libraries.lock().unwrap_or_else(|p| p.into_inner());
            if let Some(pos) = libs.iter().position(|l| l.id == library.id) {
                libs[pos] = library.clone();
            } else {
                libs.push(library.clone());
            }
        }

        self.save_libraries()?;
        Ok(library)
    }

    pub fn delete_library(&self, library_id: &str) -> Result<bool, IngestError> {
        {
            let mut libs = self.libraries.lock().unwrap_or_else(|p| p.into_inner());
            libs.retain(|l| l.id != library_id);
        }
        self.save_libraries()?;

        {
            let mut cat = self.catalogue.lock().unwrap_or_else(|p| p.into_inner());
            cat.movies.retain(|m| m.library_id != library_id);
            cat.series.retain(|s| s.library_id != library_id);
            cat.total_media_bytes = cat.movies.iter().map(|m| m.file_size_bytes).sum::<u64>()
                + cat
                    .series
                    .iter()
                    .flat_map(|s| &s.seasons)
                    .flat_map(|sn| &sn.episodes)
                    .map(|e| e.file_size_bytes)
                    .sum::<u64>();
        }
        self.save_catalogue()?;

        self.fingerprints
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .remove(library_id);

        Ok(true)
    }

    pub fn get_catalogue(&self) -> LocalMediaCatalogue {
        self.catalogue
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone()
    }

    pub fn scan_library(&self, library_id: &str) -> Result<LocalScanResult, IngestError> {
        let start_time = SystemTime::now();
        let lib = self
            .get_libraries()
            .into_iter()
            .find(|l| l.id == library_id)
            .ok_or_else(|| IngestError::new(ErrorCode::Storage, "Library not found."))?;

        let mut errors = Vec::new();
        let mut newly_scanned_movies = Vec::new();
        let mut newly_scanned_series = Vec::new();

        for folder in &lib.folders {
            let path = PathBuf::from(folder);
            if !path.exists() {
                errors.push(format!("Folder does not exist: {folder}"));
                continue;
            }

            match lib.media_type {
                LocalMediaType::Movies => {
                    self.scan_movies_folder(&path, &lib.id, &mut newly_scanned_movies, &mut errors);
                }
                LocalMediaType::Tv => {
                    self.scan_tv_folder(&path, &lib.id, &mut newly_scanned_series, &mut errors);
                }
            }
        }

        let (items_indexed, items_removed) = {
            let mut cat = self.catalogue.lock().unwrap_or_else(|p| p.into_inner());
            let (indexed, removed) = match lib.media_type {
                LocalMediaType::Movies => {
                    let before_count = cat.movies.iter().filter(|m| m.library_id == lib.id).count();
                    cat.movies.retain(|m| m.library_id != lib.id);
                    let count = newly_scanned_movies.len();
                    cat.movies.extend(newly_scanned_movies);
                    (count, before_count)
                }
                LocalMediaType::Tv => {
                    let before_count = cat.series.iter().filter(|s| s.library_id == lib.id).count();
                    cat.series.retain(|s| s.library_id != lib.id);
                    let count = newly_scanned_series.len();
                    cat.series.extend(newly_scanned_series);
                    (count, before_count)
                }
            };

            cat.total_media_bytes = cat.movies.iter().map(|m| m.file_size_bytes).sum::<u64>()
                + cat
                    .series
                    .iter()
                    .flat_map(|s| &s.seasons)
                    .flat_map(|sn| &sn.episodes)
                    .map(|e| e.file_size_bytes)
                    .sum::<u64>();

            (indexed, removed)
        };

        // Update library last_scanned_at timestamp
        {
            let mut libs = self.libraries.lock().unwrap_or_else(|p| p.into_inner());
            if let Some(l) = libs.iter_mut().find(|l| l.id == library_id) {
                l.last_scanned_at = Some(now_secs());
            }
        }

        self.save_libraries()?;
        self.save_catalogue()?;

        // Compute and record the combined folder fingerprint for change detection
        let mut combined_fp = FolderFingerprint::default();
        for folder in &lib.folders {
            let fp = compute_folder_fingerprint(Path::new(folder), 0);
            combined_fp.file_count += fp.file_count;
            combined_fp.total_bytes += fp.total_bytes;
            combined_fp.latest_mtime = combined_fp.latest_mtime.max(fp.latest_mtime);
            combined_fp.path_hash = combined_fp.path_hash.wrapping_add(fp.path_hash);
        }
        self.fingerprints
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .insert(library_id.to_string(), combined_fp);

        let elapsed = start_time.elapsed().unwrap_or_default().as_millis() as u64;

        Ok(LocalScanResult {
            library_id: library_id.to_string(),
            items_indexed,
            items_removed,
            errors,
            duration_ms: elapsed,
        })
    }

    /// Checks watched library folders for additions, deletions or modifications.
    /// Automatically re-indexes modified libraries and returns scan summaries.
    pub fn check_watched_folders(&self) -> Vec<LocalScanResult> {
        let libs = self.get_libraries();
        let mut results = Vec::new();
        for lib in libs {
            if !lib.auto_scan {
                continue;
            }
            let mut combined_fp = FolderFingerprint::default();
            for folder in &lib.folders {
                let fp = compute_folder_fingerprint(Path::new(folder), 0);
                combined_fp.file_count += fp.file_count;
                combined_fp.total_bytes += fp.total_bytes;
                combined_fp.latest_mtime = combined_fp.latest_mtime.max(fp.latest_mtime);
                combined_fp.path_hash = combined_fp.path_hash.wrapping_add(fp.path_hash);
            }
            let changed = {
                let fps = self.fingerprints.lock().unwrap_or_else(|p| p.into_inner());
                match fps.get(&lib.id) {
                    Some(prev) => prev != &combined_fp,
                    None => true,
                }
            };
            if changed {
                if let Ok(scan_res) = self.scan_library(&lib.id) {
                    results.push(scan_res);
                }
            }
        }
        results
    }

    fn scan_movies_folder(
        &self,
        root: &Path,
        library_id: &str,
        movies: &mut Vec<LocalMovie>,
        errors: &mut Vec<String>,
    ) {
        let entries = match fs::read_dir(root) {
            Ok(e) => e,
            Err(err) => {
                errors.push(format!("Failed to read {}: {err}", root.display()));
                return;
            }
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(movie) = self.parse_movie_file(&path, library_id, None) {
                    movies.push(movie);
                }
            } else if path.is_dir() {
                // If it is a directory, check if it's a dedicated movie directory
                // like "Film Name (2024)/" containing the video file and posters.
                let mut folder_movies = Vec::new();
                let dir_poster = find_artwork_in_dir(&path, POSTER_NAMES);
                let dir_backdrop = find_artwork_in_dir(&path, BACKDROP_NAMES);

                if let Ok(sub_entries) = fs::read_dir(&path) {
                    for sub_entry in sub_entries.flatten() {
                        let sub_path = sub_entry.path();
                        if sub_path.is_file() {
                            if let Some(mut movie) =
                                self.parse_movie_file(&sub_path, library_id, Some(&path))
                            {
                                if movie.art_path.is_none() {
                                    movie.art_path = dir_poster.clone();
                                }
                                if movie.backdrop_path.is_none() {
                                    movie.backdrop_path = dir_backdrop.clone();
                                }
                                folder_movies.push(movie);
                            }
                        }
                    }
                }
                movies.extend(folder_movies);
            }
        }
    }

    fn parse_movie_file(
        &self,
        file_path: &Path,
        library_id: &str,
        parent_dir: Option<&Path>,
    ) -> Option<LocalMovie> {
        let ext = file_path.extension()?.to_str()?.to_lowercase();
        if !SUPPORTED_VIDEO_EXTENSIONS.contains(&ext.as_str()) {
            return None;
        }

        let file_name = file_path.file_stem()?.to_str()?;
        let metadata = fs::metadata(file_path).ok()?;
        let file_size_bytes = metadata.len();
        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or_else(now_secs);

        // Parse title, year, edition, resolution from filename or parent folder
        let (title, year, edition, resolution) =
            parse_video_filename(file_name, parent_dir.and_then(|p| p.file_name()?.to_str()));

        let id = format!("lm_{}", hash_path(file_path.to_str()?));
        let art_path = find_sibling_artwork(file_path, POSTER_NAMES);
        let backdrop_path = find_sibling_artwork(file_path, BACKDROP_NAMES);

        Some(LocalMovie {
            id,
            library_id: library_id.to_string(),
            file_path: file_path.to_string_lossy().to_string(),
            title,
            year,
            edition,
            resolution,
            container: ext.to_uppercase(),
            file_size_bytes,
            duration_secs: None,
            art_path,
            backdrop_path,
            discovered_at: now_secs(),
            modified_at,
        })
    }

    fn scan_tv_folder(
        &self,
        root: &Path,
        library_id: &str,
        series_list: &mut Vec<LocalSeries>,
        errors: &mut Vec<String>,
    ) {
        let entries = match fs::read_dir(root) {
            Ok(e) => e,
            Err(err) => {
                errors.push(format!("Failed to read {}: {err}", root.display()));
                return;
            }
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Some(series) = self.parse_tv_series(&path, library_id) {
                    series_list.push(series);
                }
            }
        }
    }

    fn parse_tv_series(&self, series_dir: &Path, library_id: &str) -> Option<LocalSeries> {
        let dir_name = series_dir.file_name()?.to_str()?;
        let (series_title, series_year) = parse_series_name(dir_name);
        let series_id = format!("ls_{}", hash_path(series_dir.to_str()?));

        let art_path = find_artwork_in_dir(series_dir, POSTER_NAMES);
        let backdrop_path = find_artwork_in_dir(series_dir, BACKDROP_NAMES);

        let mut seasons_map: HashMap<u32, Vec<LocalEpisode>> = HashMap::new();

        self.collect_episodes(series_dir, &series_id, &mut seasons_map);

        if seasons_map.is_empty() {
            return None;
        }

        let mut seasons = Vec::new();
        let mut season_numbers: Vec<u32> = seasons_map.keys().copied().collect();
        season_numbers.sort_unstable();

        for sn in season_numbers {
            if let Some(mut eps) = seasons_map.remove(&sn) {
                eps.sort_by_key(|e| e.episode_number);
                seasons.push(LocalSeason {
                    season_number: sn,
                    episodes: eps,
                });
            }
        }

        Some(LocalSeries {
            id: series_id,
            library_id: library_id.to_string(),
            folder_path: series_dir.to_string_lossy().to_string(),
            title: series_title,
            year: series_year,
            art_path,
            backdrop_path,
            seasons,
        })
    }

    fn collect_episodes(
        &self,
        current_dir: &Path,
        series_id: &str,
        seasons_map: &mut HashMap<u32, Vec<LocalEpisode>>,
    ) {
        let entries = match fs::read_dir(current_dir) {
            Ok(e) => e,
            Err(_) => return,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                self.collect_episodes(&path, series_id, seasons_map);
            } else if path.is_file() {
                if let Some(ep) = self.parse_episode_file(&path, series_id) {
                    seasons_map.entry(ep.season_number).or_default().push(ep);
                }
            }
        }
    }

    fn parse_episode_file(&self, file_path: &Path, series_id: &str) -> Option<LocalEpisode> {
        let ext = file_path.extension()?.to_str()?.to_lowercase();
        if !SUPPORTED_VIDEO_EXTENSIONS.contains(&ext.as_str()) {
            return None;
        }

        let file_name = file_path.file_stem()?.to_str()?;
        let metadata = fs::metadata(file_path).ok()?;
        let file_size_bytes = metadata.len();

        let (season_number, episode_number, ep_title, resolution) =
            parse_tv_episode_name(file_name, file_path.parent());

        let id = format!("le_{}", hash_path(file_path.to_str()?));
        let art_path = find_sibling_artwork(file_path, &["still.jpg", "thumb.jpg"]);

        Some(LocalEpisode {
            id,
            series_id: series_id.to_string(),
            file_path: file_path.to_string_lossy().to_string(),
            season_number,
            episode_number,
            title: ep_title,
            file_size_bytes,
            duration_secs: None,
            art_path,
            resolution,
            container: ext.to_uppercase(),
        })
    }

    /// Queries real operating-system storage capacity for all distinct volumes associated
    /// with configured local libraries and application data roots.
    pub fn get_storage_volumes_info(&self) -> StorageVolumesSummary {
        let mut paths_to_check: Vec<PathBuf> = Vec::new();

        if let Some(ref d) = self.dir {
            paths_to_check.push(d.clone());
        }

        let libs = self.get_libraries();
        for lib in &libs {
            for folder in &lib.folders {
                let p = PathBuf::from(folder);
                paths_to_check.push(p);
            }
        }

        if paths_to_check.is_empty() {
            paths_to_check.push(PathBuf::from("/"));
        }

        let mut seen_keys = HashSet::new();
        let mut volumes = Vec::new();

        let mut total_disk_bytes: u64 = 0;
        let mut available_disk_bytes: u64 = 0;
        let mut used_disk_bytes: u64 = 0;

        for path in paths_to_check {
            if !path.exists() {
                continue;
            }

            let fs_key = get_filesystem_id(&path);
            if !seen_keys.insert(fs_key.clone()) {
                // Volume already queried to prevent double-counting
                continue;
            }

            let (total, avail) = query_disk_metrics(&path);
            let used = total.saturating_sub(avail);
            let percent_used = if total > 0 {
                ((used as f64) / (total as f64)) * 100.0
            } else {
                0.0
            };

            let mount_point = get_mount_point_label(&path);
            let label = if mount_point == "/" {
                "System Storage".to_string()
            } else {
                format!("Media Storage ({mount_point})")
            };

            total_disk_bytes = total_disk_bytes.saturating_add(total);
            available_disk_bytes = available_disk_bytes.saturating_add(avail);
            used_disk_bytes = used_disk_bytes.saturating_add(used);

            volumes.push(StorageVolumeInfo {
                id: fs_key,
                mount_point,
                label,
                total_bytes: total,
                available_bytes: avail,
                used_bytes: used,
                percent_used,
            });
        }

        let cat = self.get_catalogue();
        let media_indexed_bytes = cat.total_media_bytes;
        let media_item_count = cat.movies.len()
            + cat
                .series
                .iter()
                .map(|s| s.seasons.iter().map(|sn| sn.episodes.len()).sum::<usize>())
                .sum::<usize>();

        let combined_percent_used = if total_disk_bytes > 0 {
            ((used_disk_bytes as f64) / (total_disk_bytes as f64)) * 100.0
        } else {
            0.0
        };

        StorageVolumesSummary {
            volumes,
            total_disk_bytes,
            available_disk_bytes,
            used_disk_bytes,
            percent_used: combined_percent_used,
            media_indexed_bytes,
            media_item_count,
        }
    }

    /// Reads validated local poster, backdrop, or episode still bytes for a scanned media item.
    /// Strictly verifies that the artwork path lies within a configured local library folder and
    /// carries valid raster image magic bytes (PNG, JPEG, GIF, or WebP), capped at 5 MB.
    pub fn read_local_artwork(
        &self,
        media_id: &str,
        variant: &str,
    ) -> Option<crate::artwork::Artwork> {
        const MAX_LOCAL_ART_BYTES: u64 = 5 * 1024 * 1024;
        let cat = self.get_catalogue();
        let art_path = if let Some(m) = cat.movies.iter().find(|m| m.id == media_id) {
            if variant == "backdrop" {
                m.backdrop_path.as_deref().or(m.art_path.as_deref())
            } else {
                m.art_path.as_deref()
            }
        } else if let Some(s) = cat.series.iter().find(|s| s.id == media_id) {
            if variant == "backdrop" {
                s.backdrop_path.as_deref().or(s.art_path.as_deref())
            } else {
                s.art_path.as_deref()
            }
        } else if let Some(e) = cat
            .series
            .iter()
            .flat_map(|s| &s.seasons)
            .flat_map(|sn| &sn.episodes)
            .find(|e| e.id == media_id)
        {
            e.art_path.as_deref().or_else(|| {
                cat.series
                    .iter()
                    .find(|s| s.id == e.series_id)
                    .and_then(|s| s.backdrop_path.as_deref().or(s.art_path.as_deref()))
            })
        } else {
            None
        }?;

        let art_buf = PathBuf::from(art_path);
        if !self.is_path_in_library(&art_buf) || !art_buf.is_file() {
            return None;
        }
        let meta = fs::metadata(&art_buf).ok()?;
        if meta.len() == 0 || meta.len() > MAX_LOCAL_ART_BYTES {
            return None;
        }
        let bytes = fs::read(&art_buf).ok()?;
        let mime_type = crate::artwork::detect_raster_mime(&bytes)?;
        Some(crate::artwork::Artwork { mime_type, bytes })
    }

    /// Serves local media files safely for the kstream protocol handler.
    pub async fn serve(
        &self,
        _method: &str,
        uri_path: &str,
        _origin: Option<&str>,
        ranges: &[&str],
    ) -> LocalMediaReply {
        let trimmed = uri_path.trim_start_matches("/local/");
        let mut parts = trimmed.splitn(2, '/');
        let media_id = match parts.next() {
            Some(id) if !id.is_empty() => id,
            _ => {
                return LocalMediaReply {
                    status: 404,
                    headers: vec![("content-type", "text/plain".into())],
                    body: b"Not found".to_vec(),
                }
            }
        };
        let file_type = parts.next().unwrap_or("");

        let cat = self.get_catalogue();

        if file_type == "art" || file_type == "poster" || file_type == "backdrop" {
            let art_path_opt = if let Some(m) = cat.movies.iter().find(|m| m.id == media_id) {
                if file_type == "backdrop" {
                    m.backdrop_path.as_deref().or(m.art_path.as_deref())
                } else {
                    m.art_path.as_deref()
                }
            } else if let Some(s) = cat.series.iter().find(|s| s.id == media_id) {
                if file_type == "backdrop" {
                    s.backdrop_path.as_deref().or(s.art_path.as_deref())
                } else {
                    s.art_path.as_deref()
                }
            } else if let Some(e) = cat
                .series
                .iter()
                .flat_map(|s| &s.seasons)
                .flat_map(|sn| &sn.episodes)
                .find(|e| e.id == media_id)
            {
                e.art_path.as_deref().or_else(|| {
                    cat.series
                        .iter()
                        .find(|s| s.id == e.series_id)
                        .and_then(|s| s.art_path.as_deref())
                })
            } else {
                None
            };

            if let Some(art_path) = art_path_opt {
                let art_buf = PathBuf::from(art_path);
                if self.is_path_in_library(&art_buf) && art_buf.is_file() {
                    if let Ok(bytes) = fs::read(&art_buf) {
                        let ext = art_buf
                            .extension()
                            .and_then(|e| e.to_str())
                            .unwrap_or("")
                            .to_lowercase();
                        let mime = match ext.as_str() {
                            "png" => "image/png",
                            "webp" => "image/webp",
                            "gif" => "image/gif",
                            _ => "image/jpeg",
                        };
                        return LocalMediaReply {
                            status: 200,
                            headers: vec![
                                ("content-type", mime.into()),
                                ("cache-control", "max-age=86400".into()),
                                ("access-control-allow-origin", "*".into()),
                            ],
                            body: bytes,
                        };
                    }
                }
            }

            return LocalMediaReply {
                status: 404,
                headers: vec![("content-type", "text/plain".into())],
                body: b"Artwork not found".to_vec(),
            };
        }

        let target_path_buf = if let Some(m) = cat.movies.iter().find(|m| m.id == media_id) {
            PathBuf::from(&m.file_path)
        } else if let Some(e) = cat
            .series
            .iter()
            .flat_map(|s| &s.seasons)
            .flat_map(|sn| &sn.episodes)
            .find(|e| e.id == media_id)
        {
            PathBuf::from(&e.file_path)
        } else {
            return LocalMediaReply {
                status: 404,
                headers: vec![("content-type", "text/plain".into())],
                body: b"Media item not found".to_vec(),
            };
        };

        if !self.is_path_in_library(&target_path_buf) {
            return LocalMediaReply {
                status: 403,
                headers: vec![("content-type", "text/plain".into())],
                body: b"Access denied: path not inside approved library roots".to_vec(),
            };
        }

        if file_type == "playlist.m3u8" {
            let m3u8_content = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:7200\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:7200.0,\nstream\n#EXT-X-ENDLIST\n";
            return LocalMediaReply {
                status: 200,
                headers: vec![
                    ("content-type", "application/vnd.apple.mpegurl".into()),
                    ("access-control-allow-origin", "*".into()),
                ],
                body: m3u8_content.as_bytes().to_vec(),
            };
        }

        if file_type == "stream" || file_type.starts_with("stream.") {
            let file_len = match fs::metadata(&target_path_buf) {
                Ok(m) => m.len(),
                Err(_) => {
                    return LocalMediaReply {
                        status: 500,
                        headers: vec![("content-type", "text/plain".into())],
                        body: b"Failed to inspect media file".to_vec(),
                    }
                }
            };

            let ext_str = target_path_buf
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();
            let mime = match ext_str.as_str() {
                "mkv" => "video/x-matroska",
                "webm" => "video/webm",
                "mov" => "video/quicktime",
                "avi" => "video/x-msvideo",
                _ => "video/mp4",
            };

            let mut start: u64 = 0;
            let mut end: u64 = file_len.saturating_sub(1);
            let is_range = !ranges.is_empty() && ranges[0].starts_with("bytes=");

            if is_range {
                let range_str = ranges[0].trim_start_matches("bytes=");
                if let Some(dash_idx) = range_str.find('-') {
                    let s_str = range_str[..dash_idx].trim();
                    let e_str = range_str[dash_idx + 1..].trim();
                    if s_str.is_empty() && !e_str.is_empty() {
                        if let Ok(suffix) = e_str.parse::<u64>() {
                            start = file_len.saturating_sub(suffix);
                            end = file_len.saturating_sub(1);
                        }
                    } else if !s_str.is_empty() && e_str.is_empty() {
                        if let Ok(s) = s_str.parse::<u64>() {
                            start = s;
                            end = file_len.saturating_sub(1);
                        }
                    } else if let (Ok(s), Ok(e)) = (s_str.parse::<u64>(), e_str.parse::<u64>()) {
                        start = s;
                        end = e.min(file_len.saturating_sub(1));
                    }
                }

                if start >= file_len || start > end {
                    return LocalMediaReply {
                        status: 416,
                        headers: vec![("content-range", format!("bytes */{file_len}"))],
                        body: Vec::new(),
                    };
                }
            }

            let to_read = (end.saturating_sub(start) + 1).min(16 * 1024 * 1024);
            let actual_end = start + to_read - 1;

            use std::io::{Read, Seek, SeekFrom};
            let mut f = match fs::File::open(&target_path_buf) {
                Ok(file) => file,
                Err(_) => {
                    return LocalMediaReply {
                        status: 500,
                        headers: vec![("content-type", "text/plain".into())],
                        body: b"Failed to open media file".to_vec(),
                    }
                }
            };

            if f.seek(SeekFrom::Start(start)).is_err() {
                return LocalMediaReply {
                    status: 416,
                    headers: vec![("content-range", format!("bytes */{file_len}"))],
                    body: Vec::new(),
                };
            }

            let mut buf = vec![0u8; to_read as usize];
            let read_bytes = f.read(&mut buf).unwrap_or(0);
            buf.truncate(read_bytes);

            let status = if is_range { 206 } else { 200 };
            return LocalMediaReply {
                status,
                headers: vec![
                    ("content-type", mime.into()),
                    ("accept-ranges", "bytes".into()),
                    (
                        "content-range",
                        format!("bytes {start}-{actual_end}/{file_len}"),
                    ),
                    ("content-length", buf.len().to_string()),
                    ("access-control-allow-origin", "*".into()),
                ],
                body: buf,
            };
        }

        LocalMediaReply {
            status: 404,
            headers: vec![("content-type", "text/plain".into())],
            body: b"Not found".to_vec(),
        }
    }

    /// Validates that a file path resides strictly inside one of the approved library root paths.
    pub fn is_path_in_library(&self, file_path: &Path) -> bool {
        let canonical_target = match file_path.canonicalize() {
            Ok(p) => p,
            Err(_) => return false,
        };

        let libs = self.get_libraries();
        for lib in libs {
            for folder in lib.folders {
                if let Ok(canonical_root) = Path::new(&folder).canonicalize() {
                    if canonical_target.starts_with(&canonical_root) {
                        return true;
                    }
                }
            }
        }
        false
    }
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn hash_path(path_str: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    path_str.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

/// Parses video file names for Title, Year, Edition and Resolution.
/// E.g. "Film.Name.2024.1080p.BluRay.x264" -> ("Film Name", Some(2024), None, Some("1080p"))
fn parse_video_filename(
    filename: &str,
    parent_dir_name: Option<&str>,
) -> (String, Option<u32>, Option<String>, Option<String>) {
    let clean_name = filename.replace(['.', '_'], " ");

    let resolution = if clean_name.to_lowercase().contains("2160p")
        || clean_name.to_lowercase().contains("4k")
    {
        Some("4K HDR".to_string())
    } else if clean_name.to_lowercase().contains("1080p") {
        Some("1080p".to_string())
    } else if clean_name.to_lowercase().contains("720p") {
        Some("720p".to_string())
    } else {
        None
    };

    let edition = if clean_name.to_lowercase().contains("director's cut")
        || clean_name.to_lowercase().contains("directors cut")
    {
        Some("Director's Cut".to_string())
    } else if clean_name.to_lowercase().contains("extended") {
        Some("Extended Edition".to_string())
    } else if clean_name.to_lowercase().contains("remastered") {
        Some("Remastered".to_string())
    } else {
        None
    };

    let mut year = None;
    for token in clean_name.split_whitespace() {
        let stripped = token.trim_matches(|c| c == '(' || c == ')' || c == '[' || c == ']');
        if let Ok(y) = stripped.parse::<u32>() {
            if (1900..=2099).contains(&y) {
                year = Some(y);
                break;
            }
        }
    }

    if year.is_none() {
        if let Some(p_dir) = parent_dir_name {
            for token in p_dir.replace(['.', '_'], " ").split_whitespace() {
                let stripped = token.trim_matches(|c| c == '(' || c == ')' || c == '[' || c == ']');
                if let Ok(y) = stripped.parse::<u32>() {
                    if (1900..=2099).contains(&y) {
                        year = Some(y);
                        break;
                    }
                }
            }
        }
    }

    // Strip technical tags from title
    let tech_tags = [
        "1080p", "2160p", "720p", "4k", "bluray", "bdrip", "webrip", "web-dl", "dvdrip", "x264",
        "x265", "hevc", "aac", "dts",
    ];

    let mut title_parts = Vec::new();
    for token in clean_name.split_whitespace() {
        let stripped = token.trim_matches(|c| c == '(' || c == ')' || c == '[' || c == ']');
        if let Ok(y) = stripped.parse::<u32>() {
            if (1900..=2099).contains(&y) {
                break;
            }
        }
        if tech_tags.contains(&token.to_lowercase().as_str()) {
            break;
        }
        title_parts.push(token);
    }

    let title = if !title_parts.is_empty() {
        title_parts.join(" ")
    } else if let Some(p_dir) = parent_dir_name {
        let p_clean = p_dir.replace(['.', '_'], " ");
        let mut p_parts = Vec::new();
        for token in p_clean.split_whitespace() {
            let stripped = token.trim_matches(|c| c == '(' || c == ')' || c == '[' || c == ']');
            if let Ok(y) = stripped.parse::<u32>() {
                if (1900..=2099).contains(&y) {
                    break;
                }
            }
            p_parts.push(token);
        }
        p_parts.join(" ")
    } else {
        filename.to_string()
    };

    (title, year, edition, resolution)
}

fn parse_series_name(dir_name: &str) -> (String, Option<u32>) {
    let clean = dir_name.replace(['.', '_'], " ");
    let mut year = None;
    let mut title_parts = Vec::new();

    for token in clean.split_whitespace() {
        let stripped = token.trim_matches(|c| c == '(' || c == ')' || c == '[' || c == ']');
        if let Ok(y) = stripped.parse::<u32>() {
            if (1900..=2099).contains(&y) {
                year = Some(y);
                break;
            }
        }
        title_parts.push(token);
    }

    let title = if title_parts.is_empty() {
        dir_name.to_string()
    } else {
        title_parts.join(" ")
    };

    (title, year)
}

/// Parses TV episode filename: detects S01E02, 1x02, Season folder fallback.
fn parse_tv_episode_name(
    filename: &str,
    parent_dir: Option<&Path>,
) -> (u32, u32, Option<String>, Option<String>) {
    let lower = filename.to_lowercase();

    let resolution = if lower.contains("2160p") || lower.contains("4k") {
        Some("4K HDR".to_string())
    } else if lower.contains("1080p") {
        Some("1080p".to_string())
    } else if lower.contains("720p") {
        Some("720p".to_string())
    } else {
        None
    };

    // Check S01E02 or S1E2 pattern
    let mut season = 1;
    let mut episode = 1;
    let mut found = false;

    if let Some(s_pos) = lower.find('s') {
        let after_s = &lower[s_pos + 1..];
        if let Some(e_pos) = after_s.find('e') {
            let season_str = &after_s[..e_pos];
            let after_e = &after_s[e_pos + 1..];
            let ep_end = after_e
                .find(|c: char| !c.is_ascii_digit())
                .unwrap_or(after_e.len());
            let ep_str = &after_e[..ep_end];

            if let (Ok(s), Ok(e)) = (season_str.parse::<u32>(), ep_str.parse::<u32>()) {
                season = s;
                episode = e;
                found = true;
            }
        }
    }

    // Fallback: 1x02 pattern
    if !found {
        if let Some(x_pos) = lower.find('x') {
            if x_pos > 0 {
                let before_x = &lower[..x_pos];
                let s_start = before_x
                    .rfind(|c: char| !c.is_ascii_digit())
                    .map(|i| i + 1)
                    .unwrap_or(0);
                let season_str = &before_x[s_start..];

                let after_x = &lower[x_pos + 1..];
                let ep_end = after_x
                    .find(|c: char| !c.is_ascii_digit())
                    .unwrap_or(after_x.len());
                let ep_str = &after_x[..ep_end];

                if let (Ok(s), Ok(e)) = (season_str.parse::<u32>(), ep_str.parse::<u32>()) {
                    season = s;
                    episode = e;
                    found = true;
                }
            }
        }
    }

    // Fallback: check parent directory name for "Season 02"
    if !found {
        if let Some(parent) = parent_dir {
            if let Some(p_name) = parent.file_name().and_then(|n| n.to_str()) {
                let p_lower = p_name.to_lowercase();
                if let Some(pos) = p_lower.find("season") {
                    let num_part = p_lower[pos + 6..].trim();
                    let digits: String = num_part
                        .chars()
                        .take_while(|c| c.is_ascii_digit())
                        .collect();
                    if let Ok(s) = digits.parse::<u32>() {
                        season = s;
                    }
                }
            }
        }
    }

    // Episode title extraction: take parts after S01E02 - Title
    let clean = filename.replace(['.', '_'], " ");
    let mut ep_title = None;
    if let Some(dash_pos) = clean.rfind(" - ") {
        let t = clean[dash_pos + 3..].trim();
        if !t.is_empty() {
            ep_title = Some(t.to_string());
        }
    }

    (season, episode, ep_title, resolution)
}

fn find_artwork_in_dir(dir: &Path, names: &[&str]) -> Option<String> {
    for name in names {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().to_string());
        }
    }
    None
}

fn find_sibling_artwork(file_path: &Path, names: &[&str]) -> Option<String> {
    let parent = file_path.parent()?;
    let stem = file_path.file_stem()?.to_str()?;

    for ext in &["jpg", "jpeg", "png", "webp"] {
        let candidate = parent.join(format!("{stem}-poster.{ext}"));
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().to_string());
        }
        let candidate2 = parent.join(format!("{stem}.{ext}"));
        if candidate2.is_file() {
            return Some(candidate2.to_string_lossy().to_string());
        }
    }

    find_artwork_in_dir(parent, names)
}

#[cfg(unix)]
fn get_filesystem_id(path: &Path) -> String {
    use std::ffi::CString;
    use std::mem::MaybeUninit;
    use std::os::unix::ffi::OsStrExt;

    if let Ok(c_path) = CString::new(path.as_os_str().as_bytes()) {
        unsafe {
            let mut stat: MaybeUninit<libc::stat> = MaybeUninit::uninit();
            if libc::stat(c_path.as_ptr(), stat.as_mut_ptr()) == 0 {
                let s = stat.assume_init();
                return format!("dev_{}", s.st_dev);
            }
        }
    }
    path.to_string_lossy().to_string()
}

#[cfg(not(unix))]
fn get_filesystem_id(path: &Path) -> String {
    if let Some(prefix) = path.components().next() {
        return prefix.as_os_str().to_string_lossy().to_string();
    }
    path.to_string_lossy().to_string()
}

#[cfg(unix)]
fn query_disk_metrics(path: &Path) -> (u64, u64) {
    use std::ffi::CString;
    use std::mem::MaybeUninit;
    use std::os::unix::ffi::OsStrExt;

    if let Ok(c_path) = CString::new(path.as_os_str().as_bytes()) {
        unsafe {
            let mut stat: MaybeUninit<libc::statvfs> = MaybeUninit::uninit();
            if libc::statvfs(c_path.as_ptr(), stat.as_mut_ptr()) == 0 {
                let s = stat.assume_init();
                #[cfg(target_os = "macos")]
                let (total, avail) = (
                    (s.f_blocks as u64) * (s.f_frsize as u64),
                    (s.f_bavail as u64) * (s.f_frsize as u64),
                );
                #[cfg(not(target_os = "macos"))]
                let (total, avail) = (s.f_blocks * s.f_frsize, s.f_bavail * s.f_frsize);
                return (total, avail);
            }
        }
    }
    (0, 0)
}

#[cfg(windows)]
fn query_disk_metrics(path: &Path) -> (u64, u64) {
    use std::os::windows::ffi::OsStrExt;
    let mut wide: Vec<u16> = path.as_os_str().encode_wide().collect();
    wide.push(0);
    let mut free_bytes_available: u64 = 0;
    let mut total_number_of_bytes: u64 = 0;
    let mut total_number_of_free_bytes: u64 = 0;
    extern "system" {
        fn GetDiskFreeSpaceExW(
            lpDirectoryName: *const u16,
            lpFreeBytesAvailableToCaller: *mut u64,
            lpTotalNumberOfBytes: *mut u64,
            lpTotalNumberOfFreeBytes: *mut u64,
        ) -> i32;
    }
    unsafe {
        if GetDiskFreeSpaceExW(
            wide.as_ptr(),
            &mut free_bytes_available,
            &mut total_number_of_bytes,
            &mut total_number_of_free_bytes,
        ) != 0
        {
            return (total_number_of_bytes, free_bytes_available);
        }
    }
    (0, 0)
}

#[cfg(not(any(unix, windows)))]
fn query_disk_metrics(_path: &Path) -> (u64, u64) {
    (0, 0)
}

fn get_mount_point_label(path: &Path) -> String {
    if let Ok(c) = path.canonicalize() {
        return c.to_string_lossy().to_string();
    }
    path.to_string_lossy().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_movie_filename_with_year_and_resolution() {
        let (title, year, edition, res) = parse_video_filename(
            "Inception.2010.1080p.BluRay.x264.mkv",
            Some("Inception (2010)"),
        );
        assert_eq!(title, "Inception");
        assert_eq!(year, Some(2010));
        assert_eq!(edition, None);
        assert_eq!(res, Some("1080p".to_string()));
    }

    #[test]
    fn parses_movie_with_directors_cut_and_4k() {
        let (title, year, edition, res) =
            parse_video_filename("Blade.Runner.1982.Director's.Cut.2160p.mkv", None);
        assert_eq!(title, "Blade Runner");
        assert_eq!(year, Some(1982));
        assert_eq!(edition, Some("Director's Cut".to_string()));
        assert_eq!(res, Some("4K HDR".to_string()));
    }

    #[test]
    fn parses_tv_episode_s01e02_format() {
        let (s, e, title, res) = parse_tv_episode_name(
            "Breaking.Bad.S01E02.Cat's.in.the.Bag - Episode Title.1080p.mkv",
            None,
        );
        assert_eq!(s, 1);
        assert_eq!(e, 2);
        assert_eq!(res, Some("1080p".to_string()));
        assert!(title.is_some());
    }

    #[test]
    fn parses_tv_episode_1x03_format() {
        let (s, e, _title, _res) = parse_tv_episode_name("Severance.1x03.In.Perpetuity.mp4", None);
        assert_eq!(s, 1);
        assert_eq!(e, 3);
    }

    #[test]
    fn library_lifecycle_and_persistence() {
        let temp_dir = std::env::temp_dir().join(format!("kinora_test_lib_{}", now_secs()));
        let _ = fs::create_dir_all(&temp_dir);

        let engine = LocalMediaEngine::new(Some(temp_dir.clone()));

        let lib = LocalLibrary {
            id: "lib_movies_1".into(),
            name: "My Feature Films".into(),
            media_type: LocalMediaType::Movies,
            folders: vec![temp_dir.to_string_lossy().to_string()],
            last_scanned_at: None,
            auto_scan: true,
            scan_interval_hours: 24,
        };

        let saved = engine.save_library(lib).unwrap();
        assert_eq!(saved.name, "My Feature Films");

        let loaded = engine.get_libraries();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].id, "lib_movies_1");

        // Scan the empty folder
        let scan_result = engine.scan_library("lib_movies_1").unwrap();
        assert_eq!(scan_result.items_indexed, 0);

        // Delete library
        let deleted = engine.delete_library("lib_movies_1").unwrap();
        assert!(deleted);
        assert_eq!(engine.get_libraries().len(), 0);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn storage_volumes_query_measures_real_disk() {
        let engine = LocalMediaEngine::new(None);
        let summary = engine.get_storage_volumes_info();
        assert!(!summary.volumes.is_empty());
        assert!(summary.total_disk_bytes > 0);
        assert!(summary.available_disk_bytes > 0);
        assert!(summary.percent_used >= 0.0 && summary.percent_used <= 100.0);
    }

    #[test]
    fn serves_local_media_stream_and_artwork_safely() {
        tauri::async_runtime::block_on(async {
            let temp_dir = std::env::temp_dir().join(format!("kinora_test_serve_{}", now_secs()));
            let movie_folder = temp_dir.join("Test Movie (2024)");
            let _ = fs::create_dir_all(&movie_folder);

            let video_path = movie_folder.join("Test.Movie.2024.1080p.mp4");
            let poster_path = movie_folder.join("poster.jpg");

            let video_data = b"MOCK_VIDEO_STREAM_BYTES_FOR_RANGE_TESTING_0123456789";
            let poster_data = b"\xFF\xD8\xFF\xE0\x00\x10JFIF_MOCK_JPEG_DATA";

            fs::write(&video_path, video_data).unwrap();
            fs::write(&poster_path, poster_data).unwrap();

            let engine = LocalMediaEngine::new(Some(temp_dir.clone()));

            let lib = LocalLibrary {
                id: "lib_serve_test".into(),
                name: "Serve Test".into(),
                media_type: LocalMediaType::Movies,
                folders: vec![temp_dir.to_string_lossy().to_string()],
                last_scanned_at: None,
                auto_scan: true,
                scan_interval_hours: 24,
            };

            engine.save_library(lib).unwrap();
            let scan_result = engine.scan_library("lib_serve_test").unwrap();
            assert_eq!(scan_result.items_indexed, 1);

            let cat = engine.get_catalogue();
            assert_eq!(cat.movies.len(), 1);
            let movie_id = &cat.movies[0].id;

            // Test range request for direct media streaming
            let reply_range = engine
                .serve("GET", &format!("/local/{movie_id}/stream"), None, &["bytes=0-9"])
                .await;
            assert_eq!(reply_range.status, 206);
            assert_eq!(reply_range.body, &video_data[0..10]);
            let has_range_header = reply_range
                .headers
                .iter()
                .any(|(k, v)| *k == "content-range" && v.starts_with("bytes 0-9/"));
            assert!(has_range_header);

            // Test artwork serving
            let reply_art = engine
                .serve("GET", &format!("/local/{movie_id}/art"), None, &[])
                .await;
            assert_eq!(reply_art.status, 200);
            assert_eq!(reply_art.body, poster_data);
            let has_content_type = reply_art
                .headers
                .iter()
                .any(|(k, v)| *k == "content-type" && v == "image/jpeg");
            assert!(has_content_type);

            // Test non-existent media item
            let reply_404 = engine
                .serve("GET", "/local/lm_non_existent/stream", None, &[])
                .await;
            assert_eq!(reply_404.status, 404);

            let _ = fs::remove_dir_all(&temp_dir);
        });
    }

    #[test]
    fn check_watched_folders_detects_additions_and_deletions_in_real_time() {
        let temp_dir = std::env::temp_dir().join(format!("kinora_test_watch_{}", now_secs()));
        let media_folder = temp_dir.join("WatchedMovies");
        fs::create_dir_all(&media_folder).unwrap();

        let engine = LocalMediaEngine::new(Some(temp_dir.clone()));
        let lib = LocalLibrary {
            id: "lib_watch_test".into(),
            name: "Watched Library".into(),
            media_type: LocalMediaType::Movies,
            folders: vec![media_folder.to_string_lossy().to_string()],
            last_scanned_at: None,
            auto_scan: true,
            scan_interval_hours: 1,
        };
        engine.save_library(lib).unwrap();

        // 1. Initial empty check
        let initial_changes = engine.check_watched_folders();
        assert_eq!(initial_changes.len(), 1);
        assert_eq!(initial_changes[0].items_indexed, 0);

        // 2. Unchanged check: no rescans
        let no_changes = engine.check_watched_folders();
        assert_eq!(no_changes.len(), 0);

        // 3. Add movie1: detected and indexed automatically
        let movie1 = media_folder.join("Film.One.2023.1080p.mkv");
        fs::write(&movie1, b"MOCK_MOVIE_1_DATA").unwrap();

        let change_add = engine.check_watched_folders();
        assert_eq!(change_add.len(), 1);
        assert_eq!(change_add[0].items_indexed, 1);
        assert_eq!(engine.get_catalogue().movies.len(), 1);

        // 4. Add movie2: detected and indexed automatically
        let movie2 = media_folder.join("Film.Two.2024.2160p.mkv");
        fs::write(&movie2, b"MOCK_MOVIE_2_DATA").unwrap();

        let change_add2 = engine.check_watched_folders();
        assert_eq!(change_add2.len(), 1);
        assert_eq!(change_add2[0].items_indexed, 2);
        assert_eq!(engine.get_catalogue().movies.len(), 2);

        // 5. Delete movie1: detected and catalogue updated automatically
        fs::remove_file(&movie1).unwrap();

        let change_del = engine.check_watched_folders();
        assert_eq!(change_del.len(), 1);
        assert_eq!(change_del[0].items_indexed, 1);
        let cat = engine.get_catalogue();
        assert_eq!(cat.movies.len(), 1);
        assert_eq!(cat.movies[0].title, "Film Two");

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
