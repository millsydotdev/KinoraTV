// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  DEFAULT_METADATA_CONFIG,
  METADATA_ATTRIBUTIONS,
  clearMetadataCredentials,
  loadMetadataConfig,
  saveMetadataConfig,
  searchEpisodeStill,
  searchMovieMetadata,
  searchSeriesMetadata,
  testProviderConnection,
  tmdbProvider,
  tvmazeProvider,
} from './metadataProviders'
import * as native from '../lib/native'

describe('Metadata Providers & Privacy Guards', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to all providers disabled with zero credentials stored', () => {
    const config = loadMetadataConfig()
    expect(config.tmdbEnabled).toBe(false)
    expect(config.tvmazeEnabled).toBe(false)
    expect(config.tmdbApiKey).toBe('')
    expect(config.autoEnrichEpg).toBe(false)
  })

  it('emits zero network calls and returns empty results when providers are disabled', async () => {
    saveMetadataConfig({
      ...DEFAULT_METADATA_CONFIG,
      tmdbEnabled: false,
      tvmazeEnabled: false,
    })

    const movies = await searchMovieMetadata('Dune', 2021)
    expect(movies).toEqual([])

    const series = await searchSeriesMetadata('Doctor Who', 2005)
    expect(series).toEqual([])

    const still = await searchEpisodeStill('Doctor Who', 1, 1)
    expect(still).toBeNull()
  })

  it('persists and loads metadata configuration correctly', () => {
    saveMetadataConfig({
      tmdbEnabled: true,
      tmdbApiKey: 'test-api-key-12345',
      tvmazeEnabled: true,
      autoEnrichEpg: true,
      preferHighResPosters: true,
    })

    const loaded = loadMetadataConfig()
    expect(loaded.tmdbEnabled).toBe(true)
    expect(loaded.tmdbApiKey).toBe('test-api-key-12345')
    expect(loaded.tvmazeEnabled).toBe(true)
    expect(loaded.autoEnrichEpg).toBe(true)
  })

  it('revokes credentials and clears keys on demand', () => {
    saveMetadataConfig({
      tmdbEnabled: true,
      tmdbApiKey: 'confidential-token-999',
      tvmazeEnabled: true,
      autoEnrichEpg: false,
      preferHighResPosters: true,
    })

    clearMetadataCredentials()

    const loaded = loadMetadataConfig()
    expect(loaded.tmdbApiKey).toBe('')
    expect(loaded.tmdbEnabled).toBe(false)
    expect(loaded.tvmazeEnabled).toBe(true) // TVmaze requires no credentials
  })

  it('provides mandatory attribution and licensing notices for both providers', () => {
    expect(METADATA_ATTRIBUTIONS.tmdb.attributionText).toContain('This product uses the TMDB API')
    expect(METADATA_ATTRIBUTIONS.tmdb.privacyNote).toContain('Kinora never shares playlist streams')

    expect(METADATA_ATTRIBUTIONS.tvmaze.attributionText).toContain('CC BY-SA 4.0')
    expect(METADATA_ATTRIBUTIONS.tvmaze.licensing).toContain('Creative Commons')
  })

  it('fails TMDB connection test safely when API key is empty', async () => {
    const report = await testProviderConnection('tmdb', '')
    expect(report.ok).toBe(false)
    expect(report.message).toContain('TMDB API key is missing')
  })

  it('refuses movie, series, and season detail lookups when providers are disabled', async () => {
    saveMetadataConfig({
      ...DEFAULT_METADATA_CONFIG,
      tmdbEnabled: false,
      tvmazeEnabled: false,
    })

    const movieDetails = await tmdbProvider.getMovieDetails(550)
    expect(movieDetails).toBeNull()

    const seriesDetails = await tmdbProvider.getSeriesDetails(1399)
    expect(seriesDetails).toBeNull()

    const seasonDetails = await tmdbProvider.getSeasonDetails(1399, 1)
    expect(seasonDetails).toBeNull()

    const tvmazeShow = await tvmazeProvider.getSeriesDetails(82)
    expect(tvmazeShow).toBeNull()

    const tvmazeEpisodes = await tvmazeProvider.getSeriesEpisodes(82)
    expect(tvmazeEpisodes).toEqual([])
  })

  it('parses full movie details from TMDB payload when enabled', async () => {
    saveMetadataConfig({
      ...DEFAULT_METADATA_CONFIG,
      tmdbEnabled: true,
      tmdbApiKey: 'valid-test-key-123',
    })

    const mockTmdbMovie = {
      id: 550,
      title: 'Fight Club',
      original_title: 'Fight Club',
      release_date: '1999-10-15',
      runtime: 139,
      overview: 'A ticking-time-bomb insomniac and a slippery soap salesman...',
      genres: [{ id: 18, name: 'Drama' }, { id: 53, name: 'Thriller' }],
      vote_average: 8.4,
      poster_path: '/poster.jpg',
      backdrop_path: '/backdrop.jpg',
      status: 'Released',
      credits: {
        cast: [{ name: 'Brad Pitt' }, { name: 'Edward Norton' }],
        crew: [{ job: 'Director', name: 'David Fincher' }],
      },
      external_ids: {
        imdb_id: 'tt0137523',
      },
    }

    const spy = vi.spyOn(native, 'fetchMetadata').mockResolvedValueOnce(JSON.stringify(mockTmdbMovie))

    const details = await tmdbProvider.getMovieDetails(550)
    expect(details).not.toBeNull()
    expect(details?.title).toBe('Fight Club')
    expect(details?.originalTitle).toBe('Fight Club')
    expect(details?.year).toBe(1999)
    expect(details?.runtime).toBe(139)
    expect(details?.director).toBe('David Fincher')
    expect(details?.genres).toEqual(['Drama', 'Thriller'])
    expect(details?.cast).toEqual(['Brad Pitt', 'Edward Norton'])
    expect(details?.imdbId).toBe('tt0137523')
    expect(details?.posterUrl).toBe('https://image.tmdb.org/t/p/w500/poster.jpg')
    expect(details?.backdropUrl).toBe('https://image.tmdb.org/t/p/w1280/backdrop.jpg')

    spy.mockRestore()
  })

  it('parses TV series details and episodes from TVmaze when enabled', async () => {
    saveMetadataConfig({
      ...DEFAULT_METADATA_CONFIG,
      tvmazeEnabled: true,
    })

    const mockShow = {
      id: 82,
      name: 'Game of Thrones',
      premiered: '2011-04-17',
      summary: '<p>Seven noble families fight for control of the mythical land of Westeros.</p>',
      genres: ['Drama', 'Adventure', 'Fantasy'],
      rating: { average: 9.3 },
      network: { name: 'HBO' },
      image: { original: 'https://static.tvmaze.com/uploads/images/original_untouched/1/498.jpg' },
      externals: { imdb: 'tt0944947', thetvdb: 121361 },
      _embedded: {
        cast: [{ person: { name: 'Peter Dinklage' } }, { person: { name: 'Emilia Clarke' } }],
      },
    }

    const mockEpisodes = [
      {
        id: 4952,
        season: 1,
        number: 1,
        name: 'Winter Is Coming',
        airdate: '2011-04-17',
        runtime: 62,
        summary: '<p>Lord Eddard Stark is asked by King Robert Baratheon...</p>',
        image: { original: 'https://static.tvmaze.com/uploads/images/original_untouched/1/499.jpg' },
      },
    ]

    const spy = vi.spyOn(native, 'fetchMetadata')
      .mockResolvedValueOnce(JSON.stringify(mockShow))
      .mockResolvedValueOnce(JSON.stringify(mockEpisodes))

    const showDetails = await tvmazeProvider.getSeriesDetails(82)
    expect(showDetails).not.toBeNull()
    expect(showDetails?.title).toBe('Game of Thrones')
    expect(showDetails?.year).toBe(2011)
    expect(showDetails?.network).toBe('HBO')
    expect(showDetails?.overview).toContain('Seven noble families fight')
    expect(showDetails?.cast).toEqual(['Peter Dinklage', 'Emilia Clarke'])
    expect(showDetails?.imdbId).toBe('tt0944947')

    const episodes = await tvmazeProvider.getSeriesEpisodes(82)
    expect(episodes).toHaveLength(1)
    expect(episodes[0]?.title).toBe('Winter Is Coming')
    expect(episodes[0]?.seasonNumber).toBe(1)
    expect(episodes[0]?.episodeNumber).toBe(1)
    expect(episodes[0]?.runtime).toBe(62)
    expect(episodes[0]?.stillUrl).toBe('https://static.tvmaze.com/uploads/images/original_untouched/1/499.jpg')

    spy.mockRestore()
  })
})
