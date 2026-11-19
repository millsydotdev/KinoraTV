# 01 Repository and Runtime Facts

## 1. Repository Identity and Version Control State

- **Project Root Directory:** `/mnt/storage/TVMovie` (canonical development symlink target `/home/millsy/dev/TVMovie`)
  - **Source:** Git working directory environment inspection
  - **Location:** Repository root
  - **Evidence:** `git rev-parse --show-toplevel` outputs `/home/millsy/dev/TVMovie` (resolves to filesystem location `/mnt/storage/TVMovie`).
  - **Runtime verification:** Verified via shell command.
  - **Status:** Verified.

- **Current Active Branch:** `v0.5.1`
  - **Source:** Git HEAD reference
  - **Location:** `.git/HEAD` -> `refs/heads/v0.5.1`
  - **Evidence:** `git branch --show-current` outputs `v0.5.1`.
  - **Runtime verification:** Verified via shell command.
  - **Status:** Verified.

- **Current Commit Hash:** `996fd70be1f089551f7f47ebe088492de64e81fa`
  - **Source:** Git commit log
  - **Location:** Commit object `996fd70`
  - **Evidence:** `feat: implement personal artwork library, verified imdb sharing, and complete smart tv evidence`
  - **Runtime verification:** Verified via `git rev-parse HEAD`.
  - **Status:** Verified.

- **Previous Commit Hash:** `382f23fdbdc96b4c02238610fa85249ab91c0c0c`
  - **Source:** Git commit log parent reference
  - **Location:** Commit object `382f23f`
  - **Evidence:** `fix: correct real-user epg matching, tv shows crash, live player preview and data honesty`
  - **Runtime verification:** Verified via `git rev-parse HEAD~1`.
  - **Status:** Verified.

- **Working Tree Status:** Clean (zero uncommitted modifications, zero staged changes, zero untracked files)
  - **Source:** Git index and working tree
  - **Location:** Working tree status
  - **Evidence:** `git status` reports `nothing to commit, working tree clean`.
  - **Runtime verification:** Verified via `git status --porcelain`.
  - **Status:** Verified.

---

## 2. Application Identity and Core Metadata

- **Application Name (Package):** `kinora`
  - **Source:** `package.json`
  - **Location:** Line 2 (`"name": "kinora"`)
  - **Evidence:** Declared as `"name": "kinora"`.
  - **Status:** Verified.

- **Application Product Name (Desktop):** `Kinora`
  - **Source:** `src-tauri/tauri.conf.json`
  - **Location:** Line 3 (`"productName": "Kinora"`)
  - **Evidence:** Declared as `"productName": "Kinora"`.
  - **Status:** Verified.

- **Application Identifier:** `io.github.millsydotdev.kinora`
  - **Source:** `src-tauri/tauri.conf.json`
  - **Location:** Line 5 (`"identifier": "io.github.millsydotdev.kinora"`)
  - **Evidence:** Bundle identifier string in Tauri configuration.
  - **Status:** Verified.

- **Authoritative Version:** `0.5.1`
  - **Source:** `package.json` (line 3), `src-tauri/Cargo.toml` (line 3), `src/lib/native.ts` (line 6)
  - **Location:** `package.json:3`, `src-tauri/Cargo.toml:3`, `src/lib/native.ts:6`
  - **Evidence:**
    - `package.json`: `"version": "0.5.1"`
    - `src-tauri/Cargo.toml`: `version = "0.5.1"`
    - `src/lib/native.ts`: `export const AUTHORITATIVE_VERSION: string = packageInfo.version`
  - **Runtime verification:** Verified matching across all configuration files.
  - **Status:** Verified.

---

## 3. Technology Stack and Architecture Boundaries

- **Frontend Framework:** React 19 (`19.0.0-rc`) with TypeScript 5.8
  - **Source:** `package.json`
  - **Location:** `dependencies`: `"react": "^19.0.0-rc-66855b96-20241025"`, `"react-dom": "^19.0.0-rc-66855b96-20241025"`, `devDependencies`: `"typescript": "^5.8.0"`
  - **Status:** Verified.

- **Desktop Shell Engine:** Tauri 2 (`@tauri-apps/api": "^2.0.0`, `@tauri-apps/plugin-updater": "^2.0.0`)
  - **Source:** `package.json` and `src-tauri/Cargo.toml`
  - **Location:** `package.json` dependencies and `src-tauri/Cargo.toml` `[dependencies.tauri]` version 2
  - **Status:** Verified.

- **Frontend Build Tool:** Vite 8.3 (`vite: "^6.0.1"`, Rolldown compiler integration)
  - **Source:** `package.json` devDependencies and `vite.config.ts`
  - **Location:** `vite.config.ts` lines 1-40
  - **Evidence:** Configured with React plugin, port 5199, strict woff2 asset preservation (`assetsInlineLimit: 0` for `.woff2`).
  - **Status:** Verified.

- **Backend Runtime:** Rust 2021 edition
  - **Source:** `src-tauri/Cargo.toml`
  - **Location:** `[package] edition = "2021"`
  - **Status:** Verified.

---

## 4. Entry Points and Layout Tree

- **Frontend Bootstrap Entry Point:** `src/main.tsx`
  - **Source:** `src/main.tsx`
  - **Location:** Lines 1-13
  - **Evidence:**
    ```tsx
    import { StrictMode } from 'react'
    import { createRoot } from 'react-dom/client'
    import '@fontsource-variable/hanken-grotesk'
    import './styles/global.css'
    import { App } from './App'
    const root = document.getElementById('root')
    if (!root) throw new Error('Missing #root element')
    createRoot(root).render(<StrictMode><App /></StrictMode>)
    ```
  - **Status:** Verified.

- **Root Application & State Providers:** `src/App.tsx`
  - **Source:** `src/App.tsx`
  - **Location:** Lines 267-285
  - **Evidence:** Provider nesting order:
    1. `BrowserRouter` (React Router v6/v7)
    2. `ProfileProvider` (Active user profile, PIN protection, parental control)
    3. `StoreProvider` (Central application store: library, channels, sources, guides, preferences)
    4. `LocalMediaProvider` (Local directory indexing and media files)
    5. `NotificationProvider` (Toast and persistent notifications)
    6. `BackgroundTaskProvider` (Long-running background task registry)
    7. `ToastProvider` (Transient user feedback toasts)
    8. `Shell` (Desktop shell containing `Sidebar`, `main`, `AudioPlayerBar`, `CommandPalette`, `ShortcutsModal`, `WhatsNewModal`)
  - **Status:** Verified.

- **Backend Bootstrap Entry Point:** `src-tauri/src/main.rs`
  - **Source:** `src-tauri/src/main.rs`
  - **Location:** Lines 1-7
  - **Evidence:**
    ```rust
    #![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
    fn main() {
        kinora_lib::run();
    }
    ```
  - **Status:** Verified.

- **Backend Library Entry Point:** `src-tauri/src/lib.rs`
  - **Source:** `src-tauri/src/lib.rs`
  - **Location:** `pub fn run()` lines 795-928
  - **Evidence:** Registers:
    - Custom protocol handler: `kstream://localhost` (serving guarded HLS/DASH byte streams)
    - Plugin: `tauri_plugin_updater::Builder`
    - Invoke handler: 56 registered Tauri commands (lines 863-920)
  - **Status:** Verified.

---

## 5. Security Policies and Boundary Rules

- **Content Security Policy (CSP):**
  - **Source:** `src-tauri/tauri.conf.json`
  - **Location:** Lines 25-37
  - **Evidence:**
    - `default-src`: `'self'`
    - `script-src`: `'self'`
    - `style-src`: `'self'`
    - `img-src`: `'self' data:`
    - `font-src`: `'self'`
    - `connect-src`: `ipc: http://ipc.localhost kstream://localhost`
    - `media-src`: `blob:`
    - `object-src`: `'none'`
    - `base-uri`: `'self'`
    - `form-action`: `'none'`
  - **Status:** Verified.

- **Permissions and Capabilities:**
  - **Source:** `src-tauri/capabilities/default.json`
  - **Location:** Lines 1-7
  - **Evidence:** Explicitly grants 56 commands plus `updater:default`. No general filesystem, shell, HTTP, or dialog plugin capabilities are granted to the webview window.
  - **Status:** Verified.

- **Network Access Isolation:**
  - **Source:** `src-tauri/src/fetch.rs`
  - **Location:** Lines 1-500
  - **Evidence:**
    - Direct connection only (`no_proxy` enabled).
    - Guarded DNS resolver rejecting private IP ranges (RFC 1918, RFC 3927, RFC 4193, loopback 127.0.0.0/8).
    - Size-limited and time-limited request execution.
    - Error strings scrubbed of URL paths, query parameters, and user tokens.
  - **Status:** Verified.

- **Parental PIN Storage & Hash Standard:**
  - **Source:** `src-tauri/src/pin.rs` and `src/state/profiles.tsx`
  - **Location:** `src-tauri/src/pin.rs:1-150`
  - **Evidence:** PBKDF2-HMAC-SHA256 with 100,000 iterations and 16-byte cryptographically secure random salt. Plaintext PINs are never stored.
  - **Status:** Verified.

- **Typography Compliance:**
  - **Source:** Repo-wide standard in `AGENTS.md`
  - **Location:** `AGENTS.md` line 118
  - **Evidence:** Em-dashes are strictly prohibited across all code, documentation, comments, and UI strings.
  - **Runtime verification:** Verified 0 em-dash occurrences across all source and documentation files.
  - **Status:** Verified.
