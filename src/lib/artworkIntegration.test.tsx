// @vitest-environment happy-dom
/**
 * End-to-end verification tests for Kinora's unified artwork, metadata, and provider system.
 * Covers provider connectivity, authentication, fallback, external ID matching, artwork resolution,
 * caching, user overrides, playback yielding, and screen integration.
 *
 * Strictly adheres to zero em-dash typography standard.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import * as native from './native'
import {
  DEFAULT_METADATA_CONFIG,
  METADATA_PROVIDERS_REGISTRY,
  loadMetadataConfig,
  resolveRichMovieDetails,
  resolveRichSeriesDetails,
  saveMetadataConfig,
  searchMovieMetadata,
  searchSeriesMetadata,
  testProviderConnection,
  tmdbProvider,
  tvdbProvider,
  tvmazeProvider,
} from '../data/metadataProviders'
import { artworkEngine } from '../data/artworkEngine'
import { resolveArtwork } from './artworkResolver'
import { clearCustomArtworksForTesting, saveCustomArtwork } from '../state/customArtwork'
import { StoreProvider } from '../state/store'
import { ProfileProvider } from '../state/profiles'
import { LocalMediaProvider } from '../state/localMedia'
import { NotificationProvider } from '../components/Notifications'
import { ToastProvider } from '../components/Toast'
import { Home } from '../screens/Home'
import { Movies } from '../screens/Movies'
import { SeriesBrowse } from '../screens/SeriesBrowse'
import { MovieDetail } from '../screens/MovieDetail'
import { SeriesDetail } from '../screens/SeriesDetail'
import { Search } from '../screens/Search'
import { Library } from '../screens/Library'
import { LiveTV } from '../screens/LiveTV'
import { OPEN_MOVIES, OPEN_SERIES } from '../data/openCatalogue'

function wrap(ui: React.ReactElement, initialEntry = '/') {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ProfileProvider>
        <StoreProvider initialDemo>
          <LocalMediaProvider>
            <NotificationProvider>
              <ToastProvider>{ui}</ToastProvider>
            </NotificationProvider>
          </LocalMediaProvider>
        </StoreProvider>
      </ProfileProvider>
    </MemoryRouter>,
  )
}

describe('Unified Metadata Providers, Priority & Fallback', () => {
  beforeEach(() => {
    localStorage.clear()
    clearCustomArtworksForTesting()
    artworkEngine.setPlaybackActive(false)
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('registers TMDB, TVmaze, and TVDB with accurate credential requirements', () => {
    const tmdb = METADATA_PROVIDERS_REGISTRY.find((p) => p.id === 'tmdb')
    const tvmaze = METADATA_PROVIDERS_REGISTRY.find((p) => p.id === 'tvmaze')
    const tvdb = METADATA_PROVIDERS_REGISTRY.find((p) => p.id === 'tvdb')

    expect(tmdb?.capabilities.requiresCredentials).toBe(true)
    expect(tmdb?.capabilities.movies).toBe(true)
    expect(tmdb?.capabilities.backdrops).toBe(true)
    expect(tmdb?.capabilities.logos).toBe(true)

    expect(tvmaze?.capabilities.requiresCredentials).toBe(false)
    expect(tvmaze?.capabilities.credentialKind).toBe('none')
    expect(tvmaze?.capabilities.series).toBe(true)
    expect(tvmaze?.capabilities.episodeStills).toBe(true)

    expect(tvdb?.capabilities.requiresCredentials).toBe(true)
    expect(tvdb?.capabilities.credentialKind).toBe('api-key-and-pin')
  })

  it('handles TVDB authentication failure and empty key safely', async () => {
    const missing = await testProviderConnection('tvdb', '')
    expect(missing.ok).toBe(false)
    expect(missing.message).toContain('API key is missing')

    const postSpy = vi.spyOn(native, 'postMetadata').mockResolvedValueOnce(null)
    const refused = await testProviderConnection('tvdb', 'bad-key', 'bad-pin')
    expect(refused.ok).toBe(false)
    expect(refused.message).toContain('refused authentication')
    postSpy.mockRestore()
  })

  it('performs deterministic TMDB IMDb ID lookup with 1.0 confidence', async () => {
    saveMetadataConfig({
      ...DEFAULT_METADATA_CONFIG,
      tmdbEnabled: true,
      tmdbApiKey: 'test-tmdb-key',
    })

    const spy = vi.spyOn(native, 'fetchMetadata').mockResolvedValueOnce(
      JSON.stringify({
        movie_results: [
          {
            id: 10331,
            title: 'Night of the Living Dead',
            release_date: '1968-10-01',
            poster_path: '/notld-poster.jpg',
            backdrop_path: '/notld-backdrop.jpg',
            overview: 'Classic horror film.',
          },
        ],
        tv_results: [],
      }),
    )

    const results = await searchMovieMetadata('Night of the Living Dead', 1968, { imdbId: 'tt0063350' })
    expect(results).toHaveLength(2)
    expect(results.find((r) => r.artworkType === 'movie-poster')?.posterUrl).toBe('https://image.tmdb.org/t/p/w500/notld-poster.jpg')
    expect(results.find((r) => r.artworkType === 'movie-backdrop')?.backdropUrl).toBe('https://image.tmdb.org/t/p/w1280/notld-backdrop.jpg')
    expect(results[0]?.confidence).toBe(1.0)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('falls back from TMDB to TVmaze when TMDB returns no series match', async () => {
    saveMetadataConfig({
      ...DEFAULT_METADATA_CONFIG,
      tmdbEnabled: true,
      tmdbApiKey: 'test-tmdb-key',
      tvmazeEnabled: true,
      seriesProviderPriority: ['tmdb', 'tvmaze', 'tvdb'],
    })

    const spy = vi.spyOn(native, 'fetchMetadata')
      // TMDB search/tv returns empty
      .mockResolvedValueOnce(JSON.stringify({ results: [] }))
      // TVmaze search/shows returns match
      .mockResolvedValueOnce(
        JSON.stringify([
          {
            score: 1.0,
            show: {
              id: 4378,
              name: 'Bonanza',
              premiered: '1959-09-12',
              image: { original: 'https://static.tvmaze.com/uploads/images/original_untouched/20/51664.jpg' },
              externals: { imdb: 'tt0052451' },
            },
          },
        ]),
      )
      // TVmaze /shows/4378/images returns landscape background
      .mockResolvedValueOnce(
        JSON.stringify([
          {
            type: 'background',
            main: true,
            resolutions: {
              original: { url: 'https://static.tvmaze.com/uploads/images/original_untouched/328/821884.jpg' },
            },
          },
        ]),
      )

    const results = await searchSeriesMetadata('Bonanza', 1959)
    expect(results.some((r) => r.provider === 'tvmaze' && r.artworkType === 'series-poster')).toBe(true)
    expect(results.some((r) => r.provider === 'tvmaze' && r.artworkType === 'series-backdrop')).toBe(true)
    spy.mockRestore()
  })

  it('respects configured seriesProviderPriority (TVmaze before TMDB)', async () => {
    saveMetadataConfig({
      ...DEFAULT_METADATA_CONFIG,
      tmdbEnabled: true,
      tmdbApiKey: 'test-tmdb-key',
      tvmazeEnabled: true,
      seriesProviderPriority: ['tvmaze', 'tmdb', 'tvdb'],
    })

    const spy = vi.spyOn(native, 'fetchMetadata')
      // TVmaze lookup by IMDb
      .mockResolvedValueOnce(
        JSON.stringify({
          id: 4378,
          name: 'Bonanza',
          premiered: '1959-09-12',
          image: { original: 'https://static.tvmaze.com/uploads/images/original_untouched/20/51664.jpg' },
          externals: { imdb: 'tt0052451' },
        }),
      )
      // TVmaze /shows/4378/images
      .mockResolvedValueOnce(
        JSON.stringify([
          {
            type: 'background',
            main: true,
            resolutions: {
              original: { url: 'https://static.tvmaze.com/uploads/images/original_untouched/328/821884.jpg' },
            },
          },
        ]),
      )

    const results = await searchSeriesMetadata('Bonanza', 1959, { imdbId: 'tt0052451' })
    expect(results[0]?.provider).toBe('tvmaze')
    expect(results).toHaveLength(2)
    // TMDB was never called because TVmaze satisfied both poster and backdrop
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('resolves rich series details including season posters and episode stills from TVmaze', async () => {
    saveMetadataConfig({
      ...DEFAULT_METADATA_CONFIG,
      tvmazeEnabled: true,
    })

    const spy = vi.spyOn(native, 'fetchMetadata').mockImplementation(async (url) => {
      if (url.includes('/lookup/shows')) {
        return JSON.stringify({ id: 2139, name: 'The Beverly Hillbillies', premiered: '1962-09-26', image: { original: 'https://static.tvmaze.com/poster.jpg' } })
      }
      if (url.includes('/shows/2139/images')) {
        return JSON.stringify([{ type: 'background', resolutions: { original: { url: 'https://static.tvmaze.com/bg.jpg' } } }])
      }
      if (url.includes('/shows/2139/seasons')) {
        return JSON.stringify([{ number: 1, name: 'Season 1', episodeOrder: 36, image: { original: 'https://static.tvmaze.com/s1.jpg' } }])
      }
      if (url.includes('/shows/2139/episodes')) {
        return JSON.stringify([{ id: 1001, season: 1, number: 1, name: 'The Clampetts Strike Oil', image: { original: 'https://static.tvmaze.com/ep1.jpg' } }])
      }
      if (url.includes('/shows/2139?embed=cast')) {
        return JSON.stringify({
          id: 2139,
          name: 'The Beverly Hillbillies',
          premiered: '1962-09-26',
          genres: ['Comedy'],
          network: { name: 'CBS' },
          image: { original: 'https://static.tvmaze.com/poster.jpg' },
          _embedded: { cast: [{ person: { name: 'Buddy Ebsen' } }] },
        })
      }
      return null
    })

    const details = await resolveRichSeriesDetails({ title: 'The Beverly Hillbillies', imdbId: 'tt0055662' })
    expect(details).not.toBeNull()
    expect(details?.backdropUrl).toBe('https://static.tvmaze.com/bg.jpg')
    expect(details?.seasons[0]?.posterUrl).toBe('https://static.tvmaze.com/s1.jpg')
    expect(details?.seasons[0]?.episodes[0]?.stillUrl).toBe('https://static.tvmaze.com/ep1.jpg')

    // Cache persistence into artworkEngine populates season & episode artwork automatically
    artworkEngine.setMetadataDetails('series:beverly-hillbillies', details!)
    const cached = artworkEngine.getMetadataDetails('series:beverly-hillbillies')
    expect(cached?.title).toBe('The Beverly Hillbillies')

    const seasonArt = resolveArtwork({
      contentId: 'series:beverly-hillbillies',
      title: 'The Beverly Hillbillies - Season 1',
      type: 'season-artwork',
      seasonNumber: 1,
    })
    expect(seasonArt.src).toBe('https://static.tvmaze.com/s1.jpg')

    const epArt = resolveArtwork({
      contentId: 'beverly-hillbillies',
      title: 'The Beverly Hillbillies S1E1',
      type: 'episode-still',
      seasonNumber: 1,
      episodeNumber: 1,
    })
    expect(epArt.src).toBe('https://static.tvmaze.com/ep1.jpg')
    spy.mockRestore()
  })

  it('enforces local-first, metadata-first, provider-first, and preserves custom user overrides', () => {
    // 1. Local artwork wins under default local-first
    saveMetadataConfig({ ...DEFAULT_METADATA_CONFIG, artworkSourcePreference: 'local-first' })
    const localRes = resolveArtwork({
      contentId: 'local-movie:1',
      title: 'My Home Film',
      type: 'movie-poster',
      localArt: 'data:image/jpeg;base64,LOCAL',
      providerArt: 'https://provider.example/poster.jpg',
    })
    expect(localRes.provider).toBe('local')
    expect(localRes.src).toBe('data:image/jpeg;base64,LOCAL')

    // 2. Register external metadata artwork
    artworkEngine.registerArtwork({
      id: 'movie-poster:local-movie:1',
      contentId: 'local-movie:1',
      artworkType: 'movie-poster',
      title: 'My Home Film',
      sourceUrl: 'https://image.tmdb.org/t/p/w500/enriched.jpg',
      sourceProvider: 'tmdb',
      aspectRatio: '2:3',
      orientation: 'portrait',
      retrievalTime: Date.now(),
      verificationStatus: 'verified',
      confidence: 0.95,
      cacheKey: 'movie-poster:local-movie:1',
    })

    // Under local-first, local still beats external metadata
    const stillLocal = resolveArtwork({
      contentId: 'local-movie:1',
      title: 'My Home Film',
      type: 'movie-poster',
      localArt: 'data:image/jpeg;base64,LOCAL',
    })
    expect(stillLocal.provider).toBe('local')

    // Under metadata-first, TMDB beats local & provider
    saveMetadataConfig({ ...DEFAULT_METADATA_CONFIG, artworkSourcePreference: 'metadata-first' })
    const metaFirst = resolveArtwork({
      contentId: 'local-movie:1',
      title: 'My Home Film',
      type: 'movie-poster',
      localArt: 'data:image/jpeg;base64,LOCAL',
      providerArt: 'https://provider.example/poster.jpg',
    })
    expect(metaFirst.provider).toBe('metadata')
    expect(metaFirst.src).toBe('https://image.tmdb.org/t/p/w500/enriched.jpg')

    // 3. User custom artwork ALWAYS wins regardless of preference
    saveCustomArtwork({
      contentId: 'local-movie:1',
      title: 'My Home Film',
      artworkType: 'movie-poster',
      aspectRatio: '2:3',
      dataUrl: 'data:image/png;base64,USER_CUSTOM',
      fileName: 'custom.png',
      fileSize: 1024,
      width: 400,
      height: 600,
      mimeType: 'image/png',
    })
    const customWin = resolveArtwork({
      contentId: 'local-movie:1',
      title: 'My Home Film',
      type: 'movie-poster',
      localArt: 'data:image/jpeg;base64,LOCAL',
      providerArt: 'https://provider.example/poster.jpg',
    })
    expect(customWin.provider).toBe('custom')
    expect(customWin.src).toBe('data:image/png;base64,USER_CUSTOM')
  })

  it('verifies all Open Catalogue movies have genuine artwork URLs and IMDb IDs, and no copyrighted series are bundled', () => {
    expect(OPEN_MOVIES.length).toBeGreaterThanOrEqual(8)
    for (const m of OPEN_MOVIES) {
      expect(m.imdbId).toMatch(/^tt\d+$/)
      expect(m.posterUrl || m.art).toMatch(/^https:\/\//)
    }
    expect(OPEN_SERIES.length).toBe(0)
  })

  it('tracks playback yielding state in artworkEngine', () => {
    expect(artworkEngine.isPlaybackActive()).toBe(false)
    artworkEngine.setPlaybackActive(true)
    expect(artworkEngine.isPlaybackActive()).toBe(true)
    artworkEngine.setPlaybackActive(false)
    expect(artworkEngine.isPlaybackActive()).toBe(false)
  })

  it('verifies tmdbProvider and tvdbProvider and tvmazeProvider stay quiet when disabled', async () => {
    saveMetadataConfig({ ...DEFAULT_METADATA_CONFIG })
    expect(loadMetadataConfig().tvdbEnabled).toBe(false)
    expect(await tmdbProvider.findByExternalId('tt0063350')).toEqual([])
    expect(await tvmazeProvider.lookupByExternalId({ imdb: 'tt0055662' })).toEqual([])
    expect(await tvdbProvider.searchSeries('Bonanza')).toEqual([])
    expect(await tvdbProvider.searchMovie('Charade')).toEqual([])
    expect(await resolveRichMovieDetails({ title: 'Charade', year: 1963 })).toBeNull()
  })
})

describe('Artwork Screen Integration Across Application Routes', () => {
  beforeEach(() => {
    localStorage.clear()
    clearCustomArtworksForTesting()
  })

  it('renders genuine artwork across Home, Movies, Series, Detail pages, Search, Library, and Live TV', () => {
    const homeHtml = wrap(<Home />, '/')
    expect(homeHtml).toContain('home-hero-art')
    expect(homeHtml).toContain('/art/')

    const moviesHtml = wrap(<Movies />, '/movies')
    expect(moviesHtml).toContain('streaming-hero')
    expect(moviesHtml).toContain('/art/')

    const seriesHtml = wrap(<SeriesBrowse />, '/series')
    expect(seriesHtml).toContain('streaming-hero')
    expect(seriesHtml).toContain('/art/')

    const movieDetailHtml = wrap(
      <Routes>
        <Route path="/movies/:id" element={<MovieDetail />} />
      </Routes>,
      '/movies/harbour-lights',
    )
    expect(movieDetailHtml).toContain('detail-backdrop')
    expect(movieDetailHtml).toContain('detail-hero-poster-wrap')
    expect(movieDetailHtml).toContain('/art/harbour-lights.jpg')

    const seriesDetailHtml = wrap(
      <Routes>
        <Route path="/series/:id" element={<SeriesDetail />} />
      </Routes>,
      '/series/ninth-ward',
    )
    expect(seriesDetailHtml).toContain('detail-backdrop')
    expect(seriesDetailHtml).toContain('detail-hero-poster-wrap')
    expect(seriesDetailHtml).toContain('season-poster-strip')

    const searchHtml = wrap(<Search />, '/search?q=Harbour')
    expect(searchHtml).toContain('Harbour Lights')
    expect(searchHtml).toContain('/art/harbour-lights.jpg')

    const libraryHtml = wrap(<Library />, '/library')
    expect(libraryHtml).toContain('Library')

    const liveHtml = wrap(<LiveTV />, '/live')
    expect(liveHtml).toContain('channel-mark')
  })
})
