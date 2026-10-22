# TVMovie (Kinora)

Premium TV and film app. **Phase: UI only.** The frontend is complete and awaiting the owner's review.
Do not start backend work (playlist parsing, discovery, stream validation, XMLTV ingestion, storage,
playback) until the owner explicitly approves the UI. That is a hard gate set by the owner.

Live path: `/home/millsy/dev/TVMovie` (symlinked from `/mnt/storage/TVMovie`; the original empty
folder is kept as `/mnt/storage/TVMovie-ntfs-archive`). Not a git repo yet.

## Commands

```bash
npm install
npm run dev        # http://localhost:5199
npm run typecheck  # tsc -b
npm test           # vitest: guide schedule and next-episode logic
npm run build
```

## Layout

- `src/data/` demonstration catalogue, channels and guide generator, demo sources. Types in
  `types.ts` mirror M3U `#EXTINF` (channels) and XMLTV `<programme>` so real parsers can replace the
  demo data without touching screens.
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
