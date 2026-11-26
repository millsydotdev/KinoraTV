import { describe, expect, it } from 'vitest'
import {
  buildHomeFeed,
  formatRemainingTime,
  normalizeTitleForDedupe,
  getMediaDedupeKey,
  extractReleaseYear,
} from './homeFeed'
import { movies, series } from '../data/catalog'
import { channels } from '../data/channels'
import type { Movie, XtreamTitle } from '../data/types'

describe('homeFeed data preparation and deduplication pipeline', () => {
  it('formats remaining seconds cleanly', () => {
    expect(formatRemainingTime(60)).toBe('1m left')
    expect(formatRemainingTime(1320)).toBe('22m left')
    expect(formatRemainingTime(4320)).toBe('1h 12m left')
  })

  it('normalizes titles for case and punctuation insensitive deduplication', () => {
    expect(normalizeTitleForDedupe('Night of the Living Dead')).toBe('nightofthelivingdead')
    expect(normalizeTitleForDedupe('Charade (1963)')).toBe('charade1963')
    expect(normalizeTitleForDedupe('M - Eine Stadt sucht einen Mörder')).toBe('meinestadtsuchteinenmrder')
    expect(normalizeTitleForDedupe('')).toBe('')
    expect(normalizeTitleForDedupe('   ')).toBe('')
  })

  it('extracts release year accurately from title or explicit parameter', () => {
    expect(extractReleaseYear('Dune (2021)')).toBe('2021')
    expect(extractReleaseYear('Nosferatu', 1922)).toBe('1922')
    expect(extractReleaseYear('Classic Film', '1984')).toBe('1984')
    expect(extractReleaseYear('Untitled')).toBeUndefined()
  })

  it('generates compound deduplication keys that preserve different release years and editions', () => {
    // Different years of the same title are distinct
    const nosferatu1922 = getMediaDedupeKey('Nosferatu', 1922, 'movie')
    const nosferatu2024 = getMediaDedupeKey('Nosferatu', 2024, 'movie')
    expect(nosferatu1922).toBe('movie:nosferatu_1922')
    expect(nosferatu2024).toBe('movie:nosferatu_2024')
    expect(nosferatu1922).not.toBe(nosferatu2024)

    // Same movie from two providers (one with year in title, one with explicit year) match
    const duneTitle = getMediaDedupeKey('Dune (2021)', undefined, 'movie')
    const duneYear = getMediaDedupeKey('Dune', 2021, 'movie')
    expect(duneTitle).toBe('movie:dune_2021')
    expect(duneYear).toBe('movie:dune_2021')
    expect(duneTitle).toBe(duneYear)

    // Different editions are distinct
    const bladeRunner = getMediaDedupeKey('Blade Runner', 1982, 'movie')
    const bladeRunnerDC = getMediaDedupeKey("Blade Runner (Director's Cut)", 1992, 'movie')
    expect(bladeRunner).toBe('movie:bladerunner_1982')
    expect(bladeRunnerDC).toBe('movie:bladerunner_1992_directorscut')
    expect(bladeRunner).not.toBe(bladeRunnerDC)

    // Empty and whitespace titles produce safe empty strings
    expect(getMediaDedupeKey('', 2024, 'movie')).toBe('')
    expect(getMediaDedupeKey('   ', undefined, 'movie')).toBe('')
  })

  it('enforces canonical identifier hierarchy and prevents accidental merging', () => {
    // 1. Different providers supplying the same underlying film via canonical ID
    const providerA = getMediaDedupeKey('Dune', 2021, 'movie', {
      canonicalId: 'tmdb:438631',
      sourceId: 'xtream-1',
    })
    const providerB = getMediaDedupeKey('Dune Part One (2021)', undefined, 'movie', {
      canonicalId: 'tmdb:438631',
      sourceId: 'm3u-premium',
    })
    expect(providerA).toBe('canon:tmdb:438631')
    expect(providerB).toBe('canon:tmdb:438631')
    expect(providerA).toBe(providerB)

    // 2. Same title and year but different films (e.g. Pinocchio 2022 del Toro vs Zemeckis)
    const pinocchioDelToro = getMediaDedupeKey('Pinocchio', 2022, 'movie', {
      canonicalId: 'imdb:tt1488589',
    })
    const pinocchioDisney = getMediaDedupeKey('Pinocchio', 2022, 'movie', {
      canonicalId: 'imdb:tt4593060',
    })
    expect(pinocchioDelToro).toBe('canon:imdb:tt1488589')
    expect(pinocchioDisney).toBe('canon:imdb:tt4593060')
    expect(pinocchioDelToro).not.toBe(pinocchioDisney)

    // Fallback disambiguation via director when canonical ID is absent
    const pinocchioDirA = getMediaDedupeKey('Pinocchio', 2022, 'movie', {
      director: 'Guillermo del Toro',
    })
    const pinocchioDirB = getMediaDedupeKey('Pinocchio', 2022, 'movie', {
      director: 'Robert Zemeckis',
    })
    expect(pinocchioDirA).toContain('_dir:guillermodeltoro')
    expect(pinocchioDirB).toContain('_dir:robertzemeckis')
    expect(pinocchioDirA).not.toBe(pinocchioDirB)

    // 3. Remastered releases vs original
    const heatOrig = getMediaDedupeKey('Heat', 1995, 'movie')
    const heatRemaster = getMediaDedupeKey('Heat (4K Remaster)', 1995, 'movie')
    expect(heatOrig).toBe('movie:heat_1995')
    expect(heatRemaster).toBe('movie:heat_1995_4kremaster')
    expect(heatOrig).not.toBe(heatRemaster)

    // 4. Alternate cuts of the same film
    const apocFinalCut = getMediaDedupeKey('Apocalypse Now (Final Cut)', 1979, 'movie')
    const apocRedux = getMediaDedupeKey('Apocalypse Now (Redux)', 1979, 'movie')
    expect(apocFinalCut).toBe('movie:apocalypsenow_1979_finalcut')
    expect(apocRedux).toBe('movie:apocalypsenow_1979_redux')
    expect(apocFinalCut).not.toBe(apocRedux)

    // 5. Episodes belonging to the same series are distinguished by season and episode
    const ep1 = getMediaDedupeKey('Static', undefined, 'episode', { season: 1, episode: 1 })
    const ep2 = getMediaDedupeKey('Static', undefined, 'episode', { season: 1, episode: 2 })
    expect(ep1).toBe('episode:static_s1e1')
    expect(ep2).toBe('episode:static_s1e2')
    expect(ep1).not.toBe(ep2)

    // 6. Different source kinds with same base name are not merged
    const channelItem = getMediaDedupeKey('BBC One', undefined, 'channel')
    const movieItem = getMediaDedupeKey('BBC One', undefined, 'movie')
    expect(channelItem).toBe('channel:bbcone')
    expect(movieItem).toBe('movie:bbcone')
    expect(channelItem).not.toBe(movieItem)
  })

  it('builds a deduplicated feed in demo mode where titles do not repeat across rails', () => {
    const feed = buildHomeFeed({
      now: Date.now(),
      demoTitles: true,
      isKidsMode: false,
      library: {
        progress: {
          'movie:salt-meridian': { pos: 1200, dur: 7200, at: Date.now() },
        },
        history: [],
        favourites: [],
        watchlist: [],
        watched: [],
        reminders: [],
        collections: [],
        recentSearches: [],
      },
      channels: channels.slice(0, 10),
      findChannel: (id) => channels.find((c) => c.id === id),
      programmeAt: () => undefined,
      nextProgramme: () => undefined,
      allMovies: movies,
      allSeries: series,
      xtreamCatalogue: { movies: [], series: [] },
      mediaLibrary: { allResources: [], mySources: [] },
    })

    // Featured slides are generated
    expect(feed.featuredSlides.length).toBeGreaterThan(0)
    const featuredTitle = normalizeTitleForDedupe(feed.featuredSlides[0]!.title)

    // Continue watching contains the progress item
    expect(feed.continueWatching.length).toBe(1)
    expect(feed.continueWatching[0]!.title).toBe('The Salt Meridian')
    expect(feed.continueWatching[0]!.remainingFormatted).toBe('1h 40m left')

    // Movies rail does not contain Salt Meridian (since it was in continue watching)
    const movieTitles = feed.movies.map((m) => normalizeTitleForDedupe(m.title))
    expect(movieTitles).not.toContain('thesaltmeridian')

    // Master recommendations and movies rail do not overlap
    const recRefs = new Set(feed.masterRecommendations.map((r) => r.ref))
    for (const m of feed.movies) {
      expect(recRefs.has(m.ref)).toBe(false)
    }

    // Series rail has series items and does not contain the featured title
    expect(feed.series.length).toBeGreaterThan(0)
    const seriesTitles = feed.series.map((s) => normalizeTitleForDedupe(s.title))
    expect(seriesTitles).not.toContain(featuredTitle)
  })

  it('omits Continue Watching completely when there is no active playback progress', () => {
    const feed = buildHomeFeed({
      now: Date.now(),
      demoTitles: true,
      isKidsMode: false,
      library: {
        progress: {},
        history: [],
        favourites: [],
        watchlist: [],
        watched: [],
        reminders: [],
        collections: [],
        recentSearches: [],
      },
      channels: channels.slice(0, 5),
      findChannel: (id) => channels.find((c) => c.id === id),
      programmeAt: () => undefined,
      nextProgramme: () => undefined,
      allMovies: movies,
      allSeries: series,
      xtreamCatalogue: { movies: [], series: [] },
      mediaLibrary: { allResources: [], mySources: [] },
    })

    expect(feed.continueWatching).toEqual([])
  })

  it('collapses multiple in-progress episodes of the same series to the most recent in Continue Watching', () => {
    const now = Date.now()
    const feed = buildHomeFeed({
      now,
      demoTitles: true,
      isKidsMode: false,
      library: {
        progress: {
          'episode:kingsmoor/s1e1': { pos: 600, dur: 3600, at: now - 10000 },
          'episode:kingsmoor/s1e2': { pos: 1200, dur: 3600, at: now },
        },
        history: [],
        favourites: [],
        watchlist: [],
        watched: [],
        reminders: [],
        collections: [],
        recentSearches: [],
      },
      channels: channels.slice(0, 5),
      findChannel: (id) => channels.find((c) => c.id === id),
      programmeAt: () => undefined,
      nextProgramme: () => undefined,
      allMovies: movies,
      allSeries: series,
      xtreamCatalogue: { movies: [], series: [] },
      mediaLibrary: { allResources: [], mySources: [] },
    })

    // Only one episode of Kingsmoor appears in Continue Watching
    const kingsmoorEpisodes = feed.continueWatching.filter((item) => item.ref.includes('kingsmoor'))
    expect(kingsmoorEpisodes.length).toBe(1)
    expect(kingsmoorEpisodes[0]!.ref).toBe('episode:kingsmoor/s1e2')

    // Kingsmoor does not repeat in the Series rail
    const seriesRefs = feed.series.map((s) => s.ref)
    expect(seriesRefs).not.toContain('series:kingsmoor')
  })

  it('preserves same title with different release years in catalogue', () => {
    const customMovies: Movie[] = [
      {
        kind: 'movie',
        id: 'nosferatu-1922',
        title: 'Nosferatu',
        year: 1922,
        runtime: 94,
        genres: ['Horror'],
        certificate: 'PG',
        focus: 50,
        added: '2026-10-01',
        tagline: 'A symphony of horror',
        synopsis: 'Vampire Count Orlok expresses interest in a new residence.',
        art: '/art/silent-tide.jpg',
        audio: ['Silent'],
        subtitles: [],
      },
      {
        kind: 'movie',
        id: 'nosferatu-2024',
        title: 'Nosferatu',
        year: 2024,
        runtime: 132,
        genres: ['Horror'],
        certificate: '18',
        focus: 50,
        added: '2026-10-02',
        tagline: 'He is coming',
        synopsis: 'A gothic tale of obsession between a haunted young woman and a vampire.',
        art: '/art/harbour-lights.jpg',
        audio: ['English Atmos'],
        subtitles: [],
      },
    ]

    const feed = buildHomeFeed({
      now: Date.now(),
      demoTitles: true,
      isKidsMode: false,
      library: {
        progress: {},
        history: [],
        favourites: [],
        watchlist: [],
        watched: [],
        reminders: [],
        collections: [],
        recentSearches: [],
      },
      channels: [],
      findChannel: () => undefined,
      programmeAt: () => undefined,
      nextProgramme: () => undefined,
      allMovies: customMovies,
      allSeries: [],
      xtreamCatalogue: { movies: [], series: [] },
      mediaLibrary: { allResources: [], mySources: [] },
    })

    const foundTitles = feed.movies.filter((m) => m.title === 'Nosferatu')
    expect(foundTitles.length).toBe(2)
    expect(foundTitles.map((m) => m.year)).toEqual([1922, 2024])
  })

  it('deduplicates identical movie titles from multiple sources', () => {
    const xtreamMovies: XtreamTitle[] = [
      {
        id: '1',
        sourceId: 'src-1',
        kind: 'movie',
        name: 'Spotlight Feature',
        year: 2024,
        categoryId: '1',
        rating: 9.0,
        plot: null,
        extension: 'mp4',
        artworkKey: '',
      },
      {
        id: '101',
        sourceId: 'src-1',
        kind: 'movie',
        name: 'The Outpost',
        year: 2024,
        categoryId: '1',
        rating: 8.0,
        plot: null,
        extension: 'mp4',
        artworkKey: '',
      },
      {
        id: '202',
        sourceId: 'src-2',
        kind: 'movie',
        name: 'The Outpost',
        year: 2024,
        categoryId: '1',
        rating: 8.0,
        plot: null,
        extension: 'mp4',
        artworkKey: '',
      },
    ]

    const feed = buildHomeFeed({
      now: Date.now(),
      demoTitles: false,
      isKidsMode: false,
      library: {
        progress: {},
        history: [],
        favourites: [],
        watchlist: [],
        watched: [],
        reminders: [],
        collections: [],
        recentSearches: [],
      },
      channels: [],
      findChannel: () => undefined,
      programmeAt: () => undefined,
      nextProgramme: () => undefined,
      allMovies: [],
      allSeries: [],
      xtreamCatalogue: { movies: xtreamMovies, series: [] },
      mediaLibrary: { allResources: [], mySources: [] },
    })

    const outpostMovies = feed.movies.filter((m) => m.title === 'The Outpost')
    expect(outpostMovies.length).toBe(1)
  })

  it('handles empty source catalogues gracefully without errors', () => {
    const feed = buildHomeFeed({
      now: Date.now(),
      demoTitles: false,
      isKidsMode: false,
      library: {
        progress: {},
        history: [],
        favourites: [],
        watchlist: [],
        watched: [],
        reminders: [],
        collections: [],
        recentSearches: [],
      },
      channels: [],
      findChannel: () => undefined,
      programmeAt: () => undefined,
      nextProgramme: () => undefined,
      allMovies: [],
      allSeries: [],
      xtreamCatalogue: { movies: [], series: [] },
      mediaLibrary: { allResources: [], mySources: [] },
    })

    expect(feed.featuredSlides).toEqual([])
    expect(feed.continueWatching).toEqual([])
    expect(feed.liveChannels).toEqual([])
    expect(feed.movies).toEqual([])
    expect(feed.series).toEqual([])
    expect(feed.culturalVault).toEqual([])
    expect(feed.audioItems).toEqual([])
    expect(feed.favouriteChannels).toEqual([])
  })

  it('preserves distinct channels with similar names', () => {
    const testChannels = [
      { id: 'bbc-1-hd', name: 'BBC One HD', number: 1, categories: ['General'], group: 'General', mark: { text: 'BBC 1', tone: 'red' }, hd: true, logoUrl: '', streamUrl: '', sourceId: 'src-1', tvgId: 'bbc1.hd' },
      { id: 'bbc-1-lon', name: 'BBC One London', number: 2, categories: ['Regional'], group: 'Regional', mark: { text: 'BBC 1', tone: 'red' }, hd: false, logoUrl: '', streamUrl: '', sourceId: 'src-1', tvgId: 'bbc1.lon' },
      { id: 'bbc-2-hd', name: 'BBC Two HD', number: 3, categories: ['General'], group: 'General', mark: { text: 'BBC 2', tone: 'teal' }, hd: true, logoUrl: '', streamUrl: '', sourceId: 'src-1', tvgId: 'bbc2.hd' },
    ]

    const feed = buildHomeFeed({
      now: Date.now(),
      demoTitles: true,
      isKidsMode: false,
      library: {
        progress: {},
        history: [],
        favourites: [],
        watchlist: [],
        watched: [],
        reminders: [],
        collections: [],
        recentSearches: [],
      },
      channels: testChannels,
      findChannel: (id) => testChannels.find((c) => c.id === id),
      programmeAt: () => undefined,
      nextProgramme: () => undefined,
      allMovies: [],
      allSeries: [],
      xtreamCatalogue: { movies: [], series: [] },
      mediaLibrary: { allResources: [], mySources: [] },
    })

    expect(feed.liveChannels.length).toBe(3)
    const channelNames = feed.liveChannels.map((l) => l.channel.name)
    expect(channelNames).toContain('BBC One HD')
    expect(channelNames).toContain('BBC One London')
    expect(channelNames).toContain('BBC Two HD')
  })
})
