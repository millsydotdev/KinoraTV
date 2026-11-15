# Kinora D11: Public Release Candidate Checklist

## Phase Checklist

- [x] **Licence Creation**: Kinora Proprietary Source-Available Licence created (`LICENSE`).
- [x] **Legal Documentation**: Authored `docs/legal/kinora-licensing-and-ip-protection.md`.
- [x] **Creator Attribution**: Credited millsydotdev in Settings > About, `README.md`, and `docs/about/creator-attribution.md`.
- [x] **Version Synchronisation**: Unified to `0.5.0` across `package.json`, `Cargo.toml`, `tauri.conf.json`, `updater.rs`, and `CHANGELOG.md`.
- [x] **What's New Experience**: Built `WhatsNewModal.tsx` and persistent version tracking.
- [x] **Security Review**: Zero secrets detected across full Git history and working tree.
- [x] **Quality Gates**: All 421 frontend Vitest tests and 163 native Rust tests passing.
- [x] **Zero Em-Dash Standard**: Zero em-dashes verified across all code and documentation.
- [ ] **Clean Commit**: Staged release files committed to `main`.
- [ ] **Canonical Remote Creation**: Create `millsydotdev/KinoraTV` on GitHub and push `main`.
- [ ] **Public Visibility**: Transition `millsydotdev/KinoraTV` to public.
- [ ] **Build Pipeline Execution**: Trigger and monitor multi-platform GitHub Actions release workflow.
