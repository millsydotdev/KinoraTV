import { useEffect, useRef } from 'react'
import { Icon } from './Icon'
import './InactivityPromptOverlay.css'

export interface InactivityPromptOverlayProps {
  open: boolean
  countdownSecs: number
  onConfirmStillWatching: () => void
  onStopPlayback: () => void
}

export function InactivityPromptOverlay({
  open,
  countdownSecs,
  onConfirmStillWatching,
  onStopPlayback,
}: InactivityPromptOverlayProps) {
  const primaryBtnRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return

    // Auto-focus the primary confirmation button for TV remote navigation
    primaryBtnRef.current?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault()
        onConfirmStillWatching()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onConfirmStillWatching])

  if (!open) {
    return null
  }

  return (
    <div
      className="inactivity-overlay-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inactivity-title"
      aria-describedby="inactivity-desc"
    >
      <div className="inactivity-prompt-card">
        <div className="inactivity-prompt-icon" aria-hidden="true">
          <Icon name="clock" size={28} />
        </div>
        <h2 id="inactivity-title" className="inactivity-prompt-title">
          Are you still watching?
        </h2>
        <p id="inactivity-desc" className="inactivity-prompt-desc">
          Playback will pause automatically to save bandwidth and connection limits.
        </p>
        <div className="inactivity-countdown-badge" aria-live="polite">
          {countdownSecs}s
        </div>
        <div className="inactivity-prompt-actions">
          <button
            ref={primaryBtnRef}
            type="button"
            className="inactivity-btn-primary"
            onClick={onConfirmStillWatching}
            aria-label="Confirm still watching and continue playback"
          >
            I'm Still Watching
          </button>
          <button
            type="button"
            className="inactivity-btn-secondary"
            onClick={onStopPlayback}
            aria-label="Stop playback"
          >
            Stop Playback
          </button>
        </div>
      </div>
    </div>
  )
}
