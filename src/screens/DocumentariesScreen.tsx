import { MediaCategoryPage } from '../components/MediaCategoryPage'
import { Icon } from '../components/Icon'

export function DocumentariesScreen() {
  const customHero = (
    <div className="media-hero-banner doc-hero">
      <div className="media-hero-content">
        <span className="media-hero-kicker">FACTUAL & INVESTIGATIVE CINEMA</span>
        <h1 className="media-hero-title">Documentaries & Non-Fiction</h1>
        <p className="media-hero-subtitle">
          In-depth documentary cinema, investigative journalism, wildlife profiles, and historical archives
          from public broadcasters and national cultural film boards.
        </p>

        <div className="media-hero-stats">
          <span className="media-stat-item">
            <Icon name="film" size={14} /> <strong>PBS Frontline</strong> Investigative Reports
          </span>
          <span className="media-stat-separator" aria-hidden="true">·</span>
          <span className="media-stat-item">
            <Icon name="play" size={14} /> <strong>NFB Canada</strong> Documentaries
          </span>
          <span className="media-stat-separator" aria-hidden="true">·</span>
          <span className="media-stat-item">
            <Icon name="check" size={14} /> <strong>Free Legal Streaming</strong>
          </span>
        </div>
      </div>
    </div>
  )

  const featured = ['res-doc-pbs-frontline', 'res-doc-top-doc-films', 'res-doc-dw-documentary', 'res-mov-nfb-canada']

  return <MediaCategoryPage categoryId="documentaries" customBannerHero={customHero} featuredIds={featured} />
}
