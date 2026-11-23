# Kinora 0.6.0 Home Screen Redesign Blueprint

**Document Version:** 1.0.0  
**Target Release:** 0.6.0 UI Modernisation  
**Author:** Antigravity Engineering and Design  
**Date:** 2026-11-22  
**Companion Document:** [KINORA_HOME_SCREEN_AUDIT.md](file:///mnt/storage/TVMovie/docs/ui/home-review/KINORA_HOME_SCREEN_AUDIT.md)  
**Strict Typography Rule:** Zero em-dashes and zero en-dashes. Hyphens (-), colons (:), or parentheses () only.

---

## 1. Vision and Guiding Principles

The objective of the Kinora Home Screen Redesign is to transform Kinora from a fragmented database index into a premier, cinematic television and film experience. The redesigned Home screen honours both lean-back 10-foot living room viewing and rapid desktop interaction, without sacrificing performance, battery efficiency, or architectural integrity.

### Core Principles
1. **Curated, Not Exhaustive:** Quality over quantity. Replace 13 repetitive, fragmented rails with 6-7 purposeful, dense, high-impact content rails.
2. **Global Deduplication:** No film, series, or channel may ever appear more than once on the Home screen. Once an item is featured in the Hero or a higher rail, lower rails automatically filter it out.
3. **Honest UI and Zero Faux Cards:** Every card on a media rail must represent playable media. Never inject static navigation shortcuts or fake placeholders into playback rails. If no media is in progress, the rail disappears cleanly.
4. **Cinematic Immersion with Respect for Artwork:** Hero backdrops must display actors, typography, and background art clearly without drowning them in opaque black gradients.
5. **Restrained Color Architecture:** Eliminate the overwhelming red accent overuse. Pure red (`#e50914`) is reserved exclusively for urgent live broadcast status and primary hero playback action. Secondary badges, categories, and card accents transition to refined neutral slates and subtle glows.
6. **TV and Desktop Parity:** Deliver complete feature and navigation parity across Desktop and TV modes while strictly respecting 10-foot viewing ergonomics (minimum 18px body metadata, 32px section headers on TV).

---

## 2. Redesigned Screen Hierarchy and Rail Architecture

The redesigned Home screen consolidates the experience into a maximum of 6-7 structured sections, reducing vertical page height from 4999px down to a focused 2200px-2600px.

```
+---------------------------------------------------------------------------------------+
| FLOATING SIDEBAR (Preserved) | MAIN CONTENT VIEWPORT                                  |
|                              |                                                        |
| [Kinora Logo]                | [1] CINEMATIC HERO SPOTLIGHT                           |
|                              |     - High-resolution 16:9 backdrop with subtle edges  |
| - Home (Active)              |     - Title, year, rating, genre, curated synopsis     |
| - Live TV                    |     - [Watch Now] [Details] [Audio/Channel Pill]       |
| - Movies                     +--------------------------------------------------------+
| - Series                     | [2] ADAPTIVE QUICK JUMP BAR (TV Mode Filter Pill Row)   |
| - Audio                      +--------------------------------------------------------+
| - Guide                      | [3] RAIL 1: CONTINUE WATCHING (Auto-hides if empty)    |
| - Library                    +--------------------------------------------------------+
|                              | [4] RAIL 2: ON AIR NOW (Live TV with EPG progress)     |
| [Settings]                   +--------------------------------------------------------+
| [Profile]                    | [5] RAIL 3: CURATED SPOTLIGHT (VOD Movies & Series)    |
|                              +--------------------------------------------------------+
|                              | [6] RAIL 4: LIVE RADIO & AUDIO LOUNGE (1:1 Squares)    |
|                              +--------------------------------------------------------+
|                              | [7] RAIL 5: CULTURAL FILM VAULT (Consolidated Archives)|
|                              +--------------------------------------------------------+
|                              | [8] RAIL 6: YOUR LIBRARY QUICK ACCESS (Watchlist/Recs) |
+---------------------------------------------------------------------------------------+
```

### Detailed Rail Specifications

#### 1. Cinematic Hero Spotlight
- **Placement:** Top of viewport, immediately below PageHeader.
- **Card Format:** Full-width adaptive 16:9 cinematic canvas (min-height 520px on desktop, 620px on TV mode).
- **Backdrop Treatment:** High-resolution backdrop with radial edge vignettes instead of 70% black horizontal washes. Ensures actors' faces and artistic elements remain completely visible.
- **Metadata Stack:**
  - Content badge: `LIVE BROADCAST`, `FEATURE FILM`, or `SERIES ARCHIVE`.
  - Content Title: Inter Display 700, 2.5rem (desktop), 3.5rem (TV mode).
  - Metadata ribbon: Release Year, Content Rating (PG, 18+, etc.), Runtime / Time Remaining, Audio Format (Dolby 5.1 / Stereo), Genre tags.
  - Curated logline: Maximum 2 lines, clamped with ellipsis.
- **Actions:**
  - Primary CTA: Red Accent (`#e50914`) `Watch Now` button with play triangle.
  - Secondary CTA: Translucent glass `Details` button with information icon.
  - Tertiary CTA (Conditional): `Channel Guide` or `Full Series` link.

#### 2. Adaptive Quick Jump Ribbon
- **Placement:** Positioned immediately beneath Hero in TV mode; integrated into top header utility bar in desktop mode.
- **Functionality:** Instant filter pills that smoothly scroll the page to corresponding rails or navigate to deep catalog routes (`Live TV`, `Movies`, `Series`, `Radio`, `Library`).
- **Visual Design:** Glassmorphic capsules (`background: rgba(255, 255, 255, 0.08)`) with 1px border. On focus/hover: bright white outline with subtle ambient glow.

#### 3. Rail 1: Continue Watching / Up Next
- **Visibility Rule:** Strict conditional rendering (`items.length > 0`). If no in-progress media exists, this entire section is omitted from the DOM. Zero fake action cards.
- **Card Format:** 16:9 Landscape Card (`320px x 180px` on desktop, `400px x 225px` on TV).
- **Card Metadata:**
  - Channel / Show name (top-left badge).
  - Episode title or film name.
  - Progress bar at card bottom (2px inactive slate, bright red active indicator).
  - Remaining time badge: e.g., `24m left`.
- **Primary Interaction:** Pressing Enter or clicking resumes instant playback from the recorded second.

#### 4. Rail 2: On Air Now (Live Broadcast TV)
- **Visibility Rule:** Renders whenever user has active live playlist channels or demo channels.
- **Card Format:** 16:9 Landscape Card with live broadcast overlay.
- **Card Metadata:**
  - Top-left: Channel Logo (guarded fetch) and Channel Number.
  - Top-right: Red pulsing `LIVE` badge.
  - Card Center/Bottom: Current broadcast title and start/end time.
  - EPG Progress indicator: Thin live elapsed bar showing exact broadcast percentage.
- **Interaction:** One-click instant zapping directly into full-screen or persistent docked player.

#### 5. Rail 3: Curated Spotlight / Trending Cinema
- **Visibility Rule:** Highest-rated VOD movies and television series from active Xtream or local library sources.
- **Card Format:** 2:3 Vertical Poster Card (`180px x 270px` on desktop, `240px x 360px` on TV).
- **Card Metadata:** Title, Release Year, Star Rating, Genre.
- **Deduplication:** Excludes any item selected by the Hero.

#### 6. Rail 4: Live Radio and Spoken Audio Lounge
- **Visibility Rule:** Populated by curated audio stations and radio streams from `discoveredResources.ts`.
- **Card Format:** 1:1 Square Card (`160px x 160px` on desktop, `200px x 200px` on TV).
- **Visual Distinction:** Circular station logo surrounded by elegant dark slate bevel. Animated equalizer waveform icon appears when the station is playing.
- **Interaction:** Plays directly in the background audio player bar without stopping on-screen video browsing.

#### 7. Rail 5: Cultural and Historical Film Vault
- **Consolidation:** Merges the four redundant archive rails (`trending-popular`, `genre-scifi`, `genre-drama`, `recently-added`) into one master curated rail.
- **Card Format:** 2:3 Vertical Poster Card with archival provenance badge (`Internet Archive`, `NFB Canada`, `Prelinger`).
- **Total Depth:** Curated selection of 16-20 unique archive masterpieces with zero duplicate titles.

#### 8. Rail 6: Your Library Quick Access
- **Functionality:** Replaces the broken hardcoded bottom pair with a clean horizontal shelf of active user collections:
  - `Watchlist` (most recently bookmarked titles).
  - `Favorite Channels` (top 6 pinned channels).
  - `DVR Recordings` (completed local captures).
- **Card Format:** 16:9 Landscape Card with collection thumbnail grid.

---

## 3. Standardized Design System and Card Specifications

To eliminate visual chaos, all Home cards adhere strictly to three standardised aspect ratios:

| Card Type | Aspect Ratio | Desktop Size | TV 10-Foot Size | Target Content |
| :--- | :--- | :--- | :--- | :--- |
| **Poster Card** | 2:3 | 180 x 270 px | 240 x 360 px | Feature Films, TV Series, VOD Collections |
| **Landscape Card** | 16:9 | 320 x 180 px | 400 x 225 px | Live TV Broadcasts, In-Progress Media, Episodes |
| **Square Card** | 1:1 | 160 x 160 px | 200 x 200 px | Radio Stations, Podcasts, Audio Streams |

### Professional Fallback Artwork System
Replace the broken crimson red box (`#e50914`) with a luxury dark slate styling when posters or channel logos fail to load:
1. **Background:** Deep slate gradient (`linear-gradient(135deg, #1a2234 0%, #0d131f 100%)`).
2. **Subtle Texture:** Soft geometric SVG film reel or antenna watermark with 4% opacity.
3. **Typography:** Centered 2-letter uppercase initials in Inter 600 (`color: rgba(255, 255, 255, 0.75)`).
4. **Category Stamp:** Micro pill badge at the card bottom: `FILM`, `TV`, `RADIO`, or `AUDIO` (`background: rgba(255, 255, 255, 0.08)`).
5. **Border:** Delicate 1px neutral border (`rgba(255, 255, 255, 0.06)`).

---

## 4. Typography Scale for Desktop and TV Modes

Readability across devices is guaranteed by strict adherence to viewport-dependent typography:

| UI Element | Desktop Size | Desktop Weight | TV Mode Size (10-Foot) | TV Mode Weight | TV Minimum Contrast |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Hero Title** | 2.50rem (40px) | 800 (Bold) | 3.50rem (56px) | 800 (Bold) | 9:1 |
| **Hero Synopsis** | 1.00rem (16px) | 400 (Regular) | 1.375rem (22px) | 400 (Regular) | 7:1 |
| **Section Header** | 1.375rem (22px) | 700 (Semi) | 1.875rem (30px) | 700 (Semi) | 8:1 |
| **Section Subtitle**| 0.875rem (14px) | 400 (Regular) | 1.125rem (18px) | 500 (Medium) | 6:1 |
| **Card Title** | 0.9375rem (15px)| 600 (Semi) | 1.25rem (20px) | 600 (Semi) | 7:1 |
| **Card Metadata** | 0.8125rem (13px)| 400 (Regular) | 1.0625rem (17px)| 500 (Medium) | 5.5:1 |
| **Badge / Status** | 0.75rem (12px) | 700 (Bold) | 0.9375rem (15px)| 700 (Bold) | 6:1 |

---

## 5. Global Deduplication and Content Pipeline

To prevent title cannibalisation, a centralized deduplication helper will govern the Home feed:

```typescript
// Proposed pipeline architecture in src/lib/homeFeed.ts:
export interface HomeFeedState {
  seenIds: Set<string>;
  heroItem: ContentItem | null;
  continueWatching: PlaybackProgress[];
  liveChannels: ChannelProgress[];
  curatedCinema: ContentItem[];
  audioLounges: AudioItem[];
  culturalVault: ContentItem[];
  userLibrary: LibraryItem[];
}

export function buildDeduplicatedHomeFeed(sources: RawHomeSources): HomeFeedState {
  const seenIds = new Set<string>();

  // 1. Select hero and register its ID
  const heroItem = selectHeroItem(sources, seenIds);
  if (heroItem) seenIds.add(heroItem.id);

  // 2. Select genuine continue watching (filter fake shortcuts)
  const continueWatching = sources.progressList.filter(item => item.percent > 0 && item.percent < 98);
  continueWatching.forEach(item => seenIds.add(item.id));

  // 3. Process live channels with real EPG
  const liveChannels = sources.liveChannels.slice(0, 15);

  // 4. Curate VOD cinema, excluding anything already seen
  const curatedCinema = sources.vodMovies
    .filter(item => !seenIds.has(item.id))
    .slice(0, 15);
  curatedCinema.forEach(item => seenIds.add(item.id));

  // 5. Consolidate cultural vault without repeating titles
  const culturalVault = sources.publicArchives
    .filter(item => !seenIds.has(item.id))
    .slice(0, 18);
  culturalVault.forEach(item => seenIds.add(item.id));

  return { seenIds, heroItem, continueWatching, liveChannels, curatedCinema, audioLounges, culturalVault, userLibrary };
}
```

---

## 6. Detailed ASCII Wireframes

### 6.1 Desktop Mode Layout (1920 x 1080)

```
+----------------------------------------------------------------------------------------------------------------------+
| [K] KINORA      | [Search movies, channels, radio...               ] | [Mode: Desktop] [Live Hub] [Profile]          |
+----------------------------------------------------------------------------------------------------------------------+
| [SIDEBAR]       |                                                                                                    |
|                 | +------------------------------------------------------------------------------------------------+ |
| Home (Active)   | | FEATURE FILM SPOTLIGHT                                                   [ 4K UHD | 2h 14m ]   | |
| Live TV         | | METROPOLIS (1927)                                                                              | |
| Movies          | | Sci-Fi / Classical Drama                                                                       | |
| Series          | | In a futuristic city sharply divided between working class and city planners, the son of the   | |
| Audio           | | city's mastermind falls in love with a prophet of the working class.                           | |
| Guide           | |                                                                                                | |
| Library         | | [ > Watch Now ]   [ (i) Movie Details ]   [ + Watchlist ]                                      | |
|                 | +------------------------------------------------------------------------------------------------+ |
|                 |                                                                                                    |
| [Settings]      | CONTINUE WATCHING                                                                                  |
| [Exit]          | +-------------------+  +-------------------+  +-------------------+  +-------------------+       | |
|                 | | BBC News 24       |  | Night of the Liv..|  | The General       |  | Voyage Dans La .. |       | |
|                 | | 42m elapsed       |  | 54m remaining     |  | 18m remaining     |  | 8m remaining      |       | |
|                 | | [=========------] |  | [============---] |  | [====------------] |  | [===============] |       | |
|                 | +-------------------+  +-------------------+  +-------------------+  +-------------------+       | |
|                 |                                                                                                    |
|                 | ON AIR RIGHT NOW                                                                                   |
|                 | +-------------------+  +-------------------+  +-------------------+  +-------------------+       | |
|                 | | [LIVE] Sky News   |  | [LIVE] NASA TV    |  | [LIVE] France 24  |  | [LIVE] EuroNews   |       | |
|                 | | Press Conference  |  | ISS Space Walk    |  | World News Digest |  | Business Weekly   |       | |
|                 | | [======---------] |  | [==========-----] |  | [===-------------] |  | [========--------] |       | |
|                 | +-------------------+  +-------------------+  +-------------------+  +-------------------+       | |
|                 |                                                                                                    |
|                 | CURATED SPOTLIGHT                                                                                  |
|                 | +-------------+  +-------------+  +-------------+  +-------------+  +-------------+  +-----------+ | |
|                 | | [Poster]    |  | [Poster]    |  | [Poster]    |  | [Poster]    |  | [Poster]    |  | [Poster]  | | |
|                 | | Charade     |  | His Girl Fr.|  | Cyrano De B.|  | Carnival of |  | The Stranger|  | M (1931)  | | |
|                 | | 1963 - PG   |  | 1940 - PG   |  | 1950 - 12   |  | 1962 - 15   |  | 1946 - PG   |  | 1931 - 18 | | |
|                 | +-------------+  +-------------+  +-------------+  +-------------+  +-------------+  +-----------+ | |
|                 |                                                                                                    |
|                 | LIVE RADIO AND SPOKEN AUDIO                                                                        |
|                 | +-----------+  +-----------+  +-----------+  +-----------+  +-----------+  +-----------+           | |
|                 | | [Square]  |  | [Square]  |  | [Square]  |  | [Square]  |  | [Square]  |  | [Square]  |           | |
|                 | | BBC R4    |  | NPR News  |  | KEXP 90.3 |  | FIP Radio |  | Jazz24     |  | SomaFM    |           | |
|                 | | Talk/News |  | News/Pod  |  | Eclectic  |  | World/Elec|  | Smooth Jz  |  | Ambient   |           | |
|                 | +-----------+  +-----------+  +-----------+  +-----------+  +-----------+  +-----------+           | |
+-----------------+----------------------------------------------------------------------------------------------------+
| PERSISTENT PLAYER DOCK (When active): [||] Now Playing: BBC News 24 (Live)                [Vol: 80%] [Full Screen]   |
+----------------------------------------------------------------------------------------------------------------------+
```

### 6.2 TV 10-Foot Mode Layout (1920 x 1080 & 4K Scaled)

```
+----------------------------------------------------------------------------------------------------------------------+
| [K] KINORA TV                           10:45 PM | [Search] | [Live Zap] | [Mode: TV] | Profile: Default         |
+----------------------------------------------------------------------------------------------------------------------+
| [SIDEBAR]       |                                                                                                    |
|                 | +------------------------------------------------------------------------------------------------+ |
| [Home] (Focus)  | | [LIVE BROADCAST] ON AIR NOW                                                      NASA TV HD    | |
| [Live TV]       | | EXPEDITION 72 SPACEWALK LIVE DOCKED                                                            | |
| [Movies]        | | Science & Space Exploration                                                                    | |
| [Series]        | | Real-time live ultra-high-definition coverage of astronauts conducting solar array maintenance | |
| [Audio]         | | outside the International Space Station.                                                       | |
| [Guide]         | |                                                                                                | |
| [Library]       | | [ > WATCH LIVE BROADCAST ] (FOCUSED: GOLD RING)      [ (i) CHANNEL SCHEDULE ]                    | |
|                 | +------------------------------------------------------------------------------------------------+ |
|                 |                                                                                                    |
|                 | [ Live TV ]   [ Movies ]   [ TV Series ]   [ Radio ]   [ Library ]  (Quick Filter Pills)           |
|                 |                                                                                                    |
|                 | CONTINUE WATCHING                                                                                  |
|                 | +----------------------+  +----------------------+  +----------------------+                       | |
|                 | | [Landscape Card]     |  | [Landscape Card]     |  | [Landscape Card]     |                       | |
|                 | | Metropolis (1927)    |  | BBC World News       |  | Plan 9 from Outer Sp |                       | |
|                 | | 1h 12m remaining     |  | Live Broadcast       |  | 25m remaining        |                       | |
|                 | | [=========---------] |  | [==================] |  | [===----------------] |                       | |
|                 | +----------------------+  +----------------------+  +----------------------+                       | |
|                 |                                                                                                    |
|                 | LIVE TV RIGHT NOW                                                                                  |
|                 | +----------------------+  +----------------------+  +----------------------+                       | |
|                 | | [Landscape Card]     |  | [Landscape Card]     |  | [Landscape Card]     |                       | |
|                 | | BBC News HD          |  | Sky News             |  | Al Jazeera English   |                       | |
|                 | | Prime Minister Qs    |  | World Report Live    |  | News Hour Special    |                       | |
|                 | | [========----------] |  | [============------] |  | [====---------------] |                       | |
|                 | +----------------------+  +----------------------+  +----------------------+                       | |
|                 |                                                                                                    |
|                 | CURATED SPOTLIGHT FILMS                                                                            |
|                 | +----------------+  +----------------+  +----------------+  +----------------+                     | |
|                 | | [Poster Card]  |  | [Poster Card]  |  | [Poster Card]  |  | [Poster Card]  |                     | |
|                 | | Charade (1963) |  | M (1931)       |  | The Stranger   |  | Carnival Souls |                     | |
|                 | | Mystery / 1h53m|  | Crime / 1h57m  |  | Drama / 1h35m  |  | Horror / 1h18m |                     | |
|                 | +----------------+  +----------------+  +----------------+  +----------------+                     | |
+----------------------------------------------------------------------------------------------------------------------+
| REMOTE INSTRUCTIONS: [D-Pad] Navigate  |  [OK] Select/Play  |  [Back] Top of Page / Sidebar  |  [*] Options          |
+----------------------------------------------------------------------------------------------------------------------+
```

---

## 7. Desktop vs. TV Mode Divergence Strategy

| Dimension | Desktop Mode | TV 10-Foot Mode |
| :--- | :--- | :--- |
| **Input Driver** | Mouse, Trackpad, Wheel, Keyboard | Remote D-Pad, Gamepad, Numeric Zap Keys |
| **Hero Height** | 520px fixed max | 620px min-height, scaled for 10-foot legibility |
| **Quick Jump Bar**| Integrated in top header bar | Prominent full-width pill ribbon below Hero |
| **Card Dimensions** | Standardized Desktop (180x270, 320x180) | Enlarged TV (240x360, 400x225) |
| **Focus Indicator**| 1px subtle highlight on hover/active | 3px high-contrast glowing gold/white focus ring |
| **Scroll Controls**| Clickable Left/Right chevron buttons | D-Pad snapping with auto-scroll lock |
| **Companion Drawer**| Non-blocking docked right panel | Disabled; replaced with full-screen TV Zap HUD |
| **Typography Base**| Base 16px (1rem), metadata 13px | Base 20px (1.25rem), metadata 17px |

---

## 8. Implementation Phases and Execution Sequence

### Phase 1: Data Pipeline Consolidation and Deduplication Engine
- Create `src/lib/homeFeed.ts` containing `buildDeduplicatedHomeFeed`.
- Eliminate multiple disjoint queries from `discoveredResources.ts`.
- Merge `trending-popular`, `genre-scifi`, `genre-drama`, `genre-comedy`, and `recently-added` into a single sorted archive feed.
- Strip synthetic action cards from Continue Watching; enforce auto-hiding when progress array is empty.

### Phase 2: Card Design System and Professional Fallbacks
- Standardize `PosterCard` (2:3), `LandscapeCard` (16:9), and `SquareCard` (1:1) in `src/components/Tiles.tsx`.
- Replace the crimson `#e50914` missing artwork box with the deep slate gradient and typography system.
- Add audio equalizer animation indicator to square audio cards.

### Phase 3: Hero Section Modernisation (`HomeHero`)
- Refactor `HomeHero` in `src/screens/Home.tsx` to support dynamic viewport height and responsive focal-point alignment.
- Replace harsh multi-stop linear black gradients with soft radial vignettes.
- Refine metadata stack and button styling to respect the restrained red palette.

### Phase 4: Home Layout and Section Management Overhaul
- Refactor `src/screens/Home.tsx` to consume `homeFeed.ts`.
- Reduce rendered rail count from 13 down to 6-7 high-impact rails.
- Remove hardcoded bypasses (`realSeriesRail` and `home-pair`), integrating them into user preference controls.
- Transform `HomeSideHub` into a non-blocking docking panel for desktop, and remove `.home-side-hub-backdrop`.

### Phase 5: TV 10-Foot Mode and Spatial Navigation Tuning
- Enhance `src/screens/Home.css` with dedicated TV mode scaling rules:
  - Enforce minimum font sizes: headers `1.875rem`, body `1.25rem`, metadata `1.0625rem`.
  - Add 3px glowing focus ring for D-pad navigation.
- Audit D-pad spatial flow in `src/lib/remoteNav.ts` to ensure smooth jumping between the Sidebar, Hero, and Rails.

### Phase 6: Quality Assurance, Regression, and Visual Verification
- Run full automated test suite: `npm test` and `npm run test:rust`.
- Capture full-page 1080p and 4K screenshots of the rebuilt Home screen to verify zero visual regressions.
- Verify that application version remains exactly `0.6.0`.

---

## 9. File Modification Map

The following files are designated for modification in the upcoming implementation stage:

1. **`src/screens/Home.tsx`:** Primary refactoring target. Reduce file size from 1686 lines to under 800 lines by delegating feed creation to `homeFeed.ts` and removing redundant rail blocks.
2. **`src/screens/Home.css`:** Streamline styles from 1805 lines. Eliminate modal backdrops, implement responsive card ratios, and tune 10-foot TV mode variables.
3. **`src/lib/homeFeed.ts` (New File):** Central deduplication engine and content pipeline.
4. **`src/components/Tiles.tsx`:** Standardize aspect ratios and implement luxury dark slate fallback artwork.
5. **`src/state/userPreferences.ts`:** Update `DEFAULT_HOME_SECTIONS` to reflect the consolidated 6-7 rail structure.

---

## 10. Risk Analysis and Mitigation

| Risk | Impact | Likelihood | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **TV Spatial Navigation Trap** | High | Low | Retain existing `remoteNav.ts` registration hooks; test D-pad navigation across all rails using keyboard simulation before merging. |
| **User Preference Desynchronisation**| Medium | Medium | Implement automated schema migration in `userPreferences.ts` that maps legacy rail IDs to the new consolidated rail IDs. |
| **Performance Regression on Rails** | Medium | Low | Ensure horizontal rails do not render off-screen DOM nodes unnecessarily; maintain lightweight card wrappers. |
| **Breaking Universal Playback** | High | Zero | All card click handlers continue to call `handlePlay` in `src/state/playbackContext.tsx` unchanged. |
| **Sidebar Layout Shift** | High | Zero | The floating left sidebar (`Sidebar.tsx`) remains 100% untouched. |
