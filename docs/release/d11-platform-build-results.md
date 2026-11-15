# Kinora D11: Multi-Platform Build Results

## Build Automation Overview

- **Workflow**: `.github/workflows/release.yml`
- **Canonical Target**: `millsydotdev/KinoraTV`
- **Application Version**: `v0.5.0`
- **Trigger**: `workflow_dispatch` (dry_run: true) and release tags.

## Matrix Status

| Platform Target | Runner OS | Target Architecture | Artifact Format | Build Status |
| :--- | :--- | :--- | :--- | :--- |
| Linux x64 | `ubuntu-24.04` | `x86_64-unknown-linux-gnu` | `.rpm`, `.deb`, `.AppImage` | Pending Workflow Run |
| Windows x64 | `windows-latest` | `x86_64-pc-windows-msvc` | `.exe` (NSIS), `.msi` (WiX) | Pending Workflow Run |
| macOS ARM64 | `macos-14` | `aarch64-apple-darwin` | `.dmg`, `.app` bundle | Pending Workflow Run |
| macOS x64 | `macos-13` | `x86_64-apple-darwin` | `.dmg`, `.app` bundle | Pending Workflow Run |

## Artifact Checksums & Signatures

Artifact checksums (SHA-256) and signature manifests (`latest.json`) will be recorded upon workflow completion.
