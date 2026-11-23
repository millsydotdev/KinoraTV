import { useEffect, useRef, useState } from 'react'
import { isTauri, openStream, closeStream } from '../lib/native'
import { Icon } from './Icon'
import { Art } from './ui'
import { AudioNowPlayingModal, type EqualizerPreset } from './AudioNowPlayingModal'
import type { AudioTrackState } from '../state/mediaLibrary'
import './AudioPlayerBar.css'

interface AudioPlayerBarProps {
  track: AudioTrackState | null
  isPlaying: boolean
  volume: number
  onTogglePlay: () => void
  onStop: () => void
  onVolumeChange: (vol: number) => void
  queue?: AudioTrackState[]
  onPlayNext?: () => void
  onRemoveFromQueue?: (index: number) => void
  onClearQueue?: () => void
  sleepTimerRemaining?: number | null
  onSetSleepTimer?: (mins: number | null) => void
  onUpdateLyrics?: (lyrics: string) => void
}

export function AudioPlayerBar({
  track,
  isPlaying,
  volume,
  onTogglePlay,
  onStop,
  onVolumeChange,
  queue = [],
  onPlayNext,
  onRemoveFromQueue,
  onClearQueue,
  sleepTimerRemaining = null,
  onSetSleepTimer,
  onUpdateLyrics,
}: AudioPlayerBarProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const sessionRef = useRef<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [queueOpen, setQueueOpen] = useState(false)
  const [timerOpen, setTimerOpen] = useState(false)
  const [nowPlayingExpanded, setNowPlayingExpanded] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  const handleSeek = (targetSec: number) => {
    if (audioRef.current && Number.isFinite(targetSec)) {
      audioRef.current.currentTime = targetSec
      setCurrentTime(targetSec)
    }
  }

  // Web Audio Equalizer & Analyser DSP Nodes (Audit #84 & #85)
  const [eqPreset, setEqPreset] = useState<EqualizerPreset>(() => {
    try {
      const saved = localStorage.getItem('kinora.audio_eq_preset.v1')
      if (saved && ['Flat', 'Bass Boost', 'Vocal', 'Acoustic', 'Club'].includes(saved)) {
        return saved as EqualizerPreset
      }
    } catch {}
    return 'Flat'
  })

  const audioCtxRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const bassFilterRef = useRef<BiquadFilterNode | null>(null)
  const midFilterRef = useRef<BiquadFilterNode | null>(null)
  const trebleFilterRef = useRef<BiquadFilterNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)

  // Initialize Web Audio graph
  useEffect(() => {
    if (!audioRef.current || typeof window === 'undefined') return
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return

    try {
      if (!audioCtxRef.current) {
        const ctx = new AudioContextClass()
        audioCtxRef.current = ctx

        const bass = ctx.createBiquadFilter()
        bass.type = 'lowshelf'
        bass.frequency.value = 150

        const mid = ctx.createBiquadFilter()
        mid.type = 'peaking'
        mid.frequency.value = 1000
        mid.Q.value = 1

        const treble = ctx.createBiquadFilter()
        treble.type = 'highshelf'
        treble.frequency.value = 4000

        const analyser = ctx.createAnalyser()
        analyser.fftSize = 64

        bassFilterRef.current = bass
        midFilterRef.current = mid
        trebleFilterRef.current = treble
        analyserRef.current = analyser

        if (!sourceNodeRef.current && audioRef.current) {
          const src = ctx.createMediaElementSource(audioRef.current)
          sourceNodeRef.current = src
          src.connect(bass)
          bass.connect(mid)
          mid.connect(treble)
          treble.connect(analyser)
          analyser.connect(ctx.destination)
        }
      }
    } catch {
      // Gracefully fall back if Web Audio cannot capture media element (e.g. cross-origin restrictions)
    }
  }, [])

  // Apply EQ gains in decibels whenever preset changes
  useEffect(() => {
    try {
      localStorage.setItem('kinora.audio_eq_preset.v1', eqPreset)
    } catch {}

    const ctx = audioCtxRef.current
    const bass = bassFilterRef.current
    const mid = midFilterRef.current
    const treble = trebleFilterRef.current
    if (!ctx || !bass || !mid || !treble) return

    if (ctx.state === 'suspended' && isPlaying) {
      ctx.resume().catch(() => {})
    }

    switch (eqPreset) {
      case 'Bass Boost':
        bass.gain.value = 6
        mid.gain.value = 0
        treble.gain.value = -1
        break
      case 'Vocal':
        bass.gain.value = -3
        mid.gain.value = 4
        treble.gain.value = 2
        break
      case 'Acoustic':
        bass.gain.value = 2
        mid.gain.value = 1
        treble.gain.value = 3
        break
      case 'Club':
        bass.gain.value = 5
        mid.gain.value = 2
        treble.gain.value = 4
        break
      case 'Flat':
      default:
        bass.gain.value = 0
        mid.gain.value = 0
        treble.gain.value = 0
        break
    }
  }, [eqPreset, isPlaying])

  useEffect(() => {
    return () => {
      if (sessionRef.current !== null) {
        closeStream(sessionRef.current).catch(() => {})
        sessionRef.current = null
      }
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.removeAttribute('src')
        audioRef.current.load()
      }
    }
  }, [])

  useEffect(() => {
    if (!audioRef.current) return
    if (!track) {
      if (sessionRef.current !== null) {
        closeStream(sessionRef.current).catch(() => {})
        sessionRef.current = null
      }
      setError(null)
      setLoading(false)
      audioRef.current.pause()
      audioRef.current.removeAttribute('src')
      audioRef.current.load()
      return
    }

    let active = true
    const currentTrack = track
    setError(null)
    setLoading(true)

    async function loadAudio() {
      try {
        let src = currentTrack.streamUrl
        if (isTauri() && !src.startsWith('kstream://') && !src.startsWith('blob:')) {
          const opened = await openStream(src)
          if (!active) {
            if (opened) closeStream(opened.session).catch(() => {})
            return
          }
          if (opened) {
            if (sessionRef.current !== null) {
              closeStream(sessionRef.current).catch(() => {})
            }
            sessionRef.current = opened.session
            src = opened.url
          }
        }

        if (!active || !audioRef.current) return
        audioRef.current.src = src
        audioRef.current.volume = volume

        if (isPlaying) {
          try {
            await audioRef.current.play()
            if (active) setLoading(false)
          } catch {
            if (active) {
              setLoading(false)
              setError('Stream playback unavailable or blocked by network.')
            }
          }
        } else {
          audioRef.current.pause()
          if (active) setLoading(false)
        }
      } catch {
        if (active) {
          setLoading(false)
          setError('Stream playback unavailable or blocked by network.')
        }
      }
    }

    loadAudio()

    return () => {
      active = false
    }
  }, [track?.id, track?.streamUrl])

  // Synchronise play and pause without reloading stream session
  useEffect(() => {
    const el = audioRef.current
    if (!el || !track || loading) return
    if (isPlaying) {
      if (el.paused) {
        el.play().catch(() => {})
      }
    } else {
      if (!el.paused) {
        el.pause()
      }
    }
  }, [isPlaying, track, loading])

  // Synchronise volume level without reloading stream session
  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    el.volume = volume
  }, [volume])

  useEffect(() => {
    if (audioRef.current) {
      if (sleepTimerRemaining && sleepTimerRemaining <= 60 && sleepTimerRemaining > 0) {
        // Smoothly ramp volume down over the last 60 seconds of sleep timer
        const rampFactor = Math.max(0, sleepTimerRemaining / 60)
        audioRef.current.volume = volume * rampFactor
      } else {
        audioRef.current.volume = volume
      }
    }
  }, [volume, sleepTimerRemaining])

  useEffect(() => {
    if (track) {
      document.documentElement.style.setProperty('--audio-bar-height', '72px')
      return () => {
        document.documentElement.style.setProperty('--audio-bar-height', '0px')
      }
    } else {
      document.documentElement.style.setProperty('--audio-bar-height', '0px')
    }
  }, [track])

  if (!track) return null

  return (
    <aside className="audio-player-bar" aria-label="Audio Playback Bar">
      <audio
        ref={audioRef}
        onWaiting={() => setLoading(true)}
        onPlaying={() => { setLoading(false); setError(null) }}
        onError={() => { setLoading(false); setError('Unable to connect to audio stream.') }}
        onTimeUpdate={() => {
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime)
          }
        }}
        onDurationChange={() => {
          if (audioRef.current) {
            setDuration(audioRef.current.duration || 0)
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) {
            setDuration(audioRef.current.duration || 0)
          }
        }}
      />
      <div className="audio-player-container">
        {/* Track identity */}
        <button
          type="button"
          className="audio-player-info"
          onClick={() => setNowPlayingExpanded(true)}
          style={{ cursor: 'pointer' }}
          title="Click to expand Now Playing Visualizer"
          aria-label="Expand Now Playing Visualizer"
        >
          <div className="audio-player-avatar" style={{ '--track-hue': track.accentHue ?? 210 } as React.CSSProperties}>
            {track.artworkUrl ? (
              <Art src={track.artworkUrl} alt={track.name} contentId={`audio:${track.id}`} className="audio-player-avatar-img" fallbackIcon={track.mediaType === 'podcast' ? 'podcast' : track.mediaType === 'audiobook' ? 'book' : track.mediaType === 'music' ? 'music' : 'radio'} />
            ) : (
              <Icon name={track.mediaType === 'podcast' ? 'podcast' : track.mediaType === 'audiobook' ? 'book' : track.mediaType === 'music' ? 'music' : 'radio'} size={18} />
            )}
          </div>
          <div className="audio-player-text">
            <div className="audio-player-title-row">
              <span className="audio-player-name">{track.name}</span>
              <span className="audio-player-live-badge">
                {track.mediaType === 'podcast' ? 'PODCAST' : track.mediaType === 'audiobook' ? 'AUDIOBOOK' : track.mediaType === 'music' ? 'MUSIC' : 'LIVE RADIO'}
              </span>
            </div>
            <span className="audio-player-provider">{track.provider}</span>
          </div>
        </button>

        {/* Playback Controls */}
        <div className="audio-player-controls">
          <button
            type="button"
            className="audio-player-btn audio-player-btn-main"
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {loading ? (
              <span className="audio-player-spinner" aria-hidden="true" />
            ) : (
              <Icon name={isPlaying ? 'pause' : 'play'} size={20} />
            )}
          </button>
          {queue.length > 0 && onPlayNext && (
            <button
              type="button"
              className="audio-player-btn audio-player-btn-secondary"
              onClick={onPlayNext}
              aria-label="Play next track in queue"
              title="Next track"
            >
              <Icon name="skip" size={16} />
            </button>
          )}
          {error && <span className="audio-player-error" role="alert">{error}</span>}
        </div>

        {/* Volume, Sleep Timer, Queue & Close */}
        <div className="audio-player-side">
          {/* Sleep Timer */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className={`audio-player-btn audio-player-btn-secondary ${sleepTimerRemaining ? 'is-active' : ''}`}
              onClick={() => {
                setTimerOpen(!timerOpen)
                setQueueOpen(false)
              }}
              aria-label="Sleep timer"
              title="Sleep timer"
            >
              <Icon name="timer" size={16} />
              {sleepTimerRemaining !== null && (
                <span className="audio-timer-countdown">
                  {Math.floor(sleepTimerRemaining / 60)}m
                </span>
              )}
            </button>
            {timerOpen && (
              <div className="audio-timer-popover" role="menu">
                <p style={{ margin: '4px 8px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-3)' }}>Sleep Timer</p>
                {[15, 30, 45, 60].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    className={`audio-timer-option ${sleepTimerRemaining && Math.round(sleepTimerRemaining / 60) === mins ? 'is-active' : ''}`}
                    onClick={() => {
                      onSetSleepTimer?.(mins)
                      setTimerOpen(false)
                    }}
                  >
                    {mins} minutes
                  </button>
                ))}
                <button
                  type="button"
                  className="audio-timer-option"
                  onClick={() => {
                    onSetSleepTimer?.(null)
                    setTimerOpen(false)
                  }}
                >
                  Turn off timer
                </button>
              </div>
            )}
          </div>

          {/* Queue Drawer Button */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className={`audio-player-btn audio-player-btn-secondary ${queueOpen ? 'is-active' : ''}`}
              onClick={() => {
                setQueueOpen(!queueOpen)
                setTimerOpen(false)
              }}
              aria-label="Audio queue"
              title="Playback queue"
            >
              <Icon name="queue" size={16} />
              {queue.length > 0 && <span className="audio-badge-counter">{queue.length}</span>}
            </button>
            {queueOpen && (
              <div className="audio-queue-drawer" role="dialog" aria-label="Audio Queue">
                <div className="audio-queue-header">
                  <span className="audio-queue-title">Up Next ({queue.length})</span>
                  {queue.length > 0 && onClearQueue && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={onClearQueue}
                    >
                      Clear
                    </button>
                  )}
                </div>
                {queue.length === 0 ? (
                  <p className="faint" style={{ padding: '16px', margin: 0, textAlign: 'center', fontSize: '0.8125rem' }}>
                    Queue is empty. Add stations or podcasts from the catalogue.
                  </p>
                ) : (
                  <ul className="audio-queue-list">
                    {queue.map((item, idx) => (
                      <li key={`${item.id}-${idx}`} className="audio-queue-item">
                        <div className="audio-queue-item-info">
                          <span className="audio-queue-item-title">{item.name}</span>
                          <span className="audio-queue-item-provider">{item.provider}</span>
                        </div>
                        {onRemoveFromQueue && (
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => onRemoveFromQueue(idx)}
                            aria-label={`Remove ${item.name} from queue`}
                          >
                            <Icon name="close" size={14} />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="audio-player-volume-group">
            <Icon name={volume === 0 ? 'mute' : 'volume'} size={18} />
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              aria-label="Audio volume"
              className="audio-player-volume-slider"
            />
          </div>
          <button
            type="button"
            className="audio-player-btn audio-player-btn-secondary"
            onClick={() => setNowPlayingExpanded(true)}
            aria-label="Expand Now Playing visualizer"
            title="Expand visualizer"
          >
            <Icon name="fullscreen" size={16} />
          </button>
          <button
            type="button"
            className="audio-player-btn audio-player-btn-close"
            onClick={onStop}
            aria-label="Stop playback"
            title="Close player"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      </div>
      {nowPlayingExpanded && (
        <AudioNowPlayingModal
          isOpen={nowPlayingExpanded}
          onClose={() => setNowPlayingExpanded(false)}
          track={track}
          isPlaying={isPlaying}
          volume={volume}
          onTogglePlay={onTogglePlay}
          onVolumeChange={onVolumeChange}
          onPlayNext={onPlayNext}
          hasQueue={queue.length > 0}
          eqPreset={eqPreset}
          onSelectEqPreset={setEqPreset}
          analyserNode={analyserRef.current}
          currentTime={currentTime}
          duration={duration}
          onSeek={handleSeek}
          onUpdateLyrics={onUpdateLyrics}
        />
      )}
    </aside>
  )
}
