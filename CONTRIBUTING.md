# Contributing to Kinora (v0.6.0)

Thank you for your interest in contributing to Kinora.

Kinora is a desktop entertainment platform combining a modern React 19 + TypeScript frontend with a high-performance, security-hardened Rust + Tauri 2 native shell.

Before contributing, please review these architectural rules, onboarding instructions, and development guidelines.

---

## 1. Core Architecture Principles

1. **Strict Division of Responsibility:**
   - React (`src/`) owns all UI components, screens, routing, theme variables, and client-side view state.
   - Rust (`src-tauri/`) owns native OS integration, window management, atomic filesystem persistence, network fetching, and HLS stream proxying.
   - Never implement the same logic in both layers.

2. **IPC Boundary Discipline:**
   - `src/lib/native.ts` is the single authoritative bridge between React and Rust.
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

## 2. Developer Quickstart and Onboarding

### Automated Pre-Flight Setup
To verify system prerequisites and set up your local environment in a single command:

```bash
make setup
# Or execute the setup script directly:
bash scripts/onboarding.sh
```

### Essential Developer Commands

| Task | Command | Description |
|---|---|---|
| **Full Native Desktop App** | `make dev` | Launches Tauri native desktop application with hot reloading |
| **Browser Web Mode** | `make dev-web` | Launches React web UI at `http://localhost:5199` |
| **Mock IPTV / EPG Fixtures** | `make docker-fixtures` | Starts local mock streaming fixture server on port 18765 |
| **Run Unit Tests** | `make test` | Executes frontend Vitest test suite |
| **Run Rust Engine Tests** | `make test-rust` | Executes Rust unit and integration tests |
| **Run Static Typecheck** | `make typecheck` | Validates TypeScript compiler without emitting files |
| **Run Master Quality Gate** | `make gate` | Executes complete 5-gate application validation pipeline |
| **Run Security Audits** | `make audit` | Runs NPM audit, Cargo audit, and Cargo deny policies |
| **Build Desktop Packages** | `make build` | Compiles production desktop packages (`.rpm`, `.deb`, `.AppImage`) |
| **Build Staging Packages** | `make build-staging` | Compiles isolated staging packages (`Kinora Staging`) |

---

## 3. Pull Request and Git Workflow

1. **Branching Strategy:**
   - Create a dedicated feature branch from `staging` (or `main` for hotfixes):
     ```bash
     git checkout staging
     git pull origin staging
     git checkout -b feature/stream-buffering
     ```
2. **Quality Gate Compliance:**
   - Every pull request must pass `make gate` and `make audit` locally before submission.
3. **Focused Commits:**
   - Use conventional commit messages: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `perf:`, `ci:`.
4. **Test Coverage:**
   - New features and bug fixes must include tests in Vitest (`src/screens/*.test.tsx`) or Cargo tests (`src-tauri/src/*.rs`).
5. **Zero Em-Dash Enforcement:**
   - Confirm that no em-dash or en-dash characters are introduced in code or documentation.
6. **Local Artefacts and Images:**
   - Keep temporary reports, debug screenshots, and artwork experiments inside `.local/` (ignored by Git). Follow the permanent asset rules in `DEVELOPMENT.md` when adding production icons, UI artwork, or README screenshots.
