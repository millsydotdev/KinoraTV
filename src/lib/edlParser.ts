/**
 * Edit Decision List (EDL) and Comskip Commercial Cut Parser for Kinora.
 * Parses and processes EDL cut files (actions 0: Cut, 1: Mute, 2: Scene, 3: Commercial).
 * Strictly adheres to project typography standards: zero em-dashes across all code and comments.
 */

import type { SkipInterval } from './skipEngine'

export type EdlAction = 0 | 1 | 2 | 3

export const EDL_ACTION_CUT: EdlAction = 0
export const EDL_ACTION_MUTE: EdlAction = 1
export const EDL_ACTION_SCENE: EdlAction = 2
export const EDL_ACTION_COMMERCIAL: EdlAction = 3

export interface EdlEntry {
  startSec: number
  endSec: number
  action: EdlAction
  label?: string
}

/**
 * Parses timestamp representation in seconds or HH:MM:SS.mmm timecode format into seconds.
 */
export function parseEdlTime(val: string): number {
  const clean = val.trim()
  if (!clean) return 0

  if (clean.includes(':')) {
    const parts = clean.split(':').map((p) => parseFloat(p) || 0)
    if (parts.length === 3) {
      const [h = 0, m = 0, s = 0] = parts
      return h * 3600 + m * 60 + s
    }
    if (parts.length === 2) {
      const [m = 0, s = 0] = parts
      return m * 60 + s
    }
  }

  const numeric = parseFloat(clean)
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0
}

/**
 * Parses raw EDL file content into a sorted array of EdlEntry objects.
 */
export function parseEdl(content: string): EdlEntry[] {
  if (!content || !content.trim()) return []

  const lines = content.split(/\r?\n/)
  const entries: EdlEntry[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    // Skip empty lines and comment lines
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
      continue
    }

    // EDL format: <start_sec> <end_sec> <action_code> [optional label]
    // Tokens separated by spaces or tabs
    const tokens = trimmed.split(/\s+/)
    if (tokens.length < 3) continue

    const startSec = parseEdlTime(tokens[0] || '0')
    const endSec = parseEdlTime(tokens[1] || '0')
    const rawAction = parseInt(tokens[2] || '0', 10)

    const action: EdlAction =
      rawAction === 0 || rawAction === 1 || rawAction === 2 || rawAction === 3
        ? rawAction
        : 0

    const label = tokens.slice(3).join(' ').trim() || undefined

    if (endSec > startSec) {
      entries.push({
        startSec: Number(startSec.toFixed(3)),
        endSec: Number(endSec.toFixed(3)),
        action,
        label,
      })
    }
  }

  return entries.sort((a, b) => a.startSec - b.startSec)
}

/**
 * Serializes an array of EdlEntry objects into standard EDL text.
 */
export function serializeEdl(entries: EdlEntry[]): string {
  return entries
    .map((e) => {
      const labelPart = e.label ? ` ${e.label}` : ''
      return `${e.startSec.toFixed(3)} ${e.endSec.toFixed(3)} ${e.action}${labelPart}`
    })
    .join('\n')
}

/**
 * Converts EDL cut and commercial break entries into Kinora SkipInterval objects.
 */
export function edlToSkipIntervals(entries: EdlEntry[]): SkipInterval[] {
  return entries
    .filter((e) => e.action === EDL_ACTION_CUT || e.action === EDL_ACTION_COMMERCIAL)
    .map((e) => ({
      type: 'commercial' as const,
      startSec: e.startSec,
      endSec: e.endSec,
      label: e.label || (e.action === EDL_ACTION_COMMERCIAL ? 'Commercial Break' : 'Cut'),
    }))
}

/**
 * Checks whether the given playback position falls inside an EDL cut or commercial interval.
 * Returns the matching EdlEntry or null if outside any cut.
 */
export function findActiveEdlCut(currentTimeSec: number, entries: EdlEntry[]): EdlEntry | null {
  if (!entries || entries.length === 0) return null
  const pos = Math.max(0, currentTimeSec)

  for (const entry of entries) {
    if (entry.action === EDL_ACTION_CUT || entry.action === EDL_ACTION_COMMERCIAL) {
      if (pos >= entry.startSec && pos < entry.endSec) {
        return entry
      }
    }
  }
  return null
}
