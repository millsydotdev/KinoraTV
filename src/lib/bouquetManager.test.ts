// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadBouquetConfig,
  saveBouquetConfig,
  isCategoryHidden,
  toggleCategoryVisibility,
  setCategoryVisibility,
  reorderCategories,
  applyCategoryPreferences,
  createBouquet,
  updateBouquet,
  deleteBouquet,
  getChannelsForBouquet,
  type BouquetConfig,
} from './bouquetManager'
import type { Channel } from '../data/types'

const mockChannel = (id: string, name: string): Channel => ({
  id,
  name,
  number: 1,
  group: 'Sports',
  categories: ['Sports'],
  logoUrl: null,
  mark: { text: 'S', tone: 'emerald' },
  streamUrl: 'http://example.com/live',
  hd: true,
  sourceId: null,
  tvgId: null,
})

describe('bouquetManager', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('loads default empty config when nothing is in localStorage', () => {
    const config = loadBouquetConfig()
    expect(config.hiddenCategories).toEqual([])
    expect(config.categoryOrder).toEqual([])
    expect(config.bouquets).toEqual([])
  })

  it('saves and loads config correctly', () => {
    const customConfig: BouquetConfig = {
      version: 1,
      hiddenCategories: ['Adult', 'Shopping'],
      categoryOrder: ['Sports', 'Movies', 'News'],
      bouquets: [],
    }
    saveBouquetConfig(customConfig)
    const loaded = loadBouquetConfig()
    expect(loaded.hiddenCategories).toEqual(['Adult', 'Shopping'])
    expect(loaded.categoryOrder).toEqual(['Sports', 'Movies', 'News'])
  })

  it('supports profile-scoped storage keys', () => {
    const config1: BouquetConfig = {
      version: 1,
      hiddenCategories: ['Adult'],
      categoryOrder: [],
      bouquets: [],
    }
    const config2: BouquetConfig = {
      version: 1,
      hiddenCategories: ['Horror'],
      categoryOrder: [],
      bouquets: [],
    }
    saveBouquetConfig(config1, 'profile-1')
    saveBouquetConfig(config2, 'profile-2')

    expect(loadBouquetConfig('profile-1').hiddenCategories).toEqual(['Adult'])
    expect(loadBouquetConfig('profile-2').hiddenCategories).toEqual(['Horror'])
  })

  it('toggles category visibility', () => {
    expect(isCategoryHidden('Sports', loadBouquetConfig())).toBe(false)

    // Hide Sports
    const unhidden1 = toggleCategoryVisibility('Sports')
    expect(unhidden1).toBe(false)
    expect(isCategoryHidden('Sports', loadBouquetConfig())).toBe(true)

    // Unhide Sports
    const unhidden2 = toggleCategoryVisibility('Sports')
    expect(unhidden2).toBe(true)
    expect(isCategoryHidden('Sports', loadBouquetConfig())).toBe(false)
  })

  it('sets category visibility explicitly', () => {
    setCategoryVisibility('News', false)
    expect(isCategoryHidden('News', loadBouquetConfig())).toBe(true)

    setCategoryVisibility('News', true)
    expect(isCategoryHidden('News', loadBouquetConfig())).toBe(false)
  })

  it('reorders categories according to custom order', () => {
    reorderCategories(['News', 'Sports', 'Movies'])
    const loaded = loadBouquetConfig()
    expect(loaded.categoryOrder).toEqual(['News', 'Sports', 'Movies'])
  })

  it('applies category preferences (filtering and ordering)', () => {
    const rawCategories = ['Movies', 'Adult', 'Sports', 'Documentary', 'News']
    const config: BouquetConfig = {
      version: 1,
      hiddenCategories: ['Adult'],
      categoryOrder: ['News', 'Sports'],
      bouquets: [],
    }

    const result = applyCategoryPreferences(rawCategories, config)
    expect(result).not.toContain('Adult')
    // News and Sports should come first in that order, followed by alphabetical for the rest
    expect(result[0]).toBe('News')
    expect(result[1]).toBe('Sports')
    expect(result.slice(2)).toEqual(['Documentary', 'Movies'])
  })

  it('creates, updates, and deletes custom bouquets', () => {
    const b1 = createBouquet('Weekend Sports', ['ch-1', 'ch-2'], 'trophy')
    expect(b1.id).toBeDefined()
    expect(b1.name).toBe('Weekend Sports')
    expect(b1.channelIds).toEqual(['ch-1', 'ch-2'])
    expect(b1.icon).toBe('trophy')

    let config = loadBouquetConfig()
    expect(config.bouquets).toHaveLength(1)
    expect(config.bouquets[0]?.name).toBe('Weekend Sports')

    // Update bouquet
    const updated = updateBouquet(b1.id, { name: 'Super Sports', channelIds: ['ch-1', 'ch-3'] })
    expect(updated?.name).toBe('Super Sports')
    expect(updated?.channelIds).toEqual(['ch-1', 'ch-3'])

    config = loadBouquetConfig()
    expect(config.bouquets[0]?.name).toBe('Super Sports')

    // Delete bouquet
    const deleted = deleteBouquet(b1.id)
    expect(deleted).toBe(true)
    config = loadBouquetConfig()
    expect(config.bouquets).toHaveLength(0)
  })

  it('resolves channels for a bouquet', () => {
    const c1 = mockChannel('ch-1', 'Channel 1')
    const c2 = mockChannel('ch-2', 'Channel 2')
    const c3 = mockChannel('ch-3', 'Channel 3')
    const all = [c1, c2, c3]

    const bouquet = createBouquet('Favorites', ['ch-1', 'ch-3'])
    const resolved = getChannelsForBouquet(bouquet, all)
    expect(resolved).toEqual([c1, c3])
  })
})
