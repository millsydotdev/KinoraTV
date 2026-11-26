// Direct numeric keypad channel tuning HUD for Kinora.
// Allows instant channel jump via remote number keys (0-9) or desktop keyboard.
// Strictly adheres to typography standards: zero em-dashes across all code and comments.

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Channel } from '../data/types'
import { ChannelMark } from './ui'
import { cleanChannelTitle, parseChannelMetadata } from '../state/playlists'
import './NumericZapHUD.css'

export interface NumericZapHUDProps {
  channels: Channel[]
  onTune: (channel: Channel) => void
  disabled?: boolean
}

export function NumericZapHUD({ channels, onTune, disabled = false }: NumericZapHUDProps) {
  const [digits, setDigits] = useState<string>('')
  const [active, setActive] = useState<boolean>(false)
  const timerRef = useRef<number | null>(null)
  const digitsRef = useRef<string>('')
  const channelsRef = useRef<Channel[]>(channels)
  const onTuneRef = useRef<(channel: Channel) => void>(onTune)

  digitsRef.current = digits
  channelsRef.current = channels
  onTuneRef.current = onTune

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const dismiss = useCallback(() => {
    clearTimer()
    setDigits('')
    digitsRef.current = ''
    setActive(false)
  }, [clearTimer])

  const findMatch = useCallback((dig: string): Channel | null => {
    if (!dig) return null
    return (
      channelsRef.current.find(
        (c) => String(c.number) === dig
      ) ?? null
    )
  }, [])

  const executeTune = useCallback(() => {
    const currentDig = digitsRef.current
    const targetChannel = findMatch(currentDig)
    if (targetChannel) {
      onTuneRef.current(targetChannel)
    }
    dismiss()
  }, [findMatch, dismiss])

  // Reset auto-commit countdown whenever digits change
  useEffect(() => {
    if (!active || digits.length === 0) return
    clearTimer()
    timerRef.current = window.setTimeout(() => {
      executeTune()
    }, 1300)
    return clearTimer
  }, [digits, active, executeTune, clearTimer])

  // Global key listener for digit inputs
  useEffect(() => {
    if (disabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently typing in an input, textarea, or content-editable element
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }

      // Ignore modifier combinations (Ctrl, Alt, Meta)
      if (e.ctrlKey || e.altKey || e.metaKey) return

      // Handle Escape to cancel
      if (e.key === 'Escape' && digitsRef.current.length > 0) {
        e.preventDefault()
        dismiss()
        return
      }

      // Handle Backspace to remove last digit
      if (e.key === 'Backspace' && digitsRef.current.length > 0) {
        e.preventDefault()
        const next = digitsRef.current.slice(0, -1)
        digitsRef.current = next
        setDigits(next)
        if (next.length === 0) {
          dismiss()
        }
        return
      }

      // Handle Enter to execute immediate tune
      if (e.key === 'Enter' && digitsRef.current.length > 0) {
        e.preventDefault()
        executeTune()
        return
      }

      // Match digit keys 0-9 (standard keyboard or TV remote number keys)
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault()
        const prev = digitsRef.current
        const next = prev.length >= 4 ? prev : prev + e.key
        digitsRef.current = next
        setDigits(next)
        setActive(true)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [disabled, dismiss, executeTune])

  if (!active || digits.length === 0) return null

  const matchedChannel = findMatch(digits)
  const cleanName = matchedChannel
    ? matchedChannel.cleanName || cleanChannelTitle(matchedChannel.name)
    : null
  const badges = matchedChannel
    ? matchedChannel.badges ?? parseChannelMetadata(matchedChannel.name).badges
    : []

  return (
    <aside
      className="numeric-zap-hud"
      role="status"
      aria-live="polite"
      aria-label={`Direct channel entry: ${digits}`}
    >
      <div className="numeric-zap-digits-box">
        <span className="numeric-zap-label">CHANNEL</span>
        <span className="numeric-zap-digits tnum">{digits}</span>
      </div>

      <div className="numeric-zap-content">
        {matchedChannel ? (
          <div className="numeric-zap-match">
            <ChannelMark channel={matchedChannel} size={36} />
            <div className="numeric-zap-details">
              <div className="numeric-zap-title-row">
                <span className="numeric-zap-title" title={matchedChannel.name}>{cleanName}</span>
                {badges.map((b, idx) => (
                  <span key={`${b.kind}-${idx}`} className={`numeric-zap-badge tag-${b.kind}`}>
                    {b.label}
                  </span>
                ))}
              </div>
              <span className="numeric-zap-hint faint">
                Press Enter to tune now (auto-tuning in 1s)
              </span>
            </div>
          </div>
        ) : (
          <div className="numeric-zap-no-match">
            <span className="numeric-zap-unknown faint">No channel {digits}</span>
            <span className="numeric-zap-hint faint">Press Esc to cancel</span>
          </div>
        )}
      </div>

      <div className="numeric-zap-progress-bar" />
    </aside>
  )
}
