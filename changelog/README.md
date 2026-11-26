# Kinora Structured Changelog Workflow

`src/data/changelog.json` is the single source of truth for Kinora's release history.
From this file, Kinora deterministically generates:

- The in-app **What's New** modal and offline **Version History** browser (`src/components/WhatsNewModal.tsx`)
- Root `CHANGELOG.md`
- Versioned release notes (`docs/release/release-notes-v<version>.md`)
- Updater manifest release notes (`release-dist/latest.json` via `scripts/generate-updater-manifest.cjs`)

## Recording Changes During Development

When completing a meaningful user-facing change, add a JSON fragment file in `changelog/fragments/`, for example `changelog/fragments/add-feature-name.json`:

```json
{
  "id": "v070-short-unique-id",
  "category": "New Features",
  "title": "Clear User-Facing Title",
  "description": "What changed and why it matters to users, without commit hashes or internal filenames.",
  "details": "Optional extra explanation shown when expanded.",
  "screen": "/settings",
  "audience": "user"
}
```

Internal refactors, formatting changes, or test-only commits do not need a user-facing fragment.
Use `"audience": "developer"` for infrastructure or build-system notes so they appear in engineering release notes without cluttering the user-facing What's New screen.

## Supported Categories

- New Features
- UI Upgrades
- Design Improvements
- Playback Improvements
- Live TV and EPG
- Movies and Series
- Audio and Podcasts
- Books and Reading
- AI and Automation
- Server and Devices
- Mobile Remote
- Synchronisation
- Artwork and Discovery
- Source Integrations
- Security and Privacy
- Performance Improvements
- Reliability Improvements
- Bug Fixes
- Developer and Infrastructure Improvements

## Generating and Validating

```bash
# Validate src/data/changelog.json and check CHANGELOG.md sync
npm run changelog:validate

# Regenerate CHANGELOG.md and docs/release/release-notes-v<version>.md
npm run changelog:generate

# Merge pending fragments from changelog/fragments/ into the current release version
node scripts/generate-changelog.cjs --merge-fragments
```
