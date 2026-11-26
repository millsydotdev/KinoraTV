export type MatrixMediaType = 'channel' | 'film' | 'series' | 'episode' | 'resource'

export interface MatrixItem {
  id: string
  ref: string
  title: string
  cleanTitle: string
  mediaType: MatrixMediaType
  genres: string[]
  year?: number
  rating?: number
  resolution?: '4k' | 'hd' | 'sd'
  overview?: string
  isFavourite?: boolean
  watchedStatus?: 'unwatched' | 'in-progress' | 'watched'
  to: string
  subText: string
  badgeText?: string
  rawItem?: any
}

export interface MatrixFilterOptions {
  query: string
  mediaType?: MatrixMediaType | 'all'
  genre?: string
  yearMin?: number
  yearMax?: number
  minRating?: number
  resolution?: 'all' | '4k' | 'hd' | 'sd'
  watchedStatus?: 'all' | 'unwatched' | 'in-progress' | 'watched'
  favouriteOnly?: boolean
  limitPerGroup?: number
}

export interface MatrixSearchResults {
  channels: MatrixItem[]
  films: MatrixItem[]
  series: MatrixItem[]
  episodes: MatrixItem[]
  resources: MatrixItem[]
  totalMatches: number
  availableGenres: string[]
  yearRange: [number, number]
}

export function normalizeSearchString(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export function scoreMatrixItem(item: MatrixItem, queryNorm: string): number {
  if (!queryNorm) return 1 // If query is blank, all pass with base score

  const titleNorm = normalizeSearchString(item.title)
  const cleanNorm = normalizeSearchString(item.cleanTitle)

  // 1. Exact match
  if (titleNorm === queryNorm || cleanNorm === queryNorm) {
    return 100 + (item.isFavourite ? 10 : 0)
  }

  // 2. Starts with query
  if (titleNorm.startsWith(queryNorm) || cleanNorm.startsWith(queryNorm)) {
    return 80 + (item.isFavourite ? 10 : 0)
  }

  // 3. Word boundary match
  const words = titleNorm.split(/\s+/)
  if (words.some((w) => w.startsWith(queryNorm))) {
    return 65 + (item.isFavourite ? 10 : 0)
  }

  // 4. Substring anywhere in title
  if (titleNorm.includes(queryNorm) || cleanNorm.includes(queryNorm)) {
    return 50 + (item.isFavourite ? 10 : 0)
  }

  // 5. Genre match
  if (item.genres.some((g) => normalizeSearchString(g).includes(queryNorm))) {
    return 30
  }

  // 6. Overview/synopsis match
  if (item.overview && normalizeSearchString(item.overview).includes(queryNorm)) {
    return 20
  }

  return 0
}

export function executeMatrixSearch(
  items: MatrixItem[],
  options: MatrixFilterOptions,
): MatrixSearchResults {
  const queryNorm = normalizeSearchString(options.query || '')
  const limit = options.limitPerGroup ?? 12

  const genreSet = new Set<string>()
  let minYear = 2099
  let maxYear = 1900

  // Filter and score
  const scoredItems: { item: MatrixItem; score: number }[] = []

  for (const item of items) {
    // Collect facets
    for (const g of item.genres) genreSet.add(g)
    if (item.year) {
      if (item.year < minYear) minYear = item.year
      if (item.year > maxYear) maxYear = item.year
    }

    // Media type filter
    if (options.mediaType && options.mediaType !== 'all') {
      if (item.mediaType !== options.mediaType) continue
    }

    // Genre filter
    if (options.genre && options.genre !== 'all') {
      const gNorm = normalizeSearchString(options.genre)
      if (!item.genres.some((g) => normalizeSearchString(g).includes(gNorm))) {
        continue
      }
    }

    // Year range filter
    if (options.yearMin !== undefined && item.year !== undefined && item.year < options.yearMin) {
      continue
    }
    if (options.yearMax !== undefined && item.year !== undefined && item.year > options.yearMax) {
      continue
    }

    // Minimum rating filter
    if (options.minRating !== undefined && item.rating !== undefined && item.rating < options.minRating) {
      continue
    }

    // Resolution filter
    if (options.resolution && options.resolution !== 'all') {
      if (item.resolution !== options.resolution) continue
    }

    // Watched status filter
    if (options.watchedStatus && options.watchedStatus !== 'all') {
      if (item.watchedStatus !== options.watchedStatus) continue
    }

    // Favourites only filter
    if (options.favouriteOnly && !item.isFavourite) {
      continue
    }

    // Scoring
    const score = scoreMatrixItem(item, queryNorm)
    if (score > 0) {
      scoredItems.push({ item, score })
    }
  }

  // Sort by score descending, then rating descending, then title ascending
  scoredItems.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score
    const ratingA = a.item.rating ?? 0
    const ratingB = b.item.rating ?? 0
    if (ratingA !== ratingB) return ratingB - ratingA
    return a.item.title.localeCompare(b.item.title)
  })

  // Group buckets
  const channels: MatrixItem[] = []
  const films: MatrixItem[] = []
  const series: MatrixItem[] = []
  const episodes: MatrixItem[] = []
  const resources: MatrixItem[] = []

  for (const { item } of scoredItems) {
    switch (item.mediaType) {
      case 'channel':
        if (channels.length < limit) channels.push(item)
        break
      case 'film':
        if (films.length < limit) films.push(item)
        break
      case 'series':
        if (series.length < limit) series.push(item)
        break
      case 'episode':
        if (episodes.length < limit) episodes.push(item)
        break
      case 'resource':
        if (resources.length < limit) resources.push(item)
        break
    }
  }

  return {
    channels,
    films,
    series,
    episodes,
    resources,
    totalMatches: scoredItems.length,
    availableGenres: Array.from(genreSet).sort((a, b) => a.localeCompare(b)),
    yearRange: [minYear <= maxYear ? minYear : 1970, maxYear >= minYear ? maxYear : 2026],
  }
}
