import type { Movie, Series, Channel, Programme, XtreamTitle } from '../data/types'
import type { MediaResource } from '../data/personalLibrary'
import type { Library } from '../state/store'
import type { Resolved } from '../data/refs'
import { movieRef, seriesRef, channelRef } from '../data/refs'
import { OPEN_MOVIES, OPEN_SERIES } from '../data/openCatalogue'
import { continueWatching } from './library'
import { isRefKidSafe, filterKidSafeChannels, filterKidSafeTitles, filterKidSafeXtreamTitles } from './kidsMode'
import {
  selectFeaturedSlides,
  hasGenuineProgrammeArt,
  isValidProgrammeTitle,
  type FeaturedSlide,
} from './featuredSelection'
import { computeRecommendations, type RecommendationResults } from './recommendations'
import type { TechnicalFormat } from '../components/TechnicalBadges'
import { PARENT_GENRES, type GenreDefinition } from '../data/genreTaxonomy'
import { classifyMovie, classifySeries, classifyChannel } from './genreClassifier'

export type { FeaturedSlide } from './featuredSelection'

export interface HomeFeedInputs {
  now: number
  demoTitles: boolean
  isKidsMode: boolean
  library: Library
  channels: Channel[]
  findChannel: (id: string) => Channel | undefined
  programmeAt: (c: Channel, t: number) => Programme | undefined
  nextProgramme: (c: Channel, t: number) => Programme | undefined
  allMovies: Movie[]
  allSeries: Series[]
  xtreamCatalogue: {
    movies: XtreamTitle[]
    series: XtreamTitle[]
  }
  mediaLibrary: {
    allResources: MediaResource[]
    mySources: Array<{ resource: MediaResource }>
  }
  localCatalogue?: any
  userPreferences?: {
    ratings?: Record<string, any>
    dislikeFeedback?: Record<string, any>
    hiddenItems?: string[]
    cardDensity?: 'compact' | 'comfortable' | 'spacious'
    timeFormat?: '12h' | '24h'
  }
  prefsTimeFormat?: '12h' | '24h'
}

export type ContinueWatchingItem = Resolved & {
  progress: number
  secondsLeft: number
  remainingFormatted: string
}

export interface LiveChannelFeedItem {
  channel: Channel
  now?: Programme
  next?: Programme
  progress: number
  remainingMinutes: number
  remainingFormatted: string
  isGenuineArt: boolean
}

export interface MovieFeedItem {
  id: string
  ref: string
  title: string
  to: string
  art?: string
  artworkKey?: string | null
  year?: number | string
  genres: string[]
  line?: string
  badges?: TechnicalFormat[]
  isXtream?: boolean
  sourceLabel?: string
}

export interface SeriesFeedItem {
  id: string
  ref: string
  title: string
  to: string
  art?: string
  artworkKey?: string | null
  year?: number | string
  genres: string[]
  seasonsCount?: number
  line?: string
  isXtream?: boolean
  sourceLabel?: string
}

export interface CulturalVaultItem {
  id: string
  ref: string
  title: string
  to: string
  art?: string
  provider: string
  subcategory: string
  line: string
  year?: string
  category: 'movies' | 'series' | 'archive'
}

export interface AudioFeedItem {
  resource: MediaResource
  isPlaying: boolean
}

export interface HomeFeedData {
  featuredSlides: FeaturedSlide[]
  continueWatching: ContinueWatchingItem[]
  liveChannels: LiveChannelFeedItem[]
  movies: MovieFeedItem[]
  series: SeriesFeedItem[]
  culturalVault: CulturalVaultItem[]
  audioItems: MediaResource[]
  favouriteChannels: Channel[]
  recommendations: RecommendationResults
  masterRecommendations: Array<{
    ref: string
    to: string
    title: string
    art: string
    focus: number
    badges: TechnicalFormat[]
    reason?: string
  }>
  recentlyAdded: Array<Movie | Series>
  exploreGenres: Array<{ genre: GenreDefinition; count: number }>
}

/** Format remaining seconds into a concise display string. */
export function formatRemainingTime(seconds: number): string {
  const totalMins = Math.max(1, Math.round(seconds / 60))
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  if (h > 0) {
    return `${h}h ${String(m).padStart(2, '0')}m left`
  }
  return `${m}m left`
}

/**
 * Extract a 4-digit release year from a title string or explicit year parameter.
 */
export function extractReleaseYear(title: string, explicitYear?: number | string | null): string | undefined {
  if (explicitYear !== undefined && explicitYear !== null && explicitYear !== '') {
    const str = String(explicitYear).trim()
    const match = str.match(/\b(19\d\d|20\d\d)\b/)
    if (match) return match[1]
    if (/^\d{4}$/.test(str)) return str
  }
  const match = title.match(/\b(19\d\d|20\d\d)\b/)
  return match ? match[1] : undefined
}

/** Normalize title strings for fuzzy deduplication comparison. */
export function normalizeTitleForDedupe(title: string): string {
  if (!title) return ''
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

export interface MediaIdentityOptions {
  title: string
  year?: number | string | null
  kind?: 'movie' | 'series' | 'episode' | 'channel' | 'recording' | 'audio'
  canonicalId?: string
  sourceId?: string
  streamId?: string
  edition?: string
  season?: number
  episode?: number
  director?: string
}

/** Extract recognized edition or remaster tags from a title string. */
export function extractEditionTag(title: string): string | undefined {
  if (!title) return undefined
  const match = title.match(
    /\b(director'?s cut|extended cut|extended edition|remastered|4k remaster|unrated|special edition|theatrical cut|final cut|redux|anniversary edition)\b/i,
  )
  return match ? match[1]?.toLowerCase().replace(/[^a-z0-9]/g, '') : undefined
}

/**
 * Primary identity hierarchy for media content items:
 * 1. Stable canonical identifier where available (e.g. tmdb:123, imdb:tt123, canonical UUID).
 * 2. Provider and source identifiers with reliable mapping.
 * 3. Content type and meaningful metadata (kind, edition, season/episode, director).
 * 4. Normalised title and release year fallback.
 */
export function getMediaContentIdentity(options: MediaIdentityOptions): string {
  const { title, year, kind, canonicalId, edition, season, episode, director } = options
  if (!title || !title.trim()) return ''

  const detectedEdition = edition
    ? edition.toLowerCase().replace(/[^a-z0-9]/g, '')
    : extractEditionTag(title)

  // 1. Stable Canonical Identifier
  if (canonicalId && canonicalId.trim()) {
    const cleanCanon = canonicalId.trim().toLowerCase()
    let key = `canon:${cleanCanon}`
    if (season !== undefined && episode !== undefined) {
      key += `:s${season}e${episode}`
    }
    if (detectedEdition) {
      key += `:${detectedEdition}`
    }
    return key
  }

  // 2. Meaningful Metadata (edition, episode, director) and Normalised Title / Year Fallback
  const parsedYear = extractReleaseYear(title, year)
  const cleanTitle = title
    .replace(/\b(19\d\d|20\d\d)\b/g, '')
    .replace(
      /\b(director'?s cut|extended cut|extended edition|remastered|4k remaster|unrated|special edition|theatrical cut|final cut|redux|anniversary edition)\b/gi,
      '',
    )
    .replace(/[()[\]{}]/g, '')
    .trim()
  const norm = normalizeTitleForDedupe(cleanTitle || title)
  if (!norm) return ''

  const prefix = kind ? `${kind}:` : ''
  let result = parsedYear ? `${prefix}${norm}_${parsedYear}` : `${prefix}${norm}`

  if (director && director.trim()) {
    result += `_dir:${normalizeTitleForDedupe(director)}`
  }

  if (detectedEdition) {
    result += `_${detectedEdition}`
  }

  if (season !== undefined && episode !== undefined) {
    result += `_s${season}e${episode}`
  }

  return result
}

/**
 * Generate a compound deduplication key that prevents accidental removal of
 * legitimate titles (e.g. different release years, alternate editions or remasters),
 * while cleanly eliminating genuine duplicates across sources.
 */
export function getMediaDedupeKey(
  title: string,
  year?: number | string | null,
  kind?: 'movie' | 'series' | 'episode' | 'channel' | 'recording' | 'audio',
  options?: Partial<MediaIdentityOptions>,
): string {
  return getMediaContentIdentity({
    title,
    year,
    kind,
    ...options,
  })
}

/**
 * Pure data preparation and global deduplication pipeline for the Kinora Home feed.
 * Ensures strict deduplication across rails so no media item repeats on screen.
 */
export function buildHomeFeed(inputs: HomeFeedInputs): HomeFeedData {
  const {
    now,
    demoTitles,
    isKidsMode,
    library,
    channels,
    findChannel,
    programmeAt,
    nextProgramme,
    allMovies,
    allSeries,
    xtreamCatalogue,
    mediaLibrary,
    userPreferences,
    prefsTimeFormat = '24h',
  } = inputs

  const ratings = userPreferences?.ratings ?? {}
  const dislikeFeedback = userPreferences?.dislikeFeedback ?? {}
  const hiddenItems = userPreferences?.hiddenItems ?? []
  const timeFormat = userPreferences?.timeFormat ?? prefsTimeFormat

  // Filter content by kids mode safety
  const safeMovies = filterKidSafeTitles(allMovies, isKidsMode)
  const safeSeries = filterKidSafeTitles(allSeries, isKidsMode)
  const safeXtreamMovies = filterKidSafeXtreamTitles(xtreamCatalogue.movies, isKidsMode)
  const safeXtreamSeries = filterKidSafeXtreamTitles(xtreamCatalogue.series, isKidsMode)
  const safeChannels = filterKidSafeChannels(channels, isKidsMode).filter(
    (c) => !hiddenItems.includes(channelRef(c.id)),
  )

  // Tracking sets for global deduplication
  const seenRefs = new Set<string>()
  const seenDedupeKeys = new Set<string>()
  const seenSeriesTitles = new Set<string>()

  // 1. Featured Hero Slides
  const featuredSlides = selectFeaturedSlides({
    now,
    demoTitles,
    isKidsMode,
    demoMovies: safeMovies,
    demoSeries: safeSeries,
    channels: safeChannels,
    programmeAt,
    xtreamCatalogue,
    mediaLibrary:
      mediaLibrary.mySources.length > 0
        ? mediaLibrary.mySources.map((s) => s.resource)
        : mediaLibrary.allResources,
    favourites: library.favourites,
    timeFormat,
  })

  // Register hero items in deduplication sets so lower rails don't repeat the hero
  if (featuredSlides.length > 0 && featuredSlides[0]) {
    const primaryHero = featuredSlides[0]
    seenRefs.add(primaryHero.ref)
    const hKey = getMediaDedupeKey(primaryHero.title, primaryHero.yearOrYears, primaryHero.kind === 'series' ? 'series' : 'movie')
    if (hKey) seenDedupeKeys.add(hKey)
    if (primaryHero.kind === 'series') {
      const sNorm = normalizeTitleForDedupe(primaryHero.title)
      if (sNorm) seenSeriesTitles.add(sNorm)
    }
  }

  // 2. Continue Watching (strictly genuine playback progress only)
  const rawResume = continueWatching(library, demoTitles)
  const safeResume = isKidsMode
    ? rawResume.filter((item) => {
        const findTitle = (id: string) => allMovies.find((m) => m.id === id) ?? allSeries.find((s) => s.id === id)
        return isRefKidSafe(item.ref, true, findChannel, findTitle)
      })
    : rawResume

  const seenContinueSeries = new Set<string>()
  const continueWatchingItems: ContinueWatchingItem[] = []

  for (const item of safeResume) {
    if (hiddenItems.includes(item.ref) || item.progress <= 0 || item.progress >= 0.98) {
      continue
    }
    const isEpisode = item.ref.startsWith('episode:')
    const seriesNorm = isEpisode ? normalizeTitleForDedupe(item.title) : undefined
    if (seriesNorm) {
      if (seenContinueSeries.has(seriesNorm)) continue
      seenContinueSeries.add(seriesNorm)
      seenSeriesTitles.add(seriesNorm)
    }

    seenRefs.add(item.ref)
    const dKey = getMediaDedupeKey(item.title, undefined, isEpisode ? 'series' : 'movie')
    if (dKey) seenDedupeKeys.add(dKey)

    continueWatchingItems.push({
      ...item,
      remainingFormatted: formatRemainingTime(item.secondsLeft),
    })
  }

  // 3. Live TV Right Now
  const liveChannels: LiveChannelFeedItem[] = safeChannels
    .map((channel) => {
      const nowProg = programmeAt(channel, now)
      const nxtProg = nextProgramme(channel, now)
      const isGenuine = hasGenuineProgrammeArt(nowProg) && isValidProgrammeTitle(nowProg)
      const progStart = nowProg?.start ?? now
      const progStop = nowProg?.stop ?? now + 3600000
      const duration = Math.max(1, progStop - progStart)
      const progress = Math.min(1, Math.max(0, (now - progStart) / duration))
      const remainingMinutes = Math.max(1, Math.round((progStop - now) / 60000))
      const remainingFormatted = `${remainingMinutes}m left`

      return {
        channel,
        now: nowProg,
        next: nxtProg,
        progress,
        remainingMinutes,
        remainingFormatted,
        isGenuineArt: isGenuine,
      }
    })
    .sort((a, b) => {
      // Prioritize channels with genuine programme artwork and valid titles
      if (a.isGenuineArt && !b.isGenuineArt) return -1
      if (!a.isGenuineArt && b.isGenuineArt) return 1
      if (Boolean(a.now) && !Boolean(b.now)) return -1
      if (!Boolean(a.now) && Boolean(b.now)) return 1
      return 0
    })

  // 4. Master Reference Curated Recommendations (demo mode reference)
  // Pre-register curated picks so Movies rail does not duplicate them
  const masterRefRecommendations: Array<{
    ref: string
    to: string
    title: string
    art: string
    focus: number
    badges: TechnicalFormat[]
    reason?: string
  }> = []

  if (demoTitles) {
    const masterDefs: Array<{ id: string; badges: TechnicalFormat[] }> = [
      { id: 'the-outpost', badges: ['4K'] },
      { id: 'neon-district', badges: ['4K', 'HDR'] },
      { id: 'silent-tide', badges: ['4K'] },
      { id: 'the-archive', badges: ['4K'] },
      { id: 'valley-of-ashes', badges: ['4K'] },
      { id: 'redline', badges: ['4K', 'HDR'] },
    ]
    for (const def of masterDefs) {
      const m = safeMovies.find((item) => item.id === def.id)
      const ref = movieRef(def.id)
      if (m && !hiddenItems.includes(ref) && !seenRefs.has(ref)) {
        const dKey = getMediaDedupeKey(m.title, m.year, 'movie')
        if (dKey && seenDedupeKeys.has(dKey)) continue
        seenRefs.add(ref)
        if (dKey) seenDedupeKeys.add(dKey)
        masterRefRecommendations.push({
          ref,
          to: `/movies/${m.id}`,
          title: m.title.toUpperCase(),
          art: m.art,
          focus: m.focus,
          badges: def.badges,
        })
      }
    }
  }

  // 5. Movies Rail (excluding anything featured in Hero, Continue Watching or Master Recommendations)
  const movieItems: MovieFeedItem[] = []
  if (demoTitles) {
    for (const m of safeMovies) {
      const ref = movieRef(m.id)
      const dKey = getMediaDedupeKey(m.title, m.year, 'movie')
      if (seenRefs.has(ref) || (dKey && seenDedupeKeys.has(dKey)) || hiddenItems.includes(ref)) {
        continue
      }
      seenRefs.add(ref)
      if (dKey) seenDedupeKeys.add(dKey)
      movieItems.push({
        id: m.id,
        ref,
        title: m.title,
        to: `/movies/${m.id}`,
        art: m.art,
        year: m.year,
        genres: m.genres,
        line: `${m.year} · ${m.genres[0] || 'Cinema'}`,
        badges: ['4K'],
      })
    }
  } else if (safeXtreamMovies.length > 0) {
    for (const m of safeXtreamMovies) {
      const ref = `xt:${m.sourceId}:${m.id}`
      const dKey = getMediaDedupeKey(m.name, m.year, 'movie')
      if (seenRefs.has(ref) || (dKey && seenDedupeKeys.has(dKey)) || hiddenItems.includes(ref)) {
        continue
      }
      seenRefs.add(ref)
      if (dKey) seenDedupeKeys.add(dKey)
      movieItems.push({
        id: m.id,
        ref,
        title: m.name,
        to: `/movies/${encodeURIComponent(ref)}`,
        artworkKey: m.artworkKey,
        year: m.year ?? undefined,
        genres: [],
        line: m.year ? String(m.year) : undefined,
        isXtream: true,
      })
    }
  } else {
    // Verified open public domain cinema for real environments without connected Xtream VOD
    const openSet = new Set(OPEN_MOVIES.map((om) => om.id))
    for (const m of safeMovies) {
      if (!openSet.has(m.id)) continue
      const ref = movieRef(m.id)
      const dKey = getMediaDedupeKey(m.title, m.year, 'movie')
      if (seenRefs.has(ref) || (dKey && seenDedupeKeys.has(dKey)) || hiddenItems.includes(ref)) {
        continue
      }
      seenRefs.add(ref)
      if (dKey) seenDedupeKeys.add(dKey)
      movieItems.push({
        id: m.id,
        ref,
        title: m.title,
        to: `/movies/${m.id}`,
        art: m.art,
        year: m.year,
        genres: m.genres,
        line: `${m.year} · ${m.genres[0] || 'Cinema'}`,
        badges: ['4K'],
      })
    }
  }

  // 6. Series Rail (excluding series in Hero or Continue Watching)
  const seriesItems: SeriesFeedItem[] = []
  if (demoTitles) {
    for (const s of safeSeries) {
      const ref = seriesRef(s.id)
      const dKey = getMediaDedupeKey(s.title, s.years, 'series')
      const sNorm = normalizeTitleForDedupe(s.title)
      if (
        seenRefs.has(ref) ||
        (dKey && seenDedupeKeys.has(dKey)) ||
        (sNorm && seenSeriesTitles.has(sNorm)) ||
        hiddenItems.includes(ref)
      ) {
        continue
      }
      seenRefs.add(ref)
      if (dKey) seenDedupeKeys.add(dKey)
      if (sNorm) seenSeriesTitles.add(sNorm)
      seriesItems.push({
        id: s.id,
        ref,
        title: s.title,
        to: `/series/${s.id}`,
        art: s.art,
        year: s.years,
        genres: s.genres,
        seasonsCount: s.seasons.length,
        line: `${s.seasons.length} ${s.seasons.length === 1 ? 'Season' : 'Seasons'} · ${s.genres[0] || 'Drama'}`,
      })
    }
  } else if (safeXtreamSeries.length > 0) {
    for (const s of safeXtreamSeries) {
      const ref = `xt:${s.sourceId}:${s.id}`
      const dKey = getMediaDedupeKey(s.name, s.year, 'series')
      const sNorm = normalizeTitleForDedupe(s.name)
      if (
        seenRefs.has(ref) ||
        (dKey && seenDedupeKeys.has(dKey)) ||
        (sNorm && seenSeriesTitles.has(sNorm)) ||
        hiddenItems.includes(ref)
      ) {
        continue
      }
      seenRefs.add(ref)
      if (dKey) seenDedupeKeys.add(dKey)
      if (sNorm) seenSeriesTitles.add(sNorm)
      seriesItems.push({
        id: s.id,
        ref,
        title: s.name,
        to: `/series/${encodeURIComponent(ref)}`,
        artworkKey: s.artworkKey,
        year: s.year ?? undefined,
        genres: [],
        line: s.year ? String(s.year) : 'Series',
        isXtream: true,
      })
    }
  } else {
    // Verified open series for real environments without connected Xtream VOD
    const openSet = new Set(OPEN_SERIES.map((os) => os.id))
    for (const s of safeSeries) {
      if (!openSet.has(s.id)) continue
      const ref = seriesRef(s.id)
      const dKey = getMediaDedupeKey(s.title, s.years, 'series')
      const sNorm = normalizeTitleForDedupe(s.title)
      if (
        seenRefs.has(ref) ||
        (dKey && seenDedupeKeys.has(dKey)) ||
        (sNorm && seenSeriesTitles.has(sNorm)) ||
        hiddenItems.includes(ref)
      ) {
        continue
      }
      seenRefs.add(ref)
      if (dKey) seenDedupeKeys.add(dKey)
      if (sNorm) seenSeriesTitles.add(sNorm)
      seriesItems.push({
        id: s.id,
        ref,
        title: s.title,
        to: `/series/${s.id}`,
        art: s.art,
        year: s.years,
        genres: s.genres,
        seasonsCount: s.seasons.length,
        line: `${s.seasons.length} ${s.seasons.length === 1 ? 'Season' : 'Seasons'} · ${s.genres[0] || 'Drama'}`,
      })
    }
  }

  // 7. Cultural Vault & Historical Archives (deduplicated public domain resources)
  const culturalVault: CulturalVaultItem[] = []
  const publicArchiveResources = mediaLibrary.allResources.filter(
    (r) =>
      r.category === 'movies' ||
      r.category === 'films' ||
      r.category === 'series' ||
      r.subcategory.includes('film') ||
      r.subcategory.includes('cinema') ||
      r.subcategory.includes('archive') ||
      r.subcategory.includes('broadcasting'),
  )

  for (const r of publicArchiveResources) {
    const isSeriesResource = r.category === 'series' || r.subcategory.includes('series')
    const dKey = getMediaDedupeKey(r.name, undefined, isSeriesResource ? 'series' : 'movie')
    if (seenRefs.has(r.id) || (dKey && seenDedupeKeys.has(dKey)) || hiddenItems.includes(r.id)) {
      continue
    }
    seenRefs.add(r.id)
    if (dKey) seenDedupeKeys.add(dKey)
    culturalVault.push({
      id: r.id,
      ref: r.id,
      title: r.name,
      to: isSeriesResource ? `/series/${encodeURIComponent(r.id)}` : `/movies/${encodeURIComponent(r.id)}`,
      art: r.artworkUrl,
      provider: r.provider || 'Archive',
      subcategory: r.subcategory || 'Public Domain',
      line: [r.provider, r.subcategory].filter(Boolean).join(' · '),
      category: isSeriesResource ? 'series' : 'movies',
    })
    if (culturalVault.length >= 16) break
  }

  // 8. Live Radio & Spoken Audio
  const audioItems = mediaLibrary.allResources.filter(
    (r) => r.category === 'radio' && r.playbackUrl && !hiddenItems.includes(r.id),
  )

  // 9. Favourite Channels (excluding channels already visible in Live TV Right Now)
  const liveChannelIds = new Set(liveChannels.slice(0, 8).map((l) => l.channel.id))
  const favouriteChannels = library.favourites
    .filter((r) => r.startsWith('channel:') && !hiddenItems.includes(r))
    .map((r) => findChannel(r.slice(8)))
    .filter((c): c is Channel => Boolean(c) && !liveChannelIds.has(c!.id))

  // 10. Recommendations Engine
  const recs = computeRecommendations({
    ratings,
    dislikeFeedback,
    history: library.history,
    favourites: library.favourites,
    watchlist: library.watchlist,
    hiddenItems,
    demoTitles,
    demoMovies: safeMovies,
    demoSeries: safeSeries,
    channels: safeChannels,
    xtreamMovies: safeXtreamMovies,
    xtreamSeries: safeXtreamSeries,
    programmeAt,
    now,
  })

  // 11. Recently Added Titles (strictly respect demoTitles vs real open catalogue)
  const openMovieIdSet = new Set(OPEN_MOVIES.map((m) => m.id))
  const openSeriesIdSet = new Set(OPEN_SERIES.map((s) => s.id))
  const eligibleRecentlyAdded = demoTitles
    ? [...safeMovies, ...safeSeries]
    : [
        ...safeMovies.filter((m) => openMovieIdSet.has(m.id)),
        ...safeSeries.filter((s) => openSeriesIdSet.has(s.id)),
      ]
  const recentlyAdded = eligibleRecentlyAdded
    .filter((t) => !hiddenItems.includes(t.kind === 'movie' ? movieRef(t.id) : seriesRef(t.id)))
    .sort((a, b) => b.added.localeCompare(a.added))
    .slice(0, 12)

  // 12. Explore Genres (Active canonical genres matching available library content)
  const genreCounts = new Map<string, number>()
  for (const m of safeMovies) {
    const c = classifyMovie(m)
    for (const g of c.canonicalGenres) {
      genreCounts.set(g.id, (genreCounts.get(g.id) ?? 0) + 1)
    }
  }
  for (const s of safeSeries) {
    const c = classifySeries(s)
    for (const g of c.canonicalGenres) {
      genreCounts.set(g.id, (genreCounts.get(g.id) ?? 0) + 1)
    }
  }
  for (const ch of safeChannels) {
    const c = classifyChannel(ch)
    for (const g of c.canonicalGenres) {
      genreCounts.set(g.id, (genreCounts.get(g.id) ?? 0) + 1)
    }
  }

  const exploreGenres = PARENT_GENRES
    .map((g) => ({ genre: g, count: genreCounts.get(g.id) || 0 }))
    .filter(({ genre, count }) => count > 0 || genre.featured)
    .slice(0, 12)

  return {
    featuredSlides,
    continueWatching: continueWatchingItems,
    liveChannels,
    movies: movieItems,
    series: seriesItems,
    culturalVault,
    audioItems,
    favouriteChannels,
    recommendations: recs,
    masterRecommendations: masterRefRecommendations,
    recentlyAdded,
    exploreGenres,
  }
}
