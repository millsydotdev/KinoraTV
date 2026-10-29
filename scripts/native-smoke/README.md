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
for p in fresh playback fullscreen guide bigplaylist associate perf discovery restart; do bash $S A dev $p; done
bash $S A dev offline ns                                       # offline, fixture server inside the namespace
bash $S A dev offline-all ns                                   # offline, nothing reachable at all
bash $S A dev removeguide; bash $S A dev removal
bash $S B dev dst host America/New_York                        # needs a US clock change within 6 days
```

Storage edge cases each need a prepared `env-<name>/data/io.github.millsydotdev.kinora/sources/sources.json`
(`migration`: a schema 1 file with a file-origin source; `future`: `{"version":3,…}`; `corrupt`:
truncated JSON), then `bash $S <name> dev <phase>`.

Packaged release: build with `npm run tauri:build`, unpack the RPM without installing it
(`rpm2cpio …rpm | cpio -idm` inside `$KINORA_SMOKE_DIR/pkg`), then
`bash $S R release release`, `bash $S R release release-restart` and `bash $S S release release-perf`.
Release builds cannot reach 127.0.0.1 (checked by the `release` phase), so they import files and use
the public test stream instead.

Each line printed is `PASS`, `FAIL` or `NOTE` (a measurement). Timings depend on the machine and on
whether React runs in development (Vite) or production (release) mode.
