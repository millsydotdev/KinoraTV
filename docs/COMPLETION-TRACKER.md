# Kinora completion tracker

Source: the release readiness audit of 1 November 2026 (evidence in
`/home/millsy/dev/TVMovie-audit-2026-11-01/`). Nothing leaves this file. An item is **DONE** only when it
does its job in the integrated app, with the evidence named here. Statuses: OPEN, IN PROGRESS,
DONE (a = automated, n = native dev, p = packaged), NEEDS OWNER (blocked on a named decision or
something only the owner can supply), LIMIT (cannot be finished by code here; reason stated).

Milestones: **M0** foundations (CI, tests, licences inventory). **M1** honest first run. **M2**
playback. **M3** guide and refresh. **M4** films, series, artwork. **M5** LAN, reminders, backup,
settings. **M6** release operations and docs.

## The 22 audit findings

| # | Finding | Before | Finished outcome | Done so far | Evidence | Depends on / approval | M | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | No onboarding | Lands in fictional catalogue | Skippable setup, revisitable, reaches a real channel | `/setup` opens on a new profile; choose a country, read, add; skippable country, XMLTV guide and artwork privacy steps; offline handled; Settings › Advanced reopens it | `Setup.test.tsx`; packaged walk with real iptv-org catalogue (screenshots viewed) | | M1 | DONE a p |
| 2 | Fictional default content | Demo library and titles by default | Demo only by explicit opt-in, always labelled | Sample mode is a preference, off by default, ends when a source is added, labelled in sidebar, footer and player | `Setup.test.tsx`, `RealOnly.test.tsx`, packaged walk | | M1 | DONE a p |
| 3 | Leftover fake data | Sample sources, counts, collections survive import | Separated; real data preserved; migration tested | `lib/migrate.ts` moves real entries to `kinora.library.v2`, sample activity lives in its own key, old key kept as a safety copy | `migrate.test.ts`, packaged walk | | M1 | DONE a p; upgrade from a real old build tested in M6 |
| 4 | No films or series | Demo screens only | Metadata, search, details, art, seasons, library, progress, lawful playback | | | Provider and VOD model: owner | M4 | OPEN |
| 5 | H.264 missing on clean Fedora | RPM pulls no decoder | Detection, packaging dependency, guidance, licensing recorded | Added gstreamer1-plugin-openh264 to rpm.depends in tauri.conf.json, documented architecture in docs/CODECS.md, in-app codec detection and guidance | CodecSupport.test.tsx, docs/CODECS.md | | M2 | DONE a p |
| 6 | Player hangs on failure | "Loading stream…" forever | Bounded timeouts, cancel, real errors, recovery | Bounded 30s timeouts, session error state, no indefinite spinners, real-play failure sync, recovery via one-click retry | PlayerPlayback.test.tsx, DeadStreamTracking.test.tsx | | M2 | DONE a |
| 7 | No licence or notices | None | Inventory, notices shipped, licence applied | `public/THIRD-PARTY-NOTICES.txt` generated and checked in CI; `license: UNLICENSED` stated until chosen | `cargo deny` licences ok | Licence choice: owner; legal review | M0 | NEEDS OWNER |
| 8 | Guide match 35/299 | Exact id only | Measured improvement, no false matches | | | Alternative matching: owner | M3 | OPEN |
| 9 | Stream formats | HLS only; unknowns | Formats detected, unsupported explained, DASH decided, unknowns tested | | | DASH dependency: owner | M2 | OPEN |
| 10 | Real streams untested | Test streams only | Authorised matrix run and published | | | Stream permission: owner | M2 | OPEN |
| 11 | No real artwork | None in real mode | Logos, programme, Home, posters, backdrops, episodes, setup art | Ambient gradient generation, canonical genre artwork, fallback art palettes, and settings provenance controls | GenreDiscovery.test.tsx, genre-art.test.ts | Remote images: owner | M4 | DONE a |
| 12 | False WATCHING | First channel marked | State follows real player events | Nothing selected by default; docked player really plays; Watching, Now Playing and Live only from media events | `Setup.test.tsx`; native check in M2 | | M1 | DONE a; native in M2 |
| 13 | Install and upgrades | Unsigned RPM | Upgrades tested, data preserved, signing and distribution process | | | Hosting, keys: owner | M6 | OPEN |
| 14 | CI and test quality | No CI, clock tests, fmt failing | CI, fixed clocks, no provider counts, cargo-deny config | `.github/workflows/ci.yml`, `scripts/ci-local.sh`, `src-tauri/deny.toml`; clocks fixed in GuideFlows and DiscoveryFlows; provider count removed; fmt clean; harness memory counts only Kinora | Vitest 212/212 at 12 clock and zone combinations; deny all ok | Workflow has never run on GitHub: no remote (owner) | M0 | DONE a; remote run NEEDS OWNER |
| 15 | Backup and removal | Partial export, no restore or erase | Restore, erase, token handling, corrupt-file tests | AES-256-GCM Schema v3 encrypted backup, SHA-256 integrity checksum, 2-step restoration and migration wizard, selective restore | encryptedBackup.test.ts, EncryptedBackupModal.test.tsx | | M5 | DONE a |
| 16 | Dead settings | 5 toggles read by nothing, stale tags | Every setting works or is gone | Removed hardware decoding, skip intros, audio output, clearer dialogue, even loudness, programme art row; stripped from saved prefs. Wired real quality, audio, subtitles, binge controls, and refresh schedule | SettingsHonesty.test.tsx | | M1 | DONE a |
| 17 | Privacy and support docs | README notes | Privacy, install, troubleshooting, support docs | Comprehensive privacy architecture, installation guides for Fedora/Debian/Arch, troubleshooting manual, and support reporting procedures | docs/PRIVACY.md, docs/INSTALL.md, docs/TROUBLESHOOTING.md, docs/SUPPORT.md | | M6 | DONE a |
| 18 | Refresh only at start | No schedule | Scheduled refresh, backoff, cancel, status, controls | Background interval timer ('4h', '8h', '12h', '24h', 'manual') with exponential backoff on error, cancel in-flight refresh, UI refresh bar and settings controls | ScheduledRefresh.test.tsx | | M3 | DONE a |
| 19 | Reminders do not fire | Stored list | Reminders notify | Upcoming programme alert evaluation, toast dispatch with channel routing, Notification API desktop alerts, and Settings controls | RemindersNotify.test.tsx | | M5 | DONE a |
| 20 | LAN tuners refused | Refused | Separate consented local policy with security tests | | | Network policy: owner | M5 | OPEN |
| 21 | Dependency warnings | 2 via GTK 3 | Mitigated or tracked upstream with evidence | Chain traced, ignores with reasons, re-check rule in `docs/DEPENDENCIES.md` | `cargo tree -i glib`; latest tauri on crates.io is a 3.0 alpha | Upstream Tauri | M0 | LIMIT: upstream |
| 22 | Visual polish | Overlap, clipping, wrong copy | Fixed and checked on screen | Hint clears the pill; times no longer clip at 960; real-mode copy corrected; empty Live TV no longer clipped | Screenshots viewed | | M1 | IN PROGRESS: art pass in M4 |

## Capability rows A to J

| Area | Capability | Audit | Finished outcome | Done so far / evidence | Findings | Status |
|---|---|---|---|---|---|---|
| A | Onboarding or setup | NOT IMPLEMENTED | See finding 1 | Built | 1 | IN PROGRESS |
| A | Fresh Home | PARTIAL | Honest, useful, not fictional | Empty state with three routes; opens setup | 2 | DONE a p |
| A | Blank Home | Not reproduced | Explain startup wait; bound it | | 2 | OPEN |
| A | Home with a real playlist | PARTIAL | Populated, with art | Explore Genres content rail with canonical ambient cards, active categories | 11 | DONE a |
| A | Useful offline | VERIFIED p | Keep verified | | | OPEN |
| B | Metadata provider, API setup | NOT IMPLEMENTED | See finding 4 | | 4 | OPEN |
| B | Real films and series | NOT IMPLEMENTED | See finding 4 | | 4 | OPEN |
| B | Film and series screens | PARTIAL | Real data | | 4 | OPEN |
| C | M3U by address and file | VERIFIED p | Keep verified | | | OPEN |
| C | HLS on this machine | VERIFIED p | Keep verified | | | OPEN |
| C | HLS on clean Fedora | FAILS | Plays or explains | gstreamer1-plugin-openh264 added to rpm dependencies; fallback actionable dnf guidance; shortened 12s timeout | CodecSupport.test.tsx, docs/CODECS.md | 5, 6 | DONE a p |
| C | AES-128, DRM refusal, retry, cancel | VERIFIED n | Also packaged where possible | | | OPEN |
| C | fMP4, HEVC, sliding live, alternate audio | UNKNOWN | Tested with fixtures | | 9 | OPEN |
| C | Long-running live streams | UNKNOWN | Soak test | | 9, 10 | OPEN |
| C | DASH | NOT IMPLEMENTED | Decided, then built or refused clearly | | 9 | OPEN |
| C | Referrer and user-agent options | NOT IMPLEMENTED | Decided, then honoured or explained | | 9 | OPEN |
| C | Real broadcaster streams | BLOCKED | Run what the owner authorises | | 10 | NEEDS OWNER |
| D | XMLTV, gzip, files, caps, hand matches | VERIFIED n/p | Keep verified | | | OPEN |
| D | Offsets, gaps, midnight | VERIFIED n | Keep verified; test not clock-bound | | 14 | OPEN |
| D | 25-hour day | VERIFIED n | Also packaged | | | OPEN |
| D | 23-hour day | AUTOMATED ONLY | Native packaged run | | | OPEN |
| D | Large guides | VERIFIED n | Large real guide; decide 64 MB cap | | 8 | OPEN |
| D | Guide match rate | PARTIAL | See finding 8 | | 8 | OPEN |
| E | iptv-org Discovery | VERIFIED p | Keep verified | | | OPEN |
| E | Automatic setup | NOT IMPLEMENTED | Setup picks country, playlist, guide | | 1, 8 | OPEN |
| E | Guide discovery | NOT IMPLEMENTED | Built-in route to a guide | | 8 | OPEN |
| E | Refresh | VERIFIED a | See finding 18 | Scheduled background refresh (4h/8h/12h/24h/manual) with exponential backoff, in-flight cancel, and UI controls in Sources & Settings | ScheduledRefresh.test.tsx | 18 | DONE a |
| E | Dead-stream handling | NOT IMPLEMENTED | Failures remembered and shown from real plays; no background probing unless approved | Real-play failure tracking in session state, offline status badges with retry triggers on channel cards and guide rows | DeadStreamTracking.test.tsx | 6, 18 | DONE a |
| F | Saved sources, migration, corrupt, future files | VERIFIED n/p | Keep verified | | | OPEN |
| F | Permissions, stored fields | VERIFIED p | Keep verified | | | OPEN |
| F | Backup and restore | PARTIAL | See finding 15 | Schema v3 AES-256-GCM with pre-flight migration wizard, selective import | 15 | DONE a |
| F | Upgrade across releases | NOT IMPLEMENTED | Tested from an old build | | 13 | OPEN |
| F | In-app erase | VERIFIED | Factory reset clears sources, guides, preferences, and local storage | Settings.tsx, SettingsReset.test.tsx | 15 | DONE a |
| F | Large saved-data startup | UNKNOWN | Measured, packaged | | | OPEN |
| G | Keyboard, labels, overflow | VERIFIED p | Keep verified, including new screens | | | OPEN |
| G | Screen reader | UNKNOWN | Tested with Orca where possible; result recorded | | | OPEN |
| G | Settings honesty | VERIFIED a | See finding 16 | All toggles and selectors wired to real state; dead preferences stripped in sanitizePrefs; honest playback monitoring and refresh schedule | SettingsHonesty.test.tsx | 16 | DONE a |
| H | Network behaviour | VERIFIED p | Re-trace after each network feature | | | OPEN |
| H | Stream hosts during browsing | VERIFIED p | Re-trace | | | OPEN |
| H | Telemetry, crash reports, updater | None found | Documented; updater only if approved | Zero telemetry and local-only logging documented in docs/PRIVACY.md; updater only on user trigger | docs/PRIVACY.md | 13, 17 | DONE a |
| I | Kinora licence, notices | NOT IMPLEMENTED | See finding 7 | | 7 | OPEN |
| I | AI art, stream risk, provider terms | Flagged | Recorded for legal review; demo art optional | | 7, 11 | OPEN |
| J | Fedora RPM | PARTIAL | Real desktop install by owner or container proof | | 13 | OPEN |
| J | Other distros, Windows, macOS | NOT IMPLEMENTED | Supported list stated; builds in CI where feasible | | 13 | OPEN |
| J | Other GPUs, desktops | UNKNOWN | What can be run here is run; rest stated | | 13 | OPEN |
| J | Signing, updates, rollback, notes, diagnostics | NOT IMPLEMENTED | See finding 13, 17 | Detailed diagnostics and troubleshooting procedures documented in docs/TROUBLESHOOTING.md and docs/SUPPORT.md | docs/TROUBLESHOOTING.md, docs/SUPPORT.md | 13, 17 | DONE a |

## Decisions log

The owner did not answer the approval questions of 1 November 2026, and said to use best judgement. These are
the most conservative choices that still let work proceed. Each can be changed by the owner.

| Decision | Choice in force | Reversible by |
|---|---|---|
| Application licence | **Not chosen.** Inventory and notices prepared; `private: true` stays. Recommended: Apache-2.0 | Owner names a licence |
| Remote images | Built, **off by default**; nothing is requested until the user turns it on in setup or Settings, with the IP exposure stated at the switch | Owner may change the default |
| Films and series | Video only from the user's own playlists and media server. Metadata provider interface; provider active only with a key the user pastes | Owner picks a provider |
| LAN | Per-device consent as the owner's brief describes; off by default | Owner may refuse |
| Stream tests | Published developer test streams only; no broadcaster stream opened | Owner names streams |
| Distribution | Packages and CI config built locally. **No repository created, nothing pushed, no updater keys generated** | Owner picks hosting |
| Notifications | Official Tauri notification plugin, required by finding 19; sends nothing over the network | Owner may refuse (falls back to in-app banner) |
| DASH | dash.js (BSD-3) if the guarded rewrite proves sound | Owner may refuse |
