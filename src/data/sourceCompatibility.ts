/**
 * Source and Media Compatibility Architecture for Kinora.
 *
 * Defines the complete compatibility matrix, capabilities, metadata fields,
 * and artwork provisions across every supported and planned source integration:
 * - Xtream Codes API
 * - M3U and M3U8 playlists
 * - XMLTV and EPG timetable feeds
 * - Stalker / MAG middleware portals
 * - Live television and radio streams
 * - Catch-up and replay services
 * - VOD movie and series catalogues
 * - Local media storage and folder sidecars
 * - Media servers (Jellyfin, Plex, Emby)
 * - Metadata and artwork services (TMDB, TVmaze, TVDB, Sky Metadata API)
 * - Music, radio, podcasts, audiobooks, and publications
 *
 * Strictly adheres to the zero em-dash typography standard.
 */

import type { IconName } from '../components/Icon'

export type SourceType =
  | 'm3u'
  | 'xtream'
  | 'xmltv'
  | 'stalker'
  | 'local-media'
  | 'media-server'
  | 'metadata-service'
  | 'discovery-catalogue'
  | 'rss-feed'
  | 'opds-library'

export type MediaKind =
  | 'channel'
  | 'radio'
  | 'programme'
  | 'catchup'
  | 'movie'
  | 'series'
  | 'season'
  | 'episode'
  | 'collection'
  | 'artist'
  | 'album'
  | 'track'
  | 'radio-programme'
  | 'podcast'
  | 'podcast-episode'
  | 'audiobook'
  | 'audiobook-chapter'
  | 'book'
  | 'documentary'
  | 'local-file'
  | 'resource'

export type ArtworkRole =
  | 'channel-logo'
  | 'channel-icon'
  | 'programme-logo'
  | 'programme-still'
  | 'epg-programme-artwork'
  | 'episode-still'
  | 'movie-poster'
  | 'series-poster'
  | 'season-artwork'
  | 'movie-backdrop'
  | 'series-backdrop'
  | 'cinematic-backdrop'
  | 'fanart'
  | 'movie-logo'
  | 'series-logo'
  | 'title-logo'
  | 'clearart'
  | 'banner'
  | 'collection-poster'
  | 'collection-backdrop'
  | 'radio-station-artwork'
  | 'radio-programme-artwork'
  | 'album-artwork'
  | 'artist-image'
  | 'podcast-artwork'
  | 'podcast-episode-artwork'
  | 'audiobook-cover'
  | 'book-cover'
  | 'documentary-artwork'
  | 'genre-artwork'
  | 'custom-artwork'
  | 'embedded-artwork'
  | 'sidecar-artwork'

export interface SourceCapability {
  id: SourceType
  displayName: string
  icon: IconName
  description: string
  supportedMediaKinds: MediaKind[]
  supportedArtworkRoles: ArtworkRole[]
  artworkProvenance: 'remote' | 'local' | 'embedded' | 'hybrid'
  requiresAuthentication: boolean
  authenticationMethod?: 'none' | 'credentials' | 'mac-token' | 'api-key' | 'cookie'
  supportsCatchup: boolean
  supportsVod: boolean
  supportsEpg: boolean
  tokenLifespan?: 'permanent' | 'session' | 'short-lived'
  knownLimitations: string[]
}

export const SOURCE_CAPABILITY_MATRIX: Record<SourceType, SourceCapability> = {
  m3u: {
    id: 'm3u',
    displayName: 'M3U / M3U8 Playlist',
    icon: 'live',
    description: 'Standard M3U/M3U8 text playlists with EXTINF metadata tags and stream links.',
    supportedMediaKinds: ['channel', 'radio', 'movie', 'series', 'episode'],
    supportedArtworkRoles: ['channel-logo', 'movie-poster', 'series-poster', 'cinematic-backdrop'],
    artworkProvenance: 'remote',
    requiresAuthentication: false,
    authenticationMethod: 'none',
    supportsCatchup: true,
    supportsVod: true,
    supportsEpg: false,
    tokenLifespan: 'session',
    knownLimitations: [
      'Artwork URLs may carry embedded session tokens that expire.',
      'M3U tags frequently supply channel logos in place of programme stills.',
      'Group titles often bundle multiple subcategories into semicolon-delimited strings.',
    ],
  },
  xtream: {
    id: 'xtream',
    displayName: 'Xtream Codes Provider',
    icon: 'database',
    description: 'Structured IPTV and VOD server architecture with authentication, category trees, and stream actions.',
    supportedMediaKinds: ['channel', 'radio', 'catchup', 'movie', 'series', 'season', 'episode'],
    supportedArtworkRoles: [
      'channel-logo',
      'movie-poster',
      'movie-backdrop',
      'series-poster',
      'series-backdrop',
      'season-artwork',
      'episode-still',
    ],
    artworkProvenance: 'remote',
    requiresAuthentication: true,
    authenticationMethod: 'credentials',
    supportsCatchup: true,
    supportsVod: true,
    supportsEpg: true,
    tokenLifespan: 'session',
    knownLimitations: [
      'Cover images for movies are frequently 2:3 posters rather than landscape backdrops.',
      'TV series episodes may lack individual stills and fall back to series poster.',
      'Server-generated stream links require active session keep-alive.',
    ],
  },
  xmltv: {
    id: 'xmltv',
    displayName: 'XMLTV EPG Guide',
    icon: 'guide',
    description: 'Standard XMLTV broadcast timetables supplying programme schedules, ratings, categories, and broadcast stills.',
    supportedMediaKinds: ['channel', 'programme', 'radio-programme'],
    supportedArtworkRoles: ['channel-logo', 'channel-icon', 'programme-still', 'epg-programme-artwork', 'episode-still'],
    artworkProvenance: 'remote',
    requiresAuthentication: false,
    authenticationMethod: 'none',
    supportsCatchup: false,
    supportsVod: false,
    supportsEpg: true,
    tokenLifespan: 'permanent',
    knownLimitations: [
      'Broadcasters frequently supply generic category graphics for recurring news or shopping slots.',
      'Icon URLs for Sky metadata need /cover replaced with /16-9 to obtain true photographic stills.',
      'Channel IDs must match normalized loose keys without stripping international indicators.',
    ],
  },
  stalker: {
    id: 'stalker',
    displayName: 'Stalker / MAG Middleware',
    icon: 'tv',
    description: 'Middleware portal architecture using handshake handshakes, tokenized playback, and MAC authentication.',
    supportedMediaKinds: ['channel', 'catchup', 'movie', 'series', 'episode'],
    supportedArtworkRoles: ['channel-logo', 'movie-poster', 'series-poster'],
    artworkProvenance: 'remote',
    requiresAuthentication: true,
    authenticationMethod: 'mac-token',
    supportsCatchup: true,
    supportsVod: true,
    supportsEpg: true,
    tokenLifespan: 'short-lived',
    knownLimitations: [
      'Requires token renewal every session.',
      'Stalker portals rarely provide 16:9 backdrops, offering only square icons or portrait covers.',
    ],
  },
  'local-media': {
    id: 'local-media',
    displayName: 'Local Storage and Sidecars',
    icon: 'folder',
    description: 'Local filesystem directories, mounted network shares, sidecar artwork, and embedded audio/video tags.',
    supportedMediaKinds: [
      'movie',
      'series',
      'season',
      'episode',
      'artist',
      'album',
      'track',
      'podcast',
      'audiobook',
      'book',
      'documentary',
      'local-file',
    ],
    supportedArtworkRoles: [
      'movie-poster',
      'movie-backdrop',
      'series-poster',
      'series-backdrop',
      'season-artwork',
      'episode-still',
      'album-artwork',
      'artist-image',
      'audiobook-cover',
      'book-cover',
      'embedded-artwork',
      'sidecar-artwork',
    ],
    artworkProvenance: 'local',
    requiresAuthentication: false,
    authenticationMethod: 'none',
    supportsCatchup: false,
    supportsVod: true,
    supportsEpg: false,
    tokenLifespan: 'permanent',
    knownLimitations: [
      'Requires file access permissions in the host OS sandbox.',
      'File naming conventions vary (e.g. poster.jpg vs folder.jpg vs cover.png).',
    ],
  },
  'media-server': {
    id: 'media-server',
    displayName: 'Media Server (Jellyfin / Plex / Emby)',
    icon: 'database',
    description: 'Personal media server integrations with unified libraries, collections, and progress sync.',
    supportedMediaKinds: ['movie', 'series', 'season', 'episode', 'album', 'track', 'audiobook'],
    supportedArtworkRoles: [
      'movie-poster',
      'movie-backdrop',
      'cinematic-backdrop',
      'movie-logo',
      'series-poster',
      'series-backdrop',
      'series-logo',
      'season-artwork',
      'episode-still',
      'album-artwork',
      'artist-image',
      'audiobook-cover',
    ],
    artworkProvenance: 'hybrid',
    requiresAuthentication: true,
    authenticationMethod: 'api-key',
    supportsCatchup: false,
    supportsVod: true,
    supportsEpg: true,
    tokenLifespan: 'permanent',
    knownLimitations: [
      'Artwork URLs require API token headers or URL query tokens.',
      'Server transcode settings can impact image format negotiation.',
    ],
  },
  'metadata-service': {
    id: 'metadata-service',
    displayName: 'Trusted Metadata Services',
    icon: 'search',
    description: 'External metadata and artwork providers including TMDb, TVDB, TVmaze, and OpenSubtitles.',
    supportedMediaKinds: ['movie', 'series', 'season', 'episode', 'collection', 'documentary'],
    supportedArtworkRoles: [
      'movie-poster',
      'movie-backdrop',
      'cinematic-backdrop',
      'movie-logo',
      'series-poster',
      'series-backdrop',
      'series-logo',
      'season-artwork',
      'episode-still',
      'title-logo',
      'clearart',
      'fanart',
      'banner',
      'collection-poster',
      'collection-backdrop',
    ],
    artworkProvenance: 'remote',
    requiresAuthentication: false,
    authenticationMethod: 'api-key',
    supportsCatchup: false,
    supportsVod: false,
    supportsEpg: false,
    tokenLifespan: 'permanent',
    knownLimitations: [
      'Requires strict disambiguation by release year and media type to avoid franchise collisions.',
      'Movie search must not be queried for live television broadcasts unless genre is explicitly film.',
    ],
  },
  'discovery-catalogue': {
    id: 'discovery-catalogue',
    displayName: 'Public Discovery Repositories',
    icon: 'rows',
    description: 'Public curated directories including iptv-org and vetted public cultural catalogues.',
    supportedMediaKinds: ['channel', 'radio', 'resource'],
    supportedArtworkRoles: ['channel-logo', 'channel-icon', 'radio-station-artwork'],
    artworkProvenance: 'remote',
    requiresAuthentication: false,
    authenticationMethod: 'none',
    supportsCatchup: false,
    supportsVod: false,
    supportsEpg: false,
    tokenLifespan: 'permanent',
    knownLimitations: [
      'Channel logo URLs point to external CDNs that may rate-limit or geographic-block.',
      'Must never be fetched automatically at startup.',
    ],
  },
  'rss-feed': {
    id: 'rss-feed',
    displayName: 'Podcast & Audio RSS Feeds',
    icon: 'mic',
    description: 'Standard RSS 2.0 and iTunes podcast feeds containing audio episodes and channel artwork.',
    supportedMediaKinds: ['podcast', 'podcast-episode', 'radio-programme'],
    supportedArtworkRoles: ['podcast-artwork', 'podcast-episode-artwork', 'channel-icon'],
    artworkProvenance: 'remote',
    requiresAuthentication: false,
    authenticationMethod: 'none',
    supportsCatchup: false,
    supportsVod: false,
    supportsEpg: false,
    tokenLifespan: 'permanent',
    knownLimitations: [
      'Feeds frequently provide only square 1:1 show covers without episode stills.',
      'Episode images may point to high-resolution files that benefit from lazy thumbnail caching.',
    ],
  },
  'opds-library': {
    id: 'opds-library',
    displayName: 'OPDS Publication Catalogue',
    icon: 'book',
    description: 'Open Publication Distribution System feeds for books, audiobooks, and documents.',
    supportedMediaKinds: ['book', 'audiobook', 'audiobook-chapter'],
    supportedArtworkRoles: ['book-cover', 'audiobook-cover'],
    artworkProvenance: 'remote',
    requiresAuthentication: false,
    authenticationMethod: 'none',
    supportsCatchup: false,
    supportsVod: false,
    supportsEpg: false,
    tokenLifespan: 'permanent',
    knownLimitations: [
      'Covers are strictly portrait 2:3 aspect ratio.',
      'Thumbnails must preserve document proportions without cropping.',
    ],
  },
}

/**
 * Returns capability descriptor for a source type.
 */
export function getSourceCapability(sourceType: SourceType): SourceCapability {
  return SOURCE_CAPABILITY_MATRIX[sourceType] || SOURCE_CAPABILITY_MATRIX['m3u']
}

/**
 * Checks whether a given source type supports a target media kind.
 */
export function doesSourceSupportMedia(sourceType: SourceType, mediaKind: MediaKind): boolean {
  const cap = SOURCE_CAPABILITY_MATRIX[sourceType]
  return cap ? cap.supportedMediaKinds.includes(mediaKind) : false
}

/**
 * Checks whether a given source type can provide artwork for a target role.
 */
export function doesSourceProvideArtworkRole(sourceType: SourceType, role: ArtworkRole): boolean {
  const cap = SOURCE_CAPABILITY_MATRIX[sourceType]
  return cap ? cap.supportedArtworkRoles.includes(role) : false
}
