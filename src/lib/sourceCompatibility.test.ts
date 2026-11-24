// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getSourceCapability,
  getSourceImplementationStatus,
  doesSourceSupportMedia,
  doesSourceProvideArtworkRole,
  type SourceType,
} from '../data/sourceCompatibility'
import {
  classifyMediaKind,
  buildCanonicalMediaRef,
  getArtworkRoleSpec,
} from '../data/mediaAssetModel'
import { validateArtworkSuitability } from './artworkSuitability'
import { resolveArtwork } from './artworkResolver'
import { scoreArtworkMatch, isGenericOrPromoGraphic, artworkEngine } from '../data/artworkEngine'
import { saveCustomArtwork, deleteCustomArtwork } from '../state/customArtwork'

describe('Source and Media Compatibility Matrix', () => {
  it('covers all defined source integrations with explicit capabilities', () => {
    const requiredSources: SourceType[] = [
      'm3u',
      'xtream',
      'xmltv',
      'stalker',
      'local-media',
      'media-server',
      'metadata-service',
      'discovery-catalogue',
      'rss-feed',
      'opds-library',
    ]

    for (const src of requiredSources) {
      const cap = getSourceCapability(src)
      expect(cap).toBeDefined()
      expect(cap.id).toBe(src)
      expect(cap.supportedMediaKinds.length).toBeGreaterThan(0)
      expect(cap.supportedArtworkRoles.length).toBeGreaterThan(0)
      expect(cap.knownLimitations.length).toBeGreaterThan(0)
    }
  })

  it('accurately distinguishes genuine implementation status across all 10 sources', () => {
    expect(getSourceImplementationStatus('m3u')).toBe('fully-implemented')
    expect(getSourceImplementationStatus('xtream')).toBe('fully-implemented')
    expect(getSourceImplementationStatus('xmltv')).toBe('fully-implemented')
    expect(getSourceImplementationStatus('stalker')).toBe('fully-implemented')
    expect(getSourceImplementationStatus('local-media')).toBe('fully-implemented')
    expect(getSourceImplementationStatus('media-server')).toBe('fully-implemented')
    expect(getSourceImplementationStatus('metadata-service')).toBe('fully-implemented')
    expect(getSourceImplementationStatus('discovery-catalogue')).toBe('fully-implemented')
    expect(getSourceImplementationStatus('rss-feed')).toBe('fully-implemented')
    expect(getSourceImplementationStatus('opds-library')).toBe('fully-implemented')
  })

  it('correctly reports supported media kinds per source type', () => {
    expect(doesSourceSupportMedia('m3u', 'channel')).toBe(true)
    expect(doesSourceSupportMedia('m3u', 'podcast')).toBe(false)

    expect(doesSourceSupportMedia('xtream', 'catchup')).toBe(true)
    expect(doesSourceSupportMedia('xtream', 'book')).toBe(false)

    expect(doesSourceSupportMedia('xmltv', 'programme')).toBe(true)
    expect(doesSourceSupportMedia('xmltv', 'movie')).toBe(false)

    expect(doesSourceSupportMedia('rss-feed', 'podcast')).toBe(true)
    expect(doesSourceSupportMedia('opds-library', 'book')).toBe(true)
  })

  it('correctly reports supported artwork roles per source type', () => {
    expect(doesSourceProvideArtworkRole('m3u', 'channel-logo')).toBe(true)
    expect(doesSourceProvideArtworkRole('xmltv', 'epg-programme-artwork')).toBe(true)
    expect(doesSourceProvideArtworkRole('metadata-service', 'cinematic-backdrop')).toBe(true)
    expect(doesSourceProvideArtworkRole('opds-library', 'book-cover')).toBe(true)
  })
})

describe('Canonical Media and Asset Model', () => {
  it('classifies media kinds from URI schemes, routes, and item references', () => {
    expect(classifyMediaKind('movie:dune-2021')).toBe('movie')
    expect(classifyMediaKind('/movies/123')).toBe('movie')
    expect(classifyMediaKind('series:breaking-bad')).toBe('series')
    expect(classifyMediaKind('episode:breaking-bad:s01e01')).toBe('episode')
    expect(classifyMediaKind('channel:bbc-one')).toBe('channel')
    expect(classifyMediaKind('/live?channel=5usa')).toBe('channel')
    expect(classifyMediaKind('radio:classic-fm')).toBe('radio')
    expect(classifyMediaKind('podcast:hardcore-history')).toBe('podcast')
    expect(classifyMediaKind('audiobook:project-hail-mary')).toBe('audiobook')
    expect(classifyMediaKind('book:dune')).toBe('book')
    expect(classifyMediaKind('album:dark-side-of-the-moon')).toBe('album')
    expect(classifyMediaKind('local:home-videos:tape1')).toBe('local-file')
  })

  it('builds sanitized canonical media references', () => {
    expect(buildCanonicalMediaRef('movie', 'Harbour Lights (2024)')).toBe('movie:harbour-lights--2024-')
    expect(buildCanonicalMediaRef('channel', 'BBC One HD')).toBe('channel:bbc-one-hd')
  })

  it('returns valid aspect ratio specifications and bounds for each artwork role', () => {
    const posterSpec = getArtworkRoleSpec('movie-poster')
    expect(posterSpec.aspectRatio).toBe('2:3')
    expect(posterSpec.orientation).toBe('portrait')
    expect(posterSpec.requiresTransparency).toBe(false)

    const backdropSpec = getArtworkRoleSpec('cinematic-backdrop')
    expect(backdropSpec.aspectRatio).toBe('16:9')
    expect(backdropSpec.orientation).toBe('landscape')
    expect(backdropSpec.minRatio).toBeGreaterThanOrEqual(1.5)

    const logoSpec = getArtworkRoleSpec('title-logo')
    expect(logoSpec.requiresTransparency).toBe(true)
    expect(logoSpec.orientation).toBe('landscape')

    const channelLogoSpec = getArtworkRoleSpec('channel-logo')
    expect(channelLogoSpec.aspectRatio).toBe('1:1')
    expect(channelLogoSpec.orientation).toBe('square')
  })
})

describe('Artwork Suitability Validation Engine', () => {
  it('refuses private and loopback destinations by default', () => {
    const res = validateArtworkSuitability('http://127.0.0.1:8080/logo.png', 'channel-logo')
    expect(res.isValid).toBe(false)
    expect(res.rejectionReason).toContain('Private or loopback')
  })

  it('unconditionally blocks cloud metadata service endpoints under all options', () => {
    const endpoints = [
      'http://169.254.169.254/latest/meta-data/',
      'http://metadata.google.internal/computeMetadata/v1/',
      'http://instance-data/latest/meta-data/',
    ]
    for (const ep of endpoints) {
      // Direct call
      const res1 = validateArtworkSuitability(ep, 'channel-logo')
      expect(res1.isValid).toBe(false)
      expect(res1.rejectionReason).toContain('Cloud metadata service destination refused')

      // With trusted local source enabled (must still be refused unconditionally)
      const res2 = validateArtworkSuitability(ep, 'channel-logo', { isTrustedLocalSource: true })
      expect(res2.isValid).toBe(false)
      expect(res2.rejectionReason).toContain('Cloud metadata service destination refused')

      // With trusted hosts (must still be refused unconditionally)
      const res3 = validateArtworkSuitability(ep, 'channel-logo', {
        allowLocalNetwork: true,
        trustedHosts: ['169.254.169.254', 'metadata.google.internal'],
      })
      expect(res3.isValid).toBe(false)
      expect(res3.rejectionReason).toContain('Cloud metadata service destination refused')
    }
  })

  it('allows private network addresses only when explicitly marked trusted or in trustedHosts', () => {
    const privateUrl = 'http://192.168.1.100:8096/Images/Primary'

    // Untrusted by default
    const untrustedRes = validateArtworkSuitability(privateUrl, 'movie-poster')
    expect(untrustedRes.isValid).toBe(false)
    expect(untrustedRes.rejectionReason).toContain('Private or loopback address destination refused')

    // Allowed with isTrustedLocalSource
    const trustedRes = validateArtworkSuitability(privateUrl, 'movie-poster', { isTrustedLocalSource: true })
    expect(trustedRes.isValid).toBe(true)

    // Allowed with allowLocalNetwork
    const localNetRes = validateArtworkSuitability(privateUrl, 'movie-poster', { allowLocalNetwork: true })
    expect(localNetRes.isValid).toBe(true)

    // Allowed with trustedHosts
    const hostRes = validateArtworkSuitability(privateUrl, 'movie-poster', { trustedHosts: ['192.168.1.100'] })
    expect(hostRes.isValid).toBe(true)
  })

  it('permits local filesystem sidecar artwork via file:// scheme', () => {
    const fileUrl = 'file:///mnt/storage/media/movies/Inception/backdrop.jpg'
    const res = validateArtworkSuitability(fileUrl, 'movie-backdrop')
    expect(res.isValid).toBe(true)
    expect(res.suitabilityScore).toBeGreaterThanOrEqual(0.9)
  })

  it('rejects low-resolution backdrops and posters below minimum bounds', () => {
    // Backdrop below 320x180
    const lowResBackdrop = validateArtworkSuitability(
      'https://example.com/art/tiny-backdrop.jpg',
      'cinematic-backdrop',
      { inspection: { width: 300, height: 168 } },
    )
    expect(lowResBackdrop.isValid).toBe(false)
    expect(lowResBackdrop.rejectionReason).toContain('too low for cinematic backdrop')

    // Poster below 120x180
    const lowResPoster = validateArtworkSuitability(
      'https://example.com/art/tiny-poster.jpg',
      'movie-poster',
      { inspection: { width: 100, height: 150 } },
    )
    expect(lowResPoster.isValid).toBe(false)
    expect(lowResPoster.rejectionReason).toContain('too low for poster')
  })

  it('validates MIME types and rejects non-image formats', () => {
    const htmlRes = validateArtworkSuitability(
      'https://example.com/cover.jpg',
      'movie-poster',
      { inspection: { mimeType: 'text/html' } },
    )
    expect(htmlRes.isValid).toBe(false)
    expect(htmlRes.rejectionReason).toContain('must be an image format')

    const pdfRes = validateArtworkSuitability(
      'https://example.com/cover.jpg',
      'book-cover',
      { inspection: { mimeType: 'application/pdf' } },
    )
    expect(pdfRes.isValid).toBe(false)
    expect(pdfRes.rejectionReason).toContain('must be an image format')

    const imageRes = validateArtworkSuitability(
      'https://example.com/cover.jpg',
      'movie-poster',
      { inspection: { mimeType: 'image/jpeg' } },
    )
    expect(imageRes.isValid).toBe(true)
  })

  it('refuses generic category stock graphics such as 3D news rings', () => {
    const res = validateArtworkSuitability(
      'http://jiotv.catchup.cdn.jio.com/dare_images/shows/epgdata/fef7d9e050359f02bbc034eb3ecef417.jpg',
      'epg-programme-artwork',
      undefined,
      'News',
    )
    expect(res.isValid).toBe(false)
    expect(res.rejectionReason).toContain('Generic category graphic')
  })

  it('refuses broadcaster promotional cards with embedded Sanskrit logos and special text', () => {
    const res = validateArtworkSuitability(
      'http://jiotv.catchup.cdn.jio.com/dare_images/shows/epgdata/a1fdd5b63f0433c2b9f0ec27a8e14698.jpg',
      'epg-programme-artwork',
      undefined,
      'Aastha Special',
    )
    expect(res.isValid).toBe(false)
    expect(res.rejectionReason).toContain('Generic category graphic or broadcaster promotional card')
  })

  it('refuses promotional franchise specials from serving as hero backdrops', () => {
    const res = validateArtworkSuitability(
      'https://image.tmdb.org/t/p/original/49KZ0pe0n6E3AapZmOx94oAmWMl.jpg',
      'movie-backdrop',
      undefined,
      'NCIS',
    )
    expect(res.isValid).toBe(false)
    expect(res.rejectionReason).toMatch(/promotional|generic/i)
  })

  it('refuses isolated title logos and wordmarks from serving as cinematic backdrops', () => {
    const res = validateArtworkSuitability('https://example.com/clearart/title-logo.png', 'movie-backdrop')
    expect(res.isValid).toBe(false)
    expect(res.rejectionReason).toContain('Isolated title logo')
  })

  it('refuses portrait posters from being stretched into backdrops', () => {
    const res = validateArtworkSuitability('https://example.com/movies/poster.jpg', 'movie-backdrop')
    expect(res.isValid).toBe(false)
    expect(res.rejectionReason).toContain('Portrait poster')
  })

  it('refuses broadcaster logos from being stretched into programme stills', () => {
    const res = validateArtworkSuitability('https://example.com/tv-logo/bbc1.png', 'epg-programme-artwork')
    expect(res.isValid).toBe(false)
    expect(res.rejectionReason).toContain('Broadcaster channel logo')
  })

  it('validates authentic landscape photographic stills', () => {
    const res = validateArtworkSuitability(
      'https://images.metadata.sky.com/pd-image/89aabe55-3c82-47ef-b4ab-a41f1cef81fd/16-9',
      'epg-programme-artwork',
      { width: 1920, height: 1080 },
    )
    expect(res.isValid).toBe(true)
    expect(res.suitabilityScore).toBeGreaterThanOrEqual(0.9)
  })
})

describe('Artwork Matching and Disambiguation Rules', () => {
  it('requires word boundaries for partial title matching (rejecting NCIS matching NCISverse)', () => {
    const score = scoreArtworkMatch('NCIS', undefined, 'NCISverse: The First 1,000', 2024)
    expect(score.status).toBe('unresolved')
    expect(score.confidence).toBe(0.0)
  })

  it('scores subtitle matches with verified release year as verified', () => {
    const score = scoreArtworkMatch('Dune', 2021, 'Dune: Part One', 2021)
    expect(score.status).toBe('verified')
    expect(score.confidence).toBe(0.75)
  })

  it('marks spin-offs without verified release year as ambiguous', () => {
    const score = scoreArtworkMatch('NCIS', undefined, 'NCIS: Hawai’i', 2021)
    expect(score.status).toBe('ambiguous')
    expect(score.confidence).toBe(0.45)
  })

  it('detects known generic stock and promo URLs via isGenericOrPromoGraphic', () => {
    expect(isGenericOrPromoGraphic('http://jiotv.catchup.cdn.jio.com/dare_images/shows/epgdata/fef7d9e050359f02bbc034eb3ecef417.jpg')).toBe(true)
    expect(isGenericOrPromoGraphic('http://jiotv.catchup.cdn.jio.com/dare_images/shows/epgdata/a1fdd5b63f0433c2b9f0ec27a8e14698.jpg')).toBe(true)
    expect(isGenericOrPromoGraphic('https://example.com/art/49KZ0pe0n6E3AapZmOx94oAmWMl.jpg')).toBe(true)
    expect(isGenericOrPromoGraphic('https://images.metadata.sky.com/pd-image/89aabe55-3c82-47ef-b4ab-a41f1cef81fd/16-9')).toBe(false)
  })

  it('handles multilingual EPG titles in Devanagari script accurately', () => {
    // Exact Hindi match without year
    const exactMatch = scoreArtworkMatch('आस्था स्पेशल', undefined, 'आस्था स्पेशल', undefined)
    expect(exactMatch.status).toBe('verified')
    expect(exactMatch.confidence).toBe(0.85)

    // Exact Hindi match with verified broadcast year
    const yearMatch = scoreArtworkMatch('आस्था स्पेशल', 2024, 'आस्था स्पेशल', 2024)
    expect(yearMatch.status).toBe('verified')
    expect(yearMatch.confidence).toBe(1.0)

    // Hindi News title matching
    const newsMatch = scoreArtworkMatch('न्यूज़ एक्सप्रेस', undefined, 'न्यूज़ एक्सप्रेस', undefined)
    expect(newsMatch.status).toBe('verified')
    expect(newsMatch.confidence).toBe(0.85)
  })

  it('disambiguates regional broadcast channels cleanly', () => {
    // Channel London vs Channel Scotland
    artworkEngine.registerProgrammeIcon(
      {
        id: 'prog-bbc-ldn',
        channelId: 'bbc-one-london',
        start: 1000,
        stop: 2000,
        title: 'Regional News London',
        desc: 'London news broadcast',
        category: 'News',
        episode: null,
        icon: 'https://images.metadata.sky.com/pd-image/london-news/16-9',
      },
      {
        id: 'bbc-one-london',
        number: 1,
        name: 'BBC One London',
        group: 'Regional',
        categories: ['Regional'],
        mark: { tone: '#b00', text: 'LDN' },
        streamUrl: 'https://example.com/ldn.m3u8',
        logoUrl: 'https://example.com/ldn.png',
        hd: true,
        sourceId: 'src-1',
        tvgId: 'bbc-one-london',
      },
    )

    const ldnArt = artworkEngine.findArtwork('Regional News London', 'epg-programme-artwork', undefined, 'bbc-one-london')
    expect(ldnArt).not.toBeNull()
    expect(ldnArt?.sourceUrl).toContain('london-news')

    const scotArt = artworkEngine.findArtwork('Regional News London', 'epg-programme-artwork', undefined, 'bbc-one-scotland')
    expect(scotArt).toBeNull()
  })
})

describe('Universal Artwork Pipeline and Priority Hierarchy', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('prioritises active user custom artwork over all other sources', async () => {
    await saveCustomArtwork({
      contentId: 'movie:test-custom',
      title: 'Custom Title',
      artworkType: 'movie-poster',
      aspectRatio: '2:3',
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      fileName: 'test.png',
      fileSize: 100,
      width: 1,
      height: 1,
      mimeType: 'image/png',
    })

    const res = resolveArtwork({
      contentId: 'movie:test-custom',
      title: 'Custom Title',
      type: 'movie-poster',
      localArt: 'https://example.com/local-poster.jpg',
      providerArt: 'https://example.com/provider-poster.jpg',
    })

    expect(res.provider).toBe('custom')
    expect(res.src).toContain('data:image/png')
    expect(res.attribution).toBe('User Custom Artwork')
    expect(res.diagnostics?.selectedProvider).toBe('custom')

    deleteCustomArtwork('movie:test-custom')
  })

  it('normalises Sky metadata /cover URLs to /16-9 for landscape roles', () => {
    const res = resolveArtwork({
      contentId: 'prog:test',
      title: 'Sky Broadcast',
      type: 'epg-programme-artwork',
      providerArt: 'https://images.metadata.sky.com/pd-image/abc-xyz/cover',
    })

    expect(res.provider).toBe('provider')
    expect(res.src).toBe('https://images.metadata.sky.com/pd-image/abc-xyz/16-9')
  })

  it('isolates EPG programme artwork by channel to prevent cross-channel contamination', () => {
    // Register programme icon under channel A
    artworkEngine.registerProgrammeIcon(
      {
        id: 'p-ch-a',
        channelId: 'ch-a',
        start: 1000,
        stop: 2000,
        title: 'Special Event',
        desc: 'Event on channel A',
        category: 'Entertainment',
        episode: null,
        icon: 'https://images.metadata.sky.com/pd-image/event-still-123/16-9',
      },
      {
        id: 'ch-a',
        number: 1,
        name: 'Channel A',
        group: 'General',
        categories: ['General'],
        mark: { tone: '#b00', text: 'A' },
        streamUrl: 'https://example.com/a.m3u8',
        logoUrl: 'https://example.com/a.png',
        hd: true,
        sourceId: 'src-1',
        tvgId: 'ch-a',
      },
    )

    // Lookup on channel A succeeds
    const matchA = artworkEngine.findArtwork('Special Event', 'epg-programme-artwork', undefined, 'ch-a')
    expect(matchA).not.toBeNull()
    expect(matchA?.sourceUrl).toContain('event-still-123')

    // Lookup on channel B with channel scoping does NOT receive channel A's image
    const matchB = artworkEngine.findArtwork('Special Event', 'epg-programme-artwork', undefined, 'ch-b')
    expect(matchB).toBeNull()
  })

  it('refuses generic category titles from matching cross-channel EPG artwork', () => {
    // Register programme icon for "News" on Channel X
    artworkEngine.registerProgrammeIcon(
      {
        id: 'p-news-x',
        channelId: 'ch-x',
        start: 1000,
        stop: 2000,
        title: 'News',
        desc: 'Nightly News',
        category: 'News',
        episode: null,
        icon: 'https://images.metadata.sky.com/pd-image/news-still/16-9',
      },
      {
        id: 'ch-x',
        number: 2,
        name: 'Channel X',
        group: 'News',
        categories: ['News'],
        mark: { tone: '#00b', text: 'X' },
        streamUrl: 'https://example.com/x.m3u8',
        logoUrl: 'https://example.com/x.png',
        hd: true,
        sourceId: 'src-1',
        tvgId: 'ch-x',
      },
    )

    // Querying generic "News" for epg-programme-artwork across channels returns null
    const genericMatch = artworkEngine.findArtwork('News', 'epg-programme-artwork')
    expect(genericMatch).toBeNull()
  })
})
