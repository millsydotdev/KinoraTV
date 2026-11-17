# Home Screen Featured Content Selection Strategy

## Overview

The KinoraTV Home screen has been upgraded with an intelligent, deliberate featured-content selection engine (`src/lib/featuredSelection.ts`). Previously, real mode relied on a rigid heuristic that repeatedly selected the first live TV channel regardless of schedule status, artwork availability, or content diversity. The new architecture unifies development mock mode and real user mode under a single shared component (`HomeHero`), providing a balanced carousel of movies, series, live TV, and cultural resources.

## Core Architecture and Selection Engine

### 1. Unified HomeHero Component
Both development mock mode and real user mode share the identical `HomeHero` UI implementation in `src/screens/Home.tsx`. The visual presentation strictly adheres to the approved KinoraTV streaming design language:
- **Geometric Framing Overlay**: Genuine vector framing asset (`/art/hero-geometric-frame.png`) positioned over the background artwork with subtle backdrop gradients.
- **Kicker Badge**: Sleek `.hero-kicker-badge` with `.kicker-pill` indicator, station/channel badge or media tag, and uppercase category kicker (e.g. `FEATURED MOVIE`, `NOW ON BBC ONE`).
- **Hero Title**: High-contrast heading (`.title-xl`) with `.hero-title-accent` styling on the final word.
- **Metadata Row**: Clean pipe-separated (`|`) pills displaying category, year/broadcast period, remaining runtime or end time with SVG clock icon, and age rating badge.
- **Action Button Group**:
  - Primary button: "Watch Now" (or "Watch Live" for live broadcasts, "View Details" for VOD titles).
  - Secondary button: "Add to Library" / "In Library" (toggles watchlist for VOD, favourites for live channels).
  - Tertiary button: "Details" (or "TV Guide" for live broadcasts).
- **Interactive Multi-Slide Carousel**: Responsive dot indicators and previous/next navigation buttons displaying up to 4 balanced slides with keyboard accessibility.

### 2. Multi-Source Balancing and Category Diversity
The selection engine (`selectFeaturedSlides`) draws from all available data sources to construct a compelling 4-slide carousel:
1. **On-Demand Titles (Movies & Series)**:
   - When connected to an Xtream or VOD provider, candidate movies and series are evaluated.
   - High-quality entries with poster artwork keys and plot descriptions are prioritized.
2. **Live TV Channels & Broadcasts**:
   - Each channel's active schedule is evaluated against the current wall-clock timestamp `now`.
   - Category balancing guarantees that multiple live channels represent distinct programming genres (e.g. News, Entertainment, Sports, Documentaries) rather than duplicate channels from the same group.
   - At most one item is selected per channel to prevent repetition.
3. **Cultural, Nature & Educational Media Resources**:
   - Personal media library resources (such as NASA deep space feeds, Met Museum collections, Reuters wire dispatches) are evaluated and scored to ensure non-broadcast media types are featured.

### 3. Schedule Validation and Scoring Formula
Live television candidates must pass strict schedule validation:
- **Boundary Condition**: A programme is only eligible if `p.start <= now && now < p.stop`. Expired programmes and future placeholder slots are strictly rejected.
- **Title Validation**: Placeholders such as ".Off Air", "Programmes start at...", and "Close Down" are filtered out via `isValidProgrammeTitle()`.
- **Scoring Weights**:
  - Genuine high-resolution EPG artwork (`p.icon` or `p.art`): **+50 points**
  - Channel in user favourites: **+40 points**
  - Rich narrative description (`p.desc > 15 chars`): **+15 points**
  - Substantial airtime remaining (`remainingSeconds >= 900`): **+10 points**
  - Fallback channel mark and tone (when no EPG is published): **+15 to +30 points**

### 4. Deterministic Development Fixtures
When operating in sample development mode (`demoTitles: true`):
- Returns 4 curated showcase titles:
  1. *Harbour Lights* (Featured Movie: Sci-Fi / Drama)
  2. *Ninth Ward* (Featured Series: Crime / Drama)
  3. *Low Orbit* (Featured Movie: Sci-Fi / Thriller)
  4. *Fathom* (Featured Series: Mystery / Sci-Fi)
- When Kids Mode is enabled, automatically filters to age-appropriate titles (U, PG, 12).

## Verification and Unit Test Coverage

The featured selection engine is tested in `src/lib/featuredSelection.test.ts` across 9 test suites:
- Rejection of expired and placeholder programme slots.
- Detection of genuine artwork and aspect-ratio metadata.
- Deterministic 4-slide carousel ordering in sample mode.
- Kids mode certification constraints.
- Multi-channel category diversity and duplicate channel suppression.
- Xtream on-demand prioritization.
- Personal media resource inclusion.
