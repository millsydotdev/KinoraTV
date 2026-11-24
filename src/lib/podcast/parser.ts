/**
 * RSS 2.0, iTunes, and Atom Podcast Feed Parser for Kinora.
 *
 * Extracts podcast channels, episode audio enclosures, duration, and artwork.
 * Strictly adheres to the zero em-dash typography standard.
 */

import type { PodcastEpisode, PodcastParseResult } from './types'

export function parsePodcastDuration(raw: string | null | undefined): { text: string; ms: number | null } {
  if (!raw || !raw.trim()) {
    return { text: 'Unknown duration', ms: null }
  }

  const trimmed = raw.trim()

  // Pure integer seconds (e.g. "3600")
  if (/^\d+$/.test(trimmed)) {
    const totalSec = parseInt(trimmed, 10)
    const totalMs = totalSec * 1000
    const mins = Math.round(totalSec / 60)
    return { text: `${mins} min`, ms: totalMs }
  }

  // Time format: HH:MM:SS or MM:SS
  const parts = trimmed.split(':').map((p) => parseInt(p, 10))
  if (parts.some(isNaN)) {
    return { text: trimmed, ms: null }
  }

  let totalSec = 0
  if (parts.length === 3) {
    totalSec = (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0)
  } else if (parts.length === 2) {
    totalSec = (parts[0] ?? 0) * 60 + (parts[1] ?? 0)
  } else {
    totalSec = parts[0] ?? 0
  }

  const mins = Math.round(totalSec / 60)
  return { text: `${mins} min`, ms: totalSec * 1000 }
}

export function isAudioEnclosure(mimeType: string, url: string): boolean {
  const mime = mimeType.toLowerCase()
  if (
    mime.startsWith('audio/') ||
    mime === 'application/ogg' ||
    mime === 'application/x-mpegurl'
  ) {
    return true
  }
  const cleanUrl = (url.split('?')[0] ?? '').toLowerCase()
  return (
    cleanUrl.endsWith('.mp3') ||
    cleanUrl.endsWith('.m4a') ||
    cleanUrl.endsWith('.aac') ||
    cleanUrl.endsWith('.ogg') ||
    cleanUrl.endsWith('.wav') ||
    cleanUrl.endsWith('.opus')
  )
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

export function parsePodcastXml(xmlText: string, feedUrl: string): PodcastParseResult {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'text/xml')

  const parserError = doc.querySelector('parsererror')
  if (parserError) {
    throw new Error('Malformed XML document received from podcast feed.')
  }

  // Detect Atom vs RSS
  const isAtom = doc.documentElement.nodeName.toLowerCase() === 'feed'
  if (isAtom) {
    return parseAtomFeed(doc, feedUrl)
  }
  return parseRssFeed(doc, feedUrl)
}

function parseRssFeed(doc: Document, feedUrl: string): PodcastParseResult {
  const channel = doc.querySelector('channel')
  if (!channel) {
    throw new Error('Invalid podcast feed: missing <channel> element.')
  }

  const title = channel.querySelector('title')?.textContent?.trim() || 'Untitled Podcast'
  const description = cleanHtmlText(channel.querySelector('description')?.textContent || '')
  const link = channel.querySelector('link')?.textContent?.trim() || feedUrl

  // Channel author
  const itunesAuthor = channel.getElementsByTagName('itunes:author')[0]?.textContent?.trim()
  const author = itunesAuthor || channel.querySelector('managingEditor')?.textContent?.trim() || undefined

  // Channel artwork: itunes:image href or <image><url>
  let artworkUrl: string | null = null
  const itunesImg = channel.getElementsByTagName('itunes:image')[0]
  if (itunesImg && itunesImg.getAttribute('href')) {
    artworkUrl = itunesImg.getAttribute('href')
  } else {
    const imgUrl = channel.querySelector('image > url')?.textContent?.trim()
    if (imgUrl) artworkUrl = imgUrl
  }

  const language = channel.querySelector('language')?.textContent?.trim()
  const lastBuildDate = channel.querySelector('lastBuildDate')?.textContent?.trim()

  const categories: string[] = []
  const catNodes = channel.querySelectorAll('category')
  catNodes.forEach((node) => {
    const text = node.textContent?.trim()
    if (text && !categories.includes(text)) categories.push(text)
  })

  const podcastId = `pod-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

  // Parse items
  const itemNodes = channel.querySelectorAll('item')
  const episodes: PodcastEpisode[] = []
  const seenGuids = new Set<string>()
  const seenUrls = new Set<string>()

  let epIndex = 1
  itemNodes.forEach((item) => {
    const itemTitle = item.querySelector('title')?.textContent?.trim() || `Episode ${epIndex}`
    const itemDesc = cleanHtmlText(
      item.getElementsByTagName('content:encoded')[0]?.textContent ||
        item.getElementsByTagName('itunes:summary')[0]?.textContent ||
        item.querySelector('description')?.textContent ||
        '',
    )
    const pubDate = item.querySelector('pubDate')?.textContent?.trim() || ''

    // Enclosure
    const enclosure = item.querySelector('enclosure')
    const audioUrl = enclosure?.getAttribute('url')?.trim() || ''
    const mimeType = enclosure?.getAttribute('type')?.trim() || 'audio/mpeg'
    const lengthStr = enclosure?.getAttribute('length')
    const fileSize = lengthStr ? parseInt(lengthStr, 10) : null

    // Require valid audio enclosure
    if (!audioUrl || !isAudioEnclosure(mimeType, audioUrl)) {
      return
    }

    // Guid for deduplication
    const guid = item.querySelector('guid')?.textContent?.trim() || audioUrl
    const normalizedUrl = (audioUrl.split('?')[0] ?? '').toLowerCase()

    if (seenGuids.has(guid) || seenUrls.has(normalizedUrl)) {
      return // Skip duplicate episode
    }
    seenGuids.add(guid)
    seenUrls.add(normalizedUrl)

    // Duration
    const itunesDur = item.getElementsByTagName('itunes:duration')[0]?.textContent
    const { text: duration, ms: durationMs } = parsePodcastDuration(itunesDur)

    // Episode & Season numbers
    const itunesEp = item.getElementsByTagName('itunes:episode')[0]?.textContent
    const itunesSeason = item.getElementsByTagName('itunes:season')[0]?.textContent
    const episodeNumber = itunesEp ? parseInt(itunesEp, 10) : epIndex
    const seasonNumber = itunesSeason ? parseInt(itunesSeason, 10) : null

    // Episode artwork
    let epArt: string | null = null
    const itemItunesImg = item.getElementsByTagName('itunes:image')[0]
    if (itemItunesImg && itemItunesImg.getAttribute('href')) {
      epArt = itemItunesImg.getAttribute('href')
    }

    episodes.push({
      id: `${podcastId}-ep-${guid.replace(/[^a-z0-9]+/gi, '-').slice(0, 32)}`,
      podcastId,
      guid,
      title: itemTitle,
      description: itemDesc,
      publishedDate: pubDate,
      duration,
      durationMs,
      audioUrl,
      mimeType,
      fileSize,
      episodeNumber,
      seasonNumber,
      artworkUrl: epArt || artworkUrl,
    })

    epIndex++
  })

  return {
    podcast: {
      id: podcastId,
      feedUrl,
      title,
      description,
      link,
      author,
      artworkUrl,
      language,
      lastBuildDate,
      categories,
      episodesCount: episodes.length,
    },
    episodes,
  }
}

function parseAtomFeed(doc: Document, feedUrl: string): PodcastParseResult {
  const feed = doc.documentElement
  const title = feed.querySelector('title')?.textContent?.trim() || 'Atom Feed'
  const description = cleanHtmlText(feed.querySelector('subtitle')?.textContent || '')
  const link = feed.querySelector('link[rel="alternate"]')?.getAttribute('href') || feedUrl
  const author = feed.querySelector('author > name')?.textContent?.trim() || undefined
  const artworkUrl = feed.querySelector('logo')?.textContent?.trim() || feed.querySelector('icon')?.textContent?.trim() || null

  const podcastId = `pod-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const entryNodes = feed.querySelectorAll('entry')
  const episodes: PodcastEpisode[] = []
  const seenGuids = new Set<string>()

  let index = 1
  entryNodes.forEach((entry) => {
    const entryTitle = entry.querySelector('title')?.textContent?.trim() || `Entry ${index}`
    const entryDesc = cleanHtmlText(entry.querySelector('summary')?.textContent || entry.querySelector('content')?.textContent || '')
    const pubDate = entry.querySelector('published')?.textContent?.trim() || entry.querySelector('updated')?.textContent?.trim() || ''

    const enclosure = entry.querySelector('link[rel="enclosure"]')
    const audioUrl = enclosure?.getAttribute('href')?.trim() || ''
    const mimeType = enclosure?.getAttribute('type')?.trim() || 'audio/mpeg'

    if (!audioUrl || !isAudioEnclosure(mimeType, audioUrl)) return

    const guid = entry.querySelector('id')?.textContent?.trim() || audioUrl
    if (seenGuids.has(guid)) return
    seenGuids.add(guid)

    episodes.push({
      id: `${podcastId}-ep-${guid.replace(/[^a-z0-9]+/gi, '-').slice(0, 32)}`,
      podcastId,
      guid,
      title: entryTitle,
      description: entryDesc,
      publishedDate: pubDate,
      duration: 'Standard',
      durationMs: null,
      audioUrl,
      mimeType,
      episodeNumber: index,
      artworkUrl,
    })
    index++
  })

  return {
    podcast: {
      id: podcastId,
      feedUrl,
      title,
      description,
      link,
      author,
      artworkUrl,
      categories: ['Atom'],
      episodesCount: episodes.length,
    },
    episodes,
  }
}
