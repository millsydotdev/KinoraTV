// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clientSyncManager } from './clientSync'

describe('clientSyncManager', () => {
  beforeEach(() => {
    localStorage.clear()
    clientSyncManager.clearServerConfig()
    vi.restoreAllMocks()
  })

  it('manages server configuration and storage persistence', () => {
    clientSyncManager.setServerConfig('http://192.168.1.100:5198/', 'test-tok-123')
    const state = clientSyncManager.getState()

    expect(state.serverUrl).toBe('http://192.168.1.100:5198')
    expect(state.authToken).toBe('test-tok-123')
    expect(localStorage.getItem('kinora.platform.serverUrl.v1')).toBe('http://192.168.1.100:5198')
    expect(localStorage.getItem('kinora.platform.authToken.v1')).toBe('test-tok-123')

    clientSyncManager.clearServerConfig()
    const cleared = clientSyncManager.getState()
    expect(cleared.serverUrl).toBeNull()
    expect(cleared.authToken).toBeNull()
    expect(localStorage.getItem('kinora.platform.serverUrl.v1')).toBeNull()
  })

  it('handles pairWithServer failure gracefully', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ ok: false, error: 'Incorrect PIN' }),
    } as Response)

    const success = await clientSyncManager.pairWithServer('http://192.168.1.50:5198', '1111')
    expect(success).toBe(false)
    expect(clientSyncManager.getState().status).toBe('error')
    expect(clientSyncManager.getState().error).toBe('Incorrect PIN')
  })

  it('pairs and connects successfully when server accepts PIN', async () => {
    const mockInfo = {
      appName: 'Kinora',
      version: '0.6.0',
      mode: 'server',
      localIp: '192.168.1.50',
      port: 5198,
      serverUrl: 'http://192.168.1.50:5198',
    }

    const mockChannels = [{ id: 'ch-1', name: 'BBC One', number: 101 }]
    const mockSources = [{ id: 'src-1', label: 'M3U Main', origin: 'url', channelCount: 1, kind: 'playlist' }]
    const mockLibrary = { favourites: ['ch-1'], watchlist: [], watchProgress: [] }

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/pair')) {
        return {
          ok: true,
          json: async () => ({ ok: true, token: 'paired-tok-456' }),
        } as Response
      }
      if (url.endsWith('/api/info')) {
        return {
          ok: true,
          json: async () => mockInfo,
        } as Response
      }
      if (url.endsWith('/api/channels')) {
        return {
          ok: true,
          json: async () => mockChannels,
        } as Response
      }
      if (url.endsWith('/api/sources')) {
        return {
          ok: true,
          json: async () => mockSources,
        } as Response
      }
      if (url.endsWith('/api/library')) {
        return {
          ok: true,
          json: async () => mockLibrary,
        } as Response
      }
      return { ok: true, json: async () => ({ ok: true }) } as Response
    })

    const ok = await clientSyncManager.pairWithServer('http://192.168.1.50:5198', '7492', 'Living Room Tablet')
    expect(ok).toBe(true)

    const state = clientSyncManager.getState()
    expect(state.status).toBe('connected')
    expect(state.authToken).toBe('paired-tok-456')
    expect(state.serverInfo?.appName).toBe('Kinora')
    expect(state.channels.length).toBe(1)
    expect(state.sources.length).toBe(1)
    expect(state.library?.favourites).toContain('ch-1')
  })

  it('syncs watch progress to remote server', async () => {
    clientSyncManager.setServerConfig('http://192.168.1.50:5198', 'tok-abc')

    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) } as Response)
    globalThis.fetch = fetchSpy

    const synced = await clientSyncManager.syncWatchProgress('movie:night-living-dead', 'Night of the Living Dead', 320, 5800)
    expect(synced).toBe(true)
    expect(fetchSpy).toHaveBeenCalledWith('http://192.168.1.50:5198/api/sync/progress', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer tok-abc',
      }),
    }))
  })

  it('toggles library items on remote server', async () => {
    clientSyncManager.setServerConfig('http://192.168.1.50:5198', 'tok-abc')

    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) } as Response)
    globalThis.fetch = fetchSpy

    const toggled = await clientSyncManager.toggleLibraryItem('toggle_favourite', 'ch-1')
    expect(toggled).toBe(true)
    expect(fetchSpy).toHaveBeenCalledWith('http://192.168.1.50:5198/api/sync/library', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ action: 'toggle_favourite', id: 'ch-1' }),
    }))
  })

  it('casts media to target Kinora device', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) } as Response)
    globalThis.fetch = fetchSpy

    const sent = await clientSyncManager.castMedia('http://192.168.1.80:5198', {
      title: 'Night of the Living Dead',
      streamUrl: 'http://example.com/stream.m3u8',
      position: 120,
      isLive: false,
    }, 'target-token-xyz')

    expect(sent).toBe(true)
    expect(fetchSpy).toHaveBeenCalledWith('http://192.168.1.80:5198/api/cast', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer target-token-xyz',
      }),
    }))
  })
})
