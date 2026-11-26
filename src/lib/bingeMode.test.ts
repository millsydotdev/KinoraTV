// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  shouldShowNextEpisodePrompt,
  canSkipIntro,
  findNextEpisode,
  loadBingeSettings,
  saveBingeSettings,
  type BingeSettings,
} from './bingeMode'
import type { Series } from '../data/types'

const mockSeries: Series[] = [
  {
    kind: 'series',
    id: 's-severance',
    title: 'Severance',
    years: '2022-',
    genres: ['Sci-Fi', 'Thriller'],
    certificate: '15',
    tagline: 'Please do not adjust your screen.',
    synopsis: 'Work life balance thriller',
    art: '',
    focus: 50,
    added: '2022-02-18',
    seasons: [
      [
        {
          id: 'ep-1',
          seriesId: 's-severance',
          season: 1,
          number: 1,
          title: 'Good News About Hell',
          synopsis: 'Pilot episode',
          runtime: 55,
          still: '',
          stillFocus: 50,
        },
        {
          id: 'ep-2',
          seriesId: 's-severance',
          season: 1,
          number: 2,
          title: 'Half Loop',
          synopsis: 'Second episode',
          runtime: 53,
          still: '',
          stillFocus: 50,
        },
      ],
      [
        {
          id: 'ep-3',
          seriesId: 's-severance',
          season: 2,
          number: 1,
          title: 'Return to Lumon',
          synopsis: 'Season 2 premiere',
          runtime: 58,
          still: '',
          stillFocus: 50,
        },
      ],
    ],
  },
]

describe('bingeMode', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('determines when to show next episode prompt based on threshold', () => {
    // 50 minutes total duration (3000 seconds)
    const duration = 3000
    // At 2900 seconds (100s remaining): false (threshold is 45s)
    expect(shouldShowNextEpisodePrompt(2900, duration, 45)).toBe(false)
    // At 2960 seconds (40s remaining): true
    expect(shouldShowNextEpisodePrompt(2960, duration, 45)).toBe(true)
    // When video has finished (3000s): false
    expect(shouldShowNextEpisodePrompt(3000, duration, 45)).toBe(false)
  })

  it('detects when skip intro button should be shown', () => {
    expect(canSkipIntro(30, 85)).toBe(true)
    expect(canSkipIntro(84, 85)).toBe(true)
    expect(canSkipIntro(86, 85)).toBe(false)
    expect(canSkipIntro(10, 0)).toBe(false)
  })

  it('finds next episode in same season', () => {
    const currentRef = 'episode:s-severance/ep-1'
    const next = findNextEpisode(currentRef, mockSeries)
    expect(next).not.toBeNull()
    expect(next?.nextEpisode.title).toBe('Half Loop')
    expect(next?.nextRef).toBe('episode:s-severance/ep-2')
  })

  it('finds first episode of next season when at end of current season', () => {
    const currentRef = 'episode:s-severance/ep-2'
    const next = findNextEpisode(currentRef, mockSeries)
    expect(next).not.toBeNull()
    expect(next?.nextEpisode.title).toBe('Return to Lumon')
    expect(next?.nextRef).toBe('episode:s-severance/ep-3')
  })

  it('returns null when at the final episode of the final season', () => {
    const currentRef = 'episode:s-severance/ep-3'
    const next = findNextEpisode(currentRef, mockSeries)
    expect(next).toBeNull()
  })

  it('saves and loads binge settings in localStorage', () => {
    const def = loadBingeSettings()
    expect(def.enabled).toBe(true)
    expect(def.countdownSeconds).toBe(10)

    const custom: BingeSettings = {
      enabled: false,
      countdownSeconds: 5,
      skipIntroSeconds: 90,
      autoSkipCredits: true,
      promptThresholdSeconds: 30,
    }
    saveBingeSettings(custom)
    const loaded = loadBingeSettings()
    expect(loaded.enabled).toBe(false)
    expect(loaded.countdownSeconds).toBe(5)
    expect(loaded.skipIntroSeconds).toBe(90)
    expect(loaded.autoSkipCredits).toBe(true)
  })
})
