import type { XtreamEntry } from '../lib/native'

export type Certificate = 'U' | 'PG' | '12A' | '15' | '18'

/** movie:<id>, series:<id>, channel:<id> or episode:<seriesId>/<episodeId> */
export type Ref = string

export interface Progress {
  pos: number
  dur: number
  at: number
}

export interface Collection {
  id: string
  name: string
  description?: string
  items: Ref[]
  createdAt: number
}

export interface XtreamTitle extends XtreamEntry {
  sourceId: string
  kind: 'movie' | 'series'
}

export interface Library {
  favourites: Ref[]
  watchlist: Ref[]
  progress: Record<Ref, Progress>
  watched: Ref[]
  history: { ref: Ref; at: number }[]
  collections: Collection[]
  reminders: string[]
  recentSearches: string[]
}

export interface Movie {
  kind: 'movie'
  id: string
  title: string
  year: number
  runtime: number
  genres: string[]
  certificate: Certificate
  tagline: string
  synopsis: string
  art: string
  /** Theatrical portrait poster image (2:3 aspect ratio). */
  posterUrl?: string
  /** Landscape promotional backdrop image (16:9 aspect ratio). */
  backdropUrl?: string
  /** Horizontal focal point (0-100) used when the landscape art is cropped to a poster. */
  focus: number
  added: string
  audio: string[]
  subtitles: string[]
}

export interface Episode {
  id: string
  seriesId: string
  season: number
  number: number
  title: string
  synopsis: string
  runtime: number
  still: string
  stillFocus: number
}

export interface Series {
  kind: 'series'
  id: string
  title: string
  years: string
  genres: string[]
  certificate: Certificate
  tagline: string
  synopsis: string
  art: string
  /** Theatrical portrait poster image (2:3 aspect ratio). */
  posterUrl?: string
  /** Landscape promotional backdrop image (16:9 aspect ratio). */
  backdropUrl?: string
  focus: number
  added: string
  seasons: Episode[][]
}

export type Title = Movie | Series

export type StreamAvailabilityStatus = 'available' | 'unavailable' | 'untested' | 'testing' | 'error' | 'unsupported'

export interface StreamVariant {
  id: string
  channelId: string
  sourceId: string
  sourceName: string
  name?: string
  providerChannelId?: string
  groupName?: string
  country?: string | null
  region?: string | null
  language?: string | null
  protocol?: string
  format?: string
  resolution?: string | null
  quality?: string | null
  tvgId?: string | null
  logoUrl?: string | null
  availability?: StreamAvailabilityStatus
  lastChecked?: number | null
  lastCheckMessage?: string | null
  lastError?: string | null
  /** In memory only; never logged or exposed in plain text */
  streamUrl: string | null
  streamDisplay?: string
}

/**
 * Shaped after an M3U `#EXTINF` entry (tvg-id, tvg-name, tvg-logo, group-title, url)
 * so a parsed playlist can replace the demonstration list without touching the screens.
 */
export interface Channel {
  id: string
  number: number
  name: string
  /** The group as the source wrote it (`Animation;Comedy`), or Uncategorised. */
  group: string
  /** `group` split into individual categories; used for filtering and display. */
  categories: string[]
  /** In-memory M3U image address; fetched only by Rust's guarded logo command, never displayed directly. */
  logoUrl: string | null
  mark: { text: string; tone: string }
  /** Never shown or logged: may carry credentials. Nothing plays it yet. */
  streamUrl: string | null
  hd: boolean
  /** Playlist source the channel was read from; `null` for the demonstration catalogue. */
  sourceId: string | null
  /** XMLTV guide id from the playlist (`tvg-id`), matched against guide channel ids. */
  tvgId: string | null
  /** Underlying playlist channel ids when equivalent entries are shown as one logical channel. */
  memberIds?: string[]
  /** Playlist sources represented by this channel, in preferred playback order. */
  sourceIds?: string[]
  /** Kept in memory only; each option points to one source's stream variant. */
  streamOptions?: StreamVariant[]
  /** Whether provider supports catch-up TV for this channel (1 = yes, 0 = no). */
  tvArchive?: number
  /** Number of days of catch-up archive available for this channel. */
  tvArchiveDuration?: number
  /** Raw Xtream stream ID for catch-up playback. */
  xtreamStreamId?: string
}

/** Shaped after an XMLTV `<programme>` element (start, stop, channel, title, desc, category, episode-num). */
export interface Programme {
  id: string
  channelId: string
  start: number
  stop: number
  title: string
  desc: string
  category: string
  episode: string | null
  /** Bundled genre fallback or demo artwork path, optional when relying on channel mark or remote icon. */
  art?: string
  /** XMLTV `<sub-title>`. */
  subtitle?: string | null
  /** The guide gave no stop time; `stop` is the next programme's start. */
  stopEstimated?: boolean
  /** Validated XMLTV `<icon src="...">` URL; fetched and cached securely via Rust backend. */
  icon?: string | null
}

export type SourceKind = 'm3u' | 'm3u8' | 'xmltv' | 'url-list'
export type SourceStatus = 'healthy' | 'degraded' | 'failing' | 'scanning' | 'pending' | 'queued'

export interface HealthCheck {
  at: number
  working: number
  failed: number
}

export interface Source {
  id: string
  name: string
  kind: SourceKind
  url: string
  addedAt: number
  lastChecked: number | null
  status: SourceStatus
  streams: { total: number; working: number; failed: number } | null
  scan: { done: number; total: number } | null
  history: HealthCheck[]
  refreshInterval: string
}
