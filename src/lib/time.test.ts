import { describe, expect, it } from 'vitest'
import { clock } from './time'

const DAY = 86_400_000
const reference = (t: number, format: '24h' | '12h') =>
  new Date(t).toLocaleTimeString('en-GB', { hour: format === '24h' ? '2-digit' : 'numeric', minute: '2-digit', hour12: format === '12h' })

describe('clock', () => {
  it('formats exactly as before, in both formats', () => {
    const base = Date.UTC(2026, 9, 29, 0, 0)
    for (let m = 0; m < DAY / 60_000; m += 37) {
      const t = base + m * 60_000
      expect(clock(t)).toBe(reference(t, '24h'))
      expect(clock(t, '12h')).toBe(reference(t, '12h'))
    }
  })

  // D8: a Live TV render formats thousands of times; building a formatter per call made each render
  // take hundreds of milliseconds. One formatter per format is reused.
  it('is much cheaper than building a formatter per call', () => {
    const n = 3000
    let a = performance.now()
    for (let i = 0; i < n; i++) reference(i * 60_000, '24h')
    const perCall = performance.now() - a
    a = performance.now()
    for (let i = 0; i < n; i++) clock(i * 60_000)
    const cached = performance.now() - a
    expect(cached).toBeLessThan(perCall / 3)
  })
})
