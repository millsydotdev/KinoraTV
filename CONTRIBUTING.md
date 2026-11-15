# Contributing to Kinora

Thank you for your interest in contributing to Kinora.

Kinora is a desktop application combining a modern React 19 + TypeScript frontend with a high-performance, security-hardened Rust + Tauri 2 native shell.

Before contributing, please review these architectural rules and development guidelines.

---

## 1. Core Architecture Principles

1. **Strict Division of Responsibility:**
   - React (`src/`) owns all UI components, screens, routing, theme variables, and client-side view state.
   - Rust (`src-tauri/`) owns native OS integration, window management, atomic filesystem persistence, network fetching, and HLS stream proxying.
   - Never implement the same logic in both layers.
2. **IPC Boundary:**
   - `src/lib/native.ts` is the single bridge between React and Rust.
   - All Rust commands must be declared in `build.rs`, granted in `capabilities/default.json`, and mirrored in `src/lib/native.ts` with strict TypeScript types and runtime response validation.
3. **Network and Security Boundaries:**
   - Outbound network requests must only occur within Rust via `src-tauri/src/fetch.rs`.
   - Never fetch upstream stream URLs in the webview.
   - System proxies are disabled by design (`no_proxy()`) to enforce strict destination verification and block SSRF attacks against loopback or private networks.
   - Upstream URLs and tokens must never be logged, persisted in plaintext, or rendered in DOM elements.
4. **Media Handling:**
   - Playback is strictly HLS over HTTP(S) served through Kinora's native protocol (`kstream://localhost/<handle>`).
   - DRM and non-HLS streams are refused by design.
5. **Typography and Style Standard:**
   - Em-dashes are strictly prohibited across all code, comments, documentation, and UI text. Use hyphens (-), colons (:), or parentheses () instead.
   - All visual styling must use CSS design tokens declared in `src/styles/global.css`. Never introduce hard-coded hex colors into component CSS.

---

## 2. Setting Up Your Development Environment

### Prerequisites

- **Node.js:** Version 22.0.0 or later (with npm).
- **Rust Toolchain:** Version 1.90 or later (`rustup`).
- **Linux Dependencies (Fedora/RHEL):**
  ```bash
  sudo dnf install webkit2gtk4.1-devel openssl-devel curl file libappindicator-gtk3-devel librsvg2-devel gtk3-devel libsoup3-devel javascriptcoregtk4.1-devel rpm-build
  ```
- **Linux Dependencies (Ubuntu/Debian):**
  ```bash
  sudo apt-get install libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libssl-dev build-essential curl
  ```
- **Windows Prerequisites:**
  - Visual Studio C++ Build Tools with English language pack.
  - Microsoft Edge WebView2 runtime (pre-installed on Windows 10/11).
- **macOS Prerequisites:**
  - Xcode Command Line Tools (`xcode-select --install`).

### Installation and Development Commands

```bash
# Install frontend and build tool dependencies
npm install

# Run the frontend in browser development mode (http://localhost:5199)
npm run dev

# Run the full native desktop application in development mode
npm run tauri:dev

# Run TypeScript typechecking
npm run typecheck

# Run frontend Vitest test suite
npm test

# Run native Rust unit and integration tests
npm run test:rust

# Run complete local CI validation suite
bash scripts/ci-local.sh
```

---

## 3. Pull Request Guidelines

1. **Focused Changes:** Keep PRs targeted to a specific issue or feature. Avoid bundling unrelated refactorings.
2. **Test Coverage:** Every bug fix or new feature must be accompanied by relevant unit or integration tests (in Vitest or Cargo test).
3. **Zero Em-Dash Enforcement:** Verify that no em-dash characters exist in modified files.
4. **Clean Verification:** Ensure `bash scripts/ci-local.sh` passes completely before submitting.
5. **Conventional Commits:** Use clear commit messages following conventional standards: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.
