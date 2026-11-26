/**
 * Client Mode Synchronization Engine for Kinora.
 * Handles client-to-server connection, pairing, initial catalogue synchronization,
 * real-time SSE updates, and watch progress synchronization.
 * Strictly adheres to project typography standards: zero em-dashes across all code and comments.
 */

import { useEffect, useState } from 'react'
import {
  clientServerRequest,
  connectClientServerSse,
  disconnectClientServerSse,
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
  apiVersion?: string
  minCompatibleClientVersion?: string
  health?: string
  uptimeSecs?: number
  trustedDevicesCount?: number
  connectedClients?: number
  mode: string
  localIp: string
  port: number
  serverUrl: string
}

export interface ServerCompatibilityReport {
  status: 'compatible' | 'clientOutdated' | 'serverOutdated' | 'unknown'
  clientVersion: string
  serverVersion: string | null
  message: string
}

function parseSemverTuple(v: string): [number, number, number] | null {
  const clean = v.trim().replace(/^v/i, '').split('-')[0] ?? ''
  const parts = clean.split('.').map((p) => Number.parseInt(p, 10))
  if (parts.length < 2 || parts.some((n) => Number.isNaN(n))) return null
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}

function compareSemverTuples(a: [number, number, number], b: [number, number, number]): number {
  if (a[0] !== b[0]) return a[0] - b[0]
  if (a[1] !== b[1]) return a[1] - b[1]
  return a[2] - b[2]
}

/**
 * Evaluates compatibility between the local Kinora client version and a connected Kinora Server.
 */
export function evaluateServerCompatibility(
  clientVersion: string,
  serverInfo: ServerSyncInfo | null,
): ServerCompatibilityReport {
  if (!serverInfo?.version) {
    return {
      status: 'unknown',
      clientVersion,
      serverVersion: null,
      message: 'Not connected to a Kinora Server.',
    }
  }
  const c = parseSemverTuple(clientVersion)
  const s = parseSemverTuple(serverInfo.version)
  if (!c || !s) {
    return {
      status: 'unknown',
      clientVersion,
      serverVersion: serverInfo.version,
      message: `Connected to Kinora Server v${serverInfo.version}.`,
    }
  }

  if (serverInfo.minCompatibleClientVersion) {
    const minC = parseSemverTuple(serverInfo.minCompatibleClientVersion)
    if (minC && compareSemverTuples(c, minC) < 0) {
      return {
        status: 'clientOutdated',
        clientVersion,
        serverVersion: serverInfo.version,
        message: `Kinora Server v${serverInfo.version} requires client v${serverInfo.minCompatibleClientVersion} or newer (installed: v${clientVersion}). Update this client.`,
      }
    }
  }

  if (c[0] > s[0] || (c[0] === s[0] && c[1] > s[1])) {
    return {
      status: 'serverOutdated',
      clientVersion,
      serverVersion: serverInfo.version,
      message: `Connected Kinora Server v${serverInfo.version} is older than client v${clientVersion}. Update Kinora Server for full feature compatibility.`,
    }
  }

  return {
    status: 'compatible',
    clientVersion,
    serverVersion: serverInfo.version,
    message: `Client v${clientVersion} is compatible with Kinora Server v${serverInfo.version}${serverInfo.apiVersion ? ` (API ${serverInfo.apiVersion})` : ''}.`,
  }
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
  private unlistenNativeSse: (() => void) | null = null
  private sseConnectionSeq = 0

  private async lanRequest(
    serverUrl: string,
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    authToken?: string | null,
    body?: unknown
  ): Promise<{ ok: boolean; status: number; json: <T = unknown>() => Promise<T> }> {
    const cleanUrl = serverUrl.replace(/\/+$/, '')
    if (inNativeShell()) {
      const nativeRes = await clientServerRequest(
        cleanUrl,
        method,
        path,
        authToken ?? null,
        body !== undefined ? JSON.stringify(body) : null
      )
      return {
        ok: nativeRes.ok,
        status: nativeRes.status,
        json: async <T = unknown>() => JSON.parse(nativeRes.body) as T,
      }
    }

    const headers: Record<string, string> = {}
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`
    }

    const hasHeaders = Object.keys(headers).length > 0
    const init: RequestInit | undefined =
      method === 'GET' && !hasHeaders && body === undefined
        ? undefined
        : {
            ...(method !== 'GET' ? { method } : {}),
            ...(hasHeaders ? { headers } : {}),
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          }

    const res = init ? await fetch(`${cleanUrl}${path}`, init) : await fetch(`${cleanUrl}${path}`)
    return {
      ok: res.ok,
      status: res.status ?? (res.ok ? 200 : 500),
      json: async <T = unknown>() => (await res.json()) as T,
    }
  }

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
      const res = await this.lanRequest(cleanUrl, 'POST', '/pair', null, {
        pin: pin.trim(),
        deviceName,
        deviceType,
      })

      const data = await res.json<{ ok?: boolean; token?: string; error?: string }>()
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
      const infoRes = await this.lanRequest(serverUrl, 'GET', '/api/info')
      if (!infoRes.ok) throw new Error('Server info unreachable')
      const info = await infoRes.json<ServerSyncInfo>()
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
    this.sseConnectionSeq += 1
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
    if (this.unlistenNativeSse) {
      this.unlistenNativeSse()
      this.unlistenNativeSse = null
    }
    if (inNativeShell()) {
      void disconnectClientServerSse()
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
      // Fetch channels, sources, library, EPG, and media catalogue in parallel
      const [channelsRes, sourcesRes, libraryRes, epgRes, mediaRes] = await Promise.all([
        this.lanRequest(serverUrl, 'GET', '/api/channels', authToken),
        this.lanRequest(serverUrl, 'GET', '/api/sources', authToken),
        this.lanRequest(serverUrl, 'GET', '/api/library', authToken),
        this.lanRequest(serverUrl, 'GET', '/api/epg', authToken).catch(() => null),
        this.lanRequest(serverUrl, 'GET', '/api/media', authToken).catch(() => null),
      ])

      if (channelsRes.ok) {
        this.state.channels = await channelsRes.json<RemoteChannelSummary[]>()
      }
      if (sourcesRes.ok) {
        this.state.sources = await sourcesRes.json<RemoteSourceSummary[]>()
      }
      if (libraryRes.ok) {
        this.state.library = await libraryRes.json<RemoteLibrarySummary>()
      }
      if (epgRes?.ok) {
        const epgData = await epgRes.json<unknown>()
        if (Array.isArray(epgData)) this.state.epg = epgData as RemoteEpgProgramme[]
      }
      if (mediaRes?.ok) {
        const mediaData = await mediaRes.json<unknown>()
        if (Array.isArray(mediaData)) this.state.media = mediaData as RemoteMediaItem[]
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
      const res = await this.lanRequest(serverUrl, 'POST', '/api/sync/progress', authToken, {
        itemRef,
        title,
        position,
        duration,
        updatedAt: Math.floor(Date.now() / 1000),
      })
      return res.ok
    } catch {
      return false
    }
  }

  public async removeWatchProgress(itemRef: string): Promise<boolean> {
    const { serverUrl, authToken } = this.state
    if (!serverUrl || !authToken) return false

    try {
      const res = await this.lanRequest(serverUrl, 'POST', '/api/sync/progress', authToken, {
        itemRef,
        remove: true,
      })
      return res.ok
    } catch {
      return false
    }
  }

  public async toggleLibraryItem(
    action: 'toggle_favourite' | 'toggle_watchlist' | 'mark_watched',
    id: string
  ): Promise<boolean> {
    const { serverUrl, authToken } = this.state
    if (!serverUrl || !authToken) return false

    try {
      const res = await this.lanRequest(serverUrl, 'POST', '/api/sync/library', authToken, {
        action,
        id,
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
    const effectiveToken = token || this.state.authToken

    try {
      const res = await this.lanRequest(cleanUrl, 'POST', '/api/cast', effectiveToken, media)
      return res.ok
    } catch {
      return false
    }
  }

  private handleSsePayload(payload: unknown): void {
    if (!payload || typeof payload !== 'object') return
    const record = payload as { type?: string; data?: Record<string, unknown> }
    if (record.type === 'sync_progress' && record.data) {
      const raw = record.data as unknown as RemoteLibrarySummary['watchProgress'][number] & { remove?: boolean }
      if (this.state.library) {
        const list = [...this.state.library.watchProgress]
        const idx = list.findIndex((p) => p.itemRef === raw.itemRef)
        if (raw.remove) {
          if (idx >= 0) list.splice(idx, 1)
        } else if (idx >= 0) {
          const existing = list[idx]
          const existingTs = existing?.updatedAt ?? 0
          const incomingTs = raw.updatedAt ?? 0
          if (incomingTs === 0 || incomingTs >= existingTs) {
            list[idx] = raw
          }
        } else {
          list.push(raw)
        }
        this.state.library.watchProgress = list
        this.notify()
      }
    } else if (record.type === 'sync_library' && record.data) {
      if (this.state.library) {
        if (Array.isArray(record.data.favourites)) {
          this.state.library.favourites = record.data.favourites as string[]
        }
        if (Array.isArray(record.data.watchlist)) {
          this.state.library.watchlist = record.data.watchlist as string[]
        }
        this.notify()
      }
    }
  }

  private connectEventStream(): void {
    const seq = ++this.sseConnectionSeq
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
    if (this.unlistenNativeSse) {
      this.unlistenNativeSse()
      this.unlistenNativeSse = null
    }

    const { serverUrl, authToken } = this.state
    if (!serverUrl || !authToken) return

    if (inNativeShell()) {
      void (async () => {
        try {
          const { listen } = await import('@tauri-apps/api/event')
          const unlisten = await listen<unknown>('kinora:client_sync_event', (ev) => {
            this.handleSsePayload(ev.payload)
          })
          if (this.sseConnectionSeq !== seq) {
            unlisten()
            return
          }
          this.unlistenNativeSse = unlisten
          await connectClientServerSse(serverUrl, authToken)
          if (this.sseConnectionSeq !== seq) {
            await disconnectClientServerSse()
          }
        } catch (e) {
          console.debug('Native SSE bridge failed to connect:', e)
        }
      })()
      return
    }

    if (typeof EventSource === 'undefined') return

    const sseUrl = `${serverUrl}/api/events?token=${encodeURIComponent(authToken)}`
    this.eventSource = new EventSource(sseUrl)

    this.eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        this.handleSsePayload(payload)
      } catch {
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
      const res = await this.lanRequest(serverUrl, 'POST', '/api/stream/open', authToken, payload)
      if (!res.ok) return null
      const data = await res.json<{
        ok?: boolean
        streamUrl?: string
        sessionKey?: string
        proxyPath?: string
        format?: string
      }>()
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
      await this.lanRequest(serverUrl, 'POST', '/api/stream/close', authToken, { sessionKey })
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

export interface LocalLibraryShape {
  favourites: string[]
  watchlist: string[]
  progress: Record<string, { pos: number; dur: number; at: number }>
}

/**
 * Merges a paired Kinora Server's shared library snapshot (favourites, watchlist, watchProgress)
 * over local library state while in connected Client mode, without mutating either input.
 */
export function mergeRemoteLibraryIntoLocal<T extends LocalLibraryShape>(
  local: T,
  remote: RemoteLibrarySummary | null,
  connected: boolean
): T {
  if (!connected || !remote) return local

  const nextProgress: Record<string, { pos: number; dur: number; at: number }> = { ...local.progress }
  if (Array.isArray(remote.watchProgress)) {
    for (const entry of remote.watchProgress) {
      if (!entry || typeof entry.itemRef !== 'string' || !entry.itemRef) continue
      const existing = nextProgress[entry.itemRef]
      const rawAt = Number(entry.updatedAt) || 0
      const remoteAtMs = rawAt >= 1e9 && rawAt < 1e12 ? rawAt * 1000 : rawAt
      if (!existing || remoteAtMs >= existing.at) {
        nextProgress[entry.itemRef] = {
          pos: Math.max(0, Number(entry.position) || 0),
          dur: Math.max(0, Number(entry.duration) || 0),
          at: remoteAtMs || Date.now(),
        }
      }
    }
  }

  return {
    ...local,
    favourites: Array.isArray(remote.favourites) ? [...remote.favourites] : local.favourites,
    watchlist: Array.isArray(remote.watchlist) ? [...remote.watchlist] : local.watchlist,
    progress: nextProgress,
  }
}

export function useClientSync(): ClientSyncState & {
  pairWithServer: (serverUrl: string, pin: string, deviceName?: string, deviceType?: string) => Promise<boolean>
  connect: () => Promise<boolean>
  disconnect: () => void
  syncAll: () => Promise<void>
  syncWatchProgress: (itemRef: string, title: string, position: number, duration: number) => Promise<boolean>
  removeWatchProgress: (itemRef: string) => Promise<boolean>
  toggleLibraryItem: (action: 'toggle_favourite' | 'toggle_watchlist' | 'mark_watched', id: string) => Promise<boolean>
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
    removeWatchProgress: (ref) => clientSyncManager.removeWatchProgress(ref),
    toggleLibraryItem: (action, id) => clientSyncManager.toggleLibraryItem(action, id),
    castMedia: (url, media) => clientSyncManager.castMedia(url, media),
    resolveStreamUrl: (channelId) => clientSyncManager.resolveStreamUrl(channelId),
    openServerMediaStream: (mediaId) => clientSyncManager.openServerMediaStream(mediaId),
    fetchServerArtwork: (artworkKey) => clientSyncManager.fetchServerArtwork(artworkKey),
  }
}
