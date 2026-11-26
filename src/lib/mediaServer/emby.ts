/**
 * Emby Media Server Client Adapter for Kinora.
 *
 * Implements native communication with Emby servers:
 * - Public server identification and version detection
 * - Authentication via Emby Connect or local credentials
 * - User view and library collection discovery
 * - Movie and series metadata and high-definition artwork extraction
 * - Direct playback streaming and session progress reporting
 *
 * Strictly adheres to the zero em-dash typography standard.
 */

import { mediaServerFetch } from './transport'
import type {
  MediaServerConnectionTest,
  MediaServerLibrary,
  MediaServerItem,
  MediaServerSeason,
  MediaServerEpisode,
  PlaybackProgressUpdate,
} from './types'

export class EmbyAdapter {
  private baseUrl: string
  private token: string
  private userId: string
  private clientName = 'Kinora'
  private deviceName = 'Desktop'
  private deviceId = 'kinora-desktop-emby'
  private version = '0.6.0'

  constructor(config: { url: string; authToken?: string; userId?: string }) {
    this.baseUrl = config.url.replace(/\/+$/, '')
    this.token = config.authToken || ''
    this.userId = config.userId || ''
  }

  private authHeader(): string {
    return `MediaBrowser Client="${this.clientName}", Device="${this.deviceName}", DeviceId="${this.deviceId}", Version="${this.version}", Token="${this.token}"`
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Emby-Authorization': this.authHeader(),
    }
    if (this.token) {
      h['X-Emby-Token'] = this.token
    }
    return h
  }

  /**
   * Tests connection to the Emby server.
   */
  async testConnection(username?: string, password?: string): Promise<MediaServerConnectionTest> {
    try {
      const infoRes = await mediaServerFetch(`${this.baseUrl}/System/Info/Public`, {
        headers: { Accept: 'application/json' },
      })
      if (!infoRes.ok) {
        return {
          success: false,
          serverName: 'Emby Server',
          version: 'Unknown',
          message: `Server returned HTTP ${infoRes.status} status.`,
        }
      }

      const info = await infoRes.json()
      const serverName = info.ServerName || 'Emby Server'
      const version = info.Version || '4.x'

      if (username) {
        const authRes = await mediaServerFetch(`${this.baseUrl}/Users/AuthenticateByName`, {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({ Username: username, Pw: password || '' }),
        })

        if (!authRes.ok) {
          return {
            success: false,
            serverName,
            version,
            message: 'Authentication failed. Please verify username and password.',
          }
        }

        const authData = await authRes.json()
        return {
          success: true,
          serverName,
          version,
          userId: authData.User?.Id,
          userName: authData.User?.Name || username,
          message: `Connected successfully to ${serverName} (${version}).`,
        }
      }

      if (this.userId) {
        return {
          success: true,
          serverName,
          version,
          userId: this.userId,
          message: `Connected successfully to ${serverName}.`,
        }
      }

      return {
        success: true,
        serverName,
        version,
        message: `Discovered ${serverName} (${version}). Ready for authentication.`,
      }
    } catch (e) {
      return {
        success: false,
        serverName: 'Emby Server',
        version: 'Unknown',
        message: e instanceof Error ? e.message : 'Could not reach server address.',
      }
    }
  }

  /**
   * Discovers top-level user libraries.
   */
  async getLibraries(): Promise<MediaServerLibrary[]> {
    const url = `${this.baseUrl}/Users/${this.userId}/Views`
    const res = await mediaServerFetch(url, { headers: this.headers() })
    if (!res.ok) throw new Error(`Failed to load Emby libraries: HTTP ${res.status}`)

    const data = await res.json()
    const items = data.Items || []

    return items.map((view: Record<string, unknown>) => {
      const collectionType = String(view.CollectionType || '').toLowerCase()
      let kind: 'movies' | 'series' | 'music' | 'other' = 'other'
      if (collectionType === 'movies') kind = 'movies'
      else if (collectionType === 'tvshows') kind = 'series'
      else if (collectionType === 'music') kind = 'music'

      return {
        id: String(view.Id),
        name: String(view.Name || 'Library'),
        kind,
        enabled: true,
      }
    })
  }

  /**
   * Retrieves media items for a specific library.
   */
  async getItems(libraryId: string, serverId: string): Promise<MediaServerItem[]> {
    const url = `${this.baseUrl}/Users/${this.userId}/Items?ParentId=${libraryId}&IncludeItemTypes=Movie,Series&Fields=Overview,MediaSources,UserData,ProviderIds&SortBy=SortName&SortOrder=Ascending`
    const res = await mediaServerFetch(url, { headers: this.headers() })
    if (!res.ok) throw new Error(`Failed to load items for library ${libraryId}: HTTP ${res.status}`)

    const data = await res.json()
    const items = data.Items || []

    return items.map((it: Record<string, unknown>) => {
      const isSeries = it.Type === 'Series'
      const id = String(it.Id)
      const year = typeof it.ProductionYear === 'number' ? it.ProductionYear : null
      const userData = (it.UserData as Record<string, unknown>) || {}

      const posterUrl = `${this.baseUrl}/Items/${id}/Images/Primary?quality=90`
      const backdropUrl = `${this.baseUrl}/Items/${id}/Images/Backdrop/0?quality=90`
      const streamUrl = isSeries
        ? ''
        : `${this.baseUrl}/Videos/${id}/stream?static=true&api_key=${this.token}`

      const durationMs = typeof it.RunTimeTicks === 'number' ? Math.round(it.RunTimeTicks / 10000) : null
      const playbackTicks = typeof userData.PlaybackPositionTicks === 'number' ? userData.PlaybackPositionTicks : 0

      return {
        id,
        serverId,
        serverType: 'emby',
        libraryId,
        kind: isSeries ? 'series' : 'movie',
        title: String(it.Name || 'Untitled'),
        year,
        overview: typeof it.Overview === 'string' ? it.Overview : undefined,
        posterUrl,
        backdropUrl,
        rating: typeof it.CommunityRating === 'number' ? it.CommunityRating.toFixed(1) : null,
        durationMs,
        streamUrl,
        playbackPositionTicks: playbackTicks,
        isPlayed: Boolean(userData.Played),
      }
    })
  }

  /**
   * Retrieves seasons for a TV series.
   */
  async getSeasons(seriesId: string): Promise<MediaServerSeason[]> {
    const url = `${this.baseUrl}/Shows/${seriesId}/Seasons?userId=${this.userId}&Fields=Overview`
    const res = await mediaServerFetch(url, { headers: this.headers() })
    if (!res.ok) throw new Error(`Failed to load seasons for series ${seriesId}: HTTP ${res.status}`)

    const data = await res.json()
    const items = data.Items || []

    return items.map((s: Record<string, unknown>) => {
      const id = String(s.Id)
      const seasonNumber = typeof s.IndexNumber === 'number' ? s.IndexNumber : 1
      const posterUrl = `${this.baseUrl}/Items/${id}/Images/Primary?quality=90`

      return {
        id,
        seriesId,
        seasonNumber,
        name: String(s.Name || `Season ${seasonNumber}`),
        overview: typeof s.Overview === 'string' ? s.Overview : undefined,
        posterUrl,
      }
    })
  }

  /**
   * Retrieves episodes for a TV series and season.
   */
  async getEpisodes(seriesId: string, seasonId: string): Promise<MediaServerEpisode[]> {
    const url = `${this.baseUrl}/Shows/${seriesId}/Episodes?seasonId=${seasonId}&userId=${this.userId}&Fields=Overview,UserData`
    const res = await mediaServerFetch(url, { headers: this.headers() })
    if (!res.ok) throw new Error(`Failed to load episodes for season ${seasonId}: HTTP ${res.status}`)

    const data = await res.json()
    const items = data.Items || []

    return items.map((ep: Record<string, unknown>) => {
      const id = String(ep.Id)
      const seasonNumber = typeof ep.ParentIndexNumber === 'number' ? ep.ParentIndexNumber : 1
      const episodeNumber = typeof ep.IndexNumber === 'number' ? ep.IndexNumber : 1
      const stillUrl = `${this.baseUrl}/Items/${id}/Images/Primary?quality=90`
      const streamUrl = `${this.baseUrl}/Videos/${id}/stream?static=true&api_key=${this.token}`
      const userData = (ep.UserData as Record<string, unknown>) || {}
      const durationMs = typeof ep.RunTimeTicks === 'number' ? Math.round(ep.RunTimeTicks / 10000) : null
      const playbackTicks = typeof userData.PlaybackPositionTicks === 'number' ? userData.PlaybackPositionTicks : 0

      return {
        id,
        seriesId,
        seasonId,
        seasonNumber,
        episodeNumber,
        name: String(ep.Name || `Episode ${episodeNumber}`),
        overview: typeof ep.Overview === 'string' ? ep.Overview : undefined,
        stillUrl,
        durationMs,
        streamUrl,
        isPlayed: Boolean(userData.Played),
        playbackPositionTicks: playbackTicks,
      }
    })
  }

  /**
   * Reports playback progress back to the Emby server.
   */
  async reportProgress(update: PlaybackProgressUpdate): Promise<void> {
    try {
      if (update.isCompleted) {
        await mediaServerFetch(`${this.baseUrl}/Users/${this.userId}/PlayedItems/${update.itemId}`, {
          method: 'POST',
          headers: this.headers(),
        })
        return
      }

      const ticks = update.positionMs * 10000
      await mediaServerFetch(`${this.baseUrl}/Sessions/Playing/Progress`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          ItemId: update.itemId,
          PositionTicks: ticks,
          IsPaused: update.isPaused,
        }),
      })
    } catch {
      // Non-fatal if server is unreachable
    }
  }
}
