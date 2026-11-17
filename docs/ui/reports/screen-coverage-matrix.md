# KinoraTV Screen Coverage Matrix

## Overview

This matrix documents the complete catalog of 34 application screens and interactive states across two permanent screenshot libraries:
1. **Dev Mock** (`docs/ui/dev-mock/`): Deterministic development fixtures, showcase artwork, and sample streaming titles.
2. **User Sources** (`docs/ui/user-sources/`): Genuine user profile with 35 imported playlists, 11,500+ television channels, 14 XMLTV guides, and 20 categories of personal media resources.

All screens are captured at dual viewports:
- Primary Desktop (Full HD): `1920x1080`
- Compact Desktop / Laptop: `1280x800`

## Screenshot Inventory & Coverage Matrix

| # | Screen ID | Route / Interaction | Dev Mock Capture | User Sources Capture | Comparison Overlay | Status |
| :-: | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `home-top.png` | `/` (Top Hero) | Yes (Harbour Lights) | Yes (Live Programme / Title) | `home-top-comparison.png` | Complete |
| 2 | `home-featured-movie.png` | `/` (Carousel: Movie) | Yes (Harbour Lights) | Yes (On-Demand Movie) | `home-featured-movie-comparison.png` | Complete |
| 3 | `home-featured-series.png` | `/` (Carousel: Series) | Yes (Ninth Ward) | Yes (On-Demand Series) | `home-featured-series-comparison.png` | Complete |
| 4 | `home-featured-live-programme.png` | `/` (Carousel: Live) | Yes (Low Orbit) | Yes (Live Airing Broadcast) | `home-featured-live-comparison.png` | Complete |
| 5 | `home-scrolled.png` | `/` (Scrolled Rails) | Yes (Sample Rails) | Yes (Curated For You Rails) | `home-scrolled-comparison.png` | Complete |
| 6 | `live-tv-guide.png` | `/live` | Yes (Demo Guide Grid) | Yes (11,500+ Channel EPG) | `live-tv-guide-comparison.png` | Complete |
| 7 | `live-tv-player.png` | `/live` (Player Docked) | Yes (Sample Stream Dock) | Yes (Active Live Broadcast) | Side-by-side verification | Complete |
| 8 | `movies-top.png` | `/movies` (Top Hero) | Yes (Reference Image 1) | Yes (Streaming Showcase) | `movies-top-comparison.png` | Complete |
| 9 | `movies-rails.png` | `/movies` (Rails) | Yes (Browse by Genre) | Yes (Genre Rails & Collections) | `movies-rails-comparison.png` | Complete |
| 10 | `movie-details.png` | `/movies/:id` | Yes (Harbour Lights) | Yes (Curated Movie Details) | `movie-details-comparison.png` | Complete |
| 11 | `movies-empty.png` | `/movies` (Empty State) | Yes (Filter Empty State) | Yes (Provider Setup Prompt) | `movies-empty-comparison.png` | Complete |
| 12 | `tv-shows-top.png` | `/tv-shows` (Top Hero) | Yes (Reference Image 2) | Yes (Streaming Showcase) | `tv-shows-top-comparison.png` | Complete |
| 13 | `tv-shows-rails.png` | `/tv-shows` (Rails) | Yes (Browse by Genre) | Yes (Genre Rails & Seasons) | `tv-shows-rails-comparison.png` | Complete |
| 14 | `tv-show-details.png` | `/tv-shows/:id` | Yes (Ninth Ward) | Yes (Curated Series Details) | `tv-show-details-comparison.png` | Complete |
| 15 | `tv-shows-empty.png` | `/tv-shows` (Empty State)| Yes (Filter Empty State) | Yes (Provider Setup Prompt) | `tv-shows-empty-comparison.png` | Complete |
| 16 | `radio.png` | `/radio` | Yes (SomaFM / FIP) | Yes (Live Verified Stations) | `radio-comparison.png` | Complete |
| 17 | `music.png` | `/music` | Yes (Ambient / Groove) | Yes (Independent Audio Streams) | Side-by-side verification | Complete |
| 18 | `podcasts.png` | `/podcasts` | Yes (Curated Podcasts) | Yes (RSS Spoken Word Feeds) | Side-by-side verification | Complete |
| 19 | `audiobooks.png` | `/audiobooks` | Yes (LibriVox Showcase) | Yes (Spoken Literature) | Side-by-side verification | Complete |
| 20 | `books.png` | `/books` | Yes (Open Books) | Yes (Project Gutenberg) | Side-by-side verification | Complete |
| 21 | `documentaries.png` | `/documentaries` | Yes (Frontline Showcase) | Yes (Investigative Docs) | Side-by-side verification | Complete |
| 22 | `news.png` | `/news` | Yes (Wire Dispatches) | Yes (Reuters & AP Wire Feeds) | `news-comparison.png` | Complete |
| 23 | `sports.png` | `/sports` | Yes (Olympic / E-Prix) | Yes (Olympic Replays Archive) | `sports-comparison.png` | Complete |
| 24 | `education.png` | `/education` | Yes (MIT / Khan Academy) | Yes (OpenCourseWare Lectures) | `education-comparison.png` | Complete |
| 25 | `culture-arts.png` | `/culture` | Yes (Met & Rijksmuseum) | Yes (Museum Open Access API) | `culture-arts-comparison.png` | Complete |
| 26 | `nature-science.png` | `/nature-science` | Yes (NASA Planetary) | Yes (NASA Live Space Imagery) | `nature-science-comparison.png` | Complete |
| 27 | `gaming.png` | `/gaming` | Yes (Classic Software) | Yes (Strong Museum Collections) | `gaming-comparison.png` | Complete |
| 28 | `language-resources.png` | `/language` | Yes (Endangered Languages)| Yes (ELP Indigenous Archives) | `language-resources-comparison.png`| Complete |
| 29 | `media-archives.png` | `/archives` | Yes (Internet Archive) | Yes (Digital Preservation) | Side-by-side verification | Complete |
| 30 | `search-results.png` | `/search?q=documentary` | Yes (Global Search Hits) | Yes (Unified Multitype Search) | `search-results-comparison.png` | Complete |
| 31 | `library.png` | `/library` | Yes (Watchlist / History) | Yes (Personal Media Library) | `library-comparison.png` | Complete |
| 32 | `sources.png` | `/sources` | Yes (Sources Management)| Yes (35 Playlists & 14 Guides)| `sources-comparison.png` | Complete |
| 33 | `settings.png` | `/settings` | Yes (Theme & Preferences)| Yes (Profile & Guardrails) | `settings-comparison.png` | Complete |
| 34 | `player-controls.png` | `/watch/...` | Yes (Player Overlay) | Yes (Hardware-Accelerated HUD)| Side-by-side verification | Complete |

## Responsive Verification (1280x800)

Responsive verification captures confirm that all layout elements (header navigation, sidebar scrollability, hero banner artwork framing, title action buttons, and grid wrapping) gracefully adapt without horizontal clipping, overlapping controls, or typography collapse.
