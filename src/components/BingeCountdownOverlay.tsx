import { useState, useEffect } from 'react'
import { Icon } from './Icon'
import './BingeCountdownOverlay.css'

export interface BingeCountdownOverlayProps {
  open: boolean
  nextTitle: string
  nextEpisodeCode: string
  initialSeconds?: number
  onPlayNext: () => void
  onCancel: () => void
}

export function BingeCountdownOverlay({
  open,
  nextTitle,
  nextEpisodeCode,
  initialSeconds = 10,
  onPlayNext,
  onCancel,
}: BingeCountdownOverlayProps) {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds)

  useEffect(() => {
    if (!open) {
      setSecondsLeft(initialSeconds)
      return
    }

    setSecondsLeft(initialSeconds)
    const interval = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval)
          onPlayNext()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => window.clearInterval(interval)
  }, [open, initialSeconds, onPlayNext])

  if (!open) return null

  return (
    <div className="binge-overlay" role="region" aria-label="Next episode countdown">
      <div className="binge-card">
        <div className="binge-top-row">
          <div className="binge-countdown-circle" aria-label={`${secondsLeft} seconds remaining`}>
            <span className="binge-timer-num tnum">{secondsLeft}</span>
          </div>
          <div className="binge-details">
            <span className="binge-label">Up Next</span>
            <div className="binge-ep-code">{nextEpisodeCode}</div>
            <strong className="binge-ep-title">{nextTitle}</strong>
          </div>
          <button
            type="button"
            className="icon-btn-micro binge-close-btn"
            onClick={onCancel}
            title="Cancel auto-play"
            aria-label="Cancel auto-play"
          >
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className="binge-actions">
          <button
            type="button"
            className="btn btn-primary btn-small binge-play-btn"
            onClick={onPlayNext}
          >
            <Icon name="play" size={14} />
            <span>Play Now</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
