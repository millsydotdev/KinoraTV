# 11 Live TV, EPG and Player Architecture

This document details the architectural implementation of Live TV channel ingestion, XMLTV Electronic Programme Guide parsing and matching, and video playback via HLS.js and the Rust `kstream` proxy.

---

## 1. Live TV Subsystem

### Source Ingestion and Channel Aggregation
- **Source Files:** `src-tauri/src/m3u.rs`, `src-tauri/src/sources.rs`, `src/state/playlists.ts`.
- **Parsing:** Pure streaming parser in `src-tauri/src/m3u.rs` extracts `#EXTINF` metadata tags (`tvg-id`, `tvg-name`, `group-title`, `tvg-logo`, `tvg-country`, `tvg-language`, `tvg-chno`).
- **Channel Identity:** Each channel is assigned a deterministic link-safe identifier:
  `chanId = idSafe(channel.key)` (`src/state/playlists.ts:40`).
- **Category Splitting:** If `group-title` contains semicolons (e.g. `Entertainment;HD;UK`), it is preserved in `channel.group` for source fidelity and split into `channel.categories: string[]` for filtering chips and navigation (`src/state/playlists.ts:65-72`).
- **Deduplication:** Multiple playlists can be loaded concurrently; channel keys are prefixed with source IDs to prevent collision across different IPTV sources.
- **Search & Filtering:**
  - Filtering: Handled in `src/screens/LiveTV.tsx:120-170` by category, favourite status (`store.library.favourites`), and recent playback history.
  - Search: Full text search against channel name, category, and active programme title.

### Stream Resolution and Playback Hand-off
- **Security Boundary:** Frontend code and browser DOM never receive upstream stream URLs or user access tokens.
- **Hand-off Path:**
  1. User selects a channel -> frontend calls `openStream(channel.streamUrl)` or `openXtreamStream(...)`.
  2. Rust `src-tauri/src/stream.rs` assigns a random 128-bit hex handle and returns `kstream://localhost/<handle>`.
  3. Frontend initializes HLS.js with MSE (`MediaSource`) pointing to the local handle.
  4. Rust protocol handler serves the rewritten HLS playlist, proxying transport segments on demand.

---

## 2. EPG (Electronic Programme Guide) Subsystem

### XMLTV Retrieval, Decompression and Parsing
- **Source Files:** `src-tauri/src/xmltv.rs`, `src-tauri/src/guides.rs`.
- **Ingress:** Remote URLs fetched via `fetch::Policy::guide()` (50MB limit, 60s timeout); gzip streams decoded via `flate2::read::GzDecoder`.
- **Parser Security:** Built using `quick-xml`. Explicitly disables DTD external entity resolution and rejects recursive entity definitions (`<!DOCTYPE ... [`) to block billion-laughs and XML external entity (XXE) attacks (`xmltv.rs:45-75`).
- **Programme Bounds:** Enforces strict limits: max 5,000 channels and max 250,000 programmes per guide.

### Channel Matching Pipeline
Matching playlist channels to XMLTV guide channels executes a 4-tier cascade in `src-tauri/src/guides.rs:210-310`:
1. **Tier 1 (Exact Match):** `xmltv::normalize_id` trims whitespace and performs case-insensitive ASCII comparison between `channel.tvg_id` and XMLTV `<channel id="...">`.
2. **Tier 2 (Feed Stripping):** `xmltv::without_feed` strips IPTV-org feed suffixes (e.g. `bbc-one@uk` matches `bbc-one`).
3. **Tier 3 (Loose Alphanumeric):** `xmltv::loose_keys` removes punctuation and standardizes names (e.g. `ITV 1 HD` matches `itv1`); strictly requires country code agreement and verifies that the candidate guide channel actually contains future listings.
4. **Tier 4 (Manual Override):** User hand-mappings saved in `store.handMatches` (`<app data>/sources/sources.json:mappings`).

### Time Accuracy and Timeline Rendering
- **Time Representation:** All programme start and stop timestamps are parsed into UTC milliseconds (`i64` unix timestamps). Offsets in XMLTV (e.g. `+0100`, `-0500`) are normalized during ingestion (`xmltv.rs:180-220`).
- **Local Time Display:** Converted to user's local timezone at display time using standard `Intl.DateTimeFormat` and JavaScript `Date` methods.
- **Ruler Synchronization:** The sticky time ruler and horizontal schedule grid share identical minute-to-pixel scaling factors (10px, 5px, or 2.5px per minute).
- **Red "Now" Indicator:** Vertical line positioned at:
  `nowLeftPx = ((Date.now() - windowStartMs) / 60000) * pixelsPerMinute`.
- **Honest Data States:**
  - If a channel has matched guide data: renders exact programme blocks with title, duration, and progress bar.
  - If a channel has no matched guide data: renders a single continuous honest block labeled "Guide not loaded" or "No Programme Information". Gaps between programmes are preserved as empty space.

---

## 3. Video Player Subsystem

### Architecture Stack
- **Component:** `src/screens/Player.tsx`
- **Hook:** `src/lib/playback.ts` (`usePlayback`)
- **Video Engine:** `hls.js/dist/hls.light.min.js` (light build, worker disabled for WebKitGTK compatibility)
- **Protocol:** Custom scheme `kstream://localhost` registered via Tauri custom protocol API.

### Playback Lifecycle and State Machine
```
[User Selects Media Reference]
       │
       ▼
[Resolve Item & Stream URL] (src/lib/playback.ts)
       │
       ▼
[Call native.openStream(streamUrl)] -> Returns kstream://localhost/<handle>
       │
       ├── Check HLS.js MSE Support -> `Hls.isSupported()`
       │     ├── True: Instantiate HLS engine, attach MediaSource, call `loadSource()`
       │     └── False: Direct `<video src="...">` assignment (Safari/iOS fallback)
       │
       ├── State: `loading` (Render spinner overlay)
       │
       ├── Event: `Hls.Events.MANIFEST_PARSED` -> State: `playing`
       │
       ├── Event: `Hls.Events.ERROR`
       │     ├── Fatal: Call `hls.recoverMediaError()` or `hls.startLoad()`
       │     └── Unrecoverable: State: `error`, display retry overlay
       │
       └── Cleanup: Call `native.closeStream(session)`, `hls.destroy()`, clear buffer
```

### Controls and Capabilities
- **Quality Track Switching:** Reads variant renditions from HLS master playlist; exposes auto, 1080p, 720p, 480p selectors.
- **Audio & Subtitle Track Switching:** Reads alternate audio renditions and WebVTT subtitle tracks; applies via HLS track index.
- **Keyboard & Remote Shortcuts:**
  - `Space` / `K`: Play / Pause.
  - `Left` / `Right` arrows: Seek backward 10s / Seek forward 30s.
  - `Up` / `Down` arrows: Volume up / Volume down (5% steps).
  - `M`: Mute / Unmute toggle.
  - `F`: Fullscreen toggle.
  - `Escape`: Exit fullscreen / Return to guide.
- **Crash Recovery & Memory Safety:** WebKitGTK on Linux buffers responses in memory; Rust `src-tauri/src/stream.rs` strictly enforces a 32MB session byte budget and terminates orphaned handles when switching streams.
