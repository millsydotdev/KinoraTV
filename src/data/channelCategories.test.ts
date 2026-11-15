import { describe, expect, it } from 'vitest'
import {
  LIVE_TV_CATEGORIES,
  classifyChannelCategory,
  extractChannelLocation,
  formatServerLabel,
  getCategoryIcon,
} from './channelCategories'
import type { Channel, StreamVariant } from './types'

const makeChannel = (overrides: Partial<Channel> = {}): Channel => {
  const grp = overrides.group ?? 'Entertainment'
  return {
    id: 'ch-1',
    number: 1,
    name: 'Test Channel',
    group: grp,
    categories: overrides.categories ?? [grp],
    logoUrl: null,
    mark: { text: 'TC', tone: '#2f4a6b' },
    streamUrl: 'https://example.com/live.m3u8',
    hd: true,
    sourceId: 'src-1',
    tvgId: null,
    ...overrides,
  }
}

describe('LIVE_TV_CATEGORIES', () => {
  it('defines all 18 standard categories with valid house icons', () => {
    expect(LIVE_TV_CATEGORIES).toHaveLength(18)
    const expected = [
      'Entertainment',
      'Movies',
      'Series',
      'Sports',
      'News',
      'Kids',
      'Documentary',
      'Music',
      'Radio',
      'Lifestyle',
      'Factual',
      'Education',
      'Culture and Arts',
      'Nature and Science',
      'International',
      'Regional',
      'General',
      'Other',
    ]
    const actualNames = LIVE_TV_CATEGORIES.map((c) => c.name)
    expect(actualNames).toEqual(expected)

    for (const cat of LIVE_TV_CATEGORIES) {
      expect(cat.id).toBeTruthy()
      expect(cat.name).toBeTruthy()
      expect(cat.icon).toBeTruthy()
      expect(cat.description).toBeTruthy()
      expect(cat.subcategories.length).toBeGreaterThan(0)
    }
  })

  it('maps category names to icons consistently', () => {
    expect(getCategoryIcon('Movies')).toBe('film')
    expect(getCategoryIcon('Cinema')).toBe('film')
    expect(getCategoryIcon('Sports HD')).toBe('sports')
    expect(getCategoryIcon('News 24')).toBe('news')
    expect(getCategoryIcon('Kids & Family')).toBe('star')
    expect(getCategoryIcon('Documentary')).toBe('documentary')
    expect(getCategoryIcon('Music')).toBe('music')
    expect(getCategoryIcon('Radio')).toBe('radio')
    expect(getCategoryIcon('Lifestyle')).toBe('heart')
    expect(getCategoryIcon('Education')).toBe('education')
    expect(getCategoryIcon('Culture and Arts')).toBe('palette')
    expect(getCategoryIcon('Nature and Science')).toBe('nature')
    expect(getCategoryIcon('International')).toBe('globe')
    expect(getCategoryIcon('Regional')).toBe('radar')
    expect(getCategoryIcon('General')).toBe('tv')
    expect(getCategoryIcon('Unknown Strange Group')).toBe('folder')
  })

  it('extracts country and region from tvg-id and channel title', () => {
    const ukChannel = makeChannel({ tvgId: 'bbcone.uk@Scotland', name: 'BBC One Scotland' })
    const loc1 = extractChannelLocation(ukChannel)
    expect(loc1.country).toBe('United Kingdom')
    expect(loc1.countryCode).toBe('UK')
    expect(loc1.region).toBe('Scotland')

    const usChannel = makeChannel({ tvgId: 'cnn.us', name: 'CNN USA' })
    const loc2 = extractChannelLocation(usChannel)
    expect(loc2.country).toBe('United States')
    expect(loc2.countryCode).toBe('US')

    const textChannel = makeChannel({ name: 'Sky News [UK]', group: 'UK: News' })
    const loc3 = extractChannelLocation(textChannel)
    expect(loc3.country).toBe('United Kingdom')
    expect(loc3.countryCode).toBe('UK')
  })

  it('classifies channels into recognisable canonical categories', () => {
    expect(classifyChannelCategory(makeChannel({ group: 'Movies & Cinema' })).category).toBe('Movies')
    expect(classifyChannelCategory(makeChannel({ group: 'Live Sports HD' })).category).toBe('Sports')
    expect(classifyChannelCategory(makeChannel({ group: 'World News' })).category).toBe('News')
    expect(classifyChannelCategory(makeChannel({ group: 'Kids Cartoons' })).category).toBe('Kids')
    expect(classifyChannelCategory(makeChannel({ group: 'Classical Music' })).category).toBe('Music')
    expect(classifyChannelCategory(makeChannel({ group: 'FM Radio Stations' })).category).toBe('Radio')
    expect(classifyChannelCategory(makeChannel({ group: 'History & Documentaries' })).category).toBe('Documentary')
    expect(classifyChannelCategory(makeChannel({ group: 'Food & Cooking' })).category).toBe('Lifestyle')
  })

  it('formats clean, informative server labels without leaking credentials or URLs', () => {
    const variant: StreamVariant = {
      id: 'v1',
      channelId: 'ch-1',
      sourceId: 's1',
      sourceName: 'IPTV Provider A',
      country: 'United Kingdom',
      region: 'Scotland',
      quality: 'HD',
      resolution: '1080p',
      availability: 'available',
      streamUrl: 'https://user:secret@stream.example.com/pass/live.m3u8',
    }

    const label = formatServerLabel(variant, 1)
    expect(label).toBe('Server 1 - IPTV Provider A - Scotland - HD')
    expect(label).not.toContain('https://')
    expect(label).not.toContain('secret')
    expect(label).not.toContain('pass')
  })
})
