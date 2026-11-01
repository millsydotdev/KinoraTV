import { describe, expect, it } from 'vitest'
import { demoLibrary, emptyLibrary, type Library } from '../state/store'
import { isFictionalRef, realLibrary } from './migrate'

const real = 'channel:pl-abc~tvg_3a_one'

describe('separating sample activity from a real library', () => {
  it('leaves nothing of the old sample library', () => {
    expect(realLibrary(demoLibrary(1000))).toEqual(emptyLibrary)
  })

  it('keeps everything real, in order, next to sample entries', () => {
    const mixed: Library = {
      ...emptyLibrary,
      favourites: ['movie:harbour-lights', real],
      watchlist: [real],
      watched: ['episode:ninth-ward/s1e1', real],
      progress: { 'movie:glasshouse': { pos: 1, dur: 2, at: 3 }, [real]: { pos: 4, dur: 5, at: 6 } },
      history: [{ ref: 'channel:pitchside', at: 1 }, { ref: real, at: 2 }],
      collections: [
        { id: 'c-rainy', name: 'Rainy Sunday', items: ['movie:velvet-hour'], createdAt: 1 },
        { id: 'c-night', name: 'Night shift', items: ['movie:undertow', real], createdAt: 2 },
        { id: 'c-mine', name: 'Mine', items: [], createdAt: 3 },
      ],
      reminders: ['pitchside@100', 'pl-abc~tvg_3a_one@200'],
      recentSearches: ['harbour', 'news'],
    }
    const out = realLibrary(mixed)
    expect(out.favourites).toEqual([real])
    expect(out.watchlist).toEqual([real])
    expect(out.watched).toEqual([real])
    expect(Object.keys(out.progress)).toEqual([real])
    expect(out.history).toEqual([{ ref: real, at: 2 }])
    expect(out.collections.map((c) => [c.id, c.items])).toEqual([['c-night', [real]], ['c-mine', []]])
    expect(out.reminders).toEqual(['pl-abc~tvg_3a_one@200'])
    expect(out.recentSearches).toEqual(['news'])
  })

  it('a sample id that is not in the catalogue is not treated as sample', () => {
    expect(isFictionalRef('movie:not-in-catalogue')).toBe(false)
    expect(isFictionalRef('movie:harbour-lights')).toBe(true)
    expect(isFictionalRef('channel:northlight-one')).toBe(true)
    expect(isFictionalRef(real)).toBe(false)
  })
})
