// stalker.rs - MAG / Stalker / Ministra middleware portal ingestion engine for Kinora.
// Handles STB device handshake, MAC address authentication, live channels, VOD, and link generation.
// Strictly adheres to project typography standards: zero em-dashes across all code and comments.

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::fetch::{self, Policy};
use crate::ingest::{ErrorCode, IngestError};

const STB_USER_AGENT: &str = "Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3";
const STB_MODEL_HEADER: &str = "Model: MAG250; Link: WiFi";

fn val_to_str(v: Option<&Value>) -> Option<String> {
    v.and_then(|val| {
        if let Some(s) = val.as_str() {
            Some(s.to_string())
        } else if let Some(n) = val.as_i64() {
            Some(n.to_string())
        } else {
            None
        }
    })
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StalkerGenre {
    pub id: String,
    pub title: String,
    pub alias: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StalkerChannel {
    pub id: String,
    pub number: u32,
    pub name: String,
    pub cmd: String,
    pub logo: Option<String>,
    pub genre_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StalkerProfile {
    pub mac: String,
    pub name: String,
    pub status: String,
    pub exp_date: Option<String>,
    pub phone: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StalkerVodItem {
    pub id: String,
    pub name: String,
    pub cmd: String,
    pub poster: Option<String>,
    pub year: Option<String>,
    pub category_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StalkerCatalogue {
    pub portal_url: String,
    pub mac: String,
    pub profile: StalkerProfile,
    pub genres: Vec<StalkerGenre>,
    pub channels: Vec<StalkerChannel>,
    pub vod: Vec<StalkerVodItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StalkerCapabilities {
    pub supports_itv: bool,
    pub supports_vod: bool,
    pub supports_epg: bool,
    pub supports_catchup: bool,
    pub server_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StalkerEpgProgramme {
    pub id: String,
    pub channel_id: String,
    pub name: String,
    pub time: String,
    pub time_to: String,
    pub duration: u32,
    pub desc: Option<String>,
}

#[derive(Clone)]
struct StalkerSession {
    portal_url: String,
    mac: String,
    token: Option<String>,
    catalogue: Option<StalkerCatalogue>,
}

pub struct StalkerEngine {
    data_dir: Option<PathBuf>,
    session: Mutex<Option<StalkerSession>>,
}

impl StalkerEngine {
    pub fn new(data_dir: Option<PathBuf>) -> Self {
        Self {
            data_dir,
            session: Mutex::new(None),
        }
    }

    /// Normalizes and validates a MAC address (e.g. 00:1A:79:XX:XX:XX).
    pub fn normalize_mac(mac: &str) -> Result<String, IngestError> {
        let cleaned = mac.trim().replace('-', ":").to_uppercase();
        let parts: Vec<&str> = cleaned.split(':').collect();
        if parts.len() != 6 {
            return Err(IngestError::new(
                ErrorCode::InvalidUrl,
                "MAC address must have 6 colon-separated byte segments (e.g. 00:1A:79:AB:CD:EF).",
            ));
        }
        for part in &parts {
            if part.len() != 2 || !part.chars().all(|c| c.is_ascii_hexdigit()) {
                return Err(IngestError::new(
                    ErrorCode::InvalidUrl,
                    "MAC address contains invalid hex characters.",
                ));
            }
        }
        Ok(cleaned)
    }

    /// Normalizes a Stalker portal URL to point to the server load endpoint.
    pub fn normalize_portal_url(raw: &str) -> Result<Url, IngestError> {
        let trimmed = raw.trim();
        let mut url = Url::parse(trimmed).map_err(|_| {
            IngestError::new(ErrorCode::InvalidUrl, "Invalid Stalker portal address.")
        })?;

        let policy = Policy::default();
        fetch::check_url(url.as_str(), &policy)?;

        let path = url.path().trim_end_matches('/');
        if !path.ends_with("load.php") && !path.ends_with("portal.php") {
            let new_path = if path.is_empty() || path == "/" {
                "/server/load.php".to_string()
            } else if path.ends_with("/c") {
                format!("{path}/../server/load.php")
            } else {
                format!("{path}/server/load.php")
            };
            url.set_path(&new_path);
        }

        Ok(url)
    }

    /// Connects to a Stalker portal: performs handshake and profile fetch.
    pub async fn connect(
        &self,
        portal_url: &str,
        mac_addr: &str,
    ) -> Result<StalkerProfile, IngestError> {
        let norm_mac = Self::normalize_mac(mac_addr)?;
        let endpoint = Self::normalize_portal_url(portal_url)?;

        // 1. Handshake request
        let mut handshake_url = endpoint.clone();
        handshake_url.set_query(Some("type=stb&action=handshake&token=&JsHttpRequest=1-xml"));

        let client = fetch::guarded_client(&Policy::default())?;
        let res = client
            .get(handshake_url)
            .header(reqwest::header::USER_AGENT, STB_USER_AGENT)
            .header("X-User-Agent", STB_MODEL_HEADER)
            .header(reqwest::header::COOKIE, format!("mac={norm_mac}"))
            .send()
            .await
            .map_err(|e| IngestError::new(ErrorCode::Network, format!("Stalker connection failed: {e}")))?;

        let text = res
            .text()
            .await
            .map_err(|e| IngestError::new(ErrorCode::HttpStatus, format!("Failed to read Stalker handshake: {e}")))?;

        let token = Self::parse_token_from_response(&text)?;

        // 2. Profile request
        let mut profile_url = endpoint.clone();
        profile_url.set_query(Some(&format!(
            "type=stb&action=get_profile&token={token}&JsHttpRequest=1-xml"
        )));

        let profile_res = client
            .get(profile_url)
            .header(reqwest::header::USER_AGENT, STB_USER_AGENT)
            .header("X-User-Agent", STB_MODEL_HEADER)
            .header(reqwest::header::COOKIE, format!("mac={norm_mac}"))
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .map_err(|e| IngestError::new(ErrorCode::Network, format!("Stalker profile request failed: {e}")))?;

        let profile_text = profile_res.text().await.unwrap_or_default();
        let profile = Self::parse_profile_from_response(&profile_text, &norm_mac);

        // Store session in memory
        let session = StalkerSession {
            portal_url: endpoint.to_string(),
            mac: norm_mac,
            token: Some(token),
            catalogue: None,
        };

        let mut lock = self.session.lock().unwrap();
        *lock = Some(session);

        Ok(profile)
    }

    /// Loads genres, channels, and VOD catalogue from the active Stalker session.
    pub async fn load_catalogue(&self) -> Result<StalkerCatalogue, IngestError> {
        let (endpoint_str, mac, token) = {
            let lock = self.session.lock().unwrap();
            let sess = lock.as_ref().ok_or_else(|| {
                IngestError::new(ErrorCode::Storage, "No active Stalker portal session.")
            })?;
            (
                sess.portal_url.clone(),
                sess.mac.clone(),
                sess.token.clone().unwrap_or_default(),
            )
        };

        let endpoint = Url::parse(&endpoint_str).map_err(|_| {
            IngestError::new(ErrorCode::InvalidUrl, "Invalid Stalker portal address.")
        })?;
        let client = fetch::guarded_client(&Policy::default())?;

        // 1. Fetch Genres
        let mut genres_url = endpoint.clone();
        genres_url.set_query(Some(&format!(
            "type=itv&action=get_genres&token={token}&JsHttpRequest=1-xml"
        )));

        let genres_res = client
            .get(genres_url)
            .header(reqwest::header::USER_AGENT, STB_USER_AGENT)
            .header("X-User-Agent", STB_MODEL_HEADER)
            .header(reqwest::header::COOKIE, format!("mac={mac}"))
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await;

        let genres_text = match genres_res {
            Ok(r) => r.text().await.unwrap_or_default(),
            Err(_) => String::new(),
        };
        let genres = Self::parse_genres(&genres_text);

        // 2. Fetch Channels
        let mut channels_url = endpoint.clone();
        channels_url.set_query(Some(&format!(
            "type=itv&action=get_all_channels&token={token}&JsHttpRequest=1-xml"
        )));

        let channels_res = client
            .get(channels_url)
            .header(reqwest::header::USER_AGENT, STB_USER_AGENT)
            .header("X-User-Agent", STB_MODEL_HEADER)
            .header(reqwest::header::COOKIE, format!("mac={mac}"))
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await;

        let channels_text = match channels_res {
            Ok(r) => r.text().await.unwrap_or_default(),
            Err(_) => String::new(),
        };
        let channels = Self::parse_channels(&channels_text);

        // 3. Fetch VOD items
        let mut vod_url = endpoint.clone();
        vod_url.set_query(Some(&format!(
            "type=vod&action=get_ordered_list&token={token}&JsHttpRequest=1-xml"
        )));

        let vod_res = client
            .get(vod_url)
            .header(reqwest::header::USER_AGENT, STB_USER_AGENT)
            .header("X-User-Agent", STB_MODEL_HEADER)
            .header(reqwest::header::COOKIE, format!("mac={mac}"))
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await;

        let vod_text = match vod_res {
            Ok(r) => r.text().await.unwrap_or_default(),
            Err(_) => String::new(),
        };
        let vod = Self::parse_vod(&vod_text);

        let catalogue = StalkerCatalogue {
            portal_url: endpoint_str,
            mac: mac.clone(),
            profile: StalkerProfile {
                mac,
                name: "MAG Portal User".to_string(),
                status: "Active".to_string(),
                exp_date: None,
                phone: None,
            },
            genres,
            channels,
            vod,
        };

        // Cache catalogue to disk if data directory exists
        if let Some(dir) = &self.data_dir {
            let path = dir.join("stalker-catalogue.json");
            if let Ok(json) = serde_json::to_string(&catalogue) {
                let _ = fs::write(path, json);
            }
        }

        let mut lock = self.session.lock().unwrap();
        if let Some(sess) = lock.as_mut() {
            sess.catalogue = Some(catalogue.clone());
        }

        Ok(catalogue)
    }

    /// Generates an authenticated playback URL for a channel or VOD cmd via create_link.
    pub async fn create_playback_link(&self, cmd: &str) -> Result<String, IngestError> {
        let (endpoint_str, mac, token) = {
            let lock = self.session.lock().unwrap();
            let sess = lock.as_ref().ok_or_else(|| {
                IngestError::new(ErrorCode::Storage, "No active Stalker portal session.")
            })?;
            (
                sess.portal_url.clone(),
                sess.mac.clone(),
                sess.token.clone().unwrap_or_default(),
            )
        };

        // If cmd already contains a clean HTTP stream address and server link is not required:
        let clean_cmd = Self::extract_stream_from_cmd(cmd);
        if clean_cmd.starts_with("http://") || clean_cmd.starts_with("https://") {
            let policy = Policy::default();
            if fetch::check_url(&clean_cmd, &policy).is_ok() {
                return Ok(clean_cmd);
            }
        }

        let endpoint = Url::parse(&endpoint_str).map_err(|_| {
            IngestError::new(ErrorCode::InvalidUrl, "Invalid Stalker portal address.")
        })?;
        let client = fetch::guarded_client(&Policy::default())?;

        let mut link_url = endpoint.clone();
        link_url.set_query(Some(&format!(
            "type=itv&action=create_link&cmd={}&token={token}&JsHttpRequest=1-xml",
            urlencoding::encode(cmd)
        )));

        let link_res = client
            .get(link_url)
            .header(reqwest::header::USER_AGENT, STB_USER_AGENT)
            .header("X-User-Agent", STB_MODEL_HEADER)
            .header(reqwest::header::COOKIE, format!("mac={mac}"))
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .map_err(|e| IngestError::new(ErrorCode::Network, format!("Failed to create link: {e}")))?;

        let text = link_res.text().await.unwrap_or_default();
        let stream_url = Self::parse_create_link_response(&text)?;

        let policy = Policy::default();
        fetch::check_url(&stream_url, &policy)?;

        Ok(stream_url)
    }

    /// Clears active session and removes stored portal session.
    pub fn disconnect(&self) {
        let mut lock = self.session.lock().unwrap();
        *lock = None;
        if let Some(dir) = &self.data_dir {
            let path = dir.join("stalker-catalogue.json");
            let _ = fs::remove_file(path);
        }
    }

    pub fn is_connected(&self) -> bool {
        self.session.lock().unwrap().is_some()
    }

    // Extraction & parsing helpers

    pub fn extract_stream_from_cmd(cmd: &str) -> String {
        let trimmed = cmd.trim();
        // Common Stalker CMD prefixes: "ffrt http://...", "ffmpeg http://...", "auto http://..."
        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        for p in parts {
            if p.starts_with("http://") || p.starts_with("https://") {
                return p.to_string();
            }
        }
        trimmed.to_string()
    }

    pub fn parse_token_from_response(raw: &str) -> Result<String, IngestError> {
        let val: Value = serde_json::from_str(raw).map_err(|_| {
            IngestError::new(ErrorCode::HttpStatus, "Invalid JSON from Stalker portal.")
        })?;

        // Format A: Direct {"token": "..."}
        if let Some(t) = val.get("token").and_then(|v| v.as_str()) {
            if !t.is_empty() {
                return Ok(t.to_string());
            }
        }

        // Format B: JsHttpRequest wrapper {"js": {"token": "..."}}
        if let Some(t) = val.pointer("/js/token").and_then(|v| v.as_str()) {
            if !t.is_empty() {
                return Ok(t.to_string());
            }
        }

        Err(IngestError::new(
            ErrorCode::HttpStatus,
            "Handshake failed: no token returned by Stalker portal.",
        ))
    }

    pub fn parse_profile_from_response(raw: &str, mac: &str) -> StalkerProfile {
        let val: Value = serde_json::from_str(raw).unwrap_or(Value::Null);
        let js = val.get("js").unwrap_or(&val);

        let name = js
            .get("name")
            .or_else(|| js.get("login"))
            .and_then(|v| v.as_str())
            .unwrap_or("MAG User")
            .to_string();

        let status = if js.get("status").and_then(|v| v.as_i64()) == Some(1) {
            "Active".to_string()
        } else {
            "Connected".to_string()
        };

        let exp_date = js
            .get("exp_date")
            .or_else(|| js.get("expire"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let phone = js.get("phone").and_then(|v| v.as_str()).map(|s| s.to_string());

        StalkerProfile {
            mac: mac.to_string(),
            name,
            status,
            exp_date,
            phone,
        }
    }

    pub fn parse_genres(raw: &str) -> Vec<StalkerGenre> {
        let val: Value = serde_json::from_str(raw).unwrap_or(Value::Null);
        let list = val.pointer("/js/data")
            .or_else(|| val.get("js"))
            .or_else(|| val.get("data"))
            .and_then(|v| v.as_array());

        let mut res = Vec::new();
        if let Some(arr) = list {
            for item in arr {
                let id_opt = val_to_str(item.get("id"));
                let title_opt = item.get("title").and_then(|v| v.as_str());

                if let (Some(id), Some(title)) = (id_opt, title_opt) {
                    let alias = item.get("alias").and_then(|v| v.as_str()).unwrap_or(title);
                    res.push(StalkerGenre {
                        id,
                        title: title.to_string(),
                        alias: alias.to_string(),
                    });
                }
            }
        }
        res
    }

    pub fn parse_channels(raw: &str) -> Vec<StalkerChannel> {
        let val: Value = serde_json::from_str(raw).unwrap_or(Value::Null);
        let list = val.pointer("/js/data")
            .or_else(|| val.get("js"))
            .or_else(|| val.get("data"))
            .and_then(|v| v.as_array());

        let mut res = Vec::new();
        if let Some(arr) = list {
            for item in arr {
                let id_opt = val_to_str(item.get("id"));
                let name_opt = item.get("name").and_then(|v| v.as_str());
                let cmd_opt = item.get("cmd").and_then(|v| v.as_str());

                if let (Some(id), Some(name), Some(cmd)) = (id_opt, name_opt, cmd_opt) {
                    let num = item
                        .get("number")
                        .and_then(|v| v.as_u64())
                        .or_else(|| item.get("number").and_then(|v| v.as_str()).and_then(|s| s.parse().ok()))
                        .unwrap_or(res.len() as u64 + 1) as u32;

                    let logo = item.get("logo").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let genre_id = val_to_str(item.get("tv_genre_id")).unwrap_or_else(|| "0".to_string());

                    res.push(StalkerChannel {
                        id,
                        number: num,
                        name: name.to_string(),
                        cmd: cmd.to_string(),
                        logo,
                        genre_id,
                    });
                }
            }
        }
        res
    }

    pub fn parse_vod(raw: &str) -> Vec<StalkerVodItem> {
        let val: Value = serde_json::from_str(raw).unwrap_or(Value::Null);
        let list = val.pointer("/js/data")
            .or_else(|| val.get("js"))
            .or_else(|| val.get("data"))
            .and_then(|v| v.as_array());

        let mut res = Vec::new();
        if let Some(arr) = list {
            for item in arr {
                let id_opt = val_to_str(item.get("id"));
                let name_opt = item.get("name").and_then(|v| v.as_str());
                let cmd_opt = item.get("cmd").and_then(|v| v.as_str());

                if let (Some(id), Some(name), Some(cmd)) = (id_opt, name_opt, cmd_opt) {
                    let poster = item
                        .get("screenshot_uri")
                        .or_else(|| item.get("poster"))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());

                    let year = item.get("year").and_then(|v| v.as_str()).map(|s| s.to_string());
                    let category_id = val_to_str(item.get("category_id"));

                    res.push(StalkerVodItem {
                        id,
                        name: name.to_string(),
                        cmd: cmd.to_string(),
                        poster,
                        year,
                        category_id,
                    });
                }
            }
        }
        res
    }

    pub fn parse_create_link_response(raw: &str) -> Result<String, IngestError> {
        let val: Value = serde_json::from_str(raw).map_err(|_| {
            IngestError::new(ErrorCode::HttpStatus, "Invalid JSON from create_link.")
        })?;

        let cmd = val.pointer("/js/cmd")
            .or_else(|| val.get("cmd"))
            .and_then(|v| v.as_str());

        if let Some(c) = cmd {
            let extracted = Self::extract_stream_from_cmd(c);
            if extracted.starts_with("http://") || extracted.starts_with("https://") {
                return Ok(extracted);
            }
        }

        Err(IngestError::new(
            ErrorCode::HttpStatus,
            "Portal failed to generate playable stream link.",
        ))
    }
}

mod urlencoding {
    pub fn encode(data: &str) -> String {
        let mut res = String::with_capacity(data.len() * 3);
        for b in data.bytes() {
            if b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.' || b == b'~' {
                res.push(b as char);
            } else {
                res.push_str(&format!("%{b:02X}"));
            }
        }
        res
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_and_normalizes_mac_addresses() {
        assert_eq!(
            StalkerEngine::normalize_mac("00:1a:79:ab:cd:ef").unwrap(),
            "00:1A:79:AB:CD:EF"
        );
        assert_eq!(
            StalkerEngine::normalize_mac("00-1A-79-12-34-56").unwrap(),
            "00:1A:79:12:34:56"
        );
        assert!(StalkerEngine::normalize_mac("00:1A:79").is_err());
        assert!(StalkerEngine::normalize_mac("00:1A:79:ZZ:XX:YY").is_err());
    }

    #[test]
    fn extracts_clean_stream_from_stalker_cmd() {
        assert_eq!(
            StalkerEngine::extract_stream_from_cmd("ffrt http://example.com/live/ch1.m3u8"),
            "http://example.com/live/ch1.m3u8"
        );
        assert_eq!(
            StalkerEngine::extract_stream_from_cmd("ffmpeg https://example.com/vod/movie.mp4"),
            "https://example.com/vod/movie.mp4"
        );
        assert_eq!(
            StalkerEngine::extract_stream_from_cmd("http://example.com/stream"),
            "http://example.com/stream"
        );
    }

    #[test]
    fn parses_token_from_both_direct_and_jshttprequest_formats() {
        let direct = r#"{"token":"direct-token-123"}"#;
        assert_eq!(
            StalkerEngine::parse_token_from_response(direct).unwrap(),
            "direct-token-123"
        );

        let wrapped = r#"{"js":{"token":"wrapped-token-456","random":"abcdef"}}"#;
        assert_eq!(
            StalkerEngine::parse_token_from_response(wrapped).unwrap(),
            "wrapped-token-456"
        );
    }

    #[test]
    fn parses_channels_and_genres_accurately() {
        let genres_json = r#"{"js":[{"id":"1","title":"Cinema","alias":"cinema"},{"id":"2","title":"News","alias":"news"}]}"#;
        let genres = StalkerEngine::parse_genres(genres_json);
        assert_eq!(genres.len(), 2);
        assert_eq!(genres[0].title, "Cinema");

        let channels_json = r#"{"js":[{"id":"101","name":"BBC One","number":"1","cmd":"ffrt http://stream.example/bbc1","tv_genre_id":"2"}]}"#;
        let channels = StalkerEngine::parse_channels(channels_json);
        assert_eq!(channels.len(), 1);
        assert_eq!(channels[0].name, "BBC One");
        assert_eq!(channels[0].number, 1);
        assert_eq!(channels[0].genre_id, "2");
    }

    #[test]
    fn parses_create_link_cmd_stream() {
        let link_json = r#"{"js":{"cmd":"ffmpeg http://stream.example/live/ch1.m3u8?token=xyz"}}"#;
        assert_eq!(
            StalkerEngine::parse_create_link_response(link_json).unwrap(),
            "http://stream.example/live/ch1.m3u8?token=xyz"
        );
    }
}
