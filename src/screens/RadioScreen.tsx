import { MediaCategoryPage } from '../components/MediaCategoryPage'
import { Icon } from '../components/Icon'
import { useStore } from '../state/store'
import { AudioVisualizer } from '../components/AudioVisualizer'

export function RadioScreen() {
  const { mediaLibrary } = useStore()
  const { currentAudio, isAudioPlaying } = mediaLibrary
  const isRadioPlaying = Boolean(isAudioPlaying && currentAudio && (currentAudio.mediaType === 'radio' || !currentAudio.mediaType))

  const customHero = (
    <div className="media-hero-banner radio-hero">
      <div className="media-hero-content">
        <span className="media-hero-kicker">LIVE AUDIO & BROADCAST</span>
        <h1 className="media-hero-title">Internet Radio & Broadcasters</h1>
        <p className="media-hero-subtitle">
          Tune in to live internet radio, public service broadcasters, community stations, and commercial audio streams worldwide.
          Featuring verified direct streams and the open Radio Browser global directory.
        </p>

        <div className="media-hero-stats">
          <span className="media-stat-item">
            <Icon name="radar" size={14} /> <strong>Direct Live Audio</strong> Streaming
          </span>
          <span className="media-stat-separator" aria-hidden="true">·</span>
          <span className="media-stat-item">
            <Icon name="audio" size={14} /> <strong>Public & Independent</strong> Broadcasters
          </span>
          <span className="media-stat-separator" aria-hidden="true">·</span>
          <span className="media-stat-item">
            <Icon name="check" size={14} /> <strong>Commercial-Free</strong> High-Fidelity Feeds
          </span>
        </div>

        {isRadioPlaying && currentAudio && (
          <div
            className="radio-visualizer-stage"
            style={{
              marginTop: '1.25rem',
              padding: '1rem 1.25rem',
              background: 'rgba(255, 255, 255, 0.04)',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: '#22c55e',
                    display: 'inline-block',
                  }}
                />
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text, #fff)' }}>
                  Now Broadcasting: {currentAudio.name}
                </span>
              </div>
              <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>Ambient Audio Spectrum</span>
            </div>
            <AudioVisualizer isPlaying={isAudioPlaying} height={72} showControls={true} defaultMode="bars" />
          </div>
        )}
      </div>
    </div>
  )

  const featured = ['res-rad-radio-browser', 'res-rad-somafm-groovesalad', 'res-rad-bbc-world-service', 'res-rad-kexp', 'res-rad-somafm-dronezone', 'res-rad-fip']

  return <MediaCategoryPage categoryId="radio" customBannerHero={customHero} featuredIds={featured} />
}
