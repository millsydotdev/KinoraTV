// lyrics.test.ts - Test suite for LRC parsing and lyric line synchronization.
// Strictly adheres to typography standards: zero em-dashes across all code and comments.

import { describe, expect, it } from 'vitest'
import {
  parseTimestampToSeconds,
  parseLrc,
  findActiveLyricIndex,
  convertPlainTextToLyrics,
} from './lyrics'

describe('parseTimestampToSeconds', () => {
  it('parses two-digit millisecond timestamps', () => {
    expect(parseTimestampToSeconds('01', '23', '45')).toBe(83.45)
    expect(parseTimestampToSeconds('00', '05', '50')).toBe(5.5)
  })

  it('parses three-digit millisecond timestamps', () => {
    expect(parseTimestampToSeconds('02', '10', '500')).toBe(130.5)
  })

  it('handles missing fraction gracefully', () => {
    expect(parseTimestampToSeconds('01', '30')).toBe(90.0)
  })
})

describe('parseLrc', () => {
  const sampleLrc = `
[ti:Midnight Cinema]
[ar:Kinora Philharmonic]
[al:Night Tracks Vol 1]
[offset:500]

[00:04.00]Opening overture
[00:10.50]First verse begins under city lights
[00:20.00][00:40.00]Chorus repeats twice in song
[00:30.25]Second verse plays softly
`

  it('extracts metadata tags cleanly', () => {
    const parsed = parseLrc(sampleLrc)
    expect(parsed.title).toBe('Midnight Cinema')
    expect(parsed.artist).toBe('Kinora Philharmonic')
    expect(parsed.album).toBe('Night Tracks Vol 1')
    expect(parsed.offsetSec).toBe(0.5)
  })

  it('parses and sorts timestamped lyric lines with offset applied', () => {
    const parsed = parseLrc(sampleLrc)
    expect(parsed.lines.length).toBe(5)

    // With +500ms offset (0.5s):
    // 00:04.00 + 0.5 = 4.5
    expect(parsed.lines[0]?.time).toBe(4.5)
    expect(parsed.lines[0]?.text).toBe('Opening overture')

    // 00:10.50 + 0.5 = 11.0
    expect(parsed.lines[1]?.time).toBe(11.0)
    expect(parsed.lines[1]?.text).toBe('First verse begins under city lights')

    // Lines must be sorted ascending by time
    for (let i = 1; i < parsed.lines.length; i++) {
      expect((parsed.lines[i]?.time ?? 0)).toBeGreaterThanOrEqual((parsed.lines[i - 1]?.time ?? 0))
    }
  })

  it('handles empty or whitespace LRC content', () => {
    const parsed = parseLrc('   \n  \n')
    expect(parsed.lines).toEqual([])
    expect(parsed.offsetSec).toBe(0)
  })
})

describe('findActiveLyricIndex', () => {
  const lines = [
    { time: 5.0, text: 'Line 1', index: 0 },
    { time: 10.0, text: 'Line 2', index: 1 },
    { time: 15.0, text: 'Line 3', index: 2 },
    { time: 25.0, text: 'Line 4', index: 3 },
  ]

  it('returns -1 before the first lyric time', () => {
    expect(findActiveLyricIndex(2.0, lines)).toBe(-1)
  })

  it('finds exact timestamp matches', () => {
    expect(findActiveLyricIndex(5.0, lines)).toBe(0)
    expect(findActiveLyricIndex(10.0, lines)).toBe(1)
    expect(findActiveLyricIndex(25.0, lines)).toBe(3)
  })

  it('finds intermediate timestamps between lines', () => {
    expect(findActiveLyricIndex(7.5, lines)).toBe(0)
    expect(findActiveLyricIndex(14.9, lines)).toBe(1)
    expect(findActiveLyricIndex(20.0, lines)).toBe(2)
    expect(findActiveLyricIndex(100.0, lines)).toBe(3)
  })

  it('handles empty line arrays safely', () => {
    expect(findActiveLyricIndex(10.0, [])).toBe(-1)
  })
})

describe('convertPlainTextToLyrics', () => {
  it('distributes plain text lines evenly across total duration', () => {
    const plain = `
      First verse line
      Second verse line
      Third verse line
    `
    const parsed = convertPlainTextToLyrics(plain, 120)
    expect(parsed.lines.length).toBe(3)
    expect(parsed.lines[0]?.time).toBe(30)
    expect(parsed.lines[1]?.time).toBe(60)
    expect(parsed.lines[2]?.time).toBe(90)
  })
})
