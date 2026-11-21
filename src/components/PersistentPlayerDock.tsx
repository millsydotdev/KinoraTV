// PersistentPlayerDock.tsx - Universal picture-in-picture player dock.
// Preserves stream playback across navigation with docked, minimized, and expand controls.
// Strictly adheres to zero em-dash typography standard.

import { useNavigate } from 'react-router-dom'
import { Icon } from './Icon'
import { useUniversalPlayback } from '../state/playbackContext'
import './PersistentPlayerDock.css'

export function PersistentPlayerDock() {
  const navigate = useNavigate()
  const {
    activeStream,
    playbackState,
    pipMode,
    videoRef,
    togglePlay,
    stopPlayback,
    setPipMode,
  } = useUniversalPlayback()

  if (!activeStream && pipMode === 'hidden') {
    return (
      <div className="pip-dock-container is-hidden" aria-hidden="true">
        <video ref={videoRef} className="pip-video-element" playsInline />
      </div>
    )
  }

  const isPlaying = playbackState.status === 'playing'

  const handleExpand = () => {
    if (activeStream?.ref) {
      navigate(`/watch/${encodeURIComponent(activeStream.ref)}`)
      setPipMode('hidden')
    } else if (activeStream?.channel) {
      navigate('/live')
      setPipMode('docked')
    } else {
      setPipMode('fullscreen')
    }
  }

  return (
    <aside
      className={`pip-dock-container is-${pipMode}`}
      aria-label="Picture-in-picture player"
    >
      <video
        ref={videoRef}
        className="pip-video-element"
        playsInline
        aria-label={activeStream?.title ? `${activeStream.title} video` : 'Player video'}
      />

      {pipMode === 'docked' && (
        <div className="pip-dock-overlay">
          <div className="pip-dock-top-bar">
            <div className="pip-title-badge">
              {activeStream?.isLive && <span className="pip-live-dot">LIVE</span>}
              <span className="pip-title-text" title={activeStream?.title}>
                {activeStream?.title || 'Live Stream'}
              </span>
            </div>
            <div className="pip-actions-cluster">
              <button
                type="button"
                className="pip-btn"
                title="Minimize player"
                aria-label="Minimize player"
                onClick={() => setPipMode('minimized')}
              >
                <Icon name="minus" size={14} />
              </button>
              <button
                type="button"
                className="pip-btn"
                title="Expand to full player"
                aria-label="Expand to full player"
                onClick={handleExpand}
              >
                <Icon name="fullscreen" size={14} />
              </button>
              <button
                type="button"
                className="pip-btn"
                title="Close player"
                aria-label="Close player"
                onClick={stopPlayback}
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          </div>

          <button
            type="button"
            className="pip-center-play-btn"
            title={isPlaying ? 'Pause' : 'Play'}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            onClick={togglePlay}
          >
            <Icon name={isPlaying ? 'pause' : 'play'} size={20} />
          </button>

          <div className="pip-dock-bottom-bar">
            {activeStream?.subtitle && (
              <span className="pip-title-text" style={{ fontSize: '11px', opacity: 0.85 }}>
                {activeStream.subtitle}
              </span>
            )}
          </div>
        </div>
      )}

      {pipMode === 'minimized' && (
        <div className="pip-minimized-content">
          <div className="pip-min-info">
            {activeStream?.isLive && <span className="pip-live-dot">LIVE</span>}
            <span className="pip-min-title" title={activeStream?.title}>
              {activeStream?.title || 'Playing Audio'}
            </span>
          </div>
          <div className="pip-actions-cluster">
            <button
              type="button"
              className="pip-btn"
              title={isPlaying ? 'Pause' : 'Play'}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              onClick={togglePlay}
            >
              <Icon name={isPlaying ? 'pause' : 'play'} size={14} />
            </button>
            <button
              type="button"
              className="pip-btn"
              title="Expand player"
              aria-label="Expand player"
              onClick={() => setPipMode('docked')}
            >
              <Icon name="fullscreen" size={14} />
            </button>
            <button
              type="button"
              className="pip-btn"
              title="Close player"
              aria-label="Close player"
              onClick={stopPlayback}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
