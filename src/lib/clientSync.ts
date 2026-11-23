/**
 * Client Mode Synchronization Engine for Kinora.
 * Handles client-to-server connection, pairing, initial catalogue synchronization,
 * real-time SSE updates, and watch progress synchronization.
 * Strictly adheres to project typography standards: zero em-dashes across all code and comments.
 */

import { useEffect, useState } from 'react'
import {
  fetchClientServerArtwork,
  inNativeShell,
  type RemoteChannelSummary,
  type RemoteEpgProgramme,
  type RemoteMediaItem,
  type RemoteSourceSummary,
  type RemoteLibrarySummary,
} from './native'

export type ClientSyncStatus = 'disconnected' | 'connecting' | 'connected' | 'syncing' | 'error'

export interface ServerSyncInfo {
  appName: string
  version: string
  mode: string
  localIp: string
  port: number
  serverUrl: string
}

export interface ClientSyncState {
  status: ClientSyncStatus
  serverUrl: string | null
  authToken: string | null
  serverInfo: ServerSyncInfo | null
  lastSyncTime: number | null
  error: string | null
  sources: RemoteSourceSummary[]
  channels: RemoteChannelSummary[]
  epg: RemoteEpgProgramme[]
  media: RemoteMediaItem[]
  library: RemoteLibrarySummary | null
}

const SERVER_URL_KEY = 'kinora.platform.serverUrl.v1'
const AUTH_TOKEN_KEY = 'kinora.platform.authToken.v1'

class ClientSyncManager {
  private state: ClientSyncState = {
    status: 'disconnected',
    serverUrl: null,
    authToken: null,
    serverInfo: null,
    lastSyncTime: null,
    error: null,
    sources: [],
    channels: [],
    epg: [],
    media: [],
    library: null,
  }

  private listeners = new Set<() => void>()
  private eventSource: EventSource | null = null

  constructor() {
    if (typeof localStorage !== 'undefined') {
      const savedUrl = localStorage.getItem(SERVER_URL_KEY)
      const savedToken = localStorage.getItem(AUTH_TOKEN_KEY)
      if (savedUrl && savedToken) {
        this.state.serverUrl = savedUrl
        this.state.authToken = savedToken
      }
    }
  }

  public getState(): ClientSyncState {
    return { ...this.state }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch (e) {
        console.error('Error in ClientSync listener:', e)
      }
    }
  }

  public setServerConfig(serverUrl: string, authToken: string): void {
    this.state.serverUrl = serverUrl.replace(/\/+$/, '')
    this.state.authToken = authToken
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SERVER_URL_KEY, this.state.serverUrl)
      localStorage.setItem(AUTH_TOKEN_KEY, authToken)
    }
    this.notify()
  }

  public clearServerConfig(): void {
    this.disconnect()
    this.state.serverUrl = null
    this.state.authToken = null
    this.state.serverInfo = null
    this.state.library = null
    this.state.sources = []
    this.state.channels = []
    this.state.epg = []
    this.state.media = []
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SERVER_URL_KEY)
      localStorage.removeItem(AUTH_TOKEN_KEY)
    }
    this.notify()
  }

  public async pairWithServer(
    serverUrl: string,
    pin: string,
    deviceName = 'Kinora Client',
    deviceType = 'desktopclient'
  ): Promise<boolean> {
    const cleanUrl = serverUrl.replace(/\/+$/, '')
    this.state.status = 'connecting'
    this.state.error = null
    this.notify()

    try {
      const res = await fetch(`${cleanUrl}/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: pin.trim(),
          deviceName,
          deviceType,
        }),
      })

      const data = await res.json()
      if (res.ok && data.ok && data.token) {
        this.setServerConfig(cleanUrl, data.token)
        return await this.connect()
      } else {
        this.state.status = 'error'
        this.state.error = data.error || 'Pairing rejected by server'
        this.notify()
        return false
      }
    } catch (e) {
      this.state.status = 'error'
      this.state.error = e instanceof Error ? e.message : 'Failed to reach Kinora server'
      this.notify()
      return false
    }
  }

  public async connect(): Promise<boolean> {
    const { serverUrl, authToken } = this.state
    if (!serverUrl || !authToken) {
      this.state.status = 'disconnected'
      this.notify()
      return false
    }

    this.state.status = 'connecting'
    this.state.error = null
    this.notify()

    try {
      // 1. Verify server info
      const infoRes = await fetch(`${serverUrl}/api/info`)
      if (!infoRes.ok) throw new Error('Server info unreachable')
      const info: ServerSyncInfo = await infoRes.json()
      this.state.serverInfo = info

      // 2. Perform initial synchronization
      await this.syncAll()

      // 3. Connect real-time SSE stream
      this.connectEventStream()

      this.state.status = 'connected'
      this.notify()
      return true
    } catch (e) {
      this.state.status = 'error'
      this.state.error = e instanceof Error ? e.message : 'Connection failed'
      this.notify()
      return false
    }
  }

  public disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
    this.state.status = 'disconnected'
    this.notify()
  }

  public async syncAll(): Promise<void> {
    const { serverUrl, authToken } = this.state
    if (!serverUrl || !authToken) return

    this.state.status = 'syncing'
    this.notify()

    try {
      const headers = { Authorization: `Bearer ${authToken}` }

      // Fetch channels, sources, library, EPG, and media catalogue in parallel
      const [channelsRes, sourcesRes, libraryRes, epgRes, mediaRes] = await Promise.all([
        fetch(`${serverUrl}/api/channels`, { headers }),
        fetch(`${serverUrl}/api/sources`, { headers }),
        fetch(`${serverUrl}/api/library`, { headers }),
        fetch(`${serverUrl}/api/epg`, { headers }).catch(() => null),
        fetch(`${serverUrl}/api/media`, { headers }).catch(() => null),
      ])

      if (channelsRes.ok) {
        this.state.channels = await channelsRes.json()
      }
      if (sourcesRes.ok) {
        this.state.sources = await sourcesRes.json()
      }
      if (libraryRes.ok) {
        this.state.library = await libraryRes.json()
      }
      if (epgRes?.ok) {
        const epgData = await epgRes.json()
        if (Array.isArray(epgData)) this.state.epg = epgData
      }
      if (mediaRes?.ok) {
        const mediaData = await mediaRes.json()
        if (Array.isArray(mediaData)) this.state.media = mediaData
      }

      this.state.lastSyncTime = Math.floor(Date.now() / 1000)
      this.state.status = 'connected'
      this.notify()
    } catch (e) {
      console.warn('Sync failed:', e)
      this.state.status = 'connected'
      this.notify()
    }
  }

  public async syncWatchProgress(
    itemRef: string,
    title: string,
    position: number,
    duration: number
  ): Promise<boolean> {
    const { serverUrl, authToken } = this.state
    if (!serverUrl || !authToken) return false

    try {
      const res = await fetch(`${serverUrl}/api/sync/progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          itemRef,
          title,
          position,
          duration,
        }),
      })
      return res.ok
    } catch {
      return false
    }
  }

  public async toggleLibraryItem(
    action: 'toggle_favourite' | 'toggle_watchlist',
    id: string
  ): Promise<boolean> {
    const { serverUrl, authToken } = this.state
    if (!serverUrl || !authToken) return false

    try {
      const res = await fetch(`${serverUrl}/api/sync/library`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          action,
          id,
        }),
      })
      return res.ok
    } catch {
      return false
    }
  }

  public async castMedia(
    targetUrl: string,
    media: {
      title: string
      streamUrl: string
      subtitle?: string
      position?: number
      isLive?: boolean
      artUrl?: string
    },
    token?: string
  ): Promise<boolean> {
    const cleanUrl = targetUrl.replace(/\/+$/, '')
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    const effectiveToken = token || this.state.authToken
    if (effectiveToken) {
      headers.Authorization = `Bearer ${effectiveToken}`
    }

    try {
      const res = await fetch(`${cleanUrl}/api/cast`, {
        method: 'POST',
        headers,
        body: JSON.stringify(media),
      })
      return res.ok
    } catch {
      return false
    }
  }

  private connectEventStream(): void {
    if (typeof EventSource === 'undefined') return
    if (this.eventSource) {
      this.eventSource.close()
    }

    const { serverUrl, authToken } = this.state
    if (!serverUrl || !authToken) return

    const sseUrl = `${serverUrl}/api/events?token=${encodeURIComponent(authToken)}`
    this.eventSource = new EventSource(sseUrl)

    this.eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (payload.type === 'sync_progress' && payload.data) {
          const item = payload.data
          if (this.state.library) {
            const list = [...this.state.library.watchProgress]
            const idx = list.findIndex((p) => p.itemRef === item.itemRef)
            if (idx >= 0) {
              list[idx] = item
            } else {
              list.push(item)
            }
            this.state.library.watchProgress = list
            this.notify()
          }
        } else if (payload.type === 'sync_library' && payload.data) {
          if (this.state.library) {
            this.state.library.favourites = payload.data.favourites || this.state.library.favourites
            this.state.library.watchlist = payload.data.watchlist || this.state.library.watchlist
            this.notify()
          }
        }
      } catch (e) {
        console.debug('Received SSE message:', event.data)
      }
    }

    this.eventSource.onerror = () => {
      // EventSource reconnects automatically on network hiccups
    }
  }

  public async openServerStream(channelId: string): Promise<{
    streamUrl: string
    sessionKey: string
    proxyPath: string
    format: 'hls' | 'direct'
  } | null> {
    return this.openServerTarget({ channelId })
  }

  public async openServerMediaStream(mediaId: string): Promise<{
    streamUrl: string
    sessionKey: string
    proxyPath: string
    format: 'hls' | 'direct'
  } | null> {
    return this.openServerTarget({ mediaId })
  }

  private async openServerTarget(payload: { channelId?: string; mediaId?: string }): Promise<{
    streamUrl: string
    sessionKey: string
    proxyPath: string
    format: 'hls' | 'direct'
  } | null> {
    const { serverUrl, authToken } = this.state
    if (!serverUrl || !authToken) return null

    try {
      const res = await fetch(`${serverUrl}/api/stream/open`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) return null
      const data = await res.json()
      if (data.ok && typeof data.streamUrl === 'string' && typeof data.sessionKey === 'string') {
        return {
          streamUrl: data.streamUrl,
          sessionKey: data.sessionKey,
          proxyPath: typeof data.proxyPath === 'string' ? data.proxyPath : '',
          format: data.format === 'direct' ? 'direct' : 'hls',
        }
      }
      return null
    } catch {
      return null
    }
  }

  public async fetchServerArtwork(artworkKey: string): Promise<string | null> {
    const { serverUrl, authToken } = this.state
    if (!serverUrl || !authToken || !artworkKey.trim()) return null

    if (inNativeShell()) {
      return fetchClientServerArtwork(serverUrl, authToken, artworkKey)
    }

    return `${serverUrl}/api/artwork?key=${encodeURIComponent(artworkKey)}&token=${encodeURIComponent(authToken)}`
  }

  public async closeServerStream(sessionKey: string): Promise<void> {
    const { serverUrl, authToken } = this.state
    if (!serverUrl || !authToken || !sessionKey) return
    try {
      await fetch(`${serverUrl}/api/stream/close`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ sessionKey }),
      })
    } catch {
      // Best-effort close on disconnect or channel switch
    }
  }

  public async resolveStreamUrl(channelId: string): Promise<string | null> {
    const opened = await this.openServerStream(channelId)
    return opened ? opened.streamUrl : null
  }
}

export const clientSyncManager = new ClientSyncManager()

export function useClientSync(): ClientSyncState & {
  pairWithServer: (serverUrl: string, pin: string, deviceName?: string, deviceType?: string) => Promise<boolean>
  connect: () => Promise<boolean>
  disconnect: () => void
  syncAll: () => Promise<void>
  syncWatchProgress: (itemRef: string, title: string, position: number, duration: number) => Promise<boolean>
  toggleLibraryItem: (action: 'toggle_favourite' | 'toggle_watchlist', id: string) => Promise<boolean>
  castMedia: (targetUrl: string, media: { title: string; streamUrl: string; subtitle?: string; position?: number; isLive?: boolean; artUrl?: string }) => Promise<boolean>
  resolveStreamUrl: (channelId: string) => Promise<string | null>
  openServerMediaStream: (mediaId: string) => Promise<{ streamUrl: string; sessionKey: string; proxyPath: string; format: 'hls' | 'direct' } | null>
  fetchServerArtwork: (artworkKey: string) => Promise<string | null>
} {
  const [state, setState] = useState(() => clientSyncManager.getState())

  useEffect(() => {
    return clientSyncManager.subscribe(() => {
      setState(clientSyncManager.getState())
    })
  }, [])

  return {
    ...state,
    pairWithServer: (url, pin, name, type) => clientSyncManager.pairWithServer(url, pin, name, type),
    connect: () => clientSyncManager.connect(),
    disconnect: () => clientSyncManager.disconnect(),
    syncAll: () => clientSyncManager.syncAll(),
    syncWatchProgress: (ref, title, pos, dur) => clientSyncManager.syncWatchProgress(ref, title, pos, dur),
    toggleLibraryItem: (action, id) => clientSyncManager.toggleLibraryItem(action, id),
    castMedia: (url, media) => clientSyncManager.castMedia(url, media),
    resolveStreamUrl: (channelId) => clientSyncManager.resolveStreamUrl(channelId),
    openServerMediaStream: (mediaId) => clientSyncManager.openServerMediaStream(mediaId),
    fetchServerArtwork: (artworkKey) => clientSyncManager.fetchServerArtwork(artworkKey),
  }
}
