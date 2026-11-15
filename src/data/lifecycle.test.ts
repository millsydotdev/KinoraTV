import { describe, it, expect } from 'vitest'
import { getChannelLifecycle, getXtreamLifecycle, getResourceLifecycle, auditCatalogueHealth } from './lifecycle'
import type { Channel, XtreamTitle } from './types'
import type { MediaResource } from './personalLibrary'
import type { GuideMatch } from '../state/guides'

describe('lifecycle module', () => {
  const dummyChannel: Channel = {
    id: 'ch-bbc1',
    number: 1,
    name: 'BBC One',
    group: 'General',
    categories: ['General'],
    logoUrl: 'https://example.com/logo.png',
    mark: { text: 'BBC', tone: '#b00' },
    streamUrl: 'http://example.com/live.m3u8',
    hd: true,
    sourceId: 'src-1',
    tvgId: 'bbcone.uk',
  }

  it('determines guide-associated lifecycle when channel has verified match and programmes', () => {
    const match: GuideMatch = { state: 'matched', guide: 'gd-1', channel: 'bbcone.uk', manual: false }
    const lifecycle = getChannelLifecycle(dummyChannel, match, true, true)
    expect(lifecycle.state).toBe('guide-associated')
    expect(lifecycle.metrics.isImported).toBe(true)
    expect(lifecycle.metrics.hasArtwork).toBe(true)
    expect(lifecycle.metrics.hasGuide).toBe(true)
    expect(lifecycle.metrics.isPlayable).toBe(true)
    expect(lifecycle.badges).toContain('Guide Associated')
    expect(lifecycle.badges).toContain('Streaming Now')
  })

  it('identifies unavailable stream when streamUrl is null', () => {
    const offlineChannel: Channel = { ...dummyChannel, streamUrl: null }
    const lifecycle = getChannelLifecycle(offlineChannel, null, false, false)
    expect(lifecycle.state).toBe('unavailable')
    expect(lifecycle.label).toBe('Stream Unavailable')
    expect(lifecycle.metrics.isPlayable).toBe(false)
  })

  it('evaluates on-demand Xtream title lifecycle depending on connection state', () => {
    const title: XtreamTitle = {
      id: '101',
      name: 'Big Buck Bunny',
      year: 2008,
      categoryId: '1',
      plot: 'A large and lovable rabbit deals with forest bullies.',
      artworkKey: 'art-101',
      extension: 'mp4',
      sourceId: 'xt-1',
      kind: 'movie',
    }
    const connected = getXtreamLifecycle(title, true)
    expect(connected.state).toBe('artwork-enriched')
    expect(connected.metrics.isPlayable).toBe(true)

    const disconnected = getXtreamLifecycle(title, false)
    expect(disconnected.state).toBe('unavailable')
    expect(disconnected.label).toBe('Provider Disconnected')
  })

  it('evaluates media resource lifecycle distinguishing direct stream from portal reference', () => {
    const radioRes: MediaResource = {
      id: 'res-rad-1',
      name: 'SomaFM Drone Zone',
      category: 'radio',
      subcategory: 'ambient',
      url: 'http://ice1.somafm.com/dronezone-128-mp3',
      provider: 'SomaFM',
      discoveryUrl: 'https://somafm.com',
      dateDiscovered: '2026-01-01',
      lastVerified: '2026-11-01',
      provides: 'Continuous ambient space music',
      supportedByKinora: true,
      resourceType: 'stream',
      tags: ['ambient', 'space'],
      artworkUrl: 'https://somafm.com/img/dronezone120.jpg',
      description: 'Atmospheric ambient space music',
      playbackType: 'audio',
      verificationStatus: 'verified',
    }
    const lifecycle = getResourceLifecycle(radioRes)
    expect(lifecycle.state).toBe('playable')
    expect(lifecycle.badges).toContain('Direct Stream')

    const archiveRes: MediaResource = {
      ...radioRes,
      id: 'res-arch-1',
      category: 'archives',
      playbackType: 'web',
      verificationStatus: 'working',
    }
    const archiveLife = getResourceLifecycle(archiveRes)
    expect(archiveLife.state).toBe('artwork-enriched')
    expect(archiveLife.badges).toContain('Portal Reference')
  })

  it('audits catalogue health accurately across multiple channels and reasons', () => {
    const channels: Channel[] = [
      dummyChannel,
      {
        id: 'ch-radio',
        number: 101,
        name: 'BBC Radio 1',
        group: 'Radio',
        categories: ['Radio'],
        logoUrl: 'https://example.com/r1.png',
        mark: { text: 'R1', tone: '#00b' },
        streamUrl: 'http://example.com/r1.m3u8',
        hd: false,
        sourceId: 'src-1',
        tvgId: 'bbcradio1.uk',
      },
      {
        id: 'ch-unmatched',
        number: 202,
        name: 'Unknown FAST Channel',
        group: 'FAST',
        categories: ['FAST'],
        logoUrl: null,
        mark: { text: 'U', tone: '#555' },
        streamUrl: 'http://example.com/u.m3u8',
        hd: true,
        sourceId: 'src-1',
        tvgId: 'FastFeed.us@UK',
      },
    ]

    const matches = new Map<string, GuideMatch>([
      ['ch-bbc1', { state: 'matched', guide: 'gd-1', channel: 'bbcone.uk', manual: false }],
      ['ch-radio', { state: 'unmatched' }],
      ['ch-unmatched', { state: 'unmatched' }],
    ])

    const audit = auditCatalogueHealth(channels, matches)
    expect(audit.totalChannels).toBe(3)
    expect(audit.guideMatchedChannels).toBe(1)
    expect(audit.guideMatchedPercent).toBe(33)
    expect(audit.artworkEnrichedChannels).toBe(2)
    expect(audit.artworkEnrichedPercent).toBe(67)
    expect(audit.unmatchedReasons.radioStreams).toBe(1)
    expect(audit.unmatchedReasons.fastChannelsNoFeed).toBe(1)
  })
})
