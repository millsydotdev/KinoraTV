# Kinora 0.6.0: Complete UI Route Coverage & Verification Matrix

**Application:** Kinora Desktop Entertainment Platform  
**Version:** 0.6.0  
**Audit Date:** 2026-11-20  
**Total Routes Documented & Verified:** 34  
**Coverage Standard:** 100% of all registered routes, screens, modal drawers, and overlays verified across DEV-MOCK and REAL-USER modes at 1920x1080 and 1280x800 viewports.

---

## 1. Complete Route Coverage Matrix (34 Routes)

The table below provides a comprehensive verification ledger for every route configured in [App.tsx](file:///mnt/storage/TVMovie/src/App.tsx).

| # | Route Pattern | Screen Name | File Location | Visual Hierarchy | 1920x1080 | 1280x800 | Dev-Mock | Real-User | Defects | Verification Status |
| :- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **01** | `/` | `Home` | [Home.tsx](file:///mnt/storage/TVMovie/src/screens/Home.tsx) | Complete 2-Column Hub | Passed | Passed | Verified | Verified | 0 (DEF-001 fixed) | **Fully Verified** |
| **02** | `/live` | `LiveTV` | [LiveTV.tsx](file:///mnt/storage/TVMovie/src/screens/LiveTV.tsx) | EPG Timeline & Preview | Passed | Passed | Verified | Verified | 0 (DEF-003 fixed) | **Fully Verified** |
| **03** | `/recordings` | `Recordings` | [Recordings.tsx](file:///mnt/storage/TVMovie/src/screens/Recordings.tsx) | DVR Storage & Schedule | Passed | Passed | Verified | Verified | 0 | **Fully Verified** |
| **04** | `/movies` | `Movies` | [Movies.tsx](file:///mnt/storage/TVMovie/src/screens/Movies.tsx) | Streaming Hero & Rails | Passed | Passed | Verified | Verified | 0 (DEF-004 fixed) | **Fully Verified** |
| **05** | `/movies/:id` | `MovieDetail` | [MovieDetail.tsx](file:///mnt/storage/TVMovie/src/screens/MovieDetail.tsx) | Cinematic Backdrop & Info | Passed | Passed | Verified | Verified | 0 (DEF-006 fixed) | **Fully Verified** |
| **06** | `/series` | `SeriesBrowse` | [SeriesBrowse.tsx](file:///mnt/storage/TVMovie/src/screens/SeriesBrowse.tsx) | Series Hero & Rails | Passed | Passed | Verified | Verified | 0 (DEF-005 fixed) | **Fully Verified** |
| **07** | `/series/:id` | `SeriesDetail` | [SeriesDetail.tsx](file:///mnt/storage/TVMovie/src/screens/SeriesDetail.tsx) | Season Picker & Episodes | Passed | Passed | Verified | Verified | 0 | **Fully Verified** |
| **08** | `/tv-shows` | `SeriesBrowse` | [SeriesBrowse.tsx](file:///mnt/storage/TVMovie/src/screens/SeriesBrowse.tsx) | Route Alias | Passed | Passed | Verified | Verified | 0 | **Fully Verified** |
| **09** | `/tv-shows/:id` | `SeriesDetail` | [SeriesDetail.tsx](file:///mnt/storage/TVMovie/src/screens/SeriesDetail.tsx) | Route Alias | Passed | Passed | Verified | Verified | 0 | **Fully Verified** |
| **10** | `/radio` | `RadioScreen` | [MediaCategoryScreens.tsx](file:///mnt/storage/TVMovie/src/screens/MediaCategoryScreens.tsx) | Radio Directory & Audio Bar | Passed | Passed | Verified | Verified | 0 (DEF-002 fixed) | **Fully Verified** |
| **11** | `/music` | `MusicScreen` | [MediaCategoryScreens.tsx](file:///mnt/storage/TVMovie/src/screens/MediaCategoryScreens.tsx) | Album Grid & Track Player | Passed | Passed | Verified | Verified | 0 (DEF-002 fixed) | **Fully Verified** |
| **12** | `/podcasts` | `PodcastsScreen`| [MediaCategoryScreens.tsx](file:///mnt/storage/TVMovie/src/screens/MediaCategoryScreens.tsx) | Show Cards & Episode Drawer| Passed | Passed | Verified | Verified | 0 (DEF-002 fixed) | **Fully Verified** |
| **13** | `/audiobooks` | `AudiobooksScreen`|[MediaCategoryScreens.tsx](file:///mnt/storage/TVMovie/src/screens/MediaCategoryScreens.tsx) | Book Cover Grid & Chapters | Passed | Passed | Verified | Verified | 0 (DEF-002 fixed) | **Fully Verified** |
| **14** | `/books` | `BooksScreen` | [MediaCategoryScreens.tsx](file:///mnt/storage/TVMovie/src/screens/MediaCategoryScreens.tsx) | E-Book Library & Reader | Passed | Passed | Verified | Verified | 0 | **Fully Verified** |
| **15** | `/documentaries`| `DocumentariesScreen`|[MediaCategoryScreens.tsx](file:///mnt/storage/TVMovie/src/screens/MediaCategoryScreens.tsx) | Topic Chips & Film Rails | Passed | Passed | Verified | Verified | 0 | **Fully Verified** |
| **16** | `/news` | `NewsScreen` | [MediaCategoryScreens.tsx](file:///mnt/storage/TVMovie/src/screens/MediaCategoryScreens.tsx) | News Channels & Tickers | Passed | Passed | Verified | Verified | 0 | **Fully Verified** |
| **17** | `/sports` | `SportsScreen` | [MediaCategoryScreens.tsx](file:///mnt/storage/TVMovie/src/screens/MediaCategoryScreens.tsx) | League Rails & Match Feeds | Passed | Passed | Verified | Verified | 0 | **Fully Verified** |
| **18** | `/education` | `EducationScreen` | [MediaCategoryScreens.tsx](file:///mnt/storage/TVMovie/src/screens/MediaCategoryScreens.tsx) | Academic Lectures & Science | Passed | Passed | Verified | Verified | 0 | **Fully Verified** |
| **19** | `/culture-arts` | `CultureScreen` | [MediaCategoryScreens.tsx](file:///mnt/storage/TVMovie/src/screens/MediaCategoryScreens.tsx) | Theatre & Classical Arts | Passed | Passed | Verified | Verified | 0 | **Fully Verified** |
| **20** | `/nature-science`|`NatureScienceScreen`|[MediaCategoryScreens.tsx](file:///mnt/storage/TVMovie/src/screens/MediaCategoryScreens.tsx)| Wildlife & Astronomy Media | Passed | Passed | Verified | Verified | 0 | **Fully Verified** |
| **21** | `/gaming` | `GamingScreen` | [MediaCategoryScreens.tsx](file:///mnt/storage/TVMovie/src/screens/MediaCategoryScreens.tsx) | Esports & Game Stream Feeds | Passed | Passed | Verified | Verified | 0 | **Fully Verified** |
| **22** | `/language-resources`|`LanguageScreen`|[MediaCategoryScreens.tsx](file:///mnt/storage/TVMovie/src/screens/MediaCategoryScreens.tsx)| Multilingual Media Lessons | Passed | Passed | Verified | Verified | 0 | **Fully Verified** |
| **23** | `/media-archives`|`ArchivesScreen` | [MediaCategoryScreens.tsx](file:///mnt/storage/TVMovie/src/screens/MediaCategoryScreens.tsx) | Historical Public Domain | Passed | Passed | Verified | Verified | 0 | **Fully Verified** |
| **24** | `/library` | `Library` | [Library.tsx](file:///mnt/storage/TVMovie/src/screens/Library.tsx) | Personal Library & HUD | Passed | Passed | Verified | Verified | 0 (DEF-007 fixed) | **Fully Verified** |
| **25** | `/manage/artwork`|`ArtworkLibraryScreen`|[ArtworkLibraryScreen.tsx](file:///mnt/storage/TVMovie/src/screens/ArtworkLibraryScreen.tsx)| Artwork Manager & Cropper | Passed | Passed | Verified | Verified | 0 | **Fully Verified** |
| **26** | `/search` | `Search` | [Search.tsx](file:///mnt/storage/TVMovie/src/screens/Search.tsx) | Global Token Search | Passed | Passed | Verified | Verified | 0 | **Fully Verified** |
| **27** | `/sources` | `Sources` | [Sources.tsx](file:///mnt/storage/TVMovie/src/screens/Sources.tsx) | Playlist, Xtream & XMLTV | Passed | Passed | Verified | Verified | 0 | **Fully Verified** |
| **28** | `/sources/discovery`|`Sources` (Discovery)|[Sources.tsx](file:///mnt/storage/TVMovie/src/screens/Sources.tsx) | iptv-org Public Directory | Passed | Passed | Verified | Verified | 0 | **Fully Verified** |
| **29** | `/settings` | `Settings` | [Settings.tsx](file:///mnt/storage/TVMovie/src/screens/Settings.tsx) | Preferences & Diagnostics | Passed | Passed | Verified | Verified | 0 (DEF-010 fixed) | **Fully Verified** |
| **30** | `/settings/:section`|`Settings` (Section)|[Settings.tsx](file:///mnt/storage/TVMovie/src/screens/Settings.tsx)| Deep Links to Settings Tabs | Passed | Passed | Verified | Verified | 0 | **Fully Verified** |
| **31** | `/setup` | `Setup` | [Setup.tsx](file:///mnt/storage/TVMovie/src/screens/Setup.tsx) | First-Run Onboarding Flow | Passed | Passed | Verified | Verified | 0 | **Fully Verified** |
| **32** | `/watch/:ref` | `Player` | [Player.tsx](file:///mnt/storage/TVMovie/src/screens/Player.tsx) | Video Player (HLS/DASH) | Passed | Passed | Verified | Verified | 0 | **Fully Verified** |
| **33** | `/preview/:channelId`|`Player` (Preview)|[Player.tsx](file:///mnt/storage/TVMovie/src/screens/Player.tsx)| Quick Channel Preview | Passed | Passed | Verified | Verified | 0 | **Fully Verified** |
| **34** | `*` (Catch-All) | `Home` (Fallback) | [App.tsx](file:///mnt/storage/TVMovie/src/App.tsx) | Graceful Route Fallback | Passed | Passed | Verified | Verified | 0 | **Fully Verified** |

---

## 2. Route Domain Categorization & Functional Responsibilities

### 2.1 Core Entertainment Hubs (Routes 01 to 09)
- **Home (`/`):** Unified entry point. Features the cinematic hero carousel (`.home-hero-cinematic`) flowing directly into horizontal media rails (`.home-body`) on the left, paired with the persistent side hub (`.home-side-hub`) hosting live monitor, quick channels switcher, and personal library watch status.
- **Live TV (`/live`):** Electronic programme guide (EPG) rendering real-time broadcast schedules, channel preview dock, channel filtering, and XMLTV status banner.
- **Recordings (`/recordings`):** DVR recording manager displaying scheduled programmes, completed recordings, retention policies, and disk space usage.
- **Movies (`/movies`, `/movies/:id`):** Film catalog featuring hero slider, genre discovery rails, technical badge displays, synopsis, cast lists, and modal trailer player.
- **TV Series (`/series`, `/series/:id`, `/tv-shows`, `/tv-shows/:id`):** Multi-season television series catalog with season pickers, episode stills, air dates, and progress bars.

### 2.2 Audio & Digital Media Categories (Routes 10 to 14)
- **Radio (`/radio`):** Curated live radio streams with genre filters, bitrate badges, and integration with the persistent bottom audio player.
- **Music (`/music`):** Album artwork cards, track duration badges, artist metadata, and audio stream playback.
- **Podcasts (`/podcasts`):** Episodic audio feeds with custom RSS feed import dialog (`PodcastFeedModal`), episode summaries, and audio playback.
- **Audiobooks (`/audiobooks`):** Spoken word media with chapter progress tracking, narration credits, and playback speed adjustments.
- **Books (`/books`):** Digital literature library supporting full-screen reading mode via `BookReaderModal` with day, night, and sepia themes.

### 2.3 Knowledge, Sports & Specialized Channels (Routes 15 to 23)
- **Documentaries (`/documentaries`):** Topic-based documentary rails covering history, science, biography, and wildlife.
- **News (`/news`):** 24/7 global and local broadcast news streams with real-time headline tickers.
- **Sports (`/sports`):** Match highlights, league classifications, and live event sports channels.
- **Education (`/education`):** Academic lectures, scientific demonstrations, and educational series.
- **Culture & Arts (`/culture-arts`):** Museum tours, theatrical productions, classical music, and performing arts.
- **Nature & Science (`/nature-science`):** Wildlife exploration, astronomy footage, and environmental documentaries.
- **Gaming (`/gaming`):** Live gaming streams, esports competitions, and video game history archives.
- **Language Resources (`/language-resources`):** Multilingual broadcast streams and language immersion programming.
- **Historic Archives (`/media-archives`):** Preserved public domain films, silent era classics, and historic newsreels.

### 2.4 Personal Library, Artwork & System Management (Routes 24 to 34)
- **Personal Library (`/library`):** User HUD showing viewing analytics, In Progress, Watchlist, Favourites, Collections, and Local Media.
- **Artwork Manager (`/manage/artwork`):** Aspect ratio cropper and custom artwork uploader for titles and channels.
- **Global Search (`/search`):** Unified search indexing across all active sources with category filter chips and search history.
- **Sources Management (`/sources`, `/sources/discovery`):** Ingest and management for M3U playlists, Xtream credentials, XMLTV guides, and iptv-org public directory.
- **Settings (`/settings`, `/settings/:section`):** Application configuration, profiles, parental PIN, storage management, and update diagnostics.
- **First-Run Setup (`/setup`):** Clean onboarding walkthrough for profile initialization and source connection.
- **Media Player (`/watch/:ref`, `/preview/:channelId`):** Borderless video player supporting HLS/DASH playback through wry native protocol handles.
- **Fallback (`*`):** Route guard directing unrecognized paths safely back to Home.

---

## 3. Verification Standards & Quality Gate Results

Every route was validated against the following strict release standards:
1. **Zero Console Errors:** Clean React 19 execution with strict mode compliance.
2. **Zero Em-Dashes:** Full compliance with the Kinora typography standard prohibiting em-dashes.
3. **Responsive Stability:** Tested and verified at both 1920x1080 (Smart TV / Desktop) and 1280x800 (Laptop / Compact).
4. **Data Separation:** Clear boundary separation between demo mock data and genuine user sources.
5. **No Credential Leaks:** Stream tokens and authentication secrets are kept strictly within Rust native boundaries.
