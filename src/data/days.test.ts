// Local days across clock changes. Each test file runs in its own process, so this one can fix the
// time zone (UK: clocks go forward on 29 March 2026 and back on 25 October 2026).
process.env.TZ = 'Europe/London'

import { afterAll, describe, expect, it } from 'vitest'
import { addDays, startOfDay } from './channels'

afterAll(() => { delete process.env.TZ })

const HOUR = 3_600_000

describe('local days', () => {
  it('are 23 hours long when the clocks go forward and 25 when they go back', () => {
    const spring = startOfDay(Date.UTC(2026, 2, 29, 12))
    expect(spring).toBe(Date.UTC(2026, 2, 29, 0)) // GMT midnight
    expect(addDays(spring, 1) - spring).toBe(23 * HOUR)
    const autumn = startOfDay(Date.UTC(2026, 9, 25, 12))
    expect(autumn).toBe(Date.UTC(2026, 9, 24, 23)) // BST midnight
    expect(addDays(autumn, 1) - autumn).toBe(25 * HOUR)
  })

  it('step by calendar day, landing on local midnight every time', () => {
    const start = startOfDay(Date.UTC(2026, 9, 20, 12))
    for (let i = 0; i < 10; i++) {
      const day = addDays(start, i)
      expect(new Date(day).getHours()).toBe(0)
      expect(new Date(day).getDate()).toBe(20 + i)
    }
    expect(addDays(start, -1)).toBe(startOfDay(Date.UTC(2026, 9, 19, 12)))
  })
})
