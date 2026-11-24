/**
 * Plex Media Server Client Adapter for Kinora.
 *
 * Implements native communication with Plex Media Server:
 * - Server identification and identity probing (/identity)
 * - X-Plex-Token header and query parameter authentication
 * - Library section discovery (/library/sections)
 * - Movie and TV show metadata retrieval (/library/sections/{id}/all)
 * - Season and episode hierarchies (/library/metadata/{id}/children)
 * - Direct part streaming and timeline watch progress synchronisation
 *
 * Strictly adheres to the zero em-dash typography standard.
 */

import type {
  MediaServerConnectionTest,
  MediaServerLibrary,
  MediaServerItem,
  MediaServerSeason,
  MediaServerEpisode,
  PlaybackProgressUpdate,
} from './types'

export class PlexAdapter {
  private baseUrl: string
  private token: string
  private clientIdentifier = 'kinora-desktop'
  private productName = 'Kinora'
  private version = '0.6.0'

  constructor(config: { url: string; authToken?: string; clientIdentifier?: string }) {
    this.baseUrl = config.url.replace(/\/+$/, '')
    this.token = config.authToken || ''
    if (config.clientIdentifier) {
      this.clientIdentifier = config.clientIdentifier
    }
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      Accept: 'application/json',
      'X-Plex-Client-Identifier': this.clientIdentifier,
      'X-Plex-Product': this.productName,
      'X-Plex-Version': this.version,
    }
    if (this.token) {
      h['X-Plex-Token'] = this.token
    }
    return h
  }

  /**
   * Tests connection to the Plex Media Server.
   */
  async testConnection(): Promise<MediaServerConnectionTest> {
    try {
      const res = await fetch(`${this.baseUrl}/identity`, {
        headers: this.headers(),
      })

      if (!res.ok) {
        return {
          success: false,
          serverName: 'Plex Media Server',
          version: 'Unknown',
          message: `Server returned HTTP ${res.status} status. Verify token and port.`,
        }
      }

      const data = await res.json()
      const container = data.MediaContainer || {}
      const version = container.version || '1.x'

      // Check server root for friendly name
      let serverName = 'Plex Media Server'
      try {
        const rootRes = await fetch(`${this.baseUrl}/`, { headers: this.headers() })
        if (rootRes.ok) {
          const rootData = await rootRes.json()
          serverName = rootData.MediaContainer?.friendlyName || rootData.MediaContainer?.myPlexUsername || serverName
        }
      } catch {
        // Fall back to default server name
      }

      return {
        success: true,
        serverName,
        version,
        userId: container.machineIdentifier,
        userName: serverName,
        message: `Connected successfully to ${serverName} (Plex ${version}).`,
      }
    } catch (e) {
      return {
        success: false,
        serverName: 'Plex Media Server',
        version: 'Unknown',
        message: e instanceof Error ? e.message : 'Could not reach Plex address.',
      }
    }
  }

  /**
   * Discovers library sections.
   */
  async getLibraries(): Promise<MediaServerLibrary[]> {
    const url = `${this.baseUrl}/library/sections`
    const res = await fetch(url, { headers: this.headers() })
    if (!res.ok) throw new Error(`Failed to load Plex libraries: HTTP ${res.status}`)

    const data = await res.json()
    const directories = data.MediaContainer?.Directory || []

    return directories.map((dir: Record<string, unknown>) => {
      const type = String(dir.type || '').toLowerCase()
      let kind: 'movies' | 'series' | 'music' | 'other' = 'other'
      if (type === 'movie') kind = 'movies'
      else if (type === 'show') kind = 'series'
      else if (type === 'artist') kind = 'music'

      return {
        id: String(dir.key),
        name: String(dir.title || 'Library'),
        kind,
        enabled: true,
      }
    })
  }

  /**
   * Retrieves media items for a specific section.
   */
  async getItems(libraryId: string, serverId: string): Promise<MediaServerItem[]> {
    const url = `${this.baseUrl}/library/sections/${libraryId}/all`
    const res = await fetch(url, { headers: this.headers() })
    if (!res.ok) throw new Error(`Failed to load items for Plex section ${libraryId}: HTTP ${res.status}`)

    const data = await res.json()
    const metadata = data.MediaContainer?.Metadata || []

    return metadata.map((it: Record<string, unknown>) => {
      const isSeries = it.type === 'show'
      const id = String(it.ratingKey)
      const year = typeof it.year === 'number' ? it.year : null

      // Plex image URLs require token authentication
      const posterUrl = it.thumb
        ? `${this.baseUrl}${it.thumb}?X-Plex-Token=${this.token}`
        : null
      const backdropUrl = it.art
        ? `${this.baseUrl}${it.art}?X-Plex-Token=${this.token}`
        : null

      // Direct stream part extraction
      let streamUrl = ''
      const mediaList = (it.Media as Array<Record<string, unknown>>) || []
      const firstMedia = mediaList[0]
      if (!isSeries && firstMedia) {
        const parts = (firstMedia.Part as Array<Record<string, unknown>>) || []
        const firstPart = parts[0]
        if (firstPart && firstPart.key) {
          streamUrl = `${this.baseUrl}${firstPart.key}?X-Plex-Token=${this.token}`
        }
      }

      const durationMs = typeof it.duration === 'number' ? it.duration : null
      const viewOffset = typeof it.viewOffset === 'number' ? it.viewOffset : 0
      const isPlayed = typeof it.viewCount === 'number' && it.viewCount > 0

      return {
        id,
        serverId,
        serverType: 'plex',
        libraryId,
        kind: isSeries ? 'series' : 'movie',
        title: String(it.title || 'Untitled'),
        year,
        overview: typeof it.summary === 'string' ? it.summary : undefined,
        posterUrl,
        backdropUrl,
        rating: typeof it.rating === 'number' ? it.rating.toFixed(1) : null,
        durationMs,
        streamUrl,
        playbackPositionTicks: viewOffset * 10000,
        isPlayed,
      }
    })
  }

  /**
   * Retrieves seasons for a TV show.
   */
  async getSeasons(seriesId: string): Promise<MediaServerSeason[]> {
    const url = `${this.baseUrl}/library/metadata/${seriesId}/children`
    const res = await fetch(url, { headers: this.headers() })
    if (!res.ok) throw new Error(`Failed to load seasons for Plex series ${seriesId}: HTTP ${res.status}`)

    const data = await res.json()
    const metadata = data.MediaContainer?.Metadata || []

    return metadata.map((s: Record<string, unknown>) => {
      const id = String(s.ratingKey)
      const seasonNumber = typeof s.index === 'number' ? s.index : 1
      const posterUrl = s.thumb ? `${this.baseUrl}${s.thumb}?X-Plex-Token=${this.token}` : null

      return {
        id,
        seriesId,
        seasonNumber,
        name: String(s.title || `Season ${seasonNumber}`),
        overview: typeof s.summary === 'string' ? s.summary : undefined,
        posterUrl,
        episodesCount: typeof s.leafCount === 'number' ? s.leafCount : undefined,
      }
    })
  }

  /**
   * Retrieves episodes for a TV show season.
   */
  async getEpisodes(seriesId: string, seasonId: string): Promise<MediaServerEpisode[]> {
    const url = `${this.baseUrl}/library/metadata/${seasonId}/children`
    const res = await fetch(url, { headers: this.headers() })
    if (!res.ok) throw new Error(`Failed to load episodes for Plex season ${seasonId}: HTTP ${res.status}`)

    const data = await res.json()
    const metadata = data.MediaContainer?.Metadata || []

    return metadata.map((ep: Record<string, unknown>) => {
      const id = String(ep.ratingKey)
      const seasonNumber = typeof ep.parentIndex === 'number' ? ep.parentIndex : 1
      const episodeNumber = typeof ep.index === 'number' ? ep.index : 1
      const stillUrl = ep.thumb ? `${this.baseUrl}${ep.thumb}?X-Plex-Token=${this.token}` : null

      let streamUrl = ''
      const mediaList = (ep.Media as Array<Record<string, unknown>>) || []
      const firstMedia = mediaList[0]
      if (firstMedia) {
        const parts = (firstMedia.Part as Array<Record<string, unknown>>) || []
        const firstPart = parts[0]
        if (firstPart && firstPart.key) {
          streamUrl = `${this.baseUrl}${firstPart.key}?X-Plex-Token=${this.token}`
        }
      }

      const durationMs = typeof ep.duration === 'number' ? ep.duration : null
      const viewOffset = typeof ep.viewOffset === 'number' ? ep.viewOffset : 0
      const isPlayed = typeof ep.viewCount === 'number' && ep.viewCount > 0

      return {
        id,
        seriesId,
        seasonId,
        seasonNumber,
        episodeNumber,
        name: String(ep.title || `Episode ${episodeNumber}`),
        overview: typeof ep.summary === 'string' ? ep.summary : undefined,
        stillUrl,
        durationMs,
        streamUrl,
        isPlayed,
        playbackPositionTicks: viewOffset * 10000,
      }
    })
  }

  /**
   * Reports timeline playback progress to Plex.
   */
  async reportProgress(update: PlaybackProgressUpdate): Promise<void> {
    try {
      if (update.isCompleted) {
        // Scrobble item as watched
        await fetch(`${this.baseUrl}/:/scrobble?key=${update.itemId}&identifier=com.plexapp.plugins.library&X-Plex-Token=${this.token}`, {
          headers: this.headers(),
        })
        return
      }

      const state = update.isPaused ? 'paused' : 'playing'
      const timeMs = Math.round(update.positionMs)
      const durationMs = Math.round(update.durationMs)

      await fetch(
        `${this.baseUrl}/:/timeline?ratingKey=${update.itemId}&key=%2Flibrary%2Fmetadata%2F${update.itemId}&state=${state}&time=${timeMs}&duration=${durationMs}&X-Plex-Token=${this.token}`,
        { headers: this.headers() },
      )
    } catch {
      // Non-fatal
    }
  }
}
