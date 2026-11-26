# Kinora v0.6.0: Complete Media Platform, Central Server & Multi-Device Experience

**Release Date:** 2026-11-26  
**Channel:** stable

Kinora 0.6.0 expands the standalone desktop app into a complete multi-device media platform with an optional headless Kinora Server, a touch-optimised mobile web remote, a virtualised Live TV guide, a CSP-safe EPUB/PDF canvas reader, guarded Jellyfin/Emby/Plex transport, full native transactional encrypted backups, opt-in prerelease update discovery, and a structured in-app release history.

## New Features

- **Automatic Update Notifications, Signed Updater & Offline What's New:** Receive non-intrusive update notifications when a signed GitHub release is available, toggle background checks, switch between Stable and opt-in Pre-release channels, review release notes, verify Minisign signatures before installing, restart cleanly to apply, and browse full version history offline.
  Uses ETag-cached GitHub Releases discovery with rate-limit handling, blocks unsigned packages, keeps the installed version intact on failure, and generates What's New, CHANGELOG.md, and release notes from one version-controlled database.

## UI Upgrades

- **Cinematic Home Stage & Full-Width Layouts:** Redesigned Home with a widescreen featured spotlight, Quick Jump navigation ribbon, curated rails, and a collapsible companion hub, while expanding Live TV, Movies, Search, and Settings to use the full viewport width.
  Eliminated permanent side-column squeezing across Live TV, Movies, and Settings; programme details and Quick Look panels open cleanly as contextual slide-out drawers.
- **10-Foot Television Mode, Gamepad & Remote Navigation:** Switch cleanly between Desktop and 10-foot TV layouts with D-pad spatial focus navigation, gamepad support, clear focus indicators, and 4K television scaling.
  Press Ctrl+Shift+T (or Cmd+Shift+T) or change View Mode in Settings to toggle between Desktop and TV interfaces without losing your place.

## Playback Improvements

- **Persistent Universal Player Dock & Sleep Timer HUD:** Keep live channels and videos playing in a compact dock while browsing other screens, with one-click expand to full screen, audio/subtitle controls, DASH format detection, and an on-screen sleep timer countdown.
  Includes extended sleep timer presets (up to 120 minutes), automatic stream failure tracking with one-click retry, and honest codec diagnostics.

## Live TV and EPG

- **High-Scale Virtualised Live TV Guide & Multi-Tier Matching:** Browse 10,000+ channels smoothly with 2D virtualised rows and time-windowing, improved multi-tier XMLTV channel matching, custom bouquets, catch-up playback, and DVR series recording rules.
  Combines exact ID matching, feed-stripped keys, loose regional matching, and unambiguous display-name matching while refusing ambiguous duplicates.

## Movies and Series

- **Unified Movies, Series & Real-Time Local Media Libraries:** Browse movies and series across Xtream Codes providers, Jellyfin/Emby/Plex media servers, and local video folders with automatic folder change detection, smart collections, and cross-source deduplication.
  Preserves distinct cuts and remasters while merging duplicate entries across rails and tracking per-profile watch progress.

## Audio and Podcasts

- **Guarded Podcast RSS Subscriptions & Episode Progress:** Subscribe directly to RSS and Atom podcast feeds through Kinora's guarded native fetcher, resume in-progress episodes, mark episodes played, and queue audio in the persistent audio bar.
  Honest network error reporting replaces silent placeholder feeds when a remote RSS server is unreachable.

## Books and Reading

- **Real EPUB, CSP-Safe PDF Canvas Reader & OPDS Browser:** Open local EPUB, PDF, Markdown, HTML, and plain text books directly inside Kinora with a PDF.js canvas viewer (page controls, zoom, and saved page progress), a table of contents, multiple bookmarks, customisable reading themes, and an OPDS catalogue browser.
  Renders PDFs natively to canvas without weakening Kinora's strict Content Security Policy and validates %PDF- headers before rendering.

## AI and Automation

- **Unified Capability Layer, AI Controls & Opt-In Push-to-Talk Voice:** Operate playback, channel tuning, EPG queries, search, and device checks through one capability-gated service shared by the UI, remote, authorised AI agents, and strictly opt-in push-to-talk voice input.
  Microphone hardware stays off by default with zero always-on listening, optional spoken replies, and configurable local or external AI provider endpoints.

## Server and Devices

- **Standalone, Central Server & Client Operating Modes:** Run Kinora independently on one device, host an always-on headless Kinora Server (desktop, Linux systemd service, or Docker), or connect household clients with automatic LAN discovery and guarded stream proxying.
  Headless server binary compiles with zero GUI dependencies, serves local media with bounded HTTP Range streaming, and reports server/client version compatibility.

## Mobile Remote

- **Touch Mobile Web Remote with QR Pairing, EPG & Media Control:** Control Kinora from any phone or tablet on your local network using a 6-digit PIN or QR code, featuring a D-pad, interactive seek bar, mobile keyboard, live TV Guide browser, and one-tap media playback.
  Includes inline device renaming, instant device revocation, PIN rotation, and a per-device security audit log.

## Synchronisation

- **Conflict-Safe Cross-Device Watch Progress & Library Sync:** Synchronise favourites, watchlists, and Continue Watching progress across connected Kinora clients in real time over Server-Sent Events without letting stale offline devices overwrite newer progress.
  Uses timestamp-checked merges on both server and clients alongside CSP-safe native SSE bridging on desktop.

## Artwork and Discovery

- **Dedicated Genre Artwork Collection & 5-Stage Artwork Pipeline:** Replaced generic geometric genre placeholders with dedicated cinematic genre artwork across parent genres and subgenres, backed by a 5-stage artwork resolver and custom artwork library.
  Enforces aspect-ratio integrity for posters (2:3), backdrops (16:9), episodes (16:9), and channel logos with per-item custom artwork overrides.

## Security and Privacy

- **API Rate Limiting, Guarded Media Server & Feed Fetching, and Profile Isolation:** Added sliding-window API rate limiting on Kinora Server, routed Jellyfin/Emby/Plex and podcast/OPDS network requests through Rust's guarded no-redirect anti-SSRF fetcher, updated vulnerable Rust crates (cookie, url), isolated profile libraries, and hardened parental PIN hashing.
  Maintains strict Content Security Policy, direct no-proxy fetching, memory-only stream handles, and full token redaction in errors.

## Reliability Improvements

- **Full Encrypted Backup, Migration Wizard & Native Transactional Rollback:** Back up preferences, sources, guides, bouquets, DVR rules, podcasts, reading progress, and non-secret platform settings into an AES-256-GCM encrypted archive with SHA-256 verification and full rollback across frontend and native Rust stores if restoration fails.
  Never exports plaintext provider passwords or pairing tokens; rejects incompatible future backup schemas and flags missing local paths before restore.

## Bug Fixes

- **Cache Clearing, QR Encoding, Sidebar Contrast & Routing Fixes:** Fixed artwork cache clearing in Settings to invoke native storage cleanup, corrected QR code Reed-Solomon format bits for reliable phone scanning, elevated sidebar contrast, and unified BrowserRouter navigation across voice and remote commands.

## Engineering and Infrastructure Notes

- **Release Asset Verification, Staging Isolation & Headless Server Image:** Added automated release verification (latest.json schema, Minisign signatures, SHA256SUMS, SBOM, macOS arch asset collision prevention, and dry-run release workflow validation), isolated staging builds, a zero-GUI headless server Docker image, systemd unit, and changelog checks.
