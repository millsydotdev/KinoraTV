# Kinora Developer Guide (v0.6.0)

Welcome to Kinora development.

Kinora is a desktop media platform built using React 19, TypeScript, and CSS design tokens inside a security-hardened Rust + Tauri 2 native desktop shell.

This guide provides everything needed to onboard, configure, develop, test, and package Kinora efficiently.

---

## 1. Quickstart Onboarding

Get a fully working local development environment in two steps:

```bash
# 1. Clone the repository
git clone https://github.com/millsydotdev/KinoraTV.git
cd KinoraTV

# 2. Run automated setup (validates toolchains, installs dependencies, creates .env)
make setup
```

The setup script checks Node.js 22+, Rust, system desktop libraries, installs NPM dependencies via `npm ci`, sets up `.env` from `.env.example`, and audits Docker readiness.

---

## 2. Prerequisites

### Supported Platforms
- **Linux:** Ubuntu 22.04 / 24.04, Fedora 39 / 40+, Debian 12+, Arch Linux.
- **macOS:** macOS 13 (Ventura), macOS 14 (Sonoma), macOS 15+ (Apple Silicon and Intel).
- **Windows:** Windows 10 / 11 (64-bit) with WebView2 runtime.

### Toolchains
- **Node.js:** Version 22 LTS or newer (with npm 10+).
- **Rust Toolchain:** Version 1.90+ stable (`rustup default stable`).
- **Docker & Docker Compose:** Version 24+ (optional for native host builds; required for containerized services).

### Operating System Build Libraries

#### Ubuntu / Debian
```bash
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev patchelf rpm build-essential curl
```

#### Fedora / RHEL
```bash
sudo dnf install -y webkit2gtk4.1-devel libayatana-appindicator-gtk3-devel librsvg2-devel openssl-devel patchelf rpm-build gcc-c++ make
```

#### macOS
```bash
xcode-select --install
```

#### Windows
Install Visual Studio 2022 C++ Build Tools with the "Desktop development with C++" workload.

---

## 3. Environment Configuration (`.env`)

Kinora uses `.env` for local configuration overrides. Copy `.env.example`:

```bash
cp .env.example .env
```

| Key | Default | Description |
|---|---|---|
| `VITE_TMDB_API_KEY` | *(empty)* | Optional TMDB API key for metadata enrichment |
| `WEB_PORT` | `5199` | Local host port for React frontend server |
| `FIXTURE_PORT` | `18765` | Local host port for mock streaming and EPG server |
| `APP_ENV` | `development` | Target runtime mode (`development`, `staging`, `production`) |

> **Security Rule:** Never commit `.env` or personal API tokens to git.

---

## 4. Running the Application

### Option A: Full Native Desktop Application (Recommended)
Runs the real Tauri desktop window with native capabilities, Rust fetch engine, HLS stream proxy, and hot-reloading:

```bash
make dev
# Equivalent to: npm run tauri:dev
```

### Option B: Browser Web Mode (Rapid UI Prototyping)
Runs only the React frontend in your web browser with mock native bridges:

```bash
make dev-web
# Equivalent to: npm run dev
# Open in browser: http://localhost:5199
```

### Option C: Docker Supporting Services
Start the local mock streaming, EPG, and Xtream Codes API server:

```bash
make docker-fixtures
# Mock server runs on http://localhost:18765
# Healthcheck: http://localhost:18765/health
```

To start both the web development container and fixture server together:
```bash
make docker-up
# Stop with:
make docker-down
```

---

## 5. Testing and Quality Gates

Kinora requires all tests and quality checks to pass before pull requests are approved.

```bash
# 1. Run frontend unit and component tests (Vitest)
make test
# Equivalent to: npm test

# 2. Run native Rust unit and integration tests (Cargo)
make test-rust
# Equivalent to: npm run test:rust

# 3. Run static TypeScript compilation check
make typecheck
# Equivalent to: npm run typecheck

# 4. Run the complete 5-gate application quality gate
make gate
# Equivalent to: bash scripts/quality-gate.sh

# 5. Run security, vulnerability, and license audits
make audit
# Equivalent to: npm audit, cargo audit, cargo deny check
```

---

## 6. Building Desktop Packages

Build native distribution bundles directly on your workstation:

```bash
# 1. Build production desktop release (RPM, DEB, AppImage)
make build
# Equivalent to: npm run tauri:build

# 2. Build staging desktop release (isolated data dir: ~/.local/share/io.github.millsydotdev.kinora.staging/)
make build-staging
# Equivalent to: npm run tauri:build:staging

# 3. Build unsigned local package (no code signing keys required)
make build-unsigned
# Equivalent to: npm run tauri:build -- --no-sign
```

Compiled packages are located in `src-tauri/target/release/bundle/`.

---

## 7. Development Guidelines and Code Style

1. **Responsibility Boundary:**
   - React owns UI, routing, and client view state.
   - Rust (`src-tauri/`) owns native OS, stream proxying, and atomic filesystem storage.
   - Never duplicate logic across both layers.
2. **IPC Authoritative Bridge:**
   - All communication between frontend and native shell flows strictly through `src/lib/native.ts`.
3. **Network Security:**
   - Outbound HTTP requests must only occur within Rust in `src-tauri/src/fetch.rs`.
   - Upstream stream URLs and authentication tokens are kept strictly in native memory behind opaque 128-bit handles (`kstream://localhost/<handle>`).
4. **Zero Em-Dash Rule:**
   - Em-dashes are strictly prohibited across all code, comments, documentation, and UI text. Use hyphens (-), colons (:), or parentheses () instead.
5. **Theme Tokens:**
   - Colors must use theme CSS variables declared in `src/styles/global.css`. Never hard-code hex colors in component CSS.

---

## 8. Local Development Artefacts and Image Asset Policy

Kinora separates permanent tracked assets from local development reports, screenshots, mockups, and artwork experiments.

### Local-Only Workspace (Ignored by Git and Docker)

Store local development artefacts under `.local/` so they remain available on disk without cluttering Git status or Docker build contexts:

- `.local/reports/` - Local audit reports, investigation summaries, test logs, and one-off checklists.
- `.local/screenshots/` - Temporary UI captures, visual inspection screenshots, and comparison images.
- `.local/images/` - Experimental artwork, AI-generated concepts, logo mockups, and design references.
- `.local/evidence/` - Packaged local evidence bundles and archives.
- `.local/scripts/` - One-off local capture or inspection scripts.

Top-level `/reports/`, `/screenshots/`, `/tmp/`, `/coverage/`, `/playwright-report/`, and `/test-results/` directories are also ignored, along with clearly temporary image naming patterns (`*.tmp.*`, `*.scratch.*`, `*.debug.*`, `screenshot-*.png`, `capture-*.png`, `debug-*.png`, `tmp-*.png`, `mockup-*.png`, `mockup-*.jpg`, `concept-*.png`, `concept-*.svg`, `*-comparison.png`, `*-fullpage.png`, `*-screenshot.png`).

Blanket rules such as `*.png`, `*.jpg`, `*.webp`, or `*.svg` are intentionally avoided so legitimate application artwork is never hidden.

### Adding a Permanent Image Asset to Kinora

When an image is ready to become a permanent tracked asset rather than a local experiment:

1. Place it in the appropriate permanent asset directory:
   - Application icons and installer graphics: `src-tauri/icons/` and `src-tauri/app-icon.svg`
   - Web and UI static assets (badges, favicon): `public/assets/` and `public/favicon.svg`
   - Genre and runtime artwork referenced by the app: `public/art/genres/` or `public/art/`
   - Deliberately maintained README and documentation screenshots: `docs/images/` and `docs/images/screenshots/`
2. Use a clean, descriptive filename that does not match a temporary pattern (avoid prefixes such as `tmp-`, `debug-`, `screenshot-`, `concept-`, or `mockup-`).
3. Reference the asset explicitly in application code, configuration, or documentation (and add/update tests such as `src/data/genre-art.test.ts` where applicable).
4. Verify Git tracks the file cleanly with `git status` and `git check-ignore -v <path>` (confirming it is not ignored) before committing.

---

## 9. Common Troubleshooting

### Port 5199 or 18765 in Use
If the port is already bound by an existing process:
```bash
# Check what is using port 5199:
ss -tulpn | grep 5199
# Or change the port in .env:
WEB_PORT=5200
```

### Missing Native WebKitGTK Libraries
If you encounter `pkg-config` or `webkit2gtk-4.1` errors on Linux:
```bash
# On Ubuntu/Debian:
sudo apt-get install -y libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev
# On Fedora:
sudo dnf install -y webkit2gtk4.1-devel libayatana-appindicator-gtk3-devel librsvg2-devel openssl-devel
```

### Staging and Production Data Isolation
To verify that staging builds do not touch your real production data:
```bash
ls -la ~/.local/share/io.github.millsydotdev.kinora/         # Production data
ls -la ~/.local/share/io.github.millsydotdev.kinora.staging/ # Staging data
```
Kinora keeps these directories completely isolated by bundle identifier.
