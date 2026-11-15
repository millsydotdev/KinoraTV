# Kinora GitHub Release Automation and Updater Plan

**Programme:** Kinora Release Candidate (Gate D10)  
**Date:** 2026-11-15  
**Version:** 0.1.0 (Targeting 1.0.0-rc1)

This document specifies the continuous release pipeline, packaging automation, artifact verification, and automatic update delivery system for Kinora across Linux, Windows, and macOS.

---

## 1. Release Automation Overview

The release pipeline is codified in `.github/workflows/release.yml`. It activates upon:
1. Pushing a version tag matching `v*` (e.g. `v1.0.0-rc1`, `v1.0.0`).
2. Manual execution via `workflow_dispatch` (with an optional dry-run parameter for build validation without publishing).

### Matrix Architecture Targets

| Platform Key | Runner Environment | Target Triple | Built Artifacts |
| :--- | :--- | :--- | :--- |
| `linux-x64` | `ubuntu-24.04` | `x86_64-unknown-linux-gnu` | `.deb`, `.rpm`, `.AppImage` |
| `windows-x64` | `windows-latest` | `x86_64-pc-windows-msvc` | `.exe` (NSIS), `.msi` (WiX) |
| `macos-arm64` | `macos-14` (M1/M2) | `aarch64-apple-darwin` | `.dmg`, `.app` |
| `macos-x64` | `macos-13` (Intel) | `x86_64-apple-darwin` | `.dmg`, `.app` |

---

## 2. Integrity and Checksum Verification

Every platform build produces an autonomous checksum manifest:
- On Linux and macOS: `sha256sum <files> > SHA256SUMS-<platform>.txt`
- On Windows: `Get-FileHash -Algorithm SHA256` exported to `SHA256SUMS-<platform>.txt`

During the final consolidation phase:
1. All individual `SHA256SUMS-*.txt` files are concatenated into a single authoritative `SHA256SUMS.txt`.
2. The consolidated checksum file is published directly alongside the release artifacts.
3. Users and package managers can verify artifact integrity with:
   ```bash
   sha256sum -c SHA256SUMS.txt --ignore-missing
   ```

---

## 3. Automatic Updater Architecture

Kinora incorporates a dual-layer updater architecture:
1. **Application-Level Manifest Evaluation:**
   - Powered by `src-tauri/src/updater.rs`.
   - Fetches the official release manifest via `fetch::fetch_updater_manifest`.
   - Adheres strictly to Kinora network isolation guarantees: HTTPS only, no loopback or private SSRF, 10-second timeout, 64 KB size limit, and zero URL leakage in errors.
   - Evaluates semver differences (`is_newer`) and platform availability.
   - Surfaced directly in the UI under **Settings > About > Software updates**.
2. **Tauri Plugin Updater Distribution:**
   - Pre-configured in `src-tauri/tauri.conf.json` under `plugins.updater`.
   - Enforces Minisign cryptographic signature verification before allowing updates to be applied.

### Manifest Schema (`latest.json`)

The updater reads `https://github.com/millsydotdev/kinora/releases/latest/download/latest.json`:

```json
{
  "version": "1.0.0-rc1",
  "notes": "Kinora Release Candidate 1 with cross-platform support.",
  "pub_date": "2026-11-15T19:00:00Z",
  "platforms": {
    "linux-x86_64": {
      "signature": "<minisign-signature-base64>",
      "url": "https://github.com/millsydotdev/kinora/releases/download/v1.0.0-rc1/kinora_1.0.0-rc1_amd64.AppImage.tar.gz"
    },
    "windows-x86_64": {
      "signature": "<minisign-signature-base64>",
      "url": "https://github.com/millsydotdev/kinora/releases/download/v1.0.0-rc1/Kinora_1.0.0-rc1_x64-setup.nsis.zip"
    },
    "darwin-aarch64": {
      "signature": "<minisign-signature-base64>",
      "url": "https://github.com/millsydotdev/kinora/releases/download/v1.0.0-rc1/Kinora_1.0.0-rc1_aarch64.app.tar.gz"
    },
    "darwin-x86_64": {
      "signature": "<minisign-signature-base64>",
      "url": "https://github.com/millsydotdev/kinora/releases/download/v1.0.0-rc1/Kinora_1.0.0-rc1_x64.app.tar.gz"
    }
  }
}
```

---

## 4. Required Secrets and Credentials

The build pipeline strictly avoids hardcoding certificates or credentials. The following GitHub repository secrets must be populated prior to production publishing:

| Secret Name | Platform | Description |
| :--- | :--- | :--- |
| `TAURI_SIGNING_PRIVATE_KEY` | All | Minisign private key used to sign updater archive bundles |
| `TAURI_SIGNING_KEY_PASSWORD` | All | Password unlocking the private Minisign key |
| `APPLE_CERTIFICATE` | macOS | Base64-encoded Developer ID Application Certificate (`.p12`) |
| `APPLE_CERTIFICATE_PASSWORD` | macOS | Password for the Developer ID Certificate |
| `APPLE_SIGNING_IDENTITY` | macOS | Common name on the Apple certificate |
| `APPLE_ID` | macOS | Apple ID email used for notarization submission |
| `APPLE_PASSWORD` | macOS | App-specific password generated on appleid.apple.com |
| `APPLE_TEAM_ID` | macOS | 10-character Apple Developer Team ID |
| `WINDOWS_CERTIFICATE` | Windows | Base64-encoded Authenticode code-signing certificate (`.pfx`) |
| `WINDOWS_CERTIFICATE_PASSWORD` | Windows | Password for the Windows code-signing certificate |

---

## 5. Upgrade Lifecycle Verification Procedure

Before releasing a production update, the upgrade lifecycle must be verified against this eight-step procedure:

1. **Install Baseline:** Install previous release build (e.g. `0.1.0`) on test machine.
2. **Populate State:** Add at least one M3U playlist, configure an XMLTV guide, save a favorite channel, and set parental controls.
3. **Stage Test Release:** Deploy candidate release build (`1.0.0-rc1`) and updated `latest.json` to an isolated test endpoint.
4. **Trigger Update Check:** Open Kinora, navigate to Settings > About, and click "Check for updates".
5. **Verify Detection:** Confirm the UI displays the new version number, release date, and release notes without errors.
6. **Download and Signature Check:** Trigger the update; confirm signature matches public key and download completes.
7. **Apply and Restart:** Allow application restart; verify the new version string renders in Settings > About.
8. **Verify Persistence:** Confirm all previously imported playlists, XMLTV guides, playback bookmarks, and profile preferences remain intact with zero corruption.
