# Kinora UI Screenshot Manifest and System Reference

## Complete UI System Verification and Evidence

This manifest documents the visual parity verification across both operational environments (Dev Mock and User Sources) following the authoritative **KINORA TV Complete UI System Reference: Unified, High End, TV Box Optimised**.

---

## 1. System Reference & Design Tokens

### Color Palette (Brand & Theme)
- Background: `#080C10` (Root application canvas)
- Surface: `#111318` (Primary card and container background)
- Surface 2: `#171B22` (Elevated controls and inputs)
- Primary Accent: `#E50914` (Authoritative red accent)
- Secondary Accent: `#FF3847` (Bright highlight red)

### UI Components & Interaction States
- **Buttons:**
  - Primary: Solid `#E50914` with white text and icon.
  - Secondary: `#171B22` background with `#323849` subtle border.
  - Tertiary: Ghost transparent with soft hover state.
- **Badges and Pills:**
  - `DISCOVERY`: Deep blue/slate `#60a5fa`
  - `ARCHIVE`: Amber/gold `#fbbf24`
  - `LIVE`: `#E50914` with pulsing white indicator
  - `NEW`: Emerald green `#34d399`
  - `4K HDR`: Graphite `#171B22` with `#323849` border
- **Animated Focus / Border (Reusable):**
  - TV Box / D-pad and pointer focus:
    `border: 2px solid #E50914; box-shadow: 0 0 14px rgba(229, 9, 20, 0.55), inset 0 0 6px rgba(229, 9, 20, 0.25);`
  - Reusable CSS classes: `.animated-focus-border`, `.tv-focus-border`, `.prog.is-selected`, `.card:hover`, `.res-card:hover`.
- **Media Card Variants:**
  - Standard: Clean media poster/backdrop with subtle boundary.
  - Progress: Integrated red illuminated progress bar (`#E50914`).
  - Hover / Focus: Illuminated red border with deep shadow lift.

---

## 2. Desktop Shell Architecture & Connection Resolution

### WebKitGTK Connection Refused Diagnosis
- In debug builds (`src-tauri/target/debug/kinora`), Tauri connects to `devUrl` (`http://localhost:5199`).
- If launched when the Vite dev server is not listening or before port 5199 is bound, WebKitGTK presents "Could not connect to localhost: Connection refused".
- In commit `becc636`, `vite.config.ts` was upgraded to bind to dual-stack IPv6/IPv4 (`host: '::'`) on port 5199.
- **Production Resolution:** The release desktop binary (`src-tauri/target/release/kinora`) bundles all frontend assets directly (`frontendDist: "../dist"`). It runs 100% standalone, offline, and self-contained without connecting to any localhost port, completely eliminating connection errors.

---

## 3. Screenshot Coverage (Two Permanent Libraries)

### Dev Mock Library (`docs/ui/dev-mock/`)
- `home-top.png` (1920x1080)
- `home-featured-movie.png` (1920x1080)
- `home-featured-series.png` (1920x1080)
- `home-featured-live-programme.png` (1920x1080)
- `home-scrolled.png` (1920x1080)
- `live-tv-guide.png` (1920x1080)
- `live-tv-player.png` (1920x1080)
- `movies-top.png` (1920x1080)
- `movies-rails.png` (1920x1080)
- `movie-details.png` (1920x1080)
- `movies-empty.png` (1920x1080)
- `tv-shows-top.png` (1920x1080)
- `tv-shows-rails.png` (1920x1080)
- `tv-show-details.png` (1920x1080)
- `tv-shows-empty.png` (1920x1080)
- `radio.png` (1920x1080)
- `music.png` (1920x1080)
- `podcasts.png` (1920x1080)
- `audiobooks.png` (1920x1080)
- `books.png` (1920x1080)
- `documentaries.png` (1920x1080)
- `news.png` (1920x1080)
- `sports.png` (1920x1080)
- `education.png` (1920x1080)
- `culture-arts.png` (1920x1080)
- `nature-science.png` (1920x1080)
- `gaming.png` (1920x1080)
- `language-resources.png` (1920x1080)
- `media-archives.png` (1920x1080)
- `search-results.png` (1920x1080)
- `library.png` (1920x1080)
- `sources.png` (1920x1080)
- `settings.png` (1920x1080)
- `player-controls.png` (1920x1080)
- **Responsive (1280x800):**
  - `home-top-1280.png`
  - `movies-top-1280.png`
  - `tv-shows-top-1280.png`
  - `live-tv-guide-1280.png`
  - `movie-details-1280.png`
  - `tv-show-details-1280.png`

### User Sources Library (`docs/ui/user-sources/`)
- Identical 34 core screens and 6 responsive views captured with real user profile data, real Xtream connections, verified public discovery entries, and real local media storage metrics.

### Side-by-Side Comparison Library (`docs/ui/comparison/`)
- 25 generated side-by-side verification panels in `docs/ui/comparison/` confirming layout symmetry, typography consistency, and visual hierarchy between environments.
