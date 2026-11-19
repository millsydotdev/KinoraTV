# Kinora (KinoraTV)

A TV, movie and series app: a React + TypeScript interface running inside a Rust (Tauri 2)
desktop shell.

![Kinora Desktop Home Screen](docs/images/kinora-home.png)

## Creator & Attribution

**Created by millsydotdev**
- GitHub Profile: [https://github.com/millsydotdev](https://github.com/millsydotdev)
- Canonical Repository: [https://github.com/millsydotdev/KinoraTV](https://github.com/millsydotdev/KinoraTV)

**Status:** Sources can import real M3U playlists, by http(s) address or local file, through the
Rust shell (Gates D2 and D3), and playlist channels whose streams are HLS over http(s) can be played
(Gate D4). While any imported playlist exists, Live TV, Home, Search, Library and
the player show only its channels; otherwise the fictional demonstration catalogue is shown. Imported
sources are saved on this device and refreshed at startup (Gate D5); stream addresses are not saved,
so a restored channel plays once its source has been refreshed. Streams are not checked in advance: a channel is fetched only
when you play it, and other formats (raw MPEG-TS, MP4, RTMP, RTSP, UDP...) or DRM streams are
refused with a message. XMLTV guides, by address (plain or `.gz`) or local file, give playlist
channels real programme listings in Live TV and elsewhere (Gate D6); without a playlist, the guide
shows the demonstration schedule. Sources › Discovery browses the iptv-org catalogue of public
playlists and adds one only when you choose to (Gate D7). Movies and series remain demonstration
data. There is no stream validation; that waits for the owner's approval. What has been tested,
where, and what has not: `docs/RELEASE-READINESS.md`.

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
  platform, shown in Settings › About), playlist ingestion, playback, saved sources and XMLTV guides. `fetch_playlist` downloads an M3U
  from a user-supplied http(s) address; `parse_playlist_text` parses text from a file the user
  picked in the webview. Both return parsed channel metadata. Stream addresses are never fetched.
- **IPC boundary**: `src/lib/native.ts` is the only place React calls Rust. It mirrors the Rust
  structs, validates every response before use, and returns `null` outside Tauri.
- **Security**: each app command is deny-by-default (`build.rs`). `capabilities/default.json` grants
  the main window only the app's own commands: `app_info`, `fetch_channel_logo`, `fetch_playlist`, `parse_playlist_text`,
  `open_stream`, `close_stream`, `load_sources`, `save_sources`, `fetch_guide`, `import_guide_file`,
  `load_guide`, `guide_channels`, `guide_programmes`, `remove_guide`, `load_catalogue` and
  `refresh_catalogue`. No filesystem, shell, HTTP, dialog or other plugins. A strict Content Security
  Policy is set in `tauri.conf.json`; remote image origins stay blocked. Visible playlist logos are
  fetched by Rust through the guarded resolver, with a 256 KiB cap, a 10 s timeout and raster
  signature checks, then passed to the UI as data images. They are cached only in memory and are not
  saved with the source. Developer tools exist only in debug builds.
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
- **Saved sources** (`src-tauri/src/sources.rs`): `load_sources` and `save_sources` read and write
  one JSON file, `<app data>/sources/sources.json` (on Linux
  `~/.local/share/io.github.millsydotdev.kinora/sources/`). The folder is `0700` and the file
  `0600`. Each save is validated (the same address check as Add Source, no `user:pass@`), then
  written to a temporary file, flushed and renamed over the old one, so a crash leaves the last
  complete file. The file has a schema version (1). A damaged or invalid file is moved aside to
  `sources.json.corrupt-<time>`, never deleted, and Kinora starts without it. A file from a newer
  version, or one that cannot be read, is left untouched and nothing is saved that session. Errors
  never contain the path or an address.
- **What is saved**: each source's name, origin, label, times, counts and, for an address source,
  the address itself, plus each channel's key, `tvg-id`, name, group and number, enough to rebuild
  the source-channel link so favourites and history keep working. Stream addresses, logos, stream
  sessions, `kstream` handles, playback state and parser warnings are never saved. Preferences,
  theme, favourites, history and collections stay in the webview's localStorage (`kinora.prefs.v2`,
  `kinora.library.v1`). Library refs to a removed source's channels are dropped with it.
- **Startup**: the UI waits for the saved sources (at most 5 s; after that it starts and saves
  nothing that session), shows them as saved, then refreshes address sources one at a time
  through `fetch_playlist`. A failed refresh keeps the saved channels and says so. File sources
  cannot refresh themselves: their channels are listed, and the player asks for the file again.
- **Third-party streams**: Kinora does not run, check or endorse catalogue playlists or the streams
  in them, and cannot say whether they are legal to watch where you live; Discovery says so.
- **Residual risk of saved addresses**: a playlist or guide address can carry an account token. It is stored
  in plain text, readable only by your OS user, but also by anything running as that user, by root,
  and by backup or sync tools that copy your home folder. Kinora does not export it. If that matters,
  exclude the folder above from cloud backups and remove sources you no longer use; removing a
  source rewrites the file without it (older copies in backups are outside Kinora's control).
- **XMLTV guides** (`src-tauri/src/xmltv.rs`, `guides.rs`): `fetch_guide` downloads a guide through
  the same guarded client as playlists (`fetch::Policy::guide()`: every destination and redirect
  check is the same; only the limits differ, 64 MB and 90 s, and playlist and stream limits are
  unchanged). `import_guide_file` takes the bytes of a file picked in the webview, never a path.
  Gzip is decompressed with a 128 MB cap, so a small file cannot expand without limit. Text must be
  UTF-8. The parser (quick-xml) never loads a DTD or any external resource and expands only XML's
  five built-in entities and character references; a `<!DOCTYPE>` that declares its own entities is
  refused, as is any reference to an undefined entity, so entity-expansion attacks have nothing to
  work with. Nesting (16 levels), channels (20,000), programmes (150,000 in the window) and every
  kept text field are capped. Icons, artwork and links in a guide are ignored, never fetched.
- **Guide times**: `YYYYMMDDhhmmss` (or a leading part, down to `YYYYMMDD`) with an optional offset
  (`+0100`, `-05:30`, `Z`). A time without an offset is UTC, as the XMLTV DTD says. Everything is
  stored in UTC and shown in this device's time zone; guide days run from local midnight to local
  midnight, so a day with a clock change shows 23 or 25 hours. Programmes from 12 hours ago to 8
  days ahead are kept. A missing stop time is taken from the next programme on the channel (the
  XMLTV convention, and the details panel says so); a programme with no stop and nothing after it,
  invalid or impossible times, or one overlapping an earlier programme on the same channel is
  skipped and counted. Gaps stay gaps: nothing is invented, and "on now" means the current time is
  between the listed start and stop.
- **Channel matching**: a playlist channel's `tvg-id` is compared with the guide's channel ids after
  trimming spaces and ignoring the case of ASCII letters; no punctuation stripping and no display
  names. One fallback: iptv-org playlists write ids as `channel@feed` (`BBCNews.uk@UKHD`) while most
  guides list `BBCNews.uk`, so an id that matches nothing exactly is tried without its `@feed` part.
  Each guide is used for the playlists you choose. A channel takes its
  programmes from the first of its guides that lists its id, or from a guide channel you match it
  to by hand in the guide's details (the search lists the guide's channels; nothing is matched until
  you choose one). Unmatched channels are listed there with the reason, and Live TV says why a row
  is empty.
- **Guide storage**: guide definitions (name, address or file label, which playlists use it) and
  hand matches are saved in `sources.json`, now schema 2. A schema 1 file loads unchanged and is
  copied to `sources.v1.json` before it is first rewritten. Each guide's programmes are also kept
  in `sources/guide-<id>.json` (`0600`, written atomically): the last good copy, so listings show at
  startup and offline and a failed refresh never loses them. It holds channel ids, names and
  programme text only, never the guide's address. It is derived data: one that cannot be read is
  ignored and replaced by the next successful update. Removing a guide deletes it and its hand
  matches; caches no saved guide owns are deleted at startup. Rust holds parsed guides in memory and
  the page asks for one local day at a time, for the matched channels only.
- **Guide refresh**: at startup, cached programmes are read first, then address guides are updated
  one at a time alongside playlists, and on request. Neither blocks the window. Each update has a
  generation number in Rust and an operation token in the page, so a slow, older update never
  replaces a newer one, and a guide removed while updating stays removed.
- **Discovery catalogue** (`src-tauri/src/catalogue.rs`): the provider is
  [iptv-org](https://github.com/iptv-org/iptv). Its lists are released under the Unlicense (public
  domain, no attribution required; Kinora credits it anyway), it is actively maintained (tens of
  thousands of commits, automated updates), and it documents its playlist addresses. Its legal note
  says the repository holds user-submitted links to publicly available streams and no video. The
  index is its generated `PLAYLISTS.md`, the only list of the per-country, language, category,
  region, subdivision and city playlists that actually exist (the iptv-org API lists thousands of
  codes with no playlist). `refresh_catalogue` takes no input and fetches that one fixed https
  address through the guarded client with `Policy::catalogue()`: only `raw.githubusercontent.com`,
  https only, on every redirect hop too, 2 MB and 20 s, with every existing destination check. The
  text is untrusted: only lines whose address is exactly
  `https://iptv-org.github.io/iptv/<folder>/<code>.m3u` become entries (5,000 at most, names
  stripped of markup and capped), and nothing else in the file is followed. Entries with a
  provider count of 0 are left out (that is iptv-org's withdrawn NSFW category).
- **Discovery cache and freshness**: the parsed catalogue is kept in
  `sources/catalogue.json` (`0600`, atomic, 4 MB cap, re-checked entry by entry when read). It is
  only read when Discovery is opened, never at startup, so no network does not affect sources,
  guides, favourites or playback. A copy over a day old is refreshed when Discovery opens and shown
  as possibly out of date; a failed refresh keeps the copy shown and says why. Refreshes run one at
  a time in Rust, and the page drops answers to older requests. The provider does not publish when
  its index last changed, so Kinora shows when it fetched it.
- **Adding from Discovery**: an entry shows the provider's facts only (type, place, the channel
  count iptv-org prints where it prints one, the address, licence). "Read this playlist" is an
  ordinary `fetch_playlist`, so Kinora's own result (channels, groups, skipped entries) is shown
  separately before anything is added, and no stream is opened. A read can be cancelled; its late
  result is ignored. The added playlist is an ordinary saved source, refreshed and removed like any
  other. An entry counts as already added only when a source has exactly its address, never by name.
  No guide, reminder or playback starts as a side effect.
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
npm install                  # frontend dependencies + pinned Tauri CLI/API (2.12.4)
npm run dev                  # React UI only, in a browser: http://localhost:5199
npm run tauri:dev            # native app in development (starts Vite, opens the Tauri window)
npm run tauri:dev:staging    # native app in staging mode with isolated staging identifier
npm test                     # frontend tests (Vitest)
npm run test:rust            # Rust tests
npm run typecheck            # TypeScript
npm run test:gate            # full multi-gate quality pipeline
npm run build                # frontend production build into dist/
npm run build:staging        # frontend staging build into dist/
npm run tauri:build:staging  # native staging desktop packages (.rpm, .deb, AppImage)
npm run tauri:build          # native production release binary + packages
```

Release output: `src-tauri/target/release/kinora` and `src-tauri/target/release/bundle/` (RPM and DEB packages on Linux; NSIS and MSI on Windows; DMG on macOS). Staging releases use an isolated identifier (`io.github.millsydotdev.kinora.staging`) so staging never modifies production data.

For comprehensive architectural standards, environment configuration, DevOps pipelines, and release procedures, see:
- [DEVELOPMENT.md](DEVELOPMENT.md): Developer quickstart, system prerequisites, and local commands.
- [DOCKER.md](DOCKER.md): Containerized development, mock IPTV/EPG fixtures, and multi-stage builds.
- [DEVOPS.md](DEVOPS.md): CI/CD architecture, GHCR strategy, observability, and release operations.
- [STAGING.md](STAGING.md): Staging architecture, data isolation guarantees, and staging deployment.
- [DEVELOPMENT-AND-RELEASE-WORKFLOW.md](docs/DEVELOPMENT-AND-RELEASE-WORKFLOW.md): Comprehensive lifecycle and release gates.

The native app keeps its own local storage, separate from the browser at localhost:5199, so it starts
with the default demo library and appearance settings.

## Supported Platforms

| Platform | Distribution Formats | Minimum System Requirements | Runtime Engine |
| :--- | :--- | :--- | :--- |
| **Linux (x86_64)** | `.rpm`, `.deb`, `.AppImage` | WebKitGTK 4.1, GTK 3, OpenSSL 1.1/3.0 | WebKitGTK 2.44+ |
| **Windows (x64)** | `.exe` (NSIS), `.msi` (WiX) | Windows 10 (1809+) or Windows 11 | Microsoft Edge WebView2 |
| **macOS (Apple Silicon / Intel)** | `.dmg`, `.app` bundle | macOS Catalina 10.15 or later | Apple WebKit (WKWebView) |

## Community & Security

- **Contributing Guidelines:** See [CONTRIBUTING.md](file:///mnt/storage/TVMovie/CONTRIBUTING.md) for architectural rules, coding standards, and PR workflows.
- **Security Policy:** See [SECURITY.md](file:///mnt/storage/TVMovie/SECURITY.md) for vulnerability reporting and security invariants.
- **Code of Conduct:** See [CODE_OF_CONDUCT.md](file:///mnt/storage/TVMovie/CODE_OF_CONDUCT.md).
- **Changelog:** See [CHANGELOG.md](file:///mnt/storage/TVMovie/CHANGELOG.md) for milestone release history.

## Licensing & Intellectual Property

Kinora is published under the **Kinora Proprietary Source-Available Licence - All Rights Reserved**. See [LICENSE](file:///mnt/storage/TVMovie/LICENSE) for the full licence text.

This is **not** an OSI-approved open-source licence. Commercial use, public redistribution, unauthorized forks, and ingestion for AI/ML training are prohibited without prior written permission. For details on intellectual property scope and brand protections, see [Kinora Licensing and IP Protection](file:///mnt/storage/TVMovie/docs/legal/kinora-licensing-and-ip-protection.md).

Third-party runtime dependencies and libraries are inventoried with their respective permissive licences in [public/THIRD-PARTY-NOTICES.txt](file:///mnt/storage/TVMovie/public/THIRD-PARTY-NOTICES.txt). Shipped packages are strictly permissive (MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, Unlicense). No GPL-licensed components are statically linked into the application binary. System media decoders and WebKit libraries are dynamically linked from the host operating system.
