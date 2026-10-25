# TVMovie (Kinora)

Premium TV and film app: **React + TypeScript UI inside a Rust + Tauri 2 desktop shell.**
**Phase: UI only, plus the native shell.** Do not start backend work (playlist parsing, discovery,
stream validation, XMLTV ingestion, storage, playback) until the owner explicitly approves it. That is
a hard gate set by the owner.

Live path: `/home/millsy/dev/TVMovie` (symlinked from `/mnt/storage/TVMovie`). Git repo, branch
`main`; first commit is the pre-Tauri baseline. Pre-migration copy:
`/home/millsy/dev/TVMovie-backup-pre-tauri-2026-10-22`.

## Commands

```bash
npm install
npm run dev          # React UI in a browser: http://localhost:5199
npm run tauri:dev    # native app (starts Vite itself)
npm run typecheck    # tsc -b
npm test             # vitest: guide schedule, next episode, theme contrast, IPC boundary
npm run test:rust    # cargo test (src-tauri)
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
- Keep the CSP in `tauri.conf.json` strict; do not loosen it to make something work. Example: Vite
  inlines small assets as `data:` URLs, which `font-src 'self'` blocks, so `vite.config.ts` keeps
  `.woff2` files out of inlining instead of allowing `data:` fonts.
- Native verification: run one app instance at a time (check `ps` first; start, check, stop).
  `npm run tauri:dev` and a tauri-driver session each open their own window.

## Layout

- `src/data/` demonstration catalogue, channels and guide generator, demo sources. Types in
  `types.ts` mirror M3U `#EXTINF` (channels) and XMLTV `<programme>` so real parsers can replace the
  demo data without touching screens.
- `src-tauri/` Rust shell: `src/lib.rs` (startup, `app_info` command + tests), `tauri.conf.json`
  (window, CSP, bundle), `capabilities/`, `build.rs`, `icons/` (generated from `app-icon.svg`).
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
