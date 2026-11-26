# 10 Backend and Tauri IPC Map

This document enumerates all 56 Tauri backend commands registered in `src-tauri/src/lib.rs`, documenting their Rust implementations, permissions, input parameters, return shapes, network guardrails, and frontend callers.

---

## 1. Rust Architecture and Core Subsystems

The native desktop shell is written in Rust 2021 (`src-tauri/`) and organized into 16 modules:
1. `lib.rs`: Tauri startup lifecycle, command registry, and `kstream://localhost` protocol registration.
2. `fetch.rs`: Guarded HTTP/HTTPS client (direct connection with `no_proxy`, private IP refusal, size and time limits, token scrubbing).
3. `m3u.rs`: High-performance streaming M3U/M3U8 parser.
4. `xmltv.rs`: XMLTV guide parser with quick-xml (entity injection prevention and DOCTYPE recursion refusal).
5. `guides.rs`: Guide manager, cache persistence (`guide-<id>.json`), and 4-tier channel matching.
6. `hls.rs`: Pure HLS playlist rewriter creating unique opaque handles for playlists, byte ranges, keys, and media segments.
7. `dash.rs`: DASH manifest rewriter and directory router.
8. `stream.rs`: Playback session manager enforcing byte budgets, concurrent handle limits, and CORS lockdown.
9. `sources.rs`: Atomic persistent storage for `<app data>/sources/sources.json` (0600 file mode, temp-file-and-rename writes).
10. `catalogue.rs`: Public IPTV-org discovery index fetcher and parser.
11. `dvr.rs`: DVR recording manager, series rules, disk quota management, and HTTP live capture.
12. `xtream.rs`: Xtream Codes API provider manager with in-memory credential encryption.
13. `artwork.rs`: Guarded raster/SVG logo validator, resvg PNG rasterizer, and disk cache.
14. `local_media.rs`: Filesystem media scanner, NFO metadata parser, and `statvfs` physical storage deduplicator.
15. `pin.rs`: PBKDF2-HMAC-SHA256 parental PIN hasher and constant-time verifier.
16. `updater.rs`: Signed update manifest verifier and channel compatibility engine.

---

## 2. Complete Inventory of 56 Tauri Commands

### Core Shell & System Commands

1. **`app_info`**
   - **Rust Function:** `lib::app_info` (`src-tauri/src/lib.rs:388-392`)
   - **Inputs:** None
   - **Returns:** `AppInfo { name, version, profile, os, arch, tauriVersion }`
   - **Frontend Caller:** `getAppInfo()` in `src/lib/native.ts:60`
   - **Status:** Verified.

2. **`check_for_updates`**
   - **Rust Function:** `lib::check_for_updates` (`src-tauri/src/lib.rs:83-90`)
   - **Inputs:** `endpoint: Option<String>`
   - **Returns:** `Result<updater::UpdateCheckResult, IngestError>`
   - **Frontend Caller:** `checkForUpdates()` in `src/lib/native.ts:285`
   - **Status:** Verified.

---

### Artwork & Metadata Commands

3. **`fetch_channel_logo`**
   - **Rust Function:** `lib::fetch_channel_logo` (`src-tauri/src/lib.rs:42-56`)
   - **Inputs:** `url: Option<String>`, `channel_key: Option<String>`, `tvg_id: Option<String>`
   - **Returns:** `Result<Option<ChannelLogo>, IngestError>`
   - **Frontend Caller:** `loadChannelLogo()` in `src/lib/native.ts:130`
   - **Status:** Verified.

4. **`fetch_programme_artwork`**
   - **Rust Function:** `lib::fetch_programme_artwork` (`src-tauri/src/lib.rs:59-71`)
   - **Inputs:** `url: String`
   - **Returns:** `Result<Option<ChannelLogo>, IngestError>`
   - **Frontend Caller:** `loadProgrammeArtwork()` in `src/lib/native.ts:145`
   - **Status:** Verified.

5. **`fetch_metadata`**
   - **Rust Function:** `lib::fetch_metadata` (`src-tauri/src/lib.rs:74-80`)
   - **Inputs:** `url: String`, `auth_header: Option<String>`
   - **Returns:** `Result<String, IngestError>`
   - **Frontend Caller:** `fetchMetadata()` in `src/lib/native.ts:280`
   - **Status:** Verified.

---

### Xtream Codes Provider Commands

6. **`connect_xtream`** (`src-tauri/src/lib.rs:92-103`): Connects to Xtream server, validates credentials, parses live/VOD/series categories.
7. **`refresh_xtream`** (`src-tauri/src/lib.rs:105-111`): Refreshes cached Xtream catalogue.
8. **`load_xtream_catalogue`** (`src-tauri/src/lib.rs:134-140`): Loads cached catalogue from memory vault.
9. **`xtream_series_details`** (`src-tauri/src/lib.rs:113-120`): Fetches seasons and episode metadata for a series.
10. **`xtream_artwork`** (`src-tauri/src/lib.rs:122-132`): Fetches and caches Xtream cover artwork.
11. **`disconnect_xtream`** (`src-tauri/src/lib.rs:142-145`): Removes provider and wipes memory credentials.
12. **`is_xtream_connected`** (`src-tauri/src/lib.rs:147-150`): Checks if provider session is active.
13. **`open_xtream_stream`** (`src-tauri/src/lib.rs:152-163`): Generates authenticated stream URL and creates `kstream` handle.
14. **`open_xtream_catchup`** (`src-tauri/src/lib.rs:165-176`): Generates timeshift catch-up URL and creates `kstream` handle.
15. **`test_xtream_connection`** (`src-tauri/src/lib.rs:330-340`): Performs probe connection without downloading full catalogue.
16. **`xtream_vod_details`** (`src-tauri/src/lib.rs:342-349`): Fetches movie details and video audio codec info.
17. **`xtream_epg`** (`src-tauri/src/lib.rs:351-358`): Fetches Xtream channel EPG listings.

---

### DVR & Recording Engine Commands

18. **`dvr_get_recordings`** (`src-tauri/src/lib.rs:178-181`): Lists all scheduled, active, and completed recordings.
19. **`dvr_start_recording`** (`src-tauri/src/lib.rs:183-204`): Starts an immediate live recording task.
20. **`dvr_stop_recording`** (`src-tauri/src/lib.rs:206-212`): Stops an active recording task and finalizes MPEG-TS file.
21. **`dvr_schedule_recording`** (`src-tauri/src/lib.rs:214-243`): Schedules a future recording with optional start/end padding.
22. **`dvr_cancel_recording`** (`src-tauri/src/lib.rs:245-251`): Cancels a scheduled recording.
23. **`dvr_delete_recording`** (`src-tauri/src/lib.rs:253-260`): Deletes a recording entry and removes files from disk.
24. **`dvr_protect_recording`** (`src-tauri/src/lib.rs:262-269`): Toggles deletion protection on a recording.
25. **`dvr_open_recording`** (`src-tauri/src/lib.rs:271-289`): Serves a recorded file over `kstream://localhost/dvr/...`.
26. **`dvr_get_rules`** (`src-tauri/src/lib.rs:291-294`): Retrieves all automated series recording rules.
27. **`dvr_save_rule`** (`src-tauri/src/lib.rs:296-302`): Creates or updates a series recording rule.
28. **`dvr_delete_rule`** (`src-tauri/src/lib.rs:304-310`): Deletes a series recording rule.
29. **`dvr_get_config`** (`src-tauri/src/lib.rs:312-315`): Returns DVR configuration (retention days, storage limits, padding).
30. **`dvr_save_config`** (`src-tauri/src/lib.rs:317-323`): Updates DVR configuration settings.
31. **`dvr_get_storage_info`** (`src-tauri/src/lib.rs:325-328`): Returns storage used by recordings and available disk space.

---

### Source & Playlist Commands

32. **`fetch_playlist`** (`src-tauri/src/lib.rs:396-399`): Downloads and parses M3U playlist from URL through guarded fetch.
33. **`parse_playlist_text`** (`src-tauri/src/lib.rs:413-416`): Parses M3U text from locally selected file without disk path exposure.
34. **`test_source_connection`** (`src-tauri/src/lib.rs:404-409`): Executes lightweight HEAD/GET probe validating destination reachability.
35. **`load_sources`** (`src-tauri/src/lib.rs:436-447`): Loads saved playlist sources from `<app data>/sources/sources.json`.
36. **`save_sources`** (`src-tauri/src/lib.rs:450-456`): Atomically writes sources, guides, and channel mappings to disk.

---

### Streaming & Playback Commands

37. **`open_stream`** (`src-tauri/src/lib.rs:420-426`): Resolves upstream stream, launches rewriter session, returns `kstream://localhost/<handle>`.
38. **`close_stream`** (`src-tauri/src/lib.rs:429-432`): Terminates in-flight requests and invalidates active session handles.

---

### XMLTV Guide Commands

39. **`fetch_guide`** (`src-tauri/src/lib.rs:487-498`): Downloads and parses XMLTV guide from URL.
40. **`import_guide_file`** (`src-tauri/src/lib.rs:502-534`): Ingests raw guide bytes from webview file picker.
41. **`load_guide`** (`src-tauri/src/lib.rs:537-550`): Reads guide channel and programme counts from local cache.
42. **`guide_channels`** (`src-tauri/src/lib.rs:553-559`): Lists guide channels for manual matching.
43. **`guide_programmes`** (`src-tauri/src/lib.rs:562-577`): Queries programmes for requested channels within a given UTC time range.
44. **`remove_guide`** (`src-tauri/src/lib.rs:580-586`): Deletes guide cache and purges in-memory programmes.

---

### Discovery Catalogue Commands

45. **`load_catalogue`** (`src-tauri/src/lib.rs:589-594`): Loads cached IPTV-org public catalogue index.
46. **`refresh_catalogue`** (`src-tauri/src/lib.rs:598-605`): Fetches updated catalogue from fixed URL (`catalogue::URL`).

---

### Security & Parental Controls

47. **`hash_parental_pin`** (`src-tauri/src/lib.rs:608-611`): Hashes 4-digit PIN via PBKDF2-HMAC-SHA256 with 100,000 iterations.
48. **`verify_parental_pin`** (`src-tauri/src/lib.rs:615-621`): Verifies PIN with constant-time equality and automatic legacy migration.

---

### Local Media & Storage Management

49. **`get_local_libraries`** (`src-tauri/src/lib.rs:624-629`): Returns configured local folder library definitions.
50. **`save_local_library`** (`src-tauri/src/lib.rs:632-638`): Adds or updates a local library folder configuration.
51. **`delete_local_library`** (`src-tauri/src/lib.rs:641-647`): Removes a local library configuration without deleting media files.
52. **`scan_local_library`** (`src-tauri/src/lib.rs:650-656`): Traverses directory tree, indexing movies, series, episodes, and NFO files.
53. **`get_local_media_catalogue`** (`src-tauri/src/lib.rs:659-664`): Retrieves all indexed local media titles.
54. **`get_storage_volumes_info`** (`src-tauri/src/lib.rs:667-672`): Returns deduplicated filesystem storage statistics via `statvfs`.
55. **`select_local_media_folder`** (`src-tauri/src/lib.rs:675-722`): Safely validates path or triggers native desktop folder picker.
56. **`open_local_media_stream`** (`src-tauri/src/lib.rs:725-742`): Opens local media file under `kstream://localhost/local/...`.
