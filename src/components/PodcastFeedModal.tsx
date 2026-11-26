import { useEffect, useMemo, useState } from 'react'
import type { MediaResource } from '../data/personalLibrary'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { Art } from './ui'
import { useToast } from './Toast'
import { useStore } from '../state/store'
import { fetchPodcastFeed, type PodcastEpisode as RealPodcastEpisode } from '../lib/podcast'
import {
  getEpisodePlaybackProgress,
  getPodcastEpisodes,
  saveEpisodePlaybackProgress,
  savePodcastSubscription,
  isPodcastSubscribed,
  removePodcastSubscription,
} from '../state/podcastSubscriptions'
import './PodcastFeedModal.css'

export interface PodcastFeedModalProps {
  isOpen: boolean
  onClose: () => void
  podcast: MediaResource
}

interface DisplayEpisode {
  id: string
  number: number
  title: string
  description: string
  duration: string
  publishedDate: string
  audioUrl: string
}

function generateEpisodesForPodcast(podcast: MediaResource): DisplayEpisode[] {
  const topics = [
    { title: 'Origins and Ancient Crossings', desc: 'An investigative exploration into the earliest documented voyages and trade routes across the Mediterranean and Atlantic horizons.' },
    { title: 'The Velocity of Ideas: Printing and Propagation', desc: 'How movable type, underground presses, and independent pamphlets ignited philosophical revolutions across Europe.' },
    { title: 'Signals in the Dark: Radio Astronomy Pioneers', desc: 'The early physicists who pointed crude horn antennas at the stars and accidentally caught the cosmic microwave background.' },
    { title: 'Shadows of the Industrial Frontier', desc: 'A deep dive into the human and ecological transformations wrought by steam locomotives, textile factories, and rapid urbanization.' },
    { title: 'The Art of Disobedience: Civic Protests and Law', desc: 'Examining historical movements that challenged entrenched jurisprudence through coordinated nonviolent civil resistance.' },
    { title: 'Deep Ecology and the Silent Forests', desc: 'Biologists and naturalists discuss the unseen fungal mycorrhizal networks connecting ancient old-growth forests.' },
    { title: 'Lost Archives of the Mediterranean Basin', desc: 'The rediscovery of forgotten palimpsests, monastic libraries, and maritime scrolls preserved through turbulent centuries.' },
  ]

  return topics.map((t, idx) => ({
    id: `${podcast.id}-ep-${idx + 1}`,
    number: idx + 1,
    title: `${podcast.name}: ${t.title}`,
    description: t.desc,
    duration: `${40 + (idx * 7) % 35} min`,
    publishedDate: `${(idx + 1) * 3} days ago`,
    audioUrl: podcast.playbackUrl ?? podcast.url,
  }))
}

export function PodcastFeedModal({ isOpen, onClose, podcast }: PodcastFeedModalProps) {
  const store = useStore()
  const toast = useToast()
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')
  const [realEpisodes, setRealEpisodes] = useState<DisplayEpisode[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [feedError, setFeedError] = useState<string | null>(null)
  const [progressRev, setProgressRev] = useState(0)
  const [isSubscribed, setIsSubscribed] = useState(() => isPodcastSubscribed(podcast.id) || isPodcastSubscribed(podcast.url))

  useEffect(() => {
    if (!isOpen) return
    setFeedError(null)

    // 1. Check local cache
    const cached = getPodcastEpisodes(podcast.id)
    if (cached.length > 0) {
      setRealEpisodes(
        cached.map((ep, idx) => ({
          id: ep.id,
          number: ep.episodeNumber || idx + 1,
          title: ep.title,
          description: ep.description,
          duration: ep.duration,
          publishedDate: ep.publishedDate || 'Recently published',
          audioUrl: ep.audioUrl,
        })),
      )
    }

    // 2. If it is an active HTTP(S) URL, fetch latest through guarded client
    if (podcast.url.startsWith('http://') || podcast.url.startsWith('https://')) {
      setIsRefreshing(true)
      fetchPodcastFeed(podcast.url)
        .then((result) => {
          if (result.episodes.length > 0) {
            const mapped = result.episodes.map((ep, idx) => ({
              id: ep.id,
              number: ep.episodeNumber || idx + 1,
              title: ep.title,
              description: ep.description,
              duration: ep.duration,
              publishedDate: ep.publishedDate || 'Recently published',
              audioUrl: ep.audioUrl,
            }))
            setRealEpisodes(mapped)
            setFeedError(null)
            if (isSubscribed) {
              savePodcastSubscription(result.podcast, result.episodes)
            }
          }
        })
        .catch((err) => {
          setFeedError(err instanceof Error ? err.message : 'Could not load live RSS feed episodes.')
        })
        .finally(() => {
          setIsRefreshing(false)
        })
    }
  }, [isOpen, podcast, isSubscribed])

  const isDemoMode = store.prefs.demoMode || store.channelMode === 'demo'
  const episodes = useMemo(() => {
    if (realEpisodes.length > 0) return realEpisodes
    if (isDemoMode) return generateEpisodesForPodcast(podcast)
    return []
  }, [realEpisodes, podcast, isDemoMode])

  const filteredEpisodes = useMemo(() => {
    let list = [...episodes]
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter((e) => e.title.toLowerCase().includes(q) || e.description.toLowerCase().includes(q))
    }
    if (sortOrder === 'oldest') {
      list.reverse()
    }
    return list
  }, [episodes, searchQuery, sortOrder])

  const handleToggleSubscribe = () => {
    if (isSubscribed) {
      removePodcastSubscription(podcast.id)
      removePodcastSubscription(podcast.url)
      setIsSubscribed(false)
      toast(`Unsubscribed from ${podcast.name}`)
    } else {
      const feedToSave = {
        id: podcast.id,
        feedUrl: podcast.url,
        title: podcast.name,
        description: podcast.description || '',
        author: podcast.provider,
        artworkUrl: podcast.artworkUrl,
        categories: ['Podcast'],
        episodesCount: episodes.length,
      }
      const rawEpisodes: RealPodcastEpisode[] = episodes.map((ep) => ({
        id: ep.id,
        podcastId: podcast.id,
        guid: ep.id,
        title: ep.title,
        description: ep.description,
        publishedDate: ep.publishedDate,
        duration: ep.duration,
        audioUrl: ep.audioUrl,
        mimeType: 'audio/mpeg',
      }))
      savePodcastSubscription(feedToSave, rawEpisodes)
      setIsSubscribed(true)
      toast(`Subscribed to ${podcast.name}`)
    }
  }

  const handleManualRefresh = async () => {
    if (!podcast.url.startsWith('http://') && !podcast.url.startsWith('https://')) {
      toast('Demonstration feed refreshed.')
      return
    }

    setIsRefreshing(true)
    try {
      const res = await fetchPodcastFeed(podcast.url)
      const mapped = res.episodes.map((ep, idx) => ({
        id: ep.id,
        number: ep.episodeNumber || idx + 1,
        title: ep.title,
        description: ep.description,
        duration: ep.duration,
        publishedDate: ep.publishedDate || 'Recently published',
        audioUrl: ep.audioUrl,
      }))
      setRealEpisodes(mapped)
      savePodcastSubscription(res.podcast, res.episodes)
      toast(`Feed refreshed: ${mapped.length} episodes found.`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Feed refresh failed.')
    } finally {
      setIsRefreshing(false)
    }
  }

  const handlePlayEpisode = (ep: DisplayEpisode) => {
    const prev = getEpisodePlaybackProgress(ep.id)
    saveEpisodePlaybackProgress(ep.id, prev?.positionMs ?? 1000, false)
    setProgressRev((n) => n + 1)
    store.mediaLibrary.playAudio({
      id: ep.id,
      name: ep.title,
      provider: podcast.provider,
      streamUrl: ep.audioUrl,
      artworkUrl: podcast.artworkUrl,
      accentHue: podcast.accentHue ?? 25,
      mediaType: 'podcast',
    })
    toast(`Playing: ${ep.title}`)
  }

  const handleToggleEpisodeFinished = (ep: DisplayEpisode) => {
    const prev = getEpisodePlaybackProgress(ep.id)
    const nextFinished = !prev?.isFinished
    saveEpisodePlaybackProgress(ep.id, nextFinished ? 0 : (prev?.positionMs ?? 0), nextFinished)
    setProgressRev((n) => n + 1)
    toast(nextFinished ? `Marked "${ep.title}" as played` : `Marked "${ep.title}" as unplayed`)
  }

  const handleQueueEpisode = (ep: DisplayEpisode) => {
    store.mediaLibrary.addToQueue({
      id: ep.id,
      name: ep.title,
      provider: podcast.provider,
      streamUrl: ep.audioUrl,
      artworkUrl: podcast.artworkUrl,
      accentHue: podcast.accentHue ?? 25,
      mediaType: 'podcast',
    })
    toast(`Added to queue: ${ep.title}`)
  }

  const copyFeedUrl = () => {
    try {
      void navigator.clipboard.writeText(podcast.url)
      toast('Copied RSS Feed URL')
    } catch {
      toast('Failed to copy URL')
    }
  }

  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onClose={onClose} title={podcast.name} wide>
      <div className="podcast-feed-modal">
        {/* Header Bar */}
        <div className="podcast-feed-header">
          {podcast.artworkUrl ? (
            <Art src={podcast.artworkUrl} alt={podcast.name} contentId={`podcast:${podcast.id}`} className="podcast-feed-cover" fallbackIcon="podcast" />
          ) : (
            <div className="podcast-feed-cover">
              <Icon name="podcast" size={36} />
            </div>
          )}

          <div className="podcast-feed-header-info">
            <h3 className="podcast-feed-title">{podcast.name}</h3>
            <span className="podcast-feed-host">Hosted by {podcast.provider}</span>
            <div className="podcast-feed-meta-row">
              <span className="podcast-feed-rss-badge">
                <Icon name="link" size={12} />
                <span>RSS 2.0</span>
              </span>
              <span>·</span>
              <span>{episodes.length} episodes available</span>
              <span>·</span>
              <button
                type="button"
                className="text-btn"
                onClick={copyFeedUrl}
                title="Copy podcast feed URL"
              >
                Copy Feed Address
              </button>
            </div>

            <div className="podcast-feed-header-actions" style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <button
                type="button"
                className={`btn btn-sm ${isSubscribed ? 'btn-secondary' : 'btn-primary'}`}
                onClick={handleToggleSubscribe}
              >
                <Icon name={isSubscribed ? 'check' : 'plus'} size={14} />
                <span>{isSubscribed ? 'Subscribed' : 'Subscribe'}</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleManualRefresh}
                disabled={isRefreshing}
              >
                <Icon name="refresh" size={14} />
                <span>{isRefreshing ? 'Refreshing...' : 'Refresh Feed'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Toolbar: Search and Sort */}
        <div className="podcast-feed-toolbar">
          <div className="podcast-search-wrap">
            <Icon name="search" size={14} />
            <input
              type="search"
              className="podcast-search-input"
              placeholder="Search episodes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search podcast episodes"
            />
          </div>

          <select
            className="podcast-sort-select"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
            aria-label="Sort episodes"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>
        </div>

        {/* Episodes List */}
        {feedError && (
          <div style={{ padding: '10px 12px', marginBottom: '10px', borderRadius: '8px', border: '1px solid var(--red, #d44)', color: 'var(--red, #f66)', fontSize: '0.8125rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
            <span>{feedError}</span>
            <button type="button" className="btn btn-secondary btn-small" onClick={handleManualRefresh} disabled={isRefreshing}>
              Retry
            </button>
          </div>
        )}
        <div className="podcast-episodes-list" role="feed" aria-label="Podcast Episodes" data-progress-rev={progressRev}>
          {filteredEpisodes.length > 0 ? (
            filteredEpisodes.map((ep) => {
              const epProgress = getEpisodePlaybackProgress(ep.id)
              return (
              <article key={ep.id} className="podcast-episode-card" tabIndex={0}>
                <div className="podcast-episode-top">
                  <div className="podcast-episode-title-group">
                    <span className="podcast-episode-num">
                      Episode {ep.number}
                      {epProgress?.isFinished ? ' (Played)' : epProgress && epProgress.positionMs > 0 ? ' (In Progress)' : ''}
                    </span>
                    <strong className="podcast-episode-title">{ep.title}</strong>
                  </div>

                  <div className="podcast-episode-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-small"
                      onClick={() => handlePlayEpisode(ep)}
                      aria-label={`Play ${ep.title}`}
                    >
                      <Icon name="play" size={14} />
                      <span>{epProgress && !epProgress.isFinished && epProgress.positionMs > 0 ? 'Resume' : 'Play'}</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => handleToggleEpisodeFinished(ep)}
                      aria-label={epProgress?.isFinished ? `Mark ${ep.title} unplayed` : `Mark ${ep.title} played`}
                      title={epProgress?.isFinished ? 'Mark unplayed' : 'Mark played'}
                    >
                      <Icon name="check" size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      onClick={() => handleQueueEpisode(ep)}
                      aria-label={`Queue ${ep.title}`}
                      title="Add to queue"
                    >
                      <Icon name="plus" size={14} />
                    </button>
                  </div>
                </div>

                <p className="podcast-episode-desc">{ep.description}</p>

                <div className="podcast-episode-foot">
                  <span>{ep.publishedDate}</span>
                  <span>·</span>
                  <span>{ep.duration}</span>
                  <span>·</span>
                  <span>{realEpisodes.length === 0 && isDemoMode ? 'Sample Preview' : 'Audio Enclosure'}</span>
                </div>
              </article>
              )
            })
          ) : (
            <p className="faint" style={{ textAlign: 'center', padding: '32px 0' }}>
              {isRefreshing
                ? 'Loading podcast feed episodes...'
                : searchQuery.trim()
                ? `No episodes found matching "${searchQuery}".`
                : 'No RSS episodes loaded yet. Click Refresh Feed to fetch the latest episodes from this feed address.'}
            </p>
          )}
        </div>
      </div>
    </Dialog>
  )
}

