#!/bin/bash
# Kinora Application-Wide Quality Gate
# Enforces strict quality, compilation, multi-timezone testing, Rust engine integrity,
# and safe native environment validation before acceptance.
set -euo pipefail

REPO=$(cd "$(dirname "$0")/.." && pwd)
cd "$REPO"

echo "=========================================================="
echo "           KINORA MASTER APPLICATION QUALITY GATE         "
echo "=========================================================="
echo "Repository: $REPO"
echo "Git Branch: $(git branch --show-current)"
echo "HEAD Hash:  $(git rev-parse HEAD)"
echo "Timestamp:  $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "=========================================================="

# Gate 1: TypeScript Static Typecheck
echo ""
echo "=== GATE 1: TYPESCRIPT STATIC TYPECHECK (tsc -b) ==="
npm run typecheck
echo "PASS: TypeScript static compilation passed with 0 errors."

# Gate 2: Frontend Unit, Component and Integration Suite (Vitest)
echo ""
echo "=== GATE 2: VITEST APPLICATION SUITE (30 Test Files) ==="
npm test
echo "PASS: Vitest frontend application suite passed."

# Gate 3: Multi-Timezone Schedule and Daylight-Saving Invariance
echo ""
echo "=== GATE 3: MULTI-TIMEZONE EPISODE & SCHEDULE VALIDATION ==="
for tz in Europe/London America/New_York Pacific/Auckland; do
  echo "Testing timezone invariant: TZ=$tz"
  TZ=$tz npx vitest run src/screens/GuideFlows.test.tsx src/lib/time.test.ts src/data/days.test.ts --reporter=dot
done
echo "PASS: Guide and time schedules invariant across London, New York and Auckland."

# Gate 4: Rust Engine, Network Ingest & Stream Security Suite (Cargo)
echo ""
echo "=== GATE 4: RUST ENGINE & SECURITY VERIFICATION (src-tauri) ==="
(cd "$REPO/src-tauri" && cargo fmt --check)
(cd "$REPO/src-tauri" && cargo clippy --all-targets -- -D warnings)
npm run test:rust
echo "PASS: Rust engine, formatting, clippy lints, network policies, and XMLTV/M3U parsers passed."

# Gate 5: Isolated Native Smoke Verification
echo ""
echo "=== GATE 5: ISOLATED NATIVE SMOKE VERIFICATION ==="
if [ -f "$REPO/src-tauri/target/debug/kinora" ]; then
  bash "$REPO/scripts/native-smoke/run.sh" smoke dev m3u
  echo "PASS: Native Tauri runtime smoke verification passed."
else
  echo "NOTE: Debug binary not built; skipping native runtime smoke. Run 'npm run tauri:dev' to generate debug binary."
fi

echo ""
echo "=========================================================="
echo "     ALL KINORA QUALITY GATES PASSED SUCCESSFULLY         "
echo "=========================================================="
