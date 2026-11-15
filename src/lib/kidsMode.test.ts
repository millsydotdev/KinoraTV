import { describe, it, expect } from 'vitest'
import {
  isTitleKidSafe,
  isChannelKidSafe,
  isProgrammeKidSafe,
  isResourceKidSafe,
  isSearchQueryKidSafe,
  isRefKidSafe,
  filterKidSafeChannels,
  filterKidSafeTitles,
  filterKidSafeResources,
} from './kidsMode'
import type { Channel, Movie, Programme } from '../data/types'
import type { MediaResource } from '../data/personalLibrary'

describe('kidsMode safety engine', () => {
  describe('isTitleKidSafe', () => {
    it('allows titles with U and PG ratings', () => {
      const uMovie = { certificate: 'U', genres: ['Animation', 'Family'] } as unknown as Movie
      const pgMovie = { certificate: 'PG', genres: ['Adventure'] } as unknown as Movie
      expect(isTitleKidSafe(uMovie)).toBe(true)
      expect(isTitleKidSafe(pgMovie)).toBe(true)
    })

    it('blocks titles with 12, 12A, 15, and 18 ratings', () => {
      expect(isTitleKidSafe({ certificate: '12', genres: ['Action'] } as unknown as Movie)).toBe(false)
      expect(isTitleKidSafe({ certificate: '12A', genres: ['Action'] } as unknown as Movie)).toBe(false)
      expect(isTitleKidSafe({ certificate: '15', genres: ['Thriller'] } as unknown as Movie)).toBe(false)
      expect(isTitleKidSafe({ certificate: '18', genres: ['Horror'] } as unknown as Movie)).toBe(false)
    })

    it('blocks mature and horror genres even if unrated', () => {
      expect(isTitleKidSafe({ genres: ['Horror', 'Mystery'] } as unknown as Movie)).toBe(false)
      expect(isTitleKidSafe({ genres: ['Erotic'] } as unknown as Movie)).toBe(false)
      expect(isTitleKidSafe({ genres: ['Crime', 'Thriller'] } as unknown as Movie)).toBe(false)
    })

    it('blocks mature plot terms', () => {
      const movieWithViolentSynopsis = {
        genres: ['Drama'],
        synopsis: 'A brutal murder leaves detectives searching for an assassin.',
      } as unknown as Movie
      expect(isTitleKidSafe(movieWithViolentSynopsis)).toBe(false)
    })

    it('enforces explicit unrated content policy', () => {
      // Unrated family/animation with no blocked terms is allowed
      const unratedFamily = {
        title: 'Gentle Meadow Adventures',
        genres: ['Animation', 'Family'],
      } as unknown as Movie
      expect(isTitleKidSafe(unratedFamily)).toBe(true)

      // Unrated unclassified content with no genres is blocked
      const unratedUnclassified = {
        title: 'Unknown Title Without Genre',
        genres: [],
      } as unknown as Movie
      expect(isTitleKidSafe(unratedUnclassified)).toBe(false)

      // Unrated mature drama/crime without safe categories is blocked
      const unratedMatureDrama = {
        title: 'Grim City Secrets',
        genres: ['Drama', 'Mystery'],
      } as unknown as Movie
      expect(isTitleKidSafe(unratedMatureDrama)).toBe(false)
    })
  })

  describe('isChannelKidSafe', () => {
    it('allows family, kids, and public broadcast channels', () => {
      const cbeebies: Channel = {
        id: 'cbeebies',
        sourceId: 'src-1',
        tvgId: 'cbeebies.uk',
        name: 'CBeebies',
        number: 201,
        group: 'Children',
        categories: ['Children', 'Animation'],
        mark: { tone: '#00f', text: 'CB' },
        streamUrl: 'https://example.com/cbeebies.m3u8',
        logoUrl: null,
        hd: true,
      }
      expect(isChannelKidSafe(cbeebies)).toBe(true)
    })

    it('blocks adult groups and channels with adult identifiers', () => {
      const adultChannel: Channel = {
        id: 'adult-ch',
        sourceId: 'src-1',
        tvgId: 'adult.uk',
        name: 'Late Night Adult TV',
        number: 999,
        group: 'Adult 18+',
        categories: ['Adult'],
        mark: { tone: '#000', text: 'AD' },
        streamUrl: 'https://example.com/stream.m3u8',
        logoUrl: null,
        hd: false,
      }
      expect(isChannelKidSafe(adultChannel)).toBe(false)
    })

    it('blocks channels with explicit names or horror themes', () => {
      const horrorChannel: Channel = {
        id: 'horror-ch',
        sourceId: 'src-1',
        tvgId: 'horror.uk',
        name: 'Slasher Movies HD',
        number: 300,
        group: 'Movies',
        categories: ['Horror', 'Cinema'],
        mark: { tone: '#900', text: 'SL' },
        streamUrl: 'https://example.com/stream.m3u8',
        logoUrl: null,
        hd: true,
      }
      expect(isChannelKidSafe(horrorChannel)).toBe(false)
    })
  })

  describe('isProgrammeKidSafe', () => {
    it('allows children animations and nature programmes', () => {
      const cartoonProg: Programme = {
        id: 'p1',
        channelId: 'ch1',
        title: 'Bluey: The Beach',
        desc: 'Bluey finds a beautiful shell on the beach with family.',
        category: 'Children',
        start: 1000,
        stop: 2000,
        episode: null,
      }
      expect(isProgrammeKidSafe(cartoonProg)).toBe(true)
    })

    it('blocks mature rated or late night adult broadcasts', () => {
      const adultProg: Programme = {
        id: 'p2',
        channelId: 'ch1',
        title: 'Late Night Erotica 18+',
        desc: 'Explicit adult entertainment rated 18.',
        category: 'Adult',
        start: 1000,
        stop: 2000,
        episode: null,
      }
      expect(isProgrammeKidSafe(adultProg)).toBe(false)
    })
  })

  describe('isResourceKidSafe', () => {
    it('allows educational and story podcasts', () => {
      const safeResource = {
        id: 'res-stories',
        name: 'Bedtime Stories for Kids',
        provider: 'StoryTime',
        category: 'podcasts',
        streamUrl: 'https://example.com/podcast.mp3',
        description: 'Gentle bedtime stories and fairy tales for children.',
        tags: ['kids', 'bedtime', 'family'],
      } as unknown as MediaResource
      expect(isResourceKidSafe(safeResource)).toBe(true)
    })

    it('blocks resources marked with adult or violent tags', () => {
      const matureResource = {
        id: 'res-true-crime',
        name: 'Serial Killers: The Brutal Murders',
        provider: 'CrimeNet',
        category: 'podcasts',
        streamUrl: 'https://example.com/crime.mp3',
        description: 'Detailed analysis of gruesome serial murders and executions.',
        tags: ['true-crime', 'murder', 'horror'],
      } as unknown as MediaResource
      expect(isResourceKidSafe(matureResource)).toBe(false)
    })
  })

  describe('isSearchQueryKidSafe', () => {
    it('allows benign search queries', () => {
      expect(isSearchQueryKidSafe('peppa pig')).toBe(true)
      expect(isSearchQueryKidSafe('nature documentary')).toBe(true)
      expect(isSearchQueryKidSafe('bbc news')).toBe(true)
      expect(isSearchQueryKidSafe('football')).toBe(true)
    })

    it('flags explicit keywords', () => {
      expect(isSearchQueryKidSafe('porn')).toBe(false)
      expect(isSearchQueryKidSafe('xxx adult videos')).toBe(false)
      expect(isSearchQueryKidSafe('erotic film')).toBe(false)
      expect(isSearchQueryKidSafe('nsfw content')).toBe(false)
    })
  })

  describe('filtering collections with Kids Mode active', () => {
    it('filters channel lists when Kids Mode is on and keeps all when off', () => {
      const channels: Channel[] = [
        {
          id: 'c1',
          sourceId: 'src-1',
          tvgId: 'c1',
          name: 'CBeebies',
          number: 1,
          group: 'Kids',
          categories: ['Children'],
          mark: { tone: '#00f', text: 'CB' },
          streamUrl: 'https://example.com/1.m3u8',
          logoUrl: null,
          hd: true,
        },
        {
          id: 'c2',
          sourceId: 'src-1',
          tvgId: 'c2',
          name: 'Midnight XXX',
          number: 2,
          group: 'Adult',
          categories: ['Adult'],
          mark: { tone: '#000', text: 'XX' },
          streamUrl: 'https://example.com/2.m3u8',
          logoUrl: null,
          hd: false,
        },
      ]

      const filteredWhenOn = filterKidSafeChannels(channels, true)
      expect(filteredWhenOn).toHaveLength(1)
      expect(filteredWhenOn[0]?.name).toBe('CBeebies')

      const preservedWhenOff = filterKidSafeChannels(channels, false)
      expect(preservedWhenOff).toHaveLength(2)
    })

    it('filters titles with filterKidSafeTitles when Kids Mode is on and keeps all when off', () => {
      const titles = [
        { id: 't1', title: 'Adventures in Toyland', certificate: 'U', genres: ['Family', 'Animation'] } as unknown as Movie,
        { id: 't2', title: 'Nightmare in Blood', certificate: '18', genres: ['Horror', 'Slasher'] } as unknown as Movie,
      ]

      const on = filterKidSafeTitles(titles, true)
      expect(on).toHaveLength(1)
      expect(on[0]?.title).toBe('Adventures in Toyland')

      const off = filterKidSafeTitles(titles, false)
      expect(off).toHaveLength(2)
    })

    it('filters discovered resources with filterKidSafeResources in Kids Mode', () => {
      const resources = [
        {
          id: 'res-kids',
          name: 'Kids Story Audiobooks',
          description: 'Classic bedtime stories and children audiobooks',
          category: 'audiobooks',
          tags: ['kids', 'bedtime', 'family'],
        } as unknown as MediaResource,
        {
          id: 'res-adult',
          name: 'Adult 18+ Uncensored',
          description: 'Explicit adult entertainment archive',
          category: 'archives',
          tags: ['adult', '18+'],
        } as unknown as MediaResource,
      ]

      const on = filterKidSafeResources(resources, true)
      expect(on).toHaveLength(1)
      expect(on[0]?.id).toBe('res-kids')

      const off = filterKidSafeResources(resources, false)
      expect(off).toHaveLength(2)
    })

    it('validates reference strings with isRefKidSafe in Kids Mode', () => {
      const mockChannel = { id: 'cbeebies', name: 'CBeebies', group: 'Kids', categories: ['Children'] } as Channel
      const mockAdultChannel = { id: 'adult1', name: 'Adult 18+', group: 'Adult', categories: ['Adult'] } as Channel
      const mockMovie = { id: 'm1', title: 'Toy Story', certificate: 'U', genres: ['Animation'] } as Movie
      const mockAdultMovie = { id: 'm2', title: 'Horror Night', certificate: '18', genres: ['Horror'] } as Movie

      const findChannel = (id: string) => (id === 'cbeebies' ? mockChannel : id === 'adult1' ? mockAdultChannel : undefined)
      const findTitle = (id: string) => (id === 'm1' ? mockMovie : id === 'm2' ? mockAdultMovie : undefined)

      // When Kids Mode is OFF, all refs are allowed
      expect(isRefKidSafe('channel:cbeebies', false, findChannel, findTitle)).toBe(true)
      expect(isRefKidSafe('channel:adult1', false, findChannel, findTitle)).toBe(true)
      expect(isRefKidSafe('movie:m2', false, findChannel, findTitle)).toBe(true)

      // When Kids Mode is ON, only safe refs are allowed
      expect(isRefKidSafe('channel:cbeebies', true, findChannel, findTitle)).toBe(true)
      expect(isRefKidSafe('movie:m1', true, findChannel, findTitle)).toBe(true)
      expect(isRefKidSafe('channel:adult1', true, findChannel, findTitle)).toBe(false)
      expect(isRefKidSafe('movie:m2', true, findChannel, findTitle)).toBe(false)
      expect(isRefKidSafe('channel:unknown', true, findChannel, findTitle)).toBe(false)
    })
  })
})
