# 04 Component Hierarchy and Usage

This document establishes the complete component inventory, parent-child hierarchies, and usage patterns across Kinora.

---

## 1. Global Application Component Hierarchy Tree

```
<App> (src/App.tsx)
  └── <BrowserRouter> (react-router-dom)
      └── <ProfileProvider> (src/state/profiles.tsx)
          └── <StoreProvider> (src/state/store.tsx)
              └── <LocalMediaProvider> (src/state/localMedia.tsx)
                  └── <NotificationProvider> (src/components/Notifications.tsx)
                      └── <BackgroundTaskProvider> (src/components/BackgroundTaskCenter.tsx)
                          └── <ToastProvider> (src/components/Toast.tsx)
                              └── <Shell> (src/App.tsx)
                                  ├── <OfflineBanner> (src/components/OfflineBanner.tsx)
                                  ├── <Sidebar> (src/components/Sidebar.tsx) [Rendered when not in /watch/ or /setup]
                                  │   ├── <Logo>
                                  │   │   └── <KPlayMark> (src/components/KPlayMark.tsx)
                                  │   ├── <Icon> (src/components/Icon.tsx)
                                  │   └── <NavLink> (react-router-dom)
                                  ├── <main#main>
                                  │   └── <ErrorBoundary> (src/components/ErrorBoundary.tsx)
                                  │       └── <Routes> (react-router-dom)
                                  │           ├── Route / -> <Home>
                                  │           ├── Route /live -> <LiveTV>
                                  │           ├── Route /recordings -> <Recordings>
                                  │           ├── Route /movies -> <Movies>
                                  │           ├── Route /movies/:id -> <MovieDetail>
                                  │           ├── Route /series -> <SeriesBrowse>
                                  │           ├── Route /series/:id -> <SeriesDetail>
                                  │           ├── Route /radio -> <RadioScreen>
                                  │           ├── Route /library -> <Library>
                                  │           ├── Route /artwork -> <ArtworkLibraryScreen>
                                  │           ├── Route /sources -> <Sources>
                                  │           ├── Route /settings -> <Settings>
                                  │           ├── Route /watch/:ref -> <Player>
                                  │           └── Route /setup -> <Setup>
                                  ├── <AudioPlayerBar> (src/components/AudioPlayerBar.tsx) [Rendered when not in player]
                                  ├── <CommandPalette> (src/components/design-system/CommandPalette.tsx)
                                  ├── <ShortcutsModal> (src/components/design-system/ShortcutsModal.tsx)
                                  └── <WhatsNewModal> (src/components/WhatsNewModal.tsx)
```

---

## 2. Complete Component Inventory

### UI & Shared Foundation Components (`src/components/`)

1. **`Icon`**
   - **Source:** `src/components/Icon.tsx`
   - **Export:** `export function Icon({ name, size, stroke, className, ... }: IconProps)`
   - **Type:** Functional wrapper for `@tabler/icons-react`.
   - **Dependencies:** `@tabler/icons-react`
   - **Usage:** Used universally across every screen, button, sidebar link, and dialog.
   - **Status:** Verified.

2. **`PageHeader`**
   - **Source:** `src/components/PageHeader.tsx`
   - **Export:** `export function PageHeader({ title, subtitle, actions, search, ... }: PageHeaderProps)`
   - **Type:** Layout Header
   - **Features:** Integrates mobile hamburger menu toggle, live digital clock (`useLiveTime`), global search input, notifications bell trigger, and active profile pill.
   - **Usage:** Rendered at the top of almost every screen (`Home`, `LiveTV`, `Movies`, `SeriesBrowse`, `Library`, `Sources`, `Settings`, etc.).
   - **Status:** Verified.

3. **`ChannelMark`**
   - **Source:** `src/components/ui.tsx` (lines 40-100)
   - **Export:** `export function ChannelMark({ channel, size, className }: ChannelMarkProps)`
   - **Type:** Media Brand Mark
   - **Resolution Hierarchy:** 1. Custom user-assigned logo (`getCustomArtwork`) -> 2. In-memory raster logo (`channel.logo`) -> 3. Fallback badge with channel initials.
   - **Usage:** `LiveTV` EPG grid, Home Live TV rail, Search results, Player HUD.
   - **Status:** Verified.

4. **`ProgrammeArt`**
   - **Source:** `src/components/ui.tsx` (lines 110-180)
   - **Export:** `export function ProgrammeArt({ programme, channel, ... })`
   - **Type:** Image / Artwork Display
   - **Resolution Hierarchy:** 1. Custom artwork -> 2. Remote XMLTV icon -> 3. Genre artwork fallback -> 4. Generic gradient placeholder.
   - **Usage:** `LiveTV` stage preview, programme detail side sheet, Home Now Playing card.
   - **Status:** Verified.

5. **`PosterCard`**
   - **Source:** `src/components/Tiles.tsx`
   - **Export:** `export function PosterCard({ title, subtitle, art, badge, progress, ... })`
   - **Type:** Card Container
   - **Usage:** Movies browse grid, Series browse grid, Library watchlist, Home trending rails.
   - **Status:** Verified.

6. **`ContentRail`**
   - **Source:** `src/components/ContentRail.tsx`
   - **Export:** `export function ContentRail({ title, action, children, ... })`
   - **Type:** Horizontal Scroll Container
   - **Features:** Scroll-snap, left/right step navigation buttons, responsive item overflow.
   - **Usage:** `Home` (Continue Watching, Trending, Genres), `Movies`, `SeriesBrowse`.
   - **Status:** Verified.

7. **`MediaCategoryPage`**
   - **Source:** `src/components/MediaCategoryPage.tsx`
   - **Export:** `export function MediaCategoryPage({ category, title, description, ... })`
   - **Type:** Screen Template Component
   - **Usage:** Powers all 14 digital preservation routes (`RadioScreen`, `MusicScreen`, `PodcastsScreen`, `BooksScreen`, `DocumentariesScreen`, etc.).
   - **Status:** Verified.

8. **`ResourceCard`**
   - **Source:** `src/components/ResourceCard.tsx`
   - **Export:** `export function ResourceCard({ resource, onSelect, ... })`
   - **Type:** Resource Tile
   - **Usage:** Rendered within `MediaCategoryPage` grids.
   - **Status:** Verified.

9. **`ResourceDetailModal`**
   - **Source:** `src/components/ResourceDetailModal.tsx`
   - **Export:** `export function ResourceDetailModal({ resource, open, onClose })`
   - **Type:** Modal Dialog
   - **Usage:** Displays full attribution, tags, and streaming actions for digital preservation resources.
   - **Status:** Verified.

10. **`ShareModal`**
    - **Source:** `src/components/ShareModal.tsx`
    - **Export:** `export function ShareModal({ open, onClose, item }: ShareModalProps)`
    - **Type:** Native Dialog (`<dialog ref={dialogRef}>`)
    - **Features:** Verified IMDb badge, external IMDb link, one-click copy buttons, Kinora deep link, native `navigator.share`.
    - **Usage:** `TitleActions`, `Movies` quick-actions drawer, `LiveTV` stage preview and programme side sheet.
    - **Status:** Verified.

11. **`ArtworkLightboxModal`**
    - **Source:** `src/components/ArtworkLightboxModal.tsx`
    - **Export:** `export function ArtworkLightboxModal({ src, alt, open, onClose })`
    - **Type:** Fullscreen Lightbox
    - **Usage:** `MovieDetail`, `SeriesDetail`.
    - **Status:** Verified.

12. **`RatingControls`**
    - **Source:** `src/components/RatingControls.tsx`
    - **Export:** `export function RatingControls({ itemRef, title, compact })`
    - **Type:** Interactive Rating Input (1-5 stars)
    - **Persistence:** Scoped to active profile in `store.profileRatings`.
    - **Usage:** `TitleActions`, `MovieDetail`, `SeriesDetail`.
    - **Status:** Verified.

13. **`AudioPlayerBar`**
    - **Source:** `src/components/AudioPlayerBar.tsx`
    - **Export:** `export function AudioPlayerBar(props)`
    - **Type:** Persistent Bottom Audio Deck
    - **Features:** Play/pause, track progress scrubber, volume control, queue drawer, sleep timer.
    - **Usage:** Root `Shell` (always visible when audio track is active).
    - **Status:** Verified.

14. **`OfflineBanner`**
    - **Source:** `src/components/OfflineBanner.tsx`
    - **Export:** `export function OfflineBanner()`
    - **Type:** Network Status Notification
    - **Usage:** Root `Shell`. Listens to browser `online` and `offline` events.
    - **Status:** Verified.

15. **`CommandPalette`**
    - **Source:** `src/components/design-system/CommandPalette.tsx`
    - **Export:** `export function CommandPalette({ open, onClose })`
    - **Type:** Quick Launcher Modal
    - **Trigger:** `Ctrl+K` or `Cmd+K`.
    - **Usage:** Root `Shell`.
    - **Status:** Verified.

16. **`ShortcutsModal`**
    - **Source:** `src/components/design-system/ShortcutsModal.tsx`
    - **Export:** `export function ShortcutsModal({ open, onClose })`
    - **Type:** Keyboard Reference Dialog
    - **Trigger:** Pressing `?`.
    - **Usage:** Root `Shell`.
    - **Status:** Verified.

---

### Design System Primitives (`src/components/design-system/`)

1. **`Button`** (`Button.tsx`): Variants `primary`, `secondary`, `danger`, `ghost`, `link`. Sizes `sm`, `md`, `lg`.
2. **`Badge`** (`Badge.tsx`): Variants `default`, `accent`, `live`, `success`, `warning`, `danger`, `outline`.
3. **`Input`** (`Input.tsx`): Text input with prefix icon, clear button, error message.
4. **`Select`** (`Select.tsx`): Dropdown select with custom styling.
5. **`Checkbox`** (`Checkbox.tsx`): Accessible checkbox with custom checkmark.
6. **`Modal`** (`Modal.tsx`): Dialog container with backdrop and escape key trap.
7. **`Tabs`** (`Tabs.tsx`): Tab list and tab panel primitives.
8. **`Card`** (`Card.tsx`): Surface card with hover states.
9. **`Tooltip`** (`Tooltip.tsx`): Hover tooltip popup.
10. **`Feedback`** (`Feedback.tsx`): `LoadingSpinner`, `Skeleton`, `EmptyState`.

---

## 3. Major Screen Component Hierarchy Trees

### Home Screen (`src/screens/Home.tsx`)
```
<Home>
  ├── <PageHeader>
  ├── <section.hero>
  │   ├── <Art> (hero backdrop)
  │   ├── <div.hero-content>
  │   │   ├── <span.hero-kicker-badge>
  │   │   ├── <h1.hero-title>
  │   │   ├── <div.hero-meta>
  │   │   ├── <p.hero-synopsis>
  │   │   └── <div.hero-actions>
  │   │       ├── <Link.btn-hero> ("Watch Now")
  │   │       ├── <Link.btn-secondary> ("More Info")
  │   │       └── <button.icon-btn> (Watchlist toggle)
  │   └── <div.hero-stage-side>
  │       ├── <div.now-playing-preview>
  │       └── <div.quick-actions-bar>
  ├── <ContentRail> ("Continue Watching")
  │   └── <PosterCard> (with ProgressBar)
  ├── <ContentRail> ("Live TV - Now Playing")
  │   └── <ChannelMark> + live programme details
  ├── <ContentRail> ("Trending Movies & Series")
  │   └── <PosterCard>
  └── <section.library-glance>
      └── <StatCard> x 4 (Movies, Series, Channels, Storage)
```

### Live TV Screen (`src/screens/LiveTV.tsx`)
```
<LiveTV>
  ├── <PageHeader>
  ├── <section.live-stage>
  │   ├── <div.live-preview-box>
  │   │   └── <video> element (HLS playback preview)
  │   ├── <div.live-now-card>
  │   │   ├── <ChannelMark>
  │   │   ├── <ProgrammeArt>
  │   │   └── <button> actions ("Watch Live", "Record", "Favourite", "Share")
  │   └── <div.live-next-card>
  ├── <div.timeline-toolbar>
  │   ├── <DatePicker>
  │   ├── <button> ("Now")
  │   ├── <Select> (Zoom Level)
  │   └── <CategoryFilterChips>
  ├── <div.epg-grid-container>
  │   ├── <div.time-ruler-sticky-header>
  │   ├── <div.channel-column-sticky>
  │   │   └── <div.channel-cell> x N
  │   │       └── <ChannelMark>
  │   ├── <div.programme-schedule-matrix>
  │   │   └── <div.programme-block> x N (width based on duration)
  │   └── <div.now-indicator-line> (vertical red line)
  └── <aside.programme-side-sheet> (drawer opened on programme click)
      ├── <ProgrammeArt>
      ├── <AgeRatingBadge>
      └── <button> ("Watch Channel", "Set Reminder", "Share Title")
```

---

## 4. Usage Categorization

- **Actively Used on Active Routes:** 46 components (all documented above).
- **Development & Test Support:** `src/screens/AddPersonalSource.test.tsx`, `VisualRegressionRecovery.test.tsx`, `StreamingCorrectionRegression.test.tsx`.
- **Zero-Reference / Obsolete Components:** None found. Every component in `src/components/` is imported by at least one active screen or provider.
