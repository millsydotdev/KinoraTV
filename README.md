# Kinora

A TV, movie and series app: a React + TypeScript interface running inside a Rust (Tauri 2)
desktop shell.

**Status:** Sources can import real M3U playlists, by http(s) address or local file, through the
Rust shell (Gates D2 and D3), and playlist channels whose streams are HLS over http(s) can be played
(Gate D4). While any imported playlist exists, Live TV, Home, Search, Library and
the player show only its channels; otherwise the fictional demonstration catalogue is shown. Imported
playlists are kept in memory only. Streams are not checked in advance: a channel is fetched only
when you play it, and other formats (raw MPEG-TS, MP4, RTMP, RTSP, UDP...) or DRM streams are
refused with a message. Movies, series and the
guide remain demonstration data. There is no source persistence, discovery, stream validation or
guide import; those wait for the owner's approval.

## Architecture

```
React 19 + TypeScript (src/)          Rust + Tauri 2 (src-tauri/)
  screens, routing, theme,   ── IPC ──▶  native shell: window, startup, errors,
  demo data, local prefs     invoke()    `app_info`, playlist ingestion
  built by Vite into dist/  ◀── JSON ──  (serde, validated on arrival)
```

- **React** (`src/`): all UI, navigation, forms, theme controls and demo state. The UI also runs
  in an ordinary browser for development and tests.
- **Rust** (`src-tauri/`): the native application. It loads the Vite dev server in development and
  the built `dist/` in release, and owns anything native: `app_info` (version, build profile,
  platform, shown in Settings › About) and playlist ingestion. `fetch_playlist` downloads an M3U
  from a user-supplied http(s) address; `parse_playlist_text` parses text from a file the user
  picked in the webview. Both return parsed channel metadata. Stream addresses are never fetched.
- **IPC boundary**: `src/lib/native.ts` is the only place React calls Rust. It mirrors the Rust
  structs, validates every response before use, and returns `null` outside Tauri.
- **Security**: each app command is deny-by-default (`build.rs`). `capabilities/default.json` grants
  the main window only `allow-app-info`, `allow-fetch-playlist` and `allow-parse-playlist-text`. No
  filesystem, shell, HTTP, dialog or other plugins. A strict Content Security Policy is set in
  `tauri.conf.json` (remote images stay blocked). Developer tools exist only in debug builds.
- **Playlist fetching** (`src-tauri/src/fetch.rs`): http(s) only, no credentials in the address, no
  proxies. Local, private, link-local, CGNAT, multicast and reserved IPv4/IPv6 destinations are
  refused. Host names go through a resolver that checks every answer, which is the address
  connected to. IP literals and every redirect hop (at most 5) are checked again. Limits: 10 s
  connect, 30 s total, 25 MB, 50,000 channels. Errors name only the host; full addresses, queries
  and tokens are never logged or shown. LAN tuners are therefore not supported.
- **Direct connection required**: proxy settings, including `HTTP_PROXY`, `HTTPS_PROXY` and
  `ALL_PROXY`, are deliberately ignored, because a proxy would make the connection on Kinora's
  behalf and bypass the address checks. On a network that only allows traffic through a proxy,
  playlist fetching fails with a connection error.
- **Playback (`kstream`)**: `open_stream` returns an opaque `kstream://localhost/<handle>`; Rust
  fetches every playlist, segment, key and rendition through the same guarded client (private,
  loopback and reserved destinations refused, every redirect rechecked, no proxy, no Referer),
  rewrites HLS playlists to handles, refuses DRM and unknown resource tags, and answers CORS for the
  app's own origin only. Limits per session: 10 s connect, 15 s idle, 10 s per playlist or key, 60 s
  per segment, 4 MiB playlists, 32 MiB segments, 64 MiB buffered at once, 4 requests at a time,
  20,000 handles. Closing or switching cancels in-flight requests. hls.js 1.7.3 (Apache-2.0, light
  build, about 113 KB gzipped) loads only when a playlist channel is played. The CSP gained only
  `connect-src kstream://localhost` and `media-src blob:`.
- **Codecs**: decoding is done by WebKitGTK through GStreamer. H.264/AAC streams need the
  corresponding GStreamer plugins (for example `gstreamer1-plugin-openh264` or `gstreamer1-plugin-libav`);
  without them Kinora shows a decode error.
- **Stream addresses**: `streamUrl` is kept exactly as written for a future player and may contain
  account names, passwords or tokens. Show `streamDisplay` (`scheme://host[:port]/…`) instead, and
  never log either. Channel keys come from `tvg-id`, or from name and group, never from the address.
- **Webview compatibility fix**: the release build inlined a small font subset as a `data:` URL,
  which the CSP blocked. `vite.config.ts` now emits `.woff2` fonts as files rather than allowing
  `data:` fonts.

## Prerequisites

- Node.js 22+ and npm
- Rust 1.90+ (`rustup`)
- Linux (Fedora): `sudo dnf install webkit2gtk4.1-devel openssl-devel curl file libappindicator-gtk3-devel librsvg2-devel gtk3-devel libsoup3-devel javascriptcoregtk4.1-devel`
- Building the `.rpm` bundle also needs `rpm-build`. Other platforms: see https://v2.tauri.app/start/prerequisites/

## Commands

```bash
npm install            # frontend dependencies + pinned Tauri CLI/API (2.12.4)
npm run dev            # React UI only, in a browser: http://localhost:5199
npm run tauri:dev      # native app in development (starts Vite, opens the Tauri window)
npm test               # frontend tests (Vitest)
npm run test:rust      # Rust tests
npm run typecheck      # TypeScript
npm run build          # frontend production build into dist/
npm run tauri:build    # native release binary + .rpm bundle
```

Release output: `src-tauri/target/release/kinora` and `src-tauri/target/release/bundle/rpm/`.

The native app keeps its own local storage, separate from the browser at localhost:5199, so it starts
with the default demo library and appearance settings.
