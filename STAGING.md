# Kinora Staging Guide (v0.6.0)

This document specifies the architecture, data isolation guarantees, build commands, automated CI/CD pipeline, developer workflow, and validation procedures for the Kinora staging environment.

For the comprehensive engineering workflow, see [DEVELOPMENT-AND-RELEASE-WORKFLOW.md](docs/DEVELOPMENT-AND-RELEASE-WORKFLOW.md).

---

## 1. Overview and Purpose

The staging environment provides a production-equivalent desktop runtime for testing release candidate packages before public distribution.

Staging guarantees that release testing:
1. Never modifies or corrupts the user's real media library, playlists, or settings.
2. Accurately tests native packaging, code signing, IPC boundaries, and updater policies.
3. Operates under explicit visual and environmental disambiguation.
4. Validates cross-platform package generation across Linux, Windows, and macOS.

---

## 2. Isolation Guarantees

Staging is isolated from production across the entire desktop stack:

| Parameter | Development | Staging | Production |
|---|---|---|---|
| **Bundle Identifier** | `io.github.millsydotdev.kinora` | `io.github.millsydotdev.kinora.staging` | `io.github.millsydotdev.kinora` |
| **Product Name** | `Kinora Dev` | `Kinora Staging` | `Kinora` |
| **Window Title** | `Kinora` | `Kinora [Staging]` | `Kinora` |
| **Data Directory (Linux)** | `~/.local/share/io.github.millsydotdev.kinora/` or browser storage | `~/.local/share/io.github.millsydotdev.kinora.staging/` | `~/.local/share/io.github.millsydotdev.kinora/` |
| **Data Directory (macOS)** | `~/Library/Application Support/io.github.millsydotdev.kinora/` | `~/Library/Application Support/io.github.millsydotdev.kinora.staging/` | `~/Library/Application Support/io.github.millsydotdev.kinora/` |
| **Data Directory (Windows)** | `%APPDATA%\io.github.millsydotdev.kinora\` | `%APPDATA%\io.github.millsydotdev.kinora.staging\` | `%APPDATA%\io.github.millsydotdev.kinora\` |
| **Updater Endpoint** | Disabled | `.../releases/download/staging-latest/latest.json` | `.../releases/latest/download/latest.json` |
| **Build Mode (`__APP_ENV__`)** | `development` | `staging` | `production` |

---

## 3. Staging Build Commands

Run staging commands directly from the repository root:

```bash
# 1. Compile web frontend for staging (inlines __APP_ENV__ = "staging")
npm run build:staging

# 2. Run staging desktop app in development mode with staging configuration
npm run tauri:dev:staging

# 3. Build native staging distribution packages (.rpm, .deb, AppImage on Linux)
npm run tauri:build:staging

# 4. Build unsigned staging packages (for local validation without signing keys)
npm run tauri:build:staging -- --no-sign
```

### Staging Configuration File
Staging configuration is defined in `src-tauri/tauri.staging.conf.json`. It inherits base security, CSP, and window properties from `tauri.conf.json`, overriding:
- `productName`: "Kinora Staging"
- `identifier`: "io.github.millsydotdev.kinora.staging"
- `build.beforeBuildCommand`: "npm run build:staging"
- `app.windows[0].title`: "Kinora [Staging]"
- `plugins.updater.endpoints`: `["https://github.com/millsydotdev/KinoraTV/releases/download/staging-latest/latest.json"]`

---

## 4. Automated Staging CI/CD Deployment

Automated staging builds and distributions are managed by `.github/workflows/staging.yml`.

### Workflow Triggers
1. **Push to `staging` branch**: Triggered whenever changes are merged into the staging integration branch.
2. **Push to staging tags**: Triggered by tags matching `staging-*` or `v*-staging*`.
3. **Manual Dispatch**: Triggered from GitHub Actions UI with an optional `dry_run` toggle.

### Pipeline Stages
1. **Quality Gate (`quality-gate`)**:
   - Executes `bash scripts/quality-gate.sh` on Ubuntu 24.04.
   - Enforces version check, TypeScript typecheck, Vitest frontend tests, multi-timezone invariance, and Rust engine tests.
2. **Matrix Staging Build (`build-staging`)**:
   - `linux-x64` (Ubuntu 24.04): produces `.deb`, `.rpm`, and `.AppImage`.
   - `windows-x64` (Windows Latest): produces `.exe` (NSIS) and `.msi`.
   - `macos-arm64` (macOS Latest): produces Apple Silicon `.dmg`.
   - `macos-x64` (macOS Latest): produces Intel x86_64 `.dmg`.
   - Signs binaries when `TAURI_SIGNING_PRIVATE_KEY` is available; builds with `--no-sign` otherwise.
   - Generates SHA-256 checksums per platform.
3. **Publish Staging Release (`publish-staging`)**:
   - Consolidates all platform packages and checksums into `staging-dist/`.
   - Publishes to GitHub Releases targeting tag `staging-latest`.
   - Marks the release as a Pre-release.
   - Never overwrites or interferes with production releases or tags.

---

## 5. Developer Staging Workflow

Developers follow this structured promotion path:

```
Developer Feature Branch
        |
        v
   Pull Request (against staging)
        |
        v
   CI Validation (Quality Gate)
        |
        v
  Integration Branch (staging)
        |
        v
 Automated Staging Deployment (.github/workflows/staging.yml)
        |
        v
   QA Validation and Sign-off
        |
        v
 Production Release (main branch tag)
```

### Exact Git Commands for Developers

#### Step 1: Create a feature branch
```bash
git checkout staging
git pull origin staging
git checkout -b feature/stream-buffer-optimization
```

#### Step 2: Implement and verify locally
```bash
# Verify code quality gates locally
npm run test:gate

# Build local staging package to test native behavior
npm run tauri:build:staging -- --no-sign
```

#### Step 3: Commit using conventional commits
```bash
git add .
git commit -m "feat(playback): optimize hls stream buffer threshold"
git push -u origin feature/stream-buffer-optimization
```

#### Step 4: Open a Pull Request
Open a pull request on GitHub:
- Base branch: `staging`
- Compare branch: `feature/stream-buffer-optimization`
- Ensure all automated PR status checks pass.

#### Step 5: Merge into staging branch
Once approved:
```bash
git checkout staging
git pull origin staging
git merge --ff-only feature/stream-buffer-optimization
git push origin staging
```
Pushing to `staging` automatically triggers `.github/workflows/staging.yml`.

#### Step 6: QA Validation of the Staging Build
Download the staging package from the `staging-latest` release on GitHub or inspect the build artifact. Test in an isolated environment as described in Section 6.

#### Step 7: Promotion to Production
After QA approval, merge `staging` into `main` and create a production release tag:
```bash
git checkout main
git pull origin main
git merge --ff-only staging
git push origin main

# Tag for production release
git tag -a v0.6.0 -m "Release v0.6.0"
git push origin v0.6.0
```

---

## 6. Staging Build Identification and Verification

Every staging build provides transparent identification to prevent confusion with production builds:

1. **Window Title**: Displays `Kinora [Staging]`.
2. **Settings > About Screen**:
   - Product heading displays `Kinora Staging (KinoraTV)`.
   - Build row displays `Kinora Staging` with `v0.6.0 (release) [Staging]`.
   - Environment indicator displays `Environment: staging`.
   - Active data directory displays `~/.local/share/io.github.millsydotdev.kinora.staging/`.
3. **Desktop Entry**:
   - The Linux desktop launcher is named `Kinora Staging.desktop` with `Name=Kinora Staging`.

### Runtime Verification in Isolated Environment
To verify a staging package locally without affecting user files:

```bash
# 1. Create temporary isolated XDG directories
mkdir -p /tmp/kinora-staging-test/{data,config,cache,state}

# 2. Run the staging binary under isolated environment
XDG_DATA_HOME=/tmp/kinora-staging-test/data \
XDG_CONFIG_HOME=/tmp/kinora-staging-test/config \
XDG_CACHE_HOME=/tmp/kinora-staging-test/cache \
XDG_STATE_HOME=/tmp/kinora-staging-test/state \
src-tauri/target/release/kinora

# 3. Verify that data was written strictly to the staging directory:
ls -la /tmp/kinora-staging-test/data/io.github.millsydotdev.kinora.staging/

# 4. Verify that production directory was never touched:
ls -la ~/.local/share/io.github.millsydotdev.kinora/
```

### Staging Verification Checklist
- [x] **Gate 0-4 Pass:** Run `npm run test:gate` locally to ensure all automated tests, linters, and typechecks pass.
- [x] **Package Build:** `npm run tauri:build:staging` compiles without errors and produces valid packages in `src-tauri/target/release/bundle/`.
- [x] **Data Isolation:** Launching the staging build creates and uses `io.github.millsydotdev.kinora.staging/`. Confirmed that production `io.github.millsydotdev.kinora/` is untouched.
- [x] **Visual Indicator:** Window title explicitly displays `Kinora [Staging]`, Settings displays `Kinora Staging`.
- [x] **Primary Navigation:** All 23 application routes load with complete UI headers, navigation, and content rails.
- [x] **Overlay Drawers:** In Live TV and Movies, confirm that details open as slide-out drawers without causing page content shifting or reserving empty columns.
- [x] **Network Security:** Native fetch engine refuses private and loopback destinations. Error messages scrub paths and tokens.
- [x] **Zero Em-Dash Compliance:** Confirmed zero em-dashes or en-dashes across UI and documentation.
