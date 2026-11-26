/**
 * Unified Kinora Capability Service.
 * Exposes typed, permission-checked application operations shared by the UI,
 * mobile remote, voice commands, and authorised AI agents so all surfaces use
 * the exact same underlying application services without duplicate logic.
 * Strictly adheres to project typography standards: zero em-dashes.
 */

import { dispatchKinoraCommand } from './commands'
import { APP_VERSION, getPlatformMode, getRemoteServerStatus, getTrustedDevices, dvrGetRecordings, getDownloads } from './native'

export type CapabilityScope =
  | 'read:media'
  | 'read:epg'
  | 'read:playback'
  | 'read:library'
  | 'read:sources'
  | 'read:recordings'
  | 'read:devices'
  | 'read:system'
  | 'control:playback'
  | 'control:navigation'
  | 'control:channels'
  | 'control:library'
  | 'control:cast'
  | 'admin:sensitive'

export interface CapabilityCaller {
  id: string
  name: string
  /** Legacy capability tags (e.g. 'AiAgent', 'RemoteControl') or granular CapabilityScope strings. */
  capabilities: string[]
  /** Explicit user confirmation flag for sensitive or destructive operations. */
  confirmed?: boolean
}

export interface CapabilityAuditEntry {
  id: string
  timestamp: string
  callerId: string
  callerName: string
  operation: string
  scope: CapabilityScope
  status: 'allowed' | 'denied' | 'confirmation_required' | 'error'
  summary: string
}

export interface CapabilityResult<T = unknown> {
  ok: boolean
  code: 'OK' | 'FORBIDDEN' | 'CONFIRMATION_REQUIRED' | 'UNAVAILABLE' | 'INVALID' | 'ERROR'
  message: string
  data?: T
}

export interface LiveProgrammeHit {
  channelId: string
  channelName: string
  channelNumber?: number
  currentTitle: string | null
  nextTitle: string | null
  startIso?: string
  stopIso?: string
}

export interface MediaSearchHit {
  id: string
  title: string
  kind: 'channel' | 'movie' | 'series' | 'podcast' | 'book' | 'radio' | 'music' | 'other'
  subtitle?: string
  route: string
}

export interface NowPlayingSnapshot {
  active: boolean
  isPlaying: boolean
  title: string | null
  subtitle?: string | null
  isLive?: boolean
  channelName?: string | null
  positionSec?: number
  durationSec?: number
}

export interface CapabilityRuntimeDelegates {
  navigate?: (path: string) => void
  searchMedia?: (query: string, kind?: string) => MediaSearchHit[]
  queryEpg?: (channelName?: string, query?: string) => LiveProgrammeHit[]
  getNowPlaying?: () => NowPlayingSnapshot
  getContinueWatchingRef?: () => { ref: string; title: string } | null
  toggleFavourite?: (itemRef: string, mode?: 'add' | 'remove' | 'toggle') => boolean
  toggleWatchlist?: (itemRef: string, mode?: 'add' | 'remove' | 'toggle') => boolean
  getSourcesSummary?: () => { id: string; name: string; kind: string; count: number }[]
  getLibraryStats?: () => { favourites: number; watchlist: number; history: number; collections: number }
  castHandoff?: (targetDeviceId: string, media?: { title: string; streamUrl: string }) => Promise<boolean> | boolean
  getLatestReleaseSummary?: () => { version: string; releaseDate: string; title: string } | null
}

const MAX_LOCAL_AUDIT = 150

function normalizeRoute(destination: string): string {
  const clean = destination.trim().replace(/^#/, '')
  const lower = clean.toLowerCase()
  switch (lower) {
    case '':
    case '/':
    case 'home':
      return '/'
    case 'live':
    case 'livetv':
    case 'live-tv':
    case 'guide':
    case 'epg':
      return '/live'
    case 'movies':
    case 'films':
      return '/movies'
    case 'series':
    case 'shows':
    case 'tv':
      return '/series'
    case 'library':
    case 'favourites':
    case 'favorites':
    case 'watchlist':
      return '/library'
    case 'recordings':
    case 'dvr':
      return '/recordings'
    case 'sources':
      return '/sources'
    case 'settings':
    case 'preferences':
      return '/settings'
    case 'search':
      return '/search'
    case 'discover':
    case 'genres':
      return '/discover'
    case 'podcasts':
      return '/podcasts'
    case 'books':
    case 'reading':
      return '/books'
    case 'radio':
      return '/radio'
    case 'music':
      return '/music'
    case 'audiobooks':
      return '/audiobooks'
    default:
      return clean.startsWith('/') ? clean : `/${clean}`
  }
}

/**
 * Maps legacy capability tags (RemoteControl, PlaybackControl, MediaBrowse, ClientSync, MediaCast, AiAgent)
 * and granular scopes to an authorization decision.
 */
export function callerHasScope(caller: CapabilityCaller | undefined, scope: CapabilityScope): boolean {
  if (!caller) {
    // Local in-app user invocation (UI / local keyboard / local push-to-talk)
    return scope !== 'admin:sensitive'
  }
  const normalized = caller.capabilities.map((c) => c.toLowerCase())
  if (scope === 'admin:sensitive') {
    return normalized.includes('admin:sensitive') && Boolean(caller.confirmed)
  }
  if (normalized.includes(scope.toLowerCase())) return true

  switch (scope) {
    case 'read:media':
    case 'read:epg':
    case 'read:system':
    case 'read:sources':
    case 'read:recordings':
    case 'read:devices':
      return normalized.some((c) => c.includes('browse') || c.includes('remote') || c.includes('agent') || c.includes('sync'))
    case 'read:playback':
    case 'control:playback':
      return normalized.some((c) => c.includes('playback') || c.includes('remote') || c.includes('agent'))
    case 'control:navigation':
      return normalized.some((c) => c.includes('remote') || c.includes('agent'))
    case 'control:channels':
      return normalized.some((c) => c.includes('playback') || c.includes('remote') || c.includes('agent') || c.includes('browse'))
    case 'read:library':
    case 'control:library':
      return normalized.some((c) => c.includes('sync') || c.includes('agent'))
    case 'control:cast':
      return normalized.some((c) => c.includes('cast') || c.includes('agent'))
    case 'admin:sensitive':
      return normalized.includes('admin:sensitive') && Boolean(caller.confirmed)
    default:
      return false
  }
}

class KinoraCapabilityService {
  private delegates: CapabilityRuntimeDelegates = {}
  private auditLog: CapabilityAuditEntry[] = []

  public registerDelegates(delegates: CapabilityRuntimeDelegates): () => void {
    this.delegates = { ...this.delegates, ...delegates }
    return () => {
      this.delegates = {}
    }
  }

  public getAuditLog(): CapabilityAuditEntry[] {
    return [...this.auditLog]
  }

  public clearAuditLog(): void {
    this.auditLog = []
  }

  private recordAudit(
    caller: CapabilityCaller | undefined,
    operation: string,
    scope: CapabilityScope,
    status: CapabilityAuditEntry['status'],
    summary: string,
  ): void {
    this.auditLog.unshift({
      id: `cap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      callerId: caller?.id ?? 'local-user',
      callerName: caller?.name ?? 'Local User',
      operation,
      scope,
      status,
      summary,
    })
    if (this.auditLog.length > MAX_LOCAL_AUDIT) {
      this.auditLog.length = MAX_LOCAL_AUDIT
    }
  }

  private checkScope(
    caller: CapabilityCaller | undefined,
    operation: string,
    scope: CapabilityScope,
    deniedMessage: string,
  ): CapabilityResult | null {
    if (scope === 'admin:sensitive' && !caller?.confirmed) {
      this.recordAudit(caller, operation, scope, 'confirmation_required', 'Explicit user confirmation required')
      return {
        ok: false,
        code: 'CONFIRMATION_REQUIRED',
        message: `Operation "${operation}" requires explicit user confirmation.`,
      }
    }
    if (!callerHasScope(caller, scope)) {
      this.recordAudit(caller, operation, scope, 'denied', deniedMessage)
      return {
        ok: false,
        code: 'FORBIDDEN',
        message: deniedMessage,
      }
    }
    return null
  }

  public navigate(destination: string, caller?: CapabilityCaller): CapabilityResult<{ route: string }> {
    const denied = this.checkScope(caller, 'navigate', 'control:navigation', 'Caller lacks navigation capability')
    if (denied) return denied as CapabilityResult<{ route: string }>

    const route = normalizeRoute(destination)
    dispatchKinoraCommand({ type: 'navigate', payload: { to: route }, source: caller ? 'api' : 'voice' })

    if (this.delegates.navigate) {
      this.delegates.navigate(route)
    } else if (typeof window !== 'undefined') {
      const win = window as unknown as { __kinora_navigate?: (to: string) => void }
      if (win.__kinora_navigate) {
        win.__kinora_navigate(route)
      } else {
        window.location.hash = `#${route}`
      }
    }

    this.recordAudit(caller, 'navigate', 'control:navigation', 'allowed', `Navigated to ${route}`)
    return { ok: true, code: 'OK', message: `Navigated to ${destination}`, data: { route } }
  }

  public search(
    query: string,
    options?: { mediaKind?: string; openResults?: boolean },
    caller?: CapabilityCaller,
  ): CapabilityResult<{ query: string; hits: MediaSearchHit[] }> {
    const denied = this.checkScope(caller, 'search', 'read:media', 'Caller lacks search capability')
    if (denied) return denied as CapabilityResult<{ query: string; hits: MediaSearchHit[] }>

    const trimmed = query.trim()
    if (!trimmed) {
      return { ok: false, code: 'INVALID', message: 'Search query cannot be empty.' }
    }

    const hits = this.delegates.searchMedia ? this.delegates.searchMedia(trimmed, options?.mediaKind) : []

    if (options?.openResults !== false) {
      const searchRoute = `/search?q=${encodeURIComponent(trimmed)}${options?.mediaKind ? `&type=${encodeURIComponent(options.mediaKind)}` : ''}`
      dispatchKinoraCommand({ type: 'searchMedia', payload: { query: trimmed }, source: caller ? 'api' : 'voice' })
      if (this.delegates.navigate) {
        this.delegates.navigate(searchRoute)
      } else if (typeof window !== 'undefined') {
        const win = window as unknown as { __kinora_navigate?: (to: string) => void }
        if (win.__kinora_navigate) {
          win.__kinora_navigate(searchRoute)
        } else {
          window.location.hash = `#${searchRoute}`
        }
      }
    }

    const summary = hits.length > 0
      ? `Found ${hits.length} result${hits.length === 1 ? '' : 's'} for "${trimmed}": ${hits.slice(0, 3).map((h) => h.title).join(', ')}`
      : `Searching for: ${trimmed}`

    this.recordAudit(caller, 'search', 'read:media', 'allowed', summary)
    return { ok: true, code: 'OK', message: summary, data: { query: trimmed, hits } }
  }

  public queryEpg(
    params?: { channelName?: string; query?: string },
    caller?: CapabilityCaller,
  ): CapabilityResult<{ programmes: LiveProgrammeHit[] }> {
    const denied = this.checkScope(caller, 'query_epg', 'read:epg', 'Caller lacks EPG read capability')
    if (denied) return denied as CapabilityResult<{ programmes: LiveProgrammeHit[] }>

    const programmes = this.delegates.queryEpg ? this.delegates.queryEpg(params?.channelName, params?.query) : []
    let message: string
    if (programmes.length === 0) {
      message = params?.channelName
        ? `No current programme listings found for "${params.channelName}".`
        : 'No current live television listings are loaded right now.'
    } else {
      const preview = programmes
        .slice(0, 4)
        .map((p) => `${p.channelName}: ${p.currentTitle ?? 'Live broadcast'}`)
        .join('; ')
      message = `On television now: ${preview}`
    }

    this.recordAudit(caller, 'query_epg', 'read:epg', 'allowed', `${programmes.length} EPG matches`)
    return { ok: true, code: 'OK', message, data: { programmes } }
  }

  public getNowPlaying(caller?: CapabilityCaller): CapabilityResult<NowPlayingSnapshot> {
    const denied = this.checkScope(caller, 'now_playing', 'read:playback', 'Caller lacks playback read capability')
    if (denied) return denied as CapabilityResult<NowPlayingSnapshot>

    const snap: NowPlayingSnapshot = this.delegates.getNowPlaying
      ? this.delegates.getNowPlaying()
      : { active: false, isPlaying: false, title: null }

    const message = snap.active && snap.title
      ? `${snap.isPlaying ? 'Now playing' : 'Paused'}: ${snap.title}${snap.channelName ? ` on ${snap.channelName}` : ''}`
      : 'Nothing is currently playing.'

    this.recordAudit(caller, 'now_playing', 'read:playback', 'allowed', message)
    return { ok: true, code: 'OK', message, data: snap }
  }

  public controlPlayback(
    action: 'play' | 'pause' | 'toggle' | 'seek' | 'volume' | 'mute' | 'step_back' | 'step_forward' | 'resume_last',
    value?: number,
    caller?: CapabilityCaller,
  ): CapabilityResult {
    const denied = this.checkScope(caller, `playback:${action}`, 'control:playback', 'Caller lacks playback control capability')
    if (denied) return denied

    if (action === 'resume_last') {
      const last = this.delegates.getContinueWatchingRef?.()
      if (last) {
        const route = `/watch/${encodeURIComponent(last.ref)}`
        if (this.delegates.navigate) {
          this.delegates.navigate(route)
        } else if (typeof window !== 'undefined') {
          const win = window as unknown as { __kinora_navigate?: (to: string) => void }
          if (win.__kinora_navigate) win.__kinora_navigate(route)
          else window.location.hash = `#${route}`
        }
        this.recordAudit(caller, 'playback:resume_last', 'control:playback', 'allowed', `Resumed ${last.title}`)
        return { ok: true, code: 'OK', message: `Continuing playback: ${last.title}`, data: last }
      }
      dispatchKinoraCommand({ type: 'resumePlayback', source: caller ? 'api' : 'voice' })
      this.recordAudit(caller, 'playback:resume_last', 'control:playback', 'allowed', 'Resumed active playback')
      return { ok: true, code: 'OK', message: 'Resumed playback.' }
    }

    if (action === 'play') {
      dispatchKinoraCommand({ type: 'resumePlayback', source: caller ? 'api' : 'voice' })
    } else if (action === 'pause') {
      dispatchKinoraCommand({ type: 'pausePlayback', source: caller ? 'api' : 'voice' })
    } else if (action === 'toggle') {
      dispatchKinoraCommand({ type: 'togglePlayback', source: caller ? 'api' : 'voice' })
    } else if (action === 'mute') {
      dispatchKinoraCommand({ type: 'toggleMute', source: caller ? 'api' : 'voice' })
    } else if (action === 'seek' && typeof value === 'number' && Number.isFinite(value)) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kinora:remote_seek', { detail: { positionSec: Math.max(0, value) } }))
      }
    } else if (action === 'step_forward') {
      const delta = typeof value === 'number' && value > 0 ? value : 30
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kinora:remote_seek_delta', { detail: { deltaSec: delta } }))
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true }))
      }
    } else if (action === 'step_back') {
      const delta = typeof value === 'number' && value > 0 ? -value : -10
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kinora:remote_seek_delta', { detail: { deltaSec: delta } }))
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', bubbles: true }))
      }
    } else if (action === 'volume' && typeof value === 'number') {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kinora:remote_volume_delta', { detail: { delta: value > 0 ? 0.1 : -0.1 } }))
        const key = value > 0 ? 'ArrowUp' : 'ArrowDown'
        window.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true }))
      }
    }

    this.recordAudit(caller, `playback:${action}`, 'control:playback', 'allowed', `Executed playback action: ${action}`)
    return { ok: true, code: 'OK', message: `Executed playback action: ${action}` }
  }

  public tuneChannel(
    target: { channelId?: string; channelNumber?: number; channelName?: string },
    caller?: CapabilityCaller,
  ): CapabilityResult {
    const denied = this.checkScope(caller, 'tune', 'control:channels', 'Caller lacks channel tuning capability')
    if (denied) return denied

    dispatchKinoraCommand({
      type: 'changeChannel',
      payload: { channelId: target.channelId, channelNumber: target.channelNumber },
      source: caller ? 'api' : 'voice',
    })

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kinora:tune_channel', {
        detail: {
          channelId: target.channelId,
          channelNumber: target.channelNumber,
          channelName: target.channelName,
        },
      }))
    }

    const desc = target.channelNumber ? `Channel ${target.channelNumber}` : (target.channelName || target.channelId || 'channel')
    this.recordAudit(caller, 'tune', 'control:channels', 'allowed', `Tuning to ${desc}`)
    return { ok: true, code: 'OK', message: `Tuning to ${desc}` }
  }

  public updateLibraryList(
    list: 'favourites' | 'watchlist',
    action: 'add' | 'remove' | 'toggle',
    itemRef: string,
    caller?: CapabilityCaller,
  ): CapabilityResult {
    const denied = this.checkScope(caller, list, 'control:library', 'Caller lacks library modification capability')
    if (denied) return denied

    if (list === 'favourites' && this.delegates.toggleFavourite) {
      this.delegates.toggleFavourite(itemRef, action)
    } else if (list === 'watchlist' && this.delegates.toggleWatchlist) {
      this.delegates.toggleWatchlist(itemRef, action)
    } else if (typeof window !== 'undefined') {
      const eventName = list === 'favourites' ? 'kinora:toggle_favourite' : 'kinora:toggle_watchlist'
      window.dispatchEvent(new CustomEvent(eventName, { detail: { ref: itemRef, action } }))
    }

    const label = list === 'favourites' ? 'favourite' : 'watchlist'
    this.recordAudit(caller, `${list}:${action}`, 'control:library', 'allowed', `Updated ${label} status for ${itemRef}`)
    return { ok: true, code: 'OK', message: `Updated ${label} status for ${itemRef}` }
  }

  public async handoffPlayback(
    targetDeviceId: string,
    media?: { title: string; streamUrl: string },
    caller?: CapabilityCaller,
  ): Promise<CapabilityResult> {
    const denied = this.checkScope(caller, 'handoff', 'control:cast', 'Caller lacks media handoff capability')
    if (denied) return denied

    if (this.delegates.castHandoff) {
      const ok = await this.delegates.castHandoff(targetDeviceId, media)
      if (!ok) {
        this.recordAudit(caller, 'handoff', 'control:cast', 'error', `Device ${targetDeviceId} not reachable`)
        return { ok: false, code: 'UNAVAILABLE', message: `Could not reach target device: ${targetDeviceId}` }
      }
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kinora:cast_handoff', {
        detail: { targetDeviceId, media },
      }))
    }

    this.recordAudit(caller, 'handoff', 'control:cast', 'allowed', `Handoff initiated to ${targetDeviceId}`)
    return { ok: true, code: 'OK', message: `Initiating playback handoff to ${targetDeviceId}` }
  }

  public async getRecordingsStatus(caller?: CapabilityCaller): Promise<CapabilityResult<{ total: number; active: number; completed: number; failed: number }>> {
    const denied = this.checkScope(caller, 'recordings_status', 'read:recordings', 'Caller lacks recordings read capability')
    if (denied) return denied as CapabilityResult<{ total: number; active: number; completed: number; failed: number }>

    try {
      const list = (await dvrGetRecordings().catch(() => [])) ?? []
      const active = list.filter((r) => r.status === 'recording').length
      const completed = list.filter((r) => r.status === 'completed').length
      const failed = list.filter((r) => r.status === 'failed').length
      const summary = list.length === 0
        ? 'No DVR recordings are stored on this device.'
        : `Recordings: ${completed} completed, ${active} recording now, ${failed} failed (${list.length} total).`
      this.recordAudit(caller, 'recordings_status', 'read:recordings', 'allowed', summary)
      return { ok: true, code: 'OK', message: summary, data: { total: list.length, active, completed, failed } }
    } catch {
      return { ok: false, code: 'ERROR', message: 'Could not read DVR recording status.' }
    }
  }

  public async getDevicesAndServerStatus(caller?: CapabilityCaller): Promise<CapabilityResult<{
    appVersion: string
    mode: string
    serverRunning: boolean
    connectedClients: number
    trustedDevices: number
    downloadsCount: number
  }>> {
    const denied = this.checkScope(caller, 'device_status', 'read:devices', 'Caller lacks device status read capability')
    if (denied) return denied as CapabilityResult<{
      appVersion: string
      mode: string
      serverRunning: boolean
      connectedClients: number
      trustedDevices: number
      downloadsCount: number
    }>

    const [modeInfo, remoteStatus, devices, downloads] = await Promise.all([
      getPlatformMode().catch(() => null),
      getRemoteServerStatus().catch(() => null),
      getTrustedDevices().catch(() => []),
      getDownloads().catch(() => []),
    ])

    const mode = modeInfo?.mode ?? 'standalone'
    const serverRunning = Boolean(remoteStatus?.running)
    const connectedClients = remoteStatus?.connectedClients ?? 0
    const trustedCount = (devices ?? []).filter((d) => !d.revoked).length
    const downloadsCount = (downloads ?? []).length

    const message = serverRunning
      ? `Kinora v${APP_VERSION} (${mode} mode): server active on port ${remoteStatus?.port ?? 5198}, ${connectedClients} connected client${connectedClients === 1 ? '' : 's'}, ${trustedCount} trusted device${trustedCount === 1 ? '' : 's'}.`
      : `Kinora v${APP_VERSION} (${mode} mode): local server idle, ${trustedCount} trusted device${trustedCount === 1 ? '' : 's'}.`

    this.recordAudit(caller, 'device_status', 'read:devices', 'allowed', message)
    return {
      ok: true,
      code: 'OK',
      message,
      data: {
        appVersion: APP_VERSION,
        mode,
        serverRunning,
        connectedClients,
        trustedDevices: trustedCount,
        downloadsCount,
      },
    }
  }

  public getSystemOverview(caller?: CapabilityCaller): CapabilityResult<{
    version: string
    sources: { id: string; name: string; kind: string; count: number }[]
    library: { favourites: number; watchlist: number; history: number; collections: number }
    latestRelease: { version: string; releaseDate: string; title: string } | null
  }> {
    const denied = this.checkScope(caller, 'system_overview', 'read:system', 'Caller lacks system read capability')
    if (denied) return denied as CapabilityResult<{
      version: string
      sources: { id: string; name: string; kind: string; count: number }[]
      library: { favourites: number; watchlist: number; history: number; collections: number }
      latestRelease: { version: string; releaseDate: string; title: string } | null
    }>

    const sources = this.delegates.getSourcesSummary ? this.delegates.getSourcesSummary() : []
    const library = this.delegates.getLibraryStats
      ? this.delegates.getLibraryStats()
      : { favourites: 0, watchlist: 0, history: 0, collections: 0 }
    const latestRelease = this.delegates.getLatestReleaseSummary ? this.delegates.getLatestReleaseSummary() : null

    const message = `Kinora v${APP_VERSION}: ${sources.length} source${sources.length === 1 ? '' : 's'}, ${library.favourites} favourite${library.favourites === 1 ? '' : 's'}, ${library.watchlist} watchlist item${library.watchlist === 1 ? '' : 's'}.`
    this.recordAudit(caller, 'system_overview', 'read:system', 'allowed', message)
    return {
      ok: true,
      code: 'OK',
      message,
      data: { version: APP_VERSION, sources, library, latestRelease },
    }
  }
}

export const kinoraCapabilities = new KinoraCapabilityService()
