# Kinora Defect Register: Screen Comparison and Root Cause Analysis

This register records all visual, architectural, and interaction defects identified during the multi-batch screenshot comparison between the Development Fixtures (Dev Mock) and User Profile (User Sources) environments, along with their implemented engineering solutions.

## 1. Summary of Identified Defects

| Defect ID | Severity | Area | Description | Status |
|---|---|---|---|---|
| DEF-001 | Critical | Movies & TV Shows | Premature empty card blank-out when user lacked Xtream provider | Resolved |
| DEF-002 | High | Category Hubs | Identical cards in Dev Mock and User Sources without provenance tags | Resolved |
| DEF-003 | High | Detail Views | Detail sheets crashed with empty states on public discovery titles | Resolved |
| DEF-004 | High | Search Engine | Film and TV search results were completely omitted without Xtream | Resolved |
| DEF-005 | Medium | Route Navigation | Unhandled 404/blank screen when navigating to demo titles in User mode | Resolved |
| DEF-006 | Medium | Resource Cards | Ambiguous card interaction (playable stream vs external web link) | Resolved |
| DEF-007 | Low | Category Empty States | Uninformative empty states when filtering by My Sources | Resolved |

---

## 2. Detailed Defect Analysis and Resolutions

### DEF-001: Movies and TV Shows Empty Screen Wiping
- **Severity**: Critical
- **Reference**: Batch 1 & 2 Screenshot Comparisons (User Sources Movies and TV Shows vs Dev Mock)
- **Root Cause**: `src/screens/Movies.tsx` (line 278) and `src/screens/SeriesBrowse.tsx` (line 280) evaluated `const hasAnyContent = hasXtream || hasDemo`. In User Sources mode without an authenticated Xtream provider, `hasAnyContent` evaluated to false. The code immediately returned `<NoTitles />`, replacing the entire streaming layout (hero slider, category pills, content rails, filters) with a single centered empty state card.
- **Resolution**:
  1. Removed the blanket early return `<NoTitles />`.
  2. Integrated `publicDiscoveryFilms` and `publicDiscoverySeries` from `DISCOVERED_RESOURCES`.
  3. Added a dedicated `StreamingProviderPrompt` banner explaining how to connect an on-demand provider.
  4. Populated hero stages, content rails, and browsing grids with curated public domain cinema and episodic television archives.
- **Verification**: Movies and TV Shows screens now render full, polished streaming interfaces in both Dev Mock and User Sources modes.

### DEF-002: Identical Content in Category Hubs Lacking Provenance
- **Severity**: High
- **Reference**: Batch 3 Comparisons (News, Radio, Sports, Books, Nature/Science)
- **Root Cause**: Category screens read from `DISCOVERED_RESOURCES` in both environments. Because cards rendered without provenance or capability indicators, screens appeared identical without explaining why public resources were visible in both modes.
- **Resolution**:
  1. Introduced `src/data/provenance.ts` defining strict provenance metadata (`[Public Discovery]`, `[Personal Source]`, `[Dev Fixture]`).
  2. Added `.res-provenance-pill` styling in `ResourceCard.css`.
  3. Updated `ResourceCard.tsx`, `ResourceDetailModal.tsx`, and `Search.tsx` to render provenance badges.
  4. Added a segmented view control in `MediaCategoryPage.tsx` ("Public Discovery" | "My Sources ({count})" | "Favourites") so users can toggle between open directories and their personal bookmarks.
- **Verification**: Provenance is immediately apparent on every card, and segmented filtering cleanly isolates personal bookmarks from public directories.

### DEF-003: Detail View Failures on Non-Xtream Titles
- **Severity**: High
- **Reference**: Batch 2 Detail Page Inspections (`/movies/:id` and `/series/:id`)
- **Root Cause**: `MovieDetail.tsx` and `SeriesDetail.tsx` assumed all titles belonged to either `catalog.ts` (demo mode) or `store.xtreamCatalogue` (user mode). Navigating to a public discovery title or deep link resulted in an unhandled `<NoTitles />` empty state.
- **Resolution**:
  1. Added multi-source title resolvers to `MovieDetail.tsx` and `SeriesDetail.tsx`.
  2. Implemented dedicated `PublicDiscoveryFilmDetail` and `PublicDiscoverySeriesDetail` views.
  3. Rendered full backdrops, provenance badges, capability badges, licensing tags, origin portal links, and working "Save to My Sources" actions.
- **Verification**: All public discovery films and series open rich detail sheets with complete metadata and action controls.

### DEF-004: Unified Search Incomplete in User Sources Mode
- **Severity**: High
- **Reference**: Search Engine Comparisons in User Mode
- **Root Cause**: `Search.tsx` set `groups.films = xtMovies` and `groups.series = xtSeries` when `!store.demoTitles`. If the user had not connected an Xtream provider, searches for movies or series returned zero results, completely ignoring available public domain cinema and episodic archives.
- **Resolution**:
  1. Updated `Search.tsx` to query public discovery film and TV archives from `DISCOVERED_RESOURCES`.
  2. Appended public discovery items into `groups.films` and `groups.series` with `[Discovery]` provenance badges.
  3. Attached provenance badges to all search result rows (`[Live TV]`, `[Provider]`, `[Dev Fixture]`).
- **Verification**: Searching for terms like "Archive", "Film", "Cinema", or "Classic" returns relevant titles regardless of whether an Xtream account is configured.

### DEF-005: Out-of-Environment Route Handling
- **Severity**: Medium
- **Reference**: Direct URL Navigation in User Profile Mode
- **Root Cause**: Accessing demo URLs (e.g. `/movies/low-orbit`) in User mode failed with a generic empty card.
- **Resolution**: Added explicit detection in `MovieDetail.tsx` and `SeriesDetail.tsx`. If a user navigates to a demo fixture ID while `store.demoTitles` is false, Kinora displays a clear `StateBlock` explaining that the item is a development fixture, along with buttons to browse active movies or manage sources.
- **Verification**: Graceful feedback replaces unexpected empty states.

### DEF-006: Ambiguous Resource Interaction
- **Severity**: Medium
- **Reference**: Resource Card Usability Audit
- **Root Cause**: Cards lacked visual indicators distinguishing in-app playable audio/video from items linking to external repositories or book downloads.
- **Resolution**: Added capability pills (`[Playable Stream]`, `[Live Audio]`, `[Public Archive]`, `[Digital Book]`, `[Web Resource]`) rendered directly on cards.
- **Verification**: Users can instantly see the interaction type before clicking a card.

### DEF-007: Unhelpful Empty States in Filtered Views
- **Severity**: Low
- **Reference**: My Sources Category Tabs
- **Root Cause**: Selecting "My Sources" on a category screen with zero personal bookmarks displayed a generic empty message.
- **Resolution**: Added tailored empty state blocks with "Browse Public Discovery" actions that automatically switch the view filter back to discoverable content.
- **Verification**: Seamless path from empty states to content discovery.
