export type MediaType = 'movie' | 'series' | 'channel' | 'local'
export type WatchedStatus = 'all' | 'unwatched' | 'in-progress' | 'watched'

export interface UnifiedMediaItem {
  id: string
  ref: string
  title: string
  mediaType: MediaType
  genres: string[]
  year?: number
  rating?: number
  resolution?: '4k' | 'hd' | 'sd'
  watchedStatus?: 'unwatched' | 'in-progress' | 'watched'
  overview?: string
  posterUrl?: string
  bannerUrl?: string
  runtimeMinutes?: number
}

export type SmartRuleField =
  | 'mediaType'
  | 'genre'
  | 'yearMin'
  | 'yearMax'
  | 'minRating'
  | 'watchedStatus'
  | 'resolution'
  | 'keyword'

export interface SmartCollectionRule {
  field: SmartRuleField
  value: string | number
}

export interface SmartCollection {
  id: string
  name: string
  description?: string
  icon?: string
  rules: SmartCollectionRule[]
  matchMode: 'all' | 'any'
  sortBy?: 'year' | 'rating' | 'title'
  sortOrder?: 'asc' | 'desc'
  createdAt: number
  updatedAt: number
}

export interface SmartCollectionConfig {
  version: 1
  collections: SmartCollection[]
}

export const STARTER_SMART_COLLECTIONS: SmartCollection[] = [
  {
    id: 'sc-unwatched-4k',
    name: 'Unwatched 4K Releases',
    description: 'High-definition 4K titles ready to watch',
    icon: 'sparkles',
    matchMode: 'all',
    rules: [
      { field: 'resolution', value: '4k' },
      { field: 'watchedStatus', value: 'unwatched' },
    ],
    sortBy: 'rating',
    sortOrder: 'desc',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  },
  {
    id: 'sc-80s-scifi',
    name: '80s Sci-Fi & Fantasy',
    description: 'Iconic retro futuristic and fantasy cinema from 1980 to 1989',
    icon: 'film',
    matchMode: 'all',
    rules: [
      { field: 'genre', value: 'Sci-Fi' },
      { field: 'yearMin', value: 1980 },
      { field: 'yearMax', value: 1989 },
    ],
    sortBy: 'year',
    sortOrder: 'asc',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  },
  {
    id: 'sc-top-series',
    name: 'Top Rated Series',
    description: 'Acclaimed television shows rated 8.0 or higher',
    icon: 'series',
    matchMode: 'all',
    rules: [
      { field: 'mediaType', value: 'series' },
      { field: 'minRating', value: 8.0 },
    ],
    sortBy: 'rating',
    sortOrder: 'desc',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
  },
]

export function getSmartCollectionStorageKey(profileId?: string): string {
  return profileId && profileId !== 'default'
    ? `kinora.smart_collections.v1.${profileId}`
    : 'kinora.smart_collections.v1'
}

export function loadSmartCollections(profileId?: string): SmartCollection[] {
  if (typeof localStorage === 'undefined') return [...STARTER_SMART_COLLECTIONS]
  try {
    const raw = localStorage.getItem(getSmartCollectionStorageKey(profileId))
    if (!raw) return [...STARTER_SMART_COLLECTIONS]
    const parsed = JSON.parse(raw) as Partial<SmartCollectionConfig>
    if (Array.isArray(parsed.collections)) {
      return parsed.collections
    }
    return [...STARTER_SMART_COLLECTIONS]
  } catch {
    return [...STARTER_SMART_COLLECTIONS]
  }
}

export function saveSmartCollections(collections: SmartCollection[], profileId?: string): void {
  if (typeof localStorage === 'undefined') return
  try {
    const payload: SmartCollectionConfig = {
      version: 1,
      collections,
    }
    localStorage.setItem(getSmartCollectionStorageKey(profileId), JSON.stringify(payload))
  } catch {
    // Handle storage quota issues gracefully
  }
}

export function matchesRule(item: UnifiedMediaItem, rule: SmartCollectionRule): boolean {
  switch (rule.field) {
    case 'mediaType':
      return item.mediaType.toLowerCase() === String(rule.value).toLowerCase()

    case 'genre': {
      const target = String(rule.value).toLowerCase()
      return item.genres.some((g) => g.toLowerCase().includes(target))
    }

    case 'yearMin': {
      const min = typeof rule.value === 'number' ? rule.value : parseInt(String(rule.value), 10)
      return item.year !== undefined && !isNaN(min) && item.year >= min
    }

    case 'yearMax': {
      const max = typeof rule.value === 'number' ? rule.value : parseInt(String(rule.value), 10)
      return item.year !== undefined && !isNaN(max) && item.year <= max
    }

    case 'minRating': {
      const minR = typeof rule.value === 'number' ? rule.value : parseFloat(String(rule.value))
      return item.rating !== undefined && !isNaN(minR) && item.rating >= minR
    }

    case 'watchedStatus':
      return item.watchedStatus === rule.value

    case 'resolution':
      return item.resolution === rule.value

    case 'keyword': {
      const kw = String(rule.value).toLowerCase()
      return (
        item.title.toLowerCase().includes(kw) ||
        (item.overview !== undefined && item.overview.toLowerCase().includes(kw))
      )
    }

    default:
      return true
  }
}

export function evaluateSmartCollection(
  collection: SmartCollection,
  items: UnifiedMediaItem[],
): UnifiedMediaItem[] {
  if (collection.rules.length === 0) return [...items]

  const matched = items.filter((item) => {
    if (collection.matchMode === 'any') {
      return collection.rules.some((rule) => matchesRule(item, rule))
    }
    return collection.rules.every((rule) => matchesRule(item, rule))
  })

  // Apply sorting if configured
  if (collection.sortBy) {
    const isAsc = collection.sortOrder === 'asc'
    matched.sort((a, b) => {
      if (collection.sortBy === 'year') {
        const valA = a.year ?? 0
        const valB = b.year ?? 0
        return isAsc ? valA - valB : valB - valA
      }
      if (collection.sortBy === 'rating') {
        const valA = a.rating ?? 0
        const valB = b.rating ?? 0
        return isAsc ? valA - valB : valB - valA
      }
      if (collection.sortBy === 'title') {
        return isAsc ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title)
      }
      return 0
    })
  }

  return matched
}

export function createSmartCollection(
  collection: Omit<SmartCollection, 'id' | 'createdAt' | 'updatedAt'>,
  profileId?: string,
): SmartCollection {
  const existing = loadSmartCollections(profileId)
  const newCollection: SmartCollection = {
    ...collection,
    id: `sc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  const next = [...existing, newCollection]
  saveSmartCollections(next, profileId)
  return newCollection
}

export function updateSmartCollection(
  id: string,
  updates: Partial<Omit<SmartCollection, 'id' | 'createdAt'>>,
  profileId?: string,
): SmartCollection | null {
  const existing = loadSmartCollections(profileId)
  const idx = existing.findIndex((c) => c.id === id)
  if (idx === -1) return null

  const updated: SmartCollection = {
    ...existing[idx]!,
    ...updates,
    updatedAt: Date.now(),
  }
  const next = [...existing]
  next[idx] = updated
  saveSmartCollections(next, profileId)
  return updated
}

export function deleteSmartCollection(id: string, profileId?: string): boolean {
  const existing = loadSmartCollections(profileId)
  const filtered = existing.filter((c) => c.id !== id)
  if (filtered.length === existing.length) return false
  saveSmartCollections(filtered, profileId)
  return true
}

export function buildUnifiedMediaCatalog(
  demoMovies: any[] = [],
  demoSeries: any[] = [],
  xtreamCatalogue?: { movies?: any[]; series?: any[] },
  localItems: any[] = [],
  channels: any[] = [],
  watchedRefs: string[] = [],
): UnifiedMediaItem[] {
  const watchedSet = new Set(watchedRefs)
  const items: UnifiedMediaItem[] = []

  // 1. Catalog Movies
  for (const m of demoMovies) {
    const ref = `movie:${m.id}`
    items.push({
      id: m.id,
      ref,
      title: m.title,
      mediaType: 'movie',
      genres: m.genres || [],
      year: m.year,
      rating: m.rating ? parseFloat(String(m.rating)) : undefined,
      resolution: m.tags?.includes('4K') ? '4k' : 'hd',
      watchedStatus: watchedSet.has(ref) ? 'watched' : 'unwatched',
      overview: m.synopsis,
      posterUrl: m.poster,
      bannerUrl: m.backdrop,
      runtimeMinutes: m.runtime,
    })
  }

  // 2. Catalog Series
  for (const s of demoSeries) {
    const ref = `series:${s.id}`
    items.push({
      id: s.id,
      ref,
      title: s.title,
      mediaType: 'series',
      genres: s.genres || [],
      year: s.year,
      rating: s.rating ? parseFloat(String(s.rating)) : undefined,
      resolution: s.tags?.includes('4K') ? '4k' : 'hd',
      watchedStatus: watchedSet.has(ref) ? 'watched' : 'unwatched',
      overview: s.synopsis,
      posterUrl: s.poster,
      bannerUrl: s.backdrop,
    })
  }

  // 3. Xtream Movies
  if (xtreamCatalogue?.movies) {
    for (const xm of xtreamCatalogue.movies) {
      const ref = `xtream-movie:${xm.stream_id || xm.id}`
      items.push({
        id: String(xm.stream_id || xm.id),
        ref,
        title: xm.name || xm.title || 'Movie',
        mediaType: 'movie',
        genres: xm.category_name ? [xm.category_name] : ['Movies'],
        year: xm.year ? parseInt(String(xm.year), 10) : undefined,
        rating: xm.rating ? parseFloat(String(xm.rating)) : undefined,
        resolution: (xm.name && xm.name.toLowerCase().includes('4k')) ? '4k' : 'hd',
        watchedStatus: watchedSet.has(ref) ? 'watched' : 'unwatched',
        posterUrl: xm.stream_icon,
      })
    }
  }

  // 4. Local media items
  for (const l of localItems) {
    const isSeries = l.kind === 'series' || l.kind === 'episode'
    const ref = `local:${l.id}`
    items.push({
      id: l.id,
      ref,
      title: l.title || l.name,
      mediaType: isSeries ? 'series' : 'movie',
      genres: l.genres || ['Local'],
      year: l.year,
      resolution: l.resolution === '4k' ? '4k' : 'hd',
      watchedStatus: watchedSet.has(ref) ? 'watched' : 'unwatched',
    })
  }

  // 5. Channels
  for (const c of channels) {
    const ref = `channel:${c.id}`
    items.push({
      id: c.id,
      ref,
      title: c.name,
      mediaType: 'channel',
      genres: c.categories || [c.group || 'Live TV'],
      resolution: c.hd ? 'hd' : 'sd',
      watchedStatus: 'unwatched',
      posterUrl: c.logoUrl || undefined,
    })
  }

  return items
}
