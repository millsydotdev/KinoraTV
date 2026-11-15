# Kinora D11: Tauri Updater Validation & Security Guarantees

## 1. Overview

Kinora implements a native automatic update system powered by Tauri 2's updater protocol, enforced by native Rust security guarantees (`src-tauri/src/updater.rs`).

## 2. Endpoint Architecture

- **Canonical Endpoint**: `https://github.com/millsydotdev/KinoraTV/releases/latest/download/latest.json`
- **Network Policy**: Evaluated strictly through `Policy::updater()` in `fetch.rs`.
- **SSRF Immunity**: The updater client enforces HTTPS-only communication, rejects plain HTTP redirects, and strictly forbids loopback (127.0.0.1) or RFC1918 private IP destinations.
- **Payload Limits**: Manifests are bounded by maximum payload thresholds (256 KiB) to prevent memory exhaustion or malicious buffer overflows.

## 3. Cryptographic Signature Verification

- **Signature Format**: Minisign / Ed25519 public key verification.
- **Public Key Invariant**: Embedded in `tauri.conf.json` (`plugins.updater.pubkey`).
- **Private Key Isolation**: Private signing keys (`TAURI_SIGNING_PRIVATE_KEY`) reside exclusively in encrypted GitHub Actions repository secrets and are never committed to source control.
- **Fail-Closed Principle**: Unsigned assets, mismatched checksums, or tampered signatures are rejected immediately without execution.

## 4. Multi-Platform Manifest Alignment

The updater manifest parses platform asset targets across:
- `linux-x86_64` (AppImage)
- `windows-x86_64` (NSIS executable)
- `darwin-aarch64` (macOS Apple Silicon tarball)
- `darwin-x86_64` (macOS Intel tarball)

If an asset is unavailable for the host operating system, Kinora safely surfaces an honest `unsupportedPlatform` status rather than failing silently or crashing.
