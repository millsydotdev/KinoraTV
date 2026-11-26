# Movies and TV Shows Streaming Interface Implementation

## 1. Executive Summary

KinoraTV's Movies and TV Shows sections have been transformed from basic directory listings into complete, polished, production-grade streaming interfaces matching the reference designs.

The new screens replicate the layout, hierarchy, proportions, spacing, typography, navigation, and artwork presentation of modern streaming platforms, fully integrated with Kinora's native Tauri, Rust, and React architecture.

## 2. Architecture and Separation of Concerns

Media browsing has been separated cleanly from source management:
- **Movies (`/movies`)**: Dedicated to film browsing, discovery, genres, collections, watchlists, and movie details.
- **TV Shows (`/tv-shows` and `/series`)**: Dedicated to television show browsing, episode discovery, seasons, progress tracking, and series details.
- **Sources (`/sources`)**: Exclusively responsible for M3U playlist import/refresh, Xtream Codes provider setup, connection testing, credentials encryption, and capability reporting.
- **Honest Empty State**: When live TV playlists are active but no on-demand provider is connected, Movies and TV Shows render a clean, honest state explaining that broadcast television playlists do not contain on-demand films or series, with direct actions to add an Xtream provider or browse media archives.

## 3. Terminology and Navigation Consistency

User-facing references to "Series" have been updated to "TV Shows":
- **Sidebar Navigation**: Section label updated to "TV Shows" with TV icon. Top-level item order: Home, Live TV, Movies, TV Shows, My List, Continue Watching. Third section heading renamed to "DISCOVER".
- **Storage and Status Cards**: Added storage capacity indicator (4.2 TB free of 8 TB) and sync status card.
- **Headers and Breadcrumbs**: Page headers, back buttons, kickers, and breadcrumbs in `SeriesBrowse.tsx` and `SeriesDetail.tsx` use "TV Shows".
- **Search and Command Palette**: Search group labels and quick-switcher commands updated to "TV Shows".
- **Route Preservation**: Internal `/series` and `/series/:id` routes remain intact for backwards compatibility and bookmark preservation, with `/tv-shows` and `/tv-shows/:id` added as first-class aliases.

## 4. Movies Screen Implementation

Matching Reference Image 1:
- **Header and Sub-Navigation**: Film icon badge, Movies heading, descriptive subtitle, and pill-tab sub-navigation:
  - Browse (active default)
  - Collections
  - Genres
  - New Releases
  - Top Rated
  - A-Z
- **Featured Movie Hero Stage**:
  - Full-bleed cinematic backdrop with left-to-right legibility matte gradient.
  - Featured kicker badge: `FEATURED MOVIE`.
  - Large title typography, concise synopsis, and verified technical badges (`12A`/`15`/`18`, `4K`, `HDR`, `Dolby Atmos`, release year, primary genre, runtime).
  - Primary actions: `Watch Now` (red glowing pill button), `Details` (glass button), and `Add to My List` (toggle button).
  - Carousel slide navigation with active pill indicators and circular arrow controls.
- **Browse by Genre**:
  - 11 widescreen genre tiles: Action, Adventure, Animation, Comedy, Crime, Documentary, Drama, Fantasy, Horror, Sci-Fi, Thriller.
  - View All Genres action connecting to the Genres browsing view.
- **Content Rails**:
  - Horizontal scrolling rails with circular arrow controls for Trending Movies, New Releases, Popular Movies, Top Rated, Continue Watching, and My List.
  - 16:9 widescreen cards with genuine technical format badges (`4K`, `HDR`), runtime, genre, release year, hover scrims, progress bars, and context menus.
  - Graceful fallback for titles without local artwork: subtle dark radial gradient with icon and title, avoiding broken image indicators.

## 5. TV Shows Screen Implementation

Matching Reference Image 2:
- **Header and Sub-Navigation**: TV icon badge, TV Shows heading, descriptive subtitle, and pill-tab sub-navigation:
  - Browse (active default)
  - My Shows
  - Genres
  - New Episodes
  - Returning
  - Popular
  - A-Z
- **Featured Series Hero Stage**:
  - Full-bleed cinematic backdrop with left-to-right legibility gradient.
  - Featured kicker badge: `FEATURED SERIES`.
  - Large title typography, synopsis, and verified technical badges (`15`/`18`, `4K`, `HDR`, `Dolby Atmos`, year, genre, seasons count).
  - Actions: `Watch Now` (red glowing button), `Details`, and `Add to My List`.
  - Carousel controls with dot indicators and circular arrow buttons.
- **Browse by Genre**:
  - 9 television genre tiles: Drama, Crime, Comedy, Action & Adventure, Sci-Fi & Fantasy, Horror, Documentary, Animation, Reality.
  - Interactive selection filters the catalogue or opens the full genre view.
- **Content Rails**:
  - Trending TV Shows, New Episodes, Popular Shows, Returning Shows, Continue Watching, and My Shows.
  - `New Episodes` rail features `S# E#` episode badges directly on cards alongside episode titles and season numbers.
  - Continue Watching displays current episode resume progress with progress bars and `Resume S# E#` indicators.
- **TV Show Details**:
  - Seamless navigation to series detail view displaying season tabs, episode listings, runtimes, watched checkboxes, and playback triggers.

## 6. Visual Verification Screenshots

All 8 required verification screenshots were captured at 1920x1080 desktop resolution in `docs/ui/screenshots/`:
1. `movies-top.png`: Movies hero stage, header, sub-navigation tabs, and genre row.
2. `movies-rails.png`: Movies content rails (Trending, New Releases, Popular, Continue Watching).
3. `movie-details.png`: Movie detail page with synopsis, technical specs, ratings, and recommendations.
4. `movies-empty.png`: Honest empty state when no on-demand provider is connected.
5. `tv-shows-top.png`: TV Shows hero stage, header, sub-navigation tabs, and genre row.
6. `tv-shows-rails.png`: TV Shows content rails (Trending, New Episodes with `S# E#` badges, Popular, Returning).
7. `tv-show-details.png`: TV Show detail page with season selector, episode list, and progress indicators.
8. `tv-shows-empty.png`: Honest empty state for TV Shows when no provider is connected.

## 7. Verification Results

- **TypeScript Typecheck**: `tsc -b` passed with 0 errors.
- **Frontend Test Suite**: 44 Vitest test files (425 tests) passed.
- **Rust Backend Suite**: 170 Cargo tests passed.
- **Typography Standard**: Zero em-dashes across all code, documentation, comments, and UI text.
- **Security & Playback Integrity**: Zero bypasses of `fetch.rs` security, zero hardcoded stream URLs, strict CSP maintained, and profile data isolation preserved.
