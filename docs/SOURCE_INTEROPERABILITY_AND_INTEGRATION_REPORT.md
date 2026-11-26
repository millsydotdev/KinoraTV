# Kinora 0.6.0: Source Interoperability and Integration Report

Date: 2026-11-24
Status: Verified
Version: 0.6.0

## Executive Summary

This engineering report documents the completion, validation, and interoperability verification of Kinora's remaining source integrations:
1. Media Server Integration: Genuine connectivity for Jellyfin, Emby, and Plex.
2. RSS Podcast Support: Real RSS 2.0, iTunes, and Atom feed ingestion with persistent subscriptions and audio player integration.
3. OPDS Book Support: OPDS 1.2 (Atom) and OPDS 2.0 (JSON) catalog browsing, OpenSearch querying, book cover presentation, and format classification.
4. Stalker / MAG Middleware Enhancements: Automated session token re-authentication, capability detection, timetable EPG extraction, and archive catch-up stream generation.
5. Multi-Source Interoperability and Deduplication: Universal canonical media aggregation, variant selection across disparate sources, safe source removal without data loss, and outage-resilient library caching.
6. Encrypted Backup and Restore Compatibility: AES-GCM 256-bit container preservation and migration for all modern source kinds, credential scrubbing, and tamper-evident checksums.

All ten source integrations in [src/data/sourceCompatibility.ts](file:///mnt/storage/TVMovie/src/data/sourceCompatibility.ts) are now classified as `fully-implemented`.

---

## 1. Media Server Integrations (Jellyfin, Emby, Plex)

### Architectural Design and Implementation
Kinora provides direct, authenticated clients for the three major media server platforms without adding third-party runtime dependencies:
- Jellyfin Client: [src/lib/mediaServer/jellyfin.ts](file:///mnt/storage/TVMovie/src/lib/mediaServer/jellyfin.ts)
  - Public server discovery and authentication via `/Users/AuthenticateByName`.
  - Token authentication header: `X-MediaBrowser-Token`.
  - Library retrieval via `/Users/{userId}/Views`.
  - Recursive item indexing with pagination and search filtering.
  - Image URL resolution with token signing and dimension constraints (`/Items/{id}/Images/Primary`, `/Items/{id}/Images/Backdrop`).
  - Stream playback endpoints for direct streams and HLS playlists.
  - Watch progress reporting via `/Sessions/Playing/Progress` and `/Users/{userId}/PlayedItems/{id}`.
- Emby Client: [src/lib/mediaServer/emby.ts](file:///mnt/storage/TVMovie/src/lib/mediaServer/emby.ts)
  - Compatibility with Emby server authorization header format (`X-Emby-Authorization`, `X-Emby-Token`).
  - Complete library hierarchy navigation for movies, series, seasons, and episodes.
  - Progress updates and playback milestone sync.
- Plex Client: [src/lib/mediaServer/plex.ts](file:///mnt/storage/TVMovie/src/lib/mediaServer/plex.ts)
  - Server identity verification via `/identity`.
  - Header-based token security (`X-Plex-Token`, `X-Plex-Client-Identifier`).
  - Section discovery via `/library/sections`.
  - Metadata parsing with direct part key resolution (`/library/parts/{id}`).
  - Watch progress reporting via `/:/timeline` and `/:/scrobble`.
- Central Manager and React State:
  - [src/lib/mediaServer/manager.ts](file:///mnt/storage/TVMovie/src/lib/mediaServer/manager.ts): Multi-server persistent store (`kinora.media_servers.v1`), cached media items (`kinora.media_server_items.v1`), and connection health testing.
  - [src/state/mediaServers.ts](file:///mnt/storage/TVMovie/src/state/mediaServers.ts): React state hook `useMediaServers()`.
  - [src/components/MediaServerModal.tsx](file:///mnt/storage/TVMovie/src/components/MediaServerModal.tsx): Visual configuration modal with live connection test feedback, library synchronization, and server management.

### Verification Results
14 unit tests in [src/lib/mediaServer/mediaServer.test.ts](file:///mnt/storage/TVMovie/src/lib/mediaServer/mediaServer.test.ts) pass successfully:
- Connection testing against valid and invalid endpoints.
- User authentication and token retrieval.
- Library section discovery for movies and television series.
- Item parsing, artwork assignment, and stream URL generation.
- Season and episode tree structure retrieval.
- Playback progress reporting and scrobbling.
- Persistent server configuration storage and retrieval.

---

## 2. RSS Podcast Support

### Architectural Design and Implementation
- Parser: [src/lib/podcast/parser.ts](file:///mnt/storage/TVMovie/src/lib/podcast/parser.ts)
  - Browser and native XML DOM parsing for RSS 2.0 with iTunes podcast extensions and Atom feeds.
  - Strict audio enclosure validation: verifies MIME types (`audio/mpeg`, `audio/mp4`, `audio/aac`, `audio/ogg`, etc.) or audio file extensions (`.mp3`, `.m4a`, `.aac`, `.ogg`).
  - Flexible duration parsing supporting seconds, `MM:SS`, and `HH:MM:SS` notations.
  - Channel and episode artwork extraction (`<itunes:image>`, `<image><url>`, `<media:thumbnail>`).
  - Episode deduplication using GUIDs, enclosure URLs, or title hashes.
- Fetcher and Client: [src/lib/podcast/client.ts](file:///mnt/storage/TVMovie/src/lib/podcast/client.ts)
  - Guarded HTTP fetch with descriptive network and XML validation error handling.
- Subscription Store and UI:
  - [src/state/podcastSubscriptions.ts](file:///mnt/storage/TVMovie/src/state/podcastSubscriptions.ts): Persistent store for podcast subscriptions (`kinora.podcast.subscriptions.v1`), cached episode metadata (`kinora.podcast.episodes.v1`), and listening progress (`kinora.podcast.progress.v1`).
  - [src/components/PodcastFeedModal.tsx](file:///mnt/storage/TVMovie/src/components/PodcastFeedModal.tsx): Feed explorer with channel artwork, episode lists, duration badges, subscribe/unsubscribe toggle, and live audio playback.

### Verification Results
7 unit tests in [src/lib/podcast/podcast.test.ts](file:///mnt/storage/TVMovie/src/lib/podcast/podcast.test.ts) pass successfully:
- Standard RSS 2.0 feed parsing with audio enclosures.
- iTunes podcast tag parsing (`itunes:author`, `itunes:summary`, `itunes:image`, `itunes:duration`).
- Atom feed parsing with audio link enclosures.
- Enclosure MIME type and file extension validation.
- Malformed XML error handling.
- Subscription state storage and update cycles.

---

## 3. OPDS Book Support

### Architectural Design and Implementation
- Parser: [src/lib/opds/parser.ts](file:///mnt/storage/TVMovie/src/lib/opds/parser.ts)
  - Dual support for OPDS 1.2 (Atom XML) and OPDS 2.0 (JSON) catalog feeds.
  - OpenSearch XML template discovery and query string expansion.
  - Book cover and thumbnail extraction (`http://opds-spec.org/image`, `http://opds-spec.org/thumbnail`).
  - Acquisition link extraction and format classification (`epub`, `pdf`, `html`, `txt`).
  - Relative URL resolution against catalog base URLs.
- Client: [src/lib/opds/client.ts](file:///mnt/storage/TVMovie/src/lib/opds/client.ts)
  - Feed fetcher supporting text/xml and application/opds+json responses.
  - OpenSearch URL query formatting.
- Catalog Store and UI:
  - [src/state/opdsCatalogs.ts](file:///mnt/storage/TVMovie/src/state/opdsCatalogs.ts): Persistent catalog store (`kinora.opds.catalogs.v1`) seeded with high-quality public domain catalogs (Project Gutenberg, Standard Ebooks, Feedbooks).
  - [src/components/OpdsCatalogModal.tsx](file:///mnt/storage/TVMovie/src/components/OpdsCatalogModal.tsx): Catalog browser with catalog switcher, search bar, navigation sections, book cover grid, and acquisition buttons (EPUB/PDF download, HTML reader).

### Verification Results
6 unit tests in [src/lib/opds/opds.test.ts](file:///mnt/storage/TVMovie/src/lib/opds/opds.test.ts) pass successfully:
- OPDS 1.2 Atom XML feed parsing with entries and covers.
- OPDS 2.0 JSON feed parsing with metadata, publications, and links.
- Document format classification by MIME type and file extension.
- OpenSearch search URL templating and query construction.
- Persistent catalog configuration storage and custom feed additions.

---

## 4. Stalker / MAG Middleware Improvements

### Architectural Design and Implementation
- Rust Backend: [src-tauri/src/stalker.rs](file:///mnt/storage/TVMovie/src-tauri/src/stalker.rs)
  - `reauthenticate(&self) -> Result<String, IngestError>`: Automated re-handshake and token refresh upon token expiration.
  - `get_capabilities(&self) -> Result<StalkerCapabilities, IngestError>`: Detects portal features (ITV live, VOD catalogue, short EPG, and archive catch-up).
  - `get_short_epg(&self, channel_id: &str) -> Result<Vec<StalkerEpgProgramme>, IngestError>`: Ingests timetable programmes for channel schedule binding.
  - `create_catchup_link(&self, cmd: &str, start: u64, duration: u32) -> Result<String, IngestError>`: Generates archive catch-up playback streams.
  - Pure parsers: `parse_capabilities`, `parse_epg_response`, and `parse_create_link_response`.
- TypeScript Frontend: [src/lib/stalker.ts](file:///mnt/storage/TVMovie/src/lib/stalker.ts)
  - Added `StalkerCapabilities` and `StalkerEpgProgramme` data models.
  - Added `mapStalkerEpgToProgrammes` to convert Stalker timetable entries into Kinora's native `Programme` schedule format.
  - Added `buildStalkerCatchupRequest` for archive playback parameter construction.

### Verification Results
- Rust tests in [src-tauri/src/stalker.rs](file:///mnt/storage/TVMovie/src-tauri/src/stalker.rs):
  - `validates_and_normalizes_mac_addresses` (PASSED)
  - `extracts_clean_stream_from_stalker_cmd` (PASSED)
  - `parses_token_from_both_direct_and_jshttprequest_formats` (PASSED)
  - `parses_channels_and_genres_accurately` (PASSED)
  - `parses_create_link_cmd_stream` (PASSED)
  - `parses_stalker_capabilities_accurately` (PASSED)
  - `parses_stalker_epg_timetable_records` (PASSED)
- TypeScript tests in [src/lib/stalker.test.ts](file:///mnt/storage/TVMovie/src/lib/stalker.test.ts):
  - MAC formatting and validation.
  - Channel and VOD mapping to Kinora types.
  - EPG mapping to native `Programme` objects with timestamps and descriptions.
  - Catch-up link request building.

---

## 5. Multi-Source Interoperability and Deduplication

### Architectural Design and Implementation
- Universal Media Aggregator: [src/lib/vodAggregation.ts](file:///mnt/storage/TVMovie/src/lib/vodAggregation.ts)
  - `aggregateUniversalMedia`: Normalizes title strings, extracts release year, and groups matching titles across M3U, Xtream, Local Media, Media Server, and Stalker into canonical entries.
  - Each canonical entry retains all stream variants with quality badges (`4K`, `1080p`, `720p`, `SD`) and source identity.
  - Safe source deletion via `removeSourceFromUniversalMedia`: When a user deletes a source, only that source's stream variants are removed. If another source provides the same title, the canonical item and any user-assigned custom artwork remain intact.
  - Outage-resilient library caching via `reconcileResilientLibrary`: If a source returns empty or encounters a network error during refresh, previously cached media items for that source are safeguarded and preserved.

### Verification Results
Unit tests in [src/lib/mediaInteroperability.test.ts](file:///mnt/storage/TVMovie/src/lib/mediaInteroperability.test.ts) pass successfully:
- Cross-source deduplication coalesces items from Xtream, Media Server, and Local Media into a single title with three distinct stream variants.
- Removing one source leaves the other variants and canonical title untouched.
- Dropping the final source cleans up the canonical title cleanly.
- Outage resilience retains cached entries when a source fetch reports failure.

---

## 6. Encrypted Backup and Restore Compatibility

### Architectural Design and Implementation
- Container Updates: [src/lib/encryptedBackup.ts](file:///mnt/storage/TVMovie/src/lib/encryptedBackup.ts)
  - Extended `KinoraBackupPayload` to include `mediaServers`, `podcastSubscriptions`, `opdsCatalogs`, and `stalkerPortals`.
  - Updated `inspectBackupPayload` to report counts for all source types.
  - Security rules: Plain-text passwords for media servers are automatically scrubbed or marked protected during export.
  - Added pre-flight migration warnings advising users to verify media server tokens and network MAC authorization after restoring across devices.
  - Modal integration in [src/components/EncryptedBackupModal.tsx](file:///mnt/storage/TVMovie/src/components/EncryptedBackupModal.tsx) allows selective or full restoration of media servers, podcasts, OPDS catalogs, and Stalker portals.

### Verification Results
Unit tests in [src/lib/encryptedBackup.test.ts](file:///mnt/storage/TVMovie/src/lib/encryptedBackup.test.ts) pass successfully:
- Pre-flight inspection accurately counts media servers, podcasts, OPDS catalogs, and Stalker portals.
- Security warnings are emitted for credential-bearing sources.
- AES-GCM 256-bit round-trip encryption and decryption preserves all extended source records intact.

---

## 7. Quality Gates Summary

1. Rust Test Suite:
   - Command: `npm run test:rust` (`cargo test`)
   - Outcome: 111 tests passed, 0 failed.
2. TypeScript Typecheck:
   - Command: `npm run typecheck` (`tsc -b`)
   - Outcome: 0 type errors.
3. Vitest Test Suite:
   - Command: `npm test` (`vitest run`)
   - Outcome: 81 test files passed, 1,061 tests passed, 0 failed.
4. Typography Verification:
   - Scanned all source code, documentation, tests, and comments.
   - Outcome: Exactly 0 em-dashes and 0 en-dashes.
5. Version Lock:
   - Locked at `0.6.0` across [package.json](file:///mnt/storage/TVMovie/package.json) and [src-tauri/Cargo.toml](file:///mnt/storage/TVMovie/src-tauri/Cargo.toml).

---

## 8. Conclusion

Kinora 0.6.0 now possesses a unified, resilient, and multi-source architecture. Media servers (Jellyfin, Emby, Plex), RSS podcasts, OPDS publications, and Stalker middleware are fully implemented and interoperable with existing M3U and Xtream workflows. Content from multiple sources deduplicates reliably while preserving individual stream variants, local caches are resilient to provider outages, and user libraries can be safely exported and migrated with military-grade encryption.
