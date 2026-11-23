// On-demand video (VOD) and Series multi-source aggregation engine for Kinora.
// De-duplicates titles across multiple sources and generates server stream variants.
// Strictly adheres to typography standards: zero em-dashes across all code and comments.

import type { StreamVariant, XtreamTitle } from '../data/types'
import { cleanChannelTitle } from '../state/playlists'

export interface AggregatedVodVariant {
  id: string
  sourceId: string
  sourceName: string
  streamId: string
  name: string
  quality: '4K' | '1080p' | '720p' | 'HD' | 'SD'
  extension: string
  streamUrl: string
}

export interface AggregatedVodTitle extends XtreamTitle {
  variants: AggregatedVodVariant[]
  totalSources: number
}

/**
 * Normalizes an on-demand title string into a clean base title, release year, and quality badge.
 */
export function normalizeVodTitle(rawName: string, fallbackYear?: number | null): {
  cleanTitle: string
  year: number | null
  quality: '4K' | '1080p' | '720p' | 'HD' | 'SD'
} {
  let title = rawName.trim()

  // Strip prefix tags like "EN | ", "UK: ", "FR - "
  title = title.replace(/^[A-Za-z]{2,3}\s*[\:\|\-]\s*/, '')

  // Detect quality level from raw title
  let quality: '4K' | '1080p' | '720p' | 'HD' | 'SD' = 'HD'
  const upper = rawName.toUpperCase()
  if (upper.includes('4K') || upper.includes('UHD') || upper.includes('2160P')) {
    quality = '4K'
  } else if (upper.includes('1080P') || upper.includes('FHD')) {
    quality = '1080p'
  } else if (upper.includes('720P')) {
    quality = '720p'
  } else if (upper.includes('SD') || upper.includes('480P')) {
    quality = 'SD'
  }

  // Extract year pattern like (2024), [2024], or standalone 2024
  let detectedYear: number | null = fallbackYear ?? null
  const yearMatch = title.match(/[\(\[\s](19\d\d|20\d\d)[\)\]\s]?/)
  if (yearMatch && yearMatch[1]) {
    detectedYear = parseInt(yearMatch[1], 10)
    title = title.replace(new RegExp(`[\\(\\[]?\\s*${yearMatch[1]}\\s*[\\)\\]]?`, 'g'), ' ')
  }

  // Strip quality tokens and bracketed info like [4K UHD], (1080p), FHD, etc.
  title = title.replace(/\[\s*(4K|UHD|2160P|1080P|720P|FHD|HD|SD|HEVC)[\s\w]*\]/gi, ' ')
  title = title.replace(/\(\s*(4K|UHD|2160P|1080P|720P|FHD|HD|SD|HEVC)[\s\w]*\)/gi, ' ')
  title = title.replace(/\b(4K|UHD|2160P|1080P|720P|FHD|HD|SD|HEVC)\b/gi, ' ')

  // Clean title casing and strip trailing punctuation/whitespace
  let clean = cleanChannelTitle(title).trim()
  clean = clean.replace(/[\s\-\:\.\(\)\[\]]+$/, '').trim()

  return {
    cleanTitle: clean || rawName.trim(),
    year: detectedYear,
    quality,
  }
}

/**
 * Builds a deterministic canonical deduplication key for a title.
 */
export function canonicalVodKey(cleanTitle: string, year: number | null): string {
  const normalized = cleanTitle
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim()
  return year ? `${normalized}:${year}` : normalized
}

/**
 * Aggregates a flat list of on-demand titles across multiple sources into deduplicated titles with variants.
 */
export function aggregateVodTitles(
  titles: XtreamTitle[],
  sourceNames: Record<string, string>,
): AggregatedVodTitle[] {
  const groups = new Map<string, { primary: XtreamTitle; variants: AggregatedVodVariant[] }>()

  for (const item of titles) {
    const { cleanTitle, year, quality } = normalizeVodTitle(item.name, item.year)
    const key = canonicalVodKey(cleanTitle, year)
    const srcName = sourceNames[item.sourceId] || 'Source'
    const streamId = String(item.id)
    const ext = item.extension || 'mp4'
    const streamUrl = `xtream://${item.sourceId}/${item.kind === 'series' ? 'series' : 'movie'}/${streamId}?ext=${ext}`

    const variant: AggregatedVodVariant = {
      id: `${item.sourceId}:${streamId}`,
      sourceId: item.sourceId,
      sourceName: srcName,
      streamId,
      name: `${srcName} (${quality})`,
      quality,
      extension: ext,
      streamUrl,
    }

    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, {
        primary: {
          ...item,
          name: cleanTitle,
          year: year ?? item.year,
        },
        variants: [variant],
      })
    } else {
      // Prioritize 4K/1080p over SD for primary item attributes
      const isHigherQuality =
        (quality === '4K' && existing.variants[0]?.quality !== '4K') ||
        (quality === '1080p' && existing.variants[0]?.quality !== '4K' && existing.variants[0]?.quality !== '1080p')

      if (isHigherQuality && item.plot) {
        existing.primary = {
          ...item,
          name: cleanTitle,
          year: year ?? item.year,
        }
      }
      existing.variants.push(variant)
    }
  }

  return Array.from(groups.values()).map(({ primary, variants }) => ({
    ...primary,
    variants,
    totalSources: new Set(variants.map((v) => v.sourceId)).size,
  }))
}

/**
 * Discovers all alternate stream variants for a given title across all active sources.
 * Formats results as StreamVariant objects compatible with the in-player server switcher.
 */
export function findAlternateVodVariants(
  titleName: string,
  year: number | null,
  allTitles: XtreamTitle[],
  sourceNames: Record<string, string>,
): StreamVariant[] {
  const { cleanTitle, year: detectedYear } = normalizeVodTitle(titleName, year)
  const targetKey = canonicalVodKey(cleanTitle, detectedYear)

  const matches = allTitles.filter((item) => {
    const itemNorm = normalizeVodTitle(item.name, item.year)
    return canonicalVodKey(itemNorm.cleanTitle, itemNorm.year) === targetKey
  })

  return matches.map((item, index) => {
    const { quality } = normalizeVodTitle(item.name, item.year)
    const srcName = sourceNames[item.sourceId] || `Server ${index + 1}`
    const streamId = String(item.id)
    const ext = item.extension || 'mp4'
    const streamUrl = `xtream://${item.sourceId}/${item.kind === 'series' ? 'series' : 'movie'}/${streamId}?ext=${ext}`

    return {
      id: `${item.sourceId}:${streamId}`,
      channelId: `${item.sourceId}:${streamId}`,
      sourceId: item.sourceId,
      sourceName: srcName,
      name: `${srcName} - ${quality}`,
      streamUrl,
      availability: 'untested',
      quality,
      providerChannelId: streamId,
    }
  })
}
