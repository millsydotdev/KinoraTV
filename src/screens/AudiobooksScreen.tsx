import { MediaCategoryPage } from '../components/MediaCategoryPage'
import { Icon } from '../components/Icon'

export function AudiobooksScreen() {
  const customHero = (
    <div className="media-hero-banner audiobooks-hero">
      <div className="media-hero-content">
        <span className="media-hero-kicker">SPOKEN LITERATURE & NARRATION</span>
        <h1 className="media-hero-title">Audiobooks & Spoken Word</h1>
        <p className="media-hero-subtitle">
          Listen to unabridged classic literature, historic poetry recitations, and educational audiobooks.
          Powered by volunteer-recorded public domain collections and academic repositories.
        </p>

        <div className="media-hero-stats">
          <span className="media-stat-item">
            <Icon name="library" size={14} /> <strong>18,000+</strong> LibriVox Audiobooks
          </span>
          <span className="media-stat-separator" aria-hidden="true">·</span>
          <span className="media-stat-item">
            <Icon name="check" size={14} /> <strong>100% Free</strong> & Public Domain
          </span>
          <span className="media-stat-separator" aria-hidden="true">·</span>
          <span className="media-stat-item">
            <Icon name="audio" size={14} /> <strong>Direct MP3</strong> Chapter Streaming
          </span>
        </div>
      </div>
    </div>
  )

  const featured = ['res-aud-librivox', 'res-aud-archive-audiobooks', 'res-aud-lit2go']

  return <MediaCategoryPage categoryId="audiobooks" customBannerHero={customHero} featuredIds={featured} />
}
