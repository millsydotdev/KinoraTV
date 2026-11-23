/**
 * Now & Next Live EPG Mini-Bar for Kinora player.
 * Displays current and upcoming schedule with progress bar and channel peeker without leaving playback.
 */

import { useEffect, useRef, useState } from 'react'
import type { Channel, Programme } from '../data/types'
import { clock } from '../lib/time'
import { cleanChannelTitle } from '../lib/cleanTitle'
import { Icon } from './Icon'
import './PlayerNowNextBar.css'

export interface PlayerNowNextBarProps {
  currentChannel: Channel
  allChannels: Channel[]
  currentProgramme?: Programme
  nextProgramme?: Programme
  now: number
  timeFormat?: '12h' | '24h'
  onTuneChannel: (channel: Channel) => void
  onClose: () => void
  onOpenGuide?: () => void
}

export function PlayerNowNextBar({
  currentChannel,
  allChannels,
  currentProgramme,
  nextProgramme,
  now,
  timeFormat = '24h',
  onTuneChannel,
  onClose,
  onOpenGuide,
}: PlayerNowNextBarProps) {
  const [peekIndex, setPeekIndex] = useState(() => {
    const idx = allChannels.findIndex((c) => c.id === currentChannel.id)
    return idx >= 0 ? idx : 0
  })

  const timerRef = useRef<number | null>(null)

  const resetDismissTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
    }
    timerRef.current = window.setTimeout(() => {
      onClose()
    }, 6000)
  }

  useEffect(() => {
    resetDismissTimer()
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
      }
    }
  }, [])

  const inspectedChannel = allChannels[peekIndex] || currentChannel
  const isInspectingCurrent = inspectedChannel.id === currentChannel.id

  const stepPeek = (delta: number) => {
    resetDismissTimer()
    if (allChannels.length === 0) return
    setPeekIndex((prev) => (prev + delta + allChannels.length) % allChannels.length)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        stepPeek(-1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        stepPeek(1)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (!isInspectingCurrent) {
          onTuneChannel(inspectedChannel)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'g' || e.key === 'G') {
        e.preventDefault()
        onOpenGuide?.()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [allChannels, inspectedChannel, isInspectingCurrent, onClose, onOpenGuide, onTuneChannel])

  // Compute timing and progress for current programme
  const prog = isInspectingCurrent ? currentProgramme : undefined
  const next = isInspectingCurrent ? nextProgramme : undefined

  let progressPct = 0
  let remainingMins = 0

  if (prog && prog.start && prog.stop && prog.stop > prog.start) {
    const elapsed = Math.max(0, now - prog.start)
    const total = prog.stop - prog.start
    progressPct = Math.min(100, Math.max(0, (elapsed / total) * 100))
    remainingMins = Math.max(0, Math.ceil((prog.stop - now) / 60))
  }

  const channelTitle = inspectedChannel.cleanName || cleanChannelTitle(inspectedChannel.name)

  return (
    <div
      className="player-nownext-bar"
      role="region"
      aria-label="Now and Next Programme Mini Guide"
      onMouseMove={resetDismissTimer}
    >
      <div className="player-nownext-content">
        {/* Channel info and peek controls */}
        <div className="player-nownext-channel">
          <button
            type="button"
            className="player-nownext-arrow-btn"
            onClick={() => stepPeek(-1)}
            aria-label="Previous channel preview"
            title="Previous channel (Left Arrow)"
          >
            <Icon name="chevronLeft" size={18} />
          </button>

          <div className="player-nownext-channel-meta">
            {inspectedChannel.number > 0 && (
              <span className="player-nownext-channel-num tnum">{inspectedChannel.number}</span>
            )}
            <strong className="player-nownext-channel-name">{channelTitle}</strong>
            {!isInspectingCurrent && (
              <span className="player-nownext-preview-badge">Preview</span>
            )}
          </div>

          <button
            type="button"
            className="player-nownext-arrow-btn"
            onClick={() => stepPeek(1)}
            aria-label="Next channel preview"
            title="Next channel (Right Arrow)"
          >
            <Icon name="chevronRight" size={18} />
          </button>
        </div>

        {/* Schedule timeline block */}
        <div className="player-nownext-schedule">
          {prog ? (
            <div className="player-nownext-now">
              <div className="player-nownext-row">
                <span className="player-nownext-label">NOW</span>
                <span className="player-nownext-title">{prog.title}</span>
                <span className="player-nownext-time tnum">
                  {clock(prog.start, timeFormat)} - {clock(prog.stop, timeFormat)}
                  {remainingMins > 0 ? ` (${remainingMins}m left)` : ''}
                </span>
              </div>
              <div className="player-nownext-progress-track">
                <div
                  className="player-nownext-progress-fill"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="player-nownext-now">
              <span className="player-nownext-empty">No schedule listings available for this time</span>
            </div>
          )}

          {next && (
            <div className="player-nownext-next">
              <span className="player-nownext-label next">NEXT</span>
              <span className="player-nownext-title">{next.title}</span>
              <span className="player-nownext-time tnum">
                {clock(next.start, timeFormat)} - {clock(next.stop, timeFormat)}
              </span>
            </div>
          )}
        </div>

        {/* Actions bar */}
        <div className="player-nownext-actions">
          {!isInspectingCurrent && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => onTuneChannel(inspectedChannel)}
            >
              Tune Channel (Enter)
            </button>
          )}

          {onOpenGuide && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={onOpenGuide}
              title="Open full guide (G)"
            >
              <Icon name="calendar" size={14} />
              <span>Full Guide (G)</span>
            </button>
          )}

          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close Now and Next bar"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
