// PersistentPlayerDock.tsx - Universal picture-in-picture player dock.
// Preserves stream playback across navigation with docked, minimized, and expand controls.
// Strictly adheres to zero em-dash typography standard.

import { useLocation, useNavigate } from 'react-router-dom'
import { Icon } from './Icon'
import { Art, ChannelMark } from './ui'
import { useUniversalPlayback } from '../state/playbackContext'
import { useStore } from '../state/store'
import { channelRef, resolve } from '../data/refs'
import { computeVideoStyle, DEFAULT_PICTURE_SETTINGS } from '../lib/videoGeometry'
import './PersistentPlayerDock.css'

export function PersistentPlayerDock() {
  let navigate: (to: string) => void = () => {}
  let pathname = ''
  try {
    navigate = useNavigate()
  } catch {
    // Graceful fallback when rendered outside a router context
  }

  try {
    pathname = useLocation().pathname
  } catch {
    if (typeof window !== 'undefined' && window.location) {
      pathname = window.location.pathname
    }
  }

  const {
    activeStream,
    playbackState,
    pipMode,
    videoRef,
    aspectRatio,
    pictureSettings,
    togglePlay,
    stopPlayback,
    setPipMode,
  } = useUniversalPlayback()

  const store = useStore()
  const prefs = store?.prefs

  let hasStreamOnRoute = false
  if (pathname.startsWith('/watch/')) {
    const rawRef = pathname.slice('/watch/'.length)
    const watchRef = decodeURIComponent(rawRef)
    const chId = watchRef.startsWith('channel:') ? watchRef.slice('channel:'.length) : watchRef
    const ch = store?.findChannel ? store.findChannel(chId) : undefined
    if (ch?.streamUrl) {
      hasStreamOnRoute = true
    } else if (store?.channels) {
      const resolved = resolve(watchRef, Date.now(), store.findChannel)
      if (resolved && 'streamUrl' in resolved && resolved.streamUrl) {
        hasStreamOnRoute = true
      }
    }
  }

  if (!activeStream && !hasStreamOnRoute) {
    return null
  }

  const isPlaying = playbackState.status === 'playing'

  const handleExpand = () => {
    if (activeStream?.ref) {
      navigate(`/watch/${encodeURIComponent(activeStream.ref)}`)
      setPipMode('fullscreen')
    } else if (activeStream?.channel) {
      navigate(`/watch/${encodeURIComponent(channelRef(activeStream.channel.id))}`)
      setPipMode('fullscreen')
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
        className={`player-video pip-video-element cue-${prefs?.subtitleSize ?? 'medium'} cue-${prefs?.subtitleStyle ?? 'shadow'}`}
        playsInline
        aria-label={activeStream?.title ? `${activeStream.title} video` : 'Player video'}
        style={{
          ...computeVideoStyle(aspectRatio, pictureSettings || DEFAULT_PICTURE_SETTINGS),
        }}
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
            {activeStream?.channel ? (
              <ChannelMark channel={activeStream.channel} size={24} />
            ) : (activeStream?.art || activeStream?.programmeArt) ? (
              <div style={{ width: 24, height: 24, borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
                <Art src={activeStream.art || activeStream.programmeArt || ''} alt={activeStream.title} contentId={activeStream.ref} fallbackIcon="film" />
              </div>
            ) : null}
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
