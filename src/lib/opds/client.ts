/**
 * OPDS Catalogue Client for Kinora.
 *
 * Downloads and parses remote OPDS catalogues, with search and pagination support.
 * Routes through Rust's guarded native HTTP client inside Tauri (CSP-safe, anti-SSRF)
 * and falls back to browser fetch in web preview and unit tests.
 * Strictly adheres to the zero em-dash typography standard.
 */

import { fetchFeedXml, inNativeShell } from '../native'
import { parseOpdsCatalog } from './parser'
import type { OpdsFeedResult } from './types'

const OPDS_ACCEPT = 'application/atom+xml, application/opds+json, application/xml, text/xml, */*'

export async function fetchOpdsCatalogue(url: string, authToken?: string): Promise<OpdsFeedResult> {
  const trimmed = url.trim()
  if (!trimmed) {
    throw new Error('Please enter a valid OPDS catalogue address.')
  }

  let text: string
  try {
    if (inNativeShell() && !authToken) {
      const nativeText = await fetchFeedXml(trimmed, OPDS_ACCEPT)
      if (nativeText === null) {
        throw new Error('Native catalogue fetcher returned an empty response.')
      }
      text = nativeText
    } else {
      const headers: Record<string, string> = {
        Accept: OPDS_ACCEPT,
      }
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`
      }
      const res = await fetch(trimmed, { headers })
      if (!res.ok) {
        throw new Error(`Catalogue server returned HTTP ${res.status} status.`)
      }
      text = await res.text()
    }
  } catch (e) {
    throw new Error(`Could not reach OPDS catalogue: ${e instanceof Error ? e.message : 'Network error'}`)
  }

  try {
    return parseOpdsCatalog(text, trimmed)
  } catch (e) {
    throw new Error(`Failed to parse OPDS catalogue: ${e instanceof Error ? e.message : 'Invalid document'}`)
  }
}

export function buildOpdsSearchUrl(templateUrl: string, searchTerms: string): string {
  const encoded = encodeURIComponent(searchTerms.trim())
  if (templateUrl.includes('{searchTerms}')) {
    return templateUrl.replace(/\{searchTerms\}/g, encoded)
  }
  const separator = templateUrl.includes('?') ? '&' : '?'
  return `${templateUrl}${separator}q=${encoded}`
}
