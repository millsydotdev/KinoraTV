import { MediaCategoryPage } from '../components/MediaCategoryPage'
import { Icon } from '../components/Icon'

export function LanguageScreen() {
  const customHero = (
    <div className="media-hero-banner language-hero">
      <div className="media-hero-content">
        <span className="media-hero-kicker">MULTILINGUAL BROADCASTING & EDUCATION</span>
        <h1 className="media-hero-title">Language & International Media</h1>
        <p className="media-hero-subtitle">
          Immersive language learning series, native pronunciation dictionaries, multilingual radio dispatches,
          and public service language courses from Deutsche Welle, BBC, and TV5Monde.
        </p>

        <div className="media-hero-stats">
          <span className="media-stat-item">
            <Icon name="link" size={14} /> <strong>DW Learn German</strong> Episodic Telenovelas
          </span>
          <span className="media-stat-separator" aria-hidden="true">·</span>
          <span className="media-stat-item">
            <Icon name="audio" size={14} /> <strong>BBC Learning English</strong> Daily Audio
          </span>
          <span className="media-stat-separator" aria-hidden="true">·</span>
          <span className="media-stat-item">
            <Icon name="check" size={14} /> <strong>Forvo</strong> Native Pronunciations
          </span>
        </div>
      </div>
    </div>
  )

  const featured = ['res-lan-dw-learn-german', 'res-lan-bbc-learning-english', 'res-lan-forvo-api']

  return <MediaCategoryPage categoryId="language" customBannerHero={customHero} featuredIds={featured} />
}
