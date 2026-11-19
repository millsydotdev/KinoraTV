# Kinora Release Guide (v0.6.0)

This document specifies the authoritative release gate criteria, packaging matrices, signing standards, and distribution procedures for Kinora releases.

For the developer and staging workflows, see [DEVELOPMENT-AND-RELEASE-WORKFLOW.md](docs/DEVELOPMENT-AND-RELEASE-WORKFLOW.md) and [STAGING.md](STAGING.md).

---

## 1. Release Philosophy and Versioning

Kinora strictly follows [Semantic Versioning (SemVer 2.0.0)](https://semver.org/):
- **MAJOR (`X.0.0`)**: Incompatible API, architecture, or storage breaking changes.
- **MINOR (`0.X.0`)**: Backwards-compatible feature additions, layout redesigns, and new capabilities.
- **PATCH (`0.0.X`)**: Backwards-compatible bug fixes and security remediations.

The single authoritative source of truth for the project version is `package.json`. Version synchronization across `src-tauri/Cargo.toml` and documentation is maintained via:
```bash
node scripts/sync-version.cjs <new-version>
node scripts/validate-version.cjs
```

---

## 2. Release Gates

A release build must pass all automated quality gates before tag creation:

```
[ Gate 0: Version Check ] -> [ Gate 1: TypeScript ] -> [ Gate 2: Vitest 476 Tests ]
                                                                   |
[ Gate 5: Supply Chain ]  <- [ Gate 4: Rust Engine ] <- [ Gate 3: Multi-Timezone ]
```

1. **Gate 0: Version Consistency**
   - Validates that `package.json`, `Cargo.toml`, and `Cargo.lock` agree on the authoritative version.
   - Command: `npm run version:check`

2. **Gate 1: Static Typecheck**
   - Full TypeScript compilation with strict mode.
   - Command: `npm run typecheck`

3. **Gate 2: Vitest Application Suite**
   - 49 test files covering screens, UI components, themes, state persistence, and IPC boundaries.
   - Command: `npm test`

4. **Gate 3: Multi-Timezone Schedule Invariance**
   - Executes guide schedule tests across `Europe/London`, `America/New_York`, and `Pacific/Auckland`.
   - Guarantees daylight-saving transitions never disrupt programme air times or duration calculations.

5. **Gate 4: Rust Engine and Security Verification**
   - Rust formatting check (`cargo fmt --check`).
   - Clippy compiler lints with zero warnings (`cargo clippy --all-targets -- -D warnings`).
   - 176 native unit and integration tests covering M3U parsing, XMLTV validation, HLS rewriter, fetch security, and stream handles.
   - Command: `npm run test:rust`

6. **Gate 5: Supply Chain and Dependency Audit**
   - Dependencies vetted via `npm audit` and `cargo audit`.
   - Licensing compliance verified via `cargo deny check`.

Run the full gate suite locally with a single command:
```bash
npm run test:gate
```

---

## 3. Cross-Platform Packaging Matrix

Production packages are built for the following target architectures:

| Platform | Target Identifier | Package Formats | Notes |
|---|---|---|---|
| **Linux (x64)** | `x86_64-unknown-linux-gnu` | `.rpm`, `.deb`, `.AppImage` | WebKitGTK 4.1 runtime |
| **Windows (x64)** | `x86_64-pc-windows-msvc` | `.exe` (NSIS), `.msi` | WebView2 runtime |
| **macOS (Apple Silicon)** | `aarch64-apple-darwin` | `.dmg`, `.app` bundle | Hardened runtime, notarized |
| **macOS (Intel)** | `x86_64-apple-darwin` | `.dmg`, `.app` bundle | Hardened runtime, notarized |

---

## 4. Cryptographic Signing and Verification

1. **Tauri Updater Signatures:**
   - Every release archive (`.tar.gz`, `.zip`) is cryptographically signed using a Minisign private key (`TAURI_SIGNING_PRIVATE_KEY`).
   - Signature files (`.sig`) are validated against the public key embedded in `src-tauri/tauri.conf.json`.

2. **Checksum Manifest (`SHA256SUMS.txt`):**
   - Every release generates a consolidated SHA-256 checksum file covering all built packages.
   - Users can verify package integrity with `sha256sum -c SHA256SUMS.txt`.

3. **Updater Manifest (`latest.json`):**
   - Generated dynamically by `scripts/generate-updater-manifest.cjs`.
   - Contains version metadata, release notes, platform URLs, and Minisign signatures.

---

## 5. Production Release Procedure

1. Verify that the working tree is clean and all quality gates pass:
   ```bash
   npm run test:gate
   ```

2. Confirm that staging testing is approved and documented in `docs/RELEASE-READINESS.md`.

3. Create and push the release git tag:
   ```bash
   git tag -a v0.6.0 -m "Release v0.6.0"
   git push origin v0.6.0
   ```

4. Monitor the automated release pipeline in GitHub Actions (`.github/workflows/release.yml`):
   - Compiles native bundles across the multi-platform matrix.
   - Generates SHA-256 checksums and updater signatures.
   - Publishes draft/pre-release on GitHub Releases.

5. Obtain explicit owner approval before publishing the release publicly.

---

## 6. Rollback Procedures

If a critical flaw is discovered after a release:

1. **Updater Manifest Rollback:**
   - Revert `latest.json` in the release channel to point back to the previous stable release binaries.
   - In-app updaters will cease prompting users to install the affected version.

2. **Emergency Hotfix Release:**
   - If client-side code changes are required, increment the patch version (e.g. `0.6.1`).
   - Implement the fix, run `npm run test:gate`, and publish the new tag.

3. **Client Data Safety:**
   - Saved sources and guides are stored in versioned JSON formats (`version: 2` or `version: 3`).
   - The Rust engine does not destructively alter files during version downgrades.
