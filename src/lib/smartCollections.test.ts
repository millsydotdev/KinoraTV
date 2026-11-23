// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  matchesRule,
  evaluateSmartCollection,
  loadSmartCollections,
  createSmartCollection,
  updateSmartCollection,
  deleteSmartCollection,
  type SmartCollection,
  type UnifiedMediaItem,
} from './smartCollections'

const mockItems: UnifiedMediaItem[] = [
  {
    id: 'm-1',
    ref: 'movie:blade-runner',
    title: 'Blade Runner',
    mediaType: 'movie',
    genres: ['Sci-Fi', 'Thriller'],
    year: 1982,
    rating: 8.1,
    resolution: '4k',
    watchedStatus: 'unwatched',
    overview: 'A blade runner must pursue and terminate four replicants.',
  },
  {
    id: 'm-2',
    ref: 'movie:aliens',
    title: 'Aliens',
    mediaType: 'movie',
    genres: ['Sci-Fi', 'Action'],
    year: 1986,
    rating: 8.4,
    resolution: 'hd',
    watchedStatus: 'watched',
    overview: 'Ellen Ripley returns to LV-426 with colonial marines.',
  },
  {
    id: 'm-3',
    ref: 'series:cyberpunk',
    title: 'Cyberpunk Edgerunners',
    mediaType: 'series',
    genres: ['Animation', 'Sci-Fi'],
    year: 2022,
    rating: 8.3,
    resolution: '4k',
    watchedStatus: 'in-progress',
    overview: 'A street kid trying to survive in a technology and body modification-obsessed city.',
  },
  {
    id: 'm-4',
    ref: 'movie:comedy-gold',
    title: 'Laugh Out Loud',
    mediaType: 'movie',
    genres: ['Comedy'],
    year: 2020,
    rating: 6.5,
    resolution: 'sd',
    watchedStatus: 'unwatched',
  },
]

describe('smartCollections', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('matches individual rules accurately', () => {
    const item = mockItems[0]! // Blade Runner (1982, Sci-Fi, 4k, rating 8.1, unwatched)

    expect(matchesRule(item, { field: 'mediaType', value: 'movie' })).toBe(true)
    expect(matchesRule(item, { field: 'mediaType', value: 'series' })).toBe(false)

    expect(matchesRule(item, { field: 'genre', value: 'Sci-Fi' })).toBe(true)
    expect(matchesRule(item, { field: 'genre', value: 'Comedy' })).toBe(false)

    expect(matchesRule(item, { field: 'yearMin', value: 1980 })).toBe(true)
    expect(matchesRule(item, { field: 'yearMin', value: 1990 })).toBe(false)

    expect(matchesRule(item, { field: 'yearMax', value: 1985 })).toBe(true)
    expect(matchesRule(item, { field: 'yearMax', value: 1980 })).toBe(false)

    expect(matchesRule(item, { field: 'minRating', value: 8.0 })).toBe(true)
    expect(matchesRule(item, { field: 'minRating', value: 8.5 })).toBe(false)

    expect(matchesRule(item, { field: 'resolution', value: '4k' })).toBe(true)
    expect(matchesRule(item, { field: 'watchedStatus', value: 'unwatched' })).toBe(true)

    expect(matchesRule(item, { field: 'keyword', value: 'replicants' })).toBe(true)
    expect(matchesRule(item, { field: 'keyword', value: 'aliens' })).toBe(false)
  })

  it('evaluates collections with matchMode all (AND logic)', () => {
    const collection: SmartCollection = {
      id: 'sc-80s-scifi',
      name: '80s Sci-Fi',
      matchMode: 'all',
      rules: [
        { field: 'genre', value: 'Sci-Fi' },
        { field: 'yearMin', value: 1980 },
        { field: 'yearMax', value: 1989 },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    const result = evaluateSmartCollection(collection, mockItems)
    expect(result.map((i) => i.title)).toEqual(['Blade Runner', 'Aliens'])
  })

  it('evaluates collections with matchMode any (OR logic)', () => {
    const collection: SmartCollection = {
      id: 'sc-comedy-or-animation',
      name: 'Comedy or Animation',
      matchMode: 'any',
      rules: [
        { field: 'genre', value: 'Comedy' },
        { field: 'genre', value: 'Animation' },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    const result = evaluateSmartCollection(collection, mockItems)
    expect(result.map((i) => i.title)).toEqual(['Cyberpunk Edgerunners', 'Laugh Out Loud'])
  })

  it('sorts matched items by year, rating, or title', () => {
    const collection: SmartCollection = {
      id: 'sc-top',
      name: 'Top Rated',
      matchMode: 'all',
      rules: [{ field: 'minRating', value: 8.0 }],
      sortBy: 'rating',
      sortOrder: 'desc',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    const result = evaluateSmartCollection(collection, mockItems)
    expect(result.map((i) => i.title)).toEqual(['Aliens', 'Cyberpunk Edgerunners', 'Blade Runner'])
  })

  it('saves, loads, and manages collections in localStorage', () => {
    const starters = loadSmartCollections()
    expect(starters.length).toBeGreaterThan(0)

    const created = createSmartCollection({
      name: 'My Custom Collection',
      matchMode: 'all',
      rules: [{ field: 'resolution', value: '4k' }],
    })
    expect(created.id).toBeDefined()
    expect(created.name).toBe('My Custom Collection')

    let current = loadSmartCollections()
    expect(current.some((c) => c.id === created.id)).toBe(true)

    // Update
    updateSmartCollection(created.id, { name: 'Ultra HD Favorites' })
    current = loadSmartCollections()
    const updated = current.find((c) => c.id === created.id)
    expect(updated?.name).toBe('Ultra HD Favorites')

    // Delete
    const deleted = deleteSmartCollection(created.id)
    expect(deleted).toBe(true)
    current = loadSmartCollections()
    expect(current.some((c) => c.id === created.id)).toBe(false)
  })
})
