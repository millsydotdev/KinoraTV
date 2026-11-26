/**
 * Podcast Feed Client for Kinora.
 *
 * Fetches and parses remote RSS and Atom feeds.
 * Routes through Rust's guarded native HTTP client inside Tauri (CSP-safe, anti-SSRF)
 * and falls back to browser fetch in web preview and unit tests.
 * Strictly adheres to the zero em-dash typography standard.
 */

import { fetchFeedXml, inNativeShell } from '../native'
import { parsePodcastXml } from './parser'
import type { PodcastParseResult } from './types'

const PODCAST_ACCEPT = 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*'

export async function fetchPodcastFeed(feedUrl: string): Promise<PodcastParseResult> {
  const trimmed = feedUrl.trim()
  if (!trimmed) {
    throw new Error('Please enter a valid podcast RSS feed address.')
  }

  let text: string
  try {
    if (inNativeShell()) {
      const nativeText = await fetchFeedXml(trimmed, PODCAST_ACCEPT)
      if (nativeText === null) {
        throw new Error('Native feed fetcher returned an empty response.')
      }
      text = nativeText
    } else {
      const res = await fetch(trimmed, {
        headers: {
          Accept: PODCAST_ACCEPT,
        },
      })
      if (!res.ok) {
        throw new Error(`Feed server returned HTTP ${res.status} status.`)
      }
      text = await res.text()
    }
  } catch (e) {
    throw new Error(`Could not download podcast feed: ${e instanceof Error ? e.message : 'Network error'}`)
  }

  try {
    return parsePodcastXml(text, trimmed)
  } catch (e) {
    throw new Error(`Failed to parse podcast feed XML: ${e instanceof Error ? e.message : 'Invalid XML'}`)
  }
}
