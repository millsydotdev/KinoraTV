import { describe, expect, it } from 'vitest'
import {
  cuesToVttBlobUrl,
  formatSecondsToVttTimestamp,
  generateSubtitleCss,
  parseSubtitleText,
  parseTimestampToSeconds,
} from './subtitles'

describe('subtitles engine', () => {
  it('parses timestamps into seconds accurately', () => {
    expect(parseTimestampToSeconds('00:01:23.456')).toBeCloseTo(83.456)
    expect(parseTimestampToSeconds('01:30.500')).toBeCloseTo(90.5)
    expect(parseTimestampToSeconds('02:15:10,250')).toBeCloseTo(8110.25)
    expect(parseTimestampToSeconds('invalid')).toBeNull()
  })

  it('formats seconds into WebVTT timestamp string', () => {
    expect(formatSecondsToVttTimestamp(83.456)).toBe('00:01:23.456')
    expect(formatSecondsToVttTimestamp(3665.1)).toBe('01:01:05.100')
    expect(formatSecondsToVttTimestamp(-5)).toBe('00:00:00.000')
  })

  it('parses SubRip (.srt) subtitle content', () => {
    const srt = `
1
00:00:01,000 --> 00:00:04,000
Welcome to Kinora.

2
00:00:05,500 --> 00:00:08,200
Enjoy live sports and broadcast cinema.
`
    const cues = parseSubtitleText(srt)
    expect(cues).toHaveLength(2)
    expect(cues[0]?.start).toBe(1.0)
    expect(cues[0]?.end).toBe(4.0)
    expect(cues[0]?.text).toBe('Welcome to Kinora.')
    expect(cues[1]?.start).toBe(5.5)
    expect(cues[1]?.end).toBe(8.2)
    expect(cues[1]?.text).toBe('Enjoy live sports and broadcast cinema.')
  })

  it('parses WebVTT (.vtt) subtitle content with headers', () => {
    const vtt = `WEBVTT - Kinora Stream Track

1
00:00:02.100 --> 00:00:05.000
Breaking news coverage.

2
00:00:06.000 --> 00:00:09.500
Live from London.
`
    const cues = parseSubtitleText(vtt)
    expect(cues).toHaveLength(2)
    expect(cues[0]?.start).toBe(2.1)
    expect(cues[0]?.end).toBe(5.0)
    expect(cues[0]?.text).toBe('Breaking news coverage.')
    expect(cues[1]?.text).toBe('Live from London.')
  })

  it('converts cues to WebVTT blob URL with time offsets', () => {
    const cues = [
      { start: 10.0, end: 15.0, text: 'Offset test cue.' },
    ]
    // Shift by +2.5 seconds
    const blobUrl = cuesToVttBlobUrl(cues, 2.5)
    expect(blobUrl).toMatch(/^blob:/)
  })

  it('shifts cues accurately with negative and positive micro-nudge offsets', () => {
    const cues = [
      { start: 5.0, end: 8.0, text: 'Micro-nudge cue' },
    ]
    // Negative offset -250ms
    const blobUrlMinus = cuesToVttBlobUrl(cues, -0.25)
    expect(blobUrlMinus).toMatch(/^blob:/)

    // Positive offset +250ms
    const blobUrlPlus = cuesToVttBlobUrl(cues, 0.25)
    expect(blobUrlPlus).toMatch(/^blob:/)
  })

  it('generates customized subtitle CSS styles', () => {
    const css = generateSubtitleCss({
      fontSizePercent: 125,
      color: '#ffff00',
      backgroundOpacity: 0.8,
      outline: true,
    })
    expect(css).toContain('font-size: 125%;')
    expect(css).toContain('color: #ffff00;')
    expect(css).toContain('background-color: rgba(0, 0, 0, 0.80);')
    expect(css).toContain('text-shadow:')
  })
})
