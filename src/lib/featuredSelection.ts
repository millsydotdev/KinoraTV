import type { Movie, Series, Channel, Programme, XtreamTitle } from '../data/types'
import { movieRef, seriesRef, channelRef } from '../data/refs'
import { featured, movies, series } from '../data/catalog'
import { filterKidSafeTitles, filterKidSafeChannels, filterKidSafeXtreamTitles } from './kidsMode'
import { clock } from './time'
import { categoryLabel } from '../state/playlists'
import type { MediaResource } from '../data/personalLibrary'

export interface FeaturedSlide {
  id: string
  kind: 'movie' | 'series' | 'live' | 'media'
  ref: string
  title: string
  tagline?: string
  synopsis?: string | null
  kicker: string
  badgeIcon?: string
  art?: string
  backdropUrl?: string
  logoUrl?: string
  imdbId?: string
  artworkKey?: string | null
  focus?: number
  genres?: string[]
  yearOrYears?: string | number
  runtime?: string | null
  certificate?: string
  timeRemaining?: string | null
  to: string
  playUrl: string
  channel?: Channel
  channelMarkText?: string
  channelMarkTone?: string
  programme?: Programme
  isLive?: boolean
}

export interface FeaturedSelectionInputs {
  now: number
  demoTitles: boolean
  isKidsMode?: boolean
  demoMovies?: Movie[]
  demoSeries?: Series[]
  channels?: Channel[]
  programmeAt?: (c: Channel, t: number) => Programme | undefined
  xtreamCatalogue?: {
    movies: XtreamTitle[]
    series: XtreamTitle[]
  }
  mediaLibrary?: MediaResource[]
  favourites?: string[]
  timeFormat?: '12h' | '24h'
}

export function isValidProgrammeTitle(p: Programme | undefined): boolean {
  const t = p?.title?.trim() ?? ''
  if (!t || t.startsWith('.')) return false
  const lower = t.toLowerCase()
  return (
    !lower.includes('programmes start at') &&
    !lower.includes('off air') &&
    !lower.includes('close down') &&
    !lower.includes('cease transmission')
  )
}

export function hasGenuineProgrammeArt(p: Programme | undefined): boolean {
  return Boolean(p?.icon || p?.art)
}

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

/**
 * Intelligent, deliberate featured-content selection strategy.
 * Balances genuine content across movies, series, live TV, and media resources.
 * Enforces strict schedule validity (rejects expired programmes), scoring,
 * and diversity (at most 1 item per channel, distinct categories).
 */
export function selectFeaturedSlides(inputs: FeaturedSelectionInputs): FeaturedSlide[] {
  const {
    now,
    demoTitles,
    isKidsMode = false,
    demoMovies = movies,
    demoSeries = series,
    channels = [],
    programmeAt,
    xtreamCatalogue = { movies: [], series: [] },
    mediaLibrary = [],
    favourites = [],
    timeFormat = '24h',
  } = inputs

  const favSet = new Set(favourites)

  // 1. DEMO / SAMPLE MODE: Return deterministic, premium slides
  if (demoTitles) {
    let pool: Array<Movie | Series>
    if (isKidsMode) {
      pool = filterKidSafeTitles([...demoMovies, ...demoSeries], true)
    } else {
      const harbour = demoMovies.find((m) => m.id === 'harbour-lights')
      const ninthWard = demoSeries.find((s) => s.id === 'ninth-ward')
      const lowOrbit = demoMovies.find((m) => m.id === 'low-orbit')
      const fathom = demoSeries.find((s) => s.id === 'fathom')
      pool = [harbour, ninthWard, lowOrbit, fathom].filter(
        (item): item is Movie | Series => Boolean(item),
      )
      if (pool.length === 0) {
        pool = featured.slice(0, 4)
      }
    }

    return pool.slice(0, 4).map((t) => {
      const isMovie = t.kind === 'movie'
      const ref = isMovie ? movieRef(t.id) : seriesRef(t.id)
      const formattedRuntime = isMovie && t.runtime ? formatMinutes(t.runtime) : null
      return {
        id: t.id,
        kind: t.kind,
        ref,
        title: t.title,
        tagline: t.tagline,
        synopsis: t.synopsis,
        kicker: isMovie ? 'FEATURED MOVIE' : 'FEATURED SERIES',
        badgeIcon: isMovie ? 'film' : 'tv',
        art: t.art,
        backdropUrl: t.backdropUrl || t.art,
        imdbId: t.imdbId,
        focus: t.focus,
        genres: t.genres,
        yearOrYears: isMovie ? t.year : t.years,
        runtime: formattedRuntime,
        certificate: t.certificate,
        to: isMovie ? `/movies/${t.id}` : `/series/${t.id}`,
        playUrl: isMovie ? `/watch/${encodeURIComponent(ref)}` : `/series/${t.id}`,
      }
    })
  }

  // 2. REAL USER MODE: Intelligent multi-source selection
  const slides: FeaturedSlide[] = []
  const usedChannelIds = new Set<string>()
  const usedCategories = new Set<string>()

  // A. Candidate On-Demand Movies / Series (from Xtream sources if connected)
  const safeXtreamMovies = filterKidSafeXtreamTitles(xtreamCatalogue.movies, isKidsMode)
  const safeXtreamSeries = filterKidSafeXtreamTitles(xtreamCatalogue.series, isKidsMode)

  if (safeXtreamMovies.length > 0) {
    const scoredMovies = safeXtreamMovies.map((m) => {
      let score = 0
      if (m.artworkKey) score += 50
      if (favSet.has(`movie:xt:${m.sourceId}:${m.id}`)) score += 40
      if (m.plot && m.plot.trim().length > 20) score += 15
      if (m.year && m.year >= 2020) score += 10
      return { item: m, score }
    })
    scoredMovies.sort((a, b) => b.score - a.score)
    const topMovie = scoredMovies[0]?.item
    if (topMovie) {
      const routeId = `xt:${topMovie.sourceId}:${topMovie.id}`
      slides.push({
        id: routeId,
        kind: 'movie',
        ref: `movie:${routeId}`,
        title: topMovie.name,
        synopsis: topMovie.plot,
        kicker: 'Featured movie',
        badgeIcon: 'film',
        artworkKey: topMovie.artworkKey,
        yearOrYears: topMovie.year ?? undefined,
        genres: ['On Demand'],
        to: `/movies/${encodeURIComponent(routeId)}`,
        playUrl: `/movies/${encodeURIComponent(routeId)}`,
      })
    }
  } else if (safeXtreamSeries.length > 0) {
    const scoredSeries = safeXtreamSeries.map((s) => {
      let score = 0
      if (s.artworkKey) score += 50
      if (favSet.has(`series:xt:${s.sourceId}:${s.id}`)) score += 40
      if (s.plot && s.plot.trim().length > 20) score += 15
      return { item: s, score }
    })
    scoredSeries.sort((a, b) => b.score - a.score)
    const topSeries = scoredSeries[0]?.item
    if (topSeries) {
      const routeId = `xt:${topSeries.sourceId}:${topSeries.id}`
      slides.push({
        id: routeId,
        kind: 'series',
        ref: `series:${routeId}`,
        title: topSeries.name,
        synopsis: topSeries.plot,
        kicker: 'Featured series',
        badgeIcon: 'tv',
        artworkKey: topSeries.artworkKey,
        yearOrYears: topSeries.year ?? undefined,
        genres: ['On Demand'],
        to: `/series/${encodeURIComponent(routeId)}`,
        playUrl: `/series/${encodeURIComponent(routeId)}`,
      })
    }
  }

  // B. Live TV Candidate Scoring and Category Balancing
  const safeChannels = filterKidSafeChannels(channels, isKidsMode)
  interface LiveCandidate {
    channel: Channel
    programme?: Programme
    score: number
    category: string
  }

  const liveCandidates: LiveCandidate[] = []

  for (const c of safeChannels) {
    const category = categoryLabel(c)
    const p = programmeAt ? programmeAt(c, now) : undefined

    // Strict schedule validity: programme must be actively on air right now
    const isActivelyAiring = p && p.start <= now && now < p.stop && isValidProgrammeTitle(p)

    let score = 0
    if (isActivelyAiring) {
      if (hasGenuineProgrammeArt(p)) score += 50
      if (favSet.has(channelRef(c.id))) score += 40
      if (p.desc && p.desc.trim().length > 15) score += 15
      const remainingSeconds = p.stop - now
      if (remainingSeconds >= 900) score += 10 // at least 15 mins left
      liveCandidates.push({ channel: c, programme: p, score, category })
    } else {
      // Fallback candidate if no active programme: score based on channel mark and favourite
      if (favSet.has(channelRef(c.id))) score += 30
      if (c.mark.tone && c.mark.text) score += 15
      liveCandidates.push({ channel: c, programme: undefined, score, category })
    }
  }

  // Sort descending by score
  liveCandidates.sort((a, b) => b.score - a.score)

  // Enforce channel diversity (no duplicates) and category variety
  // First pass: distinct categories
  for (const cand of liveCandidates) {
    if (slides.length >= 4) break
    if (usedChannelIds.has(cand.channel.id)) continue
    if (!usedCategories.has(cand.category)) {
      usedChannelIds.add(cand.channel.id)
      usedCategories.add(cand.category)
      slides.push(buildLiveSlide(cand.channel, cand.programme, timeFormat))
    }
  }

  // Second pass: if we still need slides up to 3 live items, allow same category with different channel
  if (slides.length < 3) {
    for (const cand of liveCandidates) {
      if (slides.length >= 3) break
      if (usedChannelIds.has(cand.channel.id)) continue
      usedChannelIds.add(cand.channel.id)
      slides.push(buildLiveSlide(cand.channel, cand.programme, timeFormat))
    }
  }

  // C. Cultural / Documentary / Media Resource (from personal media library)
  if (mediaLibrary.length > 0 && slides.length < 4) {
    const scoredMedia = mediaLibrary.map((r) => {
      let score = 0
      if (r.artworkUrl) score += 40
      if (favSet.has(`media:${r.id}`)) score += 30
      if (r.description && r.description.trim().length > 15) score += 15
      return { resource: r, score }
    })
    scoredMedia.sort((a, b) => b.score - a.score)
    for (const { resource: topMedia } of scoredMedia) {
      if (slides.length >= 4) break
      if (slides.some((s) => s.id === topMedia.id)) continue
      const cat = topMedia.category.replace('-', ' ')
      slides.push({
        id: topMedia.id,
        kind: 'media',
        ref: `media:${topMedia.id}`,
        title: topMedia.name,
        synopsis: topMedia.description,
        kicker: `FEATURED ${cat.toUpperCase()}`,
        badgeIcon: 'sparkles',
        art: topMedia.artworkUrl,
        genres: [topMedia.provider || cat],
        to: `/library?resource=${topMedia.id}`,
        playUrl: topMedia.playbackUrl || topMedia.url || `/library?resource=${topMedia.id}`,
      })
    }
  }

  // If still under 4 slides, add remaining live channels
  for (const cand of liveCandidates) {
    if (slides.length >= 4) break
    if (usedChannelIds.has(cand.channel.id)) continue
    usedChannelIds.add(cand.channel.id)
    slides.push(buildLiveSlide(cand.channel, cand.programme, timeFormat))
  }

  return slides
}

export function normalizeProgrammeArt(raw: string | undefined | null, targetAspect: '16:9' | '2:3' = '16:9'): string | undefined {
  if (!raw) return undefined
  if (raw.includes('images.metadata.sky.com/pd-image/')) {
    if (targetAspect === '16:9' && raw.endsWith('/cover')) {
      return raw.replace(/\/cover$/, '/16-9')
    }
    if (targetAspect === '2:3' && raw.endsWith('/16-9')) {
      return raw.replace(/\/16-9$/, '/cover')
    }
  }
  return raw
}

function buildLiveSlide(
  c: Channel,
  p: Programme | undefined,
  timeFormat: '12h' | '24h',
): FeaturedSlide {
  const category = categoryLabel(c)
  let timeStr: string | null = null
  if (p) {
    const endClock = clock(p.stop, timeFormat)
    timeStr = `until ${endClock}`
  }

  const rawArt = p?.art || (hasGenuineProgrammeArt(p) && !p?.icon?.includes('imgur.com') ? p?.icon : undefined) || undefined
  const landscapeStill = normalizeProgrammeArt(rawArt, '16:9')
  const isTransparentWordmark = Boolean(
    rawArt &&
    /\/logos?\/|title[-_]logo|wordmark|clearart|\.svg/i.test(rawArt) &&
    !/cover|poster|backdrop|still|thumb/i.test(rawArt)
  )

  return {
    id: c.id,
    kind: 'live',
    ref: channelRef(c.id),
    title: p?.title || c.name,
    synopsis: p?.desc || `Live broadcast on ${c.name}.`,
    kicker: `Now on ${c.name}`,
    badgeIcon: 'tv',
    art: landscapeStill,
    backdropUrl: landscapeStill,
    logoUrl: isTransparentWordmark ? rawArt : undefined,
    channel: c,
    programme: p,
    channelMarkText: c.mark.text,
    channelMarkTone: c.mark.tone,
    genres: [category],
    timeRemaining: timeStr,
    to: `/live?channel=${c.id}`,
    playUrl: `/live?channel=${c.id}`,
    isLive: true,
  }
}
