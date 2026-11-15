# Forensic Investigation: Stalker Middleware / Ministra / MAG Device Integration

## 1. Executive Summary

This forensic investigation analyzes the architecture, authentication mechanisms, content discovery protocols, and streaming mechanics of Stalker Middleware (now commercialized as Ministra TV platform) and Infomir MAG set-top box portals.

While Xtream Codes provides a stateless, REST-like JSON API where authentication credentials are transmitted in query parameters or URL paths, Stalker / MAG is an interactive, session-stateful portal protocol designed originally for dedicated hardware set-top boxes running Linux-based embedded browsers.

### Key Findings

1. **Stateful Session Lifecycle**: Authentication requires a multi-step handshake protocol (`handshake -> get_profile`) yielding a temporary session token. Requests without a valid active token and matching cookie headers are rejected.
2. **Hardware Identity Emulation**: Authorization is keyed to physical Media Access Control (MAC) addresses (frequently using the Infomir OUI prefix `00:1A:79:XX:XX:XX`), accompanied by specific User-Agent and device capability header signatures.
3. **Dynamic Stream Minting**: Unlike Xtream Codes, where media URLs are predictable and deterministic, Stalker does not publish direct stream URLs during content indexing. Instead, clients must request a temporary, time-bounded URL via the `create_link` endpoint immediately before playback.
4. **Architectural Compatibility with Kinora**: A translation adapter can be integrated within Kinora's Rust backend (`src-tauri/src/stalker.rs`). By mapping dynamic `create_link` responses directly into Kinora's `stream.rs` HLS rewriting proxy (`kstream://localhost/<handle>`), Kinora can support Stalker portals while upholding strict security boundaries and preventing any upstream credential or token leakage.

---

## 2. Protocol Architecture and Handshake Mechanism

Stalker portals are hosted on standard web servers (Apache or Nginx) running PHP backends. The primary entry point for STB interactions is typically located at:
- `/stalker_portal/server/load.php`
- `/server/load.php`
- `/c/` (rewrite rule redirecting to `load.php`)

All operations use HTTP GET or POST queries targeting `load.php` with parameter pairs designating the component (`type`) and the operation (`action`).

### The Handshake Sequence

A client cannot fetch channels or initiate playback without first acquiring an active session token.

```
+--------+                                         +----------------+
| Client |                                         | Stalker Server |
+--------+                                         +----------------+
    |                                                      |
    | 1. GET load.php?type=stb&action=handshake&token=    |
    |    Headers: User-Agent: MAG250..., Cookie: mac=...   |
    |----------------------------------------------------->|
    |                                                      |
    | 2. Response: { "js": { "token": "<session_token>",   |
    |                        "random": "<salt>" } }        |
    |<-----------------------------------------------------|
    |                                                      |
    | 3. GET load.php?type=stb&action=get_profile&hd=1...  |
    |    Headers: Authorization: Bearer <session_token>    |
    |----------------------------------------------------->|
    |                                                      |
    | 4. Response: User profile, services, status: OK      |
    |<-----------------------------------------------------|
```

#### Step 1: Initialization Handshake
The client issues an initial request to acquire a session token:
```http
GET /stalker_portal/server/load.php?type=stb&action=handshake&token=&mac=00%3A1A%3A79%3AB1%3A22%3A33 HTTP/1.1
Host: portal.example.com
User-Agent: Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3
X-User-Agent: Model: MAG250; Link: Ethernet
Cookie: mac=00%3A1A%3A79%3AB1%3A22%3A33; stb_lang=en; timezone=UTC
Accept: */*
```

#### Step 2: Token Issuance
The portal responds with a JSON-wrapped JavaScript response:
```json
{
  "js": {
    "token": "4F9A2B8C1D6E3F7A0B5C8D2E1F4A6B8C",
    "random": "d41d8cd98f00b204e9800998ecf8427e"
  }
}
```

#### Step 3: Profile Verification
Using the issued session token, the client requests its active subscriber profile:
```http
GET /stalker_portal/server/load.php?type=stb&action=get_profile&hd=1&ver=ImageDescription:%200.2.18-r14-pub-250&num_banks=2&sn=012015B012345&stb_type=MAG250&image_version=218 HTTP/1.1
Host: portal.example.com
User-Agent: Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3
X-User-Agent: Model: MAG250; Link: Ethernet
Authorization: Bearer 4F9A2B8C1D6E3F7A0B5C8D2E1F4A6B8C
Cookie: mac=00%3A1A%3A79%3AB1%3A22%3A33; stb_lang=en; timezone=UTC
```

The portal validates the subscription status, active connection limit, and expiration date. If the device MAC is unregistered, expired, or blocked, `get_profile` returns an error status or redirects to an access denied screen.

---

## 3. MAC Address Authentication and Header Emulation

Stalker Middleware relies heavily on client fingerprint verification. Standard web clients (browsers, cURL, generic HTTP libraries) are rejected with HTTP 403 or empty responses unless specific hardware identification headers are present.

### Required Header Attributes

1. **User-Agent**:
   Must match an Infomir STB user agent string:
   `Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3`
2. **X-User-Agent**:
   Identifies hardware model and connection interface:
   `Model: MAG250; Link: Ethernet` or `Model: MAG322; Link: WiFi`
3. **Cookie**:
   Must contain URL-encoded MAC address and localization parameters:
   `mac=00:1A:79:XX:XX:XX; stb_lang=en; timezone=Europe/London`
4. **Authorization**:
   Transmits the session token obtained during handshake:
   `Bearer <session_token>`

### Security Considerations for Kinora

- **MAC Address Protection**: Kinora must treat MAC addresses as sensitive credentials. MAC addresses must never be hardcoded, logged, or exposed in cleartext diagnostics.
- **Header Isolation in Rust**: Header construction and token management must occur exclusively in Rust (`src-tauri/src/fetch.rs`). The frontend React layer must never directly craft or receive device spoofing headers.
- **Loopback and Private Network Guarding**: As with all Kinora network requests, Stalker portal addresses must be strictly validated against SSRF attacks and loopback probing via Kinora's `fetch::check_url`.

---

## 4. Content Discovery APIs

Once authenticated, the client queries `load.php` to discover categories, live streams, video-on-demand content, series, and EPG schedules.

### Live TV Channels and Categories

#### 1. Live Categories (Genres)
```http
GET /stalker_portal/server/load.php?type=itv&action=get_genres HTTP/1.1
```
Response:
```json
{
  "js": [
    { "id": "1", "title": "News", "alias": "news" },
    { "id": "2", "title": "Sports", "alias": "sports" },
    { "id": "3", "title": "Cinema", "alias": "movies" }
  ]
}
```

#### 2. All Channels
```http
GET /stalker_portal/server/load.php?type=itv&action=get_all_channels HTTP/1.1
```
Response:
```json
{
  "js": {
    "data": [
      {
        "id": "1001",
        "name": "Sky News HD",
        "number": "1",
        "tv_genre_id": "1",
        "cmd": "ffmpeg http://stream.source.internal/sky_news.ts",
        "logo": "http://portal.example.com/stalker_portal/misc/logos/320/1001.png",
        "tv_archive": 1,
        "archive_range": 604800,
        "cur_playing": "Sky News Breakfast"
      }
    ]
  }
}
```

*Crucial Protocol Distinction*: The `cmd` property in the channel record is an internal command template (often prefixed with `ffmpeg`, `auto`, or `ffrt`), not a playable URL. Passing this string directly to an HLS player will result in immediate playback failure.

### Video on Demand (Movies) and Series

#### Movies Discovery
```http
GET /stalker_portal/server/load.php?type=vod&action=get_categories HTTP/1.1
GET /stalker_portal/server/load.php?type=vod&action=get_ordered_list&category=10&p=1 HTTP/1.1
```

Returns paginated records with media attributes:
- `id`: Unique VOD identifier
- `name`: Film title
- `o_name`: Original / international title
- `rating_imdb`: IMDB score
- `year`: Release year
- `cmd`: Playback command reference
- `screenshot_uri`: Promotional poster artwork

#### TV Series Discovery
```http
GET /stalker_portal/server/load.php?type=series&action=get_ordered_list&category=20&p=1 HTTP/1.1
GET /stalker_portal/server/load.php?type=series&action=get_episodes&series_id=5001 HTTP/1.1
```

Returns seasons and episode arrays mapped to episode-specific `cmd` playback references.

### Electronic Programme Guide (EPG)

Stalker provides both windowed batch EPG and channel-specific schedule APIs:

```http
GET /stalker_portal/server/load.php?type=itv&action=get_epg_info&period=24 HTTP/1.1
GET /stalker_portal/server/load.php?type=itv&action=get_short_epg&ch_id=1001 HTTP/1.1
```

The response formats programme schedules with UNIX timestamps (`time`, `time_to`), title (`name`), and detailed description (`descr`), which can be converted cleanly into Kinora's native `EpgProgramme` format.

---

## 5. Dynamic Link Minting and Playback Lifecycle

The most distinct technical barrier in Stalker / MAG protocols is dynamic link generation via the `create_link` endpoint.

```
+--------+                 +----------------+                 +---------------+
| Kinora |                 | Stalker Server |                 | HLS Streaming |
|  App   |                 | (Middleware)   |                 | Edge Server   |
+--------+                 +----------------+                 +---------------+
    |                              |                                  |
    | 1. open_stream(stalker://..) |                                  |
    |----------------------------->|                                  |
    |                              |                                  |
    | 2. action=create_link        |                                  |
    |    cmd=ffmpeg http://...     |                                  |
    |----------------------------->|                                  |
    |                              |                                  |
    | 3. Returns temporary URL     |                                  |
    |    (TTL: 15-60 minutes)      |                                  |
    |<-----------------------------|                                  |
    |                              |                                  |
    | 4. Fetch Master Playlist     |                                  |
    |---------------------------------------------------------------->|
    | 5. HLS Manifest & Segments                                      |
    |<----------------------------------------------------------------|
    |                              |                                  |
    | 6. Rewrite as kstream://...  |                                  |
    |    Serve to React Player     |                                  |
```

### The `create_link` Execution

When a user selects a channel or movie:
1. Kinora sends:
   ```http
   GET /stalker_portal/server/load.php?type=itv&action=create_link&cmd=ffmpeg%20http%3A%2F%2Fstream.source.internal%2Fsky_news.ts&series=&forced_storage=0&disable_ad=0 HTTP/1.1
   Host: portal.example.com
   User-Agent: Mozilla/5.0 (QtEmbedded; U; Linux; C) MAG200...
   Authorization: Bearer 4F9A2B8C1D6E3F7A0B5C8D2E1F4A6B8C
   Cookie: mac=00%3A1A%3A79%3AB1%3A22%3A33; stb_lang=en; timezone=UTC
   ```
2. The server mints a temporary edge streaming URL:
   ```json
   {
     "js": {
       "cmd": "http://edge01.provider.example/live/ch1001/playlist.m3u8?token=9f8e7d6c5b4a3"
     }
   }
   ```
3. *Token Expiry & Re-Minting*: Temporary URLs typically have a Time-To-Live (TTL) ranging from 15 to 60 minutes. If playback drops or returns HTTP 401/403 during long sessions, the backend proxy must transparently invoke `create_link` to refresh the stream token without interrupting user experience.

### Catch-up and Timeshift

Where catch-up television is enabled (`tv_archive: 1`), Stalker supports time-shifted playback by injecting time parameters:
```http
GET /stalker_portal/server/load.php?type=itv&action=create_link&cmd=ffmpeg%20http%3A%2F%2Fstream.source.internal%2Fsky_news.ts&archive=1&start=1731542400&duration=3600 HTTP/1.1
```
The server resolves the request to an archived HLS manifest covering the exact historical timespan.

---

## 6. Architectural Comparison: Xtream Codes vs Stalker / MAG

| Architectural Dimension | Xtream Codes Platform | Stalker / Ministra / MAG |
| :--- | :--- | :--- |
| **Authentication Paradigm** | Stateless query parameters (`username`, `password`) | Stateful session handshake (`MAC`, `Bearer token`, `Cookies`) |
| **Client Identity Model** | Standard HTTP client (headers optional) | Hardware emulation (Strict MAG STB User-Agent & MAC header) |
| **Discovery APIs** | Direct JSON endpoints (`/player_api.php`) | Central RPC gateway (`load.php?type=...&action=...`) |
| **Stream URL Resolution** | Deterministic (`/live/{u}/{p}/{id}.m3u8`) | Dynamic minting via `create_link` per playback session |
| **Link Lifetime** | Persistent across subscription duration | Short-lived temporary URLs (15 to 60 minute TTL) |
| **Session Tracking** | Tracked on edge streaming connection | Monitored actively via keep-alive profile polling |
| **Catch-up Architecture** | Timeshift query parameters (`timeshift.php`) | Archive parameter on `create_link` (`archive=1&start=...`) |
| **SSRF / Security Surface** | Low (standard URL validation) | Medium (dynamic redirection across multiple edge domains) |

---

## 7. Implementation Roadmap for a Kinora Stalker Adapter

To integrate Stalker / MAG support cleanly into Kinora in a future milestone, the following architecture is recommended:

### 1. Dedicated Rust Module (`src-tauri/src/stalker.rs`)
- Maintain a thread-safe connection session state:
  ```rust
  pub struct StalkerSession {
      pub portal_url: Url,
      pub mac_address: String,
      pub token: Option<String>,
      pub token_expiry: Option<Instant>,
      pub user_info: Option<StalkerUserInfo>,
  }
  ```
- Implement safe HTTP client creation with Infomir STB header injection in `fetch.rs`.
- Guard all portal URLs using `fetch::check_url` to prevent local network traversal.

### 2. Seamless Integration with `stream.rs` and `kstream://`
- Define a custom URI scheme for frontend references:
  `stalker://{source_id}/{stream_type}/{item_id}`
- In Rust's `open_stream` handler:
  1. Intercept `stalker://` references.
  2. Resolve current session token (re-executing handshake if expired).
  3. Call `create_link` to obtain the temporary upstream HLS URL.
  4. Pass the resulting HLS manifest into `hls.rs` for handle rewriting.
  5. Return `kstream://localhost/<handle>` to React.
- This ensures zero upstream credentials, MAC addresses, or provider edge tokens ever touch the DOM or browser inspector.

### 3. Unified Managed Source Model
In alignment with Kinora's single-source design:
- A Stalker connection must be treated as **ONE managed source**.
- A single source card in `Sources.tsx` manages Live TV, VOD movies, TV series, and EPG schedules together.
- Enabling, disabling, refreshing, or removing the Stalker source acts simultaneously across all provided media categories and cache stores.

---

## 8. Conclusion

Stalker / MAG middleware presents a distinct session-stateful architecture requiring hardware identity emulation and dynamic stream minting. However, because Kinora's backend is built on a modular Rust core with an isolated HLS rewriting proxy (`src-tauri/src/stream.rs`), Stalker integration can be achieved with total security isolation, preserving Kinora's strict privacy rules and zero-token-leakage guarantees.
