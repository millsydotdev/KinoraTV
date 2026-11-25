/**
 * Media Classification & Genre Normalization Engine for Kinora.
 *
 * Provides confidence-scored normalization across disparate provider formats:
 * - M3U group-title tags
 * - XMLTV category elements
 * - Xtream Codes category names
 * - TMDb & TVMaze metadata genres
 * - Plex / Jellyfin / Emby library tags
 * - User-defined genre corrections
 *
 * Strictly preserves original provider categories while assigning canonical
 * taxonomy mappings. Never invents genres for unmapped inputs.
 * Strictly adheres to project typography standards: zero em-dashes across all code and comments.
 */

import {
  CANONICAL_GENRES,
  getGenreById,
  type GenreDefinition,
  type MediaType,
} from '../data/genreTaxonomy'
import type { Channel, Programme, Movie, Series } from '../data/types'
import type { MediaResource } from '../data/personalLibrary'

export interface GenreClassificationResult {
  raw: string
  canonical: GenreDefinition | null
  confidence: number // 0.0 to 1.0
  isSubgenre: boolean
  matchedBy: 'exact' | 'id' | 'alias' | 'international' | 'provider' | 'keyword' | 'none'
}

export interface ClassifiedMedia {
  canonicalGenres: GenreDefinition[]
  subgenres: GenreDefinition[]
  originalCategories: string[]
  overallConfidence: number
}

// Pre-computed normalized lookup maps for high-performance classification
interface ClassificationIndexEntry {
  genre: GenreDefinition
  confidence: number
  matchedBy: GenreClassificationResult['matchedBy']
}

const NORMALIZED_LOOKUP = new Map<string, ClassificationIndexEntry>()

function cleanKey(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Build index once at module load
for (const genre of CANONICAL_GENRES) {
  // 1. Exact name
  const nameKey = cleanKey(genre.name)
  NORMALIZED_LOOKUP.set(nameKey, { genre, confidence: 1.0, matchedBy: 'exact' })

  // 2. Canonical ID
  const idKey = cleanKey(genre.id)
  if (!NORMALIZED_LOOKUP.has(idKey)) {
    NORMALIZED_LOOKUP.set(idKey, { genre, confidence: 1.0, matchedBy: 'id' })
  }

  // 3. Aliases
  for (const alias of genre.aliases) {
    const aliasKey = cleanKey(alias)
    if (!NORMALIZED_LOOKUP.has(aliasKey)) {
      NORMALIZED_LOOKUP.set(aliasKey, { genre, confidence: 0.95, matchedBy: 'alias' })
    }
  }

  // 4. International names
  for (const intl of Object.values(genre.internationalNames)) {
    const intlKey = cleanKey(intl)
    if (!NORMALIZED_LOOKUP.has(intlKey)) {
      NORMALIZED_LOOKUP.set(intlKey, { genre, confidence: 0.9, matchedBy: 'international' })
    }
  }

  // 5. Provider mappings
  for (const provList of Object.values(genre.providerMappings)) {
    for (const prov of provList) {
      const provKey = cleanKey(prov)
      if (!NORMALIZED_LOOKUP.has(provKey)) {
        NORMALIZED_LOOKUP.set(provKey, { genre, confidence: 0.85, matchedBy: 'provider' })
      }
    }
  }
}

// Canonical common provider & international variants
const COMMON_VARIANTS: Record<string, string> = {
  documentaires: 'documentary',
  documentales: 'documentary',
  doku: 'documentary',
  'sci fi & fantasy': 'science-fiction',
  'sci fi and fantasy': 'science-fiction',
  'science fiction & fantasy': 'science-fiction',
  'science fiction and fantasy': 'science-fiction',
  'reality tv': 'live-lifestyle',
  reality: 'live-lifestyle',
  soap: 'drama',
  'soap opera': 'drama',
  telenovela: 'drama',
  'talk show': 'live-news',
  'talk radio': 'audio-podcasts',
  'business & economics': 'biography',
  business: 'biography',
  finances: 'live-news',
  finance: 'live-news',
}

for (const [variant, targetId] of Object.entries(COMMON_VARIANTS)) {
  const targetGenre = getGenreById(targetId)
  if (targetGenre) {
    const key = cleanKey(variant)
    if (!NORMALIZED_LOOKUP.has(key)) {
      NORMALIZED_LOOKUP.set(key, { genre: targetGenre, confidence: 0.85, matchedBy: 'provider' })
    }
  }
}

/**
 * Normalizes a raw genre or category string to a canonical GenreDefinition.
 */
export function classifyGenre(
  rawCategory: string,
  mediaType?: MediaType,
  customProviderMappings?: Record<string, string>,
): GenreClassificationResult {
  if (!rawCategory || !rawCategory.trim()) {
    return {
      raw: rawCategory || '',
      canonical: null,
      confidence: 0,
      isSubgenre: false,
      matchedBy: 'none',
    }
  }

  const trimmed = rawCategory.trim()
  const key = cleanKey(trimmed)

  // 0. Check custom user mappings first
  if (customProviderMappings && customProviderMappings[key]) {
    const mappedId = customProviderMappings[key]
    const customGenre = mappedId ? getGenreById(mappedId) : undefined
    if (customGenre) {
      return {
        raw: trimmed,
        canonical: customGenre,
        confidence: 1.0,
        isSubgenre: Boolean(customGenre.parentId),
        matchedBy: 'exact',
      }
    }
  }

  // 1. Direct normalized lookup
  const directMatch = NORMALIZED_LOOKUP.get(key)
  if (directMatch) {
    if (!mediaType || directMatch.genre.mediaTypes.includes(mediaType)) {
      return {
        raw: trimmed,
        canonical: directMatch.genre,
        confidence: directMatch.confidence,
        isSubgenre: Boolean(directMatch.genre.parentId),
        matchedBy: directMatch.matchedBy,
      }
    }
  }

  // 2. Keyword boundary heuristics for compound strings (e.g. "Action / Thriller / Sci-Fi")
  // Check if any canonical genre matches a full word boundary
  for (const genre of CANONICAL_GENRES) {
    if (mediaType && !genre.mediaTypes.includes(mediaType)) continue

    const namePattern = new RegExp(`\\b${cleanKey(genre.name)}\\b`, 'i')
    if (namePattern.test(key)) {
      return {
        raw: trimmed,
        canonical: genre,
        confidence: 0.8,
        isSubgenre: Boolean(genre.parentId),
        matchedBy: 'keyword',
      }
    }

    for (const alias of genre.aliases) {
      const aliasPattern = new RegExp(`\\b${cleanKey(alias)}\\b`, 'i')
      if (aliasPattern.test(key)) {
        return {
          raw: trimmed,
          canonical: genre,
          confidence: 0.75,
          isSubgenre: Boolean(genre.parentId),
          matchedBy: 'keyword',
        }
      }
    }
  }

  // 3. Fallback: unmapped category remains unassigned. Original string preserved.
  return {
    raw: trimmed,
    canonical: null,
    confidence: 0,
    isSubgenre: false,
    matchedBy: 'none',
  }
}

/**
 * Classifies an array of category or genre strings into unique canonical genres.
 */
export function classifyGenreList(
  categories: string[],
  mediaType?: MediaType,
  customProviderMappings?: Record<string, string>,
): ClassifiedMedia {
  const seenCanonical = new Set<string>()
  const seenSub = new Set<string>()
  const canonicalGenres: GenreDefinition[] = []
  const subgenres: GenreDefinition[] = []
  const originalCategories: string[] = []
  let totalConfidence = 0
  let matchedCount = 0

  for (const raw of categories) {
    if (!raw || !raw.trim()) continue
    originalCategories.push(raw.trim())

    // Split compound category delimiters such as "Action; Sci-Fi" or "Drama / Mystery"
    const parts = raw.split(/[;/|]/).map((p) => p.trim()).filter(Boolean)
    for (const part of parts) {
      const result = classifyGenre(part, mediaType, customProviderMappings)
      if (result.canonical) {
        matchedCount++
        totalConfidence += result.confidence

        if (result.isSubgenre) {
          if (!seenSub.has(result.canonical.id)) {
            seenSub.add(result.canonical.id)
            subgenres.push(result.canonical)
          }
          // Also automatically include parent genre
          if (result.canonical.parentId) {
            const parent = getGenreById(result.canonical.parentId)
            if (parent && !seenCanonical.has(parent.id)) {
              seenCanonical.add(parent.id)
              canonicalGenres.push(parent)
            }
          }
        } else {
          if (!seenCanonical.has(result.canonical.id)) {
            seenCanonical.add(result.canonical.id)
            canonicalGenres.push(result.canonical)
          }
        }
      }
    }
  }

  const overallConfidence = matchedCount > 0 ? Number((totalConfidence / matchedCount).toFixed(2)) : 0

  return {
    canonicalGenres,
    subgenres,
    originalCategories,
    overallConfidence,
  }
}

export const classifyMedia = classifyGenreList

/**
 * Classifies a movie title from any source (demo, open catalogue, Xtream, local media).
 */
export function classifyMovie(
  movie: Partial<Movie> & { categoryName?: string; genres?: string[] },
  customProviderMappings?: Record<string, string>,
): ClassifiedMedia {
  const rawList: string[] = []
  if (movie.genres && Array.isArray(movie.genres)) {
    rawList.push(...movie.genres)
  }
  if (movie.categoryName) {
    rawList.push(movie.categoryName)
  }
  return classifyGenreList(rawList, 'movies', customProviderMappings)
}

/**
 * Classifies a TV series from any source.
 */
export function classifySeries(
  seriesItem: Partial<Series> & { categoryName?: string; genres?: string[] },
  customProviderMappings?: Record<string, string>,
): ClassifiedMedia {
  const rawList: string[] = []
  if (seriesItem.genres && Array.isArray(seriesItem.genres)) {
    rawList.push(...seriesItem.genres)
  }
  if (seriesItem.categoryName) {
    rawList.push(seriesItem.categoryName)
  }
  return classifyGenreList(rawList, 'series', customProviderMappings)
}

/**
 * Classifies a Live TV channel's broadcasting category.
 * Explicitly preserves channel category separate from currently airing programme genre.
 */
export function classifyChannel(
  channel: Channel,
  customProviderMappings?: Record<string, string>,
): ClassifiedMedia {
  const rawList: string[] = []
  if (channel.categories && channel.categories.length > 0) {
    rawList.push(...channel.categories)
  } else if (channel.group) {
    rawList.push(channel.group)
  }
  return classifyGenreList(rawList, 'live', customProviderMappings)
}

/**
 * Classifies an EPG programme airing on Live TV.
 */
export function classifyProgramme(
  programme: Programme,
  customProviderMappings?: Record<string, string>,
): ClassifiedMedia {
  const rawList: string[] = []
  if (programme.category) {
    rawList.push(programme.category)
  }
  return classifyGenreList(rawList, undefined, customProviderMappings)
}

/**
 * Classifies an audio track, radio station, podcast, or audiobook resource.
 */
export function classifyAudioResource(
  resource: MediaResource,
  customProviderMappings?: Record<string, string>,
): ClassifiedMedia {
  const rawList: string[] = []
  if (resource.tags && Array.isArray(resource.tags)) {
    rawList.push(...resource.tags)
  }
  if (resource.provider) {
    rawList.push(resource.provider)
  }
  return classifyGenreList(rawList, 'audio', customProviderMappings)
}
