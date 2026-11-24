# Kinora Privacy and Security Architecture

This document describes the privacy, network behaviour, data persistence, and security guarantees of Kinora.

## 1. Zero Telemetry and Analytics

- **No Remote Telemetry:** Kinora contains no telemetry, analytics, crash-reporting libraries, or background beacon pings.
- **No Third-Party Tracking:** No third-party tracking scripts, cookies, or remote analytics endpoints are contacted at any time.
- **No Remote Application Logs:** All logs and diagnostics remain strictly on your local machine.

## 2. Network Behaviour and Destination Security

Kinora enforces a strict network security policy in the native Rust shell (`src-tauri/src/fetch.rs`):

- **Direct Connections Only:** Kinora disables system HTTP(S) proxies by default (`no_proxy()`) to guarantee direct connections to trusted media endpoints and avoid intercepting proxies.
- **Guarded Destination Verification:** Before any network request is issued, target host addresses are resolved and checked (`check_url`):
  - Loopback addresses (`127.0.0.0/8`, `::1`) are strictly refused in production.
  - Private RFC 1918 addresses (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) are blocked on public playlist and guide fetches to prevent Server-Side Request Forgery (SSRF).
  - Explicit LAN servers (e.g. local media servers or companion remote controllers) operate through isolated, user-consented pairing policies.
- **No Path, Query, or Token Leakage in Errors:** When a network fetch fails, the error message scrubs the URL to hide paths, queries, and authentication tokens. Reqwest native error strings are sanitized before being surfaced to the UI or stored.

## 3. Playback Stream Security

- **No Background Probing:** Kinora never probes, pings, or scans stream URLs in the background without explicit user action. Channels are fetched only when you tune into them.
- **Isolated Custom Protocol (`kstream://`):** The React UI never receives raw upstream stream addresses. Streams are served through a native local loopback protocol with 128-bit session handles.
- **HLS Segment Rewriting:** HLS playlists (`.m3u8`) are parsed and rewritten natively (`src-tauri/src/hls.rs`), assigning ephemeral tokens to individual segments and renditions.
- **DRM and Unknown Protocols:** Encrypted DRM streams are rejected immediately; Kinora will not bypass access control mechanisms.
- **Dead-Stream Tracking:** Offline channel states are derived solely from real playback errors encountered during active playback sessions. Channel retry buttons allow manual re-tuning.

## 4. Local Data Storage and Vault Security

- **Restricted File Permissions:** Saved sources and guide metadata are stored in `<app data>/sources/sources.json` with directory permissions `0700` and file permissions `0600`.
- **Stream Addresses Never Saved:** Raw stream URLs are never persisted to disk. Restored channels remain offline at startup until their source playlist is refreshed.
- **Encrypted Provider Vault:** Sensitive provider credentials (such as Xtream Codes passwords and Stalker portal MAC associations) are encrypted at rest using AES-256-GCM in the local application vault.
- **Salted SHA-256 Parental PIN:** Parental PINs are stored exclusively as salted SHA-256 hashes (`kinora:<salt>:<pin>`). A 30-second lockout triggers after 5 consecutive failed verification attempts.
- **Profile Scoped Isolation:** Watch history, favourites, bookmarks, and custom media libraries are strictly scoped by profile (`kinora.personalMediaLibrary.v1.<profileId>`). Deleting a profile purges all associated keys.

## 5. Channel Logos and Remote Artwork

- **Lazy Raster Fetching:** Channel logos are fetched lazily on demand through the guarded native image loader (`fetch_channel_logo`).
- **Memory-Only Buffering:** Channel logo bytes are held in memory during the active session and never saved to persistent storage.
- **Raster Format Validation:** Raw bytes are validated to be genuine PNG, JPEG, WebP, or SVG images before rendering.
- **Region-Block Fallback:** Region-blocked provider placeholders (e.g. Imgur UK blocks) are detected and replaced with clean typographic initials.
