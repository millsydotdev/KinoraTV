import { MediaCategoryPage } from '../components/MediaCategoryPage'
import { Icon } from '../components/Icon'

export function RadioScreen() {
  const customHero = (
    <div className="media-hero-banner radio-hero">
      <div className="media-hero-content">
        <span className="media-hero-kicker">LIVE AUDIO & BROADCAST</span>
        <h1 className="media-hero-title">Internet Radio & Broadcasters</h1>
        <p className="media-hero-subtitle">
          Tune in to live internet radio, public service broadcasters, community stations, and commercial audio streams worldwide.
          Featuring verified direct streams and the open Radio Browser global directory.
        </p>

        <div className="media-hero-stats">
          <span className="media-stat-item">
            <Icon name="radar" size={14} /> <strong>Direct Live Audio</strong> Streaming
          </span>
          <span className="media-stat-separator" aria-hidden="true">·</span>
          <span className="media-stat-item">
            <Icon name="audio" size={14} /> <strong>Public & Independent</strong> Broadcasters
          </span>
          <span className="media-stat-separator" aria-hidden="true">·</span>
          <span className="media-stat-item">
            <Icon name="check" size={14} /> <strong>Commercial-Free</strong> High-Fidelity Feeds
          </span>
        </div>
      </div>
    </div>
  )

  const featured = ['res-rad-radio-browser', 'res-rad-somafm-groovesalad', 'res-rad-bbc-world-service', 'res-rad-kexp', 'res-rad-somafm-dronezone', 'res-rad-fip']

  return <MediaCategoryPage categoryId="radio" customBannerHero={customHero} featuredIds={featured} />
}
