// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { JellyfinAdapter } from './jellyfin'
import { EmbyAdapter } from './emby'
import { PlexAdapter } from './plex'
import {
  mediaServerManager,
} from './manager'
import type { MediaServerConfig } from './types'

describe('Jellyfin Media Server Integration', () => {
  const baseUrl = 'http://192.168.1.100:8096'
  const adapter = new JellyfinAdapter({
    url: baseUrl,
    authToken: 'jellyfin-token-xyz',
    userId: 'user-jf-1',
  })

  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('tests connection and discovers server info without credentials', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ServerName: 'Living Room Jellyfin',
        Version: '10.8.13',
        Id: 'jf-srv-1',
      }),
    } as Response)

    const test = await adapter.testConnection()
    expect(test.success).toBe(true)
    expect(test.serverName).toBe('Living Room Jellyfin')
    expect(test.version).toBe('10.8.13')
    expect(test.message).toContain('Connected successfully')
  })

  it('authenticates user by name and password', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ServerName: 'Living Room Jellyfin',
          Version: '10.8.13',
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          User: { Id: 'user-123', Name: 'alice' },
          AccessToken: 'token-abc',
        }),
      } as Response)

    const test = await adapter.testConnection('alice', 'password123')
    expect(test.success).toBe(true)
    expect(test.userId).toBe('user-123')
    expect(test.userName).toBe('alice')
  })

  it('discovers user libraries with category mapping', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Items: [
          { Id: 'lib-1', Name: 'Feature Films', CollectionType: 'movies' },
          { Id: 'lib-2', Name: 'Television Series', CollectionType: 'tvshows' },
          { Id: 'lib-3', Name: 'Soundtracks', CollectionType: 'music' },
        ],
      }),
    } as Response)

    const libs = await adapter.getLibraries()
    expect(libs.length).toBe(3)
    expect(libs[0]!.kind).toBe('movies')
    expect(libs[1]!.kind).toBe('series')
    expect(libs[2]!.kind).toBe('music')
  })

  it('retrieves media items with artwork and playback URLs', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Items: [
          {
            Id: 'item-101',
            Name: 'Inception',
            Type: 'Movie',
            ProductionYear: 2010,
            Overview: 'A thief who steals corporate secrets...',
            CommunityRating: 8.8,
            RunTimeTicks: 88800000000,
            UserData: { PlaybackPositionTicks: 1200000000, Played: false },
          },
        ],
      }),
    } as Response)

    const items = await adapter.getItems('lib-1', 'srv-1')
    expect(items.length).toBe(1)
    const movie = items[0]!
    expect(movie.title).toBe('Inception')
    expect(movie.year).toBe(2010)
    expect(movie.posterUrl).toContain('/Items/item-101/Images/Primary')
    expect(movie.backdropUrl).toContain('/Items/item-101/Images/Backdrop/0')
    expect(movie.streamUrl).toContain('/Videos/item-101/stream?static=true')
    expect(movie.playbackPositionTicks).toBe(1200000000)
    expect(movie.isPlayed).toBe(false)
  })

  it('retrieves seasons and episodes for TV series', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Items: [
            { Id: 'season-1', Name: 'Season 1', IndexNumber: 1, Overview: 'First season' },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Items: [
            {
              Id: 'ep-1',
              Name: 'Pilot',
              IndexNumber: 1,
              ParentIndexNumber: 1,
              RunTimeTicks: 30000000000,
              UserData: { Played: true },
            },
          ],
        }),
      } as Response)

    const seasons = await adapter.getSeasons('series-1')
    expect(seasons.length).toBe(1)
    expect(seasons[0]!.seasonNumber).toBe(1)

    const episodes = await adapter.getEpisodes('series-1', 'season-1')
    expect(episodes.length).toBe(1)
    expect(episodes[0]!.name).toBe('Pilot')
    expect(episodes[0]!.episodeNumber).toBe(1)
    expect(episodes[0]!.isPlayed).toBe(true)
    expect(episodes[0]!.streamUrl).toContain('/Videos/ep-1/stream')
  })

  it('reports progress updates and marks items played', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = fetchSpy

    // Progress update
    await adapter.reportProgress({
      itemId: 'item-101',
      positionMs: 60000,
      durationMs: 120000,
      isPaused: false,
    })
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/Sessions/Playing/Progress'),
      expect.objectContaining({ method: 'POST' }),
    )

    // Completed
    await adapter.reportProgress({
      itemId: 'item-101',
      positionMs: 120000,
      durationMs: 120000,
      isPaused: false,
      isCompleted: true,
    })
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/Users/user-jf-1/PlayedItems/item-101'),
      expect.objectContaining({ method: 'POST' }),
    )
  })
})

describe('Emby Media Server Integration', () => {
  const adapter = new EmbyAdapter({
    url: 'http://192.168.1.105:8096',
    authToken: 'emby-token-123',
    userId: 'user-emby-1',
  })

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('tests connection and reports Emby server version', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ServerName: 'Emby Premiere Server',
        Version: '4.7.14.0',
      }),
    } as Response)

    const test = await adapter.testConnection()
    expect(test.success).toBe(true)
    expect(test.serverName).toBe('Emby Premiere Server')
    expect(test.version).toBe('4.7.14.0')
  })

  it('retrieves libraries and items with Emby tokens', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Items: [{ Id: 'emby-lib-1', Name: 'Movies', CollectionType: 'movies' }],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Items: [
            {
              Id: 'emby-item-1',
              Name: 'Interstellar',
              Type: 'Movie',
              ProductionYear: 2014,
            },
          ],
        }),
      } as Response)

    const libs = await adapter.getLibraries()
    expect(libs.length).toBe(1)

    const items = await adapter.getItems(libs[0]!.id, 'emby-srv')
    expect(items.length).toBe(1)
    expect(items[0]!.title).toBe('Interstellar')
    expect(items[0]!.serverType).toBe('emby')
    expect(items[0]!.streamUrl).toContain('api_key=emby-token-123')
  })
})

describe('Plex Media Server Integration', () => {
  const adapter = new PlexAdapter({
    url: 'http://192.168.1.110:32400',
    authToken: 'plex-secret-token',
  })

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('tests identity connection and extracts server machine identifier', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          MediaContainer: {
            machineIdentifier: 'plex-machine-123',
            version: '1.32.8.7639',
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          MediaContainer: {
            friendlyName: 'Tower Plex',
          },
        }),
      } as Response)

    const test = await adapter.testConnection()
    expect(test.success).toBe(true)
    expect(test.serverName).toBe('Tower Plex')
    expect(test.userId).toBe('plex-machine-123')
    expect(test.version).toBe('1.32.8.7639')
  })

  it('retrieves Plex library sections and maps section types', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        MediaContainer: {
          Directory: [
            { key: '1', title: 'Movies', type: 'movie' },
            { key: '2', title: 'TV Shows', type: 'show' },
          ],
        },
      }),
    } as Response)

    const libs = await adapter.getLibraries()
    expect(libs.length).toBe(2)
    expect(libs[0]!.kind).toBe('movies')
    expect(libs[1]!.kind).toBe('series')
  })

  it('retrieves Plex movie items with direct part playback URLs', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        MediaContainer: {
          Metadata: [
            {
              ratingKey: '5001',
              title: 'The Dark Knight',
              year: 2008,
              summary: 'Batman raises the stakes in his war on crime.',
              thumb: '/library/metadata/5001/thumb/123456',
              art: '/library/metadata/5001/art/123456',
              duration: 9120000,
              viewCount: 2,
              Media: [
                {
                  Part: [{ key: '/library/parts/9001/01.mkv' }],
                },
              ],
            },
          ],
        },
      }),
    } as Response)

    const items = await adapter.getItems('1', 'plex-srv')
    expect(items.length).toBe(1)
    const movie = items[0]!
    expect(movie.title).toBe('The Dark Knight')
    expect(movie.year).toBe(2008)
    expect(movie.posterUrl).toContain('/library/metadata/5001/thumb/123456?X-Plex-Token=plex-secret-token')
    expect(movie.backdropUrl).toContain('/library/metadata/5001/art/123456?X-Plex-Token=plex-secret-token')
    expect(movie.streamUrl).toBe('http://192.168.1.110:32400/library/parts/9001/01.mkv?X-Plex-Token=plex-secret-token')
    expect(movie.isPlayed).toBe(true)
  })

  it('reports timeline progress and scrobbles watched items', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = fetchSpy

    // Timeline progress
    await adapter.reportProgress({
      itemId: '5001',
      positionMs: 45000,
      durationMs: 9120000,
      isPaused: false,
    })
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/:/timeline?ratingKey=5001'),
      expect.anything(),
    )

    // Scrobble watched
    await adapter.reportProgress({
      itemId: '5001',
      positionMs: 9120000,
      durationMs: 9120000,
      isPaused: false,
      isCompleted: true,
    })
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/:/scrobble?key=5001'),
      expect.anything(),
    )
  })
})

describe('MediaServerManager', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  const testConfig: MediaServerConfig = {
    id: 'srv-test-1',
    serverType: 'jellyfin',
    name: 'Home Jellyfin',
    url: 'http://192.168.1.100:8096',
    authToken: 'test-token',
    userId: 'user-1',
  }

  it('saves, loads, and deletes server configurations', () => {
    mediaServerManager.saveServer(testConfig)
    const loaded = mediaServerManager.loadServers()
    expect(loaded.length).toBe(1)
    expect(loaded[0]!.name).toBe('Home Jellyfin')

    mediaServerManager.removeServer('srv-test-1')
    expect(mediaServerManager.loadServers().length).toBe(0)
  })

  it('syncs libraries and caches media items', async () => {
    mediaServerManager.saveServer(testConfig)

    // Mock libraries fetch and items fetch
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Items: [{ Id: 'lib-movies', Name: 'Movies', CollectionType: 'movies' }],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Items: [
            {
              Id: 'mov-1',
              Name: 'Dune',
              Type: 'Movie',
              ProductionYear: 2021,
            },
          ],
        }),
      } as Response)

    const synced = await mediaServerManager.syncServer('srv-test-1')
    expect(synced.length).toBe(1)
    expect(synced[0]!.title).toBe('Dune')

    const cached = mediaServerManager.getCachedItems('srv-test-1')
    expect(cached.length).toBe(1)
    expect(cached[0]!.title).toBe('Dune')
  })
})

describe('Native guarded transport routing', () => {
  it('routes Jellyfin, Emby, and Plex requests through native mediaServerRequest IPC inside Tauri', async () => {
    const nativeMod = await import('../native')
    const inNativeSpy = vi.spyOn(nativeMod, 'inNativeShell').mockReturnValue(true)
    const ipcSpy = vi.spyOn(nativeMod, 'mediaServerRequest').mockImplementation(async (url) => {
      if (url.includes('/System/Info/Public')) {
        return { ok: true, status: 200, body: JSON.stringify({ ServerName: 'Guarded LAN Server', Version: '10.9.0' }) }
      }
      if (url.includes('/identity')) {
        return { ok: true, status: 200, body: JSON.stringify({ MediaContainer: { machineIdentifier: 'px-1', version: '1.40' } }) }
      }
      return { ok: true, status: 200, body: JSON.stringify({ MediaContainer: { friendlyName: 'Guarded Plex' } }) }
    })
    const fetchSpy = vi.fn(() => {
      throw new Error('Browser fetch must not be called inside Tauri desktop shell')
    })
    global.fetch = fetchSpy

    const jf = new JellyfinAdapter({ url: 'http://192.168.1.40:8096', authToken: 'tok-jf', userId: 'u1' })
    const emby = new EmbyAdapter({ url: 'http://192.168.1.41:8096', authToken: 'tok-emby', userId: 'u2' })
    const plex = new PlexAdapter({ url: 'http://192.168.1.42:32400', authToken: 'tok-plex' })

    expect((await jf.testConnection()).success).toBe(true)
    expect((await emby.testConnection()).success).toBe(true)
    expect((await plex.testConnection()).success).toBe(true)
    expect(ipcSpy).toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()

    inNativeSpy.mockRestore()
    ipcSpy.mockRestore()
  })
})
