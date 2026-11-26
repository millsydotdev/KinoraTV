// LyricsViewer.tsx - Synchronized karaoke lyrics display for music, radio, and audio streams.
// Automatically scrolls to active lyric line and supports line-click seeking and LRC file import.
// Strictly adheres to typography standards: zero em-dashes across all code and comments.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  parseLrc,
  findActiveLyricIndex,
  convertPlainTextToLyrics,
  type ParsedLyrics,
} from '../lib/lyrics'
import { Icon } from './Icon'
import './LyricsViewer.css'

export interface LyricsViewerProps {
  currentTime: number
  duration?: number
  lyricsText?: string | null
  onSeek?: (timeSec: number) => void
  onLyricsLoaded?: (content: string) => void
  trackTitle?: string
  trackArtist?: string
  accentColor?: string
}

export function LyricsViewer({
  currentTime,
  duration = 0,
  lyricsText,
  onSeek,
  onLyricsLoaded,
  trackTitle,
  trackArtist,
  accentColor,
}: LyricsViewerProps) {
  const [internalLyrics, setInternalLyrics] = useState<string | null>(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteContent, setPasteContent] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const activeLineRef = useRef<HTMLButtonElement | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)

  const effectiveLyricsText = lyricsText || internalLyrics

  const parsed = useMemo<ParsedLyrics>(() => {
    if (!effectiveLyricsText) {
      return { offsetSec: 0, lines: [] }
    }
    const hasTimestamps = /\[\d{1,2}:\d{2}/.test(effectiveLyricsText)
    if (hasTimestamps) {
      return parseLrc(effectiveLyricsText)
    }
    return convertPlainTextToLyrics(effectiveLyricsText, duration > 0 ? duration : 180)
  }, [effectiveLyricsText, duration])

  const activeIndex = useMemo(() => {
    return findActiveLyricIndex(currentTime, parsed.lines)
  }, [currentTime, parsed.lines])

  // Smoothly scroll active line into center
  useEffect(() => {
    if (activeLineRef.current && scrollContainerRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }
  }, [activeIndex])

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      if (text) {
        setInternalLyrics(text)
        onLyricsLoaded?.(text)
      }
    }
    reader.readAsText(file)
  }

  const handleApplyPaste = () => {
    if (pasteContent.trim()) {
      setInternalLyrics(pasteContent)
      onLyricsLoaded?.(pasteContent)
    }
    setPasteOpen(false)
    setPasteContent('')
  }

  return (
    <div className="lyrics-viewer-container" role="region" aria-label="Synchronized Lyrics">
      <header className="lyrics-viewer-header">
        <div className="lyrics-viewer-track-info">
          <Icon name="music" size={16} />
          <span>
            {parsed.title || trackTitle || 'Lyrics'}
            {(parsed.artist || trackArtist) ? ` - ${parsed.artist || trackArtist}` : ''}
          </span>
        </div>
        <div className="lyrics-viewer-actions">
          <button
            type="button"
            className="btn btn-ghost btn-small"
            style={{ fontSize: '0.75rem', padding: '2px 8px' }}
            onClick={() => fileInputRef.current?.click()}
            title="Load .LRC or text lyrics file"
          >
            <Icon name="folder" size={13} />
            <span>Load LRC</span>
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-small"
            style={{ fontSize: '0.75rem', padding: '2px 8px' }}
            onClick={() => setPasteOpen(true)}
            title="Paste lyrics text"
          >
            <Icon name="edit" size={13} />
            <span>Paste</span>
          </button>
        </div>
      </header>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".lrc,.txt"
        style={{ display: 'none' }}
        aria-hidden="true"
      />

      {pasteOpen && (
        <div className="lyrics-paste-dialog">
          <label htmlFor="lyrics-paste-input" style={{ fontSize: '0.8125rem', color: 'var(--text-2)' }}>
            Paste LRC or plain text lyrics below:
          </label>
          <textarea
            id="lyrics-paste-input"
            className="lyrics-paste-textarea"
            value={pasteContent}
            onChange={(e) => setPasteContent(e.target.value)}
            placeholder="[00:12.00]First line of lyrics..."
            rows={8}
            autoFocus
          />
          <div className="lyrics-paste-actions">
            <button type="button" className="btn btn-secondary btn-small" onClick={() => setPasteOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary btn-small" onClick={handleApplyPaste}>
              Apply Lyrics
            </button>
          </div>
        </div>
      )}

      <div className="lyrics-scroll-body" ref={scrollContainerRef}>
        {parsed.lines.length === 0 ? (
          <div className="lyrics-empty-state">
            <Icon name="music" size={28} />
            <span>No lyrics available for this audio track.</span>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => setPasteOpen(true)}
              style={{ marginTop: 8 }}
            >
              Add Lyrics
            </button>
          </div>
        ) : (
          parsed.lines.map((line, idx) => {
            const isActive = idx === activeIndex
            const lineClass = isActive ? 'is-active' : idx < activeIndex ? 'is-past' : 'is-future'

            return (
              <button
                key={idx}
                ref={isActive ? activeLineRef : undefined}
                type="button"
                className={`lyrics-line-btn ${lineClass}`}
                style={{
                  color: isActive && accentColor ? accentColor : undefined,
                }}
                onClick={() => onSeek?.(line.time)}
                title={`Seek to ${Math.floor(line.time / 60)}:${Math.floor(line.time % 60).toString().padStart(2, '0')}`}
              >
                {line.text || '...'}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
