export type Certificate = 'U' | 'PG' | '12A' | '15' | '18'

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
  focus: number
  added: string
  seasons: Episode[][]
}

export type Title = Movie | Series

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
  logoUrl: string | null
  mark: { text: string; tone: string }
  /** Never shown or logged: may carry credentials. Nothing plays it yet. */
  streamUrl: string | null
  hd: boolean
  /** Playlist source the channel was read from; `null` for the demonstration catalogue. */
  sourceId: string | null
  /** XMLTV guide id from the playlist (`tvg-id`), matched against guide channel ids. */
  tvgId: string | null
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
  /** Empty for guide programmes: artwork in XMLTV guides is never fetched. */
  art: string
  /** XMLTV `<sub-title>`. */
  subtitle?: string | null
  /** The guide gave no stop time; `stop` is the next programme's start. */
  stopEstimated?: boolean
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

export interface DiscoveryProvider {
  id: string
  name: string
  description: string
  enabled: boolean
}
