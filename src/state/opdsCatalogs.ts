/**
 * OPDS Catalogue Store for Kinora.
 *
 * Manages default and custom OPDS catalogue configurations in persistent storage.
 * Strictly adheres to the zero em-dash typography standard.
 */

import type { OpdsCatalogConfig } from '../lib/opds/types'

export const OPDS_CATALOGS_STORAGE_KEY = 'kinora.opds.catalogs.v1'

export const DEFAULT_OPDS_CATALOGS: OpdsCatalogConfig[] = [
  {
    id: 'opds-gutenberg',
    name: 'Project Gutenberg',
    url: 'https://m.gutenberg.org/ebooks.opds/',
    icon: 'book',
    isDefault: true,
  },
  {
    id: 'opds-standard-ebooks',
    name: 'Standard Ebooks',
    url: 'https://standardebooks.org/opds/all',
    icon: 'palette',
    isDefault: true,
  },
  {
    id: 'opds-feedbooks',
    name: 'Feedbooks Public Domain',
    url: 'https://www.feedbooks.com/publicdomain/browse/top.atom',
    icon: 'library',
    isDefault: true,
  },
]

export function getOpdsCatalogs(): OpdsCatalogConfig[] {
  try {
    const raw = localStorage.getItem(OPDS_CATALOGS_STORAGE_KEY)
    if (!raw) return DEFAULT_OPDS_CATALOGS
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_OPDS_CATALOGS
    }
    return parsed
  } catch {
    return DEFAULT_OPDS_CATALOGS
  }
}

export function saveOpdsCatalog(catalog: OpdsCatalogConfig): void {
  const current = getOpdsCatalogs()
  const idx = current.findIndex((c) => c.id === catalog.id || c.url === catalog.url)
  if (idx >= 0) {
    current[idx] = catalog
  } else {
    current.push(catalog)
  }
  try {
    localStorage.setItem(OPDS_CATALOGS_STORAGE_KEY, JSON.stringify(current))
  } catch {
    // Storage safety
  }
}

export function removeOpdsCatalog(catalogId: string): void {
  const current = getOpdsCatalogs().filter((c) => c.id !== catalogId)
  try {
    localStorage.setItem(OPDS_CATALOGS_STORAGE_KEY, JSON.stringify(current))
  } catch {
    // Storage safety
  }
}
