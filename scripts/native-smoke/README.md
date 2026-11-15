# Native smoke tests

End-to-end checks that drive the real Kinora window through `tauri-driver`, one app launch per
phase. They were used for the Gate D8 release-readiness report (`docs/RELEASE-READINESS.md`).

## Safety

- Every launch runs with `XDG_DATA_HOME`, `XDG_CACHE_HOME` and `XDG_CONFIG_HOME` set to
  `$KINORA_SMOKE_DIR/env-<name>/…` (default `/tmp/kinora-smoke`), so the app never reads or writes
  your real Kinora data. Check it yourself: hash `~/.local/share/io.github.millsydotdev.kinora`
  before and after a run.
- One app instance at a time: `run.sh` prints the Kinora and driver processes before and after.
- `ns` runs everything inside `unshare -rn` (a network namespace with only loopback) to test
  offline behaviour. It stops only the processes it started.
- Local fixtures only, except the phases that read the public iptv-org catalogue (`discovery`,
  `release`) and play Mux's public HLS test stream (`release`).

## Needs

`tauri-driver` (`cargo install tauri-driver`), `WebKitWebDriver`, Node, Python 3, `ffmpeg` with
libx264 and AAC, `unshare`, and a Wayland or X session.

## Run

```bash
export KINORA_SMOKE_DIR=/tmp/kinora-smoke
bash scripts/native-smoke/make-fixtures.sh                     # rebuild each day: guide times are relative
python3 scripts/native-smoke/server.py $KINORA_SMOKE_DIR/fx 18765 $KINORA_SMOKE_DIR/fixture.log &
npm run dev &                                                  # dev phases load the UI from Vite
(cd src-tauri && cargo build --features loopback-fixtures)     # dev phases fetch 127.0.0.1 fixtures

S=scripts/native-smoke/run.sh
# Environment A: one profile used start to finish (each phase builds on the previous ones).
for p in fresh playback formats recovery fullscreen guide associate perf discovery discovery-more restart perms external-link; do bash $S A dev $p; done
for p in offline offline-all discovery-stale-offline; do bash $S A dev $p ns; done   # no internet; offline-all: no fixtures either
bash $S A dev removeguide; bash $S A dev removal
# Clock changes: a zone with a change within the guide's 7 days (KINORA_DST_DAY / KINORA_DST_TICKS for others).
bash $S B dev dst host America/New_York
# Guide edge cases, refusals and a real-world guide, in local UK time.
for p in guide-edge guide-errors realguide; do bash $S F dev $p host Europe/London; done
```

Storage edge cases each need a prepared `env-<name>/data/io.github.millsydotdev.kinora/sources/sources.json`
(`migration`: a schema 1 file with a file-origin source; `future`: `{"version":3,…}`; `corrupt`:
truncated JSON), then `bash $S <name> dev <phase>`.

Packaged release: build with `npm run tauri:build`, unpack the RPM without installing it
(`rpm2cpio …rpm | cpio -idm` inside `$KINORA_SMOKE_DIR/pkg`), then:

```bash
for p in release release-player release-restart; do bash $S R release $p; done
bash $S R release release-offline ns; bash $S R release release-removal; bash $S R release external-link
bash $S S release release-perf; bash $S T release realguide
```

A 23-hour (clocks-forward) day needs a faked clock when no real zone changes within the guide's
week. libfaketime works without installing it: `dnf download libfaketime`, check it with `rpm -K`,
unpack with `rpm2cpio … | cpio -idm` into `$KINORA_SMOKE_DIR/faketime`, then for example
`LD_PRELOAD=$KINORA_SMOKE_DIR/faketime/usr/lib64/libfaketime.so.1 FAKETIME='@2027-03-26 12:00:00' FAKETIME_DONT_FAKE_MONOTONIC=1 KINORA_DST_DAY='28 Mar' KINORA_DST_TICKS=46 bash $S G dev dst host Europe/London`.
Release builds cannot reach 127.0.0.1 (checked by the `release` phase), so they import files and use
the public test stream instead.

Each line printed is `PASS`, `FAIL` or `NOTE` (a measurement). Timings depend on the machine and on
whether React runs in development (Vite) or production (release) mode.
