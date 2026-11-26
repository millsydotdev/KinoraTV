/**
 * Open Publication Distribution System (OPDS) Types for Kinora.
 *
 * Supports OPDS 1.2 (Atom-based) and OPDS 2.0 (JSON) book catalogues:
 * - Catalogue navigation feeds and subsections
 * - Publication metadata (title, authors, summary, language, publisher)
 * - Cover art and jacket images
 * - Acquisition links for supported formats (EPUB, PDF, HTML, TXT)
 * - Search templating (OpenSearch) and pagination
 *
 * Strictly adheres to the zero em-dash typography standard.
 */

export type EbookFormat = 'epub' | 'pdf' | 'html' | 'txt' | 'other'

export interface OpdsLink {
  rel: string
  href: string
  type?: string
  title?: string
}

export interface OpdsEntry {
  id: string
  title: string
  authors: string[]
  summary: string
  published?: string
  updated?: string
  coverUrl?: string | null
  thumbnailUrl?: string | null
  acquisitionLinks: OpdsLink[]
  supportedFormats: EbookFormat[]
}

export interface OpdsNavigation {
  title: string
  href: string
  rel: string
  type?: string
  count?: number
}

export interface OpdsCatalogConfig {
  id: string
  name: string
  url: string
  icon?: string
  isDefault?: boolean
  authToken?: string
  requiresAuth?: boolean
}

export interface OpdsFeedResult {
  id: string
  title: string
  subtitle?: string
  icon?: string
  navigation: OpdsNavigation[]
  entries: OpdsEntry[]
  searchUrl?: string | null
  nextPageUrl?: string | null
  prevPageUrl?: string | null
}
