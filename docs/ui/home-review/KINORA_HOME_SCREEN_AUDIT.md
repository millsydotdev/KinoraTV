# Kinora 0.6.0 Home Screen Technical Audit

**Audit Date:** 2026-11-22  
**Application Version:** 0.6.0  
**Git Branch:** `v0.6.0`  
**Git Commit:** `d4bb939165903237c7875a02be283d337af6d54f`  
**Reference Captures:**
- Desktop 1080p: [home-desktop-1080p.png](file:///mnt/storage/TVMovie/docs/ui/home-review/audit-evidence/home-desktop-1080p.png) (1920x1080 px)
- Desktop 1440p: [home-desktop-1440p.png](file:///mnt/storage/TVMovie/docs/ui/home-review/audit-evidence/home-desktop-1440p.png) (2560x1440 px)
- TV Mode 1080p: [home-tv-1080p.png](file:///mnt/storage/TVMovie/docs/ui/home-review/audit-evidence/home-tv-1080p.png) (1920x1080 px)
- TV Mode 4K: [home-tv-4k.png](file:///mnt/storage/TVMovie/docs/ui/home-review/audit-evidence/home-tv-4k.png) (3840x2160 px)
- Full-Page Desktop: [home-full-page-desktop.png](file:///mnt/storage/TVMovie/docs/ui/home-review/audit-evidence/home-full-page-desktop.png) (1920x4999 px)
- Full-Page TV: [home-full-page-tv.png](file:///mnt/storage/TVMovie/docs/ui/home-review/audit-evidence/home-full-page-tv.png) (1920x5227 px)

---

## 1. Executive Summary

A comprehensive, code-level and visual audit of the Kinora 0.6.0 Home screen (`/` route) was conducted using live native captures, full-page browser traces, and in-depth static analysis of [Home.tsx](file:///mnt/storage/TVMovie/src/screens/Home.tsx) (1686 lines), [Home.css](file:///mnt/storage/TVMovie/src/screens/Home.css) (1805 lines), child components, and data providers.

While Kinora's underlying playback and native Tauri infrastructure are solid, the Home screen exhibits severe deficiencies in content hierarchy, rail organisation, visual restraint, and TV 10-foot design. The Home screen currently behaves like an uncoordinated dump of disconnected database tables rather than a curated, cinematic front door for a premium media centre.

### Core Discoveries
1. **Severe Section Duplication and Cannibalisation:** Two separate rails ("Public Cinema and Cultural Film Archives" and "Curated Public Cinema and Archives") render the exact same items in nearly identical order. Furthermore, three genre-filtered rails ("Sci-Fi and Space Exploration", "Mystery and Classical Drama", "Comedy and Animation Classics") draw from the exact same tiny pool of 28 public domain films, repeating the same titles across the page up to three times.
2. **Uncontrolled Vertical Sprawl:** The page stretches 4999 pixels high on desktop and 5227 pixels high in TV mode, containing 13 stacked horizontal rails. Users must traverse five full viewport heights to navigate from top to bottom.
3. **Hardcoded Unmanaged Rails:** The "Television Series Archives" rail and the "Your Channels / Your Library" quick-pair ribbon are hardcoded at the bottom of [Home.tsx](file:///mnt/storage/TVMovie/src/screens/Home.tsx), completely bypassing the user's customizable section preferences and display toggles.
4. **Faux Content Cards:** When the "Continue Watching" rail has no active watch progress, it populates itself with four static navigation shortcut cards disguised as media items. This duplicates the sidebar and the Quick Jump ribbon while confusing the user's mental model.
5. **Modal Backdrop Lock:** The companion hub drawer (`HomeSideHub`) in desktop mode injects a dark modal backdrop (`.home-side-hub-backdrop`) that freezes and dims the entire Home page when opened, breaking the intended side-by-side companion workflow.
6. **Red Accent Overuse and Broken Fallback Visuals:** Pure red (`#e50914`) is overused simultaneously for buttons, badges, live indicators, rail tags, and card accents. Cards lacking artwork render an aggressive crimson box with a tiny central icon and clipped text, degrading visual polish.
7. **TV 10-Foot Distance Failures:** On TV mode and 4K displays, metadata text at `0.8125rem` and rail subtitles at `0.875rem` are unreadable from couch distance (3 metres), and hero backdrops suffer from heavy black gradient clipping that obscures actors and artwork.

---

## 2. Architecture and Component Breakdown

### 2.1 Entry Point: `src/screens/Home.tsx`
- **Line Count:** 1686 lines.
- **Responsibilities:** Home page routing, initialisation, remote navigation registration, section preference ordering, EPG querying, hero selection, side hub drawer state, search modal triggers, and rendering all 13 content rails.
- **State Complexity:** Houses 18 top-level hooks (`useState`, `useMemo`, `useCallback`, `useRef`), managing everything from live zap timers to companion panel tabs, search queries, and remote navigation registration.
- **Architectural Flaw:** Massive monolithic file violating separation of concerns. Data querying, scoring algorithms, section rendering, modal management, and keyboard handling are all tangled within a single component.

### 2.2 Featured Hero: `HomeHero` (Lines 89-301)
- **Component File:** Subcomponent within [Home.tsx](file:///mnt/storage/TVMovie/src/screens/Home.tsx#L89-L301).
- **Data Source:** [featuredSelection.ts](file:///mnt/storage/TVMovie/src/lib/featuredSelection.ts), which scores available live channels, recent on-demand items, and curated public domain titles.
- **Visual Presentation:** Fixed height container (480px on desktop, 540px on TV). Uses a background image with CSS linear gradients.
- **Defects:**
  - Aggressive gradient overlays (`linear-gradient(to top, rgba(14, 18, 27, 0.98), transparent)`) consume over 65% of the image area, drowning key artwork details and cropping actors' faces.
  - Text metadata lacks contrast against bright backdrops when gradient falloff is steep.
  - The hero does not adjust dynamically on wide (1440p) or ultra-high-definition (4K) displays, leaving large black expanses.

### 2.3 Companion Drawer: `HomeSideHub` (Lines 304-455)
- **Component File:** Subcomponent within [Home.tsx](file:///mnt/storage/TVMovie/src/screens/Home.tsx#L304-L455).
- **Intended Purpose:** Provide quick access to recent channels, recordings, and audio streams without navigating away from Home.
- **Implementation Reality:** Rendered as a `position: fixed` slide-out drawer on the right edge. When opened, it renders `.home-side-hub-backdrop` with `position: fixed; inset: 0; background: rgba(0, 0, 0, 0.65)`.
- **Defects:** The drawer behaves as an intrusive modal rather than a docking side panel. It locks scrolling, traps focus, and obscures over 40% of the active Home screen.

### 2.4 Rail Container: `ContentRail` (`src/components/ContentRail.tsx`)
- **Responsibilities:** Horizontal scroll wrapper with left and right navigation chevron buttons, keyboard arrow support, and ARIA attributes.
- **Defects:**
  - Lacks virtual scrolling. When rendering 25 items across 13 rails, over 280 DOM nodes are mounted simultaneously, impacting memory and rendering performance.
  - Horizontal scrollbar is hidden with CSS, but scroll transitions lack momentum damping on trackpads.
  - Left/right buttons abruptly appear and disappear based on manual `scrollLeft` polling.

### 2.5 Card Components: `Tiles.tsx` (`src/components/Tiles.tsx`)
- **Rendered Types:** `PosterCard` (2:3), `LandscapeCard` (16:9), `SquareCard` (1:1), and custom inline cards in [Home.tsx](file:///mnt/storage/TVMovie/src/screens/Home.tsx).
- **Defects:**
  - Inconsistent aspect ratios across adjacent rails. For example, "Public Cinema" uses 16:9 landscape cards, while "Sci-Fi" immediately below it uses 2:3 poster cards for items from the exact same archive.
  - Harsh fallback visual: When artwork fails or is missing, `CardArtwork` defaults to a loud red box (`background: #e50914`) with a tiny SVG icon and truncated white text, creating a broken, jarring visual impression.

---

## 3. Comprehensive Section-by-Section Audit

The following table evaluates every section discovered in code and rendered on the live Home route:

| Section ID | Section Title / Name | Component | Data Source | Primary Flaw | Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `hero` | Hero Featured Spotlight | `HomeHero` | `featuredSelection.ts` | Over-darkened backdrop, cropped faces, rigid height | **Redesign** |
| `quick-jump` | Quick Navigation Ribbon | Inline [Home.tsx](file:///mnt/storage/TVMovie/src/screens/Home.tsx#L960) | Static routes | Duplicates sidebar and faux cards | **Redesign** |
| `continue-watching` | Continue Watching / Up Next | `ContentRail` | `mediaLibrary.ts` + Fallbacks | Inserts 4 fake navigation cards when empty | **Redesign** |
| `live-tv` | Live TV Right Now / On Air | `ContentRail` | Active EPG + Channels | Text metadata too small for 10-foot viewing | **Redesign** |
| `trending-popular` | Public Cinema and Cultural Film Archives | `ContentRail` | `publicFilms.slice(0, 10)` | 100% duplicate of `recently-added` rail | **Merge** |
| `audio-highlights` | Live Radio and Spoken Audio | `ContentRail` | `discoveredResources.ts` (Audio) | Inconsistent square cards, lacks audio state | **Redesign** |
| `genre-scifi` | Sci-Fi and Space Exploration | `ContentRail` | `publicFilms` (Sci-Fi tag) | Same 5 films repeated from top archive rail | **Remove** |
| `genre-drama` | Mystery and Classical Drama | `ContentRail` | `publicFilms` (Drama tag) | Thin catalogue (4 items), duplicate titles | **Remove** |
| `genre-comedy` | Comedy and Animation Classics | `ContentRail` | `publicFilms` (Comedy tag) | Thin catalogue (4 items), duplicate titles | **Remove** |
| `recently-added` | Curated Public Cinema and Archives | `ContentRail` | `publicFilms` + `publicSeries` | Complete duplicate of `trending-popular` | **Merge** |
| `realSeriesRail` | Television Series Archives | Inline [Home.tsx](file:///mnt/storage/TVMovie/src/screens/Home.tsx#L1471) | `discoveredResources.ts` | Hardcoded bypass of section settings | **Merge** |
| `home-pair` | Channels and Library Shortcuts | Inline [Home.tsx](file:///mnt/storage/TVMovie/src/screens/Home.tsx#L1622) | Static UI blocks | Hardcoded bypass, duplicates quick jump | **Remove** |
| `companion-hub` | Quick Channel Companion Drawer | `HomeSideHub` | Channel list + Recents | Modal backdrop locks and dims entire screen | **Redesign** |

---

### Detailed Criteria Analysis for Key Sections

#### 1. Hero / Featured Content Spotlight
1. **Purpose:** Showcase high-value featured programming (live broadcasts, newly released VOD, or featured cultural archives) with instant one-click playback.
2. **Component:** `HomeHero` in [Home.tsx](file:///mnt/storage/TVMovie/src/screens/Home.tsx#L89-L301).
3. **Data Source:** `selectFeaturedItem` in [featuredSelection.ts](file:///mnt/storage/TVMovie/src/lib/featuredSelection.ts) scoring channels, library items, and public films.
4. **Content Authenticity:** Real content selected via algorithmic scoring, but fallback handling drops to static public domain films if no live channels are loaded.
5. **Duplication:** Often selects the exact same film that appears as the very first card in the "Public Cinema" rail immediately below.
6. **Card / Visual Design:** 16:9 banner container. Suffers from harsh multi-stop gradients that black out more than half of the artwork.
7. **Content Volume:** Exactly one hero item at a time.
8. **Interactions:** "Watch Now" starts universal playback; "Details" opens the details sheet; "Channel Guide" routes to `/guide`.
9. **Verdict: Redesign.** Needs dynamic responsive height, refined subtle vignette instead of opaque black washes, face-aware backdrop positioning, and integrated audio/live badges.

#### 2. Quick Jump Ribbon
1. **Purpose:** Provide one-tap jump buttons to major sections (Live TV, Movies, Series, Radio, Library).
2. **Component:** Inline section in [Home.tsx](file:///mnt/storage/TVMovie/src/screens/Home.tsx#L960-L1015).
3. **Data Source:** Hardcoded array of route targets.
4. **Content Authenticity:** Pure navigation shortcuts.
5. **Duplication:** Duplicates the existing floating sidebar navigation and duplicates the fake cards inside Continue Watching.
6. **Card / Visual Design:** Pill-shaped glassmorphism buttons with small icons.
7. **Content Volume:** 5 navigation pills.
8. **Interactions:** Router navigation on click.
9. **Verdict: Redesign.** Keep in TV mode as a top quick-filter bar, but integrate seamlessly with the Hero rather than consuming an entire standalone vertical band on desktop.

#### 3. Continue Watching / Jump Back In
1. **Purpose:** Let users immediately resume partially watched movies, series episodes, and recently accessed live channels.
2. **Component:** `ContentRail` in [Home.tsx](file:///mnt/storage/TVMovie/src/screens/Home.tsx#L1020-L1095).
3. **Data Source:** `mediaLibrary.ts` (`getPlaybackProgressList`) combined with local storage progress.
4. **Content Authenticity:** When genuine progress exists, content is 100% authentic. However, when empty, it populates four static mock action cards ("Full TV Guide", "Browse Movies", "Live Radio", "Sources and Playlists").
5. **Duplication:** The four fallback cards duplicate both the Quick Jump bar and the sidebar.
6. **Card / Visual Design:** 16:9 landscape cards with playback progress bar overlay.
7. **Content Volume:** 1 to 10 items when active; 4 fake cards when empty.
8. **Interactions:** Click resumes playback at saved timestamp.
9. **Verdict: Redesign.** Auto-hide the rail entirely when no in-progress media exists. Never render fake navigation cards in a playback rail.

#### 4. Live TV Right Now / On Air
1. **Purpose:** Display currently broadcasting channels with real-time EPG titles and progress bars.
2. **Component:** `ContentRail` in [Home.tsx](file:///mnt/storage/TVMovie/src/screens/Home.tsx#L1130-L1215).
3. **Data Source:** `store.channels` matched with XMLTV EPG schedule data.
4. **Content Authenticity:** 100% authentic channel and guide data.
5. **Duplication:** Does not duplicate other rails. Highly valuable.
6. **Card / Visual Design:** 16:9 landscape cards with channel logo, current programme title, time remaining, and red live broadcast dot.
7. **Content Volume:** 8 to 20 active channels.
8. **Interactions:** One-click instant zapping with live stream playback.
9. **Verdict: Retain and Redesign.** Elevate to Rail 1 position when live channels are available. Enforce 10-foot typography scale for channel callsigns and programme titles.

#### 5. Public Cinema and Cultural Film Archives (`trending-popular`)
1. **Purpose:** Present public domain and cultural archive films.
2. **Component:** `ContentRail` in [Home.tsx](file:///mnt/storage/TVMovie/src/screens/Home.tsx#L1106-L1126).
3. **Data Source:** `publicFilms.slice(0, 10)` from `discoveredResources.ts`.
4. **Content Authenticity:** Authentic public domain catalogue entries.
5. **Duplication:** 100% duplicated by rail `recently-added` ("Curated Public Cinema and Archives") located 2000px further down the page.
6. **Card / Visual Design:** 16:9 landscape cards.
7. **Content Volume:** 10 items.
8. **Interactions:** Opens movie detail view or starts playback.
9. **Verdict: Merge.** Consolidate all public film archives into a single curated rail: "Cultural and Historical Film Vault".

#### 6. Live Radio and Spoken Audio (`audio-highlights`)
1. **Purpose:** Fast access to live internet radio streams, spoken word archives, and music broadcasts.
2. **Component:** `ContentRail` in [Home.tsx](file:///mnt/storage/TVMovie/src/screens/Home.tsx#L1220-L1280).
3. **Data Source:** Audio entries in `discoveredResources.ts`.
4. **Content Authenticity:** Authentic audio stream references.
5. **Duplication:** Unique content.
6. **Card / Visual Design:** 1:1 square cards. Card typography is cramped, and audio frequency visualizers or badges are absent.
7. **Content Volume:** 8 to 12 stations.
8. **Interactions:** Routes to bottom persistent audio player without interrupting video browsing.
9. **Verdict: Retain and Redesign.** Standardize 1:1 card styling, add subtle audio waveform badge, and ensure seamless playback dock integration.

#### 7-9. Genre Split Rails: Sci-Fi, Drama, Comedy
1. **Purpose:** Attempted genre categorization for archive movies.
2. **Component:** `ContentRail` instances (lines 1285-1440).
3. **Data Source:** Slices from `publicFilms` matching genre tags.
4. **Content Authenticity:** Real public domain films, but catalogue depth is only 4 to 6 items per genre.
5. **Duplication:** Severe duplication. Titles like *A Trip to the Moon* and *Carnival of Souls* appear in the top archive rail, then reappear in their respective genre rail, and reappear again in "Curated Public Cinema".
6. **Card / Visual Design:** Abrupt switch from 16:9 landscape to 2:3 vertical poster cards without visual hierarchy justification.
7. **Content Volume:** Only 3 to 6 cards per rail. Feels sparse and hollow.
8. **Interactions:** Opens movie detail.
9. **Verdict: Remove.** Eliminate all three micro-genre rails. A catalogue of 28 titles cannot support four separate rails without severe duplication.

#### 10. Curated Public Cinema and Archives (`recently-added`)
1. **Purpose:** Secondary display of archive films and series.
2. **Component:** `ContentRail` in [Home.tsx](file:///mnt/storage/TVMovie/src/screens/Home.tsx#L1446-L1466).
3. **Data Source:** `[...publicFilms, ...publicSeries].slice(0, 12)`.
4. **Content Authenticity:** Authentic entries.
5. **Duplication:** Direct duplicate of rail 5.
6. **Card / Visual Design:** 16:9 cards identical to rail 5.
7. **Content Volume:** 12 items.
8. **Interactions:** Detail view.
9. **Verdict: Merge.** Merge into the single consolidated "Cultural and Historical Film Vault" rail.

#### 11. Television Series Archives (`realSeriesRail`)
1. **Purpose:** Showcase serialized public domain and cultural television shows.
2. **Component:** Inline rail at lines 1471-1513 of [Home.tsx](file:///mnt/storage/TVMovie/src/screens/Home.tsx).
3. **Data Source:** `publicSeries` from `discoveredResources.ts`.
4. **Content Authenticity:** Authentic series entries.
5. **Duplication:** Unique serialized content.
6. **Card / Visual Design:** 2:3 vertical poster cards.
7. **Content Volume:** 6 to 8 items.
8. **Interactions:** Opens series episode picker.
9. **Verdict: Retain and Manage.** Bring inside the managed section configuration array so it respects user preferences and section toggles.

#### 12. Channels and Library Shortcuts (`home-pair`)
1. **Purpose:** Provide two massive cards linking to Channels and Library.
2. **Component:** Inline section at lines 1622-1645 of [Home.tsx](file:///mnt/storage/TVMovie/src/screens/Home.tsx).
3. **Data Source:** Hardcoded UI blocks.
4. **Content Authenticity:** Static navigation.
5. **Duplication:** 100% redundant with the permanent left sidebar.
6. **Card / Visual Design:** Two giant full-width split cards consuming 360px vertical space at the very bottom of the page.
7. **Content Volume:** Exactly 2 navigation cards.
8. **Interactions:** Router navigation.
9. **Verdict: Remove.** Eliminate entirely. They add zero media value and bloat the bottom of the page.

#### 13. Companion Hub Drawer (`HomeSideHub`)
1. **Purpose:** Rapid zapping and recent media drawer.
2. **Component:** `HomeSideHub` in [Home.tsx](file:///mnt/storage/TVMovie/src/screens/Home.tsx#L304-L455).
3. **Data Source:** Recent channels and active playlist channels.
4. **Content Authenticity:** Authentic user channels.
5. **Duplication:** Overlaps with the Live TV rail.
6. **Card / Visual Design:** Vertical list with channel numbers and current program.
7. **Defects:** Injects an opaque dark modal backdrop (`.home-side-hub-backdrop`) that prevents interacting with the rest of the Home screen.
8. **Interactions:** Channel switching.
9. **Verdict: Redesign.** In desktop mode, transform into a non-blocking docking side panel. In TV mode, disable drawer overlay in favor of the full-screen TV Quick Zap overlay.

---

## 4. Visual Design and Composition Audit

### 4.1 Overall Composition and Layout Density
- **Viewport Sprawl:** The desktop Home page measures 1920x4999 px. At 1080p, that represents 4.6 full screen scrolls. In TV mode, it measures 1920x5227 px (4.8 screen scrolls).
- **Fatiguing Rhythm:** Content is organized as 13 repetitive horizontal strips with identical vertical margins (`margin-bottom: 2.5rem`), creating an uninspired, monotonous rhythm.
- **Unused Horizontal Canvas:** On 1440p (2560px wide) and 4K (3840px wide), the rails extend across the screen, but card sizes do not scale proportionally, resulting in cards appearing tiny and spread too thin.

### 4.2 Hero Section Visual Execution
- **Image Obscuration:** The hero backdrop is heavily masked with multiple overlapping dark gradients (`linear-gradient(90deg, #0e121b 0%, rgba(14,18,27,0.85) 45%, transparent 100%)`). While intended to make text readable, it turns more than half of the artwork into muddy, pitch-black silhouettes.
- **Artwork Cropping:** Artwork is centered without focal-point awareness. On multiple tested titles, character faces are sliced off at the top edge of the 480px container.
- **Button Clustering:** Three distinct buttons ("Watch Now", "Details", "Guide") are clustered with inconsistent visual weights.

### 4.3 Card System and Aspect Ratios
- **Aspect Ratio Confusion:** Kinora currently mixes 16:9 landscape cards, 2:3 movie posters, and 1:1 squares across rails without functional rhyme or reason. A user sees public movies in 16:9, scrolls down, and sees the same movies in 2:3.
- **Ugly Red Fallback Box:** When a channel logo or film poster fails to load, the UI falls back to an intense crimson box (`#e50914`) featuring a tiny generic icon and clipped title text. This immediately makes the application look unpolished and defective.

### 4.4 Typography and 10-Foot Readability
- **Desktop Typography:** Headings are `1.25rem` to `1.5rem` and body metadata is `0.8125rem`. This is legible on a 24-inch monitor at 60 cm.
- **TV Mode Failure:** On TV mode at 3 metres, metadata text at `0.8125rem` is completely illegible. Subtitles beneath rail headers (`0.875rem`) disappear into low contrast against dark backgrounds. TV mode requires a minimum metadata font size of `1.125rem` (18px) and section headers of `1.75rem` to `2.0rem` (28-32px).

### 4.5 Color Language and Accent Fatigue
- **Red Overload:** The accent red (`#e50914`) is used indiscriminately for:
  - Hero primary CTA button.
  - Active sidebar navigation pill.
  - "Jump Back In" card badges.
  - Live broadcast pulsing dot.
  - Radio station badges.
  - Artwork missing fallback box.
  - Channel number highlights.
- **Visual Impact:** When everything is red, nothing stands out. The interface loses visual hierarchy and tires the user's eyes.

---

## 5. Data Architecture, Deduplication, and Query Flaws

### 5.1 Redundant Data Queries and Fragmentation
In [Home.tsx](file:///mnt/storage/TVMovie/src/screens/Home.tsx), content is retrieved through multiple fragmented queries that pull from the same static file:
```typescript
// Fragmented slices of the same 28 public domain films:
const publicFilms = discoveredResources.filter(r => r.type === 'movie');
const publicSeries = discoveredResources.filter(r => r.type === 'series');

// Rail 'trending-popular' (Line 1106)
const trendingItems = publicFilms.slice(0, 10);

// Rail 'recently-added' (Line 1446)
const recentlyAdded = [...publicFilms, ...publicSeries].slice(0, 12);

// Rail 'genre-scifi' (Line 1285)
const scifiItems = publicFilms.filter(r => r.genre?.includes('Sci-Fi'));
```
Because the underlying array has only 28 movies, `trendingItems` and `recentlyAdded` contain virtually identical elements. An item like *Night of the Living Dead* is processed and rendered multiple times in the same DOM tree.

### 5.2 Hardcoded Section Bypass
In [userPreferences.ts](file:///mnt/storage/TVMovie/src/state/userPreferences.ts), users can configure their Home sections through `DEFAULT_HOME_SECTIONS`. However, in [Home.tsx](file:///mnt/storage/TVMovie/src/screens/Home.tsx), two sections completely bypass this system:
1. `realSeriesRail` (Lines 1471-1513): Injected into the JSX outside `{renderedSections}`.
2. `home-pair` (Lines 1622-1645): Injected into the JSX outside `{renderedSections}`.
Even if a user disables all sections in Settings, these two sections continue to render, breaking user customisation.

### 5.3 Faux Content Injection
In [Home.tsx](file:///mnt/storage/TVMovie/src/screens/Home.tsx#L1040-L1080), when `continueWatching.length === 0`, the code injects synthetic content cards:
```typescript
{
  id: 'action-live',
  title: 'Full TV Guide & Channels',
  type: 'shortcut',
  // ...
}
```
This violates UI honesty. A "Continue Watching" rail must only display media that is actually in progress. If no media is in progress, the rail must be omitted from the DOM.

---

## 6. Interaction, Remote Navigation, and Focus Mechanics

### 6.1 Spatial D-Pad Navigation (`remoteNav.ts`)
- **Focus Trap with Drawer:** When `HomeSideHub` is opened, spatial navigation fails to constrain focus within the drawer. Pressing Arrow Left causes focus to jump behind the drawer into the dimmed Home content, trapping the user.
- **Horizontal Rail Over-scrolling:** When navigating across a rail using gamepad or remote arrow keys, focus jumps ahead of the scroll container's smooth animation, causing the focused card to be partially clipped by the screen boundary.

### 6.2 TV vs Desktop Input Parity
- **Desktop:** Mouse wheel scrolling works, but horizontal rail scrollbars are hidden, forcing desktop users to click tiny chevron buttons.
- **TV Mode:** Keyboard and D-pad navigation works well on high-level rails, but lacks quick-jump shortcuts to skip across 5 vertical screen heights.

---

## 7. Prioritised Defect Classification

### Priority 0: Critical Defects (Functional / Structural)
1. **[DEFECT-P0-01] Identical Duplicate Rails:** `trending-popular` and `recently-added` render the identical public domain film collection on the same page.
2. **[DEFECT-P0-02] Hardcoded Section Bypass:** `realSeriesRail` and `home-pair` bypass `renderedSections` and render regardless of user configuration.
3. **[DEFECT-P0-03] Fake Action Cards in Continue Watching:** Empty resume state injects 4 navigation shortcuts into a media rail.
4. **[DEFECT-P0-04] Companion Hub Modal Lock:** Opening `HomeSideHub` locks and dims the desktop interface behind an intrusive backdrop.

### Priority 1: Major Usability and Visual Defects
1. **[DEFECT-P1-01] 5000px Vertical Sprawl:** 13 repetitive rails cause severe user fatigue and unnecessary DOM bloat.
2. **[DEFECT-P1-02] TV 10-Foot Distance Illegibility:** Metadata fonts at `0.8125rem` and rail subtitles at `0.875rem` cannot be read at 3 metres.
3. **[DEFECT-P1-03] Indiscriminate Red Accent Overuse:** `#e50914` is applied across 8 conflicting UI elements simultaneously.
4. **[DEFECT-P1-04] Jarring Red Artwork Fallback Box:** Missing posters render a loud crimson box that appears broken.
5. **[DEFECT-P1-05] Hero Backdrop Face Cropping:** Aggressive gradient masks and fixed 480px height obscure key artwork and decapitate actors.

### Priority 2: Consistency and Content Defects
1. **[DEFECT-P2-01] Micro-Genre Rail Cannibalisation:** Sci-Fi, Drama, and Comedy rails carve up a 28-item catalogue into tiny 3-card rails that duplicate the main archive rail.
2. **[DEFECT-P2-02] Inconsistent Card Aspect Ratios:** Adjacent rails arbitrarily switch between 16:9, 2:3, and 1:1 without functional logic.
3. **[DEFECT-P2-03] Redundant Bottom Navigation Pair:** Giant "Your Channels" and "Your Library" cards duplicate the permanent sidebar.

### Priority 3: Polish and Styling Refinements
1. **[DEFECT-P3-01] Rail Chevron Button Pop-in:** Horizontal scroll buttons abruptly appear and disappear without opacity transitions.
2. **[DEFECT-P3-02] Missing Audio Waveform Badges:** Audio cards look like silent video cards without audio status cues.
3. **[DEFECT-P3-03] 4K Backdrop Void:** Hero backdrop fails to stretch gracefully on 3840px wide displays.

---

## 8. Audit Conclusion and Verdict

The Kinora Home screen requires a decisive architectural consolidation. The solution is not minor CSS tweaking; it requires:
1. Slashing total rails from 13 down to 6-7 high-impact, curated rails.
2. Introducing a global deduplication engine that prevents any media title from appearing twice on the page.
3. Completely eliminating faux content cards and hardcoded rail bypasses.
4. Elevating TV 10-foot typography and establishing a disciplined, cinematic card design system.
5. Replacing the harsh crimson fallback boxes with elegant slate gradients and clean typography.

The detailed architectural plan for this transformation is specified in [KINORA_HOME_REDESIGN_BLUEPRINT.md](file:///mnt/storage/TVMovie/docs/ui/home-review/KINORA_HOME_REDESIGN_BLUEPRINT.md).
