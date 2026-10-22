# Kinora design direction

Source of truth: the owner's approved mockup (the "VOLT TV" composite). Kinora reproduces its layout,
navigation, proportions, colour and component styling with original branding and fictional content.
The earlier amber/serif interpretation was rejected in review and replaced.

Dial: ENERGY 2 / RHYTHM 1 / MOTION 1

## Shell

- Fixed left sidebar (232px): logo, icon + label items, active item as a red wash strongest at the
  leading edge, status line at the bottom. Collapses to a 76px icon rail at 1100px and to a slide-out
  drawer (menu button in the page header) at 760px.
- Each screen has its own header: title and sub-tabs on the left; search pill, reminders bell and clock
  on the right. On Home and detail pages the header floats over the hero image.
- The mockup's "Guide (EPG)" sidebar item is deliberately omitted: the guide lives inside Live TV as
  its "TV Guide" tab, per the owner's brief.

## Colour, themes and type

- Three themes on layered tokens (`src/styles/global.css`): page background, navigation surface,
  card surface (plus two hover/chip steps), raised surface for dialogs/menus/toasts, two border
  strengths, three text levels, and status colours tuned per theme. Default: Dark.
- Accent is user-chosen (Red default, Amber, Blue, Violet, Teal, Custom). `src/lib/theme.ts` computes
  the button label colour and a readable accent-text colour per theme, so any accent keeps 4.5:1;
  covered by `theme.test.ts`. Accent is used for primary actions, active nav, progress, what is
  playing and keyboard focus; selection elsewhere uses a neutral text-coloured edge.
- Artwork overlays, the player and the live preview keep dark tokens (`.force-dark`, `.card-media`)
  in every theme so text on images stays light.
- Density (Compact, Comfortable, Spacious) drives gutters, card gaps, section spacing and guide row
  height. All appearance settings live in Settings > Appearance and persist in localStorage.
- One typeface, Hanken Grotesk, bold for titles; small uppercase only for the hero kicker and badges.

## Components

- Cards: 8px corners, hairline border. Hover lifts with a neutral edge; keyboard focus is an offset
  accent ring; selected (e.g. the channel you are watching) is an accent border plus a "Watching" badge.
- Home rows differ by content: Continue Watching (4 wide cards, progress, play affordance), On Now
  (6 live cards, LIVE badge, programme progress, next slot), New Movies (7 posters), Series (4 wide
  cards, caption below), Your Channels (chips) and Your Library (shortcuts).
- Posters are clean 2:3 art with a caption block. Certificates replace star ratings (no rating data).
- Sources: card rows with icon tile, name, "Last checked", status pill. Add Source is a full page with
  the Discover, Validate, Add stepper and a full-width "Scan & Validate" button.
- Settings: list of category cards with chevrons; each opens its own page of grouped rows.
- Live TV: full-width guide; date, Now and hours-visible controls in the header as plain text; channel
  category filter in the guide's "Channels" corner; the player docks from the "Now Playing" pill;
  programme details open in a side sheet.
- Anything that is sample data or waits on a future service carries a `demo-note` or `pending-tag`.

## Motion

Hover and focus transitions (150ms), artwork fade-in on load, dialog and sheet entrances, and the
loading shimmer that stops once an image arrives. No autoplay or looping animation. "Reduce motion"
and the OS setting both switch transitions off.
