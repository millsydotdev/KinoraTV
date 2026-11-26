# 12 Tests and Verification Evidence

This document records the exact test suite executions, automated coverage statistics, and the boundaries between automated unit tests, component tests, and actual end-to-end runtime verification.

---

## 1. Automated Test Suites Execution Record

### Frontend Test Suite (Vitest)
- **Command:** `npm test` (`vitest run`)
- **Execution Timestamp:** 2026-11-19T14:32:34Z
- **Duration:** 6.68 seconds
- **Results:**
  - Test Files: **48 passed** / 48 total (100%)
  - Tests: **470 passed** / 470 total (100%)
  - Failures: **0**
  - Errors: **0**
- **Test File Distribution:**
  - Screen Integration & Flow Tests: 19 files (e.g. `GuideFlows.test.tsx`, `DiscoveryFlows.test.tsx`, `SourceFlows.test.tsx`, `PlayerPlayback.test.tsx`, `ArtworkAndShare.test.tsx`, `MediaCategoryScreens.test.tsx`, `VisualRegressionRecovery.test.tsx`)
  - State & Domain Logic Tests: 14 files (e.g. `store.test.ts`, `mediaLibrary.test.tsx`, `playlists.test.ts`, `guides.test.ts`, `channel-matching.test.ts`, `profiles.test.tsx`)
  - Design System & Component Tests: 8 files (e.g. `design-system.test.tsx`, `ProgrammeArt.test.tsx`, `ErrorBoundary.test.tsx`, `ContentRail.test.tsx`)
  - Utilities & Security Tests: 7 files (e.g. `kidsMode.test.ts`, `theme.test.ts`, `featuredSelection.test.ts`, `native.test.ts`)

---

### Backend Native Test Suite (Cargo)
- **Command:** `cargo test --manifest-path src-tauri/Cargo.toml`
- **Execution Timestamp:** 2026-11-19T14:32:40Z
- **Duration:** 3.10 seconds
- **Results:**
  - Tests: **175 passed**, **0 failed**, **1 ignored** (proxy child process test), **0 measured**
  - Modules Covered:
    - `artwork::tests`: 8 tests (raster detection, aspect ratio, SVG security rejection, cache round-trip)
    - `catalogue::tests`: 6 tests (discovery index parsing, exact URL verification, cache survival)
    - `dash::tests`: 7 tests (manifest rewriting, relative directory routing, DRM refusal)
    - `dvr::tests`: 3 tests (lifecycle, series rules, HTTP serving)
    - `fetch::tests`: 18 tests (IP guardrails, SSRF blocking, private IP refusal, token scrubbing)
    - `guides::tests`: 12 tests (matching cascade, cache loading, prune operations)
    - `hls::tests`: 13 tests (master playlist rewriting, handle minting, byte ranges)
    - `m3u::tests`: 8 tests (syntax parsing, stream caps, tags extraction)
    - `pin::tests`: 5 tests (PBKDF2 derivation, salt randomness, legacy SHA-256 migration)
    - `sources::tests`: 10 tests (atomic write, schema migration, directory permission 0700)
    - `stream::tests`: 14 tests (byte budgets, session invalidation, CORS lockdown)
    - `updater::tests`: 10 tests (semver parsing, update manifests, architecture compatibility)
    - `xmltv::tests`: 15 tests (quick-xml parsing, entity attacks refusal, timezone normalization)
    - `xtream::tests`: 11 tests (credentials encryption vault, stream URL generation, catch-up)

---

### Static Analysis and Build Checks
- **TypeScript Typecheck:** `npm run typecheck` (`tsc -b`) -> **0 errors**.
- **Rust Clippy Linter:** `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` -> **0 warnings**.
- **Production Asset Build:** `npm run build` (`tsc -b && vite build`) -> **Success** in 451ms.
  - Dist Bundle Output:
    - `dist/index.html`: `0.50 kB`
    - `dist/assets/index-*.css`: `262.45 kB` (`46.78 kB` gzip)
    - `dist/assets/hls-*.js`: `574.32 kB` (`178.92 kB` gzip)
    - `dist/assets/index-*.js`: `1,763.72 kB` (`433.88 kB` gzip)

---

## 2. Test Capabilities vs Verification Boundaries

To prevent false confidence, the following boundaries must be explicitly recognized:

1. **What Unit Tests Establish:**
   - Pure functions compute expected outputs for given inputs (e.g. `channel-matching.ts` correctly normalizes `bbc-one@uk` to `bbc-one`).
   - Parsers reject malformed or attacking payloads (e.g. `xmltv.rs` refuses XML files with `<!DOCTYPE ... [`).
   - Mocked React hooks render expected DOM nodes in JSDOM / Happy-DOM test environments.

2. **What Unit Tests DO NOT Establish:**
   - **Network Latency & Server Reliability:** A mocked `fetchPlaylist` test does not guarantee an external third-party IPTV provider will maintain low jitter or high availability.
   - **Hardware Video Decoding:** A mocked `<video>` element test does not establish that the user's local GPU supports hardware-accelerated HEVC/H.265 or AV1 decoding without dropped frames.
   - **Cross-Platform Window Compositing:** Vitest running in Node.js does not verify window transparency, title bar drag regions, or Wayland compositing artifacts on Linux.
   - **Audio Device Handshake:** Unit tests cannot verify physical ALSA / PulseAudio / PipeWire audio buffer negotiation.

3. **Visual Regression & Runtime Verification:**
   - Captured across 123 full-resolution screenshots (1920x1080 and 1280x800) in `Kinora_COMPLETE_UI_Evidence.zip`.
   - Side-by-side comparison sheets (3840x1080) confirm layout alignment, typography, and contrast across DEV MOCK and REAL USER runtime states.
