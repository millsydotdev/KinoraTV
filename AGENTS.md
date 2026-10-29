# TVMovie (Kinora)

Premium TV and film app: **React + TypeScript UI inside a Rust + Tauri 2 desktop shell.**
**Phase: Gate D8 (end-to-end testing, reliability and release readiness) is complete on `main`. The
next gate awaits the owner's approval.** Status of every tested and untested case, measurements and
the recommendation: `docs/RELEASE-READINESS.md`. Done: Rust M3U parsing and guarded fetching (D2); Sources import, refresh and removal,
and playlist channels in Live TV and the other channel screens (D3); honest Settings and player
states for playlist channels, and individual categories from `A;B` groups (D3.1); HLS playback for
playlist channels through Rust (D4); saved sources, refreshed at startup (D5); XMLTV guides by address or
file, matched to playlist channels, in Live TV (D6); Sources › Discovery browsing the iptv-org public
playlist catalogue, with explicit import through the ordinary playlist path (D7). Not approved yet:
stream validation or probing, other playback formats, remote logos or guide artwork, other catalogue
providers. Each needs the
owner's explicit approval; that is a hard gate.

Live path: `/home/millsy/dev/TVMovie` (symlinked from `/mnt/storage/TVMovie`). Git repo; first
commit is the pre-Tauri baseline. Backups: `/home/millsy/dev/TVMovie-backup-pre-tauri-2026-10-22`
(pre-migration copy) and `/home/millsy/dev/TVMovie-backup-pre-d2-integration-2026-10-25` plus its
`.bundle` (full history before D2 reached `main`).

## Git workflow

**All work happens directly on `main`.** Do not create feature, development or other branches. Do
not rebase, reset, force-push, amend or otherwise rewrite commits. Before changing files, check the
branch, `git status` and the latest commit. Commit to `main` with a clear message when each approved
milestone is complete. Keep backups and preserve existing work.

## Commands

```bash
npm install
npm run dev          # React UI in a browser: http://localhost:5199
npm run tauri:dev    # native app (starts Vite itself)
npm run typecheck    # tsc -b
npm test             # vitest: guide schedule, next episode, theme contrast, IPC boundary
npm run test:rust    # cargo test (src-tauri): M3U, XMLTV and catalogue parsers, fetch policies, local-server fetch, saved sources, guides
npm run tauri:build  # release binary + .rpm (src-tauri/target/release/)
```

Prerequisites and architecture diagram: `README.md`.

## Architecture rules

- React owns UI, routing, theme and demo state. Rust (`src-tauri/`) owns native concerns. Never
  implement the same logic in both.
- `src/lib/native.ts` is the only React-to-Rust bridge: typed mirror of the Rust structs, response
  validation, and `null` when not running in Tauri (browser dev and Vitest must keep working).
- New Rust commands must be added to `build.rs` (`AppManifest::commands`) and granted explicitly in
  `src-tauri/capabilities/default.json`. Do not add plugins (fs, shell, http, dialog...) without approval.
- Network access lives only in `src-tauri/src/fetch.rs`. Keep its guarantees: proxies off, guarded
  resolver, IP-literal and per-redirect `check_url`, `referer(false)`, size/time limits, and errors
  that never include a path, query or token (reqwest's own error text includes the full URL, so
  never show or log it). Test-only policy fields are `#[cfg(test)]`; never add a runtime bypass,
  including for LAN addresses. Never fetch the stream URLs inside a playlist.
- `no_proxy()` in `fetch.rs` is load-bearing: reqwest reads `HTTP(S)_PROXY`/`ALL_PROXY` even with
  default features off. Fetching needs a direct connection; do not add a proxy option.
- `PlaylistChannel.streamUrl` may hold credentials: never render, log or persist it in plain text
  without an approved policy. Display `streamDisplay`. No logger is installed; if one is ever added,
  keep `reqwest`/`hyper` at warn level and never log commands' arguments.
- Saved sources (D5): `src-tauri/src/sources.rs` owns one file, `<app data>/sources/sources.json`
  (folder `0700`, file `0600`, schema `version` 2 since D6, atomic temp-file-and-rename writes, every save
  validated with `fetch::check_url`). It holds source addresses (they may carry tokens: the
  documented residual risk is in `README.md`) and channel metadata only; never stream addresses,
  logos, sessions, handles or playback state. A damaged file is moved aside, never deleted; a newer
  or unreadable one is left alone and the store goes read-only for the session. A schema change
  bumps `SCHEMA_VERSION` and adds a migration in `Store::read`. Never put source addresses in a
  general export, an error message or a log.
- Guides (D6): `xmltv.rs` is the only XML parser (quick-xml; never enable DTD loading or custom
  entity resolution, keep the `<!DOCTYPE … [` refusal and every cap). Remote guides go through
  `fetch::download_bytes` with `Policy::guide()`; change only its size/time limits, never the
  destination checks, and never raise the playlist or stream limits for guides. `guides.rs` holds
  parsed guides, the per-guide generation (results of superseded imports are dropped) and the
  `guide-<id>.json` caches; guide ids are `gd-[a-z0-9-]` because they form file names. Matching is
  `xmltv::normalize_id` (trim + ASCII case) or a saved hand match, never display names, and lives in
  Rust: the page sends ids and gets matches back. Never fetch URLs found in a guide (icons, `<url>`).
- Discovery (D7): `catalogue.rs` fetches one constant address (`catalogue::URL`) with
  `Policy::catalogue()` (`only_hosts` + `https_only` narrow `check_url` on every hop; never use them
  to widen anything). The page never sends a catalogue address. Entries must match
  `https://iptv-org.github.io/iptv/<folder>/<code>.m3u` exactly, in Rust (`playlist_address`) and
  again in `native.ts` (`CATALOGUE_ADDRESS`). Importing is `fetch_playlist`, unchanged: discovered
  sources are ordinary playlists, never a special type. Duplicates are by exact address, never name.
  Show provider facts and Kinora's own read results separately; never invent counts or freshness.
  The catalogue is only read when Discovery opens, never at startup.
- Playback (D4): the page never gets an upstream stream address. `open_stream` returns
  `kstream://localhost/<128-bit handle>`; `src-tauri/src/stream.rs` serves it through `fetch.rs`'s
  guarded client and rewrites HLS playlists (`hls.rs`) so every segment, key, map and rendition gets
  its own handle. Unknown URI-bearing tags fail closed; DRM is refused. One session at a time;
  opening or closing one cancels its in-flight work (wry never reports a cancelled request, so this
  is ours). Responses are buffered by wry, so keep every limit in `stream::Limits` bounded, including
  the session byte budget. CORS answers only the exact app origin (`tauri://localhost`, or the dev
  server under `tauri dev`). `<video src>` cannot use custom schemes in WebKitGTK 2.54, so playback is
  hls.js (light build, lazy, `enableWorker: false`) through MSE; stream commands are queued in
  `native.ts` so the session Rust keeps is always the last one requested.
- `loopback-fixtures` (cargo feature) lets `tauri dev` builds fetch 127.0.0.1 for native smoke tests
  with local fixtures. It refuses to compile without Tauri's `dev` cfg; never weaken that guard. Tests
  that check loopback is refused are ignored only under this feature (`cfg_attr(feature = …, ignore)`).
- Keep the CSP in `tauri.conf.json` strict; do not loosen it to make something work. Example: Vite
  inlines small assets as `data:` URLs, which `font-src 'self'` blocks, so `vite.config.ts` keeps
  `.woff2` files out of inlining instead of allowing `data:` fonts. D4 added exactly two sources:
  `connect-src kstream://localhost` (hls.js reads playlists and segments) and `media-src blob:` (MSE).
  Never add `http:`/`https:` hosts or `worker-src`.
- Native verification: run one app instance at a time (check `ps` first; start, check, stop).
  `npm run tauri:dev` and a tauri-driver session each open their own window. Use
  `scripts/native-smoke/` (README there): it runs every launch with its own `XDG_*` folders, so it
  never touches the owner's real Kinora data. Never test against the real data folder.
- Live TV renders a page of channels (`GUIDE_PAGE` rows, `CARD_PAGE` cards) with "Show more". Do not
  render every channel: unbounded, 10,000 channels took 13 s to render and over 1 s per scrolled
  frame. A virtualised guide is the proposed follow-up (see `docs/RELEASE-READINESS.md`).

## Layout

- `src/data/` demonstration catalogue, channels and guide generator, demo sources. Types in
  `types.ts` mirror M3U `#EXTINF` (channels) and XMLTV `<programme>` so real parsers can replace the
  demo data without touching screens.
- `src-tauri/` Rust shell: `src/lib.rs` (startup, commands, `kstream` protocol), `src/ingest.rs`
  (error type, report, entry points), `src/m3u.rs` (pure M3U parser + tests), `src/fetch.rs` (guarded
  client, playlist download, media fetch + tests against a local test server), `src/hls.rs` (pure
  HLS rewriter + tests), `src/stream.rs` (stream sessions, handles, limits, protocol handler + tests),
  `src/sources.rs` (saved-sources file + tests), `src/xmltv.rs` (pure XMLTV parser + tests),
  `src/guides.rs` (held guides, caches, queries + tests), `src/catalogue.rs` (Discovery index parser,
  fixed fetch, cache + tests), `tauri.conf.json` (window, CSP, bundle), `capabilities/`, `build.rs`,
  `icons/` (generated from `app-icon.svg`).
- `src/state/store.tsx` all local state (library, preferences, sources), persisted to localStorage
  (`kinora.library.v1`, `kinora.prefs.v2`, `kinora.sources.v1`). Imported playlists (`playlists`) are
  the exception: saved by Rust through `loadSources`/`saveSources`, never in localStorage. The
  provider renders nothing until they are restored (5 s cap), then refreshes address sources in
  turn; restored channels have `streamUrl: null` until then. Removing a source also drops its
  `channel:` refs from the library (`dropSourceRefs`), and from guides' playlists and hand matches.
  Guides and hand matches are saved the same way. Screens read programmes only through the store
  (`schedule`, `programmeAt`, `nextProgramme`, `guideMatch`): generated for demo channels, from Rust
  one local day at a time for playlist channels. `store.channels` is the one channel catalogue screens
  use (playlist channels if any playlist exists, else the demo set; never both); `store.findChannel`
  resolves ids, and is passed to `resolve()` for library refs.
- `src/state/catalogue.ts` pure Discovery logic: kind filters, accent-insensitive search, paging,
  staleness, duplicate detection by address, unique names, refresh transitions with op tokens.
- `src/state/guides.ts` pure guide logic: transitions with per-operation tokens, status text, the ids
  each guide is asked about, match states (`resolveMatches`) and programmes per channel.
- `src/state/playlists.ts` pure playlist-source logic: transitions with a per-operation token (stale
  results are dropped), channel mapping (link-safe ids, `Uncategorised`, initials, no logos),
  categories (`group` keeps the source text; `categories` splits `A;B`, used for chips, filtering and
  labels), Add Source checks (`checkPlaylistUrl`, `readForPreview`), safe labels (`https://host/…`,
  file name) and user-facing error text.
- `src/lib/playback.ts` the playback hook (session, lazy hls.js, real media states, cleanup);
  `src/hls-light.d.ts` types for hls.js's `./light` entry.
- Screen tests render real screens to HTML (`react-dom/server`) with the store seeded through
  `StoreProvider initialPlaylists`. Click-through tests (`src/screens/SourceFlows.test.tsx`) opt into
  `happy-dom` per file (`// @vitest-environment happy-dom`, dev dependency only) and mock the native
  commands (`PlayerPlayback.test.tsx` also fakes hls.js; `Persistence.test.tsx` mocks
  `loadSources`/`saveSources` to cover restore, refresh, removal and storage notices;
  `GuideFlows.test.tsx` mocks the guide commands and fixes `TZ=Europe/London`; `DiscoveryFlows.test.tsx`
  mocks the catalogue commands); everything else runs in Node. No test may reach the network or a stream.
- `src/screens/` one file per screen plus its CSS. `src/components/` shared UI.
- `public/art/` 40 AI-generated images made for this project's fictional titles. Throwaway once real
  artwork comes from sources. Do not generate more without asking the owner (it uses their credits).
- `DESIGN.md` design direction. The owner's approved mockup is the visual source of truth; do not
  reinterpret it. Shell = `components/Sidebar` + per-screen `components/PageHeader`.

## Gotchas

- Everything is demonstration data: fictional titles, channels and schedules, `example.com` source
  URLs. Keep it labelled as such in the UI.
- The demo guide schedule is generated per channel per local day (`scheduleFor`) and cached. Step
  between days with `addDays` (local midnights), never `+ DAY`: clock changes make days 23 or 25 hours.
- Colours come only from theme tokens in `global.css`; never hard-code colours in screen CSS except
  over artwork (use `rgb(var(--scrim) / x)`) or page fades (`rgb(var(--bg-rgb) / x)`).
- The Search input owns its text and syncs to the URL afterwards; binding it straight to
  `useSearchParams` drops keystrokes.
- Live TV: the guide is full width; the player docks from the Now Playing pill and programme details
  open in a side sheet. Keep it that way to match the mockup.
