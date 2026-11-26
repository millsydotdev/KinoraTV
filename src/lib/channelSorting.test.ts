import { describe, expect, it } from 'vitest'
import { sortChannels } from './channelSorting'
import type { Channel } from '../data/types'

function makeTestChannel(id: string, name: string, number: number, cleanName?: string): Channel {
  return {
    id,
    name,
    cleanName,
    number,
    group: 'General',
    categories: ['General'],
    logoUrl: null,
    mark: { text: id, tone: 'neutral' },
    streamUrl: `http://example.com/${id}.m3u8`,
    hd: true,
    sourceId: 'src-1',
    tvgId: null,
  }
}

describe('channelSorting', () => {
  const c1 = makeTestChannel('ch-1', 'BBC One', 101)
  const c2 = makeTestChannel('ch-2', 'ITV 1', 103)
  const c3 = makeTestChannel('ch-3', 'Channel 4', 104)
  const c4 = makeTestChannel('ch-4', 'BBC Two', 102)
  const c5 = makeTestChannel('ch-5', 'Sky News', 0) // No valid channel number

  const list: Channel[] = [c1, c2, c3, c4, c5]

  it('preserves default playlist order', () => {
    const sorted = sortChannels(list, 'default')
    expect(sorted.map((c) => c.id)).toEqual(['ch-1', 'ch-2', 'ch-3', 'ch-4', 'ch-5'])
    expect(sorted).not.toBe(list) // Immutable clone
  })

  it('sorts by channel number in ascending order', () => {
    const sorted = sortChannels(list, 'number')
    expect(sorted.map((c) => c.id)).toEqual(['ch-1', 'ch-4', 'ch-2', 'ch-3', 'ch-5'])
  })

  it('sorts alphabetically by channel name (A to Z)', () => {
    const sorted = sortChannels(list, 'name-asc')
    expect(sorted.map((c) => c.name)).toEqual([
      'BBC One',
      'BBC Two',
      'Channel 4',
      'ITV 1',
      'Sky News',
    ])
  })

  it('sorts reverse alphabetically by channel name (Z to A)', () => {
    const sorted = sortChannels(list, 'name-desc')
    expect(sorted.map((c) => c.name)).toEqual([
      'Sky News',
      'ITV 1',
      'Channel 4',
      'BBC Two',
      'BBC One',
    ])
  })

  it('sorts favorites to the front while preserving relative order', () => {
    const favs = new Set(['ch-3', 'ch-5'])
    const sorted = sortChannels(list, 'favorites-first', favs)
    expect(sorted.map((c) => c.id)).toEqual(['ch-3', 'ch-5', 'ch-1', 'ch-2', 'ch-4'])
  })

  it('handles cleanName when present', () => {
    const custom = [
      makeTestChannel('ch-a', '[UK] Sky Sports 1', 1, 'Sky Sports 1'),
      makeTestChannel('ch-b', '[UK] BBC One', 2, 'BBC One'),
    ]
    const sorted = sortChannels(custom, 'name-asc')
    expect(sorted[0]?.id).toBe('ch-b')
    expect(sorted[1]?.id).toBe('ch-a')
  })

  it('handles empty channels safely', () => {
    expect(sortChannels([], 'name-asc')).toEqual([])
  })
})
