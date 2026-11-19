# Changelog

All notable changes to Kinora will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-11-19 (Desktop Expansion and Layout Overhaul)

### Added
- **Staging Environment Isolation:** Created dedicated staging configuration (`src-tauri/tauri.staging.conf.json`) with bundle identifier `io.github.millsydotdev.kinora.staging` and isolated application data directory (`~/.local/share/io.github.millsydotdev.kinora.staging/`), ensuring staging builds never touch production user data.
- **Staging Build Tooling:** Added `build:staging`, `tauri:dev:staging`, and `tauri:build:staging` npm scripts with build-time environment injection via `__APP_ENV__`.
- **Unified 5-Stage Artwork Pipeline:** Implemented prioritized artwork resolution (custom, TMDB/TVmaze metadata, provider/local media, bundled assets, and branded SVG fallbacks) with strict aspect-ratio enforcement across movies (2:3), series (2:3), episodes (16:9), and channel logos.
- **Development and Release Documentation:** Authored comprehensive architectural guides including `STAGING.md`, `RELEASE.md`, `DEPLOYMENT.md`, and `docs/DEVELOPMENT-AND-RELEASE-WORKFLOW.md`.

### Fixed
- **Global Layout Composition:** Eliminated permanent right-hand columns that squeezed main content across Live TV, Movies, and Settings.
- **Full-Width Live TV Guide:** Removed redundant `tvguide-split-layout` and `tvguide-side-dock`; TV Guide now renders at 100% full width, and programme details open cleanly in the contextual slide-out sheet drawer.
- **Movies Quick Look Drawer:** Converted `.movies-side-panel` into a contextual slide-out drawer overlay with a dimmed backdrop and close button, eliminating the permanent 360px layout reservation.
- **Settings 2-Column Grid:** Restructured Settings into a clean 2-column layout (240px nav, 1fr content) across all sections, embedding Live Preview, Theme Presets, Typography, and Interface Density controls directly inside the Appearance section.
- **Home Top Stage Rebalance:** Rebalanced top stage grid so companion hub stays proportionally bounded (340px to 420px) while the cinematic hero stage dominates.
- **Search and Sources Width Expansion:** Removed restrictive max-width limits on Search (`width: 100%`) and Discovery (`width: 100%`), allowing desktop grids to expand cleanly.
- **Gutter Padding Alignment:** Standardized horizontal padding to `var(--gutter, 24px)` across MediaStreaming, Recordings, and Browse bars.

### Security
- **Strict SSRF Protections:** Verified destination IP checks in native Rust fetch engine, refusing private, loopback, link-local, and multicast destinations.
- **Token Redaction:** Verified that all error messages scrub paths, queries, and authentication tokens before reporting to the frontend.
- **Zero Em-Dash Standard:** Enforced strict typographic rule prohibiting em-dashes across all code, comments, documentation, and UI text.

---

## [0.5.0] - 2026-11-15 (Public Desktop Release Candidate)

### Added
- **Licensing & IP Protection:** Published under the Kinora Proprietary Source-Available Licence (All Rights Reserved) with explicit AI/ML training restrictions and source-available evaluation rights.
- **Creator Attribution:** Added visible creator credit to millsydotdev in Settings > About with clickable link to https://github.com/millsydotdev, root README, and project documentation.
- **Tauri Updater & What's New Experience:** Implemented full in-app update lifecycle with release notes modal, real download progress, restart notifications, and persistent notification history.
- **Canonical Repository Alignment:** Synchronised updater endpoints, release workflows, and community templates to `millsydotdev/KinoraTV`.
- **Cross-Platform Release Automation:** Validated multi-platform packaging matrices across Linux (RPM, DEB, AppImage), Windows (x64 NSIS, MSI), and macOS (Apple Silicon / Intel DMG).

### Fixed
- **Recommendation Card Artworks:** Restored genuine, authentic mock artworks from the master visual reference in the Home Recommended for You rail, eliminating recursive screenshot artifacts.
- **Artwork Aspect Ratio:** Standardised card tile dimensions to 220x185 matching cinematic mockup specifications.

### Security
- **Guarded Update Manifests:** Update downloads and metadata validation enforce HTTPS-only connections and strict SSRF loopback protections.
- **Zero Exposed Secrets:** Completed exhaustive historical and working-tree security review prior to public release.

---

## [0.1.0] - 2026-11-15 (Release Candidate Preparation)

### Added
- **Multi-Platform Packaging:** Added packaging configurations for Linux (RPM, DEB, AppImage), Windows (NSIS, MSI), and macOS (DMG, App Bundle) in `tauri.conf.json`.
- **Automated GitHub Release Pipeline:** Created `.github/workflows/release.yml` with multi-platform matrix builds, SHA-256 checksum aggregation, and draft release publishing.
- **In-App Update Detection:** Implemented `updater.rs` in native Rust evaluating signed manifests over guarded HTTPS connections (`Policy::updater()`), bound to native IPC and Settings UI.
- **macOS Hardened Runtime:** Configured `entitlements.plist` enabling JIT, network client, and audio device permissions for Gatekeeper and Apple notarization.
- **Unified Notification Architecture:** Connected `ToastProvider` with `NotificationProvider`, routing ephemeral alerts into a persistent history drawer with unread badges.
- **Community & Governance Templates:** Authored `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue templates, and pull request template.

### Fixed
- **Windows File Persistence:** Resolved atomic write crash on Windows by guarding directory synchronization (`sync_all()`) to POSIX systems (`#[cfg(unix)]`).
- **CSS Minification Syntax Error:** Corrected malformed nested transition rules in `src/screens/Home.css` that caused Vite lightningcss production build failures.
- **Tauri Bundle Configuration:** Corrected macOS configuration key casing in `tauri.conf.json` (`macOS`).
- **Clippy Lint Hygiene:** Replaced manual pattern closures with character slice patterns in semver string parsing.

### Security
- **Strict SSRF Protections:** Enforced destination verification and loopback/private IP blocking across all playlist, guide, catalogue, and updater network traffic.
- **Memory-Only Stream Tokens:** Maintained upstream stream addresses and query credentials strictly in native Rust memory behind opaque `kstream://localhost/` handles.
- **Salted PIN Storage:** Hardened parental controls with salted PBKDF2 hashing and automatic lockout after repeated invalid entries.

---

## [0.0.9] - 2026-11-01 (M1 First-Run Milestone)
- Made first-run experience honest with explicit sample mode separation.
- Connected real Live TV channel playing directly from setup.
- Added country selection and iptv-org discovery onboarding.

## [0.0.8] - 2026-10-29 (Gate D8 Reliability)
- Hardened end-to-end reliability and memory footprint.
- Added clock-independent timezone testing for guide schedules.
- Added comprehensive Vitest and Cargo test suites.

## [0.0.7] - 2026-10-29 (Gate D7 Discovery Catalogue)
- Added public playlist discovery using iptv-org's open directory.
- Guaranteed explicit user confirmation before importing any discovered source.

## [0.0.6] - 2026-10-28 (Gate D6 XMLTV EPG)
- Implemented pure XMLTV parser with DTD expansion attack rejections.
- Added fuzzy and loose channel matching against guide listings.

## [0.0.5] - 2026-10-27 (Gate D5 Local Persistence)
- Implemented atomic file saving for sources in user app data (`0700` directory, `0600` file).
- Added corrupt file recovery handling without data deletion.

## [0.0.4] - 2026-10-27 (Gate D4 Guarded Playback)
- Implemented native `kstream://localhost/` HLS rewriter and handle proxy.
- Added DRM refusal and stream size/bandwidth budgets.

## [0.0.3] - 2026-10-25 (Gate D3 M3U Ingestion)
- Connected parsed M3U channels to Live TV guide, categories, and channel filters.

## [0.0.2] - 2026-10-25 (Gate D2 Rust M3U Parser)
- Added Rust M3U parser with guarded HTTP client (`no_proxy()`, anti-SSRF).

## [0.0.1] - 2026-10-22 (Pre-Tauri Baseline)
- Initial React 19 + TypeScript desktop UI prototype.
