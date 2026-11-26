import type { Channel } from '../data/types'

export interface Bouquet {
  id: string
  name: string
  channelIds: string[]
  icon?: string
  createdAt: number
  updatedAt: number
}

export interface BouquetConfig {
  version: 1
  hiddenCategories: string[]
  categoryOrder: string[]
  bouquets: Bouquet[]
}

const DEFAULT_CONFIG: BouquetConfig = {
  version: 1,
  hiddenCategories: [],
  categoryOrder: [],
  bouquets: [],
}

export function getBouquetStorageKey(profileId?: string): string {
  return profileId ? `kinora.bouquets.v1.${profileId}` : 'kinora.bouquets.v1'
}

export function loadBouquetConfig(profileId?: string): BouquetConfig {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_CONFIG }
  try {
    const raw = localStorage.getItem(getBouquetStorageKey(profileId))
    if (!raw) return { ...DEFAULT_CONFIG }
    const parsed = JSON.parse(raw) as Partial<BouquetConfig>
    return {
      version: 1,
      hiddenCategories: Array.isArray(parsed.hiddenCategories) ? parsed.hiddenCategories : [],
      categoryOrder: Array.isArray(parsed.categoryOrder) ? parsed.categoryOrder : [],
      bouquets: Array.isArray(parsed.bouquets) ? parsed.bouquets : [],
    }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveBouquetConfig(config: BouquetConfig, profileId?: string): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(getBouquetStorageKey(profileId), JSON.stringify(config))
  } catch {
    // LocalStorage quota or access error handled gracefully
  }
}

export function isCategoryHidden(category: string, config: BouquetConfig): boolean {
  return config.hiddenCategories.includes(category)
}

export function toggleCategoryVisibility(category: string, profileId?: string): boolean {
  const config = loadBouquetConfig(profileId)
  const isHidden = config.hiddenCategories.includes(category)
  let nextHidden: string[]
  if (isHidden) {
    nextHidden = config.hiddenCategories.filter((c) => c !== category)
  } else {
    nextHidden = [...config.hiddenCategories, category]
  }
  const nextConfig: BouquetConfig = {
    ...config,
    hiddenCategories: nextHidden,
  }
  saveBouquetConfig(nextConfig, profileId)
  return isHidden // Returns true if it was unhidden (now visible), false if hidden
}

export function setCategoryVisibility(category: string, visible: boolean, profileId?: string): void {
  const config = loadBouquetConfig(profileId)
  const isCurrentlyHidden = config.hiddenCategories.includes(category)
  if (visible && isCurrentlyHidden) {
    saveBouquetConfig({
      ...config,
      hiddenCategories: config.hiddenCategories.filter((c) => c !== category),
    }, profileId)
  } else if (!visible && !isCurrentlyHidden) {
    saveBouquetConfig({
      ...config,
      hiddenCategories: [...config.hiddenCategories, category],
    }, profileId)
  }
}

export function reorderCategories(newOrder: string[], profileId?: string): void {
  const config = loadBouquetConfig(profileId)
  saveBouquetConfig({
    ...config,
    categoryOrder: newOrder,
  }, profileId)
}

export function applyCategoryPreferences(categories: string[], config: BouquetConfig): string[] {
  // 1. Filter out hidden categories
  const visible = categories.filter((cat) => !config.hiddenCategories.includes(cat))

  // 2. Apply custom ordering if specified
  if (!config.categoryOrder || config.categoryOrder.length === 0) {
    return visible
  }

  const orderMap = new Map<string, number>()
  config.categoryOrder.forEach((cat, index) => {
    orderMap.set(cat, index)
  })

  return [...visible].sort((a, b) => {
    const orderA = orderMap.has(a) ? orderMap.get(a)! : 9999
    const orderB = orderMap.has(b) ? orderMap.get(b)! : 9999
    if (orderA !== orderB) return orderA - orderB
    return a.localeCompare(b)
  })
}

export function createBouquet(
  name: string,
  channelIds: string[],
  icon?: string,
  profileId?: string,
): Bouquet {
  const config = loadBouquetConfig(profileId)
  const trimmed = name.trim() || 'My Channels'
  const bouquet: Bouquet = {
    id: `bq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: trimmed,
    channelIds: Array.from(new Set(channelIds)),
    icon: icon || 'sparkles',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  const nextConfig: BouquetConfig = {
    ...config,
    bouquets: [...config.bouquets, bouquet],
  }
  saveBouquetConfig(nextConfig, profileId)
  return bouquet
}

export function updateBouquet(
  id: string,
  updates: Partial<Pick<Bouquet, 'name' | 'channelIds' | 'icon'>>,
  profileId?: string,
): Bouquet | null {
  const config = loadBouquetConfig(profileId)
  const index = config.bouquets.findIndex((b) => b.id === id)
  if (index === -1) return null

  const existing = config.bouquets[index]!
  const updated: Bouquet = {
    ...existing,
    name: updates.name !== undefined ? updates.name.trim() || existing.name : existing.name,
    channelIds: updates.channelIds !== undefined ? Array.from(new Set(updates.channelIds)) : existing.channelIds,
    icon: updates.icon !== undefined ? updates.icon : existing.icon,
    updatedAt: Date.now(),
  }

  const nextBouquets = [...config.bouquets]
  nextBouquets[index] = updated
  saveBouquetConfig({
    ...config,
    bouquets: nextBouquets,
  }, profileId)

  return updated
}

export function deleteBouquet(id: string, profileId?: string): boolean {
  const config = loadBouquetConfig(profileId)
  const filtered = config.bouquets.filter((b) => b.id !== id)
  if (filtered.length === config.bouquets.length) return false
  saveBouquetConfig({
    ...config,
    bouquets: filtered,
  }, profileId)
  return true
}

export function getChannelsForBouquet(bouquet: Bouquet, allChannels: Channel[]): Channel[] {
  const idSet = new Set(bouquet.channelIds)
  return allChannels.filter((c) => idSet.has(c.id))
}
