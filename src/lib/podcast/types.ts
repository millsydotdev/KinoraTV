/**
 * Podcast and RSS/Atom Feed Types for Kinora.
 *
 * Supports open RSS 2.0, iTunes Podcast namespace, and Atom feeds:
 * - Feed discovery and persistent subscription
 * - Channel metadata, author, and high-resolution artwork
 * - Episode media enclosures, duration, and publication dates
 * - Duplicate episode detection and playback progress tracking
 *
 * Strictly adheres to the zero em-dash typography standard.
 */

export interface PodcastFeed {
  id: string
  feedUrl: string
  title: string
  description: string
  link?: string
  author?: string
  artworkUrl?: string | null
  language?: string
  lastBuildDate?: string
  categories: string[]
  episodesCount: number
}

export interface PodcastEpisode {
  id: string
  podcastId: string
  guid: string
  title: string
  description: string
  publishedDate: string
  duration: string
  durationMs?: number | null
  audioUrl: string
  mimeType: string
  fileSize?: number | null
  episodeNumber?: number | null
  seasonNumber?: number | null
  artworkUrl?: string | null
  playbackPositionMs?: number
  isFinished?: boolean
}

export interface PodcastSubscription {
  id: string
  feedUrl: string
  title: string
  author?: string
  artworkUrl?: string | null
  subscribedAt: string
  lastRefreshedAt: string
  episodesCount: number
}

export interface PodcastParseResult {
  podcast: PodcastFeed
  episodes: PodcastEpisode[]
}
