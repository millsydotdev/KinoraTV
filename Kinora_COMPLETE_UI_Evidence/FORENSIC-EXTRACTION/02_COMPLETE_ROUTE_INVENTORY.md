# 02 Complete Route Inventory

## 1. Route Discovery Summary

All routes in Kinora are declared centrally in `src/App.tsx` (lines 194-229) using React Router (`BrowserRouter` -> `Routes` -> `Route`).

- **Total Registered Routes:** 34
- **Top-Level Root Routes:** 1 (`/`)
- **Main Viewing & Browsing Routes:** 22
- **Detail Pages:** 4 (`/movies/:id`, `/series/:id`, `/tv-shows/:id`, `/watch/:ref`)
- **Settings Routes:** 2 (`/settings`, `/settings/:section`)
- **Setup & Onboarding Routes:** 1 (`/setup`)
- **Catch-All 404 Route:** 1 (`*`)
- **Direct Aliases:** 2 (`/tv-shows` -> `SeriesBrowse`, `/tv-shows/:id` -> `SeriesDetail`; `/manage/artwork` -> `ArtworkLibraryScreen`)

---

## 2. Exhaustive Route Inventory

### Route 01: `/`
- **Route Name:** Home / Dashboard
- **Component Rendered:** `<Home />`
- **Source File:** `src/screens/Home.tsx`
- **Parent Layout:** `Shell` (`Sidebar` + `main#main` content area)
- **Navigation Entry:** Sidebar item "Home" (`to: '/'`, icon: `home`), Keyboard shortcut `1`
- **Parameters:** None
- **Query Parameters:** None
- **Route Guards & Lifecycle:**
  - Setup redirection: If `!setupDone && pathname === '/'`, redirects to `/setup` (`src/App.tsx:100`).
  - Session restoration: If `setupDone && pathname === '/'`, restores `kinora.last_session.v1` (`src/App.tsx:108-114`).
- **Conditional Rendering:** Renders DEV MOCK rails when `store.demoTitles` is true; renders real user source rails (Xtream, local media, public discovery) when `store.demoTitles` is false.
- **Not-Found Behaviour:** N/A (root route)
- **Status:** Verified in code and runtime.

### Route 02: `/live`
- **Route Name:** Live TV & Electronic Programme Guide (EPG)
- **Component Rendered:** `<LiveTV />`
- **Source File:** `src/screens/LiveTV.tsx`
- **Parent Layout:** `Shell`
- **Navigation Entry:** Sidebar item "Live TV" (`to: '/live'`, icon: `live`), Keyboard shortcut `2`
- **Parameters:** None
- **Query Parameters:**
  - `view`: `'timeline'` (default EPG grid) | `'channels'` (card list)
  - `filter`: `'all'` | `'favourites'` | `'recent'`
  - `tab`: `'guide'` | `'nowNext'` | `'whatsOn'` | `'favourites'` | `'recent'` | `'reminders'` | `'catchup'`
  - `category`: Category name string (e.g. `'General'`, `'News'`, `'Entertainment'`)
  - `channel`: Channel key string (for auto-selecting a channel)
- **Route Guards:** None
- **Status:** Verified in code and runtime.

### Route 03: `/recordings`
- **Route Name:** DVR Recordings & Scheduled Captures
- **Component Rendered:** `<Recordings />`
- **Source File:** `src/screens/Recordings.tsx`
- **Parent Layout:** `Shell`
- **Navigation Entry:** Sidebar sub-item "Recordings" under "Live TV" (`to: '/recordings'`, icon: `record`)
- **Parameters:** None
- **Query Parameters:**
  - `tab`: `'completed'` | `'scheduled'` | `'rules'` | `'settings'`
- **Route Guards:** Accessible regardless of whether a recording backend is currently capturing.
- **Status:** Verified in code and runtime.

### Route 04: `/movies`
- **Route Name:** Movies Catalogue & Discovery
- **Component Rendered:** `<Movies />`
- **Source File:** `src/screens/Movies.tsx`
- **Parent Layout:** `Shell`
- **Navigation Entry:** Sidebar sub-item "Movies" under "Movies & Series" (`to: '/movies'`, icon: `film`), Keyboard shortcut `3`
- **Parameters:** None
- **Query Parameters:**
  - `filter`: `'all'` | `'popular'` | `'topRated'` | `'newReleases'`
  - `genre`: Genre filter string
  - `year`: Year filter string
- **Route Guards:** Filtered by Kids Mode (`isKidsMode`) to hide mature titles when a child profile is active.
- **Status:** Verified in code and runtime.

### Route 05: `/movies/:id`
- **Route Name:** Movie Detail View
- **Component Rendered:** `<MovieDetail />`
- **Source File:** `src/screens/MovieDetail.tsx`
- **Parent Layout:** `Shell`
- **Navigation Entry:** Clicking any movie card across Home, Movies, Search, Library, or Share link.
- **Parameters:**
  - `:id`: Movie identifier (e.g. `harbour-lights`, `night-of-the-living-dead`, `xt:<sourceId>:<vodId>`, `res:<resourceId>`)
- **Query Parameters:** None
- **Route Guards:**
  - Kids Mode guard: If active and movie certificate is mature, renders "Restricted in Kids Mode" (`MovieDetail.tsx:33-45`).
  - Personal source guard: If title is a fictional demo title and `!store.demoTitles`, renders "Movie Unavailable in Personal Sources" (`MovieDetail.tsx:60-86`).
  - Open catalogue / Public domain titles (`OPEN_MOVIES`) remain accessible in all modes (`MovieDetail.tsx:61`).
- **Status:** Verified in code and runtime.

### Route 06: `/series`
- **Route Name:** TV Series / Shows Catalogue
- **Component Rendered:** `<SeriesBrowse />`
- **Source File:** `src/screens/SeriesBrowse.tsx`
- **Parent Layout:** `Shell`
- **Navigation Entry:** Sidebar sub-item "TV Shows" under "Movies & Series" (`to: '/series'`, icon: `series`), Keyboard shortcut `4`
- **Parameters:** None
- **Query Parameters:**
  - `genre`: Genre filter string
  - `year`: Year filter string
- **Route Guards:** Filtered by Kids Mode (`isKidsMode`).
- **Status:** Verified in code and runtime.

### Route 07: `/series/:id`
- **Route Name:** TV Series Detail View
- **Component Rendered:** `<SeriesDetail />`
- **Source File:** `src/screens/SeriesDetail.tsx`
- **Parent Layout:** `Shell`
- **Navigation Entry:** Clicking any TV show card across Home, SeriesBrowse, Search, Library, or Share link.
- **Parameters:**
  - `:id`: Series identifier (e.g. `ninth-ward`, `beverly-hillbillies`, `xt:<sourceId>:<seriesId>`)
- **Query Parameters:**
  - `season`: Season number string (e.g. `1`, `2`)
  - `episode`: Episode identifier string
- **Route Guards:**
  - Kids Mode guard (`SeriesDetail.tsx:33-45`).
  - Fictional demo title guard: Renders "Series Unavailable in Personal Sources" for demo items when `!store.demoTitles` (`SeriesDetail.tsx:60-86`).
  - Open series (`OPEN_SERIES`) remain accessible in all modes.
- **Status:** Verified in code and runtime.

### Route 08: `/tv-shows`
- **Route Name:** TV Shows Browse Alias
- **Component Rendered:** `<SeriesBrowse />`
- **Source File:** `src/screens/SeriesBrowse.tsx`
- **Parent Layout:** `Shell`
- **Navigation Entry:** Direct URL alias for `/series`
- **Parameters / Query Parameters / Guards:** Identical to Route 06 (`/series`).
- **Status:** Verified in code.

### Route 09: `/tv-shows/:id`
- **Route Name:** TV Shows Detail Alias
- **Component Rendered:** `<SeriesDetail />`
- **Source File:** `src/screens/SeriesDetail.tsx`
- **Parent Layout:** `Shell`
- **Navigation Entry:** Direct URL alias for `/series/:id`
- **Parameters / Query Parameters / Guards:** Identical to Route 07 (`/series/:id`).
- **Status:** Verified in code.

### Route 10: `/radio`
- **Route Name:** Live Radio Streams & Audio Broadcasts
- **Component Rendered:** `<RadioScreen />`
- **Source File:** `src/screens/RadioScreen.tsx`
- **Parent Layout:** `Shell`
- **Navigation Entry:** Sidebar sub-item "Radio" under "Audio" (`to: '/radio'`, icon: `radio`), Keyboard shortcut `5`
- **Parameters:** None
- **Query Parameters:** Managed internally via `MediaCategoryPage` (search, subcategory filter).
- **Status:** Verified in code and runtime.

### Route 11: `/music`
- **Route Name:** Music Archives & Audio Streaming
- **Component Rendered:** `<MusicScreen />`
- **Source File:** `src/screens/MusicScreen.tsx`
- **Parent Layout:** `Shell`
- **Navigation Entry:** Sidebar sub-item "Music" under "Audio" (`to: '/music'`, icon: `music`)
- **Parameters / Query Parameters:** None
- **Status:** Verified in code and runtime.

### Route 12: `/podcasts`
- **Route Name:** Podcasts & Audio Ephemera
- **Component Rendered:** `<PodcastsScreen />`
- **Source File:** `src/screens/PodcastsScreen.tsx`
- **Parent Layout:** `Shell`
- **Navigation Entry:** Sidebar sub-item "Podcasts" under "Audio" (`to: '/podcasts'`, icon: `podcast`)
- **Parameters / Query Parameters:** None
- **Status:** Verified in code and runtime.

### Route 13: `/audiobooks`
- **Route Name:** Public Domain Audiobooks
- **Component Rendered:** `<AudiobooksScreen />`
- **Source File:** `src/screens/AudiobooksScreen.tsx`
- **Parent Layout:** `Shell`
- **Navigation Entry:** Sidebar sub-item "Audiobooks" under "Audio" (`to: '/audiobooks'`, icon: `book`)
- **Parameters / Query Parameters:** None
- **Status:** Verified in code and runtime.

### Route 14: `/documentaries`
- **Route Name:** Documentary Film Archives
- **Component Rendered:** `<DocumentariesScreen />`
- **Source File:** `src/screens/DocumentariesScreen.tsx`
- **Parent Layout:** `Shell`
- **Navigation Entry:** Sidebar sub-item "Documentaries" under "Discover" (`to: '/documentaries'`, icon: `documentary`)
- **Parameters / Query Parameters:** None
- **Status:** Verified in code and runtime.

### Route 15: `/education`
- **Route Name:** Educational Archives & Lectures
- **Component Rendered:** `<EducationScreen />`
- **Source File:** `src/screens/EducationScreen.tsx`
- **Parent Layout:** `Shell`
- **Navigation Entry:** Sidebar sub-item "Education" under "Discover" (`to: '/education'`, icon: `education`)
- **Parameters / Query Parameters:** None
- **Status:** Verified in code and runtime.

### Route 16: `/news`
- **Route Name:** Global News Broadcasts & Archives
- **Component Rendered:** `<NewsScreen />`
- **Source File:** `src/screens/NewsScreen.tsx`
- **Parent Layout:** `Shell`
- **Navigation Entry:** Sidebar sub-item "News" under "Discover" (`to: '/news'`, icon: `news`)
- **Parameters / Query Parameters:** None
- **Status:** Verified in code and runtime.

### Route 17: `/sports`
- **Route Name:** Historic Sports Archives & Footage
- **Component Rendered:** `<SportsScreen />`
- **Source File:** `src/screens/SportsScreen.tsx`
- **Parent Layout:** `Shell`
- **Navigation Entry:** Sidebar sub-item "Sports" under "Discover" (`to: '/sports'`, icon: `sports`)
- **Parameters / Query Parameters:** None
- **Status:** Verified in code and runtime.

### Route 18: `/books`
- **Route Name:** Open Access Books & Texts
- **Component Rendered:** `<BooksScreen />`
- **Source File:** `src/screens/BooksScreen.tsx`
- **Parent Layout:** `Shell`
- **Navigation Entry:** Sidebar sub-item "Books" under "Reading" (`to: '/books'`, icon: `book`)
- **Parameters / Query Parameters:** None
- **Status:** Verified in code and runtime.

### Route 19: `/culture`
- **Route Name:** Cultural Heritage & Fine Arts
- **Component Rendered:** `<CultureScreen />`
- **Source File:** `src/screens/CultureScreen.tsx`
- **Parent Layout:** `Shell`
- **Navigation Entry:** Sidebar sub-item "Culture & Arts" under "Discover" (`to: '/culture'`, icon: `palette`)
- **Parameters / Query Parameters:** None
- **Status:** Verified in code and runtime.

### Route 20: `/gaming`
- **Route Name:** Video Game History & Demos
- **Component Rendered:** `<GamingScreen />`
- **Source File:** `src/screens/GamingScreen.tsx`
- **Parent Layout:** `Shell`
- **Navigation Entry:** Sidebar sub-item "Gaming" under "Discover" (`to: '/gaming'`, icon: `gaming`)
- **Parameters / Query Parameters:** None
- **Status:** Verified in code and runtime.

### Route 21: `/nature-science`
- **Route Name:** Nature, Space & Scientific Research
- **Component Rendered:** `<NatureScienceScreen />`
- **Source File:** `src/screens/NatureScienceScreen.tsx`
- **Parent Layout:** `Shell`
- **Navigation Entry:** Sidebar sub-item "Nature & Space" under "Discover" (`to: '/nature-science'`, icon: `nature`)
- **Parameters / Query Parameters:** None
- **Status:** Verified in code and runtime.

### Route 22: `/language`
- **Route Name:** Language Learning & World Linguistics
- **Component Rendered:** `<LanguageScreen />`
- **Source File:** `src/screens/LanguageScreen.tsx`
- **Parent Layout:** `Shell`
- **Navigation Entry:** Sidebar sub-item "Languages" under "Discover" (`to: '/language'`, icon: `globe`)
- **Parameters / Query Parameters:** None
- **Status:** Verified in code and runtime.

### Route 23: `/archives`
- **Route Name:** Digital Preservation & Media Archives
- **Component Rendered:** `<ArchivesScreen />`
- **Source File:** `src/screens/ArchivesScreen.tsx`
- **Parent Layout:** `Shell`
- **Navigation Entry:** Sidebar sub-item "Media Archives" under "Discover" (`to: '/archives'`, icon: `archive`)
- **Parameters / Query Parameters:** None
- **Status:** Verified in code and runtime.

### Route 24: `/search`
- **Route Name:** Global Unified Search
- **Component Rendered:** `<Search />`
- **Source File:** `src/screens/Search.tsx`
- **Parent Layout:** `Shell`
- **Navigation Entry:** Global Header Search Input, Keyboard shortcut `/`
- **Parameters:** None
- **Query Parameters:**
  - `q`: Search query string
- **Route Guards:** Input debounces search state and updates URL without dropping keystrokes.
- **Status:** Verified in code and runtime.

### Route 25: `/library`
- **Route Name:** Unified Media Library
- **Component Rendered:** `<Library />`
- **Source File:** `src/screens/Library.tsx`
- **Parent Layout:** `Shell`
- **Navigation Entry:** Sidebar item "Media Library" (`to: '/library'`, icon: `library`), Keyboard shortcut `6`
- **Parameters:** None
- **Query Parameters:**
  - `tab`: `'recent'` | `'resume'` | `'watchlist'` | `'watched'` | `'favourites'` | `'collections'` | `'recordings'` | `'sources'` | `'local'` | `'artwork'`
- **Route Guards:** None
- **Status:** Verified in code and runtime.

### Route 26: `/artwork`
- **Route Name:** Personal Artwork Library
- **Component Rendered:** `<ArtworkLibraryScreen />`
- **Source File:** `src/screens/ArtworkLibraryScreen.tsx`
- **Parent Layout:** `Shell`
- **Navigation Entry:** Library tab "Artwork", Settings shortcut link in Media Library section.
- **Parameters:** None
- **Query Parameters:** None
- **Route Guards:** None
- **Status:** Verified in code and runtime.

### Route 27: `/manage/artwork`
- **Route Name:** Manage Artwork Alias
- **Component Rendered:** `<ArtworkLibraryScreen />`
- **Source File:** `src/screens/ArtworkLibraryScreen.tsx`
- **Parent Layout:** `Shell`
- **Navigation Entry:** Direct URL alias for `/artwork`
- **Parameters / Query Parameters / Guards:** Identical to Route 26.
- **Status:** Verified in code.

### Route 28: `/sources`
- **Route Name:** Sources & Providers Hub
- **Component Rendered:** `<Sources />`
- **Source File:** `src/screens/Sources.tsx`
- **Parent Layout:** `Shell`
- **Navigation Entry:** Sidebar item "Sources" (`to: '/sources'`, icon: `sources`), Keyboard shortcut `7`
- **Parameters:** None
- **Query Parameters:**
  - `tab`: `'active'` | `'discovery'` | `'xtream'` | `'technical'`
- **Route Guards:** None
- **Status:** Verified in code and runtime.

### Route 29: `/sources/add`
- **Route Name:** Add New Source Modal/View
- **Component Rendered:** `<AddSource />`
- **Source File:** `src/screens/Sources.tsx`
- **Parent Layout:** `Shell`
- **Navigation Entry:** Button "Add Source" in Sources screen.
- **Parameters:** None
- **Query Parameters:** None
- **Route Guards:** None
- **Status:** Verified in code and runtime.

### Route 30: `/settings`
- **Route Name:** Settings Root
- **Component Rendered:** `<Settings />`
- **Source File:** `src/screens/Settings.tsx`
- **Parent Layout:** `Shell`
- **Navigation Entry:** Sidebar footer item "Settings" (`to: '/settings'`, icon: `settings`), Keyboard shortcut `8`
- **Parameters:** None
- **Query Parameters:** None
- **Behavior:** Defaults to active section `'appearance'`.
- **Status:** Verified in code and runtime.

### Route 31: `/settings/:section`
- **Route Name:** Specific Settings Section
- **Component Rendered:** `<Settings />`
- **Source File:** `src/screens/Settings.tsx`
- **Parent Layout:** `Shell`
- **Navigation Entry:** Clicking any section in Settings left navigation rail.
- **Parameters:**
  - `:section`: One of `appearance`, `playback`, `epg`, `dvr`, `sources`, `storage`, `subtitles`, `notifications`, `shortcuts`, `profiles`, `privacy`, `data`, `about`
- **Query Parameters:** None
- **Route Guards:** None
- **Status:** Verified in code and runtime.

### Route 32: `/watch/:ref`
- **Route Name:** Fullscreen Video Player
- **Component Rendered:** `<Player />`
- **Source File:** `src/screens/Player.tsx`
- **Parent Layout:** Fullscreen (`inPlayer = true`, `Sidebar` is omitted)
- **Navigation Entry:** Clicking "Watch Live" or "Play" on any playable channel, movie, or episode.
- **Parameters:**
  - `:ref`: Encoded media reference string (e.g. `channel:<channelId>`, `movie:<movieId>`, `episode:<seriesId>:<epId>`, `xt:live:<sourceId>:<streamId>`, `xt:vod:<sourceId>:<vodId>`, `local:<mediaId>`)
- **Query Parameters:** None
- **Route Guards:** Resolves media reference through store; displays honest error state if stream cannot be opened.
- **Status:** Verified in code and runtime.

### Route 33: `/setup`
- **Route Name:** First-Run Onboarding & Profile Setup
- **Component Rendered:** `<Setup />`
- **Source File:** `src/screens/Setup.tsx`
- **Parent Layout:** Fullscreen (`inPlayer = true`, `Sidebar` is omitted)
- **Navigation Entry:** Auto-redirect on first launch if `!setupDone`; link in Settings > Advanced.
- **Parameters:** None
- **Query Parameters:** None
- **Route Guards:** None
- **Status:** Verified in code and runtime.

### Route 34: `*`
- **Route Name:** Not Found (404 Fallback)
- **Component Rendered:** `<NotFound />`
- **Source File:** `src/App.tsx` (lines 256-265)
- **Parent Layout:** `Shell`
- **Navigation Entry:** Any unregistered URL path.
- **Parameters:** Wildcard
- **Query Parameters:** None
- **Rendered Elements:** `PageHeader` with title "Not found", `StateBlock` with icon "warning", title "This page does not exist", and button link "Back to Home" (`to: '/'`).
- **Status:** Verified in code.
