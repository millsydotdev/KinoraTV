# 08 Real User and Dev Mock Data Separation

This document establishes the exact mechanisms governing data domain separation between DEV MOCK fixtures and REAL USER data in Kinora.

---

## 1. Environment Selection and State Representation

Kinora enforces a strict architectural boundary between development test fixtures and genuine user runtime data.

### State Flag: `demoTitles` (`demoActive`)
- **Source:** `src/state/store.tsx:1058`
- **Definition:**
  ```typescript
  const demoActive = playlists.length === 0 && guides.length === 0 && xtreamSources.length === 0 && !hasUserSources
  ```
- **Evaluation Rule:**
  - `demoTitles: true`: Evaluated when the application has zero imported playlists, zero guides, zero Xtream accounts, and zero local media sources connected. The application enters demonstration mode to allow developer inspection of UI components.
  - `demoTitles: false`: The moment a single real source (M3U, Xtream, or local library) is present or restored from `<app data>/sources/sources.json`, `demoTitles` permanently switches to `false`.

### Channel Catalogue Resolution: `store.channels`
- **Source:** `src/state/store.tsx:1070-1075`
- **Code:**
  ```typescript
  const channels = (hasPlaylists || hasXtream ? playlistChannels : (demoActive ? demoChannels : []))
  ```
- **Rule:** The channel array is strictly partitioned. Either playlist/Xtream channels are shown, or the demo set is shown. Under no circumstances are demo channels concatenated or interleaved with real channels.

---

## 2. Fixture Inventory vs Real Data Providers

| Domain | DEV MOCK Fixture Source | REAL USER Data Provider | Contamination Prevention |
| :--- | :--- | :--- | :--- |
| **TV Channels** | `src/data/channels.ts` (45 fictional demo channels) | `load_sources` -> `src-tauri/src/sources.rs` | Fictional channels completely excluded if `sources.length > 0` |
| **EPG Schedule** | `src/data/channels.ts` (synthetic generator) | `src-tauri/src/xmltv.rs` + `guide_programmes` | Real guides query SQLite/disk cache for matched XMLTV IDs |
| **Movies** | `src/data/catalog.ts` (`curatedMovies`: 12 fictional titles) | Connected Xtream VOD API or local storage folders | Fictional movies return "Unavailable in personal sources" in REAL USER |
| **TV Series** | `src/data/catalog.ts` (`curatedSeries`: 6 fictional titles) | Connected Xtream Series API or local storage folders | Fictional series return "Unavailable in personal sources" in REAL USER |
| **Public Domain Works**| `src/data/openCatalogue.ts` (Verified historic films) | `src/data/openCatalogue.ts` | Always accessible in both modes as genuine public preservation media |
| **Storage Metrics**| Hardcoded mock numbers in dev components | `get_storage_volumes_info` via host `statvfs` | REAL USER displays genuine device partition sizes and usage |
| **Watch History** | Seeded sample progress refs | Profile-scoped `localStorage['kinora.library.v1.<id>']` | Zero watch history fabricated on new or real profiles |
| **Parental PIN** | Hardcoded demo bypass | PBKDF2-HMAC-SHA256 salted hashes | Plaintext PINs rejected; 30s lockout after 5 failed attempts |

---

## 3. Screen-by-Screen Content Discrepancy Matrix

### Home Screen (`/`)
- **DEV MOCK:**
  - Featured Banner: Highlights fictional movies (*Dune: Part Two*, *Interstellar*, *Salt Meridian*).
  - Rails: Populated with fictional *Continue Watching* progress items and demo broadcast rows.
  - Storage Counter: Displays demonstration summary counters.
- **REAL USER:**
  - Featured Banner: Features verified public domain titles (e.g. *Night of the Living Dead*, *Charade*) or connected on-demand content.
  - Rails: Shows empty-state connect banners if no sources are connected, or genuine live broadcast rows from imported M3U playlists.
  - Storage Counter: Displays physical disk storage calculated via `statvfs` device IDs. Zero fabricated watch history.

### Live TV & TV Guide (`/live`)
- **DEV MOCK:**
  - Channels: 45 mock channels (e.g. BBC One, ITV1, Channel 4, Sky Showcase).
  - EPG Grid: Full 24-hour generated schedules per channel.
- **REAL USER:**
  - Channels: Sourced exclusively from user's configured M3U playlists or Xtream live streams.
  - EPG Grid: Displays actual parsed programmes for channels successfully matched to an XMLTV feed. Channels without matched guide data display an honest "Guide not loaded" or "No Programme Information" state. Gaps in schedules remain empty.

### Movie & Series Detail Pages (`/movies/:id`, `/series/:id`)
- **DEV MOCK:**
  - Clicking fictional titles (*Harbour Lights*, *Ninth Ward*) displays full synopsis, seasons, and episodes.
- **REAL USER:**
  - Clicking a fictional demo title returns the honest state block: "Movie Unavailable in Personal Sources. Connect an on-demand provider in Sources or explore Kinora's verified public discovery film archives."
  - Verified public domain titles (*Night of the Living Dead*, *Charade*, *Nosferatu*) render complete details, verified IMDb badges, and sharing controls in both environments.

---

## 4. Screenshot Capture Harness Mechanics (`scripts/capture-all-ui.cjs`)

The screenshot capture harness executes Playwright against Chromium with isolated storage contexts:

1. **`dev-mock` Mode:**
   - Navigates directly to `http://localhost:5199/` with a fresh session context.
   - Evaluates client with `demoTitles: true`.
   - Captures all 37 desktop screenshots to `docs/ui/dev-mock/`.

2. **`user-sources` Mode:**
   - Reads the host's actual `sources.json` file from `/home/millsy/.local/share/io.github.millsydotdev.kinora/sources/sources.json`.
   - Reads real guide cache files (`guide-<id>.json`) directly from the user data directory.
   - Injects a Node-bridged `window.__TAURI_INTERNALS__.invoke` mock responding with real user sources, real channels, real storage statistics (`get_storage_volumes_info`), and real EPG schedules.
   - Evaluates client with `demoTitles: false`.
   - Captures all 37 desktop screenshots to `docs/ui/user-sources/`.

Both modes run across identical components, layouts, CSS tokens, and route handlers, proving that differences between screenshots stem solely from genuine data sources and not disparate code paths.
