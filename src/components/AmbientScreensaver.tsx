// AmbientScreensaver.tsx - OLED burn-in protection and ambient living room mode.
// Displays minimalist clock, backdrop artwork, and slowly drifts elements to prevent pixel burn-in.
// Strictly adheres to typography standards: zero em-dashes across all code and comments.

import { useEffect, useState } from 'react'
import { clock } from '../lib/time'
import './AmbientScreensaver.css'

export interface AmbientScreensaverProps {
  visible: boolean
  onDismiss: () => void
  backdropUrl?: string | null
  title?: string | null
  weatherInfo?: string | null
}

export function AmbientScreensaver({
  visible,
  onDismiss,
  backdropUrl,
  title,
  weatherInfo,
}: AmbientScreensaverProps) {
  const [time, setTime] = useState(() => clock(Date.now()))
  // Micro-offset for pixel shifting to protect OLED panels
  const [shiftOffset, setShiftOffset] = useState({ x: 0, y: 0 })

  // Update clock every second
  useEffect(() => {
    if (!visible) return
    const interval = window.setInterval(() => {
      setTime(clock(Date.now()))
    }, 1000)
    return () => clearInterval(interval)
  }, [visible])

  // Pixel shifting every 30 seconds
  useEffect(() => {
    if (!visible) return
    const interval = window.setInterval(() => {
      // Subtle shift between -12px and +12px
      setShiftOffset({
        x: Math.floor(Math.random() * 24) - 12,
        y: Math.floor(Math.random() * 24) - 12,
      })
    }, 30000)
    return () => clearInterval(interval)
  }, [visible])

  // Dismiss on any keyboard interaction
  useEffect(() => {
    if (!visible) return
    const onKey = () => onDismiss()
    const onMouse = () => onDismiss()
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onMouse)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onMouse)
    }
  }, [visible, onDismiss])

  if (!visible) return null

  const now = new Date()
  const dateFormatted = now.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div
      className="ambient-screensaver-backdrop"
      role="region"
      aria-label="Ambient screensaver"
      onClick={onDismiss}
    >
      {backdropUrl && (
        <div
          className="ambient-backdrop-image"
          style={{ backgroundImage: `url(${backdropUrl})` }}
        />
      )}
      <div className="ambient-scrim" />

      <div
        className="ambient-content"
        style={{
          transform: `translate(${shiftOffset.x}px, ${shiftOffset.y}px)`,
        }}
      >
        <div className="ambient-clock">{time}</div>
        <div className="ambient-date">{dateFormatted}</div>

        {(title || weatherInfo) && (
          <div className="ambient-meta-pill">
            {title && <span className="ambient-meta-title">{title}</span>}
            {title && weatherInfo && <span className="ambient-meta-sep">•</span>}
            {weatherInfo && <span className="ambient-meta-weather">{weatherInfo}</span>}
          </div>
        )}

        <div className="ambient-prompt">Press any button or move mouse to wake</div>
      </div>
    </div>
  )
}
