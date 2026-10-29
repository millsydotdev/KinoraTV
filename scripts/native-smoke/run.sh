#!/bin/bash
# One app launch: run.sh <env-name> <dev|release> <phase> [ns] [TZ]   (see README.md)
# The app's data, cache and config live under $KINORA_SMOKE_DIR/env-<name> (XDG_*), never in the
# user's real folders. "ns" runs Vite, the fixture server, the driver and the app in a network
# namespace with only loopback (no internet). Only processes started here are stopped.
set -u
ENV=$1; KIND=$2; PHASE=$3; NS=${4:-host}; TZV=${5:-}
REPO=$(cd "$(dirname "$0")/../.." && pwd); HERE=$REPO/scripts/native-smoke
D=${KINORA_SMOKE_DIR:-/tmp/kinora-smoke}; E=$D/env-$ENV; mkdir -p $E/data $E/cache $E/config
BIN=$REPO/src-tauri/target/debug/kinora
[ "$KIND" = release ] && BIN=$D/pkg/usr/bin/kinora
echo "running before: $(ps -eo comm | grep -cE '^(kinora|tauri-driver|WebKitWebDrive)$')"
export WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/$(id -u) DISPLAY=:0 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus
export XDG_DATA_HOME=$E/data XDG_CACHE_HOME=$E/cache XDG_CONFIG_HOME=$E/config
[ -n "$TZV" ] && export TZ=$TZV
inner() {
  cd $REPO
  if [ "$NS" = ns ]; then
    ip link set lo up
    if [ "$KIND" = dev ]; then setsid npm run dev > $D/vite-ns.log 2>&1 & VG=$!; fi
    [ "$PHASE" != offline-all ] && { python3 $HERE/server.py $D/fx 18765 $D/fixture.log & FX=$!; }
  fi
  [ "$PHASE" != offline-all ] && until curl -s -o /dev/null http://127.0.0.1:18765/channels.m3u; do sleep 0.5; done
  [ "$KIND" = dev ] && until curl -s -o /dev/null http://localhost:5199/; do sleep 0.5; done
  tauri-driver --port 4444 > $D/tauri-driver.log 2>&1 & DRV=$!; sleep 2
  KINORA_SMOKE_DIR=$D timeout 600 node $HERE/smoke.mjs "$BIN" "$PHASE" "$KIND"
  kill $DRV; sleep 2
  if [ "$NS" = ns ]; then [ -n "${VG:-}" ] && kill -- -$VG 2>/dev/null; [ -n "${FX:-}" ] && kill $FX 2>/dev/null; sleep 1; fi
}
if [ "$NS" = ns ]; then export -f inner; export NS KIND PHASE BIN D REPO HERE; unshare -rn bash -c inner; else inner; fi
ps -eo pid,comm | awk '$2 ~ /^(kinora|tauri-driver|WebKitWebDrive)$/'; echo "process check done"
