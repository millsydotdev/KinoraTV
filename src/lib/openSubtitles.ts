// openSubtitles.ts - Guarded subtitle search and download client for OpenSubtitles REST API.
// Fetches subtitles through native Rust SSRF-guarded network policy.
// Strictly adheres to typography standards: zero em-dashes across all code and comments.

import { fetchSubtitle } from './native'

export interface SubtitleSearchResult {
  id: string
  fileName: string
  language: string
  format: 'vtt' | 'srt'
  downloadCount: number
  hearingImpaired: boolean
  downloadUrl: string
  rating?: number
}

export interface SubtitleSearchOptions {
  language?: string
  season?: number
  episode?: number
  hearingImpaired?: boolean
  apiKey?: string
}

/** Formats language code to human-readable label. */
export function formatSubtitleLanguage(langCode: string): string {
  const map: Record<string, string> = {
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    it: 'Italian',
    pt: 'Portuguese',
    nl: 'Dutch',
    pl: 'Polish',
    ru: 'Russian',
    ja: 'Japanese',
    ko: 'Korean',
    zh: 'Chinese',
    ar: 'Arabic',
    tr: 'Turkish',
    sv: 'Swedish',
    no: 'Norwegian',
    da: 'Danish',
    fi: 'Finnish',
  }
  return map[langCode.toLowerCase()] || langCode.toUpperCase()
}

/**
 * Searches OpenSubtitles REST API v1 for matching subtitle files.
 */
export async function searchOpenSubtitles(
  query: string,
  options: SubtitleSearchOptions = {},
): Promise<SubtitleSearchResult[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const params = new URLSearchParams()
  params.set('query', trimmed)

  if (options.language) {
    params.set('languages', options.language.toLowerCase())
  }
  if (options.season !== undefined && options.season > 0) {
    params.set('season_number', String(options.season))
  }
  if (options.episode !== undefined && options.episode > 0) {
    params.set('episode_number', String(options.episode))
  }
  if (options.hearingImpaired !== undefined) {
    params.set('hearing_impaired', options.hearingImpaired ? 'include' : 'exclude')
  }

  const endpoint = `https://api.opensubtitles.com/api/v1/subtitles?${params.toString()}`

  try {
    const raw = await fetchSubtitle(endpoint, options.apiKey)
    if (!raw) return []

    const parsed = JSON.parse(raw) as {
      data?: Array<{
        id: string
        attributes?: {
          language?: string
          format?: string
          download_count?: number
          hearing_impaired?: boolean
          ratings?: number
          files?: Array<{ file_id?: number; file_name?: string }>
          url?: string
        }
      }>
    }

    if (!parsed || !Array.isArray(parsed.data)) return []

    const results: SubtitleSearchResult[] = []
    for (const item of parsed.data) {
      const attrs = item.attributes
      if (!attrs) continue

      const firstFile = attrs.files?.[0]
      const fileName = firstFile?.file_name || `${trimmed}.srt`
      const isVtt = fileName.toLowerCase().endsWith('.vtt')
      const downloadUrl = `https://dl.opensubtitles.org/subtitles/${firstFile?.file_id || item.id}.${isVtt ? 'vtt' : 'srt'}`

      results.push({
        id: item.id,
        fileName,
        language: attrs.language || 'en',
        format: isVtt ? 'vtt' : 'srt',
        downloadCount: attrs.download_count || 0,
        hearingImpaired: Boolean(attrs.hearing_impaired),
        downloadUrl,
        rating: attrs.ratings,
      })
    }

    return results
  } catch {
    return []
  }
}

/**
 * Downloads raw subtitle text (SRT or WebVTT) from an approved subtitle host.
 */
export async function downloadSubtitleText(
  downloadUrl: string,
  apiKey?: string,
): Promise<string | null> {
  if (!downloadUrl) return null
  return await fetchSubtitle(downloadUrl, apiKey)
}
