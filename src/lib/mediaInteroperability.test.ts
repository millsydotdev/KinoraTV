// mediaInteroperability.test.ts - Multi-source deduplication, variant preservation, and outage resilience tests.
// Tests cross-source interoperability between M3U, Xtream, Local Media, Media Server, and Stalker.
// Strictly adheres to project typography standards: zero em-dashes across all code and comments.

import { describe, it, expect } from 'vitest'
import {
  aggregateUniversalMedia,
  removeSourceFromUniversalMedia,
  reconcileResilientLibrary,
  type UniversalMediaInput,
} from './vodAggregation'

describe('mediaInteroperability', () => {
  const sampleItems: UniversalMediaInput[] = [
    {
      id: 'xtream-movie-101',
      sourceId: 'xtream-primary',
      sourceName: 'Xtream Platinum',
      sourceKind: 'xtream',
      title: 'Blade Runner 2049 (2017) [1080p]',
      year: 2017,
      posterUrl: 'https://cdn.example/posters/br2049.jpg',
      streamUrl: 'xtream://xtream-primary/movie/101?ext=mp4',
      mediaKind: 'movie',
      plot: 'A young blade runner unearths a long-buried secret.',
    },
    {
      id: 'jellyfin-item-456',
      sourceId: 'jellyfin-home',
      sourceName: 'Home Jellyfin',
      sourceKind: 'media-server',
      title: 'Blade Runner 2049 (2017) [4K UHD]',
      year: 2017,
      posterUrl: 'http://192.168.1.100:8096/Items/456/Images/Primary',
      backdropUrl: 'http://192.168.1.100:8096/Items/456/Images/Backdrop',
      streamUrl: 'http://192.168.1.100:8096/Videos/456/stream.mp4',
      mediaKind: 'movie',
      plot: 'Thirty years after the events of the first film, a new blade runner...',
    },
    {
      id: 'local-file-789',
      sourceId: 'local-storage',
      sourceName: 'USB Media',
      sourceKind: 'local-media',
      title: 'Blade Runner 2049 2017 1080p BluRay',
      year: 2017,
      posterUrl: null,
      streamUrl: 'file:///media/usb/Movies/Blade Runner 2049 (2017).mkv',
      mediaKind: 'movie',
    },
    {
      id: 'stalker-vod-999',
      sourceId: 'stalker-portal',
      sourceName: 'Ministra VOD',
      sourceKind: 'stalker',
      title: 'Dune Part Two (2024) [4K]',
      year: 2024,
      posterUrl: 'http://portal.example/covers/dune2.jpg',
      streamUrl: 'stalker://ffrt%20http%3A%2F%2Fstream.example%2Fdune2.mp4',
      mediaKind: 'movie',
    },
  ]

  it('aggregates multi-source media into canonical titles with multiple stream variants', () => {
    const aggregated = aggregateUniversalMedia(sampleItems)

    expect(aggregated).toHaveLength(2)

    const br2049 = aggregated.find((m) => m.title === 'Blade Runner 2049')
    expect(br2049).toBeDefined()
    expect(br2049?.year).toBe(2017)
    expect(br2049?.totalSources).toBe(3)
    expect(br2049?.variants).toHaveLength(3)

    // Check variants from each source kind
    const sourceKinds = br2049?.variants.map((v) => v.sourceKind)
    expect(sourceKinds).toContain('xtream')
    expect(sourceKinds).toContain('media-server')
    expect(sourceKinds).toContain('local-media')

    // Highest quality variant preserved
    const qualities = br2049?.variants.map((v) => v.quality)
    expect(qualities).toContain('4K')
    expect(qualities).toContain('1080p')

    // Stalker single-source title
    const dune = aggregated.find((m) => m.title.includes('Dune Part Two'))
    expect(dune).toBeDefined()
    expect(dune?.totalSources).toBe(1)
    expect(dune?.variants[0]?.sourceKind).toBe('stalker')
  })

  it('safely removes a source variant without deleting the canonical title if other sources exist', () => {
    const aggregated = aggregateUniversalMedia(sampleItems)

    // Remove the Xtream source
    const afterXtreamRemoval = removeSourceFromUniversalMedia(aggregated, 'xtream-primary')

    expect(afterXtreamRemoval).toHaveLength(2)
    const br2049 = afterXtreamRemoval.find((m) => m.title === 'Blade Runner 2049')
    expect(br2049).toBeDefined()
    expect(br2049?.totalSources).toBe(2)
    expect(br2049?.variants).toHaveLength(2)
    expect(br2049?.variants.some((v) => v.sourceId === 'xtream-primary')).toBe(false)
  })

  it('drops a canonical title only when all of its source variants are removed', () => {
    const aggregated = aggregateUniversalMedia(sampleItems)

    // Removing stalker-portal should remove Dune completely because only stalker provided it
    const afterStalkerRemoval = removeSourceFromUniversalMedia(aggregated, 'stalker-portal')

    expect(afterStalkerRemoval).toHaveLength(1)
    expect(afterStalkerRemoval[0]?.title).toBe('Blade Runner 2049')
  })

  it('safeguards cached library entries against source outages or network failures', () => {
    const initialCache: UniversalMediaInput[] = [...sampleItems]

    // Source 'jellyfin-home' suffers an outage and returns empty array on refresh
    const refreshedCache = reconcileResilientLibrary(
      initialCache,
      [],
      'jellyfin-home',
      false, // fetch failed
    )

    // Items from jellyfin-home must still exist in the cache
    expect(refreshedCache).toHaveLength(4)
    expect(refreshedCache.some((item) => item.sourceId === 'jellyfin-home')).toBe(true)

    // When fetch succeeds with updated items, cache replaces that source cleanly
    const updatedJellyfin: UniversalMediaInput[] = [
      {
        id: 'jellyfin-item-456',
        sourceId: 'jellyfin-home',
        sourceName: 'Home Jellyfin',
        sourceKind: 'media-server',
        title: 'Blade Runner 2049 (2017) [4K UHD]',
        year: 2017,
        posterUrl: 'http://192.168.1.100:8096/Items/456/Images/Primary',
        streamUrl: 'http://192.168.1.100:8096/Videos/456/stream.mp4',
        mediaKind: 'movie',
      },
    ]

    const successfulRefresh = reconcileResilientLibrary(
      initialCache,
      updatedJellyfin,
      'jellyfin-home',
      true, // fetch succeeded
    )

    expect(successfulRefresh).toHaveLength(4)
  })
})
