// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  canonicalizeTitle,
  scoreArtworkMatch,
  isGenuineArtwork,
  isGenericOrPromoGraphic,
  artworkEngine,
  type ArtworkRecord,
  type TrackedAuditArtworkType,
} from './artworkEngine'
import { DEFAULT_METADATA_CONFIG, saveMetadataConfig } from './metadataProviders'
import * as native from '../lib/native'
import type { Channel, Programme } from './types'

describe('Content Artwork Engine - Identity Resolution & Disambiguation', () => {
  it('normalises titles and strips resolution, feed, and quality tags', () => {
    const res1 = canonicalizeTitle('Dune: Part Two [4K] [UHD]')
    expect(res1.cleanTitle).toBe('Dune: Part Two')
    expect(res1.tags).toEqual(['4K', 'UHD'])

    const res2 = canonicalizeTitle('BBC News at Ten (HD) +1')
    expect(res2.cleanTitle).toBe('BBC News at Ten')
    expect(res2.tags).toEqual(['HD'])

    const res3 = canonicalizeTitle('The.Matrix.1999.[HEVC]')
    expect(res3.cleanTitle).toBe('The Matrix 1999')
    expect(res3.tags).toEqual(['HEVC'])
  })

  it('extracts release year enclosed in brackets or parentheses', () => {
    const res1 = canonicalizeTitle('Blade Runner (1982)')
    expect(res1.cleanTitle).toBe('Blade Runner')
    expect(res1.extractedYear).toBe(1982)

    const res2 = canonicalizeTitle('Solaris [2002] [FHD]')
    expect(res2.cleanTitle).toBe('Solaris')
    expect(res2.extractedYear).toBe(2002)
  })

  it('scores exact title and exact year matches with 1.0 confidence', () => {
    const score = scoreArtworkMatch('Harbour Lights', 2024, 'Harbour Lights', 2024)
    expect(score.confidence).toBe(1.0)
    expect(score.status).toBe('verified')
  })

  it('detects known remakes without year and rejects automatic association as ambiguous', () => {
    // "Solaris" has 1972 and 2002 productions; without year it must be flagged ambiguous
    const score = scoreArtworkMatch('Solaris', undefined, 'Solaris', 2002)
    expect(score.status).toBe('ambiguous')
    expect(score.confidence).toBeLessThan(0.60)
    expect(score.reason).toContain('multiple productions exist')
  })

  it('verifies known remake when year matches candidate correctly', () => {
    const score1972 = scoreArtworkMatch('Solaris', 1972, 'Solaris', 1972)
    expect(score1972.status).toBe('verified')
    expect(score1972.confidence).toBe(1.0)

    const score2002 = scoreArtworkMatch('Solaris', 2002, 'Solaris', 2002)
    expect(score2002.status).toBe('verified')
    expect(score2002.confidence).toBe(1.0)
  })

  it('rejects candidate match when query year differs from candidate year by multiple years', () => {
    const score = scoreArtworkMatch('The Thing', 1982, 'The Thing', 2011)
    expect(score.status).toBe('ambiguous')
    expect(score.confidence).toBeLessThan(0.60)
    expect(score.reason).toContain('Production year mismatch')
  })

  it('verifies non-remake exact titles without year with 0.85 confidence', () => {
    const score = scoreArtworkMatch('Uncut Gems', undefined, 'Uncut Gems', 2019)
    expect(score.status).toBe('verified')
    expect(score.confidence).toBe(0.85)
  })

  it('scores partial/subtitle match with 0.75 confidence', () => {
    const score = scoreArtworkMatch('Dune', 2021, 'Dune: Part One', 2021)
    expect(score.status).toBe('verified')
    expect(score.confidence).toBe(0.75)
  })

  it('rejects partial matches that lack word boundaries such as NCIS matching NCISverse', () => {
    const score = scoreArtworkMatch('NCIS', undefined, 'NCISverse: The First 1,000', 2024)
    expect(score.status).toBe('unresolved')
    expect(score.confidence).toBe(0.0)
  })

  it('marks subtitle/spin-off matches without matching release year as ambiguous', () => {
    const score = scoreArtworkMatch('NCIS', undefined, 'NCIS: Sydney', 2023)
    expect(score.status).toBe('ambiguous')
    expect(score.confidence).toBe(0.45)
  })

  it('detects generic category graphics and promotional cards with isGenericOrPromoGraphic', () => {
    expect(isGenericOrPromoGraphic('http://jiotv.catchup.cdn.jio.com/dare_images/shows/epgdata/fef7d9e050359f02bbc034eb3ecef417.jpg')).toBe(true)
    expect(isGenericOrPromoGraphic('https://images.metadata.sky.com/pd-image/abc/16-9')).toBe(false)
  })
})

describe('Content Artwork Engine - Critical Distinction (Logos vs Programme Art)', () => {
  it('correctly distinguishes genuine artwork from fallbacks and channel logos', () => {
    const genuineRecord: ArtworkRecord = {
      id: 'rec-1',
      contentId: 'movie:harbour-lights',
      artworkType: 'movie-poster',
      title: 'Harbour Lights',
      sourceUrl: '/art/harbour-lights.jpg',
      sourceProvider: 'embedded',
      aspectRatio: '2:3',
      orientation: 'portrait',
      retrievalTime: 1000,
      verificationStatus: 'verified',
      confidence: 1.0,
      cacheKey: 'movie:poster:harbour-lights',
    }
    expect(isGenuineArtwork(genuineRecord)).toBe(true)

    // A channel logo is never genuine programme/movie artwork
    const logoRecord: ArtworkRecord = {
      ...genuineRecord,
      artworkType: 'channel-logo',
    }
    expect(isGenuineArtwork(logoRecord)).toBe(false)

    // A fallback ambient representation is never counted as genuine artwork
    const fallbackRecord: ArtworkRecord = {
      ...genuineRecord,
      sourceProvider: 'fallback',
    }
    expect(isGenuineArtwork(fallbackRecord)).toBe(false)

    // Pending or failed items are not genuine artwork
    const failedRecord: ArtworkRecord = {
      ...genuineRecord,
      verificationStatus: 'failed',
    }
    expect(isGenuineArtwork(failedRecord)).toBe(false)
  })

  it('refuses XMLTV icon URLs that point to channel logos', () => {
    const dummyChannel: Channel = {
      id: 'ch-bbc-1',
      number: 1,
      name: 'BBC One',
      group: 'General',
      categories: ['General'],
      mark: { tone: '#b00', text: 'BBC' },
      streamUrl: 'https://example.com/live.m3u8',
      logoUrl: 'https://images.example.com/logos/bbc-one.png',
      hd: true,
      sourceId: 'pl-1',
      tvgId: 'bbcone.uk',
    }

    const progWithChannelLogo: Programme = {
      id: 'p-1',
      channelId: 'ch-bbc-1',
      start: 1000,
      stop: 2000,
      title: 'News at Ten',
      desc: 'Nightly news broadcast',
      category: 'News',
      episode: null,
      icon: 'https://images.example.com/logos/bbc-one.png',
    }

    const result = artworkEngine.registerProgrammeIcon(progWithChannelLogo, dummyChannel)
    // Must return null because icon points to channel logo
    expect(result).toBeNull()

    const progWithRealArt: Programme = {
      id: 'p-2',
      channelId: 'ch-bbc-1',
      start: 1000,
      stop: 2000,
      title: 'Planet Earth III',
      desc: 'Wildlife series',
      category: 'Nature',
      episode: 'S01E01',
      icon: 'https://images.metadata.sky.com/pd-image/abc-123/16-9',
    }

    const genuineResult = artworkEngine.registerProgrammeIcon(progWithRealArt, dummyChannel)
    expect(genuineResult).not.toBeNull()
    expect(genuineResult?.artworkType).toBe('epg-programme-artwork')
    expect(genuineResult?.aspectRatio).toBe('16:9')
    expect(genuineResult?.sourceProvider).toBe('xmltv')
    expect(genuineResult?.confidence).toBe(0.95)
  })
})

describe('Content Artwork Engine - Asset Type Separation & Completeness Audit', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('retrieves distinct poster and backdrop records for movies', () => {
    const poster = artworkEngine.getArtwork('movie:harbour-lights', 'movie-poster')
    expect(poster).not.toBeNull()
    expect(poster?.artworkType).toBe('movie-poster')
    expect(poster?.aspectRatio).toBe('2:3')
    expect(poster?.orientation).toBe('portrait')

    const backdrop = artworkEngine.getArtwork('movie:harbour-lights', 'movie-backdrop')
    expect(backdrop).not.toBeNull()
    expect(backdrop?.artworkType).toBe('movie-backdrop')
    expect(backdrop?.aspectRatio).toBe('16:9')
    expect(backdrop?.orientation).toBe('landscape')
  })

  it('associates distinct series posters, season artwork, and episode stills', () => {
    const seriesPoster = artworkEngine.getArtwork('series:kingsmoor', 'series-poster')
    expect(seriesPoster).not.toBeNull()
    expect(seriesPoster?.artworkType).toBe('series-poster')

    const season1 = artworkEngine.getArtwork('series:kingsmoor', 'season-artwork')
    expect(season1).not.toBeNull()

    const epStill = artworkEngine.getArtwork('episode:kingsmoor/s1e1', 'episode-still')
    expect(epStill).not.toBeNull()
    expect(epStill?.artworkType).toBe('episode-still')
    expect(epStill?.aspectRatio).toBe('16:9')
    expect(epStill?.orientation).toBe('landscape')
  })

  it('generates the complete 11-category artwork audit table', () => {
    const dummyChannels: Channel[] = [
      {
        id: 'ch-1',
        number: 1,
        name: 'BBC One',
        group: 'General',
        categories: ['General'],
        mark: { tone: '#b00', text: 'BBC' },
        streamUrl: 'https://example.com/1.m3u8',
        logoUrl: 'https://images.example.com/logos/1.png',
        hd: true,
        sourceId: 'pl-1',
        tvgId: 'bbcone.uk',
      },
    ]

    const dummyProgrammes: Programme[] = [
      {
        id: 'prog-1',
        channelId: 'ch-1',
        start: 1000,
        stop: 2000,
        title: 'Documentary Special',
        desc: 'Nature programme',
        category: 'Documentary',
        episode: null,
        icon: 'https://images.metadata.sky.com/pd-image/doc/16-9',
      },
      {
        id: 'prog-2',
        channelId: 'ch-1',
        start: 2000,
        stop: 3000,
        title: 'Unbilled Broadcast',
        desc: 'Late night schedule',
        category: 'General',
        episode: null,
        icon: null, // missing icon
      },
    ]

    const audit = artworkEngine.auditCompleteness(dummyChannels, dummyProgrammes, [], [])

    // Must report figures for all required categories
    const requiredCategories: TrackedAuditArtworkType[] = [
      'movie-poster',
      'movie-backdrop',
      'series-poster',
      'series-backdrop',
      'season-artwork',
      'episode-still',
      'epg-programme-artwork',
      'radio-station-artwork',
      'album-artwork',
      'podcast-artwork',
      'audiobook-cover',
    ]

    for (const cat of requiredCategories) {
      expect(audit.categories[cat]).toBeDefined()
      expect(audit.categories[cat].totalEligible).toBeGreaterThanOrEqual(0)
    }

    expect(audit.epgInventory).toBeDefined()
    expect(audit.epgInventory.totalCachedRecords).toBe(414_472)
    expect(audit.epgInventory.activeWindowProgrammes).toBe(2)
    expect(audit.epgInventory.uniqueProgrammeIdentities).toBe(2)
    expect(audit.epgInventory.nativeIconCount).toBe(1)
    expect(audit.epgInventory.reconciliationExplanation).toContain('414,472')

    // Verify EPG programme artwork metrics
    const epgCat = audit.categories['epg-programme-artwork']
    expect(epgCat.totalEligible).toBe(2)
    expect(epgCat.genuineFound).toBe(1)
    expect(epgCat.alreadyPresent).toBe(1)
    expect(epgCat.newlyRetrieved).toBe(0)
    expect(epgCat.missing).toBe(1)
    expect(epgCat.genuinePercent).toBe(50)

    // Verify provider metrics table
    expect(audit.providerMetrics).toHaveLength(4)
    const tmdbMetric = audit.providerMetrics.find((p) => p.providerKey === 'tmdb')
    expect(tmdbMetric).toBeDefined()
    expect(tmdbMetric?.queries).toBe(0)
    expect(tmdbMetric?.statusNote).toContain('Disabled by default')

    const broadcasterMetric = audit.providerMetrics.find((p) => p.providerKey === 'broadcaster')
    expect(broadcasterMetric).toBeDefined()
    expect(broadcasterMetric?.queries).toBe(2)
    expect(broadcasterMetric?.matches).toBe(1)
    expect(broadcasterMetric?.imagesRetrieved).toBe(1)

    // Verify missing items diagnosis
    expect(audit.missingItems.length).toBeGreaterThan(0)
    const missingProg = audit.missingItems.find((item) => item.contentId === 'epg:prog-2')
    expect(missingProg).toBeDefined()
    expect(missingProg?.reason).toContain('does not provide an <icon> element')
    expect(missingProg?.reason).toContain('TMDB and TVmaze are disabled in Settings')
  })

  it('runs asynchronous background enrichment and notifies subscribers', async () => {
    const states: string[] = []
    const unsubscribe = artworkEngine.subscribe((progress) => {
      states.push(progress.currentStage)
    })

    artworkEngine.runEnrichment()
    expect(states.length).toBeGreaterThan(0)

    // Wait for simulated async batches
    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(states.some((s) => s.includes('Complete'))).toBe(true)

    unsubscribe()
  })

  it('performs cross-guide icon propagation and computes dual broadcast/title metrics', () => {
    const channels = [
      { id: 'ch-1', name: 'BBC One HD', number: 1, categories: ['General'] },
      { id: 'ch-2', name: 'BBC Two HD', number: 2, categories: ['General'] },
    ] as unknown as Channel[]

    const programmes = [
      {
        id: 'prog-airing-1',
        channelId: 'ch-1',
        title: 'Mastermind (HD)',
        start: 1700000000,
        stop: 1700001800,
        icon: 'https://cdn.example.com/art/mastermind.jpg',
      },
      {
        id: 'prog-airing-2',
        channelId: 'ch-2',
        title: 'Mastermind',
        start: 1700003600,
        stop: 1700005400,
        // No icon on second channel airing
      },
      {
        id: 'prog-airing-3',
        channelId: 'ch-1',
        title: 'Local News Bulletin',
        start: 1700007200,
        stop: 1700009000,
        // No icon anywhere for this title
      },
    ] as unknown as Programme[]

    const audit = artworkEngine.auditCompleteness(channels, programmes, [], [], 1000)

    // Airing 1 has native icon
    // Airing 2 has no icon, but resolves via cross-guide matching from Airing 1 (same clean title "Mastermind")
    // Airing 3 has no icon and no cross-guide match
    expect(audit.epgInventory.activeWindowProgrammes).toBe(3)
    expect(audit.epgInventory.nativeIconCount).toBe(1)
    expect(audit.epgInventory.crossGuideResolvedCount).toBe(1)
    expect(audit.epgInventory.broadcastsWithArtwork).toBe(2)
    expect(audit.epgInventory.broadcastLevelPercent).toBe(67) // 2 / 3 = 67%

    // Unique title identities: "Mastermind" and "Local News Bulletin" = 2 unique identities
    expect(audit.epgInventory.uniqueProgrammeIdentities).toBe(2)
    expect(audit.epgInventory.uniqueTitlesWithArtwork).toBe(1) // Only "Mastermind" has artwork
    expect(audit.epgInventory.uniqueTitlePercent).toBe(50) // 1 / 2 = 50%
  })

  it('supports pausing, resuming, and cancelling background enrichment', async () => {
    // Mock native.fetchMetadata so no outbound network calls are attempted
    const fetchSpy = vi.spyOn(native, 'fetchMetadata').mockResolvedValue(JSON.stringify({ results: [] }))

    saveMetadataConfig({
      ...DEFAULT_METADATA_CONFIG,
      tmdbEnabled: true,
      tmdbApiKey: 'test-key-valid',
    })

    let lastProgress: { isRunning: boolean; isPaused: boolean; currentStage: string } | null = null
    const unsubscribe = artworkEngine.subscribe((progress) => {
      lastProgress = {
        isRunning: progress.isRunning,
        isPaused: progress.isPaused,
        currentStage: progress.currentStage,
      }
    })

    // Start enrichment (asynchronous because TMDB is enabled)
    const runPromise = artworkEngine.runEnrichment()
    expect(lastProgress).not.toBeNull()

    // Pause enrichment
    artworkEngine.pauseEnrichment()
    expect((lastProgress as any)?.isPaused).toBe(true)
    expect((lastProgress as any)?.isRunning).toBe(false)
    expect((lastProgress as any)?.currentStage).toContain('paused')

    // Resume enrichment
    artworkEngine.resumeEnrichment()
    expect((lastProgress as any)?.isPaused).toBe(false)

    // Cancel enrichment
    artworkEngine.cancelEnrichment()
    expect((lastProgress as any)?.isRunning).toBe(false)
    expect((lastProgress as any)?.currentStage).toContain('cancelled')

    await runPromise.catch(() => {})
    fetchSpy.mockRestore()
    unsubscribe()

    // Reset back to default disabled
    saveMetadataConfig(DEFAULT_METADATA_CONFIG)
  })

  it('manually resolves ambiguous remake titles and updates audit state', () => {
    const ambContentId = 'amb:epg:prog-solaris-test'
    const candidate = {
      title: 'Solaris (1972)',
      year: 1972,
      provider: 'curated' as const,
      confidence: 1.0,
      artworkUrl: '/art/solaris-1972.jpg',
      aspectRatio: '16:9' as const,
    }

    artworkEngine.resolveAmbiguous(ambContentId, candidate)

    const record = artworkEngine.getArtwork(ambContentId)
    expect(record).not.toBeNull()
    expect(record?.title).toBe('Solaris (1972)')
    expect(record?.verificationStatus).toBe('verified')
    expect(record?.confidence).toBe(1.0)
    expect(record?.attribution).toContain('Manual User Resolution')

    // When running audit with this programme, it is no longer ambiguous
    const testChannel = { id: 'ch-test', name: 'Test Channel', number: 99, categories: ['General'] } as unknown as Channel
    const testProg = {
      id: 'prog-solaris-test',
      channelId: 'ch-test',
      title: 'Solaris',
      start: 1700000000,
      stop: 1700007200,
    } as unknown as Programme

    const audit = artworkEngine.auditCompleteness([testChannel], [testProg])
    const foundAmb = audit.ambiguousMatches.find((a) => a.contentId === ambContentId)
    expect(foundAmb).toBeUndefined()
  })
})
