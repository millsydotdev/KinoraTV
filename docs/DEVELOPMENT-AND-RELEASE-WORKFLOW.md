# Kinora Development, Staging and Release Workflow

This document establishes the authoritative standard for developing, testing, staging, and releasing the Kinora desktop media application.

---

## 1. Architecture and Component Model

Kinora combines a high-performance web frontend with a memory-safe, network-guarded desktop shell.

```
+-------------------------------------------------------------+
|                React 19 + TypeScript (src/)                 |
|   Screens, UI components, state management, client routing   |
+-------------------------------------------------------------+
                             |
             IPC Boundary via `src/lib/native.ts`
           (Typed invoke() wrappers, runtime checks)
                             |
+-------------------------------------------------------------+
|                Rust + Tauri 2 (src-tauri/)                  |
|   Window lifecycle, guarded HTTP fetcher, HLS rewriter,     |
|   local stream server, EPG parser, isolated JSON stores     |
+-------------------------------------------------------------+
```

### Core Architecture Rules
1. **Clear Division of Responsibility**:
   - **React** owns the user interface, routing, component hierarchy, themes, animations, and in-memory UI preferences.
   - **Rust (`src-tauri/`)** owns native operating system capabilities, network fetch policies, stream session routing, file persistence, XMLTV/M3U parsing, and DVR operations.
   - Logic is never duplicated across both layers.

2. **IPC Boundary Discipline**:
   - `src/lib/native.ts` is the single authoritative bridge between React and Rust.
   - Every IPC command payload and response is validated at runtime rather than trusted implicitly.
   - In a non-Tauri browser environment (Vitest, Vite dev), native commands return `null` or safe fallback objects.

3. **Network Security & Privacy Guarantees**:
   - All network traffic is handled exclusively by Rust in `src-tauri/src/fetch.rs`.
   - Proxies are disabled by default (`no_proxy()`) to prevent destination validation bypasses.
   - Private, loopback (except test fixtures), link-local, CGNAT, and multicast IP addresses are strictly refused.
   - Hostnames are resolved through a guarded resolver; every redirect hop is re-checked against policy.
   - Error messages never expose full URLs, tokens, queries, or server file paths.

---

## 2. Environment Separation

To ensure stability and protect user data, Kinora defines four distinct environments:

| Environment | Purpose | Build Target / Mode | Data Isolation Scope |
|---|---|---|---|
| **Development** | Feature coding, prototyping, rapid HMR | `npm run dev` (browser) or `npm run tauri:dev` | LocalStorage / Mock fixtures |
| **Integration** | Automated testing, linting, format validation, type checking | `npm run test:gate` / `bash scripts/ci-local.sh` | Isolated temp folders (`scripts/native-smoke/`) |
| **Staging** | Production-equivalent desktop release testing | `npm run tauri:build:staging` | `io.github.millsydotdev.kinora.staging` |
| **Production** | Live end-user desktop release packages | `npm run tauri:build` | `io.github.millsydotdev.kinora` |

### Staging Isolation Guarantees
- **Separate Bundle Identifier**: Staging builds use `io.github.millsydotdev.kinora.staging` specified in `src-tauri/tauri.staging.conf.json`.
- **Isolated Data Directory**: Operating system application data directories are keyed by bundle identifier. On Linux:
  - Production data: `~/.local/share/io.github.millsydotdev.kinora/`
  - Staging data: `~/.local/share/io.github.millsydotdev.kinora.staging/`
- **Visual Disambiguation**: Staging window titles display `Kinora [Staging]`.
- **Independent Update Feeds**: Staging builds target the staging release channel (`staging-latest`), preventing accidental cross-channel updates.

---

## 3. Configuration and Secrets Management

1. **Environment Variables**:
   - Template file: `.env.example` lists all accepted configuration keys.
   - Local variables: developers copy `.env.example` to `.env` (which is excluded by `.gitignore`).
   - Build-time flags: `__APP_VERSION__`, `__APP_NAME__`, and `__APP_ENV__` are injected by Vite at build time based on `package.json` and build mode.

2. **Zero Credentials in Source Control**:
   - No API tokens, personal keys, private stream URLs, or signing keys may ever be committed.
   - CI/CD signing keys (`TAURI_SIGNING_PRIVATE_KEY`, `APPLE_CERTIFICATE`, etc.) are injected through GitHub Actions encrypted repository secrets.

3. **Data Migrations & Schema Versioning**:
   - Store files (`sources.json`, `guides.json`, etc.) maintain explicit schema versions (e.g. `SCHEMA_VERSION = 2`).
   - The Rust engine executes migrations on startup in `Store::read`.
   - Corrupted or unreadable files are safely moved aside with a timestamp extension (`.corrupt-<timestamp>`) rather than deleted.

---

## 4. UI Architecture and Layout Standards

### Conceptual Hierarchy
Mockup images represent visual targets and state compositions, not instructions to render every element as permanent on-screen fixtures. The application distinguishes clearly between:

1. **Global Navigation (`Sidebar.tsx`)**:
   - The primary application shell navigation.
   - Collapsible to compact icon mode (76px width) on desktop.
   - Off-canvas drawer sliding in from the left on mobile viewports (<= 760px).
   - Never duplicated inside individual screens.

2. **Page Header (`PageHeader.tsx`)**:
   - Global search pill (Ctrl+K shortcut trigger).
   - Navigation history buttons (< and >).
   - Status indicators: Background Task Center, Notifications, Cast, Help, Household Profile Menu, Clock.
   - Gutter alignment: horizontally aligned to `var(--gutter, 24px)`.

3. **Main Page Content**:
   - Screen-specific content area filling 100% of the available main stage.
   - Uniform horizontal padding: `padding: 0 var(--gutter, 24px) calc(76px + var(--audio-bar-height, 0px))`.
   - Grid systems (`.grid-posters`, `.grid-cards`, `.grid-4`, `.grid-6`, `.grid-7`) reflow responsively.

4. **Contextual Panels, Overlays and Drawers**:
   - Secondary details (such as Live TV Programme Details or Movie Quick Look) must operate as contextual overlay drawers with a translucent backdrop (`position: fixed; right: 0; z-index: 100;`).
   - Secondary panels must NEVER squeeze or shift the main page content into an asymmetric split column.
   - Closing a drawer (via Escape key, backdrop click, or close button) returns the view to full width with zero layout shift.

### Responsive Breakpoints
- **Desktop (Expanded)**: > 1100px width. Full sidebar (`--side-w`), multi-column grids.
- **Desktop / Tablet (Compact)**: 761px to 1100px width. Sidebar collapses to 76px icon rail. Gutter narrows gracefully.
- **Mobile / Narrow Window**: <= 760px width. Shell switches to single column (`minmax(0, 1fr)`). Sidebar becomes off-canvas drawer with hamburger menu button in the header.

---

## 5. Quality Assurance and Testing Pipeline

Kinora enforces a strict multi-gate validation pipeline:

### Automated Gates
1. **Gate 0: Version Consistency**:
   - Validates that `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock` agree on SemVer 2.0.0.
   - Command: `npm run version:check`

2. **Gate 1: TypeScript Static Typecheck**:
   - Full compiler verification with strict mode enabled.
   - Command: `npm run typecheck`

3. **Gate 2: Vitest Frontend Suite**:
   - 49 test files covering screens, state stores, theme contrast, navigation, and IPC boundary serialization.
   - Command: `npm test`

4. **Gate 3: Multi-Timezone Invariance**:
   - Executes guide and schedule tests across `Europe/London`, `America/New_York`, and `Pacific/Auckland`.
   - Guarantees daylight-saving transitions never disrupt programme air times or duration calculations.

5. **Gate 4: Rust Engine and Security**:
   - Rust formatting (`cargo fmt --check`).
   - Clippy lints with zero warnings (`cargo clippy --all-targets -- -D warnings`).
   - Cargo test suite (176 tests) verifying M3U parsing, XMLTV validation, HLS rewriter, fetch security, and stream handles.
   - Command: `npm run test:rust`

6. **Gate 5: Security and Supply Chain Audits**:
   - NPM vulnerability audit: `npm audit`
   - Cargo vulnerability advisory scan: `cargo audit`
   - Cargo licensing and dependency policy checks: `cargo deny check`
   - Third-party notices validation: `python3 scripts/third-party-notices.py --check`

### Local Quality Gate Runner
Run the full gate suite locally before committing:
```bash
npm run test:gate
# or full CI parity script:
npm run ci
```

---

## 6. Release Management and Deployment

### Versioning Rules
- All releases follow strict Semantic Versioning (`MAJOR.MINOR.PATCH`).
- Pre-releases append channel tags: e.g. `0.6.0-rc.1`, `0.6.0-beta.2`.
- Version updates are executed via `node scripts/sync-version.cjs <new-version>` to synchronize all project manifests atomically.

### Staging Verification Procedure
1. Create staging build:
   ```bash
   npm run build:staging
   npm run tauri:build:staging
   ```
2. Verify package installation in clean test container or isolated Linux user.
3. Validate that existing production data in `~/.local/share/io.github.millsydotdev.kinora/` is untouched.
4. Verify playback, channel tuning, and XMLTV matching against staging endpoints.

### Production Release Procedure
1. Confirm all quality gates pass on `main`: `npm run test:gate`.
2. Check release readiness checklist in `docs/RELEASE-READINESS.md`.
3. Create git tag matching authoritative version:
   ```bash
   git tag -a v0.6.0 -m "Release v0.6.0"
   git push origin v0.6.0
   ```
4. GitHub Actions `release.yml` triggers automatically:
   - Builds native artifacts across Linux (x86_64 .rpm, .deb, .AppImage), Windows (.exe, .msi), and macOS (arm64, x64 .dmg).
   - Generates cryptographic SHA-256 checksums (`SHA256SUMS.txt`).
   - Produces signed `latest.json` updater manifest using Minisign key.
   - Publishes draft/pre-release on GitHub Releases for final owner authorization.

### Rollback Procedures
- **Desktop Application Rollback**:
  If a critical bug is discovered in a production release:
  1. Re-publish the previous stable release manifest `latest.json` pointing to the prior version binaries.
  2. If an emergency patch is required, bump patch version (e.g. `0.6.1`), cherry-pick the fix, run `npm run test:gate`, and push the new release tag.
- **Client Data Safety**:
  Kinora stores are append-only or versioned; reverting an application version will not delete existing sources, as `Store::read` retains backwards-compatible files.

---

## 7. Developer Quickstart

### Prerequisites
- Node.js 22+ and npm
- Rust 1.85+ stable (`rustup default stable`)
- Linux system libraries:
  ```bash
  sudo apt-get install -y libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev patchelf
  # Or on Fedora:
  sudo dnf install -y webkit2gtk4.1-devel libayatana-appindicator-gtk3-devel librsvg2-devel openssl-devel
  ```

### Common Commands
```bash
npm install          # Install frontend dependencies
npm run dev          # Run Vite development server (http://localhost:5199)
npm run tauri:dev    # Run desktop app with hot-reloading
npm run typecheck    # Validate TypeScript types
npm test             # Run Vitest test suite
npm run test:rust    # Run Rust unit and integration tests
npm run test:gate    # Run full multi-gate quality pipeline
npm run build        # Build production web assets
npm run tauri:build  # Build production desktop packages
```
