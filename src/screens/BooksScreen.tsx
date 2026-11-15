import { MediaCategoryPage } from '../components/MediaCategoryPage'
import { Icon } from '../components/Icon'

export function BooksScreen() {
  const customHero = (
    <div className="media-hero-banner books-hero">
      <div className="media-hero-content">
        <span className="media-hero-kicker">DIGITAL LIBRARIES & LITERATURE</span>
        <h1 className="media-hero-title">Books, Ebooks & Reading</h1>
        <p className="media-hero-subtitle">
          Over 70,000 free public domain ebooks, beautifully curated digital typography editions,
          vintage comic book archives, and the Internet Archive Open Library catalog.
        </p>

        <div className="media-hero-stats">
          <span className="media-stat-item">
            <Icon name="library" size={14} /> <strong>Project Gutenberg</strong> 70,000+ Ebooks
          </span>
          <span className="media-stat-separator" aria-hidden="true">·</span>
          <span className="media-stat-item">
            <Icon name="palette" size={14} /> <strong>Standard Ebooks</strong> Curated Typography
          </span>
          <span className="media-stat-separator" aria-hidden="true">·</span>
          <span className="media-stat-item">
            <Icon name="check" size={14} /> <strong>Open OPDS Feeds</strong>
          </span>
        </div>
      </div>
    </div>
  )

  const featured = ['res-boo-project-gutenberg', 'res-boo-standard-ebooks', 'res-boo-open-library', 'res-boo-comic-book-plus']

  return <MediaCategoryPage categoryId="books" customBannerHero={customHero} featuredIds={featured} />
}
