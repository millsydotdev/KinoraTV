# TVMovie (Kinora)

Premium TV and film app: **React + TypeScript UI inside a Rust + Tauri 2 desktop shell.**
**Phase: Gate D2 (Rust playlist ingestion) is complete on `main`. D3 awaits the owner's approval.**
Done: Rust M3U parsing, bounded http(s) fetching and the two ingest commands. Not approved yet: wiring
them into the UI (D3), source persistence, discovery, stream validation, XMLTV, playback. Each needs
the owner's explicit approval; that is a hard gate.

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
npm run test:rust    # cargo test (src-tauri): parser, fetch policy, local-server fetch tests
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
- Keep the CSP in `tauri.conf.json` strict; do not loosen it to make something work. Example: Vite
  inlines small assets as `data:` URLs, which `font-src 'self'` blocks, so `vite.config.ts` keeps
  `.woff2` files out of inlining instead of allowing `data:` fonts.
- Native verification: run one app instance at a time (check `ps` first; start, check, stop).
  `npm run tauri:dev` and a tauri-driver session each open their own window.

## Layout

- `src/data/` demonstration catalogue, channels and guide generator, demo sources. Types in
  `types.ts` mirror M3U `#EXTINF` (channels) and XMLTV `<programme>` so real parsers can replace the
  demo data without touching screens.
- `src-tauri/` Rust shell: `src/lib.rs` (startup, commands), `src/ingest.rs` (error type, report,
  entry points), `src/m3u.rs` (pure M3U parser + tests), `src/fetch.rs` (guarded download + tests
  against a local test server), `tauri.conf.json` (window, CSP, bundle), `capabilities/`, `build.rs`,
  `icons/` (generated from `app-icon.svg`).
- `src/state/store.tsx` all local state (library, preferences, sources), persisted to localStorage
  (`kinora.library.v1`, `kinora.prefs.v2`, `kinora.sources.v1`).
- `src/screens/` one file per screen plus its CSS. `src/components/` shared UI.
- `public/art/` 40 AI-generated images made for this project's fictional titles. Throwaway once real
  artwork comes from sources. Do not generate more without asking the owner (it uses their credits).
- `DESIGN.md` design direction. The owner's approved mockup is the visual source of truth; do not
  reinterpret it. Shell = `components/Sidebar` + per-screen `components/PageHeader`.

## Gotchas

- Everything is demonstration data: fictional titles, channels and schedules, `example.com` source
  URLs. Keep it labelled as such in the UI.
- The guide schedule is generated per channel per local day (`scheduleFor`) and cached.
- Colours come only from theme tokens in `global.css`; never hard-code colours in screen CSS except
  over artwork (use `rgb(var(--scrim) / x)`) or page fades (`rgb(var(--bg-rgb) / x)`).
- The Search input owns its text and syncs to the URL afterwards; binding it straight to
  `useSearchParams` drops keystrokes.
- Live TV: the guide is full width; the player docks from the Now Playing pill and programme details
  open in a side sheet. Keep it that way to match the mockup.
