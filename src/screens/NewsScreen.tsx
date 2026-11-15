import { MediaCategoryPage } from '../components/MediaCategoryPage'
import { Icon } from '../components/Icon'

export function NewsScreen() {
  const customHero = (
    <div className="media-hero-banner news-hero">
      <div className="media-hero-content">
        <span className="media-hero-kicker">GLOBAL JOURNALISM & WIRE FEEDS</span>
        <h1 className="media-hero-title">News & Current Affairs</h1>
        <p className="media-hero-subtitle">
          Direct dispatches from international news wire services, public broadcaster bulletins, and independent
          journalistic reporting across the globe without clickbait or tracking.
        </p>

        <div className="media-hero-stats">
          <span className="media-stat-item">
            <Icon name="info" size={14} /> <strong>Reuters & AP</strong> Wire Feeds
          </span>
          <span className="media-stat-separator" aria-hidden="true">·</span>
          <span className="media-stat-item">
            <Icon name="live" size={14} /> <strong>24/7 Live</strong> Video Dispatches
          </span>
          <span className="media-stat-separator" aria-hidden="true">·</span>
          <span className="media-stat-item">
            <Icon name="check" size={14} /> <strong>Non-Partisan</strong> Verified Reporting
          </span>
        </div>
      </div>
    </div>
  )

  const featured = ['res-new-reuters', 'res-new-ap-news', 'res-live-france24-en', 'res-live-dw-en', 'res-live-euronews-en']

  return <MediaCategoryPage categoryId="news" customBannerHero={customHero} featuredIds={featured} />
}
