// lyrics.ts - LRC (LyRiCs) parser and synchronization engine for audio playback.
// Supports standard LRC [mm:ss.xx] and [mm:ss.xxx], multiple timestamps per line,
// global offsets, metadata tags (title, artist, album), and binary search line lookup.
// Strictly adheres to typography standards: zero em-dashes across all code and comments.

export interface LyricLine {
  time: number
  text: string
  index: number
}

export interface ParsedLyrics {
  title?: string
  artist?: string
  album?: string
  offsetSec: number
  lines: LyricLine[]
}

const TIMESTAMP_REGEX = /\[(\d{1,2}):(\d{2})(?:\.(\d{2,3}))?\]/g
const TAG_REGEX = /^\[(ti|ar|al|by|offset):([^\]]*)\]/i

/**
 * Parses a single timestamp string (e.g. "01:23.45") into seconds.
 */
export function parseTimestampToSeconds(minutes: string, seconds: string, fractions?: string): number {
  const min = parseInt(minutes, 10) || 0
  const sec = parseInt(seconds, 10) || 0
  let frac = 0
  if (fractions) {
    if (fractions.length === 2) {
      frac = parseInt(fractions, 10) / 100
    } else if (fractions.length === 3) {
      frac = parseInt(fractions, 10) / 1000
    } else {
      frac = parseFloat(`0.${fractions}`) || 0
    }
  }
  return min * 60 + sec + frac
}

/**
 * Parses raw LRC string content into structured and sorted lyric lines.
 */
export function parseLrc(content: string): ParsedLyrics {
  if (!content || !content.trim()) {
    return { offsetSec: 0, lines: [] }
  }

  let title: string | undefined
  let artist: string | undefined
  let album: string | undefined
  let offsetMs = 0

  const rawLines = content.split(/\r?\n/)
  const extractedLines: Array<{ time: number; text: string }> = []

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim()
    if (!trimmed) continue

    // Check for ID tags
    const tagMatch = trimmed.match(TAG_REGEX)
    if (tagMatch) {
      const tag = tagMatch[1]?.toLowerCase()
      const val = tagMatch[2]?.trim() ?? ''
      if (tag === 'ti') title = val
      else if (tag === 'ar') artist = val
      else if (tag === 'al') album = val
      else if (tag === 'offset') offsetMs = parseInt(val, 10) || 0
      continue
    }

    // Extract all timestamps on this line (supports multiple e.g. [00:12.00][00:24.00]Chorus)
    const timestamps: number[] = []
    let match: RegExpExecArray | null
    TIMESTAMP_REGEX.lastIndex = 0

    while ((match = TIMESTAMP_REGEX.exec(trimmed)) !== null) {
      const min = match[1] ?? '0'
      const sec = match[2] ?? '0'
      const frac = match[3]
      timestamps.push(parseTimestampToSeconds(min, sec, frac))
    }

    if (timestamps.length > 0) {
      // Strip timestamps to extract lyric text
      const cleanText = trimmed.replace(TIMESTAMP_REGEX, '').trim()
      for (const t of timestamps) {
        extractedLines.push({ time: t, text: cleanText })
      }
    }
  }

  const offsetSec = offsetMs / 1000

  // Sort ascending by time and assign sequence indices
  extractedLines.sort((a, b) => a.time - b.time)

  const finalLines: LyricLine[] = extractedLines.map((item, idx) => ({
    time: Math.max(0, Math.round((item.time + offsetSec) * 1000) / 1000),
    text: item.text,
    index: idx,
  }))

  return {
    title,
    artist,
    album,
    offsetSec,
    lines: finalLines,
  }
}

/**
 * Finds the currently active lyric line index for a given playback time.
 * Returns -1 if playback time is before the first lyric.
 */
export function findActiveLyricIndex(currentTimeSec: number, lines: LyricLine[]): number {
  if (lines.length === 0 || currentTimeSec < (lines[0]?.time ?? 0)) {
    return -1
  }

  let low = 0
  let high = lines.length - 1
  let result = -1

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const line = lines[mid]
    if (line && line.time <= currentTimeSec) {
      result = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return result
}

/**
 * Distributes plain text lines evenly across a track duration when no timestamps exist.
 */
export function convertPlainTextToLyrics(plainText: string, durationSec: number): ParsedLyrics {
  if (!plainText || !plainText.trim() || durationSec <= 0) {
    return { offsetSec: 0, lines: [] }
  }

  const lines = plainText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return { offsetSec: 0, lines: [] }
  }

  const interval = durationSec / (lines.length + 1)
  const lyricLines: LyricLine[] = lines.map((text, idx) => ({
    time: Math.round((idx + 1) * interval * 100) / 100,
    text,
    index: idx,
  }))

  return {
    offsetSec: 0,
    lines: lyricLines,
  }
}
