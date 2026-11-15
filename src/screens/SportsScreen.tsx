import { MediaCategoryPage } from '../components/MediaCategoryPage'
import { Icon } from '../components/Icon'

export function SportsScreen() {
  const customHero = (
    <div className="media-hero-banner sports-hero">
      <div className="media-hero-content">
        <span className="media-hero-kicker">ATHLETIC ARCHIVES & FREE STREAMS</span>
        <h1 className="media-hero-title">Sports Media & Competitions</h1>
        <p className="media-hero-subtitle">
          Publicly accessible sports events, Olympic heritage replays, Formula E racing highlights,
          and action sports from Red Bull Media House and international athletic federations.
        </p>

        <div className="media-hero-stats">
          <span className="media-stat-item">
            <Icon name="play" size={14} /> <strong>Red Bull TV</strong> Live Action Sports
          </span>
          <span className="media-stat-separator" aria-hidden="true">·</span>
          <span className="media-stat-item">
            <Icon name="history" size={14} /> <strong>Olympic Channel</strong> Historical Replays
          </span>
          <span className="media-stat-separator" aria-hidden="true">·</span>
          <span className="media-stat-item">
            <Icon name="check" size={14} /> <strong>Legal Public Feeds</strong>
          </span>
        </div>
      </div>
    </div>
  )

  const featured = ['res-live-redbull-tv', 'res-spo-olympic-channel', 'res-spo-formula-e']

  return <MediaCategoryPage categoryId="sports" customBannerHero={customHero} featuredIds={featured} />
}
