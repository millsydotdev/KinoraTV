# Deploying Kinora Media Server (v0.6.0)

Kinora Media Server runs as a standalone, zero-GUI Rust binary (`kinora-server`) with no WebKitGTK, GTK, X11, or Wayland dependencies. It is designed for always-on Linux home servers, Raspberry Pi / ARM SBCs, NAS boxes, and Docker hosts.

## Capabilities Provided by the Headless Server

- **LAN Client API & Sync**: Serves shared channels, sources, XMLTV EPG listings, cached raster artwork, local media catalogues, and live SSE watch-progress / library synchronization on TCP port `5198`.
- **Guarded LAN Stream Proxy**: Rewrites HLS playlists and proxies live IPTV streams plus local media library files (bounded 4 MiB HTTP Range `206 Partial Content` streaming with canonicalized library root containment) so upstream URLs, credentials, and host file paths never leave the server.
- **Mobile & Tablet Web Remote**: Serves the embedded 5-tab browser remote (Remote, Keypad, Channels, TV Guide EPG, Media) at `http://<server-ip>:5198/`.
- **UDP LAN Discovery**: Broadcasts `KINORA_BEACON_V1` on UDP port `5197` so Kinora Clients on the same subnet find the server automatically.
- **Trusted Devices & Capability Scoping**: Enforces pairing PINs, 30-second lockout after 5 failed attempts, device revocation, capability checks, and an audit trail persisted under `KINORA_DATA_DIR` (`0700` directory, `0600` files).

## Option 1: Docker Compose (Recommended)

Build and run the dedicated `server` target from the repository root:

```bash
docker compose up -d --build kinora-server
docker compose logs -f kinora-server
```

The container stores persistent data in `/data` (`KINORA_DATA_DIR=/data`), exposes `5198/tcp` and `5197/udp`, runs as non-root user `kinora` (UID 1000), and shuts down cleanly on `SIGTERM`.

## Option 2: Standalone Linux / Raspberry Pi Binary

Build the headless server binary (zero GUI dependencies):

```bash
cargo build --manifest-path src-tauri/Cargo.toml --release --no-default-features --bin kinora-server
```

Run directly:

```bash
KINORA_DATA_DIR="$HOME/.local/share/kinora" \
KINORA_PORT=5198 \
./src-tauri/target/release/kinora-server
```

CLI flags override environment variables:

```bash
./kinora-server --port 5198 --pin 847291 --data-dir /var/lib/kinora
```

## Option 3: Linux `systemd` Service

1. Create a dedicated system user and install the binary:
   ```bash
   sudo useradd --system --home /var/lib/kinora --shell /usr/sbin/nologin kinora
   sudo install -m 0755 src-tauri/target/release/kinora-server /usr/local/bin/kinora-server
   sudo install -m 0644 deploy/kinora-server.service /etc/systemd/system/kinora-server.service
   ```
2. (Optional) Configure a fixed 6-digit pairing PIN in `/etc/kinora/server.env` (`chmod 0600`):
   ```ini
   KINORA_PIN=847291
   KINORA_PORT=5198
   ```
3. Enable and start the service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now kinora-server
   sudo journalctl -u kinora-server -f
   ```

## Firewall & Network Notes

- Open **TCP `5198`** on your local network interface only (do **not** expose port `5198` directly to the public internet without a private VPN such as WireGuard or Tailscale).
- Open **UDP `5197`** on your local LAN if you want zero-configuration server discovery.
- Pairing a desktop Kinora Client: open **Settings -> Platform & Devices**, select **Client Mode**, scan for your server (or enter `http://<server-ip>:5198`), and enter the pairing PIN shown in the server log.
- Opening the Mobile Web Remote: open `http://<server-ip>:5198` on any phone or tablet on the same Wi-Fi and enter the pairing PIN.

## Upgrading, Health Verification & Rollback

### Safe Upgrade Procedure (Docker)

> **Important:** Desktop application updates (handled by the signed Tauri updater inside the Kinora desktop app) are completely separate from headless Kinora Server / Docker updates. Updating a desktop client never mutates your Docker container, and upgrading the Docker image never touches desktop installations.

Versioned server images are published to GitHub Container Registry as `ghcr.io/millsydotdev/kinoratv/kinora-server:<version>` (for example `:0.6.0` and `:latest`) alongside local `docker compose build server`.

Persistent volumes (`kinora-server-data` mounted at `/data`) store `sources.json`, `devices.json`, `library_sync.json`, `platform_config.json`, and cached EPG/artwork files. Never run `docker compose down -v` during an upgrade, as `-v` deletes named volumes.

1. **Back up the persistent data volume before upgrading:**
   ```bash
   docker run --rm -v kinora-server-data:/data -v "$PWD":/backup debian:bookworm-slim \
     tar czf "/backup/kinora-server-data-$(date +%Y%m%d).tar.gz" -C /data .
   ```
2. **Pull or rebuild the target versioned image and recreate only the container:**
   ```bash
   docker compose build server
   docker compose up -d --no-deps server
   ```
3. **Verify health, version, and client compatibility:**
   ```bash
   curl -fsS http://127.0.0.1:5198/api/info
   ```
   Confirm `"health": "ok"`, `"version": "0.6.0"`, `"apiVersion": "1.0"`, and `"minCompatibleClientVersion"`. Desktop clients display compatibility status automatically in **Settings > About > Kinora Server compatibility**.

### Rollback Procedure

If an upgrade introduces a regression on your host:

1. Stop the upgraded container without deleting volumes:
   ```bash
   docker compose stop server
   ```
2. Restore the previous image tag or binary (`git checkout v0.5.0` or prior tagged image) and, if schema migration occurred, restore the tarball backup created in step 1 into `/data`.
3. Restart the service and re-verify `GET /api/info`.
