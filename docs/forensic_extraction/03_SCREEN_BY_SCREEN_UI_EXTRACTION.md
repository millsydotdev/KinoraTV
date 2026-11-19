# 03 Screen-by-Screen UI Extraction

This document provides a factual, source-grounded extraction of every screen and view in Kinora.

---

## 1. Screen: Home (`/`)

### Identity
- **Screen Name:** Home / Cinematic Dashboard
- **Exact Route:** `/`
- **React Component:** `Home`
- **Source File:** `src/screens/Home.tsx`
- **Parent Layout:** `Shell` (`src/App.tsx:190-232`)
- **Entry Points:** Sidebar item "Home", keyboard shortcut `1`, navigation fallback from 404, logo click.

### Rendered Hierarchy
1. `PageHeader`: Top application bar with global search, notifications indicator, profile pill, and live local clock.
2. `Hero Section`: Full-bleed cinematic featured banner with rotating carousel dots, title, metadata badges, synopsis, and action buttons.
3. `Hero Right / Side Stage`: Now Playing card, live preview, quick switch tabs ("On Now", "Next"), and quick action buttons ("TV Guide", "Recordings", "Reminders", "Favourites").
4. `Continue Watching Rail`: Horizontal media cards displaying progress bars and remaining runtime.
5. `Live TV - Now Playing Rail`: Real-time broadcast cards with live channel marks, channel names, and current programmes.
6. `Trending Movies & Series Rail`: Highly rated content cards with certificate badges and genre tags.
7. `Category Discovery Rails`: Dedicated rails for Sci-Fi, Crime Drama, Action & Thriller, Comedy, and Recently Added.
8. `Your Library at a Glance`: Bottom summary panel displaying live counts for Movies, TV Series, Channels, and Physical Storage.

### Every Visible Element
- **Hero Badge:** Text: `FEATURED MOVIE` or `FEATURED SERIES` or `LIVE BROADCAST`. CSS: `.hero-kicker-badge`. Data source: `selectedHero` from `src/lib/featuredSelection.ts`.
- **Hero Title:** Text: e.g. `Dune: Part Two` (Dev Mock) or active title. CSS: `.hero-title`.
- **Hero Metadata Row:** Year (e.g. `2024`), Genre (`Sci-Fi`), Runtime (`2h 46m`), Certificate (`12A`). CSS: `.hero-meta`.
- **Hero Synopsis:** Paragraph text. CSS: `.hero-synopsis`. Max 3 lines with ellipsis.
- **Hero Primary Action:** Button `Watch Now` or `Watch Live`. Icon: `play` (Tabler `IconPlayerPlay`). CSS: `.btn.btn-primary.btn-hero`. Handler: calls `openRef(selectedHero.ref)` navigating to `/watch/:ref`.
- **Hero Secondary Action:** Button `More Info`. Icon: `info` (`IconInfoCircle`). CSS: `.btn.btn-secondary`. Handler: navigates to `/movies/:id` or `/series/:id`.
- **Hero Watchlist Button:** Icon button `bookmark` (`IconBookmark`). CSS: `.icon-btn.ringed`. Handler: toggles item in `store.library.watchlist`.
- **Carousel Navigation Dots:** Dot indicators (e.g. 4 dots). CSS: `.hero-carousel-dot`. Handler: updates `activeHeroIndex`.
- **Library Summary Counter Cards:**
  - `Movies`: Count derived from `store.demoTitles ? movies.length : xtreamCatalogue.movies.length + localMedia.movies.length`. CSS: `.stat-card`.
  - `TV Series`: Count derived from series arrays.
  - `Channels`: Count derived from `store.channels.length`.
  - `Local Storage`: Formatted gigabytes/terabytes derived from `store.storageMetrics.totalDiskBytes`.

### Layout and Geometry
- **Hero Height:** `clamp(420px, 47.61vh, 448px)` (min `420px`, max `480px`). Padding: `82px 60px 59px 60px`.
- **Page Gutters:** `padding: 0 40px` on desktop (collapses to `20px` at `<= 1024px`).
- **Card Rails:** `display: flex; gap: 16px; overflow-x: auto; scroll-snap-type: x mandatory;`.
- **Media Card Standard Dimensions:**
  - Poster cards: `aspect-ratio: 2 / 3`, width: `180px` on desktop.
  - Backdrop cards: `aspect-ratio: 16 / 9`, width: `280px` on desktop.
- **Typography:**
  - Hero Title: `clamp(2.1rem, 2.7vw, 2.5rem)`, weight `800`, line-height `1.05`.
  - Rail Headings: `1.25rem`, weight `700`, line-height `1.2`.
- **Colours & Theme Tokens:**
  - Canvas Background: `var(--bg)` (`#080C10` in dark mode).
  - Surface Elevation: `var(--surface)` (`#111318`).
  - Active Neon Accent: `var(--accent)` (`#E50914`).
  - Focus Ring: `0 0 14px rgba(229, 9, 20, 0.55), inset 0 0 6px rgba(229, 9, 20, 0.25)`.

### Artwork
- **Hero Background:** Component `Art` (`src/components/ui.tsx:28`). Source: `selectedHero.backdropUrl || selectedHero.art`. Aspect ratio: `16:9` cover. Linear gradients applied over artwork:
  - Left-to-right fade: `linear-gradient(90deg, rgba(8, 9, 11, 0.95) 0%, rgba(8, 9, 11, 0.85) 30%, rgba(8, 9, 11, 0.35) 60%, transparent 80%)`.
  - Bottom fade: `linear-gradient(0deg, #08090b 0%, rgba(8, 9, 11, 0.5) 15%, transparent 35%)`.
- **Poster Cards:** Component `PosterCard` (`src/components/Tiles.tsx`). Fallback: deterministic SVG placeholder with title initials and genre icon.

### States
- **DEV MOCK Populated:** All 8 content rails rendered with deterministic fixtures from `src/data/catalog.ts` and `src/data/openCatalogue.ts`.
- **REAL USER with Sources:** Rails populated with live Xtream items, connected M3U channels, and local disk media.
- **REAL USER Empty State:** When no sources or local libraries are connected, hero defaults to verified public discovery feature, and rails render honest connect-source banners without fake watch history or ratings.

---

## 2. Screen: Live TV & TV Guide (`/live`)

### Identity
- **Screen Name:** Live TV & Electronic Programme Guide
- **Exact Route:** `/live`
- **React Component:** `LiveTV`
- **Source File:** `src/screens/LiveTV.tsx`
- **Parent Layout:** `Shell`
- **Entry Points:** Sidebar item "Live TV", keyboard shortcut `2`, Now Playing banner links.

### Rendered Hierarchy
1. `PageHeader`: Live TV title, view toggle (`Timeline` vs `Channels`), quick filters (`All`, `Favourites`, `Recent`), search box.
2. `Top Stage / Live Preview & Now Playing Panel`:
   - Left: Live video preview player (with play/pause, volume, mute, fullscreen buttons) or channel logo backdrop.
   - Middle: Now Playing metadata card (Channel name, channel number, programme title, start/stop times, remaining duration bar, synopsis, "Watch Live", "Record", "Reminder", "Favourite", "Share").
   - Right: "Next on [Channel]" card showing upcoming programme title, time range, and artwork.
3. `Timeline Navigation Toolbar`:
   - Date picker dropdown (defaults to "Today, [Day Month]").
   - "Now" jump button (instantly scrolls horizontal timeline to current red indicator).
   - Step back / Step forward buttons (`<` and `>`).
   - Time zoom selector (`1 Hour`, `2 Hours`, `4 Hours`).
   - Category filter chips (e.g. `All`, `General`, `News`, `Entertainment`, `Movies`, `Sports`, `Documentary`).
4. `EPG Schedule Grid`:
   - Top: Sticky horizontal time ruler with half-hour and hour interval ticks (`17:00`, `17:30`, `18:00`, ...).
   - Left: Sticky vertical channel identity column with channel number, channel mark (`ChannelMark`), and channel name.
   - Center: Continuous horizontal programme blocks aligned to exact minute durations.
   - Overlay: Red vertical `NOW` indicator line intersecting the active time position.
5. `Right Programme Detail Drawer (Side Sheet)`: Slides in when clicking any programme block. Displays detailed synopsis, cast & crew, genre tags, episode number, age rating, and actions.

### Layout and Geometry
- **Channel Column Width:** Sticky left `240px` on desktop (`180px` on mobile/compact).
- **Hour Marker Width (Zoom Level):**
  - 1 Hour zoom: `600px` per hour (10px per minute).
  - 2 Hours zoom: `300px` per hour (5px per minute).
  - 4 Hours zoom: `150px` per hour (2.5px per minute).
- **Row Height:** `56px` per channel row.
- **Top Preview Stage:** Height: `320px` grid split: `preview: 420px`, `nowPlaying: 1fr`, `next: 320px`.
- **Programme Block Styling:**
  - Current Programme: `background: #2a1114; border: 1.5px solid #E50914;` with glowing red accent.
  - Upcoming Programme: `background: #171b22; border: 1px solid #232834;`.
  - Missing Guide State: `background: #0f1115; color: #64748b;` with label "Guide not loaded" or "No Programme Information".

### Interactions & Controls
- Click Programme Block: Opens right-hand detailed side drawer (`selectedProgramme`).
- Double Click Programme Block: Tunes to channel in fullscreen player (`navigate('/watch/channel:' + channel.id)`).
- Click "Watch Live": Launches channel playback.
- Click "Record": Invokes `dvrStartRecording` or `dvrScheduleRecording`.
- Click "Reminder": Toggles local notification reminder in `store.reminders`.
- Click "Favourite": Toggles channel in `store.library.favourites`.
- Click "Share": Opens `ShareModal` with channel and programme details.
- Timeline Horizontal Wheel / Touchpad: Continuous horizontal scrolling synchronized with sticky header.

---

## 3. Screen: Movies (`/movies`)

### Identity
- **Screen Name:** Movies Catalogue & On-Demand Browse
- **Exact Route:** `/movies`
- **React Component:** `Movies`
- **Source File:** `src/screens/Movies.tsx`
- **Parent Layout:** `Shell`
- **Entry Points:** Sidebar item "Movies", keyboard shortcut `3`.

### Rendered Hierarchy
1. `PageHeader`: Title "Movies", search input, filter pills ("All Movies", "Popular", "Top Rated", "New Releases", "Genres", "Year").
2. `Cinematic Hero Banner`: Top featured movie with high-resolution artwork, title, IMDb rating, Rotten Tomatoes rating, runtime, director, cast, and "Watch Now" action.
3. `Right Quick-Actions Drawer / Preview Panel`: Displays selected movie poster, synopsis, technical badges (`4K`, `HDR10`, `5.1`), and share icon button.
4. `Continue Watching Rail`: In-progress movie titles for the active profile.
5. `Popular Movies Grid / Rail`: Ranked movie posters with illuminated hover cards.
6. `Genre-Specific Rows`: Filterable sections (Sci-Fi, Thriller, Drama, Horror, Comedy).

### Layout and Geometry
- **Hero Stage Height:** `420px`.
- **Card Grid:** `grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 20px;`.
- **Poster Aspect Ratio:** `2 / 3` (`aspect-ratio: 2 / 3; border-radius: var(--r-m); overflow: hidden;`).

---

## 4. Screen: Movie Detail (`/movies/:id`)

### Identity
- **Screen Name:** Movie Detail View
- **Exact Route:** `/movies/:id`
- **React Component:** `MovieDetail`
- **Source File:** `src/screens/MovieDetail.tsx`
- **Parent Layout:** `Shell`
- **Entry Points:** Clicking any movie card or direct link.

### Rendered Hierarchy
1. `PageHeader` & `Breadcrumbs`: Path navigation (`Home > Movies > [Movie Title]`).
2. `Backdrop Hero Banner`: Full-width backdrop with gradient fade, title, tagline, release year, age certificate, runtime, audio tracks, and subtitles.
3. `Action Bar`:
   - "Watch Now" primary button.
   - "Watchlist" toggle button.
   - Star rating controls (`RatingControls`).
   - "Share" button (`ShareModal` launcher).
   - "Trailer" button (lightbox modal player).
4. `Tab Navigation`:
   - `Overview`: Detailed synopsis, production facts, technical specs.
   - `Cast & Crew`: Cast member headshots, names, and character roles.
   - `Trailers`: Video clips and featurettes.
   - `Related`: Recommended titles sharing genres or directors.
5. `Artwork Lightbox Modal`: Fullscreen image viewer when clicking posters or stills.

---

## 5. Screen: TV Shows / Series (`/series` and `/tv-shows`)

### Identity
- **Screen Name:** TV Series Catalogue
- **Exact Route:** `/series` (alias `/tv-shows`)
- **React Component:** `SeriesBrowse`
- **Source File:** `src/screens/SeriesBrowse.tsx`
- **Parent Layout:** `Shell`
- **Entry Points:** Sidebar item "TV Shows", keyboard shortcut `4`.

### Rendered Hierarchy
1. `PageHeader`: Title "TV Shows", category pills, genre filters.
2. `Featured Series Stage`: Hero card highlighting trending series with seasons count, episode count, and latest season preview.
3. `Continue Watching Rail`: Shows currently in progress, displaying next episode indicator (e.g. `S1 E5 - Endure and Survive`).
4. `Trending Series Grid`: High-density card layout for television series.

---

## 6. Screen: Series Detail (`/series/:id` and `/tv-shows/:id`)

### Identity
- **Screen Name:** TV Series Detail & Episode Guide
- **Exact Route:** `/series/:id` (alias `/tv-shows/:id`)
- **React Component:** `SeriesDetail`
- **Source File:** `src/screens/SeriesDetail.tsx`
- **Parent Layout:** `Shell`
- **Entry Points:** Clicking any TV series card.

### Rendered Hierarchy
1. `PageHeader` & `Breadcrumbs`: `Home > TV Shows > [Series Title]`.
2. `Series Hero Banner`: Backdrop art, series title, years on air, total seasons, total episodes, genre badges.
3. `Action Bar`: "Resume Next Episode", "Watchlist", star rating, "Share".
4. `Season Tabs`: Horizontal selector buttons (`Season 1`, `Season 2`, `Season 3`, ...).
5. `Episode List / Grid`:
   - Episode thumbnail (`16:9` still).
   - Episode code (e.g. `S01E01`).
   - Episode title and runtime.
   - Episode description and air date.
   - Play button with watched status badge.
6. `Cast & Crew Section`: Modal launcher for actor bios.

---

## 7. Screen: Media Category Pages (Radio, Music, Podcasts, Audiobooks, Documentaries, Education, News, Sports, Books, Culture, Gaming, Nature, Languages, Archives)

### Identity
- **Screen Names:** Digital Preservation & Specialty Streaming Pages
- **Routes:** `/radio`, `/music`, `/podcasts`, `/audiobooks`, `/documentaries`, `/education`, `/news`, `/sports`, `/books`, `/culture`, `/gaming`, `/nature-science`, `/language`, `/archives`
- **Shared Implementation Component:** `MediaCategoryPage` (`src/components/MediaCategoryPage.tsx`)
- **Parent Layout:** `Shell`
- **Entry Points:** Sidebar sections "Audio", "Reading", and "Discover".

### Rendered Hierarchy
1. `PageHeader`: Category title, item count badge, provenance indicator.
2. `Hero Stage`: Curated hero banner with category-specific gradient artwork, headline, and "Explore Featured" action.
3. `Subcategory Filter Pills`: Horizontal scrollable filter tags (e.g. for News: `All News`, `Live Broadcasts`, `Investigative`, `Historical Archives`).
4. `Search and Sorting Bar`: In-category keyword search and sort options (`Title`, `Year`, `Popularity`).
5. `Resource Cards Grid`: Responsive card grid (`ResourceCard.tsx`) rendering:
   - Resource thumbnail.
   - Resource badge (`DISCOVERY`, `ARCHIVE`, `PUBLIC DOMAIN`).
   - Title, author/creator, year, format (`Audio`, `Video`, `Text`).
   - "Play Stream" or "Read Book" or "Open Details" action.
6. `Resource Detail Modal`: Opened on card click for full metadata, citation, and playback.

---

## 8. Screen: Global Search (`/search`)

### Identity
- **Screen Name:** Search Hub
- **Exact Route:** `/search`
- **React Component:** `Search`
- **Source File:** `src/screens/Search.tsx`
- **Parent Layout:** `Shell`
- **Entry Points:** Header search input, keyboard shortcut `/`.

### Rendered Hierarchy
1. `PageHeader`: Title "Search".
2. `Search Input Field`: Large prominent search box with clear button and instant debounced query execution.
3. `Filter Pills`: `All Results`, `Movies`, `TV Shows`, `Live Channels`, `EPG Programmes`, `Audio & Media`.
4. `Categorized Result Groups`:
   - Live Channels matching query (with channel mark and "Watch" button).
   - EPG Programmes on now or upcoming matching query.
   - Movies matching title, actor, or director.
   - TV Series matching title or synopsis.
   - Digital Preservation Resources matching subject tags.
5. `Empty Search State`: Helpful tips, popular search keywords, and recent search history.

---

## 9. Screen: Unified Media Library (`/library`)

### Identity
- **Screen Name:** Media Library Hub
- **Exact Route:** `/library`
- **React Component:** `Library`
- **Source File:** `src/screens/Library.tsx`
- **Parent Layout:** `Shell`
- **Entry Points:** Sidebar item "Media Library", keyboard shortcut `6`.

### Rendered Hierarchy
1. `PageHeader`: Title "Media Library", metrics overview (Total titles, Watchlist count, Watched count, Storage used).
2. `Navigation Tabs`:
   - `Continue Watching` (`tab=resume`)
   - `Watchlist` (`tab=watchlist`)
   - `Favourites` (`tab=favourites`)
   - `History` (`tab=recent`)
   - `Watched` (`tab=watched`)
   - `Collections` (`tab=collections`)
   - `DVR Recordings` (`tab=recordings`)
   - `Local Folders` (`tab=local`)
   - `Artwork` (`tab=artwork`)
3. `Tab Content Panels`:
   - Collections Manager: Create, edit, and organize user collections.
   - Local Folders Panel (`LocalMediaTab.tsx`): Scan local hard drives, list media volumes, select directories.
   - Watchlist Grid: Quick-action cards with remove, mark watched, and play.

---

## 10. Screen: Personal Artwork Library (`/artwork` & `/manage/artwork`)

### Identity
- **Screen Name:** Personal Artwork Library
- **Exact Route:** `/artwork` (alias `/manage/artwork`)
- **React Component:** `ArtworkLibraryScreen`
- **Source File:** `src/screens/ArtworkLibraryScreen.tsx`
- **Parent Layout:** `Shell`
- **Entry Points:** Library tab "Artwork", Settings link under "Media Library".

### Rendered Hierarchy
1. `PageHeader`: Title "Personal Artwork Library", actions button "+ Upload Custom Artwork".
2. `Metrics HUD`:
   - Custom Artwork Count.
   - Channel Logos count.
   - Posters & Backdrops count.
   - Storage Used in Kilobytes/Megabytes.
3. `Filter & Search Bar`: Type filter (`All`, `Channel Logos`, `Posters`, `Backdrops`, `Programme Stills`) and search input.
4. `Artwork Grid`: Cards displaying:
   - Image preview thumbnail.
   - Target content identifier (e.g. `BBC One`, `Night of the Living Dead`).
   - Target type badge.
   - Image dimensions and aspect ratio.
   - File size and format.
   - Action buttons: "Replace" and "Restore Automatic".
5. `ArtworkUploadModal`: Drag-and-drop modal with file validation (PNG, JPEG, WebP, GIF under 5MB), aspect ratio detection, and target assignment dropdown.

---

## 11. Screen: Sources Hub (`/sources` and `/sources/add`)

### Identity
- **Screen Name:** Sources & Providers Hub
- **Exact Route:** `/sources` (modal `/sources/add`)
- **React Component:** `Sources` and `AddSource`
- **Source File:** `src/screens/Sources.tsx`
- **Parent Layout:** `Shell`
- **Entry Points:** Sidebar item "Sources", keyboard shortcut `7`.

### Rendered Hierarchy
1. `PageHeader`: Title "Sources", badge showing active source count, "+ Add Source" primary button.
2. `Tabs`:
   - `Active Sources` (`tab=active`): List of connected M3U playlists, Xtream providers, and XMLTV guides with status, channel counts, and refresh buttons.
   - `Discovery Catalogue` (`tab=discovery`): Public IPTV-org catalogue browser by category and country with one-click import.
   - `Xtream Codes` (`tab=xtream`): Xtream API connection panel (Server URL, Username, Password, connection test, category selector).
   - `Technical Details` (`tab=technical`): Network inspection, security policy reports, SSRF guardrail status, and cache controls.
3. `Add Source Dialog / Screen` (`/sources/add`):
   - Radio selector: URL address vs Local M3U/M3U8 file.
   - Address input with URL syntax validation and token privacy notice.
   - Live connection test indicator (`test_source_connection`).
   - XMLTV EPG companion guide pairing input.
   - Import execution button.

---

## 12. Screen: Settings (`/settings` and `/settings/:section`)

### Identity
- **Screen Name:** Settings & Preferences
- **Exact Route:** `/settings` and `/settings/:section`
- **React Component:** `Settings`
- **Source File:** `src/screens/Settings.tsx`
- **Parent Layout:** `Shell`
- **Entry Points:** Sidebar footer item "Settings", keyboard shortcut `8`.

### Rendered Hierarchy
1. `Settings Left Navigation Rail`: Vertical list of 13 setting sections with icons and labels:
   - `Appearance` (`/settings/appearance`)
   - `Playback` (`/settings/playback`)
   - `TV Guide & EPG` (`/settings/epg`)
   - `DVR & Recording` (`/settings/dvr`)
   - `Sources & Providers` (`/settings/sources`)
   - `Media Library` (`/settings/storage`)
   - `Subtitles & Audio` (`/settings/subtitles`)
   - `Notifications` (`/settings/notifications`)
   - `Shortcuts` (`/settings/shortcuts`)
   - `User Profile` (`/settings/profiles`)
   - `Privacy & Security` (`/settings/privacy`)
   - `Advanced` (`/settings/data`)
   - `About Kinora` (`/settings/about`)
2. `Central Configuration Panel`: Rendered controls specific to active section (e.g. Appearance: theme mode buttons, accent color selector, layout density, typography scale, reduce motion toggle).
3. `Right Live Preview Pane`: Real-time interactive preview card showing mini-Kinora layout reflecting chosen theme, accent color, and typography instantly.

---

## 13. Screen: Fullscreen Player (`/watch/:ref`)

### Identity
- **Screen Name:** Video Player
- **Exact Route:** `/watch/:ref`
- **React Component:** `Player`
- **Source File:** `src/screens/Player.tsx`
- **Parent Layout:** Fullscreen (`inPlayer = true`, Sidebar omitted)
- **Entry Points:** "Watch Now", "Watch Live", or clicking any playable media card.

### Rendered Hierarchy
1. `Video Element & Canvas`: Native `<video>` element receiving MSE media stream from HLS.js or Rust `kstream` proxy.
2. `Top Player HUD`:
   - Back button (`<`) navigating to previous route.
   - Title and channel/series information.
   - Stream quality badge (`1080p`, `720p`, `HLS`, `DASH`).
   - Current time and battery/clock indicator.
3. `Bottom Player Control Bar` (auto-hides on inactivity):
   - Play / Pause button.
   - Jump back 10s / Jump forward 30s buttons.
   - Progress / Scrubber Bar with buffered range and live latency markers.
   - Volume slider and Mute button.
   - Audio track selector popup.
   - Subtitle track selector popup.
   - Picture-in-Picture toggle.
   - Fullscreen toggle.
4. `Stream Error & Reconnection Overlay`: Displays honest error reasons (e.g. offline, rate limited, unsupported codec) with "Retry Connection" button.

---

## 14. Screen: First-Run Setup (`/setup`)

### Identity
- **Screen Name:** Setup & Onboarding
- **Exact Route:** `/setup`
- **React Component:** `Setup`
- **Source File:** `src/screens/Setup.tsx`
- **Parent Layout:** Fullscreen (`inPlayer = true`, Sidebar omitted)
- **Entry Points:** First launch when `!setupDone`, or "Run Setup Again" in Settings > Advanced.

### Rendered Hierarchy
1. `Kinora Animated Logo`: Centered brand presentation.
2. `Step Wizard Progress Indicator`: Steps 1 through 4 (Welcome, Profiles, Sources, Appearance).
3. `Wizard Content Card`:
   - Step 1: Welcome and feature summary.
   - Step 2: Create primary profile, set avatar, optional parental PIN lock.
   - Step 3: Connect first IPTV playlist or explore public catalogue.
   - Step 4: Choose theme (Dark / Light / System) and accent color.
4. `Navigation Controls`: "Back" button, "Skip for Now", and "Get Started" / "Finish Setup" primary button.
