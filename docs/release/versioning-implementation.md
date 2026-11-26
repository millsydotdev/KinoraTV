# KinoraTV Centralised Versioning System and Application-Wide Synchronisation

**Date:** 2026-11-16  
**Status:** Complete, Verified, and Production-Ready  
**Current Authoritative Version:** `0.5.0`  
**Git Branch:** `main`

---

## 1. Executive Summary

KinoraTV now employs a robust, centralised Semantic Versioning (SemVer 2.0.0) architecture. A single authoritative version number defined in `package.json` governs the entire project. All downstream consumers (the React frontend, Vite build definitions, native Tauri 2 desktop shell, Rust Cargo package metadata, Windows/macOS/Linux installers, GitHub Actions release workflows, and the signed Tauri updater manifest) derive their version strictly and automatically from this single source of truth.

Any version drift or mismatch across metadata files, build artifacts, or git tags immediately fails the build and CI quality gates.

---

## 2. The Single Authoritative Version Source

- **Location:** `package.json` at repository root (`/package.json`)
- **Field:** `"version": "0.5.0"`
- **Standard:** Semantic Versioning 2.0.0 (`MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]`)

Tauri 2 officially supports dynamic inheritance of the package version via `"version": "../package.json"` in `src-tauri/tauri.conf.json`. Cargo requires a static literal in `src-tauri/Cargo.toml`, which is synchronized automatically via `scripts/sync-version.cjs` and checked at compile time by a dedicated Rust unit test (`cargo_version_matches_package_json` in `src-tauri/src/lib.rs`).

---

## 3. Complete Inventory of Version Consumers and Propagation Flow

Every application layer receives the authoritative version without manual duplication:

| Consumer Layer | File / Location | Propagation Mechanism |
| :--- | :--- | :--- |
| **Vite Bundler** | `vite.config.ts` | Imports `package.json` with JSON module attributes; injects `__APP_VERSION__` as a global compile-time constant. |
| **TypeScript Definitions** | `src/vite-env.d.ts` | Declares `declare const __APP_VERSION__: string`. |
| **React Frontend Bridge** | `src/lib/native.ts` | Exports `AUTHORITATIVE_VERSION` (direct import) and `APP_VERSION` (global fallback); parses channels via `getVersionChannel()`. |
| **Settings UI** | `src/screens/Settings.tsx` | Displays dynamic version, platform, architecture, release channel, and up-to-date notifications. |
| **Application Sidebar** | `src/components/Sidebar.tsx` | Subtle `v0.5.0` tag in sidebar footer for expanded and collapsed desktop states. |
| **What's New Modal** | `src/components/WhatsNewModal.tsx` | Displays dynamic version in header (`What's New in v0.5.0`). |
| **Setup Screen** | `src/screens/Setup.tsx` | Derives version and attribution dynamically from `APP_VERSION`. |
| **Tauri Core Configuration** | `src-tauri/tauri.conf.json` | Configured with `"version": "../package.json"`. |
| **Rust Package Manifest** | `src-tauri/Cargo.toml` | Synchronized via `scripts/sync-version.cjs`; verified by unit test `cargo_version_matches_package_json`. |
| **Native IPC Interface** | `src-tauri/src/lib.rs` | Tauri command `app_info` returns `app.package_info().version`. |
| **Native Updater Engine** | `src-tauri/src/updater.rs` | Implements SemVer 2.0.0 parsing (`parse_semver_full`), precedence comparison (`is_newer`), and channel isolation (`is_channel_compatible`). |
| **Release Artifact Renaming** | `.github/workflows/release.yml` | Derives `VERSION` via `node -p "require('./package.json').version"` for macOS bundles, tarballs, and signatures. |
| **Updater Manifest Generator** | `scripts/generate-updater-manifest.cjs` | Reads `package.json` to generate `latest.json` with dynamic URLs and signatures. |
| **GitHub Release Publication** | `.github/workflows/release.yml` | Evaluates release title (`Kinora v${VERSION}`) and sets `prerelease` flag dynamically. |

---

## 4. Semantic Versioning and Channel Rules

Kinora adheres strictly to Semantic Versioning 2.0.0:

```
MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]
```

### 4.1 When to Increment Versions

- **MAJOR (e.g. 1.0.0 -> 2.0.0):** Incompatible API changes, major architectural redesigns, or breaking profile/database migrations.
- **MINOR (e.g. 0.5.0 -> 0.6.0):** New backwards-compatible features, new content sources, major UI screens, or capabilities.
- **PATCH (e.g. 0.5.0 -> 0.5.1):** Backwards-compatible bug fixes, security patches, performance optimisations, and translation corrections.

### 4.2 Release Channels and Identification

Channels are derived dynamically using `getVersionChannel(version, profile)` in TypeScript and `version_channel(version, profile)` in Rust:

| Channel Identifier | Version String Pattern / Environment | Target Audience |
| :--- | :--- | :--- |
| `development` | Debug build (`cfg!(debug_assertions)` or `profile === 'debug'`), or `-dev` suffix | Developers running locally via `npm run tauri:dev` |
| `alpha` | Version contains `-alpha` (e.g. `1.0.0-alpha.1`) | Internal testers and early previewers |
| `beta` | Version contains `-beta` (e.g. `1.0.0-beta.2`) | Public beta testers |
| `release-candidate` | Version contains `-rc` (e.g. `1.0.0-rc.1`) | Staging and pre-release validation |
| `stable` | Clean SemVer (e.g. `0.5.0`, `1.0.0`) in release build | Production desktop users |

### 4.3 Channel Isolation and Security

The native updater engine (`src-tauri/src/updater.rs`) enforces strict channel separation:
- **Stable protection:** Users on a stable build (`0.5.0`) will **never** receive a pre-release update (e.g. `0.6.0-rc.1`), even if the manifest offers a higher version number.
- **Pre-release progression:** Users running a pre-release build (e.g. `1.0.0-rc.1`) receive newer release candidates (`1.0.0-rc.2`) as well as the final stable release (`1.0.0`).
- **SemVer precedence:** Normal releases have higher precedence than pre-releases of the same version (`1.0.0 > 1.0.0-rc.1`). Numeric identifier comparison ensures `1.0.0-beta.11 > 1.0.0-beta.2`.

---

## 5. Automated Tooling and Workflows

### 5.1 Validation Script (`scripts/validate-version.cjs`)

Run manually via `npm run version:check`. Automatically runs in CI and `scripts/quality-gate.sh`.

It validates:
1. `package.json` contains a valid SemVer 2.0.0 string.
2. `src-tauri/Cargo.toml` `[package].version` strictly matches `package.json`.
3. `src-tauri/tauri.conf.json` `"version"` points to `"../package.json"`.
4. `package-lock.json` matches `package.json`.
5. `scripts/generate-updater-manifest.cjs` has no hardcoded version strings.
6. When triggered by a git tag (e.g. in GitHub Actions release workflow), the tag name `v${VERSION}` matches `package.json` version. If there is any mismatch, the script exits with code 1.

### 5.2 Synchronization Script (`scripts/sync-version.cjs`)

Run via `npm run version:sync` or `npm run version:sync <new_version>`.

Functions:
- Updates `package.json`, `package-lock.json`, and `src-tauri/Cargo.toml`.
- Confirms `tauri.conf.json` pointer integrity.
- Automatically triggers `validate-version.cjs` to verify that all targets are synchronized.

---

## 6. Release Manager Step-by-Step Guide

To release a new version of KinoraTV:

### Step 1: Bump and Synchronize Version
```bash
# Example for a new release candidate:
npm run version:sync 0.6.0-rc.1

# Example for a stable release:
npm run version:sync 0.6.0
```

### Step 2: Run Quality Gates Locally
```bash
npm run version:check
npm run typecheck
npm test
npm run test:rust
bash scripts/quality-gate.sh
```

### Step 3: Commit to Main
All changes must be committed directly to `main`:
```bash
git add package.json package-lock.json src-tauri/Cargo.toml
git commit -m "chore(release): bump authoritative version to 0.6.0"
```

### Step 4: Tag and Push
```bash
git tag v0.6.0
git push origin main
git push origin v0.6.0
```

GitHub Actions will execute `.github/workflows/release.yml`, validate the git tag against `package.json`, build all platform targets, generate `latest.json`, and publish the release.

---

## 7. Verification Evidence

### 7.1 Compile-Time Rust Assertion
```bash
$ cargo test --manifest-path src-tauri/Cargo.toml cargo_version_matches_package_json
running 1 test
test tests::cargo_version_matches_package_json ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 169 filtered out; finished in 0.18s
```

### 7.2 Native Updater SemVer and Channel Tests
```bash
$ cargo test --manifest-path src-tauri/Cargo.toml updater
running 9 tests
test updater::tests::classifies_version_channels_accurately ... ok
test updater::tests::enforces_channel_compatibility_rules ... ok
test updater::tests::parses_and_compares_semver_accurately ... ok
test updater::tests::detects_unsupported_platform_when_missing_from_manifest ... ok
test updater::tests::evaluates_semver_precedence_rules ... ok
test updater::tests::evaluates_update_available_with_platform_match ... ok
test updater::tests::evaluates_up_to_date_when_equal_or_older ... ok
test updater::tests::parses_semver_full_with_prerelease_and_build_metadata ... ok
test updater::tests::stable_install_ignores_newer_prerelease_manifest ... ok
test result: ok. 9 passed; 0 failed; 0 ignored; 0 measured; 161 filtered out; finished in 0.00s
```

### 7.3 Frontend Versioning Unit Tests
```bash
$ npx vitest run src/lib/versioning.test.ts
 ✓ src/lib/versioning.test.ts (4 tests) 5ms
   ✓ authoritative version configuration
     ✓ exports valid SemVer version matching package.json
     ✓ correctly identifies release channels
     ✓ formats channel names for user-facing UI
     ✓ classifies debug build profile as development
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

### 7.4 Version Validation Gate Failure on Simulated Tag Mismatch
```bash
$ GITHUB_REF_NAME=v0.4.0 node scripts/validate-version.cjs
[VERSION CHECK] Authoritative version from package.json: 0.5.0
[VERSION ERROR] CI Git Tag mismatch! Triggered tag is "v0.4.0" (version "0.4.0"), but authoritative package.json version is "0.5.0".
Release pipelines must only run against tags exactly matching package.json.
(exited with code 1)
```

### 7.5 Version Validation Gate Success on Matching Tag
```bash
$ GITHUB_REF_NAME=v0.5.0 node scripts/validate-version.cjs
[VERSION CHECK] Authoritative version from package.json: 0.5.0
[VERSION CHECK] CI Git Tag "v0.5.0" matches authoritative version "0.5.0".
[VERSION OK] All version checks passed. Authoritative version: 0.5.0
(exited with code 0)
```
