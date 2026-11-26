/**
 * Media Server Integration Types for Kinora.
 *
 * Supports Jellyfin, Emby, and Plex media servers:
 * - Connection configurations and credentials
 * - Library discovery (Movies, Series, Music, etc.)
 * - Media items (Movies, Shows, Seasons, Episodes)
 * - Playback streams, transcodes, and watch progress synchronization
 *
 * Strictly adheres to the zero em-dash typography standard.
 */

export type MediaServerType = 'jellyfin' | 'emby' | 'plex'

export interface MediaServerConfig {
  id: string
  serverType: MediaServerType
  name: string
  url: string
  authToken: string
  userId?: string
  username?: string
  clientIdentifier?: string
  lastConnected?: string
  libraries?: MediaServerLibrary[]
}

export interface MediaServerLibrary {
  id: string
  name: string
  kind: 'movies' | 'series' | 'music' | 'other'
  itemCount?: number
  enabled?: boolean
}

export interface MediaServerItem {
  id: string
  serverId: string
  serverType: MediaServerType
  libraryId: string
  kind: 'movie' | 'series' | 'season' | 'episode'
  title: string
  year?: number | null
  overview?: string
  posterUrl?: string | null
  backdropUrl?: string | null
  rating?: string | null
  durationMs?: number | null
  streamUrl: string
  seriesId?: string
  seasonNumber?: number | null
  episodeNumber?: number | null
  playbackPositionTicks?: number
  isPlayed?: boolean
}

export interface MediaServerSeason {
  id: string
  seriesId: string
  seasonNumber: number
  name: string
  overview?: string
  posterUrl?: string | null
  episodesCount?: number
}

export interface MediaServerEpisode {
  id: string
  seriesId: string
  seasonId: string
  seasonNumber: number
  episodeNumber: number
  name: string
  overview?: string
  stillUrl?: string | null
  durationMs?: number | null
  streamUrl: string
  isPlayed?: boolean
  playbackPositionTicks?: number
}

export interface MediaServerConnectionTest {
  success: boolean
  serverName: string
  version: string
  userId?: string
  userName?: string
  message?: string
}

export interface PlaybackProgressUpdate {
  itemId: string
  positionMs: number
  durationMs: number
  isPaused: boolean
  isCompleted?: boolean
}
