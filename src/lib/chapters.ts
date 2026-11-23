/**
 * Pure helpers for media chapter markers and timeline navigation.
 * Computes chapter boundaries, relative track percentages, and active chapter lookups.
 */

export interface ChapterInfo {
  id?: string
  title?: string
  startSec: number
  endSec?: number
}

export interface ChapterMarker {
  startSec: number
  percent: number
  title?: string
}

/**
 * Normalizes and sorts chapters in ascending order by start time.
 */
export function sortedChapters(chapters: ChapterInfo[] | null | undefined): ChapterInfo[] {
  if (!chapters || chapters.length === 0) return []
  return [...chapters]
    .filter((c) => typeof c.startSec === 'number' && c.startSec >= 0)
    .sort((a, b) => a.startSec - b.startSec)
}

/**
 * Returns pre-computed chapter markers within [0, durationSec].
 * Skips the 0-second marker to avoid visual clutter at the seekbar edge.
 */
export function chapterMarkers(
  chapters: ChapterInfo[] | null | undefined,
  durationSec: number
): ChapterMarker[] {
  if (durationSec <= 0) return []
  const sorted = sortedChapters(chapters)
  return sorted
    .filter((c) => c.startSec > 0 && c.startSec < durationSec)
    .map((c) => ({
      startSec: c.startSec,
      percent: Math.min(100, Math.max(0, (c.startSec / durationSec) * 100)),
      title: c.title,
    }))
}

/**
 * Single gate for chapter UI: returns true only if there are at least two distinct chapter marks.
 */
export function hasChapterMarkers(
  chapters: ChapterInfo[] | null | undefined,
  durationSec: number
): boolean {
  if (!chapters || durationSec <= 0) return false
  const sorted = sortedChapters(chapters)
  return sorted.length >= 2
}

/**
 * Finds the index of the active chapter containing `positionSec`.
 */
export function currentChapterIndex(
  positionSec: number,
  chapters: ChapterInfo[] | null | undefined
): number {
  const sorted = sortedChapters(chapters)
  if (sorted.length === 0) return -1

  let idx = -1
  for (let i = 0; i < sorted.length; i++) {
    const ch = sorted[i]
    if (ch && positionSec >= ch.startSec) {
      idx = i
    } else {
      break
    }
  }
  return idx
}

/**
 * Returns the active chapter at `positionSec`, or null if none found.
 */
export function chapterAt(
  positionSec: number,
  chapters: ChapterInfo[] | null | undefined
): ChapterInfo | null {
  const sorted = sortedChapters(chapters)
  const idx = currentChapterIndex(positionSec, sorted)
  return idx >= 0 && sorted[idx] ? sorted[idx] : null
}

/**
 * Formats a second count into human-readable `m:ss` or `h:mm:ss`.
 */
export function formatChapterTime(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const hours = Math.floor(s / 3600)
  const mins = Math.floor((s % 3600) / 60)
  const secs = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(mins)}:${pad(secs)}` : `${mins}:${pad(secs)}`
}
