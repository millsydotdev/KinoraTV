# 07 Data Flow and State Architecture

This document maps the end-to-end data lifecycle for every major domain type in Kinora, tracing backend origin, IPC ingress, TypeScript representations, React store holding, persistence, caching, and failure states.

---

## 1. Domain Types and Lifecycle Tracing

### 1. Live TV Channels (`Channel`)
- **Origin:** Remote IPTV M3U/M3U8 playlist URLs, local playlist files, or Xtream Codes API stream lists.
- **Ingress:** Fetched via Rust `fetch::download_bytes` with `Policy::playlist()`; parsed by pure streaming parser `src-tauri/src/m3u.rs` into `Vec<Channel>`.
- **Backend IPC Command:** `fetch_playlist` or `parse_playlist_text` or `connect_xtream`.
- **Rust Struct:**
  ```rust
  pub struct Channel {
      pub key: String,
      pub tvg_id: Option<String>,
      pub name: String,
      pub group: Option<String>,
      pub logo: Option<String>,
      pub language: Option<String>,
      pub country: Option<String>,
      pub chno: Option<u32>,
      pub stream_url: String,
  }
  ```
- **TypeScript Interface:** `PlaylistChannel` (`src/lib/native.ts:98`) and unified `Channel` (`src/data/types.ts:74`).
- **Store / Hook:** `useStore()` -> `store.playlists` and unified `store.channels`.
- **Consumers:** `<LiveTV>`, `<Home>` (Live TV rail), `<Search>`, `<Player>`.
- **Transformation:** Stream URLs are never exposed in UI. Mapped into link-safe identifiers (`key` or `chan:<id>`), categories split from `group` text (`A;B` -> `['A', 'B']`), logos routed to guarded lazy raster fetch.
- **Caching & Persistence:** Saved in `<app data>/sources/sources.json` (schema version 2, file mode 0600) via `src-tauri/src/sources.rs`. Stream URLs and tokens are never written to plain localStorage.
- **Refresh Mechanism:** Startup background refresh or manual user trigger in Sources screen.
- **Error & Missing State:** If a channel has no stream, playback button is disabled with notice; if source fails to refresh, existing channels remain in memory with offline badge.

---

### 2. EPG Programmes & Schedules (`Programme`)
- **Origin:** XMLTV guide files or remote URLs (`.xml` or `.xml.gz`).
- **Ingress:** Downloaded through `fetch::download_bytes` with `Policy::guide()`; parsed by `src-tauri/src/xmltv.rs` (quick-xml with entity attack protection and DOCTYPE refusal).
- **Backend IPC Command:** `fetch_guide`, `import_guide_file`, `load_guide`, `guide_programmes`.
- **Rust Struct:**
  ```rust
  pub struct Programme {
      pub channel: String,
      pub start: i64,
      pub stop: i64,
      pub title: String,
      pub desc: Option<String>,
      pub category: Option<String>,
      pub icon: Option<String>,
      pub episode: Option<String>,
  }
  ```
- **TypeScript Interface:** `Programme` (`src/data/types.ts:95`).
- **Store / Hook:** `useStore()` -> `store.guides`, `store.programmeAt(channelKey, time)`, `store.schedule(channelKey, day)`.
- **Consumers:** `<LiveTV>` (Timeline grid, Now Playing card, Next card, side drawer), `<Home>` (Live rail), `<Search>`.
- **Matching Cascade:**
  1. `xmltv::normalize_id` (Trim and lowercase match against `tvg-id`).
  2. `xmltv::without_feed` (IPTV-org feed strip, e.g. `channel@feed` -> `channel`).
  3. `xmltv::loose_keys` (Alphanumeric normalized key ignoring punctuation; requires matching country).
  4. Saved manual hand matches (`store.handMatches`).
- **Caching & Persistence:** Held in Rust memory and cached to disk as `guide-<id>.json` in app data directory.
- **Error & Missing State:** If a channel has no EPG data, renders honest "Guide not loaded" or "No Programme Information" block. Never invents programmes to fill timeline gaps.

---

### 3. Movies & TV Shows (`Movie`, `Series`, `Episode`)
- **Origin:** Three distinct streams:
  1. Verified Public Domain / Digital Preservation Catalogue (`src/data/openCatalogue.ts`).
  2. Connected Xtream Codes VOD / Series API.
  3. Scanned Local Hard Drives (`src-tauri/src/local_media.rs`).
- **Backend IPC Command:** `load_xtream_catalogue`, `get_local_media_catalogue`.
- **TypeScript Interfaces:**
  ```typescript
  export interface Movie {
    kind: 'movie'
    id: string
    title: string
    year: number
    runtime: number
    genres: string[]
    certificate: string
    synopsis: string
    imdbId?: string
    art: string
    posterUrl?: string
    backdropUrl?: string
  }

  export interface Series {
    kind: 'series'
    id: string
    title: string
    years: string
    genres: string[]
    certificate: string
    synopsis: string
    imdbId?: string
    art: string
    seasons: Episode[][]
  }
  ```
- **Store / Hook:** `useStore()`, `useLocalMedia()`.
- **Consumers:** `<Home>`, `<Movies>`, `<MovieDetail>`, `<SeriesBrowse>`, `<SeriesDetail>`, `<Library>`, `<Search>`.
- **Caching & Persistence:** Xtream catalogues cached in Rust encrypted vault; local media index stored in local database; user ratings and watch history stored in profile-scoped localStorage (`kinora.library.v1.<profileId>`).
- **Error & Missing State:** When personal sources are disconnected, public discovery catalogue items remain fully accessible; fictional demo titles display honest "Unavailable in personal sources" notice.

---

### 4. Personal Custom Artwork (`CustomArtwork`)
- **Origin:** User file upload via drag-and-drop or file picker (PNG, JPEG, WebP, GIF under 5MB).
- **Ingress:** Client-side `FileReader.readAsDataURL()` in `src/screens/ArtworkLibraryScreen.tsx`.
- **TypeScript Interface:**
  ```typescript
  export interface CustomArtwork {
    id: string
    contentId: string
    targetType: 'channel' | 'movie' | 'series' | 'episode' | 'programme'
    aspectRatio: '2:3' | '16:9' | '1:1' | 'custom'
    dataUrl: string
    fileName: string
    fileSize: number
    mimeType: string
    width: number
    height: number
    addedAt: number
  }
  ```
- **Store / Hook:** `src/state/customArtwork.ts` (`saveCustomArtwork`, `getCustomArtwork`, `deleteCustomArtwork`).
- **Consumers:** `<ChannelMark>`, `<ProgrammeArt>`, `<ArtworkLibraryScreen>`.
- **Resolution Precedence:**
  1. Priority 1: User-assigned custom artwork (`getCustomArtwork(targetId)`).
  2. Priority 2: External metadata provider artwork (TMDB, TVMaze).
  3. Priority 3: Source M3U/XMLTV metadata logo.
  4. Priority 4: Deterministic SVG initials placeholder.
- **Persistence:** Written to `localStorage['kinora.custom_artwork.v1']`.
- **Error Handling:** Files exceeding 5MB or invalid image MIME types are rejected with an explicit toast notice.

---

### 5. DVR Recordings & Series Rules (`Recording`, `SeriesRule`)
- **Origin:** User recording requests or series scheduling rules executed by Rust background task (`src-tauri/src/dvr.rs`).
- **Backend IPC Commands:**
  `dvr_get_recordings`, `dvr_start_recording`, `dvr_stop_recording`, `dvr_schedule_recording`, `dvr_delete_recording`, `dvr_get_rules`, `dvr_save_rule`.
- **Rust Struct:**
  ```rust
  pub struct Recording {
      pub id: String,
      pub channel_id: String,
      pub channel_name: String,
      pub programme_title: String,
      pub start_time: i64,
      pub end_time: i64,
      pub status: RecordingStatus, // Scheduled, Recording, Completed, Failed, Cancelled
      pub file_path: Option<String>,
      pub file_size_bytes: u64,
      pub is_protected: bool,
  }
  ```
- **TypeScript Interface:** `Recording` (`src/lib/native.ts:46`).
- **Store / Hook:** `<Recordings>`, `<LiveTV>`, `<Library>` (recordings tab).
- **Consumers:** Streamed via `dvr_open_recording` which registers a handle under `kstream://localhost`.
- **Persistence:** Stored in `<app data>/dvr/recordings.json` and `<app data>/dvr/rules.json`.
- **Error State:** If disk space is exhausted or stream drops, recording is marked `Failed` with reason code.

---

### 6. Storage & Volume Metrics (`StorageVolumesSummary`)
- **Origin:** Native host filesystem inspection via `statvfs` in `src-tauri/src/local_media.rs`.
- **Backend IPC Command:** `get_storage_volumes_info`.
- **Rust Struct:**
  ```rust
  pub struct StorageVolumesSummary {
      pub volumes: Vec<VolumeInfo>,
      pub total_disk_bytes: u64,
      pub available_disk_bytes: u64,
      pub used_disk_bytes: u64,
      pub percent_used: f64,
      pub media_indexed_bytes: u64,
      pub media_item_count: usize,
  }
  ```
- **Deduplication Logic:** Collects mount points and filters by unique physical device ID (`st_dev`). Prevents duplicate counting of overlapping mounts or bind mounts.
- **Consumers:** `<Home>` ("Your Library at a Glance" storage counter), `<Settings>` (Media Library storage bar), `<ArtworkLibraryScreen>` (Storage HUD).
- **Status:** Verified with real OS device metrics.

---

### 7. User Preferences & Active Profile (`Prefs`, `Profile`)
- **Origin:** User choices in Settings, profile creation, and theme switcher.
- **TypeScript Interfaces:**
  ```typescript
  export interface Prefs {
    theme: 'dark' | 'dim' | 'light'
    density: 'compact' | 'standard' | 'spacious'
    textSize: 'standard' | 'large'
    accent: AccentName | 'custom'
    customAccent?: string
    reduceMotion: boolean
    sidebarCollapsed: boolean
  }

  export interface Profile {
    id: string
    name: string
    avatar: string
    isKids: boolean
    hasPin: boolean
    createdAt: number
  }
  ```
- **Store / Hook:** `useProfiles()`, `useStore()`.
- **Persistence:**
  - Preferences: `localStorage['kinora.prefs.v2']`
  - Profiles: `localStorage['kinora.profiles.v1']`
  - PIN Hashes: `localStorage['kinora.parental_pin_secure.v1.<profileId>']` (PBKDF2-HMAC-SHA256, 100k rounds)
  - Scoped Library: `localStorage['kinora.library.v1.<profileId>']` (History, Watchlist, Watched, Favourites isolated per profile).
- **Deletion Cascade:** Deleting a profile purges all associated scoped localStorage keys (`profiles.tsx:120-145`).
