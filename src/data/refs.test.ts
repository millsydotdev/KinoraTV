import { describe, expect, it } from 'vitest'
import { m3uCatchupRef, registerLocalMediaLookups, registerRecordingLookup, registerResourceLookup, resolve } from './refs'
import type { LocalEpisode, LocalMovie, LocalSeries } from '../lib/native'

describe('refs resolution', () => {
  it('resolves local movie with registered catalogue metadata and direct stream URL', () => {
    const mockMovie: LocalMovie = {
      id: 'lm_test_123',
      libraryId: 'lib_1',
      filePath: '/storage/movies/SciFi.2024.mp4',
      title: 'Sci-Fi Odyssey',
      year: 2024,
      edition: 'Director Cut',
      resolution: '4K',
      container: 'MP4',
      fileSizeBytes: 4_000_000_000,
      durationSecs: 7200,
      artPath: 'kstream://localhost/local/lm_test_123/art',
      backdropPath: 'kstream://localhost/local/lm_test_123/backdrop',
      discoveredAt: 1700000000,
      modifiedAt: 1700000000,
    }

    registerLocalMediaLookups(
      (id) => (id === 'lm_test_123' ? mockMovie : undefined),
      () => undefined,
    )

    const resolved = resolve('local-movie:lm_test_123')
    expect(resolved).toBeDefined()
    if (resolved && resolved.kind === 'movie') {
      expect(resolved.title).toBe('Sci-Fi Odyssey')
      expect(resolved.streamUrl).toBe('kstream://localhost/local/lm_test_123/stream')
      expect(resolved.art).toBe('kstream://localhost/local/lm_test_123/art')
      if ('runtime' in resolved.item) {
        expect(resolved.item.year).toBe(2024)
        expect(resolved.item.runtime).toBe(120)
      }
    }
  })

  it('resolves local episode with registered episode and series metadata', () => {
    const mockEp: LocalEpisode = {
      id: 'le_ep_1',
      seriesId: 'ls_series_1',
      filePath: '/storage/tv/Show.S01E02.mkv',
      seasonNumber: 1,
      episodeNumber: 2,
      title: 'The Great Discovery',
      fileSizeBytes: 1_200_000_000,
      durationSecs: 3000,
      artPath: 'kstream://localhost/local/le_ep_1/art',
      resolution: '1080p',
      container: 'MKV',
    }

    const mockSeries: LocalSeries = {
      id: 'ls_series_1',
      libraryId: 'lib_tv',
      folderPath: '/storage/tv/Show',
      title: 'Space Odyssey Series',
      year: 2023,
      artPath: 'kstream://localhost/local/ls_series_1/art',
      backdropPath: null,
      seasons: [{ seasonNumber: 1, episodes: [mockEp] }],
    }

    registerLocalMediaLookups(
      () => undefined,
      (id) => (id === 'le_ep_1' ? { episode: mockEp, series: mockSeries } : undefined),
    )

    const resolved = resolve('local-episode:le_ep_1')
    expect(resolved).toBeDefined()
    if (resolved && resolved.kind === 'episode') {
      expect(resolved.title).toBe('The Great Discovery')
      expect(resolved.streamUrl).toBe('kstream://localhost/local/le_ep_1/stream')
      expect(resolved.meta).toContain('Space Odyssey Series')
    }
  })

  it('resolves DVR recording with registered recording metadata', () => {
    registerRecordingLookup((id) =>
      id === 'rec_789'
        ? {
            id: 'rec_789',
            title: 'Evening News Special',
            channelName: 'BBC One HD',
            durationSecs: 1800,
          }
        : undefined,
    )

    const resolved = resolve('recording:rec_789')
    expect(resolved).toBeDefined()
    expect(resolved?.kind).toBe('recording')
    expect(resolved?.title).toBe('Evening News Special')
    expect(resolved?.meta).toContain('BBC One HD')
  })

  it('resolves public discovery resource with registered resource metadata', () => {
    registerResourceLookup((id) =>
      id === 'archive_film_42'
        ? {
            id: 'archive_film_42',
            name: 'Voyage to the Moon',
            description: 'Classic silent film from 1902',
            category: 'movies',
            subcategory: 'scifi',
            provider: 'Internet Archive',
            playbackUrl: 'https://archive.org/stream/moon.m3u8',
            artworkUrl: 'https://archive.org/poster/moon.jpg',
          }
        : undefined,
    )

    const resolved = resolve('res:archive_film_42')
    expect(resolved).toBeDefined()
    if (resolved && resolved.kind === 'movie') {
      expect(resolved.kind).toBe('movie')
      expect(resolved.title).toBe('Voyage to the Moon')
      expect(resolved.streamUrl).toBe('https://archive.org/stream/moon.m3u8')
      expect(resolved.art).toBe('https://archive.org/poster/moon.jpg')
      expect(resolved.meta).toContain('Internet Archive')
    } else {
      expect.fail('Expected movie resolution')
    }
  })

  it('resolves M3U catchup references with timeshift query parameters', () => {
    const ch = {
      id: 'ch-test-m3u',
      number: 10,
      name: 'Sky Sports Main Event',
      group: 'Sports',
      categories: ['Sports'],
      logoUrl: 'https://img.example/sky.png',
      mark: { text: 'SKY', tone: '#0f172a' },
      streamUrl: 'https://streams.example/sports.m3u8',
      hd: true,
      sourceId: 'pl-1',
      tvgId: 'skysports.uk',
      catchupType: 'append',
      catchupSource: '?utc=${start}&lutc=${timestamp}',
    }
    const ref = m3uCatchupRef('ch-test-m3u', 1731636000, 90, 1731641400)
    const res = resolve(ref, Date.now(), (id) => (id === 'ch-test-m3u' ? (ch as any) : undefined), undefined, false)
    expect(res).toBeDefined()
    expect(res?.kind).toBe('catchup')
    if (res && res.kind === 'catchup') {
      expect(res.title).toBe('Sky Sports Main Event (Catch-up)')
      expect(res.streamUrl).toContain('catchup://m3u/?')
      expect(res.streamUrl).toContain('url=https%3A%2F%2Fstreams.example%2Fsports.m3u8')
      expect(res.streamUrl).toContain('start=1731636000')
      expect(res.streamUrl).toContain('dur=90')
      expect(res.streamUrl).toContain('stop=1731641400')
    }
  })
})
