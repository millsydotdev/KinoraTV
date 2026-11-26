# Kinora 0.6.0: Next-Stage Architectural Baseline and Roadmap

**Document Date:** 2026-11-22  
**Current Release Version:** 0.6.0  
**Baseline Status:** Approved and Locked  
**Scope:** Definition of completed capabilities, unfinished work, backlog priorities, dependencies, and architectural constraints.

---

## 1. What Is Genuinely Complete in Kinora 0.6.0

The 0.6.0 release represents a comprehensive elevation of Kinora into a production-grade, privacy-first desktop media center. The following features and systems are fully implemented, tested, and verified:

1. **Cinematic Home Screen Redesign:**
   - Asymmetrical 16:9 featured hero spotlight with dynamic text scrims, metadata chips, synopsis clamping, and primary action CTAs.
   - Quick Jump category navigation ribbon (`.home-quick-jump`) for rapid section access across Movies, Series, Live TV, Radio, and Library.
   - Curated horizontal content carousels (`.content-rail`): Continue Watching (16:9 with red progress bars), Live TV Right Now (with on-air badges and time indicators), Movies (2:3 posters), Series & TV Shows (2:3 posters), Recommended for You, Because You Watched, Cultural Film Vault & Archives, and Live Radio & Spoken Audio.
   - Collapsible companion side drawer (`.home-side-hub`) providing channel previews, catalog volume metrics, and indexed disk usage without obstructing main flow.
   - 10-foot television mode with D-pad spatial navigation (`data-nav="home-card"`), remote focus styling, and 4K UHD scaling (`@media (min-width: 3000px)`).

2. **Feed Identity and Deduplication Engine:**
   - 4-tier content identity hierarchy in [src/lib/homeFeed.ts](file:///mnt/storage/TVMovie/src/lib/homeFeed.ts): Canonical ID -> Provider/source ID -> Content type & meaningful metadata (edition, remaster, season/episode, director) -> Normalised title/year fallback.
   - Prevents duplicate cards across rails while preserving distinct editions (Director's Cut, Final Cut, Redux), remasters, and same-year variants.

3. **Universal Playback and Persistent Player Dock:**
   - Persistent picture-in-picture player dock (`PersistentPlayerDock.tsx`) that docks to the bottom-right corner when navigating away from full-screen watch routes, maintaining stream playback across views.
   - Interactive play/pause, expand to full screen, and close controls with responsive video scaling.
   - Clear architectural distinction between simulated demo playback (internal reference timer) and genuine source streaming (`kstream://localhost`).

4. **Multi-Source Management and Resilient Streaming:**
   - M3U and Xtream Codes multi-server failover (`xtreamFallback.ts`) with automatic retry and server health monitoring.
   - M3U catchup and timeshift URL interpolation (`m3uCatchup.ts`) supporting shift, append, and Flussonic formats.
   - Bouquet management modal (`BouquetManagerModal.tsx`) for organizing channels into custom packages.
   - Smart collections (`smartCollections.ts`) for user-defined dynamic grouping.

5. **Security and Profile Data Isolation:**
   - Scoped profile storage keys (`kinora.personalMediaLibrary.v1.<profileId>`) with cascading profile deletion.
   - Salted SHA-256 and PBKDF2 parental control PIN hashing with 30-second lockout after 5 consecutive failures.
   - Guarded Rust HTTP client (`fetch.rs`): Direct connection enforcement (`no_proxy()`), IP-literal validation, private/loopback destination refusal, size/time limits, and strict token redaction.
   - Strict Tauri CSP (`connect-src kstream://localhost`, `media-src blob:`, `object-src 'none'`).

---

## 2. What Remains Unfinished or Deferred

The following capabilities are deliberately deferred from 0.6.0 and must not be considered complete:

1. **EPG Guide Virtualization (Gate D9):**
   - The current Live TV guide renders a paged set of channels (`GUIDE_PAGE` rows). While performant for up to 2,000 channels, unbounded lists of 10,000+ channels require a true virtualized windowing table (row and column recycling) to guarantee 60fps scrolling under extreme catalog sizes.

2. **Automated Third-Party Metadata Scraping:**
   - Upstream M3U playlists and Xtream feeds provide variable metadata. Automated enrichment against TMDb and TVMaze is architected but deferred to 0.7.0 to ensure network security policies and user consent flows are properly gated.

3. **Background Headless PVR Recording Daemon:**
   - While DVR scheduling, rules, and local HTTP serving are fully operational in `dvr.rs`, recording requires the application window or local service process to remain active. A true system background daemon (systemd/Windows Service) is not yet implemented.

4. **Additional Catalogue Providers (beyond iptv-org):**
   - The Discovery screen currently queries only the approved iptv-org catalog. Integration with other public or community catalogs requires explicit owner approval.

5. **Alternative Media Playback Engines (libvlc / mpv):**
   - Kinora exclusively uses WebKitGTK MSE with hls.js through the guarded `kstream://` protocol. Direct native decoding via embedded libvlc or mpv remains unapproved.

---

## 3. Backlog Priorities for Version 0.7.0

When development resumes for the 0.7.0 milestone, priorities should be addressed in the following sequence:

1. **Priority 1: Gate D9 Virtualized Guide & Performance Scaling:**
   - Implement DOM virtualization for the Live TV timeline grid to handle 10,000+ channels without memory bloat or frame drops.
   - Benchmark against large real-world playlists (iptv-org complete index).

2. **Priority 2: TMDb / TVMaze Metadata Scraper:**
   - Add optional, opt-in metadata enrichment in Rust (`fetch.rs` with `Policy::metadata()`).
   - Fetch poster art, episode titles, cast lists, and parent guides while keeping user IP address shielded behind strict caching.

3. **Priority 3: Advanced Global Search Indexing:**
   - Optimize `globalSearchMatrix.ts` with prefix trie indexing and fuzzy phonetic matching (Double Metaphone / Levenshtein) for instantaneous search results across 50,000+ indexed titles.

4. **Priority 4: Unified Subtitle and Audio Track Selector:**
   - Consolidate multi-language subtitle tracks (embedded CEA-608/708, WebVTT, external SRT) and audio streams into an enhanced in-player overlay HUD.

5. **Priority 5 (Post-0.6.0 Programme): Kinora AI Agent Skills, Integrations and External Agent Control:**
   - Official downloadable Kinora Agent Skill compatible with Claude, OpenClaw, Codex, ChatGPT integrations, and custom agent frameworks (investigating each ecosystem's real skill/tool format).
   - Versioned Kinora Agent API, MCP server/tool integration, machine-readable tool definitions, and developer SDK exposing Kinora's real underlying capabilities (media discovery, playback, media management, device/app management) without duplicating application logic.
   - Dedicated **AI Agents and Integrations** management screen in Settings (per-agent identity, credential generation/rotation/revocation, least-privilege read vs control scopes, confirmation gates for sensitive actions, rate limiting, and full action audit history).
   - Skills and Extensions architecture with explicit trust, permissions, and isolation controls, plus deeper voice and external assistant workflows (strictly opt-in microphone controls).
   - Note: Formally deferred to the post-0.6.0 development stage and deliberately not implemented during the 0.6.0 release cycle.

---

## 4. Dependencies, Constraints, and Architectural Risks

| Domain | Constraint or Risk | Mitigation Strategy |
| :--- | :--- | :--- |
| **Strict CSP** | WebKitGTK strictly enforces CSP in `tauri.conf.json`. External scripts, `data:` fonts, or unsanctioned schemes fail closed. | Keep all fonts local (`.woff2`); keep all streams routed through `kstream://localhost`. |
| **Network Security** | `reqwest` leaks full URL paths and tokens in default error messages. | All network access must remain in `fetch.rs`. Never log or echo upstream stream URLs or tokens in error strings. |
| **Wry Protocol Buffering** | Custom URI scheme responses are buffered in memory by wry. | Maintain bounded buffer limits in `stream::Limits`. Enforce session byte budgets. |
| **Atomic Persistence** | Unclean desktop shutdowns can corrupt JSON files. | All disk writes in `sources.rs` must use temporary files followed by atomic renames (`0700` directory, `0600` file permissions). |
| **Profile Isolation** | Multiple users share the same desktop binary. | All personal media, watch history, and preferences must use scoped profile keys (`key.<profileId>`). |
| **Typography Standard** | Em-dashes are strictly prohibited across all code, documentation, and UI text. | Enforce CI pre-commit scans. Use hyphens (-), colons (:), or parentheses () only. |

---

## 5. What Must Not Be Rewritten

To maintain stability and architectural integrity, the following battle-tested components must not be refactored or rewritten without explicit owner sign-off:

1. **React and Rust Boundary Separation:**
   - React owns UI presentation, routing, theme, and client state. Rust owns networking, file storage, security checks, and stream proxying.
   - `src/lib/native.ts` is the single bridge. Never duplicate business logic in both layers.

2. **Guarded Network Engine (`src-tauri/src/fetch.rs`):**
   - The guarded HTTP resolver, IP literal checks, destination validation, and `no_proxy()` configuration are load-bearing security controls. Do not add proxy configuration or bypasses for LAN addresses.

3. **HLS Protocol Rewriter (`src-tauri/src/hls.rs` & `stream.rs`):**
   - Handles are 128-bit random hex identifiers that prevent upstream credentials from leaking to the frontend. Do not replace this with raw URL passing.

4. **Sources File Storage (`src-tauri/src/sources.rs`):**
   - The atomic write and migration logic in `sources.json` has undergone extensive reliability testing. Do not replace with an embedded SQLite database without an approved architectural migration plan.

5. **Shared Application Shell (`components/Sidebar.tsx` & `components/PageHeader.tsx`):**
   - The 240px desktop sidebar, responsive collapses, and header action clusters match the approved design mockup and must remain intact.
