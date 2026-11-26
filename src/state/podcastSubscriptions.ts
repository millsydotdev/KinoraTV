/**
 * Podcast Subscription and Playback Progress Store for Kinora.
 *
 * Manages persistent podcast subscriptions, episode caches, and playback timestamps.
 * Strictly adheres to the zero em-dash typography standard.
 */

import { fetchPodcastFeed } from '../lib/podcast/client'
import type { PodcastEpisode, PodcastFeed, PodcastSubscription } from '../lib/podcast/types'

export const PODCAST_SUBSCRIPTIONS_STORAGE_KEY = 'kinora.podcast.subscriptions.v1'
export const PODCAST_EPISODES_STORAGE_KEY = 'kinora.podcast.episodes.v1'
export const PODCAST_PROGRESS_STORAGE_KEY = 'kinora.podcast.progress.v1'

export interface EpisodeProgress {
  positionMs: number
  isFinished: boolean
  updatedAt: string
}

export function getPodcastSubscriptions(): PodcastSubscription[] {
  try {
    const raw = localStorage.getItem(PODCAST_SUBSCRIPTIONS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function isPodcastSubscribed(feedUrlOrId: string): boolean {
  const subs = getPodcastSubscriptions()
  return subs.some((s) => s.id === feedUrlOrId || s.feedUrl === feedUrlOrId)
}

export function savePodcastSubscription(feed: PodcastFeed, episodes: PodcastEpisode[]): void {
  const subs = getPodcastSubscriptions()
  const now = new Date().toISOString()

  const existingIdx = subs.findIndex((s) => s.id === feed.id || s.feedUrl === feed.feedUrl)
  const subData: PodcastSubscription = {
    id: feed.id,
    feedUrl: feed.feedUrl,
    title: feed.title,
    author: feed.author,
    artworkUrl: feed.artworkUrl,
    subscribedAt: existingIdx >= 0 && subs[existingIdx] ? subs[existingIdx]!.subscribedAt : now,
    lastRefreshedAt: now,
    episodesCount: episodes.length,
  }

  if (existingIdx >= 0) {
    subs[existingIdx] = subData
  } else {
    subs.push(subData)
  }

  try {
    localStorage.setItem(PODCAST_SUBSCRIPTIONS_STORAGE_KEY, JSON.stringify(subs))
    cachePodcastEpisodes(feed.id, episodes)
  } catch {
    // Storage quota protection
  }
}

export function removePodcastSubscription(feedId: string): void {
  const subs = getPodcastSubscriptions().filter((s) => s.id !== feedId && s.feedUrl !== feedId)
  try {
    localStorage.setItem(PODCAST_SUBSCRIPTIONS_STORAGE_KEY, JSON.stringify(subs))
    clearPodcastEpisodesCache(feedId)
  } catch {
    // Storage safety
  }
}

export function getPodcastEpisodes(podcastId: string): PodcastEpisode[] {
  try {
    const raw = localStorage.getItem(PODCAST_EPISODES_STORAGE_KEY)
    if (!raw) return []
    const map: Record<string, PodcastEpisode[]> = JSON.parse(raw)
    return map[podcastId] || []
  } catch {
    return []
  }
}

function cachePodcastEpisodes(podcastId: string, episodes: PodcastEpisode[]): void {
  try {
    const raw = localStorage.getItem(PODCAST_EPISODES_STORAGE_KEY)
    const map: Record<string, PodcastEpisode[]> = raw ? JSON.parse(raw) : {}
    map[podcastId] = episodes
    localStorage.setItem(PODCAST_EPISODES_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Storage safety
  }
}

function clearPodcastEpisodesCache(podcastId: string): void {
  try {
    const raw = localStorage.getItem(PODCAST_EPISODES_STORAGE_KEY)
    if (!raw) return
    const map: Record<string, PodcastEpisode[]> = JSON.parse(raw)
    delete map[podcastId]
    localStorage.setItem(PODCAST_EPISODES_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Storage safety
  }
}

export function saveEpisodePlaybackProgress(episodeId: string, positionMs: number, isFinished = false): void {
  try {
    const raw = localStorage.getItem(PODCAST_PROGRESS_STORAGE_KEY)
    const map: Record<string, EpisodeProgress> = raw ? JSON.parse(raw) : {}
    map[episodeId] = {
      positionMs,
      isFinished,
      updatedAt: new Date().toISOString(),
    }
    localStorage.setItem(PODCAST_PROGRESS_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Storage safety
  }
}

export function getEpisodePlaybackProgress(episodeId: string): EpisodeProgress | null {
  try {
    const raw = localStorage.getItem(PODCAST_PROGRESS_STORAGE_KEY)
    if (!raw) return null
    const map: Record<string, EpisodeProgress> = JSON.parse(raw)
    return map[episodeId] || null
  } catch {
    return null
  }
}

export async function refreshPodcastSubscription(feedUrl: string): Promise<PodcastEpisode[]> {
  const result = await fetchPodcastFeed(feedUrl)
  savePodcastSubscription(result.podcast, result.episodes)
  return result.episodes
}
