# Kinora UI Completion and Parity Matrix

This matrix provides a screen-by-screen audit of all interfaces in Kinora across four operating environments: Development Fixtures (Dev Mock), User Profile without Xtream (User Sources Baseline), User Profile with Xtream (User Sources Full), and Kids Mode.

## 1. Primary Screens and Media Hubs

| Screen | Route | Dev Mock State | User Sources (No Xtream) | User Sources (With Xtream) | Kids Mode | Responsive Checks | Parity Status |
|---|---|---|---|---|---|---|---|
| **Home** | `/` | Demo hero stage, continue watching, featured channels | User playlist channels, continue watching, public discovery highlights | Full personal continue watching, live channels, Xtream VOD highlights | Adult content filtered, family friendly rails promoted | 390px (stacked), 768px, 1280px, 1920px verified | Complete |
| **Live TV** | `/live` | 10 demo channels, synthetic 24h EPG schedule | Real user M3U channels, XMLTV guide listings | Real M3U + Xtream live streams, matched XMLTV guides | Restricts 18+ channels via category and keyword filter | Paged rows, 50-row virtual window, card toggle | Complete |
| **Movies** | `/movies` | 5 demo feature films, genre chips, demo rails | Public discovery cinema archives, provider prompt banner | Authenticated Xtream VOD catalog, provider selector, categories | Excludes adult certificates and categories | Responsive poster grid (2-6 columns) | Complete |
| **Movie Details** | `/movies/:id` | Demo synopsis, cast, runtime, local stills | Public archive detail, license, origin portal link | Full Xtream metadata, stream codec badges, player launch | Enforces age rating certificate gate | Sticky header, hero backdrop, responsive action bar | Complete |
| **TV Shows** | `/series` | 5 demo series, season tabs, episode lists | Public broadcast archives, episodic collections, prompt | Authenticated Xtream series catalog, season selectors | Excludes adult series and mature themes | Responsive poster grid, episodic carousel | Complete |
| **Series Details** | `/series/:id` | Demo season lists, episode cards, progress | Public archive overview, external archive links, library toggle | Full season list, episode stills, plot summaries | Enforces age rating gate | Season dropdown, horizontal episode rail | Complete |
| **Search** | `/search` | Queries demo titles, demo channels, synthetic guide | Queries real channels, live guide, public discovery films/series | Queries real channels, guide, Xtream VOD, personal library | Blocks unsafe search terms, filters mature results | Mobile keyboard friendly, search scope chips | Complete |
| **Library** | `/library` | Demo watchlist, sample continue watching, favorites | Scoped personal library, saved public resources | Full personal watchlist, progress tracking, bookmarks | Displays kid safe saved items only | Filter chips, sort controls, empty states | Complete |
| **Sources** | `/sources` | Preset demo sources, discovery preview | Configured M3U playlists, XMLTV feeds, connection diagnostics | Configured M3U, XMLTV feeds, Xtream account status | Settings access requires parental PIN | Tabbed layout, status badges, modal forms | Complete |
| **Settings** | `/settings` | Audio/video preferences, theme controls | Real profile preferences, network security policy display | Full configuration, profile management, storage stats | Restricted by parental PIN | Responsive form grid, toggle switches | Complete |
| **Profiles** | `/profiles` | Demonstrates profile switcher and creation | Manages isolated user profiles with partitioned storage | Full profile management with per profile data | PIN protected profile switching | Profile avatar grid, PIN dialog | Complete |

---

## 2. Specialized Media Category Hubs

All category hubs utilize the shared `MediaCategoryPage.tsx` architecture, featuring segmented view controls ("Public Discovery" | "My Sources ({count})" | "Favourites"), provenance badges, and capability indicators.

| Category Screen | Route | Public Discovery Content | Personal Sources Integration | Capability Focus | Parity Status |
|---|---|---|---|---|---|
| **Radio** | `/radio` | Curated global public radio, BBC, NPR, SomaFM | User bookmarked streams and custom audio feeds | `live-audio` (HTML5 in-app playback) | Complete |
| **Podcasts** | `/podcasts` | Public science, culture, and news podcast RSS feeds | User added audio feeds | `podcast` (RSS streaming) | Complete |
| **Music** | `/music` | Open cultural audio archives, royalty free streams | Personal music sources | `live-audio` / `playable-stream` | Complete |
| **Audiobooks** | `/audiobooks` | LibriVox public domain recordings, literary classics | Personal audio libraries | `live-audio` / `public-archive` | Complete |
| **Books** | `/books` | Project Gutenberg, Standard Ebooks, Open Library | User saved literature references | `downloadable-book` (External portal) | Complete |
| **Documentaries** | `/documentaries` | Public service documentaries, NASA, PBS feeds | User bookmarked documentary channels | `playable-stream` / `public-archive` | Complete |
| **News** | `/news` | International public news channels (Euronews, DW, France 24) | Personal news playlists | `playable-stream` / `live-broadcast` | Complete |
| **Sports** | `/sports` | Open sporting federations, Olympic channel highlights | Personal sports channels | `playable-stream` / `live-broadcast` | Complete |
| **Education** | `/education` | MIT OpenCourseWare, Khan Academy, CrashCourse | Personal educational resources | `external-website` / `metadata-provider` | Complete |
| **Gaming** | `/gaming` | Esports tournament streams, retro gaming archives | User gaming channels | `playable-stream` / `public-archive` | Complete |
| **Nature & Science** | `/nature-science` | NASA TV, ESA archives, European Southern Observatory feeds | Personal science feeds | `playable-stream` / `public-archive` | Complete |
| **Archives** | `/archives` | Internet Archive, Library of Congress collections | Personal historical bookmarks | `public-archive` (Deep research links) | Complete |
| **Culture** | `/culture` | Smithsonian, Louvre virtual exhibits, UNESCO media | Personal cultural resources | `external-website` / `public-archive` | Complete |

---

## 3. Responsive Breakpoint Standards

Every screen adheres to the following responsive design rules:
- **Mobile (< 768px)**: Single column layouts, collapsible navigation, full-width touch targets (minimum 44px), sticky bottom playback pill, stacked search scopes.
- **Tablet (768px - 1024px)**: 2-3 column poster grids, horizontal scrolling rails with touch momentum, compact sidebar.
- **Desktop (1024px - 1440px)**: 4-5 column poster grids, full multi-pane detail sheets, expanded sidebar with category groupings.
- **Ultra-Wide (> 1440px)**: Max-width content containers (`max-width: 1480px`), 6-column poster grids, cinematic hero backdrop stages.
