// Unit tests for VOD and Series multi-source aggregation engine.
// Strictly adheres to typography standards: zero em-dashes.

import { describe, expect, it } from 'vitest'
import {
  aggregateVodTitles,
  canonicalVodKey,
  findAlternateVodVariants,
  normalizeVodTitle,
} from './vodAggregation'
import type { XtreamTitle } from '../data/types'

describe('normalizeVodTitle', () => {
  it('cleans raw provider titles and extracts release year and quality level', () => {
    const res1 = normalizeVodTitle('Dune: Part Two (2024) [4K UHD]', null)
    expect(res1.cleanTitle).toBe('Dune: Part Two')
    expect(res1.year).toBe(2024)
    expect(res1.quality).toBe('4K')

    const res2 = normalizeVodTitle('EN | Oppenheimer 2023 FHD', null)
    expect(res2.cleanTitle).toBe('Oppenheimer')
    expect(res2.year).toBe(2023)
    expect(res2.quality).toBe('1080p')

    const res3 = normalizeVodTitle('Gladiator (2000) [SD]', 2000)
    expect(res3.cleanTitle).toBe('Gladiator')
    expect(res3.year).toBe(2000)
    expect(res3.quality).toBe('SD')
  })
})

describe('canonicalVodKey', () => {
  it('creates identical canonical keys regardless of punctuation and casing', () => {
    const key1 = canonicalVodKey('Dune: Part Two', 2024)
    const key2 = canonicalVodKey('dune part two', 2024)
    expect(key1).toBe('duneparttwo:2024')
    expect(key1).toBe(key2)
  })
})

describe('aggregateVodTitles', () => {
  const mockTitles: XtreamTitle[] = [
    {
      id: '101',
      name: 'Oppenheimer (2023) 1080p',
      sourceId: 'src-alpha',
      kind: 'movie',
      categoryId: '1',
      plot: 'The story of J. Robert Oppenheimer.',
      year: 2023,
      extension: 'mp4',
      artworkKey: 'art-opp',
    },
    {
      id: '202',
      name: 'Oppenheimer 2023 [4K UHD]',
      sourceId: 'src-beta',
      kind: 'movie',
      categoryId: '1',
      plot: 'Biographical drama of J. Robert Oppenheimer.',
      year: 2023,
      extension: 'mkv',
      artworkKey: 'art-opp-4k',
    },
    {
      id: '303',
      name: 'Interstellar (2014)',
      sourceId: 'src-alpha',
      kind: 'movie',
      categoryId: '2',
      plot: 'A team of explorers travel through a wormhole.',
      year: 2014,
      extension: 'mp4',
      artworkKey: 'art-int',
    },
  ]

  const sourceNames = {
    'src-alpha': 'FastIPTV UK',
    'src-beta': 'UltraStreams Europe',
  }

  it('aggregates multiple source entries of the same film into one card with variants', () => {
    const aggregated = aggregateVodTitles(mockTitles, sourceNames)
    expect(aggregated).toHaveLength(2)

    const oppenheimer = aggregated.find((t) => t.name === 'Oppenheimer')
    expect(oppenheimer).toBeDefined()
    expect(oppenheimer?.totalSources).toBe(2)
    expect(oppenheimer?.variants).toHaveLength(2)

    expect(oppenheimer?.variants[0]?.sourceName).toBe('FastIPTV UK')
    expect(oppenheimer?.variants[0]?.quality).toBe('1080p')
    expect(oppenheimer?.variants[1]?.sourceName).toBe('UltraStreams Europe')
    expect(oppenheimer?.variants[1]?.quality).toBe('4K')
  })
})

describe('findAlternateVodVariants', () => {
  const mockCatalogue: XtreamTitle[] = [
    {
      id: 'movie-1',
      name: 'Inception (2010) [1080p]',
      sourceId: 'src-1',
      kind: 'movie',
      categoryId: '1',
      plot: null,
      year: 2010,
      extension: 'mp4',
      artworkKey: 'art-1',
    },
    {
      id: 'movie-2',
      name: 'Inception 2010 4K UHD',
      sourceId: 'src-2',
      kind: 'movie',
      categoryId: '1',
      plot: null,
      year: 2010,
      extension: 'mkv',
      artworkKey: 'art-2',
    },
  ]

  it('discovers all stream options across active sources formatted for the player', () => {
    const variants = findAlternateVodVariants(
      'Inception',
      2010,
      mockCatalogue,
      { 'src-1': 'Primary Server', 'src-2': 'Backup Mirror' },
    )

    expect(variants).toHaveLength(2)
    expect(variants[0]?.name).toBe('Primary Server - 1080p')
    expect(variants[0]?.streamUrl).toBe('xtream://src-1/movie/movie-1?ext=mp4')
    expect(variants[1]?.name).toBe('Backup Mirror - 4K')
    expect(variants[1]?.streamUrl).toBe('xtream://src-2/movie/movie-2?ext=mkv')
  })
})
