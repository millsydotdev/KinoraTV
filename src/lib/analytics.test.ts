import { describe, expect, it } from 'vitest'
import {
  calculateViewingAnalytics,
  detectFormatCategory,
  resolveRefGenres,
} from './analytics'
import type { Library } from '../data/types'

describe('Viewing Habits & Analytics Engine', () => {
  const emptyLibrary: Library = {
    favourites: [],
    watchlist: [],
    progress: {},
    watched: [],
    history: [],
    collections: [],
    reminders: [],
    recentSearches: [],
  }

  it('handles empty library without crashing', () => {
    const report = calculateViewingAnalytics(emptyLibrary)
    expect(report.totalWatchMinutes).toBe(0)
    expect(report.totalWatchHoursFormatted).toBe('0m')
    expect(report.last7DaysDaily.length).toBe(7)
    expect(report.completedCount).toBe(0)
    expect(report.inProgressCount).toBe(0)
    expect(report.estimatedDataGbTotal).toBe(0)
  })

  it('detects correct format categories for various refs', () => {
    expect(detectFormatCategory('channel:bbc-one')).toBe('Live TV')
    expect(detectFormatCategory('movie:inception')).toBe('Movies')
    expect(detectFormatCategory('series:breaking-bad')).toBe('Series')
    expect(detectFormatCategory('episode:stranger-things/s1e1')).toBe('Series')
    expect(detectFormatCategory('local:movie-123')).toBe('Local Media')
    expect(detectFormatCategory('res-rad-somafm')).toBe('Audio & Radio')
    expect(detectFormatCategory('audio:track-1')).toBe('Audio & Radio')
  })

  it('calculates watch minutes and format distribution from progress and history', () => {
    const fixedNow = new Date('2026-11-23T12:00:00Z').getTime()
    const testLibrary: Library = {
      ...emptyLibrary,
      progress: {
        'movie:synthetic-dawn': {
          pos: 3600, // 60 mins
          dur: 7200,
          at: fixedNow - 3600_000,
        },
        'channel:film4': {
          pos: 1800, // 30 mins
          dur: 3600,
          at: fixedNow - 7200_000,
        },
      },
      watched: ['movie:synthetic-dawn'],
      history: [
        { ref: 'channel:film4', at: fixedNow - 7200_000 },
        { ref: 'series:neon-city', at: fixedNow - 10000_000 },
      ],
    }

    const report = calculateViewingAnalytics(testLibrary, fixedNow)

    expect(report.totalWatchMinutes).toBeGreaterThanOrEqual(90)
    expect(report.completedCount).toBe(1)
    expect(report.inProgressCount).toBe(2)
    expect(report.formatBreakdown.length).toBe(5)

    const moviesFormat = report.formatBreakdown.find((f) => f.format === 'Movies')
    const liveTvFormat = report.formatBreakdown.find((f) => f.format === 'Live TV')
    expect(moviesFormat?.minutes).toBeGreaterThan(0)
    expect(liveTvFormat?.minutes).toBeGreaterThan(0)
    expect(report.estimatedDataGbTotal).toBeGreaterThan(0)
  })

  it('computes 7-day daily activity array and peak viewing hour', () => {
    const fixedNow = new Date(2026, 10, 23, 20, 30, 0).getTime() // 8:30 PM local time
    const testLibrary: Library = {
      ...emptyLibrary,
      progress: {
        'movie:demo': {
          pos: 5400, // 90 mins
          dur: 7200,
          at: fixedNow,
        },
      },
      history: [{ ref: 'movie:demo', at: fixedNow }],
    }

    const report = calculateViewingAnalytics(testLibrary, fixedNow)
    expect(report.last7DaysDaily.length).toBe(7)
    // The current day should have minutes recorded
    const today = report.last7DaysDaily[report.last7DaysDaily.length - 1]
    expect(today?.minutes).toBe(90)
    expect(report.peakViewingHourFormatted).toContain('20:00')
    expect(report.activeStreakDays).toBeGreaterThanOrEqual(1)
  })

  it('resolves catalog movie and series genres', () => {
    // In catalog, synthetic-dawn is a movie
    const genres = resolveRefGenres('movie:synthetic-dawn')
    expect(Array.isArray(genres)).toBe(true)
  })
})
