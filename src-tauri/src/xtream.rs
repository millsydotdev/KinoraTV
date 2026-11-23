use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use openssl::hash::MessageDigest;
use openssl::pkcs5::pbkdf2_hmac;
use openssl::rand::rand_bytes;
use openssl::symm::{decrypt_aead, encrypt_aead, Cipher};
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::sync::Semaphore;

use crate::fetch::{self, Policy};
use crate::ingest::{ErrorCode, IngestError};
use crate::sources;

const MAX_ITEMS: usize = 25_000;
const MAX_TEXT: usize = 2_048;
const MAX_EXT: usize = 12;
const MAX_ARTWORK_URLS: usize = 50_000;
static REQUESTS: Semaphore = Semaphore::const_new(4);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub parent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LiveStream {
    pub id: String,
    #[serde(default)]
    pub num: Option<u32>,
    pub name: String,
    #[serde(default)]
    pub stream_type: String,
    #[serde(default)]
    pub stream_icon: Option<String>,
    #[serde(default)]
    pub epg_channel_id: Option<String>,
    #[serde(default)]
    pub category_id: Option<String>,
    #[serde(default)]
    pub category_ids: Vec<String>,
    #[serde(default)]
    pub tv_archive: u32,
    #[serde(default)]
    pub tv_archive_duration: u32,
    #[serde(default)]
    pub artwork_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UserInfo {
    pub username: String,
    pub status: String,
    #[serde(default)]
    pub exp_date: Option<String>,
    #[serde(default)]
    pub is_trial: Option<String>,
    #[serde(default)]
    pub active_cons: Option<String>,
    #[serde(default)]
    pub max_connections: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub auth: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfo {
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub port: Option<String>,
    #[serde(default)]
    pub https_port: Option<String>,
    #[serde(default)]
    pub server_protocol: Option<String>,
    #[serde(default)]
    pub rtmp_port: Option<String>,
    #[serde(default)]
    pub timezone: Option<String>,
    #[serde(default)]
    pub time_now: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCapabilities {
    pub has_live: bool,
    pub has_vod: bool,
    pub has_series: bool,
    pub has_epg: bool,
    pub has_catchup: bool,
    pub live_count: u32,
    pub vod_count: u32,
    pub series_count: u32,
    pub live_categories_count: u32,
    pub vod_categories_count: u32,
    pub series_categories_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MovieDetails {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub plot: Option<String>,
    #[serde(default)]
    pub cast: Option<String>,
    #[serde(default)]
    pub director: Option<String>,
    #[serde(default)]
    pub genre: Option<String>,
    #[serde(default)]
    pub release_date: Option<String>,
    #[serde(default)]
    pub duration_secs: Option<u32>,
    #[serde(default)]
    pub rating: Option<f64>,
    #[serde(default)]
    pub backdrop: Option<String>,
    #[serde(default)]
    pub stream_icon: Option<String>,
    #[serde(default)]
    pub container_extension: String,
    #[serde(default)]
    pub artwork_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EpgListing {
    pub id: String,
    #[serde(default)]
    pub epg_id: Option<String>,
    pub title: String,
    #[serde(default)]
    pub lang: Option<String>,
    pub start: String,
    pub end: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub channel_id: Option<String>,
    #[serde(default)]
    pub start_timestamp: Option<i64>,
    #[serde(default)]
    pub stop_timestamp: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct XtreamConnectionReport {
    pub success: bool,
    pub message: String,
    pub user_info: Option<UserInfo>,
    pub server_info: Option<ServerInfo>,
    pub capabilities: Option<ProviderCapabilities>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: String,
    pub name: String,
    pub category_id: Option<String>,
    #[serde(default)]
    pub category_name: Option<String>,
    pub year: Option<i32>,
    #[serde(default)]
    pub rating: Option<f64>,
    pub plot: Option<String>,
    pub extension: String,
    pub artwork_key: String,
    #[serde(default)]
    pub icon_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Catalogue {
    pub movies: Vec<Entry>,
    pub series: Vec<Entry>,
    #[serde(default)]
    pub live_streams: Vec<LiveStream>,
    #[serde(default)]
    pub live_categories: Vec<Category>,
    #[serde(default)]
    pub vod_categories: Vec<Category>,
    #[serde(default)]
    pub series_categories: Vec<Category>,
    #[serde(default)]
    pub user_info: Option<UserInfo>,
    #[serde(default)]
    pub server_info: Option<ServerInfo>,
    #[serde(default)]
    pub capabilities: Option<ProviderCapabilities>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Artwork {
    pub mime_type: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeriesDetails {
    pub plot: Option<String>,
    pub seasons: Vec<Season>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Season {
    pub number: u32,
    pub episodes: Vec<Episode>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Episode {
    pub id: String,
    pub number: u32,
    pub title: String,
    pub plot: Option<String>,
    pub runtime_seconds: Option<u32>,
    pub extension: String,
    pub artwork_key: String,
}

const VAULT_FILE: &str = ".credentials.vault";
const SALT_FILE: &str = ".credentials.salt";
const VAULT_VERSION: u32 = 1;
const VAULT_ITERATIONS: usize = 100_000;
const NONCE_LEN: usize = 12;
const TAG_LEN: usize = 16;
const AAD_BYTES: &[u8] = b"kinora-provider-credentials-v1";

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn hex_decode(s: &str) -> Result<Vec<u8>, &'static str> {
    if !s.len().is_multiple_of(2) {
        return Err("Hex string length must be even");
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).map_err(|_| "Invalid hexadecimal digit"))
        .collect()
}

#[derive(Clone, Serialize, Deserialize)]
struct StoredCredentials {
    server: String,
    username: String,
    password: String,
}

#[derive(Serialize, Deserialize)]
struct EncryptedVaultRecord {
    version: u32,
    algorithm: String,
    nonce: String,
    tag: String,
    ciphertext: String,
}

fn get_machine_identifier() -> Vec<u8> {
    if let Ok(id) = fs::read_to_string("/etc/machine-id") {
        let trimmed = id.trim();
        if !trimmed.is_empty() {
            return trimmed.as_bytes().to_vec();
        }
    }
    if let Ok(id) = fs::read_to_string("/var/lib/dbus/machine-id") {
        let trimmed = id.trim();
        if !trimmed.is_empty() {
            return trimmed.as_bytes().to_vec();
        }
    }
    let user = std::env::var("USER")
        .or_else(|_| std::env::var("LOGNAME"))
        .unwrap_or_else(|_| "kinora-user".to_string());
    format!("kinora-host-id:{user}").into_bytes()
}

fn get_or_create_salt(dir: &std::path::Path) -> Result<[u8; 32], IngestError> {
    let salt_path = dir.join(SALT_FILE);
    if let Ok(existing) = fs::read(&salt_path) {
        if existing.len() == 32 {
            let mut arr = [0u8; 32];
            arr.copy_from_slice(&existing);
            return Ok(arr);
        }
    }
    let mut salt = [0u8; 32];
    rand_bytes(&mut salt).map_err(|_| {
        IngestError::new(ErrorCode::Network, "Could not generate cryptographic salt.")
    })?;
    sources::write_atomically(dir, SALT_FILE, &salt)
        .map_err(|_| IngestError::new(ErrorCode::Network, "Could not write credentials salt."))?;
    Ok(salt)
}

fn derive_vault_key(dir: &std::path::Path) -> Result<[u8; 32], IngestError> {
    let machine_id = get_machine_identifier();
    let salt = get_or_create_salt(dir)?;
    let mut key = [0u8; 32];
    pbkdf2_hmac(
        &machine_id,
        &salt,
        VAULT_ITERATIONS,
        MessageDigest::sha256(),
        &mut key,
    )
    .map_err(|_| {
        IngestError::new(
            ErrorCode::Network,
            "Failed to derive credential encryption key.",
        )
    })?;
    Ok(key)
}

fn save_credentials_vault(
    dir: &std::path::Path,
    creds_map: &HashMap<String, Credentials>,
) -> Result<(), IngestError> {
    let stored_map: HashMap<String, StoredCredentials> = creds_map
        .iter()
        .map(|(k, v)| {
            (
                k.clone(),
                StoredCredentials {
                    server: v.server.to_string(),
                    username: v.username.clone(),
                    password: v.password.clone(),
                },
            )
        })
        .collect();

    let plaintext = serde_json::to_vec(&stored_map)
        .map_err(|_| IngestError::new(ErrorCode::NotCatalogue, "Serialization error"))?;

    let key = derive_vault_key(dir)?;
    let mut nonce = [0u8; NONCE_LEN];
    rand_bytes(&mut nonce)
        .map_err(|_| IngestError::new(ErrorCode::Network, "Cryptographic random failed"))?;

    let cipher = Cipher::aes_256_gcm();
    let mut tag = [0u8; TAG_LEN];
    let ciphertext = encrypt_aead(cipher, &key, Some(&nonce), AAD_BYTES, &plaintext, &mut tag)
        .map_err(|_| IngestError::new(ErrorCode::Network, "Failed to encrypt credentials"))?;

    let record = EncryptedVaultRecord {
        version: VAULT_VERSION,
        algorithm: "aes-256-gcm+pbkdf2-sha256".to_string(),
        nonce: hex_encode(&nonce),
        tag: hex_encode(&tag),
        ciphertext: hex_encode(&ciphertext),
    };

    let record_bytes = serde_json::to_vec(&record)
        .map_err(|_| IngestError::new(ErrorCode::NotCatalogue, "Serialization error"))?;

    sources::write_atomically(dir, VAULT_FILE, &record_bytes)
        .map_err(|_| IngestError::new(ErrorCode::Network, "Could not write credentials vault."))
}

fn load_credentials_vault(dir: &std::path::Path) -> HashMap<String, Credentials> {
    let vault_path = dir.join(VAULT_FILE);
    let Ok(data) = fs::read(&vault_path) else {
        return HashMap::new();
    };
    let Ok(record) = serde_json::from_slice::<EncryptedVaultRecord>(&data) else {
        return HashMap::new();
    };
    if record.version != VAULT_VERSION || record.algorithm != "aes-256-gcm+pbkdf2-sha256" {
        return HashMap::new();
    }
    let Ok(key) = derive_vault_key(dir) else {
        return HashMap::new();
    };
    let Ok(nonce) = hex_decode(&record.nonce) else {
        return HashMap::new();
    };
    let Ok(tag) = hex_decode(&record.tag) else {
        return HashMap::new();
    };
    let Ok(ciphertext) = hex_decode(&record.ciphertext) else {
        return HashMap::new();
    };
    if nonce.len() != NONCE_LEN || tag.len() != TAG_LEN {
        return HashMap::new();
    }
    let cipher = Cipher::aes_256_gcm();
    let Ok(plaintext) = decrypt_aead(cipher, &key, Some(&nonce), AAD_BYTES, &ciphertext, &tag)
    else {
        return HashMap::new();
    };

    let Ok(stored_map) = serde_json::from_slice::<HashMap<String, StoredCredentials>>(&plaintext)
    else {
        return HashMap::new();
    };

    let mut result = HashMap::new();
    for (id, stored) in stored_map {
        if let Ok(server) = Url::parse(&stored.server) {
            if valid_login(&stored.username, &stored.password) {
                result.insert(
                    id,
                    Credentials {
                        server,
                        username: stored.username,
                        password: stored.password,
                    },
                );
            }
        }
    }
    result
}

#[derive(Clone)]
struct Credentials {
    server: Url,
    username: String,
    password: String,
}

#[derive(Default)]
pub struct Providers {
    dir: Option<PathBuf>,
    connected: Mutex<HashMap<String, Credentials>>,
    artwork: Mutex<HashMap<String, Url>>,
}

impl Providers {
    pub fn new(dir: Option<PathBuf>) -> Self {
        let connected = if let Some(ref d) = dir {
            load_credentials_vault(d)
        } else {
            HashMap::new()
        };
        let mut initial_artwork = HashMap::new();
        if let Some(ref d) = dir {
            if let Ok(entries) = fs::read_dir(d) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if let Some(fname) = path.file_name().and_then(|n| n.to_str()) {
                        if fname.starts_with("xtream-") && fname.ends_with(".json") {
                            if let Ok(bytes) = fs::read(&path) {
                                if let Ok(cat) = serde_json::from_slice::<Catalogue>(&bytes) {
                                    for stream in &cat.live_streams {
                                        if let Some(ref icon) = stream.stream_icon {
                                            if let Ok(checked) = fetch::check_url(icon, &Policy::artwork()) {
                                                if initial_artwork.len() < MAX_ARTWORK_URLS {
                                                    initial_artwork.insert(stream.artwork_key.clone(), checked);
                                                }
                                            }
                                        }
                                    }
                                    for movie in &cat.movies {
                                        if let Some(ref icon) = movie.icon_url {
                                            if let Ok(checked) = fetch::check_url(icon, &Policy::artwork()) {
                                                if initial_artwork.len() < MAX_ARTWORK_URLS {
                                                    initial_artwork.insert(movie.artwork_key.clone(), checked);
                                                }
                                            }
                                        }
                                    }
                                    for series in &cat.series {
                                        if let Some(ref icon) = series.icon_url {
                                            if let Ok(checked) = fetch::check_url(icon, &Policy::artwork()) {
                                                if initial_artwork.len() < MAX_ARTWORK_URLS {
                                                    initial_artwork.insert(series.artwork_key.clone(), checked);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        Self {
            dir,
            connected: Mutex::new(connected),
            artwork: Mutex::new(initial_artwork),
        }
    }

    pub fn is_connected(&self, source_id: &str) -> bool {
        self.connected
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .contains_key(source_id)
    }

    #[allow(dead_code)]
    pub fn restore_credentials(&self) {
        if let Some(ref d) = self.dir {
            let loaded = load_credentials_vault(d);
            let mut map = self.connected.lock().unwrap_or_else(|p| p.into_inner());
            for (k, v) in loaded {
                map.insert(k, v);
            }
        }
    }

    pub fn write_cache(&self, source_id: &str, catalogue: &Catalogue) {
        let Some(dir) = self.dir.as_ref() else { return };
        if let Ok(json) = serde_json::to_vec(catalogue) {
            let _ = sources::write_atomically(dir, &format!("xtream-{source_id}.json"), &json);
        }
    }

    pub fn load_cache(&self, source_id: &str) -> Option<Catalogue> {
        let dir = self.dir.as_ref()?;
        let path = dir.join(format!("xtream-{source_id}.json"));
        let bytes = fs::read(path).ok()?;
        let cat: Catalogue = serde_json::from_slice(&bytes).ok()?;
        {
            let mut artwork = self.artwork.lock().unwrap_or_else(|p| p.into_inner());
            for stream in &cat.live_streams {
                if let Some(ref icon) = stream.stream_icon {
                    if let Ok(checked) = fetch::check_url(icon, &Policy::artwork()) {
                        if artwork.contains_key(&stream.artwork_key) || artwork.len() < MAX_ARTWORK_URLS {
                            artwork.insert(stream.artwork_key.clone(), checked);
                        }
                    }
                }
            }
            for movie in &cat.movies {
                if let Some(ref icon) = movie.icon_url {
                    if let Ok(checked) = fetch::check_url(icon, &Policy::artwork()) {
                        if artwork.contains_key(&movie.artwork_key) || artwork.len() < MAX_ARTWORK_URLS {
                            artwork.insert(movie.artwork_key.clone(), checked);
                        }
                    }
                }
            }
            for series in &cat.series {
                if let Some(ref icon) = series.icon_url {
                    if let Ok(checked) = fetch::check_url(icon, &Policy::artwork()) {
                        if artwork.contains_key(&series.artwork_key) || artwork.len() < MAX_ARTWORK_URLS {
                            artwork.insert(series.artwork_key.clone(), checked);
                        }
                    }
                }
            }
        }
        Some(cat)
    }
}

fn invalid(message: &'static str) -> IngestError {
    IngestError::new(ErrorCode::InvalidUrl, message)
}

fn provider_error() -> IngestError {
    IngestError::new(
        ErrorCode::NotCatalogue,
        "The provider returned data Kinora could not read.",
    )
}

fn checked_server(raw: &str) -> Result<Url, IngestError> {
    let mut url = fetch::check_url(raw, &Policy::xtream())?;
    if url.query().is_some() || url.fragment().is_some() {
        return Err(invalid(
            "Enter the provider server address without a query or fragment.",
        ));
    }
    url.set_path(&format!("{}/", url.path().trim_end_matches('/')));
    Ok(url)
}

fn valid_login(username: &str, password: &str) -> bool {
    (1..=256).contains(&username.chars().count())
        && (1..=256).contains(&password.chars().count())
        && !username.chars().any(char::is_control)
        && !password.chars().any(char::is_control)
}

fn id(value: &Value) -> Option<String> {
    let id = match value {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        _ => return None,
    };
    (!id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_')))
    .then_some(id)
}

fn text(value: Option<&Value>, max: usize) -> Option<String> {
    let value = value?.as_str()?.trim();
    (!value.is_empty() && value.chars().count() <= max && !value.chars().any(char::is_control))
        .then(|| value.to_owned())
}

fn number(value: Option<&Value>) -> Option<i32> {
    value?
        .as_i64()
        .and_then(|n| i32::try_from(n).ok())
        .or_else(|| value?.as_str()?.parse::<i32>().ok())
}

fn float(value: Option<&Value>) -> Option<f64> {
    let v = value?;
    if let Some(f) = v.as_f64() {
        return Some(f);
    }
    if let Some(s) = v.as_str() {
        return s.trim().parse::<f64>().ok();
    }
    None
}

fn rows(value: &Value) -> Result<&Vec<Value>, IngestError> {
    let rows = value.as_array().ok_or_else(provider_error)?;
    if rows.len() > MAX_ITEMS {
        return Err(IngestError::new(
            ErrorCode::TooManyEntries,
            "The provider returned more than 25,000 items in one catalogue.",
        ));
    }
    Ok(rows)
}

fn extension(value: Option<&Value>) -> String {
    let value = text(value, MAX_EXT).unwrap_or_else(|| "m3u8".to_owned());
    if value.bytes().all(|b| b.is_ascii_alphanumeric()) {
        value.to_ascii_lowercase()
    } else {
        "m3u8".to_owned()
    }
}

pub fn format_xtream_catchup_time(timestamp_secs: i64) -> String {
    let secs = timestamp_secs.max(0);
    let days = secs / 86400;
    let day_secs = secs % 86400;
    let hours = day_secs / 3600;
    let minutes = (day_secs % 3600) / 60;

    let mut y = 1970;
    let mut d = days;
    loop {
        let leap = (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0);
        let days_in_year = if leap { 366 } else { 365 };
        if d < days_in_year {
            break;
        }
        d -= days_in_year;
        y += 1;
    }
    let leap = (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0);
    let days_in_months = [
        31,
        if leap { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    let mut m = 1;
    for &dim in &days_in_months {
        if d < dim {
            break;
        }
        d -= dim;
        m += 1;
    }
    let day = d + 1;
    format!("{:04}-{:02}-{:02}:{:02}-{:02}", y, m, day, hours, minutes)
}

fn parse_category(v: &Value) -> Option<Category> {
    let cat_id = v.get("category_id").and_then(id)?;
    let cat_name = text(v.get("category_name"), MAX_TEXT)?;
    let parent_id = v.get("parent_id").and_then(id);
    Some(Category {
        id: cat_id,
        name: cat_name,
        parent_id,
    })
}

fn parse_categories(val: &Value) -> Vec<Category> {
    let Some(arr) = val.as_array() else {
        return Vec::new();
    };
    arr.iter()
        .filter_map(parse_category)
        .take(MAX_ITEMS)
        .collect()
}

fn parse_user_info(val: Option<&Value>) -> Option<UserInfo> {
    let u = val?;
    let username = text(u.get("username"), 256)?;
    let status = text(u.get("status"), 64).unwrap_or_else(|| "Unknown".to_string());
    let exp_date = text(u.get("exp_date"), 64);
    let is_trial = text(u.get("is_trial"), 16);
    let active_cons = text(u.get("active_cons"), 16);
    let max_connections = text(u.get("max_connections"), 16);
    let created_at = text(u.get("created_at"), 64);
    let auth = u
        .get("auth")
        .and_then(|v| v.as_i64().or_else(|| v.as_str()?.parse().ok()))
        .unwrap_or(0);
    Some(UserInfo {
        username,
        status,
        exp_date,
        is_trial,
        active_cons,
        max_connections,
        created_at,
        auth,
    })
}

fn parse_server_info(val: Option<&Value>) -> Option<ServerInfo> {
    let s = val?;
    Some(ServerInfo {
        url: text(s.get("url"), 256),
        port: text(s.get("port"), 16),
        https_port: text(s.get("https_port"), 16),
        server_protocol: text(s.get("server_protocol"), 16),
        rtmp_port: text(s.get("rtmp_port"), 16),
        timezone: text(s.get("timezone"), 64),
        time_now: text(s.get("time_now"), 64),
    })
}

fn parse_live_stream(
    source_id: &str,
    row: &Value,
    artwork_map: &mut HashMap<String, Url>,
) -> Option<LiveStream> {
    let raw_id = row.get("stream_id").and_then(id)?;
    let name = text(row.get("name"), MAX_TEXT)?;
    let num = row
        .get("num")
        .and_then(|v| v.as_u64().and_then(|n| u32::try_from(n).ok()));
    let stream_type = text(row.get("stream_type"), 64).unwrap_or_else(|| "live".to_string());
    let epg_channel_id = text(row.get("epg_channel_id"), 128);
    let category_id = row.get("category_id").and_then(id);
    let tv_archive = row
        .get("tv_archive")
        .and_then(|v| v.as_u64().and_then(|n| u32::try_from(n).ok()))
        .unwrap_or(0);
    let tv_archive_duration = row
        .get("tv_archive_duration")
        .and_then(|v| v.as_u64().and_then(|n| u32::try_from(n).ok()))
        .unwrap_or(0);
    let artwork_key = format!("{source_id}:live:{raw_id}");

    let stream_icon = text(row.get("stream_icon"), 2048);
    if let Some(ref icon_url) = stream_icon {
        if let Ok(checked) = fetch::check_url(icon_url, &Policy::artwork()) {
            if artwork_map.contains_key(&artwork_key) || artwork_map.len() < MAX_ARTWORK_URLS {
                artwork_map.insert(artwork_key.clone(), checked);
            }
        }
    }

    Some(LiveStream {
        id: raw_id,
        num,
        name,
        stream_type,
        stream_icon,
        epg_channel_id,
        category_id,
        category_ids: Vec::new(),
        tv_archive,
        tv_archive_duration,
        artwork_key,
    })
}

impl Providers {
    pub async fn connect(
        &self,
        source_id: &str,
        server: &str,
        username: &str,
        password: &str,
    ) -> Result<Catalogue, IngestError> {
        if !source_id.starts_with("xt-")
            || source_id.len() <= 3
            || source_id.len() > 48
            || !source_id
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
            || !valid_login(username, password)
        {
            return Err(invalid(
                "Enter a valid provider address, username and password.",
            ));
        }
        let credentials = Credentials {
            server: checked_server(server)?,
            username: username.to_owned(),
            password: password.to_owned(),
        };
        let auth = self.request(&credentials, None).await?;
        let authenticated = auth
            .get("user_info")
            .and_then(|v| v.get("auth"))
            .and_then(|v| v.as_i64().or_else(|| v.as_str()?.parse().ok()))
            == Some(1);
        if !authenticated {
            return Err(IngestError::new(
                ErrorCode::Network,
                "The provider did not accept this login.",
            ));
        }
        let catalogue = self.catalogue_for(source_id, &credentials).await?;
        self.connected
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .insert(source_id.to_owned(), credentials);
        if let Some(ref dir) = self.dir {
            let map = self
                .connected
                .lock()
                .unwrap_or_else(|p| p.into_inner())
                .clone();
            let _ = save_credentials_vault(dir, &map);
        }
        Ok(catalogue)
    }

    pub async fn test_connection(
        &self,
        server: &str,
        username: &str,
        password: &str,
    ) -> Result<XtreamConnectionReport, IngestError> {
        let server_url = checked_server(server)?;
        if !valid_login(username, password) {
            return Ok(XtreamConnectionReport {
                success: false,
                message: "Enter a valid username and password.".to_string(),
                user_info: None,
                server_info: None,
                capabilities: None,
            });
        }
        let credentials = Credentials {
            server: server_url,
            username: username.to_string(),
            password: password.to_string(),
        };

        let auth_val = match self.request(&credentials, None).await {
            Ok(v) => v,
            Err(e) => {
                return Ok(XtreamConnectionReport {
                    success: false,
                    message: format!("Connection failed: {}", e.message),
                    user_info: None,
                    server_info: None,
                    capabilities: None,
                });
            }
        };

        let user_info = parse_user_info(auth_val.get("user_info"));
        let server_info = parse_server_info(auth_val.get("server_info"));

        if user_info.as_ref().map(|u| u.auth).unwrap_or(0) != 1 {
            return Ok(XtreamConnectionReport {
                success: false,
                message: "Authentication rejected by provider. Check your username and password."
                    .to_string(),
                user_info,
                server_info,
                capabilities: None,
            });
        }

        let live_cat = self
            .request(&credentials, Some(("get_live_categories", None)))
            .await
            .unwrap_or(Value::Array(Vec::new()));
        let vod_cat = self
            .request(&credentials, Some(("get_vod_categories", None)))
            .await
            .unwrap_or(Value::Array(Vec::new()));
        let ser_cat = self
            .request(&credentials, Some(("get_series_categories", None)))
            .await
            .unwrap_or(Value::Array(Vec::new()));

        let live_cats = parse_categories(&live_cat);
        let vod_cats = parse_categories(&vod_cat);
        let ser_cats = parse_categories(&ser_cat);

        let live_streams_val = self
            .request(&credentials, Some(("get_live_streams", None)))
            .await
            .unwrap_or(Value::Array(Vec::new()));
        let vod_streams_val = self
            .request(&credentials, Some(("get_vod_streams", None)))
            .await
            .unwrap_or(Value::Array(Vec::new()));
        let series_streams_val = self
            .request(&credentials, Some(("get_series", None)))
            .await
            .unwrap_or(Value::Array(Vec::new()));

        let live_count = live_streams_val.as_array().map(|a| a.len()).unwrap_or(0) as u32;
        let vod_count = vod_streams_val.as_array().map(|a| a.len()).unwrap_or(0) as u32;
        let series_count = series_streams_val.as_array().map(|a| a.len()).unwrap_or(0) as u32;

        let has_epg = live_streams_val
            .as_array()
            .map(|a| {
                a.iter()
                    .any(|s| s.get("epg_channel_id").and_then(|v| v.as_str()).is_some())
            })
            .unwrap_or(false);
        let has_catchup = live_streams_val
            .as_array()
            .map(|a| {
                a.iter()
                    .any(|s| s.get("tv_archive").and_then(|v| v.as_u64()).unwrap_or(0) > 0)
            })
            .unwrap_or(false);

        let capabilities = ProviderCapabilities {
            has_live: live_count > 0 || !live_cats.is_empty(),
            has_vod: vod_count > 0 || !vod_cats.is_empty(),
            has_series: series_count > 0 || !ser_cats.is_empty(),
            has_epg,
            has_catchup,
            live_count,
            vod_count,
            series_count,
            live_categories_count: live_cats.len() as u32,
            vod_categories_count: vod_cats.len() as u32,
            series_categories_count: ser_cats.len() as u32,
        };

        Ok(XtreamConnectionReport {
            success: true,
            message: "Successfully verified provider credentials and capabilities.".to_string(),
            user_info,
            server_info,
            capabilities: Some(capabilities),
        })
    }

    pub async fn catalogue(&self, source_id: &str) -> Result<Catalogue, IngestError> {
        let credentials = self
            .connected
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .get(source_id)
            .cloned()
            .ok_or_else(|| {
                IngestError::new(
                    ErrorCode::Network,
                    "Reconnect to this provider before refreshing its channels and catalogue.",
                )
            })?;
        self.catalogue_for(source_id, &credentials).await
    }

    async fn catalogue_for(
        &self,
        source_id: &str,
        credentials: &Credentials,
    ) -> Result<Catalogue, IngestError> {
        let auth_val = self.request(credentials, None).await.ok();
        let user_info = parse_user_info(auth_val.as_ref().and_then(|v| v.get("user_info")));
        let server_info = parse_server_info(auth_val.as_ref().and_then(|v| v.get("server_info")));

        let live_categories_val = self
            .request(credentials, Some(("get_live_categories", None)))
            .await
            .unwrap_or(Value::Array(Vec::new()));
        let vod_categories_val = self
            .request(credentials, Some(("get_vod_categories", None)))
            .await
            .unwrap_or(Value::Array(Vec::new()));
        let series_categories_val = self
            .request(credentials, Some(("get_series_categories", None)))
            .await
            .unwrap_or(Value::Array(Vec::new()));

        let live_categories = parse_categories(&live_categories_val);
        let vod_categories = parse_categories(&vod_categories_val);
        let series_categories = parse_categories(&series_categories_val);

        let vod_cat_names: HashMap<String, String> = vod_categories
            .iter()
            .map(|c| (c.id.clone(), c.name.clone()))
            .collect();
        let series_cat_names: HashMap<String, String> = series_categories
            .iter()
            .map(|c| (c.id.clone(), c.name.clone()))
            .collect();

        let live_val = self
            .request(credentials, Some(("get_live_streams", None)))
            .await
            .unwrap_or(Value::Array(Vec::new()));
        let mut live_streams = Vec::new();
        if let Some(arr) = live_val.as_array() {
            let mut artwork = self.artwork.lock().unwrap_or_else(|p| p.into_inner());
            for row in arr.iter().take(MAX_ITEMS) {
                if let Some(stream) = parse_live_stream(source_id, row, &mut artwork) {
                    live_streams.push(stream);
                }
            }
        }

        let movies = self
            .request(credentials, Some(("get_vod_streams", None)))
            .await
            .unwrap_or(Value::Array(Vec::new()));
        let series = self
            .request(credentials, Some(("get_series", None)))
            .await
            .unwrap_or(Value::Array(Vec::new()));

        let mut movie_rows = Vec::new();
        let mut series_rows = Vec::new();
        for (kind, value, output, cat_names) in [
            ("movie", &movies, &mut movie_rows, &vod_cat_names),
            ("series", &series, &mut series_rows, &series_cat_names),
        ] {
            let Ok(item_rows) = rows(value) else { continue };
            for row in item_rows {
                let raw_id = row
                    .get(if kind == "movie" {
                        "stream_id"
                    } else {
                        "series_id"
                    })
                    .and_then(id);
                let Some(raw_id) = raw_id else { continue };
                let Some(name) = text(row.get("name"), MAX_TEXT) else {
                    continue;
                };
                let image = if kind == "movie" {
                    "stream_icon"
                } else {
                    "cover"
                };
                let artwork_key = format!("{source_id}:{kind}:{raw_id}");
                if let Some(address) = text(row.get(image), 2_048)
                    .and_then(|s| fetch::check_url(&s, &Policy::artwork()).ok())
                {
                    let mut artwork = self.artwork.lock().unwrap_or_else(|p| p.into_inner());
                    if artwork.contains_key(&artwork_key) || artwork.len() < MAX_ARTWORK_URLS {
                        artwork.insert(artwork_key.clone(), address);
                    }
                }
                let cat_id = row.get("category_id").and_then(id);
                let cat_name = cat_id.as_ref().and_then(|c| cat_names.get(c)).cloned();
                let icon_url = text(row.get(image), 2_048);
                output.push(Entry {
                    id: raw_id,
                    name,
                    category_id: cat_id,
                    category_name: cat_name,
                    year: number(row.get("year").or_else(|| row.get("releaseDate"))),
                    rating: float(row.get("rating")),
                    plot: text(row.get("plot"), 8_192),
                    extension: extension(row.get("container_extension")),
                    artwork_key,
                    icon_url,
                });
            }
        }

        let has_live = !live_streams.is_empty();
        let has_vod = !movie_rows.is_empty();
        let has_series = !series_rows.is_empty();
        let has_epg = live_streams.iter().any(|s| s.epg_channel_id.is_some());
        let has_catchup = live_streams.iter().any(|s| s.tv_archive > 0);

        let capabilities = ProviderCapabilities {
            has_live,
            has_vod,
            has_series,
            has_epg,
            has_catchup,
            live_count: live_streams.len() as u32,
            vod_count: movie_rows.len() as u32,
            series_count: series_rows.len() as u32,
            live_categories_count: live_categories.len() as u32,
            vod_categories_count: vod_categories.len() as u32,
            series_categories_count: series_categories.len() as u32,
        };

        let catalogue = Catalogue {
            movies: movie_rows,
            series: series_rows,
            live_streams,
            live_categories,
            vod_categories,
            series_categories,
            user_info,
            server_info,
            capabilities: Some(capabilities),
        };
        self.write_cache(source_id, &catalogue);
        Ok(catalogue)
    }

    pub fn get_stream_url(
        &self,
        source_id: &str,
        stream_type: &str,
        item_id: &str,
        extension: Option<&str>,
    ) -> Result<Url, IngestError> {
        let creds = self
            .connected
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .get(source_id)
            .cloned()
            .ok_or_else(|| {
                IngestError::new(
                    ErrorCode::Network,
                    "Provider is not connected. Reconnect before playing.",
                )
            })?;

        if !["live", "movie", "series"].contains(&stream_type) {
            return Err(invalid("Unsupported stream type."));
        }
        if item_id.is_empty()
            || item_id.len() > 128
            || !item_id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        {
            return Err(invalid("Invalid stream identifier."));
        }

        let ext = match extension {
            Some(e)
                if !e.is_empty()
                    && e.len() <= 12
                    && e.chars().all(|c| c.is_ascii_alphanumeric()) =>
            {
                e
            }
            _ => {
                if stream_type == "live" {
                    "m3u8"
                } else {
                    "mp4"
                }
            }
        };

        let path = format!(
            "{}/{}/{}/{}.{}",
            stream_type, creds.username, creds.password, item_id, ext
        );
        let mut url = creds.server.clone();
        url.set_path(&format!("{}{}", url.path(), path));
        Ok(url)
    }

    pub fn get_catchup_url(
        &self,
        source_id: &str,
        stream_id: &str,
        start_timestamp: i64,
        duration_mins: u32,
    ) -> Result<Url, IngestError> {
        let creds = self
            .connected
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .get(source_id)
            .cloned()
            .ok_or_else(|| {
                IngestError::new(
                    ErrorCode::Network,
                    "Provider is not connected. Reconnect before playing.",
                )
            })?;

        if stream_id.is_empty()
            || stream_id.len() > 128
            || !stream_id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        {
            return Err(invalid("Invalid stream identifier."));
        }

        if !(1..=1440).contains(&duration_mins) {
            return Err(invalid("Duration must be between 1 minute and 24 hours."));
        }

        let time_str = format_xtream_catchup_time(start_timestamp);
        let path = format!(
            "timeshift/{}/{}/{}/{}/{}.m3u8",
            creds.username, creds.password, duration_mins, time_str, stream_id
        );
        let mut url = creds.server.clone();
        let base_path = url.path().trim_end_matches('/');
        let full_path = if base_path.is_empty() {
            format!("/{}", path)
        } else {
            format!("{}/{}", base_path, path)
        };
        url.set_path(&full_path);
        Ok(url)
    }

    pub async fn vod_details(
        &self,
        source_id: &str,
        vod_id: &str,
    ) -> Result<MovieDetails, IngestError> {
        if id(&Value::String(vod_id.to_string())).is_none() {
            return Err(invalid("That movie identifier is not valid."));
        }
        let creds = self
            .connected
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .get(source_id)
            .cloned()
            .ok_or_else(|| {
                IngestError::new(
                    ErrorCode::Network,
                    "Reconnect to this provider before loading movie details.",
                )
            })?;

        let val = self
            .request(&creds, Some(("get_vod_info", Some(("vod_id", vod_id)))))
            .await?;

        let info = val.get("info");
        let movie_data = val.get("movie_data");

        let name = info
            .and_then(|i| text(i.get("name"), MAX_TEXT))
            .or_else(|| movie_data.and_then(|m| text(m.get("name"), MAX_TEXT)))
            .unwrap_or_else(|| "Unknown".to_string());

        let artwork_key = format!("{source_id}:movie:{vod_id}");
        let stream_icon = info.and_then(|i| text(i.get("movie_image"), 2048));
        if let Some(ref icon_url) = stream_icon {
            if let Ok(checked) = fetch::check_url(icon_url, &Policy::artwork()) {
                let mut artwork = self.artwork.lock().unwrap_or_else(|p| p.into_inner());
                if artwork.contains_key(&artwork_key) || artwork.len() < MAX_ARTWORK_URLS {
                    artwork.insert(artwork_key.clone(), checked);
                }
            }
        }

        let backdrop = info.and_then(|i| {
            i.get("backdrop_path")
                .and_then(|b| b.as_array())
                .and_then(|arr| arr.first())
                .and_then(|v| text(Some(v), 2048))
        });

        let ext = movie_data
            .and_then(|m| m.get("container_extension"))
            .map(|e| extension(Some(e)))
            .unwrap_or_else(|| "mp4".to_string());

        let rating = info.and_then(|i| float(i.get("rating")));

        Ok(MovieDetails {
            id: vod_id.to_string(),
            name,
            plot: info.and_then(|i| text(i.get("plot"), 8192)),
            cast: info.and_then(|i| text(i.get("cast"), 2048)),
            director: info.and_then(|i| text(i.get("director"), 1024)),
            genre: info.and_then(|i| text(i.get("genre"), 512)),
            release_date: info.and_then(|i| text(i.get("release_date"), 64)),
            duration_secs: info
                .and_then(|i| number(i.get("duration_secs")))
                .and_then(|n| u32::try_from(n).ok()),
            rating,
            backdrop,
            stream_icon,
            container_extension: ext,
            artwork_key,
        })
    }

    pub async fn channel_epg(
        &self,
        source_id: &str,
        stream_id: &str,
    ) -> Result<Vec<EpgListing>, IngestError> {
        if id(&Value::String(stream_id.to_string())).is_none() {
            return Err(invalid("That stream identifier is not valid."));
        }
        let creds = self
            .connected
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .get(source_id)
            .cloned()
            .ok_or_else(|| {
                IngestError::new(
                    ErrorCode::Network,
                    "Reconnect to this provider before loading guide listings.",
                )
            })?;

        let val = self
            .request(
                &creds,
                Some(("get_short_epg", Some(("stream_id", stream_id)))),
            )
            .await?;

        let Some(listings_val) = val.get("epg_listings").and_then(|v| v.as_array()) else {
            return Ok(Vec::new());
        };

        let mut results = Vec::new();
        for item in listings_val.iter().take(50) {
            let Some(epg_id) = item.get("id").and_then(id) else {
                continue;
            };
            let Some(title) = text(item.get("title"), MAX_TEXT) else {
                continue;
            };
            let start = text(item.get("start"), 64).unwrap_or_default();
            let end = text(item.get("end"), 64).unwrap_or_default();
            let description = text(item.get("description"), 8192);
            let channel_id = text(item.get("channel_id"), 128);
            let start_ts = item
                .get("start_timestamp")
                .and_then(|v| v.as_i64().or_else(|| v.as_str()?.parse().ok()));
            let stop_ts = item
                .get("stop_timestamp")
                .and_then(|v| v.as_i64().or_else(|| v.as_str()?.parse().ok()));

            results.push(EpgListing {
                id: epg_id,
                epg_id: channel_id.clone(),
                title,
                lang: text(item.get("lang"), 16),
                start,
                end,
                description,
                channel_id,
                start_timestamp: start_ts,
                stop_timestamp: stop_ts,
            });
        }

        Ok(results)
    }

    pub async fn series_details(
        &self,
        source_id: &str,
        series_id: &str,
    ) -> Result<SeriesDetails, IngestError> {
        if id(&Value::String(series_id.to_owned())).is_none() {
            return Err(invalid("That series identifier is not valid."));
        }
        let credentials = self
            .connected
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .get(source_id)
            .cloned()
            .ok_or_else(|| {
                IngestError::new(
                    ErrorCode::Network,
                    "Reconnect to this provider to load series episodes.",
                )
            })?;
        let data = self
            .request(
                &credentials,
                Some(("get_series_info", Some(("series_id", series_id)))),
            )
            .await?;
        let mut seasons = Vec::new();
        let episodes = data
            .get("episodes")
            .and_then(Value::as_object)
            .ok_or_else(provider_error)?;
        if episodes.len() > 200 {
            return Err(IngestError::new(
                ErrorCode::TooManyEntries,
                "The provider returned too many seasons for this series.",
            ));
        }
        let mut total_episodes = 0usize;
        for (season_key, values) in episodes {
            let Ok(season_number) = season_key.parse::<u32>() else {
                continue;
            };
            let values = rows(values)?;
            total_episodes = total_episodes.saturating_add(values.len());
            if total_episodes > MAX_ITEMS {
                return Err(IngestError::new(
                    ErrorCode::TooManyEntries,
                    "The provider returned more than 25,000 episodes for this series.",
                ));
            }
            let mut season = Vec::new();
            for value in values {
                let Some(episode_id) = value.get("id").and_then(id) else {
                    continue;
                };
                let Some(title) = text(value.get("title"), MAX_TEXT) else {
                    continue;
                };
                let info = value.get("info");
                let artwork_key = format!("{source_id}:episode:{episode_id}");
                if let Some(address) = info
                    .and_then(|v| text(v.get("movie_image"), 2_048))
                    .and_then(|s| fetch::check_url(&s, &Policy::artwork()).ok())
                {
                    let mut artwork = self.artwork.lock().unwrap_or_else(|p| p.into_inner());
                    if artwork.contains_key(&artwork_key) || artwork.len() < MAX_ARTWORK_URLS {
                        artwork.insert(artwork_key.clone(), address);
                    }
                }
                season.push(Episode {
                    id: episode_id,
                    number: number(value.get("episode_num"))
                        .and_then(|n| u32::try_from(n).ok())
                        .unwrap_or(0),
                    title,
                    plot: info.and_then(|v| text(v.get("plot"), 8_192)),
                    runtime_seconds: info
                        .and_then(|v| number(v.get("duration_secs")))
                        .and_then(|n| u32::try_from(n).ok()),
                    extension: extension(value.get("container_extension")),
                    artwork_key,
                });
            }
            if !season.is_empty() {
                seasons.push(Season {
                    number: season_number,
                    episodes: season,
                });
            }
        }
        seasons.sort_by_key(|s| s.number);
        Ok(SeriesDetails {
            plot: data.get("info").and_then(|v| text(v.get("plot"), 8_192)),
            seasons,
        })
    }

    pub async fn artwork(
        &self,
        key: &str,
        store: &crate::artwork::ArtworkStore,
    ) -> Result<Option<(String, Vec<u8>)>, IngestError> {
        if key.len() > 256
            || !key
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b':' | b'-' | b'_'))
        {
            return Ok(None);
        }
        let address = self
            .artwork
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .get(key)
            .map(|u| u.as_str().to_owned());
        let res = store.get_or_fetch_artwork(key, address.as_deref()).await?;
        Ok(res.map(|a| (a.mime_type.to_owned(), a.bytes)))
    }

    async fn request(
        &self,
        credentials: &Credentials,
        action: Option<(&str, Option<(&str, &str)>)>,
    ) -> Result<Value, IngestError> {
        let mut url = credentials
            .server
            .join("player_api.php")
            .map_err(|_| invalid("Enter a valid provider server address."))?;
        {
            let mut query = url.query_pairs_mut();
            query
                .append_pair("username", &credentials.username)
                .append_pair("password", &credentials.password);
            if let Some((action, extra)) = action {
                query.append_pair("action", action);
                if let Some((key, value)) = extra {
                    query.append_pair(key, value);
                }
            }
        }
        let _permit = REQUESTS
            .acquire()
            .await
            .map_err(|_| IngestError::new(ErrorCode::Busy, "Provider is busy. Try again later."))?;
        let (bytes, _) =
            fetch::download_bytes(url.as_str(), &Policy::xtream(), "application/json").await?;
        serde_json::from_slice(&bytes).map_err(|_| provider_error())
    }

    pub fn disconnect(&self, source_id: &str) {
        self.connected
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .remove(source_id);
        self.artwork
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .retain(|key, _| !key.starts_with(&format!("{source_id}:")));
        if let Some(dir) = self.dir.as_ref() {
            let map = self
                .connected
                .lock()
                .unwrap_or_else(|p| p.into_inner())
                .clone();
            let _ = save_credentials_vault(dir, &map);
            let _ = fs::remove_file(dir.join(format!("xtream-{source_id}.json")));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn server_address_validation_and_normalization() {
        let valid = checked_server("http://example.com:8080/path").unwrap();
        assert_eq!(valid.as_str(), "http://example.com:8080/path/");

        assert!(checked_server("http://example.com?token=123").is_err());
        assert!(checked_server("http://example.com#section").is_err());
    }

    #[test]
    fn login_validation_enforces_boundaries() {
        assert!(valid_login("user123", "pass456"));
        assert!(!valid_login("", "pass456"));
        assert!(!valid_login("user", ""));
        assert!(!valid_login("user\nnewline", "pass"));
        assert!(!valid_login("user", "pass\0null"));
    }

    #[test]
    fn parses_user_and_server_info() {
        let user_json = serde_json::json!({
            "username": "tester",
            "status": "Active",
            "exp_date": "1735689600",
            "is_trial": "0",
            "active_cons": "1",
            "max_connections": "2",
            "auth": 1
        });
        let user_info = parse_user_info(Some(&user_json)).unwrap();
        assert_eq!(user_info.username, "tester");
        assert_eq!(user_info.status, "Active");
        assert_eq!(user_info.auth, 1);
        assert_eq!(user_info.max_connections, Some("2".to_string()));

        let server_json = serde_json::json!({
            "url": "iptv.example.com",
            "port": "8080",
            "server_protocol": "http",
            "timezone": "Europe/London",
            "time_now": "2026-11-15 00:00:00"
        });
        let server_info = parse_server_info(Some(&server_json)).unwrap();
        assert_eq!(server_info.url, Some("iptv.example.com".to_string()));
        assert_eq!(server_info.timezone, Some("Europe/London".to_string()));
    }

    #[test]
    fn parses_categories_cleanly() {
        let cat_json = serde_json::json!([
            { "category_id": "1", "category_name": "Entertainment", "parent_id": 0 },
            { "category_id": "2", "category_name": "Sports" }
        ]);
        let cats = parse_categories(&cat_json);
        assert_eq!(cats.len(), 2);
        assert_eq!(cats[0].name, "Entertainment");
        assert_eq!(cats[1].name, "Sports");
    }

    #[test]
    fn parses_live_streams_and_artwork() {
        let stream_json = serde_json::json!({
            "num": 1,
            "name": "Sky News UK",
            "stream_type": "live",
            "stream_id": 1001,
            "stream_icon": "http://example.com/art/skynews.png",
            "epg_channel_id": "skynews.uk",
            "category_id": "1",
            "tv_archive": 1,
            "tv_archive_duration": 3
        });
        let mut artwork_map = HashMap::new();
        let stream = parse_live_stream("xt-test", &stream_json, &mut artwork_map).unwrap();
        assert_eq!(stream.id, "1001");
        assert_eq!(stream.name, "Sky News UK");
        assert_eq!(stream.tv_archive, 1);
        assert_eq!(stream.tv_archive_duration, 3);
        assert_eq!(stream.epg_channel_id, Some("skynews.uk".to_string()));
        assert_eq!(stream.artwork_key, "xt-test:live:1001");
    }

    #[test]
    fn generates_stream_url_safely() {
        let providers = Providers::new(None);
        let creds = Credentials {
            server: checked_server("http://example.com:8080/").unwrap(),
            username: "myuser".to_string(),
            password: "mypassword".to_string(),
        };
        providers
            .connected
            .lock()
            .unwrap()
            .insert("xt-test".to_string(), creds);

        let live_url = providers
            .get_stream_url("xt-test", "live", "1001", None)
            .unwrap();
        assert_eq!(
            live_url.as_str(),
            "http://example.com:8080/live/myuser/mypassword/1001.m3u8"
        );

        let movie_url = providers
            .get_stream_url("xt-test", "movie", "2002", Some("mp4"))
            .unwrap();
        assert_eq!(
            movie_url.as_str(),
            "http://example.com:8080/movie/myuser/mypassword/2002.mp4"
        );

        let series_url = providers
            .get_stream_url("xt-test", "series", "3003", Some("mkv"))
            .unwrap();
        assert_eq!(
            series_url.as_str(),
            "http://example.com:8080/series/myuser/mypassword/3003.mkv"
        );

        // Refuses bad input
        assert!(providers
            .get_stream_url("xt-test", "unsupported", "1001", None)
            .is_err());
        assert!(providers
            .get_stream_url("xt-test", "live", "bad/id", None)
            .is_err());
        assert!(providers
            .get_stream_url("xt-notconnected", "live", "1001", None)
            .is_err());
    }

    struct TempDir(PathBuf);
    impl TempDir {
        fn new(tag: &str) -> Self {
            let mut bytes = [0u8; 8];
            getrandom::fill(&mut bytes).unwrap();
            let path = std::env::temp_dir().join(format!(
                "kinora-xtream-{tag}-{}",
                bytes.iter().map(|b| format!("{b:02x}")).collect::<String>()
            ));
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }

        fn path(&self) -> &std::path::Path {
            &self.0
        }
    }
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn cache_round_trip_for_full_provider_catalogue() {
        let tmp = TempDir::new("roundtrip");
        let providers = Providers::new(Some(tmp.0.clone()));

        let catalogue = Catalogue {
            movies: vec![Entry {
                id: "201".to_string(),
                name: "Test Film".to_string(),
                category_id: Some("1".to_string()),
                category_name: Some("Drama".to_string()),
                year: Some(2025),
                rating: Some(8.5),
                plot: Some("A gripping story.".to_string()),
                extension: "mp4".to_string(),
                artwork_key: "xt-p1:movie:201".to_string(),
                icon_url: Some("https://images.example.com/movie.jpg".to_string()),
            }],
            series: vec![],
            live_streams: vec![LiveStream {
                id: "101".to_string(),
                num: Some(1),
                name: "BBC One".to_string(),
                stream_type: "live".to_string(),
                stream_icon: None,
                epg_channel_id: Some("bbcone.uk".to_string()),
                category_id: Some("1".to_string()),
                category_ids: vec![],
                tv_archive: 1,
                tv_archive_duration: 7,
                artwork_key: "xt-p1:live:101".to_string(),
            }],
            live_categories: vec![Category {
                id: "1".to_string(),
                name: "UK Channels".to_string(),
                parent_id: None,
            }],
            vod_categories: vec![Category {
                id: "1".to_string(),
                name: "Drama".to_string(),
                parent_id: None,
            }],
            series_categories: vec![],
            user_info: Some(UserInfo {
                username: "alice".to_string(),
                status: "Active".to_string(),
                exp_date: Some("1735689600".to_string()),
                is_trial: Some("0".to_string()),
                active_cons: Some("1".to_string()),
                max_connections: Some("2".to_string()),
                created_at: Some("1672531200".to_string()),
                auth: 1,
            }),
            server_info: Some(ServerInfo {
                url: Some("provider.tv".to_string()),
                port: Some("80".to_string()),
                https_port: Some("443".to_string()),
                server_protocol: Some("https".to_string()),
                rtmp_port: None,
                timezone: Some("UTC".to_string()),
                time_now: Some("2026-11-15 00:00:00".to_string()),
            }),
            capabilities: Some(ProviderCapabilities {
                has_live: true,
                has_vod: true,
                has_series: false,
                has_epg: true,
                has_catchup: true,
                live_count: 1,
                vod_count: 1,
                series_count: 0,
                live_categories_count: 1,
                vod_categories_count: 1,
                series_categories_count: 0,
            }),
        };

        providers.write_cache("xt-test", &catalogue);
        let loaded = providers.load_cache("xt-test").unwrap();
        assert_eq!(loaded.movies.len(), 1);
        assert_eq!(loaded.live_streams.len(), 1);
        assert_eq!(loaded.live_categories.len(), 1);
        assert!(loaded.capabilities.as_ref().unwrap().has_live);
        assert!(loaded.capabilities.as_ref().unwrap().has_catchup);
    }

    #[test]
    fn credentials_vault_encryption_roundtrip() {
        let temp = TempDir::new("xtream-vault-test");
        let _providers = Providers::new(Some(temp.path().to_path_buf()));

        let mut map = HashMap::new();
        map.insert(
            "xt-secure-1".to_string(),
            Credentials {
                server: Url::parse("https://provider.example:8080/").unwrap(),
                username: "alice_vault".to_string(),
                password: "secret_password_123".to_string(),
            },
        );

        save_credentials_vault(temp.path(), &map).unwrap();

        let vault_file = temp.path().join(VAULT_FILE);
        let salt_file = temp.path().join(SALT_FILE);
        assert!(vault_file.exists());
        assert!(salt_file.exists());

        // Ensure plaintext credentials never appear in the stored vault file
        let raw_vault = fs::read_to_string(&vault_file).unwrap();
        assert!(!raw_vault.contains("alice_vault"));
        assert!(!raw_vault.contains("secret_password_123"));

        // New Providers instance simulates application restart
        let restored_providers = Providers::new(Some(temp.path().to_path_buf()));
        assert!(restored_providers.is_connected("xt-secure-1"));
        assert!(!restored_providers.is_connected("xt-unknown"));

        let stream_url = restored_providers
            .get_stream_url("xt-secure-1", "movie", "5005", Some("m3u8"))
            .unwrap();
        assert_eq!(
            stream_url.as_str(),
            "https://provider.example:8080/movie/alice_vault/secret_password_123/5005.m3u8"
        );
    }

    #[test]
    fn credentials_vault_tamper_fails_safely() {
        let temp = TempDir::new("xtream-tamper-test");
        let mut map = HashMap::new();
        map.insert(
            "xt-tamper".to_string(),
            Credentials {
                server: Url::parse("https://tamper.example/").unwrap(),
                username: "user".to_string(),
                password: "pass".to_string(),
            },
        );
        save_credentials_vault(temp.path(), &map).unwrap();

        // Corrupt the vault file
        let vault_file = temp.path().join(VAULT_FILE);
        fs::write(&vault_file, b"corrupted payload").unwrap();

        let loaded = load_credentials_vault(temp.path());
        assert!(loaded.is_empty());
    }

    #[test]
    fn credentials_vault_removal_on_disconnect() {
        let temp = TempDir::new("xtream-disconnect-test");
        let providers = Providers::new(Some(temp.path().to_path_buf()));
        providers.connected.lock().unwrap().insert(
            "xt-removable".to_string(),
            Credentials {
                server: Url::parse("https://remove.example/").unwrap(),
                username: "u".to_string(),
                password: "p".to_string(),
            },
        );
        let current_map = providers.connected.lock().unwrap().clone();
        save_credentials_vault(temp.path(), &current_map).unwrap();
        assert!(providers.is_connected("xt-removable"));

        providers.disconnect("xt-removable");
        assert!(!providers.is_connected("xt-removable"));

        // Verify across restart
        let restart_providers = Providers::new(Some(temp.path().to_path_buf()));
        assert!(!restart_providers.is_connected("xt-removable"));
    }

    #[test]
    fn xtream_catchup_url_generation() {
        let temp = TempDir::new("xtream-catchup-test");
        let providers = Providers::new(Some(temp.path().to_path_buf()));
        providers.connected.lock().unwrap().insert(
            "xt-catchup".to_string(),
            Credentials {
                server: Url::parse("https://provider.example:8080/").unwrap(),
                username: "alice".to_string(),
                password: "secret".to_string(),
            },
        );

        // Test time formatting for fixed timestamp (1731636000 is 2024-11-15 02:00:00 UTC)
        let formatted = format_xtream_catchup_time(1731636000);
        assert_eq!(formatted, "2024-11-15:02-00");

        let catchup_url = providers
            .get_catchup_url("xt-catchup", "1001", 1731636000, 60)
            .unwrap();
        assert_eq!(
            catchup_url.as_str(),
            "https://provider.example:8080/timeshift/alice/secret/60/2024-11-15:02-00/1001.m3u8"
        );
    }
}
