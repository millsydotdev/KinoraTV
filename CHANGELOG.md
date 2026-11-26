# Changelog

All notable changes to Kinora are maintained in `src/data/changelog.json` and rendered into this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-11-26 (Complete Media Platform, Central Server & Multi-Device Experience)

Kinora 0.6.0 expands the standalone desktop app into a complete multi-device media platform with an optional headless Kinora Server, a touch-optimised mobile web remote, a virtualised Live TV guide, a CSP-safe EPUB/PDF canvas reader, guarded Jellyfin/Emby/Plex transport, full native transactional encrypted backups, opt-in prerelease update discovery, and a structured in-app release history.

### New Features
- **Automatic Update Notifications, Signed Updater & Offline What's New:** Receive non-intrusive update notifications when a signed GitHub release is available, toggle background checks, switch between Stable and opt-in Pre-release channels, review release notes, verify Minisign signatures before installing, restart cleanly to apply, and browse full version history offline.

### UI Upgrades
- **Cinematic Home Stage & Full-Width Layouts:** Redesigned Home with a widescreen featured spotlight, Quick Jump navigation ribbon, curated rails, and a collapsible companion hub, while expanding Live TV, Movies, Search, and Settings to use the full viewport width.
- **10-Foot Television Mode, Gamepad & Remote Navigation:** Switch cleanly between Desktop and 10-foot TV layouts with D-pad spatial focus navigation, gamepad support, clear focus indicators, and 4K television scaling.

### Playback Improvements
- **Persistent Universal Player Dock & Sleep Timer HUD:** Keep live channels and videos playing in a compact dock while browsing other screens, with one-click expand to full screen, audio/subtitle controls, DASH format detection, and an on-screen sleep timer countdown.

### Live TV and EPG
- **High-Scale Virtualised Live TV Guide & Multi-Tier Matching:** Browse 10,000+ channels smoothly with 2D virtualised rows and time-windowing, improved multi-tier XMLTV channel matching, custom bouquets, catch-up playback, and DVR series recording rules.

### Movies and Series
- **Unified Movies, Series & Real-Time Local Media Libraries:** Browse movies and series across Xtream Codes providers, Jellyfin/Emby/Plex media servers, and local video folders with automatic folder change detection, smart collections, and cross-source deduplication.

### Audio and Podcasts
- **Guarded Podcast RSS Subscriptions & Episode Progress:** Subscribe directly to RSS and Atom podcast feeds through Kinora's guarded native fetcher, resume in-progress episodes, mark episodes played, and queue audio in the persistent audio bar.

### Books and Reading
- **Real EPUB, CSP-Safe PDF Canvas Reader & OPDS Browser:** Open local EPUB, PDF, Markdown, HTML, and plain text books directly inside Kinora with a PDF.js canvas viewer (page controls, zoom, and saved page progress), a table of contents, multiple bookmarks, customisable reading themes, and an OPDS catalogue browser.

### AI and Automation
- **Unified Capability Layer, AI Controls & Opt-In Push-to-Talk Voice:** Operate playback, channel tuning, EPG queries, search, and device checks through one capability-gated service shared by the UI, remote, authorised AI agents, and strictly opt-in push-to-talk voice input.

### Server and Devices
- **Standalone, Central Server & Client Operating Modes:** Run Kinora independently on one device, host an always-on headless Kinora Server (desktop, Linux systemd service, or Docker), or connect household clients with automatic LAN discovery and guarded stream proxying.

### Mobile Remote
- **Touch Mobile Web Remote with QR Pairing, EPG & Media Control:** Control Kinora from any phone or tablet on your local network using a 6-digit PIN or QR code, featuring a D-pad, interactive seek bar, mobile keyboard, live TV Guide browser, and one-tap media playback.

### Synchronisation
- **Conflict-Safe Cross-Device Watch Progress & Library Sync:** Synchronise favourites, watchlists, and Continue Watching progress across connected Kinora clients in real time over Server-Sent Events without letting stale offline devices overwrite newer progress.

### Artwork and Discovery
- **Dedicated Genre Artwork Collection & 5-Stage Artwork Pipeline:** Replaced generic geometric genre placeholders with dedicated cinematic genre artwork across parent genres and subgenres, backed by a 5-stage artwork resolver and custom artwork library.

### Security and Privacy
- **API Rate Limiting, Guarded Media Server & Feed Fetching, and Profile Isolation:** Added sliding-window API rate limiting on Kinora Server, routed Jellyfin/Emby/Plex and podcast/OPDS network requests through Rust's guarded no-redirect anti-SSRF fetcher, updated vulnerable Rust crates (cookie, url), isolated profile libraries, and hardened parental PIN hashing.

### Reliability Improvements
- **Full Encrypted Backup, Migration Wizard & Native Transactional Rollback:** Back up preferences, sources, guides, bouquets, DVR rules, podcasts, reading progress, and non-secret platform settings into an AES-256-GCM encrypted archive with SHA-256 verification and full rollback across frontend and native Rust stores if restoration fails.

### Bug Fixes
- **Cache Clearing, QR Encoding, Sidebar Contrast & Routing Fixes:** Fixed artwork cache clearing in Settings to invoke native storage cleanup, corrected QR code Reed-Solomon format bits for reliable phone scanning, elevated sidebar contrast, and unified BrowserRouter navigation across voice and remote commands.

### Developer and Infrastructure Improvements
- **Release Asset Verification, Staging Isolation & Headless Server Image:** Added automated release verification (latest.json schema, Minisign signatures, SHA256SUMS, SBOM, macOS arch asset collision prevention, and dry-run release workflow validation), isolated staging builds, a zero-GUI headless server Docker image, systemd unit, and changelog checks.

---

## [0.5.0] - 2026-11-15 (Public Desktop Release Candidate)

Established Kinora's public desktop release pipeline, signed Tauri 2 updater verification, multi-platform packaging matrices, and authentic cinematic card artwork.

### New Features
- **Signed Multi-Platform Updater & Release Automation:** Introduced Tauri 2 updater checks against signed GitHub release manifests across Linux (DEB, RPM, AppImage), Windows (NSIS, MSI), and macOS (Apple Silicon and Intel DMG).

### Artwork and Discovery
- **Home Recommendation Card Visual Parity:** Restored authentic reference artwork across the Recommended for You rail with consistent 220x185 tile framing.

### Security and Privacy
- **Kinora Proprietary Source-Available Licence & Attribution:** Published Kinora under an explicit All Rights Reserved source-available licence with creator attribution to millsydotdev in Settings > About and project documentation.
- **Guarded Update Manifests & Secret Hygiene:** Enforced HTTPS-only update manifest fetching with anti-SSRF destination checks and completed full working-tree secret verification.

---

## [0.1.0] - 2026-11-15 (Release Candidate Preparation)

Delivered multi-platform packaging, unified notifications, macOS hardened runtime support, and Windows atomic persistence fixes.

### UI Upgrades
- **Unified Notification Drawer & Toast Routing:** Connected ephemeral toast alerts with a persistent notification history drawer and unread badge counter.

### Security and Privacy
- **Salted Parental PIN & Memory-Only Stream Handles:** Protected parental controls with salted hashing and automatic lockout while keeping upstream stream credentials behind opaque local handles.

### Bug Fixes
- **Cross-Platform Atomic Storage & CSS Build Stability:** Fixed Windows directory sync handling during atomic saves and resolved CSS minification syntax issues in production builds.

### Developer and Infrastructure Improvements
- **Cross-Platform Installers & SHA-256 Checksum Pipeline:** Configured Linux, Windows, and macOS bundle targets with automated GitHub Actions release workflows and SHA-256 verification.

---

## [0.0.9] - 2026-11-01 (First-Run Onboarding & Honest Sample Mode)

Introduced a skippable first-run setup flow with country playlist selection and clear separation between real sources and optional sample data.

### New Features
- **Guided First-Run Setup & Sample Mode Separation:** Added step-by-step country playlist onboarding via iptv-org discovery and ensured demo content is opt-in only and clearly labelled.

---

## [0.0.8] - 2026-10-29 (Reliability, Timezone & Test Hardening)

Hardened guide schedule handling across daylight saving transitions and expanded automated Vitest and Rust test coverage.

### Reliability Improvements
- **Timezone-Safe Guide Scheduling & Expanded Test Suites:** Added clock-independent schedule calculations for 23-hour and 25-hour daylight saving days and expanded automated test coverage.

---

## [0.0.7] - 2026-10-29 (Public Playlist Discovery Catalogue)

Added Discovery browsing of the public iptv-org directory with explicit user confirmation before importing any playlist.

### Source Integrations
- **iptv-org Public Playlist Discovery:** Browse curated public country and category playlists and import chosen sources through Kinora's standard guarded M3U pipeline.

---

## [0.0.6] - 2026-10-28 (XMLTV Electronic Programme Guide)

Implemented a pure Rust XMLTV parser with entity-attack protection and channel matching for live TV schedules.

### Live TV and EPG
- **Guarded XMLTV Parser & Channel Matching:** Import XMLTV and gzipped XMLTV guides by URL or file with DTD expansion attack refusal and flexible channel matching.

---

## [0.0.5] - 2026-10-27 (Atomic Local Persistence)

Added atomic local storage for saved sources with strict POSIX permissions and non-destructive corrupt-file recovery.

### Reliability Improvements
- **Atomic Source Persistence & Recovery:** Saved sources use atomic temp-file renames with restricted permissions (0700/0600) and move damaged files aside without deletion.

---

## [0.0.4] - 2026-10-27 (Guarded Native HLS Playback)

Implemented the native kstream protocol and HLS playlist rewriter so upstream stream URLs never leak to the webview.

### Playback Improvements
- **Native Guarded HLS Rewriter & Playback:** Streams play through opaque local handles with bounded session budgets, cancellation on channel switch, and DRM refusal.

---

## [0.0.3] - 2026-10-25 (Live TV Playlist Integration)

Connected imported M3U playlist channels to the Live TV guide, category filters, and channel browsing screens.

### Live TV and EPG
- **M3U Channels in Live TV & Categories:** Imported M3U playlists populate Live TV channels, group chips, and channel search cleanly.

---

## [0.0.2] - 2026-10-25 (Rust M3U Parser & Anti-SSRF HTTP Client)

Added native Rust M3U parsing and a guarded HTTP client enforcing direct connections and private network refusal.

### Security and Privacy
- **Guarded Native M3U Ingestion:** Added bounded M3U parsing in Rust with no-proxy direct fetching, DNS/redirect SSRF checks, and credential-free errors.

---

## [0.0.1] - 2026-10-22 (Initial Desktop UI Baseline)

Initial React 19 and TypeScript desktop media interface prototype.

### New Features
- **Initial Kinora Desktop Interface:** Established the React 19 and TypeScript interface foundation for Live TV, movies, series, and library views.
