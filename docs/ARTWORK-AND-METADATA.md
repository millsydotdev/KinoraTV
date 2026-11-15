# Kinora - Artwork, Metadata and Visual Parity Architecture

## 1. Selected Artwork Sources and Rationale

Kinora's artwork architecture adheres strictly to our security, privacy, and licensing model:
1. **User Playlist `tvg-logo` Assets (Primary for Channels)**:
   - *Source*: The user's imported M3U playlists already supply `tvg-logo` tags for the vast majority of channels (e.g. 296 of 299 in the UK playlist audit).
   - *Rationale*: Directly aligned with the user's chosen playlist provider. No third-party network disclosure is incurred beyond fetching the asset declared by the user's source.
2. **Xtream Provider Metadata & Artwork (Primary for VOD Movies & Series)**:
   - *Source*: Genuine movie/series backdrops and posters returned by connected Xtream Codes compatible servers (`/player_api.php?action=get_vod_info` and `get_series_info`).
   - *Rationale*: Real catalog items are accompanied by genuine provider-hosted promotional art. They are fetched via Rust's guarded `Policy::artwork()`, validated as rasters, and cached locally.
3. **Broadcaster-Ident Conservative Local Vector/Raster Fallbacks**:
   - *Source*: Embedded local SVG/PNG definitions for canonical broadcaster callsigns and IDs (`bbcone.uk`, `itv1.uk`, `channel4.uk`, `channel5.uk`, `skynews.uk`, etc.).
   - *Rationale*: Zero-network fallback that guarantees immediate offline visual fidelity without guessing or attaching logos to ambiguous channels.
4. **Local Disk Artwork Cache (`ArtworkStore`)**:
   - *Source*: `~/.local/share/kinora/sources/artwork/` (or platform equivalent).
   - *Rationale*: Preserves logos across restarts and offline sessions even when playlists are restored from sanitized disk state (`sources.json` deliberately strips sensitive URLs and `LOGOSIG` tokens).

---

## 2. Evaluation of External Metadata Providers & Privacy Analysis

To satisfy the Gate criteria regarding third-party network disclosures, the following metadata providers were evaluated:

| Provider | Data Transmitted | Host Receiving Data | API Key Req | Attribution / Terms | Commercial Use | Privacy & IP Leak Risk | Recommendation |
|---|---|---|---|---|---|---|---|
| **The Movie Database (TMDB)** | Search query strings (movie/show title, year) | `api.themoviedb.org`, `image.tmdb.org` | Yes (User or App Developer Key) | Mandatory attribution logo and text: *"This product uses the TMDB API but is not endorsed or certified by TMDB."* | Free for non-commercial; commercial requires enterprise agreement. | **HIGH**: Every search or library sync sends titles to TMDB, linking user's IP to their viewing/browsing interests. | **Approval Gate**: Disabled by default. Documented in Settings for explicit user opt-in before making any outbound API call. |
| **TVMaze** | Search query strings (series title, season/ep) | `api.tvmaze.com`, `static.tvmaze.com` | No (Rate limited: 20 req/10s) | CC BY-SA 4.0; requires linkback to TVMaze. | Free non-commercial; commercial license required for high volume. | **HIGH**: Exposes titles and IP without API key authentication. | **Approval Gate**: Disabled. Secondary TV alternative requiring explicit user opt-in. |
| **Fanart.tv** | Provider IDs (TMDB ID, TVDB ID, IMDB ID) | `webservice.fanart.tv`, `assets.fanart.tv` | Yes (Project key + VIP user key) | Fanart.tv attribution required. | Commercial use requires VIP/paid tier. | **HIGH**: Requires existing external IDs; exposes media consumption profile. | **Approval Gate**: Not recommended for initial release. |
| **iptv-org /logos assets** | Channel identifier (`<id>.png`) | `raw.githubusercontent.com/iptv-org/logos/` | No | Unlicense (Public Domain). | Unrestricted. | **MEDIUM**: GitHub/Fastly CDN logs client IP if fetched directly. | **Local Embedded / Conservative Match Only**: Pre-package top canonical logos locally or resolve only against explicit user permission. |
| **XMLTV `<icon>` scraping** | Arbitrary URLs embedded in third-party EPGs | Arbitrary untrusted remote hosts | No | Governed by individual EPG providers. | Unrestricted / unknown. | **CRITICAL**: EPGs often contain tracking pixels or unvetted hosts. | **REJECTED**: Kinora strictly refuses to scrape arbitrary remote URLs from `<icon>` tags in XMLTV. |

---

## 3. Artwork Service & Disk Cache Architecture

Kinora's `ArtworkStore` (`src-tauri/src/artwork.rs`) provides a secure, disk-backed caching layer:

1. **Storage Location & Permissions**:
   - Resides under `<app_data>/sources/artwork/`.
   - Folders are created with strict `0700` POSIX permissions; artwork cache files with `0600` (readable only by the local desktop user).
2. **Key Derivation & Dual-Key Indexing**:
   - Cache keys use 128-bit FNV-1a collision-free hexadecimal hashes.
   - Dual-index model: Indexed both by content address (`url:<url>`) and stable channel/provider identity (`channel:<channel_key>`, `tvg:<tvg_id>`, `xt:<source_id>:<id>`).
   - Enables offline retrieval even after restarting Kinora when plain-text URLs are absent from disk configuration.
3. **Guardrails & Raster Verification**:
   - All network fetching occurs exclusively through `src-tauri/src/fetch.rs` using `Policy::artwork()` (4MB body cap, 8s connect timeout, 20s overall timeout, SSRF/private IP protection, redirect validation).
   - Received bytes are strictly validated against magic signatures (`PNG`, `JPEG`, `GIF`, `WebP`).
   - Known tracking/region-block payloads (such as Imgur's 503-byte UK geo-block PNG) are detected and discarded.
4. **Cache Size Bounds & LRU Eviction**:
   - The artwork directory is capped at 150 MB (configurable).
   - When the threshold is exceeded during startup or after fetch, oldest-accessed files are pruned until usage drops below 100 MB.
5. **Frontend Security Model & CSP**:
   - Frontend never loads remote HTTP/HTTPS images directly (`<img src="http://...">` is blocked by Tauri's CSP: `img-src 'self' data:`).
   - Artwork is delivered across the native bridge as memory-cached `data:` URLs or via local protocol handles. Addresses remain completely out of the DOM.

---

## 4. Channel Logo Coverage & Persistence

- **Previous Defect**:
  - `sources.rs` intentionally sanitized `sources.json` to prevent saving playlist URLs or credential tokens. When channels were restored on application restart, `channel.logoUrl` was `null`, causing 296+ channel logos in playlists to vanish.
- **Current Fix**:
  - `fetch_channel_logo` in `src-tauri/src/lib.rs` and `ArtworkStore` now accept `(url, channel_key, tvg_id)`.
  - When a logo is fetched during the first session, it is dual-indexed on disk by `channel_key` and `tvg_id`.
  - Upon subsequent application restarts or when operating completely offline, `ArtworkStore::get_channel_logo(None, Some(channel_key), Some(tvg_id))` immediately retrieves the cached raster from disk without any network connection.
  - Channels without logos render styled channel marks with initials and deterministic ambient hue tints (`mark.tone`), completely eliminating blank voids or broken icons.

---

## 5. Genuine Movie & Series Records (Xtream Provider Integration)

- **Separation of Metadata and Stream Playability**:
  - Real movie and series records are ingested from connected Xtream providers via `src-tauri/src/xtream.rs`.
  - Ingested records hold title, release year, plot summary, container extension, and artwork keys.
  - Presence of metadata never implies playable video without valid provider connection and authentication credentials.
- **Visual Presentation**:
  - Backdrops and posters are loaded asynchronously via `loadXtreamArtwork` through the guarded artwork pipeline.
  - While loading or if artwork is absent, `.xtream-art-fallback` renders a rich dark-gradient backdrop with a film badge, clean typography, title, and release year.
  - Interactive controls allow users to toggle titles into their local Watchlist and Favourites (`movie:xt:...` and `series:xt:...`), which resolve properly in the Library screen.

---

## 6. Real-Mode Visual Parity Audit Across All Screens

| Screen | Real Mode Experience Before | Real Mode Experience After |
|---|---|---|
| **Home** | Empty hero, blank rows, or leaked demo titles; no movies or series. | **Rich Dynamic Hero**: features top live channel with ambient tone glow, badge, and "Watch Live" action; or provider movie hero with backdrop, synopsis, year, and "View Details". Shows real "Movies" and "Series" rows when VOD providers are connected. |
| **Live TV & Guide** | Blank channel squares without logos after restart. | Logos persistently load from `ArtworkStore` disk cache; missing logos show styled initials badges; ambient tone gradients in cards. |
| **Search** | Only searched channels; no VOD content; no channel thumbnails. | Full search across real channels, Xtream movies, and Xtream series; renders `XtreamArt` thumbnails and `ChannelMark` badges. |
| **Player** | Generic black playback context when watching live channels. | Clean header with channel logo mark, live dot, channel name, category, and subtle ambient tone background. |
| **Movie / Series Details** | Showed "Nothing to play here" or crashed on provider IDs. | Rich details layout with poster, year, container type, synopsis, Watchlist/Favourite buttons, and episode grids. |
| **Library** | Could not resolve provider titles (`movie:xt:...`); empty state. | Correctly resolves saved Xtream movie and series refs; renders cards with provider titles, years, and cached artwork. |

---

## 7. Offline & Failure Behavior

- **Offline Restart**:
  - When the machine has no network connectivity, all previously downloaded channel logos and Xtream artwork load directly from `~/.local/share/kinora/sources/artwork/`.
- **Image Download Failures & Timeouts**:
  - If a remote provider image returns 404, times out, or fails raster inspection, `fetch_channel_logo` and `xtream_artwork` return `null`.
  - The frontend gracefully falls back to deterministic ambient gradients, channel initials, and styled fallback cards without blocking UI interaction or flashing error alerts.

---

## 8. Test Results and Verification Summary

- **Vitest Frontend Suite**:
  - `240` passing tests across 21 test files (`npm test`).
  - Added unit test coverage for `loadChannelLogo` and `loadXtreamArtwork` IPC methods and memory cache in `src/lib/native.test.ts`.
  - Added tests in `src/screens/RealOnly.test.tsx` verifying:
    - Real channel hero with "Watch Live" action and no fictional demo leaks.
    - Real provider movies and series rendering in Home and Search.
    - Styled fallbacks when artwork is unavailable.
  - TypeScript compilation (`npm run typecheck`): 0 errors.
- **Cargo Backend Suite**:
  - `120` passing tests (`cargo test --manifest-path src-tauri/Cargo.toml`).
  - Covers `artwork::tests` (cache round-trip, persistence across store instances, raster validation, eviction, and Imgur region-ban detection).
  - Preserved strict destination and policy checks in `fetch::tests`.

---

## 9. Explicit Privacy & User Approval Decisions

> [!IMPORTANT]
> **Decision on Remote Third-Party Metadata Services (TMDB / TVMaze / iptv-org remote logos)**:
> In accordance with Kinora's privacy commitments and `AGENTS.md`, **no remote third-party metadata API requests are made silently**.
> - Kinora currently utilizes only source-declared assets (playlist `tvg-logo` and user-configured Xtream provider artwork) routed through the Rust SSRF-guarded fetcher.
> - An external provider settings panel is designed to require explicit user opt-in before outbound search queries can be transmitted to TMDB or other metadata services.
