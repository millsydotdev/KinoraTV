# 09 Artwork and Metadata Pipeline

This document maps the complete artwork architecture in Kinora, covering engine processing, storage tiers, user customization, resolution hierarchy, fallback mechanisms, and metadata enrichment.

---

## 1. Resolution Precedence Hierarchy

Kinora resolves visual artwork using a strict 4-tier waterfall:

```
[Target Content ID (Channel, Movie, Series, Programme)]
   │
   ├── Tier 1: User-Selected Custom Artwork (`src/state/customArtwork.ts`)
   │     └── Checked via `getCustomArtwork(targetId)`. Overrides all downstream sources.
   │
   ├── Tier 2: Authenticated Metadata Providers (`src/data/metadataProviders.ts`)
   │     └── Queried via TMDB, TVMaze, Fanart.tv, or local indexed NFO artwork.
   │
   ├── Tier 3: Upstream Source Metadata (`src/lib/native.ts`)
   │     └── M3U `tvg-logo` or XMLTV `<icon src>` fetched lazily via guarded Rust proxy.
   │
   └── Tier 4: Deterministic Fallback (`src/components/ui.tsx`)
         └── Initial badge with deterministic accent tone or genre SVG icon.
```

---

## 2. Personal Custom Artwork Subsystem

- **State Store File:** `src/state/customArtwork.ts`
- **Data Model:**
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
- **Storage Location:** Browser LocalStorage under key `kinora.custom_artwork.v1`.
- **Storage Representation:** Base64 Data URL (`data:image/png;base64,...` or `data:image/jpeg;base64,...`).
- **File Ingress & Validation:**
  - Component: `ArtworkUploadModal` (`src/screens/ArtworkLibraryScreen.tsx:240-360`).
  - Validation: MIME types restricted to `image/png`, `image/jpeg`, `image/webp`, `image/gif`.
  - Size Limit: Strict 5MB limit (`5,242,880 bytes`).
  - Automated Aspect Ratio Classification: Measures natural image dimensions:
    - Width / Height approx 0.67 -> `'2:3'` (Poster)
    - Width / Height approx 1.77 -> `'16:9'` (Backdrop)
    - Width / Height approx 1.00 -> `'1:1'` (Logo/Square)
    - Otherwise -> `'custom'`
- **CRUD Operations:**
  - `saveCustomArtwork(entry)`: Persists entry, emits change event, updates active state.
  - `getCustomArtwork(contentId, targetType?)`: Retrieves active custom artwork for any content identifier.
  - `deleteCustomArtwork(contentId, targetType?)`: Removes custom assignment, restoring automatic upstream artwork.
  - `getCustomArtworkStats()`: Computes total count, logo count, poster count, and total byte storage.
- **Persistence Verification:** Unit tested in `src/screens/ArtworkAndShare.test.tsx:20-65` verifying full save, reload, replace, and restore cycles.

---

## 3. Native Rust Artwork Pipeline (`src-tauri/src/artwork.rs`)

To maintain memory efficiency and protect against network attacks, all remote raster and SVG logos fetched from M3U or XMLTV sources pass through the Rust backend.

### Security and Validation Checks
1. **Network Guardrail:** Fetched using `fetch::Policy::logo()` with strict timeouts (10 seconds) and size limits (5MB).
2. **Raster MIME Detection:** Examines binary magic bytes (PNG `\x89PNG`, JPEG `\xFF\xD8\xFF`, WebP `RIFF...WEBP`, GIF `GIF8`). Rejects unrecognized file types (`artwork.rs:18-35`).
3. **SVG Sanitization:** If an SVG logo is supplied, `sanitize_and_validate_svg` rejects scripts, `<foreignObject>`, external entities, and event handlers. Valid SVGs are rasterized to PNG in Rust via `resvg` (`artwork.rs:120-165`).
4. **Imgur Region Block Detection:** Detects and discards Imgur's UK region-block notice image (`is_region_block`), preventing broken placeholder graphics from corrupting channel logos (`artwork.rs:170-185`).
5. **Disk Caching:** Validated raster bytes are saved to `<app data>/artwork/<hash>.png` (file mode 0600) and served to the webview as base64 data images.

---

## 4. Metadata Providers and External Adapters

- **Source File:** `src/data/metadataProviders.ts`
- **Supported Adapters:**
  1. `TMDB (The Movie Database)`: Fetches official theatrical posters, backdrops, cast bios, and certifications.
  2. `TVMaze`: TV schedule tracking and episode stills.
  3. `Fanart.tv`: High-resolution clearlogos and disc art.
  4. `OpenSubtitles`: SRT subtitle track matching.
- **Title Canonicalization:** `canonicalizeTitle` in `artworkEngine.ts:60-95` strips release group tags, video quality tags (`1080p`, `4K`, `WEBRip`), audio tags (`DDP5.1`), and extracts clean title and year.
- **Match Scoring:** `scoreArtworkMatch` computes confidence scores (0.0 - 1.0) based on title Levenshtein distance, year matching, and genre alignment before accepting external metadata.

---

## 5. Verified IMDb Identifiers & Sharing Dialog

- **Component:** `ShareModal` (`src/components/ShareModal.tsx`)
- **Metadata Field:** `imdbId` (e.g. `tt0063350`) present on `Movie` and `Series` models.
- **Verified Works:** All open preservation titles in `src/data/openCatalogue.ts` are enriched with verified IMDb identifiers.
- **URL Resolution:** Formats official link: `https://www.imdb.com/title/${imdbId}/`.
- **Honest Absence:** Fictional demo titles intentionally lack `imdbId` and display: "No verified IMDb identifier associated with this item."
- **Sharing Channels:**
  - One-click copy for IMDb URL.
  - One-click copy for Kinora deep link (`https://kinora.tv/movies/:id` or local route).
  - Native Web Share API (`navigator.share`).
