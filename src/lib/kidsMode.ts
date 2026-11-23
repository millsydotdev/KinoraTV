import type { Channel, Movie, Programme, Series, Title, XtreamTitle } from '../data/types'
import type { MediaResource } from '../data/personalLibrary'

const ALLOWED_KIDS_CERTIFICATES: readonly string[] = ['U', 'PG', 'G', 'TV-Y', 'TV-Y7', 'TV-G', 'TV-PG']

const ALLOWED_UNRATED_GENRES: readonly string[] = [
  'animation',
  'family',
  'children',
  'kids',
  'comedy',
  'adventure',
  'documentary',
  'nature',
  'educational',
  'music',
  'fantasy',
]

const BLOCKED_KIDS_GENRES: readonly string[] = [
  'horror',
  'erotic',
  'adult',
  'crime',
  'slasher',
  'violence',
  'gore',
  'thriller',
  'war',
]

const BLOCKED_CHANNEL_TERMS: readonly string[] = [
  'xxx',
  'adult',
  'erotic',
  '18+',
  'gambling',
  'casino',
  'horror',
  'gore',
  'playboy',
  'penthouse',
  'hustler',
  'murder',
  'brutal',
  'slasher',
  'massacre',
  'porn',
]

const BLOCKED_QUERY_TERMS: readonly string[] = [
  'xxx',
  'porn',
  'adult',
  'erotic',
  'sex',
  'naked',
  'nude',
  '18+',
  'gambling',
  'gore',
  'nsfw',
]

/** Checks whether a Movie or Series meets Kids Mode safety guidelines. */
export function isTitleKidSafe(title: Title | Movie | Series): boolean {
  if (!title) return false
  const cert = title.certificate ? String(title.certificate).toUpperCase().trim() : ''
  if (cert && !ALLOWED_KIDS_CERTIFICATES.includes(cert)) {
    return false
  }

  const rawGenres = Array.isArray(title.genres) ? title.genres.map((g) => g.toLowerCase().trim()) : []
  for (const g of rawGenres) {
    if (BLOCKED_KIDS_GENRES.includes(g)) {
      return false
    }
  }

  // Explicit policy for unrated content:
  // Unrated content in family/safe categories with zero blocked terms is allowed.
  // Unrated content in adult/crime/horror/mature categories or unclassified content is strictly blocked.
  if (!cert || cert === 'UNRATED' || cert === 'NR') {
    if (rawGenres.length === 0) {
      return false
    }
    const hasSafeCategory = rawGenres.some((g) => ALLOWED_UNRATED_GENRES.includes(g))
    if (!hasSafeCategory) {
      return false
    }
  }

  const text = `${title.title || ''} ${title.synopsis || ''} ${title.tagline || ''}`.toLowerCase()
  for (const term of BLOCKED_CHANNEL_TERMS) {
    if (text.includes(term)) return false
  }

  return true
}

/** Checks whether a Live TV channel meets Kids Mode safety guidelines. */
export function isChannelKidSafe(channel: Channel): boolean {
  if (!channel) return false
  const name = (channel.name || '').toLowerCase()
  const group = (channel.group || '').toLowerCase()
  const cats = (channel.categories || []).map((c) => c.toLowerCase())

  for (const term of BLOCKED_CHANNEL_TERMS) {
    if (name.includes(term) || group.includes(term) || cats.some((c) => c.includes(term))) {
      return false
    }
  }

  return true
}

/** Checks whether an individual EPG broadcast programme is kid-safe. */
export function isProgrammeKidSafe(programme: Programme): boolean {
  if (!programme) return false
  const text = `${programme.title || ''} ${programme.desc || ''} ${programme.category || ''}`.toLowerCase()
  for (const term of BLOCKED_CHANNEL_TERMS) {
    if (text.includes(term)) return false
  }
  if (text.includes('[15]') || text.includes('[18]') || text.includes('(18+)') || text.includes('rated 18')) {
    return false
  }
  return true
}

/** Checks whether an on-demand Xtream title meets Kids Mode guidelines. */
export function isXtreamTitleKidSafe(title: XtreamTitle): boolean {
  if (!title) return false
  const text = `${title.name || ''} ${title.plot || ''}`.toLowerCase()
  for (const term of BLOCKED_CHANNEL_TERMS) {
    if (text.includes(term)) return false
  }
  return true
}

/** Filters a list of on-demand Xtream titles based on active Kids Mode status. */
export function filterKidSafeXtreamTitles(titles: XtreamTitle[], isKidsMode: boolean): XtreamTitle[] {
  if (!isKidsMode) return titles
  return titles.filter(isXtreamTitleKidSafe)
}

/** Checks whether a discovered media resource is kid-safe. */
export function isResourceKidSafe(resource: MediaResource): boolean {
  if (!resource) return false
  const text = `${resource.name || ''} ${resource.description || ''} ${resource.category || ''} ${resource.tags.join(' ')}`.toLowerCase()
  for (const term of BLOCKED_CHANNEL_TERMS) {
    if (text.includes(term)) return false
  }
  return true
}

/** Checks whether a content reference string resolves to kid-safe content. */
export function isRefKidSafe(
  ref: string,
  isKidsMode: boolean,
  findChannel: (id: string) => Channel | undefined,
  findTitle: (id: string) => Title | undefined,
): boolean {
  if (!isKidsMode) return true
  if (!ref) return false

  if (ref.startsWith('channel:')) {
    const channelId = ref.slice(8)
    const ch = findChannel(channelId)
    return ch ? isChannelKidSafe(ch) : false
  }

  if (ref.startsWith('movie:')) {
    const movieId = ref.slice(6)
    const m = findTitle(movieId)
    return m ? isTitleKidSafe(m) : false
  }

  if (ref.startsWith('series:')) {
    const seriesId = ref.slice(7)
    const s = findTitle(seriesId)
    return s ? isTitleKidSafe(s) : false
  }

  if (ref.startsWith('episode:')) {
    const seriesId = ref.slice(8).split('/')[0] ?? ''
    const s = findTitle(seriesId)
    return s ? isTitleKidSafe(s) : false
  }

  return true
}

/** Filters a list of channels based on active Kids Mode status. */
export function filterKidSafeChannels(channels: Channel[], isKidsMode: boolean): Channel[] {
  if (!isKidsMode) return channels
  return channels.filter(isChannelKidSafe)
}

/** Filters a list of movies or series based on active Kids Mode status. */
export function filterKidSafeTitles<T extends Title>(titles: T[], isKidsMode: boolean): T[] {
  if (!isKidsMode) return titles
  return titles.filter(isTitleKidSafe)
}

/** Filters a list of EPG programmes based on active Kids Mode status. */
export function filterKidSafeProgrammes(programmes: Programme[], isKidsMode: boolean): Programme[] {
  if (!isKidsMode) return programmes
  return programmes.filter(isProgrammeKidSafe)
}

/** Filters discovered media resources based on active Kids Mode status. */
export function filterKidSafeResources(resources: MediaResource[], isKidsMode: boolean): MediaResource[] {
  if (!isKidsMode) return resources
  return resources.filter(isResourceKidSafe)
}

/** Checks whether a user search query contains prohibited terms in Kids Mode. */
export function isSearchQueryKidSafe(query: string): boolean {
  if (!query) return true
  const lower = query.toLowerCase().trim()
  for (const term of BLOCKED_QUERY_TERMS) {
    if (lower.includes(term)) return false
  }
  return true
}

export interface KidsCurfewSettings {
  bedtimeHour?: number // 0-23, e.g. 20 (8:00 PM)
  bedtimeMinute?: number // 0-59, e.g. 0
  dailyLimitMinutes?: number // e.g. 60
}

/** Checks whether the current time falls within the bedtime curfew (e.g. 8:00 PM to 6:00 AM). */
export function isWithinBedtimeCurfew(
  now: Date,
  bedtimeHour = 20,
  bedtimeMinute = 0
): boolean {
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const curfewStartMinutes = bedtimeHour * 60 + bedtimeMinute
  const curfewEndMinutes = 6 * 60 // 6:00 AM morning unlock

  // If curfew starts in the evening (e.g. 20:00) and ends in the morning (06:00)
  if (curfewStartMinutes > curfewEndMinutes) {
    return currentMinutes >= curfewStartMinutes || currentMinutes < curfewEndMinutes
  }
  return currentMinutes >= curfewStartMinutes && currentMinutes < curfewEndMinutes
}

/** Checks whether total watch time today has exceeded the daily allowance limit. */
export function isDailyLimitExceeded(
  watchedSecondsToday: number,
  dailyLimitMinutes = 60
): boolean {
  if (dailyLimitMinutes <= 0) return false
  return watchedSecondsToday >= dailyLimitMinutes * 60
}
