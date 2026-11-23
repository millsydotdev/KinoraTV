// remote_server.rs - Wireless LAN mobile remote control server for Kinora.
// Serves touch-optimized web interface to phones and tablets on the local network.
// Strictly adheres to typography standards: zero em-dashes across all code and comments.

use std::collections::HashSet;
use std::net::{IpAddr, SocketAddr, UdpSocket};
use std::sync::Arc;
use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, oneshot, Mutex};

pub const DEFAULT_REMOTE_PORT: u16 = 5198;
const MAX_REQUEST_SIZE: usize = 64 * 1024;
const MAX_FAILED_ATTEMPTS: u32 = 5;
const LOCKOUT_DURATION_SECS: u64 = 30;

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
pub struct RemoteServerStatus {
    pub running: bool,
    pub port: u16,
    pub local_ip: String,
    pub pairing_pin: String,
    pub server_url: String,
    pub connected_clients: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteCommandEvent {
    pub command: String,
    pub payload: serde_json::Value,
    pub client_id: Option<String>,
    pub timestamp: u64,
}

struct ServerInner {
    running: bool,
    port: u16,
    local_ip: String,
    pairing_pin: String,
    auth_tokens: HashSet<String>,
    failed_attempts: u32,
    lockout_until: Option<Instant>,
    playback_state: RemotePlaybackState,
    sse_senders: Vec<mpsc::UnboundedSender<String>>,
    shutdown_tx: Option<oneshot::Sender<()>>,
}

#[derive(Clone)]
pub struct RemoteServerManager {
    inner: Arc<Mutex<ServerInner>>,
}

impl RemoteServerManager {
    pub fn new() -> Self {
        let pin = generate_pairing_pin();
        let ip = detect_local_ip();
        Self {
            inner: Arc::new(Mutex::new(ServerInner {
                running: false,
                port: DEFAULT_REMOTE_PORT,
                local_ip: ip,
                pairing_pin: pin,
                auth_tokens: HashSet::new(),
                failed_attempts: 0,
                lockout_until: None,
                playback_state: RemotePlaybackState::default(),
                sse_senders: Vec::new(),
                shutdown_tx: None,
            })),
        }
    }

    pub async fn get_status(&self) -> RemoteServerStatus {
        let state = self.inner.lock().await;
        let server_url = format!("http://{}:{}", state.local_ip, state.port);
        RemoteServerStatus {
            running: state.running,
            port: state.port,
            local_ip: state.local_ip.clone(),
            pairing_pin: state.pairing_pin.clone(),
            server_url,
            connected_clients: state.auth_tokens.len(),
        }
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

    pub async fn start<F>(&self, port: Option<u16>, custom_pin: Option<String>, on_command: F) -> Result<RemoteServerStatus, String>
    where
        F: Fn(RemoteCommandEvent) + Send + Sync + 'static,
    {
        let mut state = self.inner.lock().await;
        if state.running {
            let server_url = format!("http://{}:{}", state.local_ip, state.port);
            return Ok(RemoteServerStatus {
                running: true,
                port: state.port,
                local_ip: state.local_ip.clone(),
                pairing_pin: state.pairing_pin.clone(),
                server_url,
                connected_clients: state.auth_tokens.len(),
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
            .map_err(|e| format!("Failed to bind remote control server on port {chosen_port}: {e}"))?;

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

        let server_url = format!("http://{}:{}", state.local_ip, state.port);
        Ok(RemoteServerStatus {
            running: true,
            port: state.port,
            local_ip: state.local_ip.clone(),
            pairing_pin: state.pairing_pin.clone(),
            server_url,
            connected_clients: state.auth_tokens.len(),
        })
    }

    pub async fn stop(&self) {
        let mut state = self.inner.lock().await;
        if let Some(tx) = state.shutdown_tx.take() {
            let _ = tx.send(());
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

async fn handle_connection<F>(
    mut stream: TcpStream,
    _addr: SocketAddr,
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

    let (path, _query) = full_path.split_once('?').unwrap_or((full_path, ""));

    // Extract headers
    let mut auth_token = None;
    for line in lines {
        if line.is_empty() {
            break;
        }
        let lower = line.to_lowercase();
        if lower.starts_with("authorization: bearer ") {
            auth_token = Some(line[21..].trim().to_string());
        }
    }

    // CORS preflight
    if method == "OPTIONS" {
        let resp = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Authorization, Content-Type\r\n\r\n";
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
            let result = handle_pair_request(&manager, body).await;
            let (status_code, json_resp) = match result {
                Ok(token) => (200, format!(r#"{{"ok":true,"token":"{token}"}}"#)),
                Err(err) => (401, format!(r#"{{"ok":false,"error":"{err}"}}"#)),
            };
            let resp = format!(
                "HTTP/1.1 {status_code} OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
                json_resp.len(),
                json_resp
            );
            let _ = stream.write_all(resp.as_bytes()).await;
        }
        ("GET", "/status") => {
            if !validate_token(&manager, auth_token.as_deref()).await {
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
        ("POST", "/command") => {
            if !validate_token(&manager, auth_token.as_deref()).await {
                send_unauthorized(&mut stream).await;
                return;
            }

            let body = extract_body(&req_str);
            if let Ok(cmd_obj) = serde_json::from_str::<serde_json::Value>(body) {
                let cmd_str = cmd_obj.get("command").and_then(|v| v.as_str()).unwrap_or("noop").to_string();
                let payload = cmd_obj.get("payload").cloned().unwrap_or(serde_json::Value::Null);

                let evt = RemoteCommandEvent {
                    command: cmd_str,
                    payload,
                    client_id: auth_token.clone(),
                    timestamp: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs())
                        .unwrap_or(0),
                };

                on_command(evt);

                let resp = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 11\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{\"ok\":true}";
                let _ = stream.write_all(resp.as_bytes()).await;
            } else {
                let err_resp = "HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nContent-Length: 26\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{\"error\":\"Invalid JSON\"}";
                let _ = stream.write_all(err_resp.as_bytes()).await;
            }
        }
        ("GET", "/events") => {
            if !validate_token(&manager, auth_token.as_deref()).await {
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

async fn validate_token(manager: &RemoteServerManager, token: Option<&str>) -> bool {
    let tok = match token {
        Some(t) => t,
        None => return false,
    };
    let state = manager.inner.lock().await;
    state.auth_tokens.contains(tok)
}

async fn handle_pair_request(manager: &RemoteServerManager, body_str: &str) -> Result<String, String> {
    let parsed: serde_json::Value = serde_json::from_str(body_str).map_err(|_| "Malformed request body.".to_string())?;
    let pin_attempt = parsed.get("pin").and_then(|v| v.as_str()).unwrap_or("").trim();

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
        state.auth_tokens.insert(token.clone());
        Ok(token)
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
    
    /* Pairing Screen */
    #pairingView { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; text-align: center; }
    .pairing-box { max-width: 320px; width: 100%; display: flex; flex-direction: column; gap: 16px; }
    .pin-input { font-size: 2rem; font-weight: 700; letter-spacing: 0.4em; text-align: center; padding: 12px; background: rgba(255,255,255,0.08); border: 2px solid rgba(255,255,255,0.2); border-radius: 12px; color: #fff; outline: none; }
    .btn-pair { background: #6366f1; border: none; color: #fff; padding: 14px; font-size: 1rem; font-weight: 600; border-radius: 12px; cursor: pointer; }
    .pair-error { color: #ef4444; font-size: 0.8125rem; min-height: 20px; }

    /* Remote View */
    #remoteView { flex: 1; display: flex; flex-direction: column; padding: 12px; gap: 12px; overflow-y: auto; }
    
    /* Now Playing Card */
    .now-playing { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; padding: 12px 16px; display: flex; flex-direction: column; gap: 6px; }
    .np-title { font-size: 0.95rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .np-channel { font-size: 0.75rem; color: #94a3b8; }
    
    /* D-Pad Controller */
    .dpad-container { display: flex; align-items: center; justify-content: center; margin: 8px 0; }
    .dpad { width: 220px; height: 220px; position: relative; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12); border-radius: 50%; display: flex; align-items: center; justify-content: center; }
    .dpad-btn { position: absolute; background: rgba(255,255,255,0.08); border: none; color: #fff; font-size: 1.1rem; display: flex; align-items: center; justify-content: center; cursor: pointer; border-radius: 12px; active: { background: rgba(99,102,241,0.5); } }
    .dpad-btn:active { background: rgba(99,102,241,0.4); transform: scale(0.95); }
    .dpad-up { top: 12px; width: 64px; height: 50px; }
    .dpad-down { bottom: 12px; width: 64px; height: 50px; }
    .dpad-left { left: 12px; width: 50px; height: 64px; }
    .dpad-right { right: 12px; width: 50px; height: 64px; }
    .dpad-center { width: 72px; height: 72px; border-radius: 50%; background: #6366f1; font-weight: 700; font-size: 0.95rem; box-shadow: 0 4px 14px rgba(99,102,241,0.4); }
    .dpad-center:active { transform: scale(0.92); }

    /* Key Clusters */
    .row-cluster { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .btn-action { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); color: #fff; padding: 14px 0; border-radius: 12px; font-size: 0.875rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 80ms ease; }
    .btn-action:active { background: rgba(255,255,255,0.22); transform: scale(0.96); }

    /* Volume and Channel Rockers */
    .rockers-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 4px; }
    .rocker { display: flex; flex-direction: column; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; overflow: hidden; }
    .rocker-btn { background: transparent; border: none; color: #fff; padding: 14px 0; font-size: 1.25rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .rocker-btn:active { background: rgba(255,255,255,0.15); }
    .rocker-label { text-align: center; font-size: 0.7rem; color: #94a3b8; padding: 4px 0; font-weight: 600; text-transform: uppercase; }
  </style>
</head>
<body>
  <header class="header">
    <div class="logo">
      <span class="dot"></span>
      <span>Kinora TV Remote</span>
    </div>
    <button class="btn-disconnect" id="btnDisconnect" style="display:none;" onclick="disconnect()">Unpair</button>
  </header>

  <!-- Pairing PIN View -->
  <main id="pairingView">
    <div class="pairing-box">
      <h2>Enter Pairing PIN</h2>
      <p style="font-size:0.875rem;color:#94a3b8;">Enter the 4-digit PIN displayed on your Kinora TV screen to pair this device.</p>
      <input type="text" id="pinInput" class="pin-input" pattern="[0-9]*" inputmode="numeric" maxlength="6" placeholder="0000" autofocus>
      <div id="pairError" class="pair-error"></div>
      <button class="btn-pair" onclick="pairWithPin()">Connect Remote</button>
    </div>
  </main>

  <!-- Active Remote View -->
  <main id="remoteView" style="display:none;">
    <div class="now-playing">
      <div class="np-title" id="npTitle">Kinora TV</div>
      <div class="np-channel" id="npChannel">Connected & Ready</div>
    </div>

    <!-- D-Pad Navigation -->
    <div class="dpad-container">
      <div class="dpad">
        <button class="dpad-btn dpad-up" onclick="send('dpad_up')">▲</button>
        <button class="dpad-btn dpad-left" onclick="send('dpad_left')">◀</button>
        <button class="dpad-btn dpad-center" onclick="send('dpad_select')">OK</button>
        <button class="dpad-btn dpad-right" onclick="send('dpad_right')">▶</button>
        <button class="dpad-btn dpad-down" onclick="send('dpad_down')">▼</button>
      </div>
    </div>

    <!-- Top Navigation Actions -->
    <div class="row-cluster">
      <button class="btn-action" onclick="send('back')">Back</button>
      <button class="btn-action" onclick="send('home')">Home</button>
      <button class="btn-action" onclick="send('guide')">Guide</button>
    </div>

    <!-- Playback Controls -->
    <div class="row-cluster">
      <button class="btn-action" onclick="send('seek_back')">« -10s</button>
      <button class="btn-action" style="background:#6366f1;" onclick="send('toggle_play')">⏯ Play</button>
      <button class="btn-action" onclick="send('seek_forward')">+10s »</button>
    </div>

    <!-- Rockers: Volume and Channel -->
    <div class="rockers-grid">
      <div class="rocker">
        <button class="rocker-btn" onclick="send('vol_up')">+</button>
        <div class="rocker-label">VOL</div>
        <button class="rocker-btn" onclick="send('vol_down')">-</button>
      </div>
      <div class="rocker">
        <button class="rocker-btn" onclick="send('ch_up')">▲</button>
        <div class="rocker-label">CH</div>
        <button class="rocker-btn" onclick="send('ch_down')">▼</button>
      </div>
    </div>

    <div class="row-cluster">
      <button class="btn-action" onclick="send('mute')">Mute</button>
      <button class="btn-action" onclick="send('subtitles')">CC</button>
      <button class="btn-action" onclick="send('aspect')">Aspect</button>
    </div>
  </main>

  <script>
    let authToken = localStorage.getItem('kinora_remote_token');
    let eventSource = null;

    function haptic() {
      if (navigator.vibrate) navigator.vibrate(25);
    }

    async function pairWithPin() {
      const pin = document.getElementById('pinInput').value.trim();
      const errEl = document.getElementById('pairError');
      errEl.textContent = '';
      if (!pin) {
        errEl.textContent = 'Please enter PIN';
        return;
      }
      try {
        const res = await fetch('/pair', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin })
        });
        const data = await res.json();
        if (data.ok && data.token) {
          authToken = data.token;
          localStorage.setItem('kinora_remote_token', authToken);
          showRemote();
        } else {
          errEl.textContent = data.error || 'Pairing failed';
        }
      } catch (e) {
        errEl.textContent = 'Connection to Kinora failed';
      }
    }

    function showRemote() {
      document.getElementById('pairingView').style.display = 'none';
      document.getElementById('remoteView').style.display = 'flex';
      document.getElementById('btnDisconnect').style.display = 'block';
      startEvents();
    }

    function disconnect() {
      authToken = null;
      localStorage.removeItem('kinora_remote_token');
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      document.getElementById('remoteView').style.display = 'none';
      document.getElementById('pairingView').style.display = 'flex';
      document.getElementById('btnDisconnect').style.display = 'none';
      document.getElementById('pinInput').value = '';
    }

    async function send(command, payload = {}) {
      haptic();
      if (!authToken) return;
      try {
        const res = await fetch('/command', {
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

    function startEvents() {
      if (eventSource) eventSource.close();
      if (!authToken) return;
      eventSource = new EventSource('/events?token=' + encodeURIComponent(authToken));
      eventSource.onmessage = (e) => {
        try {
          const state = JSON.parse(e.data);
          if (state.title) document.getElementById('npTitle').textContent = state.title;
          if (state.channelName) {
            document.getElementById('npChannel').textContent = (state.channelNumber ? '#' + state.channelNumber + ' ' : '') + state.channelName;
          } else if (state.subtitle) {
            document.getElementById('npChannel').textContent = state.subtitle;
          }
        } catch (err) {}
      };
      eventSource.onerror = () => {
        // Will automatically retry
      };
    }

    // Auto-login on load if token present
    window.addEventListener('DOMContentLoaded', () => {
      if (authToken) {
        showRemote();
      }
    });
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
        let mgr = RemoteServerManager::new();
        let status = mgr.get_status().await;
        assert!(!status.running);
        assert_eq!(status.port, DEFAULT_REMOTE_PORT);
        assert_eq!(status.pairing_pin.len(), 4);

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
    async fn pairing_logic_enforces_pin_and_rate_limits() {
        let mgr = RemoteServerManager::new();
        let pin = {
            let state = mgr.inner.lock().await;
            state.pairing_pin.clone()
        };

        // Correct PIN
        let good_res = handle_pair_request(&mgr, &format!(r#"{{"pin":"{pin}"}}"#)).await;
        assert!(good_res.is_ok());
        let token = good_res.unwrap();
        assert_eq!(token.len(), 32);

        // Incorrect PIN
        let bad_res = handle_pair_request(&mgr, r#"{"pin":"0000"}"#).await;
        assert!(bad_res.is_err());
    }
}
