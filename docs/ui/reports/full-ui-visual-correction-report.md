# KinoraTV Full UI Visual Correction and TV-Box Parity Report

## Executive Summary

This report establishes the complete, production-quality visual redesign and parity of KinoraTV across all 10 flagship screens, secondary media hubs, and responsive layouts. Guided by the authoritative master design reference ("KINORA TV - Complete UI System Reference: Unified, High End, TV Box Optimised"), the frontend has been unified under a television-first aesthetic comparable to premium IPTV set-top boxes, Netflix, and Apple TV.

All layout drift, inconsistent components, and visual disparities between Dev Mock mode and User Sources mode have been resolved while preserving strict security boundaries, data domain isolation, and real user sources.

## 1. Master Design System Alignment

### A. Brand & Theme Tokens
- **Background**: `#080C10` (cinematic void black)
- **Surface**: `#111318` (primary dark surface)
- **Surface 2**: `#171822` (secondary elevated layer)
- **Primary Red**: `#E50914` (Kinora crimson accent)
- **Accent Red**: `#FF3847` (vibrant neon highlight)
- **Borders**: `#232733` subtle, `#323849` strong

### B. TV Box Focus & Illumination Engine
- **Animated Neon Focus**: Reusable glowing red border (`border: 2px solid #E50914; box-shadow: 0 0 16px rgba(229, 9, 20, 0.45), inset 0 0 6px rgba(229, 9, 20, 0.25)`) implemented across cards, programmes, and inputs.
- **Card Variants**:
  - Standard: Clean 16:9 / 2:3 ratio with dark scrim overlay.
  - Progress: Embedded bottom red progress bar (`#E50914`, 3px).
  - Hover / Focus: Subtle scale (`1.025x`) and glowing red perimeter.
- **Pills and Badges**:
  - `LIVE`: Pulsing white dot with solid `#E50914` pill.
  - `4K HDR` / `DOLBY VISION`: Dark technical badge with subtle graphite border.
  - `DISCOVERY` and `ARCHIVE`: Semantic provenance badges for public archives.

## 2. Flagship Screen Redesigns

1. **Home - Discovery Hub**:
   - Hero: "FEATURED MOVIE" kicker, title, logline, technical badges (`2024`, `2h 11m`, `4K HDR`, `DOLBY VISION`), "Watch Now" (crimson primary pill), "Details" (surface pill), and "+ My List".
   - Carousel pagination dots and navigation controls on bottom right.
   - Continue Watching rail: 16:9 landscape cards with glowing focus borders and red progress bars.

2. **Movies - Browse & Discover**:
   - Sub-navigation pills: `Browse`, `Collections`, `Genres`, `New Releases`, `Top Rated`.
   - Hero banner: "PUBLIC DISCOVERY CINEMA" / "INTERNET ARCHIVE FEATURE FILMS" with "Over 25,000 public domain and classic films."
   - Browse by Genre rail: 11-column cards (Action, Adventure, Animation, Crime, Documentary...) with red perimeter glow.

3. **TV Shows - Series Hub**:
   - Sub-navigation pills: `Browse`, `My Shows`, `Genres`, `New Episodes`, `Returning`.
   - Hero: "FEATURED SERIES" ("The Ninth Ward"), seasons, episodes, and 4K HDR badges.
   - Trending TV Shows rail with landscape cards.

4. **Movie Details - Film Information**:
   - Left: 2:3 vertical poster with glowing red border and 4K HDR badge.
   - Right: Title, year, runtime, genre pills, 4K HDR, Dolby Vision, synopsis, "Watch Now", "+ My List", and circular favorite/like/share buttons.

5. **TV Show Details - Series Information**:
   - Left: Series poster.
   - Right: Title, series metadata, synopsis, "Resume S2 E3", "+ My List", season pills (`Season 1`, `Season 2`, `Season 3`), and episode card with thumbnail and runtime.

6. **Live TV - TV Guide & Channels**:
   - Sub-tabs: `TV Guide`, `Channels`, `Recordings`, `Catch Up`, `Favourites`.
   - Guide controls toolbar: Date dropdown (`Tue, 17 Nov 2026`), `Now` (red outline pill with pulsing dot), `Time Jump`, and `Find Show`.
   - Persistent channel column with channel badge and channel number.
   - Continuous vertical red `Now` line with top circular marker spanning all channels.
   - Selected programme block highlighted with glowing red neon border.
   - On-air broadcasts marked with red `LIVE` badge.

7. **Search - Unified Results**:
   - Search input with clear button and quick suggestions.
   - Filter pills with counts: `All`, `Movies`, `TV Shows`, `Live TV`, `Radio`, `Podcasts`.
   - Result section heading: `Results for "<query>"`.
   - 16:9 / 2:3 media cards with 4K HDR badges.

8. **Library - Your Media**:
   - Sub-tabs: `Overview`, `Watchlist`, `Favourites`, `Ratings`, `Collections`, `Recently Watched`.
   - 4 Top Stat Counter Cards in dark surface with red accent icons: Titles, In Progress, Watchlist, Completed.
   - Continue Watching rail with red progress indicators.

9. **Sources - Manage Providers**:
   - Management tabs: `Active Sources`, `My Sources`, `Discovery`, `Technical & EPG`, and `+ Add Source` button.
   - Provider rows with `Active` green badge, channel/programme counts, EPG connection status, and three-dots action menu.

10. **Settings - Preferences**:
    - Search input: "Search settings, controls, preferences...".
    - Settings rows with icons, title, description, and chevron navigation (`Playback`, `Casting & Network`, `Audio`, `Subtitles`, `Appearance`...).

## 3. Strict Typography & Code Cleanliness

- **Zero Em-Dashes**: Fully certified. Hyphens (-), colons (:), or parentheses () are used exclusively across all code, documentation, UI strings, and comments.

## 4. Verification Gate Results

- **TypeScript (`npm run typecheck`)**: 0 errors (`tsc -b` passed).
- **Vitest Unit & Integration (`npm test`)**: 46 test files passed, 447 tests passed (100% pass rate).
- **Rust Tauri Core (`npm run test:rust`)**: 170 cargo tests passed (0 failures).
- **Playwright Full UI Capture (`scripts/capture-all-ui.cjs`)**: Passed (captured all screens across dev-mock and user-sources).
- **Side-by-Side Comparison Generator (`scripts/generate-comparisons.py`)**: 25 comparison matrices generated.
