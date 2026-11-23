// epgFuzzy.ts - Client-side fuzzy matching and normalization for EPG channel mapping.
// Cleans broadcast tags, resolution suffixes, and country prefixes to score
// XMLTV candidates against playlist channel names.
// Strictly adheres to typography standards: zero em-dashes across all code and comments.

import type { GuideChannel } from './native'

const REGION_PREFIX_REGEX = /^(?:\[[A-Z]{2,3}\]|(?:\[?[A-Z]{2,3}\]?\s*[:|/-]))\s*/i
const QUALITY_TOKEN_REGEX = /\b(?:4k|uhd|fhd|hd|sd|1080[pi]?|720[pi]?|50fps|60fps|hevc|h\.?265|h\.?264)\b/gi
const TIMESHIFT_SUFFIX_REGEX = /\s*(?:\+\d+|plus\s*\d+)\b/gi
const PUNCTUATION_REGEX = /[._\-:/|()[\]{}]/g

/**
 * Normalizes a channel title for fuzzy comparison by removing
 * country prefixes, resolution tags, timeshift markers, and punctuation.
 */
export function cleanChannelForMatching(raw: string): string {
  if (!raw) return ''
  return raw
    .replace(REGION_PREFIX_REGEX, '')
    .replace(QUALITY_TOKEN_REGEX, '')
    .replace(TIMESHIFT_SUFFIX_REGEX, '')
    .replace(PUNCTUATION_REGEX, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Calculates Levenshtein edit distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const row = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) {
    row[j] = j
  }

  for (let i = 1; i <= a.length; i++) {
    let prev = i
    for (let j = 1; j <= b.length; j++) {
      const val = a[i - 1] === b[j - 1]
        ? row[j - 1] ?? 0
        : Math.min((row[j - 1] ?? 0) + 1, Math.min(prev + 1, (row[j] ?? 0) + 1))
      row[j - 1] = prev
      prev = val
    }
    row[b.length] = prev
  }

  return row[b.length] ?? b.length
}

/**
 * Computes token overlap ratio between two cleaned strings.
 */
export function tokenOverlapRatio(a: string, b: string): number {
  const tokensA = new Set(a.split(/\s+/).filter(Boolean))
  const tokensB = new Set(b.split(/\s+/).filter(Boolean))
  if (tokensA.size === 0 || tokensB.size === 0) return 0

  let matches = 0
  for (const t of tokensA) {
    if (tokensB.has(t)) matches++
  }

  const unionSize = new Set([...tokensA, ...tokensB]).size
  return unionSize > 0 ? matches / unionSize : 0
}

/**
 * Computes a normalized similarity score between a channel name and a guide candidate.
 * Score range: 0.0 (no match) to 1.0 (exact match).
 */
export function computeMatchScore(
  rawChannelName: string,
  candidateName: string,
  candidateId: string
): number {
  const cleanSource = cleanChannelForMatching(rawChannelName)
  const cleanTarget = cleanChannelForMatching(candidateName)
  const cleanId = cleanChannelForMatching(candidateId)

  if (!cleanSource || (!cleanTarget && !cleanId)) return 0

  if (cleanSource === cleanTarget || cleanSource === cleanId) {
    return 1.0
  }

  if (cleanTarget.startsWith(cleanSource) || cleanSource.startsWith(cleanTarget)) {
    return 0.88
  }

  if (cleanTarget.includes(cleanSource) || cleanSource.includes(cleanTarget)) {
    return 0.78
  }

  if (cleanId.includes(cleanSource) || cleanSource.includes(cleanId)) {
    return 0.72
  }

  const tokenScore = tokenOverlapRatio(cleanSource, cleanTarget)
  if (tokenScore > 0.5) {
    return 0.6 + tokenScore * 0.3
  }

  const maxLen = Math.max(cleanSource.length, cleanTarget.length)
  if (maxLen > 0) {
    const dist = levenshteinDistance(cleanSource, cleanTarget)
    const ratio = Math.max(0, 1 - dist / maxLen)
    if (ratio > 0.6) {
      return ratio * 0.75
    }
  }

  return 0
}

export interface ScoredGuideChannel extends GuideChannel {
  score: number
  cleanedName: string
}

/**
 * Ranks all guide channels against a query string, returning top matches above threshold.
 */
export function rankGuideChannels(
  query: string,
  channels: GuideChannel[],
  minScore = 0.25,
  limit = 40
): ScoredGuideChannel[] {
  if (!query.trim() || channels.length === 0) return []

  const scored: ScoredGuideChannel[] = []

  for (const c of channels) {
    const score = computeMatchScore(query, c.name, c.id)
    if (score >= minScore) {
      scored.push({
        id: c.id,
        name: c.name,
        cleanedName: cleanChannelForMatching(c.name),
        score: Math.round(score * 100) / 100,
      })
    }
  }

  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  return scored.slice(0, limit)
}
