// @vitest-environment happy-dom
// Unit tests for NumericZapHUD: direct numeric keypad channel tuning.
// Adheres strictly to typography standards: zero em-dashes.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NumericZapHUD } from './NumericZapHUD'
import type { Channel } from '../data/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockChannels: Channel[] = [
  {
    id: 'ch-1',
    number: 1,
    name: 'BBC One HD',
    cleanName: 'BBC One',
    group: 'Entertainment',
    categories: ['Entertainment'],
    logoUrl: 'https://example.com/bbcone.png',
    mark: { tone: '#1e3a8a', text: 'BBC' },
    streamUrl: 'https://example.com/live/1.m3u8',
    hd: true,
    sourceId: null,
    tvgId: null,
    badges: [{ kind: 'quality', label: 'HD' }],
  },
  {
    id: 'ch-101',
    number: 101,
    name: 'Sky Sports Main Event 4K',
    cleanName: 'Sky Sports Main Event',
    group: 'Sports',
    categories: ['Sports'],
    logoUrl: null,
    mark: { tone: '#065f46', text: 'SKY' },
    streamUrl: 'https://example.com/live/101.m3u8',
    hd: true,
    sourceId: null,
    tvgId: null,
    badges: [{ kind: 'quality', label: '4K' }],
  },
]

describe('NumericZapHUD component', () => {
  let root: Root | null = null
  let container: HTMLDivElement

  beforeEach(() => {
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    if (root) {
      act(() => {
        root!.unmount()
      })
      root = null
    }
    document.body.replaceChildren()
  })

  it('remains inactive and unrendered until numeric keys are pressed', () => {
    const onTune = vi.fn()
    act(() => {
      root!.render(<NumericZapHUD channels={mockChannels} onTune={onTune} />)
    })

    expect(document.querySelector('.numeric-zap-hud')).toBeNull()
  })

  it('buffers digits and renders matched channel details', () => {
    const onTune = vi.fn()
    act(() => {
      root!.render(<NumericZapHUD channels={mockChannels} onTune={onTune} />)
    })

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }))
    })

    const hud = document.querySelector('.numeric-zap-hud')
    expect(hud).not.toBeNull()
    expect(hud?.textContent).toContain('1')
    expect(hud?.textContent).toContain('BBC One')

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }))
    })

    expect(hud?.textContent).toContain('101')
    expect(hud?.textContent).toContain('Sky Sports Main Event')
    expect(hud?.textContent).toContain('4K')
  })

  it('immediately tunes and dismisses when Enter is pressed', () => {
    const onTune = vi.fn()
    act(() => {
      root!.render(<NumericZapHUD channels={mockChannels} onTune={onTune} />)
    })

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    expect(onTune).toHaveBeenCalledTimes(1)
    expect(onTune).toHaveBeenCalledWith(mockChannels[0])
    expect(document.querySelector('.numeric-zap-hud')).toBeNull()
  })

  it('cancels and clears when Escape is pressed', () => {
    const onTune = vi.fn()
    act(() => {
      root!.render(<NumericZapHUD channels={mockChannels} onTune={onTune} />)
    })

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }))
    })
    expect(document.querySelector('.numeric-zap-hud')).not.toBeNull()

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.querySelector('.numeric-zap-hud')).toBeNull()
    expect(onTune).not.toHaveBeenCalled()
  })

  it('removes digits on Backspace and dismisses when empty', () => {
    const onTune = vi.fn()
    act(() => {
      root!.render(<NumericZapHUD channels={mockChannels} onTune={onTune} />)
    })

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }))
    })
    expect(document.querySelector('.numeric-zap-digits')?.textContent).toBe('10')

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }))
    })
    expect(document.querySelector('.numeric-zap-digits')?.textContent).toBe('1')

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }))
    })
    expect(document.querySelector('.numeric-zap-hud')).toBeNull()
  })

  it('automatically tunes after countdown expires', () => {
    const onTune = vi.fn()
    act(() => {
      root!.render(<NumericZapHUD channels={mockChannels} onTune={onTune} />)
    })

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }))
    })

    expect(onTune).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1400)
    })

    expect(onTune).toHaveBeenCalledWith(mockChannels[1])
    expect(document.querySelector('.numeric-zap-hud')).toBeNull()
  })

  it('ignores typing inside an input field', () => {
    const onTune = vi.fn()
    act(() => {
      root!.render(<NumericZapHUD channels={mockChannels} onTune={onTune} />)
    })

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }))
    })

    expect(document.querySelector('.numeric-zap-hud')).toBeNull()
    input.remove()
  })
})
