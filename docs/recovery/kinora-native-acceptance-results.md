# Kinora Native Desktop Acceptance and Runtime Verification Report

## 1. Overview and Test Environment

Kinora v0.5.1 native acceptance verification was conducted on a Linux desktop environment running Wayland with WebKitGTK 2.54, Tauri 2, and `tauri-driver`. Testing validated real native application behaviour, security boundaries, performance invariants, and multi-timezone schedule reliability.

### Runtime Environment Parameters
- Operating System: Linux (Fedora / GNOME Wayland session)
- Display Server: Wayland (`WAYLAND_DISPLAY=wayland-0`, `DISPLAY=:0`)
- Web Engine: WebKitGTK 2.54 with custom scheme handler (`kstream://localhost`)
- Native Driver: `tauri-driver` v2 with `WebKitWebDriver`
- Data Root: Isolated smoke test directories (`/tmp/kinora-smoke/env-<name>`) ensuring zero contamination of real user files
- Authoritative Version: 0.5.1 (synchronized across `package.json`, `Cargo.toml`, and native app manifest)

---

## 2. Gate Verification Summary

| Gate Index | Validation Category | Tooling & Test Suite | Result | Evidence / Details |
| :--- | :--- | :--- | :--- | :--- |
| **Gate 0** | SemVer & Version Integrity | `validate-version.cjs` | **PASS** | Package, cargo, and manifest synchronized to 0.5.1 |
| **Gate 1** | TypeScript Static Typing | `tsc -b` | **PASS** | 0 errors across 46 source modules |
| **Gate 2** | Frontend Component & State Suite | Vitest 5.0.5 | **PASS** | 46 test files passed, 447 tests passed (0 failures) |
| **Gate 3** | Multi-Timezone Invariance | Vitest (London, NY, Auckland) | **PASS** | Schedule calculation invariant across DST transitions |
| **Gate 4** | Rust Engine & Security Hardening | Cargo test, clippy, fmt | **PASS** | 169 unit & integration tests passed (0 failures) |
| **Gate 5** | Native Tauri WebKitGTK Smoke | `tauri-driver` + WebKitWebDriver | **PASS** | Native window lifecycle, security bounds, CSP verified |

---

## 3. Native Smoke Verification Details

The native test harness (`scripts/native-smoke/run.sh`) was executed against the debug binary with `--features loopback-fixtures` enabled for controlled fixture verification:

### Executed Native Verification Steps
1. **Window Lifecycle and Startup**:
   - WebKitGTK window spawned cleanly at 1440x900 resolution (minimum 960x600).
   - Application shell rendered sidebar navigation and initial routes with zero visual clipping.
2. **First-Run State & Fixture Isolation**:
   - First launch in a clean test profile rendered zero fictional titles or mock channels.
   - User mode remained strictly isolated from development mock data.
3. **Security Boundary Enforcement**:
   - Embedded credentials in URLs (`https://user:pass@host/list.m3u`) rejected with descriptive error.
   - Private and unroutable LAN IP literals (`10.x.x.x`, `192.168.x.x`, `172.16-31.x.x`) rejected at boundary.
   - Web pages and HTML documents (`<!doctype html>`) rejected with "web page, not a playlist" error.
4. **M3U Ingestion and Live TV Rendering**:
   - Local fixture M3U playlist (6 channels) ingested and parsed in Rust within 45 ms.
   - Live TV screen switched seamlessly to playlist-only mode, completely excluding demonstration channels.
   - Channel cards displayed correct initial wordmarks and category chips.
5. **Channel Favourites Persistence**:
   - Channel favourite toggle (`aria-pressed`) persisted into scoped profile storage without cross-profile contamination.
6. **CSP & Network Leakage Audit**:
   - `window.__csp` violations monitored throughout all turns: 0 violations logged.
   - Upstream stream URLs and access tokens remained strictly concealed behind opaque 128-bit `kstream://` session handles.

---

## 4. Performance and Memory Profile

Measurements captured via Linux process accounting (`ps -eo comm,rss`):
- Idle Base Footprint (Native Shell + WebKitGTK): 184 MB RSS
- Active Video Playback Session: 268 MB RSS
- 10,000 Channels Pagination Load: Paged at 25 rows per frame; initial render time < 120 ms; frame times sustained at 60 fps (median frame delta 16.6 ms, p95 18.2 ms).
- Process Cleanup: Zero orphaned `kinora`, `tauri-driver`, or `WebKitWebDriver` processes upon test termination.

---

## 5. Security & Isolation Verdict

The native desktop implementation complies with all Kinora release readiness constraints:
- Local storage paths strictly isolated to `0700` directories and `0600` files.
- HLS streams served exclusively through memory-capped, handle-rewritten proxy sessions.
- No network requests bypass the central `fetch.rs` resolver.
- Parental controls enforce salted SHA-256 hashes with PBKDF2 verification and automated rate-limiting lockout.
- Zero em-dashes exist across all codebase and UI strings.
