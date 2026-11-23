// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  formatMacInput,
  isValidMacAddress,
  loadSavedStalkerPortals,
  saveStalkerPortal,
  removeSavedStalkerPortal,
  mapStalkerToKinoraChannels,
  mapStalkerVodToItems,
  stalkerToPlaylistReport,
  type SavedStalkerPortal,
} from './stalker'
import type { StalkerCatalogue } from './native'

describe('stalker library', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('formatMacInput', () => {
    it('formats unpunctuated hex input into colon-separated bytes', () => {
      expect(formatMacInput('001a79abcdef')).toBe('00:1A:79:AB:CD:EF')
    })

    it('ignores non-hex characters and truncates to 12 hex digits', () => {
      expect(formatMacInput('00-1A-79-XX-99-88-77-extra')).toBe('00:1A:79:99:88:77')
    })

    it('formats partial input cleanly as user types', () => {
      expect(formatMacInput('001')).toBe('00:1')
      expect(formatMacInput('001a')).toBe('00:1A')
      expect(formatMacInput('001a7')).toBe('00:1A:7')
    })
  })

  describe('isValidMacAddress', () => {
    it('accepts standard colon-separated MAC addresses', () => {
      expect(isValidMacAddress('00:1A:79:00:11:22')).toBe(true)
      expect(isValidMacAddress('AA:BB:CC:DD:EE:FF')).toBe(true)
    })

    it('rejects malformed, short, or invalid addresses', () => {
      expect(isValidMacAddress('00:1A:79:00:11')).toBe(false)
      expect(isValidMacAddress('00:1A:79:00:11:ZZ')).toBe(false)
      expect(isValidMacAddress('not-a-mac')).toBe(false)
      expect(isValidMacAddress('')).toBe(false)
    })
  })

  describe('portal storage', () => {
    it('saves and loads stalker portals from local storage', () => {
      const portal: SavedStalkerPortal = {
        id: 'portal-1',
        portalUrl: 'http://portal.example.com/c',
        mac: '00:1A:79:12:34:56',
        label: 'My MAG Server',
        channelCount: 150,
      }

      saveStalkerPortal(portal)
      const loaded = loadSavedStalkerPortals()
      expect(loaded).toHaveLength(1)
      expect(loaded[0]?.id).toBe('portal-1')
      expect(loaded[0]?.mac).toBe('00:1A:79:12:34:56')
      expect(loaded[0]?.channelCount).toBe(150)
    })

    it('updates existing portal by ID or URL/MAC match', () => {
      const portal1: SavedStalkerPortal = {
        id: 'portal-1',
        portalUrl: 'http://portal.example.com/c',
        mac: '00:1A:79:12:34:56',
        channelCount: 50,
      }
      saveStalkerPortal(portal1)

      const portal1Updated: SavedStalkerPortal = {
        id: 'portal-1',
        portalUrl: 'http://portal.example.com/c',
        mac: '00:1A:79:12:34:56',
        channelCount: 120,
      }
      saveStalkerPortal(portal1Updated)

      const loaded = loadSavedStalkerPortals()
      expect(loaded).toHaveLength(1)
      expect(loaded[0]?.channelCount).toBe(120)
    })

    it('removes saved portal cleanly', () => {
      saveStalkerPortal({
        id: 'portal-1',
        portalUrl: 'http://portal1.example.com',
        mac: '00:1A:79:11:11:11',
      })
      saveStalkerPortal({
        id: 'portal-2',
        portalUrl: 'http://portal2.example.com',
        mac: '00:1A:79:22:22:22',
      })

      expect(loadSavedStalkerPortals()).toHaveLength(2)
      removeSavedStalkerPortal('portal-1')

      const remaining = loadSavedStalkerPortals()
      expect(remaining).toHaveLength(1)
      expect(remaining[0]?.id).toBe('portal-2')
    })
  })

  describe('catalogue mapping', () => {
    const mockCatalogue: StalkerCatalogue = {
      portalUrl: 'http://portal.example.com/server/load.php',
      mac: '00:1A:79:12:34:56',
      profile: {
        mac: '00:1A:79:12:34:56',
        name: 'Test Profile',
        status: 'Active',
        expDate: '2027-12-31',
        phone: null,
      },
      genres: [
        { id: '1', title: 'News', alias: 'news' },
        { id: '2', title: 'Sports', alias: 'sports' },
      ],
      channels: [
        {
          id: '101',
          number: 1,
          name: 'BBC World News',
          cmd: 'ffmpeg http://stream.example.com/live/bbc.m3u8',
          logo: 'http://logos.example.com/bbc.png',
          genreId: '1',
        },
        {
          id: '102',
          number: 2,
          name: 'Sky Sports',
          cmd: 'auto /media/sky.ts',
          logo: null,
          genreId: '2',
        },
      ],
      vod: [
        {
          id: '501',
          name: 'Inception',
          cmd: 'ffrt http://stream.example.com/vod/inception.mp4',
          poster: 'http://posters.example.com/inception.jpg',
          year: '2010',
          categoryId: '10',
        },
      ],
    }

    it('maps stalker channels to Kinora channels with stalker:// stream scheme', () => {
      const channels = mapStalkerToKinoraChannels(mockCatalogue)
      expect(channels).toHaveLength(2)

      const bbc = channels[0]
      expect(bbc?.id).toBe('stalker-101')
      expect(bbc?.name).toBe('BBC World News')
      expect(bbc?.number).toBe(1)
      expect(bbc?.group).toBe('News')
      expect(bbc?.categories).toEqual(['News'])
      expect(bbc?.streamUrl).toBe('stalker://ffmpeg%20http%3A%2F%2Fstream.example.com%2Flive%2Fbbc.m3u8')
      expect(bbc?.logoUrl).toBe('http://logos.example.com/bbc.png')

      const sky = channels[1]
      expect(sky?.id).toBe('stalker-102')
      expect(sky?.name).toBe('Sky Sports')
      expect(sky?.number).toBe(2)
      expect(sky?.group).toBe('Sports')
      expect(sky?.streamUrl).toBe('stalker://auto%20%2Fmedia%2Fsky.ts')
    })

    it('converts stalker catalogue into a valid PlaylistReport', () => {
      const report = stalkerToPlaylistReport(mockCatalogue)
      expect(report.channels).toHaveLength(2)
      expect(report.channels[0]?.name).toBe('BBC World News')
      expect(report.channels[0]?.group).toBe('News')
      expect(report.channels[0]?.streamUrl).toBe('stalker://ffmpeg%20http%3A%2F%2Fstream.example.com%2Flive%2Fbbc.m3u8')
    })

    it('maps stalker vod items to normalized playable movie items', () => {
      const vodItems = mapStalkerVodToItems(mockCatalogue)
      expect(vodItems).toHaveLength(1)

      const inception = vodItems[0]
      expect(inception?.id).toBe('stalker-vod-501')
      expect(inception?.name).toBe('Inception')
      expect(inception?.year).toBe(2010)
      expect(inception?.streamUrl).toBe('stalker://ffrt%20http%3A%2F%2Fstream.example.com%2Fvod%2Finception.mp4')
      expect(inception?.poster).toBe('http://posters.example.com/inception.jpg')
    })
  })
})
