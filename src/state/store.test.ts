import { describe, expect, it } from 'vitest'
import { defaultPrefs, dropSourceRefs, emptyLibrary, sanitizePrefs } from './store'

describe('saved preferences', () => {
  it('drops the removed source-checking settings so they are no longer stored', () => {
    const stored = { ...defaultPrefs, autoRefresh: true, refreshInterval: '12h', validateOnAdd: true, dropAfterFailures: '5', parallelChecks: 8 }
    const clean = sanitizePrefs(stored)
    for (const key of ['autoRefresh', 'refreshInterval', 'validateOnAdd', 'dropAfterFailures', 'parallelChecks']) expect(key in clean).toBe(false)
    expect(clean).toEqual(defaultPrefs)
  })
})

describe('removing a playlist source from the library', () => {
  it('drops only that source’s channel references, wherever they are', () => {
    const library = {
      ...emptyLibrary,
      favourites: ['channel:pl-a~tvg_3a_one', 'channel:pl-ab~tvg_3a_x', 'movie:harbour-lights', 'channel:northlight-one'],
      watchlist: ['channel:pl-a~name_3a_ff', 'series:fathom'],
      history: [{ ref: 'channel:pl-a~tvg_3a_one', at: 1 }, { ref: 'movie:velvet-hour', at: 2 }],
      collections: [{ id: 'c1', name: 'Mixed', items: ['channel:pl-a~tvg_3a_one', 'movie:northbound'], createdAt: 1 }],
      recentSearches: ['news'],
    }
    const after = dropSourceRefs(library, 'pl-a')
    expect(after.favourites).toEqual(['channel:pl-ab~tvg_3a_x', 'movie:harbour-lights', 'channel:northlight-one'])
    expect(after.watchlist).toEqual(['series:fathom'])
    expect(after.history).toEqual([{ ref: 'movie:velvet-hour', at: 2 }])
    expect(after.collections[0]?.items).toEqual(['movie:northbound'])
    expect(after.recentSearches).toEqual(['news'])
  })
})
