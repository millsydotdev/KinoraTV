/**
 * Canonical Media and Asset Model for Kinora.
 *
 * Provides typed distinctions between:
 * - Media Identity (the creative work or broadcast channel)
 * - Metadata Record (canonical metadata, tags, and dates)
 * - Associated Artwork Assets (multiple assets across defined roles)
 *
 * Implements role-aware asset management supporting multiple candidates
 * per role and explicit provenance tracking.
 *
 * Strictly adheres to the zero em-dash typography standard.
 */

import type { MediaKind, SourceType, ArtworkRole } from './sourceCompatibility'
import type { ArtworkAspectRatio, ArtworkOrientation, ArtworkProvider, ArtworkVerificationStatus } from './artworkEngine'

export interface MediaIdentity {
  id: string
  kind: MediaKind
  title: string
  cleanTitle: string
  originalTitle?: string
  year?: number
  releaseDate?: string
  seasonNumber?: number
  episodeNumber?: number
  channelId?: string
  channelName?: string
  broadcaster?: string
  country?: string
  language?: string
  imdbId?: string
  tmdbId?: number
  tvdbId?: number
  sourceType: SourceType
  sourceIdentifier?: string
  genres?: string[]
  tags?: string[]
}

export interface ArtworkValidationResult {
  isValid: boolean
  suitabilityScore: number // 0.0 to 1.0
  rejectionReason?: string
  checkedAspect?: string
  hasAlpha?: boolean
  isAnimated?: boolean
  width?: number
  height?: number
  format?: 'jpeg' | 'png' | 'webp' | 'svg' | 'avif' | 'gif' | 'unknown'
}

export interface ArtworkAsset {
  assetId: string
  mediaId: string
  role: ArtworkRole
  url: string
  aspectRatio: ArtworkAspectRatio
  orientation: ArtworkOrientation
  width?: number
  height?: number
  mimeType?: string
  hasAlpha?: boolean
  isAnimated?: boolean
  provider: ArtworkProvider
  confidence: number // 0.0 to 1.0
  verificationStatus: ArtworkVerificationStatus
  validation: ArtworkValidationResult
  provenance: string
  attribution?: string
  retrievedAt: number
  isUserAssigned?: boolean
  isLocalSidecar?: boolean
  isEmbedded?: boolean
}

export interface MediaAssetBundle {
  media: MediaIdentity
  primaryArtwork: Partial<Record<ArtworkRole, ArtworkAsset>>
  alternativeCandidates: Partial<Record<ArtworkRole, ArtworkAsset[]>>
  lastUpdated: number
}

/**
 * Creates a canonical media reference string.
 */
export function buildCanonicalMediaRef(kind: MediaKind, identifier: string): string {
  const cleanId = identifier.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-')
  return `${kind}:${cleanId}`
}

/**
 * Classifies the media kind from a URI, route, or item reference.
 */
export function classifyMediaKind(refOrPath: string): MediaKind {
  if (refOrPath.startsWith('movie:') || refOrPath.startsWith('/movies/')) return 'movie'
  if (refOrPath.startsWith('series:') || refOrPath.startsWith('/series/')) return 'series'
  if (refOrPath.startsWith('episode:')) return 'episode'
  if (refOrPath.startsWith('season:')) return 'season'
  if (refOrPath.startsWith('channel:') || refOrPath.startsWith('/live?channel=')) return 'channel'
  if (refOrPath.startsWith('radio:') || refOrPath.startsWith('/radio/')) return 'radio'
  if (refOrPath.startsWith('podcast:') || refOrPath.startsWith('/podcasts/')) return 'podcast'
  if (refOrPath.startsWith('audiobook:') || refOrPath.startsWith('/audiobooks/')) return 'audiobook'
  if (refOrPath.startsWith('book:') || refOrPath.startsWith('/books/')) return 'book'
  if (refOrPath.startsWith('album:') || refOrPath.startsWith('/music/album/')) return 'album'
  if (refOrPath.startsWith('artist:') || refOrPath.startsWith('/music/artist/')) return 'artist'
  if (refOrPath.startsWith('track:')) return 'track'
  if (refOrPath.startsWith('catchup:') || refOrPath.startsWith('/catchup/')) return 'catchup'
  if (refOrPath.startsWith('local:')) return 'local-file'
  if (refOrPath.startsWith('resource:') || refOrPath.startsWith('/resource/')) return 'resource'
  return 'programme'
}

/**
 * Maps an artwork role to its expected aspect ratio and orientation.
 */
export function getArtworkRoleSpec(role: ArtworkRole): {
  aspectRatio: ArtworkAspectRatio
  orientation: ArtworkOrientation
  minRatio: number
  maxRatio: number
  requiresTransparency: boolean
  label: string
} {
  switch (role) {
    case 'channel-logo':
    case 'channel-icon':
      return { aspectRatio: '1:1', orientation: 'square', minRatio: 0.75, maxRatio: 1.5, requiresTransparency: false, label: 'Channel Logo' }
    case 'programme-logo':
    case 'movie-logo':
    case 'series-logo':
    case 'title-logo':
    case 'clearart':
      return { aspectRatio: 'custom', orientation: 'landscape', minRatio: 1.0, maxRatio: 4.5, requiresTransparency: true, label: 'Title Logo / Wordmark' }
    case 'movie-poster':
    case 'series-poster':
    case 'season-artwork':
    case 'collection-poster':
    case 'book-cover':
      return { aspectRatio: '2:3', orientation: 'portrait', minRatio: 0.55, maxRatio: 0.8, requiresTransparency: false, label: 'Poster' }
    case 'movie-backdrop':
    case 'series-backdrop':
    case 'cinematic-backdrop':
    case 'collection-backdrop':
    case 'fanart':
    case 'documentary-artwork':
    case 'genre-artwork':
      return { aspectRatio: '16:9', orientation: 'landscape', minRatio: 1.5, maxRatio: 2.1, requiresTransparency: false, label: 'Cinematic Backdrop' }
    case 'programme-still':
    case 'epg-programme-artwork':
    case 'episode-still':
    case 'radio-programme-artwork':
    case 'podcast-episode-artwork':
      return { aspectRatio: '16:9', orientation: 'landscape', minRatio: 1.4, maxRatio: 2.0, requiresTransparency: false, label: 'Episode / Programme Still' }
    case 'radio-station-artwork':
    case 'album-artwork':
    case 'podcast-artwork':
      return { aspectRatio: '1:1', orientation: 'square', minRatio: 0.9, maxRatio: 1.1, requiresTransparency: false, label: 'Cover Artwork' }
    case 'artist-image':
      return { aspectRatio: '1:1', orientation: 'square', minRatio: 0.8, maxRatio: 1.8, requiresTransparency: false, label: 'Artist Image' }
    case 'audiobook-cover':
      return { aspectRatio: '1:1', orientation: 'square', minRatio: 0.6, maxRatio: 1.15, requiresTransparency: false, label: 'Audiobook Cover' }
    case 'banner':
      return { aspectRatio: 'custom', orientation: 'landscape', minRatio: 2.0, maxRatio: 4.0, requiresTransparency: false, label: 'Banner' }
    default:
      return { aspectRatio: '16:9', orientation: 'landscape', minRatio: 1.0, maxRatio: 2.4, requiresTransparency: false, label: 'General Artwork' }
  }
}
