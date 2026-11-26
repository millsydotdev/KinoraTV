import { describe, expect, it } from 'vitest'
import {
  collectCatchupProgrammes,
  getCatchupDayBuckets,
  getCatchupWatchRef,
  isCatchupSupportedChannel,
  isProgrammeCatchupAvailable,
} from './xtreamCatchup'
import type { Channel, Programme } from '../data/types'

describe('Xtream & M3U Catch-up Programme Linkage', () => {
  const baseChannel: Channel = {
    id: 'ch-xt-1',
    number: 101,
    name: 'BBC One HD',
    group: 'Entertainment',
    categories: ['Entertainment'],
    logoUrl: 'https://logos.example/bbc1.png',
    mark: { text: 'BBC', tone: '#222' },
    streamUrl: 'xtream://source-1/live/101.ts',
    hd: true,
    sourceId: 'src-xtream-1',
    xtreamStreamId: '101',
    tvgId: 'bbc1.uk',
    tvArchive: 1,
    tvArchiveDuration: 7,
  }

  const m3uChannel: Channel = {
    id: 'ch-m3u-1',
    number: 102,
    name: 'ITV 1 HD',
    group: 'Entertainment',
    categories: ['Entertainment'],
    logoUrl: null,
    mark: { text: 'ITV', tone: '#333' },
    streamUrl: 'https://streams.example/itv1.m3u8',
    hd: true,
    sourceId: 'src-m3u-1',
    tvgId: 'itv1.uk',
    catchupType: 'append',
    catchupSource: '?playpath=${start}&duration=${duration}',
    tvArchive: 1,
    tvArchiveDuration: 3,
  }

  const noArchiveChannel: Channel = {
    ...baseChannel,
    id: 'ch-no-archive',
    tvArchive: 0,
  }

  it('detects catch-up support correctly across Xtream and M3U channels', () => {
    expect(isCatchupSupportedChannel(baseChannel)).toBe(true)
    expect(isCatchupSupportedChannel(m3uChannel)).toBe(true)
    expect(isCatchupSupportedChannel(noArchiveChannel)).toBe(false)
    expect(isCatchupSupportedChannel(null)).toBe(false)
  })

  it('determines if a programme is currently available on catch-up', () => {
    const now = 1731636000000 // Fixed reference time

    const pastProg: Programme = {
      id: 'p-past',
      channelId: 'ch-xt-1',
      title: 'News at Ten',
      desc: 'Nightly news broadcast',
      category: 'News',
      episode: null,
      start: now - 3600000,
      stop: now - 1800000,
    }

    const futureProg: Programme = {
      id: 'p-future',
      channelId: 'ch-xt-1',
      title: 'Breakfast Show',
      desc: 'Morning news and magazine',
      category: 'News',
      episode: null,
      start: now + 3600000,
      stop: now + 7200000,
    }

    const ancientProg: Programme = {
      id: 'p-ancient',
      channelId: 'ch-xt-1',
      title: 'Old Broadcast',
      desc: 'Archive recording',
      category: 'Archive',
      episode: null,
      start: now - 8 * 86400000, // 8 days ago (exceeds 7-day retention)
      stop: now - 8 * 86400000 + 3600000,
    }

    expect(isProgrammeCatchupAvailable(baseChannel, pastProg, now)).toBe(true)
    expect(isProgrammeCatchupAvailable(baseChannel, futureProg, now)).toBe(false)
    expect(isProgrammeCatchupAvailable(baseChannel, ancientProg, now)).toBe(false)
    expect(isProgrammeCatchupAvailable(noArchiveChannel, pastProg, now)).toBe(false)
  })

  it('generates exact catch-up playback references for Xtream and M3U', () => {
    const prog: Programme = {
      id: 'p-match',
      channelId: 'ch-xt-1',
      title: 'Match of the Day',
      desc: 'Premier League highlights',
      category: 'Sports',
      episode: null,
      start: 1731600000000,
      stop: 1731603600000, // 60 mins
    }

    const xtRef = getCatchupWatchRef(baseChannel, prog)
    expect(xtRef).toBe('catchup:xt:src-xtream-1:101:1731600000:60')

    const m3uRef = getCatchupWatchRef(m3uChannel, prog)
    expect(m3uRef).toBe('catchup:m3u:ch-m3u-1:1731600000:60:1731603600')

    expect(getCatchupWatchRef(noArchiveChannel, prog)).toBeNull()
  })

  it('generates day buckets with proper labels and dates', () => {
    const now = 1731636000000
    const buckets = getCatchupDayBuckets(7, now)

    expect(buckets).toHaveLength(8) // 0 to -7
    expect(buckets[0]?.dayOffset).toBe(0)
    expect(buckets[0]?.label).toBe('Today')
    expect(buckets[1]?.dayOffset).toBe(-1)
    expect(buckets[1]?.label).toBe('Yesterday')
    expect(buckets[2]?.label).toBe('2 days ago')
  })

  it('collects and filters catch-up programmes by channel and search query', () => {
    const now = 1731636000000
    const prog1: Programme = {
      id: 'p1',
      channelId: 'ch-xt-1',
      title: 'Planet Earth Special',
      desc: 'Documentary about deep oceans',
      category: 'Nature',
      episode: null,
      start: now - 7200000,
      stop: now - 3600000,
    }
    const prog2: Programme = {
      id: 'p2',
      channelId: 'ch-m3u-1',
      title: 'Drama Night',
      desc: 'Gripping detective story',
      category: 'Drama',
      episode: null,
      start: now - 14400000,
      stop: now - 10800000,
    }

    const schedules = {
      'ch-xt-1': [prog1],
      'ch-m3u-1': [prog2],
    }

    const all = collectCatchupProgrammes([baseChannel, m3uChannel], schedules, { now })
    expect(all).toHaveLength(2)

    // Filter by channel
    const onlyBbc = collectCatchupProgrammes([baseChannel, m3uChannel], schedules, {
      now,
      channelId: 'ch-xt-1',
    })
    expect(onlyBbc).toHaveLength(1)
    expect(onlyBbc[0]?.title).toBe('Planet Earth Special')

    // Filter by search query
    const searchDoc = collectCatchupProgrammes([baseChannel, m3uChannel], schedules, {
      now,
      searchQuery: 'ocean',
    })
    expect(searchDoc).toHaveLength(1)
    expect(searchDoc[0]?.title).toBe('Planet Earth Special')

    const searchNone = collectCatchupProgrammes([baseChannel, m3uChannel], schedules, {
      now,
      searchQuery: 'nonexistent-query-string',
    })
    expect(searchNone).toHaveLength(0)
  })
})
