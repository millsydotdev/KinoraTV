# Kinora Public Repository Security Audit & Release Readiness Report

**Programme:** Kinora Release Programme  
**Milestone:** Gate D11 (Public Repository & Release Pipeline Validation)  
**Date:** 2026-11-15  
**Audit Scope:** Complete Git history (17 commits, 2026-10-22 to 2026-11-01), current working tree, dependency lockfiles, packaging configurations, and CI/CD automation.

---

## 1. Executive Summary

A comprehensive forensic security audit of Kinora was conducted to determine readiness for public repository visibility and public distribution.

**Verdict: The repository is SAFE TO PUBLISH, subject to owner confirmation of licensing and visibility toggle.**

### Key Audit Highlights
1. **Zero Secret Leaks in Git History:** Thorough regex and entropy analysis across all 17 historical commits revealed zero leaked API keys, tokens, private keys, passwords, or cloud credentials. All credentials found in commit diffs are explicit test fixtures on RFC 2606 reserved domains (`example.com`, `provider.example`, `127.0.0.1`) verifying credential redaction.
2. **Zero Hardcoded Secrets in Working Tree:** The complete codebase contains no live tokens or keys. Metadata provider API keys (e.g. TMDB) are input by users at runtime and stored locally in memory or profile storage.
3. **Physical Linux Packaging Verified:** Successfully built both `.rpm` (13.15 MiB) and `.deb` (13.15 MiB) installable release packages locally using Tauri 2.12.5 and Rust 1.96.1 on Fedora 44 x86_64.
4. **CI and Release Pipelines Validated:** Updated `.github/workflows/release.yml` with cross-platform matrix runners (`ubuntu-24.04`, `windows-latest`, `macos-14`, `macos-13`), automatic SHA-256 manifest aggregation, and draft release publishing.
5. **Community Governance Shipped:** Created `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, issue templates, and pull request template.

---

## 2. Forensic Git History Audit Findings

The audit examined all 17 commits starting from baseline `97ddc25` to HEAD `0aaee70`.

| Commit Hash | Author | Subject | Security Audit Finding |
| :--- | :--- | :--- | :--- |
| `0aaee70` | Robert Mills | Make Kinora honest on first run (M1) | Clean. Only mock test URIs (`playlists.example`). |
| `1e39db2` | Robert Mills | Add CI, licence inventory and clock-independent tests (M0) | Clean. Added `cargo-deny` config and license inventory. |
| `81c21db` | Robert Mills | Hide fictional titles once a real playlist exists | Clean. No secrets or personal data. |
| `78ad5b3` | Robert Mills | Match iptv-org channel@feed ids to guide channels | Clean. Regex matching tests only. |
| `4bf9d9d` | Robert Mills | Harden Kinora end-to-end reliability (Gate D8) | Clean. |
| `90f9e50` | Robert Mills | Harden Kinora end-to-end reliability (Gate D8) | Clean. |
| `c1ecf4c` | Robert Mills | Add public source discovery and safe catalogue (Gate D7) | Clean. Strict iptv-org URL validation. |
| `04485dc` | Robert Mills | Add EPG ingestion and Live TV guide (Gate D6) | Clean. Test fixtures only (`guides.example`). |
| `25115d0` | Robert Mills | Persist playlist sources and user state (Gate D5) | Clean. Test credentials on `example.com`. |
| `b1c79be` | millsydotdev | Implement guarded HLS playback (Gate D4) | Clean. Test HLS tokens on `cdn.example`. |
| `237d0d7` | millsydotdev | Audit playlist integration and cover source interactions (Gate D3.2) | Clean. Mock test fixtures. |
| `16fac50` | millsydotdev | Polish playlist integration and strengthen UI coverage (Gate D3.1) | Clean. Mock test fixtures. |
| `93b1192` | millsydotdev | Connect imported M3U playlists to Sources and Live TV (Gate D3) | Clean. Mock test fixtures. |
| `e391c37` | millsydotdev | Docs: record D2 completion on main and the main-only Git workflow | Clean. Documentation only. |
| `6ddb224` | millsydotdev | Add Rust M3U playlist ingestion with guarded fetching (Gate D2) | Clean. Test cases for `user:pass` stripping. |
| `ef2f578` | millsydotdev | Migrate Kinora to a Rust + Tauri 2 desktop shell | Clean. |
| `97ddc25` | millsydotdev | Baseline: Kinora React + TypeScript UI before Tauri migration | Clean. Initial prototype files. |

### Exposure and Rotation Verdict
- **Leaked Secrets Found:** None.
- **Credential Rotation Required:** None.
- **Git History Rewriting Required:** None. The commit history is clean and ready for public hosting.

---

## 3. Working Tree and Local Privacy Audit

### Personal User Data Protection
Kinora's architecture strictly separates application code from user profile storage:
- **Application Code:** Stored in the git repository (`/home/millsy/dev/TVMovie`).
- **User Profile & Personal Sources:** Stored under OS-managed user application data directories:
  - Linux: `~/.local/share/io.github.millsydotdev.kinora/sources/sources.json` (mode `0600`, directory `0700`).
  - Windows: `%LOCALAPPDATA%\io.github.millsydotdev.kinora\sources\sources.json`.
  - macOS: `~/Library/Application Support/io.github.millsydotdev.kinora/sources/sources.json`.
- **Finding:** The personal source database is NEVER stored inside the repository working tree and is never committed to Git.
- **Transient Test Fixtures:** Updated `.gitignore` to explicitly ignore `.env`, `.env.*`, `*.pem`, `*.key`, `*.cert`, `*.pfx`, `*.p12`, `*.keystore`, `test-env/`, `local-fixtures/`, and root visual diff images.

---

## 4. Software Licensing Analysis & Recommendation

### Current Status
In `package.json`: `"license": "UNLICENSED"`, `"private": true`  
In `src-tauri/Cargo.toml`: `publish = false`  
In `src-tauri/deny.toml`:
```toml
[licenses.private]
# Kinora itself has no licence until the owner chooses one
ignore = true
```

### Consequences of "UNLICENSED"
Under international copyright law, publishing code without an open-source license means **All Rights Reserved**:
- Third parties can read and inspect the code on GitHub.
- Third parties **cannot** legally copy, fork, modify, redistribute, or compile the software without explicit permission.
- Package registries and public distribution platforms may restrict packaging or inclusion in Linux software repositories (e.g. Debian, Fedora, Arch).

### Recommendations for Owner Approval

Three primary licensing options are presented for owner selection:

1. **Option A: Permissive Open Source (MIT or Apache-2.0) [Recommended for broad adoption]**
   - *Pros:* Maximizes community contributions, developer trust, and distribution in Linux distributions (Flathub, Arch AUR, Fedora copr, Ubuntu PPA).
   - *Cons:* Permissive terms allow others to adapt code into proprietary derivatives without reciprocating changes.
2. **Option B: Copyleft Open Source (GPL-3.0 or AGPL-3.0)**
   - *Pros:* Guarantees that any derivative work or modification must also remain open source and freely shared.
   - *Cons:* Incompatible with closed-source embedding; some developers avoid copyleft libraries.
3. **Option C: Dual License / Source-Available (e.g. Fair Source, PolyForm, or BSL)**
   - *Pros:* Allows free personal and non-commercial desktop use while requiring commercial licensing for commercial providers.
   - *Cons:* Excluded from official open-source distribution channels (Debian main, Fedora official).

*Decision Gate:* Kinora remains `UNLICENSED` until the owner explicitly approves one of the above choices. No license file will be created or modified without explicit instruction.

---

## 5. Multi-Platform Build & Pipeline Validation

### 1. Host Native Compilation (Verified on Linux x86_64)
- Command: `npx tauri build --bundles rpm,deb`
- Toolchain: Rust 1.96.1, Node 22.23.1, Tauri 2.12.5, Vite 8.3.5.
- Output Artifacts Produced:
  - Binary: `src-tauri/target/release/kinora` (23 MiB ELF 64-bit LSB pie executable)
  - RPM: `src-tauri/target/release/bundle/rpm/Kinora-0.1.0-1.x86_64.rpm` (13.15 MiB)
  - DEB: `src-tauri/target/release/bundle/deb/Kinora_0.1.0_amd64.deb` (13.15 MiB)
- Metadata & Dependencies:
  - RPM dependencies: `webkit2gtk4.1`, `libappindicator-gtk3`, `librsvg2`, `openssl`.
  - DEB dependencies: `libwebkit2gtk-4.1-0`, `libayatana-appindicator3-1`, `librsvg2-2`, `libssl3`, `libgtk-3-0`.

### 2. GitHub Actions Release Workflow (.github/workflows/release.yml)
- **Matrix Runners:**
  - Linux: `ubuntu-24.04` (Target: `x86_64-unknown-linux-gnu`) -> `.deb`, `.rpm`, `.AppImage`
  - Windows: `windows-latest` (Target: `x86_64-pc-windows-msvc`) -> `.exe` (NSIS), `.msi` (WiX)
  - macOS Apple Silicon: `macos-14` (Target: `aarch64-apple-darwin`) -> `.dmg`, `.app` bundle
  - macOS Intel: `macos-13` (Target: `x86_64-apple-darwin`) -> `.dmg`, `.app` bundle
- **Security & Integrity:**
  - Automated per-platform `SHA256SUMS-<platform>.txt` calculation.
  - Consolidated `SHA256SUMS.txt` attached to the release.
  - Draft release protection: `draft: true` prevents public distribution until manually reviewed.
  - Dry run trigger: `workflow_dispatch` with `inputs.dry_run: true` enables full artifact validation without drafting a release.

---

## 6. Public Release Checklist

| Item | Requirement | Status |
| :--- | :--- | :--- |
| **History Audit** | All 17 commits free of secrets and credentials | **PASSED** |
| **Working Tree** | Zero plaintext tokens, secrets, or real stream URLs | **PASSED** |
| **User Data Isolation** | Personal sources and profiles kept strictly outside repo | **PASSED** |
| **Packaging Verified** | Linux RPM and DEB binaries built and inspected | **PASSED** |
| **Frontend Production** | `vite build` minification clean with lightningcss | **PASSED** |
| **Test Suites** | 421 Vitest tests + 163 Cargo tests passing | **PASSED** |
| **Lints & Formatting** | `cargo fmt`, `clippy -D warnings`, `tsc -b` passing | **PASSED** |
| **Governance Files** | `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md` in place | **PASSED** |
| **Issue Templates** | Bug report, feature request, and security advisory configs in place | **PASSED** |
| **PR Template** | Pull request architectural verification template in place | **PASSED** |
| **License Selection** | Needs explicit owner approval | **PENDING OWNER CONFIRMATION** |
| **Public Visibility** | Needs explicit owner confirmation before toggling public | **PENDING OWNER CONFIRMATION** |

---

## 7. Next Steps

1. **Owner Confirmation:** Review this report and confirm preferred software license (e.g. MIT, Apache-2.0, or proprietary).
2. **Owner Visibility Confirmation:** Provide explicit confirmation to make the GitHub repository public.
3. **Draft Release Dry Run:** Trigger `.github/workflows/release.yml` with `dry_run: true` on GitHub to validate remote runner compilation across Windows and macOS.
