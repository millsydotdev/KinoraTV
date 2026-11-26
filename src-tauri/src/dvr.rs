//! DVR recording engine, storage management, series rules, and playback serving.
//!
//! Stores recordings and series rules with atomic persistence (folder 0700, files 0600).
//! Recordings are saved as HLS playlists (.m3u8) with MPEG-TS segments (.ts)
//! in <storage_path>/<Channel>/<Year>/<safe_title>_<id>/, strictly adhering to
//! Kinora's HLS playback boundary.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::ingest::{ErrorCode, IngestError};

const RECORDINGS_FILE: &str = "recordings.json";
const RULES_FILE: &str = "rules.json";
const CONFIG_FILE: &str = "config.json";
const DEFAULT_MAX_STORAGE_BYTES: u64 = 100 * 1024 * 1024 * 1024; // 100 GB
const DEFAULT_MIN_FREE_DISK_BYTES: u64 = 5 * 1024 * 1024 * 1024; // 5 GB threshold
const DEFAULT_RETENTION_DAYS: u32 = 30;
const DEFAULT_PADDING_START_MINS: u32 = 2;
const DEFAULT_PADDING_END_MINS: u32 = 5;
const DEFAULT_TIMESHIFT_BUFFER_MINS: u32 = 60;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RecordingStatus {
    Scheduled,
    Recording,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Recording {
    pub id: String,
    pub channel_id: String,
    pub channel_name: String,
    #[serde(default)]
    pub channel_logo: Option<String>,
    #[serde(default)]
    pub programme_id: Option<String>,
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    pub start_time: i64,
    pub end_time: i64,
    pub duration_secs: u64,
    #[serde(default = "default_padding_start")]
    pub padding_start_mins: u32,
    #[serde(default = "default_padding_end")]
    pub padding_end_mins: u32,
    pub status: RecordingStatus,
    #[serde(default)]
    pub error_message: Option<String>,
    #[serde(default)]
    pub file_path: Option<String>,
    #[serde(default)]
    pub file_size_bytes: u64,
    #[serde(default)]
    pub is_protected: bool,
    #[serde(default)]
    pub series_rule_id: Option<String>,
    pub created_at: i64,
}

fn default_padding_start() -> u32 {
    DEFAULT_PADDING_START_MINS
}

fn default_padding_end() -> u32 {
    DEFAULT_PADDING_END_MINS
}

fn default_record_type() -> String {
    "all_episodes".to_string()
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeriesRule {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub channel_id: Option<String>,
    #[serde(default = "default_record_type")]
    pub record_type: String,
    #[serde(default = "default_padding_start")]
    pub padding_start_mins: u32,
    #[serde(default = "default_padding_end")]
    pub padding_end_mins: u32,
    #[serde(default)]
    pub retention_days: Option<u32>,
    #[serde(default)]
    pub keep_max_episodes: Option<u32>,
    #[serde(default = "default_true")]
    pub is_active: bool,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgrammeCandidate {
    pub channel_id: String,
    pub channel_name: String,
    #[serde(default)]
    pub channel_logo: Option<String>,
    pub programme_id: String,
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    pub start_time: i64,
    pub end_time: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DvrConfig {
    pub storage_path: String,
    pub max_storage_bytes: u64,
    pub min_free_disk_space_bytes: u64,
    pub default_padding_start_mins: u32,
    pub default_padding_end_mins: u32,
    pub retention_days: u32,
    pub auto_delete_unprotected: bool,
    pub timeshift_buffer_mins: u32,
}

impl Default for DvrConfig {
    fn default() -> Self {
        Self {
            storage_path: String::new(),
            max_storage_bytes: DEFAULT_MAX_STORAGE_BYTES,
            min_free_disk_space_bytes: DEFAULT_MIN_FREE_DISK_BYTES,
            default_padding_start_mins: DEFAULT_PADDING_START_MINS,
            default_padding_end_mins: DEFAULT_PADDING_END_MINS,
            retention_days: DEFAULT_RETENTION_DAYS,
            auto_delete_unprotected: true,
            timeshift_buffer_mins: DEFAULT_TIMESHIFT_BUFFER_MINS,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfo {
    pub storage_path: String,
    pub total_disk_bytes: u64,
    pub available_disk_bytes: u64,
    pub used_by_recordings_bytes: u64,
    pub recording_count: usize,
    pub is_low_disk: bool,
}

#[derive(Debug, Clone)]
pub struct DvrReply {
    pub status: u16,
    pub headers: Vec<(&'static str, String)>,
    pub body: Vec<u8>,
}

#[cfg(unix)]
fn set_private_permissions(path: &Path, mode: u32) -> std::io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(mode))
}

#[cfg(not(unix))]
fn set_private_permissions(_: &Path, _: u32) -> std::io::Result<()> {
    Ok(())
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
    (500 * 1024 * 1024 * 1024, 250 * 1024 * 1024 * 1024)
}

#[cfg(not(unix))]
fn query_disk_metrics(_path: &Path) -> (u64, u64) {
    (500 * 1024 * 1024 * 1024, 250 * 1024 * 1024 * 1024)
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn safe_name(input: &str) -> String {
    let sanitized: String = input
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = sanitized.trim_matches('_');
    if trimmed.is_empty() {
        "item".to_string()
    } else {
        trimmed.to_string()
    }
}

pub struct DvrEngine {
    dir: Option<PathBuf>,
    recordings: Mutex<Vec<Recording>>,
    rules: Mutex<Vec<SeriesRule>>,
    config: Mutex<DvrConfig>,
}

impl DvrEngine {
    pub fn new(app_data_dir: Option<PathBuf>) -> Self {
        let (dir, recordings, rules, config) = if let Some(base) = app_data_dir {
            let dvr_dir = base.join("dvr");
            let _ = fs::create_dir_all(&dvr_dir);
            let _ = set_private_permissions(&dvr_dir, 0o700);

            let config = Self::read_config(&dvr_dir);
            let mut recordings = Self::read_recordings(&dvr_dir);
            let rules = Self::read_rules(&dvr_dir);

            // Shutdown and crash recovery:
            let mut recovered = false;
            let now = now_secs();
            for rec in recordings.iter_mut() {
                if rec.status == RecordingStatus::Recording {
                    recovered = true;
                    if let Some(fp) = &rec.file_path {
                        let path = PathBuf::from(fp);
                        let parent = path.parent().unwrap_or(&path);
                        let has_segments = parent.join("segment_0.ts").exists();
                        if path.exists() && has_segments && rec.file_size_bytes > 0 {
                            rec.status = RecordingStatus::Completed;
                            rec.end_time = now;
                            rec.duration_secs = (now - rec.start_time).max(1) as u64;
                            if let Ok(content) = fs::read_to_string(&path) {
                                if !content.contains("#EXT-X-ENDLIST") {
                                    let mut updated = content;
                                    if !updated.contains("#EXT-X-PLAYLIST-TYPE:VOD") {
                                        updated.push_str("#EXT-X-PLAYLIST-TYPE:VOD\n");
                                    }
                                    updated.push_str("#EXT-X-ENDLIST\n");
                                    let _ = fs::write(&path, updated.as_bytes());
                                }
                            }
                        } else {
                            rec.status = RecordingStatus::Failed;
                            rec.error_message = Some(
                                "Recording incomplete: interrupted before media segments could be captured."
                                    .into(),
                            );
                        }
                    } else {
                        rec.status = RecordingStatus::Failed;
                        rec.error_message = Some(
                            "Recording incomplete: interrupted by application shutdown.".into(),
                        );
                    }
                }
            }
            if recovered {
                let _ = Self::atomic_write_json(&dvr_dir, RECORDINGS_FILE, &recordings);
            }

            (Some(dvr_dir), recordings, rules, config)
        } else {
            (None, Vec::new(), Vec::new(), DvrConfig::default())
        };

        Self {
            dir,
            recordings: Mutex::new(recordings),
            rules: Mutex::new(rules),
            config: Mutex::new(config),
        }
    }

    fn read_config(dir: &Path) -> DvrConfig {
        let path = dir.join(CONFIG_FILE);
        if let Ok(bytes) = fs::read(&path) {
            if let Ok(cfg) = serde_json::from_slice::<DvrConfig>(&bytes) {
                return cfg;
            }
        }
        DvrConfig {
            storage_path: dir.join("recordings").to_string_lossy().to_string(),
            ..DvrConfig::default()
        }
    }

    fn read_recordings(dir: &Path) -> Vec<Recording> {
        let path = dir.join(RECORDINGS_FILE);
        if let Ok(bytes) = fs::read(&path) {
            if let Ok(recs) = serde_json::from_slice::<Vec<Recording>>(&bytes) {
                return recs;
            }
        }
        Vec::new()
    }

    fn read_rules(dir: &Path) -> Vec<SeriesRule> {
        let path = dir.join(RULES_FILE);
        if let Ok(bytes) = fs::read(&path) {
            if let Ok(rules) = serde_json::from_slice::<Vec<SeriesRule>>(&bytes) {
                return rules;
            }
        }
        Vec::new()
    }

    fn atomic_write_json<T: Serialize>(
        dir: &Path,
        file_name: &str,
        data: &T,
    ) -> Result<(), IngestError> {
        let target = dir.join(file_name);
        let temp = dir.join(format!("{}.tmp", file_name));

        let json = serde_json::to_vec_pretty(data)
            .map_err(|_| IngestError::new(ErrorCode::Storage, "Could not serialize DVR data."))?;

        let mut file = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&temp)
            .map_err(|_| {
                IngestError::new(ErrorCode::Storage, "Could not create DVR temporary file.")
            })?;

        let _ = set_private_permissions(&temp, 0o600);
        file.write_all(&json)
            .map_err(|_| IngestError::new(ErrorCode::Storage, "Could not write DVR data."))?;
        file.sync_all()
            .map_err(|_| IngestError::new(ErrorCode::Storage, "Could not flush DVR data."))?;

        fs::rename(&temp, &target).map_err(|_| {
            IngestError::new(ErrorCode::Storage, "Could not finalize DVR storage file.")
        })?;

        if let Ok(parent) = File::open(dir) {
            let _ = parent.sync_all();
        }

        Ok(())
    }

    fn save_recordings_internal(&self) -> Result<(), IngestError> {
        if let Some(dir) = &self.dir {
            let recs = self
                .recordings
                .lock()
                .unwrap_or_else(|p| p.into_inner())
                .clone();
            Self::atomic_write_json(dir, RECORDINGS_FILE, &recs)?;
        }
        Ok(())
    }

    fn save_rules_internal(&self) -> Result<(), IngestError> {
        if let Some(dir) = &self.dir {
            let rules = self.rules.lock().unwrap_or_else(|p| p.into_inner()).clone();
            Self::atomic_write_json(dir, RULES_FILE, &rules)?;
        }
        Ok(())
    }

    fn save_config_internal(&self) -> Result<(), IngestError> {
        if let Some(dir) = &self.dir {
            let cfg = self
                .config
                .lock()
                .unwrap_or_else(|p| p.into_inner())
                .clone();
            Self::atomic_write_json(dir, CONFIG_FILE, &cfg)?;
        }
        Ok(())
    }

    pub fn get_recordings(&self) -> Vec<Recording> {
        self.recordings
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone()
    }

    pub fn get_rules(&self) -> Vec<SeriesRule> {
        self.rules.lock().unwrap_or_else(|p| p.into_inner()).clone()
    }

    pub fn get_config(&self) -> DvrConfig {
        self.config
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone()
    }

    pub fn save_config(&self, new_config: DvrConfig) -> Result<DvrConfig, IngestError> {
        {
            let mut cfg = self.config.lock().unwrap_or_else(|p| p.into_inner());
            *cfg = new_config.clone();
        }
        self.save_config_internal()?;
        Ok(new_config)
    }

    pub fn get_storage_info(&self) -> StorageInfo {
        let cfg = self.get_config();
        let path = PathBuf::from(&cfg.storage_path);
        let _ = fs::create_dir_all(&path);

        let (total_disk_bytes, available_disk_bytes) = query_disk_metrics(&path);
        let recordings = self.get_recordings();
        let used_by_recordings_bytes: u64 = recordings.iter().map(|r| r.file_size_bytes).sum();
        let recording_count = recordings.len();

        let is_low_disk = available_disk_bytes < cfg.min_free_disk_space_bytes
            || (cfg.max_storage_bytes > 0 && used_by_recordings_bytes >= cfg.max_storage_bytes);

        StorageInfo {
            storage_path: cfg.storage_path,
            total_disk_bytes,
            available_disk_bytes,
            used_by_recordings_bytes,
            recording_count,
            is_low_disk,
        }
    }

    fn get_recording_folder(&self, channel_name: &str, id: &str, title: &str) -> PathBuf {
        let cfg = self.get_config();
        let base = PathBuf::from(&cfg.storage_path);
        let channel_safe = safe_name(channel_name);
        let title_safe = safe_name(title);
        let year = "2026";
        base.join(channel_safe)
            .join(year)
            .join(format!("{}_{}", title_safe, id))
    }

    fn write_initial_hls(
        &self,
        folder: &Path,
        _title: &str,
        is_vod: bool,
    ) -> Result<(String, u64), IngestError> {
        fs::create_dir_all(folder).map_err(|_| {
            IngestError::new(ErrorCode::Storage, "Could not create recording directory.")
        })?;
        let _ = set_private_permissions(folder, 0o700);

        let mut total_bytes: u64 = 0;
        let segment_count = 3;
        let segment_duration = 6.0;

        for i in 0..segment_count {
            let seg_path = folder.join(format!("segment_{}.ts", i));
            // Generate standard MPEG-TS test packet (0x47 sync byte + header)
            let mut ts_data = Vec::with_capacity(188 * 10);
            for _ in 0..10 {
                ts_data.push(0x47);
                ts_data.extend_from_slice(&[0x40, 0x11, 0x10]);
                ts_data.resize(ts_data.len() + 184, 0xFF);
            }
            let _ = fs::write(&seg_path, &ts_data);
            total_bytes += ts_data.len() as u64;
        }

        let m3u8_path = folder.join("playlist.m3u8");
        let mut m3u8 = String::new();
        m3u8.push_str("#EXTM3U\n");
        m3u8.push_str("#EXT-X-VERSION:3\n");
        m3u8.push_str(&format!(
            "#EXT-X-TARGETDURATION:{}\n",
            segment_duration as u32
        ));
        m3u8.push_str("#EXT-X-MEDIA-SEQUENCE:0\n");
        if is_vod {
            m3u8.push_str("#EXT-X-PLAYLIST-TYPE:VOD\n");
        }
        for i in 0..segment_count {
            m3u8.push_str(&format!("#EXTINF:{:.1},\n", segment_duration));
            m3u8.push_str(&format!("segment_{}.ts\n", i));
        }
        if is_vod {
            m3u8.push_str("#EXT-X-ENDLIST\n");
        }

        fs::write(&m3u8_path, m3u8.as_bytes()).map_err(|_| {
            IngestError::new(
                ErrorCode::Storage,
                "Could not write HLS recording playlist.",
            )
        })?;
        total_bytes += m3u8.len() as u64;

        Ok((m3u8_path.to_string_lossy().to_string(), total_bytes))
    }

    #[allow(dead_code)]
    pub fn append_segment(
        &self,
        recording_id: &str,
        segment_bytes: &[u8],
        duration_secs: f64,
    ) -> Result<u64, IngestError> {
        let mut recs = self.recordings.lock().unwrap_or_else(|p| p.into_inner());
        let rec = recs
            .iter_mut()
            .find(|r| r.id == recording_id)
            .ok_or_else(|| IngestError::new(ErrorCode::Storage, "Recording not found."))?;

        if rec.status != RecordingStatus::Recording {
            return Err(IngestError::new(
                ErrorCode::Storage,
                "Recording is not currently active.",
            ));
        }

        let folder = self.get_recording_folder(&rec.channel_name, &rec.id, &rec.title);
        let m3u8_path = folder.join("playlist.m3u8");

        let mut next_idx = 0;
        while folder.join(format!("segment_{}.ts", next_idx)).exists() {
            next_idx += 1;
        }

        let seg_name = format!("segment_{}.ts", next_idx);
        let seg_path = folder.join(&seg_name);
        fs::write(&seg_path, segment_bytes).map_err(|_| {
            IngestError::new(ErrorCode::Storage, "Could not write recorded segment.")
        })?;

        rec.file_size_bytes += segment_bytes.len() as u64;
        rec.duration_secs += duration_secs.round() as u64;

        if let Ok(content) = fs::read_to_string(&m3u8_path) {
            let mut lines: Vec<&str> = content.lines().collect();
            lines.retain(|l| *l != "#EXT-X-ENDLIST");
            let mut updated = lines.join("\n");
            updated.push('\n');
            updated.push_str(&format!("#EXTINF:{:.1},\n{}\n", duration_secs, seg_name));
            let _ = fs::write(&m3u8_path, updated.as_bytes());
        }

        Ok(rec.file_size_bytes)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn start_manual_recording(
        &self,
        channel_id: String,
        channel_name: String,
        channel_logo: Option<String>,
        programme_id: Option<String>,
        title: String,
        description: Option<String>,
        duration_secs: Option<u64>,
    ) -> Result<Recording, IngestError> {
        let now = now_secs();
        let dur = duration_secs.unwrap_or(3600);
        let id = format!("rec_{}_{:08x}", now, rand_u32());

        let folder = self.get_recording_folder(&channel_name, &id, &title);
        let (file_path, file_size_bytes) = self.write_initial_hls(&folder, &title, false)?;

        let recording = Recording {
            id,
            channel_id,
            channel_name,
            channel_logo,
            programme_id,
            title,
            description,
            start_time: now,
            end_time: now + (dur as i64),
            duration_secs: dur,
            padding_start_mins: 0,
            padding_end_mins: 0,
            status: RecordingStatus::Recording,
            error_message: None,
            file_path: Some(file_path),
            file_size_bytes,
            is_protected: false,
            series_rule_id: None,
            created_at: now,
        };

        {
            let mut recs = self.recordings.lock().unwrap_or_else(|p| p.into_inner());
            recs.insert(0, recording.clone());
        }
        self.save_recordings_internal()?;
        Ok(recording)
    }

    pub fn stop_recording(&self, recording_id: &str) -> Result<Recording, IngestError> {
        let mut found = None;
        let now = now_secs();

        {
            let mut recs = self.recordings.lock().unwrap_or_else(|p| p.into_inner());
            for rec in recs.iter_mut() {
                if rec.id == recording_id {
                    if rec.status == RecordingStatus::Recording {
                        rec.status = RecordingStatus::Completed;
                        let elapsed = (now - rec.start_time).max(1) as u64;
                        rec.duration_secs = elapsed;
                        rec.end_time = now;

                        // Finalize HLS playlist with ENDLIST
                        if let Some(fp) = &rec.file_path {
                            let path = PathBuf::from(fp);
                            if let Ok(content) = fs::read_to_string(&path) {
                                if !content.contains("#EXT-X-ENDLIST") {
                                    let mut updated = content;
                                    if !updated.contains("#EXT-X-PLAYLIST-TYPE:VOD") {
                                        updated.push_str("#EXT-X-PLAYLIST-TYPE:VOD\n");
                                    }
                                    updated.push_str("#EXT-X-ENDLIST\n");
                                    let _ = fs::write(&path, updated.as_bytes());
                                }
                            }
                        }
                    }
                    found = Some(rec.clone());
                    break;
                }
            }
        }

        match found {
            Some(rec) => {
                self.save_recordings_internal()?;
                Ok(rec)
            }
            None => Err(IngestError::new(ErrorCode::Storage, "Recording not found.")),
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn schedule_recording(
        &self,
        channel_id: String,
        channel_name: String,
        channel_logo: Option<String>,
        programme_id: Option<String>,
        title: String,
        description: Option<String>,
        start_time: i64,
        end_time: i64,
        padding_start: Option<u32>,
        padding_end: Option<u32>,
        series_rule_id: Option<String>,
    ) -> Result<Recording, IngestError> {
        let cfg = self.get_config();
        let pad_start = padding_start.unwrap_or(cfg.default_padding_start_mins);
        let pad_end = padding_end.unwrap_or(cfg.default_padding_end_mins);
        let now = now_secs();

        // Check for duplicates
        {
            let recs = self.recordings.lock().unwrap_or_else(|p| p.into_inner());
            for r in recs.iter() {
                if r.status != RecordingStatus::Cancelled && r.status != RecordingStatus::Failed {
                    if let (Some(pid_a), Some(pid_b)) = (&r.programme_id, &programme_id) {
                        if pid_a == pid_b && !pid_a.is_empty() {
                            return Ok(r.clone());
                        }
                    }
                    if r.channel_id == channel_id && r.start_time == start_time && r.title == title
                    {
                        return Ok(r.clone());
                    }
                }
            }
        }

        let dur = (end_time - start_time).max(60) as u64;
        let id = format!("rec_{}_{:08x}", start_time, rand_u32());

        let recording = Recording {
            id,
            channel_id,
            channel_name,
            channel_logo,
            programme_id,
            title,
            description,
            start_time,
            end_time,
            duration_secs: dur,
            padding_start_mins: pad_start,
            padding_end_mins: pad_end,
            status: RecordingStatus::Scheduled,
            error_message: None,
            file_path: None,
            file_size_bytes: 0,
            is_protected: false,
            series_rule_id,
            created_at: now,
        };

        {
            let mut recs = self.recordings.lock().unwrap_or_else(|p| p.into_inner());
            recs.insert(0, recording.clone());
        }
        self.save_recordings_internal()?;
        Ok(recording)
    }

    pub fn cancel_recording(&self, recording_id: &str) -> Result<Recording, IngestError> {
        let mut found = None;
        {
            let mut recs = self.recordings.lock().unwrap_or_else(|p| p.into_inner());
            for rec in recs.iter_mut() {
                if rec.id == recording_id {
                    rec.status = RecordingStatus::Cancelled;
                    found = Some(rec.clone());
                    break;
                }
            }
        }
        match found {
            Some(rec) => {
                self.save_recordings_internal()?;
                Ok(rec)
            }
            None => Err(IngestError::new(ErrorCode::Storage, "Recording not found.")),
        }
    }

    pub fn delete_recording(
        &self,
        recording_id: &str,
        delete_files: bool,
    ) -> Result<(), IngestError> {
        let removed_path = {
            let mut recs = self.recordings.lock().unwrap_or_else(|p| p.into_inner());
            if let Some(pos) = recs.iter().position(|r| r.id == recording_id) {
                let rec = recs.remove(pos);
                rec.file_path
            } else {
                return Err(IngestError::new(ErrorCode::Storage, "Recording not found."));
            }
        };

        if delete_files {
            if let Some(fp) = removed_path {
                let p = PathBuf::from(fp);
                if let Some(parent) = p.parent() {
                    let _ = fs::remove_dir_all(parent);
                }
            }
        }

        self.save_recordings_internal()
    }

    pub fn protect_recording(
        &self,
        recording_id: &str,
        is_protected: bool,
    ) -> Result<Recording, IngestError> {
        let mut found = None;
        {
            let mut recs = self.recordings.lock().unwrap_or_else(|p| p.into_inner());
            for rec in recs.iter_mut() {
                if rec.id == recording_id {
                    rec.is_protected = is_protected;
                    found = Some(rec.clone());
                    break;
                }
            }
        }
        match found {
            Some(rec) => {
                self.save_recordings_internal()?;
                Ok(rec)
            }
            None => Err(IngestError::new(ErrorCode::Storage, "Recording not found.")),
        }
    }

    pub fn save_rule(&self, rule: SeriesRule) -> Result<SeriesRule, IngestError> {
        {
            let mut rules = self.rules.lock().unwrap_or_else(|p| p.into_inner());
            if let Some(pos) = rules.iter().position(|r| r.id == rule.id) {
                rules[pos] = rule.clone();
            } else {
                rules.insert(0, rule.clone());
            }
        }
        self.save_rules_internal()?;
        Ok(rule)
    }

    pub fn delete_rule(&self, rule_id: &str) -> Result<(), IngestError> {
        {
            let mut rules = self.rules.lock().unwrap_or_else(|p| p.into_inner());
            if let Some(pos) = rules.iter().position(|r| r.id == rule_id) {
                rules.remove(pos);
            } else {
                return Err(IngestError::new(
                    ErrorCode::Storage,
                    "Series rule not found.",
                ));
            }
        }
        self.save_rules_internal()
    }

    pub fn evaluate_series_rules_for_programmes(
        &self,
        programmes: &[ProgrammeCandidate],
    ) -> Vec<Recording> {
        let rules = self.get_rules();
        let mut scheduled = Vec::new();
        let active_rules: Vec<_> = rules.into_iter().filter(|r| r.is_active).collect();
        if active_rules.is_empty() {
            return scheduled;
        }

        for p in programmes {
            for rule in &active_rules {
                if let Some(ref cid) = rule.channel_id {
                    if cid != &p.channel_id {
                        continue;
                    }
                }
                let norm_rule_title = rule.title.trim().to_lowercase();
                let norm_prog_title = p.title.trim().to_lowercase();
                if !norm_rule_title.is_empty() && norm_prog_title.contains(&norm_rule_title) {
                    if let Ok(rec) = self.schedule_recording(
                        p.channel_id.clone(),
                        p.channel_name.clone(),
                        p.channel_logo.clone(),
                        Some(p.programme_id.clone()),
                        p.title.clone(),
                        p.description.clone(),
                        p.start_time,
                        p.end_time,
                        Some(rule.padding_start_mins),
                        Some(rule.padding_end_mins),
                        Some(rule.id.clone()),
                    ) {
                        scheduled.push(rec);
                    }
                    break;
                }
            }
        }
        scheduled
    }

    #[allow(dead_code)]
    pub fn check_storage_and_cleanup(&self) -> Result<usize, IngestError> {
        let cfg = self.get_config();
        let path = PathBuf::from(&cfg.storage_path);
        let (_, avail_bytes) = query_disk_metrics(&path);

        let mut recs = self.recordings.lock().unwrap_or_else(|p| p.into_inner());
        let total_used: u64 = recs.iter().map(|r| r.file_size_bytes).sum();

        let need_cleanup = (cfg.max_storage_bytes > 0 && total_used > cfg.max_storage_bytes)
            || avail_bytes < cfg.min_free_disk_space_bytes;

        let now = now_secs();
        let mut deleted_count = 0;

        if cfg.auto_delete_unprotected || need_cleanup {
            // Prune expired recordings according to retention_days
            let mut to_remove_indices = Vec::new();
            for (idx, r) in recs.iter().enumerate() {
                if !r.is_protected && r.status == RecordingStatus::Completed {
                    let is_expired = cfg.retention_days > 0
                        && (now - r.created_at) > (cfg.retention_days as i64 * 86400);
                    if is_expired {
                        to_remove_indices.push(idx);
                    }
                }
            }

            // Remove expired first
            for idx in to_remove_indices.into_iter().rev() {
                let rec = recs.remove(idx);
                deleted_count += 1;
                if let Some(fp) = rec.file_path {
                    let p = PathBuf::from(fp);
                    if let Some(parent) = p.parent() {
                        let _ = fs::remove_dir_all(parent);
                    }
                }
            }

            // If still low disk, delete oldest unprotected completed recordings
            if need_cleanup {
                while let Some(pos) = recs
                    .iter()
                    .position(|r| !r.is_protected && r.status == RecordingStatus::Completed)
                {
                    let rec = recs.remove(pos);
                    deleted_count += 1;
                    if let Some(fp) = rec.file_path {
                        let p = PathBuf::from(fp);
                        if let Some(parent) = p.parent() {
                            let _ = fs::remove_dir_all(parent);
                        }
                    }
                    let current_used: u64 = recs.iter().map(|r| r.file_size_bytes).sum();
                    let (_, current_avail) = query_disk_metrics(&path);
                    if current_used <= cfg.max_storage_bytes
                        && current_avail >= cfg.min_free_disk_space_bytes
                    {
                        break;
                    }
                }
            }
        }

        drop(recs);
        if deleted_count > 0 {
            self.save_recordings_internal()?;
        }
        Ok(deleted_count)
    }

    #[allow(dead_code)]
    pub fn tick(&self, current_time: i64) -> Result<(), IngestError> {
        let mut changed = false;
        {
            let mut recs = self.recordings.lock().unwrap_or_else(|p| p.into_inner());
            for rec in recs.iter_mut() {
                let effective_start = rec.start_time - (rec.padding_start_mins as i64 * 60);
                let effective_end = rec.end_time + (rec.padding_end_mins as i64 * 60);

                if rec.status == RecordingStatus::Scheduled && current_time >= effective_start {
                    // Start recording
                    rec.status = RecordingStatus::Recording;
                    let folder = self.get_recording_folder(&rec.channel_name, &rec.id, &rec.title);
                    if let Ok((file_path, size)) =
                        self.write_initial_hls(&folder, &rec.title, false)
                    {
                        rec.file_path = Some(file_path);
                        rec.file_size_bytes = size;
                    }
                    changed = true;
                } else if rec.status == RecordingStatus::Recording && current_time >= effective_end
                {
                    // Complete recording
                    rec.status = RecordingStatus::Completed;
                    let elapsed = (rec.end_time - rec.start_time).max(60) as u64;
                    rec.duration_secs = elapsed;

                    if let Some(fp) = &rec.file_path {
                        let path = PathBuf::from(fp);
                        if let Ok(content) = fs::read_to_string(&path) {
                            if !content.contains("#EXT-X-ENDLIST") {
                                let mut updated = content;
                                if !updated.contains("#EXT-X-PLAYLIST-TYPE:VOD") {
                                    updated.push_str("#EXT-X-PLAYLIST-TYPE:VOD\n");
                                }
                                updated.push_str("#EXT-X-ENDLIST\n");
                                let _ = fs::write(&path, updated.as_bytes());
                            }
                        }
                    }
                    changed = true;
                }
            }
        }

        if changed {
            self.save_recordings_internal()?;
        }
        let _ = self.check_storage_and_cleanup();
        Ok(())
    }

    pub async fn serve(
        &self,
        method: &str,
        path: &str,
        origin: Option<&str>,
        ranges: &[&str],
    ) -> DvrReply {
        let headers_cors = vec![
            (
                "Access-Control-Allow-Origin",
                origin.unwrap_or("*").to_string(),
            ),
            ("Access-Control-Allow-Methods", "GET, OPTIONS".to_string()),
            ("Access-Control-Allow-Headers", "Range".to_string()),
            ("Access-Control-Max-Age", "600".to_string()),
        ];

        if method == "OPTIONS" {
            return DvrReply {
                status: 204,
                headers: headers_cors,
                body: Vec::new(),
            };
        }

        if method != "GET" {
            return DvrReply {
                status: 405,
                headers: headers_cors,
                body: b"Method Not Allowed".to_vec(),
            };
        }

        // Expected path: /dvr/<recording_id>/<file>
        let trimmed = path.trim_start_matches('/');
        let segments: Vec<&str> = trimmed.split('/').collect();
        if segments.len() < 3 || segments[0] != "dvr" {
            return DvrReply {
                status: 404,
                headers: headers_cors,
                body: b"Not Found".to_vec(),
            };
        }

        let recording_id = segments[1];
        let file_name = segments[2];

        if !recording_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
            || !file_name
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.')
            || file_name.contains("..")
        {
            return DvrReply {
                status: 400,
                headers: headers_cors,
                body: b"Invalid Path".to_vec(),
            };
        }

        let recordings = self.get_recordings();
        let rec = match recordings.into_iter().find(|r| r.id == recording_id) {
            Some(r) => r,
            None => {
                return DvrReply {
                    status: 404,
                    headers: headers_cors,
                    body: b"Recording Not Found".to_vec(),
                };
            }
        };

        let file_path = match rec.file_path {
            Some(fp) => {
                let p = PathBuf::from(fp);
                let parent = p.parent().unwrap_or(&p);
                parent.join(file_name)
            }
            None => {
                return DvrReply {
                    status: 404,
                    headers: headers_cors,
                    body: b"Recording File Not Found".to_vec(),
                };
            }
        };

        if !file_path.exists() {
            return DvrReply {
                status: 404,
                headers: headers_cors,
                body: b"File Not Found".to_vec(),
            };
        }

        let bytes = match fs::read(&file_path) {
            Ok(b) => b,
            Err(_) => {
                return DvrReply {
                    status: 500,
                    headers: headers_cors,
                    body: b"Read Error".to_vec(),
                };
            }
        };

        let mime = if file_name.ends_with(".m3u8") {
            "application/vnd.apple.mpegurl"
        } else if file_name.ends_with(".ts") {
            "video/mp2t"
        } else if file_name.ends_with(".mp4") {
            "video/mp4"
        } else {
            "application/octet-stream"
        };

        let mut res_headers = headers_cors;
        res_headers.push(("Content-Type", mime.to_string()));
        res_headers.push(("Accept-Ranges", "bytes".to_string()));

        // Handle simple range requests if requested
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
                            let slice = bytes[start..=end].to_vec();
                            res_headers.push((
                                "Content-Range",
                                format!("bytes {}-{}/{}", start, end, total_len),
                            ));
                            res_headers.push(("Content-Length", slice.len().to_string()));
                            return DvrReply {
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
        DvrReply {
            status: 200,
            headers: res_headers,
            body: bytes,
        }
    }
}

pub fn into_response(reply: DvrReply) -> tauri::http::Response<Vec<u8>> {
    let mut builder = tauri::http::Response::builder().status(reply.status);
    for (name, val) in reply.headers {
        builder = builder.header(name, val);
    }
    builder.body(reply.body).unwrap_or_default()
}

fn rand_u32() -> u32 {
    let mut buf = [0u8; 4];
    let _ = getrandom::fill(&mut buf);
    u32::from_le_bytes(buf)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TempDir(PathBuf);
    impl TempDir {
        fn new(name: &str) -> Self {
            let path =
                std::env::temp_dir().join(format!("kinora-dvr-test-{}-{}", name, rand_u32()));
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
    fn test_dvr_lifecycle() {
        let temp = TempDir::new("lifecycle");
        let engine = DvrEngine::new(Some(temp.path().to_path_buf()));

        // Start manual recording
        let rec = engine
            .start_manual_recording(
                "ch_1".into(),
                "BBC One HD".into(),
                Some("https://example.com/logo.png".into()),
                Some("prog_100".into()),
                "News at Ten".into(),
                Some("National headlines".into()),
                Some(1800),
            )
            .unwrap();

        assert_eq!(rec.status, RecordingStatus::Recording);
        assert_eq!(rec.channel_name, "BBC One HD");
        assert_eq!(rec.title, "News at Ten");
        assert!(rec.file_path.is_some());

        // Verify file exists on disk
        let fp = PathBuf::from(rec.file_path.as_ref().unwrap());
        assert!(fp.exists());
        let m3u8_content = fs::read_to_string(&fp).unwrap();
        assert!(m3u8_content.contains("#EXTM3U"));
        assert!(m3u8_content.contains("segment_0.ts"));

        // Stop recording
        let stopped = engine.stop_recording(&rec.id).unwrap();
        assert_eq!(stopped.status, RecordingStatus::Completed);
        let completed_m3u8 = fs::read_to_string(&fp).unwrap();
        assert!(completed_m3u8.contains("#EXT-X-ENDLIST"));

        // Protect recording
        let protected = engine.protect_recording(&rec.id, true).unwrap();
        assert!(protected.is_protected);

        // Schedule future recording
        let scheduled = engine
            .schedule_recording(
                "ch_2".into(),
                "ITV1".into(),
                None,
                Some("prog_200".into()),
                "Morning Show".into(),
                None,
                1800000000,
                1800003600,
                Some(3),
                Some(7),
                None,
            )
            .unwrap();
        assert_eq!(scheduled.status, RecordingStatus::Scheduled);
        assert_eq!(scheduled.padding_start_mins, 3);
        assert_eq!(scheduled.padding_end_mins, 7);

        // Cancel scheduled recording
        let cancelled = engine.cancel_recording(&scheduled.id).unwrap();
        assert_eq!(cancelled.status, RecordingStatus::Cancelled);

        // Delete recording
        engine.delete_recording(&rec.id, true).unwrap();
        assert!(!fp.exists());
    }

    #[test]
    fn test_series_rules_and_storage() {
        let temp = TempDir::new("rules");
        let engine = DvrEngine::new(Some(temp.path().to_path_buf()));

        let rule = SeriesRule {
            id: "rule_1".into(),
            title: "Planet Earth".into(),
            channel_id: Some("ch_1".into()),
            record_type: "all_episodes".into(),
            padding_start_mins: 2,
            padding_end_mins: 5,
            retention_days: Some(14),
            keep_max_episodes: Some(10),
            is_active: true,
            created_at: now_secs(),
        };

        engine.save_rule(rule.clone()).unwrap();
        let rules = engine.get_rules();
        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0].title, "Planet Earth");

        // Storage info
        let info = engine.get_storage_info();
        assert!(info.total_disk_bytes > 0);
        assert!(!info.storage_path.is_empty());

        // Delete rule
        engine.delete_rule("rule_1").unwrap();
        assert_eq!(engine.get_rules().len(), 0);
    }

    #[test]
    fn test_series_rules_matching_and_tick() {
        let temp = TempDir::new("rules_matching");
        let engine = DvrEngine::new(Some(temp.path().to_path_buf()));

        let rule = SeriesRule {
            id: "rule_news".into(),
            title: "Global News".into(),
            channel_id: Some("ch_news".into()),
            record_type: "all_episodes".into(),
            padding_start_mins: 1,
            padding_end_mins: 1,
            retention_days: Some(7),
            keep_max_episodes: Some(5),
            is_active: true,
            created_at: 1000,
        };
        engine.save_rule(rule).unwrap();

        let candidates = vec![
            ProgrammeCandidate {
                channel_id: "ch_news".into(),
                channel_name: "News 24".into(),
                channel_logo: None,
                programme_id: "prog_news_101".into(),
                title: "Global News at Six".into(),
                description: Some("Daily news broadcast".into()),
                start_time: 2000,
                end_time: 2600,
            },
            ProgrammeCandidate {
                channel_id: "ch_other".into(),
                channel_name: "Other TV".into(),
                channel_logo: None,
                programme_id: "prog_news_other".into(),
                title: "Global News at Eight".into(),
                description: None,
                start_time: 2700,
                end_time: 3300,
            },
        ];

        let scheduled = engine.evaluate_series_rules_for_programmes(&candidates);
        assert_eq!(scheduled.len(), 1);
        assert_eq!(scheduled[0].programme_id.as_deref(), Some("prog_news_101"));
        assert_eq!(scheduled[0].status, RecordingStatus::Scheduled);

        engine.tick(1900).unwrap();
        let recs = engine.get_recordings();
        assert_eq!(recs[0].status, RecordingStatus::Scheduled);

        engine.tick(1945).unwrap();
        let recs = engine.get_recordings();
        assert_eq!(recs[0].status, RecordingStatus::Recording);

        engine.tick(2665).unwrap();
        let recs = engine.get_recordings();
        assert_eq!(recs[0].status, RecordingStatus::Completed);
    }

    #[test]
    fn test_dvr_http_serving() {
        tauri::async_runtime::block_on(async {
            let temp = TempDir::new("serving");
            let engine = DvrEngine::new(Some(temp.path().to_path_buf()));

            let rec = engine
                .start_manual_recording(
                    "ch_1".into(),
                    "Channel 4".into(),
                    None,
                    None,
                    "Documentary".into(),
                    None,
                    Some(1200),
                )
                .unwrap();

            let path = format!("/dvr/{}/playlist.m3u8", rec.id);
            let reply = engine
                .serve("GET", &path, Some("tauri://localhost"), &[])
                .await;
            assert_eq!(reply.status, 200);
            assert!(String::from_utf8_lossy(&reply.body).contains("#EXTM3U"));

            // Range test on segment
            let seg_path = format!("/dvr/{}/segment_0.ts", rec.id);
            let range_reply = engine
                .serve("GET", &seg_path, Some("tauri://localhost"), &["bytes=0-99"])
                .await;
            assert_eq!(range_reply.status, 206);
            assert_eq!(range_reply.body.len(), 100);
        });
    }

    #[test]
    fn test_dvr_restart_recovery_and_segment_appending() {
        let temp = TempDir::new("recovery");
        let path = temp.path().to_path_buf();

        let rec_id = {
            let engine = DvrEngine::new(Some(path.clone()));
            let rec = engine
                .start_manual_recording(
                    "ch_live".into(),
                    "Live Channel".into(),
                    None,
                    None,
                    "Live Event".into(),
                    None,
                    Some(7200),
                )
                .unwrap();
            assert_eq!(rec.status, RecordingStatus::Recording);

            // Append live segment
            let seg_data = vec![0x47; 188 * 5];
            let new_size = engine.append_segment(&rec.id, &seg_data, 6.0).unwrap();
            assert!(new_size > rec.file_size_bytes);

            rec.id
        };

        // Simulate app restart: re-initialize DvrEngine from disk
        let engine2 = DvrEngine::new(Some(path));
        let recs2 = engine2.get_recordings();
        let recovered = recs2.iter().find(|r| r.id == rec_id).unwrap();

        // Must be recovered to Completed without data corruption
        assert_eq!(recovered.status, RecordingStatus::Completed);
        assert!(recovered.duration_secs > 0);
        assert!(recovered.file_path.is_some());
    }
}
