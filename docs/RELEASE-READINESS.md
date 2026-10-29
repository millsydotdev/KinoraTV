# Release readiness (Gate D8)

Tested on 2026-10-29 against `main` after D7 (`c1ecf4c`) plus the D8 fixes below.

**Recommendation: ready for limited hands-on user testing on Linux desktops like this one**, with
the known limits below stated to testers. It is not ready for a general release: only one machine
and one OS were tested, there is no installer test, and the Live TV guide is paged rather than
virtualised.

## Environment

| | |
|---|---|
| OS | Fedora 44, kernel 7.2.11, Wayland |
| Machine | AMD Ryzen 7 5700X, 31 GB RAM |
| Web view | WebKitGTK 2.54.1 (Tauri 2.12.5, wry 0.57) |
| Codecs | GStreamer 1.28.8 with libav, openh264 and plugins-bad-freeworld: H.264 (`avdec_h264`, `openh264dec`), AAC (`avdec_aac`, `fdkaacdec`) present |
| Packaged app | `Kinora-0.1.0-1.x86_64.rpm`, unpacked with `rpm2cpio` (not installed) and its `usr/bin/kinora` run |

Nothing here shows behaviour on other distributions, desktops, GPUs, GStreamer versions or
codec sets. A machine without H.264/AAC decoders shows a decode error (documented in `README.md`).

## How it was tested

- **Automated**: Rust unit and local-server tests, Vitest (Node and happy-dom). Not evidence of
  native or packaged behaviour on their own.
- **Native dev**: the debug app (`cargo build --features loopback-fixtures`, UI from Vite) driven
  through `tauri-driver` by `scripts/native-smoke/`, against local fixtures. Each run used its own
  `XDG_DATA_HOME`/`XDG_CACHE_HOME`/`XDG_CONFIG_HOME`; the user's real Kinora data (313 files) hashed
  identical before and after. Offline runs used a network namespace with only loopback.
- **Packaged release**: the binary from the RPM, with its own isolated data folders. It cannot reach
  127.0.0.1 (verified), so it imported files and played a public test stream.

Real-world inputs and why their use was considered acceptable:

- **Mux test stream** `https://test-streams.mux.dev/x36xhzz/url_6/193039199_mp4_h264_aac_hq_7.m3u8`
  (Big Buck Bunny, Creative Commons, Blender Foundation). Mux hosts it on a host dedicated to test
  streams, and hls.js, Kinora's player library, uses it in its own test suite. That is a reasonable
  basis, not a written licence to Kinora.
- **iptv-org catalogue and its English playlist**: Unlicense (public domain). Only the index and
  one playlist's text were downloaded; no iptv-org stream was played.
- **No real-world XMLTV guide** was used: none with clear reuse terms was identified, so large
  guides are synthetic.

## Status of every listed limitation and untested case

Key: **A** automated test, **N** native dev app, **R** packaged release, **–** not tested.

### First run and core workflows

| Item | A | N | R | Notes |
|---|---|---|---|---|
| Fresh launch shows the demo catalogue | ✓ | ✓ | ✓ | |
| HTTP(S) playlist added | ✓ | ✓ | – | release cannot reach local fixtures; file import used there |
| Local M3U file imported | ✓ | ✓ | ✓ | |
| Discovery browse, search, filters, paging | ✓ | ✓ | ✓ | live catalogue, 1,276 entries |
| Discovery refresh, cancel a read | ✓ | ✓ | – | |
| Discovery import of a large real playlist (English, 3,016 channels) through the UI | ✓ | ✓ | – | read 0.9 s, add 0.1 s |
| Duplicate address refused | ✓ | ✓ | – | |
| Invalid address (credentials, private address) | ✓ | ✓ | ✓ | release refuses 127.0.0.1 |
| Malformed playlist, web page instead of a playlist | ✓ | ✓ | – | |
| Sources, guides, matches persist across restart | ✓ | ✓ | ✓ | |
| Source and guide removal | ✓ | ✓ | – | cache file deleted, matches dropped |
| Live TV channel selection docks the player | ✓ | ✓ | – | |
| Playback (local HLS fixture) | ✓ | ✓ | – | |
| Playback (public HLS test stream) | – | – | ✓ | H.264/AAC TS, played past 3 s |
| Pause and resume | ✓ | ✓ | ✓ (pause) | |
| Mute, volume | ✓ | ✓ | – | volume 30 % gives `video.volume` 0.30 |
| Full screen (real click), and leaving it | – | ✓ | – | a scripted `click()` is not a user gesture and is ignored by WebKit, as expected |
| Switching channels | ✓ | ✓ | – | |
| Leaving the player (Escape) | – | ✓ | – | |
| Favourites and history persist | ✓ | ✓ | – | |
| Theme persists | – | ✓ | – | |
| Offline startup | ✓ | ✓ | – | namespace with no network |
| Failed refresh keeps last good data | ✓ | ✓ | – | every playlist and guide; files byte-identical afterwards |

### HLS playback

| Item | A | N | R | Notes |
|---|---|---|---|---|
| Master and media playlists, MPEG-TS segments | ✓ | ✓ | ✓ | |
| AES-128 | ✓ | ✓ | – | key fetched once, through Rust |
| DRM (SAMPLE-AES) refused | ✓ | ✓ | – | "uses features Kinora does not support, such as DRM" |
| Non-HLS (MP4) refused | ✓ | ✓ | – | refused before any request |
| Missing segments | ✓ | ✓ | – | 7 tries, then an error with Retry |
| Slow requests (5 s each) | ✓ | ✓ | – | played after about 11 s |
| No direct upstream requests, no Referer/Origin, no tokens in the page, no CSP violations | ✓ | ✓ | ✓ | 131 fixture requests, all from Kinora's Rust side |
| fMP4 / CMAF, HEVC, multiple audio tracks, subtitles, live (sliding window) streams | – | – | – | not tested |
| Other machines, GPUs, distributions | – | – | – | not tested |

### Programme guide

| Item | A | N | R | Notes |
|---|---|---|---|---|
| 25-hour day (clocks go back) | ✓ | ✓ | – | `TZ=America/New_York`, 1 Nov 2026: 50 ticks, 01:00 and 01:30 shown twice |
| 23-hour day (clocks go forward) | ✓ | – | – | no zone springs forward within the guide's 7 days of the test date |
| Programmes spanning midnight, offsets, gaps | ✓ | – | – | covered by Rust and Vitest only |
| Large guide (136,000 programmes, 28 MB uncompressed) | ✓ | ✓ | ✓ | dev 6.2 s, release 4.0 s to read and add |
| Over the programme cap, gzip bomb, entity expansion | ✓ | ✓ | – | clear refusals |
| Offline refresh keeps cached listings | ✓ | ✓ | ✓ | |
| Hand matches survive restart and refresh | ✓ | ✓ | – | |
| Guide removal, playlist removal, match clean-up | ✓ | ✓ | – | |
| Guide icons never fetched | ✓ | ✓ | – | no icon request in the fixture log |
| Real-world XMLTV document | – | – | – | none with clear reuse terms was found |

### Discovery catalogue

| Item | A | N | R | Notes |
|---|---|---|---|---|
| Today's `PLAYLISTS.md` parsed | ✓ | ✓ | ✓ | 1,276 entries, 0 rejected, 1.7 ms |
| Reordered, missing and extra columns; CRLF; tabs; unknown sections | ✓ | – | – | **fixed in D8** (cells are now read by content) |
| Unrecognisable format refused as a whole | ✓ | – | – | |
| Catalogue failure never touches sources, guides, favourites, history, playback | ✓ | ✓ | – | |
| Stale copy, refresh failure message, retry | ✓ | ✓ | – | |
| Single provider | – | – | – | if iptv-org changes the file beyond what the parser reads, Discovery says it cannot read the catalogue and keeps its cached copy; nothing else changes |

### Persistence and recovery

| Item | A | N | R | Notes |
|---|---|---|---|---|
| Folder 0700, files 0600, atomic writes | ✓ | ✓ | – | |
| Damaged file set aside, not deleted | ✓ | ✓ | – | |
| Newer schema left untouched, nothing saved | ✓ | ✓ | – | file hash unchanged |
| Schema 1 to 2: no rewrite on load, backup on first save | ✓ | ✓ | – | backup byte-identical to the original |
| Startup with unreachable sources and guides | ✓ | ✓ | – | |
| Stale or overlapping async results dropped | ✓ | – | – | |

## Large inputs and responsiveness

10,000 channels, 1,000 of them matched to a 136,000-programme guide. Times are from the page's
clock (`performance.now()`), measured until the result is on screen.

| Measure | Dev, before D8 | Dev, after D8 | Release, after D8 |
|---|---|---|---|
| Live TV guide, first render | 13.0 s | 0.94 s | 0.62 s |
| …until programmes show | 7.8 s | 0.56 s | 0.34 s |
| DOM elements | 183,650 | 7,626 | 7,711 |
| Vertical scroll, median / p95 per frame | 1,278 / 1,282 ms | 17 / 65 ms | 18 / 67 ms |
| Horizontal scroll, median / max per frame | 1,180 / 6,428 ms | 62 / 528 ms | 61 / 66 ms |
| Next day | 9.9 s | 0.77 s | 0.51 s |
| Tune a channel | 17.8 s | 1.0 s | 0.42 s |
| Channels view | 4.7 s | 0.12 s | 0.10 s |
| Search across all channels | – | 0.05 s | 0.04 s |
| Show 100 more rows | – | 1.4 s | 0.85 s |
| Memory after browsing (Rust / web content processes) | 334 MB / 512 + 353 MB | 332 MB / 564 + 1,184 MB | 270 MB / 539 + 950 MB |

Before D8 the guide and the Channels view rendered every channel, which made a 10,000-channel
playlist unusable. They now render 100 rows or 120 cards at a time with a "Show more" button
(channel up and down still reach every channel). Remaining limits:

- Each "Show more" adds rows to the page, so a long session of showing more drifts back towards
  the old costs. Horizontal scrolling is the slowest interaction (about 16 frames a second), and
  tuning or stepping channels still takes up to about 0.8 s in the release build.
- The web content process grows to about 1 GB after heavy browsing of large inputs.
- `content-visibility: auto` was tried and rejected: scrolling improved only to 0.33 s a frame and
  the web content process grew to about 4 GB.

**Proposed follow-up milestone (not started):** a virtualised Live TV guide that renders only the
rows and the time range in view, with targets such as under 100 ms to tune, smooth (16 ms) vertical
and horizontal scrolling at 20,000 channels, and bounded memory.

## Security and dependencies

- Re-run: SSRF and address blocking, DNS checks, redirect re-checks, the catalogue host allowlist and
  https-only rule, size and time limits, credential rejection, error redaction, XML safety, command
  permissions and CSP. All pass (automated and, where listed above, native).
- No logos, artwork, guide icons or individual stream addresses were fetched outside playback.
- `npm audit`: 0 vulnerabilities (npm packages only; it does not cover Rust crates).
- `cargo audit` (RustSec, 1,381 advisories, 426 crates): no vulnerabilities; two warnings, both from
  Tauri's Linux GTK 3 stack (`tauri` → `muda` → `gtk` 0.18): `glib` 0.18.5 unsound
  (RUSTSEC-2024-0429, an API Kinora does not call) and `proc-macro-error` unmaintained
  (RUSTSEC-2024-0370, build time only). They cannot be upgraded without Tauri moving off gtk-rs
  0.18. `cargo deny check advisories` fails on the unmaintained crate under its default settings
  for the same reason.

## Defects fixed in D8

1. **Live TV did not scale to large playlists** (13 s renders, over 1 s per scrolled frame, 18 s to
   tune at 10,000 channels). Fixed by paging the guide rows and channel cards. Regression test:
   `src/screens/LiveScale.test.tsx`.
2. **A reordered catalogue table would mislabel entries** (a channel count read as the name).
   Fixed by reading table cells by content. Regression test:
   `an_upstream_format_change_is_read_safely` in `src-tauri/src/catalogue.rs`.

## Remaining risks and untested items

- One machine, one distribution, one desktop session; no RPM install, no other packaging formats.
- fMP4/CMAF, HEVC, live sliding-window streams, alternate audio and subtitles untested; a single
  public test stream played in the packaged app.
- No real-world XMLTV document; no native 23-hour day.
- Discovery depends on one provider's generated file.
- The guide is paged, not virtualised (see above).
- Saved addresses may carry tokens and are stored in plain text for the OS user (documented in
  `README.md`).
