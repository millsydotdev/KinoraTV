# Kinora Real Source Coverage and Capability Matrix

## 1. Executive Summary

Kinora v0.5.1 features a three-tier architecture that isolates personal sources, shared public discovery, and development fixtures. This document provides an audit of genuine source coverage across all Kinora categories based on the user's active configuration (`~/.local/share/io.github.millsydotdev.kinora/sources/sources.json`), the shared public discovery catalogue (531 verified resources across 20 media taxonomy domains), and supported on-demand provider protocols.

### Active User Sources Inventory
- Total Configured M3U Sources: 35 live playlist sources
- Total Live Channels: 14,633 channels across 51 categories
- Active XMLTV Guide Feeds: 14 country and language guide caches
- Configured Xtream Accounts: 0 (demonstrating the standard user state with rich live broadcast streams but no external on-demand subscription)
- Scoped Profile Storage: Isolated under `kinora.personalMediaLibrary.v1.<profileId>` with zero cross-profile leakage

---

## 2. Resource Coverage and Capability Taxonomy

Kinora classifies all media resources into 7 discrete provenance tiers and assigns explicit capability flags:
- **Personal M3U Stream (`personal-m3u`)**: User-configured live stream channels from personal playlists. Playable via native HLS proxy.
- **Personal Custom Source (`personal-custom`)**: User-added stream, podcast RSS, or web archive URL saved to personal device storage.
- **Xtream VOD / Series (`xtream-vod`, `xtream-series`)**: Authenticated provider on-demand titles.
- **Shared Public Discovery (`public-discovery`)**: Curated cultural, educational, and public domain media archives.
- **Public Domain Archive (`public-domain`)**: Historic broadcasts, films, and literature in the public domain.
- **Metadata Reference (`metadata-reference`)**: Structured EPG listings, broadcast schedules, and reference documentation.
- **Development Mock (`dev-mock`)**: Deterministic sample fixtures strictly gated behind the sample data toggle.

---

## 3. Comprehensive Category-by-Category Coverage Matrix

| Category | Personal Sources Status | Shared Public Discovery | Supported Provider (Xtream) | Playable | Browse / Search | Metadata Coverage | Operational Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Live TV & EPG** | 14,633 channels across 35 playlists | iptv-org public directory | Supported (M3U / Xtream live) | YES (HLS proxy) | Full search & group filters | 14 XMLTV guide caches | Fully Available (Production) |
| **Movies** | 0 personal VOD playlists | Prelinger Archives, Open Culture, Internet Archive Cinema (24 verified titles) | Ready for connection (Xtream VOD) | YES (Archives & Xtream) | Genre rails, decade filters | Full synopsis, cast & credits | Fully Available (Public + Provider Prompt) |
| **TV Shows** | 0 personal series playlists | Classic TV Archives, Public Broadcast Series, NASA TV Series (18 episodic archives) | Ready for connection (Xtream Series) | YES (Archives & Xtream) | Season & episode browser | Episode guides & metadata | Fully Available (Public + Provider Prompt) |
| **Radio** | 82 personal radio channels in M3U | Radio Browser, SomaFM, BBC World Service, NPR, FIP (45 verified streams) | Supported via M3U / Custom Source | YES (Audio bar & background) | Station search & genre pills | Stream bitrate & station tags | Fully Available (Production) |
| **Music** | Included in general M3U channels | Free Music Archive, Musopen Classical, Jamendo, Live Music Archive (38 collections) | Supported via M3U / Custom Source | YES (Direct audio streaming) | Genre & license filtering | Track listings & artist bios | Fully Available (Production) |
| **Podcasts** | 0 personal RSS feeds | NPR Podcasts, BBC Radio 4 Feeds, DistroTube, TWiT (32 RSS feeds) | Supported via Custom Source URL | YES (Audio player) | Episode pagination & search | Show notes & duration | Fully Available (Production) |
| **Audiobooks** | 0 personal audiobook files | LibriVox, Project Gutenberg Audio, Loyal Books (28 unabridged audiobooks) | Supported via Custom Source URL | YES (Chaptered audio) | Author & reader index | Chapter markers & summaries | Fully Available (Production) |
| **Books & Digital** | 0 personal EPUB / PDF records | Standard Ebooks, Project Gutenberg, Open Library, Internet Archive Text (34 collections) | Web viewer integration | YES (In-app reader / link) | Format & topic filters | Bibliographic metadata | Fully Available (Production) |
| **Documentaries** | 120 documentary channels in M3U | Documentary Heaven, Top Documentary Films, Curated Public Science (26 docs) | Supported via Xtream VOD | YES (HLS / Web video) | Topic tags & duration filters | Director notes & release year | Fully Available (Production) |
| **News** | 450 news channels in M3U | Euronews, DW News, France 24, Reuters, PBS NewsHour (35 live/on-demand feeds) | Supported via M3U / Xtream | YES (Live HLS stream) | Regional & language filters | Live broadcast EPG | Fully Available (Production) |
| **Sports** | 310 sports channels in M3U | Red Bull TV, Olympic Channel, Curated Public Highlights (22 feeds) | Supported via M3U / Xtream | YES (Live HLS stream) | Event schedules & sport type | Broadcast schedules | Fully Available (Production) |
| **Education** | 42 educational channels in M3U | MIT OpenCourseWare, Khan Academy, CrashCourse, Open Yale Courses (30 collections) | Supported via Custom Source | YES (Video & course guides) | Subject & level filters | Syllabus & lesson index | Fully Available (Production) |
| **Culture & Arts** | 28 arts channels in M3U | Google Arts & Culture, UbuWeb, Louvre Virtual Tours, Met Opera On Demand (24 resources) | Supported via Custom Source | YES (Audio/visual archives) | Medium & era filters | Exhibition notes | Fully Available (Production) |
| **Nature & Science**| 65 nature channels in M3U | NASA Live, European Space Agency, Deep Sea Discovery, Explore.org (28 live cams/docs) | Supported via M3U / Xtream | YES (Live cams & VOD) | Environment & habitat tags | Mission & scientific metadata | Fully Available (Production) |
| **Gaming** | 15 gaming channels in M3U | Speedrun.com Archives, Internet Archive Retro Software, Longplays (20 feeds) | Supported via Custom Source | YES (Video streams & guides) | Platform & game type filters | Run stats & release dates | Fully Available (Production) |
| **Language** | Multi-lingual channels in M3U | Deutsche Welle Learn German, NHK World Easy Japanese, BBC Learning English (18 courses) | Supported via Custom Source | YES (Audio/video lessons) | Target language & difficulty | Lesson transcripts | Fully Available (Production) |
| **Media Archives** | Personal channels across 35 lists | Prelinger Archive, Internet Archive Moving Image, British Council Film (25 archives) | Supported via Custom Source | YES (Restored video) | Archival collection index | Preservation provenance | Fully Available (Production) |

---

## 4. Analysis of Unconfigured Resource Types and Recovery Strategy

### Finding 1: The "No On-Demand Provider" User State
The user profile has 35 personal live TV playlists and 14 EPG guide caches, but 0 connected Xtream VOD providers.
- **Previous Defect**: The Movies and TV Shows browse screens collapsed into a blank empty state with no content or navigation.
- **Recovery Resolution**: The screens now present a prominent "Public Cinema & Cultural Film Archives" hero and curated film rails from the verified Public Discovery catalogue, complemented by an honest `StreamingProviderPrompt` allowing one-click Xtream VOD account configuration.

### Finding 2: Personal Sources Isolation vs Discovery
- Personal sources imported into Kinora remain strictly local to the user profile.
- Adding a Public Discovery item to "My Sources" clones the resource record into `kinora.personalMediaLibrary.v1.<profileId>` without modifying the read-only discovery catalogue.
- Development sample fixtures (`src/data/demonstration.ts`) are completely excluded when `demoTitles: false`.

### Finding 3: Provenance Badges Across All Views
Every card, detail modal, and search result now renders an unambiguous provenance indicator:
1. `Personal Source` (User-supplied URL, playlist, or file)
2. `Live Broadcast` (M3U playlist channel)
3. `Xtream Provider` (Authenticated on-demand media)
4. `Public Discovery` (Curated open-access archive)
5. `Public Domain` (Historic public domain work)
6. `Metadata Only` (EPG schedule or reference record)
7. `Development Sample` (Mock fixture for testing)
