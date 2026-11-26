import { describe, it, expect } from 'vitest'
import { selectFeaturedSlides, isValidProgrammeTitle, hasGenuineProgrammeArt } from './featuredSelection'
import type { Channel, Programme, XtreamTitle } from '../data/types'
import type { MediaResource } from '../data/personalLibrary'

describe('featuredSelection', () => {
  const dummyChannel = (id: string, name: string, group: string, tone = '#ff3344'): Channel => ({
    id,
    name,
    number: 1,
    group,
    categories: [group],
    streamUrl: `http://example.com/${id}.m3u8`,
    mark: { text: id.slice(0, 3).toUpperCase(), tone },
    logoUrl: null,
    hd: true,
    sourceId: 'src-1',
    tvgId: id,
  })

  const dummyProgramme = (
    id: string,
    title: string,
    start: number,
    stop: number,
    extra: Partial<Programme> = {},
  ): Programme => ({
    id,
    title,
    start,
    stop,
    channelId: 'ch',
    category: 'General',
    episode: null,
    desc: 'A programme description',
    ...extra,
  })

  describe('isValidProgrammeTitle & hasGenuineProgrammeArt', () => {
    it('rejects invalid or placeholder programme titles', () => {
      expect(isValidProgrammeTitle(undefined)).toBe(false)
      expect(isValidProgrammeTitle(dummyProgramme('1', '', 0, 100))).toBe(false)
      expect(isValidProgrammeTitle(dummyProgramme('2', '.Off Air', 0, 100))).toBe(false)
      expect(isValidProgrammeTitle(dummyProgramme('3', 'Programmes start at 06:00', 0, 100))).toBe(false)
      expect(isValidProgrammeTitle(dummyProgramme('4', 'BBC ONE - Close Down', 0, 100))).toBe(false)
      expect(isValidProgrammeTitle(dummyProgramme('5', 'Planet Earth III', 0, 100))).toBe(true)
    })

    it('detects genuine programme art correctly', () => {
      expect(hasGenuineProgrammeArt(undefined)).toBe(false)
      expect(hasGenuineProgrammeArt(dummyProgramme('1', 'Test', 0, 100))).toBe(false)
      expect(hasGenuineProgrammeArt(dummyProgramme('2', 'Test', 0, 100, { icon: 'https://art.com/1.jpg' }))).toBe(true)
      expect(hasGenuineProgrammeArt(dummyProgramme('3', 'Test', 0, 100, { art: '/art/custom.jpg' }))).toBe(true)
    })
  })

  describe('selectFeaturedSlides in demo / sample mode', () => {
    it('returns 4 deterministic slides with harbour-lights first', () => {
      const slides = selectFeaturedSlides({
        now: 1000000,
        demoTitles: true,
      })
      expect(slides.length).toBe(4)
      expect(slides[0]?.id).toBe('harbour-lights')
      expect(slides[0]?.kind).toBe('movie')
      expect(slides[0]?.kicker).toBe('FEATURED MOVIE')
      expect(slides[1]?.id).toBe('ninth-ward')
      expect(slides[1]?.kind).toBe('series')
      expect(slides[1]?.kicker).toBe('FEATURED SERIES')
    })

    it('filters for kid safe content when isKidsMode is true', () => {
      const slides = selectFeaturedSlides({
        now: 1000000,
        demoTitles: true,
        isKidsMode: true,
      })
      expect(slides.length).toBeGreaterThan(0)
      for (const slide of slides) {
        expect(['U', 'PG', '12', '12A']).toContain(slide.certificate)
      }
    })
  })

  describe('selectFeaturedSlides in real user mode', () => {
    const now = 1700000000
    const channelA = dummyChannel('ch-news', 'BBC News', 'News')
    const channelB = dummyChannel('ch-drama', 'BBC One', 'General')
    const channelC = dummyChannel('ch-doc', 'BBC Four', 'Documentaries')

    it('rejects expired programmes that ended before now', () => {
      const expiredProgramme = dummyProgramme(
        'p-expired',
        'Morning Breakfast',
        now - 7200,
        now - 60,
        {
          desc: 'Expired morning show',
          icon: 'https://example.com/expired.jpg',
        },
      )

      const activeProgramme = dummyProgramme(
        'p-active',
        'Afternoon Live',
        now - 1800,
        now + 1800,
        {
          desc: 'Actively broadcasting now',
          icon: 'https://example.com/active.jpg',
        },
      )

      const programmeAt = (c: Channel) => {
        if (c.id === 'ch-news') return expiredProgramme
        if (c.id === 'ch-drama') return activeProgramme
        return undefined
      }

      const slides = selectFeaturedSlides({
        now,
        demoTitles: false,
        channels: [channelA, channelB],
        programmeAt,
      })

      // Active programme should be preferred as top slide with genuine details
      expect(slides.length).toBe(2)
      expect(slides[0]?.title).toBe('Afternoon Live')
      expect(slides[0]?.id).toBe('ch-drama')
      // Channel A has expired programme, so it falls back to channel title, not expired programme title
      expect(slides[1]?.title).toBe('BBC News')
    })

    it('scores candidates by genuine artwork, favourites, description, and remaining time', () => {
      const progWithoutArt = dummyProgramme(
        'p1',
        'Low Score Programme',
        now - 300,
        now + 600,
        { desc: 'Brief' },
      )

      const progWithAllBonus = dummyProgramme(
        'p2',
        'High Score Blockbuster',
        now - 600,
        now + 3600,
        {
          desc: 'An epic documentary exploring the outer solar system with stunning imagery.',
          icon: 'https://example.com/art.jpg',
        },
      )

      const programmeAt = (c: Channel) => {
        if (c.id === 'ch-drama') return progWithoutArt
        if (c.id === 'ch-doc') return progWithAllBonus
        return undefined
      }

      const slides = selectFeaturedSlides({
        now,
        demoTitles: false,
        channels: [channelA, channelB, channelC],
        programmeAt,
        favourites: ['channel:ch-doc'],
      })

      expect(slides[0]?.id).toBe('ch-doc')
      expect(slides[0]?.title).toBe('High Score Blockbuster')
    })

    it('enforces category diversity and channel uniqueness', () => {
      const channels = [
        dummyChannel('ch-news-1', 'News Channel 1', 'News'),
        dummyChannel('ch-news-2', 'News Channel 2', 'News'),
        dummyChannel('ch-drama-1', 'Drama 1', 'General'),
        dummyChannel('ch-sports-1', 'Sports 1', 'Sports'),
        dummyChannel('ch-doc-1', 'Doc 1', 'Documentaries'),
      ]

      const programmeAt = (c: Channel) =>
        dummyProgramme(`p-${c.id}`, `Live Show on ${c.name}`, now - 1000, now + 2000, {
          desc: `High definition broadcast on ${c.name}`,
          icon: `https://example.com/${c.id}.jpg`,
        })

      const slides = selectFeaturedSlides({
        now,
        demoTitles: false,
        channels,
        programmeAt,
      })

      // Should pick at most 1 item per channel
      const channelIds = slides.map((s) => s.id)
      const uniqueChannelIds = new Set(channelIds)
      expect(channelIds.length).toBe(uniqueChannelIds.size)

      // Top 4 slides should include different categories
      const categories = slides.map((s) => s.genres?.[0])
      expect(categories).toContain('News')
      expect(categories).toContain('General')
      expect(categories).toContain('Sports')
      expect(categories).toContain('Documentaries')
    })

    it('prioritizes on-demand movie/series when available from Xtream catalogue', () => {
      const movie: XtreamTitle = {
        id: '101',
        sourceId: 'src-1',
        name: 'Interstellar Voyage',
        year: 2024,
        artworkKey: 'art-voyage',
        extension: 'mp4',
        plot: 'A deep space exploration mission through an anomalous wormhole.',
        kind: 'movie',
        categoryId: 'cat-1',
      }

      const xtreamCatalogue = {
        movies: [movie],
        series: [],
      }

      const slides = selectFeaturedSlides({
        now,
        demoTitles: false,
        channels: [channelA, channelB],
        xtreamCatalogue,
      })

      expect(slides[0]?.kind).toBe('movie')
      expect(slides[0]?.title).toBe('Interstellar Voyage')
      expect(slides[0]?.kicker).toBe('Featured movie')
    })

    it('includes cultural / documentary media resource from personal media library', () => {
      const mediaLibrary: MediaResource[] = [
        {
          id: 'res-nasa',
          name: 'NASA Live Deep Space Stream',
          category: 'nature-science',
          subcategory: 'space',
          provider: 'NASA',
          resourceType: 'stream',
          url: 'https://nasa.gov/live',
          playbackUrl: 'https://nasa.gov/live.m3u8',
          description: 'Live imagery from Earth orbit and interplanetary probes.',
          artworkUrl: 'https://example.com/nasa.jpg',
          dateDiscovered: '2024-01-01',
          lastVerified: '2024-01-01',
          verificationStatus: 'verified',
          provides: 'Live feed',
          tags: ['space', 'science', 'nasa'],
          supportedByKinora: true,
          discoveryUrl: 'https://nasa.gov',
        },
      ]

      const slides = selectFeaturedSlides({
        now,
        demoTitles: false,
        channels: [channelA, channelB],
        mediaLibrary,
      })

      const mediaSlide = slides.find((s) => s.kind === 'media')
      expect(mediaSlide).toBeDefined()
      expect(mediaSlide?.title).toBe('NASA Live Deep Space Stream')
      expect(mediaSlide?.kicker).toBe('FEATURED NATURE SCIENCE')
    })
  })
})
