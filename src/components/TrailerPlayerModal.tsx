import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import './TrailerPlayerModal.css'

export interface TrailerPlayerModalProps {
  open: boolean
  onClose: () => void
  title: string
  trailerUrl?: string | null
  posterUrl?: string
  playFullUrl?: string
}

function parseEmbedUrl(url: string): string | null {
  if (!url) return null
  const trimmed = url.trim()

  // YouTube detection and conversion to privacy-enhanced embed
  const ytMatch = trimmed.match(
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i,
  )
  if (ytMatch && ytMatch[1]) {
    return `https://www.youtube-nocookie.com/embed/${ytMatch[1]}?autoplay=1&rel=0&modestbranding=1`
  }

  // Vimeo detection
  const vimeoMatch = trimmed.match(
    /vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|album\/(\d+)\/video\/|)(\d+)/,
  )
  if (vimeoMatch && vimeoMatch[3]) {
    return `https://player.vimeo.com/video/${vimeoMatch[3]}?autoplay=1`
  }

  // Internet Archive detection
  if (trimmed.includes('archive.org/details/')) {
    return trimmed.replace('/details/', '/embed/')
  }
  if (trimmed.includes('archive.org/embed/')) {
    return trimmed
  }

  // If already an embed iframe URL
  if (trimmed.includes('/embed/') || trimmed.includes('player.')) {
    return trimmed
  }

  return null
}

function isDirectVideo(url: string): boolean {
  if (!url) return false
  const lower = url.toLowerCase()
  if (
    lower.endsWith('.mp4') ||
    lower.endsWith('.webm') ||
    lower.endsWith('.mkv') ||
    lower.endsWith('.ogv') ||
    lower.startsWith('kstream://') ||
    lower.includes('.mp4?') ||
    lower.includes('.webm?')
  ) {
    return true
  }
  return false
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function TrailerPlayerModal({
  open,
  onClose,
  title,
  trailerUrl,
  posterUrl,
  playFullUrl,
}: TrailerPlayerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [isPlaying, setIsPlaying] = useState(true)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackError, setPlaybackError] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const rawUrl = trailerUrl?.trim() || ''
  const embedUrl = parseEmbedUrl(rawUrl)
  const isDirect = !embedUrl && Boolean(rawUrl) && (isDirectVideo(rawUrl) || !rawUrl.includes('://') || rawUrl.startsWith('http'))

  // Reset state on open or URL change
  useEffect(() => {
    if (!open) return
    setPlaybackError(false)
    setCurrentTime(0)
    setDuration(0)
    setIsPlaying(true)
  }, [open, rawUrl])

  // Cleanup direct video element on close or unmount
  useEffect(() => {
    return () => {
      if (videoRef.current) {
        videoRef.current.pause()
        videoRef.current.removeAttribute('src')
        videoRef.current.load()
      }
    }
  }, [])

  // Keyboard shortcut listener: Escape, Space, M, F, Arrow keys
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT'
      if (isInput) return

      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === ' ' && isDirect && videoRef.current) {
        e.preventDefault()
        if (videoRef.current.paused) {
          void videoRef.current.play()
          setIsPlaying(true)
        } else {
          videoRef.current.pause()
          setIsPlaying(false)
        }
      } else if ((e.key === 'm' || e.key === 'M') && isDirect && videoRef.current) {
        e.preventDefault()
        const nextMuted = !videoRef.current.muted
        videoRef.current.muted = nextMuted
        setIsMuted(nextMuted)
      } else if ((e.key === 'f' || e.key === 'F') && isDirect && containerRef.current) {
        e.preventDefault()
        if (!document.fullscreenElement) {
          void containerRef.current.requestFullscreen?.()
          setIsFullscreen(true)
        } else {
          void document.exitFullscreen?.()
          setIsFullscreen(false)
        }
      } else if (e.key === 'ArrowLeft' && isDirect && videoRef.current) {
        e.preventDefault()
        videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5)
      } else if (e.key === 'ArrowRight' && isDirect && videoRef.current) {
        e.preventDefault()
        videoRef.current.currentTime = Math.min(
          videoRef.current.duration || 0,
          videoRef.current.currentTime + 5,
        )
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose, isDirect])

  if (!open) return null

  const togglePlay = () => {
    if (!videoRef.current) return
    if (videoRef.current.paused) {
      void videoRef.current.play()
      setIsPlaying(true)
    } else {
      videoRef.current.pause()
      setIsPlaying(false)
    }
  }

  const toggleMute = () => {
    if (!videoRef.current) return
    const nextMuted = !videoRef.current.muted
    videoRef.current.muted = nextMuted
    setIsMuted(nextMuted)
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value)
    setVolume(val)
    if (videoRef.current) {
      videoRef.current.volume = val
      videoRef.current.muted = val === 0
      setIsMuted(val === 0)
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value)
    setCurrentTime(time)
    if (videoRef.current) {
      videoRef.current.currentTime = time
    }
  }

  const toggleFullscreen = () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      void containerRef.current.requestFullscreen?.()
      setIsFullscreen(true)
    } else {
      void document.exitFullscreen?.()
      setIsFullscreen(false)
    }
  }

  const hasPlayableSource = Boolean(rawUrl) && !playbackError

  return (
    <div
      className="trailer-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Official Trailer: ${title}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          if (videoRef.current) {
            videoRef.current.pause()
            videoRef.current.removeAttribute('src')
            videoRef.current.load()
          }
          onClose()
        }
      }}
    >
      <div className="trailer-modal-stage" ref={containerRef} onClick={(e) => e.stopPropagation()}>
        {/* Header Bar */}
        <div className="trailer-modal-header">
          <div className="trailer-modal-header-meta">
            <span className="trailer-kicker-badge">Official Preview</span>
            <h3 className="trailer-modal-title">{title}</h3>
          </div>
          <button
            type="button"
            className="trailer-modal-close-btn"
            onClick={() => {
              if (videoRef.current) {
                videoRef.current.pause()
                videoRef.current.removeAttribute('src')
                videoRef.current.load()
              }
              onClose()
            }}
            aria-label="Close trailer"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Video Canvas Stage */}
        <div className="trailer-video-canvas">
          {hasPlayableSource ? (
            embedUrl ? (
              <iframe
                src={embedUrl}
                title={`${title} Official Trailer`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="trailer-iframe-player"
              />
            ) : isDirect ? (
              <div className="trailer-direct-wrap">
                <video
                  ref={videoRef}
                  src={rawUrl}
                  poster={posterUrl}
                  autoPlay
                  playsInline
                  className="trailer-html5-video"
                  onClick={togglePlay}
                  onTimeUpdate={() => {
                    if (videoRef.current) {
                      setCurrentTime(videoRef.current.currentTime)
                    }
                  }}
                  onLoadedMetadata={() => {
                    if (videoRef.current) {
                      setDuration(videoRef.current.duration)
                    }
                  }}
                  onEnded={() => setIsPlaying(false)}
                  onError={() => setPlaybackError(true)}
                />

                {/* Direct Transport Bar */}
                <div className="trailer-transport-bar">
                  <button
                    type="button"
                    className="trailer-control-btn"
                    onClick={togglePlay}
                    aria-label={isPlaying ? 'Pause trailer' : 'Play trailer'}
                  >
                    <Icon name={isPlaying ? 'pause' : 'play'} size={18} />
                  </button>

                  <span className="trailer-time-text tnum">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>

                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    step={0.1}
                    value={currentTime}
                    onChange={handleSeek}
                    className="trailer-scrub-slider"
                    aria-label="Seek trailer time"
                  />

                  <div className="trailer-volume-group">
                    <button
                      type="button"
                      className="trailer-control-btn"
                      onClick={toggleMute}
                      aria-label={isMuted ? 'Unmute trailer' : 'Mute trailer'}
                    >
                      <Icon name={isMuted ? 'mute' : 'volume'} size={18} />
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="trailer-volume-slider"
                      aria-label="Trailer volume"
                    />
                  </div>

                  <button
                    type="button"
                    className="trailer-control-btn"
                    onClick={toggleFullscreen}
                    aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                  >
                    <Icon name="fullscreen" size={17} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="trailer-fallback-stage">
                <span className="trailer-fallback-icon">
                  <Icon name="film" size={48} />
                </span>
                <h4 className="trailer-fallback-title">Trailer Stream Unavailable</h4>
                <p className="trailer-fallback-text">
                  The preview address configured for {title} could not be resolved directly.
                </p>
                {playFullUrl && (
                  <Link
                    to={playFullUrl}
                    className="btn btn-primary trailer-watch-full-btn"
                    onClick={onClose}
                  >
                    <Icon name="play" size={16} />
                    <span>Watch Full Feature</span>
                  </Link>
                )}
              </div>
            )
          ) : (
            <div className="trailer-fallback-stage">
              <span className="trailer-fallback-icon">
                <Icon name="film" size={48} />
              </span>
              <h4 className="trailer-fallback-title">Trailer Preview Unavailable</h4>
              <p className="trailer-fallback-text">
                An official promotional video trailer is not available in the metadata catalogue for {title}.
              </p>
              <div className="trailer-fallback-actions">
                {playFullUrl && (
                  <Link
                    to={playFullUrl}
                    className="btn btn-primary trailer-watch-full-btn"
                    onClick={onClose}
                  >
                    <Icon name="play" size={16} />
                    <span>Watch Full Feature</span>
                  </Link>
                )}
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={onClose}
                >
                  Close Preview
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
