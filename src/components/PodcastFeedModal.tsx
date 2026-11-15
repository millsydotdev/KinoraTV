import { useMemo, useState } from 'react'
import type { MediaResource } from '../data/personalLibrary'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { useToast } from './Toast'
import { useStore } from '../state/store'
import './PodcastFeedModal.css'

export interface PodcastFeedModalProps {
  isOpen: boolean
  onClose: () => void
  podcast: MediaResource
}

interface PodcastEpisode {
  id: string
  number: number
  title: string
  description: string
  duration: string
  publishedDate: string
  audioUrl: string
}

function generateEpisodesForPodcast(podcast: MediaResource): PodcastEpisode[] {
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

  const episodes = useMemo(() => generateEpisodesForPodcast(podcast), [podcast])

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

  const handlePlayEpisode = (ep: PodcastEpisode) => {
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

  const handleQueueEpisode = (ep: PodcastEpisode) => {
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
            <img src={podcast.artworkUrl} alt="" className="podcast-feed-cover" />
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
        <div className="podcast-episodes-list" role="feed" aria-label="Podcast Episodes">
          {filteredEpisodes.length > 0 ? (
            filteredEpisodes.map((ep) => (
              <article key={ep.id} className="podcast-episode-card" tabIndex={0}>
                <div className="podcast-episode-top">
                  <div className="podcast-episode-title-group">
                    <span className="podcast-episode-num">Episode {ep.number}</span>
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
                      <span>Play</span>
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
                  <span>Audio MP3 (Stereo)</span>
                </div>
              </article>
            ))
          ) : (
            <p className="faint" style={{ textAlign: 'center', padding: '32px 0' }}>
              No episodes found matching "{searchQuery}".
            </p>
          )}
        </div>
      </div>
    </Dialog>
  )
}
