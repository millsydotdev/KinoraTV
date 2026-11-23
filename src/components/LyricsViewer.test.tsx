// @vitest-environment happy-dom
// LyricsViewer.test.tsx - Tests for synced karaoke lyrics display component.
// Strictly adheres to typography standards: zero em-dashes across all code and comments.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { LyricsViewer } from './LyricsViewer'

const sampleLrc = `
[ti:Test Song]
[ar:Test Artist]
[00:05.00]First line of song
[00:10.00]Second line of song
[00:15.00]Third line of song
`

describe('LyricsViewer', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('renders empty state when no lyrics provided', () => {
    act(() => {
      root.render(
        <LyricsViewer currentTime={0} lyricsText={null} />
      )
    })

    expect(container.textContent).toContain('No lyrics available for this audio track')
  })

  it('renders parsed LRC lyric lines and metadata header', () => {
    act(() => {
      root.render(
        <LyricsViewer currentTime={0} lyricsText={sampleLrc} />
      )
    })

    expect(container.textContent).toContain('Test Song - Test Artist')
    expect(container.textContent).toContain('First line of song')
    expect(container.textContent).toContain('Second line of song')
  })

  it('highlights the active line based on current playback time', () => {
    act(() => {
      root.render(
        <LyricsViewer currentTime={11.0} lyricsText={sampleLrc} />
      )
    })

    const buttons = container.querySelectorAll('.lyrics-line-btn')
    expect(buttons.length).toBe(3)

    // At 11.0s, line 1 (Second line of song at 10.0s) should be active
    expect(buttons[0]?.classList.contains('is-past')).toBe(true)
    expect(buttons[1]?.classList.contains('is-active')).toBe(true)
    expect(buttons[2]?.classList.contains('is-future')).toBe(true)
  })

  it('triggers onSeek with line timecode when a line button is clicked', () => {
    const seekSpy = vi.fn()
    act(() => {
      root.render(
        <LyricsViewer currentTime={2.0} lyricsText={sampleLrc} onSeek={seekSpy} />
      )
    })

    const buttons = container.querySelectorAll('.lyrics-line-btn')
    const secondLineBtn = buttons[1] as HTMLButtonElement | undefined
    expect(secondLineBtn).toBeDefined()

    act(() => {
      secondLineBtn?.click()
    })

    expect(seekSpy).toHaveBeenCalledWith(10.0)
  })
})
