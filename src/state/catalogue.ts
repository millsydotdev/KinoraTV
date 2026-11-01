// Discovery (Gate D7): browsing iptv-org's public playlist catalogue, fetched and checked by Rust
// (src-tauri/src/catalogue.rs). Entries are provider facts; adding one is an ordinary playlist import
// through the guarded `fetchPlaylist`, after which it is a normal source like any other.
import { IngestError, type Catalogue, type CatalogueEntry, type CatalogueKind } from '../lib/native'
import { DESKTOP_ONLY, type PlaylistSource } from './playlists'

export const PROVIDER = 'iptv-org'
export const PROVIDER_URL = 'https://github.com/iptv-org/iptv'
/** A copy older than this is shown as out of date (it is still usable). */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000
export const PAGE_SIZE = 50

export type CatalogueFilter = 'country' | 'language' | 'category' | 'region' | 'local'

export const FILTERS: { value: CatalogueFilter; label: string }[] = [
  { value: 'country', label: 'Countries' },
  { value: 'language', label: 'Languages' },
  { value: 'category', label: 'Categories' },
  { value: 'region', label: 'Regions' },
  { value: 'local', label: 'Local areas' },
]

export const KIND_LABEL: Record<CatalogueKind, string> = {
  country: 'Country playlist', language: 'Language playlist', category: 'Category playlist', region: 'Region playlist',
  subdivision: 'Area playlist', city: 'City playlist',
}

const inFilter = (e: CatalogueEntry, f: CatalogueFilter) => (f === 'local' ? e.kind === 'subdivision' || e.kind === 'city' : e.kind === f)

/** Case- and accent-insensitive: "cote" finds "Côte d’Ivoire". */
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Entries of one kind whose name, code or parent's name contains the query, in catalogue order. */
export function filterEntries(entries: CatalogueEntry[], filter: CatalogueFilter, query: string): CatalogueEntry[] {
  const q = fold(query.trim())
  const names = new Map(entries.map((e) => [e.id, e.name]))
  return entries.filter((e) => inFilter(e, filter) && (!q || [e.name, e.code, names.get(e.parent ?? '') ?? ''].some((t) => fold(t).includes(q))))
}

/** "Fier, Albania" for a city: the entry's parents, nearest first. */
export function placeOf(entry: CatalogueEntry, entries: CatalogueEntry[]): string | null {
  const byId = new Map(entries.map((e) => [e.id, e]))
  const names: string[] = []
  for (let p = byId.get(entry.parent ?? ''); p && names.length < 4; p = byId.get(p.parent ?? '')) names.push(p.name)
  return names.length ? names.join(', ') : null
}

export const isStale = (c: Catalogue, now: number) => now - c.fetchedAt > STALE_AFTER_MS

/** The imported source for an entry, by its exact address: two sources are never the same by name alone. */
export const importedAs = (entry: CatalogueEntry, playlists: PlaylistSource[]) => playlists.find((p) => p.url === entry.url)

/** A source name not already taken, within the 48-character limit. */
export function uniqueName(entry: CatalogueEntry, taken: string[]): string {
  const base = `${PROVIDER} · ${entry.name}`.slice(0, 44).trim()
  const used = new Set(taken.map((t) => t.toLowerCase()))
  if (!used.has(base.toLowerCase())) return base
  for (let i = 2; ; i++) if (!used.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`
}

export interface CatalogueState {
  /** `loading` with a catalogue: the copy shown is being updated. */
  status: 'idle' | 'loading' | 'ready' | 'failed'
  catalogue: Catalogue | null
  error: string | null
  /** Latest operation started; results of older ones are dropped. */
  op: number
}

export const idleCatalogue: CatalogueState = { status: 'idle', catalogue: null, error: null, op: 0 }

const message = (e: unknown) => (e instanceof IngestError && e.code !== 'internal' ? e.message : 'Kinora could not read the catalogue.')

/**
 * Fetches the catalogue (or reads the cached copy) and applies the result unless a newer operation
 * started meanwhile. A failure keeps the copy already shown.
 */
export async function runCatalogue(
  update: (fn: (s: CatalogueState) => CatalogueState) => void,
  op: number,
  load: () => Promise<Catalogue | null>,
  missing: string = DESKTOP_ONLY,
): Promise<Catalogue | null> {
  update((s) => ({ ...s, status: 'loading', op }))
  try {
    const catalogue = await load()
    update((s) => (s.op !== op ? s : catalogue
      ? { status: 'ready', catalogue, error: null, op }
      : { ...s, status: s.catalogue ? 'ready' : 'failed', error: s.catalogue ? s.error : missing }))
    return catalogue
  } catch (e) {
    const error = message(e)
    update((s) => (s.op !== op ? s : { ...s, status: 'failed', error }))
    return null
  }
}

/** The country the system locale names (iptv-org writes GB as `uk`), then the most listed countries. */
export function suggestedEntries(entries: CatalogueEntry[], region: string | null, count = 12): CatalogueEntry[] {
  const code = region?.toLowerCase() === 'gb' ? 'uk' : region?.toLowerCase()
  const countries = entries.filter((e) => e.kind === 'country')
  const mine = countries.filter((e) => e.code.toLowerCase() === code)
  const rest = countries.filter((e) => !mine.includes(e)).sort((a, b) => (b.channels ?? 0) - (a.channels ?? 0))
  return [...mine, ...rest].slice(0, count)
}
