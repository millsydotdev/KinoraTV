import { MediaCategoryPage } from '../components/MediaCategoryPage'
import { Icon } from '../components/Icon'

export function MusicScreen() {
  const customHero = (
    <div className="media-hero-banner music-hero">
      <div className="media-hero-content">
        <span className="media-hero-kicker">INDEPENDENT & OPEN MUSIC</span>
        <h1 className="media-hero-title">Music Discovery & Archives</h1>
        <p className="media-hero-subtitle">
          Explore legal music streaming platforms, Creative Commons libraries, classical audio archives,
          and live concert bootlegs. Honest metadata without commercial DRM barriers.
        </p>

        <div className="media-hero-stats">
          <span className="media-stat-item">
            <Icon name="audio" size={14} /> <strong>1M+</strong> Open & CC Audio Tracks
          </span>
          <span className="media-stat-separator" aria-hidden="true">·</span>
          <span className="media-stat-item">
            <Icon name="database" size={14} /> <strong>MusicBrainz</strong> Open Metadata
          </span>
          <span className="media-stat-separator" aria-hidden="true">·</span>
          <span className="media-stat-item">
            <Icon name="check" size={14} /> <strong>250,000+</strong> Live Concert Recordings
          </span>
        </div>
      </div>
    </div>
  )

  const featured = ['res-mus-free-music-archive', 'res-mus-jamendo', 'res-mus-live-music-archive', 'res-mus-musopen', 'res-mus-musicbrainz', 'res-mus-somafm-groovesalad']

  return <MediaCategoryPage categoryId="music" customBannerHero={customHero} featuredIds={featured} />
}
