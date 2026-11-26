// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SubtitleSearchModal } from './SubtitleSearchModal'
import * as openSubtitles from '../lib/openSubtitles'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../lib/openSubtitles', () => ({
  searchOpenSubtitles: vi.fn(),
  downloadSubtitleText: vi.fn(),
  formatSubtitleLanguage: vi.fn((lang: string) => (lang === 'en' ? 'English' : lang.toUpperCase())),
}))

describe('SubtitleSearchModal', () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(() => {
    vi.clearAllMocks()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    host.remove()
  })

  it('renders nothing when open is false', async () => {
    await act(async () => {
      root.render(
        <SubtitleSearchModal
          open={false}
          onClose={() => {}}
          mediaTitle="Dune Part Two"
          onApplySubtitle={() => {}}
        />,
      )
    })

    expect(host.querySelector('.subtitle-modal-overlay')).toBeNull()
  })

  it('renders search input and title when open is true', async () => {
    vi.mocked(openSubtitles.searchOpenSubtitles).mockResolvedValueOnce([])

    await act(async () => {
      root.render(
        <SubtitleSearchModal
          open={true}
          onClose={() => {}}
          mediaTitle="Dune Part Two"
          onApplySubtitle={() => {}}
        />,
      )
    })

    const title = host.querySelector('.subtitle-modal-title')
    expect(title?.textContent).toBe('Subtitles & Captions')

    const input = host.querySelector('.subtitle-input-query') as HTMLInputElement
    expect(input.value).toBe('Dune Part Two')
  })

  it('displays search results and invokes onApplySubtitle when Apply is clicked', async () => {
    vi.mocked(openSubtitles.searchOpenSubtitles).mockResolvedValueOnce([
      {
        id: 'sub-1',
        fileName: 'Dune.Part.Two.2024.en.srt',
        language: 'en',
        format: 'srt',
        downloadCount: 1500,
        hearingImpaired: true,
        downloadUrl: 'https://dl.opensubtitles.org/subtitles/1.srt',
      },
    ])

    const srtContent = '1\n00:00:01,000 --> 00:00:04,000\nDesert power\n'
    vi.mocked(openSubtitles.downloadSubtitleText).mockResolvedValueOnce(srtContent)

    const handleApply = vi.fn()
    const handleClose = vi.fn()

    await act(async () => {
      root.render(
        <SubtitleSearchModal
          open={true}
          onClose={handleClose}
          mediaTitle="Dune Part Two"
          onApplySubtitle={handleApply}
        />,
      )
    })

    // Allow searchOpenSubtitles promise to resolve
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    const card = host.querySelector('.subtitle-card')
    expect(card).not.toBeNull()
    expect(card?.textContent).toContain('Dune.Part.Two.2024.en.srt')
    expect(card?.textContent).toContain('SDH')

    const applyBtn = card?.querySelector('button') as HTMLButtonElement
    expect(applyBtn).not.toBeNull()

    await act(async () => {
      applyBtn.click()
    })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    expect(openSubtitles.downloadSubtitleText).toHaveBeenCalledWith(
      'https://dl.opensubtitles.org/subtitles/1.srt',
    )
    expect(handleApply).toHaveBeenCalledWith(
      expect.stringContaining('blob:'),
      expect.stringContaining('English (SRT, CC)'),
    )
    expect(handleClose).toHaveBeenCalled()
  })
})
