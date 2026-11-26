# Kinora Docker Infrastructure Guide (v0.6.0)

This document specifies the containerized development, testing, and fixture infrastructure for Kinora.

---

## 1. Architectural Principles

Kinora is a native desktop application combining a React 19 frontend with a Rust + Tauri 2 native shell.

### Why We Containerize Supporting Services, Not the Desktop Shell
1. **Host Display Server Integration:**
   Native desktop applications require direct hardware acceleration, Wayland/X11 display sockets, and PulseAudio/PipeWire audio routing. Containerizing the desktop GUI introduces unnecessary latency, permissions friction, and brittle IPC socket pass-throughs.
2. **Containerized Build and Test Parity:**
   Compiling Linux desktop packages (`.rpm`, `.deb`, `.AppImage`) requires heavy C/C++ system libraries (`libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `patchelf`). A containerized builder provides a 100% reproducible, clean Ubuntu 24.04 environment across any developer workstation (macOS, Windows with WSL, Arch, Fedora, Debian).
3. **Local Mock Streaming & EPG Services:**
   Kinora's native smoke tests and IPTV ingest workflows require reproducible HLS streams, XMLTV guides, and Xtream Codes APIs without touching external networks or user data. A lightweight Python 3.12 Alpine container serves these fixtures offline with integrated health monitoring.

---

## 2. Multi-Stage Dockerfile Architecture

The root `Dockerfile` defines three specialized targets:

```
+-------------------------------------------------------------+
|                 Stage 1: frontend-base                      |
|          Node.js 22 Bookworm Slim, curl, ca-certificates    |
|               Non-root user: node (UID 1000)                |
+-------------------------------------------------------------+
               |                               |
               v                               v
+-----------------------------+ +-----------------------------+
|      Target: web-dev        | |   Stage 2: frontend-builder |
|   npm run dev on port 5199  | |    npm run build (dist/)    |
|   Vite HMR & Healthcheck    | +-----------------------------+
+-----------------------------+
                                               |
                                               v
+-------------------------------------------------------------+
|                      Target: builder                        |
|       Ubuntu 24.04, Rust Stable, Node 22, WebKitGTK 4.1     |
|         Non-root developer (UID 1000), patchelf, rpm        |
|             Runs quality-gate.sh or tauri:build             |
+-------------------------------------------------------------+
```

### Target 1: `web-dev`
- **Base:** `node:22-bookworm-slim`
- **Execution User:** `node` (non-root)
- **Port:** 5199 (exposed with host binding)
- **Healthcheck:** `curl -f http://localhost:5199/ || exit 1`
- **Purpose:** Enables frontend engineers to develop screens, themes, and UI components in an isolated container without needing Rust installed on their workstation.

### Target 2: `frontend-builder`
- **Base:** `node:22-bookworm-slim`
- **Execution User:** `node`
- **Purpose:** Compiles the production React 19 bundle (`dist/`) with strict TypeScript typechecking.

### Target 3: `builder`
- **Base:** `ubuntu:24.04`
- **Installed Toolchains:** Stable Rust (`rustup`, `clippy`, `rustfmt`), Node.js 22 LTS, `libwebkit2gtk-4.1-dev`, `libssl-dev`, `librsvg2-dev`, `libayatana-appindicator3-dev`, `patchelf`, `rpm`.
- **Execution User:** `developer` (UID 1000:1000)
- **Purpose:** Headless compilation of native Linux distribution packages and execution of the master quality gate.

---

## 3. Docker Compose Services

`docker-compose.yml` orchestrates the local supporting ecosystem:

| Service | Image / Target | Internal Port | Host Port | Purpose |
|---|---|---|---|---|
| **fixtures** | `docker/fixtures/Dockerfile` | 18765 | `${FIXTURE_PORT:-18765}` | Mock IPTV, HLS master/media playlists, XMLTV EPG, and Xtream Codes API |
| **web** | `Dockerfile (target: web-dev)` | 5199 | `${WEB_PORT:-5199}` | React 19 web development server with hot reload |
| **test** | `Dockerfile (target: builder)` | - | - | Runs full `bash scripts/quality-gate.sh` in container |
| **builder** | `Dockerfile (target: builder)` | - | - | Compiles native `.deb`, `.rpm`, and `.AppImage` packages |
| **server** | `Dockerfile (target: server)` | 5198/tcp, 5197/udp | `${SERVER_PORT:-5198}`, `${DISCOVERY_PORT:-5197}` | Headless Kinora Media Server (zero GUI dependencies) |

### Persistent Build Caching
Docker Compose utilizes named persistent volumes to eliminate redundant dependency compilation:
- `kinora-cargo-cache`: Caches the Cargo registry index, downloaded crates, and build artifacts.
- `kinora-npm-cache`: Caches downloaded NPM tarballs in `/home/developer/.npm`.

### Resource Constraints
Every container defines strict resource boundaries to prevent host starvation:
```yaml
deploy:
  resources:
    limits:
      cpus: "0.50"
      memory: 256M  # For fixtures service
```

---

## 4. Local Mock Fixture Server (`docker/fixtures/`)

The fixture service (`docker/fixtures/server.py`) is written using standard Python library primitives (`http.server`), requiring 0 external packages, starting in < 50ms, and consuming ~15MB RAM.

### Available Mock Endpoints
- `GET /health`: JSON service status and timestamp (`{"status": "healthy", "service": "kinora-fixtures", "version": "0.6.0"}`).
- `GET /channels.m3u`: Synthetic M3U playlist with valid channel tags (`tvg-id`, `tvg-name`, `tvg-logo`, `group-title`).
- `GET /live/master.m3u8`: Dynamic HLS master playlist with multi-rendition streams (Low 800k, High 1.8M).
- `GET /live/index.m3u8`: Rolling live HLS media playlist with rolling sequence numbers and discontinuity markers.
- `GET /live/segment_*.ts`: Synthetic MPEG-TS packet chunks (188-byte packets with sync byte 0x47).
- `GET /guide.xml`: XMLTV EPG schedule with rolling current, previous, and next programme listings.
- `GET /player_api.php`: Mock Xtream Codes API supporting authentication, live categories, and VOD streams.

---

## 5. Common Docker Commands

```bash
# 1. Start local mock fixtures server in background
make docker-fixtures
# Or:
docker compose up -d fixtures

# 2. Check fixture health
curl -s http://localhost:18765/health

# 3. Start full web development environment (web + fixtures)
make docker-up
# Or:
docker compose up web

# 4. Run master quality gate inside the builder container
docker compose run --rm test

# 5. Build native Linux packages inside container
docker compose run --rm builder npm run tauri:build -- --no-sign

# 6. Stop all Docker services
make docker-down
# Or:
docker compose down
```

---

## 6. Container Security & Best Practices

1. **Non-Root Execution:** All services execute under non-privileged users (`node` UID 1000 or `developer` UID 1000). No service runs as `root`.
2. **Minimal Attack Surface:** The fixtures service runs on Python 3.12 Alpine with zero third-party dependencies.
3. **Build Context Optimization:** `.dockerignore` excludes `.git`, `node_modules`, `src-tauri/target`, `.env`, and release archives, keeping build context under 100KB.
4. **Vulnerability Scanning:** Automated CI pipelines run Trivy container scans on all built images.
