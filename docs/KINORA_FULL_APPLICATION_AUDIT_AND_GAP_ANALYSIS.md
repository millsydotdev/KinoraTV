# Kinora Full Application Audit, Architecture Review and Product Gap Analysis

**Date:** 2026-11-23  
**Application Version:** 0.6.0 (Locked)  
**Target Architecture:** Linux / macOS / Windows Desktop (Tauri 2 + React 19)  
**Current Branch:** `v0.6.0` (HEAD commit: `d4bb939`)  
**Audit Scope:** Full Application Baseline, UI/UX, Playback, Navigation, Artwork Pipeline, Architecture, Performance, Security, and Product Gap Analysis  
**Enforcement Standards:** Zero em-dash () and zero en-dash () strict typography compliance  

---

## Table of Contents

1. [Section A: Executive Summary](#section-a-executive-summary)
2. [Section B: Screen-by-Screen Audit](#section-b-screen-by-screen-audit)
   - [B.1 Home Screen](#b1-home-screen)
   - [B.2 Live TV Screen & Navigation](#b2-live-tv-screen--navigation)
   - [B.3 EPG Timeline Grid](#b3-epg-timeline-grid)
   - [B.4 Movies Hub](#b4-movies-hub)
   - [B.5 TV Shows & Series Hub](#b5-tv-shows--series-hub)
   - [B.6 Movie Details Sheet](#b6-movie-details-sheet)
   - [B.7 Series & Episode Details Sheet](#b7-series--episode-details-sheet)
   - [B.8 Global Search Screen](#b8-global-search-screen)
   - [B.9 Personal Media Library](#b9-personal-media-library)
   - [B.10 Local Media Storage & Scanner](#b10-local-media-storage--scanner)
   - [B.11 Recordings & PVR Engine](#b11-recordings--pvr-engine)
   - [B.12 Settings Hub](#b12-settings-hub)
   - [B.13 Sources & Provider Management](#b13-sources--provider-management)
   - [B.14 Video Player & Playback Overlays](#b14-video-player--playback-overlays)
   - [B.15 Persistent Universal Player Dock](#b15-persistent-universal-player-dock)
   - [B.16 Audio Player Bar & Category Hubs](#b16-audio-player-bar--category-hubs)
   - [B.17 Public Discovery & Open Catalogue](#b17-public-discovery--open-catalogue)
   - [B.18 Social Share Dialog](#b18-social-share-dialog)
   - [B.19 Notifications & Broadcast Reminders Center](#b19-notifications--broadcast-reminders-center)
   - [B.20 User Profiles & Parental Security](#b20-user-profiles--parental-security)
   - [B.21 Modals, Drawers & Lightboxes](#b21-modals-drawers--lightboxes)
   - [B.22 First-Run Setup & Onboarding](#b22-first-run-setup--onboarding)
   - [B.23 System Error, Offline, Loading & Empty States](#b23-system-error-offline-loading--empty-states)
   - [B.24 Application Header & Global Navigation](#b24-application-header--global-navigation)
3. [Section C: Functional Feature Matrix](#section-c-functional-feature-matrix)
4. [Section D: Artwork and Data Pipeline Forensic Report](#section-d-artwork-and-data-pipeline-forensic-report)
5. [Section E: Architecture & Code Quality Forensic Report](#section-e-architecture--code-quality-forensic-report)
6. [Section F: Performance & Caching Forensic Report](#section-f-performance--caching-forensic-report)
7. [Section G: Security & Reliability Forensic Report](#section-g-security--reliability-forensic-report)
8. [Section H: Testing and Runtime Verification Report](#section-h-testing-and-runtime-verification-report)
9. [Section I: Product Gap Analysis & Future Architecture Readiness](#section-i-product-gap-analysis--future-architecture-readiness)
10. [Section J: Prioritised Recommendations Register](#section-j-prioritised-recommendations-register)

---

## Section A: Executive Summary

This document delivers an exhaustive, unvarnished technical audit and product gap analysis of the Kinora application at version `0.6.0`. Kinora is architected as a hybrid desktop media application pairing a React 19 and TypeScript frontend with a Rust backend powered by Tauri 2. The audit investigated the entire application across all routes, backend engines, state stores, caching mechanisms, security policies, and user interaction modes (Desktop and 10-foot Television).

### Current Readiness Verdict

**Kinora 0.6.0 is NOT ready for production release.**

While the core streaming and security foundations are exceptionally well-engineered (specifically the custom scheme HLS rewriter in [src-tauri/src/hls.rs](file:///mnt/storage/TVMovie/src-tauri/src/hls.rs), atomic playlist persistence in [src-tauri/src/sources.rs](file:///mnt/storage/TVMovie/src-tauri/src/sources.rs), and the recently completed Gate D9 Live TV on-demand virtualization in [src/screens/LiveTV.tsx](file:///mnt/storage/TVMovie/src/screens/LiveTV.tsx)), the application suffers from critical functional disconnections, broken compilation, layout collisions, and severe artwork delivery failures that undermine the user experience.

### Five Major Systemic Deficiencies

1. **Broken TypeScript Compilation in Staged Working Tree:**  
   The project fails type-checking (`npm run typecheck`) with 10 compilation errors. Nine of these errors stem from an unapproved, partially implemented voice control module ([src/lib/voiceCommand.ts](file:///mnt/storage/TVMovie/src/lib/voiceCommand.ts)) that directly violates project scope instructions by introducing voice command dispatching before microphone architecture has been authorized. The tenth error is a type safety defect in [src/lib/dlna.test.ts](file:///mnt/storage/TVMovie/src/lib/dlna.test.ts) where a potentially undefined device is passed to the connection manager.

2. **Severe Artwork Bottleneck and Widespread Missing Visuals:**  
   Users continue to see blank marks and missing channel logos on Home and Live TV. Forensic analysis revealed a 5-tier failure cascade:
   - All demo channels in [src/data/channels.ts](file:///mnt/storage/TVMovie/src/data/channels.ts) explicitly have `logoUrl: null`.
   - The Rust artwork downloader ([src-tauri/src/artwork.rs](file:///mnt/storage/TVMovie/src-tauri/src/artwork.rs)) enforces a global semaphore limit of only 6 concurrent requests (`REQUESTS: Semaphore(6)`). When screens render 30 to 60 channel cards simultaneously, the queue backs up and requests time out.
   - Any logo request that times out or returns non-raster bytes is aggressively locked into a failure cache for 300 seconds (`FAILED_RETRY_TTL = 300s`), preventing retries.
   - Built-in fallback channel logos in `artwork.rs` (`tv_logo_url_for_id`) are hardcoded to only 40 United Kingdom channels; every international or unmatched channel falls back to empty initials.
   - Channel logo loading in [src/components/ui.tsx](file:///mnt/storage/TVMovie/src/components/ui.tsx) completely bypasses the centralized [src/data/artworkEngine.ts](file:///mnt/storage/TVMovie/src/data/artworkEngine.ts).

3. **Isolated, Disconnected Code and Phantom Features:**  
   Four substantial subsystems exist in the codebase and possess passing unit tests, yet are completely unmounted and disconnected from the production interface:
   - [src/components/VirtualKeyboard.tsx](file:///mnt/storage/TVMovie/src/components/VirtualKeyboard.tsx): Essential for 10-foot TV navigation, but never rendered in search or PIN entry.
   - [src/components/RemoteHintBar.tsx](file:///mnt/storage/TVMovie/src/components/RemoteHintBar.tsx): Provides crucial remote control color-key and navigation hints, but is never attached to TV view mode.
   - [src/lib/globalSearchMatrix.ts](file:///mnt/storage/TVMovie/src/lib/globalSearchMatrix.ts): A high-performance prefix-trie search engine that is completely ignored by [src/screens/Search.tsx](file:///mnt/storage/TVMovie/src/screens/Search.tsx) in favor of slow in-memory filtering.
   - [src/lib/reconnectController.ts](file:///mnt/storage/TVMovie/src/lib/reconnectController.ts): An exponential-backoff stream reconnect controller that is ignored by [src/screens/Player.tsx](file:///mnt/storage/TVMovie/src/screens/Player.tsx).

4. **Header Crowding and Search UX Deficiency:**  
   The global application header ([src/components/PageHeader.tsx](file:///mnt/storage/TVMovie/src/components/PageHeader.tsx)) renders an inline search form (`.search-pill-form`) taking up to 440px of width alongside 8 action buttons, category tabs, and profile menus. On standard desktop viewports (1440x900 and 1280x720), the right action cluster collides with screen title tabs. Users need an icon-only search button (magnifying glass) that opens a dedicated modal search overlay with keyboard shortcuts (`/` and `Ctrl+K`), freeing header space.

5. **Simulated Casting Capabilities:**  
   The Casting subsystem ([src/components/CastModal.tsx](file:///mnt/storage/TVMovie/src/components/CastModal.tsx) and [src/lib/casting/manager.ts](file:///mnt/storage/TVMovie/src/lib/casting/manager.ts)) presents fake Chromecast and AirPlay devices with hardcoded local IP addresses (`192.168.1.102` and `192.168.1.108`). Connection handshakes are simulated with `setTimeout` delays. Only DLNA has genuine underlying Rust commands. Presenting simulated devices violates Kinora's honesty principles.

---
## Section B: Screen-by-Screen Audit

Every screen, route, modal, and persistent interface element was audited against visual quality, functionality, data binding, desktop versus TV adaptation, accessibility, and error handling.

### B.1 Home Screen
- **Primary Source Files:** [src/screens/Home.tsx](file:///mnt/storage/TVMovie/src/screens/Home.tsx), [src/screens/Home.css](file:///mnt/storage/TVMovie/src/screens/Home.css), [src/lib/homeFeed.ts](file:///mnt/storage/TVMovie/src/lib/homeFeed.ts)
- **Visual Presentation & Hierarchy:**  
  The redesigned 16:9 featured hero spotlight provides a cinematic focal point with dynamic backdrop crossfades, metadata chips (year, runtime, rating, genres), synopsis line clamping, and high-contrast Watch Now and More Info action buttons. Below the hero, the Quick Jump category ribbon (`.home-quick-jump`) allows fast jumping between Movies, Series, Live TV, Radio, and Library.
- **Card & Content Rails:**  
  Eight distinct content rails are rendered: Continue Watching, Live TV Right Now, Movies, Series & TV Shows, Recommended for You, Because You Watched, Cultural Film Vault & Archives, and Live Radio & Spoken Audio. Continue Watching displays genuine percentage progress bars and provides a one-click dismiss action with toast undo.
- **Identified Defects & Deficiencies:**  
  1. *Dual-Initial Card Redundancy:* In demo mode or when upstream channels lack logos, `ChannelCard` renders initials in the top-left badge and repeats the same initials in the central ambient placeholder (`.channel-card-ambient-logo`), resulting in repetitive and visually sterile cards.  
  2. *Excessive Vertical Length on Standard Desktop:* While the feed deduplication in `homeFeed.ts` successfully prevents repeated cards, 8 full horizontal carousels create excessive vertical scrolling on 1080p desktop monitors (over 3800px total height).  
  3. *Companion Drawer Obstruction:* The collapsible companion side hub (`.home-side-hub`) displays channel previews and catalog disk metrics, but can overlap horizontal scroll buttons on viewports between 1200px and 1440px wide.  
  4. *TV Spatial Navigation Focus Trapping:* When navigating down through horizontal carousels via D-pad (`data-nav="home-card"`), focus can become trapped in the horizontal scroll track when reaching the end of a carousel instead of smoothly jumping to the next row below.

### B.2 Live TV Screen & Navigation
- **Primary Source Files:** [src/screens/LiveTV.tsx](file:///mnt/storage/TVMovie/src/screens/LiveTV.tsx), [src/screens/LiveTV.css](file:///mnt/storage/TVMovie/src/screens/LiveTV.css)
- **Visual Presentation & Hierarchy:**  
  Features a full-width broadcast guide with a docked live stream video preview at the top right, category filtering chips, and search filtering. Channel numbers, channel marks, and current programme progress bars render cleanly.
- **Identified Defects & Deficiencies:**  
  1. *Slow Logo Hydration Under Fast Scrolling:* When scrolling through large channel lists, channel logo tiles display plain colored boxes with text for several seconds before raster logos pop in. This is caused by the 6-permit global download semaphore in `artwork.rs`.  
  2. *Channel Sorting Memory Leaks:* The channel sorting utility ([src/lib/channelSorting.ts](file:///mnt/storage/TVMovie/src/lib/channelSorting.ts)) is called during every category filter switch, recalculating alphabetical and numerical weights across 10,000 channels synchronously without memoization.  
  3. *Unmounted Remote Hint Bar:* While Live TV supports remote color buttons (Red: Library, Green: Live TV, Yellow: Command Palette, Blue: Sources), there is no visible hint bar reminding TV users of these button mappings.

### B.3 EPG Timeline Grid
- **Primary Source Files:** [src/screens/LiveTV.tsx](file:///mnt/storage/TVMovie/src/screens/LiveTV.tsx), [src-tauri/src/xmltv.rs](file:///mnt/storage/TVMovie/src-tauri/src/xmltv.rs), [src-tauri/src/guides.rs](file:///mnt/storage/TVMovie/src-tauri/src/guides.rs)
- **Virtualization & Scaling Assessment:**  
  Gate D9 successfully resolved the 10,000+ channel scaling bottleneck by implementing on-demand schedule queries strictly for rendered rows (`renderedChannels = shown.slice(startRowIdx, endRowIdx)`), proportional scroll spacers (`topPadHeight`, `bottomPadHeight`), and `requestAnimationFrame` scroll budgeting.
- **Identified Defects & Deficiencies:**  
  1. *Horizontal Axis Not Virtualized:* While vertical channel rows are virtualized, the horizontal time axis renders every programme block across the full 24-hour window. On channels with 48 short 30-minute news slots, this introduces up to 1,500 un-recycled DOM nodes per active viewport.  
  2. *Daylight Saving Time Boundary Gaps:* When crossing daylight saving transitions (23-hour or 25-hour days), timeline grid ticks occasionally misalign with programme stop times by exactly 60 minutes.

### B.4 Movies Hub
- **Primary Source Files:** [src/screens/Movies.tsx](file:///mnt/storage/TVMovie/src/screens/Movies.tsx), [src/lib/vodAggregation.ts](file:///mnt/storage/TVMovie/src/lib/vodAggregation.ts)
- **Visual Presentation & Hierarchy:**  
  Presents a dedicated film discovery interface with sub-tabs: Browse, Collections, Genres, New Releases, and Top Rated. Poster cards render in 2:3 aspect ratio with technical format badges (4K UHD, HDR10, Dolby Vision).
- **Identified Defects & Deficiencies:**  
  1. *Partitioned Catalog Silos:* Movies from Xtream Codes VOD providers, local scanned media folders, and the open public discovery film catalog are kept in isolated internal buckets rather than presenting a unified personal movie collection.  
  2. *Missing Release Year on Filter Reset:* When clearing genre filters, the movie grid resets to the top but loses the user's previously chosen sort order (e.g., Year descending vs Rating descending).

### B.5 TV Shows & Series Hub
- **Primary Source Files:** [src/screens/SeriesBrowse.tsx](file:///mnt/storage/TVMovie/src/screens/SeriesBrowse.tsx)
- **Visual Presentation & Hierarchy:**  
  Displays television series with season counters, total episode badges, and genre categorization chips. Sub-tabs cover Browse, My Shows, Genres, and New Episodes.
- **Identified Defects & Deficiencies:**  
  1. *Unwatched Episode Count Discrepancy:* The badge displaying unwatched episodes does not consistently decrement when episodes are marked watched via the context menu until a full page reload occurs.  
  2. *Missing Network / Channel Attribution:* Series originating from broadcast channels do not indicate their source network (e.g., HBO, BBC, AMC) on the overview card.

### B.6 Movie Details Sheet
- **Primary Source Files:** [src/screens/MovieDetail.tsx](file:///mnt/storage/TVMovie/src/screens/MovieDetail.tsx), [src/screens/Detail.css](file:///mnt/storage/TVMovie/src/screens/Detail.css)
- **Visual Presentation & Hierarchy:**  
  Full-screen cinematic presentation featuring a high-resolution 16:9 backdrop banner, poster thumbnail, audio/video spec chips, cast lists, and direct Play, Watchlist, and Share triggers.
- **Identified Defects & Deficiencies:**  
  1. *Stream Failure Recovery UI:* If the underlying stream URL fails during initial probe or connection, the error message directs the user to "Connect On-Demand Provider" even if the provider is already connected and simply experiencing temporary server downtime.  
  2. *Trailer Preview Missing Native IPC Player:* Clicking "Watch Trailer" attempts to open external web links rather than playing trailer streams within Kinora's native player.

### B.7 Series & Episode Details Sheet
- **Primary Source Files:** [src/screens/SeriesDetail.tsx](file:///mnt/storage/TVMovie/src/screens/SeriesDetail.tsx)
- **Visual Presentation & Hierarchy:**  
  Provides a comprehensive series overview with season selector pills, horizontal episode card rails, synopsis text, runtime indicators, and individual episode progress bars.
- **Identified Defects & Deficiencies:**  
  1. *Episode Still Aspect Ratio Distortion:* Episode thumbnails from upstream Xtream providers that arrive in 4:3 or square formats are forced into 16:9 containers without letterboxing, causing visual stretching.  
  2. *Next Episode Button Inconsistency:* When the final episode of a season finishes, the "Watch Next" action does not automatically advance to Season N+1 Episode 1.

### B.8 Global Search Screen
- **Primary Source Files:** [src/screens/Search.tsx](file:///mnt/storage/TVMovie/src/screens/Search.tsx), [src/screens/Search.css](file:///mnt/storage/TVMovie/src/screens/Search.css)
- **Visual Presentation & Hierarchy:**  
  Unified multi-category search interface with debounced text input, instant category filters (All, Movies, Series, Live TV, Audio, Radio, Local), recent searches history, and saved searches management.
- **Identified Defects & Deficiencies:**  
  1. *Disconnected Global Search Matrix Engine:* As noted in Section A, `Search.tsx` ignores the dedicated prefix-trie phonetic search engine in [src/lib/globalSearchMatrix.ts](file:///mnt/storage/TVMovie/src/lib/globalSearchMatrix.ts) and instead executes repeated synchronous loops over array objects.  
  2. *No On-Screen Virtual Keyboard in TV Mode:* When running in TV mode, clicking into the search box does not summon an on-screen keyboard, leaving remote control users unable to enter queries without a physical keyboard attached.

### B.9 Personal Media Library
- **Primary Source Files:** [src/screens/Library.tsx](file:///mnt/storage/TVMovie/src/screens/Library.tsx)
- **Visual Presentation & Hierarchy:**  
  Displays four analytics summary cards (Total Titles, In Progress, Watchlist, Completed), tabbed filters, custom thematic collections manager, and favourites grid.
- **Identified Defects & Deficiencies:**  
  1. *Collection Cover Art Regeneration:* Custom user collections do not automatically generate a 2x2 grid montage of member artwork, displaying a generic folder icon instead.  
  2. *Profile Watch History Leakage on Switch:* When switching profiles rapidly via the header menu, watch history items from the previous profile occasionally persist in the DOM until the route is remounted.

### B.10 Local Media Storage & Scanner
- **Primary Source Files:** [src/screens/LocalMediaTab.tsx](file:///mnt/storage/TVMovie/src/screens/LocalMediaTab.tsx), [src-tauri/src/local_media.rs](file:///mnt/storage/TVMovie/src-tauri/src/local_media.rs)
- **Scanning & File Access:**  
  Scans desktop video folders using Rayon threadpools in Rust, extracting season/episode tokens and matching movie titles against regex patterns. Serves video content securely over `kstream://localhost/local/...`.
- **Identified Defects & Deficiencies:**  
  1. *Lack of Real-Time Directory Monitoring:* Local folders are only rescanned upon manual user trigger or application startup. File additions, deletions, or renames made in the filesystem are not reflected in real time via inotify / ReadDirectoryChanges.  
  2. *NFO Sidecar Parsing Missing:* Does not parse Kodi / Plex style `.nfo` metadata sidecars, relying exclusively on filename regex heuristics.

### B.11 Recordings & PVR Engine
- **Primary Source Files:** [src/screens/Recordings.tsx](file:///mnt/storage/TVMovie/src/screens/Recordings.tsx), [src-tauri/src/dvr.rs](file:///mnt/storage/TVMovie/src-tauri/src/dvr.rs)
- **Recording Scheduling & Storage:**  
  Scheduled and manual broadcast recordings are streamed to the local disk with series retention rules and disk storage gauges.
- **Identified Defects & Deficiencies:**  
  1. *Lack of Background Daemon:* Recording requires the Kinora desktop application process to remain active. If the user quits the application, active and upcoming scheduled recordings fail immediately.  
  2. *Stream Failure Disconnection:* Upstream IPTV connection drops during a live recording do not trigger automatic stream reconnects, leaving corrupted or truncated recording files.

### B.12 Settings Hub
- **Primary Source Files:** [src/screens/Settings.tsx](file:///mnt/storage/TVMovie/src/screens/Settings.tsx), [src/screens/Settings.css](file:///mnt/storage/TVMovie/src/screens/Settings.css)
- **Preferences & Configuration:**  
  Comprehensive settings organized into Display & UI, Sources & Providers, Playback & Audio, Profiles & Parental Controls, Storage & Data, and About.
- **Identified Defects & Deficiencies:**  
  1. *Display Mode Confusion:* Settings contains both "View Mode" (Desktop vs TV) and "Layout Mode" (Standard vs Compact vs Spacious vs TV). Toggling one can desynchronize the other.  
  2. *Unvalidated Metadata API Keys:* Users can enter invalid TMDb or TVMaze API keys without an immediate "Test Key" validation request, discovering authentication errors only when artwork fails to enrich.

### B.13 Sources & Provider Management
- **Primary Source Files:** [src/screens/Sources.tsx](file:///mnt/storage/TVMovie/src/screens/Sources.tsx), [src-tauri/src/sources.rs](file:///mnt/storage/TVMovie/src-tauri/src/sources.rs), [src-tauri/src/xtream.rs](file:///mnt/storage/TVMovie/src-tauri/src/xtream.rs)
- **Source Ingestion:**  
  Manages M3U playlists, Xtream Codes servers, Stalker portals, and XMLTV guides. Connection testing uses genuine HEAD/GET requests via `Policy::source_test()`.
- **Identified Defects & Deficiencies:**  
  1. *Multi-Server Failover Visibility:* While `xtreamFallback.ts` tracks server health, the UI does not show which server is currently active or indicate failover events to the user.  
  2. *M3U Refresh Progress Indicator:* Refreshing an M3U playlist with 20,000 channels locks the UI status badge on "Refreshing..." without showing a progress percentage or channel download count.

### B.14 Video Player & Playback Overlays
- **Primary Source Files:** [src/screens/Player.tsx](file:///mnt/storage/TVMovie/src/screens/Player.tsx), [src/screens/Player.css](file:///mnt/storage/TVMovie/src/screens/Player.css), [src/lib/playback.ts](file:///mnt/storage/TVMovie/src/lib/playback.ts)
- **Universal Playback Architecture:**  
  Uses WebKitGTK MSE with hls.js (light build, worker disabled) through `kstream://localhost/<handle>`. Includes parametric audio equalization, subtitle customization, chapter ticks, trickplay thumbnail scrubbing, binge countdown overlay, and inactivity guard.
- **Identified Defects & Deficiencies:**  
  1. *Disconnected Reconnect Controller:* `Player.tsx` implements its own basic retry loop and does not utilize the robust exponential backoff state machine in [src/lib/reconnectController.ts](file:///mnt/storage/TVMovie/src/lib/reconnectController.ts).  
  2. *Live Stream Scrubbing Boundary:* Scrubbing backwards on live streams with rolling DVR buffers occasionally fails to calculate the live edge offset accurately, resulting in buffer underruns.

### B.15 Persistent Universal Player Dock
- **Primary Source Files:** [src/components/PersistentPlayerDock.tsx](file:///mnt/storage/TVMovie/src/components/PersistentPlayerDock.tsx), [src/state/playbackContext.tsx](file:///mnt/storage/TVMovie/src/state/playbackContext.tsx)
- **Docking Lifecycle:**  
  Automatically docks to the bottom-right corner when navigating away from `/watch/` routes while a stream is actively playing. Supports expand to full screen, toggle play/pause, and dismiss.
- **Identified Defects & Deficiencies:**  
  1. *Z-Index Conflict with Modal Overlays:* The docked player has a z-index of 500, causing it to render on top of modal backdrop masks when opening Settings or Command Palette.  
  2. *Subtitle Rendering in Minimized State:* Minimized PiP mode continues to render full-sized subtitles across the tiny 320x180 dock window, obscuring the video.

### B.16 Audio Player Bar & Category Hubs
- **Primary Source Files:** [src/components/AudioPlayerBar.tsx](file:///mnt/storage/TVMovie/src/components/AudioPlayerBar.tsx), [src/screens/RadioScreen.tsx](file:///mnt/storage/TVMovie/src/screens/RadioScreen.tsx), [src/screens/MusicScreen.tsx](file:///mnt/storage/TVMovie/src/screens/MusicScreen.tsx), [src/screens/PodcastsScreen.tsx](file:///mnt/storage/TVMovie/src/screens/PodcastsScreen.tsx), [src/screens/AudiobooksScreen.tsx](file:///mnt/storage/TVMovie/src/screens/AudiobooksScreen.tsx)
- **Audio Experience:**  
  Persistent bottom bar with scrubber, volume slider, queue drawer, sleep timer, and synchronized lyrics viewer ([src/components/LyricsViewer.tsx](file:///mnt/storage/TVMovie/src/components/LyricsViewer.tsx)).
- **Identified Defects & Deficiencies:**  
  1. *Lack of Equalizer Presets for Audio:* While video player has `AudioEnhancer` EQ presets, the persistent audio player bar operates through plain HTMLAudioElement without Web Audio BiquadFilter equalization.  
  2. *Sleep Timer Drift:* When the desktop enters system suspend, the sleep timer fails to account for suspended clock time, remaining active long after the target sleep duration.

### B.17 Public Discovery & Open Catalogue
- **Primary Source Files:** [src/state/catalogue.ts](file:///mnt/storage/TVMovie/src/state/catalogue.ts), [src-tauri/src/catalogue.rs](file:///mnt/storage/TVMovie/src-tauri/src/catalogue.rs)
- **Discovery Pipeline:**  
  Queries the approved iptv-org catalog over HTTPS with strict host pinning and size limits.
- **Identified Defects & Deficiencies:**  
  1. *Catalogue Stale Check:* Catalogue indexing only checks staleness when the Discovery tab is explicitly opened, resulting in noticeable UI freeze during the initial JSON fetch and parse.  
  2. *Single Catalog Provider Limitation:* Restricted strictly to iptv-org; no support for community curated radio or podcast directories.

### B.18 Social Share Dialog
- **Primary Source Files:** [src/components/ShareModal.tsx](file:///mnt/storage/TVMovie/src/components/ShareModal.tsx)
- **Sharing Architecture:**  
  Generates deep-link URLs, QR codes, and formatted citation cards for sharing titles and channels.
- **Identified Defects & Deficiencies:**  
  1. *Deep Link Port Binding:* Share URLs encode `http://localhost:5199/watch/...` assuming development port 5199 rather than generating production-safe application URI schemes (`kinora://watch/...`).

### B.19 Notifications & Broadcast Reminders Center
- **Primary Source Files:** [src/components/Notifications.tsx](file:///mnt/storage/TVMovie/src/components/Notifications.tsx), [src/components/PageHeader.tsx](file:///mnt/storage/TVMovie/src/components/PageHeader.tsx)
- **Reminders & Alerts:**  
  Broadcast reminders trigger desktop notification alerts within 5 minutes of air time with direct "Tune In" action buttons.
- **Identified Defects & Deficiencies:**  
  1. *Notification Badge Positioning:* The red unread badge (`.bell-dot`) overlaps the bell icon boundary in `PageHeader.css` on high-DPI displays.

### B.20 User Profiles & Parental Security
- **Primary Source Files:** [src/state/profiles.tsx](file:///mnt/storage/TVMovie/src/state/profiles.tsx), [src/lib/kidsMode.ts](file:///mnt/storage/TVMovie/src/lib/kidsMode.ts), [src-tauri/src/pin.rs](file:///mnt/storage/TVMovie/src-tauri/src/pin.rs)
- **Profile Data Isolation & PIN Protection:**  
  Isolated localStorage keys per profile with cascading deletion. Salted SHA-256 and PBKDF2 PIN hashing with 30-second lockout after 5 consecutive failed attempts.
- **Identified Defects & Deficiencies:**  
  1. *Kids Mode Content Tag Leak:* Some public domain titles lacking age rating tags pass through kids mode filters because the fallback assumes unrated titles are safe.

### B.21 Modals, Drawers & Lightboxes
- **Primary Source Files:** [src/components/CastModal.tsx](file:///mnt/storage/TVMovie/src/components/CastModal.tsx), [src/components/DownloadsModal.tsx](file:///mnt/storage/TVMovie/src/components/DownloadsModal.tsx), [src/components/EncryptedBackupModal.tsx](file:///mnt/storage/TVMovie/src/components/EncryptedBackupModal.tsx), [src/components/EpgMappingModal.tsx](file:///mnt/storage/TVMovie/src/components/EpgMappingModal.tsx), [src/components/EpgStatusModal.tsx](file:///mnt/storage/TVMovie/src/components/EpgStatusModal.tsx), [src/components/LiveMosaicGrid.tsx](file:///mnt/storage/TVMovie/src/components/LiveMosaicGrid.tsx), [src/components/SmartCollectionModal.tsx](file:///mnt/storage/TVMovie/src/components/SmartCollectionModal.tsx), [src/components/StalkerServerModal.tsx](file:///mnt/storage/TVMovie/src/components/StalkerServerModal.tsx), [src/components/StreamCheckerModal.tsx](file:///mnt/storage/TVMovie/src/components/StreamCheckerModal.tsx), [src/components/TraktSettingsModal.tsx](file:///mnt/storage/TVMovie/src/components/TraktSettingsModal.tsx)
- **Modal Lifecycle:**  
  All modals enforce ESC key dismissal and aria-modal attributes.
- **Identified Defects & Deficiencies:**  
  1. *Simulated Cast Devices:* `CastModal` presents fake Chromecast and AirPlay devices as detailed in Section A.  
  2. *CSP Violation in Trakt User Avatar:* `TraktSettingsModal` renders `<img src={config.user.avatarUrl} />` directly, which is blocked by the Tauri CSP (`img-src: 'self' data: blob:`).

### B.22 First-Run Setup & Onboarding
- **Primary Source Files:** [src/screens/Setup.tsx](file:///mnt/storage/TVMovie/src/screens/Setup.tsx)
- **Onboarding Flow:**  
  Offers step-by-step guidance for adding first playlist, configuring display mode, setting up parental controls, and creating initial profiles.
- **Identified Defects & Deficiencies:**  
  1. *Demo Mode Confusion:* Skipping setup automatically populates fictional demo channels without a clear persistent banner explaining that these channels have no playable video streams.

### B.23 System Error, Offline, Loading & Empty States
- **Primary Source Files:** [src/components/OfflineBanner.tsx](file:///mnt/storage/TVMovie/src/components/OfflineBanner.tsx), [src/components/ErrorBoundary.tsx](file:///mnt/storage/TVMovie/src/components/ErrorBoundary.tsx), [src/components/ui.tsx](file:///mnt/storage/TVMovie/src/components/ui.tsx)
- **State Handling:**  
  `OfflineBanner` monitors network reachability. `ErrorBoundary` catches unhandled React crashes with an error recovery button.
- **Identified Defects & Deficiencies:**  
  1. *Network Error Retry Loop:* When network is restored, `OfflineBanner` triggers `window.location.reload()` which completely resets in-memory player state and active stream playback.

### B.24 Application Header & Global Navigation
- **Primary Source Files:** [src/components/PageHeader.tsx](file:///mnt/storage/TVMovie/src/components/PageHeader.tsx), [src/components/PageHeader.css](file:///mnt/storage/TVMovie/src/components/PageHeader.css), [src/components/Sidebar.tsx](file:///mnt/storage/TVMovie/src/components/Sidebar.tsx)
- **Header & Search Audit Details:**  
  1. *Search Input Form Overcrowding:* As highlighted in the prompt, the header currently mounts an expanded search form (`.search-pill-form`, width clamp 220px to 440px) inside `.page-header-right`. Alongside title, tabs, back/forward buttons, task indicator, bell, view mode toggle, command palette grid, cast, help, profile pill, and clock, total header width demand exceeds 950px on the right alone.  
  2. *Requested Icon-Only Search Button:* The search input should be converted to an icon-only button (magnifying glass) that opens a centered search modal overlay with keyboard shortcuts (`/` and `Ctrl+K`), immediately freeing horizontal header real estate.  
  3. *Applications Grid:* The grid icon (`header-grid-btn`) currently opens the command palette instead of a true applications launcher grid for quick access to all 12 media categories.  
  4. *TV Mode Control Icon:* The view mode button always displays `Icon name="desktop"` regardless of whether the app is currently in Desktop or TV mode.  
  5. *Clock Alignment:* The clock is pinned to the extreme right but lacks a fixed tabular width container, causing subtle 1-2px jitter as second digits update.  
  6. *Preservation of Sidebar:* The 240px dark sidebar navigation ([src/components/Sidebar.tsx](file:///mnt/storage/TVMovie/src/components/Sidebar.tsx)) is stable, highly praised in user guidance, and will remain completely unchanged.

---
## Section C: Functional Feature Matrix

This matrix evaluates every functional subsystem of Kinora against the 6 strict implementation states:
- **Fully working:** Verified end to end from UI through backend and disk persistence.
- **Partially implemented:** Backend or UI exists, but key workflows or edge cases are incomplete.
- **Present but disconnected:** Feature exists and passes tests in isolation, but is not wired into the UI.
- **Implemented but unreliable:** Feature exists end to end but suffers from race conditions, timeouts, or frequent failures.
- **UI-only with no real functionality:** Visual controls exist in the interface with mock or simulated responses.
- **Missing entirely:** Feature is absent from the application.

| ID | Feature & Subsystem | Implementation State | Technical Evidence & Files | Missing Work / Deficiencies | Severity |
|:---|:---|:---|:---|:---|:---|
| **MAT-01** | Xtream Codes Auth & Ingestion | Fully working | [src-tauri/src/xtream.rs](file:///mnt/storage/TVMovie/src-tauri/src/xtream.rs), [src/screens/Sources.tsx](file:///mnt/storage/TVMovie/src/screens/Sources.tsx) | Live, VOD, and Series categories parse cleanly with token redaction | Low |
| **MAT-02** | M3U Playlist Parsing & Guarded Fetch | Fully working | [src-tauri/src/m3u.rs](file:///mnt/storage/TVMovie/src-tauri/src/m3u.rs), [src-tauri/src/fetch.rs](file:///mnt/storage/TVMovie/src-tauri/src/fetch.rs) | Direct network connection, `no_proxy()`, private IP blocking | Low |
| **MAT-03** | Stalker Portal Middleware | Partially implemented | [src/lib/stalker.ts](file:///mnt/storage/TVMovie/src/lib/stalker.ts), [src-tauri/src/stalker.rs](file:///mnt/storage/TVMovie/src-tauri/src/stalker.rs) | MAC address handshake works; token refresh on expiration is unhandled | Medium |
| **MAT-04** | Channel Categories & Multi-Group Split | Fully working | [src/state/playlists.ts](file:///mnt/storage/TVMovie/src/state/playlists.ts), [src/data/channelCategories.ts](file:///mnt/storage/TVMovie/src/data/channelCategories.ts) | Splits `A;B` groups cleanly into distinct category chips | Low |
| **MAT-05** | Favourites & Hidden Channels | Fully working | [src/state/store.tsx](file:///mnt/storage/TVMovie/src/state/store.tsx), [src/screens/Library.tsx](file:///mnt/storage/TVMovie/src/screens/Library.tsx) | Persists favourite channel IDs per profile in localStorage | Low |
| **MAT-06** | Channel Logos Delivery | Implemented but unreliable | [src-tauri/src/artwork.rs](file:///mnt/storage/TVMovie/src-tauri/src/artwork.rs), [src/components/ui.tsx](file:///mnt/storage/TVMovie/src/components/ui.tsx) | 6-permit semaphore bottleneck; 300s failure cache; missing international fallbacks | High |
| **MAT-07** | EPG Programme Ingestion (XMLTV) | Fully working | [src-tauri/src/xmltv.rs](file:///mnt/storage/TVMovie/src-tauri/src/xmltv.rs), [src-tauri/src/guides.rs](file:///mnt/storage/TVMovie/src-tauri/src/guides.rs) | Strict XML parser, DTD/entity attack defense, local timezone conversion | Low |
| **MAT-08** | EPG Channel Matching Engine | Fully working | [src-tauri/src/guides.rs](file:///mnt/storage/TVMovie/src-tauri/src/guides.rs), [src/state/channel-matching.ts](file:///mnt/storage/TVMovie/src/state/channel-matching.ts) | 4-tier match: normalized ID, without-feed, loose-keys, hand-match | Low |
| **MAT-09** | Live TV EPG Virtualization (Gate D9) | Fully working | [src/screens/LiveTV.tsx](file:///mnt/storage/TVMovie/src/screens/LiveTV.tsx), [src/screens/GateD9Virtualization.test.tsx](file:///mnt/storage/TVMovie/src/screens/GateD9Virtualization.test.tsx) | On-demand row schedule calculation; tested up to 20,000 channels | Low |
| **MAT-10** | Broadcast Catch-up Streaming | Fully working | [src/lib/xtreamCatchup.ts](file:///mnt/storage/TVMovie/src/lib/xtreamCatchup.ts), [src/components/CatchupBrowserModal.tsx](file:///mnt/storage/TVMovie/src/components/CatchupBrowserModal.tsx) | Interpolates append, shift, and Flussonic timeshift URLs cleanly | Low |
| **MAT-11** | Broadcast Reminders & Alerts | Fully working | [src/components/Notifications.tsx](file:///mnt/storage/TVMovie/src/components/Notifications.tsx), [src/screens/LiveTV.tsx](file:///mnt/storage/TVMovie/src/screens/LiveTV.tsx) | Triggers desktop notification within 5m of air time with Tune In action | Low |
| **MAT-12** | Multi-Server Failover & Fallback | Partially implemented | [src/lib/xtreamFallback.ts](file:///mnt/storage/TVMovie/src/lib/xtreamFallback.ts) | Logic works in isolation; UI lacks active server indicator or manual switch | Medium |
| **MAT-13** | Universal Playback Authority | Fully working | [src/state/playbackContext.tsx](file:///mnt/storage/TVMovie/src/state/playbackContext.tsx), [src/lib/playback.ts](file:///mnt/storage/TVMovie/src/lib/playback.ts) | Single active session enforced in Rust; seamless transition to PiP dock | Low |
| **MAT-14** | Persistent Player Dock (PiP) | Fully working | [src/components/PersistentPlayerDock.tsx](file:///mnt/storage/TVMovie/src/components/PersistentPlayerDock.tsx) | Smooth docking, play/pause, expand, and dismiss controls | Low |
| **MAT-15** | Parametric Audio Equalizer | Fully working | [src/lib/audioEnhancer.ts](file:///mnt/storage/TVMovie/src/lib/audioEnhancer.ts), [src/screens/Player.tsx](file:///mnt/storage/TVMovie/src/screens/Player.tsx) | Web Audio BiquadFilter presets (Flat, Voice Clarity, Bass, Night) | Low |
| **MAT-16** | Subtitle Customization & Styling | Fully working | [src/lib/subtitles.ts](file:///mnt/storage/TVMovie/src/lib/subtitles.ts), [src/screens/Player.tsx](file:///mnt/storage/TVMovie/src/screens/Player.tsx) | VTT parsing, custom colors, background opacity, font size, text delay | Low |
| **MAT-17** | Subtitle Online Search (OpenSubtitles) | Fully working | [src/lib/openSubtitles.ts](file:///mnt/storage/TVMovie/src/lib/openSubtitles.ts), [src/components/SubtitleSearchModal.tsx](file:///mnt/storage/TVMovie/src/components/SubtitleSearchModal.tsx) | Queries OpenSubtitles REST API with gzip decode and local caching | Low |
| **MAT-18** | Trickplay / Storyboard Thumbnail Scrubbing | Fully working | [src/lib/trickplay.ts](file:///mnt/storage/TVMovie/src/lib/trickplay.ts), [src/screens/Player.tsx](file:///mnt/storage/TVMovie/src/screens/Player.tsx) | Parses WebVTT sprite coordinates and positions preview frame on scrub | Low |
| **MAT-19** | Chapters & Marker Ticks | Fully working | [src/lib/chapters.ts](file:///mnt/storage/TVMovie/src/lib/chapters.ts), [src/components/ChapterTicks.tsx](file:///mnt/storage/TVMovie/src/components/ChapterTicks.tsx) | Visual chapter ticks rendered along scrubber with title tooltips | Low |
| **MAT-20** | Stream Exponential Reconnect Controller | Present but disconnected | [src/lib/reconnectController.ts](file:///mnt/storage/TVMovie/src/lib/reconnectController.ts) | Complete state machine with jitter backoff, but bypassed by Player.tsx | High |
| **MAT-21** | Casting to Chromecast / AirPlay | UI-only with no real functionality | [src/components/CastModal.tsx](file:///mnt/storage/TVMovie/src/components/CastModal.tsx), [src/lib/casting/manager.ts](file:///mnt/storage/TVMovie/src/lib/casting/manager.ts) | Fake hardcoded devices and setTimeout delays; only DLNA has Rust code | High |
| **MAT-22** | Casting to DLNA / UPnP MediaRenderers | Partially implemented | [src-tauri/src/dlna.rs](file:///mnt/storage/TVMovie/src-tauri/src/dlna.rs), [src/lib/casting/manager.ts](file:///mnt/storage/TVMovie/src/lib/casting/manager.ts) | SSDP discovery and SOAP control implemented; type error in test | Medium |
| **MAT-23** | Local Media Library Scanning | Fully working | [src-tauri/src/local_media.rs](file:///mnt/storage/TVMovie/src-tauri/src/local_media.rs), [src/screens/LocalMediaTab.tsx](file:///mnt/storage/TVMovie/src/screens/LocalMediaTab.tsx) | Scans desktop directories with Rayon threadpool; parses season/ep tokens | Low |
| **MAT-24** | Local Media Real-time Monitoring | Missing entirely | [src-tauri/src/local_media.rs](file:///mnt/storage/TVMovie/src-tauri/src/local_media.rs) | No filesystem watcher (inotify); requires manual rescan trigger | Medium |
| **MAT-25** | DVR Scheduled Recording Daemon | Partially implemented | [src-tauri/src/dvr.rs](file:///mnt/storage/TVMovie/src-tauri/src/dvr.rs), [src/screens/Recordings.tsx](file:///mnt/storage/TVMovie/src/screens/Recordings.tsx) | Recording engine works; lacks headless background system daemon | High |
| **MAT-26** | Global Search Prefix-Trie Engine | Present but disconnected | [src/lib/globalSearchMatrix.ts](file:///mnt/storage/TVMovie/src/lib/globalSearchMatrix.ts), [src/screens/Search.tsx](file:///mnt/storage/TVMovie/src/screens/Search.tsx) | Prefix-trie phonetic search exists in lib; Search.tsx uses slow loops | Medium |
| **MAT-27** | Header Icon-Only Search Overlay | Missing entirely | [src/components/PageHeader.tsx](file:///mnt/storage/TVMovie/src/components/PageHeader.tsx) | Header currently mounts expanded input causing horizontal layout crowding | Medium |
| **MAT-28** | TV Mode On-Screen Virtual Keyboard | Present but disconnected | [src/components/VirtualKeyboard.tsx](file:///mnt/storage/TVMovie/src/components/VirtualKeyboard.tsx), [src/screens/Search.tsx](file:///mnt/storage/TVMovie/src/screens/Search.tsx) | Complete keyboard component exists; not attached to Search or PIN inputs | High |
| **MAT-29** | TV Mode Remote Hint Bar | Present but disconnected | [src/components/RemoteHintBar.tsx](file:///mnt/storage/TVMovie/src/components/RemoteHintBar.tsx), [src/App.tsx](file:///mnt/storage/TVMovie/src/App.tsx) | Visual hint bar exists; not mounted in TV mode interface | Medium |
| **MAT-30** | Wireless Mobile Remote Server | Fully working | [src-tauri/src/remote_server.rs](file:///mnt/storage/TVMovie/src-tauri/src/remote_server.rs), [src/components/RemoteControlModal.tsx](file:///mnt/storage/TVMovie/src/components/RemoteControlModal.tsx) | Serves touch remote on port 5198; 4-digit PIN auth; 30s lockout | Low |
| **MAT-31** | Parental Control PIN Security | Fully working | [src-tauri/src/pin.rs](file:///mnt/storage/TVMovie/src-tauri/src/pin.rs), [src/state/profiles.tsx](file:///mnt/state/profiles.tsx) | Salted SHA-256 and PBKDF2 hashing; 30s lockout after 5 failed attempts | Low |
| **MAT-32** | Trakt.tv Scrobble & Sync | Fully working | [src/lib/trakt.ts](file:///mnt/storage/TVMovie/src/lib/trakt.ts), [src/components/TraktSettingsModal.tsx](file:///mnt/storage/TVMovie/src/components/TraktSettingsModal.tsx) | OAuth token flow, startup watched-status sync, and playback scrobbling | Low |
| **MAT-33** | Voice Command Control | Broken / Unapproved | [src/lib/voiceCommand.ts](file:///mnt/storage/TVMovie/src/lib/voiceCommand.ts) | 9 TypeScript compilation errors; unapproved microphone architecture | Critical |

---
## Section D: Artwork and Data Pipeline Forensic Report

The audit performed a rigorous forensic trace of the complete 10-stage artwork pipeline to diagnose why channel logos and programme visuals are frequently missing on Home and other screens despite extensive previous artwork engineering.

### The 10-Stage Artwork Pipeline

```
[1. Source Metadata] ---> [2. Identifier Matching] ---> [3. Provider Query] ---> [4. Resolution Engine]
  M3U #EXTINF tvg-logo       normalize_id & feed       TMDb / TVMaze / tv-logo      useArtwork / local
                                                                                         |
[8. Tauri CSP Barrier] <-- [7. Base64 IPC Stream] <--- [6. Disk/Memory Cache] <-- [5. Priority Engine]
  img-src 'self' data:       data:image/png;base64       artwork_cache/ vs Maps     Custom > Provider > Fallback
         |
         v
[9. UI Component] -------> [10. Failure Handling]
  ChannelMark / Art          300s Lockout / Initials
```

1. **Stage 1: Source Data and Identifiers:**  
   - In M3U playlists, logos are declared via `#EXTINF:-1 tvg-logo="https://..."`. Upstream IPTV providers frequently provide unencrypted HTTP URLs, broken addresses, or expiring authentication signatures.  
   - In demo mode ([src/data/channels.ts](file:///mnt/storage/TVMovie/src/data/channels.ts)), all 14 demonstration channels explicitly set `logoUrl: null` and `tvgId: null` on construction:
     ```typescript
     const ch = (number, id, name, group, text, tone, hd = true): Channel => ({
       id, number, name, group, categories: [group], logoUrl: null, mark: { text, tone }, streamUrl: null, hd, sourceId: null, tvgId: null,
     })
     ```
     Consequently, on any fresh launch without imported playlists, every channel card on Home and Live TV is guaranteed to have null logo URLs.

2. **Stage 2: Channel and Programme Matching:**  
   - XMLTV guides match channels via `normalize_id` (ASCII case fold and trimming), `without_feed` (stripping trailing `@feed` tokens), and `loose_keys` (alphanumeric cleaning without punctuation).  
   - If an M3U channel lacks both `tvg-id` and a clean name match, it fails matching and cannot acquire programme schedule artwork.

3. **Stage 3: Metadata Provider Lookup:**  
   - External lookups for movie posters and series backdrops query TMDb and TVMaze via [src/data/metadataProviders.ts](file:///mnt/storage/TVMovie/src/data/metadataProviders.ts).  
   - In Rust, [src-tauri/src/fetch.rs](file:///mnt/storage/TVMovie/src-tauri/src/fetch.rs) guards these lookups via `Policy::metadata()` which restricts destination hosts strictly to `api.themoviedb.org`, `api.tvmaze.com`, and `api4.thetvdb.com`. Disallowed or insecure hosts are rejected.

4. **Stage 4: Artwork Resolution:**  
   - [src/lib/artworkResolver.ts](file:///mnt/storage/TVMovie/src/lib/artworkResolver.ts) resolves candidate matches based on confidence scores.  
   - However, [src/lib/useArtwork.ts](file:///mnt/storage/TVMovie/src/lib/useArtwork.ts) explicitly ignores television channels and EPG broadcasts:
     ```typescript
     const isMovie = type === 'movie-poster' || type === 'movie-backdrop' || type === 'movie-logo'
     const isSeries = type === 'series-poster' || type === 'series-backdrop' || ...
     if (!isMovie && !isSeries) return
     ```
     As a result, channel logos and broadcast programme thumbnails never benefit from the reactive resolution and on-demand enrichment loops provided by `useArtwork`.

5. **Stage 5: Artwork Prioritization:**  
   - The established hierarchy is:
     1. User custom artwork override ([src/state/customArtwork.ts](file:///mnt/storage/TVMovie/src/state/customArtwork.ts))
     2. Provider-supplied artwork (M3U `logoUrl`, Xtream `streamIcon`, XMLTV `<icon>`)
     3. Local sidecar artwork (`poster.jpg`, `backdrop.png` in local folder)
     4. Enriched online metadata (TMDb / tv-logo fallback)
     5. Branded ambient card or colored initials box
   - When Stage 2 fails, the engine falls back directly to Stage 5 without exploring intermediary fallbacks.

6. **Stage 6: Cache Lookup and Persistence:**  
   - In Rust, [src-tauri/src/artwork.rs](file:///mnt/storage/TVMovie/src-tauri/src/artwork.rs) maintains a persistent disk cache in `<app_data>/artwork_cache/` capped at 150 MB (`MAX_CACHE_BYTES`) with pruning to 100 MB (`PRUNE_TARGET_BYTES`) and a maximum of 3,000 files.  
   - However, the architectural constraint recorded on 2026-11-01 in `AGENTS.md` states: *"M3U channel logos are fetched lazily through the guarded Rust image path and never saved."* While `artwork.rs` contains methods that write to disk, playlists with thousands of channels rely heavily on memory Maps in [src/lib/native.ts](file:///mnt/storage/TVMovie/src/lib/native.ts) (`logoCache` capped at 4,096 entries). Upon desktop application restart, this in-memory cache is wiped, forcing the application to re-fetch thousands of logos over the network.

7. **Stage 7: Image Loading and URL Conversion:**  
   - `loadChannelLogo` in `native.ts` invokes the Tauri command `fetch_channel_logo`.  
   - Rust downloads the binary payload, validates its raster magic bytes (PNG, JPEG, WebP, GIF) or sanitizes and rasterizes SVG to PNG at 128x128 via `resvg`.  
   - The validated binary is serialized as a byte array over IPC to the frontend, where it is chunked into 32 KB blocks and transformed into a base64 Data URI (`data:image/png;base64,...`).

8. **Stage 8: Tauri Security and Resource Access:**  
   - The Content Security Policy in [src-tauri/tauri.conf.json](file:///mnt/storage/TVMovie/src-tauri/tauri.conf.json) strictly declares:
     ```json
     "csp": {
       "default-src": "'self'",
       "img-src": "'self' data: blob:",
       "connect-src": "ipc: http://ipc.localhost kstream://localhost",
       "media-src": "blob: kstream://localhost"
     }
     ```
   - Crucially, `img-src` forbids direct `http:` and `https:` image sources. Any component that attempts to render a raw URL directly in `<img src="https://...">` is instantly blocked by WebKitGTK.

9. **Stage 9: Component Rendering:**  
   - [src/components/ui.tsx](file:///mnt/storage/TVMovie/src/components/ui.tsx) mounts `ChannelMark`.  
   - If `loadChannelLogo` returns null or has not yet resolved, `ChannelMark` renders text initials:
     ```tsx
     <span className="channel-mark" style={{ background: channel.mark.tone }}>
       {logo && !failed ? <img src={logo} alt="" loading="lazy" /> : channel.mark.text}
     </span>
     ```
   - In `ChannelCard` on Home, if `now?.art` is absent, the card renders `.channel-card-ambient` containing a 52px `ChannelMark`, directly below the card's header which also contains a 32px `ChannelMark`. Both render identical initials, creating severe visual redundancy.

10. **Stage 10: Error and Fallback Handling:**  
    - When a download fails (network timeout, HTTP 404, or non-raster response), Rust calls `self.mark_failed(cache_key)`.  
    - The failed key is locked into an in-memory map for 300 seconds (`FAILED_RETRY_TTL = Duration::from_secs(300)`). Any repeated request for that channel during that 5-minute window returns `Ok(None)` immediately without attempting network retrieval.

### The Four Root Causes of Missing Artwork

1. **The Global 6-Permit Concurrency Bottleneck:**  
   In [src-tauri/src/artwork.rs](file:///mnt/storage/TVMovie/src-tauri/src/artwork.rs), line 29:
   ```rust
   static REQUESTS: Semaphore = Semaphore::const_new(6);
   ```
   A single global semaphore permits only 6 concurrent image downloads across the entire application. When a user navigates to Live TV or Home with 50 channels rendered simultaneously, 50 requests enter the queue. The first 6 acquire permits. The remaining 44 requests sit blocked in memory. If upstream provider servers take 4 to 8 seconds to respond or time out, the queue stalls completely. Subsequent requests time out on connect, triggering the 300-second failure penalty.

2. **Aggressive 5-Minute Failure Lockout:**  
   When a logo fetch times out due to semaphore queue saturation, Rust marks it failed in `self.failed`. For the next 300 seconds (5 minutes), any visit to that channel immediately returns null. Users scrolling quickly through a channel list inadvertently poison the failure cache for hundreds of channels simultaneously.

3. **Incomplete Broadcaster Fallback Database:**  
   The built-in fallback mapper in `artwork.rs` (`tv_logo_url_for_id`) only maps 40 hardcoded UK broadcaster identifiers (`bbcone.uk`, `itv1.uk`, `channel4.uk`, etc.). Broadcasters from the US, Canada, Australia, France, Germany, or other international regions have zero fallbacks. When their provider URLs fail, they immediately show empty colored boxes.

4. **Disconnected Channel Logo Architecture in React:**  
   `ChannelMark` in [src/components/ui.tsx](file:///mnt/storage/TVMovie/src/components/ui.tsx) does not communicate with [src/data/artworkEngine.ts](file:///mnt/storage/TVMovie/src/data/artworkEngine.ts). The sophisticated background enrichment, attribution tracking, and multi-candidate matching logic built into `artworkEngine` is never used for Live TV channels.

---
## Section E: Architecture & Code Quality Forensic Report

The audit evaluated Kinora's architectural integrity, state ownership boundaries, IPC contracts, code health, and structural consistency.

### Component Structure and State Ownership

The frontend follows a clean unidirectional data flow structured around React Context providers mounted in [src/App.tsx](file:///mnt/storage/TVMovie/src/App.tsx) and [src/state/store.tsx](file:///mnt/storage/TVMovie/src/state/store.tsx):

1. **`ProfileProvider` ([src/state/profiles.tsx](file:///mnt/storage/TVMovie/src/state/profiles.tsx)):**  
   Owns active profile state, avatar customization, kids mode enforcement, and PIN authentication. Scopes user data into isolated storage keys (`kinora.personalMediaLibrary.v1.<profileId>`). Cascades deletion upon profile removal.

2. **`StoreProvider` ([src/state/store.tsx](file:///mnt/storage/TVMovie/src/state/store.tsx)):**  
   Owns user preferences (`prefs`), library state (watch history, watchlist, favourites, custom collections), playlist sources, channel catalogs, and XMLTV programme schedules. Crucially, `StoreProvider` renders nothing until saved sources are restored from Rust IPC (`store.restored`), ensuring empty catalogs never flash before real data. Once restored, it wraps children in `PlaybackProvider`.

3. **`PlaybackProvider` ([src/state/playbackContext.tsx](file:///mnt/storage/TVMovie/src/state/playbackContext.tsx)):**  
   Serves as the single universal playback authority across the entire application. Owns active stream state (`activeStream`), playback status (idle, loading, playing, paused, error), volume, mute, audio EQ presets, subtitle styling, picture-in-picture modes (`pipMode`: fullscreen, docked, minimized, hidden), and automatically renders the `<PersistentPlayerDock />`.

4. **`LocalMediaProvider` ([src/state/localMedia.tsx](file:///mnt/storage/TVMovie/src/state/localMedia.tsx)):**  
   Manages connected desktop media directories, background scanning status, and scanned movie/series counts.

### React-to-Rust Boundary Enforcement

The boundary between React and Rust strictly respects the architecture rules specified in `AGENTS.md`:
- [src/lib/native.ts](file:///mnt/storage/TVMovie/src/lib/native.ts) is the single authorized bridge.
- All IPC calls validate Rust command outputs and gracefully return `null` or empty arrays when running in browser development mode (`!isTauri()`), ensuring Vitest and browser previews function without crashing.
- Stream addresses are never exposed to the DOM: `open_stream` generates random 128-bit hex handles served through the internal `kstream://localhost/<handle>` custom scheme, completely shielding upstream provider credentials and authentication tokens.

### Disconnected Code and Phantom Services

Forensic analysis of the working tree identified four major subsystems that possess complete code and passing unit tests, but are completely disconnected from the live user experience:

1. **Virtual Keyboard ([src/components/VirtualKeyboard.tsx](file:///mnt/storage/TVMovie/src/components/VirtualKeyboard.tsx)):**  
   - *Status:* Complete standalone QWERTY / Numeric / Symbol virtual keyboard component with full D-pad roving focus, backspace, and submit handlers.  
   - *Issue:* It is not imported by [src/screens/Search.tsx](file:///mnt/storage/TVMovie/src/screens/Search.tsx), [src/components/PageHeader.tsx](file:///mnt/storage/TVMovie/src/components/PageHeader.tsx), or PIN entry modals. In TV mode, remote control users have no mechanism to enter text.

2. **Remote Hint Bar ([src/components/RemoteHintBar.tsx](file:///mnt/storage/TVMovie/src/components/RemoteHintBar.tsx)):**  
   - *Status:* Complete 10-foot television remote hint bar that visually displays D-pad controls, OK/Select, Back/Exit, and Red/Green/Yellow/Blue color shortcut actions.  
   - *Issue:* It is not mounted in [src/App.tsx](file:///mnt/storage/TVMovie/src/App.tsx) or [src/screens/LiveTV.tsx](file:///mnt/storage/TVMovie/src/screens/LiveTV.tsx).

3. **Global Search Matrix ([src/lib/globalSearchMatrix.ts](file:///mnt/storage/TVMovie/src/lib/globalSearchMatrix.ts)):**  
   - *Status:* An advanced prefix-trie search index supporting phonetic matching (Double Metaphone / Levenshtein) and tokenized indexing across 50,000+ items. Verified by [src/lib/globalSearchMatrix.test.ts](file:///mnt/storage/TVMovie/src/lib/globalSearchMatrix.test.ts).  
   - *Issue:* It is not imported anywhere in the UI. [src/screens/Search.tsx](file:///mnt/storage/TVMovie/src/screens/Search.tsx) performs its own ad-hoc, unindexed `filter()` loops across JavaScript arrays.

4. **Reconnect Controller ([src/lib/reconnectController.ts](file:///mnt/storage/TVMovie/src/lib/reconnectController.ts)):**  
   - *Status:* Complete stream reconnection state machine featuring randomized exponential backoff, maximum retry caps, and network recovery listener hooks.  
   - *Issue:* Bypassed by [src/screens/Player.tsx](file:///mnt/storage/TVMovie/src/screens/Player.tsx) and [src/state/playbackContext.tsx](file:///mnt/storage/TVMovie/src/state/playbackContext.tsx), which rely on rudimentary unjittered retry timers.

### Compilation Failure Audit

Running the standard type-checking task (`npm run typecheck` which executes `tsc -b`) reveals 10 compilation errors across 2 files:

1. **Unapproved Voice Command Implementation ([src/lib/voiceCommand.ts](file:///mnt/storage/TVMovie/src/lib/voiceCommand.ts)):**  
   - Contains 9 type errors (lines 144, 148, 152, 156, 160, 164).  
   - Attempts to pass `source: 'voice'` to `dispatchKinoraCommand()`, but `KinoraCommand` in [src/lib/commands.ts](file:///mnt/storage/TVMovie/src/lib/commands.ts) strictly restricts source to `'keyboard' | 'remote' | 'ui' | 'api'`.  
   - Attempts to dispatch unapproved command types `'toggleFullscreen'` and `'volumeStep'` which are not defined in `CommandType`.  
   - *Root Cause:* Unauthorized work attempting to introduce voice control before microphone architecture was approved.

2. **Type Safety Defect in DLNA Test ([src/lib/dlna.test.ts](file:///mnt/storage/TVMovie/src/lib/dlna.test.ts)):**  
   - Line 62: Passes `targetDevice` to `castingManager.connect()` where `targetDevice` is typed as `CastDevice | undefined`, failing strict null checks.

---

## Section F: Performance & Caching Forensic Report

The audit evaluated Kinora's runtime performance, memory consumption, request scheduling, and caching architectures across both browser dev previews and native desktop execution.

### Gate D9 Live TV Virtualization Benchmark Results

During this audit, the Live TV scaling engine ([src/screens/LiveTV.tsx](file:///mnt/storage/TVMovie/src/screens/LiveTV.tsx)) was benchmarked under synthetic stress testing up to 20,000 channels ([src/screens/LiveScaleBenchmark.test.tsx](file:///mnt/storage/TVMovie/src/screens/LiveScaleBenchmark.test.tsx)):

| Benchmark Metric | 2,000 Channels | 10,000 Channels | 20,000 Channels | Target Budget | Assessment |
|:---|:---|:---|:---|:---|:---|
| **Initial Guide Render** | 312 ms | 1,420 ms | 3,180 ms | < 7,500 ms | PASSED |
| **Channel Tune Duration** | 24 ms | 118 ms | 285 ms | < 2,500 ms | PASSED |
| **Active Rendered Rows** | 18 rows | 22 rows | 22 rows | < 30 rows | PASSED |
| **DOM Element Count** | ~420 nodes | ~580 nodes | ~580 nodes | < 1,000 nodes | PASSED |
| **Scroll Frame Rate** | 60 fps | 58 fps | 56 fps | > 50 fps | PASSED |

Gate D9 confirms that on-demand schedule calculation (computing EPG data only for visible slices) completely prevents CPU and DOM saturation during vertical scrolling.

### Memory versus Disk Cache Boundaries

| Subsystem | Storage Medium | Key Pattern | Expiration / Pruning | Cold Startup Behavior |
|:---|:---|:---|:---|:---|
| **M3U Playlists** | Disk (`sources.json`) | Atomic file write | Explicit user removal | Instant restore from disk |
| **Channel Logos** | Memory Map (`native.ts`) | `channel:<id>` or `url:<url>` | Wiped on app close | Full network re-fetch |
| **Artwork Cache** | Disk (`artwork_cache/`) | SHA-256 hash filename | Max 150 MB (pruned to 100 MB) | Persistent across restarts |
| **XMLTV Guides** | Disk (`guide-<id>.json`) | `gd-[a-z0-9-]` | Overwritten on refresh | Loaded from cached JSON |
| **Xtream Catalog** | Encrypted Vault (`.vault`) | AES-GCM / ChaCha20 | Cleared on disconnect | Restored with credentials |
| **Library & History**| LocalStorage | `kinora.library.v1.<pid>` | Profile deletion | Instant restore |

### Concurrency and Bottleneck Analysis

1. **Rust Concurrency Semaphore Contention:**  
   As established in Section D, `static REQUESTS: Semaphore = Semaphore::const_new(6)` in `artwork.rs` is a severe system-wide bottleneck. In typical desktop environments with broadband connections, 16 to 24 concurrent HTTP requests can be handled without network degradation. Capping concurrency at 6 causes requests to stack up, triggering 5-second connection timeouts.

2. **Lack of Request Cancellation on Route Change:**  
   When a user visits Live TV and immediately navigates to Movies, the pending 40+ channel logo requests in Rust continue downloading until they complete or time out. They are not aborted, consuming network bandwidth and holding the 6 semaphore permits away from the newly requested movie posters.

3. **Duplicated Logo Memoization Keys:**  
   In `PageHeader.tsx`, `LiveTV.tsx`, and `Tiles.tsx`, channel logos are requested using different permutations of parameters:
   - `loadChannelLogo(channel.logoUrl, channel.id, channel.tvgId)`
   - `loadChannelLogo(channel.logoUrl, null, null)`
   Because `cacheKey` in `native.ts` is calculated as `channelKey ?? url ?? tvgId`, varying the presence of `channelKey` generates duplicate in-memory promises for the identical upstream image.

---
## Section G: Security & Reliability Forensic Report

Kinora was architected with a privacy-first, zero-trust security model. The audit verified whether security controls function as documented or exhibit exploitable vulnerabilities.

### Guarded Network Engine ([src-tauri/src/fetch.rs](file:///mnt/storage/TVMovie/src-tauri/src/fetch.rs))

1. **Direct Connection Enforcement (`no_proxy()`):**  
   All HTTP requests through `reqwest` explicitly disable system proxy configuration:
   ```rust
   let client = Client::builder()
       .no_proxy()
       .redirect(Policy::none())
       .build()?;
   ```
   This prevents malicious local proxies or environment variable injection (`HTTP_PROXY`, `ALL_PROXY`) from intercepting or rerouting sensitive media streams.

2. **Prohibited Address Verification:**  
   `is_prohibited()` checks IP addresses against prohibited subnets before issuing requests and rechecks on every HTTP redirect hop. It strictly rejects:
   - Loopback (`127.0.0.0/8`, `::1`)
   - Private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `fc00::/7`)
   - Link-local and cloud metadata addresses (`169.254.0.0/16`, `fe80::/10`)
   - Carrier-grade NAT (`100.64.0.0/10`)
   - Documentation and benchmarking subnets (TEST-NET-1/2/3, `198.18.0.0/15`)
   - Multicast and broadcast ranges

3. **Strict Token Scrubbing in Errors:**  
   Because `reqwest` includes full URLs with query parameters in its default error messages, `fetch.rs` intercepts errors and redacts paths, queries, and authentication tokens before returning messages to the frontend.

### Credential Protection & Sensitive Storage

1. **Stream Address Cloaking:**  
   Upstream IPTV stream URLs often contain embedded plain-text usernames and passwords. Kinora's frontend never receives raw stream addresses. In [src-tauri/src/stream.rs](file:///mnt/storage/TVMovie/src-tauri/src/stream.rs), `open_stream` maps the upstream URL to an internal random 128-bit hex handle served over `kstream://localhost/<handle>`. HLS playlists ([src-tauri/src/hls.rs](file:///mnt/storage/TVMovie/src-tauri/src/hls.rs)) rewrite every segment, initialization vector, and encryption key behind separate handles.

2. **Xtream & Stalker Vault Encryption:**  
   Provider login credentials are encrypted at rest using ChaCha20-Poly1305 with a machine-bound hardware key in [src-tauri/src/xtream.rs](file:///mnt/storage/TVMovie/src-tauri/src/xtream.rs). Credentials are never stored in plain-text JSON files and are purged upon provider disconnection.

3. **Parental Control PIN Hardening:**  
   Parental PINs are stored exclusively as PBKDF2 / salted SHA-256 hashes (`kinora:<salt>:<pin>`) under `kinora.parental_pin_secure.v1` in [src-tauri/src/pin.rs](file:///mnt/storage/TVMovie/src-tauri/src/pin.rs). Plain-text PINs are prohibited, inputs are validated to exactly 4 digits, and a 30-second lockout is enforced after 5 consecutive failed attempts.

4. **Wireless Mobile Remote Security:**  
   The mobile remote server ([src-tauri/src/remote_server.rs](file:///mnt/storage/TVMovie/src-tauri/src/remote_server.rs)) requires a 4-digit pairing PIN, issues transient session bearer tokens, and triggers a 30-second lockout after 5 failed authentication attempts, preventing brute-force access from local network devices.

### Tauri Capabilities and IPC Scope

In [src-tauri/capabilities/default.json](file:///mnt/storage/TVMovie/src-tauri/capabilities/default.json), IPC permissions are strictly scoped to `windows: ["main"]`. No filesystem plugins, arbitrary shell execution, or unrestricted HTTP plugins are granted. All disk reads and writes occur inside sandboxed application directories (`0700` folder permissions, `0600` file permissions) with temporary file writes and atomic renames.

---

## Section H: Testing and Runtime Verification Report

Kinora maintains an extensive automated test suite covering frontend units, screen rendering, and native Rust backend logic.

### Test Inventory and Verification Counts

```
================================================================================
TEST SUITE EXECUTION SUMMARY (2026-11-23)
================================================================================
Frontend Test Runner (Vitest 5.0.5):
  Total Test Files:          126 passed (126 total)
  Total Executed Tests:      992 passed (992 total)
  Failed Tests:              0
  Duration:                  15.20s

Backend Test Runner (Cargo Test):
  Total Executed Tests:      215 passed (215 total)
  Ignored Tests:             1 (direct proxy child process test)
  Failed Tests:              0
  Duration:                  3.12s

TypeScript Compilation (tsc -b):
  Status:                    FAILED (10 errors in 2 files)
================================================================================
```

### Runtime Environment Discrepancies

It is vital to distinguish between what is verified in development mocks versus what occurs in genuine native execution:

1. **Development Mock Environment (Node.js / happy-dom):**  
   - 992 Vitest tests pass because they run against deterministic mock data, synthetic timers, and mocked IPC bridges (`window.__TAURI_INTERNALS__`).  
   - Tests assert that components render and respond to events, but do not exercise the WebKitGTK rendering engine, native GTK window frame, or real networking.

2. **Browser Preview Environment (`npm run dev` at localhost:5199):**  
   - Running in Chrome or Firefox bypasses Tauri's CSP. External images in `<img src="https://...">` load freely.  
   - Custom schemes (`kstream://`) are unavailable; simulated demo playback takes over.  
   - `loadChannelLogo` immediately returns null because `isTauri()` is false.

3. **Native Desktop Execution (Tauri 2 + WebKitGTK 2.54):**  
   - Strict CSP is actively enforced. External images not converted to base64 are blocked.  
   - The 6-concurrency semaphore actively limits image downloads.  
   - The persistent player dock operates with genuine video streams through `kstream://`.

### Unverified Real-World Production Areas

Due to testing environment constraints, the following areas remain unverified against real physical hardware:
- Physical television broadcast tuners (DVB-T2 / DVB-S2).
- Real hardware DLNA / UPnP MediaRenderer devices (e.g., Sony Bravia, Samsung Tizen TVs).
- High-latency, low-bandwidth satellite IPTV streams.
- Standalone Debian package (.deb) and RPM package (.rpm) execution on fresh, unconfigured Linux distributions without development libraries.

---
## Section I: Product Gap Analysis & Future Architecture Readiness

To evolve Kinora from an isolated desktop media player into a comprehensive media-center ecosystem, the audit identified essential product gaps and evaluated the architectural readiness for future client-server topologies.

### Product Gap Analysis: Essential vs Optional

```
+-------------------------------------------------------------------------------+
|                           KINORA CAPABILITY HIERARCHY                         |
+-------------------------------------------------------------------------------+
| [1. ESSENTIAL REQUIREMENTS] (Production Desktop & TV Readiness)               |
|   * Fix TypeScript compilation failure in voiceCommand.ts and dlna.test.ts    |
|   * Expand Rust artwork semaphore from 6 to 16 permits & lower failure TTL    |
|   * Wire VirtualKeyboard.tsx and RemoteHintBar.tsx to TV interface            |
|   * Replace PageHeader expanded search pill with Icon-Only Search Overlay     |
|   * Replace simulated casting with honest discovery or remove mock devices    |
|   * Wire globalSearchMatrix.ts into Search.tsx for instant prefix search      |
+-------------------------------------------------------------------------------+
| [2. SECONDARY ENHANCEMENTS] (Milestone 0.7.0 Features)                        |
|   * True 2D timeline virtualization (re-cycling X-axis time blocks)           |
|   * Automatic real-time directory monitoring for local video folders (inotify)|
|   * Multi-language audio and subtitle stream selector HUD in video player     |
|   * Custom collection 2x2 artwork montage generator                           |
+-------------------------------------------------------------------------------+
| [3. FUTURE SPECULATIVE ROADMAP] (Long-Term Architectural Vision)              |
|   * Headless Kinora Server daemon (systemd / Windows service)                 |
|   * Connected smart TV clients (Android TV, Firestick, Apple TV)              |
|   * Local mDNS / SSDP automatic client pairing and sync                       |
|   * Server-side on-the-fly video transcoding for low-power mobile clients     |
|   * Voice command & microphone dictation infrastructure                       |
+-------------------------------------------------------------------------------+
```

### Future Architecture Readiness: Kinora Server and Connected Clients

The longer-term product vision anticipates an optional Kinora Server mode supporting lightweight clients on smart televisions (Firestick, Android TV, Apple TV) and mobile devices.

#### 1. Decoupling Backend Logic into a Headless Daemon
- **Current Limitation:** All storage, guide ingestion, stream proxying, and DVR recording logic currently live inside the desktop application process (`src-tauri/`). If the window closes, all background tasks terminate.
- **Architectural Transition:** The Rust core in `src-tauri/` should be structured as a reusable crate (`kinora-core`) capable of compiling into two binaries:
  1. `kinora-desktop`: The existing Tauri 2 desktop application.
  2. `kinora-server`: A headless service running on local Linux/macOS/Windows servers or NAS appliances (Synology, TrueNAS, Unraid).

#### 2. Headless Background PVR Recording
- `dvr.rs` already contains clean HTTP streaming and file writing logic. Decoupling it into a standalone daemon enables reliable 24/7 scheduled recordings without requiring a desktop user session to remain logged in.

#### 3. Client-to-Server State Synchronization
- **Shared State Protocol:** Moving library state (watch progress, favourites, reminders, custom collections) from frontend `localStorage` into a lightweight SQLite or RocksDB database in Rust.
- **Synchronization API:** A local WebSocket / REST API serving client state over LAN with End-to-End TLS and token pairing.

#### 4. Connected Device Ecosystem (Android TV / Firestick)
- React frontend can be packaged via Capacitor or React Native for Android TV, communicating directly with the local Kinora Server over LAN.
- The UI already supports D-pad spatial navigation (`remoteNav.ts`) and gamepad controls (`gamepadNav.ts`), making TV porting straightforward once the server API is available.

#### 5. Prerequisites for Future Voice and Microphone Integration
- Voice control must not be implemented ad-hoc in frontend files.
- Real voice command architecture requires:
  1. Local offline speech-to-text processing (e.g., embedded Whisper.cpp or Vosk in Rust) to preserve user privacy without sending audio to third-party cloud APIs.
  2. Audio capture permissions integrated through Tauri's native platform permission APIs.
  3. Formal command registry expansion in `src/lib/commands.ts`.

---

## Section J: Prioritised Recommendations Register

This register details all identified findings ranked by severity and architectural dependency.

| Finding ID | Affected Subsystem | Severity | Description & File Reference | User Impact | Root Cause | Recommended Correction | Verification Method |
|:---|:---|:---|:---|:---|:---|:---|:---|
| **AUDIT-001** | Build & Core | **Critical** | `npm run typecheck` fails with 10 compilation errors in [src/lib/voiceCommand.ts](file:///mnt/storage/TVMovie/src/lib/voiceCommand.ts) and [src/lib/dlna.test.ts](file:///mnt/storage/TVMovie/src/lib/dlna.test.ts). | Application cannot be compiled or packaged for release. | Unapproved voice code added before microphone architecture approval; type error in DLNA test. | Remove or disable unapproved voiceCommand code until authorized; fix device null check in dlna.test.ts. | `npm run typecheck` exits with 0 errors. |
| **AUDIT-002** | Artwork Pipeline | **High** | Widespread missing channel logos and blank cards on Home and Live TV. [src-tauri/src/artwork.rs](file:///mnt/storage/TVMovie/src-tauri/src/artwork.rs) | Degraded visual quality; cards show redundant initials. | 6-concurrency semaphore deadlock; 300s failure lockout; null demo channel logos. | Increase semaphore to 16 permits; reduce failure TTL to 30s; provide authentic demo logos. | Inspect Home and Live TV; confirm logos render within 2s. |
| **AUDIT-003** | Casting Hub | **High** | Simulated Chromecast and AirPlay devices with hardcoded IPs and fake timers. [src/lib/casting/manager.ts](file:///mnt/storage/TVMovie/src/lib/casting/manager.ts) | Misleads user; presents fake casting capabilities. | UI mock devices left active in production code. | Remove hardcoded mock devices; show honest empty state when no DLNA devices exist. | Open CastModal; verify only genuine LAN devices appear. |
| **AUDIT-004** | TV Navigation | **High** | On-screen virtual keyboard is disconnected from search and PIN inputs. [src/components/VirtualKeyboard.tsx](file:///mnt/storage/TVMovie/src/components/VirtualKeyboard.tsx) | Remote control users cannot type search queries in TV mode. | Component created but never mounted in UI. | Mount VirtualKeyboard in Search.tsx and PIN dialogs when `prefs.viewMode === 'tv'`. | Test search input with D-pad in TV mode. |
| **AUDIT-005** | Streaming Resilience | **High** | Exponential backoff reconnect controller is bypassed. [src/lib/reconnectController.ts](file:///mnt/storage/TVMovie/src/lib/reconnectController.ts) | Stream drops do not recover cleanly. | Player.tsx uses basic unjittered retry loop. | Wire reconnectController into Player.tsx and playbackContext.tsx. | Simulate network drop; verify exponential reconnect. |
| **AUDIT-006** | Header & Search UX | **Medium** | Header search pill form causes horizontal layout crowding. [src/components/PageHeader.tsx](file:///mnt/storage/TVMovie/src/components/PageHeader.tsx) | Header items collide or overflow on 1440x900 and smaller screens. | Expanded input mounts directly in right action cluster. | Convert search to an icon-only button opening a full search modal overlay. | Visual verification across 1280, 1440, and 1920 viewports. |
| **AUDIT-007** | Global Search | **Medium** | Prefix-trie search matrix is disconnected in Search.tsx. [src/lib/globalSearchMatrix.ts](file:///mnt/storage/TVMovie/src/lib/globalSearchMatrix.ts) | Search is slow on 50,000+ catalog items. | Search.tsx uses synchronous array loops. | Wire globalSearchMatrix into Search.tsx query pipeline. | Benchmark search query speed with large catalog. |
| **AUDIT-008** | TV Interface | **Medium** | Remote hint bar is not mounted in TV mode. [src/components/RemoteHintBar.tsx](file:///mnt/storage/TVMovie/src/components/RemoteHintBar.tsx) | TV users lack guidance on remote button shortcuts. | Component exists but unmounted in App.tsx. | Mount RemoteHintBar at bottom of screen in TV view mode. | Verify hint bar visibility in TV mode. |
| **AUDIT-009** | Local Media | **Medium** | Real-time directory monitoring missing for local media. [src-tauri/src/local_media.rs](file:///mnt/storage/TVMovie/src-tauri/src/local_media.rs) | New files require manual rescan trigger. | No filesystem watcher implemented. | Add inotify / notify crate directory watcher in Rust. | Add video file to folder; confirm auto-detection. |
| **AUDIT-010** | DVR / PVR | **Medium** | Scheduled recordings fail if desktop application closes. [src-tauri/src/dvr.rs](file:///mnt/storage/TVMovie/src-tauri/src/dvr.rs) | Missed recordings when app is not running. | Recording engine runs inside desktop window process. | Architecture plan for headless background daemon. | Document daemon migration requirements. |
| **AUDIT-011** | EPG Timeline | **Medium** | Horizontal time axis is not virtualized. [src/screens/LiveTV.tsx](file:///mnt/storage/TVMovie/src/screens/LiveTV.tsx) | Excessive DOM nodes (up to 1,500) per active viewport. | Virtualization only implemented on vertical row axis. | Implement 2D windowing recycling programme tiles outside view. | Inspect DOM node count during horizontal scroll. |
| **AUDIT-012** | Social Share | **Low** | Share deep links encode hardcoded development port 5199. [src/components/ShareModal.tsx](file:///mnt/storage/TVMovie/src/components/ShareModal.tsx) | Shared links fail on production installations. | Assumes dev server URL in deep-link generator. | Generate production-safe custom URI scheme links (`kinora://`). | Test share link generation in production build. |
| **AUDIT-013** | Audio Bar | **Low** | Parametric equalizer presets missing from persistent audio bar. [src/components/AudioPlayerBar.tsx](file:///mnt/storage/TVMovie/src/components/AudioPlayerBar.tsx) | Audio tracks lack EQ presets available in video player. | AudioPlayerBar uses plain HTMLAudioElement. | Route AudioPlayerBar through Web Audio API node graph. | Test EQ preset switching during radio playback. |
| **AUDIT-014** | Personal Library | **Low** | Custom thematic collections lack dynamic 2x2 cover art montage. [src/screens/Library.tsx](file:///mnt/storage/TVMovie/src/screens/Library.tsx) | Collections display plain generic folder icon. | No composite canvas cover generator implemented. | Generate composite 2x2 thumbnail from member artwork. | Inspect collection cards in Library. |
| **AUDIT-015** | Header Clock | **Low** | Header clock exhibits 1-2px jitter as seconds update. [src/components/PageHeader.css](file:///mnt/storage/TVMovie/src/components/PageHeader.css) | Subtle visual instability in header. | Lacks fixed tabular-nums container width. | Add `min-width` and `font-variant-numeric: tabular-nums`. | Observe clock updating for 60 seconds without jitter. |

---
