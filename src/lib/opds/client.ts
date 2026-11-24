/**
 * OPDS Catalogue Client for Kinora.
 *
 * Downloads and parses remote OPDS catalogues, with search and pagination support.
 * Strictly adheres to the zero em-dash typography standard.
 */

import { parseOpdsCatalog } from './parser'
import type { OpdsFeedResult } from './types'

export async function fetchOpdsCatalogue(url: string, authToken?: string): Promise<OpdsFeedResult> {
  const trimmed = url.trim()
  if (!trimmed) {
    throw new Error('Please enter a valid OPDS catalogue address.')
  }

  const headers: Record<string, string> = {
    Accept: 'application/atom+xml, application/opds+json, application/xml, text/xml, */*',
  }
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`
  }

  let text: string
  try {
    const res = await fetch(trimmed, { headers })
    if (!res.ok) {
      throw new Error(`Catalogue server returned HTTP ${res.status} status.`)
    }
    text = await res.text()
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
