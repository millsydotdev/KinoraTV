# Dependency notes

## Advisories we cannot fix ourselves

`cargo audit` reports two warnings, no vulnerabilities. Both arrive only through Tauri's Linux stack:

    tauri 2.12 -> tao, muda -> gtk 0.18 -> glib 0.18.5 -> glib-macros 0.18.5 -> proc-macro-error 1.0.4

| Advisory | What | Effect on Kinora | Resolution |
|---|---|---|---|
| RUSTSEC-2024-0429 | `glib::VariantStrIter` is unsound | Kinora has no direct `glib` dependency and never calls it; Tauri's use is outside our control | Needs gtk-rs 0.20 or later in Tauri. Stable Tauri 2.x still uses 0.18; the only newer release is `3.0.0-alpha`, not suitable for a release |
| RUSTSEC-2024-0370 | `proc-macro-error` is unmaintained | Build-time only; not linked into the app | Same upgrade |

Both are named with reasons in `src-tauri/deny.toml` and `scripts/ci-local.sh`, so a new advisory still fails CI. Check them again at every Tauri upgrade, and remove the ignores as soon as `cargo tree -i glib` shows 0.20 or later.

## Licences

`public/THIRD-PARTY-NOTICES.txt` lists every shipped package with its own licence text. It is built by `scripts/third-party-notices.py`, ships inside the app, and CI fails if it goes out of date. `src-tauri/deny.toml` holds the allowed licences for Rust crates. No shipped package declares a GPL-only licence. System libraries (WebKitGTK, GTK, GStreamer) are linked dynamically and come from the OS. This is engineering inventory, not legal advice.
