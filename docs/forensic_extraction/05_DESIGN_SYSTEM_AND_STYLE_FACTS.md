# 05 Design System and Style Facts

This document records the exact design tokens, typography, colour palettes, component styles, icon mappings, and motion specifications implemented in Kinora.

---

## 1. Typography

### Font Family & Delivery
- **Primary Font Family:** `'Hanken Grotesk Variable', 'Segoe UI', system-ui, sans-serif`
  - **Source:** `src/styles/global.css:163` (`--font: 'Hanken Grotesk Variable', 'Segoe UI', system-ui, sans-serif;`)
  - **Font Delivery:** Loaded via npm package `@fontsource-variable/hanken-grotesk` imported in `src/main.tsx:3`.
  - **Woff2 Bundling:** Pre-bundled as local font assets in `dist/assets/` (`hanken-grotesk-latin-wght-normal.woff2`, etc.). Inlined data URLs are explicitly disabled in `vite.config.ts` (`assetsInlineLimit: 0` for `.woff2`) to comply with strict Content Security Policy (`font-src 'self'`).
  - **Monospace Font Family:** `ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace` (used for code badges, memory addresses, and technical diagnostics).

### Font Weights
- `400` (Normal): Body copy, synopses, secondary descriptions.
- `500` (Medium): Category chips, button labels, navigation leaf items.
- `600` (Semi-bold): Card titles, input labels, table column headers.
- `700` (Bold): Section headings, modal titles, channel labels.
- `800` (Extra-bold / Heavy): Hero titles, brand wordmark (`KINORA`), kicker badges.

### Typographic Hierarchy Tokens
- **Hero Title:** `clamp(2.1rem, 2.7vw, 2.5rem)` (33.6px - 40px), weight `800`, line-height `1.05`, letter-spacing `-0.02em`.
- **Page Heading 1 (`h1`):** `clamp(1.75rem, 2.2vw, 2.125rem)`, weight `700`, line-height `1.15`.
- **Section Heading 2 (`h2`):** `1.25rem` (20px), weight `700`, line-height `1.2`.
- **Card Title (`h3`):** `0.9375rem` (15px), weight `600`, line-height `1.3`.
- **Body Text:** `0.875rem` (14px), line-height `1.5`.
- **Caption / Metadata:** `0.75rem` (12px), weight `500`, letter-spacing `0.02em`.
- **Kicker Badge:** `0.6875rem` (11px), weight `800`, letter-spacing `0.12em`, text-transform `uppercase`.

### Text Scaling & Responsive Accessibility
- Normal scale: Root `font-size: 100%` (16px base).
- Large text setting: `[data-text='large']` sets `font-size: 112.5%` (18px base) (`src/styles/global.css:179`).

---

## 2. Colour Palette and Semantic Surface Tokens

Kinora implements a layered theme system (`dark`, `dim`, `light`) with contrast calculation mathematics computed in `src/lib/theme.ts`.

### Theme Canvas Backgrounds
- **Dark Theme (Default):**
  - App Background: `--bg`: `#080C10` (RGB: `8 12 16`)
  - Navigation / Sidebar: `--nav`: `#080C10` (Pure Obsidian Black)
  - Surface 1 (Base Cards): `--surface`: `#111318`
  - Surface 2 (Elevated Inputs / Toolbars): `--surface-2`: `#171B22`
  - Surface 3 (Modals / Drawers): `--surface-3`: `#1f222e`
- **Dim Theme:**
  - App Background: `#181c24` (RGB: `24 28 36`)
  - Surface: `#262c37`
  - Surface 2: `#2d3440`
- **Light Theme:**
  - App Background: `#f4f5f8` (RGB: `244 245 248`)
  - Navigation: `#ffffff`
  - Surface: `#ffffff`
  - Surface 2: `#eef0f4`

### Text & Ink Tokens
- Primary Text: `--text`: `#f5f5f5` (Dark), `#141821` (Light)
- Secondary Text: `--text-2`: `#b4b7bd` (Dark), `#475062` (Light)
- Muted / Disabled Text: `--text-3`: `#858a93` (Dark), `#5d6676` (Light)
- Error / Danger: `--bad`: `#ff7070` (Dark), `#b42318` (Light)
- Warning / Caution: `--warn`: `#f2b84b` (Dark), `#8a5a00` (Light)
- Success / Live: `--ok`: `#3ecf8e` (Dark), `#12754a` (Light)
- Information: `--info`: `#7db8ff` (Dark), `#1d5fb8` (Light)

### Accent Colours & Illumination
- **Kinora Signature Red (Default Accent):**
  - Primary Accent: `--accent-red-primary`: `#E50914`
  - Hover Accent: `--accent-red-hover`: `#FF253B`
  - Active Accent: `--accent-red-active`: `#b90018`
  - Highlight Accent: `--accent-red-accent`: `#FF3847`
  - Sharp Illumination: `--red-illumination-sharp`: `0 0 10px rgba(229, 9, 20, 0.65)`
  - Soft Illumination: `--red-illumination-soft`: `0 0 20px rgba(229, 9, 20, 0.35)`
- **Theme Presets (`src/lib/theme.ts:74-170`):**
  1. `Kinora Red`: `#e50d24` primary, `#FF253B` highlight, `#080C10` background.
  2. `Midnight`: `#2f6fd6` primary, `#60a5fa` highlight, `#080b12` background.
  3. `Purple Haze`: `#7c4ddb` primary, `#a78bfa` highlight, `#0a0812` background.
  4. `Emerald`: `#0b7d74` primary, `#34d399` highlight, `#080e0c` background.
  5. `Amber`: `#e8a33a` primary, `#fbbf24` highlight, `#0d0b08` background.
  6. `Ocean`: `#06b6d4` primary, `#38bdf8` highlight, `#060d12` background.

---

## 3. Spacing, Geometry and Layout Tokens

- **Sidebar Width:**
  - Expanded: `--side-w: clamp(230px, 15.8vw, 264px)` (approx 240px)
  - Compact / Collapsed: `--side-compact-w: 68px`
- **Header Height:**
  - Standard: `--head-h: 76px`
  - Compact density: `--head-h: 66px`
  - Spacious density: `--head-h: 84px`
- **Page Gutters:**
  - Standard: `--gutter: clamp(24px, 2.2vw, 38px)`
  - Compact: `--gutter: clamp(12px, 2vw, 28px)`
  - Spacious: `--gutter: clamp(20px, 3.4vw, 60px)`
- **Element Gaps:**
  - Standard: `--gap: 16px`
  - Section Spacing: `--section-gap: 40px`
- **Border Radii:**
  - Small (`--r-s`): `4px` (Chips, buttons, badges)
  - Medium (`--r-m`): `8px` (Media cards, input boxes, dropdowns)
  - Large (`--r-l`): `12px` (Modals, preview panels, hero cards)
  - Full / Pill: `9999px` (Badges, search bar, avatar pills)
- **Border Lines:**
  - Subtle Border: `--line: #232733`
  - Strong Divider: `--line-strong: #323849`

---

## 4. Reusable Component Styling

### Buttons
- **Primary Button (`.btn.btn-primary`):**
  `background: var(--accent); color: var(--accent-ink); border-radius: var(--r-s); padding: 0 16px; height: 38px; font-weight: 600; display: inline-flex; align-items: center; gap: 8px; transition: background 120ms var(--ease), transform 120ms var(--ease);`
- **Secondary Button (`.btn.btn-secondary`):**
  `background: var(--surface-2); color: var(--text); border: 1px solid var(--line); border-radius: var(--r-s); padding: 0 16px; height: 38px; font-weight: 500;`
- **Icon Button (`.icon-btn.ringed`):**
  `width: 38px; height: 38px; border-radius: var(--r-s); border: 1px solid var(--line); background: var(--surface-2); display: flex; align-items: center; justify-content: center; color: var(--text-2);`

### Focus Indicators & TV Remote Navigation
- D-pad and Keyboard Focus Ring:
  `.animated-focus-border, :focus-visible { outline: none; border-color: var(--accent); box-shadow: 0 0 14px rgba(229, 9, 20, 0.55), inset 0 0 6px rgba(229, 9, 20, 0.25); }`

### Cards & Tiles
- **Poster Card (`.poster-card`):**
  `aspect-ratio: 2 / 3; border-radius: var(--r-m); background: var(--surface); border: 1px solid var(--line); overflow: hidden; position: relative; transition: transform 180ms var(--ease), border-color 180ms var(--ease), box-shadow 180ms var(--ease);`
  - Hover State: `transform: translateY(-4px); border-color: var(--accent); box-shadow: 0 12px 28px rgba(0, 0, 0, 0.65), 0 0 12px rgba(229, 9, 20, 0.35);`

---

## 5. Icon System (`@tabler/icons-react`)

- **Implementation File:** `src/components/Icon.tsx`
- **Icon Family:** Tabler Icons React (v3)
- **Default Dimensions:** Width: `18px`, Height: `18px`, Stroke Width: `2.0`
- **Exhaustive Icon Name Mappings:**
  - Navigation & Core: `home`, `live`, `clapperboard`, `film`, `series`, `library`, `sources`, `settings`, `search`, `bell`, `user`, `desktop`
  - Media & Controls: `play`, `pause`, `record`, `volume`, `volumeMute`, `pip`, `maximize`, `minimize`, `repeat`, `rotateCw`, `clock`, `history`
  - Audio & Reading: `radio`, `music`, `podcast`, `headphones`, `book`, `mic`
  - Actions & Feedback: `plus`, `minus`, `check`, `x`, `copy`, `share`, `trash`, `edit`, `download`, `upload`, `refresh`, `star`, `heart`, `thumbUp`, `thumbDown`
  - Chevrons & Carets: `chevronRight`, `chevronLeft`, `chevronDown`, `chevronUp`, `arrowLeft`, `menu`
  - Categories & Tags: `news`, `sports`, `education`, `palette`, `nature`, `gaming`, `globe`, `archive`, `bookmark`, `layers`, `tag`, `trophy`, `sparkles`, `flame`
  - Security & Diagnostics: `lock`, `shield`, `server`, `database`, `keyboard`, `help`, `info`, `alertCircle`, `warning`

---

## 6. Motion, Animation and Transitions

- **Primary Timing Function:** `--ease: cubic-bezier(0.2, 0.7, 0.2, 1)`
- **Duration Tokens:**
  - Fast: `--transition-fast: 120ms var(--ease)` (Button hover, checkbox toggle)
  - Normal: `--transition-normal: 200ms var(--ease)` (Card lift, drawer slide)
  - Slow: `--transition-slow: 320ms var(--ease)` (Modal fade, hero cross-fade)
- **Reduced Motion Support:**
  - CSS Media Query: `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }`
  - User Preference Override: When `prefs.reduceMotion` is true (`[data-motion='reduce']`), all animated transitions and pulsating glow effects are disabled (`src/App.tsx:87`).
