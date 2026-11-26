// Zero-dependency Subtitle Engine for Kinora video playback.
// Supports SubRip (.srt) and WebVTT (.vtt) parsing, dynamic offset calibration,
// and custom typography styling.
// Strictly adheres to typography standards: zero em-dashes across all code and comments.

export interface SubtitleCue {
  id?: string
  start: number // Seconds
  end: number // Seconds
  text: string
}

export interface SubtitleStyleSettings {
  fontSizePercent: number // 80 to 200 (default 100)
  color: string // Hex or color name (default #ffffff)
  backgroundOpacity: number // 0.0 to 1.0 (default 0.75)
  outline: boolean // High contrast text drop-shadow/stroke
}

export const DEFAULT_SUBTITLE_STYLES: SubtitleStyleSettings = {
  fontSizePercent: 100,
  color: '#ffffff',
  backgroundOpacity: 0.75,
  outline: true,
}

// Parses timestamp string (00:01:23.456 or 00:01:23,456 or 01:23.456) into seconds
export function parseTimestampToSeconds(timestamp: string): number | null {
  const clean = timestamp.trim().replace(',', '.')
  const parts = clean.split(':')
  if (parts.length === 3 && parts[0] !== undefined && parts[1] !== undefined && parts[2] !== undefined) {
    const hours = parseFloat(parts[0])
    const minutes = parseFloat(parts[1])
    const seconds = parseFloat(parts[2])
    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return null
    return hours * 3600 + minutes * 60 + seconds
  }
  if (parts.length === 2 && parts[0] !== undefined && parts[1] !== undefined) {
    const minutes = parseFloat(parts[0])
    const seconds = parseFloat(parts[1])
    if (isNaN(minutes) || isNaN(seconds)) return null
    return minutes * 60 + seconds
  }
  return null
}

// Formats seconds into standard WebVTT timestamp (HH:MM:SS.mmm)
export function formatSecondsToVttTimestamp(seconds: number): string {
  const safeSeconds = Math.max(0, seconds)
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const secs = safeSeconds % 60
  const pad = (n: number, z = 2) => n.toString().padStart(z, '0')
  return `${pad(hours)}:${pad(minutes)}:${secs.toFixed(3).padStart(6, '0')}`
}

// Parses raw SubRip (.srt) or WebVTT (.vtt) file content into structured cues
export function parseSubtitleText(raw: string): SubtitleCue[] {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!normalized) return []

  const lines = normalized.split('\n')
  const cues: SubtitleCue[] = []

  let currentStart: number | null = null
  let currentEnd: number | null = null
  let currentTextLines: string[] = []
  let currentId: string | undefined = undefined

  const timeRegex = /((?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{3})\s*-->\s*((?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{3})/

  const flush = () => {
    if (currentStart !== null && currentEnd !== null && currentTextLines.length > 0) {
      const text = currentTextLines.join('\n').trim()
      if (text) {
        cues.push({
          id: currentId,
          start: currentStart,
          end: currentEnd,
          text,
        })
      }
    }
    currentStart = null
    currentEnd = null
    currentTextLines = []
    currentId = undefined
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? ''

    // Skip WEBVTT header or metadata
    if (line.startsWith('WEBVTT') || line.startsWith('NOTE') || line.startsWith('STYLE')) {
      continue
    }

    // Check if line contains timestamp interval
    const match = line.match(timeRegex)
    if (match && match[1] && match[2]) {
      flush()
      currentStart = parseTimestampToSeconds(match[1])
      currentEnd = parseTimestampToSeconds(match[2])
      continue
    }

    if (line === '') {
      flush()
      continue
    }

    if (currentStart !== null) {
      currentTextLines.push(line)
    } else if (/^\d+$/.test(line)) {
      currentId = line
    }
  }

  flush()
  return cues
}

// Converts parsed cues to a WebVTT formatted blob URL with an optional offset
export function cuesToVttBlobUrl(cues: SubtitleCue[], offsetSeconds = 0): string {
  let vtt = 'WEBVTT\n\n'
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i]
    if (!cue) continue
    const shiftedStart = Math.max(0, cue.start + offsetSeconds)
    const shiftedEnd = Math.max(shiftedStart + 0.1, cue.end + offsetSeconds)
    vtt += `${i + 1}\n`
    vtt += `${formatSecondsToVttTimestamp(shiftedStart)} --> ${formatSecondsToVttTimestamp(shiftedEnd)}\n`
    vtt += `${cue.text}\n\n`
  }
  const blob = new Blob([vtt], { type: 'text/vtt' })
  return URL.createObjectURL(blob)
}

// Generates CSS styles for ::cue pseudo-element matching SubtitleStyleSettings
export function generateSubtitleCss(styles: SubtitleStyleSettings): string {
  const bgRgba = `rgba(0, 0, 0, ${styles.backgroundOpacity.toFixed(2)})`
  const textShadow = styles.outline
    ? '0px 2px 4px rgba(0, 0, 0, 0.9), -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000'
    : 'none'

  return `
    video::cue {
      font-size: ${styles.fontSizePercent}%;
      color: ${styles.color};
      background-color: ${bgRgba};
      text-shadow: ${textShadow};
      line-height: 1.4;
      font-family: inherit;
      padding: 0.2em 0.5em;
      border-radius: 4px;
    }
  `
}
