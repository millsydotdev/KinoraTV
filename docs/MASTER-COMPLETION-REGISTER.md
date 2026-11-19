# Kinora Master Product Completion & Verification Register

**Programme:** KinoraTV Master Product Completion, Quality, Functionality & Release  
**Version:** 0.5.1  
**Status:** Authoritative Product Register  

This register tracks every screen, subsystem, capability, and defect resolution across the Kinora application in accordance with the Master Product Specification.

---

## 1. Register Status Definitions

- **Verified complete:** Fully implemented, verified against genuine runtime data or fixtures, verified in native shell, and documented in evidence.
- **Implemented, not yet verified:** Code is present and compiles, but requires manual external hardware test or third-party credential verification.
- **Partially implemented:** Baseline capability exists; advanced options documented for future release phases.
- **Blocked:** Requires external owner decision, credential, or platform capability not available locally.
- **Not applicable:** Excluded by architectural security boundary or DIY product policy.

---

## 2. Master Capability and Screen Register

| ID | Area | Capability / Feature | Priority | Current Status | Evidence & Test Result | Dependencies | Final Status |
|---|---|---|---|---|---|---|---|
| **CAP-001** | Home | Discovery Hub & Hero Stage | P1 | Verified complete | `Home.tsx`, `home-top.png`, `D91Regression.test.tsx` (8/8 pass) | None | Verified complete |
| **CAP-002** | Home | Continue Watching Rail with Real Progress | P1 | Verified complete | `Home.tsx`, `library.progress`, `home-scrolled.png` | Library progress | Verified complete |
| **CAP-003** | Home | Angular Geometric Framing & Red Glow | P1 | Verified complete | `Home.css`, `hero-geometric-frame.png`, visual review | Design token CSS | Verified complete |
| **CAP-004** | Live TV | EPG Continuous Broadcast Timeline | P1 | Verified complete | `LiveTV.tsx`, `live-tv-guide.png`, `GuideFlows.test.tsx` (17/17 pass) | XMLTV parser | Verified complete |
| **CAP-005** | Live TV | Channel Column with Badges & Logos | P1 | Verified complete | `artwork.rs`, `fetch_channel_logo`, `LiveTV.tsx` | Guarded artwork | Verified complete |
| **CAP-006** | Live TV | Synchronized "Now" Line & Air Markers | P1 | Verified complete | `LiveTV.css` (`.now-line`, `.prog.is-selected`), visual inspection | System clock | Verified complete |
| **CAP-007** | Live TV | Docked & Fullscreen Player Hand-off | P1 | Verified complete | `Player.tsx`, `live-tv-player.png`, `PlayerPlayback.test.tsx` (25/25 pass) | HLS proxy | Verified complete |
| **CAP-008** | Live TV | DVR, Scheduling & Stream Recordings | P2 | Verified complete | `dvr.rs` (3 tests pass), `Recordings.tsx`, `DvrCatchup.test.tsx` (6/6 pass) | Filesystem | Verified complete |
| **CAP-009** | Movies | Streaming Discovery Hub (Sub-Tabs) | P1 | Verified complete | `Movies.tsx`, `movies-top.png`, `movies-rails.png` | MOVIE_TABS | Verified complete |
| **CAP-010** | Movies | "Browse by Genre" Content Rails | P1 | Verified complete | `StreamingGenreRow`, `StreamingCategoryRail`, `movies-rails.png` | Genre art assets | Verified complete |
| **CAP-011** | Movies | Local Movies Integration ("From Your Local Library") | P1 | Verified complete | `Movies.tsx` (`localMovies`), `LocalMediaTab.tsx`, `local_media.rs` | Local folder scan | Verified complete |
| **CAP-012** | Movies | Movie Details Sheet (Metadata, Cast, Technical Badges) | P1 | Verified complete | `MovieDetail.tsx`, `movie-details.png`, `XtreamMoviesSeries.test.tsx` | Metadata API / VOD | Verified complete |
| **CAP-013** | TV Shows | Series Hub (Browse, My Shows, Genres, New Episodes) | P1 | Verified complete | `SeriesBrowse.tsx`, `tv-shows-top.png`, `tv-shows-rails.png` | TV_TABS | Verified complete |
| **CAP-014** | TV Shows | Series Details, Seasons Tabs & Episode Rails | P1 | Verified complete | `SeriesDetail.tsx`, `tv-show-details.png`, `XtreamMoviesSeries.test.tsx` | Series catalogue | Verified complete |
| **CAP-015** | TV Shows | Local Series Integration ("From Your Local Library") | P1 | Verified complete | `SeriesBrowse.tsx` (`localSeries`), `local_media.rs` | Local folder scan | Verified complete |
| **CAP-016** | Library | Four Metric Summary Cards (Titles, In Progress, Watchlist, Completed) | P1 | Verified complete | `Library.tsx`, `library.png`, `Persistence.test.tsx` (14/14 pass) | Scoped library state | Verified complete |
| **CAP-017** | Library | Sub-Tabs (Overview, Watchlist, Favourites, Ratings, Collections, Local Media) | P1 | Verified complete | `Library.tsx`, `LocalMediaTab.tsx`, `VisualRegressionRecovery.test.tsx` (6/6 pass) | Library collections | Verified complete |
| **CAP-018** | Local Media | Native Folder Picker & Path Traversal Guards | P1 | Verified complete | `select_local_media_folder`, `save_local_library`, `local_media.rs` | Tauri dialog / IPC | Verified complete |
| **CAP-019** | Local Media | Background Library File Scanning & Token Parsing | P1 | Verified complete | `scan_local_library`, year/edition/season token regex, `local_media.rs` | Threadpool | Verified complete |
| **CAP-020** | Local Media | Deduplicated Physical Storage Calculation via statvfs | P1 | Verified complete | `get_storage_volumes_info`, device ID grouping (`st_dev`), `local_media.rs` | OS filesystem | Verified complete |
| **CAP-021** | Local Media | Dynamic Storage Gauge in Application Sidebar | P1 | Verified complete | `Sidebar.tsx`, `storage-progress-bar`, real GB/TB metrics | Local media hook | Verified complete |
| **CAP-022** | Search | Global Multi-Category Search with Hit Counts | P1 | Verified complete | `Search.tsx`, `search-results.png`, `Search.test.tsx` | Indexed catalogue | Verified complete |
| **CAP-023** | Search | Autocomplete Suggestions & History | P2 | Verified complete | `Search.tsx` (`suggestions`, `search-autocomplete-dropdown`) | Local state | Verified complete |
| **CAP-024** | Sources | User-Controlled Sources (M3U, XMLTV, Xtream) | P1 | Verified complete | `Sources.tsx`, `sources.png`, `sources.rs`, `xtream.rs`, `m3u.rs` | Guarded network | Verified complete |
| **CAP-025** | Sources | Secure Encrypted Credential Vault | P1 | Verified complete | `xtream.rs` (AES-256-GCM / PBKDF2), credentials never stored in plain text | Rust ring | Verified complete |
| **CAP-026** | Sources | Genuine Connection Testing (HEAD / GET limit) | P1 | Verified complete | `test_source_connection`, `test_xtream_connection`, `fetch.rs` | Network policy | Verified complete |
| **CAP-027** | Policy | Strict DIY Source Policy (Zero Endorsements / Recommendations) | P1 | Verified complete | Full codebase audit: zero suggested IPTV providers, zero customer-facing playlist recommendations | Code review | Verified complete |
| **CAP-028** | Category Hubs | Dedicated Screens across 12 Media Categories | P2 | Verified complete | `MediaCategoryPage.tsx` (Radio, Music, Podcasts, Audiobooks, Books, Docs, News, Sports, etc.) | Discovered resources | Verified complete |
| **CAP-029** | Design System | Reusable Red Illuminated Focus Glow (`#E50914`) | P1 | Verified complete | `global.css` (`.animated-focus-border`, `.tv-focus-border`, `.card:hover`) | CSS tokens | Verified complete |
| **CAP-030** | Design System | Semantic Palette Alignment (`#080C10`, `#111318`, `#171B22`, `#E50914`, `#FF3847`) | P1 | Verified complete | `global.css`, `design-system.css`, master reference matching | Theme engine | Verified complete |
| **CAP-031** | Environments | Strict Data Isolation: DEV MOCK vs REAL USER | P1 | Verified complete | `store.tsx` (`demoActive` flag), zero fixture leakage, verified across 68 screenshots | Scoped storage keys | Verified complete |
| **CAP-032** | Security | Network Destination Guardrails (SSRF Prevention, RFC 1918 Block) | P1 | Verified complete | `fetch.rs` (17 tests pass), `no_proxy()`, IP literal checks | reqwest / hyper | Verified complete |
| **CAP-033** | Security | Salted PBKDF2 Parental PIN Lockout Engine | P1 | Verified complete | `pin.rs` (4 tests pass), `ProfilesModal.tsx`, 30-second brute-force lockout | PBKDF2 / SHA-256 | Verified complete |
| **CAP-034** | Release | Centralised Authoritative Versioning (0.5.1) | P1 | Verified complete | `validate-version.cjs`, `package.json`, `Cargo.toml`, `tauri.conf.json` | SemVer 2.0.0 | Verified complete |
| **CAP-035** | Release | Self-Contained Release Binary Packaging | P1 | Verified complete | `src-tauri/target/release/kinora` (18 MB, bundled frontendDist) | Tauri bundler | Verified complete |
| **CAP-036** | AI Control | Local Loopback MCP Architecture (PIN Pairing Ritual) | P2 | Implemented, not yet verified | `docs/release/ai-control-architecture.md`, local MCP specification | External MCP agent | Implemented, not yet verified |
| **CAP-037** | Evidence | Unified Single ZIP Archive Package (`Kinora_COMPLETE_UI_Evidence.zip`) | P1 | Verified complete | `scripts/package-unified-evidence.py`, 108 entries, CRC32 verified | zipfile | Verified complete |

---

## 3. Reconciliation of Previous Audit Findings

1. **Artwork Erasure on Restart (Historical Defect):** Resolved. Saved channels preserve tvg-id and channel key mappings; `ArtworkStore` persists raster cache keys to disk (`artwork_cache.json`).
2. **Empty Screen Wiping in User Mode (DEF-001):** Resolved. Blanket `<NoTitles />` returns removed. Movies and TV Shows render structured discovery rails and clear provider connection prompts.
3. **M3U Movies and Series Separation:** M3U playlists are parsed as live channels; on-demand content is routed through Xtream Codes endpoints and local media directories, with clear capability messaging.
4. **Local Loopback Connection Refused in WebKitGTK:** Resolved. Vite is bound to dual-stack `host: '::'` (IPv4 and IPv6), and the production release binary bundles all assets directly without localhost dependency.
5. **Em-Dash Policy Violation:** Resolved. Complete zero em-dash compliance verified across all code, tests, documentation, and UI strings.
