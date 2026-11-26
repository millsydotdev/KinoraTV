// remote_server.rs - Wireless LAN mobile remote control and platform server for Kinora.
// Serves touch-optimized web interface to phones and tablets on the local network.
// Manages persistent trusted devices, capability-based security, and AI agent interfaces.
// Strictly adheres to typography standards: zero em-dashes across all code and comments.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::net::{IpAddr, Ipv4Addr, SocketAddr, UdpSocket};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, oneshot, Mutex};

pub const DEFAULT_REMOTE_PORT: u16 = 5198;
pub const DEFAULT_DISCOVERY_PORT: u16 = 5197;
const MAX_REQUEST_SIZE: usize = 128 * 1024;
const MAX_FAILED_ATTEMPTS: u32 = 5;
const LOCKOUT_DURATION_SECS: u64 = 30;
const MAX_AUDIT_LOG_ITEMS: usize = 100;
const API_RATE_LIMIT_WINDOW_SECS: u64 = 10;
const API_RATE_LIMIT_MAX_REQUESTS: u32 = 240;
pub const SERVER_API_VERSION: &str = "1.0";
pub const MIN_COMPATIBLE_CLIENT_VERSION: &str = "0.6.0";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PlatformMode {
    #[default]
    Standalone,
    Server,
    Client,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DeviceType {
    Phone,
    Tablet,
    Tv,
    #[default]
    RemoteWeb,
    AiAgent,
    DesktopClient,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DeviceCapability {
    RemoteControl,
    PlaybackControl,
    InputText,
    MediaBrowse,
    MediaCast,
    AiAgent,
    ClientSync,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrustedDevice {
    pub id: String,
    pub name: String,
    pub device_type: DeviceType,
    pub capabilities: Vec<DeviceCapability>,
    pub auth_token: String,
    pub paired_at: u64,
    pub last_seen_at: u64,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub revoked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditedAction {
    pub id: String,
    pub timestamp: u64,
    pub device_id: String,
    pub device_name: String,
    pub capability: String,
    pub action: String,
    pub details: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemotePlaybackState {
    pub title: String,
    pub subtitle: Option<String>,
    pub is_playing: bool,
    pub volume: f32,
    pub is_muted: bool,
    pub duration_sec: f64,
    pub position_sec: f64,
    #[serde(default)]
    pub is_live: bool,
    pub channel_name: Option<String>,
    pub channel_number: Option<u32>,
}

impl Default for RemotePlaybackState {
    fn default() -> Self {
        Self {
            title: "Kinora TV".to_string(),
            subtitle: None,
            is_playing: false,
            volume: 0.8,
            is_muted: false,
            duration_sec: 0.0,
            position_sec: 0.0,
            is_live: false,
            channel_name: None,
            channel_number: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteChannelSummary {
    pub id: String,
    pub name: String,
    pub number: Option<u32>,
    pub group: Option<String>,
    pub logo: Option<String>,
    pub current_programme: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stream_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSourceSummary {
    pub id: String,
    pub label: String,
    pub origin: String,
    pub channel_count: usize,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RemoteLibrarySummary {
    pub favourites: Vec<String>,
    pub watchlist: Vec<String>,
    pub watch_progress: Vec<RemoteWatchProgressItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteWatchProgressItem {
    pub item_ref: String,
    pub title: String,
    pub position: f64,
    pub duration: f64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteEpgProgramme {
    pub channel_id: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subtitle: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub start: i64,
    pub stop: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub episode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteMediaItem {
    pub id: String,
    /// "movie" | "series" | "local"
    pub kind: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub year: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub overview: Option<String>,
    #[serde(default)]
    pub genres: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rating: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub duration_secs: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artwork_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub backdrop_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_id: Option<String>,
    /// Kept strictly in server RAM; stripped before returning from `GET /api/media`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stream_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteServerStatus {
    pub running: bool,
    pub port: u16,
    pub local_ip: String,
    pub pairing_pin: String,
    pub server_url: String,
    pub connected_clients: usize,
    pub mode: PlatformMode,
    pub trusted_devices_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformModeInfo {
    pub mode: PlatformMode,
    pub server_url: Option<String>,
    pub is_server_active: bool,
    pub trusted_devices_count: usize,
    pub active_connections: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteCommandEvent {
    pub command: String,
    pub payload: serde_json::Value,
    pub client_id: Option<String>,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredServer {
    pub name: String,
    pub ip: String,
    pub port: u16,
    pub version: String,
    pub mode: String,
}

struct ServerInner {
    data_dir: Option<PathBuf>,
    running: bool,
    port: u16,
    local_ip: String,
    pairing_pin: String,
    mode: PlatformMode,
    server_client_url: Option<String>,
    trusted_devices: Vec<TrustedDevice>,
    audit_log: Vec<AuditedAction>,
    channels: Vec<RemoteChannelSummary>,
    sources: Vec<RemoteSourceSummary>,
    library: RemoteLibrarySummary,
    epg: Vec<RemoteEpgProgramme>,
    media: Vec<RemoteMediaItem>,
    local_media_roots: Vec<PathBuf>,
    local_media_files: HashMap<String, PathBuf>,
    local_artwork_files: HashMap<String, PathBuf>,
    failed_attempts: u32,
    lockout_until: Option<Instant>,
    started_at: Instant,
    rate_limits: HashMap<String, (Instant, u32)>,
    playback_state: RemotePlaybackState,
    sse_senders: Vec<mpsc::UnboundedSender<String>>,
    shutdown_tx: Option<oneshot::Sender<()>>,
    beacon_shutdown_tx: Option<oneshot::Sender<()>>,
}

#[derive(Clone)]
pub struct RemoteServerManager {
    inner: Arc<Mutex<ServerInner>>,
    stream_proxy: crate::lan_proxy::LanStreamProxy,
    artwork_store: Arc<crate::artwork::ArtworkStore>,
}

impl Default for RemoteServerManager {
    fn default() -> Self {
        Self::new(None)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlatformConfig {
    pub mode: PlatformMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub server_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub port: Option<u16>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pairing_pin: Option<String>,
}

impl RemoteServerManager {
    pub fn new(data_dir: Option<PathBuf>) -> Self {
        Self::with_stream_policy(data_dir, crate::fetch::Policy::default())
    }

    pub fn with_stream_policy(data_dir: Option<PathBuf>, policy: crate::fetch::Policy) -> Self {
        let ip = detect_local_ip();
        let (loaded_devices, loaded_cfg, loaded_library) = if let Some(ref dir) = data_dir {
            (
                load_trusted_devices_from_disk(dir),
                load_platform_config_from_disk(dir),
                load_library_sync_from_disk(dir).unwrap_or_default(),
            )
        } else {
            (Vec::new(), None, RemoteLibrarySummary::default())
        };

        let pin = loaded_cfg
            .as_ref()
            .and_then(|c| c.pairing_pin.as_ref())
            .filter(|p| p.trim().len() >= 4)
            .cloned()
            .unwrap_or_else(generate_pairing_pin);
        let port = loaded_cfg
            .as_ref()
            .and_then(|c| c.port)
            .filter(|&p| p > 0)
            .unwrap_or(DEFAULT_REMOTE_PORT);
        let mode = loaded_cfg
            .as_ref()
            .map(|c| c.mode)
            .unwrap_or(PlatformMode::Standalone);
        let server_client_url = loaded_cfg.and_then(|c| c.server_url);

        let artwork_dir = data_dir.as_ref().map(|d| d.join("sources"));

        Self {
            inner: Arc::new(Mutex::new(ServerInner {
                data_dir,
                running: false,
                port,
                local_ip: ip,
                pairing_pin: pin,
                mode,
                server_client_url,
                trusted_devices: loaded_devices,
                audit_log: Vec::new(),
                channels: Vec::new(),
                sources: Vec::new(),
                library: loaded_library,
                epg: Vec::new(),
                media: Vec::new(),
                local_media_roots: Vec::new(),
                local_media_files: HashMap::new(),
                local_artwork_files: HashMap::new(),
                failed_attempts: 0,
                lockout_until: None,
                started_at: Instant::now(),
                rate_limits: HashMap::new(),
                playback_state: RemotePlaybackState::default(),
                sse_senders: Vec::new(),
                shutdown_tx: None,
                beacon_shutdown_tx: None,
            })),
            stream_proxy: crate::lan_proxy::LanStreamProxy::new(policy),
            artwork_store: Arc::new(crate::artwork::ArtworkStore::new(artwork_dir)),
        }
    }

    pub async fn get_status(&self) -> RemoteServerStatus {
        let state = self.inner.lock().await;
        let server_url = format!("http://{}:{}", state.local_ip, state.port);
        let active_count = state.trusted_devices.iter().filter(|d| !d.revoked).count();
        RemoteServerStatus {
            running: state.running,
            port: state.port,
            local_ip: state.local_ip.clone(),
            pairing_pin: state.pairing_pin.clone(),
            server_url,
            connected_clients: active_count,
            mode: state.mode,
            trusted_devices_count: state.trusted_devices.len(),
        }
    }

    pub async fn get_platform_mode(&self) -> PlatformModeInfo {
        let state = self.inner.lock().await;
        let active_count = state.trusted_devices.iter().filter(|d| !d.revoked).count();
        PlatformModeInfo {
            mode: state.mode,
            server_url: state.server_client_url.clone(),
            is_server_active: state.running,
            trusted_devices_count: state.trusted_devices.len(),
            active_connections: active_count,
        }
    }

    pub async fn set_platform_mode(
        &self,
        mode: PlatformMode,
        server_url: Option<String>,
    ) -> PlatformModeInfo {
        let mut state = self.inner.lock().await;
        state.mode = mode;
        state.server_client_url = server_url;
        persist_platform_config(&state);
        let active_count = state.trusted_devices.iter().filter(|d| !d.revoked).count();
        PlatformModeInfo {
            mode: state.mode,
            server_url: state.server_client_url.clone(),
            is_server_active: state.running,
            trusted_devices_count: state.trusted_devices.len(),
            active_connections: active_count,
        }
    }

    pub async fn get_trusted_devices(&self) -> Vec<TrustedDevice> {
        let state = self.inner.lock().await;
        state.trusted_devices.clone()
    }

    pub async fn revoke_device(&self, device_id: &str) -> bool {
        let mut state = self.inner.lock().await;
        let mut found = false;
        let mut dev_name = "Unknown".to_string();
        for dev in &mut state.trusted_devices {
            if dev.id == device_id {
                dev.revoked = true;
                found = true;
                dev_name = dev.name.clone();
                break;
            }
        }
        if found {
            self.stream_proxy.revoke_device(device_id);
            if let Some(ref dir) = state.data_dir {
                save_trusted_devices_to_disk(dir, &state.trusted_devices);
            }
            record_audit_action(
                &mut state.audit_log,
                device_id,
                &dev_name,
                "DeviceManagement",
                "RevokeDevice",
                "Device authorization revoked",
                "success",
            );
        }
        found
    }

    pub async fn is_device_active(&self, device_id: &str) -> bool {
        let state = self.inner.lock().await;
        state
            .trusted_devices
            .iter()
            .any(|d| d.id == device_id && !d.revoked)
    }

    pub async fn rename_device(&self, device_id: &str, new_name: &str) -> bool {
        let mut state = self.inner.lock().await;
        let mut found = false;
        for dev in &mut state.trusted_devices {
            if dev.id == device_id {
                dev.name = new_name.trim().to_string();
                found = true;
                break;
            }
        }
        if found {
            if let Some(ref dir) = state.data_dir {
                save_trusted_devices_to_disk(dir, &state.trusted_devices);
            }
        }
        found
    }

    pub async fn get_audit_log(&self) -> Vec<AuditedAction> {
        let state = self.inner.lock().await;
        state.audit_log.clone()
    }

    pub async fn update_channels(&self, channels: Vec<RemoteChannelSummary>) {
        let mut state = self.inner.lock().await;
        state.channels = channels;
    }

    pub async fn update_sources(&self, sources: Vec<RemoteSourceSummary>) {
        let mut state = self.inner.lock().await;
        state.sources = sources;
    }

    #[allow(dead_code)]
    pub async fn get_sources(&self) -> Vec<RemoteSourceSummary> {
        let state = self.inner.lock().await;
        state.sources.clone()
    }

    pub async fn update_library(&self, library: RemoteLibrarySummary) {
        let mut state = self.inner.lock().await;
        state.library = library;
        if let Some(ref dir) = state.data_dir {
            save_library_sync_to_disk(dir, &state.library);
        }
    }

    #[allow(dead_code)]
    pub async fn get_library(&self) -> RemoteLibrarySummary {
        let state = self.inner.lock().await;
        state.library.clone()
    }

    pub async fn update_epg(&self, mut programmes: Vec<RemoteEpgProgramme>) {
        if programmes.len() > 25_000 {
            programmes.truncate(25_000);
        }
        let mut state = self.inner.lock().await;
        state.epg = programmes;
    }

    #[allow(dead_code)]
    pub async fn get_epg(&self) -> Vec<RemoteEpgProgramme> {
        let state = self.inner.lock().await;
        state.epg.clone()
    }

    pub async fn update_media(&self, mut items: Vec<RemoteMediaItem>) {
        if items.len() > 10_000 {
            items.truncate(10_000);
        }
        let mut state = self.inner.lock().await;
        state.media = items;
    }

    #[allow(dead_code)]
    pub async fn get_media(&self) -> Vec<RemoteMediaItem> {
        let state = self.inner.lock().await;
        state.media.clone()
    }

    /// Registers server-internal local media roots and file/artwork paths (never serialized to clients).
    pub async fn update_local_media_paths(
        &self,
        roots: Vec<PathBuf>,
        media_files: HashMap<String, PathBuf>,
        artwork_files: HashMap<String, PathBuf>,
    ) {
        let mut state = self.inner.lock().await;
        state.local_media_roots = roots;
        state.local_media_files = media_files;
        state.local_artwork_files = artwork_files;
    }

    pub async fn update_playback_state(&self, new_state: RemotePlaybackState) {
        let mut state = self.inner.lock().await;
        state.playback_state = new_state.clone();

        // Broadcast to SSE streams
        if let Ok(json) = serde_json::to_string(&new_state) {
            let msg = format!("data: {json}\n\n");
            state
                .sse_senders
                .retain(|sender| sender.send(msg.clone()).is_ok());
        }
    }

    pub async fn start<F>(
        &self,
        port: Option<u16>,
        custom_pin: Option<String>,
        on_command: F,
    ) -> Result<RemoteServerStatus, String>
    where
        F: Fn(RemoteCommandEvent) + Send + Sync + 'static,
    {
        let mut state = self.inner.lock().await;
        if state.running {
            let server_url = format!("http://{}:{}", state.local_ip, state.port);
            let active_count = state.trusted_devices.iter().filter(|d| !d.revoked).count();
            return Ok(RemoteServerStatus {
                running: true,
                port: state.port,
                local_ip: state.local_ip.clone(),
                pairing_pin: state.pairing_pin.clone(),
                server_url,
                connected_clients: active_count,
                mode: state.mode,
                trusted_devices_count: state.trusted_devices.len(),
            });
        }

        let chosen_port = port.unwrap_or(state.port);
        let mut cfg_changed = false;
        if let Some(pin) = custom_pin {
            if pin.trim().len() >= 4 {
                state.pairing_pin = pin.trim().to_string();
                cfg_changed = true;
            }
        }
        if state.port != chosen_port {
            state.port = chosen_port;
            cfg_changed = true;
        }
        if cfg_changed {
            persist_platform_config(&state);
        }
        state.local_ip = detect_local_ip();

        let bind_addr = SocketAddr::from(([0, 0, 0, 0], chosen_port));
        let listener = TcpListener::bind(bind_addr)
            .await
            .map_err(|e| format!("Failed to bind server on port {chosen_port}: {e}"))?;

        let (shutdown_tx, mut shutdown_rx) = oneshot::channel();
        state.shutdown_tx = Some(shutdown_tx);
        state.running = true;

        let server_manager_clone = self.clone();
        let on_command_arc = Arc::new(on_command);

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = &mut shutdown_rx => {
                        break;
                    }
                    accept_res = listener.accept() => {
                        match accept_res {
                            Ok((stream, addr)) => {
                                let mgr = server_manager_clone.clone();
                                let cmd_cb = on_command_arc.clone();
                                tokio::spawn(async move {
                                    handle_connection(stream, addr, mgr, cmd_cb).await;
                                });
                            }
                            Err(_) => {
                                break;
                            }
                        }
                    }
                }
            }
        });

        // Start UDP LAN Discovery Beacon
        let (beacon_tx, mut beacon_rx) = oneshot::channel();
        state.beacon_shutdown_tx = Some(beacon_tx);
        let beacon_ip = state.local_ip.clone();
        let beacon_port = state.port;

        tokio::spawn(async move {
            let socket = match UdpSocket::bind("0.0.0.0:0") {
                Ok(s) => {
                    let _ = s.set_broadcast(true);
                    s
                }
                Err(_) => return,
            };
            let broadcast_addr = SocketAddr::new(
                IpAddr::V4(Ipv4Addr::new(255, 255, 255, 255)),
                DEFAULT_DISCOVERY_PORT,
            );
            let beacon_payload = format!(
                r#"{{"name":"Kinora Media Server","ip":"{}","port":{},"version":"0.6.0","mode":"server"}}"#,
                beacon_ip, beacon_port
            );
            let beacon_bytes = format!("KINORA_BEACON_V1:{beacon_payload}").into_bytes();

            loop {
                let _ = socket.send_to(&beacon_bytes, broadcast_addr);
                tokio::select! {
                    _ = &mut beacon_rx => {
                        break;
                    }
                    _ = tokio::time::sleep(Duration::from_secs(10)) => {}
                }
            }
        });

        let server_url = format!("http://{}:{}", state.local_ip, state.port);
        let active_count = state.trusted_devices.iter().filter(|d| !d.revoked).count();
        Ok(RemoteServerStatus {
            running: true,
            port: state.port,
            local_ip: state.local_ip.clone(),
            pairing_pin: state.pairing_pin.clone(),
            server_url,
            connected_clients: active_count,
            mode: state.mode,
            trusted_devices_count: state.trusted_devices.len(),
        })
    }

    pub async fn stop(&self) {
        let mut state = self.inner.lock().await;
        if let Some(tx) = state.shutdown_tx.take() {
            let _ = tx.send(());
        }
        if let Some(btx) = state.beacon_shutdown_tx.take() {
            let _ = btx.send(());
        }
        state.running = false;
        state.sse_senders.clear();
    }
}

pub fn generate_pairing_pin() -> String {
    let mut bytes = [0u8; 2];
    if getrandom::fill(&mut bytes).is_ok() {
        let num = (u16::from_be_bytes(bytes) % 9000) + 1000;
        return num.to_string();
    }
    "7492".to_string()
}

pub fn generate_auth_token() -> String {
    let mut bytes = [0u8; 16];
    if getrandom::fill(&mut bytes).is_ok() {
        let mut hex = String::with_capacity(32);
        for b in bytes {
            hex.push_str(&format!("{:02x}", b));
        }
        return hex;
    }
    "kinora-remote-auth-token-fallback".to_string()
}

pub fn generate_device_id() -> String {
    let mut bytes = [0u8; 8];
    if getrandom::fill(&mut bytes).is_ok() {
        let mut hex = String::with_capacity(20);
        hex.push_str("dev-");
        for b in bytes {
            hex.push_str(&format!("{:02x}", b));
        }
        return hex;
    }
    "dev-default".to_string()
}

pub fn detect_local_ip() -> String {
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(local_addr) = socket.local_addr() {
                let ip = local_addr.ip();
                if let IpAddr::V4(ipv4) = ip {
                    if !ipv4.is_loopback() {
                        return ipv4.to_string();
                    }
                }
            }
        }
    }
    "127.0.0.1".to_string()
}

pub async fn discover_servers_on_lan(timeout_secs: u64) -> Vec<DiscoveredServer> {
    tokio::task::spawn_blocking(move || {
        let socket = match UdpSocket::bind(format!("0.0.0.0:{DEFAULT_DISCOVERY_PORT}")) {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };
        let _ = socket.set_read_timeout(Some(Duration::from_secs(timeout_secs.max(1))));
        let mut results = Vec::new();
        let mut seen = HashSet::new();
        let mut buf = [0u8; 2048];
        let start = Instant::now();

        while start.elapsed() < Duration::from_secs(timeout_secs.max(1)) {
            if let Ok((len, src)) = socket.recv_from(&mut buf) {
                let msg = String::from_utf8_lossy(&buf[..len]);
                if let Some(json_str) = msg.strip_prefix("KINORA_BEACON_V1:") {
                    if let Ok(server) = serde_json::from_str::<DiscoveredServer>(json_str) {
                        let key = format!("{}:{}", server.ip, server.port);
                        if seen.insert(key) {
                            results.push(server);
                        }
                    } else if seen.insert(src.to_string()) {
                        results.push(DiscoveredServer {
                            name: "Kinora Server".to_string(),
                            ip: src.ip().to_string(),
                            port: DEFAULT_REMOTE_PORT,
                            version: "0.6.0".to_string(),
                            mode: "server".to_string(),
                        });
                    }
                }
            }
        }
        results
    })
    .await
    .unwrap_or_default()
}

fn now_unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn record_audit_action(
    log: &mut Vec<AuditedAction>,
    device_id: &str,
    device_name: &str,
    capability: &str,
    action: &str,
    details: &str,
    status: &str,
) {
    let entry = AuditedAction {
        id: format!("aud-{}", now_unix_secs()),
        timestamp: now_unix_secs(),
        device_id: device_id.to_string(),
        device_name: device_name.to_string(),
        capability: capability.to_string(),
        action: action.to_string(),
        details: details.to_string(),
        status: status.to_string(),
    };
    log.push(entry);
    if log.len() > MAX_AUDIT_LOG_ITEMS {
        log.remove(0);
    }
}

fn broadcast_sse_envelope(state: &mut ServerInner, event_type: &str, data: serde_json::Value) {
    let envelope = serde_json::json!({
        "type": event_type,
        "data": data,
        "timestamp": now_unix_secs()
    });
    if let Ok(json) = serde_json::to_string(&envelope) {
        let msg = format!("data: {json}\n\n");
        state
            .sse_senders
            .retain(|sender| sender.send(msg.clone()).is_ok());
    }
}

fn persist_platform_config(state: &ServerInner) {
    if let Some(ref dir) = state.data_dir {
        let cfg = PlatformConfig {
            mode: state.mode,
            server_url: state.server_client_url.clone(),
            port: Some(state.port),
            pairing_pin: Some(state.pairing_pin.clone()),
        };
        save_platform_config_to_disk(dir, &cfg);
    }
}

fn load_platform_config_from_disk(data_dir: &Path) -> Option<PlatformConfig> {
    let file_path = data_dir.join("platform_config.json");
    let data = fs::read_to_string(file_path).ok()?;
    serde_json::from_str::<PlatformConfig>(&data).ok()
}

fn save_platform_config_to_disk(data_dir: &Path, cfg: &PlatformConfig) {
    let _ = fs::create_dir_all(data_dir);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(data_dir, fs::Permissions::from_mode(0o700));
    }

    let file_path = data_dir.join("platform_config.json");
    let temp_path = data_dir.join("platform_config.json.tmp");

    if let Ok(json) = serde_json::to_string_pretty(cfg) {
        let mut options = OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }

        if let Ok(mut file) = options.open(&temp_path) {
            if file.write_all(json.as_bytes()).is_ok() && file.sync_all().is_ok() {
                drop(file);
                let _ = fs::rename(&temp_path, &file_path);
            } else {
                let _ = fs::remove_file(&temp_path);
            }
        }
    }
}

fn load_library_sync_from_disk(data_dir: &Path) -> Option<RemoteLibrarySummary> {
    let file_path = data_dir.join("remote_library_sync.json");
    let data = fs::read_to_string(file_path).ok()?;
    serde_json::from_str::<RemoteLibrarySummary>(&data).ok()
}

fn save_library_sync_to_disk(data_dir: &Path, lib: &RemoteLibrarySummary) {
    let _ = fs::create_dir_all(data_dir);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(data_dir, fs::Permissions::from_mode(0o700));
    }

    let file_path = data_dir.join("remote_library_sync.json");
    let temp_path = data_dir.join("remote_library_sync.json.tmp");

    if let Ok(json) = serde_json::to_string_pretty(lib) {
        let mut options = OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }

        if let Ok(mut file) = options.open(&temp_path) {
            if file.write_all(json.as_bytes()).is_ok() && file.sync_all().is_ok() {
                drop(file);
                let _ = fs::rename(&temp_path, &file_path);
            } else {
                let _ = fs::remove_file(&temp_path);
            }
        }
    }
}

fn load_trusted_devices_from_disk(data_dir: &Path) -> Vec<TrustedDevice> {
    let file_path = data_dir.join("devices.json");
    if let Ok(data) = fs::read_to_string(file_path) {
        if let Ok(devices) = serde_json::from_str::<Vec<TrustedDevice>>(&data) {
            return devices;
        }
    }
    Vec::new()
}

fn save_trusted_devices_to_disk(data_dir: &Path, devices: &[TrustedDevice]) {
    let _ = fs::create_dir_all(data_dir);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(data_dir, fs::Permissions::from_mode(0o700));
    }

    let file_path = data_dir.join("devices.json");
    let temp_path = data_dir.join("devices.json.tmp");

    if let Ok(json) = serde_json::to_string_pretty(devices) {
        let mut options = OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }

        if let Ok(mut file) = options.open(&temp_path) {
            if file.write_all(json.as_bytes()).is_ok() && file.sync_all().is_ok() {
                drop(file);
                let _ = fs::rename(&temp_path, &file_path);
            } else {
                let _ = fs::remove_file(&temp_path);
            }
        }
    }
}

async fn handle_connection<F>(
    mut stream: TcpStream,
    addr: SocketAddr,
    manager: RemoteServerManager,
    on_command: Arc<F>,
) where
    F: Fn(RemoteCommandEvent) + Send + Sync + 'static,
{
    let mut buffer = [0u8; MAX_REQUEST_SIZE];
    let bytes_read = match stream.read(&mut buffer).await {
        Ok(n) if n > 0 => n,
        _ => return,
    };

    let req_str = String::from_utf8_lossy(&buffer[..bytes_read]);
    let mut lines = req_str.lines();
    let first_line = match lines.next() {
        Some(l) => l,
        None => return,
    };

    let mut parts = first_line.split_whitespace();
    let method = parts.next().unwrap_or("GET");
    let full_path = parts.next().unwrap_or("/");

    let (path, query_str) = full_path.split_once('?').unwrap_or((full_path, ""));

    // Extract headers
    let mut auth_token = None;
    let mut user_agent = None;
    let mut range_header = None;
    let mut host_header = None;
    for line in lines {
        if line.is_empty() {
            break;
        }
        let lower = line.to_lowercase();
        if lower.starts_with("authorization: bearer ") {
            auth_token = Some(line[21..].trim().to_string());
        } else if lower.starts_with("user-agent:") {
            user_agent = Some(line[11..].trim().to_string());
        } else if lower.starts_with("range:") {
            range_header = Some(line[6..].trim().to_string());
        } else if lower.starts_with("host:") {
            host_header = Some(line[5..].trim().to_string());
        }
    }

    if auth_token.is_none() && !query_str.is_empty() {
        for pair in query_str.split('&') {
            if let Some((k, v)) = pair.split_once('=') {
                if k == "token" && !v.is_empty() {
                    auth_token = Some(v.to_string());
                    break;
                }
            }
        }
    }

    // CORS preflight
    if method == "OPTIONS" {
        let resp = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, DELETE, OPTIONS\r\nAccess-Control-Allow-Headers: Authorization, Content-Type, Range\r\n\r\n";
        let _ = stream.write_all(resp.as_bytes()).await;
        return;
    }

    // Per-IP sliding-window rate limiting on control and metadata API endpoints
    // (excludes /api/stream/h/ media segment transfers so video playback is never throttled).
    if path.starts_with("/api/") && !path.starts_with("/api/stream/h/") {
        let peer_ip = addr.ip().to_string();
        let now_inst = Instant::now();
        let mut state = manager.inner.lock().await;
        let entry = state.rate_limits.entry(peer_ip).or_insert((now_inst, 0));
        if now_inst.duration_since(entry.0) >= Duration::from_secs(API_RATE_LIMIT_WINDOW_SECS) {
            *entry = (now_inst, 1);
        } else {
            entry.1 = entry.1.saturating_add(1);
            if entry.1 > API_RATE_LIMIT_MAX_REQUESTS {
                drop(state);
                let body = r#"{"error":"Rate limit exceeded. Retry shortly."}"#;
                let resp = format!(
                    "HTTP/1.1 429 Too Many Requests\r\nContent-Type: application/json\r\nRetry-After: {API_RATE_LIMIT_WINDOW_SECS}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = stream.write_all(resp.as_bytes()).await;
                return;
            }
        }
        // Keep rate-limit map bounded
        if state.rate_limits.len() > 256 {
            state.rate_limits.retain(|_, (ts, _)| {
                now_inst.duration_since(*ts) < Duration::from_secs(API_RATE_LIMIT_WINDOW_SECS * 2)
            });
        }
    }

    // Router
    match (method, path) {
        ("GET", "/") => {
            let html = get_embedded_remote_html();
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
                html.len(),
                html
            );
            let _ = stream.write_all(resp.as_bytes()).await;
        }
        ("GET", "/manifest.webmanifest") => {
            let manifest = get_pwa_manifest_json();
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/manifest+json; charset=utf-8\r\nCache-Control: public, max-age=3600\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
                manifest.len(),
                manifest
            );
            let _ = stream.write_all(resp.as_bytes()).await;
        }
        ("GET", "/icon.svg") => {
            let svg = get_pwa_icon_svg();
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: image/svg+xml; charset=utf-8\r\nCache-Control: public, max-age=86400\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
                svg.len(),
                svg
            );
            let _ = stream.write_all(resp.as_bytes()).await;
        }
        ("POST", "/pair") => {
            let body = extract_body(&req_str);
            let result =
                handle_pair_request(&manager, body, addr.ip().to_string(), user_agent).await;
            let (status_code, json_resp) = match result {
                Ok(pair_resp) => (
                    200,
                    serde_json::to_string(&pair_resp)
                        .unwrap_or_else(|_| r#"{"ok":true}"#.to_string()),
                ),
                Err(err) => (401, format!(r#"{{"ok":false,"error":"{err}"}}"#)),
            };
            let resp = format!(
                "HTTP/1.1 {status_code} OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
                json_resp.len(),
                json_resp
            );
            let _ = stream.write_all(resp.as_bytes()).await;
        }
        ("GET", "/api/info") | ("GET", "/info") => {
            let state = manager.inner.lock().await;
            let active_devices = state.trusted_devices.iter().filter(|d| !d.revoked).count();
            let info = serde_json::json!({
                "appName": "Kinora",
                "version": env!("CARGO_PKG_VERSION"),
                "apiVersion": SERVER_API_VERSION,
                "minCompatibleClientVersion": MIN_COMPATIBLE_CLIENT_VERSION,
                "health": "ok",
                "uptimeSecs": state.started_at.elapsed().as_secs(),
                "mode": state.mode,
                "localIp": state.local_ip,
                "port": state.port,
                "trustedDevicesCount": active_devices,
                "connectedClients": state.sse_senders.len(),
                "serverUrl": format!("http://{}:{}", state.local_ip, state.port)
            });
            let json = info.to_string();
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
                json.len(),
                json
            );
            let _ = stream.write_all(resp.as_bytes()).await;
        }
        ("GET", "/api/status") | ("GET", "/status") => {
            if !validate_token(
                &manager,
                auth_token.as_deref(),
                &[
                    DeviceCapability::RemoteControl,
                    DeviceCapability::PlaybackControl,
                    DeviceCapability::MediaBrowse,
                    DeviceCapability::AiAgent,
                ],
            )
            .await
            {
                send_unauthorized(&mut stream).await;
                return;
            }

            let state = manager.inner.lock().await;
            let json =
                serde_json::to_string(&state.playback_state).unwrap_or_else(|_| "{}".to_string());
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
                json.len(),
                json
            );
            let _ = stream.write_all(resp.as_bytes()).await;
        }
        ("GET", "/api/channels") => {
            if !validate_token(
                &manager,
                auth_token.as_deref(),
                &[
                    DeviceCapability::MediaBrowse,
                    DeviceCapability::RemoteControl,
                    DeviceCapability::ClientSync,
                    DeviceCapability::AiAgent,
                ],
            )
            .await
            {
                send_unauthorized(&mut stream).await;
                return;
            }

            let now_ms = (now_unix_secs() as i64).saturating_mul(1000);
            let state = manager.inner.lock().await;
            let sanitized: Vec<RemoteChannelSummary> = state
                .channels
                .iter()
                .map(|c| {
                    let mut s = c.clone();
                    s.stream_url = None;
                    if s.current_programme.is_none() {
                        s.current_programme = state
                            .epg
                            .iter()
                            .find(|p| p.channel_id == s.id && p.start <= now_ms && now_ms < p.stop)
                            .map(|p| p.title.clone());
                    }
                    s
                })
                .collect();
            let json = serde_json::to_string(&sanitized).unwrap_or_else(|_| "[]".to_string());
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
                json.len(),
                json
            );
            let _ = stream.write_all(resp.as_bytes()).await;
        }
        ("GET", "/api/epg") => {
            if !validate_token(
                &manager,
                auth_token.as_deref(),
                &[
                    DeviceCapability::MediaBrowse,
                    DeviceCapability::RemoteControl,
                    DeviceCapability::ClientSync,
                    DeviceCapability::AiAgent,
                ],
            )
            .await
            {
                send_unauthorized(&mut stream).await;
                return;
            }

            let mut filter_channel: Option<String> = None;
            let mut filter_from: Option<i64> = None;
            let mut filter_to: Option<i64> = None;
            for pair in query_str.split('&') {
                if let Some((k, v)) = pair.split_once('=') {
                    if v.is_empty() {
                        continue;
                    }
                    match k {
                        "channelId" => filter_channel = Some(percent_decode_simple(v)),
                        "from" => filter_from = v.parse::<i64>().ok(),
                        "to" => filter_to = v.parse::<i64>().ok(),
                        _ => {}
                    }
                }
            }

            let state = manager.inner.lock().await;
            let filtered: Vec<&RemoteEpgProgramme> = state
                .epg
                .iter()
                .filter(|p| {
                    if let Some(ref cid) = filter_channel {
                        if &p.channel_id != cid {
                            return false;
                        }
                    }
                    if let Some(from) = filter_from {
                        if p.stop <= from {
                            return false;
                        }
                    }
                    if let Some(to) = filter_to {
                        if p.start >= to {
                            return false;
                        }
                    }
                    true
                })
                .take(10_000)
                .collect();

            let json = serde_json::to_string(&filtered).unwrap_or_else(|_| "[]".to_string());
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
                json.len(),
                json
            );
            let _ = stream.write_all(resp.as_bytes()).await;
        }
        ("GET", "/api/media") => {
            if !validate_token(
                &manager,
                auth_token.as_deref(),
                &[
                    DeviceCapability::MediaBrowse,
                    DeviceCapability::ClientSync,
                    DeviceCapability::AiAgent,
                ],
            )
            .await
            {
                send_unauthorized(&mut stream).await;
                return;
            }

            let mut filter_kind: Option<String> = None;
            let mut filter_q: Option<String> = None;
            for pair in query_str.split('&') {
                if let Some((k, v)) = pair.split_once('=') {
                    if v.is_empty() {
                        continue;
                    }
                    match k {
                        "kind" => filter_kind = Some(percent_decode_simple(v).to_ascii_lowercase()),
                        "q" => filter_q = Some(percent_decode_simple(v).to_ascii_lowercase()),
                        _ => {}
                    }
                }
            }

            let state = manager.inner.lock().await;
            let sanitized: Vec<RemoteMediaItem> = state
                .media
                .iter()
                .filter(|m| {
                    if let Some(ref kind) = filter_kind {
                        if !m.kind.eq_ignore_ascii_case(kind) {
                            return false;
                        }
                    }
                    if let Some(ref q) = filter_q {
                        if !m.title.to_ascii_lowercase().contains(q) {
                            return false;
                        }
                    }
                    true
                })
                .take(2_000)
                .map(|m| {
                    let mut clean = m.clone();
                    clean.stream_url = None;
                    clean
                })
                .collect();

            let json = serde_json::to_string(&sanitized).unwrap_or_else(|_| "[]".to_string());
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
                json.len(),
                json
            );
            let _ = stream.write_all(resp.as_bytes()).await;
        }
        ("GET", "/api/artwork") => {
            if !validate_token(
                &manager,
                auth_token.as_deref(),
                &[
                    DeviceCapability::MediaBrowse,
                    DeviceCapability::RemoteControl,
                    DeviceCapability::ClientSync,
                    DeviceCapability::AiAgent,
                ],
            )
            .await
            {
                send_unauthorized(&mut stream).await;
                return;
            }

            let mut art_key: Option<String> = None;
            for pair in query_str.split('&') {
                if let Some((k, v)) = pair.split_once('=') {
                    if k == "key" && !v.is_empty() {
                        art_key = Some(percent_decode_simple(v));
                        break;
                    }
                }
            }

            let mut cached = art_key
                .as_deref()
                .filter(|k| !k.is_empty() && k.len() <= 256)
                .and_then(|k| manager.artwork_store.read_cached(k));

            if cached.is_none() {
                if let Some(ref k) = art_key {
                    let local_lookup = {
                        let state = manager.inner.lock().await;
                        state
                            .local_artwork_files
                            .get(k)
                            .cloned()
                            .map(|p| (p, state.local_media_roots.clone()))
                    };
                    if let Some((art_path, roots)) = local_lookup {
                        cached = tokio::task::spawn_blocking(move || {
                            let safe_path =
                                crate::lan_proxy::canonicalize_contained_path(&art_path, &roots)
                                    .ok()?;
                            let meta = std::fs::metadata(&safe_path).ok()?;
                            if !meta.is_file() || meta.len() == 0 || meta.len() > 5 * 1024 * 1024 {
                                return None;
                            }
                            let bytes = std::fs::read(&safe_path).ok()?;
                            let mime = crate::artwork::detect_raster_mime(&bytes)?;
                            Some(crate::artwork::Artwork {
                                mime_type: mime,
                                bytes,
                            })
                        })
                        .await
                        .ok()
                        .flatten();
                    }
                }
            }

            if let Some(art) = cached {
                let hdr = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: private, max-age=3600\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n",
                    art.mime_type,
                    art.bytes.len()
                );
                let _ = stream.write_all(hdr.as_bytes()).await;
                let _ = stream.write_all(&art.bytes).await;
            } else {
                let err = r#"{"ok":false,"error":"Artwork not cached"}"#;
                let resp = format!(
                    "HTTP/1.1 404 Not Found\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
                    err.len(),
                    err
                );
                let _ = stream.write_all(resp.as_bytes()).await;
            }
        }
        ("POST", "/api/stream/open") => {
            let caller_opt = get_device_by_token(&manager, auth_token.as_deref()).await;
            if caller_opt.is_none() {
                send_unauthorized(&mut stream).await;
                return;
            }
            let caller = caller_opt.unwrap();
            if !caller.capabilities.contains(&DeviceCapability::ClientSync)
                && !caller
                    .capabilities
                    .contains(&DeviceCapability::PlaybackControl)
            {
                send_forbidden(
                    &mut stream,
                    "Device lacks ClientSync or PlaybackControl capability",
                )
                .await;
                return;
            }

            let body = extract_body(&req_str);
            let parsed_body = serde_json::from_str::<serde_json::Value>(body).ok();
            let target_cid = parsed_body.as_ref().and_then(|v| {
                v.get("channelId")
                    .and_then(|c| c.as_str())
                    .map(|s| s.to_string())
            });
            let target_mid = parsed_body.as_ref().and_then(|v| {
                v.get("mediaId")
                    .and_then(|c| c.as_str())
                    .map(|s| s.to_string())
            });

            handle_open_proxy_stream(
                &mut stream,
                &manager,
                &caller,
                target_cid,
                target_mid,
                host_header.as_deref(),
            )
            .await;
        }
        ("POST", "/api/stream/close") => {
            let caller_opt = get_device_by_token(&manager, auth_token.as_deref()).await;
            if caller_opt.is_none() {
                send_unauthorized(&mut stream).await;
                return;
            }
            let caller = caller_opt.unwrap();
            let body = extract_body(&req_str);
            let session_key = serde_json::from_str::<serde_json::Value>(body)
                .ok()
                .and_then(|v| {
                    v.get("sessionKey")
                        .and_then(|s| s.as_str())
                        .map(|s| s.to_string())
                })
                .unwrap_or_default();
            let closed = manager.stream_proxy.close(&session_key, &caller.id);
            let json_body = serde_json::json!({ "ok": closed }).to_string();
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
                json_body.len(),
                json_body
            );
            let _ = stream.write_all(resp.as_bytes()).await;
        }
        ("GET", p) if p.starts_with("/api/stream/resolve") => {
            let caller_opt = get_device_by_token(&manager, auth_token.as_deref()).await;
            if caller_opt.is_none() {
                send_unauthorized(&mut stream).await;
                return;
            }
            let caller = caller_opt.unwrap();
            if !caller.capabilities.contains(&DeviceCapability::ClientSync)
                && !caller
                    .capabilities
                    .contains(&DeviceCapability::PlaybackControl)
            {
                send_forbidden(
                    &mut stream,
                    "Device lacks ClientSync or PlaybackControl capability",
                )
                .await;
                return;
            }

            let mut target_cid: Option<String> = None;
            for pair in query_str.split('&') {
                if let Some((k, v)) = pair.split_once('=') {
                    if k == "channelId" && !v.is_empty() {
                        target_cid = Some(percent_decode_simple(v));
                        break;
                    }
                }
            }

            handle_open_proxy_stream(
                &mut stream,
                &manager,
                &caller,
                target_cid,
                None,
                host_header.as_deref(),
            )
            .await;
        }
        ("GET", p) if p.starts_with("/api/stream/h/") => {
            let rest = &p["/api/stream/h/".len()..];
            let Some((session_key, handle)) = rest.split_once('/') else {
                let err = "HTTP/1.1 404 Not Found\r\nContent-Length: 9\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\nNot Found";
                let _ = stream.write_all(err.as_bytes()).await;
                return;
            };

            let Some(owner_id) = manager.stream_proxy.session_owner(session_key) else {
                let err = "HTTP/1.1 410 Gone\r\nContent-Length: 24\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\nStream session has ended";
                let _ = stream.write_all(err.as_bytes()).await;
                return;
            };

            if !manager.is_device_active(&owner_id).await {
                manager.stream_proxy.revoke_device(&owner_id);
                send_forbidden(&mut stream, "Device authorization has been revoked").await;
                return;
            }

            let reply = manager
                .stream_proxy
                .serve(session_key, handle, range_header.as_deref())
                .await;

            let reason = match reply.status {
                200 => "OK",
                206 => "Partial Content",
                403 => "Forbidden",
                404 => "Not Found",
                410 => "Gone",
                413 => "Payload Too Large",
                415 => "Unsupported Media Type",
                416 => "Range Not Satisfiable",
                502 => "Bad Gateway",
                503 => "Service Unavailable",
                504 => "Gateway Timeout",
                _ => "Error",
            };

            let mut hdr = format!(
                "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n",
                reply.status,
                reason,
                reply.content_type,
                reply.body.len()
            );
            if let Some(cr) = reply.content_range {
                hdr.push_str(&format!("Content-Range: {cr}\r\n"));
            }
            for (k, v) in reply.extra_headers {
                hdr.push_str(&format!("{k}: {v}\r\n"));
            }
            hdr.push_str("\r\n");
            let _ = stream.write_all(hdr.as_bytes()).await;
            let _ = stream.write_all(&reply.body).await;
        }
        ("GET", "/api/sources") => {
            if !validate_token(
                &manager,
                auth_token.as_deref(),
                &[
                    DeviceCapability::MediaBrowse,
                    DeviceCapability::ClientSync,
                    DeviceCapability::AiAgent,
                ],
            )
            .await
            {
                send_unauthorized(&mut stream).await;
                return;
            }

            let state = manager.inner.lock().await;
            let json = serde_json::to_string(&state.sources).unwrap_or_else(|_| "[]".to_string());
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
                json.len(),
                json
            );
            let _ = stream.write_all(resp.as_bytes()).await;
        }
        ("GET", "/api/library") => {
            if !validate_token(
                &manager,
                auth_token.as_deref(),
                &[
                    DeviceCapability::MediaBrowse,
                    DeviceCapability::ClientSync,
                    DeviceCapability::AiAgent,
                ],
            )
            .await
            {
                send_unauthorized(&mut stream).await;
                return;
            }

            let state = manager.inner.lock().await;
            let json = serde_json::to_string(&state.library).unwrap_or_else(|_| "{}".to_string());
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
                json.len(),
                json
            );
            let _ = stream.write_all(resp.as_bytes()).await;
        }
        ("GET", "/api/devices") => {
            if !validate_token(
                &manager,
                auth_token.as_deref(),
                &[DeviceCapability::ClientSync],
            )
            .await
            {
                send_unauthorized(&mut stream).await;
                return;
            }

            let state = manager.inner.lock().await;
            let json =
                serde_json::to_string(&state.trusted_devices).unwrap_or_else(|_| "[]".to_string());
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
                json.len(),
                json
            );
            let _ = stream.write_all(resp.as_bytes()).await;
        }
        ("GET", "/api/audit") => {
            if !validate_token(
                &manager,
                auth_token.as_deref(),
                &[DeviceCapability::ClientSync, DeviceCapability::AiAgent],
            )
            .await
            {
                send_unauthorized(&mut stream).await;
                return;
            }

            let state = manager.inner.lock().await;
            let json = serde_json::to_string(&state.audit_log).unwrap_or_else(|_| "[]".to_string());
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
                json.len(),
                json
            );
            let _ = stream.write_all(resp.as_bytes()).await;
        }
        ("POST", "/api/command") | ("POST", "/command") => {
            let caller_opt = get_device_by_token(&manager, auth_token.as_deref()).await;
            if caller_opt.is_none() {
                send_unauthorized(&mut stream).await;
                return;
            }
            let caller = caller_opt.unwrap();

            let body = extract_body(&req_str);
            if let Ok(cmd_obj) = serde_json::from_str::<serde_json::Value>(body) {
                let cmd_str = cmd_obj
                    .get("command")
                    .and_then(|v| v.as_str())
                    .unwrap_or("noop")
                    .to_string();
                let payload = cmd_obj
                    .get("payload")
                    .cloned()
                    .unwrap_or(serde_json::Value::Null);

                // Audit the command
                {
                    let mut state = manager.inner.lock().await;
                    record_audit_action(
                        &mut state.audit_log,
                        &caller.id,
                        &caller.name,
                        "RemoteControl",
                        &cmd_str,
                        &payload.to_string(),
                        "dispatched",
                    );
                }

                let evt = RemoteCommandEvent {
                    command: cmd_str,
                    payload,
                    client_id: Some(caller.id),
                    timestamp: now_unix_secs(),
                };

                on_command(evt);

                let resp = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 11\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{\"ok\":true}";
                let _ = stream.write_all(resp.as_bytes()).await;
            } else {
                let err_resp = "HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nContent-Length: 26\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{\"error\":\"Invalid JSON\"}";
                let _ = stream.write_all(err_resp.as_bytes()).await;
            }
        }
        ("POST", "/api/agent/command") => {
            let caller_opt = get_device_by_token(&manager, auth_token.as_deref()).await;
            if caller_opt.is_none() {
                send_unauthorized(&mut stream).await;
                return;
            }
            let caller = caller_opt.unwrap();
            if !caller.capabilities.contains(&DeviceCapability::AiAgent) {
                send_forbidden(&mut stream, "Device lacks AiAgent capability").await;
                return;
            }

            let body = extract_body(&req_str);
            if let Ok(cmd_obj) = serde_json::from_str::<serde_json::Value>(body) {
                let action = cmd_obj
                    .get("action")
                    .or_else(|| cmd_obj.get("command"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .trim()
                    .to_ascii_lowercase();
                let payload = cmd_obj
                    .get("payload")
                    .cloned()
                    .unwrap_or(serde_json::Value::Null);

                let (status_code, response_json) = match action.as_str() {
                    "search" => {
                        let q = payload
                            .get("query")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .trim()
                            .to_ascii_lowercase();
                        let state = manager.inner.lock().await;
                        let matched_channels: Vec<RemoteChannelSummary> = state
                            .channels
                            .iter()
                            .filter(|c| {
                                q.is_empty()
                                    || c.name.to_ascii_lowercase().contains(&q)
                                    || c.group
                                        .as_deref()
                                        .unwrap_or("")
                                        .to_ascii_lowercase()
                                        .contains(&q)
                            })
                            .take(25)
                            .map(|c| {
                                let mut clean = c.clone();
                                clean.stream_url = None;
                                clean
                            })
                            .collect();
                        let matched_programmes: Vec<&RemoteEpgProgramme> = state
                            .epg
                            .iter()
                            .filter(|p| {
                                q.is_empty()
                                    || p.title.to_ascii_lowercase().contains(&q)
                                    || p.description
                                        .as_deref()
                                        .unwrap_or("")
                                        .to_ascii_lowercase()
                                        .contains(&q)
                            })
                            .take(25)
                            .collect();
                        let matched_media: Vec<RemoteMediaItem> = state
                            .media
                            .iter()
                            .filter(|m| {
                                q.is_empty()
                                    || m.title.to_ascii_lowercase().contains(&q)
                                    || m.overview
                                        .as_deref()
                                        .unwrap_or("")
                                        .to_ascii_lowercase()
                                        .contains(&q)
                            })
                            .take(25)
                            .map(|m| {
                                let mut clean = m.clone();
                                clean.stream_url = None;
                                clean
                            })
                            .collect();
                        let json = serde_json::json!({
                            "ok": true,
                            "action": "search",
                            "data": {
                                "channels": matched_channels,
                                "programmes": matched_programmes,
                                "media": matched_media
                            }
                        })
                        .to_string();
                        drop(state);
                        if payload
                            .get("navigate")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false)
                        {
                            on_command(RemoteCommandEvent {
                                command: "agent_search".to_string(),
                                payload: payload.clone(),
                                client_id: Some(caller.id.clone()),
                                timestamp: now_unix_secs(),
                            });
                        }
                        let mut state = manager.inner.lock().await;
                        record_audit_action(
                            &mut state.audit_log,
                            &caller.id,
                            &caller.name,
                            "AiAgent",
                            "search",
                            &format!("query_len={}", q.len()),
                            "executed",
                        );
                        (200, json)
                    }
                    "query_epg" => {
                        let cid = payload
                            .get("channelId")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string());
                        let cname = payload
                            .get("channelName")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_ascii_lowercase());
                        let q = payload
                            .get("query")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_ascii_lowercase());
                        let state = manager.inner.lock().await;
                        let matched_ids: Vec<String> = if let Some(ref name_q) = cname {
                            state
                                .channels
                                .iter()
                                .filter(|c| c.name.to_ascii_lowercase().contains(name_q))
                                .map(|c| c.id.clone())
                                .collect()
                        } else {
                            Vec::new()
                        };
                        let programmes: Vec<&RemoteEpgProgramme> = state
                            .epg
                            .iter()
                            .filter(|p| {
                                if let Some(ref target_cid) = cid {
                                    if &p.channel_id != target_cid {
                                        return false;
                                    }
                                }
                                if cname.is_some() && !matched_ids.contains(&p.channel_id) {
                                    return false;
                                }
                                if let Some(ref text_q) = q {
                                    if !p.title.to_ascii_lowercase().contains(text_q)
                                        && !p
                                            .description
                                            .as_deref()
                                            .unwrap_or("")
                                            .to_ascii_lowercase()
                                            .contains(text_q)
                                    {
                                        return false;
                                    }
                                }
                                true
                            })
                            .take(50)
                            .collect();
                        let json = serde_json::json!({
                            "ok": true,
                            "action": "query_epg",
                            "data": { "programmes": programmes }
                        })
                        .to_string();
                        drop(state);
                        let mut state = manager.inner.lock().await;
                        record_audit_action(
                            &mut state.audit_log,
                            &caller.id,
                            &caller.name,
                            "AiAgent",
                            "query_epg",
                            "EPG query answered",
                            "executed",
                        );
                        (200, json)
                    }
                    "status" => {
                        let mut state = manager.inner.lock().await;
                        let active_devices =
                            state.trusted_devices.iter().filter(|d| !d.revoked).count();
                        let json = serde_json::json!({
                            "ok": true,
                            "action": "status",
                            "data": {
                                "mode": state.mode,
                                "playback": state.playback_state,
                                "channelCount": state.channels.len(),
                                "mediaCount": state.media.len(),
                                "epgCount": state.epg.len(),
                                "activeDevices": active_devices
                            }
                        })
                        .to_string();
                        record_audit_action(
                            &mut state.audit_log,
                            &caller.id,
                            &caller.name,
                            "AiAgent",
                            "status",
                            "Status snapshot returned",
                            "executed",
                        );
                        (200, json)
                    }
                    "list_devices" => {
                        let mut state = manager.inner.lock().await;
                        let safe_devices: Vec<serde_json::Value> = state
                            .trusted_devices
                            .iter()
                            .filter(|d| !d.revoked)
                            .map(|d| {
                                serde_json::json!({
                                    "id": d.id,
                                    "name": d.name,
                                    "deviceType": d.device_type,
                                    "capabilities": d.capabilities,
                                    "lastSeenAt": d.last_seen_at
                                })
                            })
                            .collect();
                        let json = serde_json::json!({
                            "ok": true,
                            "action": "list_devices",
                            "data": { "devices": safe_devices }
                        })
                        .to_string();
                        record_audit_action(
                            &mut state.audit_log,
                            &caller.id,
                            &caller.name,
                            "AiAgent",
                            "list_devices",
                            "Listed active devices",
                            "executed",
                        );
                        (200, json)
                    }
                    "tune" | "playback" | "navigate" | "favourites" | "handoff" => {
                        {
                            let mut state = manager.inner.lock().await;
                            record_audit_action(
                                &mut state.audit_log,
                                &caller.id,
                                &caller.name,
                                "AiAgent",
                                &action,
                                &payload.to_string(),
                                "executed",
                            );
                        }
                        on_command(RemoteCommandEvent {
                            command: format!("agent_{action}"),
                            payload,
                            client_id: Some(caller.id),
                            timestamp: now_unix_secs(),
                        });
                        let json = serde_json::json!({
                            "ok": true,
                            "action": action,
                            "dispatched": true
                        })
                        .to_string();
                        (200, json)
                    }
                    _ => {
                        let mut state = manager.inner.lock().await;
                        record_audit_action(
                            &mut state.audit_log,
                            &caller.id,
                            &caller.name,
                            "AiAgent",
                            &action,
                            "Unsupported agent action",
                            "rejected",
                        );
                        (
                            400,
                            r#"{"ok":false,"error":"Unsupported agent action"}"#.to_string(),
                        )
                    }
                };

                let reason = if status_code == 200 {
                    "OK"
                } else {
                    "Bad Request"
                };
                let resp = format!(
                    "HTTP/1.1 {status_code} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
                    response_json.len(),
                    response_json
                );
                let _ = stream.write_all(resp.as_bytes()).await;
            } else {
                let err_resp = "HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nContent-Length: 26\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{\"error\":\"Invalid JSON\"}";
                let _ = stream.write_all(err_resp.as_bytes()).await;
            }
        }
        ("POST", "/api/input") => {
            let caller_opt = get_device_by_token(&manager, auth_token.as_deref()).await;
            if caller_opt.is_none() {
                send_unauthorized(&mut stream).await;
                return;
            }
            let caller = caller_opt.unwrap();
            if !caller.capabilities.contains(&DeviceCapability::InputText)
                && !caller
                    .capabilities
                    .contains(&DeviceCapability::RemoteControl)
            {
                send_forbidden(&mut stream, "Device lacks InputText capability").await;
                return;
            }

            let body = extract_body(&req_str);
            if let Ok(input_obj) = serde_json::from_str::<serde_json::Value>(body) {
                let text = input_obj
                    .get("text")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let char_len = text.chars().count();

                {
                    let mut state = manager.inner.lock().await;
                    record_audit_action(
                        &mut state.audit_log,
                        &caller.id,
                        &caller.name,
                        "InputText",
                        "InputText",
                        &format!("Injected {char_len} characters"),
                        "dispatched",
                    );
                }

                let evt = RemoteCommandEvent {
                    command: "input_text".to_string(),
                    payload: serde_json::json!({ "text": text }),
                    client_id: Some(caller.id),
                    timestamp: now_unix_secs(),
                };

                on_command(evt);

                let resp = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 11\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{\"ok\":true}";
                let _ = stream.write_all(resp.as_bytes()).await;
            } else {
                let err_resp = "HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nContent-Length: 26\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{\"error\":\"Invalid JSON\"}";
                let _ = stream.write_all(err_resp.as_bytes()).await;
            }
        }
        ("POST", "/api/sync/progress") => {
            let caller_opt = get_device_by_token(&manager, auth_token.as_deref()).await;
            if caller_opt.is_none() {
                send_unauthorized(&mut stream).await;
                return;
            }
            let caller = caller_opt.unwrap();
            if !caller.capabilities.contains(&DeviceCapability::ClientSync) {
                send_forbidden(&mut stream, "Device lacks ClientSync capability").await;
                return;
            }

            let body = extract_body(&req_str);
            if let Ok(prog_obj) = serde_json::from_str::<serde_json::Value>(body) {
                let item_ref = prog_obj
                    .get("itemRef")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let title = prog_obj
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let position = prog_obj
                    .get("position")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0);
                let duration = prog_obj
                    .get("duration")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0);
                let remove = prog_obj
                    .get("remove")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                let client_updated_at = prog_obj.get("updatedAt").and_then(|v| v.as_u64());

                if !item_ref.is_empty() {
                    let now = now_unix_secs();
                    let effective_ts = client_updated_at
                        .unwrap_or(now)
                        .min(now.saturating_add(300));
                    let payload = serde_json::json!({
                        "itemRef": item_ref,
                        "title": title,
                        "position": position,
                        "duration": duration,
                        "remove": remove,
                        "updatedAt": effective_ts
                    });
                    let mut ignored_stale = false;
                    {
                        let mut state = manager.inner.lock().await;
                        if remove {
                            state
                                .library
                                .watch_progress
                                .retain(|p| p.item_ref != item_ref);
                        } else if let Some(existing) = state
                            .library
                            .watch_progress
                            .iter_mut()
                            .find(|p| p.item_ref == item_ref)
                        {
                            if let Some(incoming_ts) = client_updated_at {
                                if incoming_ts < existing.updated_at {
                                    ignored_stale = true;
                                }
                            }
                            if !ignored_stale {
                                existing.position = position;
                                existing.duration = duration;
                                existing.updated_at = effective_ts;
                                if !title.is_empty() {
                                    existing.title = title.clone();
                                }
                            }
                        } else {
                            state.library.watch_progress.push(RemoteWatchProgressItem {
                                item_ref: item_ref.clone(),
                                title: title.clone(),
                                position,
                                duration,
                                updated_at: effective_ts,
                            });
                        }

                        if !ignored_stale {
                            if let Some(ref dir) = state.data_dir {
                                save_library_sync_to_disk(dir, &state.library);
                            }

                            record_audit_action(
                                &mut state.audit_log,
                                &caller.id,
                                &caller.name,
                                "ClientSync",
                                if remove {
                                    "RemoveProgress"
                                } else {
                                    "SyncProgress"
                                },
                                &format!("Updated progress for {item_ref}: {position}/{duration}s"),
                                "success",
                            );

                            broadcast_sse_envelope(&mut state, "sync_progress", payload.clone());
                        }
                    }

                    if !ignored_stale {
                        on_command(RemoteCommandEvent {
                            command: "sync_progress".to_string(),
                            payload,
                            client_id: Some(caller.id.clone()),
                            timestamp: effective_ts,
                        });
                    } else {
                        let resp_body = r#"{"ok":true,"ignored":"stale"}"#;
                        let resp = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{resp_body}",
                            resp_body.len()
                        );
                        let _ = stream.write_all(resp.as_bytes()).await;
                        return;
                    }
                }

                let resp = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 11\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{\"ok\":true}";
                let _ = stream.write_all(resp.as_bytes()).await;
            } else {
                let err_resp = "HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nContent-Length: 26\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{\"error\":\"Invalid JSON\"}";
                let _ = stream.write_all(err_resp.as_bytes()).await;
            }
        }
        ("POST", "/api/sync/library") => {
            let caller_opt = get_device_by_token(&manager, auth_token.as_deref()).await;
            if caller_opt.is_none() {
                send_unauthorized(&mut stream).await;
                return;
            }
            let caller = caller_opt.unwrap();
            if !caller.capabilities.contains(&DeviceCapability::ClientSync) {
                send_forbidden(&mut stream, "Device lacks ClientSync capability").await;
                return;
            }

            let body = extract_body(&req_str);
            if let Ok(lib_obj) = serde_json::from_str::<serde_json::Value>(body) {
                let action = lib_obj
                    .get("action")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let id = lib_obj
                    .get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                if !id.is_empty() {
                    let now = now_unix_secs();
                    let payload = {
                        let mut state = manager.inner.lock().await;
                        match action.as_str() {
                            "toggle_favourite" => {
                                if let Some(pos) =
                                    state.library.favourites.iter().position(|f| f == &id)
                                {
                                    state.library.favourites.remove(pos);
                                } else {
                                    state.library.favourites.push(id.clone());
                                }
                            }
                            "toggle_watchlist" => {
                                if let Some(pos) =
                                    state.library.watchlist.iter().position(|w| w == &id)
                                {
                                    state.library.watchlist.remove(pos);
                                } else {
                                    state.library.watchlist.push(id.clone());
                                }
                            }
                            "mark_watched" => {
                                state.library.watch_progress.retain(|p| p.item_ref != id);
                            }
                            _ => {}
                        }

                        if let Some(ref dir) = state.data_dir {
                            save_library_sync_to_disk(dir, &state.library);
                        }

                        record_audit_action(
                            &mut state.audit_log,
                            &caller.id,
                            &caller.name,
                            "ClientSync",
                            &action,
                            &format!("Updated library item {id}"),
                            "success",
                        );

                        let favs = state.library.favourites.clone();
                        let watch = state.library.watchlist.clone();
                        let env_payload = serde_json::json!({
                            "action": action,
                            "id": id,
                            "favourites": favs,
                            "watchlist": watch
                        });
                        broadcast_sse_envelope(&mut state, "sync_library", env_payload.clone());
                        env_payload
                    };

                    on_command(RemoteCommandEvent {
                        command: "sync_library".to_string(),
                        payload,
                        client_id: Some(caller.id.clone()),
                        timestamp: now,
                    });
                }

                let resp = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 11\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{\"ok\":true}";
                let _ = stream.write_all(resp.as_bytes()).await;
            } else {
                let err_resp = "HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nContent-Length: 26\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{\"error\":\"Invalid JSON\"}";
                let _ = stream.write_all(err_resp.as_bytes()).await;
            }
        }
        ("POST", "/api/cast") => {
            let caller_opt = get_device_by_token(&manager, auth_token.as_deref()).await;
            if caller_opt.is_none() {
                send_unauthorized(&mut stream).await;
                return;
            }
            let caller = caller_opt.unwrap();
            if !caller.capabilities.contains(&DeviceCapability::MediaCast)
                && !caller
                    .capabilities
                    .contains(&DeviceCapability::PlaybackControl)
                && !caller
                    .capabilities
                    .contains(&DeviceCapability::RemoteControl)
            {
                send_forbidden(&mut stream, "Device lacks MediaCast capability").await;
                return;
            }

            let body = extract_body(&req_str);
            if let Ok(cast_obj) = serde_json::from_str::<serde_json::Value>(body) {
                let title = cast_obj
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Media")
                    .to_string();

                {
                    let mut state = manager.inner.lock().await;
                    record_audit_action(
                        &mut state.audit_log,
                        &caller.id,
                        &caller.name,
                        "MediaCast",
                        "CastMedia",
                        &format!("Received media cast: {title}"),
                        "dispatched",
                    );
                }

                let evt = RemoteCommandEvent {
                    command: "cast_media".to_string(),
                    payload: cast_obj,
                    client_id: Some(caller.id),
                    timestamp: now_unix_secs(),
                };

                on_command(evt);

                let resp = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 11\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{\"ok\":true}";
                let _ = stream.write_all(resp.as_bytes()).await;
            } else {
                let err_resp = "HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nContent-Length: 26\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{\"error\":\"Invalid JSON\"}";
                let _ = stream.write_all(err_resp.as_bytes()).await;
            }
        }
        ("GET", "/api/events") | ("GET", "/events") => {
            if !validate_token(
                &manager,
                auth_token.as_deref(),
                &[
                    DeviceCapability::RemoteControl,
                    DeviceCapability::PlaybackControl,
                    DeviceCapability::MediaBrowse,
                    DeviceCapability::ClientSync,
                    DeviceCapability::MediaCast,
                    DeviceCapability::AiAgent,
                ],
            )
            .await
            {
                send_unauthorized(&mut stream).await;
                return;
            }

            let (tx, mut rx) = mpsc::unbounded_channel();
            {
                let mut state = manager.inner.lock().await;
                state.sse_senders.push(tx);
            }

            let initial_json = {
                let state = manager.inner.lock().await;
                serde_json::to_string(&state.playback_state).unwrap_or_else(|_| "{}".to_string())
            };

            let headers = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: keep-alive\r\nAccess-Control-Allow-Origin: *\r\n\r\n";
            if stream.write_all(headers.as_bytes()).await.is_err() {
                return;
            }

            let init_msg = format!("data: {initial_json}\n\n");
            if stream.write_all(init_msg.as_bytes()).await.is_err() {
                return;
            }

            while let Some(msg) = rx.recv().await {
                if stream.write_all(msg.as_bytes()).await.is_err() {
                    break;
                }
            }
        }
        _ => {
            let not_found =
                "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
            let _ = stream.write_all(not_found.as_bytes()).await;
        }
    }
}

fn extract_body(request: &str) -> &str {
    if let Some(idx) = request.find("\r\n\r\n") {
        return &request[idx + 4..];
    }
    if let Some(idx) = request.find("\n\n") {
        return &request[idx + 2..];
    }
    ""
}

async fn get_device_by_token(
    manager: &RemoteServerManager,
    token: Option<&str>,
) -> Option<TrustedDevice> {
    let tok = token?;
    let mut state = manager.inner.lock().await;
    for dev in &mut state.trusted_devices {
        if dev.auth_token == tok && !dev.revoked {
            dev.last_seen_at = now_unix_secs();
            return Some(dev.clone());
        }
    }
    None
}

async fn validate_token(
    manager: &RemoteServerManager,
    token: Option<&str>,
    required_caps: &[DeviceCapability],
) -> bool {
    let tok = match token {
        Some(t) => t,
        None => return false,
    };
    let mut state = manager.inner.lock().await;
    for dev in &mut state.trusted_devices {
        if dev.auth_token == tok && !dev.revoked {
            dev.last_seen_at = now_unix_secs();
            if required_caps.is_empty() {
                return true;
            }
            return required_caps
                .iter()
                .any(|cap| dev.capabilities.contains(cap));
        }
    }
    false
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PairResponse {
    ok: bool,
    token: String,
    device_id: String,
    device_name: String,
    server_version: String,
    capabilities: Vec<DeviceCapability>,
}

async fn handle_pair_request(
    manager: &RemoteServerManager,
    body_str: &str,
    ip: String,
    ua: Option<String>,
) -> Result<PairResponse, String> {
    let parsed: serde_json::Value =
        serde_json::from_str(body_str).map_err(|_| "Malformed request body.".to_string())?;
    let pin_attempt = parsed
        .get("pin")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    let client_name = parsed
        .get("deviceName")
        .and_then(|v| v.as_str())
        .unwrap_or("Mobile Remote")
        .trim();
    let dev_type_str = parsed
        .get("deviceType")
        .and_then(|v| v.as_str())
        .unwrap_or("phone");

    let device_type = match dev_type_str.to_lowercase().as_str() {
        "tablet" => DeviceType::Tablet,
        "tv" => DeviceType::Tv,
        "aiagent" | "agent" => DeviceType::AiAgent,
        "desktopclient" | "desktop" => DeviceType::DesktopClient,
        _ => DeviceType::Phone,
    };

    let mut state = manager.inner.lock().await;

    // Check lockout
    if let Some(lockout) = state.lockout_until {
        if Instant::now() < lockout {
            let secs_left = lockout.duration_since(Instant::now()).as_secs();
            return Err(format!(
                "Too many failed attempts. Try again in {secs_left}s."
            ));
        } else {
            state.lockout_until = None;
            state.failed_attempts = 0;
        }
    }

    if pin_attempt == state.pairing_pin {
        state.failed_attempts = 0;
        state.lockout_until = None;

        let token = generate_auth_token();
        let device_id = generate_device_id();

        let capabilities = match device_type {
            DeviceType::AiAgent => vec![
                DeviceCapability::AiAgent,
                DeviceCapability::MediaBrowse,
                DeviceCapability::PlaybackControl,
                DeviceCapability::RemoteControl,
            ],
            DeviceType::DesktopClient => vec![
                DeviceCapability::ClientSync,
                DeviceCapability::MediaBrowse,
                DeviceCapability::PlaybackControl,
                DeviceCapability::MediaCast,
            ],
            _ => vec![
                DeviceCapability::RemoteControl,
                DeviceCapability::PlaybackControl,
                DeviceCapability::InputText,
                DeviceCapability::MediaBrowse,
                DeviceCapability::MediaCast,
            ],
        };

        let trusted = TrustedDevice {
            id: device_id.clone(),
            name: client_name.to_string(),
            device_type,
            capabilities: capabilities.clone(),
            auth_token: token.clone(),
            paired_at: now_unix_secs(),
            last_seen_at: now_unix_secs(),
            ip_address: Some(ip),
            user_agent: ua,
            revoked: false,
        };

        state.trusted_devices.push(trusted.clone());

        if let Some(ref dir) = state.data_dir {
            save_trusted_devices_to_disk(dir, &state.trusted_devices);
        }

        record_audit_action(
            &mut state.audit_log,
            &device_id,
            client_name,
            "Authentication",
            "PairDevice",
            "Device paired successfully via PIN",
            "success",
        );

        Ok(PairResponse {
            ok: true,
            token,
            device_id,
            device_name: client_name.to_string(),
            server_version: "0.6.0".to_string(),
            capabilities,
        })
    } else {
        state.failed_attempts += 1;
        if state.failed_attempts >= MAX_FAILED_ATTEMPTS {
            state.lockout_until = Some(Instant::now() + Duration::from_secs(LOCKOUT_DURATION_SECS));
            Err("Maximum attempts exceeded. Server locked for 30s.".to_string())
        } else {
            let remaining = MAX_FAILED_ATTEMPTS - state.failed_attempts;
            Err(format!(
                "Invalid pairing PIN. {remaining} attempts remaining."
            ))
        }
    }
}

async fn send_unauthorized(stream: &mut TcpStream) {
    let resp = "HTTP/1.1 401 Unauthorized\r\nContent-Type: application/json\r\nContent-Length: 35\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{\"ok\":false,\"error\":\"Unauthorized\"}";
    let _ = stream.write_all(resp.as_bytes()).await;
}

async fn send_forbidden(stream: &mut TcpStream, reason: &str) {
    let body = format!(r#"{{"ok":false,"error":"{reason}"}}"#);
    let resp = format!(
        "HTTP/1.1 403 Forbidden\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = stream.write_all(resp.as_bytes()).await;
}

fn percent_decode_simple(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(hex) = std::str::from_utf8(&bytes[i + 1..i + 3]) {
                if let Ok(val) = u8::from_str_radix(hex, 16) {
                    out.push(val);
                    i += 3;
                    continue;
                }
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

async fn handle_open_proxy_stream(
    stream: &mut TcpStream,
    manager: &RemoteServerManager,
    caller: &TrustedDevice,
    target_cid: Option<String>,
    target_mid: Option<String>,
    host_header: Option<&str>,
) {
    let (found_stream, found_local_file, local_roots, local_ip, port) = {
        let state = manager.inner.lock().await;
        let found = if let Some(ref cid) = target_cid {
            state
                .channels
                .iter()
                .find(|c| &c.id == cid)
                .and_then(|c| c.stream_url.clone())
        } else if let Some(ref mid) = target_mid {
            state
                .media
                .iter()
                .find(|m| &m.id == mid)
                .and_then(|m| m.stream_url.clone())
        } else {
            None
        };
        let local_file = target_mid
            .as_ref()
            .and_then(|mid| state.local_media_files.get(mid).cloned());
        (
            found,
            local_file,
            state.local_media_roots.clone(),
            state.local_ip.clone(),
            state.port,
        )
    };

    let target_label = if let Some(ref cid) = target_cid {
        format!("channelId={cid}")
    } else if let Some(ref mid) = target_mid {
        format!("mediaId={mid}")
    } else {
        "unknown".to_string()
    };

    let open_result = if let Some(ref local_path) = found_local_file {
        manager
            .stream_proxy
            .open_local_file(&caller.id, local_path, &local_roots)
    } else if let Some(upstream_url) = found_stream {
        manager.stream_proxy.open(&caller.id, &upstream_url)
    } else {
        let err_body = r#"{"ok":false,"error":"Channel or media stream not found"}"#;
        let resp = format!(
            "HTTP/1.1 404 Not Found\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
            err_body.len(),
            err_body
        );
        let _ = stream.write_all(resp.as_bytes()).await;
        return;
    };

    match open_result {
        Ok(opened) => {
            {
                let mut state = manager.inner.lock().await;
                record_audit_action(
                    &mut state.audit_log,
                    &caller.id,
                    &caller.name,
                    "ClientSync",
                    "OpenProxyStream",
                    &target_label,
                    "success",
                );
            }
            let host_authority = host_header
                .map(|h| h.trim().to_string())
                .filter(|h| !h.is_empty() && !h.contains('/') && !h.contains('@'))
                .unwrap_or_else(|| format!("{local_ip}:{port}"));
            let proxy_url = format!("http://{host_authority}{}", opened.proxy_path);
            let json_body = serde_json::json!({
                "ok": true,
                "channelId": target_cid.unwrap_or_default(),
                "mediaId": target_mid.unwrap_or_default(),
                "sessionKey": opened.session_key,
                "proxyPath": opened.proxy_path,
                "streamUrl": proxy_url,
                "format": opened.format
            })
            .to_string();
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
                json_body.len(),
                json_body
            );
            let _ = stream.write_all(resp.as_bytes()).await;
        }
        Err(reason) => {
            let json_body = serde_json::json!({
                "ok": false,
                "error": reason
            })
            .to_string();
            let resp = format!(
                "HTTP/1.1 403 Forbidden\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
                json_body.len(),
                json_body
            );
            let _ = stream.write_all(resp.as_bytes()).await;
        }
    }
}

pub fn get_pwa_manifest_json() -> &'static str {
    r##"{"name":"Kinora TV Remote","short_name":"Kinora","description":"Wireless companion remote for Kinora TV","start_url":"/","display":"standalone","orientation":"portrait","background_color":"#050507","theme_color":"#050507","icons":[{"src":"/icon.svg","sizes":"any","type":"image/svg+xml","purpose":"any maskable"}]}"##
}

pub fn get_pwa_icon_svg() -> &'static str {
    r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#050507"/><g transform="translate(8 8) scale(1.5)"><path d="M6 5.5C6 4.7 6.7 4 7.5 4h3c.8 0 1.5.7 1.5 1.5v21c0 .8-.7 1.5-1.5 1.5h-3C6.7 28 6 27.3 6 26.5z" fill="#E50914"/><path d="M11 15l9.5-10.2c.5-.5 1.2-.8 1.9-.8H25c.8 0 1.4.8 1 1.6L24 10l-8.5 5.5z" fill="#ff3d4a"/><path d="M15.5 16.5L24 22l2 4.4c.4.8-.2 1.6-1 1.6h-2.6c-.7 0-1.4-.3-1.9-.8L11 17z" fill="#9e040c"/><path d="M7.5 9.5c0-.7.8-1.2 1.4-.8L19 15.2c.6.4.6 1.2 0 1.6L8.9 23.3c-.6.4-1.4-.1-1.4-.8z" fill="#050507"/><path d="M9.2 11.4c0-.5.6-.8 1-.6L17 15.5c.4.3.4.7 0 1l-6.8 4.7c-.4.2-1-.1-1-.6z" fill="#E50914"/></g></svg>"##
}

pub fn get_embedded_remote_html() -> &'static str {
    r##"<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>Kinora Remote</title>
  <meta name="theme-color" content="#050507">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="Kinora">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="apple-touch-icon" href="/icon.svg">
  <link rel="icon" type="image/svg+xml" href="/icon.svg">
  <style>
    :root {
      --bg: #050507;
      --nav: #000000;
      --surface: #0e0e12;
      --surface-2: #14141a;
      --surface-3: #1a1a22;
      --line: rgba(255, 255, 255, 0.08);
      --line-strong: rgba(255, 255, 255, 0.16);
      --text: #f5f5f5;
      --text-2: #b4b7bd;
      --text-3: #9a9fa8;
      --accent: #E50914;
      --accent-hover: #F40612;
      --accent-active: #B90018;
      --accent-text: #ff6b73;
      --ok: #3ecf8e;
      --warn: #f2b84b;
      --bad: #ff7070;
      --radius-sm: 6px;
      --radius: 8px;
      --radius-lg: 12px;
      --focus-ring: 0 0 0 2px #050507, 0 0 0 4px #ff6b73;
      --header-h: 52px;
      --nav-h: 58px;
    }

    * {
      box-sizing: border-box;
      -webkit-tap-highlight-color: transparent;
      margin: 0;
      padding: 0;
    }

    html, body {
      height: 100%;
      background: var(--bg);
      color: var(--text);
      font-family: "Hanken Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }

    body {
      height: 100dvh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      padding-top: env(safe-area-inset-top);
      padding-left: env(safe-area-inset-left);
      padding-right: env(safe-area-inset-right);
    }

    button, input {
      font-family: inherit;
      color: inherit;
    }

    button:focus-visible,
    input:focus-visible {
      outline: none;
      box-shadow: var(--focus-ring);
    }

    /* Top App Header */
    .header {
      flex: none;
      height: var(--header-h);
      z-index: 20;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 0 16px;
      background: var(--nav);
      border-bottom: 1px solid var(--line);
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .brand-mark {
      flex: none;
      filter: drop-shadow(0 2px 8px rgba(229, 9, 20, 0.35));
    }

    .brand-wordmark {
      display: inline-flex;
      align-items: flex-start;
      gap: 3.5px;
      white-space: nowrap;
      line-height: 1;
    }

    .brand-name {
      font-size: 1.05rem;
      font-weight: 800;
      letter-spacing: 0.04em;
      color: #ffffff;
      line-height: 1;
    }

    .brand-tag {
      font-size: 0.68rem;
      font-weight: 800;
      letter-spacing: 0.04em;
      color: var(--accent);
      background: transparent;
      border: none;
      padding: 0;
      line-height: 1;
      align-self: flex-start;
      margin-top: 0.5px;
    }

    .header-right {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }

    .conn-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.75rem;
      font-weight: 600;
      line-height: 1;
      color: var(--ok);
    }

    .conn-pill.offline { color: var(--warn); }

    .conn-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: currentColor;
      flex-shrink: 0;
    }

    .btn-unpair {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 32px;
      padding: 0 12px;
      background: var(--surface-2);
      border: 1px solid var(--line-strong);
      border-radius: var(--radius-sm);
      color: var(--text-2);
      font-size: 0.78rem;
      font-weight: 600;
      line-height: 1;
      cursor: pointer;
    }

    .btn-unpair:active {
      background: var(--surface-3);
      color: var(--text);
    }

    /* Pairing Screen */
    #pairingView {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px 20px calc(24px + env(safe-area-inset-bottom));
    }

    .pairing-card {
      width: 100%;
      max-width: 360px;
      background: var(--surface);
      border: 1px solid var(--line-strong);
      border-radius: var(--radius-lg);
      padding: 28px 22px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .pairing-brand {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      text-align: center;
    }

    .pairing-title {
      font-size: 1.25rem;
      font-weight: 700;
      letter-spacing: -0.01em;
    }

    .pairing-sub {
      font-size: 0.875rem;
      line-height: 1.45;
      color: var(--text-2);
    }

    .field-label {
      display: block;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--text-2);
      margin-bottom: 6px;
    }

    .pin-input {
      width: 100%;
      min-height: 56px;
      font-size: 1.75rem;
      font-weight: 800;
      letter-spacing: 0.35em;
      text-align: center;
      padding: 10px 14px;
      background: var(--surface-2);
      border: 1px solid var(--line-strong);
      border-radius: var(--radius);
      color: var(--text);
      font-variant-numeric: tabular-nums;
    }

    .text-input {
      width: 100%;
      min-height: 46px;
      font-size: 0.95rem;
      padding: 10px 14px;
      background: var(--surface-2);
      border: 1px solid var(--line-strong);
      border-radius: var(--radius);
      color: var(--text);
    }

    .text-input::placeholder,
    .pin-input::placeholder {
      color: var(--text-3);
    }

    .btn-primary {
      width: 100%;
      min-height: 48px;
      background: var(--accent);
      border: 1px solid var(--accent);
      color: #ffffff;
      font-size: 0.95rem;
      font-weight: 700;
      border-radius: var(--radius);
      cursor: pointer;
      transition: background-color 120ms ease, transform 90ms ease;
    }

    .btn-primary:hover { background: var(--accent-hover); }
    .btn-primary:active { background: var(--accent-active); transform: scale(0.98); }

    .pair-error {
      min-height: 20px;
      font-size: 0.84rem;
      color: var(--bad);
      text-align: center;
    }

    /* Authenticated Main Shell */
    #mainViews {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
    }

    .view-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 12px 14px calc(var(--nav-h) + 16px + env(safe-area-inset-bottom));
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      max-width: 520px;
      width: 100%;
      margin: 0 auto;
      min-height: 0;
    }

    /* Main Remote Tab: engineered to fit cleanly on ONE phone screen without scrolling */
    #viewRemote {
      gap: 10px;
      padding: 10px 14px calc(var(--nav-h) + 10px + env(safe-area-inset-bottom));
      justify-content: space-between;
      overflow-y: auto;
    }

    /* Feedback Toast */
    .toast {
      position: fixed;
      top: calc(var(--header-h) + 8px + env(safe-area-inset-top));
      left: 50%;
      transform: translateX(-50%) translateY(-8px);
      z-index: 40;
      background: var(--surface-3);
      border: 1px solid var(--line-strong);
      color: var(--text);
      padding: 7px 14px;
      border-radius: var(--radius);
      font-size: 0.8rem;
      font-weight: 600;
      opacity: 0;
      pointer-events: none;
      transition: opacity 150ms ease, transform 150ms ease;
      max-width: calc(100vw - 32px);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .toast.show {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }

    /* Now Playing Card */
    .now-playing {
      flex: none;
      background: var(--surface);
      border: 1px solid var(--line-strong);
      border-radius: var(--radius);
      padding: 10px 14px;
      display: flex;
      flex-direction: column;
      gap: 7px;
    }

    .np-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .np-meta { min-width: 0; flex: 1; }

    .np-title {
      font-size: 0.94rem;
      font-weight: 700;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .np-channel {
      font-size: 0.76rem;
      color: var(--text-2);
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .live-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 3px 8px;
      border-radius: 4px;
      background: var(--accent);
      color: #ffffff;
      font-size: 0.68rem;
      font-weight: 800;
      letter-spacing: 0.06em;
      line-height: 1;
      flex-shrink: 0;
    }

    .live-badge.vod {
      background: var(--surface-3);
      color: var(--text-2);
      border: 1px solid var(--line-strong);
    }

    .seek-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .seek-time {
      font-size: 0.72rem;
      color: var(--text-2);
      font-variant-numeric: tabular-nums;
      min-width: 36px;
    }

    .seek-time.right { text-align: right; }

    .seek-slider {
      flex: 1;
      accent-color: var(--accent);
      height: 5px;
      cursor: pointer;
    }

    .seek-slider:disabled {
      opacity: 0.45;
      cursor: default;
    }

    /* Sculpted Hardware D-Pad & Couch Swipe Trackpad */
    .dpad-stage {
      flex: 1;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 176px;
    }

    .pad-mode-bar {
      position: absolute;
      top: 0;
      right: 0;
      display: inline-flex;
      background: var(--surface);
      border: 1px solid var(--line-strong);
      border-radius: 999px;
      padding: 2px;
      gap: 2px;
      z-index: 4;
    }

    .pad-mode-btn {
      min-height: 26px;
      padding: 2px 9px;
      border: none;
      border-radius: 999px;
      background: transparent;
      color: var(--text-2);
      font-size: 0.68rem;
      font-weight: 700;
      cursor: pointer;
    }

    .pad-mode-btn.active {
      background: var(--accent);
      color: #ffffff;
    }

    .trackpad-surface {
      width: min(260px, 100%);
      height: clamp(168px, 24dvh, 206px);
      border-radius: 18px;
      background: radial-gradient(circle at 50% 45%, var(--surface-2) 0%, var(--surface) 100%);
      border: 1px solid var(--line-strong);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 10px 26px rgba(0, 0, 0, 0.45);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      touch-action: none;
      user-select: none;
      cursor: pointer;
      transition: border-color 120ms ease, background-color 120ms ease;
    }

    .trackpad-surface.active-pulse {
      border-color: var(--accent);
    }

    .trackpad-hint {
      font-size: 0.8rem;
      font-weight: 700;
      color: var(--text);
    }

    .trackpad-sub {
      font-size: 0.7rem;
      color: var(--text-3);
    }

    .keypad-actions-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .dpad-ring {
      width: clamp(176px, 26dvh, 212px);
      height: clamp(176px, 26dvh, 212px);
      position: relative;
      border-radius: 50%;
      background: var(--surface);
      border: 1px solid var(--line-strong);
      box-shadow: 0 10px 26px rgba(0, 0, 0, 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .dpad-btn {
      position: absolute;
      width: 50px;
      height: 44px;
      background: var(--surface-2);
      border: 1px solid var(--line);
      color: var(--text);
      border-radius: var(--radius);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background-color 100ms ease, transform 90ms ease;
    }

    .dpad-btn:active {
      background: var(--surface-3);
      border-color: var(--line-strong);
      transform: scale(0.94);
    }

    .dpad-up { top: 8px; left: 50%; transform: translateX(-50%); }
    .dpad-up:active { transform: translateX(-50%) scale(0.94); }
    .dpad-down { bottom: 8px; left: 50%; transform: translateX(-50%); }
    .dpad-down:active { transform: translateX(-50%) scale(0.94); }
    .dpad-left { left: 8px; top: 50%; width: 44px; height: 50px; transform: translateY(-50%); }
    .dpad-left:active { transform: translateY(-50%) scale(0.94); }
    .dpad-right { right: 8px; top: 50%; width: 44px; height: 50px; transform: translateY(-50%); }
    .dpad-right:active { transform: translateY(-50%) scale(0.94); }

    .dpad-ok {
      width: 68px;
      height: 68px;
      border-radius: 50%;
      background: var(--accent);
      border: 2px solid #ff4d57;
      color: #ffffff;
      font-size: 0.92rem;
      font-weight: 800;
      letter-spacing: 0.04em;
      cursor: pointer;
      box-shadow: 0 0 20px rgba(229, 9, 20, 0.35);
      transition: background-color 100ms ease, transform 90ms ease;
    }

    .dpad-ok:active {
      background: var(--accent-active);
      transform: scale(0.93);
    }

    /* Action & Transport Rows */
    .remote-controls {
      flex: none;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .action-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }

    .ctrl-btn {
      min-height: 44px;
      padding: 6px 6px;
      background: var(--surface);
      border: 1px solid var(--line-strong);
      border-radius: var(--radius);
      color: var(--text);
      font-size: 0.82rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      cursor: pointer;
      transition: background-color 100ms ease, transform 90ms ease;
    }

    .ctrl-btn:active {
      background: var(--surface-3);
      transform: scale(0.96);
    }

    .ctrl-btn.is-active {
      background: rgba(229, 9, 20, 0.16);
      border-color: var(--accent);
      color: var(--text);
    }

    /* Compact Horizontal Volume & Channel Rockers (fits one screen, >=44px targets) */
    .rockers {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .rocker {
      background: var(--surface);
      border: 1px solid var(--line-strong);
      border-radius: var(--radius);
      display: grid;
      grid-template-columns: 44px 1fr 44px;
      align-items: center;
      min-height: 46px;
      overflow: hidden;
    }

    .rocker-btn {
      min-height: 46px;
      width: 44px;
      background: var(--surface-2);
      border: none;
      color: var(--text);
      font-size: 1.15rem;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .rocker-btn:active { background: var(--surface-3); }

    .rocker-label {
      text-align: center;
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-2);
      padding: 0 4px;
      border-left: 1px solid var(--line);
      border-right: 1px solid var(--line);
      line-height: 46px;
    }

    /* Keypad & Typing View */
    .panel {
      background: var(--surface);
      border: 1px solid var(--line-strong);
      border-radius: var(--radius);
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .section-heading {
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--text-2);
      letter-spacing: 0.02em;
    }

    .keypad-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      max-width: 340px;
      width: 100%;
      margin: 0 auto;
    }

    .key-btn {
      min-height: 48px;
      background: var(--surface);
      border: 1px solid var(--line-strong);
      border-radius: var(--radius);
      color: var(--text);
      font-size: 1.2rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      cursor: pointer;
    }

    .key-btn:active {
      background: var(--accent);
      border-color: var(--accent);
      color: #ffffff;
    }

    .key-btn.key-action {
      font-size: 0.85rem;
      color: var(--text-2);
      background: var(--surface-2);
    }

    /* Search & Filter Toolbar */
    .toolbar {
      display: flex;
      gap: 8px;
      align-items: center;
      flex: none;
    }

    .btn-ghost {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 46px;
      padding: 0 14px;
      background: var(--surface-2);
      border: 1px solid var(--line-strong);
      border-radius: var(--radius);
      color: var(--text);
      font-size: 0.82rem;
      font-weight: 600;
      line-height: 1;
      cursor: pointer;
      flex-shrink: 0;
    }

    .btn-ghost:active { background: var(--surface-3); }

    /* Channel Rows with Crisp Logos / Kinora Monogram Tiles */
    .list-stack {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .channel-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      background: var(--surface);
      border: 1px solid var(--line-strong);
      border-radius: var(--radius);
      cursor: pointer;
      transition: border-color 120ms ease, background-color 120ms ease;
    }

    .channel-item:active {
      background: var(--surface-2);
      border-color: var(--accent);
    }

    .art-tile {
      width: 52px;
      height: 38px;
      border-radius: var(--radius-sm);
      background: var(--surface-2);
      border: 1px solid var(--line-strong);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      overflow: hidden;
      position: relative;
      font-size: 0.76rem;
      font-weight: 800;
      letter-spacing: 0.04em;
      color: var(--text);
    }

    .art-tile.poster {
      width: 46px;
      height: 68px;
    }

    .art-tile img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .item-body {
      min-width: 0;
      flex: 1;
    }

    .item-head {
      display: flex;
      align-items: baseline;
      gap: 6px;
    }

    .channel-num {
      font-size: 0.76rem;
      font-weight: 700;
      color: var(--accent-text);
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
    }

    .item-title {
      font-size: 0.94rem;
      font-weight: 700;
      color: var(--text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .item-sub {
      font-size: 0.78rem;
      color: var(--text-2);
      margin-top: 3px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .kind-tag {
      display: inline-block;
      font-size: 0.66rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--surface-3);
      border: 1px solid var(--line-strong);
      color: var(--text-2);
      margin-right: 6px;
      vertical-align: middle;
    }

    .btn-watch {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 36px;
      padding: 0 12px;
      background: var(--accent);
      border: none;
      border-radius: var(--radius-sm);
      color: #ffffff;
      font-size: 0.78rem;
      font-weight: 700;
      line-height: 1;
      cursor: pointer;
      flex-shrink: 0;
    }

    .btn-watch:active { background: var(--accent-active); }

    /* EPG Guide Cards */
    .epg-card {
      background: var(--surface);
      border: 1px solid var(--line-strong);
      border-radius: var(--radius);
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      cursor: pointer;
    }

    .epg-card:active {
      background: var(--surface-2);
      border-color: var(--accent);
    }

    .epg-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .epg-ch {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      flex: 1;
    }

    .epg-now {
      font-size: 0.94rem;
      font-weight: 700;
      color: var(--text);
    }

    .epg-meta {
      font-size: 0.78rem;
      color: var(--text-2);
      font-variant-numeric: tabular-nums;
    }

    .epg-bar {
      width: 100%;
      height: 4px;
      background: var(--surface-3);
      border-radius: 2px;
      overflow: hidden;
    }

    .epg-bar-fill {
      height: 100%;
      background: var(--accent);
    }

    .epg-next {
      font-size: 0.78rem;
      color: var(--text-2);
      border-top: 1px solid var(--line);
      padding-top: 7px;
    }

    /* Empty, Loading, and Error States (R-27) */
    .state-box {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      padding: 28px 18px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }

    .state-title {
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--text);
    }

    .state-desc {
      font-size: 0.84rem;
      color: var(--text-2);
      line-height: 1.45;
      max-width: 280px;
    }

    /* Fixed Mobile Bottom Tab Bar */
    .bottom-nav {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 30;
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      background: var(--nav);
      border-top: 1px solid var(--line-strong);
      padding-bottom: env(safe-area-inset-bottom);
      padding-left: env(safe-area-inset-left);
      padding-right: env(safe-area-inset-right);
    }

    .tab-btn {
      min-height: var(--nav-h);
      background: transparent;
      border: none;
      border-top: 2px solid transparent;
      color: var(--text-3);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 6px 2px;
      font-size: 0.7rem;
      font-weight: 600;
      cursor: pointer;
      transition: color 120ms ease, background-color 120ms ease;
    }

    .tab-btn.active {
      color: var(--text);
      border-top-color: var(--accent);
      background: linear-gradient(180deg, rgba(229, 9, 20, 0.16) 0%, rgba(229, 9, 20, 0) 100%);
    }

    .tab-btn.active svg {
      color: var(--accent-text);
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        transition-duration: 0.01ms !important;
      }
    }
  </style>
</head>
<body>
  <header class="header">
    <div class="brand">
      <svg class="brand-mark" width="24" height="24" viewBox="0 0 32 32" aria-hidden="true">
        <defs>
          <linearGradient id="kp-stem" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#b80610"/>
            <stop offset="40%" stop-color="#e50914"/>
            <stop offset="100%" stop-color="#ff3d4a"/>
          </linearGradient>
          <linearGradient id="kp-up" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stop-color="#e50914"/>
            <stop offset="55%" stop-color="#ff3d4a"/>
            <stop offset="100%" stop-color="#ff6b75"/>
          </linearGradient>
          <linearGradient id="kp-lo" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#9e040c"/>
            <stop offset="100%" stop-color="#5e0105"/>
          </linearGradient>
          <linearGradient id="kp-core" x1="0" y1="0" x2="1" y2="0.5">
            <stop offset="0%" stop-color="#ff4f5c"/>
            <stop offset="50%" stop-color="#e50914"/>
            <stop offset="100%" stop-color="#b80610"/>
          </linearGradient>
        </defs>
        <path d="M6 5.5 C6 4.7 6.7 4 7.5 4 L10.5 4 C11.3 4 12 4.7 12 5.5 L12 26.5 C12 27.3 11.3 28 10.5 28 L7.5 28 C6.7 28 6 27.3 6 26.5 Z" fill="url(#kp-stem)"/>
        <path d="M11 15 L20.5 4.8 C21 4.3 21.7 4 22.4 4 L25 4 C25.8 4 26.4 4.8 26 5.6 L24 10 L15.5 15.5 Z" fill="url(#kp-up)"/>
        <path d="M15.5 16.5 L24 22 L26 26.4 C26.4 27.2 25.8 28 25 28 L22.4 28 C21.7 28 21 27.7 20.5 27.2 L11 17 Z" fill="url(#kp-lo)"/>
        <path d="M7.5 9.5 C7.5 8.8 8.3 8.3 8.9 8.7 L19 15.2 C19.6 15.6 19.6 16.4 19 16.8 L8.9 23.3 C8.3 23.7 7.5 23.2 7.5 22.5 Z" fill="#050507" stroke="#1a1a22" stroke-width="0.6"/>
        <path d="M9.2 11.4 C9.2 10.9 9.8 10.6 10.2 10.8 L17 15.5 C17.4 15.8 17.4 16.2 17 16.5 L10.2 21.2 C9.8 21.4 9.2 21.1 9.2 20.6 Z" fill="url(#kp-core)"/>
      </svg>
      <div class="brand-wordmark">
        <span class="brand-name">KINORA</span>
        <span class="brand-tag">TV</span>
      </div>
    </div>
    <div class="header-right">
      <span class="conn-pill" id="connPill" style="display:none;">
        <span class="conn-dot" aria-hidden="true"></span>
        <span id="connText">Connected</span>
      </span>
      <button type="button" class="btn-unpair" id="btnDisconnect" style="display:none;" onclick="disconnect()">Unpair</button>
    </div>
  </header>

  <div id="toast" class="toast" role="status" aria-live="polite"></div>

  <!-- Pairing PIN View -->
  <main id="pairingView">
    <div class="pairing-card">
      <div class="pairing-brand">
        <svg width="48" height="48" viewBox="0 0 32 32" aria-hidden="true">
          <path d="M6 5.5 C6 4.7 6.7 4 7.5 4 L10.5 4 C11.3 4 12 4.7 12 5.5 L12 26.5 C12 27.3 11.3 28 10.5 28 L7.5 28 C6.7 28 6 27.3 6 26.5 Z" fill="url(#kp-stem)"/>
          <path d="M11 15 L20.5 4.8 C21 4.3 21.7 4 22.4 4 L25 4 C25.8 4 26.4 4.8 26 5.6 L24 10 L15.5 15.5 Z" fill="url(#kp-up)"/>
          <path d="M15.5 16.5 L24 22 L26 26.4 C26.4 27.2 25.8 28 25 28 L22.4 28 C21.7 28 21 27.7 20.5 27.2 L11 17 Z" fill="url(#kp-lo)"/>
          <path d="M7.5 9.5 C7.5 8.8 8.3 8.3 8.9 8.7 L19 15.2 C19.6 15.6 19.6 16.4 19 16.8 L8.9 23.3 C8.3 23.7 7.5 23.2 7.5 22.5 Z" fill="#050507" stroke="#1a1a22" stroke-width="0.6"/>
          <path d="M9.2 11.4 C9.2 10.9 9.8 10.6 10.2 10.8 L17 15.5 C17.4 15.8 17.4 16.2 17 16.5 L10.2 21.2 C9.8 21.4 9.2 21.1 9.2 20.6 Z" fill="url(#kp-core)"/>
        </svg>
        <h1 class="pairing-title">Pair With Kinora</h1>
        <p class="pairing-sub">Enter the pairing PIN shown on your Kinora screen to connect this remote.</p>
      </div>
      <div>
        <label class="field-label" for="pinInput">Pairing PIN</label>
        <input type="text" id="pinInput" class="pin-input" pattern="[0-9]*" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="one-time-code" autofocus>
      </div>
      <div>
        <label class="field-label" for="nameInput">Device Name</label>
        <input type="text" id="nameInput" class="text-input" placeholder="Your Phone Name">
      </div>
      <div id="pairError" class="pair-error" role="alert"></div>
      <button type="button" class="btn-primary" id="btnPair" onclick="pairWithPin()">Pair Remote</button>
    </div>
  </main>

  <!-- Active Remote Shell -->
  <div id="mainViews" style="display:none;">
    <!-- Tab 1: Remote Control -->
    <main id="viewRemote" class="view-content">
      <section class="now-playing" aria-label="Now Playing">
        <div class="np-top">
          <div class="np-meta">
            <div class="np-title" id="npTitle">Kinora TV</div>
            <div class="np-channel" id="npChannel">Connected and ready</div>
          </div>
          <span class="live-badge" id="npBadge">LIVE</span>
        </div>
        <div class="seek-row">
          <span class="seek-time" id="npTimeCur">0:00</span>
          <input type="range" id="seekSlider" class="seek-slider" min="0" max="100" value="0" aria-label="Playback position" disabled>
          <span class="seek-time right" id="npTimeDur">LIVE</span>
        </div>
      </section>

      <section class="dpad-stage" aria-label="Navigation pad">
        <div class="pad-mode-bar" role="tablist" aria-label="Navigation mode">
          <button type="button" class="pad-mode-btn active" id="modeDpadBtn" onclick="setPadMode('dpad')">D-Pad</button>
          <button type="button" class="pad-mode-btn" id="modeTrackpadBtn" onclick="setPadMode('trackpad')">Swipe</button>
        </div>
        <div class="dpad-ring" id="dpadRing">
          <button type="button" class="dpad-btn dpad-up" aria-label="Navigate Up" onclick="sendCmd('dpad_up')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
          <button type="button" class="dpad-btn dpad-down" aria-label="Navigate Down" onclick="sendCmd('dpad_down')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <button type="button" class="dpad-btn dpad-left" aria-label="Navigate Left" onclick="sendCmd('dpad_left')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button type="button" class="dpad-btn dpad-right" aria-label="Navigate Right" onclick="sendCmd('dpad_right')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <button type="button" class="dpad-ok" aria-label="Select OK" onclick="sendCmd('dpad_select')">OK</button>
        </div>
        <div class="trackpad-surface" id="trackpadSurface" style="display:none;" role="application" aria-label="Swipe trackpad">
          <div class="trackpad-hint" id="trackpadLabel">Swipe to Navigate</div>
          <div class="trackpad-sub">Tap = OK / Double-Tap = Back</div>
        </div>
      </section>

      <div class="remote-controls">
        <div class="action-grid">
          <button type="button" class="ctrl-btn" onclick="sendCmd('back')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
            <span>Back</span>
          </button>
          <button type="button" class="ctrl-btn" onclick="sendCmd('home')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>
            <span>Home</span>
          </button>
          <button type="button" class="ctrl-btn" id="btnPlayPause" onclick="sendCmd('play_pause')">Play/Pause</button>
        </div>

        <div class="action-grid">
          <button type="button" class="ctrl-btn" onclick="sendCmd('step_back')">-10s</button>
          <button type="button" class="ctrl-btn" onclick="sendCmd('step_forward')">+30s</button>
          <button type="button" class="ctrl-btn" id="btnMute" onclick="sendCmd('toggle_mute')">Mute</button>
        </div>

        <div class="rockers">
          <div class="rocker">
            <button type="button" class="rocker-btn" aria-label="Volume Down" onclick="sendCmd('volume_down')">-</button>
            <div class="rocker-label">Vol</div>
            <button type="button" class="rocker-btn" aria-label="Volume Up" onclick="sendCmd('volume_up')">+</button>
          </div>
          <div class="rocker">
            <button type="button" class="rocker-btn" aria-label="Channel Down" onclick="sendCmd('channel_down')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="rocker-label">Ch</div>
            <button type="button" class="rocker-btn" aria-label="Channel Up" onclick="sendCmd('channel_up')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
            </button>
          </div>
        </div>
      </div>
    </main>

    <!-- Tab 2: Keyboard & Number Keypad -->
    <main id="viewKeypad" class="view-content" style="display:none;">
      <section class="panel">
        <label class="section-heading" for="typeInput">Search or Type to Kinora TV</label>
        <input type="text" id="typeInput" class="text-input" placeholder="Search a movie, show, or channel...">
        <div class="keypad-actions-row">
          <button type="button" class="btn-primary" onclick="sendSearchToTv()">Search on TV</button>
          <button type="button" class="ctrl-btn" onclick="sendTypedText()">Type Text</button>
        </div>
      </section>

      <div class="section-heading" style="text-align:center;">Direct Channel Keypad</div>
      <div class="keypad-grid">
        <button type="button" class="key-btn" onclick="sendDigit('1')">1</button>
        <button type="button" class="key-btn" onclick="sendDigit('2')">2</button>
        <button type="button" class="key-btn" onclick="sendDigit('3')">3</button>
        <button type="button" class="key-btn" onclick="sendDigit('4')">4</button>
        <button type="button" class="key-btn" onclick="sendDigit('5')">5</button>
        <button type="button" class="key-btn" onclick="sendDigit('6')">6</button>
        <button type="button" class="key-btn" onclick="sendDigit('7')">7</button>
        <button type="button" class="key-btn" onclick="sendDigit('8')">8</button>
        <button type="button" class="key-btn" onclick="sendDigit('9')">9</button>
        <button type="button" class="key-btn key-action" onclick="sendCmd('back')">Back</button>
        <button type="button" class="key-btn" onclick="sendDigit('0')">0</button>
        <button type="button" class="key-btn key-action" onclick="sendCmd('dpad_select')">Enter</button>
      </div>
    </main>

    <!-- Tab 3: Channels Browser -->
    <main id="viewChannels" class="view-content" style="display:none;">
      <div class="toolbar">
        <input type="search" id="channelFilter" class="text-input" placeholder="Filter channels..." oninput="filterChannels()">
        <button type="button" class="btn-ghost" onclick="fetchChannels()">Refresh</button>
      </div>
      <div id="channelsList" class="list-stack"></div>
    </main>

    <!-- Tab 4: EPG / TV Guide Browser -->
    <main id="viewGuide" class="view-content" style="display:none;">
      <div class="toolbar">
        <input type="search" id="guideFilter" class="text-input" placeholder="Search TV guide..." oninput="filterGuide()">
        <button type="button" class="btn-ghost" onclick="fetchGuide()">Refresh</button>
      </div>
      <div id="guideList" class="list-stack"></div>
    </main>

    <!-- Tab 5: Media Library Browser -->
    <main id="viewMedia" class="view-content" style="display:none;">
      <div class="toolbar">
        <input type="search" id="mediaFilter" class="text-input" placeholder="Search movies and series..." oninput="filterMedia()">
        <button type="button" class="btn-ghost" onclick="fetchMedia()">Refresh</button>
      </div>
      <div id="mediaList" class="list-stack"></div>
    </main>

    <!-- Fixed Mobile Bottom Navigation -->
    <nav class="bottom-nav" aria-label="Remote views">
      <button type="button" class="tab-btn active" id="tabRemoteBtn" onclick="switchTab('remote')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="4"/><circle cx="12" cy="9" r="2.2"/><line x1="9" y1="15" x2="15" y2="15"/><line x1="9" y1="18" x2="15" y2="18"/></svg>
        <span>Remote</span>
      </button>
      <button type="button" class="tab-btn" id="tabKeypadBtn" onclick="switchTab('keypad')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="6" y1="9" x2="6.01" y2="9"/><line x1="10" y1="9" x2="10.01" y2="9"/><line x1="14" y1="9" x2="14.01" y2="9"/><line x1="18" y1="9" x2="18.01" y2="9"/><line x1="7" y1="15" x2="17" y2="15"/></svg>
        <span>Keypad</span>
      </button>
      <button type="button" class="tab-btn" id="tabChannelsBtn" onclick="switchTab('channels')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="18" x2="12" y2="21"/></svg>
        <span>Channels</span>
      </button>
      <button type="button" class="tab-btn" id="tabGuideBtn" onclick="switchTab('guide')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="4" x2="9" y2="20"/></svg>
        <span>Guide</span>
      </button>
      <button type="button" class="tab-btn" id="tabMediaBtn" onclick="switchTab('media')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
        <span>Media</span>
      </button>
    </nav>
  </div>

  <script>
    let authToken = localStorage.getItem('kinora_token') || null;
    let sseSource = null;
    let channelsData = [];
    let guideData = [];
    let mediaData = [];
    let isSeeking = false;
    let toastTimer = null;

    window.addEventListener('load', () => {
      initDelegatedHandlers();
      if (authToken) {
        showRemote();
      } else {
        showPairing();
      }
    });

    function showToast(msg) {
      const el = document.getElementById('toast');
      if (!el) return;
      el.textContent = msg;
      el.classList.add('show');
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
    }

    function setConnectionStatus(online) {
      const pill = document.getElementById('connPill');
      const txt = document.getElementById('connText');
      if (!pill || !txt) return;
      pill.classList.toggle('offline', !online);
      txt.textContent = online ? 'Connected' : 'Reconnecting';
    }

    function initDelegatedHandlers() {
      const pinInput = document.getElementById('pinInput');
      if (pinInput) {
        pinInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') pairWithPin();
        });
      }

      const typeInput = document.getElementById('typeInput');
      if (typeInput) {
        typeInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') sendSearchToTv();
        });
      }

      const pad = document.getElementById('trackpadSurface');
      if (pad) {
        let sx = 0, sy = 0, moved = false, lastTap = 0;
        const flash = (label) => {
          const el = document.getElementById('trackpadLabel');
          if (el) el.textContent = label;
          pad.classList.add('active-pulse');
          if (navigator.vibrate) navigator.vibrate(10);
          setTimeout(() => pad.classList.remove('active-pulse'), 140);
        };
        pad.addEventListener('pointerdown', (e) => {
          sx = e.clientX; sy = e.clientY; moved = false;
        });
        pad.addEventListener('pointermove', (e) => {
          if (!sx && !sy) return;
          const dx = e.clientX - sx, dy = e.clientY - sy;
          if (Math.abs(dx) < 28 && Math.abs(dy) < 28) return;
          moved = true;
          if (Math.abs(dx) > Math.abs(dy)) {
            sendCmd(dx > 0 ? 'dpad_right' : 'dpad_left');
            flash(dx > 0 ? 'Right' : 'Left');
          } else {
            sendCmd(dy > 0 ? 'dpad_down' : 'dpad_up');
            flash(dy > 0 ? 'Down' : 'Up');
          }
          sx = e.clientX; sy = e.clientY;
        });
        pad.addEventListener('pointerup', () => {
          if (!moved) {
            const now = Date.now();
            if (now - lastTap < 280) {
              sendCmd('back');
              flash('Back');
              lastTap = 0;
            } else {
              lastTap = now;
              setTimeout(() => {
                if (lastTap === now) {
                  sendCmd('dpad_select');
                  flash('OK');
                  lastTap = 0;
                }
              }, 290);
            }
          }
          sx = 0; sy = 0;
        });
      }

      const seekSlider = document.getElementById('seekSlider');
      if (seekSlider) {
        const startSeek = () => { isSeeking = true; };
        const endSeek = () => { isSeeking = false; };
        seekSlider.addEventListener('pointerdown', startSeek);
        seekSlider.addEventListener('touchstart', startSeek, { passive: true });
        seekSlider.addEventListener('pointerup', endSeek);
        seekSlider.addEventListener('touchend', endSeek);
        seekSlider.addEventListener('input', () => {
          isSeeking = true;
          document.getElementById('npTimeCur').textContent = formatTime(Number(seekSlider.value));
        });
        seekSlider.addEventListener('change', () => {
          isSeeking = false;
          const pos = Math.max(0, Math.round(Number(seekSlider.value) || 0));
          document.getElementById('npTimeCur').textContent = formatTime(pos);
          sendCmd('seek_to', { positionSec: pos });
          showToast('Seeked to ' + formatTime(pos));
        });
      }

      const channelsList = document.getElementById('channelsList');
      if (channelsList) {
        channelsList.addEventListener('click', (e) => {
          const item = e.target.closest('.channel-item');
          if (!item) return;
          const id = item.getAttribute('data-channel-id') || '';
          const num = Number(item.getAttribute('data-channel-num') || '0');
          const name = item.getAttribute('data-channel-name') || 'Channel';
          if (id) {
            tuneToChannel(id, num);
            showToast('Tuning ' + name);
          }
        });
      }

      const guideList = document.getElementById('guideList');
      if (guideList) {
        guideList.addEventListener('click', (e) => {
          const card = e.target.closest('.epg-card');
          if (!card) return;
          const id = card.getAttribute('data-channel-id') || '';
          const num = Number(card.getAttribute('data-channel-num') || '0');
          const name = card.getAttribute('data-channel-name') || 'Channel';
          if (id) {
            tuneToChannel(id, num);
            showToast('Tuning ' + name);
          }
        });
      }

      const mediaList = document.getElementById('mediaList');
      if (mediaList) {
        mediaList.addEventListener('click', (e) => {
          const item = e.target.closest('.media-item');
          if (!item) return;
          const mediaId = item.getAttribute('data-media-id') || '';
          const title = item.getAttribute('data-media-title') || '';
          const kind = item.getAttribute('data-media-kind') || 'movie';
          if (mediaId || title) {
            sendCmd('play_media_item', { mediaId, title, kind });
            showToast('Opening ' + (title || 'Media'));
          }
        });
      }
    }

    function formatTime(secs) {
      const total = Math.max(0, Math.floor(Number(secs) || 0));
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      const ss = s < 10 ? '0' + s : '' + s;
      if (h > 0) {
        const mm = m < 10 ? '0' + m : '' + m;
        return h + ':' + mm + ':' + ss;
      }
      return m + ':' + ss;
    }

    function formatClock(ts) {
      const ms = ts > 1e12 ? ts : ts * 1000;
      const d = new Date(ms);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return hh + ':' + mm;
    }

    function monogram(name) {
      const words = String(name || 'TV').trim().split(/\s+/).filter(Boolean);
      if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
      return String(name || 'TV').slice(0, 3).toUpperCase();
    }

    function artworkUrl(key) {
      if (!key || !authToken) return '';
      return '/api/artwork?key=' + encodeURIComponent(key) + '&token=' + encodeURIComponent(authToken);
    }

    function renderArtTile(key, fallbackText, extraClass) {
      const url = artworkUrl(key);
      const label = escapeHtml(monogram(fallbackText));
      if (!url) {
        return `<div class="art-tile ${extraClass || ''}" aria-hidden="true">${label}</div>`;
      }
      return `<div class="art-tile ${extraClass || ''}" aria-hidden="true"><img src="${url}" alt="" loading="lazy" onerror="var p=this.parentNode;this.remove();if(p)p.textContent='${label}';"></div>`;
    }

    function showPairing() {
      document.getElementById('pairingView').style.display = 'flex';
      document.getElementById('mainViews').style.display = 'none';
      document.getElementById('btnDisconnect').style.display = 'none';
      document.getElementById('connPill').style.display = 'none';
      if (sseSource) { sseSource.close(); sseSource = null; }
    }

    function showRemote() {
      document.getElementById('pairingView').style.display = 'none';
      document.getElementById('mainViews').style.display = 'flex';
      document.getElementById('btnDisconnect').style.display = 'inline-flex';
      document.getElementById('connPill').style.display = 'inline-flex';
      setConnectionStatus(true);
      connectSse();
      fetchChannels();
    }

    function switchTab(tab) {
      document.getElementById('tabRemoteBtn').classList.toggle('active', tab === 'remote');
      document.getElementById('tabKeypadBtn').classList.toggle('active', tab === 'keypad');
      document.getElementById('tabChannelsBtn').classList.toggle('active', tab === 'channels');
      document.getElementById('tabGuideBtn').classList.toggle('active', tab === 'guide');
      document.getElementById('tabMediaBtn').classList.toggle('active', tab === 'media');

      document.getElementById('viewRemote').style.display = tab === 'remote' ? 'flex' : 'none';
      document.getElementById('viewKeypad').style.display = tab === 'keypad' ? 'flex' : 'none';
      document.getElementById('viewChannels').style.display = tab === 'channels' ? 'flex' : 'none';
      document.getElementById('viewGuide').style.display = tab === 'guide' ? 'flex' : 'none';
      document.getElementById('viewMedia').style.display = tab === 'media' ? 'flex' : 'none';

      if (tab === 'channels' && channelsData.length === 0) fetchChannels();
      if (tab === 'guide' && guideData.length === 0) fetchGuide();
      if (tab === 'media' && mediaData.length === 0) fetchMedia();
    }

    async function pairWithPin() {
      const pin = document.getElementById('pinInput').value.trim();
      const deviceName = document.getElementById('nameInput').value.trim() || 'Mobile Remote';
      const errBox = document.getElementById('pairError');
      const btn = document.getElementById('btnPair');
      errBox.textContent = '';

      if (pin.length < 4) {
        errBox.textContent = 'Enter at least 4 digits from your Kinora screen.';
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Pairing...';
      try {
        const res = await fetch('/pair', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin, deviceName, deviceType: 'phone' })
        });
        const data = await res.json();
        if (data.ok && data.token) {
          authToken = data.token;
          localStorage.setItem('kinora_token', authToken);
          showRemote();
        } else {
          errBox.textContent = data.error || 'Pairing failed. Check the PIN and try again.';
        }
      } catch (e) {
        errBox.textContent = 'Could not reach Kinora. Confirm both devices are on the same Wi-Fi.';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Pair Remote';
      }
    }

    function disconnect(skipConfirm) {
      if (skipConfirm || confirm('Unpair this remote from Kinora?')) {
        authToken = null;
        localStorage.removeItem('kinora_token');
        channelsData = [];
        guideData = [];
        mediaData = [];
        showPairing();
      }
    }

    async function sendCmd(command, payload = {}) {
      if (!authToken) return;
      try {
        const res = await fetch('/api/command', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + authToken
          },
          body: JSON.stringify({ command, payload })
        });
        if (res.status === 401) {
          disconnect(true);
        }
      } catch (e) {
        setConnectionStatus(false);
      }
    }

    async function sendTypedText() {
      const input = document.getElementById('typeInput');
      const text = input.value.trim();
      if (!text || !authToken) return;
      try {
        const res = await fetch('/api/input', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + authToken
          },
          body: JSON.stringify({ text })
        });
        if (res.status === 401) {
          disconnect(true);
          return;
        }
        input.value = '';
        showToast('Sent to TV');
      } catch (e) {
        showToast('Could not send text');
      }
    }

    function sendDigit(d) {
      sendCmd('keypad_digit', { digit: d });
    }

    function renderStateBox(boxId, title, desc, retryFnName) {
      const box = document.getElementById(boxId);
      if (!box) return;
      box.innerHTML = `
        <div class="state-box">
          <div class="state-title">${escapeHtml(title)}</div>
          <div class="state-desc">${escapeHtml(desc)}</div>
          ${retryFnName ? `<button type="button" class="btn-ghost" onclick="${retryFnName}()">Try Again</button>` : ''}
        </div>
      `;
    }

    async function fetchChannels() {
      if (!authToken) return;
      renderStateBox('channelsList', 'Loading channels...', 'Reading live channels from Kinora Server.');
      try {
        const res = await fetch('/api/channels', {
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        if (res.status === 401) { disconnect(true); return; }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        channelsData = await res.json();
        renderChannels(channelsData);
      } catch (e) {
        renderStateBox('channelsList', 'Could not load channels', 'Check that Kinora Server is still running on your network.', 'fetchChannels');
      }
    }

    function renderChannels(list) {
      const box = document.getElementById('channelsList');
      if (!list || list.length === 0) {
        renderStateBox('channelsList', 'No channels available', 'Add a playlist source on Kinora Server, then tap Refresh.', 'fetchChannels');
        return;
      }
      box.innerHTML = list.map(c => `
        <div class="channel-item" role="button" tabindex="0" data-channel-id="${escapeHtml(c.id)}" data-channel-num="${Number(c.number) || 0}" data-channel-name="${escapeHtml(c.name)}">
          ${renderArtTile('channel:' + c.id, c.name, 'logo-fit')}
          <div class="item-body">
            <div class="item-head">
              ${c.number ? `<span class="channel-num">${escapeHtml(c.number)}</span>` : ''}
              <span class="item-title">${escapeHtml(c.name)}</span>
            </div>
            <div class="item-sub">${escapeHtml(c.currentProgramme || c.group || 'Live TV')}</div>
          </div>
          <button type="button" class="btn-watch">Watch</button>
        </div>
      `).join('');
    }

    function filterChannels() {
      const q = document.getElementById('channelFilter').value.toLowerCase();
      const filtered = channelsData.filter(c => (c.name || '').toLowerCase().includes(q) || (c.group || '').toLowerCase().includes(q));
      if (filtered.length === 0 && q) {
        renderStateBox('channelsList', 'No matching channels', 'Try clearing your search filter.');
        return;
      }
      renderChannels(filtered);
    }

    async function fetchGuide() {
      if (!authToken) return;
      renderStateBox('guideList', 'Loading TV guide...', 'Fetching current and upcoming schedules from Kinora Server.');
      try {
        if (channelsData.length === 0) {
          const chRes = await fetch('/api/channels', { headers: { 'Authorization': 'Bearer ' + authToken } });
          if (chRes.ok) channelsData = await chRes.json();
        }
        const res = await fetch('/api/epg', {
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        if (res.status === 401) { disconnect(true); return; }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        guideData = await res.json();
        renderGuide(guideData);
      } catch (e) {
        renderStateBox('guideList', 'Could not load TV guide', 'Check your Wi-Fi connection and retry.', 'fetchGuide');
      }
    }

    function renderGuide(programmes) {
      const box = document.getElementById('guideList');
      if (!programmes || programmes.length === 0) {
        renderStateBox('guideList', 'No guide listings yet', 'Import an XMLTV guide on Kinora Server to browse schedules here.', 'fetchGuide');
        return;
      }
      const nowMs = Date.now();
      const chMap = new Map();
      for (const c of channelsData) chMap.set(c.id, c);

      const byChannel = new Map();
      for (const p of programmes) {
        const startMs = p.start > 1e12 ? p.start : p.start * 1000;
        const stopMs = p.stop > 1e12 ? p.stop : p.stop * 1000;
        if (stopMs <= nowMs) continue;
        if (!byChannel.has(p.channelId)) byChannel.set(p.channelId, []);
        byChannel.get(p.channelId).push({ ...p, startMs, stopMs });
      }

      const cards = [];
      for (const [channelId, list] of byChannel.entries()) {
        list.sort((a, b) => a.startMs - b.startMs);
        const current = list.find(p => p.startMs <= nowMs && p.stopMs > nowMs) || list[0];
        const next = list.find(p => p !== current && p.startMs >= current.stopMs) || list[1] || null;
        const ch = chMap.get(channelId);
        const chName = ch ? ch.name : channelId;
        const chNum = ch && ch.number ? ch.number : 0;
        const pct = current.stopMs > current.startMs
          ? Math.max(0, Math.min(100, Math.round(((nowMs - current.startMs) / (current.stopMs - current.startMs)) * 100)))
          : 0;
        const minsLeft = Math.max(1, Math.round((current.stopMs - nowMs) / 60000));
        cards.push(`
          <div class="epg-card" role="button" tabindex="0" data-channel-id="${escapeHtml(channelId)}" data-channel-num="${chNum}" data-channel-name="${escapeHtml(chName)}">
            <div class="epg-top">
              <div class="epg-ch">
                ${renderArtTile('channel:' + channelId, chName, 'logo-fit')}
                <div class="item-body">
                  <div class="item-head">
                    ${chNum ? `<span class="channel-num">${escapeHtml(chNum)}</span>` : ''}
                    <span class="item-title">${escapeHtml(chName)}</span>
                  </div>
                  <div class="epg-meta">${formatClock(current.startMs)} - ${formatClock(current.stopMs)} (${minsLeft}m left)</div>
                </div>
              </div>
              <button type="button" class="btn-watch">Watch</button>
            </div>
            <div class="epg-now">${escapeHtml(current.title)}</div>
            <div class="epg-bar"><div class="epg-bar-fill" style="width:${pct}%"></div></div>
            ${next ? `<div class="epg-next">Next ${formatClock(next.startMs)}: ${escapeHtml(next.title)}</div>` : ''}
          </div>
        `);
      }

      if (cards.length === 0) {
        renderStateBox('guideList', 'No matching programmes', 'Try a different search term or tap Refresh.', 'fetchGuide');
        return;
      }
      box.innerHTML = cards.join('');
    }

    function filterGuide() {
      const q = document.getElementById('guideFilter').value.toLowerCase();
      if (!q) { renderGuide(guideData); return; }
      const chMap = new Map();
      for (const c of channelsData) chMap.set(c.id, (c.name || '').toLowerCase());
      const filtered = guideData.filter(p =>
        (p.title || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (chMap.get(p.channelId) || '').includes(q)
      );
      renderGuide(filtered);
    }

    async function fetchMedia() {
      if (!authToken) return;
      renderStateBox('mediaList', 'Loading media library...', 'Reading movies and series from Kinora Server.');
      try {
        const res = await fetch('/api/media', {
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        if (res.status === 401) { disconnect(true); return; }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        mediaData = await res.json();
        renderMedia(mediaData);
      } catch (e) {
        renderStateBox('mediaList', 'Could not load media library', 'Check your Wi-Fi connection and retry.', 'fetchMedia');
      }
    }

    function renderMedia(list) {
      const box = document.getElementById('mediaList');
      if (!list || list.length === 0) {
        renderStateBox('mediaList', 'No media items found', 'Add local libraries or VOD sources on Kinora Server, then tap Refresh.', 'fetchMedia');
        return;
      }
      box.innerHTML = list.map(m => {
        const metaParts = [];
        if (m.year) metaParts.push(String(m.year));
        if (Array.isArray(m.genres) && m.genres.length > 0) metaParts.push(m.genres.slice(0, 2).join(', '));
        const subtitle = metaParts.join(' / ') || 'Library';
        return `
          <div class="channel-item media-item" role="button" tabindex="0" data-media-id="${escapeHtml(m.id)}" data-media-title="${escapeHtml(m.title)}" data-media-kind="${escapeHtml(m.kind || 'movie')}">
            ${renderArtTile(m.artworkKey || m.id, m.title, 'poster')}
            <div class="item-body">
              <div>
                <span class="kind-tag">${escapeHtml(m.kind || 'movie')}</span>
                <span class="item-title">${escapeHtml(m.title)}</span>
              </div>
              <div class="item-sub">${escapeHtml(subtitle)}</div>
            </div>
            <button type="button" class="btn-watch">Play</button>
          </div>
        `;
      }).join('');
    }

    function filterMedia() {
      const q = document.getElementById('mediaFilter').value.toLowerCase();
      const filtered = mediaData.filter(m =>
        (m.title || '').toLowerCase().includes(q) ||
        (m.kind || '').toLowerCase().includes(q) ||
        (Array.isArray(m.genres) && m.genres.some(g => String(g).toLowerCase().includes(q)))
      );
      if (filtered.length === 0 && q) {
        renderStateBox('mediaList', 'No matching titles', 'Try clearing your search filter.');
        return;
      }
      renderMedia(filtered);
    }

    function setPadMode(mode) {
      const isTrack = mode === 'trackpad';
      const ring = document.getElementById('dpadRing');
      const pad = document.getElementById('trackpadSurface');
      const b1 = document.getElementById('modeDpadBtn');
      const b2 = document.getElementById('modeTrackpadBtn');
      if (ring) ring.style.display = isTrack ? 'none' : 'flex';
      if (pad) pad.style.display = isTrack ? 'flex' : 'none';
      if (b1) b1.classList.toggle('active', !isTrack);
      if (b2) b2.classList.toggle('active', isTrack);
      try { localStorage.setItem('kinora_pad_mode', mode); } catch (_) {}
    }

    function sendSearchToTv() {
      const el = document.getElementById('typeInput');
      const q = (el && el.value || '').trim();
      if (!q) return;
      sendCmd('remote_search', { query: q });
      showToast('Searching TV: ' + q);
      el.value = '';
    }

    function tuneToChannel(channelId, channelNumber) {
      sendCmd('tune_channel', { channelId, channelNumber });
    }

    function escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function connectSse() {
      if (sseSource) sseSource.close();
      sseSource = new EventSource('/api/events?token=' + encodeURIComponent(authToken || ''));
      sseSource.onopen = () => setConnectionStatus(true);
      sseSource.onmessage = (e) => {
        try {
          const state = JSON.parse(e.data);
          if (state && !state.type) {
            updatePlaybackUi(state);
          }
        } catch (err) {}
      };
      sseSource.onerror = () => {
        setConnectionStatus(false);
        if (sseSource) sseSource.close();
        setTimeout(connectSse, 4000);
      };
    }

    function updatePlaybackUi(state) {
      document.getElementById('npTitle').textContent = state.title || 'Kinora TV';
      document.getElementById('npChannel').textContent = state.channelName
        ? (state.channelNumber ? state.channelName + ' (' + state.channelNumber + ')' : state.channelName)
        : (state.subtitle || 'Connected and ready');

      const playBtn = document.getElementById('btnPlayPause');
      if (playBtn && typeof state.isPlaying === 'boolean') {
        playBtn.textContent = state.isPlaying ? 'Pause' : 'Play';
        playBtn.classList.toggle('is-active', state.isPlaying);
      }
      const muteBtn = document.getElementById('btnMute');
      if (muteBtn && typeof state.isMuted === 'boolean') {
        muteBtn.textContent = state.isMuted ? 'Unmute' : 'Mute';
        muteBtn.classList.toggle('is-active', state.isMuted);
      }

      const slider = document.getElementById('seekSlider');
      const curLabel = document.getElementById('npTimeCur');
      const durLabel = document.getElementById('npTimeDur');
      const badge = document.getElementById('npBadge');
      const dur = Number(state.durationSec) || 0;
      const pos = Math.max(0, Number(state.positionSec) || 0);
      if (slider && curLabel && durLabel && badge) {
        if (dur > 0 && !state.isLive) {
          slider.disabled = false;
          slider.max = String(Math.floor(dur));
          durLabel.textContent = formatTime(dur);
          badge.textContent = state.isPlaying ? 'PLAYING' : 'PAUSED';
          badge.classList.add('vod');
          if (!isSeeking) {
            slider.value = String(Math.min(Math.floor(dur), Math.floor(pos)));
            curLabel.textContent = formatTime(pos);
          }
        } else {
          slider.disabled = true;
          slider.max = '100';
          slider.value = '0';
          curLabel.textContent = formatTime(pos);
          durLabel.textContent = 'LIVE';
          badge.textContent = 'LIVE';
          badge.classList.remove('vod');
        }
      }
    }
  </script>
</body>
</html>"##
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pin_generation_produces_four_digits() {
        let pin = generate_pairing_pin();
        assert_eq!(pin.len(), 4);
        assert!(pin.chars().all(|c| c.is_ascii_digit()));
    }

    #[test]
    fn embedded_remote_html_includes_guide_media_and_seek_controls() {
        let html = get_embedded_remote_html();
        assert!(html.contains(r#"id="seekSlider""#));
        assert!(html.contains(r#"id="tabGuideBtn""#));
        assert!(html.contains(r#"id="viewGuide""#));
        assert!(html.contains(r#"id="viewMedia""#));
        assert!(html.contains("fetchGuide()"));
        assert!(html.contains("play_media_item"));
        assert!(!html.contains(r#"onclick="tuneToChannel("#));
        // Brand identity: Kinora obsidian + crimson, zero generic AI indigo/purple
        assert!(html.contains("#E50914"));
        assert!(html.contains("#050507"));
        assert!(html.contains("kp-stem"));
        assert!(!html.contains("#6366f1"));
        assert!(!html.contains("user-scalable=no"));
    }

    #[test]
    fn playback_state_deserializes_with_is_live_default() {
        let raw = r#"{"title":"BBC One","subtitle":null,"isPlaying":true,"volume":0.8,"isMuted":false,"durationSec":0,"positionSec":12,"channelName":"BBC One","channelNumber":101}"#;
        let parsed: RemotePlaybackState = serde_json::from_str(raw).unwrap();
        assert!(!parsed.is_live);
        assert_eq!(parsed.title, "BBC One");

        let live_raw = r#"{"title":"BBC One","subtitle":null,"isPlaying":true,"volume":0.8,"isMuted":false,"durationSec":3600,"positionSec":12,"isLive":true,"channelName":"BBC One","channelNumber":101}"#;
        let parsed_live: RemotePlaybackState = serde_json::from_str(live_raw).unwrap();
        assert!(parsed_live.is_live);
    }

    #[test]
    fn auth_token_generation_produces_32_hex_chars() {
        let tok = generate_auth_token();
        assert_eq!(tok.len(), 32);
        assert!(tok.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn local_ip_detection_returns_valid_ip() {
        let ip = detect_local_ip();
        assert!(!ip.is_empty());
        assert!(ip.parse::<IpAddr>().is_ok());
    }

    #[tokio::test]
    async fn manager_initial_status_and_lifecycle() {
        let mgr = RemoteServerManager::new(None);
        let status = mgr.get_status().await;
        assert!(!status.running);
        assert_eq!(status.port, DEFAULT_REMOTE_PORT);
        assert_eq!(status.pairing_pin.len(), 4);
        assert_eq!(status.mode, PlatformMode::Standalone);

        let test_state = RemotePlaybackState {
            title: "Planet Earth".to_string(),
            subtitle: Some("Episode 1".to_string()),
            is_playing: true,
            volume: 0.9,
            is_muted: false,
            duration_sec: 3600.0,
            position_sec: 120.0,
            is_live: false,
            channel_name: Some("BBC One".to_string()),
            channel_number: Some(101),
        };

        mgr.update_playback_state(test_state).await;
        let inner = mgr.inner.lock().await;
        assert_eq!(inner.playback_state.title, "Planet Earth");
        assert_eq!(inner.playback_state.channel_number, Some(101));
    }

    #[tokio::test]
    async fn pairing_logic_enforces_pin_and_creates_trusted_device() {
        let mgr = RemoteServerManager::new(None);
        let pin = {
            let state = mgr.inner.lock().await;
            state.pairing_pin.clone()
        };

        // Correct PIN with client metadata
        let good_res = handle_pair_request(
            &mgr,
            &format!(r#"{{"pin":"{pin}","deviceName":"Test Phone","deviceType":"phone"}}"#),
            "192.168.1.10".to_string(),
            Some("Mozilla/5.0".to_string()),
        )
        .await;
        assert!(good_res.is_ok());
        let pair_resp = good_res.unwrap();
        assert_eq!(pair_resp.token.len(), 32);
        assert_eq!(pair_resp.device_name, "Test Phone");
        assert!(pair_resp
            .capabilities
            .contains(&DeviceCapability::RemoteControl));

        // Verify trusted device was added
        let devices = mgr.get_trusted_devices().await;
        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].name, "Test Phone");
        assert_eq!(devices[0].device_type, DeviceType::Phone);
        assert!(!devices[0].revoked);

        // Incorrect PIN
        let bad_res =
            handle_pair_request(&mgr, r#"{"pin":"0000"}"#, "192.168.1.10".to_string(), None).await;
        assert!(bad_res.is_err());
    }

    #[tokio::test]
    async fn device_revocation_and_audit_logging() {
        let mgr = RemoteServerManager::new(None);
        let pin = {
            let state = mgr.inner.lock().await;
            state.pairing_pin.clone()
        };

        let pair_resp = handle_pair_request(
            &mgr,
            &format!(r#"{{"pin":"{pin}","deviceName":"Revokable iPad","deviceType":"tablet"}}"#),
            "192.168.1.20".to_string(),
            None,
        )
        .await
        .unwrap();

        // Validate token works
        let is_valid = validate_token(
            &mgr,
            Some(&pair_resp.token),
            &[DeviceCapability::RemoteControl],
        )
        .await;
        assert!(is_valid);

        // Revoke device
        let revoked = mgr.revoke_device(&pair_resp.device_id).await;
        assert!(revoked);

        // Token should now be refused
        let is_valid_after = validate_token(
            &mgr,
            Some(&pair_resp.token),
            &[DeviceCapability::RemoteControl],
        )
        .await;
        assert!(!is_valid_after);

        // Audit log should contain Pair and Revoke entries
        let audit = mgr.get_audit_log().await;
        assert!(audit.iter().any(|a| a.action == "PairDevice"));
        assert!(audit.iter().any(|a| a.action == "RevokeDevice"));
    }

    #[tokio::test]
    async fn ai_agent_pairing_and_capability_assignment() {
        let mgr = RemoteServerManager::new(None);
        let pin = {
            let state = mgr.inner.lock().await;
            state.pairing_pin.clone()
        };

        let pair_resp = handle_pair_request(
            &mgr,
            &format!(
                r#"{{"pin":"{pin}","deviceName":"Local Jarvis Agent","deviceType":"aiAgent"}}"#
            ),
            "127.0.0.1".to_string(),
            None,
        )
        .await
        .unwrap();

        assert!(pair_resp.capabilities.contains(&DeviceCapability::AiAgent));
        assert!(pair_resp
            .capabilities
            .contains(&DeviceCapability::MediaBrowse));
    }

    #[tokio::test]
    async fn trusted_devices_file_persistence_roundtrip() {
        let temp_dir = std::env::temp_dir().join(format!("kinora-dev-test-{}", now_unix_secs()));
        let _ = fs::create_dir_all(&temp_dir);

        let mgr = RemoteServerManager::new(Some(temp_dir.clone()));
        let pin = {
            let state = mgr.inner.lock().await;
            state.pairing_pin.clone()
        };

        let pair_resp = handle_pair_request(
            &mgr,
            &format!(
                r#"{{"pin":"{pin}","deviceName":"Living Room Tablet","deviceType":"tablet"}}"#
            ),
            "192.168.1.55".to_string(),
            None,
        )
        .await
        .unwrap();

        // Check device was saved to disk
        let saved_devices = load_trusted_devices_from_disk(&temp_dir);
        assert_eq!(saved_devices.len(), 1);
        assert_eq!(saved_devices[0].id, pair_resp.device_id);
        assert_eq!(saved_devices[0].name, "Living Room Tablet");

        // Create a new manager instance pointing to the same directory
        let mgr2 = RemoteServerManager::new(Some(temp_dir.clone()));
        let devices2 = mgr2.get_trusted_devices().await;
        assert_eq!(devices2.len(), 1);
        assert_eq!(devices2[0].name, "Living Room Tablet");

        // Clean up
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[tokio::test]
    async fn rename_device_updates_name_and_persists() {
        let temp_dir =
            std::env::temp_dir().join(format!("kinora-dev-rename-test-{}", now_unix_secs()));
        let _ = fs::create_dir_all(&temp_dir);

        let mgr = RemoteServerManager::new(Some(temp_dir.clone()));
        let pin = {
            let state = mgr.inner.lock().await;
            state.pairing_pin.clone()
        };

        let pair_resp = handle_pair_request(
            &mgr,
            &format!(r#"{{"pin":"{pin}","deviceName":"Old Name","deviceType":"phone"}}"#),
            "192.168.1.60".to_string(),
            None,
        )
        .await
        .unwrap();

        let renamed = mgr
            .rename_device(&pair_resp.device_id, "New Friendly Name")
            .await;
        assert!(renamed);

        let devices = mgr.get_trusted_devices().await;
        assert_eq!(devices[0].name, "New Friendly Name");

        let disk_devices = load_trusted_devices_from_disk(&temp_dir);
        assert_eq!(disk_devices[0].name, "New Friendly Name");

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[tokio::test]
    async fn platform_mode_transitions() {
        let mgr = RemoteServerManager::new(None);
        let initial_mode = mgr.get_platform_mode().await;
        assert_eq!(initial_mode.mode, PlatformMode::Standalone);
        assert!(!initial_mode.is_server_active);

        let server_mode = mgr.set_platform_mode(PlatformMode::Server, None).await;
        assert_eq!(server_mode.mode, PlatformMode::Server);

        let client_mode = mgr
            .set_platform_mode(
                PlatformMode::Client,
                Some("http://192.168.1.100:5198".to_string()),
            )
            .await;
        assert_eq!(client_mode.mode, PlatformMode::Client);
        assert_eq!(
            client_mode.server_url.as_deref(),
            Some("http://192.168.1.100:5198")
        );
    }

    #[tokio::test]
    async fn remote_channel_summary_cache() {
        let mgr = RemoteServerManager::new(None);
        let channels = vec![
            RemoteChannelSummary {
                id: "ch-1".to_string(),
                name: "BBC One HD".to_string(),
                number: Some(101),
                group: Some("National".to_string()),
                logo: None,
                current_programme: Some("News at Six".to_string()),
                stream_url: None,
            },
            RemoteChannelSummary {
                id: "ch-2".to_string(),
                name: "ITV1".to_string(),
                number: Some(102),
                group: Some("National".to_string()),
                logo: None,
                current_programme: Some("Coronation Street".to_string()),
                stream_url: None,
            },
        ];

        mgr.update_channels(channels).await;
        let inner = mgr.inner.lock().await;
        assert_eq!(inner.channels.len(), 2);
        assert_eq!(inner.channels[0].name, "BBC One HD");
        assert_eq!(
            inner.channels[0].current_programme.as_deref(),
            Some("News at Six")
        );
    }

    #[tokio::test]
    async fn remote_sources_and_library_cache() {
        let mgr = RemoteServerManager::new(None);
        let sources = vec![RemoteSourceSummary {
            id: "src-1".to_string(),
            label: "UK Freeview".to_string(),
            origin: "https://example.com/playlist.m3u".to_string(),
            channel_count: 42,
            kind: "playlist".to_string(),
        }];
        mgr.update_sources(sources).await;
        let fetched_sources = mgr.get_sources().await;
        assert_eq!(fetched_sources.len(), 1);
        assert_eq!(fetched_sources[0].label, "UK Freeview");
        assert_eq!(fetched_sources[0].channel_count, 42);

        let library = RemoteLibrarySummary {
            favourites: vec!["ch-1".to_string(), "mov-1".to_string()],
            watchlist: vec!["mov-2".to_string()],
            watch_progress: vec![RemoteWatchProgressItem {
                item_ref: "mov-1".to_string(),
                title: "Night of the Living Dead".to_string(),
                position: 150.0,
                duration: 5800.0,
                updated_at: 1700000000,
            }],
        };
        mgr.update_library(library).await;
        let fetched_library = mgr.get_library().await;
        assert_eq!(fetched_library.favourites.len(), 2);
        assert_eq!(fetched_library.watchlist.len(), 1);
        assert_eq!(fetched_library.watch_progress.len(), 1);
        assert_eq!(fetched_library.watch_progress[0].position, 150.0);
    }

    #[tokio::test]
    async fn remote_channel_stream_url_resolution() {
        let mgr = RemoteServerManager::new(None);
        let channels = vec![RemoteChannelSummary {
            id: "ch-test-1".to_string(),
            name: "Test Stream HD".to_string(),
            number: Some(101),
            group: Some("Test".to_string()),
            logo: None,
            current_programme: None,
            stream_url: Some("https://example.com/live/ch1.m3u8".to_string()),
        }];

        mgr.update_channels(channels).await;
        let inner = mgr.inner.lock().await;
        assert_eq!(
            inner.channels[0].stream_url.as_deref(),
            Some("https://example.com/live/ch1.m3u8")
        );
    }

    #[tokio::test]
    async fn platform_config_persists_across_restarts() {
        let temp_dir = std::env::temp_dir().join(format!(
            "kinora_platform_cfg_test_{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = fs::create_dir_all(&temp_dir);

        let mgr = RemoteServerManager::new(Some(temp_dir.clone()));
        mgr.set_platform_mode(
            PlatformMode::Client,
            Some("http://192.168.1.42:5198".to_string()),
        )
        .await;

        let reloaded = RemoteServerManager::new(Some(temp_dir.clone()));
        let info = reloaded.get_platform_mode().await;
        assert_eq!(info.mode, PlatformMode::Client);
        assert_eq!(info.server_url.as_deref(), Some("http://192.168.1.42:5198"));

        reloaded.set_platform_mode(PlatformMode::Server, None).await;
        let reloaded_server = RemoteServerManager::new(Some(temp_dir.clone()));
        let srv_info = reloaded_server.get_platform_mode().await;
        assert_eq!(srv_info.mode, PlatformMode::Server);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[tokio::test]
    async fn end_to_end_guarded_lan_stream_proxy_over_http() {
        // 1. Start a local upstream HLS fixture server carrying a secret token in its URL.
        let upstream = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let upstream_addr = upstream.local_addr().unwrap();
        tokio::spawn(async move {
            loop {
                let Ok((mut sock, _)) = upstream.accept().await else {
                    break;
                };
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
                    if path == "/private-user/live.m3u8" {
                        let body = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:4\n#EXTINF:4.0,\nchunk0.ts?auth=topsecret\n";
                        let resp = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: application/vnd.apple.mpegurl\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            body.len(),
                            body
                        );
                        let _ = sock.write_all(resp.as_bytes()).await;
                    } else if path == "/private-user/chunk0.ts?auth=topsecret" {
                        let body = b"MPEGTS_PROXIED_OK";
                        let hdr = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: video/mp2t\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                            body.len()
                        );
                        let _ = sock.write_all(hdr.as_bytes()).await;
                        let _ = sock.write_all(body).await;
                    }
                });
            }
        });

        // 2. Pick a free local port for the Kinora Server and start it with test loopback policy.
        let probe = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let srv_port = probe.local_addr().unwrap().port();
        drop(probe);

        let policy = crate::fetch::Policy {
            allow_loopback: true,
            ..crate::fetch::Policy::default()
        };
        let mgr = RemoteServerManager::with_stream_policy(None, policy);
        mgr.update_channels(vec![RemoteChannelSummary {
            id: "ch-live-1".to_string(),
            name: "Live One".to_string(),
            number: Some(1),
            group: Some("News".to_string()),
            logo: None,
            current_programme: None,
            stream_url: Some(format!("http://{upstream_addr}/private-user/live.m3u8")),
        }])
        .await;

        let status = mgr
            .start(Some(srv_port), Some("482910".to_string()), |_| {})
            .await
            .unwrap();
        assert!(status.running);

        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        let base = format!("http://127.0.0.1:{srv_port}");

        // 3. Pair a desktop client device.
        let pair_json: serde_json::Value = client
            .post(format!("{base}/pair"))
            .header("Content-Type", "application/json")
            .body(r#"{"pin":"482910","deviceName":"Bedroom TV","deviceType":"desktopClient"}"#)
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        let token = pair_json["token"].as_str().unwrap().to_string();
        let device_id = pair_json["deviceId"].as_str().unwrap().to_string();

        // 4. Open a proxied stream: response must NOT expose upstream URL or credentials.
        let open_json: serde_json::Value = client
            .post(format!("{base}/api/stream/open"))
            .header("Authorization", format!("Bearer {token}"))
            .header("Content-Type", "application/json")
            .body(r#"{"channelId":"ch-live-1"}"#)
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(open_json["ok"], true);
        let proxy_path = open_json["proxyPath"].as_str().unwrap().to_string();
        assert!(proxy_path.starts_with("/api/stream/h/"));
        assert!(!open_json.to_string().contains("private-user"));
        assert!(!open_json.to_string().contains(&upstream_addr.to_string()));

        // 5. Fetch rewritten playlist through proxy and follow rewritten segment handle.
        let playlist = client
            .get(format!("{base}{proxy_path}"))
            .send()
            .await
            .unwrap()
            .text()
            .await
            .unwrap();
        assert!(playlist.contains("#EXTM3U"));
        assert!(!playlist.contains("topsecret"));
        assert!(!playlist.contains("private-user"));

        let seg_path = playlist
            .lines()
            .find(|l| l.starts_with("/api/stream/h/"))
            .expect("rewritten segment path");
        let seg_bytes = client
            .get(format!("{base}{seg_path}"))
            .send()
            .await
            .unwrap()
            .bytes()
            .await
            .unwrap();
        assert_eq!(seg_bytes.as_ref(), b"MPEGTS_PROXIED_OK");

        // 6. Revoking the device immediately cuts off the proxied stream.
        assert!(mgr.revoke_device(&device_id).await);
        let revoked_status = client
            .get(format!("{base}{proxy_path}"))
            .send()
            .await
            .unwrap()
            .status()
            .as_u16();
        assert!(revoked_status == 403 || revoked_status == 410);

        mgr.stop().await;
    }

    #[tokio::test]
    async fn end_to_end_epg_media_and_artwork_endpoints() {
        let temp_dir = std::env::temp_dir().join(format!(
            "kinora_sync_cat_test_{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = fs::create_dir_all(&temp_dir);

        let probe = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let srv_port = probe.local_addr().unwrap().port();
        drop(probe);

        let mgr = RemoteServerManager::new(Some(temp_dir.clone()));

        // Seed a valid PNG into the server's ArtworkStore cache.
        let png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde";
        mgr.artwork_store.write_cached("poster:mov-42", png_bytes);

        let now_ms = (now_unix_secs() as i64) * 1000;
        mgr.update_channels(vec![RemoteChannelSummary {
            id: "ch-1".to_string(),
            name: "BBC One".to_string(),
            number: Some(1),
            group: Some("National".to_string()),
            logo: None,
            current_programme: None,
            stream_url: None,
        }])
        .await;

        mgr.update_epg(vec![
            RemoteEpgProgramme {
                channel_id: "ch-1".to_string(),
                title: "Evening News".to_string(),
                subtitle: Some("Live bulletin".to_string()),
                description: Some("Headlines".to_string()),
                start: now_ms - 600_000,
                stop: now_ms + 1_200_000,
                category: Some("News".to_string()),
                episode: None,
            },
            RemoteEpgProgramme {
                channel_id: "ch-2".to_string(),
                title: "Other Show".to_string(),
                subtitle: None,
                description: None,
                start: now_ms - 600_000,
                stop: now_ms + 1_200_000,
                category: None,
                episode: None,
            },
        ])
        .await;

        mgr.update_media(vec![
            RemoteMediaItem {
                id: "mov-42".to_string(),
                kind: "movie".to_string(),
                title: "Blade Runner".to_string(),
                year: Some(1982),
                overview: Some("Sci-fi classic".to_string()),
                genres: vec!["Sci-Fi".to_string()],
                rating: Some(8.1),
                duration_secs: Some(7020),
                artwork_key: Some("poster:mov-42".to_string()),
                backdrop_key: None,
                source_id: Some("xt-1".to_string()),
                stream_url: Some("https://provider.example/user/pass/42.mp4".to_string()),
            },
            RemoteMediaItem {
                id: "ser-9".to_string(),
                kind: "series".to_string(),
                title: "Planet Earth".to_string(),
                year: Some(2006),
                overview: None,
                genres: vec!["Documentary".to_string()],
                rating: Some(9.4),
                duration_secs: None,
                artwork_key: None,
                backdrop_key: None,
                source_id: Some("xt-1".to_string()),
                stream_url: None,
            },
        ])
        .await;

        mgr.start(Some(srv_port), Some("619283".to_string()), |_| {})
            .await
            .unwrap();

        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        let base = format!("http://127.0.0.1:{srv_port}");

        let pair_json: serde_json::Value = client
            .post(format!("{base}/pair"))
            .header("Content-Type", "application/json")
            .body(r#"{"pin":"619283","deviceName":"Living Room Client","deviceType":"desktopClient"}"#)
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        let token = pair_json["token"].as_str().unwrap().to_string();

        // 1. /api/channels enriches currentProgramme from live EPG.
        let channels: serde_json::Value = client
            .get(format!("{base}/api/channels"))
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(channels[0]["currentProgramme"], "Evening News");

        // 2. /api/epg filters by channelId.
        let epg: serde_json::Value = client
            .get(format!("{base}/api/epg?channelId=ch-1"))
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(epg.as_array().unwrap().len(), 1);
        assert_eq!(epg[0]["title"], "Evening News");

        // 3. /api/media filters by kind & search query and strips streamUrl.
        let media: serde_json::Value = client
            .get(format!("{base}/api/media?kind=movie&q=blade"))
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        assert_eq!(media.as_array().unwrap().len(), 1);
        assert_eq!(media[0]["title"], "Blade Runner");
        assert!(media[0].get("streamUrl").is_none());
        assert!(!media.to_string().contains("provider.example"));

        // 4. /api/artwork serves cached PNG bytes and rejects unknown/traversal keys with 404.
        let art = crate::lan_proxy::fetch_server_artwork(&base, &token, "poster:mov-42")
            .await
            .unwrap()
            .expect("cached PNG returned");
        assert_eq!(art.mime_type, "image/png");
        assert_eq!(art.bytes, png_bytes);

        let missing = crate::lan_proxy::fetch_server_artwork(&base, &token, "../../etc/passwd")
            .await
            .unwrap();
        assert!(missing.is_none());

        mgr.stop().await;
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[tokio::test]
    async fn pwa_manifest_icon_and_library_sync_persistence() {
        let temp_dir = std::env::temp_dir().join(format!(
            "kinora_pwa_sync_test_{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = fs::create_dir_all(&temp_dir);

        let probe = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let srv_port = probe.local_addr().unwrap().port();
        drop(probe);

        let mgr = RemoteServerManager::new(Some(temp_dir.clone()));
        let status = mgr
            .start(Some(srv_port), Some("739104".to_string()), |_| {})
            .await
            .unwrap();
        assert!(status.running);

        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        let base = format!("http://127.0.0.1:{srv_port}");

        // 1. PWA manifest & SVG icon endpoints respond with valid content.
        let manifest_resp = client
            .get(format!("{base}/manifest.webmanifest"))
            .send()
            .await
            .unwrap();
        assert_eq!(manifest_resp.status().as_u16(), 200);
        let manifest: serde_json::Value = manifest_resp.json().await.unwrap();
        assert_eq!(manifest["short_name"], "Kinora");
        assert_eq!(manifest["display"], "standalone");

        let icon_resp = client.get(format!("{base}/icon.svg")).send().await.unwrap();
        assert_eq!(icon_resp.status().as_u16(), 200);
        assert!(icon_resp.text().await.unwrap().contains("<svg"));

        // 2. Pair a client and push watch progress + favourite toggle.
        let pair_json: serde_json::Value = client
            .post(format!("{base}/pair"))
            .header("Content-Type", "application/json")
            .body(
                r#"{"pin":"739104","deviceName":"Sync Test Client","deviceType":"desktopClient"}"#,
            )
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        let token = pair_json["token"].as_str().unwrap().to_string();

        let prog_resp = client
            .post(format!("{base}/api/sync/progress"))
            .header("Authorization", format!("Bearer {token}"))
            .header("Content-Type", "application/json")
            .body(r#"{"itemRef":"movie:blade","title":"Blade","position":420,"duration":7000}"#)
            .send()
            .await
            .unwrap();
        assert_eq!(prog_resp.status().as_u16(), 200);

        let lib_resp = client
            .post(format!("{base}/api/sync/library"))
            .header("Authorization", format!("Bearer {token}"))
            .header("Content-Type", "application/json")
            .body(r#"{"action":"toggle_favourite","id":"movie:blade"}"#)
            .send()
            .await
            .unwrap();
        assert_eq!(lib_resp.status().as_u16(), 200);

        mgr.stop().await;

        // 3. Reloading RemoteServerManager from the same data_dir restores synced progress & favourites.
        let reloaded = RemoteServerManager::new(Some(temp_dir.clone()));
        let restored = reloaded.get_library().await;
        assert!(restored.favourites.contains(&"movie:blade".to_string()));
        assert_eq!(restored.watch_progress.len(), 1);
        assert_eq!(restored.watch_progress[0].item_ref, "movie:blade");
        assert_eq!(restored.watch_progress[0].position, 420.0);

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
