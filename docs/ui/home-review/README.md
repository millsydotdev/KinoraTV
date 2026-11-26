# Kinora 0.6.0: Home Screen Redesign Visual Captures and Evidence Register

This directory contains the visual verification captures for the redesigned Kinora 0.6.0 Home screen, along with the historical audit captures preserved in `audit-evidence/`.

## 1. Redesigned Home Screen Captures (Post-Implementation)

**Capture Date:** 2026-11-22 03:25 UTC  
**Application Name:** Kinora  
**Application Version:** 0.6.0  
**Design Reference:** Mockup `media_1795316730198_d75db958.jpg`  
**Layout Hierarchy:** Cinematic Hero Spotlight -> Quick Navigation Ribbon -> Continue Watching (16:9) -> Live TV Right Now (16:9) -> Movies (2:3) -> Recommended for You -> Series & TV Shows -> Cultural Film Vault -> Live Radio & Spoken Audio.

| Screenshot File | Target Viewport / Mode | Image Dimensions | Key Elements Verified |
| :--- | :--- | :--- | :--- |
| [home-desktop-1080p.png](file:///mnt/storage/TVMovie/docs/ui/home-review/home-desktop-1080p.png) | Desktop Mode (1080p) | 1920 x 1080 | Widescreen hero, red featured tag, 16:9 Continue Watching with play circle overlay and red progress bar, persistent left sidebar. |
| [home-desktop-1440x900.png](file:///mnt/storage/TVMovie/docs/ui/home-review/home-desktop-1440x900.png) | Desktop Laptop (1440x900) | 1440 x 900 | Responsive scaling, proportional card widths, no horizontal overflow. |
| [home-desktop-1440p.png](file:///mnt/storage/TVMovie/docs/ui/home-review/home-desktop-1440p.png) | Desktop QHD (1440p) | 2560 x 1440 | Wide canvas layout, smooth card distribution across canvas. |
| [home-tv-1080p.png](file:///mnt/storage/TVMovie/docs/ui/home-review/home-tv-1080p.png) | TV 10-Foot Mode (1080p) | 1920 x 1080 | Enlarged 10-foot typography, Quick Jump ribbon below hero, high-contrast D-pad focus indicators. |
| [home-tv-4k.png](file:///mnt/storage/TVMovie/docs/ui/home-review/home-tv-4k.png) | TV 10-Foot Mode (4K UHD) | 3840 x 2160 | Full 4K resolution scaling, zero black void, crisp metadata and titles. |
| [home-full-page-desktop.png](file:///mnt/storage/TVMovie/docs/ui/home-review/home-full-page-desktop.png) | Full-Page Desktop | 1920 x 5201 | Complete vertical document, consolidated from 13 down to curated high-impact rails. Zero duplicate sections. |
| [home-full-page-tv.png](file:///mnt/storage/TVMovie/docs/ui/home-review/home-full-page-tv.png) | Full-Page TV Mode | 1920 x 5552 | Enforced TV launcher hierarchy (Continue Watching -> Live TV -> Movies -> Series), expanded card sizes, zero faux cards. |

---

## 2. Pre-Redesign Audit Evidence Register

The original captures taken during the diagnostic audit stage are safely archived in `docs/ui/home-review/audit-evidence/`:
- `audit-evidence/home-desktop-1080p.png`
- `audit-evidence/home-desktop-1440p.png`
- `audit-evidence/home-tv-1080p.png`
- `audit-evidence/home-tv-4k.png`
- `audit-evidence/home-full-page-desktop.png` (4999px height sprawl, 13 rails)
- `audit-evidence/home-full-page-tv.png` (5227px height sprawl)

---

## 3. Key Achievements and Parity Verification

1. **Design Parity with User-Provided Mockup:**
   - **Hero Spotlight:** Featuring the red pill `▶ FEATURED` tag, large bold title typography, year/runtime/cert metadata with subtle glass genre chips (`[Thriller] [Crime]`), 2-line clamped synopsis, red pill `▶ Watch Now` CTA, dark glass `More Info` button, circular `+` button, and circular carousel arrows and dots.
   - **16:9 Continue Watching Cards:** Displaying thumbnail art, title, remaining time badge, circular play badge on the bottom-right, and a thin red progress bar running across the bottom edge.
   - **16:9 Live TV Cards:** Displaying channel mark badge on top-left, current broadcast title, time remaining (`22 min left`), and real-time live elapsed progress bar.
   - **2:3 Movie and Series Posters:** Standardized vertical proportions, high contrast artwork, clean metadata lines.
2. **Global Deduplication:**
   - Managed via `src/lib/homeFeed.ts`. No film, show, or broadcast title repeats across any rail on screen.
3. **Elimination of Faux Cards and Redundant Sections:**
   - Continue Watching auto-hides when empty instead of showing fake navigation cards.
   - Hardcoded 360px `home-pair` split cards eliminated.
   - 4 duplicate archive and micro-genre rails merged into the unified "Cultural Film Vault & Archives" rail.
4. **Shell and Native Preservation:**
   - Sidebar and header structure 100% preserved.
   - Version locked at 0.6.0.
   - All 82 test suites (692 unit tests) and 181 Rust tests pass.
