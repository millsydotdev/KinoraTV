# Kinora DevOps & Platform Engineering Guide (v0.6.0)

This document establishes the authoritative standard for CI/CD automation, environment separation, container registry management, observability, supply chain security, and release operations for Kinora.

---

## 1. CI/CD Architecture Overview

Kinora employs four dedicated GitHub Actions workflows to govern the code lifecycle from pull request to production release:

```
+-----------------------------------------------------------------------------------+
| 1. Pull Request / Push to main: .github/workflows/ci.yml                         |
|    - Secret scanning (Gitleaks)                                                   |
|    - Quality gate (typecheck, Vitest, multi-timezone, Rust fmt/clippy/tests)      |
|    - Dependency audits (npm audit, cargo audit, cargo deny)                       |
|    - Docker build validation (web-dev, fixtures) + Trivy container scanning       |
|    - Linux packaging validation (artifact retention: 7 days)                      |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
| 2. Push to staging branch: .github/workflows/staging.yml                          |
|    - Quality gate execution                                                       |
|    - 4-Platform build matrix: Linux (x64), Windows (x64), macOS (arm64, x64)       |
|    - Minisign package signing                                                     |
|    - SHA-256 checksum consolidation (SHA256SUMS-staging.txt)                      |
|    - Pre-release publishing targeting staging-latest tag (retention: 14 days)     |
+-----------------------------------------------------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
| 3. Tag push (v*): .github/workflows/release.yml                                   |
|    - Version synchronization audit (0.6.0)                                        |
|    - 4-Platform native compilation                                                |
|    - Minisign and Apple Developer ID signing & notarization                       |
|    - CycloneDX SBOM generation (kinora-sbom.json)                                 |
|    - Updater manifest generation (latest.json)                                    |
|    - Manual approval gate via GitHub Environment 'production' (retention: 90 days)|
+-----------------------------------------------------------------------------------+
                                          |
+-----------------------------------------+-----------------------------------------+
| 4. Docker Infrastructure: .github/workflows/docker.yml                            |
|    - Builds ghcr.io/millsydotdev/kinora-fixtures and kinora-builder               |
|    - Multi-arch support via QEMU / Buildx                                         |
|    - Attestation: SLSA provenance and SBOM generation                             |
+-----------------------------------------------------------------------------------+
```

---

## 2. Environment Separation Standards

Kinora enforces complete physical and configuration separation across four operational environments:

| Dimension | Local Development | Automated CI / Test | Staging Integration | Production Distribution |
|---|---|---|---|---|
| **Bundle ID** | `io.github.millsydotdev.kinora` | `io.github.millsydotdev.kinora` | `io.github.millsydotdev.kinora.staging` | `io.github.millsydotdev.kinora` |
| **Product Name** | `Kinora Dev` | `Kinora CI` | `Kinora Staging` | `Kinora` |
| **Window Title** | `Kinora` | `Kinora` | `Kinora [Staging]` | `Kinora` |
| **Data Directory** | `~/.local/share/io.github.millsydotdev.kinora/` | Temporary isolated XDG sandbox | `~/.local/share/io.github.millsydotdev.kinora.staging/` | `~/.local/share/io.github.millsydotdev.kinora/` |
| **Build Mode (`__APP_ENV__`)**| `development` | `development` | `staging` | `production` |
| **Update Channel** | Disabled | Disabled | `staging-latest` | `latest` (stable) |
| **Network Destination**| Host loopback allowed with `loopback-fixtures` | Mock test server | Public endpoints only | Public endpoints only |

### Strict Isolation Guarantees
1. **Operating System Data Scoping:** Operating system application data directories are keyed directly by bundle identifier. Production data and staging data coexist safely on the same machine without cross-contamination.
2. **Zero In-Memory Credential Leakage:** Upstream stream URLs and authentication tokens are kept strictly in native Rust memory behind opaque 128-bit handles (`kstream://localhost/<handle>`). They are never persisted, rendered to DOM elements, or logged.

---

## 3. Pull Request Quality Gates

Every code change must satisfy all 5 automated quality gates before merging:

- **Gate 0: Version Consistency:** Validates that `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock` agree on SemVer 2.0.0 (`npm run version:check`).
- **Gate 1: TypeScript Static Typecheck:** Validates strict typing across all screens and components without compiler errors (`npm run typecheck`).
- **Gate 2: Vitest Frontend Test Suite:** 49 test suites (476 unit and integration tests) verifying screen layouts, store state machines, drawer overlays, theme contrast, and IPC boundary serialization (`npm test`).
- **Gate 3: Multi-Timezone Schedule Invariance:** Executes EPG calculations across `Europe/London`, `America/New_York`, and `Pacific/Auckland` to guarantee daylight-saving transitions never disrupt air times.
- **Gate 4: Rust Engine & Security Suite:** Rust code formatting (`cargo fmt --check`), strict clippy lints (`cargo clippy --all-targets -- -D warnings`), and 176 unit and integration tests (`npm run test:rust`).
- **Gate 5: Security & Supply Chain Audits:** NPM vulnerability audit, Cargo vulnerability audit (`cargo audit`), Cargo licensing policies (`cargo deny`), and third-party notices verification (`make audit`).

---

## 4. GitHub Container Registry (GHCR) Presence

### Evaluation and Strategy
Kinora is a native desktop application distributed as platform binaries (`.rpm`, `.deb`, `.AppImage`, `.dmg`, `.exe`). However, Kinora maintains container images in GitHub Container Registry (GHCR) for two operational needs:
1. **`kinora-builder` (`ghcr.io/millsydotdev/kinora-builder`):**
   Standardized Linux compilation environment with all WebKitGTK 4.1 development libraries, Rust stable, Node 22, and packaging utilities. Allows developers on any operating system to build native Linux packages reproducibly.
2. **`kinora-fixtures` (`ghcr.io/millsydotdev/kinora-fixtures`):**
   Zero-dependency mock streaming, XMLTV guide, and Xtream Codes API service for automated testing.

### Tagging & Provenance Convention
- **Versioned Immutable Tags:** `ghcr.io/millsydotdev/kinora-builder:0.6.0`
- **Commit Short SHAs:** `ghcr.io/millsydotdev/kinora-builder:<short-sha>`
- **Tracking Tags:** `ghcr.io/millsydotdev/kinora-builder:latest`
- **Supply Chain Attestation:** Generated with SLSA provenance and CycloneDX container SBOMs.

---

## 5. Observability and Diagnostics

Kinora adopts a lightweight, privacy-preserving operational approach:

### 1. In-App Operational Diagnostics (Settings > About)
Users and engineers can inspect runtime diagnostic information directly within the application:
- Product display name (`Kinora` vs `Kinora Staging`).
- Authoritative version number (`0.6.0`).
- Build profile (`release` vs `debug`).
- Environment indicator (`[Production]`, `[Staging]`, `[Development]`).
- Git commit hash identifier (first 7 characters).
- Active data directory path.
- Operating system platform and CPU architecture.
- WebKitGTK and Tauri runtime engine versions.

### 2. Error Reporting and Redaction
All network error messages generated by `src-tauri/src/fetch.rs` are scrubbed of:
- URL paths and query parameters.
- Authentication tokens and API keys.
- Server filesystem paths.
Error strings display sanitized destination hostnames and standard HTTP status codes only.

### 3. Service Health Checks
All supporting Docker services expose standard healthcheck endpoints:
- Fixtures server: `GET http://localhost:18765/health` returns HTTP 200 with JSON status.
- Web dev server: `GET http://localhost:5199/` returns HTTP 200 with HTML markup.

---

## 6. Security and Supply Chain Governance

1. **Principle of Least Privilege:**
   All GitHub Actions workflows explicitly declare granular permissions:
   ```yaml
   permissions:
     contents: read
   ```
   Elevated permissions (`contents: write` for releases, `packages: write` for GHCR) are scoped exclusively to publishing jobs.
2. **Secret Scanning:**
   Gitleaks runs automatically on all pull requests and commits to prevent credential leakage.
3. **Software Bill of Materials (SBOM):**
   Every staging and production build generates a CycloneDX 1.5 JSON SBOM (`node scripts/generate-sbom.cjs`) cataloguing all frontend and native dependencies.
4. **Cryptographic Signatures:**
   All release binaries are signed with Minisign (`TAURI_SIGNING_PRIVATE_KEY`) and validated against SHA-256 checksums (`SHA256SUMS.txt`).

---

## 7. Release Operations, Approval Gates & Rollback

### Production Approval Gate
The `.github/workflows/release.yml` publication job is bound to the `production` GitHub Environment. Releases cannot be published to GitHub Releases without explicit approval from designated repository owners.

### Emergency Rollback Procedures
If a critical regression is discovered in a production release:

1. **Client Updater Rollback (Immediate):**
   - In GitHub Releases, edit `latest.json` to point the download URLs and Minisign signatures to the previous stable release binaries.
   - The desktop updater will immediately cease prompting users to upgrade to the affected version.

2. **Emergency Patch Release:**
   - If an immediate code fix is required, branch from the release tag, apply the fix, increment the patch version (e.g. `0.6.1`), run `make gate`, and push the new release tag.

3. **Data Safety Guarantee:**
   - Kinora stores are backward-compatible and schema-versioned. Reverting the client binary does not delete or corrupt user source definitions or settings.
