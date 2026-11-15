// Splits real library data from the sample activity older builds started every profile with.
// `kinora.library.v1` is left in place as a safety copy; the new key holds only real data.
import { movies, series } from '../data/catalog'
import { channels } from '../data/channels'
import type { Library } from '../data/types'

const fictionalMovies = new Set(movies.map((m) => m.id))
const fictionalSeries = new Set(series.map((s) => s.id))
const fictionalChannels = new Set(channels.map((c) => c.id))
const SAMPLE_COLLECTIONS = new Set(['c-rainy', 'c-night', 'c-family'])
const SAMPLE_SEARCHES = new Set(['harbour', 'football', 'kingsmoor'])

/** True for a reference to the built-in demonstration catalogue. Playlist channels have their own ids. */
export function isFictionalRef(ref: string): boolean {
  const [kind, rest = ''] = ref.split(':')
  if (kind === 'movie') return fictionalMovies.has(rest)
  if (kind === 'series') return fictionalSeries.has(rest)
  if (kind === 'episode') return fictionalSeries.has(rest.split('/')[0] ?? '')
  if (kind === 'channel') return fictionalChannels.has(rest)
  return false
}

export function realLibrary(old: Library): Library {
  const keep = (r: string) => !isFictionalRef(r)
  return {
    ...old,
    favourites: old.favourites.filter(keep),
    watchlist: old.watchlist.filter(keep),
    watched: old.watched.filter(keep),
    progress: Object.fromEntries(Object.entries(old.progress).filter(([r]) => keep(r))),
    history: old.history.filter((h) => keep(h.ref)),
    collections: old.collections
      .map((c) => ({ ...c, items: c.items.filter(keep) }))
      .filter((c) => !(SAMPLE_COLLECTIONS.has(c.id) && c.items.length === 0)),
    // A reminder id is `<channel id>@<start>`.
    reminders: old.reminders.filter((id) => !fictionalChannels.has(id.split('@')[0] ?? '')),
    recentSearches: old.recentSearches.filter((q) => !SAMPLE_SEARCHES.has(q)),
  }
}
