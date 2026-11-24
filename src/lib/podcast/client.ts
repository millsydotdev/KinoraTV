/**
 * Podcast Feed Client for Kinora.
 *
 * Fetches and parses remote RSS and Atom feeds.
 * Strictly adheres to the zero em-dash typography standard.
 */

import { parsePodcastXml } from './parser'
import type { PodcastParseResult } from './types'

export async function fetchPodcastFeed(feedUrl: string): Promise<PodcastParseResult> {
  const trimmed = feedUrl.trim()
  if (!trimmed) {
    throw new Error('Please enter a valid podcast RSS feed address.')
  }

  let text: string
  try {
    const res = await fetch(trimmed, {
      headers: {
        Accept: 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*',
      },
    })
    if (!res.ok) {
      throw new Error(`Feed server returned HTTP ${res.status} status.`)
    }
    text = await res.text()
  } catch (e) {
    throw new Error(`Could not download podcast feed: ${e instanceof Error ? e.message : 'Network error'}`)
  }

  try {
    return parsePodcastXml(text, trimmed)
  } catch (e) {
    throw new Error(`Failed to parse podcast feed XML: ${e instanceof Error ? e.message : 'Invalid XML'}`)
  }
}
