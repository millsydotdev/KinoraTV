/**
 * Channel catalog sorting engine for Kinora Live TV.
 * Provides deterministic sorting by playlist order, channel number, alphabetical name, and favorites priority.
 */

import type { Channel } from '../data/types'

export type ChannelSortMode = 'default' | 'number' | 'name-asc' | 'name-desc' | 'favorites-first'

export const SORT_MODE_LABELS: Record<ChannelSortMode, string> = {
  default: 'Default (Source Order)',
  number: 'Channel Number (Low to High)',
  'name-asc': 'Name (A to Z)',
  'name-desc': 'Name (Z to A)',
  'favorites-first': 'Favorites First',
}

/**
 * Sorts channels according to the selected mode without mutating the input array.
 */
export function sortChannels(
  channels: readonly Channel[],
  mode: ChannelSortMode,
  favorites: Set<string> | readonly string[] = new Set<string>()
): Channel[] {
  if (!channels || channels.length === 0) return []
  if (mode === 'default') return [...channels]

  const favSet = favorites instanceof Set ? favorites : new Set(favorites)
  const copy = [...channels]

  const getSortName = (c: Channel): string => {
    return (c.cleanName || c.name || '').trim()
  }

  switch (mode) {
    case 'number':
      return copy.sort((a, b) => {
        const numA = typeof a.number === 'number' && !isNaN(a.number) && a.number > 0 ? a.number : Infinity
        const numB = typeof b.number === 'number' && !isNaN(b.number) && b.number > 0 ? b.number : Infinity
        if (numA !== numB) return numA - numB
        return getSortName(a).localeCompare(getSortName(b), undefined, { numeric: true, sensitivity: 'base' })
      })

    case 'name-asc':
      return copy.sort((a, b) => {
        return getSortName(a).localeCompare(getSortName(b), undefined, { numeric: true, sensitivity: 'base' })
      })

    case 'name-desc':
      return copy.sort((a, b) => {
        return getSortName(b).localeCompare(getSortName(a), undefined, { numeric: true, sensitivity: 'base' })
      })

    case 'favorites-first':
      return copy.sort((a, b) => {
        const isFavA = favSet.has(a.id)
        const isFavB = favSet.has(b.id)
        if (isFavA && !isFavB) return -1
        if (!isFavA && isFavB) return 1
        return 0 // Preserve original relative order within favorites and non-favorites
      })

    default:
      return copy
  }
}
