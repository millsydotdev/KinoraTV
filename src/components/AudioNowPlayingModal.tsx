import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import type { AudioTrackState } from '../state/mediaLibrary'
import './AudioNowPlayingModal.css'

export interface AudioNowPlayingModalProps {
  isOpen: boolean
  onClose: () => void
  track: AudioTrackState
  isPlaying: boolean
  volume: number
  onTogglePlay: () => void
  onVolumeChange: (vol: number) => void
  onPlayNext?: () => void
  hasQueue?: boolean
  eqPreset?: EqualizerPreset
  onSelectEqPreset?: (preset: EqualizerPreset) => void
  analyserNode?: AnalyserNode | null
}

export type EqualizerPreset = 'Flat' | 'Bass Boost' | 'Vocal' | 'Acoustic' | 'Club'

const EQ_PRESETS: EqualizerPreset[] = ['Flat', 'Bass Boost', 'Vocal', 'Acoustic', 'Club']

export function AudioNowPlayingModal({
  isOpen,
  onClose,
  track,
  isPlaying,
  volume,
  onTogglePlay,
  onVolumeChange,
  onPlayNext,
  hasQueue,
  eqPreset: externalEqPreset,
  onSelectEqPreset: onExternalSelectEqPreset,
  analyserNode,
}: AudioNowPlayingModalProps) {
  const [internalEqPreset, setInternalEqPreset] = useState<EqualizerPreset>('Flat')
  const eqPreset = externalEqPreset ?? internalEqPreset
  const setEqPreset = onExternalSelectEqPreset ?? setInternalEqPreset

  const barsCount = 24
  const [barHeights, setBarHeights] = useState<number[]>(() => Array(barsCount).fill(6))

  useEffect(() => {
    if (!isOpen || !isPlaying || !analyserNode) {
      return
    }

    let animId: number
    const bufferLength = analyserNode.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    const updateBars = () => {
      analyserNode.getByteFrequencyData(dataArray)
      const heights: number[] = []
      const step = Math.max(1, Math.floor(bufferLength / barsCount))
      for (let i = 0; i < barsCount; i++) {
        const val = dataArray[i * step] || 0
        const h = Math.max(6, Math.round((val / 255) * 48))
        heights.push(h)
      }
      setBarHeights(heights)
      animId = requestAnimationFrame(updateBars)
    }

    animId = requestAnimationFrame(updateBars)
    return () => {
      cancelAnimationFrame(animId)
    }
  }, [isOpen, isPlaying, analyserNode])

  if (!isOpen) return null

  return (
    <div
      className="audio-now-playing-overlay"
      style={{ '--track-hue': track.accentHue ?? 220 } as React.CSSProperties}
      role="dialog"
      aria-modal="true"
      aria-label={`Now Playing: ${track.name}`}
    >
      {/* Header */}
      <header className="anp-header">
        <div className="anp-badge-group">
          <span className="anp-live-badge">
            <span className="anp-live-dot" aria-hidden="true" />
            <span>{(track.mediaType ?? 'audio').toUpperCase()}</span>
          </span>
          <span style={{ fontSize: '0.8125rem', opacity: 0.7 }}>
            Kinora Audio Engine {analyserNode ? '(Live DSP)' : '(Simulated)'}
          </span>
        </div>

        <button
          type="button"
          className="anp-close-btn"
          onClick={onClose}
          aria-label="Close now playing overlay"
          title="Minimize player"
        >
          <Icon name="down" size={20} />
        </button>
      </header>

      {/* Main Content */}
      <main className="anp-body">
        {/* Artwork Stage with Radial Glow */}
        <div className="anp-stage">
          <div className="anp-ambient-glow" aria-hidden="true" />
          <div className="anp-art-tile">
            {track.artworkUrl ? (
              <img src={track.artworkUrl} alt="" className="anp-art-img" />
            ) : (
              <div className="anp-art-fallback">
                <Icon
                  name={
                    track.mediaType === 'podcast'
                      ? 'podcast'
                      : track.mediaType === 'audiobook'
                        ? 'book'
                        : track.mediaType === 'music'
                          ? 'music'
                          : 'radio'
                  }
                  size={64}
                />
              </div>
            )}
          </div>
        </div>

        {/* Spectrum Wave Bars */}
        <div className="anp-visualizer-bars" aria-hidden="true">
          {Array.from({ length: barsCount }, (_, idx) => {
            const delay = ((idx * 0.08) % 1.2).toFixed(2)
            const duration = (0.8 + ((idx % 5) * 0.15)).toFixed(2)
            const realHeight = analyserNode && isPlaying ? `${barHeights[idx]}px` : undefined
            return (
              <div
                key={idx}
                className={`anp-bar ${isPlaying && !analyserNode ? 'is-animated' : ''}`}
                style={{
                  animationDelay: analyserNode ? '0s' : `${delay}s`,
                  animationDuration: analyserNode ? '0s' : `${duration}s`,
                  height: realHeight ?? (isPlaying ? undefined : '6px'),
                  transition: analyserNode ? 'height 60ms ease-out' : undefined,
                }}
              />
            )
          })}
        </div>

        {/* Track Metadata */}
        <div className="anp-meta">
          <h2 className="anp-title">{track.name}</h2>
          <div className="anp-provider">{track.provider}</div>
          <div className="anp-format-tags">
            <span className="anp-format-badge">AAC Stereo</span>
            <span className="anp-format-badge">320 kbps</span>
            <span className="anp-format-badge">48 kHz</span>
            <span className="anp-format-badge">Low Latency</span>
          </div>
        </div>

        {/* Equalizer Presets */}
        <div className="anp-eq-container" role="radiogroup" aria-label="Equalizer preset">
          <span className="anp-eq-label">EQ:</span>
          {EQ_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              className={`anp-eq-btn ${eqPreset === p ? 'is-active' : ''}`}
              onClick={() => setEqPreset(p)}
              aria-pressed={eqPreset === p}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Playback Controls */}
        <div className="anp-controls">
          <button
            type="button"
            className="anp-btn-play"
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            <Icon name={isPlaying ? 'pause' : 'play'} size={28} />
          </button>

          {hasQueue && onPlayNext && (
            <button
              type="button"
              className="anp-btn-skip"
              onClick={onPlayNext}
              aria-label="Skip to next track"
              title="Next track"
            >
              <Icon name="skip" size={20} />
            </button>
          )}
        </div>

        {/* Volume Slider */}
        <div className="anp-volume-wrap">
          <Icon name={volume === 0 ? 'mute' : 'volume'} size={18} />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="anp-volume-slider"
            aria-label="Master volume"
          />
          <span style={{ fontSize: '0.75rem', opacity: 0.7, minWidth: 32 }}>
            {Math.round(volume * 100)}%
          </span>
        </div>
      </main>
    </div>
  )
}
