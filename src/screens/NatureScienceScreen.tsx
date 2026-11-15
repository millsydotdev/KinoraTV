import { MediaCategoryPage } from '../components/MediaCategoryPage'
import { Icon } from '../components/Icon'

export function NatureScienceScreen() {
  const customHero = (
    <div className="media-hero-banner nature-hero">
      <div className="media-hero-content">
        <span className="media-hero-kicker">EXPLORATION, ASTRONOMY & WILDLIFE</span>
        <h1 className="media-hero-title">Nature, Science & Space</h1>
        <p className="media-hero-subtitle">
          Live wildlife webcams from around the planet, NASA spaceflight video archives, ocean sanctuary cameras,
          and astronomical exploration feeds from deep space observatories.
        </p>

        <div className="media-hero-stats">
          <span className="media-stat-item">
            <Icon name="radar" size={14} /> <strong>NASA Open APIs</strong> Daily APOD & Mars Rovers
          </span>
          <span className="media-stat-separator" aria-hidden="true">·</span>
          <span className="media-stat-item">
            <Icon name="live" size={14} /> <strong>Explore.org</strong> Live Wildlife Cams
          </span>
          <span className="media-stat-separator" aria-hidden="true">·</span>
          <span className="media-stat-item">
            <Icon name="check" size={14} /> <strong>Monterey Bay</strong> Ocean Streams
          </span>
        </div>
      </div>
    </div>
  )

  const featured = ['res-nat-nasa-api', 'res-nat-explore-live-cams', 'res-nat-monterey-bay-cams', 'res-live-nasa-tv']

  return <MediaCategoryPage categoryId="nature-science" customBannerHero={customHero} featuredIds={featured} />
}
