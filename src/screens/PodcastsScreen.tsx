import { useState } from 'react'
import { MediaCategoryPage } from '../components/MediaCategoryPage'
import { Icon } from '../components/Icon'
import { PodcastFeedModal } from '../components/PodcastFeedModal'
import { useToast } from '../components/Toast'
import { fetchPodcastFeed, type PodcastSubscription } from '../lib/podcast'
import {
  getPodcastSubscriptions,
  removePodcastSubscription,
  savePodcastSubscription,
} from '../state/podcastSubscriptions'
import type { MediaResource } from '../data/personalLibrary'

export function PodcastsScreen() {
  const toast = useToast()
  const [feedUrl, setFeedUrl] = useState('')
  const [subscribing, setSubscribing] = useState(false)
  const [subscriptions, setSubscriptions] = useState<PodcastSubscription[]>(() => getPodcastSubscriptions())
  const [activeSubResource, setActiveSubResource] = useState<MediaResource | null>(null)

  const handleSubscribeUrl = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = feedUrl.trim()
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      toast('Enter a valid podcast RSS feed address starting with http:// or https://')
      return
    }
    setSubscribing(true)
    try {
      const result = await fetchPodcastFeed(trimmed)
      savePodcastSubscription(result.podcast, result.episodes)
      setSubscriptions(getPodcastSubscriptions())
      setFeedUrl('')
      toast(`Subscribed to ${result.podcast.title} (${result.episodes.length} episodes)`)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not fetch podcast feed.')
    } finally {
      setSubscribing(false)
    }
  }

  const openSubscription = (sub: PodcastSubscription) => {
    const asResource: MediaResource = {
      id: sub.id,
      name: sub.title,
      description: `Subscribed RSS podcast feed (${sub.episodesCount} episodes).`,
      category: 'podcasts',
      subcategory: 'rss',
      provider: sub.author || 'RSS Feed',
      url: sub.feedUrl,
      discoveryUrl: sub.feedUrl,
      resourceType: 'rss',
      artworkUrl: sub.artworkUrl ?? undefined,
      tags: ['podcast', 'rss'],
      verificationStatus: 'working',
      dateDiscovered: sub.subscribedAt,
      lastVerified: sub.lastRefreshedAt ?? sub.subscribedAt,
      provides: 'Podcast RSS Episodes',
      supportedByKinora: true,
    }
    setActiveSubResource(asResource)
  }

  const customHero = (
    <div className="media-hero-banner podcasts-hero">
      <div className="media-hero-content">
        <span className="media-hero-kicker">SPOKEN AUDIO &amp; FEEDS</span>
        <h1 className="media-hero-title">Podcasts &amp; Audio Series</h1>
        <p className="media-hero-subtitle">
          Subscribe to standard RSS and Atom podcast feeds directly through Kinora's guarded feed fetcher, track played episodes, and queue audio across sessions.
        </p>

        <form onSubmit={handleSubscribeUrl} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px', maxWidth: '580px' }}>
          <input
            type="url"
            className="input-text"
            placeholder="Paste RSS or Atom podcast feed URL (https://...)"
            value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)}
            aria-label="Podcast RSS feed URL"
            style={{ flex: 1, minWidth: '240px', padding: '7px 10px', fontSize: '0.875rem' }}
          />
          <button type="submit" className="btn btn-primary btn-small" disabled={subscribing || !feedUrl.trim()}>
            <Icon name="plus" size={14} />
            <span>{subscribing ? 'Fetching...' : 'Subscribe Feed'}</span>
          </button>
        </form>

        {subscriptions.length > 0 && (
          <div style={{ marginTop: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-2)' }}>My Subscriptions ({subscriptions.length}):</span>
            {subscriptions.map((sub) => (
              <span key={sub.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() => openSubscription(sub)}
                >
                  {sub.title} ({sub.episodesCount})
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  aria-label={`Unsubscribe from ${sub.title}`}
                  onClick={() => {
                    removePodcastSubscription(sub.id)
                    setSubscriptions(getPodcastSubscriptions())
                    toast(`Unsubscribed from ${sub.title}`)
                  }}
                >
                  x
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  const featured = ['res-pod-podcast-index', 'res-pod-in-our-time', 'res-pod-hardcore-history', 'res-pod-radiolab']

  return (
    <>
      <MediaCategoryPage categoryId="podcasts" customBannerHero={customHero} featuredIds={featured} />
      {activeSubResource && (
        <PodcastFeedModal
          isOpen={true}
          onClose={() => {
            setActiveSubResource(null)
            setSubscriptions(getPodcastSubscriptions())
          }}
          podcast={activeSubResource}
        />
      )}
    </>
  )
}
