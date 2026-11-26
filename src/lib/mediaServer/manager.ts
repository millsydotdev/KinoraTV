/**
 * Unified Media Server Manager for Kinora.
 *
 * Orchestrates server configurations, connection pooling, and multi-server
 * library aggregation across Jellyfin, Emby, and Plex.
 *
 * Strictly adheres to the zero em-dash typography standard.
 */

import { JellyfinAdapter } from './jellyfin'
import { EmbyAdapter } from './emby'
import { PlexAdapter } from './plex'
import type {
  MediaServerConfig,
  MediaServerConnectionTest,
  MediaServerItem,
  MediaServerLibrary,
  MediaServerSeason,
  MediaServerEpisode,
  PlaybackProgressUpdate,
} from './types'

export const MEDIA_SERVERS_STORAGE_KEY = 'kinora.media_servers.v1'
export const MEDIA_SERVER_ITEMS_STORAGE_KEY = 'kinora.media_server_items.v1'

export class MediaServerManager {
  private static instance: MediaServerManager

  static getInstance(): MediaServerManager {
    if (!this.instance) {
      this.instance = new MediaServerManager()
    }
    return this.instance
  }

  /**
   * Retrieves saved media server configurations from persistent storage.
   */
  loadServers(): MediaServerConfig[] {
    try {
      const raw = localStorage.getItem(MEDIA_SERVERS_STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  /**
   * Saves or updates a media server configuration.
   */
  saveServer(config: MediaServerConfig): void {
    const servers = this.loadServers()
    const idx = servers.findIndex((s) => s.id === config.id)
    if (idx >= 0) {
      servers[idx] = config
    } else {
      servers.push(config)
    }
    try {
      localStorage.setItem(MEDIA_SERVERS_STORAGE_KEY, JSON.stringify(servers))
    } catch {
      // Storage quota safety
    }
  }

  /**
   * Removes a media server configuration and purges its cached items.
   */
  removeServer(serverId: string): void {
    const servers = this.loadServers().filter((s) => s.id !== serverId)
    try {
      localStorage.setItem(MEDIA_SERVERS_STORAGE_KEY, JSON.stringify(servers))
      this.clearServerItemsCache(serverId)
    } catch {
      // Storage safety
    }
  }

  /**
   * Instantiates the appropriate adapter for a media server configuration.
   */
  getAdapter(config: MediaServerConfig): JellyfinAdapter | EmbyAdapter | PlexAdapter {
    switch (config.serverType) {
      case 'jellyfin':
        return new JellyfinAdapter({
          url: config.url,
          authToken: config.authToken,
          userId: config.userId,
        })
      case 'emby':
        return new EmbyAdapter({
          url: config.url,
          authToken: config.authToken,
          userId: config.userId,
        })
      case 'plex':
        return new PlexAdapter({
          url: config.url,
          authToken: config.authToken,
          clientIdentifier: config.clientIdentifier,
        })
      default:
        throw new Error(`Unsupported media server type: ${config.serverType}`)
    }
  }

  /**
   * Tests connection to a server with supplied parameters.
   */
  async testConnection(
    serverType: MediaServerConfig['serverType'],
    url: string,
    authToken?: string,
    username?: string,
    password?: string,
  ): Promise<MediaServerConnectionTest> {
    const mockConfig: MediaServerConfig = {
      id: 'test',
      serverType,
      name: 'Test Server',
      url,
      authToken: authToken || '',
    }
    const adapter = this.getAdapter(mockConfig)
    if (serverType === 'jellyfin') {
      return (adapter as JellyfinAdapter).testConnection(username, password)
    } else if (serverType === 'emby') {
      return (adapter as EmbyAdapter).testConnection(username, password)
    } else {
      return (adapter as PlexAdapter).testConnection()
    }
  }

  /**
   * Discovers libraries for a saved server.
   */
  async discoverLibraries(serverId: string): Promise<MediaServerLibrary[]> {
    const server = this.loadServers().find((s) => s.id === serverId)
    if (!server) throw new Error(`Server ${serverId} not found.`)

    const adapter = this.getAdapter(server)
    const libs = await adapter.getLibraries()

    server.libraries = libs
    this.saveServer(server)
    return libs
  }

  /**
   * Syncs and caches all items from enabled libraries of a server.
   */
  async syncServer(serverId: string): Promise<MediaServerItem[]> {
    const server = this.loadServers().find((s) => s.id === serverId)
    if (!server) throw new Error(`Server ${serverId} not found.`)

    const adapter = this.getAdapter(server)
    const libraries = server.libraries || (await this.discoverLibraries(serverId))

    const allItems: MediaServerItem[] = []
    for (const lib of libraries) {
      if (lib.enabled !== false && (lib.kind === 'movies' || lib.kind === 'series')) {
        try {
          const items = await adapter.getItems(lib.id, server.id)
          allItems.push(...items)
        } catch {
          // Continue syncing other libraries
        }
      }
    }

    this.cacheServerItems(serverId, allItems)
    server.lastConnected = new Date().toISOString()
    this.saveServer(server)

    return allItems
  }

  /**
   * Retrieves cached items for all servers or a specific server.
   */
  getCachedItems(serverId?: string): MediaServerItem[] {
    try {
      const raw = localStorage.getItem(MEDIA_SERVER_ITEMS_STORAGE_KEY)
      if (!raw) return []
      const map: Record<string, MediaServerItem[]> = JSON.parse(raw)
      if (serverId) {
        return map[serverId] || []
      }
      return Object.values(map).flat()
    } catch {
      return []
    }
  }

  private cacheServerItems(serverId: string, items: MediaServerItem[]): void {
    try {
      const raw = localStorage.getItem(MEDIA_SERVER_ITEMS_STORAGE_KEY)
      const map: Record<string, MediaServerItem[]> = raw ? JSON.parse(raw) : {}
      map[serverId] = items
      localStorage.setItem(MEDIA_SERVER_ITEMS_STORAGE_KEY, JSON.stringify(map))
    } catch {
      // Storage safety
    }
  }

  private clearServerItemsCache(serverId: string): void {
    try {
      const raw = localStorage.getItem(MEDIA_SERVER_ITEMS_STORAGE_KEY)
      if (!raw) return
      const map: Record<string, MediaServerItem[]> = JSON.parse(raw)
      delete map[serverId]
      localStorage.setItem(MEDIA_SERVER_ITEMS_STORAGE_KEY, JSON.stringify(map))
    } catch {
      // Storage safety
    }
  }

  /**
   * Retrieves seasons for a TV series on a media server.
   */
  async getSeasons(serverId: string, seriesId: string): Promise<MediaServerSeason[]> {
    const server = this.loadServers().find((s) => s.id === serverId)
    if (!server) throw new Error(`Server ${serverId} not found.`)
    const adapter = this.getAdapter(server)
    return adapter.getSeasons(seriesId)
  }

  /**
   * Retrieves episodes for a TV series and season on a media server.
   */
  async getEpisodes(serverId: string, seriesId: string, seasonId: string): Promise<MediaServerEpisode[]> {
    const server = this.loadServers().find((s) => s.id === serverId)
    if (!server) throw new Error(`Server ${serverId} not found.`)
    const adapter = this.getAdapter(server)
    return adapter.getEpisodes(seriesId, seasonId)
  }

  /**
   * Reports playback progress back to the upstream media server.
   */
  async reportProgress(serverId: string, update: PlaybackProgressUpdate): Promise<void> {
    const server = this.loadServers().find((s) => s.id === serverId)
    if (!server) return
    try {
      const adapter = this.getAdapter(server)
      await adapter.reportProgress(update)
    } catch {
      // Non-fatal
    }
  }
}

export const mediaServerManager = MediaServerManager.getInstance()
