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
import { artworkEngine, type ArtworkType } from '../data/artworkEngine'
import { curatedMovies, curatedSeries } from '../data/catalog'
import { loadMetadataConfig } from '../data/metadataProviders'
import { validateArtworkSuitability } from './artworkSuitability'
import type { MediaKind, SourceType, ArtworkRole } from '../data/sourceCompatibility'

export interface ArtworkDiagnostics {
  mediaId?: string
  title: string
  role: ArtworkType
  selectedProvider: 'custom' | 'local' | 'metadata' | 'provider' | 'bundled' | 'fallback'
  selectedUrl: string | null
  suitabilityScore: number
  rejectionReason?: string
  confidence: number
  rationale: string
}

export interface ArtworkResolution {
  src: string | null
  provider: 'custom' | 'local' | 'metadata' | 'provider' | 'bundled' | 'fallback'
  isGenuine: boolean
  aspectRatio: '2:3' | '16:9' | '1:1'
  attribution?: string
  diagnostics?: ArtworkDiagnostics
}

export interface ResolveArtworkOptions {
  contentId?: string
  title: string
  type: ArtworkType
  mediaKind?: MediaKind
  sourceKind?: SourceType
  channelId?: string
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
    case 'book-cover':
    case 'collection-poster':
      return '2:3'
    case 'movie-backdrop':
    case 'series-backdrop':
    case 'cinematic-backdrop':
    case 'collection-backdrop':
    case 'fanart':
    case 'movie-logo':
    case 'series-logo':
    case 'title-logo':
    case 'clearart':
    case 'banner':
    case 'episode-still':
    case 'epg-programme-artwork':
    case 'programme-still':
    case 'documentary-artwork':
    case 'genre-artwork':
      return '16:9'
    case 'channel-logo':
    case 'channel-icon':
    case 'radio-station-artwork':
    case 'radio-programme-artwork':
    case 'album-artwork':
    case 'artist-image':
    case 'podcast-artwork':
    case 'podcast-episode-artwork':
    case 'audiobook-cover':
      return '1:1'
    default:
      return '16:9'
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
    case 'podcast-artwork':
    case 'audiobook-cover':
    case 'album-artwork':
    case 'book-cover':
    case 'title-logo':
    case 'documentary-artwork':
      return t
    default:
      return undefined
  }
}

function lookupMetadataEngine(options: ResolveArtworkOptions): ArtworkResolution | null {
  const { contentId, title, type, year, seasonNumber, episodeNumber, channelId } = options
  const aspectRatio = getExpectedAspectRatio(type)

  // Season artwork lookup
  if (type === 'season-artwork' && contentId && seasonNumber != null) {
    const cleanId = contentId.replace(/^series:/, '')
    const seasonRec =
      artworkEngine.getArtwork(`season-artwork:${contentId}:s${seasonNumber}`, 'season-artwork') ||
      artworkEngine.getArtwork(`season-artwork:series:${cleanId}:s${seasonNumber}`, 'season-artwork') ||
      artworkEngine.getArtwork(`season:${cleanId}:${seasonNumber}`, 'season-artwork')
    if (seasonRec?.sourceUrl?.trim() && isValidArtForRole(seasonRec.sourceUrl, type, title)) {
      return {
        src: seasonRec.sourceUrl.trim(),
        provider: seasonRec.sourceProvider === 'embedded' ? 'bundled' : 'metadata',
        isGenuine: true,
        aspectRatio,
        attribution: seasonRec.attribution,
        diagnostics: {
          mediaId: contentId,
          title,
          role: type,
          selectedProvider: seasonRec.sourceProvider === 'embedded' ? 'bundled' : 'metadata',
          selectedUrl: seasonRec.sourceUrl.trim(),
          suitabilityScore: 0.95,
          confidence: seasonRec.confidence,
          rationale: `Matched season ${seasonNumber} artwork in central registry`,
        },
      }
    }
  }

  // Episode still lookup
  if (type === 'episode-still' && contentId && seasonNumber != null && episodeNumber != null) {
    const cleanId = contentId.replace(/^(series|episode):/, '').split('/')[0] || contentId
    const epKey = `episode:still:${cleanId}:${seasonNumber}:${episodeNumber}`
    const epStill = artworkEngine.getArtwork(epKey, 'episode-still')
    if (epStill?.sourceUrl?.trim() && isValidArtForRole(epStill.sourceUrl, type, title)) {
      return {
        src: epStill.sourceUrl.trim(),
        provider: epStill.sourceProvider === 'embedded' ? 'bundled' : 'metadata',
        isGenuine: true,
        aspectRatio,
        attribution: epStill.attribution,
        diagnostics: {
          mediaId: contentId,
          title,
          role: type,
          selectedProvider: epStill.sourceProvider === 'embedded' ? 'bundled' : 'metadata',
          selectedUrl: epStill.sourceUrl.trim(),
          suitabilityScore: 0.95,
          confidence: epStill.confidence,
          rationale: `Matched episode S${seasonNumber}E${episodeNumber} still in central registry`,
        },
      }
    }
  }

  // Direct contentId lookup in metadata engine
  if (contentId) {
    const byId = artworkEngine.getArtwork(contentId, type)
    if (byId?.sourceUrl?.trim() && byId.sourceProvider !== 'embedded' && isValidArtForRole(byId.sourceUrl, type, title)) {
      return {
        src: byId.sourceUrl.trim(),
        provider: 'metadata',
        isGenuine: true,
        aspectRatio,
        attribution: byId.attribution || 'Verified Metadata Service',
        diagnostics: {
          mediaId: contentId,
          title,
          role: type,
          selectedProvider: 'metadata',
          selectedUrl: byId.sourceUrl.trim(),
          suitabilityScore: 0.95,
          confidence: byId.confidence,
          rationale: `Matched exact content identifier (${contentId}) in central registry`,
        },
      }
    }
  }

  // Title + year lookup in metadata engine (external enriched records only; bundled handled separately)
  if (title) {
    const enriched = artworkEngine.findArtwork(title, type, year, channelId)
    if (enriched?.sourceUrl?.trim() && isValidArtForRole(enriched.sourceUrl, type, title)) {
      const isExternal = enriched.sourceProvider === 'tmdb' || enriched.sourceProvider === 'tvmaze' || enriched.sourceProvider === 'tvdb'
      if (isExternal) {
        return {
          src: enriched.sourceUrl.trim(),
          provider: 'metadata',
          isGenuine: true,
          aspectRatio,
          attribution: enriched.attribution || (year ? `Metadata Match (${year})` : 'Verified Metadata Service'),
          diagnostics: {
            mediaId: contentId,
            title,
            role: type,
            selectedProvider: 'metadata',
            selectedUrl: enriched.sourceUrl.trim(),
            suitabilityScore: 0.95,
            confidence: enriched.confidence,
            rationale: `Matched title and year (${title}${year ? `, ${year}` : ''}) via ${enriched.sourceProvider.toUpperCase()}`,
          },
        }
      }
    }
  }

  return null
}

export function isValidArtForRole(url: string | null | undefined, targetRole: ArtworkType, contentTitle?: string | null): boolean {
  return validateArtworkSuitability(url, targetRole as ArtworkRole, undefined, contentTitle).isValid
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
        diagnostics: {
          mediaId: contentId,
          title,
          role: type,
          selectedProvider: 'custom',
          selectedUrl: custom.dataUrl,
          suitabilityScore: 1.0,
          confidence: 1.0,
          rationale: 'Active user-assigned custom artwork',
        },
      }
    }
  }

  const localResult: ArtworkResolution | null =
    localArt && localArt.trim() && isValidArtForRole(localArt, type, title)
      ? {
          src: localArt.trim(),
          provider: 'local',
          isGenuine: true,
          aspectRatio,
          attribution: 'Local Media Artwork',
          diagnostics: {
            mediaId: contentId,
            title,
            role: type,
            selectedProvider: 'local',
            selectedUrl: localArt.trim(),
            suitabilityScore: 0.95,
            confidence: 0.95,
            rationale: 'Verified local sidecar or folder image asset',
          },
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
    effectiveProviderArt && effectiveProviderArt.trim() && isValidArtForRole(effectiveProviderArt, type, title)
      ? {
          src: effectiveProviderArt.trim(),
          provider: 'provider',
          isGenuine: true,
          aspectRatio,
          attribution: 'Connected Provider Metadata',
          diagnostics: {
            mediaId: contentId,
            title,
            role: type,
            selectedProvider: 'provider',
            selectedUrl: effectiveProviderArt.trim(),
            suitabilityScore: 0.9,
            confidence: 0.9,
            rationale: 'Supplied directly by connected provider metadata',
          },
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
        diagnostics: {
          mediaId: contentId,
          title,
          role: type,
          selectedProvider: 'bundled',
          selectedUrl: bundled,
          suitabilityScore: 1.0,
          confidence: 1.0,
          rationale: 'Curated Kinora original title asset',
        },
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
        diagnostics: {
          mediaId: contentId,
          title,
          role: type,
          selectedProvider: 'bundled',
          selectedUrl: bundled,
          suitabilityScore: 1.0,
          confidence: 1.0,
          rationale: 'Curated Kinora original title asset',
        },
      }
    }
  }

  // Fallback: deliberate, branded Kinora missing-artwork design
  return {
    src: null,
    provider: 'fallback',
    isGenuine: false,
    aspectRatio,
    diagnostics: {
      mediaId: contentId,
      title,
      role: type,
      selectedProvider: 'fallback',
      selectedUrl: null,
      suitabilityScore: 0.0,
      confidence: 0.0,
      rationale: 'No verified or suitable candidate found; using deliberate ambient fallback',
    },
  }
}
