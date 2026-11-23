import { useState, useEffect, useRef, useCallback } from 'react'
import { Icon } from './Icon'
import './VirtualKeyboard.css'

export interface VirtualKeyboardProps {
  open: boolean
  value: string
  onChange: (val: string) => void
  onSubmit: () => void
  onClose: () => void
  title?: string
  placeholder?: string
  urlMode?: boolean
}

const URL_SHORTCUTS = [
  'https://',
  'http://',
  '.com',
  '.m3u',
  '.m3u8',
  ':',
  '/',
  '.',
  '-',
  '_',
]

const NUM_ROW = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
const TOP_ROW = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p']
const MID_ROW = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', '@']
const BOT_ROW = ['z', 'x', 'c', 'v', 'b', 'n', 'm', '/', ':', '.']

export function VirtualKeyboard({
  open,
  value,
  onChange,
  onSubmit,
  onClose,
  title = 'On-Screen Remote Keyboard',
  placeholder = 'Enter URL or text with directional controls...',
  urlMode = true,
}: VirtualKeyboardProps) {
  const [isShift, setIsShift] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Escape key listener to close keyboard
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [open, onClose])

  // Focus first key when opened
  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => {
      const firstTarget = containerRef.current?.querySelector<HTMLButtonElement>(
        '.virtual-kb-key',
      )
      firstTarget?.focus()
    }, 50)
    return () => clearTimeout(timer)
  }, [open])

  const handleCharClick = useCallback(
    (char: string) => {
      onChange(value + (isShift ? char.toUpperCase() : char))
    },
    [value, onChange, isShift],
  )

  const handleShortcutClick = useCallback(
    (shortcut: string) => {
      onChange(value + shortcut)
    },
    [value, onChange],
  )

  const handleBackspace = useCallback(() => {
    onChange(value.slice(0, -1))
  }, [value, onChange])

  const handleClear = useCallback(() => {
    onChange('')
  }, [onChange])

  const handlePaste = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        const text = await navigator.clipboard.readText()
        if (text) {
          onChange(value + text)
        }
      }
    } catch {
      // Clipboard read unavailable or rejected
    }
  }, [value, onChange])

  if (!open) return null

  return (
    <div
      className="virtual-kb-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="virtual-kb-card"
        ref={containerRef}
        onClick={(e) => e.stopPropagation()}
        data-nav-boundary="virtual-keyboard"
      >
        <div className="virtual-kb-header">
          <div className="virtual-kb-title">
            <Icon name="keyboard" size={20} className="virtual-kb-title-icon" />
            <span>{title}</span>
          </div>
          <button
            type="button"
            className="virtual-kb-close-btn"
            onClick={onClose}
            aria-label="Close keyboard"
            title="Close (Esc)"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* Text Preview Screen */}
        <div className="virtual-kb-display">
          {value ? (
            <span className="virtual-kb-value">
              {value}
              <span className="virtual-kb-cursor" aria-hidden="true" />
            </span>
          ) : (
            <span className="virtual-kb-placeholder">{placeholder}</span>
          )}
        </div>

        {/* URL Fast Shortcuts Bar */}
        {urlMode && (
          <div className="virtual-kb-shortcuts-row">
            {URL_SHORTCUTS.map((shortcut) => (
              <button
                key={shortcut}
                type="button"
                className="virtual-kb-shortcut-btn"
                onClick={() => handleShortcutClick(shortcut)}
                data-nav-item="true"
              >
                {shortcut}
              </button>
            ))}
          </div>
        )}

        {/* QWERTY Character Grid */}
        <div className="virtual-kb-grid">
          {/* Numbers row */}
          <div className="virtual-kb-row">
            {NUM_ROW.map((num) => (
              <button
                key={num}
                type="button"
                className="virtual-kb-key"
                onClick={() => handleCharClick(num)}
                data-nav-item="true"
              >
                {num}
              </button>
            ))}
          </div>

          {/* Top row */}
          <div className="virtual-kb-row">
            {TOP_ROW.map((char) => (
              <button
                key={char}
                type="button"
                className="virtual-kb-key"
                onClick={() => handleCharClick(char)}
                data-nav-item="true"
              >
                {isShift ? char.toUpperCase() : char}
              </button>
            ))}
          </div>

          {/* Middle row */}
          <div className="virtual-kb-row">
            {MID_ROW.map((char) => (
              <button
                key={char}
                type="button"
                className="virtual-kb-key"
                onClick={() => handleCharClick(char)}
                data-nav-item="true"
              >
                {isShift ? char.toUpperCase() : char}
              </button>
            ))}
          </div>

          {/* Bottom row with Shift and Delete */}
          <div className="virtual-kb-row">
            <button
              type="button"
              className={`virtual-kb-key virtual-kb-key-wide ${isShift ? 'is-active' : ''}`}
              onClick={() => setIsShift((prev) => !prev)}
              aria-label="Toggle Caps or Shift"
              data-nav-item="true"
            >
              {isShift ? 'CAPS' : 'shift'}
            </button>
            {BOT_ROW.map((char) => (
              <button
                key={char}
                type="button"
                className="virtual-kb-key"
                onClick={() => handleCharClick(char)}
                data-nav-item="true"
              >
                {isShift ? char.toUpperCase() : char}
              </button>
            ))}
            <button
              type="button"
              className="virtual-kb-key virtual-kb-key-wide virtual-kb-key-danger"
              onClick={handleBackspace}
              aria-label="Backspace"
              title="Delete last character"
              data-nav-item="true"
            >
              Del
            </button>
          </div>

          {/* Action row */}
          <div className="virtual-kb-row virtual-kb-action-row">
            <button
              type="button"
              className="virtual-kb-action-btn virtual-kb-btn-clear"
              onClick={handleClear}
              data-nav-item="true"
              title="Clear entire text"
            >
              <Icon name="trash" size={15} />
              <span>Clear</span>
            </button>

            <button
              type="button"
              className="virtual-kb-action-btn virtual-kb-btn-paste"
              onClick={handlePaste}
              data-nav-item="true"
              title="Paste from clipboard"
            >
              <Icon name="copy" size={15} />
              <span>Paste</span>
            </button>

            <button
              type="button"
              className="virtual-kb-action-btn virtual-kb-btn-space"
              onClick={() => handleCharClick(' ')}
              data-nav-item="true"
              aria-label="Space bar"
            >
              Space
            </button>

            <button
              type="button"
              className="virtual-kb-action-btn virtual-kb-btn-submit"
              onClick={onSubmit}
              data-nav-item="true"
              title="Submit text"
            >
              <Icon name="check" size={16} />
              <span>Submit</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
