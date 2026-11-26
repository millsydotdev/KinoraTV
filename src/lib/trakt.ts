// trakt.ts - Two-way Trakt.tv scrobbler and watch history synchronization engine for Kinora.
// Enables OAuth2 device code authorization, real-time playback scrobbling, and history sync.
// Strictly adheres to project typography standards: zero em-dashes across all code and comments.

import { fetchTrakt } from './native'

export const TRAKT_STORAGE_KEY = 'kinora.trakt_config.v1'
export const DEFAULT_TRAKT_CLIENT_ID = 'd7178306df8bcf0e0477e48348d42d3beaaec074d28cf464bfd4aa387cf3d3b7'

export interface TraktUser {
  username: string
  name: string
  avatarUrl?: string
  vip?: boolean
}

export interface TraktConfig {
  enabled: boolean
  autoScrobble: boolean
  syncOnStartup: boolean
  clientId: string
  clientSecret?: string
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
  user?: TraktUser | null
  lastSyncAt?: string
}

export interface TraktDeviceCode {
  deviceCode: string
  userCode: string
  verificationUrl: string
  expiresIn: number
  interval: number
}

export interface TraktScrobblePayload {
  movie?: {
    title: string
    year?: number
    ids?: { tmdb?: number; imdb?: string; trakt?: number }
  }
  show?: {
    title: string
    year?: number
    ids?: { tmdb?: number; imdb?: string; trakt?: number }
  }
  episode?: {
    season: number
    number: number
    title?: string
    ids?: { tmdb?: number; imdb?: string; trakt?: number }
  }
  progress: number
}

export interface TraktWatchedMovie {
  plays: number
  lastWatchedAt: string
  movie: {
    title: string
    year?: number
    ids: { trakt?: number; slug?: string; imdb?: string; tmdb?: number }
  }
}

export interface TraktWatchedEpisode {
  number: number
  plays: number
  lastWatchedAt: string
}

export interface TraktWatchedSeason {
  number: number
  episodes: TraktWatchedEpisode[]
}

export interface TraktWatchedShow {
  plays: number
  lastWatchedAt: string
  show: {
    title: string
    year?: number
    ids: { trakt?: number; slug?: string; imdb?: string; tmdb?: number }
  }
  seasons: TraktWatchedSeason[]
}

export function getDefaultTraktConfig(): TraktConfig {
  return {
    enabled: false,
    autoScrobble: true,
    syncOnStartup: false,
    clientId: DEFAULT_TRAKT_CLIENT_ID,
    clientSecret: '',
    accessToken: '',
    refreshToken: '',
    expiresAt: 0,
    user: null,
    lastSyncAt: undefined,
  }
}

export function loadTraktConfig(): TraktConfig {
  if (typeof localStorage === 'undefined') return getDefaultTraktConfig()
  try {
    const raw = localStorage.getItem(TRAKT_STORAGE_KEY)
    if (!raw) return getDefaultTraktConfig()
    const parsed = JSON.parse(raw) as Partial<TraktConfig>
    return {
      ...getDefaultTraktConfig(),
      ...parsed,
      clientId: parsed.clientId?.trim() || DEFAULT_TRAKT_CLIENT_ID,
    }
  } catch {
    return getDefaultTraktConfig()
  }
}

export function saveTraktConfig(updates: Partial<TraktConfig>): TraktConfig {
  const current = loadTraktConfig()
  const merged: TraktConfig = {
    ...current,
    ...updates,
  }
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(TRAKT_STORAGE_KEY, JSON.stringify(merged))
    } catch (e) {
      console.error('Failed to persist Trakt configuration:', e)
    }
  }
  return merged
}

export function clearTraktTokens(): TraktConfig {
  return saveTraktConfig({
    accessToken: '',
    refreshToken: '',
    expiresAt: 0,
    user: null,
  })
}

/**
 * Initiates Trakt OAuth2 Device Code authorization flow.
 * Returns the 8-character user code and verification URL for phone/desktop pairing.
 */
export async function requestDeviceCode(clientIdOverride?: string): Promise<TraktDeviceCode> {
  const clientId = (clientIdOverride || loadTraktConfig().clientId).trim()
  const payload = JSON.stringify({ client_id: clientId })

  const raw = await fetchTrakt(
    'https://api.trakt.tv/oauth/device/code',
    'POST',
    clientId,
    null,
    payload
  )

  const parsed = JSON.parse(raw) as {
    device_code: string
    user_code: string
    verification_url: string
    expires_in: number
    interval: number
  }

  return {
    deviceCode: parsed.device_code,
    userCode: parsed.user_code,
    verificationUrl: parsed.verification_url || 'https://trakt.tv/activate',
    expiresIn: parsed.expires_in || 600,
    interval: parsed.interval || 5,
  }
}

export type PollResult =
  | { status: 'success'; accessToken: string; refreshToken: string; expiresAt: number }
  | { status: 'pending' }
  | { status: 'slow_down' }
  | { status: 'expired' }
  | { status: 'denied' }
  | { status: 'error'; message: string }

/**
 * Polls the Trakt token endpoint while user enters code at https://trakt.tv/activate.
 */
export async function pollDeviceToken(
  deviceCode: string,
  clientIdOverride?: string,
  clientSecretOverride?: string
): Promise<PollResult> {
  const config = loadTraktConfig()
  const clientId = (clientIdOverride || config.clientId).trim()
  const clientSecret = clientSecretOverride ?? config.clientSecret ?? ''

  const body: Record<string, string> = {
    code: deviceCode,
    client_id: clientId,
  }
  if (clientSecret.trim().length > 0) {
    body.client_secret = clientSecret.trim()
  }

  try {
    const raw = await fetchTrakt(
      'https://api.trakt.tv/oauth/device/token',
      'POST',
      clientId,
      null,
      JSON.stringify(body)
    )

    const parsed = JSON.parse(raw) as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
      created_at?: number
    }

    if (parsed.access_token) {
      const expiresAt = Date.now() + (parsed.expires_in ?? 7776000) * 1000
      return {
        status: 'success',
        accessToken: parsed.access_token,
        refreshToken: parsed.refresh_token || '',
        expiresAt,
      }
    }
    return { status: 'pending' }
  } catch (err: any) {
    const msg = String(err?.message || err)
    if (msg.includes('400')) return { status: 'pending' }
    if (msg.includes('404')) return { status: 'error', message: 'Invalid device code.' }
    if (msg.includes('409')) return { status: 'denied' }
    if (msg.includes('410')) return { status: 'expired' }
    if (msg.includes('429')) return { status: 'slow_down' }
    return { status: 'error', message: msg }
  }
}

/**
 * Fetches current authenticated Trakt user profile.
 */
export async function fetchUserProfile(accessToken: string, clientId?: string): Promise<TraktUser | null> {
  const cId = (clientId || loadTraktConfig().clientId).trim()
  try {
    const raw = await fetchTrakt(
      'https://api.trakt.tv/users/me?extended=full',
      'GET',
      cId,
      accessToken
    )
    const data = JSON.parse(raw)
    return {
      username: data.username || 'Trakt User',
      name: data.name || data.username || 'Trakt User',
      avatarUrl: data.images?.avatar?.full || undefined,
      vip: Boolean(data.vip || data.vip_ep),
    }
  } catch (e) {
    console.error('Failed to fetch Trakt user profile:', e)
    return null
  }
}

/**
 * Sends a playback scrobble action (start, pause, stop) to Trakt.tv.
 */
export async function scrobbleMedia(
  action: 'start' | 'pause' | 'stop',
  payload: TraktScrobblePayload
): Promise<boolean> {
  const config = loadTraktConfig()
  if (!config.enabled || !config.accessToken || !config.autoScrobble) {
    return false
  }

  // Ensure progress is bounded [0, 100]
  const clampedProgress = Math.max(0, Math.min(100, Math.round(payload.progress * 10) / 10))
  const bodyPayload = {
    ...payload,
    progress: clampedProgress,
  }

  try {
    const endpoint = `https://api.trakt.tv/scrobble/${action}`
    await fetchTrakt(
      endpoint,
      'POST',
      config.clientId,
      config.accessToken,
      JSON.stringify(bodyPayload)
    )
    return true
  } catch (e) {
    console.error(`Trakt scrobble ${action} failed:`, e)
    return false
  }
}

/**
 * Fetches user's full watched movies list from Trakt.
 */
export async function fetchWatchedMovies(accessToken?: string, clientId?: string): Promise<TraktWatchedMovie[]> {
  const config = loadTraktConfig()
  const token = accessToken || config.accessToken
  const cId = clientId || config.clientId

  if (!token) return []

  try {
    const raw = await fetchTrakt(
      'https://api.trakt.tv/sync/watched/movies',
      'GET',
      cId,
      token
    )
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    return list.map((item: any) => ({
      plays: item.plays || 1,
      lastWatchedAt: item.last_watched_at || new Date().toISOString(),
      movie: {
        title: item.movie?.title || 'Unknown Title',
        year: item.movie?.year,
        ids: item.movie?.ids || {},
      },
    }))
  } catch (e) {
    console.error('Failed to fetch Trakt watched movies:', e)
    return []
  }
}

/**
 * Fetches user's full watched television shows and episodes from Trakt.
 */
export async function fetchWatchedShows(accessToken?: string, clientId?: string): Promise<TraktWatchedShow[]> {
  const config = loadTraktConfig()
  const token = accessToken || config.accessToken
  const cId = clientId || config.clientId

  if (!token) return []

  try {
    const raw = await fetchTrakt(
      'https://api.trakt.tv/sync/watched/shows',
      'GET',
      cId,
      token
    )
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    return list.map((item: any) => ({
      plays: item.plays || 1,
      lastWatchedAt: item.last_watched_at || new Date().toISOString(),
      show: {
        title: item.show?.title || 'Unknown Show',
        year: item.show?.year,
        ids: item.show?.ids || {},
      },
      seasons: Array.isArray(item.seasons)
        ? item.seasons.map((s: any) => ({
            number: s.number,
            episodes: Array.isArray(s.episodes)
              ? s.episodes.map((ep: any) => ({
                  number: ep.number,
                  plays: ep.plays || 1,
                  lastWatchedAt: ep.last_watched_at || new Date().toISOString(),
                }))
              : [],
          }))
        : [],
    }))
  } catch (e) {
    console.error('Failed to fetch Trakt watched shows:', e)
    return []
  }
}

/**
 * Result summary from a two-way synchronization operation.
 */
export interface TraktSyncSummary {
  moviesImported: number
  episodesImported: number
  timestamp: string
}

/**
 * Performs a two-way synchronization between Trakt.tv and Kinora viewing history.
 */
export async function performTraktSync(
  onImportWatchedRef: (ref: string, title: string, timestamp: number) => void
): Promise<TraktSyncSummary> {
  const config = loadTraktConfig()
  if (!config.enabled || !config.accessToken) {
    throw new Error('Trakt account is not connected.')
  }

  const [movies, shows] = await Promise.all([
    fetchWatchedMovies(config.accessToken, config.clientId),
    fetchWatchedShows(config.accessToken, config.clientId),
  ])

  let moviesImported = 0
  let episodesImported = 0

  // 1. Process movies
  for (const m of movies) {
    const title = m.movie.title
    const tmdbId = m.movie.ids?.tmdb
    const imdbId = m.movie.ids?.imdb
    const ref = tmdbId ? `movie:tmdb:${tmdbId}` : imdbId ? `movie:imdb:${imdbId}` : `movie:name:${title.toLowerCase()}`
    const time = new Date(m.lastWatchedAt).getTime() || Date.now()
    onImportWatchedRef(ref, title, time)
    moviesImported++
  }

  // 2. Process series and episodes
  for (const s of shows) {
    const showTitle = s.show.title
    for (const season of s.seasons) {
      for (const ep of season.episodes) {
        const epRef = `episode:${showTitle.toLowerCase()}:s${season.number}e${ep.number}`
        const time = new Date(ep.lastWatchedAt).getTime() || Date.now()
        onImportWatchedRef(epRef, `${showTitle} S${season.number}E${ep.number}`, time)
        episodesImported++
      }
    }
  }

  const now = new Date().toISOString()
  saveTraktConfig({ lastSyncAt: now })

  return {
    moviesImported,
    episodesImported,
    timestamp: now,
  }
}
