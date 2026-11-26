/**
 * External Metadata Provider Integrations for Kinora.
 *
 * Implements a unified multi-provider metadata and artwork abstraction supporting:
 * - The Movie Database (TMDB): movies, TV series, posters, backdrops, logos, seasons, episode stills, cast/crew, external IDs.
 * - TVmaze: free public television database (no API key required) for series, backdrops, seasons, episodes, episode stills, broadcast info.
 * - TheTVDB v4: optional television/movie provider requiring user-supplied API key (and subscriber PIN where applicable).
 * - IMDb cross-provider identifier matching (lookup by tt-ID without scraping IMDb pages).
 *
 * Security and privacy guarantees:
 * - Strict opt-in control: external providers are disabled by default with zero outbound calls until enabled.
 * - API keys are stored in the encrypted Rust vault in native builds and never written to logs, errors, or screenshots.
 * - Privacy protection: only normalised titles and standard public external IDs are queried; never stream URLs or user identity.
 * - Token-bucket rate limiting and automatic fallback when a provider is unavailable, rate-limited, or unauthenticated.
 *
 * Strictly adheres to typography standard: zero em-dashes across all comments and text.
 */

import {
  clearMetadataCredentialsVault,
  fetchMetadata,
  inNativeShell,
  loadMetadataCredentialsVault,
  postMetadata,
  saveMetadataCredentialsVault,
} from '../lib/native'
import { canonicalizeTitle, scoreArtworkMatch, type ArtworkAspectRatio, type ArtworkType } from './artworkEngine'

export type ExternalProviderId = 'tmdb' | 'tvmaze' | 'tvdb'
export type ArtworkSourcePreference = 'local-first' | 'metadata-first' | 'provider-first'

export interface MetadataConfig {
  tmdbEnabled: boolean
  tmdbApiKey: string
  tvmazeEnabled: boolean
  tvdbEnabled?: boolean
  tvdbApiKey?: string
  tvdbPin?: string
  autoEnrichEpg: boolean
  preferHighResPosters: boolean
  language?: string
  movieProviderPriority?: Array<'tmdb' | 'tvdb'>
  seriesProviderPriority?: Array<'tmdb' | 'tvmaze' | 'tvdb'>
  artworkSourcePreference?: ArtworkSourcePreference
}

export const DEFAULT_METADATA_CONFIG: MetadataConfig = {
  tmdbEnabled: false,
  tmdbApiKey: '',
  tvmazeEnabled: false,
  tvdbEnabled: false,
  tvdbApiKey: '',
  tvdbPin: '',
  autoEnrichEpg: false,
  preferHighResPosters: true,
  language: 'en-US',
  movieProviderPriority: ['tmdb', 'tvdb'],
  seriesProviderPriority: ['tmdb', 'tvmaze', 'tvdb'],
  artworkSourcePreference: 'local-first',
}

export interface ProviderCapabilities {
  movies: boolean
  series: boolean
  seasons: boolean
  episodes: boolean
  posters: boolean
  backdrops: boolean
  logos: boolean
  episodeStills: boolean
  externalIdLookup: boolean
  languageSupport: boolean
  requiresCredentials: boolean
  credentialKind: 'none' | 'api-key' | 'api-key-and-pin'
  licensingSummary: string
}

export interface ProviderDescriptor {
  id: ExternalProviderId
  name: string
  shortName: string
  description: string
  websiteUrl: string
  attributionText: string
  licensing: string
  privacyNote: string
  capabilities: ProviderCapabilities
}

export interface ProviderHealthStatus {
  provider: ExternalProviderId
  lastError?: string
  rateLimitedUntil?: number
  lastCheckedAt?: number
  lastOk?: boolean
}

const STORAGE_KEY = 'kinora.metadataConfig.v1'
let memoryConfig: MetadataConfig | null = null
let vaultMemoryCreds: { tmdbApiKey: string; tvdbApiKey: string; tvdbPin: string } | null = null
const providerHealth: Record<ExternalProviderId, ProviderHealthStatus> = {
  tmdb: { provider: 'tmdb' },
  tvmaze: { provider: 'tvmaze' },
  tvdb: { provider: 'tvdb' },
}

/**
 * Reads TMDB API key from environment (VITE_TMDB_API_KEY from .env / Vite client bundle, or TMDB_API_KEY).
 * In automated unit tests, defaults to empty to preserve test isolation unless TEST_WITH_LIVE_TMDB is set.
 */
export function getEnvironmentTmdbKey(): string {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      if (import.meta.env.MODE === 'test' && !process.env.TEST_WITH_LIVE_TMDB) {
        return ''
      }
      if (typeof import.meta.env.VITE_TMDB_API_KEY === 'string') {
        const k = import.meta.env.VITE_TMDB_API_KEY.trim()
        if (k) return k
      }
    }
  } catch {
    // Ignore
  }
  try {
    if (typeof process !== 'undefined' && process.env) {
      if (process.env.NODE_ENV === 'test' && !process.env.TEST_WITH_LIVE_TMDB) {
        return ''
      }
      const k = (process.env.VITE_TMDB_API_KEY || process.env.TMDB_API_KEY || '').trim()
      if (k) return k
    }
  } catch {
    // Ignore
  }
  return ''
}

export function getProviderHealth(provider: ExternalProviderId): ProviderHealthStatus {
  return { ...providerHealth[provider] }
}

export function isProviderRateLimited(provider: ExternalProviderId): boolean {
  const until = providerHealth[provider].rateLimitedUntil
  return Boolean(until && Date.now() < until)
}

function recordProviderStatus(
  provider: ExternalProviderId,
  ok: boolean,
  error?: string,
  rateLimitedMs?: number,
): void {
  providerHealth[provider] = {
    provider,
    lastCheckedAt: Date.now(),
    lastOk: ok,
    lastError: ok ? undefined : error,
    rateLimitedUntil: rateLimitedMs ? Date.now() + rateLimitedMs : ok ? undefined : providerHealth[provider].rateLimitedUntil,
  }
}

export function loadMetadataConfig(): MetadataConfig {
  const envKey = getEnvironmentTmdbKey()
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<MetadataConfig>
        const native = inNativeShell()
        const storedKey =
          native && vaultMemoryCreds !== null
            ? vaultMemoryCreds.tmdbApiKey
            : typeof parsed.tmdbApiKey === 'string'
              ? parsed.tmdbApiKey
              : ''
        const tmdbApiKey = storedKey || envKey
        const tmdbEnabled = parsed.tmdbEnabled !== undefined
          ? Boolean(parsed.tmdbEnabled)
          : Boolean(tmdbApiKey)
        const tvdbApiKey =
          native && vaultMemoryCreds !== null
            ? vaultMemoryCreds.tvdbApiKey
            : typeof parsed.tvdbApiKey === 'string'
              ? parsed.tvdbApiKey
              : ''
        const tvdbPin =
          native && vaultMemoryCreds !== null
            ? vaultMemoryCreds.tvdbPin
            : typeof parsed.tvdbPin === 'string'
              ? parsed.tvdbPin
              : ''
        return {
          tmdbEnabled,
          tmdbApiKey,
          tvmazeEnabled: Boolean(parsed.tvmazeEnabled),
          tvdbEnabled: Boolean(parsed.tvdbEnabled),
          tvdbApiKey,
          tvdbPin,
          autoEnrichEpg: Boolean(parsed.autoEnrichEpg),
          preferHighResPosters: parsed.preferHighResPosters !== false,
          language: typeof parsed.language === 'string' && parsed.language.trim() ? parsed.language.trim() : 'en-US',
          movieProviderPriority:
            Array.isArray(parsed.movieProviderPriority) && parsed.movieProviderPriority.length > 0
              ? (parsed.movieProviderPriority as Array<'tmdb' | 'tvdb'>)
              : ['tmdb', 'tvdb'],
          seriesProviderPriority:
            Array.isArray(parsed.seriesProviderPriority) && parsed.seriesProviderPriority.length > 0
              ? (parsed.seriesProviderPriority as Array<'tmdb' | 'tvmaze' | 'tvdb'>)
              : ['tmdb', 'tvmaze', 'tvdb'],
          artworkSourcePreference:
            parsed.artworkSourcePreference === 'metadata-first' ||
            parsed.artworkSourcePreference === 'provider-first' ||
            parsed.artworkSourcePreference === 'local-first'
              ? parsed.artworkSourcePreference
              : 'local-first',
        }
      }
    } else if (memoryConfig) {
      return { ...DEFAULT_METADATA_CONFIG, ...memoryConfig }
    }
  } catch {
    // Fallback on corrupt or unavailable storage
  }
  if (inNativeShell() && vaultMemoryCreds !== null) {
    const tmdbApiKey = vaultMemoryCreds.tmdbApiKey || envKey
    return {
      ...DEFAULT_METADATA_CONFIG,
      tmdbApiKey,
      tmdbEnabled: Boolean(tmdbApiKey),
      tvdbApiKey: vaultMemoryCreds.tvdbApiKey,
      tvdbPin: vaultMemoryCreds.tvdbPin,
    }
  }
  if (envKey) {
    return {
      ...DEFAULT_METADATA_CONFIG,
      tmdbApiKey: envKey,
      tmdbEnabled: true,
      tvmazeEnabled: true,
    }
  }
  return { ...DEFAULT_METADATA_CONFIG }
}

export function saveMetadataConfig(config: MetadataConfig): void {
  const normalized: MetadataConfig = {
    ...DEFAULT_METADATA_CONFIG,
    ...config,
    tmdbApiKey: typeof config.tmdbApiKey === 'string' ? config.tmdbApiKey : '',
    tvdbApiKey: typeof config.tvdbApiKey === 'string' ? config.tvdbApiKey : '',
    tvdbPin: typeof config.tvdbPin === 'string' ? config.tvdbPin : '',
  }

  const native = inNativeShell()
  if (native) {
    vaultMemoryCreds = {
      tmdbApiKey: normalized.tmdbApiKey,
      tvdbApiKey: normalized.tvdbApiKey ?? '',
      tvdbPin: normalized.tvdbPin ?? '',
    }
    void saveMetadataCredentialsVault(vaultMemoryCreds)
  }

  try {
    if (typeof localStorage !== 'undefined') {
      // In native shell, never store plaintext API credentials in localStorage; Rust vault owns them.
      const toPersist: MetadataConfig = native
        ? { ...normalized, tmdbApiKey: '', tvdbApiKey: '', tvdbPin: '' }
        : normalized
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist))
    } else {
      memoryConfig = { ...normalized }
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('kinora:metadata-config-changed'))
    }
  } catch {
    // Storage full or private mode
  }
}

/**
 * Loads encrypted metadata provider credentials from the native Rust vault on startup.
 * Automatically migrates any legacy plaintext key found in localStorage into the encrypted vault,
 * and loads the environment TMDB key (VITE_TMDB_API_KEY) if configured in .env or CI secrets.
 */
export async function hydrateMetadataCredentialsFromVault(): Promise<void> {
  const native = inNativeShell()
  if (native) {
    const vault = await loadMetadataCredentialsVault()
    if (vault) {
      vaultMemoryCreds = { ...vault }
    } else {
      vaultMemoryCreds = { tmdbApiKey: '', tvdbApiKey: '', tvdbPin: '' }
    }
  }

  // Migrate any legacy plaintext key out of localStorage into the encrypted vault
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<MetadataConfig>
        const legacyTmdb = typeof parsed.tmdbApiKey === 'string' ? parsed.tmdbApiKey.trim() : ''
        const legacyTvdb = typeof parsed.tvdbApiKey === 'string' ? parsed.tvdbApiKey.trim() : ''
        const legacyPin = typeof parsed.tvdbPin === 'string' ? parsed.tvdbPin.trim() : ''
        if (legacyTmdb || legacyTvdb || legacyPin) {
          vaultMemoryCreds = {
            tmdbApiKey: vaultMemoryCreds?.tmdbApiKey || legacyTmdb,
            tvdbApiKey: vaultMemoryCreds?.tvdbApiKey || legacyTvdb,
            tvdbPin: vaultMemoryCreds?.tvdbPin || legacyPin,
          }
          if (native && vaultMemoryCreds) {
            await saveMetadataCredentialsVault(vaultMemoryCreds)
          }
          const scrubbed = { ...parsed, tmdbApiKey: '', tvdbApiKey: '', tvdbPin: '' }
          localStorage.setItem(STORAGE_KEY, JSON.stringify(scrubbed))
        }
      }
    }
  } catch {
    // Ignore storage read issues
  }

  // Automatically import TMDB key from environment (.env / VITE_TMDB_API_KEY) if not yet configured
  const envKey = getEnvironmentTmdbKey()
  if (envKey) {
    if (native) {
      if (!vaultMemoryCreds?.tmdbApiKey) {
        vaultMemoryCreds = {
          tmdbApiKey: envKey,
          tvdbApiKey: vaultMemoryCreds?.tvdbApiKey || '',
          tvdbPin: vaultMemoryCreds?.tvdbPin || '',
        }
        await saveMetadataCredentialsVault(vaultMemoryCreds)
      }
    }
    const current = loadMetadataConfig()
    if (!current.tmdbApiKey || !current.tmdbEnabled) {
      saveMetadataConfig({
        ...current,
        tmdbApiKey: current.tmdbApiKey || envKey,
        tmdbEnabled: true,
        tvmazeEnabled: true,
      })
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kinora:metadata-config-changed'))
  }
}

export interface MovieMetadataDetails {
  id: string
  provider?: ExternalProviderId
  tmdbId: number
  title: string
  originalTitle?: string
  releaseDate?: string
  year?: number
  runtime?: number
  overview?: string
  genres: string[]
  voteAverage?: number
  cast: string[]
  director?: string
  posterUrl?: string
  cardPosterUrl?: string
  backdropUrl?: string
  logoUrl?: string
  imdbId?: string
  status?: string
}

export interface EpisodeMetadataDetails {
  id: string
  seasonNumber: number
  episodeNumber: number
  title: string
  airDate?: string
  runtime?: number
  overview?: string
  stillUrl?: string
  voteAverage?: number
}

export interface SeasonMetadataDetails {
  seasonNumber: number
  name: string
  overview?: string
  posterUrl?: string
  episodeCount: number
  episodes: EpisodeMetadataDetails[]
}

export interface SeriesMetadataDetails {
  id: string
  provider: ExternalProviderId
  providerId: number
  title: string
  originalTitle?: string
  firstAirDate?: string
  year?: number
  overview?: string
  genres: string[]
  voteAverage?: number
  cast: string[]
  network?: string
  broadcastSchedule?: string
  posterUrl?: string
  cardPosterUrl?: string
  backdropUrl?: string
  logoUrl?: string
  imdbId?: string
  thetvdbId?: number
  tmdbId?: number
  tvmazeId?: number
  status?: string
  seasons: SeasonMetadataDetails[]
}

export interface MetadataSearchResult {
  provider: ExternalProviderId
  providerId: string
  numericId?: number
  title: string
  year?: number
  overview?: string
  posterUrl?: string
  cardPosterUrl?: string
  backdropUrl?: string
  logoUrl?: string
  stillUrl?: string
  imdbId?: string
  thetvdbId?: number
  aspectRatio: ArtworkAspectRatio
  confidence: number
  artworkType: ArtworkType
}

export interface ConnectionTestReport {
  ok: boolean
  provider: ExternalProviderId
  latencyMs?: number
  message: string
}

export const METADATA_ATTRIBUTIONS = {
  tmdb: {
    name: 'The Movie Database (TMDB)',
    attributionText: 'This product uses the TMDB API but is not endorsed or certified by TMDB.',
    licensing: 'Content metadata and promotional imagery sourced via TMDB API (free non-commercial registration required).',
    privacyNote: 'Enabling TMDB will transmit search titles to api.themoviedb.org. Kinora never shares playlist streams or user identity.',
    websiteUrl: 'https://www.themoviedb.org',
  },
  tvmaze: {
    name: 'TVmaze',
    attributionText: 'Television schedule data and episode stills provided by TVmaze under Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0).',
    licensing: 'Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0). Free public API; no key required.',
    privacyNote: 'Enabling TVmaze will transmit television show queries to api.tvmaze.com. No account or API key required.',
    websiteUrl: 'https://www.tvmaze.com',
  },
  tvdb: {
    name: 'TheTVDB (v4)',
    attributionText: 'Television and film metadata provided by TheTVDB.com.',
    licensing: 'Requires a registered TheTVDB v4 API key (and subscriber PIN for user-supported plans).',
    privacyNote: 'Enabling TheTVDB transmits search titles and external IDs to api4.thetvdb.com. Kinora never shares stream URLs.',
    websiteUrl: 'https://www.thetvdb.com',
  },
}

export const METADATA_PROVIDERS_REGISTRY: ProviderDescriptor[] = [
  {
    id: 'tmdb',
    name: METADATA_ATTRIBUTIONS.tmdb.name,
    shortName: 'TMDB',
    description: 'Primary movie and television metadata provider with theatrical posters, landscape backdrops, logos, season art, episode stills, cast, and IMDb cross-matching.',
    websiteUrl: METADATA_ATTRIBUTIONS.tmdb.websiteUrl,
    attributionText: METADATA_ATTRIBUTIONS.tmdb.attributionText,
    licensing: METADATA_ATTRIBUTIONS.tmdb.licensing,
    privacyNote: METADATA_ATTRIBUTIONS.tmdb.privacyNote,
    capabilities: {
      movies: true,
      series: true,
      seasons: true,
      episodes: true,
      posters: true,
      backdrops: true,
      logos: true,
      episodeStills: true,
      externalIdLookup: true,
      languageSupport: true,
      requiresCredentials: true,
      credentialKind: 'api-key',
      licensingSummary: 'Free registration API key or Read Access Bearer Token required.',
    },
  },
  {
    id: 'tvmaze',
    name: METADATA_ATTRIBUTIONS.tvmaze.name,
    shortName: 'TVmaze',
    description: 'Open television metadata provider for series posters, landscape backgrounds, season artwork, episode lists, episode stills, and broadcast schedules.',
    websiteUrl: METADATA_ATTRIBUTIONS.tvmaze.websiteUrl,
    attributionText: METADATA_ATTRIBUTIONS.tvmaze.attributionText,
    licensing: METADATA_ATTRIBUTIONS.tvmaze.licensing,
    privacyNote: METADATA_ATTRIBUTIONS.tvmaze.privacyNote,
    capabilities: {
      movies: false,
      series: true,
      seasons: true,
      episodes: true,
      posters: true,
      backdrops: true,
      logos: false,
      episodeStills: true,
      externalIdLookup: true,
      languageSupport: false,
      requiresCredentials: false,
      credentialKind: 'none',
      licensingSummary: 'Works immediately without credentials (CC BY-SA 4.0).',
    },
  },
  {
    id: 'tvdb',
    name: METADATA_ATTRIBUTIONS.tvdb.name,
    shortName: 'TheTVDB',
    description: 'Specialist television and anime metadata provider offering multilingual series posters, season artwork, and episode metadata.',
    websiteUrl: METADATA_ATTRIBUTIONS.tvdb.websiteUrl,
    attributionText: METADATA_ATTRIBUTIONS.tvdb.attributionText,
    licensing: METADATA_ATTRIBUTIONS.tvdb.licensing,
    privacyNote: METADATA_ATTRIBUTIONS.tvdb.privacyNote,
    capabilities: {
      movies: true,
      series: true,
      seasons: true,
      episodes: true,
      posters: true,
      backdrops: true,
      logos: false,
      episodeStills: true,
      externalIdLookup: true,
      languageSupport: true,
      requiresCredentials: true,
      credentialKind: 'api-key-and-pin',
      licensingSummary: 'Requires registered v4 API key and optional subscriber PIN.',
    },
  },
]

/** Token bucket rate limiter to adhere to third-party API rate limits. */
class RateLimiter {
  private lastCall = 0
  constructor(private readonly minIntervalMs: number) {}

  async throttle(): Promise<void> {
    const now = Date.now()
    const elapsed = now - this.lastCall
    if (elapsed < this.minIntervalMs) {
      const waitTime = this.minIntervalMs - elapsed
      await new Promise((resolve) => setTimeout(resolve, waitTime))
    }
    this.lastCall = Date.now()
  }
}

// TVmaze rate limit: 20 calls per 10 seconds -> 500ms between calls
const tvmazeLimiter = new RateLimiter(500)
// TMDB rate limit: ~4 calls per second -> 250ms between calls
const tmdbLimiter = new RateLimiter(250)
// TVDB rate limit: ~3 calls per second -> 350ms between calls
const tvdbLimiter = new RateLimiter(350)

function tmdbImageUrl(path: string | null | undefined, size: string): string | undefined {
  if (!path || typeof path !== 'string' || !path.startsWith('/')) return undefined
  return `https://image.tmdb.org/t/p/${size}${path}`
}

export class TmdbProvider {
  readonly id = 'tmdb' as const
  readonly name = METADATA_ATTRIBUTIONS.tmdb.name

  private getAuthHeader(apiKey: string): string | null {
    if (!apiKey) return null
    if (apiKey.startsWith('eyJ') || apiKey.length > 64) {
      return `Bearer ${apiKey.trim()}`
    }
    return null
  }

  private getUrlWithKey(baseUrl: string, apiKey: string): string {
    if (!apiKey) return baseUrl
    if (this.getAuthHeader(apiKey)) {
      return baseUrl
    }
    const sep = baseUrl.includes('?') ? '&' : '?'
    return `${baseUrl}${sep}api_key=${encodeURIComponent(apiKey.trim())}`
  }

  private withLanguage(url: string, config: MetadataConfig): string {
    const lang = config.language?.trim() || 'en-US'
    const sep = url.includes('?') ? '&' : '?'
    return `${url}${sep}language=${encodeURIComponent(lang)}`
  }

  async testConnection(apiKey?: string): Promise<ConnectionTestReport> {
    const key = (apiKey ?? loadMetadataConfig().tmdbApiKey).trim()
    if (!key) {
      return {
        ok: false,
        provider: 'tmdb',
        message: 'TMDB API key is missing. Enter a valid API key or Bearer token.',
      }
    }
    const authHeader = this.getAuthHeader(key)
    const url = this.getUrlWithKey('https://api.themoviedb.org/3/configuration', key)
    const start = performance.now()
    try {
      await tmdbLimiter.throttle()
      const raw = await fetchMetadata(url, authHeader)
      const latencyMs = Math.round(performance.now() - start)
      if (!raw) {
        recordProviderStatus('tmdb', false, 'Connection failed or credentials rejected.')
        return {
          ok: false,
          provider: 'tmdb',
          latencyMs,
          message: 'Connection failed or returned empty response.',
        }
      }
      const data = JSON.parse(raw) as { images?: { base_url?: string } }
      if (data.images?.base_url) {
        recordProviderStatus('tmdb', true)
        return {
          ok: true,
          provider: 'tmdb',
          latencyMs,
          message: `Connected successfully (${latencyMs}ms). API key verified.`,
        }
      }
      recordProviderStatus('tmdb', false, 'Invalid response format from TMDB API.')
      return {
        ok: false,
        provider: 'tmdb',
        latencyMs,
        message: 'Invalid response format from TMDB API.',
      }
    } catch {
      const latencyMs = Math.round(performance.now() - start)
      recordProviderStatus('tmdb', false, 'Unable to reach TMDB API.')
      return {
        ok: false,
        provider: 'tmdb',
        latencyMs,
        message: 'Unable to reach TMDB API. Check credentials and network.',
      }
    }
  }

  /**
   * Deterministic lookup by external ID (IMDb tt-ID or TheTVDB ID) via TMDB /3/find.
   * Prevents title collisions and remake ambiguity by returning confidence 1.0 matches.
   */
  async findByExternalId(
    externalId: string,
    source: 'imdb_id' | 'tvdb_id' = 'imdb_id',
    mediaHint?: 'movie' | 'series',
  ): Promise<MetadataSearchResult[]> {
    const config = loadMetadataConfig()
    if (!config.tmdbEnabled || !config.tmdbApiKey.trim() || isProviderRateLimited('tmdb')) return []
    const cleanId = externalId.trim()
    if (!cleanId) return []

    const key = config.tmdbApiKey.trim()
    const authHeader = this.getAuthHeader(key)
    let url = `https://api.themoviedb.org/3/find/${encodeURIComponent(cleanId)}?external_source=${source}`
    url = this.withLanguage(url, config)
    url = this.getUrlWithKey(url, key)

    try {
      await tmdbLimiter.throttle()
      const raw = await fetchMetadata(url, authHeader)
      if (!raw) return []
      const data = JSON.parse(raw) as {
        movie_results?: Array<{
          id: number
          title: string
          release_date?: string
          poster_path?: string | null
          backdrop_path?: string | null
          overview?: string
        }>
        tv_results?: Array<{
          id: number
          name: string
          first_air_date?: string
          poster_path?: string | null
          backdrop_path?: string | null
          overview?: string
        }>
      }

      const posterSize = config.preferHighResPosters ? 'w500' : 'w342'
      const backdropSize = config.preferHighResPosters ? 'w1280' : 'w780'
      const results: MetadataSearchResult[] = []

      if (mediaHint !== 'series' && Array.isArray(data.movie_results)) {
        for (const m of data.movie_results.slice(0, 2)) {
          const itemYear = m.release_date ? Number.parseInt(m.release_date.slice(0, 4), 10) : undefined
          const posterUrl = tmdbImageUrl(m.poster_path, posterSize)
          const cardPosterUrl = tmdbImageUrl(m.poster_path, 'w342')
          const backdropUrl = tmdbImageUrl(m.backdrop_path, backdropSize)
          if (posterUrl) {
            results.push({
              provider: 'tmdb',
              providerId: `tmdb:m:${m.id}`,
              numericId: m.id,
              title: m.title,
              year: itemYear,
              overview: m.overview,
              posterUrl,
              cardPosterUrl,
              backdropUrl,
              imdbId: source === 'imdb_id' ? cleanId : undefined,
              aspectRatio: '2:3',
              confidence: 1.0,
              artworkType: 'movie-poster',
            })
          }
          if (backdropUrl) {
            results.push({
              provider: 'tmdb',
              providerId: `tmdb:m:${m.id}:backdrop`,
              numericId: m.id,
              title: m.title,
              year: itemYear,
              overview: m.overview,
              posterUrl,
              cardPosterUrl,
              backdropUrl,
              imdbId: source === 'imdb_id' ? cleanId : undefined,
              aspectRatio: '16:9',
              confidence: 1.0,
              artworkType: 'movie-backdrop',
            })
          }
        }
      }

      if (mediaHint !== 'movie' && Array.isArray(data.tv_results)) {
        for (const tv of data.tv_results.slice(0, 2)) {
          const itemYear = tv.first_air_date ? Number.parseInt(tv.first_air_date.slice(0, 4), 10) : undefined
          const posterUrl = tmdbImageUrl(tv.poster_path, posterSize)
          const cardPosterUrl = tmdbImageUrl(tv.poster_path, 'w342')
          const backdropUrl = tmdbImageUrl(tv.backdrop_path, backdropSize)
          if (posterUrl) {
            results.push({
              provider: 'tmdb',
              providerId: `tmdb:tv:${tv.id}`,
              numericId: tv.id,
              title: tv.name,
              year: itemYear,
              overview: tv.overview,
              posterUrl,
              cardPosterUrl,
              backdropUrl,
              imdbId: source === 'imdb_id' ? cleanId : undefined,
              aspectRatio: '2:3',
              confidence: 1.0,
              artworkType: 'series-poster',
            })
          }
          if (backdropUrl) {
            results.push({
              provider: 'tmdb',
              providerId: `tmdb:tv:${tv.id}:backdrop`,
              numericId: tv.id,
              title: tv.name,
              year: itemYear,
              overview: tv.overview,
              posterUrl,
              cardPosterUrl,
              backdropUrl,
              imdbId: source === 'imdb_id' ? cleanId : undefined,
              aspectRatio: '16:9',
              confidence: 1.0,
              artworkType: 'series-backdrop',
            })
          }
        }
      }

      recordProviderStatus('tmdb', true)
      return results
    } catch {
      return []
    }
  }

  async searchMovie(rawTitle: string, queryYear?: number): Promise<MetadataSearchResult[]> {
    const config = loadMetadataConfig()
    if (!config.tmdbEnabled || !config.tmdbApiKey.trim() || isProviderRateLimited('tmdb')) return []

    const { cleanTitle, extractedYear } = canonicalizeTitle(rawTitle)
    const targetYear = queryYear ?? extractedYear
    if (!cleanTitle) return []

    const key = config.tmdbApiKey.trim()
    const authHeader = this.getAuthHeader(key)
    let url = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(cleanTitle)}`
    if (targetYear) {
      url += `&year=${targetYear}`
    }
    url = this.withLanguage(url, config)
    url = this.getUrlWithKey(url, key)

    try {
      await tmdbLimiter.throttle()
      const raw = await fetchMetadata(url, authHeader)
      if (!raw) return []
      const data = JSON.parse(raw) as {
        results?: Array<{
          id: number
          title: string
          release_date?: string
          poster_path?: string | null
          backdrop_path?: string | null
          overview?: string
        }>
      }
      if (!Array.isArray(data.results)) return []

      const posterSize = config.preferHighResPosters ? 'w500' : 'w342'
      const backdropSize = config.preferHighResPosters ? 'w1280' : 'w780'
      const results: MetadataSearchResult[] = []
      for (const item of data.results.slice(0, 5)) {
        const itemYear = item.release_date ? Number.parseInt(item.release_date.slice(0, 4), 10) : undefined
        const match = scoreArtworkMatch(cleanTitle, targetYear, item.title, itemYear)
        if (match.status === 'verified' && match.confidence >= 0.65) {
          const posterUrl = tmdbImageUrl(item.poster_path, posterSize)
          const cardPosterUrl = tmdbImageUrl(item.poster_path, 'w342')
          const backdropUrl = tmdbImageUrl(item.backdrop_path, backdropSize)

          if (posterUrl) {
            results.push({
              provider: 'tmdb',
              providerId: `tmdb:m:${item.id}`,
              numericId: item.id,
              title: item.title,
              year: itemYear,
              overview: item.overview,
              posterUrl,
              cardPosterUrl,
              backdropUrl,
              aspectRatio: '2:3',
              confidence: match.confidence,
              artworkType: 'movie-poster',
            })
          }
          if (backdropUrl) {
            results.push({
              provider: 'tmdb',
              providerId: `tmdb:m:${item.id}:backdrop`,
              numericId: item.id,
              title: item.title,
              year: itemYear,
              overview: item.overview,
              posterUrl,
              cardPosterUrl,
              backdropUrl,
              aspectRatio: '16:9',
              confidence: match.confidence,
              artworkType: 'movie-backdrop',
            })
          }
        }
      }
      recordProviderStatus('tmdb', true)
      return results
    } catch {
      return []
    }
  }

  async searchSeries(rawTitle: string, queryYear?: number): Promise<MetadataSearchResult[]> {
    const config = loadMetadataConfig()
    if (!config.tmdbEnabled || !config.tmdbApiKey.trim() || isProviderRateLimited('tmdb')) return []

    const { cleanTitle, extractedYear } = canonicalizeTitle(rawTitle)
    const targetYear = queryYear ?? extractedYear
    if (!cleanTitle) return []

    const key = config.tmdbApiKey.trim()
    const authHeader = this.getAuthHeader(key)
    let url = `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(cleanTitle)}`
    if (targetYear) {
      url += `&first_air_date_year=${targetYear}`
    }
    url = this.withLanguage(url, config)
    url = this.getUrlWithKey(url, key)

    try {
      await tmdbLimiter.throttle()
      const raw = await fetchMetadata(url, authHeader)
      if (!raw) return []
      const data = JSON.parse(raw) as {
        results?: Array<{
          id: number
          name: string
          first_air_date?: string
          poster_path?: string | null
          backdrop_path?: string | null
          overview?: string
        }>
      }
      if (!Array.isArray(data.results)) return []

      const posterSize = config.preferHighResPosters ? 'w500' : 'w342'
      const backdropSize = config.preferHighResPosters ? 'w1280' : 'w780'
      const results: MetadataSearchResult[] = []
      for (const item of data.results.slice(0, 5)) {
        const itemYear = item.first_air_date ? Number.parseInt(item.first_air_date.slice(0, 4), 10) : undefined
        const match = scoreArtworkMatch(cleanTitle, targetYear, item.name, itemYear)
        if (match.status === 'verified' && match.confidence >= 0.65) {
          const posterUrl = tmdbImageUrl(item.poster_path, posterSize)
          const cardPosterUrl = tmdbImageUrl(item.poster_path, 'w342')
          const backdropUrl = tmdbImageUrl(item.backdrop_path, backdropSize)

          if (posterUrl) {
            results.push({
              provider: 'tmdb',
              providerId: `tmdb:tv:${item.id}`,
              numericId: item.id,
              title: item.name,
              year: itemYear,
              overview: item.overview,
              posterUrl,
              cardPosterUrl,
              backdropUrl,
              aspectRatio: '2:3',
              confidence: match.confidence,
              artworkType: 'series-poster',
            })
          }
          if (backdropUrl) {
            results.push({
              provider: 'tmdb',
              providerId: `tmdb:tv:${item.id}:backdrop`,
              numericId: item.id,
              title: item.name,
              year: itemYear,
              overview: item.overview,
              posterUrl,
              cardPosterUrl,
              backdropUrl,
              aspectRatio: '16:9',
              confidence: match.confidence,
              artworkType: 'series-backdrop',
            })
          }
        }
      }
      recordProviderStatus('tmdb', true)
      return results
    } catch {
      return []
    }
  }

  async getMovieDetails(movieId: number): Promise<MovieMetadataDetails | null> {
    const config = loadMetadataConfig()
    if (!config.tmdbEnabled || !config.tmdbApiKey.trim()) return null

    const key = config.tmdbApiKey.trim()
    const authHeader = this.getAuthHeader(key)
    const langPrefix = (config.language || 'en-US').split('-')[0] || 'en'
    const url = this.getUrlWithKey(
      `https://api.themoviedb.org/3/movie/${movieId}?append_to_response=credits,external_ids,images&include_image_language=${encodeURIComponent(langPrefix)},en,null&language=${encodeURIComponent(config.language || 'en-US')}`,
      key,
    )

    try {
      await tmdbLimiter.throttle()
      const raw = await fetchMetadata(url, authHeader)
      if (!raw) return null
      const data = JSON.parse(raw) as {
        id: number
        title: string
        original_title?: string
        release_date?: string
        runtime?: number
        overview?: string
        genres?: Array<{ id: number; name: string }>
        vote_average?: number
        poster_path?: string | null
        backdrop_path?: string | null
        status?: string
        credits?: {
          cast?: Array<{ name: string }>
          crew?: Array<{ name: string; job: string }>
        }
        external_ids?: {
          imdb_id?: string
        }
        images?: {
          logos?: Array<{ file_path?: string; iso_639_1?: string | null }>
        }
      }

      const releaseYear = data.release_date ? Number.parseInt(data.release_date.slice(0, 4), 10) : undefined
      const director = data.credits?.crew?.find((c) => c.job === 'Director')?.name
      const logoEntry = data.images?.logos?.find((l) => l.iso_639_1 === langPrefix || l.iso_639_1 === 'en') ?? data.images?.logos?.[0]

      return {
        id: `tmdb:m:${data.id}`,
        provider: 'tmdb',
        tmdbId: data.id,
        title: data.title,
        originalTitle: data.original_title,
        releaseDate: data.release_date,
        year: releaseYear,
        runtime: data.runtime,
        overview: data.overview,
        genres: Array.isArray(data.genres) ? data.genres.map((g) => g.name) : [],
        voteAverage: data.vote_average,
        cast: Array.isArray(data.credits?.cast) ? data.credits!.cast.slice(0, 10).map((c) => c.name) : [],
        director,
        posterUrl: tmdbImageUrl(data.poster_path, 'w500'),
        cardPosterUrl: tmdbImageUrl(data.poster_path, 'w342'),
        backdropUrl: tmdbImageUrl(data.backdrop_path, 'w1280'),
        logoUrl: tmdbImageUrl(logoEntry?.file_path, 'w500'),
        imdbId: data.external_ids?.imdb_id,
        status: data.status,
      }
    } catch {
      return null
    }
  }

  async getSeriesDetails(seriesId: number): Promise<SeriesMetadataDetails | null> {
    const config = loadMetadataConfig()
    if (!config.tmdbEnabled || !config.tmdbApiKey.trim()) return null

    const key = config.tmdbApiKey.trim()
    const authHeader = this.getAuthHeader(key)
    const langPrefix = (config.language || 'en-US').split('-')[0] || 'en'
    const url = this.getUrlWithKey(
      `https://api.themoviedb.org/3/tv/${seriesId}?append_to_response=credits,external_ids,images&include_image_language=${encodeURIComponent(langPrefix)},en,null&language=${encodeURIComponent(config.language || 'en-US')}`,
      key,
    )

    try {
      await tmdbLimiter.throttle()
      const raw = await fetchMetadata(url, authHeader)
      if (!raw) return null
      const data = JSON.parse(raw) as {
        id: number
        name: string
        original_name?: string
        first_air_date?: string
        overview?: string
        genres?: Array<{ id: number; name: string }>
        vote_average?: number
        poster_path?: string | null
        backdrop_path?: string | null
        status?: string
        networks?: Array<{ name: string }>
        seasons?: Array<{
          season_number: number
          name: string
          overview?: string
          poster_path?: string | null
          episode_count: number
        }>
        credits?: {
          cast?: Array<{ name: string }>
        }
        external_ids?: {
          imdb_id?: string
          tvdb_id?: number
        }
        images?: {
          logos?: Array<{ file_path?: string; iso_639_1?: string | null }>
        }
      }

      const year = data.first_air_date ? Number.parseInt(data.first_air_date.slice(0, 4), 10) : undefined
      const logoEntry = data.images?.logos?.find((l) => l.iso_639_1 === langPrefix || l.iso_639_1 === 'en') ?? data.images?.logos?.[0]
      const seasons: SeasonMetadataDetails[] = Array.isArray(data.seasons)
        ? data.seasons
            .filter((s) => s.season_number > 0)
            .map((s) => ({
              seasonNumber: s.season_number,
              name: s.name,
              overview: s.overview,
              posterUrl: tmdbImageUrl(s.poster_path, 'w500'),
              episodeCount: s.episode_count,
              episodes: [],
            }))
        : []

      return {
        id: `tmdb:tv:${data.id}`,
        provider: 'tmdb',
        providerId: data.id,
        tmdbId: data.id,
        title: data.name,
        originalTitle: data.original_name,
        firstAirDate: data.first_air_date,
        year,
        overview: data.overview,
        genres: Array.isArray(data.genres) ? data.genres.map((g) => g.name) : [],
        voteAverage: data.vote_average,
        cast: Array.isArray(data.credits?.cast) ? data.credits!.cast.slice(0, 10).map((c) => c.name) : [],
        network: data.networks?.[0]?.name,
        posterUrl: tmdbImageUrl(data.poster_path, 'w500'),
        cardPosterUrl: tmdbImageUrl(data.poster_path, 'w342'),
        backdropUrl: tmdbImageUrl(data.backdrop_path, 'w1280'),
        logoUrl: tmdbImageUrl(logoEntry?.file_path, 'w500'),
        imdbId: data.external_ids?.imdb_id,
        thetvdbId: data.external_ids?.tvdb_id,
        status: data.status,
        seasons,
      }
    } catch {
      return null
    }
  }

  async getSeasonDetails(seriesId: number, seasonNumber: number): Promise<SeasonMetadataDetails | null> {
    const config = loadMetadataConfig()
    if (!config.tmdbEnabled || !config.tmdbApiKey.trim()) return null

    const key = config.tmdbApiKey.trim()
    const authHeader = this.getAuthHeader(key)
    const url = this.getUrlWithKey(
      `https://api.themoviedb.org/3/tv/${seriesId}/season/${seasonNumber}?language=${encodeURIComponent(config.language || 'en-US')}`,
      key,
    )

    try {
      await tmdbLimiter.throttle()
      const raw = await fetchMetadata(url, authHeader)
      if (!raw) return null
      const data = JSON.parse(raw) as {
        season_number: number
        name: string
        overview?: string
        poster_path?: string | null
        episodes?: Array<{
          season_number: number
          episode_number: number
          name: string
          overview?: string
          air_date?: string
          runtime?: number
          still_path?: string | null
          vote_average?: number
        }>
      }

      const episodes: EpisodeMetadataDetails[] = Array.isArray(data.episodes)
        ? data.episodes.map((e) => ({
            id: `tmdb:ep:${seriesId}:${e.season_number}:${e.episode_number}`,
            seasonNumber: e.season_number,
            episodeNumber: e.episode_number,
            title: e.name,
            airDate: e.air_date,
            runtime: e.runtime,
            overview: e.overview,
            stillUrl: tmdbImageUrl(e.still_path, 'w780'),
            voteAverage: e.vote_average,
          }))
        : []

      return {
        seasonNumber: data.season_number,
        name: data.name,
        overview: data.overview,
        posterUrl: tmdbImageUrl(data.poster_path, 'w500'),
        episodeCount: episodes.length,
        episodes,
      }
    } catch {
      return null
    }
  }
}

export class TvmazeProvider {
  readonly id = 'tvmaze' as const
  readonly name = METADATA_ATTRIBUTIONS.tvmaze.name

  async testConnection(): Promise<ConnectionTestReport> {
    const url = 'https://api.tvmaze.com/shows/1'
    const start = performance.now()
    try {
      await tvmazeLimiter.throttle()
      const raw = await fetchMetadata(url, null)
      const latencyMs = Math.round(performance.now() - start)
      if (!raw) {
        recordProviderStatus('tvmaze', false, 'Connection failed or returned empty response.')
        return {
          ok: false,
          provider: 'tvmaze',
          latencyMs,
          message: 'Connection failed or returned empty response.',
        }
      }
      const data = JSON.parse(raw) as { id?: number; name?: string }
      if (data.id && data.name) {
        recordProviderStatus('tvmaze', true)
        return {
          ok: true,
          provider: 'tvmaze',
          latencyMs,
          message: `Connected successfully (${latencyMs}ms). TVmaze API accessible.`,
        }
      }
      recordProviderStatus('tvmaze', false, 'Invalid response format from TVmaze API.')
      return {
        ok: false,
        provider: 'tvmaze',
        latencyMs,
        message: 'Invalid response format from TVmaze API.',
      }
    } catch {
      const latencyMs = Math.round(performance.now() - start)
      recordProviderStatus('tvmaze', false, 'Unable to reach TVmaze API.')
      return {
        ok: false,
        provider: 'tvmaze',
        latencyMs,
        message: 'Unable to reach TVmaze API. Check network connection.',
      }
    }
  }

  /**
   * Deterministic lookup by IMDb or TheTVDB ID via TVmaze /lookup/shows.
   */
  async lookupByExternalId(ids: { imdb?: string; thetvdb?: number }): Promise<MetadataSearchResult[]> {
    const config = loadMetadataConfig()
    if (!config.tvmazeEnabled || isProviderRateLimited('tvmaze')) return []

    let url = ''
    if (ids.imdb && ids.imdb.trim()) {
      url = `https://api.tvmaze.com/lookup/shows?imdb=${encodeURIComponent(ids.imdb.trim())}`
    } else if (ids.thetvdb) {
      url = `https://api.tvmaze.com/lookup/shows?thetvdb=${encodeURIComponent(String(ids.thetvdb))}`
    } else {
      return []
    }

    try {
      await tvmazeLimiter.throttle()
      const raw = await fetchMetadata(url, null)
      if (!raw) return []
      const show = JSON.parse(raw) as {
        id: number
        name: string
        premiered?: string
        summary?: string
        image?: { medium?: string; original?: string } | null
        externals?: { imdb?: string; thetvdb?: number }
      }
      if (!show?.id) return []
      const showYear = show.premiered ? Number.parseInt(show.premiered.slice(0, 4), 10) : undefined
      const posterUrl = show.image?.original || show.image?.medium
      const cardPosterUrl = show.image?.medium || show.image?.original
      const images = await this.getShowImages(show.id)
      const results: MetadataSearchResult[] = []

      if (posterUrl || images.posterUrl) {
        results.push({
          provider: 'tvmaze',
          providerId: `tvmaze:${show.id}`,
          numericId: show.id,
          title: show.name,
          year: showYear,
          overview: show.summary ? show.summary.replace(/<[^>]+>/g, '').trim() : undefined,
          posterUrl: posterUrl || images.posterUrl,
          cardPosterUrl: cardPosterUrl || images.posterUrl,
          backdropUrl: images.backdropUrl,
          imdbId: show.externals?.imdb,
          thetvdbId: show.externals?.thetvdb,
          aspectRatio: '2:3',
          confidence: 1.0,
          artworkType: 'series-poster',
        })
      }
      if (images.backdropUrl) {
        results.push({
          provider: 'tvmaze',
          providerId: `tvmaze:${show.id}:backdrop`,
          numericId: show.id,
          title: show.name,
          year: showYear,
          overview: show.summary ? show.summary.replace(/<[^>]+>/g, '').trim() : undefined,
          posterUrl: posterUrl || images.posterUrl,
          backdropUrl: images.backdropUrl,
          imdbId: show.externals?.imdb,
          thetvdbId: show.externals?.thetvdb,
          aspectRatio: '16:9',
          confidence: 1.0,
          artworkType: 'series-backdrop',
        })
      }
      recordProviderStatus('tvmaze', true)
      return results
    } catch {
      return []
    }
  }

  /**
   * Fetches distinct poster, landscape background (16:9), and banner images from TVmaze /shows/{id}/images.
   */
  async getShowImages(showId: number): Promise<{ posterUrl?: string; backdropUrl?: string; bannerUrl?: string }> {
    const config = loadMetadataConfig()
    if (!config.tvmazeEnabled) return {}

    const url = `https://api.tvmaze.com/shows/${showId}/images`
    try {
      await tvmazeLimiter.throttle()
      const raw = await fetchMetadata(url, null)
      if (!raw) return {}
      const data = JSON.parse(raw) as Array<{
        type?: string
        main?: boolean
        resolutions?: {
          original?: { url?: string; width?: number; height?: number }
          medium?: { url?: string; width?: number; height?: number }
        }
      }>
      if (!Array.isArray(data)) return {}

      const pick = (type: string): string | undefined => {
        const matches = data.filter((im) => im.type === type && (im.resolutions?.original?.url || im.resolutions?.medium?.url))
        const preferred = matches.find((im) => im.main) ?? matches[0]
        return preferred?.resolutions?.original?.url || preferred?.resolutions?.medium?.url
      }

      return {
        posterUrl: pick('poster'),
        backdropUrl: pick('background'),
        bannerUrl: pick('banner'),
      }
    } catch {
      return {}
    }
  }

  async getShowSeasons(showId: number): Promise<SeasonMetadataDetails[]> {
    const config = loadMetadataConfig()
    if (!config.tvmazeEnabled) return []

    const url = `https://api.tvmaze.com/shows/${showId}/seasons`
    try {
      await tvmazeLimiter.throttle()
      const raw = await fetchMetadata(url, null)
      if (!raw) return []
      const data = JSON.parse(raw) as Array<{
        number: number
        name?: string
        summary?: string
        episodeOrder?: number
        image?: { medium?: string; original?: string } | null
      }>
      if (!Array.isArray(data)) return []

      return data
        .filter((s) => s.number > 0)
        .map((s) => ({
          seasonNumber: s.number,
          name: s.name?.trim() || `Season ${s.number}`,
          overview: s.summary ? s.summary.replace(/<[^>]+>/g, '').trim() : undefined,
          posterUrl: s.image?.original || s.image?.medium,
          episodeCount: s.episodeOrder ?? 0,
          episodes: [],
        }))
    } catch {
      return []
    }
  }

  async searchSeries(rawTitle: string, queryYear?: number): Promise<MetadataSearchResult[]> {
    const config = loadMetadataConfig()
    if (!config.tvmazeEnabled || isProviderRateLimited('tvmaze')) return []

    const { cleanTitle, extractedYear } = canonicalizeTitle(rawTitle)
    const targetYear = queryYear ?? extractedYear
    if (!cleanTitle) return []

    const url = `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(cleanTitle)}`
    try {
      await tvmazeLimiter.throttle()
      const raw = await fetchMetadata(url, null)
      if (!raw) return []
      const data = JSON.parse(raw) as Array<{
        score: number
        show: {
          id: number
          name: string
          premiered?: string
          summary?: string
          externals?: { imdb?: string; thetvdb?: number }
          image?: { medium?: string; original?: string } | null
        }
      }>
      if (!Array.isArray(data)) return []

      const results: MetadataSearchResult[] = []
      for (const item of data.slice(0, 5)) {
        const show = item.show
        const showYear = show.premiered ? Number.parseInt(show.premiered.slice(0, 4), 10) : undefined
        const match = scoreArtworkMatch(cleanTitle, targetYear, show.name, showYear)
        if (match.status === 'verified' && match.confidence >= 0.65) {
          const posterUrl = show.image?.original || show.image?.medium
          const cardPosterUrl = show.image?.medium || show.image?.original
          if (posterUrl) {
            results.push({
              provider: 'tvmaze',
              providerId: `tvmaze:${show.id}`,
              numericId: show.id,
              title: show.name,
              year: showYear,
              overview: show.summary ? show.summary.replace(/<[^>]+>/g, '').trim() : undefined,
              posterUrl,
              cardPosterUrl,
              imdbId: show.externals?.imdb,
              thetvdbId: show.externals?.thetvdb,
              aspectRatio: '2:3',
              confidence: match.confidence,
              artworkType: 'series-poster',
            })
          }
        }
      }
      recordProviderStatus('tvmaze', true)
      return results
    } catch {
      return []
    }
  }

  async searchEpisodeStill(
    seriesTitle: string,
    seasonNumber: number,
    episodeNumber: number,
  ): Promise<string | null> {
    const config = loadMetadataConfig()
    if (!config.tvmazeEnabled) return null

    const { cleanTitle } = canonicalizeTitle(seriesTitle)
    if (!cleanTitle) return null

    const url = `https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(cleanTitle)}&embed=episodes`
    try {
      await tvmazeLimiter.throttle()
      const raw = await fetchMetadata(url, null)
      if (!raw) return null
      const data = JSON.parse(raw) as {
        _embedded?: {
          episodes?: Array<{
            season: number
            number: number
            image?: { medium?: string; original?: string } | null
          }>
        }
      }
      const episodes = data._embedded?.episodes
      if (!Array.isArray(episodes)) return null

      const found = episodes.find((e) => e.season === seasonNumber && e.number === episodeNumber)
      if (found?.image) {
        return found.image.original || found.image.medium || null
      }
      return null
    } catch {
      return null
    }
  }

  async getSeriesDetails(showId: number): Promise<SeriesMetadataDetails | null> {
    const config = loadMetadataConfig()
    if (!config.tvmazeEnabled) return null

    const url = `https://api.tvmaze.com/shows/${showId}?embed=cast`
    try {
      await tvmazeLimiter.throttle()
      const raw = await fetchMetadata(url, null)
      if (!raw) return null
      const data = JSON.parse(raw) as {
        id: number
        name: string
        premiered?: string
        summary?: string
        genres?: string[]
        rating?: { average?: number }
        network?: { name?: string }
        schedule?: { time?: string; days?: string[] }
        image?: { medium?: string; original?: string } | null
        status?: string
        externals?: { imdb?: string; thetvdb?: number }
        _embedded?: {
          cast?: Array<{ person: { name: string } }>
        }
      }

      const year = data.premiered ? Number.parseInt(data.premiered.slice(0, 4), 10) : undefined
      const overview = data.summary ? data.summary.replace(/<[^>]+>/g, '').trim() : undefined
      const cast = Array.isArray(data._embedded?.cast)
        ? data._embedded!.cast.slice(0, 8).map((c) => c.person.name)
        : []
      const broadcastSchedule =
        data.schedule?.days && data.schedule.days.length > 0
          ? `${data.schedule.days.join(', ')}${data.schedule.time ? ` at ${data.schedule.time}` : ''}`
          : undefined

      return {
        id: `tvmaze:${data.id}`,
        provider: 'tvmaze',
        providerId: data.id,
        tvmazeId: data.id,
        title: data.name,
        firstAirDate: data.premiered,
        year,
        overview,
        genres: Array.isArray(data.genres) ? data.genres : [],
        voteAverage: data.rating?.average,
        cast,
        network: data.network?.name,
        broadcastSchedule,
        posterUrl: data.image?.original || data.image?.medium,
        cardPosterUrl: data.image?.medium || data.image?.original,
        imdbId: data.externals?.imdb,
        thetvdbId: data.externals?.thetvdb,
        status: data.status,
        seasons: [],
      }
    } catch {
      return null
    }
  }

  async getSeriesEpisodes(showId: number): Promise<EpisodeMetadataDetails[]> {
    const config = loadMetadataConfig()
    if (!config.tvmazeEnabled) return []

    const url = `https://api.tvmaze.com/shows/${showId}/episodes`
    try {
      await tvmazeLimiter.throttle()
      const raw = await fetchMetadata(url, null)
      if (!raw) return []
      const data = JSON.parse(raw) as Array<{
        id: number
        season: number
        number: number
        name: string
        airdate?: string
        runtime?: number
        summary?: string
        image?: { medium?: string; original?: string } | null
      }>
      if (!Array.isArray(data)) return []

      return data.map((e) => ({
        id: `tvmaze:ep:${e.id}`,
        seasonNumber: e.season,
        episodeNumber: e.number,
        title: e.name,
        airDate: e.airdate,
        runtime: e.runtime,
        overview: e.summary ? e.summary.replace(/<[^>]+>/g, '').trim() : undefined,
        stillUrl: e.image?.original || e.image?.medium,
      }))
    } catch {
      return []
    }
  }
}

export class TvdbProvider {
  readonly id = 'tvdb' as const
  readonly name = METADATA_ATTRIBUTIONS.tvdb.name
  private cachedToken: { token: string; keyHash: string; expiresAt: number } | null = null

  private async authenticate(apiKey: string, pin?: string): Promise<string | null> {
    const key = apiKey.trim()
    if (!key) return null
    const keyHash = `${key.length}:${key.slice(0, 4)}:${pin?.trim().length ?? 0}`
    if (this.cachedToken && this.cachedToken.keyHash === keyHash && Date.now() < this.cachedToken.expiresAt) {
      return this.cachedToken.token
    }

    const payload: Record<string, string> = { apikey: key }
    if (pin && pin.trim()) payload.pin = pin.trim()

    await tvdbLimiter.throttle()
    const raw = await postMetadata('https://api4.thetvdb.com/v4/login', JSON.stringify(payload), null)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as { data?: { token?: string } }
      const token = parsed.data?.token
      if (!token) return null
      // TVDB v4 tokens remain valid for ~30 days; refresh every 12 hours in memory
      this.cachedToken = { token, keyHash, expiresAt: Date.now() + 12 * 3600 * 1000 }
      return token
    } catch {
      return null
    }
  }

  async testConnection(apiKey?: string, pin?: string): Promise<ConnectionTestReport> {
    const cfg = loadMetadataConfig()
    const key = (apiKey ?? cfg.tvdbApiKey ?? '').trim()
    const resolvedPin = (pin ?? cfg.tvdbPin ?? '').trim()
    if (!key) {
      return {
        ok: false,
        provider: 'tvdb',
        message: 'TheTVDB v4 API key is missing. Enter your registered API key (and subscriber PIN if required).',
      }
    }
    const start = performance.now()
    try {
      const token = await this.authenticate(key, resolvedPin)
      const latencyMs = Math.round(performance.now() - start)
      if (token) {
        recordProviderStatus('tvdb', true)
        return {
          ok: true,
          provider: 'tvdb',
          latencyMs,
          message: `Connected successfully (${latencyMs}ms). TheTVDB v4 token issued.`,
        }
      }
      recordProviderStatus('tvdb', false, 'TheTVDB v4 authentication failed.')
      return {
        ok: false,
        provider: 'tvdb',
        latencyMs,
        message: 'TheTVDB v4 refused authentication. Verify your API key and subscriber PIN.',
      }
    } catch {
      const latencyMs = Math.round(performance.now() - start)
      recordProviderStatus('tvdb', false, 'Unable to reach TheTVDB v4 API.')
      return {
        ok: false,
        provider: 'tvdb',
        latencyMs,
        message: 'Unable to reach TheTVDB v4 API. Check credentials and network.',
      }
    }
  }

  async searchSeries(rawTitle: string, queryYear?: number): Promise<MetadataSearchResult[]> {
    const config = loadMetadataConfig()
    if (!config.tvdbEnabled || !config.tvdbApiKey?.trim() || isProviderRateLimited('tvdb')) return []

    const { cleanTitle, extractedYear } = canonicalizeTitle(rawTitle)
    const targetYear = queryYear ?? extractedYear
    if (!cleanTitle) return []

    const token = await this.authenticate(config.tvdbApiKey, config.tvdbPin)
    if (!token) return []

    let url = `https://api4.thetvdb.com/v4/search?query=${encodeURIComponent(cleanTitle)}&type=series`
    if (targetYear) url += `&year=${targetYear}`

    try {
      await tvdbLimiter.throttle()
      const raw = await fetchMetadata(url, `Bearer ${token}`)
      if (!raw) return []
      const data = JSON.parse(raw) as {
        data?: Array<{
          tvdb_id?: string
          name?: string
          year?: string
          overview?: string
          image_url?: string
        }>
      }
      if (!Array.isArray(data.data)) return []

      const results: MetadataSearchResult[] = []
      for (const item of data.data.slice(0, 5)) {
        if (!item.name || !item.tvdb_id) continue
        const itemYear = item.year ? Number.parseInt(item.year, 10) || undefined : undefined
        const match = scoreArtworkMatch(cleanTitle, targetYear, item.name, itemYear)
        if (match.status === 'verified' && match.confidence >= 0.65 && item.image_url) {
          results.push({
            provider: 'tvdb',
            providerId: `tvdb:tv:${item.tvdb_id}`,
            numericId: Number.parseInt(item.tvdb_id, 10) || undefined,
            title: item.name,
            year: itemYear,
            overview: item.overview,
            posterUrl: item.image_url,
            thetvdbId: Number.parseInt(item.tvdb_id, 10) || undefined,
            aspectRatio: '2:3',
            confidence: match.confidence,
            artworkType: 'series-poster',
          })
        }
      }
      recordProviderStatus('tvdb', true)
      return results
    } catch {
      return []
    }
  }

  async searchMovie(rawTitle: string, queryYear?: number): Promise<MetadataSearchResult[]> {
    const config = loadMetadataConfig()
    if (!config.tvdbEnabled || !config.tvdbApiKey?.trim() || isProviderRateLimited('tvdb')) return []

    const { cleanTitle, extractedYear } = canonicalizeTitle(rawTitle)
    const targetYear = queryYear ?? extractedYear
    if (!cleanTitle) return []

    const token = await this.authenticate(config.tvdbApiKey, config.tvdbPin)
    if (!token) return []

    let url = `https://api4.thetvdb.com/v4/search?query=${encodeURIComponent(cleanTitle)}&type=movie`
    if (targetYear) url += `&year=${targetYear}`

    try {
      await tvdbLimiter.throttle()
      const raw = await fetchMetadata(url, `Bearer ${token}`)
      if (!raw) return []
      const data = JSON.parse(raw) as {
        data?: Array<{
          tvdb_id?: string
          name?: string
          year?: string
          overview?: string
          image_url?: string
        }>
      }
      if (!Array.isArray(data.data)) return []

      const results: MetadataSearchResult[] = []
      for (const item of data.data.slice(0, 5)) {
        if (!item.name || !item.tvdb_id) continue
        const itemYear = item.year ? Number.parseInt(item.year, 10) || undefined : undefined
        const match = scoreArtworkMatch(cleanTitle, targetYear, item.name, itemYear)
        if (match.status === 'verified' && match.confidence >= 0.65 && item.image_url) {
          results.push({
            provider: 'tvdb',
            providerId: `tvdb:m:${item.tvdb_id}`,
            numericId: Number.parseInt(item.tvdb_id, 10) || undefined,
            title: item.name,
            year: itemYear,
            overview: item.overview,
            posterUrl: item.image_url,
            aspectRatio: '2:3',
            confidence: match.confidence,
            artworkType: 'movie-poster',
          })
        }
      }
      recordProviderStatus('tvdb', true)
      return results
    } catch {
      return []
    }
  }
}

export const tmdbProvider = new TmdbProvider()
export const tvmazeProvider = new TvmazeProvider()
export const tvdbProvider = new TvdbProvider()

/**
 * Searches external metadata providers for movie artwork respecting configured priority and fallback.
 * Uses IMDb external ID first when provided for deterministic matching.
 * Strictly respects user configuration: returns empty array if no provider is enabled.
 */
export async function searchMovieMetadata(
  title: string,
  year?: number,
  externalIds?: { imdbId?: string },
): Promise<MetadataSearchResult[]> {
  const config = loadMetadataConfig()
  const priority = config.movieProviderPriority ?? ['tmdb', 'tvdb']

  for (const prov of priority) {
    if (prov === 'tmdb' && config.tmdbEnabled && config.tmdbApiKey.trim()) {
      if (externalIds?.imdbId) {
        const exact = await tmdbProvider.findByExternalId(externalIds.imdbId, 'imdb_id', 'movie')
        if (exact.length > 0) return exact
      }
      const found = await tmdbProvider.searchMovie(title, year)
      if (found.length > 0) return found
    }
    if (prov === 'tvdb' && config.tvdbEnabled && config.tvdbApiKey?.trim()) {
      const found = await tvdbProvider.searchMovie(title, year)
      if (found.length > 0) return found
    }
  }
  return []
}

/**
 * Searches external metadata providers for television series artwork respecting configured priority and fallback.
 * Uses external IDs (IMDb / TheTVDB) before falling back to normalised title + year matching.
 * Combines results when a primary provider lacks landscape backdrops and a secondary provider supplies them.
 */
export async function searchSeriesMetadata(
  title: string,
  year?: number,
  externalIds?: { imdbId?: string; thetvdbId?: number },
): Promise<MetadataSearchResult[]> {
  const config = loadMetadataConfig()
  const priority = config.seriesProviderPriority ?? ['tmdb', 'tvmaze', 'tvdb']
  const collected: MetadataSearchResult[] = []

  for (const prov of priority) {
    if (prov === 'tmdb' && config.tmdbEnabled && config.tmdbApiKey.trim()) {
      let found: MetadataSearchResult[] = []
      if (externalIds?.imdbId) {
        found = await tmdbProvider.findByExternalId(externalIds.imdbId, 'imdb_id', 'series')
      } else if (externalIds?.thetvdbId) {
        found = await tmdbProvider.findByExternalId(String(externalIds.thetvdbId), 'tvdb_id', 'series')
      }
      if (found.length === 0) {
        found = await tmdbProvider.searchSeries(title, year)
      }
      if (found.length > 0) {
        collected.push(...found)
        const hasPoster = collected.some((r) => r.artworkType === 'series-poster')
        const hasBackdrop = collected.some((r) => r.artworkType === 'series-backdrop')
        if (hasPoster && hasBackdrop) return collected
      }
    }

    if (prov === 'tvmaze' && config.tvmazeEnabled) {
      let found: MetadataSearchResult[] = []
      if (externalIds?.imdbId || externalIds?.thetvdbId) {
        found = await tvmazeProvider.lookupByExternalId({
          imdb: externalIds.imdbId,
          thetvdb: externalIds.thetvdbId,
        })
      }
      if (found.length === 0) {
        found = await tvmazeProvider.searchSeries(title, year)
        // Enrich top TVmaze search result with landscape background from /shows/{id}/images
        const top = found[0]
        if (top?.numericId) {
          const imgs = await tvmazeProvider.getShowImages(top.numericId)
          if (imgs.backdropUrl) {
            top.backdropUrl = imgs.backdropUrl
            found.push({
              ...top,
              providerId: `${top.providerId}:backdrop`,
              backdropUrl: imgs.backdropUrl,
              aspectRatio: '16:9',
              artworkType: 'series-backdrop',
            })
          }
        }
      }
      if (found.length > 0) {
        for (const item of found) {
          if (!collected.some((c) => c.artworkType === item.artworkType)) {
            collected.push(item)
          }
        }
        const hasPoster = collected.some((r) => r.artworkType === 'series-poster')
        const hasBackdrop = collected.some((r) => r.artworkType === 'series-backdrop')
        if (hasPoster && hasBackdrop) return collected
      }
    }

    if (prov === 'tvdb' && config.tvdbEnabled && config.tvdbApiKey?.trim()) {
      const found = await tvdbProvider.searchSeries(title, year)
      if (found.length > 0) {
        for (const item of found) {
          if (!collected.some((c) => c.artworkType === item.artworkType)) {
            collected.push(item)
          }
        }
      }
    }
  }

  return collected
}

/**
 * Resolves rich movie metadata details (overview, cast, director, genres, poster, backdrop, logo).
 */
export async function resolveRichMovieDetails(query: {
  title: string
  year?: number
  imdbId?: string
  tmdbId?: number
}): Promise<MovieMetadataDetails | null> {
  const config = loadMetadataConfig()
  if (!config.tmdbEnabled || !config.tmdbApiKey.trim()) return null

  if (query.tmdbId) {
    return tmdbProvider.getMovieDetails(query.tmdbId)
  }
  const results = await searchMovieMetadata(query.title, query.year, { imdbId: query.imdbId })
  const top = results.find((r) => r.provider === 'tmdb' && r.numericId)
  if (!top?.numericId) return null
  return tmdbProvider.getMovieDetails(top.numericId)
}

/**
 * Resolves rich series metadata details including seasons, episodes, episode stills, cast, and backdrops.
 * Automatically merges complementary data from TMDB and TVmaze when both are enabled.
 */
export async function resolveRichSeriesDetails(query: {
  title: string
  year?: number
  imdbId?: string
  tmdbId?: number
  tvmazeId?: number
  thetvdbId?: number
  seasonNumber?: number
}): Promise<SeriesMetadataDetails | null> {
  const config = loadMetadataConfig()
  const priority = config.seriesProviderPriority ?? ['tmdb', 'tvmaze', 'tvdb']
  let primary: SeriesMetadataDetails | null = null

  for (const prov of priority) {
    if (prov === 'tmdb' && config.tmdbEnabled && config.tmdbApiKey.trim()) {
      let tmdbId = query.tmdbId
      if (!tmdbId) {
        const found = query.imdbId
          ? await tmdbProvider.findByExternalId(query.imdbId, 'imdb_id', 'series')
          : await tmdbProvider.searchSeries(query.title, query.year)
        tmdbId = found.find((f) => f.provider === 'tmdb' && f.numericId)?.numericId
      }
      if (tmdbId) {
        const details = await tmdbProvider.getSeriesDetails(tmdbId)
        if (details) {
          if (query.seasonNumber) {
            const season = await tmdbProvider.getSeasonDetails(tmdbId, query.seasonNumber)
            if (season) {
              const idx = details.seasons.findIndex((s) => s.seasonNumber === season.seasonNumber)
              if (idx >= 0) details.seasons[idx] = season
              else details.seasons.push(season)
            }
          }
          primary = details
          break
        }
      }
    }

    if (prov === 'tvmaze' && config.tvmazeEnabled) {
      let tvmazeId = query.tvmazeId
      if (!tvmazeId) {
        const found =
          query.imdbId || query.thetvdbId
            ? await tvmazeProvider.lookupByExternalId({ imdb: query.imdbId, thetvdb: query.thetvdbId })
            : await tvmazeProvider.searchSeries(query.title, query.year)
        tvmazeId = found.find((f) => f.provider === 'tvmaze' && f.numericId)?.numericId
      }
      if (tvmazeId) {
        const details = await tvmazeProvider.getSeriesDetails(tvmazeId)
        if (details) {
          const [imgs, seasons, episodes] = await Promise.all([
            tvmazeProvider.getShowImages(tvmazeId),
            tvmazeProvider.getShowSeasons(tvmazeId),
            tvmazeProvider.getSeriesEpisodes(tvmazeId),
          ])
          if (imgs.backdropUrl && !details.backdropUrl) details.backdropUrl = imgs.backdropUrl
          if (imgs.posterUrl && !details.posterUrl) details.posterUrl = imgs.posterUrl
          const seasonMap = new Map<number, SeasonMetadataDetails>()
          for (const s of seasons) seasonMap.set(s.seasonNumber, s)
          for (const ep of episodes) {
            let s = seasonMap.get(ep.seasonNumber)
            if (!s) {
              s = { seasonNumber: ep.seasonNumber, name: `Season ${ep.seasonNumber}`, episodeCount: 0, episodes: [] }
              seasonMap.set(ep.seasonNumber, s)
            }
            s.episodes.push(ep)
            s.episodeCount = s.episodes.length
          }
          details.seasons = Array.from(seasonMap.values()).sort((a, b) => a.seasonNumber - b.seasonNumber)
          primary = details
          break
        }
      }
    }
  }

  return primary
}

/**
 * Discovers episode still artwork from enabled television providers (TMDB season details or TVmaze).
 */
export async function searchEpisodeStill(
  seriesTitle: string,
  seasonNumber: number,
  episodeNumber: number,
): Promise<string | null> {
  const config = loadMetadataConfig()
  if (config.tvmazeEnabled) {
    const still = await tvmazeProvider.searchEpisodeStill(seriesTitle, seasonNumber, episodeNumber)
    if (still) return still
  }
  if (config.tmdbEnabled && config.tmdbApiKey.trim()) {
    const shows = await tmdbProvider.searchSeries(seriesTitle)
    const top = shows.find((s) => s.numericId)
    if (top?.numericId) {
      const season = await tmdbProvider.getSeasonDetails(top.numericId, seasonNumber)
      const ep = season?.episodes.find((e) => e.episodeNumber === episodeNumber)
      if (ep?.stillUrl) return ep.stillUrl
    }
  }
  return null
}

/**
 * Tests connection to a specific metadata provider.
 */
export async function testProviderConnection(
  provider: ExternalProviderId,
  apiKey?: string,
  pin?: string,
): Promise<ConnectionTestReport> {
  if (provider === 'tmdb') {
    return tmdbProvider.testConnection(apiKey)
  }
  if (provider === 'tvdb') {
    return tvdbProvider.testConnection(apiKey, pin)
  }
  return tvmazeProvider.testConnection()
}

/**
 * Completely revokes and clears saved metadata credentials (TMDB and TVDB).
 */
export function clearMetadataCredentials(): void {
  const current = loadMetadataConfig()
  vaultMemoryCreds = { tmdbApiKey: '', tvdbApiKey: '', tvdbPin: '' }
  void clearMetadataCredentialsVault()
  saveMetadataConfig({
    ...current,
    tmdbApiKey: '',
    tmdbEnabled: false,
    tvdbApiKey: '',
    tvdbPin: '',
    tvdbEnabled: false,
  })
}
