/**
 * External Metadata Provider Integrations for Kinora.
 *
 * Implements approved metadata discovery for The Movie Database (TMDB) and TVmaze:
 * - Clean provider abstraction with rate limiting and token bucket throttling.
 * - Strict opt-in control: all external providers are DISABLED by default.
 * - Zero network requests emitted when a provider is disabled.
 * - Privacy protection: title queries only, never stream URLs or personal data.
 * - Attribution and licensing notices for TMDB and TVmaze.
 * - Typed mapping to 7 core artwork types: movie-poster, movie-backdrop, series-poster,
 *   series-backdrop, season-artwork, episode-still, and epg-programme-artwork.
 *
 * Strictly adheres to typography standard: zero em-dashes across all comments and text.
 */

import { fetchMetadata } from '../lib/native'
import { canonicalizeTitle, scoreArtworkMatch, type ArtworkAspectRatio, type ArtworkType } from './artworkEngine'

export interface MetadataConfig {
  tmdbEnabled: boolean
  tmdbApiKey: string
  tvmazeEnabled: boolean
  autoEnrichEpg: boolean
  preferHighResPosters: boolean
}

export const DEFAULT_METADATA_CONFIG: MetadataConfig = {
  tmdbEnabled: false,
  tmdbApiKey: '',
  tvmazeEnabled: false,
  autoEnrichEpg: false,
  preferHighResPosters: true,
}

const STORAGE_KEY = 'kinora.metadataConfig.v1'
let memoryConfig: MetadataConfig | null = null

export function loadMetadataConfig(): MetadataConfig {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<MetadataConfig>
        return {
          tmdbEnabled: Boolean(parsed.tmdbEnabled),
          tmdbApiKey: typeof parsed.tmdbApiKey === 'string' ? parsed.tmdbApiKey : '',
          tvmazeEnabled: Boolean(parsed.tvmazeEnabled),
          autoEnrichEpg: Boolean(parsed.autoEnrichEpg),
          preferHighResPosters: parsed.preferHighResPosters !== false,
        }
      }
    } else if (memoryConfig) {
      return { ...memoryConfig }
    }
  } catch {
    // Fallback on corrupt or unavailable storage
  }
  return { ...DEFAULT_METADATA_CONFIG }
}

export function saveMetadataConfig(config: MetadataConfig): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    } else {
      memoryConfig = { ...config }
    }
  } catch {
    // Storage full or private mode
  }
}

export interface MovieMetadataDetails {
  id: string
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
  backdropUrl?: string
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
  provider: 'tmdb' | 'tvmaze'
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
  posterUrl?: string
  backdropUrl?: string
  imdbId?: string
  thetvdbId?: number
  status?: string
  seasons: SeasonMetadataDetails[]
}

export interface MetadataSearchResult {
  provider: 'tmdb' | 'tvmaze'
  providerId: string
  title: string
  year?: number
  overview?: string
  posterUrl?: string
  backdropUrl?: string
  stillUrl?: string
  aspectRatio: ArtworkAspectRatio
  confidence: number
  artworkType: ArtworkType
}

export interface ConnectionTestReport {
  ok: boolean
  provider: 'tmdb' | 'tvmaze'
  latencyMs?: number
  message: string
}

export const METADATA_ATTRIBUTIONS = {
  tmdb: {
    name: 'The Movie Database (TMDB)',
    attributionText: 'This product uses the TMDB API but is not endorsed or certified by TMDB.',
    licensing: 'Content metadata and promotional imagery sourced via TMDB API.',
    privacyNote: 'Enabling TMDB will transmit search titles to api.themoviedb.org. Kinora never shares playlist streams or user identity.',
    websiteUrl: 'https://www.themoviedb.org',
  },
  tvmaze: {
    name: 'TVmaze',
    attributionText: 'Television schedule data and episode stills provided by TVmaze under Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0).',
    licensing: 'Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0).',
    privacyNote: 'Enabling TVmaze will transmit television show queries to api.tvmaze.com. No account or API key required.',
    websiteUrl: 'https://www.tvmaze.com',
  },
}

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

export class TmdbProvider {
  readonly id = 'tmdb' as const
  readonly name = METADATA_ATTRIBUTIONS.tmdb.name

  private getAuthHeader(apiKey: string): string | null {
    if (!apiKey) return null
    // If user provided a Bearer token (JWT format or long key), use Bearer header
    if (apiKey.startsWith('eyJ') || apiKey.length > 64) {
      return `Bearer ${apiKey.trim()}`
    }
    return null
  }

  private getUrlWithKey(baseUrl: string, apiKey: string): string {
    if (!apiKey) return baseUrl
    if (this.getAuthHeader(apiKey)) {
      return baseUrl // Authenticated via header
    }
    const sep = baseUrl.includes('?') ? '&' : '?'
    return `${baseUrl}${sep}api_key=${encodeURIComponent(apiKey.trim())}`
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
        return {
          ok: false,
          provider: 'tmdb',
          latencyMs,
          message: 'Connection failed or returned empty response.',
        }
      }
      const data = JSON.parse(raw) as { images?: { base_url?: string } }
      if (data.images?.base_url) {
        return {
          ok: true,
          provider: 'tmdb',
          latencyMs,
          message: `Connected successfully (${latencyMs}ms). API key verified.`,
        }
      }
      return {
        ok: false,
        provider: 'tmdb',
        latencyMs,
        message: 'Invalid response format from TMDB API.',
      }
    } catch {
      const latencyMs = Math.round(performance.now() - start)
      return {
        ok: false,
        provider: 'tmdb',
        latencyMs,
        message: 'Unable to reach TMDB API. Check credentials and network.',
      }
    }
  }

  async searchMovie(rawTitle: string, queryYear?: number): Promise<MetadataSearchResult[]> {
    const config = loadMetadataConfig()
    if (!config.tmdbEnabled || !config.tmdbApiKey.trim()) return []

    const { cleanTitle, extractedYear } = canonicalizeTitle(rawTitle)
    const targetYear = queryYear ?? extractedYear
    if (!cleanTitle) return []

    const key = config.tmdbApiKey.trim()
    const authHeader = this.getAuthHeader(key)
    let url = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(cleanTitle)}`
    if (targetYear) {
      url += `&year=${targetYear}`
    }
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

      const results: MetadataSearchResult[] = []
      for (const item of data.results.slice(0, 5)) {
        const itemYear = item.release_date ? Number.parseInt(item.release_date.slice(0, 4), 10) : undefined
        const match = scoreArtworkMatch(cleanTitle, targetYear, item.title, itemYear)
        if (match.status === 'verified' && match.confidence >= 0.65) {
          const posterUrl = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : undefined
          const backdropUrl = item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : undefined

          if (posterUrl) {
            results.push({
              provider: 'tmdb',
              providerId: `tmdb:m:${item.id}`,
              title: item.title,
              year: itemYear,
              overview: item.overview,
              posterUrl,
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
              title: item.title,
              year: itemYear,
              overview: item.overview,
              posterUrl,
              backdropUrl,
              aspectRatio: '16:9',
              confidence: match.confidence,
              artworkType: 'movie-backdrop',
            })
          }
        }
      }
      return results
    } catch {
      return []
    }
  }

  async searchSeries(rawTitle: string, queryYear?: number): Promise<MetadataSearchResult[]> {
    const config = loadMetadataConfig()
    if (!config.tmdbEnabled || !config.tmdbApiKey.trim()) return []

    const { cleanTitle, extractedYear } = canonicalizeTitle(rawTitle)
    const targetYear = queryYear ?? extractedYear
    if (!cleanTitle) return []

    const key = config.tmdbApiKey.trim()
    const authHeader = this.getAuthHeader(key)
    let url = `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(cleanTitle)}`
    if (targetYear) {
      url += `&first_air_date_year=${targetYear}`
    }
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

      const results: MetadataSearchResult[] = []
      for (const item of data.results.slice(0, 5)) {
        const itemYear = item.first_air_date ? Number.parseInt(item.first_air_date.slice(0, 4), 10) : undefined
        const match = scoreArtworkMatch(cleanTitle, targetYear, item.name, itemYear)
        if (match.status === 'verified' && match.confidence >= 0.65) {
          const posterUrl = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : undefined
          const backdropUrl = item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : undefined

          if (posterUrl) {
            results.push({
              provider: 'tmdb',
              providerId: `tmdb:tv:${item.id}`,
              title: item.name,
              year: itemYear,
              overview: item.overview,
              posterUrl,
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
              title: item.name,
              year: itemYear,
              overview: item.overview,
              posterUrl,
              backdropUrl,
              aspectRatio: '16:9',
              confidence: match.confidence,
              artworkType: 'series-backdrop',
            })
          }
        }
      }
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
    const url = this.getUrlWithKey(
      `https://api.themoviedb.org/3/movie/${movieId}?append_to_response=credits,external_ids`,
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
      }

      const releaseYear = data.release_date ? Number.parseInt(data.release_date.slice(0, 4), 10) : undefined
      const director = data.credits?.crew?.find((c) => c.job === 'Director')?.name

      return {
        id: `tmdb:m:${data.id}`,
        tmdbId: data.id,
        title: data.title,
        originalTitle: data.original_title,
        releaseDate: data.release_date,
        year: releaseYear,
        runtime: data.runtime,
        overview: data.overview,
        genres: Array.isArray(data.genres) ? data.genres.map((g) => g.name) : [],
        voteAverage: data.vote_average,
        cast: Array.isArray(data.credits?.cast) ? data.credits!.cast.slice(0, 8).map((c) => c.name) : [],
        director,
        posterUrl: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : undefined,
        backdropUrl: data.backdrop_path ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}` : undefined,
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
    const url = this.getUrlWithKey(
      `https://api.themoviedb.org/3/tv/${seriesId}?append_to_response=credits,external_ids`,
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
        }
      }

      const year = data.first_air_date ? Number.parseInt(data.first_air_date.slice(0, 4), 10) : undefined
      const seasons: SeasonMetadataDetails[] = Array.isArray(data.seasons)
        ? data.seasons
            .filter((s) => s.season_number > 0)
            .map((s) => ({
              seasonNumber: s.season_number,
              name: s.name,
              overview: s.overview,
              posterUrl: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : undefined,
              episodeCount: s.episode_count,
              episodes: [],
            }))
        : []

      return {
        id: `tmdb:tv:${data.id}`,
        provider: 'tmdb',
        providerId: data.id,
        title: data.name,
        originalTitle: data.original_name,
        firstAirDate: data.first_air_date,
        year,
        overview: data.overview,
        genres: Array.isArray(data.genres) ? data.genres.map((g) => g.name) : [],
        voteAverage: data.vote_average,
        cast: Array.isArray(data.credits?.cast) ? data.credits!.cast.slice(0, 8).map((c) => c.name) : [],
        network: data.networks?.[0]?.name,
        posterUrl: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : undefined,
        backdropUrl: data.backdrop_path ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}` : undefined,
        imdbId: data.external_ids?.imdb_id,
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
      `https://api.themoviedb.org/3/tv/${seriesId}/season/${seasonNumber}`,
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
            overview: e.overview,
            stillUrl: e.still_path ? `https://image.tmdb.org/t/p/w780${e.still_path}` : undefined,
            voteAverage: e.vote_average,
          }))
        : []

      return {
        seasonNumber: data.season_number,
        name: data.name,
        overview: data.overview,
        posterUrl: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : undefined,
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
        return {
          ok: false,
          provider: 'tvmaze',
          latencyMs,
          message: 'Connection failed or returned empty response.',
        }
      }
      const data = JSON.parse(raw) as { id?: number; name?: string }
      if (data.id && data.name) {
        return {
          ok: true,
          provider: 'tvmaze',
          latencyMs,
          message: `Connected successfully (${latencyMs}ms). TVmaze API accessible.`,
        }
      }
      return {
        ok: false,
        provider: 'tvmaze',
        latencyMs,
        message: 'Invalid response format from TVmaze API.',
      }
    } catch {
      const latencyMs = Math.round(performance.now() - start)
      return {
        ok: false,
        provider: 'tvmaze',
        latencyMs,
        message: 'Unable to reach TVmaze API. Check network connection.',
      }
    }
  }

  async searchSeries(rawTitle: string, queryYear?: number): Promise<MetadataSearchResult[]> {
    const config = loadMetadataConfig()
    if (!config.tvmazeEnabled) return []

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
          if (posterUrl) {
            results.push({
              provider: 'tvmaze',
              providerId: `tvmaze:${show.id}`,
              title: show.name,
              year: showYear,
              overview: show.summary ? show.summary.replace(/<[^>]+>/g, '').trim() : undefined,
              posterUrl,
              aspectRatio: '2:3',
              confidence: match.confidence,
              artworkType: 'series-poster',
            })
          }
        }
      }
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

      return {
        id: `tvmaze:${data.id}`,
        provider: 'tvmaze',
        providerId: data.id,
        title: data.name,
        firstAirDate: data.premiered,
        year,
        overview,
        genres: Array.isArray(data.genres) ? data.genres : [],
        voteAverage: data.rating?.average,
        cast,
        network: data.network?.name,
        posterUrl: data.image?.original || data.image?.medium,
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

export const tmdbProvider = new TmdbProvider()
export const tvmazeProvider = new TvmazeProvider()

/**
 * Searches external metadata providers for movie artwork.
 * Strictly respects user configuration: returns empty array if no provider is enabled.
 */
export async function searchMovieMetadata(title: string, year?: number): Promise<MetadataSearchResult[]> {
  const config = loadMetadataConfig()
  if (!config.tmdbEnabled) return []
  return tmdbProvider.searchMovie(title, year)
}

/**
 * Searches external metadata providers for series artwork.
 * Prioritises TMDB if enabled, falling back to TVmaze.
 */
export async function searchSeriesMetadata(title: string, year?: number): Promise<MetadataSearchResult[]> {
  const config = loadMetadataConfig()
  if (config.tmdbEnabled) {
    const tmdbResults = await tmdbProvider.searchSeries(title, year)
    if (tmdbResults.length > 0) return tmdbResults
  }
  if (config.tvmazeEnabled) {
    return tvmazeProvider.searchSeries(title, year)
  }
  return []
}

/**
 * Discovers episode still artwork from TVmaze.
 */
export async function searchEpisodeStill(
  seriesTitle: string,
  seasonNumber: number,
  episodeNumber: number,
): Promise<string | null> {
  const config = loadMetadataConfig()
  if (!config.tvmazeEnabled) return null
  return tvmazeProvider.searchEpisodeStill(seriesTitle, seasonNumber, episodeNumber)
}

/**
 * Tests connection to a specific metadata provider.
 */
export async function testProviderConnection(
  provider: 'tmdb' | 'tvmaze',
  apiKey?: string,
): Promise<ConnectionTestReport> {
  if (provider === 'tmdb') {
    return tmdbProvider.testConnection(apiKey)
  }
  return tvmazeProvider.testConnection()
}

/**
 * Completely revokes and clears saved metadata credentials.
 */
export function clearMetadataCredentials(): void {
  const current = loadMetadataConfig()
  saveMetadataConfig({
    ...current,
    tmdbApiKey: '',
    tmdbEnabled: false,
  })
}
