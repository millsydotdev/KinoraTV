# Kinora v0.6.0: Complete Media Platform, Central Server & Multi-Device Experience

**Release Date:** 2026-11-26  
**Channel:** stable

Kinora 0.6.0 expands the standalone desktop app into a complete multi-device media platform with an optional headless Kinora Server, a touch-optimised mobile web remote, a virtualised Live TV guide, real EPUB/PDF reading, encrypted migration backups, and a structured in-app release history.

## New Features

- **Structured What's New, Offline Version History & Hardened Updater:** Review categorised release notes after every update, browse full version history offline, select update channels, track verified download and installation stages, and check client/server version compatibility.
  Single version-controlled release database generates the in-app What's New view, CHANGELOG.md, and updater release notes consistently.

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

- **Real EPUB, PDF & Text Reader with OPDS Catalogue Browser:** Open local EPUB, PDF, Markdown, HTML, and plain text books directly inside Kinora with a table of contents, multiple bookmarks, customisable reading themes, saved reading progress, and a built-in OPDS catalogue browser.
  Browse Project Gutenberg, Standard Ebooks, Feedbooks, or custom OPDS feeds through Kinora's guarded fetcher.

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

- **API Rate Limiting, Guarded Feed Fetching & Profile Isolation:** Added sliding-window API rate limiting on Kinora Server, routed podcast and OPDS network requests through Rust's anti-SSRF fetcher, isolated profile libraries with cascading deletion, and hardened parental PIN hashing.
  Maintains strict Content Security Policy, direct no-proxy fetching, memory-only stream handles, and full token redaction in errors.

## Reliability Improvements

- **Full Encrypted Backup, Migration Wizard & Atomic Rollback:** Back up preferences, sources, guides, bouquets, DVR rules, podcasts, reading progress, and non-secret platform settings into an AES-256-GCM encrypted archive with SHA-256 verification and automatic rollback if restoration fails.
  Never exports plaintext provider passwords or pairing tokens; pre-flight inspection flags missing local paths and accounts requiring re-authentication.

## Bug Fixes

- **Cache Clearing, QR Encoding, Sidebar Contrast & Routing Fixes:** Fixed artwork cache clearing in Settings to invoke native storage cleanup, corrected QR code Reed-Solomon format bits for reliable phone scanning, elevated sidebar contrast, and unified BrowserRouter navigation across voice and remote commands.

## Engineering and Infrastructure Notes

- **Staging Isolation, Headless Server Docker Target & Automated Changelog Pipeline:** Added isolated staging build configuration, a zero-GUI headless server Docker image, systemd service unit, automated changelog validation, and end-to-end multi-device verification scripts.
