import { MediaCategoryPage } from '../components/MediaCategoryPage'
import { Icon } from '../components/Icon'

export function CultureScreen() {
  const customHero = (
    <div className="media-hero-banner culture-hero">
      <div className="media-hero-content">
        <span className="media-hero-kicker">MUSEUMS, THEATRE & CULTURAL HERITAGE</span>
        <h1 className="media-hero-title">Art, Culture & Performance</h1>
        <p className="media-hero-subtitle">
          High-definition museum collections, classical art masterworks, operatic performances,
          and open cultural heritage repositories from the Met, Rijksmuseum, and Smithsonian.
        </p>

        <div className="media-hero-stats">
          <span className="media-stat-item">
            <Icon name="palette" size={14} /> <strong>400,000+</strong> Met Museum Masterworks
          </span>
          <span className="media-stat-separator" aria-hidden="true">·</span>
          <span className="media-stat-item">
            <Icon name="database" size={14} /> <strong>Smithsonian</strong> 4.5M+ Open Access Items
          </span>
          <span className="media-stat-separator" aria-hidden="true">·</span>
          <span className="media-stat-item">
            <Icon name="check" size={14} /> <strong>CC0 Public Domain</strong>
          </span>
        </div>
      </div>
    </div>
  )

  const featured = ['res-cul-met-museum-api', 'res-cul-rijksmuseum', 'res-cul-smithsonian-open-access', 'res-live-classic-arts']

  return <MediaCategoryPage categoryId="culture" customBannerHero={customHero} featuredIds={featured} />
}
