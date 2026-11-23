// openSubtitles.test.ts - Unit tests for OpenSubtitles client.
// Strictly adheres to typography standards: zero em-dashes across all code and comments.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  searchOpenSubtitles,
  downloadSubtitleText,
  formatSubtitleLanguage,
} from './openSubtitles'
import * as nativeModule from './native'

vi.mock('./native', () => ({
  fetchSubtitle: vi.fn(),
  isTauri: vi.fn(() => true),
}))

describe('formatSubtitleLanguage', () => {
  it('converts standard ISO codes to language names', () => {
    expect(formatSubtitleLanguage('en')).toBe('English')
    expect(formatSubtitleLanguage('es')).toBe('Spanish')
    expect(formatSubtitleLanguage('fr')).toBe('French')
    expect(formatSubtitleLanguage('de')).toBe('German')
    expect(formatSubtitleLanguage('xyz')).toBe('XYZ')
  })
})

describe('searchOpenSubtitles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty array when query is empty string', async () => {
    const res = await searchOpenSubtitles('   ')
    expect(res).toEqual([])
    expect(nativeModule.fetchSubtitle).not.toHaveBeenCalled()
  })

  it('queries OpenSubtitles endpoint and parses subtitle results', async () => {
    const mockApiResponse = JSON.stringify({
      data: [
        {
          id: 'sub-101',
          attributes: {
            language: 'en',
            download_count: 1420,
            hearing_impaired: true,
            ratings: 4.8,
            files: [
              {
                file_id: 991,
                file_name: 'Dune.Part.Two.2024.1080p.WEB-DL.en.srt',
              },
            ],
          },
        },
        {
          id: 'sub-102',
          attributes: {
            language: 'es',
            download_count: 530,
            hearing_impaired: false,
            files: [
              {
                file_id: 992,
                file_name: 'Dune.Part.Two.2024.1080p.es.vtt',
              },
            ],
          },
        },
      ],
    })

    vi.mocked(nativeModule.fetchSubtitle).mockResolvedValueOnce(mockApiResponse)

    const results = await searchOpenSubtitles('Dune Part Two', { language: 'en' })

    expect(nativeModule.fetchSubtitle).toHaveBeenCalledWith(
      expect.stringContaining('query=Dune+Part+Two'),
      undefined,
    )
    expect(results.length).toBe(2)
    expect(results[0]?.id).toBe('sub-101')
    expect(results[0]?.language).toBe('en')
    expect(results[0]?.format).toBe('srt')
    expect(results[0]?.hearingImpaired).toBe(true)
    expect(results[0]?.downloadUrl).toBe('https://dl.opensubtitles.org/subtitles/991.srt')

    expect(results[1]?.format).toBe('vtt')
  })

  it('handles invalid JSON or error response gracefully', async () => {
    vi.mocked(nativeModule.fetchSubtitle).mockResolvedValueOnce('<html>Error</html>')

    const results = await searchOpenSubtitles('Cosmos')
    expect(results).toEqual([])
  })
})

describe('downloadSubtitleText', () => {
  it('downloads raw subtitle text via fetchSubtitle', async () => {
    const srtContent = '1\n00:00:01,000 --> 00:00:04,000\nHello World\n'
    vi.mocked(nativeModule.fetchSubtitle).mockResolvedValueOnce(srtContent)

    const text = await downloadSubtitleText('https://dl.opensubtitles.org/subtitles/991.srt')
    expect(text).toBe(srtContent)
    expect(nativeModule.fetchSubtitle).toHaveBeenCalledWith(
      'https://dl.opensubtitles.org/subtitles/991.srt',
      undefined,
    )
  })

  it('returns null if downloadUrl is empty', async () => {
    const text = await downloadSubtitleText('')
    expect(text).toBeNull()
  })
})
