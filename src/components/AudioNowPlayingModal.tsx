import { useState } from 'react'
import { Icon } from './Icon'
import { Art } from './ui'
import { LyricsViewer } from './LyricsViewer'
import { AudioVisualizer } from './AudioVisualizer'
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
  currentTime?: number
  duration?: number
  onSeek?: (timeSec: number) => void
  onUpdateLyrics?: (lyrics: string) => void
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
  currentTime = 0,
  duration = 0,
  onSeek,
  onUpdateLyrics,
}: AudioNowPlayingModalProps) {
  const [internalEqPreset, setInternalEqPreset] = useState<EqualizerPreset>('Flat')
  const [viewMode, setViewMode] = useState<'visualizer' | 'lyrics'>(() => (track.lyrics ? 'lyrics' : 'visualizer'))
  const eqPreset = externalEqPreset ?? internalEqPreset
  const setEqPreset = onExternalSelectEqPreset ?? setInternalEqPreset

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

        <div className="anp-view-mode-toggle" role="tablist" aria-label="Playback visualizer mode">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'visualizer'}
            className={`anp-mode-btn ${viewMode === 'visualizer' ? 'is-active' : ''}`}
            onClick={() => setViewMode('visualizer')}
          >
            Visualizer
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'lyrics'}
            className={`anp-mode-btn ${viewMode === 'lyrics' ? 'is-active' : ''}`}
            onClick={() => setViewMode('lyrics')}
          >
            Lyrics
          </button>
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
        {viewMode === 'visualizer' ? (
          <>
            {/* Artwork Stage with Radial Glow */}
            <div className="anp-stage">
              <div className="anp-ambient-glow" aria-hidden="true" />
              <div className="anp-art-tile">
                {track.artworkUrl ? (
                  <Art src={track.artworkUrl} alt={track.name} contentId={`audio:${track.id}`} className="anp-art-img" fallbackIcon={track.mediaType === 'podcast' ? 'podcast' : track.mediaType === 'audiobook' ? 'book' : track.mediaType === 'music' ? 'music' : 'radio'} />
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

            {/* Real-Time Audio Spectrum Visualizer */}
            {analyserNode ? (
              <AudioVisualizer
                analyserNode={analyserNode}
                isPlaying={isPlaying}
                height={72}
                showControls={true}
              />
            ) : (
              <div className="anp-visualizer-bars" aria-hidden="true">
                {Array.from({ length: 24 }, (_, idx) => {
                  const delay = ((idx * 0.08) % 1.2).toFixed(2)
                  const duration = (0.8 + ((idx % 5) * 0.15)).toFixed(2)
                  return (
                    <div
                      key={idx}
                      className={`anp-bar ${isPlaying ? 'is-animated' : ''}`}
                      style={{
                        animationDelay: `${delay}s`,
                        animationDuration: `${duration}s`,
                      }}
                    />
                  )
                })}
              </div>
            )}
          </>
        ) : (
          <div className="anp-lyrics-wrapper">
            <LyricsViewer
              currentTime={currentTime}
              duration={duration}
              lyricsText={track.lyrics}
              onSeek={onSeek}
              onLyricsLoaded={onUpdateLyrics}
              trackTitle={track.name}
              trackArtist={track.provider}
            />
          </div>
        )}

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
