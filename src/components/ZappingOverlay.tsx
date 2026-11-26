import { useEffect, useMemo, useRef } from 'react'
import type { Channel, Programme } from '../data/types'
import { ChannelMark } from './ui'
import { Icon } from './Icon'
import { cleanChannelTitle } from '../lib/cleanTitle'
import './ZappingOverlay.css'

export interface ZappingOverlayProps {
  channel: Channel
  nowProgramme?: Programme | null
  nextProgramme?: Programme | null
  visible: boolean
  onClose: () => void
  onNextChannel?: () => void
  onPrevChannel?: () => void
}

export function ZappingOverlay({
  channel,
  nowProgramme,
  nextProgramme,
  visible,
  onClose,
  onNextChannel,
  onPrevChannel,
}: ZappingOverlayProps) {
  const timerRef = useRef<number>(0)

  // Auto-dismiss after 3.5 seconds
  useEffect(() => {
    if (!visible) return
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      onClose()
    }, 3500)
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [visible, channel.id, onClose])

  const cleanTitle = useMemo(() => {
    return channel.cleanName || cleanChannelTitle(channel.name)
  }, [channel.cleanName, channel.name])

  const nowProgress = useMemo(() => {
    if (!nowProgramme) return 0
    const start = typeof nowProgramme.start === 'number' ? nowProgramme.start : new Date(nowProgramme.start).getTime()
    const stop = typeof nowProgramme.stop === 'number' ? nowProgramme.stop : new Date(nowProgramme.stop).getTime()
    const now = Date.now()
    if (stop <= start) return 0
    const pct = ((now - start) / (stop - start)) * 100
    return Math.max(0, Math.min(100, Math.round(pct)))
  }, [nowProgramme])

  const formatTime = (time?: number | string) => {
    if (time === undefined || time === null) return ''
    try {
      const d = typeof time === 'number' ? new Date(time) : new Date(time)
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  if (!visible) return null

  return (
    <div className="zapping-overlay" role="status" aria-live="polite">
      <div className="zapping-card">
        <div className="zapping-left">
          <ChannelMark channel={channel} size={44} />
          {channel.number > 0 && <span className="zapping-chno tnum">{channel.number}</span>}
        </div>

        <div className="zapping-center">
          <div className="zapping-header">
            <h2 className="zapping-title">{cleanTitle}</h2>
            {channel.badges && channel.badges.length > 0 && (
              <span className="zapping-badges">
                {channel.badges.map((b, idx) => (
                  <span key={`${b.kind}-${idx}`} className={`guide-channel-tag tag-${b.kind}`}>
                    {b.label}
                  </span>
                ))}
              </span>
            )}
          </div>

          {nowProgramme && (
            <div className="zapping-now">
              <span className="zapping-tag now">NOW</span>
              <strong className="zapping-prog-title">{nowProgramme.title}</strong>
              <span className="zapping-prog-time tnum">
                {formatTime(nowProgramme.start)} - {formatTime(nowProgramme.stop)}
              </span>
            </div>
          )}

          {nowProgramme && (
            <div className="zapping-progress-track">
              <div
                className="zapping-progress-fill"
                style={{ width: `${nowProgress}%` }}
                aria-valuenow={nowProgress}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          )}

          {nextProgramme && (
            <div className="zapping-next">
              <span className="zapping-tag next">NEXT</span>
              <span className="zapping-next-title">{nextProgramme.title}</span>
              <span className="zapping-next-time tnum">{formatTime(nextProgramme.start)}</span>
            </div>
          )}
        </div>

        <div className="zapping-right">
          {onNextChannel && (
            <button
              type="button"
              className="zapping-step-btn"
              onClick={onNextChannel}
              aria-label="Next channel"
              title="Next channel (PageUp or ])"
            >
              <Icon name="up" size={16} />
            </button>
          )}
          {onPrevChannel && (
            <button
              type="button"
              className="zapping-step-btn"
              onClick={onPrevChannel}
              aria-label="Previous channel"
              title="Previous channel (PageDown or [)"
            >
              <Icon name="down" size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
