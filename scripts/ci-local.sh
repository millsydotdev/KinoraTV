#!/bin/bash
# The same checks as .github/workflows/ci.yml, for a machine with the prerequisites in README.md.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run version:check
npm run typecheck
npm test
for tz in Europe/London Pacific/Auckland America/New_York; do TZ=$tz npm test -- --reporter=dot; done
(cd src-tauri && cargo fmt --check)
(cd src-tauri && cargo clippy --all-targets -- -D warnings)
(cd src-tauri && cargo clippy --all-targets --features loopback-fixtures -- -D warnings)
npm run test:rust
(cd src-tauri && cargo test --features loopback-fixtures)
npm audit
cargo audit --file src-tauri/Cargo.lock --ignore RUSTSEC-2024-0429 --ignore RUSTSEC-2024-0370 --ignore RUSTSEC-2026-0486
cargo deny --manifest-path src-tauri/Cargo.toml check advisories licenses bans sources
python3 scripts/third-party-notices.py --check
echo "ci-local: all checks passed"
