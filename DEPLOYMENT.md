# Kinora Deployment and CI/CD Guide (v0.6.0)

This document details the CI/CD pipeline automation, code signing infrastructure, environment variable management, and native packaging deployment workflows.

For the developer workflow and release gates, see [DEVELOPMENT-AND-RELEASE-WORKFLOW.md](docs/DEVELOPMENT-AND-RELEASE-WORKFLOW.md) and [RELEASE.md](RELEASE.md).

---

## 1. CI/CD Architecture Overview

Kinora utilizes GitHub Actions for continuous integration, multi-platform packaging, code signing, and release deployment.

```
[ Developer Branch ] -> [ ci.yml: Quality Gate ] -> [ PR Validation ]
                               |
[ Push to staging ]  -> [ staging.yml: 4-Platform Matrix ] -> [ GitHub Pre-Release: staging-latest ]
                               |
[ Tag: v0.6.0 ]      -> [ release.yml: 4-Platform Matrix ] -> [ GitHub Release Draft ]
```

---

## 2. Workflows

### Continuous Integration (`.github/workflows/ci.yml`)
- **Triggers:** Push to `main`, pull requests, manual `workflow_dispatch`.
- **Environment:** Ubuntu 24.04 (Linux x86_64).
- **Execution Steps:**
  1. Setup Node.js 22 and stable Rust toolchain with `clippy` and `rustfmt`.
  2. Install system libraries (`libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `libssl-dev`, `patchelf`, `rpm`).
  3. Install security audit tools: `cargo-audit`, `cargo-deny`.
  4. Run `bash scripts/ci-local.sh` (version check, typecheck, Vitest, multi-timezone, Rust fmt/clippy/tests, security audit).
  5. Build Linux packages (`.rpm`, `.deb`, `.AppImage`) via `npm run tauri:build`.
  6. Upload build artifacts as `kinora-packages`.

### Automated Staging Deployment (`.github/workflows/staging.yml`)
- **Triggers:** Push to `staging` branch, tags matching `staging-*` or `v*-staging*`, manual `workflow_dispatch` with dry-run toggle.
- **Platform Matrix:**
  - `linux-x64` (Ubuntu 24.04): `.rpm`, `.deb`, `.AppImage`
  - `windows-x64` (Windows Latest): `.exe` (NSIS), `.msi`
  - `macos-arm64` (macOS Latest): Apple Silicon `.dmg`
  - `macos-x64` (macOS Latest): Intel `.dmg`
- **Execution Steps:**
  1. Execute full quality gate (`scripts/quality-gate.sh`).
  2. Build native staging packages using `npm run tauri:build:staging` with Minisign signing if secret is present.
  3. Generate SHA-256 checksums per platform.
  4. Consolidate artifacts into `staging-dist/` and generate unified `SHA256SUMS-staging.txt`.
  5. Publish pre-release on GitHub Releases targeting the `staging-latest` tag.

### Multi-Platform Production Release Pipeline (`.github/workflows/release.yml`)
- **Triggers:** Push of tags matching `v*`, manual `workflow_dispatch` with dry-run toggle.
- **Platform Matrix:**
  - `linux-x64` (Ubuntu 24.04): `.rpm`, `.deb`, `.AppImage`
  - `windows-x64` (Windows Server 2022): `.exe` (NSIS), `.msi`
  - `macos-arm64` (macOS 14+): Apple Silicon `.dmg`, `.app.tar.gz`
  - `macos-x64` (macOS 13+): Intel `.dmg`, `.app.tar.gz`
- **Execution Steps:**
  1. Validate version consistency and determine release channel (stable vs pre-release).
  2. Build native packages per target architecture.
  3. Sign binaries and update archives using Minisign and Apple certificates.
  4. Consolidate SHA-256 checksums into `SHA256SUMS.txt`.
  5. Generate `latest.json` updater manifest with platform URLs and signatures.
  6. Publish draft GitHub Release for final authorization.

---

## 3. Environment Variables and Secrets Reference

### GitHub Actions Secrets
The following secrets are configured in repository settings:

| Secret Name | Purpose | Required For |
|---|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | Minisign private key for updater bundle signing | Release, Staging & CI builds |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for the Minisign private key | Release, Staging & CI builds |
| `APPLE_CERTIFICATE` | Base64-encoded Developer ID Application certificate | macOS releases |
| `APPLE_CERTIFICATE_PASSWORD` | Password for the Apple signing certificate | macOS releases |
| `APPLE_SIGNING_IDENTITY` | 10-character Team ID or Common Name on certificate | macOS releases |
| `APPLE_ID` | Apple ID email for notarization service | macOS releases |
| `APPLE_PASSWORD` | App-specific password for Apple notarization | macOS releases |
| `APPLE_TEAM_ID` | 10-character Apple Developer Team ID | macOS releases |
| `VITE_TMDB_API_KEY` | The Movie Database API key (optional enrichment) | Metadata searches |

### Local Development Environment (`.env`)
Create a local `.env` file based on `.env.example`:
```bash
cp .env.example .env
```
All `.env` files are excluded from source control by `.gitignore`. No credentials may ever be committed.

---

## 4. Local Build Procedures

### Production Desktop Package Build
```bash
# Linux (creates RPM, DEB, AppImage in src-tauri/target/release/bundle/)
npm run tauri:build
```

### Staging Desktop Package Build
```bash
# Uses staging configuration and separate bundle identifier (io.github.millsydotdev.kinora.staging)
npm run tauri:build:staging

# Unsigned staging build
npm run tauri:build:staging -- --no-sign
```

### Unsigned Development Build
```bash
# Builds native binary without requiring signing keys
npm run tauri:build -- --no-sign
```

---

## 5. Post-Deployment Verification

Following a deployment or installation:

1. **Verify Integrity:**
   ```bash
   sha256sum -c SHA256SUMS.txt
   # Or for staging:
   sha256sum -c SHA256SUMS-staging.txt
   ```

2. **Verify Identity and Environment:**
   - Launch application and navigate to Settings > About.
   - Confirm version matches `0.6.0`.
   - Confirm build channel displays `Stable` (production) or `Staging` (staging).
   - Confirm active data location matches expected isolated path:
     - Production: `~/.local/share/io.github.millsydotdev.kinora/`
     - Staging: `~/.local/share/io.github.millsydotdev.kinora.staging/`

3. **Verify Updater Connectivity:**
   - Click "Check for updates" in Settings > About.
   - Confirm that update checks query the correct release endpoint and do not report false errors.
