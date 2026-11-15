import { MediaCategoryPage } from '../components/MediaCategoryPage'
import { Icon } from '../components/Icon'

export function PodcastsScreen() {
  const customHero = (
    <div className="media-hero-banner podcasts-hero">
      <div className="media-hero-content">
        <span className="media-hero-kicker">SPOKEN AUDIO & FEEDS</span>
        <h1 className="media-hero-title">Podcasts & Audio Series</h1>
        <p className="media-hero-subtitle">
          Discover open RSS feeds, public broadcaster shows, and independent podcasts across history,
          science, technology, culture, and investigative storytelling.
        </p>

        <div className="media-hero-stats">
          <span className="media-stat-item">
            <Icon name="audio" size={14} /> <strong>4.2M+</strong> Podcasts via Open Index
          </span>
          <span className="media-stat-separator" aria-hidden="true">·</span>
          <span className="media-stat-item">
            <Icon name="link" size={14} /> <strong>Standard RSS</strong> Enclosures
          </span>
          <span className="media-stat-separator" aria-hidden="true">·</span>
          <span className="media-stat-item">
            <Icon name="check" size={14} /> <strong>No Walled Gardens</strong>
          </span>
        </div>
      </div>
    </div>
  )

  const featured = ['res-pod-podcast-index', 'res-pod-in-our-time', 'res-pod-hardcore-history', 'res-pod-radiolab']

  return <MediaCategoryPage categoryId="podcasts" customBannerHero={customHero} featuredIds={featured} />
}
