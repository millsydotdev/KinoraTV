/**
 * Structured Changelog & Offline Version History Library for Kinora.
 * Reads bundled release data from src/data/changelog.json so complete release history
 * is always available offline, while supporting optional online release highlights
 * fetched from the configured trusted updater manifest.
 * Strictly adheres to project typography standards: zero em-dashes.
 */

import rawChangelog from '../data/changelog.json'

export type ChangelogCategory =
  | 'New Features'
  | 'UI Upgrades'
  | 'Design Improvements'
  | 'Playback Improvements'
  | 'Live TV and EPG'
  | 'Movies and Series'
  | 'Audio and Podcasts'
  | 'Books and Reading'
  | 'AI and Automation'
  | 'Server and Devices'
  | 'Mobile Remote'
  | 'Synchronisation'
  | 'Artwork and Discovery'
  | 'Source Integrations'
  | 'Security and Privacy'
  | 'Performance Improvements'
  | 'Reliability Improvements'
  | 'Bug Fixes'
  | 'Developer and Infrastructure Improvements'

export interface ChangelogEntry {
  id: string
  category: ChangelogCategory
  title: string
  description: string
  details?: string
  screen?: string
  docLink?: string
  audience?: 'user' | 'developer'
}

export interface ChangelogRelease {
  version: string
  releaseDate: string
  channel: 'stable' | 'prerelease' | 'development'
  title: string
  summary: string
  entries: ChangelogEntry[]
}

export interface ChangelogDatabase {
  schemaVersion: number
  product: string
  releases: ChangelogRelease[]
}

const database = rawChangelog as ChangelogDatabase

/** Returns all bundled releases in newest-first order (works 100% offline). */
export function getAllReleases(): ChangelogRelease[] {
  return database.releases
}

/** Finds a release by exact SemVer version or matching major.minor prefix. */
export function getReleaseByVersion(version: string): ChangelogRelease | undefined {
  const clean = version.trim().replace(/^v/i, '')
  const exact = database.releases.find((r) => r.version === clean)
  if (exact) return exact
  const majorMinor = clean.split('.').slice(0, 2).join('.')
  return database.releases.find((r) => r.version.startsWith(`${majorMinor}.`)) ?? database.releases[0]
}

/** Returns user-facing entries (excluding developer-only notes unless requested). */
export function getReleaseEntries(
  release: ChangelogRelease,
  options?: { includeDeveloper?: boolean; category?: string | null },
): ChangelogEntry[] {
  return release.entries.filter((entry) => {
    if (!options?.includeDeveloper && entry.audience === 'developer') return false
    if (options?.category && options.category !== 'All' && entry.category !== options.category) return false
    return true
  })
}

/** Returns unique categories present in a release for filter chips. */
export function getReleaseCategories(
  release: ChangelogRelease,
  includeDeveloper = false,
): ChangelogCategory[] {
  const seen = new Set<ChangelogCategory>()
  for (const entry of release.entries) {
    if (!includeDeveloper && entry.audience === 'developer') continue
    seen.add(entry.category)
  }
  return Array.from(seen)
}

/** Maps a fine-grained changelog category to a badge style token. */
export function categoryBadgeTone(category: ChangelogCategory): 'feature' | 'improvement' | 'fix' | 'security' {
  switch (category) {
    case 'Security and Privacy':
      return 'security'
    case 'Bug Fixes':
      return 'fix'
    case 'New Features':
    case 'AI and Automation':
    case 'Server and Devices':
    case 'Mobile Remote':
    case 'Books and Reading':
    case 'Audio and Podcasts':
    case 'Movies and Series':
    case 'Live TV and EPG':
      return 'feature'
    default:
      return 'improvement'
  }
}
