/**
 * Unified Artwork Resolution Service for Kinora.
 *
 * Implements strict priority hierarchy across all screens:
 * Priority 1: User-selected custom artwork (kinora.custom_artwork.v1), preserved across refreshes.
 * Priority 2-4 (configurable via artworkSourcePreference in Settings):
 *   - Local user-owned sidecar/folder artwork (prioritised first under 'local-first').
 *   - Verified metadata enrichment artwork (TMDB / TVmaze / TVDB) matched by ID, title, and year.
 *   - Source/provider-supplied artwork (Xtream, IPTV, Public Discovery archives).
 *   - Verified bundled curated artwork.
 * Priority 5: Deliberate, branded Kinora missing-artwork design.
 *
 * Enforces strict variant separation (posters vs backdrops vs season art vs episode stills vs logos)
 * so portrait artwork is never stretched into landscape layouts.
 *
 * Strictly adheres to typography standard: zero em-dashes across all comments and text.
 */

import { getCustomArtwork, type CustomArtworkType } from '../state/customArtwork'
import { artworkEngine, isGenericOrPromoGraphic, type ArtworkType } from '../data/artworkEngine'
import { curatedMovies, curatedSeries } from '../data/catalog'
import { loadMetadataConfig } from '../data/metadataProviders'

export interface ArtworkResolution {
  src: string | null
  provider: 'custom' | 'local' | 'metadata' | 'provider' | 'bundled' | 'fallback'
  isGenuine: boolean
  aspectRatio: '2:3' | '16:9' | '1:1'
  attribution?: string
}

export interface ResolveArtworkOptions {
  contentId?: string
  title: string
  type: ArtworkType
  providerArt?: string | null
  localArt?: string | null
  imdbId?: string | null
  year?: number | null
  seasonNumber?: number | null
  episodeNumber?: number | null
}

const BUNDLED_MOVIE_MAP = new Map<string, string>()
for (const m of curatedMovies) {
  if (m.art) BUNDLED_MOVIE_MAP.set(m.id, m.art)
  if (m.art) BUNDLED_MOVIE_MAP.set(m.title.toLowerCase().trim(), m.art)
}

const BUNDLED_SERIES_MAP = new Map<string, string>()
for (const s of curatedSeries) {
  if (s.art) BUNDLED_SERIES_MAP.set(s.id, s.art)
  if (s.art) BUNDLED_SERIES_MAP.set(s.title.toLowerCase().trim(), s.art)
}

export function getExpectedAspectRatio(type: ArtworkType): '2:3' | '16:9' | '1:1' {
  switch (type) {
    case 'movie-poster':
    case 'series-poster':
    case 'season-artwork':
    case 'audiobook-cover':
      return '2:3'
    case 'movie-backdrop':
    case 'series-backdrop':
    case 'movie-logo':
    case 'series-logo':
    case 'episode-still':
    case 'epg-programme-artwork':
    case 'documentary-artwork':
      return '16:9'
    case 'channel-logo':
    case 'radio-station-artwork':
    case 'album-artwork':
    case 'podcast-artwork':
      return '1:1'
    default:
      return '2:3'
  }
}

function toCustomArtworkType(t: ArtworkType): CustomArtworkType | undefined {
  switch (t) {
    case 'channel-logo':
    case 'movie-poster':
    case 'movie-backdrop':
    case 'series-poster':
    case 'series-backdrop':
    case 'episode-still':
    case 'epg-programme-artwork':
      return t
    default:
      return undefined
  }
}

function lookupMetadataEngine(options: ResolveArtworkOptions): ArtworkResolution | null {
  const { contentId, title, type, year, seasonNumber, episodeNumber } = options
  const aspectRatio = getExpectedAspectRatio(type)

  // Season artwork lookup
  if (type === 'season-artwork' && contentId && seasonNumber != null) {
    const cleanId = contentId.replace(/^series:/, '')
    const seasonRec =
      artworkEngine.getArtwork(`season-artwork:${contentId}:s${seasonNumber}`, 'season-artwork') ||
      artworkEngine.getArtwork(`season-artwork:series:${cleanId}:s${seasonNumber}`, 'season-artwork') ||
      artworkEngine.getArtwork(`season:${cleanId}:${seasonNumber}`, 'season-artwork')
    if (seasonRec?.sourceUrl?.trim()) {
      return {
        src: seasonRec.sourceUrl.trim(),
        provider: seasonRec.sourceProvider === 'embedded' ? 'bundled' : 'metadata',
        isGenuine: true,
        aspectRatio,
        attribution: seasonRec.attribution,
      }
    }
  }

  // Episode still lookup
  if (type === 'episode-still' && contentId && seasonNumber != null && episodeNumber != null) {
    const cleanId = contentId.replace(/^(series|episode):/, '').split('/')[0] || contentId
    const epKey = `episode:still:${cleanId}:${seasonNumber}:${episodeNumber}`
    const epStill = artworkEngine.getArtwork(epKey, 'episode-still')
    if (epStill?.sourceUrl?.trim()) {
      return {
        src: epStill.sourceUrl.trim(),
        provider: epStill.sourceProvider === 'embedded' ? 'bundled' : 'metadata',
        isGenuine: true,
        aspectRatio,
        attribution: epStill.attribution,
      }
    }
  }

  // Direct contentId lookup in metadata engine
  if (contentId) {
    const byId = artworkEngine.getArtwork(contentId, type)
    if (byId?.sourceUrl?.trim() && byId.sourceProvider !== 'embedded') {
      return {
        src: byId.sourceUrl.trim(),
        provider: 'metadata',
        isGenuine: true,
        aspectRatio,
        attribution: byId.attribution || 'Verified Metadata Service',
      }
    }
  }

  // Title + year lookup in metadata engine (external enriched records only; bundled handled separately)
  if (title) {
    const enriched = artworkEngine.findArtwork(title, type, year)
    if (enriched?.sourceUrl?.trim()) {
      const isExternal = enriched.sourceProvider === 'tmdb' || enriched.sourceProvider === 'tvmaze' || enriched.sourceProvider === 'tvdb'
      if (isExternal) {
        return {
          src: enriched.sourceUrl.trim(),
          provider: 'metadata',
          isGenuine: true,
          aspectRatio,
          attribution: enriched.attribution || (year ? `Metadata Match (${year})` : 'Verified Metadata Service'),
        }
      }
    }
  }

  return null
}

export function isValidArtForRole(url: string | null | undefined, targetRole: ArtworkType): boolean {
  if (!url || !url.trim()) return false
  const trimmed = url.trim()

  // Backdrops and landscape stills: never accept title logos, channel logos, or portrait covers
  if (
    targetRole === 'movie-backdrop' ||
    targetRole === 'series-backdrop' ||
    targetRole === 'episode-still' ||
    targetRole === 'epg-programme-artwork'
  ) {
    if (/\/logos?\/|title[-_]logo|wordmark|clearart/i.test(trimmed)) return false
    if (/\/cover$|poster|folder\.jpg/i.test(trimmed) && !trimmed.includes('/16-9')) return false
    if (/\/tv-logo\/|\/channel-logo\/|channel_icon/i.test(trimmed)) return false
    if (isGenericOrPromoGraphic(trimmed)) return false
  }

  // Posters and season art (2:3 portrait): never accept wide backdrops or channel logos
  if (
    targetRole === 'movie-poster' ||
    targetRole === 'series-poster' ||
    targetRole === 'season-artwork' ||
    targetRole === 'audiobook-cover'
  ) {
    if (/\/tv-logo\/|\/channel-logo\/|channel_icon/i.test(trimmed)) return false
    if (/\/backdrop|\/still|_backdrop|_still|\/16-9/i.test(trimmed)) return false
  }

  // Channel logos (1:1): never accept posters or backdrops
  if (targetRole === 'channel-logo') {
    if (/\/backdrop|\/still|\/poster|folder\.jpg/i.test(trimmed)) return false
  }

  return true
}

/**
 * Resolves artwork using the configurable priority hierarchy while keeping
 * user custom artwork strictly at Priority 1.
 */
export function resolveArtwork(options: ResolveArtworkOptions): ArtworkResolution {
  const { contentId, title, type, providerArt, localArt } = options
  const aspectRatio = getExpectedAspectRatio(type)
  const config = loadMetadataConfig()
  const preference = config.artworkSourcePreference ?? 'local-first'

  // Priority 1: User-selected custom artwork (always wins and survives refreshes)
  if (contentId || title) {
    const customType = toCustomArtworkType(type)
    const custom =
      (contentId ? getCustomArtwork(contentId, customType) : undefined) ||
      getCustomArtwork(title, customType) ||
      (contentId ? getCustomArtwork(contentId) : undefined) ||
      getCustomArtwork(title)

    if (custom?.dataUrl) {
      return {
        src: custom.dataUrl,
        provider: 'custom',
        isGenuine: true,
        aspectRatio,
        attribution: 'User Custom Artwork',
      }
    }
  }

  const localResult: ArtworkResolution | null =
    localArt && localArt.trim() && isValidArtForRole(localArt, type)
      ? {
          src: localArt.trim(),
          provider: 'local',
          isGenuine: true,
          aspectRatio,
          attribution: 'Local Media Artwork',
        }
      : null

  const metadataResult = lookupMetadataEngine(options)

  // Normalize Sky metadata URLs when target role requires landscape
  const effectiveProviderArt =
    providerArt?.includes('images.metadata.sky.com/pd-image/') && providerArt.endsWith('/cover')
      ? (type.includes('backdrop') || type === 'episode-still' || type === 'epg-programme-artwork'
          ? providerArt.replace(/\/cover$/, '/16-9')
          : providerArt)
      : providerArt

  const providerResult: ArtworkResolution | null =
    effectiveProviderArt && effectiveProviderArt.trim() && isValidArtForRole(effectiveProviderArt, type)
      ? {
          src: effectiveProviderArt.trim(),
          provider: 'provider',
          isGenuine: true,
          aspectRatio,
          attribution: 'Connected Provider Metadata',
        }
      : null

  // Ordered resolution respecting artworkSourcePreference
  if (preference === 'local-first') {
    if (localResult) return localResult
    if (metadataResult) return metadataResult
    if (providerResult) return providerResult
  } else if (preference === 'provider-first') {
    if (localResult) return localResult
    if (providerResult) return providerResult
    if (metadataResult) return metadataResult
  } else {
    // metadata-first
    if (metadataResult) return metadataResult
    if (localResult) return localResult
    if (providerResult) return providerResult
  }

  // Verified bundled curated artwork (for Kinora original titles)
  const normTitle = title.toLowerCase().trim()
  const cleanId = (contentId || '').replace(/^(movie:|series:|res:)/, '').trim()

  if (type === 'movie-poster' || type === 'movie-backdrop') {
    const bundled = BUNDLED_MOVIE_MAP.get(cleanId) || BUNDLED_MOVIE_MAP.get(normTitle)
    if (bundled) {
      return {
        src: bundled,
        provider: 'bundled',
        isGenuine: true,
        aspectRatio,
        attribution: 'Kinora Curated Artwork',
      }
    }
  } else if (type === 'series-poster' || type === 'series-backdrop') {
    const bundled = BUNDLED_SERIES_MAP.get(cleanId) || BUNDLED_SERIES_MAP.get(normTitle)
    if (bundled) {
      return {
        src: bundled,
        provider: 'bundled',
        isGenuine: true,
        aspectRatio,
        attribution: 'Kinora Curated Artwork',
      }
    }
  }

  // Fallback: deliberate, branded Kinora missing-artwork design
  return {
    src: null,
    provider: 'fallback',
    isGenuine: false,
    aspectRatio,
  }
}
