import { describe, it, expect } from 'vitest'
import {
  scoreMatrixItem,
  executeMatrixSearch,
  normalizeSearchString,
  type MatrixItem,
} from './globalSearchMatrix'

const mockItems: MatrixItem[] = [
  {
    id: 'ch-1',
    ref: 'channel:bbc-one',
    title: 'BBC One HD',
    cleanTitle: 'BBC One',
    mediaType: 'channel',
    genres: ['General', 'News'],
    resolution: 'hd',
    to: '/live?channel=ch-1',
    subText: 'Channel 101',
    isFavourite: true,
  },
  {
    id: 'm-1',
    ref: 'film:inception',
    title: 'Inception',
    cleanTitle: 'Inception',
    mediaType: 'film',
    genres: ['Sci-Fi', 'Action'],
    year: 2010,
    rating: 8.8,
    resolution: '4k',
    watchedStatus: 'watched',
    to: '/movies/inception',
    subText: '2010 · Sci-Fi',
    overview: 'A thief who steals corporate secrets through dream-sharing technology.',
  },
  {
    id: 's-1',
    ref: 'series:severance',
    title: 'Severance',
    cleanTitle: 'Severance',
    mediaType: 'series',
    genres: ['Sci-Fi', 'Mystery'],
    year: 2022,
    rating: 8.7,
    resolution: '4k',
    watchedStatus: 'in-progress',
    to: '/series/severance',
    subText: '2022 · 2 Seasons',
    overview: 'Mark leads a team of office workers whose memories have been surgically divided.',
  },
  {
    id: 'ep-1',
    ref: 'episode:severance-s1e1',
    title: 'Good News About Hell',
    cleanTitle: 'Good News About Hell',
    mediaType: 'episode',
    genres: ['Mystery'],
    year: 2022,
    to: '/player?ref=episode:severance-s1e1',
    subText: 'Severance S1 E1',
  },
]

describe('globalSearchMatrix', () => {
  it('normalizes accents and whitespace in search queries', () => {
    expect(normalizeSearchString('  Café  ')).toBe('cafe')
    expect(normalizeSearchString('POKÉMON')).toBe('pokemon')
  })

  it('scores exact and starts-with matches highest', () => {
    const inception = mockItems[1]!
    const exactScore = scoreMatrixItem(inception, 'inception')
    const startScore = scoreMatrixItem(inception, 'incep')
    const genreScore = scoreMatrixItem(inception, 'sci-fi')
    const overviewScore = scoreMatrixItem(inception, 'dream')

    expect(exactScore).toBeGreaterThan(startScore)
    expect(startScore).toBeGreaterThan(genreScore)
    expect(genreScore).toBeGreaterThan(overviewScore)
  })

  it('filters by mediaType correctly', () => {
    const results = executeMatrixSearch(mockItems, {
      query: 's',
      mediaType: 'film',
    })

    expect(results.films.length).toBeGreaterThan(0)
    expect(results.channels.length).toBe(0)
    expect(results.series.length).toBe(0)
  })

  it('filters by resolution (4K) and minimum rating', () => {
    const results = executeMatrixSearch(mockItems, {
      query: '',
      resolution: '4k',
      minRating: 8.7,
    })

    expect(results.totalMatches).toBe(2)
    const titles = [...results.films, ...results.series].map((i) => i.title)
    expect(titles).toContain('Inception')
    expect(titles).toContain('Severance')
  })

  it('filters by watchedStatus', () => {
    const results = executeMatrixSearch(mockItems, {
      query: '',
      watchedStatus: 'watched',
    })

    expect(results.totalMatches).toBe(1)
    expect(results.films[0]?.title).toBe('Inception')
  })

  it('filters by favouriteOnly', () => {
    const results = executeMatrixSearch(mockItems, {
      query: '',
      favouriteOnly: true,
    })

    expect(results.totalMatches).toBe(1)
    expect(results.channels[0]?.title).toBe('BBC One HD')
  })
})
