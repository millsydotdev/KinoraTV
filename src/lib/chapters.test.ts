import { describe, it, expect } from 'vitest'
import {
  sortedChapters,
  chapterMarkers,
  hasChapterMarkers,
  currentChapterIndex,
  chapterAt,
  formatChapterTime,
  type ChapterInfo,
} from './chapters'

describe('chapters helpers', () => {
  const sampleChapters: ChapterInfo[] = [
    { startSec: 300, title: 'Chapter 2: The Journey' },
    { startSec: 0, title: 'Chapter 1: Prologue' },
    { startSec: 900, title: 'Chapter 3: The Climax' },
  ]

  it('sorts chapters ascending by start time', () => {
    const sorted = sortedChapters(sampleChapters)
    expect(sorted.map((c) => c.startSec)).toEqual([0, 300, 900])
  })

  it('converts markers to relative percentages and drops the 0s marker', () => {
    const duration = 1200 // 20 minutes
    const markers = chapterMarkers(sampleChapters, duration)

    expect(markers).toHaveLength(2)
    // 300 / 1200 = 25%
    expect(markers[0]?.percent).toBe(25)
    expect(markers[0]?.startSec).toBe(300)
    expect(markers[0]?.title).toBe('Chapter 2: The Journey')

    // 900 / 1200 = 75%
    expect(markers[1]?.percent).toBe(75)
    expect(markers[1]?.startSec).toBe(900)
  })

  it('hasChapterMarkers evaluates true only when at least two markers exist', () => {
    expect(hasChapterMarkers(sampleChapters, 1200)).toBe(true)
    expect(hasChapterMarkers([{ startSec: 0, title: 'Single' }], 1200)).toBe(false)
    expect(hasChapterMarkers([], 1200)).toBe(false)
    expect(hasChapterMarkers(null, 1200)).toBe(false)
  })

  it('determines the active chapter index correctly across playback positions', () => {
    const sorted = sortedChapters(sampleChapters)

    expect(currentChapterIndex(150, sorted)).toBe(0) // Prologue
    expect(currentChapterIndex(300, sorted)).toBe(1) // Chapter 2 start
    expect(currentChapterIndex(500, sorted)).toBe(1) // Chapter 2
    expect(currentChapterIndex(950, sorted)).toBe(2) // Chapter 3
    expect(currentChapterIndex(-5, sorted)).toBe(-1)
  })

  it('returns active chapter metadata with chapterAt', () => {
    const ch = chapterAt(450, sampleChapters)
    expect(ch?.title).toBe('Chapter 2: The Journey')
  })

  it('formats chapter times into mm:ss and hh:mm:ss strings', () => {
    expect(formatChapterTime(65)).toBe('1:05')
    expect(formatChapterTime(3600)).toBe('1:00:00')
    expect(formatChapterTime(3665)).toBe('1:01:05')
  })
})
