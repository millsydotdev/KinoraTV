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
}

impl Default for RemoteServerManager {
    fn default() -> Self {
        Self::new(None)
    }
}

impl RemoteServerManager {
    pub fn new(data_dir: Option<PathBuf>) -> Self {
        let pin = generate_pairing_pin();
        let ip = detect_local_ip();
        let loaded_devices = if let Some(ref dir) = data_dir {
            load_trusted_devices_from_disk(dir)
        } else {
            Vec::new()
        };

        Self {
            inner: Arc::new(Mutex::new(ServerInner {
                data_dir,
                running: false,
                port: DEFAULT_REMOTE_PORT,
                local_ip: ip,
                pairing_pin: pin,
                mode: PlatformMode::Standalone,
                server_client_url: None,
                trusted_devices: loaded_devices,
                audit_log: Vec::new(),
                channels: Vec::new(),
                sources: Vec::new(),
                library: RemoteLibrarySummary::default(),
                failed_attempts: 0,
                lockout_until: None,
                playback_state: RemotePlaybackState::default(),
                sse_senders: Vec::new(),
                shutdown_tx: None,
                beacon_shutdown_tx: None,
            })),
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

        let chosen_port = port.unwrap_or(DEFAULT_REMOTE_PORT);
        if let Some(pin) = custom_pin {
            if pin.trim().len() >= 4 {
                state.pairing_pin = pin.trim().to_string();
            }
        }
        state.port = chosen_port;
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
    for line in lines {
        if line.is_empty() {
            break;
        }
        let lower = line.to_lowercase();
        if lower.starts_with("authorization: bearer ") {
            auth_token = Some(line[21..].trim().to_string());
        } else if lower.starts_with("user-agent:") {
            user_agent = Some(line[11..].trim().to_string());
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
        let resp = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, DELETE, OPTIONS\r\nAccess-Control-Allow-Headers: Authorization, Content-Type\r\n\r\n";
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

            let state = manager.inner.lock().await;
            let sanitized: Vec<RemoteChannelSummary> = state.channels.iter().map(|c| {
                let mut s = c.clone();
                s.stream_url = None;
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
        ("GET", p) if p.starts_with("/api/stream/resolve") => {
            let caller_opt = get_device_by_token(&manager, auth_token.as_deref()).await;
            if caller_opt.is_none() {
                send_unauthorized(&mut stream).await;
                return;
            }
            let caller = caller_opt.unwrap();
            if !caller.capabilities.contains(&DeviceCapability::ClientSync) && !caller.capabilities.contains(&DeviceCapability::PlaybackControl) {
                send_forbidden(&mut stream, "Device lacks ClientSync or PlaybackControl capability").await;
                return;
            }

            let mut target_cid: Option<String> = None;
            for pair in query_str.split('&') {
                if let Some((k, v)) = pair.split_once('=') {
                    if k == "channelId" && !v.is_empty() {
                        target_cid = Some(v.to_string());
                        break;
                    }
                }
            }

            let state = manager.inner.lock().await;
            let found_stream = target_cid.as_deref().and_then(|cid| {
                state.channels.iter().find(|c| c.id == cid).and_then(|c| c.stream_url.clone())
            });

            if let Some(stream_url) = found_stream {
                let json_body = serde_json::json!({
                    "ok": true,
                    "channelId": target_cid.unwrap_or_default(),
                    "streamUrl": stream_url
                }).to_string();
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
                    json_body.len(),
                    json_body
                );
                let _ = stream.write_all(resp.as_bytes()).await;
            } else {
                let err_body = r#"{"ok":false,"error":"Channel or stream not found"}"#;
                let resp = format!(
                    "HTTP/1.1 404 Not Found\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
                    err_body.len(),
                    err_body
                );
                let _ = stream.write_all(resp.as_bytes()).await;
            }
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
                let action = cmd_obj.get("action").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
                let payload = cmd_obj.get("payload").cloned().unwrap_or(serde_json::Value::Null);

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

                // Map agent action to appropriate event
                let evt = RemoteCommandEvent {
                    command: format!("agent_{action}"),
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
        ("POST", "/api/input") => {
            let caller_opt = get_device_by_token(&manager, auth_token.as_deref()).await;
            if caller_opt.is_none() {
                send_unauthorized(&mut stream).await;
                return;
            }
            let caller = caller_opt.unwrap();

            let body = extract_body(&req_str);
            if let Ok(input_obj) = serde_json::from_str::<serde_json::Value>(body) {
                let text = input_obj.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string();

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
    .progress-bar { width: 100%; height: 4px; background: rgba(255,255,255,0.15); border-radius: 2px; overflow: hidden; }
    .progress-fill { height: 100%; background: #6366f1; width: 0%; transition: width 200ms ease; }

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
      <p style="font-size:0.875rem;color:#94a3b8;">Enter the 4-digit pairing PIN shown on your Kinora screen.</p>
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
      <button class="tab-btn" id="tabKeypadBtn" onclick="switchTab('keypad')">Input & Keypad</button>
      <button class="tab-btn" id="tabChannelsBtn" onclick="switchTab('channels')">Channels</button>
    </nav>

    <!-- Tab 1: Remote Control -->
    <main id="viewRemote" class="view-content">
      <div class="now-playing">
        <div class="np-title" id="npTitle">Kinora TV</div>
        <div class="np-channel" id="npChannel">Connected & Ready</div>
        <div class="progress-bar"><div class="progress-fill" id="npProgress"></div></div>
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
        <button class="btn-action" onclick="sendCmd('toggle_mute')">Mute</button>
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
  </div>

  <script>
    let authToken = localStorage.getItem('kinora_token') || null;
    let sseSource = null;
    let channelsData = [];

    window.addEventListener('load', () => {
      if (authToken) {
        showRemote();
      } else {
        showPairing();
      }
    });

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

      document.getElementById('viewRemote').style.display = tab === 'remote' ? 'flex' : 'none';
      document.getElementById('viewKeypad').style.display = tab === 'keypad' ? 'flex' : 'none';
      document.getElementById('viewChannels').style.display = tab === 'channels' ? 'block' : 'none';

      if (tab === 'channels' && channelsData.length === 0) {
        fetchChannels();
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
        <div class="channel-item" onclick="tuneToChannel('${c.id}', ${c.number || 0})">
          <div>
            <span class="channel-num">${c.number ? '#' + c.number : ''}</span>
            <span class="channel-title">${escapeHtml(c.name)}</span>
            <div class="channel-now">${escapeHtml(c.currentProgramme || c.group || 'Live')}</div>
          </div>
          <button style="background:#6366f1;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:0.75rem;cursor:pointer;">Watch</button>
        </div>
      `).join('');
    }

    function filterChannels() {
      const q = document.getElementById('channelFilter').value.toLowerCase();
      const filtered = channelsData.filter(c => (c.name || '').toLowerCase().includes(q) || (c.group || '').toLowerCase().includes(q));
      renderChannels(filtered);
    }

    function tuneToChannel(channelId, channelNumber) {
      sendCmd('tune_channel', { channelId, channelNumber });
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function connectSse() {
      if (sseSource) sseSource.close();
      sseSource = new EventSource('/api/events?token=' + encodeURIComponent(authToken || ''));
      sseSource.onmessage = (e) => {
        try {
          const state = JSON.parse(e.data);
          updatePlaybackUi(state);
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
      if (state.durationSec > 0) {
        const pct = Math.min(100, Math.max(0, (state.positionSec / state.durationSec) * 100));
        document.getElementById('npProgress').style.width = pct + '%';
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
}
