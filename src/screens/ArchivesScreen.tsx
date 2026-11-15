import { MediaCategoryPage } from '../components/MediaCategoryPage'
import { Icon } from '../components/Icon'

export function ArchivesScreen() {
  const customHero = (
    <div className="media-hero-banner archives-hero">
      <div className="media-hero-content">
        <span className="media-hero-kicker">CULTURAL PRESERVATION & NATIONAL REGISTRIES</span>
        <h1 className="media-hero-title">Media Archives & Public Collections</h1>
        <p className="media-hero-subtitle">
          Universal access to national digital libraries, early cinema preservation collections,
          historical sound recordings, and open multimedia archives from the Internet Archive, Library of Congress, and Europeana.
        </p>

        <div className="media-hero-stats">
          <span className="media-stat-item">
            <Icon name="database" size={14} /> <strong>Internet Archive</strong> 44M+ Books & Media
          </span>
          <span className="media-stat-separator" aria-hidden="true">·</span>
          <span className="media-stat-item">
            <Icon name="library" size={14} /> <strong>Library of Congress</strong> National Collections
          </span>
          <span className="media-stat-separator" aria-hidden="true">·</span>
          <span className="media-stat-item">
            <Icon name="check" size={14} /> <strong>50M+ Records</strong> via Europeana
          </span>
        </div>
      </div>
    </div>
  )

  const featured = ['res-arc-internet-archive', 'res-arc-loc-digital', 'res-arc-europeana', 'res-arc-wikimedia-commons', 'res-arc-bfi-national-archive']

  return <MediaCategoryPage categoryId="archives" customBannerHero={customHero} featuredIds={featured} />
}
