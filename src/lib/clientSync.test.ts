// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const tauriMock = vi.hoisted(() => ({
  isTauri: vi.fn(() => false),
  invoke: vi.fn(),
  listen: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: tauriMock.isTauri,
  invoke: tauriMock.invoke,
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: tauriMock.listen,
}))

import { clientSyncManager } from './clientSync'

describe('clientSyncManager', () => {
  beforeEach(() => {
    localStorage.clear()
    tauriMock.isTauri.mockReset()
    tauriMock.isTauri.mockReturnValue(false)
    tauriMock.invoke.mockReset()
    tauriMock.listen.mockReset()
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
    const mockEpg = [{ channelId: 'ch-1', title: 'News at Six', start: 1000, stop: 2000 }]
    const mockMedia = [{ id: 'mov-1', kind: 'movie', title: 'Solaris', year: 1972, genres: ['Sci-Fi'], artworkKey: 'poster:mov-1' }]

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
      if (url.endsWith('/api/epg')) {
        return {
          ok: true,
          json: async () => mockEpg,
        } as Response
      }
      if (url.endsWith('/api/media')) {
        return {
          ok: true,
          json: async () => mockMedia,
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
    expect(state.epg.length).toBe(1)
    expect(state.epg[0]?.title).toBe('News at Six')
    expect(state.media.length).toBe(1)
    expect(state.media[0]?.title).toBe('Solaris')
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

  it('opens and closes a proxied stream session on the server without exposing upstream URLs', async () => {
    clientSyncManager.setServerConfig('http://192.168.1.50:5198', 'tok-abc')

    const proxyUrl = 'http://192.168.1.50:5198/api/stream/h/0123456789abcdef0123456789abcdef/fedcba9876543210fedcba9876543210'
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        channelId: 'ch-1',
        sessionKey: '0123456789abcdef0123456789abcdef',
        proxyPath: '/api/stream/h/0123456789abcdef0123456789abcdef/fedcba9876543210fedcba9876543210',
        streamUrl: proxyUrl,
        format: 'hls',
      }),
    } as Response)
    globalThis.fetch = fetchSpy

    const opened = await clientSyncManager.openServerStream('ch-1')
    expect(opened?.streamUrl).toBe(proxyUrl)
    expect(opened?.sessionKey).toBe('0123456789abcdef0123456789abcdef')
    expect(opened?.format).toBe('hls')
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://192.168.1.50:5198/api/stream/open',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer tok-abc',
        }),
        body: JSON.stringify({ channelId: 'ch-1' }),
      })
    )

    const resolvedUrl = await clientSyncManager.resolveStreamUrl('ch-1')
    expect(resolvedUrl).toBe(proxyUrl)

    await clientSyncManager.closeServerStream('0123456789abcdef0123456789abcdef')
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://192.168.1.50:5198/api/stream/close',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ sessionKey: '0123456789abcdef0123456789abcdef' }),
      })
    )
  })

  it('opens proxied media stream and builds authenticated artwork URL', async () => {
    clientSyncManager.setServerConfig('http://192.168.1.50:5198', 'tok-abc')

    const proxyUrl = 'http://192.168.1.50:5198/api/stream/h/0123456789abcdef0123456789abcdef/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        mediaId: 'mov-1',
        sessionKey: '0123456789abcdef0123456789abcdef',
        proxyPath: '/api/stream/h/0123456789abcdef0123456789abcdef/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        streamUrl: proxyUrl,
        format: 'direct',
      }),
    } as Response)
    globalThis.fetch = fetchSpy

    const opened = await clientSyncManager.openServerMediaStream('mov-1')
    expect(opened?.format).toBe('direct')
    expect(opened?.streamUrl).toBe(proxyUrl)
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://192.168.1.50:5198/api/stream/open',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ mediaId: 'mov-1' }),
      })
    )

    const artUrl = await clientSyncManager.fetchServerArtwork('poster:mov-1')
    expect(artUrl).toBe('http://192.168.1.50:5198/api/artwork?key=poster%3Amov-1&token=tok-abc')
  })

  it('routes LAN API calls and SSE lifecycle through native Rust IPC when in Tauri shell', async () => {
    tauriMock.isTauri.mockReturnValue(true)

    let sseCallback: ((ev: { payload: unknown }) => void) | null = null
    const unlistenSpy = vi.fn()
    tauriMock.listen.mockImplementation(async (event: string, cb: (ev: { payload: unknown }) => void) => {
      if (event === 'kinora:client_sync_event') {
        sseCallback = cb
      }
      return unlistenSpy
    })

    tauriMock.invoke.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      if (cmd === 'client_server_request') {
        const path = args?.path
        if (path === '/pair') {
          return { status: 200, ok: true, body: JSON.stringify({ ok: true, token: 'native-tok-99' }) }
        }
        if (path === '/api/info') {
          return {
            status: 200,
            ok: true,
            body: JSON.stringify({
              appName: 'Kinora',
              version: '0.6.0',
              mode: 'server',
              localIp: '192.168.1.50',
              port: 5198,
              serverUrl: 'http://192.168.1.50:5198',
            }),
          }
        }
        if (path === '/api/channels') {
          return { status: 200, ok: true, body: JSON.stringify([{ id: 'ch-native', name: 'Native One' }]) }
        }
        if (path === '/api/sources') {
          return { status: 200, ok: true, body: JSON.stringify([]) }
        }
        if (path === '/api/library') {
          return { status: 200, ok: true, body: JSON.stringify({ favourites: [], watchlist: [], watchProgress: [] }) }
        }
        return { status: 200, ok: true, body: JSON.stringify([]) }
      }
      if (cmd === 'client_server_sse_connect') return true
      if (cmd === 'client_server_sse_disconnect') return undefined
      return null
    })

    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy

    const paired = await clientSyncManager.pairWithServer('http://192.168.1.50:5198', '7492', 'Desktop Client')
    expect(clientSyncManager.getState().error).toBeNull()
    expect(paired).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(tauriMock.invoke).toHaveBeenCalledWith('client_server_request', {
      serverUrl: 'http://192.168.1.50:5198',
      method: 'POST',
      path: '/pair',
      authToken: null,
      body: expect.stringContaining('"pin":"7492"'),
    })
    expect(tauriMock.invoke).toHaveBeenCalledWith('client_server_request', {
      serverUrl: 'http://192.168.1.50:5198',
      method: 'GET',
      path: '/api/channels',
      authToken: 'native-tok-99',
      body: null,
    })
    expect(clientSyncManager.getState().channels[0]?.name).toBe('Native One')

    // Allow async native SSE setup to complete, then emit a live sync_progress event.
    await new Promise((r) => setTimeout(r, 10))
    expect(tauriMock.invoke).toHaveBeenCalledWith('client_server_sse_connect', {
      serverUrl: 'http://192.168.1.50:5198',
      authToken: 'native-tok-99',
    })
    expect(sseCallback).not.toBeNull()
    sseCallback!({
      payload: {
        type: 'sync_progress',
        data: { itemRef: 'movie:solaris', title: 'Solaris', position: 320, duration: 6000 },
      },
    })
    expect(clientSyncManager.getState().library?.watchProgress).toEqual([
      expect.objectContaining({ itemRef: 'movie:solaris', position: 320 }),
    ])

    clientSyncManager.disconnect()
    expect(unlistenSpy).toHaveBeenCalled()
    expect(tauriMock.invoke).toHaveBeenCalledWith('client_server_sse_disconnect')
  })
})
