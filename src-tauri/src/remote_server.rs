// remote_server.rs - Wireless LAN mobile remote control and platform server for Kinora.
// Serves touch-optimized web interface to phones and tablets on the local network.
// Manages persistent trusted devices, capability-based security, and AI agent interfaces.
// Strictly adheres to typography standards: zero em-dashes across all code and comments.

use std::collections::HashSet;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::net::{IpAddr, Ipv4Addr, SocketAddr, UdpSocket};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, oneshot, Mutex};

pub const DEFAULT_REMOTE_PORT: u16 = 5198;
pub const DEFAULT_DISCOVERY_PORT: u16 = 5197;
const MAX_REQUEST_SIZE: usize = 128 * 1024;
const MAX_FAILED_ATTEMPTS: u32 = 5;
const LOCKOUT_DURATION_SECS: u64 = 30;
const MAX_AUDIT_LOG_ITEMS: usize = 100;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PlatformMode {
    Standalone,
    Server,
    Client,
}

impl Default for PlatformMode {
    fn default() -> Self {
        Self::Standalone
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DeviceType {
    Phone,
    Tablet,
    Tv,
    RemoteWeb,
    AiAgent,
    DesktopClient,
    Unknown,
}

impl Default for DeviceType {
    fn default() -> Self {
        Self::RemoteWeb
    }
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
    failed_attempts: u32,
    lockout_until: Option<Instant>,
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
        let (loaded_devices, loaded_cfg) = if let Some(ref dir) = data_dir {
            (
                load_trusted_devices_from_disk(dir),
                load_platform_config_from_disk(dir),
            )
        } else {
            (Vec::new(), None)
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
                library: RemoteLibrarySummary::default(),
                epg: Vec::new(),
                media: Vec::new(),
                failed_attempts: 0,
                lockout_until: None,
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

    pub async fn set_platform_mode(&self, mode: PlatformMode, server_url: Option<String>) -> PlatformModeInfo {
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

    pub async fn update_playback_state(&self, new_state: RemotePlaybackState) {
        let mut state = self.inner.lock().await;
        state.playback_state = new_state.clone();

        // Broadcast to SSE streams
        if let Ok(json) = serde_json::to_string(&new_state) {
            let msg = format!("data: {json}\n\n");
            state.sse_senders.retain(|sender| sender.send(msg.clone()).is_ok());
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
            let broadcast_addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::new(255, 255, 255, 255)), DEFAULT_DISCOVERY_PORT);
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
        state.sse_senders.retain(|sender| sender.send(msg.clone()).is_ok());
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
        ("POST", "/pair") => {
            let body = extract_body(&req_str);
            let result = handle_pair_request(&manager, body, addr.ip().to_string(), user_agent).await;
            let (status_code, json_resp) = match result {
                Ok(pair_resp) => (200, serde_json::to_string(&pair_resp).unwrap_or_else(|_| r#"{"ok":true}"#.to_string())),
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
            let info = serde_json::json!({
                "appName": "Kinora",
                "version": "0.6.0",
                "mode": state.mode,
                "localIp": state.local_ip,
                "port": state.port,
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
            if !validate_token(&manager, auth_token.as_deref(), &[DeviceCapability::RemoteControl, DeviceCapability::PlaybackControl, DeviceCapability::MediaBrowse, DeviceCapability::AiAgent]).await {
                send_unauthorized(&mut stream).await;
                return;
            }

            let state = manager.inner.lock().await;
            let json = serde_json::to_string(&state.playback_state).unwrap_or_else(|_| "{}".to_string());
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
                json.len(),
                json
            );
            let _ = stream.write_all(resp.as_bytes()).await;
        }
        ("GET", "/api/channels") => {
            if !validate_token(&manager, auth_token.as_deref(), &[DeviceCapability::MediaBrowse, DeviceCapability::RemoteControl, DeviceCapability::ClientSync, DeviceCapability::AiAgent]).await {
                send_unauthorized(&mut stream).await;
                return;
            }

            let now_ms = (now_unix_secs() as i64).saturating_mul(1000);
            let state = manager.inner.lock().await;
            let sanitized: Vec<RemoteChannelSummary> = state.channels.iter().map(|c| {
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
            }).collect();
            let json = serde_json::to_string(&sanitized).unwrap_or_else(|_| "[]".to_string());
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
                json.len(),
                json
            );
            let _ = stream.write_all(resp.as_bytes()).await;
        }
        ("GET", "/api/epg") => {
            if !validate_token(&manager, auth_token.as_deref(), &[DeviceCapability::MediaBrowse, DeviceCapability::RemoteControl, DeviceCapability::ClientSync, DeviceCapability::AiAgent]).await {
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
            if !validate_token(&manager, auth_token.as_deref(), &[DeviceCapability::MediaBrowse, DeviceCapability::ClientSync, DeviceCapability::AiAgent]).await {
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
            if !validate_token(&manager, auth_token.as_deref(), &[DeviceCapability::MediaBrowse, DeviceCapability::RemoteControl, DeviceCapability::ClientSync, DeviceCapability::AiAgent]).await {
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

            let cached = art_key
                .as_deref()
                .filter(|k| !k.is_empty() && k.len() <= 256)
                .and_then(|k| manager.artwork_store.read_cached(k));

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
                && !caller.capabilities.contains(&DeviceCapability::PlaybackControl)
            {
                send_forbidden(&mut stream, "Device lacks ClientSync or PlaybackControl capability").await;
                return;
            }

            let body = extract_body(&req_str);
            let parsed_body = serde_json::from_str::<serde_json::Value>(body).ok();
            let target_cid = parsed_body
                .as_ref()
                .and_then(|v| v.get("channelId").and_then(|c| c.as_str()).map(|s| s.to_string()));
            let target_mid = parsed_body
                .as_ref()
                .and_then(|v| v.get("mediaId").and_then(|c| c.as_str()).map(|s| s.to_string()));

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
                .and_then(|v| v.get("sessionKey").and_then(|s| s.as_str()).map(|s| s.to_string()))
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
                && !caller.capabilities.contains(&DeviceCapability::PlaybackControl)
            {
                send_forbidden(&mut stream, "Device lacks ClientSync or PlaybackControl capability").await;
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

            handle_open_proxy_stream(&mut stream, &manager, &caller, target_cid, None, host_header.as_deref()).await;
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
            hdr.push_str("\r\n");
            let _ = stream.write_all(hdr.as_bytes()).await;
            let _ = stream.write_all(&reply.body).await;
        }
        ("GET", "/api/sources") => {
            if !validate_token(&manager, auth_token.as_deref(), &[DeviceCapability::MediaBrowse, DeviceCapability::ClientSync, DeviceCapability::AiAgent]).await {
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
            if !validate_token(&manager, auth_token.as_deref(), &[DeviceCapability::MediaBrowse, DeviceCapability::ClientSync, DeviceCapability::AiAgent]).await {
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
            if !validate_token(&manager, auth_token.as_deref(), &[DeviceCapability::ClientSync]).await {
                send_unauthorized(&mut stream).await;
                return;
            }

            let state = manager.inner.lock().await;
            let json = serde_json::to_string(&state.trusted_devices).unwrap_or_else(|_| "[]".to_string());
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
                json.len(),
                json
            );
            let _ = stream.write_all(resp.as_bytes()).await;
        }
        ("GET", "/api/audit") => {
            if !validate_token(&manager, auth_token.as_deref(), &[DeviceCapability::ClientSync, DeviceCapability::AiAgent]).await {
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
                let cmd_str = cmd_obj.get("command").and_then(|v| v.as_str()).unwrap_or("noop").to_string();
                let payload = cmd_obj.get("payload").cloned().unwrap_or(serde_json::Value::Null);

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
                let payload = cmd_obj.get("payload").cloned().unwrap_or(serde_json::Value::Null);

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
                        if payload.get("navigate").and_then(|v| v.as_bool()).unwrap_or(false) {
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
                        let cid = payload.get("channelId").and_then(|v| v.as_str()).map(|s| s.to_string());
                        let cname = payload.get("channelName").and_then(|v| v.as_str()).map(|s| s.to_ascii_lowercase());
                        let q = payload.get("query").and_then(|v| v.as_str()).map(|s| s.to_ascii_lowercase());
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
                                        && !p.description.as_deref().unwrap_or("").to_ascii_lowercase().contains(text_q)
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
                        let active_devices = state.trusted_devices.iter().filter(|d| !d.revoked).count();
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
                        (400, r#"{"ok":false,"error":"Unsupported agent action"}"#.to_string())
                    }
                };

                let reason = if status_code == 200 { "OK" } else { "Bad Request" };
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
                && !caller.capabilities.contains(&DeviceCapability::RemoteControl)
            {
                send_forbidden(&mut stream, "Device lacks InputText capability").await;
                return;
            }

            let body = extract_body(&req_str);
            if let Ok(input_obj) = serde_json::from_str::<serde_json::Value>(body) {
                let text = input_obj.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string();
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
                let item_ref = prog_obj.get("itemRef").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let title = prog_obj.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let position = prog_obj.get("position").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let duration = prog_obj.get("duration").and_then(|v| v.as_f64()).unwrap_or(0.0);

                if !item_ref.is_empty() {
                    let mut state = manager.inner.lock().await;
                    let now = now_unix_secs();
                    if let Some(existing) = state.library.watch_progress.iter_mut().find(|p| p.item_ref == item_ref) {
                        existing.position = position;
                        existing.duration = duration;
                        existing.updated_at = now;
                    } else {
                        state.library.watch_progress.push(RemoteWatchProgressItem {
                            item_ref: item_ref.clone(),
                            title: title.clone(),
                            position,
                            duration,
                            updated_at: now,
                        });
                    }

                    record_audit_action(
                        &mut state.audit_log,
                        &caller.id,
                        &caller.name,
                        "ClientSync",
                        "SyncProgress",
                        &format!("Updated progress for {item_ref}: {position}/{duration}s"),
                        "success",
                    );

                    broadcast_sse_envelope(
                        &mut state,
                        "sync_progress",
                        serde_json::json!({
                            "itemRef": item_ref,
                            "title": title,
                            "position": position,
                            "duration": duration,
                            "updatedAt": now
                        }),
                    );
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
                let action = lib_obj.get("action").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let id = lib_obj.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();

                if !id.is_empty() {
                    let mut state = manager.inner.lock().await;
                    match action.as_str() {
                        "toggle_favourite" => {
                            if let Some(pos) = state.library.favourites.iter().position(|f| f == &id) {
                                state.library.favourites.remove(pos);
                            } else {
                                state.library.favourites.push(id.clone());
                            }
                        }
                        "toggle_watchlist" => {
                            if let Some(pos) = state.library.watchlist.iter().position(|w| w == &id) {
                                state.library.watchlist.remove(pos);
                            } else {
                                state.library.watchlist.push(id.clone());
                            }
                        }
                        _ => {}
                    }

                    record_audit_action(
                        &mut state.audit_log,
                        &caller.id,
                        &caller.name,
                        "ClientSync",
                        &action,
                        &format!("Toggled {id}"),
                        "success",
                    );

                    let favs = state.library.favourites.clone();
                    let watch = state.library.watchlist.clone();
                    broadcast_sse_envelope(
                        &mut state,
                        "sync_library",
                        serde_json::json!({
                            "action": action,
                            "id": id,
                            "favourites": favs,
                            "watchlist": watch
                        }),
                    );
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
                && !caller.capabilities.contains(&DeviceCapability::PlaybackControl)
                && !caller.capabilities.contains(&DeviceCapability::RemoteControl)
            {
                send_forbidden(&mut stream, "Device lacks MediaCast capability").await;
                return;
            }

            let body = extract_body(&req_str);
            if let Ok(cast_obj) = serde_json::from_str::<serde_json::Value>(body) {
                let title = cast_obj.get("title").and_then(|v| v.as_str()).unwrap_or("Media").to_string();

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
            if !validate_token(&manager, auth_token.as_deref(), &[DeviceCapability::RemoteControl, DeviceCapability::PlaybackControl, DeviceCapability::MediaBrowse, DeviceCapability::ClientSync, DeviceCapability::MediaCast, DeviceCapability::AiAgent]).await {
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
            let not_found = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
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

async fn get_device_by_token(manager: &RemoteServerManager, token: Option<&str>) -> Option<TrustedDevice> {
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

async fn validate_token(manager: &RemoteServerManager, token: Option<&str>, required_caps: &[DeviceCapability]) -> bool {
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
            return required_caps.iter().any(|cap| dev.capabilities.contains(cap));
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
    let parsed: serde_json::Value = serde_json::from_str(body_str).map_err(|_| "Malformed request body.".to_string())?;
    let pin_attempt = parsed.get("pin").and_then(|v| v.as_str()).unwrap_or("").trim();
    let client_name = parsed.get("deviceName").and_then(|v| v.as_str()).unwrap_or("Mobile Remote").trim();
    let dev_type_str = parsed.get("deviceType").and_then(|v| v.as_str()).unwrap_or("phone");

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
            return Err(format!("Too many failed attempts. Try again in {secs_left}s."));
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
            Err(format!("Invalid pairing PIN. {remaining} attempts remaining."))
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
    let (found_stream, local_ip, port) = {
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
        (found, state.local_ip.clone(), state.port)
    };

    let Some(upstream_url) = found_stream else {
        let err_body = r#"{"ok":false,"error":"Channel or media stream not found"}"#;
        let resp = format!(
            "HTTP/1.1 404 Not Found\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
            err_body.len(),
            err_body
        );
        let _ = stream.write_all(resp.as_bytes()).await;
        return;
    };

    let target_label = if let Some(ref cid) = target_cid {
        format!("channelId={cid}")
    } else if let Some(ref mid) = target_mid {
        format!("mediaId={mid}")
    } else {
        "unknown".to_string()
    };
    match manager.stream_proxy.open(&caller.id, &upstream_url) {
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

pub fn get_embedded_remote_html() -> &'static str {
    r##"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>Kinora Remote</title>
  <meta name="theme-color" content="#0d0f14">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; user-select: none; }
    body { background: #0d0f14; color: #fff; height: 100vh; height: 100dvh; display: flex; flex-direction: column; overflow: hidden; padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }
    .header { display: flex; align-items: center; justify-content: space-between; padding: 12px 18px; background: rgba(255,255,255,0.04); border-bottom: 1px solid rgba(255,255,255,0.08); }
    .logo { font-size: 1.05rem; font-weight: 700; letter-spacing: -0.02em; display: flex; align-items: center; gap: 8px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 8px #10b981; }
    .btn-disconnect { background: transparent; border: 1px solid rgba(255,255,255,0.2); color: #fff; border-radius: 6px; padding: 4px 10px; font-size: 0.75rem; cursor: pointer; }

    /* Navigation Tabs */
    .tab-bar { display: flex; background: rgba(255,255,255,0.03); border-bottom: 1px solid rgba(255,255,255,0.08); }
    .tab-btn { flex: 1; padding: 10px 0; background: transparent; border: none; color: #94a3b8; font-size: 0.825rem; font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent; transition: all 120ms ease; }
    .tab-btn.active { color: #fff; border-bottom-color: #6366f1; background: rgba(99,102,241,0.08); }

    /* Pairing Screen */
    #pairingView { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; text-align: center; }
    .pairing-box { max-width: 320px; width: 100%; display: flex; flex-direction: column; gap: 14px; }
    .pin-input { font-size: 2rem; font-weight: 700; letter-spacing: 0.4em; text-align: center; padding: 12px; background: rgba(255,255,255,0.08); border: 2px solid rgba(255,255,255,0.2); border-radius: 12px; color: #fff; outline: none; }
    .name-input { font-size: 0.95rem; text-align: center; padding: 10px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; color: #fff; outline: none; }
    .btn-pair { background: #6366f1; border: none; color: #fff; padding: 14px; font-size: 1rem; font-weight: 600; border-radius: 12px; cursor: pointer; margin-top: 6px; }
    .pair-error { color: #ef4444; font-size: 0.8125rem; min-height: 20px; }

    /* Views Container */
    #mainViews { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    .view-content { flex: 1; display: flex; flex-direction: column; padding: 12px; gap: 12px; overflow-y: auto; }

    /* Now Playing Card */
    .now-playing { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; }
    .np-title { font-size: 0.95rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .np-channel { font-size: 0.75rem; color: #94a3b8; }
    .seek-row { display: flex; align-items: center; gap: 8px; }
    .seek-time { font-size: 0.7rem; color: #94a3b8; font-variant-numeric: tabular-nums; min-width: 38px; }
    .seek-time.right { text-align: right; }
    .seek-slider { flex: 1; accent-color: #6366f1; height: 4px; cursor: pointer; }
    .seek-slider:disabled { opacity: 0.45; cursor: default; }
    .media-badge { display: inline-block; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.04em; background: rgba(99,102,241,0.22); color: #c7d2fe; padding: 2px 6px; border-radius: 4px; margin-right: 6px; font-weight: 600; }

    /* D-Pad Controller */
    .dpad-container { display: flex; align-items: center; justify-content: center; margin: 4px 0; }
    .dpad { width: 210px; height: 210px; position: relative; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12); border-radius: 50%; display: flex; align-items: center; justify-content: center; }
    .dpad-btn { position: absolute; background: rgba(255,255,255,0.08); border: none; color: #fff; font-size: 1.1rem; display: flex; align-items: center; justify-content: center; cursor: pointer; border-radius: 12px; }
    .dpad-btn:active { background: rgba(99,102,241,0.4); transform: scale(0.95); }
    .dpad-up { top: 10px; width: 62px; height: 48px; }
    .dpad-down { bottom: 10px; width: 62px; height: 48px; }
    .dpad-left { left: 10px; width: 48px; height: 62px; }
    .dpad-right { right: 10px; width: 48px; height: 62px; }
    .dpad-center { width: 70px; height: 70px; border-radius: 50%; background: #6366f1; font-weight: 700; font-size: 0.95rem; box-shadow: 0 4px 14px rgba(99,102,241,0.4); }
    .dpad-center:active { transform: scale(0.92); }

    /* Key Clusters */
    .row-cluster { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .btn-action { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); color: #fff; padding: 12px 0; border-radius: 12px; font-size: 0.875rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 80ms ease; }
    .btn-action:active { background: rgba(255,255,255,0.22); transform: scale(0.96); }

    /* Volume and Channel Rockers */
    .rockers-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 2px; }
    .rocker { display: flex; flex-direction: column; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; overflow: hidden; }
    .rocker-btn { background: transparent; border: none; color: #fff; padding: 12px 0; font-size: 1.2rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .rocker-btn:active { background: rgba(255,255,255,0.15); }
    .rocker-label { text-align: center; font-size: 0.7rem; color: #94a3b8; padding: 2px 0; font-weight: 600; text-transform: uppercase; }

    /* Keypad Grid */
    .keypad-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; max-width: 300px; margin: 0 auto; width: 100%; }
    .key-btn { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); color: #fff; padding: 16px 0; font-size: 1.35rem; font-weight: 600; border-radius: 12px; cursor: pointer; }
    .key-btn:active { background: rgba(99,102,241,0.5); }

    /* Typing Card */
    .typing-box { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
    .typing-input { padding: 12px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: #fff; font-size: 1rem; outline: none; }
    .typing-btn { background: #6366f1; border: none; color: #fff; padding: 12px; border-radius: 8px; font-weight: 600; font-size: 0.95rem; cursor: pointer; }

    /* Channel List */
    .channel-search { padding: 10px 14px; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.15); border-radius: 10px; color: #fff; outline: none; width: 100%; font-size: 0.9rem; }
    .channel-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; cursor: pointer; margin-bottom: 6px; }
    .channel-item:active { background: rgba(99,102,241,0.2); border-color: #6366f1; }
    .channel-num { font-weight: 700; color: #6366f1; margin-right: 10px; font-size: 0.9rem; min-width: 30px; }
    .channel-title { font-weight: 600; font-size: 0.9rem; }
    .channel-now { font-size: 0.75rem; color: #94a3b8; }
  </style>
</head>
<body>
  <header class="header">
    <div class="logo">
      <span class="dot"></span>
      <span>Kinora Remote</span>
    </div>
    <button class="btn-disconnect" id="btnDisconnect" style="display:none;" onclick="disconnect()">Unpair</button>
  </header>

  <!-- Pairing PIN View -->
  <main id="pairingView">
    <div class="pairing-box">
      <h2>Connect to Kinora</h2>
      <p style="font-size:0.875rem;color:#94a3b8;">Enter the pairing PIN shown on your Kinora screen.</p>
      <input type="text" id="pinInput" class="pin-input" pattern="[0-9]*" inputmode="numeric" maxlength="6" placeholder="0000" autofocus>
      <input type="text" id="nameInput" class="name-input" placeholder="Device Name (e.g. Pixel Phone)">
      <div id="pairError" class="pair-error"></div>
      <button class="btn-pair" onclick="pairWithPin()">Pair Device</button>
    </div>
  </main>

  <!-- Active Remote View with Navigation Tabs -->
  <div id="mainViews" style="display:none;">
    <nav class="tab-bar">
      <button class="tab-btn active" id="tabRemoteBtn" onclick="switchTab('remote')">Remote</button>
      <button class="tab-btn" id="tabKeypadBtn" onclick="switchTab('keypad')">Keypad</button>
      <button class="tab-btn" id="tabChannelsBtn" onclick="switchTab('channels')">Channels</button>
      <button class="tab-btn" id="tabMediaBtn" onclick="switchTab('media')">Media</button>
    </nav>

    <!-- Tab 1: Remote Control -->
    <main id="viewRemote" class="view-content">
      <div class="now-playing">
        <div class="np-title" id="npTitle">Kinora TV</div>
        <div class="np-channel" id="npChannel">Connected & Ready</div>
        <div class="seek-row">
          <span class="seek-time" id="npTimeCur">0:00</span>
          <input type="range" id="seekSlider" class="seek-slider" min="0" max="100" value="0" aria-label="Playback position" disabled>
          <span class="seek-time right" id="npTimeDur">LIVE</span>
        </div>
      </div>

      <div class="dpad-container">
        <div class="dpad">
          <button class="dpad-btn dpad-up" onclick="sendCmd('dpad_up')">&#9650;</button>
          <button class="dpad-btn dpad-down" onclick="sendCmd('dpad_down')">&#9660;</button>
          <button class="dpad-btn dpad-left" onclick="sendCmd('dpad_left')">&#9664;</button>
          <button class="dpad-btn dpad-right" onclick="sendCmd('dpad_right')">&#9654;</button>
          <button class="dpad-center" onclick="sendCmd('dpad_select')">OK</button>
        </div>
      </div>

      <div class="row-cluster">
        <button class="btn-action" onclick="sendCmd('back')">Back</button>
        <button class="btn-action" onclick="sendCmd('home')">Home</button>
        <button class="btn-action" id="btnPlayPause" onclick="sendCmd('play_pause')">Play/Pause</button>
      </div>

      <div class="row-cluster">
        <button class="btn-action" onclick="sendCmd('step_back')">-10s</button>
        <button class="btn-action" onclick="sendCmd('step_forward')">+30s</button>
        <button class="btn-action" id="btnMute" onclick="sendCmd('toggle_mute')">Mute</button>
      </div>

      <div class="rockers-grid">
        <div class="rocker">
          <button class="rocker-btn" onclick="sendCmd('volume_up')">+</button>
          <div class="rocker-label">Volume</div>
          <button class="rocker-btn" onclick="sendCmd('volume_down')">-</button>
        </div>
        <div class="rocker">
          <button class="rocker-btn" onclick="sendCmd('channel_up')">&#9650;</button>
          <div class="rocker-label">Channel</div>
          <button class="rocker-btn" onclick="sendCmd('channel_down')">&#9660;</button>
        </div>
      </div>
    </main>

    <!-- Tab 2: Keyboard & Number Keypad -->
    <main id="viewKeypad" class="view-content" style="display:none;">
      <div class="typing-box">
        <label style="font-size:0.85rem;font-weight:600;color:#cbd5e1;">Type to Kinora TV</label>
        <input type="text" id="typeInput" class="typing-input" placeholder="Search title or type query...">
        <button class="typing-btn" onclick="sendTypedText()">Send to TV</button>
      </div>

      <div style="text-align:center;font-size:0.8rem;color:#94a3b8;margin-top:6px;">Direct Channel Keypad</div>
      <div class="keypad-grid">
        <button class="key-btn" onclick="sendDigit('1')">1</button>
        <button class="key-btn" onclick="sendDigit('2')">2</button>
        <button class="key-btn" onclick="sendDigit('3')">3</button>
        <button class="key-btn" onclick="sendDigit('4')">4</button>
        <button class="key-btn" onclick="sendDigit('5')">5</button>
        <button class="key-btn" onclick="sendDigit('6')">6</button>
        <button class="key-btn" onclick="sendDigit('7')">7</button>
        <button class="key-btn" onclick="sendDigit('8')">8</button>
        <button class="key-btn" onclick="sendDigit('9')">9</button>
        <button class="key-btn" onclick="sendCmd('back')">&#9003;</button>
        <button class="key-btn" onclick="sendDigit('0')">0</button>
        <button class="key-btn" onclick="sendCmd('dpad_select')">Enter</button>
      </div>
    </main>

    <!-- Tab 3: Channels Browser -->
    <main id="viewChannels" class="view-content" style="display:none;">
      <input type="text" id="channelFilter" class="channel-search" placeholder="Search channels..." oninput="filterChannels()">
      <div id="channelsList" style="margin-top:8px;"></div>
    </main>

    <!-- Tab 4: Media Library Browser -->
    <main id="viewMedia" class="view-content" style="display:none;">
      <input type="text" id="mediaFilter" class="channel-search" placeholder="Search movies, series, local files..." oninput="filterMedia()">
      <div id="mediaList" style="margin-top:8px;"></div>
    </main>
  </div>

  <script>
    let authToken = localStorage.getItem('kinora_token') || null;
    let sseSource = null;
    let channelsData = [];
    let mediaData = [];
    let isSeeking = false;
    let currentDurationSec = 0;

    window.addEventListener('load', () => {
      initDelegatedHandlers();
      if (authToken) {
        showRemote();
      } else {
        showPairing();
      }
    });

    function initDelegatedHandlers() {
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
          document.getElementById('npTimeCur').innerText = formatTime(Number(seekSlider.value));
        });
        seekSlider.addEventListener('change', () => {
          isSeeking = false;
          const pos = Math.max(0, Math.round(Number(seekSlider.value) || 0));
          document.getElementById('npTimeCur').innerText = formatTime(pos);
          sendCmd('seek_to', { positionSec: pos });
        });
      }

      const channelsList = document.getElementById('channelsList');
      if (channelsList) {
        channelsList.addEventListener('click', (e) => {
          const item = e.target.closest('.channel-item');
          if (!item) return;
          const id = item.getAttribute('data-channel-id') || '';
          const num = Number(item.getAttribute('data-channel-num') || '0');
          if (id) tuneToChannel(id, num);
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

    function showPairing() {
      document.getElementById('pairingView').style.display = 'flex';
      document.getElementById('mainViews').style.display = 'none';
      document.getElementById('btnDisconnect').style.display = 'none';
      if (sseSource) { sseSource.close(); sseSource = null; }
    }

    function showRemote() {
      document.getElementById('pairingView').style.display = 'none';
      document.getElementById('mainViews').style.display = 'flex';
      document.getElementById('btnDisconnect').style.display = 'block';
      connectSse();
      fetchChannels();
    }

    function switchTab(tab) {
      document.getElementById('tabRemoteBtn').classList.toggle('active', tab === 'remote');
      document.getElementById('tabKeypadBtn').classList.toggle('active', tab === 'keypad');
      document.getElementById('tabChannelsBtn').classList.toggle('active', tab === 'channels');
      document.getElementById('tabMediaBtn').classList.toggle('active', tab === 'media');

      document.getElementById('viewRemote').style.display = tab === 'remote' ? 'flex' : 'none';
      document.getElementById('viewKeypad').style.display = tab === 'keypad' ? 'flex' : 'none';
      document.getElementById('viewChannels').style.display = tab === 'channels' ? 'block' : 'none';
      document.getElementById('viewMedia').style.display = tab === 'media' ? 'block' : 'none';

      if (tab === 'channels' && channelsData.length === 0) {
        fetchChannels();
      }
      if (tab === 'media' && mediaData.length === 0) {
        fetchMedia();
      }
    }

    async function pairWithPin() {
      const pin = document.getElementById('pinInput').value.trim();
      const deviceName = document.getElementById('nameInput').value.trim() || 'Mobile Remote';
      const errBox = document.getElementById('pairError');
      errBox.innerText = '';

      if (pin.length < 4) {
        errBox.innerText = 'PIN must be at least 4 digits.';
        return;
      }

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
          errBox.innerText = data.error || 'Pairing failed. Check PIN.';
        }
      } catch (e) {
        errBox.innerText = 'Connection error. Are you on the same Wi-Fi?';
      }
    }

    function disconnect() {
      if (confirm('Disconnect this remote?')) {
        authToken = null;
        localStorage.removeItem('kinora_token');
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
          disconnect();
        }
      } catch (e) {}
    }

    async function sendTypedText() {
      const input = document.getElementById('typeInput');
      const text = input.value;
      if (!text || !authToken) return;
      try {
        await fetch('/api/input', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + authToken
          },
          body: JSON.stringify({ text })
        });
        input.value = '';
      } catch (e) {}
    }

    function sendDigit(d) {
      sendCmd('keypad_digit', { digit: d });
    }

    async function fetchChannels() {
      if (!authToken) return;
      try {
        const res = await fetch('/api/channels', {
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        if (res.ok) {
          channelsData = await res.json();
          renderChannels(channelsData);
        }
      } catch (e) {}
    }

    function renderChannels(list) {
      const box = document.getElementById('channelsList');
      if (!list || list.length === 0) {
        box.innerHTML = '<div style="color:#94a3b8;font-size:0.85rem;text-align:center;padding:20px;">No channels found on TV.</div>';
        return;
      }
      box.innerHTML = list.map(c => `
        <div class="channel-item" data-channel-id="${escapeHtml(c.id)}" data-channel-num="${Number(c.number) || 0}">
          <div>
            <span class="channel-num">${c.number ? '#' + escapeHtml(c.number) : ''}</span>
            <span class="channel-title">${escapeHtml(c.name)}</span>
            <div class="channel-now">${escapeHtml(c.currentProgramme || c.group || 'Live')}</div>
          </div>
          <button type="button" style="background:#6366f1;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:0.75rem;cursor:pointer;">Watch</button>
        </div>
      `).join('');
    }

    function filterChannels() {
      const q = document.getElementById('channelFilter').value.toLowerCase();
      const filtered = channelsData.filter(c => (c.name || '').toLowerCase().includes(q) || (c.group || '').toLowerCase().includes(q));
      renderChannels(filtered);
    }

    async function fetchMedia() {
      if (!authToken) return;
      try {
        const res = await fetch('/api/media', {
          headers: { 'Authorization': 'Bearer ' + authToken }
        });
        if (res.ok) {
          mediaData = await res.json();
          renderMedia(mediaData);
        }
      } catch (e) {}
    }

    function renderMedia(list) {
      const box = document.getElementById('mediaList');
      if (!list || list.length === 0) {
        box.innerHTML = '<div style="color:#94a3b8;font-size:0.85rem;text-align:center;padding:20px;">No movies, series, or local media found on server.</div>';
        return;
      }
      box.innerHTML = list.map(m => {
        const metaParts = [];
        if (m.year) metaParts.push(String(m.year));
        if (Array.isArray(m.genres) && m.genres.length > 0) metaParts.push(m.genres.slice(0, 2).join(', '));
        const subtitle = metaParts.join(' - ') || (m.group || 'Library');
        return `
        <div class="channel-item media-item" data-media-id="${escapeHtml(m.id)}" data-media-title="${escapeHtml(m.title)}" data-media-kind="${escapeHtml(m.kind || 'movie')}">
          <div>
            <div>
              <span class="media-badge">${escapeHtml(m.kind || 'media')}</span>
              <span class="channel-title">${escapeHtml(m.title)}</span>
            </div>
            <div class="channel-now">${escapeHtml(subtitle)}</div>
          </div>
          <button type="button" style="background:#6366f1;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:0.75rem;cursor:pointer;">Play on TV</button>
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
      renderMedia(filtered);
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
      sseSource.onmessage = (e) => {
        try {
          const state = JSON.parse(e.data);
          if (state && !state.type) {
            updatePlaybackUi(state);
          }
        } catch (err) {}
      };
      sseSource.onerror = () => {
        if (sseSource) sseSource.close();
        setTimeout(connectSse, 4000);
      };
    }

    function updatePlaybackUi(state) {
      document.getElementById('npTitle').innerText = state.title || 'Kinora TV';
      document.getElementById('npChannel').innerText = state.channelName ? `${state.channelName} (${state.channelNumber || ''})` : (state.subtitle || 'Connected');
      const playBtn = document.getElementById('btnPlayPause');
      if (playBtn && typeof state.isPlaying === 'boolean') {
        playBtn.innerText = state.isPlaying ? 'Pause' : 'Play';
      }
      const muteBtn = document.getElementById('btnMute');
      if (muteBtn && typeof state.isMuted === 'boolean') {
        muteBtn.innerText = state.isMuted ? 'Unmute' : 'Mute';
      }
      const slider = document.getElementById('seekSlider');
      const curLabel = document.getElementById('npTimeCur');
      const durLabel = document.getElementById('npTimeDur');
      const dur = Number(state.durationSec) || 0;
      const pos = Math.max(0, Number(state.positionSec) || 0);
      currentDurationSec = dur;
      if (slider && curLabel && durLabel) {
        if (dur > 0 && !state.isLive) {
          slider.disabled = false;
          slider.max = String(Math.floor(dur));
          durLabel.innerText = formatTime(dur);
          if (!isSeeking) {
            slider.value = String(Math.min(Math.floor(dur), Math.floor(pos)));
            curLabel.innerText = formatTime(pos);
          }
        } else {
          slider.disabled = true;
          slider.max = '100';
          slider.value = '0';
          curLabel.innerText = formatTime(pos);
          durLabel.innerText = 'LIVE';
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
        assert!(pair_resp.capabilities.contains(&DeviceCapability::RemoteControl));

        // Verify trusted device was added
        let devices = mgr.get_trusted_devices().await;
        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].name, "Test Phone");
        assert_eq!(devices[0].device_type, DeviceType::Phone);
        assert!(!devices[0].revoked);

        // Incorrect PIN
        let bad_res = handle_pair_request(
            &mgr,
            r#"{"pin":"0000"}"#,
            "192.168.1.10".to_string(),
            None,
        )
        .await;
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
        let is_valid = validate_token(&mgr, Some(&pair_resp.token), &[DeviceCapability::RemoteControl]).await;
        assert!(is_valid);

        // Revoke device
        let revoked = mgr.revoke_device(&pair_resp.device_id).await;
        assert!(revoked);

        // Token should now be refused
        let is_valid_after = validate_token(&mgr, Some(&pair_resp.token), &[DeviceCapability::RemoteControl]).await;
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
            &format!(r#"{{"pin":"{pin}","deviceName":"Local Jarvis Agent","deviceType":"aiAgent"}}"#),
            "127.0.0.1".to_string(),
            None,
        )
        .await
        .unwrap();

        assert!(pair_resp.capabilities.contains(&DeviceCapability::AiAgent));
        assert!(pair_resp.capabilities.contains(&DeviceCapability::MediaBrowse));
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
            &format!(r#"{{"pin":"{pin}","deviceName":"Living Room Tablet","deviceType":"tablet"}}"#),
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
        let temp_dir = std::env::temp_dir().join(format!("kinora-dev-rename-test-{}", now_unix_secs()));
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

        let renamed = mgr.rename_device(&pair_resp.device_id, "New Friendly Name").await;
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
            .set_platform_mode(PlatformMode::Client, Some("http://192.168.1.100:5198".to_string()))
            .await;
        assert_eq!(client_mode.mode, PlatformMode::Client);
        assert_eq!(client_mode.server_url.as_deref(), Some("http://192.168.1.100:5198"));
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
        assert_eq!(inner.channels[0].current_programme.as_deref(), Some("News at Six"));
    }

    #[tokio::test]
    async fn remote_sources_and_library_cache() {
        let mgr = RemoteServerManager::new(None);
        let sources = vec![
            RemoteSourceSummary {
                id: "src-1".to_string(),
                label: "UK Freeview".to_string(),
                origin: "https://example.com/playlist.m3u".to_string(),
                channel_count: 42,
                kind: "playlist".to_string(),
            },
        ];
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
        let channels = vec![
            RemoteChannelSummary {
                id: "ch-test-1".to_string(),
                name: "Test Stream HD".to_string(),
                number: Some(101),
                group: Some("Test".to_string()),
                logo: None,
                current_programme: None,
                stream_url: Some("https://example.com/live/ch1.m3u8".to_string()),
            },
        ];

        mgr.update_channels(channels).await;
        let inner = mgr.inner.lock().await;
        assert_eq!(inner.channels[0].stream_url.as_deref(), Some("https://example.com/live/ch1.m3u8"));
    }

    #[tokio::test]
    async fn platform_config_persists_across_restarts() {
        let temp_dir = std::env::temp_dir().join(format!(
            "kinora_platform_cfg_test_{}",
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        let _ = fs::create_dir_all(&temp_dir);

        let mgr = RemoteServerManager::new(Some(temp_dir.clone()));
        mgr.set_platform_mode(PlatformMode::Client, Some("http://192.168.1.42:5198".to_string()))
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

        let mut policy = crate::fetch::Policy::default();
        policy.allow_loopback = true;
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

        let status = mgr.start(Some(srv_port), Some("482910".to_string()), |_| {}).await.unwrap();
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
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
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
}
