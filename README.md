# Kinora

A TV, movie and series app: a React + TypeScript interface running inside a Rust (Tauri 2)
desktop shell.

**Status:** UI phase. Every screen works against fictional demonstration data. There is no real
source discovery, playlist ingestion, stream validation, guide import or playback yet; those wait
for the owner's approval.

## Architecture

```
React 19 + TypeScript (src/)          Rust + Tauri 2 (src-tauri/)
  screens, routing, theme,   ── IPC ──▶  native shell: window, startup,
  demo data, local prefs     invoke()    errors, `app_info` command
  built by Vite into dist/  ◀── JSON ──  (serde, validated on arrival)
```

- **React** (`src/`): all UI, navigation, forms, theme controls and demo state. The UI also runs
  in an ordinary browser for development and tests.
- **Rust** (`src-tauri/`): the native application. It loads the Vite dev server in development and
  the built `dist/` in release, and owns anything native. Today that is only `app_info` (version,
  build profile, platform), shown in Settings › About.
- **IPC boundary**: `src/lib/native.ts` is the only place React calls Rust. It mirrors the Rust
  `AppInfo` struct, validates every response before use, and returns `null` outside Tauri.
- **Security**: each app command is deny-by-default (`build.rs`). `capabilities/default.json` grants
  the main window only `allow-app-info`. No filesystem, shell, HTTP, dialog or other plugins. A strict
  Content Security Policy is set in `tauri.conf.json`. Developer tools exist only in debug builds.
- **Webview compatibility fix**: the release build inlined a small font subset as a `data:` URL,
  which the CSP blocked. `vite.config.ts` now emits `.woff2` fonts as files rather than allowing
  `data:` fonts.

## Prerequisites

- Node.js 22+ and npm
- Rust 1.90+ (`rustup`)
- Linux (Fedora): `sudo dnf install webkit2gtk4.1-devel openssl-devel curl file libappindicator-gtk3-devel librsvg2-devel gtk3-devel libsoup3-devel javascriptcoregtk4.1-devel`
- Building the `.rpm` bundle also needs `rpm-build`. Other platforms: see https://v2.tauri.app/start/prerequisites/

## Commands

```bash
npm install            # frontend dependencies + pinned Tauri CLI/API (2.12.4)
npm run dev            # React UI only, in a browser: http://localhost:5199
npm run tauri:dev      # native app in development (starts Vite, opens the Tauri window)
npm test               # frontend tests (Vitest)
npm run test:rust      # Rust tests
npm run typecheck      # TypeScript
npm run build          # frontend production build into dist/
npm run tauri:build    # native release binary + .rpm bundle
```

Release output: `src-tauri/target/release/kinora` and `src-tauri/target/release/bundle/rpm/`.

The native app keeps its own local storage, separate from the browser at localhost:5199, so it starts
with the default demo library and appearance settings.
