# Kinora Staging Guide (v0.6.0)

This document specifies the architecture, data isolation guarantees, build commands, and validation procedures for the Kinora staging environment.

For the comprehensive engineering workflow, see [DEVELOPMENT-AND-RELEASE-WORKFLOW.md](docs/DEVELOPMENT-AND-RELEASE-WORKFLOW.md).

---

## 1. Overview and Purpose

The staging environment provides a production-equivalent desktop runtime for testing release candidate packages before public distribution.

Staging guarantees that release testing:
1. Never modifies or corrupts the user's real media library, playlists, or settings.
2. Accurately tests native packaging, code signing, IPC boundaries, and updater policies.
3. Operates under explicit visual and environmental disambiguation.

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

## 3. Staging Commands

Run staging commands directly from the repository root:

```bash
# 1. Compile web frontend for staging (inlines __APP_ENV__ = "staging")
npm run build:staging

# 2. Run staging desktop app in development mode with staging configuration
npm run tauri:dev:staging

# 3. Build native staging distribution packages (.rpm, .deb, AppImage on Linux)
npm run tauri:build:staging
```

### Staging Configuration File
Staging configuration is defined in `src-tauri/tauri.staging.conf.json`. It inherits base security, CSP, and window properties from `tauri.conf.json`, overriding only identity, window title, and updater target.

---

## 4. Staging Verification Checklist

Before recommending a staging build for release gate review, verify the following:

- [x] **Gate 0-4 Pass:** Run `npm run test:gate` locally to ensure all automated tests, linters, and typechecks pass.
- [x] **Package Build:** `npm run tauri:build:staging` compiles without errors and produces valid packages in `src-tauri/target/release/bundle/`.
- [x] **Data Isolation:** Launching the staging build creates and uses `~/.local/share/io.github.millsydotdev.kinora.staging/`. Confirm that existing files in `~/.local/share/io.github.millsydotdev.kinora/` remain untouched.
- [x] **Visual Indicator:** Window title explicitly displays `Kinora [Staging]`.
- [x] **Primary Navigation:** All 23 application routes load with complete UI headers, navigation, and content rails.
- [x] **Overlay Drawers:** In Live TV and Movies, confirm that details open as slide-out drawers without causing page content shifting or reserving empty columns.
- [x] **Network Security:** Native fetch engine refuses private and loopback destinations. Error messages scrub paths and tokens.
- [x] **Zero Em-Dash Compliance:** Confirm that zero em-dashes or en-dashes exist across UI and documentation.

---

## 5. CI/CD Staging Infrastructure Plan

### Current Status
- Local staging builds are fully functional via `npm run tauri:build:staging`.
- Tauri staging configuration `tauri.staging.conf.json` is configured.
- Automated remote publishing to `staging-latest` release tag on GitHub is pending workflow deployment.

### Implementation Plan for Automated Staging CI
To enable automated staging deployment on GitHub:
1. Add `.github/workflows/staging.yml` triggered on push to `staging` branch or manual `workflow_dispatch`.
2. Build cross-platform staging packages using `--config src-tauri/tauri.staging.conf.json`.
3. Sign packages with staging Minisign key.
4. Upload artifacts to the `staging-latest` pre-release tag on GitHub Releases.
