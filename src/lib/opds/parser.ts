/**
 * OPDS 1.2 (Atom) and OPDS 2.0 (JSON) Catalogue Parser for Kinora.
 *
 * Extracts publication entries, navigation hierarchies, covers, and acquisition links.
 * Strictly adheres to the zero em-dash typography standard.
 */

import type {
  EbookFormat,
  OpdsEntry,
  OpdsFeedResult,
  OpdsLink,
  OpdsNavigation,
} from './types'

export function classifyEbookFormat(mimeType?: string, href?: string): EbookFormat {
  const mime = (mimeType || '').toLowerCase()
  const cleanHref = ((href || '').split('?')[0] ?? '').toLowerCase()

  if (mime.includes('epub') || cleanHref.endsWith('.epub')) {
    return 'epub'
  }
  if (mime.includes('pdf') || cleanHref.endsWith('.pdf')) {
    return 'pdf'
  }
  if (mime.includes('html') || cleanHref.endsWith('.html') || cleanHref.endsWith('.htm')) {
    return 'html'
  }
  if (mime.includes('text/plain') || cleanHref.endsWith('.txt')) {
    return 'txt'
  }
  return 'other'
}

function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).href
  } catch {
    return href
  }
}

function cleanHtmlText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseOpdsCatalog(rawText: string, feedUrl: string): OpdsFeedResult {
  const trimmed = rawText.trim()
  if (trimmed.startsWith('{')) {
    return parseOpds2Json(trimmed, feedUrl)
  }
  return parseOpds1Atom(trimmed, feedUrl)
}

function parseOpds1Atom(xmlText: string, feedUrl: string): OpdsFeedResult {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'text/xml')

  const parserError = doc.querySelector('parsererror')
  if (parserError) {
    throw new Error('Malformed XML document received from OPDS feed.')
  }

  const feed = doc.documentElement
  const title = feed.querySelector('title')?.textContent?.trim() || 'OPDS Catalogue'
  const subtitle = feed.querySelector('subtitle')?.textContent?.trim() || undefined
  const feedId = feed.querySelector('id')?.textContent?.trim() || feedUrl
  const icon = feed.querySelector('icon')?.textContent?.trim() || undefined

  let searchUrl: string | null = null
  let nextPageUrl: string | null = null
  let prevPageUrl: string | null = null
  const navigation: OpdsNavigation[] = []

  // Top-level feed links
  const feedLinks = feed.querySelectorAll(':scope > link')
  feedLinks.forEach((link) => {
    const rel = link.getAttribute('rel') || ''
    const href = link.getAttribute('href') || ''
    const linkTitle = link.getAttribute('title') || 'Subsection'
    const type = link.getAttribute('type') || ''
    if (!href) return

    const absoluteHref = resolveUrl(href, feedUrl)

    if (rel === 'search') {
      searchUrl = absoluteHref
    } else if (rel === 'next') {
      nextPageUrl = absoluteHref
    } else if (rel === 'previous' || rel === 'prev') {
      prevPageUrl = absoluteHref
    } else if (rel === 'subsection' || rel === 'collection' || rel === 'start') {
      navigation.push({
        title: linkTitle,
        href: absoluteHref,
        rel,
        type,
      })
    }
  })

  // Parse entries
  const entryNodes = feed.querySelectorAll('entry')
  const entries: OpdsEntry[] = []

  entryNodes.forEach((entry) => {
    const entryId = entry.querySelector('id')?.textContent?.trim() || `entry-${entries.length + 1}`
    const entryTitle = entry.querySelector('title')?.textContent?.trim() || 'Untitled Document'
    const summary = cleanHtmlText(
      entry.querySelector('summary')?.textContent ||
        entry.querySelector('content')?.textContent ||
        '',
    )
    const published = entry.querySelector('published')?.textContent?.trim() || undefined
    const updated = entry.querySelector('updated')?.textContent?.trim() || undefined

    const authors: string[] = []
    const authorNodes = entry.querySelectorAll('author > name')
    authorNodes.forEach((a) => {
      const name = a.textContent?.trim()
      if (name && !authors.includes(name)) authors.push(name)
    })

    let coverUrl: string | null = null
    let thumbnailUrl: string | null = null
    const acquisitionLinks: OpdsLink[] = []
    const formatsSet = new Set<EbookFormat>()

    const links = entry.querySelectorAll('link')
    links.forEach((l) => {
      const rel = l.getAttribute('rel') || ''
      const href = l.getAttribute('href') || ''
      const type = l.getAttribute('type') || ''
      const linkTitle = l.getAttribute('title') || undefined
      if (!href) return

      const absoluteHref = resolveUrl(href, feedUrl)

      // Image & Cover
      if (
        rel === 'http://opds-spec.org/image' ||
        rel === 'http://opds-spec.org/cover' ||
        rel === 'x-cover'
      ) {
        coverUrl = absoluteHref
      } else if (
        rel === 'http://opds-spec.org/image/thumbnail' ||
        rel === 'http://opds-spec.org/thumbnail' ||
        rel === 'thumbnail'
      ) {
        thumbnailUrl = absoluteHref
      } else if (rel.startsWith('http://opds-spec.org/acquisition') || rel === 'enclosure') {
        const fmt = classifyEbookFormat(type, absoluteHref)
        formatsSet.add(fmt)
        acquisitionLinks.push({
          rel,
          href: absoluteHref,
          type,
          title: linkTitle || fmt.toUpperCase(),
        })
      } else if (rel === 'subsection' || rel === 'collection') {
        // Navigation entry (subcatalogue)
        navigation.push({
          title: entryTitle,
          href: absoluteHref,
          rel,
          type,
        })
      }
    })

    // If entry is a publication (has title and acquisitions/summary)
    if (acquisitionLinks.length > 0 || !links.length) {
      entries.push({
        id: entryId,
        title: entryTitle,
        authors: authors.length > 0 ? authors : ['Unknown Author'],
        summary,
        published,
        updated,
        coverUrl: coverUrl || thumbnailUrl,
        thumbnailUrl: thumbnailUrl || coverUrl,
        acquisitionLinks,
        supportedFormats: Array.from(formatsSet),
      })
    }
  })

  return {
    id: feedId,
    title,
    subtitle,
    icon,
    navigation,
    entries,
    searchUrl,
    nextPageUrl,
    prevPageUrl,
  }
}

function parseOpds2Json(jsonText: string, feedUrl: string): OpdsFeedResult {
  const data = JSON.parse(jsonText)
  const meta = data.metadata || {}
  const title = meta.title || 'OPDS 2.0 Catalogue'
  const subtitle = meta.description || undefined
  const feedId = meta.identifier || feedUrl

  const navigation: OpdsNavigation[] = []
  const entries: OpdsEntry[] = []

  // Links
  let searchUrl: string | null = null
  let nextPageUrl: string | null = null
  let prevPageUrl: string | null = null

  const links = Array.isArray(data.links) ? data.links : []
  links.forEach((l: Record<string, string>) => {
    const rel = l.rel || ''
    const href = resolveUrl(l.href || '', feedUrl)
    if (rel === 'search') searchUrl = href
    else if (rel === 'next') nextPageUrl = href
    else if (rel === 'previous') prevPageUrl = href
  })

  // Navigation
  const navList = Array.isArray(data.navigation) ? data.navigation : []
  navList.forEach((n: Record<string, unknown>) => {
    navigation.push({
      title: String(n.title || 'Subsection'),
      href: resolveUrl(String(n.href || ''), feedUrl),
      rel: String(n.rel || 'subsection'),
      type: typeof n.type === 'string' ? n.type : undefined,
    })
  })

  // Publications
  const pubs = Array.isArray(data.publications) ? data.publications : []
  pubs.forEach((p: Record<string, unknown>) => {
    const pMeta = (p.metadata as Record<string, unknown>) || {}
    const pTitle = String(pMeta.title || 'Untitled Publication')
    const summary = cleanHtmlText(String(pMeta.description || ''))

    const authors: string[] = []
    if (Array.isArray(pMeta.author)) {
      pMeta.author.forEach((a: unknown) => {
        if (typeof a === 'string') authors.push(a)
        else if (typeof a === 'object' && a !== null && 'name' in a) {
          authors.push(String((a as { name: string }).name))
        }
      })
    }

    let coverUrl: string | null = null
    const images = Array.isArray(p.images) ? p.images : []
    images.forEach((img: Record<string, string>) => {
      if (img.href) coverUrl = resolveUrl(img.href, feedUrl)
    })

    const acquisitionLinks: OpdsLink[] = []
    const formatsSet = new Set<EbookFormat>()

    const pLinks = Array.isArray(p.links) ? p.links : []
    pLinks.forEach((l: Record<string, string>) => {
      const rel = l.rel || ''
      const href = resolveUrl(l.href || '', feedUrl)
      const type = l.type || ''
      if (rel.includes('acquisition')) {
        const fmt = classifyEbookFormat(type, href)
        formatsSet.add(fmt)
        acquisitionLinks.push({
          rel,
          href,
          type,
          title: l.title || fmt.toUpperCase(),
        })
      }
    })

    entries.push({
      id: String(pMeta.identifier || pTitle),
      title: pTitle,
      authors: authors.length > 0 ? authors : ['Unknown Author'],
      summary,
      coverUrl,
      thumbnailUrl: coverUrl,
      acquisitionLinks,
      supportedFormats: Array.from(formatsSet),
    })
  })

  return {
    id: feedId,
    title,
    subtitle,
    navigation,
    entries,
    searchUrl,
    nextPageUrl,
    prevPageUrl,
  }
}
