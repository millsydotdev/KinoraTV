import { describe, expect, it } from 'vitest'
import { seriesById } from './data/catalog'
import { DAY, channels, programmeAt, scheduleFor, startOfDay } from './data/channels'
import { seriesNextUp } from './lib/library'
import { emptyLibrary } from './state/store'

describe('guide schedule', () => {
  const day = new Date(2026, 9, 22, 20, 47).getTime()

  it('covers each channel day with no gaps or overlaps', () => {
    for (const c of channels) {
      const s = scheduleFor(c, day)
      expect(s[0]?.start).toBe(startOfDay(day))
      expect(s.at(-1)?.stop).toBe(startOfDay(day) + DAY)
      s.slice(1).forEach((p, i) => expect(p.start).toBe(s[i]?.stop))
    }
  })

  it('is deterministic and finds the programme on air', () => {
    const c = channels[0]!
    expect(scheduleFor(c, day)).toBe(scheduleFor(c, day + 3_600_000))
    const p = programmeAt(c, day)!
    expect(p.start <= day && day < p.stop).toBe(true)
  })
})

describe('next episode', () => {
  const s = seriesById('ninth-ward')!

  it('starts at S1E1 with no history', () => {
    expect(seriesNextUp(emptyLibrary, s)).toMatchObject({ state: 'start', episode: { id: 's1e1' } })
  })

  it('moves past the last watched episode across seasons', () => {
    const watched = [1, 2, 3, 4, 5, 6].map((e) => `episode:ninth-ward/s1e${e}`)
    expect(seriesNextUp({ ...emptyLibrary, watched }, s)).toMatchObject({ state: 'next', episode: { id: 's2e1' } })
  })

  it('prefers an episode in progress', () => {
    const progress = { 'episode:ninth-ward/s3e2': { pos: 100, dur: 3000, at: 1 } }
    expect(seriesNextUp({ ...emptyLibrary, progress }, s)).toMatchObject({ state: 'resume', episode: { id: 's3e2' } })
  })
})
