import { describe, expect, it } from 'vitest'
import {
  evaluateSkip,
  extractSkipIntervals,
  type SkipInterval,
} from './skipEngine'

describe('skipEngine', () => {
  describe('extractSkipIntervals', () => {
    it('identifies intro, recap, and credit chapters from metadata', () => {
      const chapters = [
        { startSec: 0, endSec: 60, title: 'Previously on Kinora' },
        { startSec: 60, endSec: 150, title: 'Opening Sequence' },
        { startSec: 150, endSec: 2400, title: 'Act I' },
        { startSec: 2400, endSec: 2520, title: 'Closing Credits' },
      ]

      const intervals = extractSkipIntervals(chapters, true, 2520)

      expect(intervals).toHaveLength(3)
      expect(intervals[0]).toEqual({
        type: 'recap',
        startSec: 0,
        endSec: 60,
        label: 'Previously on Kinora',
      })
      expect(intervals[1]).toEqual({
        type: 'intro',
        startSec: 60,
        endSec: 150,
        label: 'Opening Sequence',
      })
      expect(intervals[2]).toEqual({
        type: 'credits',
        startSec: 2400,
        endSec: 2520,
        label: 'Closing Credits',
      })
    })

    it('injects fallback TV intro interval for episodes without chapters', () => {
      const intervals = extractSkipIntervals([], true, 1800)
      expect(intervals).toHaveLength(1)
      expect(intervals[0]).toEqual({
        type: 'intro',
        startSec: 10,
        endSec: 95,
        label: 'Intro',
      })
    })

    it('does not inject fallback for non-episodes or very short clips', () => {
      expect(extractSkipIntervals([], false, 1800)).toHaveLength(0)
      expect(extractSkipIntervals([], true, 120)).toHaveLength(0)
    })
  })

  describe('evaluateSkip', () => {
    const intervals: SkipInterval[] = [
      {
        type: 'recap',
        startSec: 0,
        endSec: 45,
        label: 'Recap',
      },
      {
        type: 'intro',
        startSec: 60,
        endSec: 150,
        label: 'Intro',
      },
    ]

    it('detects active skip interval when position is inside window', () => {
      const eval1 = evaluateSkip(20, intervals, false)
      expect(eval1.active).toBe(true)
      expect(eval1.interval?.type).toBe('recap')
      expect(eval1.remainingSecs).toBe(25)
      expect(eval1.canAutoSkip).toBe(false)

      const eval2 = evaluateSkip(100, intervals, true)
      expect(eval2.active).toBe(true)
      expect(eval2.interval?.type).toBe('intro')
      expect(eval2.remainingSecs).toBe(50)
      expect(eval2.canAutoSkip).toBe(true)
    })

    it('returns inactive when outside skip windows', () => {
      const evalOutside = evaluateSkip(50, intervals, true)
      expect(evalOutside.active).toBe(false)
      expect(evalOutside.interval).toBeNull()

      const evalPast = evaluateSkip(200, intervals, true)
      expect(evalPast.active).toBe(false)
      expect(evalPast.interval).toBeNull()
    })

    it('handles empty intervals safely', () => {
      const result = evaluateSkip(10, [])
      expect(result.active).toBe(false)
      expect(result.interval).toBeNull()
    })
  })
})
