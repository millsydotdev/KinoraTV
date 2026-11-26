/**
 * Chapter-aware media skip engine for Kinora.
 * Automatically identifies and handles intro, recap, and credit sequences.
 */

import type { ChapterInfo } from './chapters'

export type SkipType = 'intro' | 'recap' | 'credits' | 'commercial' | 'sponsor'

export interface SkipInterval {
  type: SkipType
  startSec: number
  endSec: number
  label: string
}

export interface SkipEvaluation {
  active: boolean
  interval: SkipInterval | null
  remainingSecs: number
  canAutoSkip: boolean
}

const INTRO_REGEX = /(?:^|\b)(intro|opening|op)\b/i
const RECAP_REGEX = /(?:^|\b)(recap|previously\s+on)\b/i
const CREDITS_REGEX = /(?:^|\b)(credits|outro|ending)\b/i

/**
 * Extracts recognized skip intervals from structured chapters or heuristic fallbacks.
 */
export function extractSkipIntervals(
  chapters: ChapterInfo[] = [],
  isEpisode = false,
  durationSec = 0
): SkipInterval[] {
  const intervals: SkipInterval[] = []

  let foundIntro = false

  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i]
    if (!ch) continue

    const title = (ch.title || '').trim()
    const startSec = ch.startSec
    const endSec = ch.endSec ?? (i + 1 < chapters.length ? chapters[i + 1]?.startSec ?? startSec + 60 : durationSec)

    if (INTRO_REGEX.test(title)) {
      intervals.push({
        type: 'intro',
        startSec,
        endSec,
        label: title || 'Intro',
      })
      foundIntro = true
    } else if (RECAP_REGEX.test(title)) {
      intervals.push({
        type: 'recap',
        startSec,
        endSec,
        label: title || 'Recap',
      })
    } else if (CREDITS_REGEX.test(title)) {
      intervals.push({
        type: 'credits',
        startSec,
        endSec,
        label: title || 'Credits',
      })
    }
  }

  // Fallback heuristic for TV episodes without embedded chapter markers:
  // Most series have a title card / intro between seconds 10 and 95 (min runtime 5m).
  if (!foundIntro && isEpisode && durationSec >= 300) {
    intervals.push({
      type: 'intro',
      startSec: 10,
      endSec: 95,
      label: 'Intro',
    })
  }

  return intervals.sort((a, b) => a.startSec - b.startSec)
}

/**
 * Evaluates whether the current playback position is within an active skip interval.
 */
export function evaluateSkip(
  currentTimeSec: number,
  intervals: SkipInterval[],
  autoSkipPref = false
): SkipEvaluation {
  if (!intervals || intervals.length === 0) {
    return {
      active: false,
      interval: null,
      remainingSecs: 0,
      canAutoSkip: false,
    }
  }

  const target = Math.max(0, currentTimeSec)

  for (const interval of intervals) {
    if (target >= interval.startSec && target < interval.endSec) {
      return {
        active: true,
        interval,
        remainingSecs: Math.max(0, Math.round(interval.endSec - target)),
        canAutoSkip: autoSkipPref,
      }
    }
  }

  return {
    active: false,
    interval: null,
    remainingSecs: 0,
    canAutoSkip: false,
  }
}
