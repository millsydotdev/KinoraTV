# Release readiness (Gate D8)

Tested on 2026-10-29 against `main` after D7 (`c1ecf4c`) plus the D8 fixes below. The native and
packaged results come from `scripts/native-smoke/` (see its README to rerun them).

**Recommendation: ready for limited hands-on user testing on Linux desktops like this one**, with the
known limits below stated to testers. Not ready for a general release: one machine and one OS were
tested, the RPM was not installed, and the Live TV guide is paged rather than virtualised.

## Environment

| | |
|---|---|
| OS | Fedora 44, kernel 7.2.11, Wayland |
| Machine | AMD Ryzen 7 5700X, 31 GB RAM |
| Web view | WebKitGTK 2.54.1 (Tauri 2.12.5, wry 0.57) |
| Codecs | GStreamer 1.28.8 with libav, openh264 and plugins-bad-freeworld: H.264 (`avdec_h264`, `openh264dec`), AAC (`avdec_aac`, `fdkaacdec`), `hlsdemux` present |
| Packaged app | `Kinora-0.1.0-1.x86_64.rpm`, unpacked with `rpm2cpio` (not installed), its `usr/bin/kinora` run |

Nothing here shows behaviour on other distributions, desktops, GPUs, GStreamer versions or codec
sets. A machine without H.264/AAC decoders shows a decode error (documented in `README.md`).

## How it was tested

- **Automated (A)**: Rust unit and local-server tests, Vitest (Node and happy-dom). Not evidence of
  native or packaged behaviour on their own.
- **Native dev (N)**: the debug app (`--features loopback-fixtures`, UI from Vite) driven through
  `tauri-driver`, against local fixtures served on 127.0.0.1. Every launch used its own
  `XDG_DATA_HOME`/`XDG_CACHE_HOME`/`XDG_CONFIG_HOME`. The owner's real Kinora data (313 files) hashed
  identical before and after. Offline runs used a network namespace with only loopback.
- **Packaged release (R)**: the binary unpacked from the RPM, with isolated data folders. It refuses
  127.0.0.1 (checked), so it imported files and used public test inputs.
- Build success is not counted as a test: every R tick below comes from launching that binary.

### Real-world inputs, and why their use was considered acceptable

- **Mux HLS test streams** (`test-streams.mux.dev`, Big Buck Bunny 480p and the adaptive master):
  a host Mux dedicates to test streams, used by hls.js (Kinora's player library) in its own tests;
  the film is Creative Commons (Blender Foundation). A reasonable basis, not a written licence.
- **Freeview-EPG** (`raw.githubusercontent.com/dp247/Freeview-EPG/master/epg.xml`, 21 MB, UK
  free-to-air): a GPL-3.0 project that publishes this XMLTV "for personal use" in IPTV clients.
  Kinora read it once per test run; no stream was played from it.
- **iptv-org** catalogue and its English playlist: Unlicense (public domain). Only the index and the
  playlist text were downloaded; no iptv-org stream was played.

## Status of every listed limitation and untested case

**A** automated, **N** native dev, **R** packaged release, **–** not tested.

### First run and core workflows

| Item | A | N | R | Notes |
|---|---|---|---|---|
| Fresh launch shows the demo catalogue | ✓ | ✓ | ✓ | |
| HTTP(S) playlist added | ✓ | ✓ | – | release refuses local fixtures; files used there |
| Local M3U file imported, and chosen again after a restart | ✓ | ✓ | ✓ | |
| Discovery browse, search, filters, paging | ✓ | ✓ | ✓ | live catalogue, 1,276 entries |
| Discovery refresh; cancel a read | ✓ | ✓ | – | |
| Discovery import of a large real playlist (English, 3,016 channels) | ✓ | ✓ | – | read 0.6 s, add 0.1 s |
| Duplicates: same address refused; catalogue entry marked Added, no second import | ✓ | ✓ | – | |
| Invalid address (credentials, private address); loopback refused in release | ✓ | ✓ | ✓ | |
| Malformed playlist; web page instead of a playlist | ✓ | ✓ | – | reasons shown |
| Sources, guides, hand matches persist across restart | ✓ | ✓ | ✓ | |
| Source and guide removal; caches deleted; library refs dropped | ✓ | ✓ | ✓ | |
| Live TV channel selection docks the player | ✓ | ✓ | – | |
| Playback, local HLS fixture | ✓ | ✓ | – | |
| Playback, public HLS test streams | – | – | ✓ | 480p media playlist and adaptive master |
| Pause, resume, mute, volume | ✓ | ✓ | ✓ | volume 30 % gives `video.volume` 0.30 |
| Full screen (real click) and leaving it | – | ✓ | ✓ | a scripted `click()` is not a user gesture; WebKit ignores it, as expected |
| Switching channels; leaving the player (Escape) | ✓ / – | ✓ | ✓ | |
| Favourites and history persist | ✓ | ✓ | – | release records history; persistence across a release restart not checked |
| Theme persists | – | ✓ | – | |
| Offline startup | ✓ | ✓ | ✓ | network namespace |
| Failed refreshes keep last good data | ✓ | ✓ | – | every playlist and guide; files byte-identical afterwards (release offline run had only file sources, which do not refresh) |

### HLS playback

| Item | A | N | R | Notes |
|---|---|---|---|---|
| Master and media playlists, MPEG-TS segments | ✓ | ✓ | ✓ | |
| AES-128 | ✓ | ✓ | – | key fetched once, through Rust |
| DRM (SAMPLE-AES) refused | ✓ | ✓ | – | |
| Non-HLS (MP4) refused | ✓ | ✓ | – | refused before any request |
| Missing segments end in an error with Retry | ✓ | ✓ | – | |
| Retry recovers once the segments exist | – | ✓ | – | |
| Slow requests (5 s each) still play | ✓ | ✓ | – | about 11 s |
| Switching away cancels a slow stream's requests | ✓ | ✓ | – | no request after the switch |
| No direct upstream requests, no Referer/Origin, no tokens in the page, no CSP violations | ✓ | ✓ | ✓ | 221 fixture requests: 181 from Kinora's Rust side, 40 harness probes, none with Referer/Origin |
| fMP4/CMAF, HEVC, live (sliding window), alternate audio, subtitles | – | – | – | not tested |

### Programme guide

| Item | A | N | R | Notes |
|---|---|---|---|---|
| 25-hour day (clocks back) | ✓ | ✓ | – | `TZ=America/New_York`, 1 Nov 2026: 50 ticks, 01:00 and 01:30 twice |
| 23-hour day (clocks forward) | ✓ | ✓ | – | faked clock (see below): `Europe/London`, 28 Mar 2027, 46 ticks, 00:30 then 02:00 |
| Programme across midnight | ✓ | ✓ | – | 23:00 to 01:00 shown with real times; next day starts at the left edge |
| Offset timestamps (+0100, −0500) | ✓ | ✓ | – | shown at the right local times |
| Gaps stay empty | ✓ | ✓ | – | |
| Large synthetic guide (136,000 programmes, 28 MB uncompressed) | ✓ | ✓ | ✓ | read + add: dev 7.2 s, release 4.0 s |
| Large real-world guide (Freeview-EPG, 21 MB, 284 channels, about 45,500 programmes) | – | ✓ | ✓ | dev 5.5 s, release 3.7 s; cache holds no logo or other addresses |
| Malformed (truncated) XML | ✓ | ✓ | – | "not well-formed XML (near byte …)" |
| Download over 64 MB; gzip bomb over 128 MB; over the programme cap; entity expansion | ✓ | ✓ | – | refused; no message names a token or path |
| Offline: cached listings kept and shown | ✓ | ✓ | ✓ | release: shown offline from cache |
| Hand matches survive restart and refresh | ✓ | ✓ | – | |
| Guide removal, playlist removal, match clean-up | ✓ | ✓ | ✓ | |
| Guide icons never fetched | ✓ | ✓ | – | no icon request in the fixture log |

### Discovery catalogue

| Item | A | N | R | Notes |
|---|---|---|---|---|
| Today's `PLAYLISTS.md` parsed | ✓ | ✓ | ✓ | 1,276 entries, 0 rejected, 1.7 ms |
| Reordered, missing and extra columns; CRLF; tabs; unknown sections | ✓ | – | – | **fixed in D8** (cells are read by content) |
| Unrecognisable format refused as a whole | ✓ | – | – | |
| Catalogue failure never touches sources, guides, favourites, history, playback | ✓ | ✓ | ✓ | |
| Out-of-date copy: shown, refreshed online; offline says so, keeps the copy, retry fails safely | ✓ | ✓ | – | |
| Provider credit | ✓ | ✓ | ✓ | **fixed in D8**: was a link that did nothing in the desktop app |
| Single provider | – | – | – | if iptv-org changes the file beyond what the parser reads, Discovery says it cannot read the catalogue and keeps its cached copy; nothing else is affected |

### Persistence and recovery

| Item | A | N | R | Notes |
|---|---|---|---|---|
| Folder 0700, files 0600 | ✓ | ✓ | – | sources, catalogue and guide caches |
| Atomic writes | ✓ | – | – | |
| Damaged file set aside, not deleted | ✓ | ✓ | – | |
| Newer schema left untouched, nothing saved | ✓ | ✓ | – | file hash unchanged |
| Schema 1 to 2: no rewrite on load; backup on first save | ✓ | ✓ | – | backup byte-identical to the original |
| Startup with unreachable sources and guides | ✓ | ✓ | – | |
| Stale or overlapping async results dropped | ✓ | – | – | |

### 23-hour day

No IANA time zone springs forward between 28 October and 5 November 2026 (checked against every
zone), so the native test moved the app's clock instead: Fedora's signed `libfaketime` 0.9.12 package,
unpacked into the test folder without installing it, preloaded into the dev app with
`FAKETIME='@2027-03-26 12:00:00'` and `TZ=Europe/London`. The day picker showed 26 March to 1 April
2027, and Sunday 28 March had 46 half-hour ticks with 01:00 skipped. This is a faked clock, not a
real date, so it shows the guide's day arithmetic under a real time-zone rule, not how the app
behaves when the system clock actually changes while it runs.

## Large inputs and responsiveness

10,000 channels, 1,000 of them matched to a 136,000-programme guide; page clock
(`performance.now()`) until the result is on screen.

| Measure | Dev, before D8 | Dev, paging only | Dev, final | Release, final |
|---|---|---|---|---|
| Live TV guide, first render | 13.0 s | 0.70 s | 0.36 s | 0.31 s |
| …until programmes show | 7.8 s | 0.42 s | 0.14 s | 0.11 s |
| DOM elements | 183,650 | 5,934 | 5,934 | 6,111 |
| Vertical scroll, median / max per frame | 1,278 / 1,282 ms | 17 / 61 ms | 17 / 118 ms | 17 / 70 ms |
| Horizontal scroll, median / max per frame | 1,180 / 6,428 ms | 17 / 47 ms | 17 / 44 ms | 17 / 48 ms |
| Next day | 9.9 s | 0.83 s | 0.40 s | 0.36 s |
| Tune a channel | 17.8 s | 1.13 s | 0.23 s | 0.09 s |
| Channel down | – | 0.70 s | 0.18 s | 0.11 s |
| Show 100 more rows | – | 1.79 s | 0.45 s | 0.38 s |
| Channels view | 4.7 s | 0.12 s | 0.11 s | 0.09 s |
| Search across all channels | – | 0.05 s | 0.05 s | 0.05 s |
| Memory after browsing: Rust / largest web process | 334 / 512 MB | 346 / 1,121 MB | 352 / 887 MB | 270 / 737 MB |

Where the time went, measured with a temporary React Profiler (not committed): every Live TV render
cost about 215–320 ms in the dev build even with 100 rows, and the guide re-renders on every 15 s
clock tick. Nearly all of it was formatting times: `toLocaleTimeString` builds a new formatter on
each call, and one page formats about 3,000–4,000 times (benchmark: 4,400 calls, 315 ms; one cached
`Intl.DateTimeFormat`, 20 ms). With one formatter per format each render takes about 26–40 ms.

Remaining limits: each "Show more" adds rows, so a very long session drifts back towards the old
costs; the largest web content process reaches about 0.7–1.1 GB after heavy browsing of large
inputs. `content-visibility: auto` was tried and rejected (scrolling only improved to 0.33 s per
frame, and the web process grew to about 4 GB).

**Proposed follow-up milestone (not started):** a virtualised Live TV guide that renders only the rows
and time range in view, with targets such as under 100 ms to tune, 16 ms frames when scrolling in
both directions at 20,000 channels, and bounded memory.

## Security and dependencies

Inspected in D8, with evidence:

- **Commands and capabilities**: D8 verified 15 commands; the sets declared in `build.rs`, registered in
  `lib.rs` and granted in `capabilities/default.json` are identical. Granted to the `main` window
  only; no other permission sets.
- **Plugins**: none (no `tauri-plugin-*` in Cargo or npm; `@vitejs/plugin-react` is a build tool).
- **CSP**: `default-src 'self'`, `script-src 'self'`, `style-src 'self'`, `img-src 'self' data:`,
  `font-src 'self'`, `connect-src ipc: http://ipc.localhost kstream://localhost`, `media-src blob:`,
  `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`. No remote hosts.
- **Network call sites**: the page has no `fetch`, XHR, WebSocket, EventSource or beacon calls of its
  own; all Rust HTTP goes through `fetch::guarded_client` (playlists, guides, catalogue, streams and
  channel logos). After D8, the owner approved M3U channel logos: the added `fetch_channel_logo`
  command caps each image at 256 KiB and 10 seconds, limits concurrent reads to four, and accepts
  only PNG, JPEG, GIF and WebP signatures. Logos load near the viewport and remain memory-only.
  XMLTV guide icons and artwork are still dropped by the parser and never fetched.
- **Regression tests re-run** (all pass): fetch 15 (+1 ignored), stream 13, hls 10, m3u 14, xmltv 13,
  guides 9, catalogue 10, sources 16; they cover private, loopback, reserved and metadata addresses,
  DNS answers, redirect re-checks, the catalogue host allowlist and https-only rule, size and time
  limits, credential rejection, error redaction, entity and size attacks, DRM and CORS.
- **Natively**: no CSP violation in any run; no token or upstream address in the page in any run;
  external links cannot take the app window off Kinora.
- **No control was weakened** by the D8 fixes (they touch time formatting, rendering and copy only).
- `npm audit`: 0 vulnerabilities (npm packages only; it does not cover Rust crates).
- `cargo audit` (RustSec, 1,386 advisories, 426 crates): no vulnerabilities; two warnings, both from
  Tauri's Linux GTK 3 stack (`tauri` → `muda` → `gtk` 0.18): `glib` 0.18.5 unsound
  (RUSTSEC-2024-0429, in an API Kinora does not call) and `proc-macro-error` unmaintained
  (RUSTSEC-2024-0370, build time only). They cannot be upgraded without Tauri moving off gtk-rs 0.18.
  `cargo deny check advisories` fails on the unmaintained crate under its default settings.

## Defects fixed in D8

1. **Live TV did not scale to large playlists** (13 s renders, over 1 s per scrolled frame, 18 s to
   tune at 10,000 channels). Fixed by paging guide rows and channel cards. Regression test:
   `src/screens/LiveScale.test.tsx`.
2. **Every Live TV render was slow** (about 215–320 ms in dev; 0.4–0.8 s to tune or step channels in
   the release build) because each time label built a new date formatter. Fixed in `clock()`.
   Regression test: `src/lib/time.test.ts` (same output; much cheaper than a formatter per call).
3. **A reordered catalogue table would mislabel entries** (a channel count read as the name).
   Fixed by reading table cells by content. Regression test:
   `an_upstream_format_change_is_read_safely` in `src-tauri/src/catalogue.rs`.
4. **The provider credit in Discovery was a link that did nothing** in the desktop app (no plugin
   to open outside addresses). It is now plain text with the address. Regression test: in
   `src/screens/DiscoveryFlows.test.tsx`.

## Remaining risks and untested items

- One machine, one distribution, one desktop session; the RPM was unpacked, not installed; no other
  packaging formats.
- fMP4/CMAF, HEVC, live sliding-window streams, alternate audio and subtitles untested; only Mux's
  two test streams were played in the packaged app.
- Discovery depends on one provider's generated file.
- The guide is paged, not virtualised (see above); memory grows towards 1 GB with heavy browsing of
  very large inputs.
- Saved addresses may carry tokens and are stored in plain text for the OS user (`README.md`).

---

## Release Readiness Overhaul (v0.6.0)

Verified on 2026-11-19 against `v0.6.0` baseline.

### Key Milestones Delivered
1. **UI Layout and Interpretation Corrections**:
   - Eliminated permanent split-column right-hand menus in `Movies.tsx` and `LiveTV.tsx`. Both now operate as contextual overlay drawers with backdrop blur, preventing page content shifting and eliminating placeholder empty states.
   - Resolved tablet/desktop breakpoint mismatch between `Sidebar.css` (previously 900px) and `global.css` (760px), eliminating phantom empty columns on the left.
   - Unified collapsed sidebar width to 76px across both CSS variables and component styling.
   - Cleaned up `Settings.css` 3-column grid declaration (`260px 1fr 340px` to `240px 1fr`), moving live preview and visual presets into the Appearance section and eliminating the 340px phantom right margin.
   - Added standard gutter padding (`var(--gutter, 24px)`) to `Recordings.tsx`, aligning its layout with all other application screens.

2. **Staging Environment Separation**:
   - Implemented dedicated staging configuration `src-tauri/tauri.staging.conf.json` with isolated bundle identifier `io.github.millsydotdev.kinora.staging`.
   - Guaranteed full data directory isolation (`~/.local/share/io.github.millsydotdev.kinora.staging/`), ensuring staging builds cannot touch production data.
   - Added `build:staging`, `tauri:dev:staging`, and `tauri:build:staging` npm scripts.
   - Injected `__APP_ENV__` via Vite configuration and exposed `APP_ENV`, `isStaging()`, `isProduction()` in `src/lib/native.ts`.

3. **Release Pipeline and Developer Experience**:
   - Authored comprehensive `docs/DEVELOPMENT-AND-RELEASE-WORKFLOW.md` detailing architecture, environment separation, secrets policy, CI/CD gates, and release procedures.
   - Verified full quality gate (`scripts/quality-gate.sh`): all 476 Vitest tests, 176 Cargo tests, multi-timezone invariance tests, Rust Clippy and formatting pass cleanly.
   - Documented explicit deployment, verification, and rollback procedures.
