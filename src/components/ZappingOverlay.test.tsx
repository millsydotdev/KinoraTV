// @vitest-environment happy-dom
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ZappingOverlay } from './ZappingOverlay'
import type { Channel, Programme } from '../data/types'

let root: Root
let container: HTMLDivElement

beforeEach(() => {
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

const sampleChannel: Channel = {
  id: 'ch-1',
  number: 101,
  name: 'UK| BBC ONE HD (FHD) [1080p] ⁶⁰ᶠᵖˢ',
  cleanName: 'BBC One',
  badges: [
    { label: 'UK', kind: 'country' },
    { label: '1080p', kind: 'quality' },
    { label: '60fps', kind: 'framerate' },
  ],
  group: 'Entertainment',
  categories: ['Entertainment'],
  logoUrl: null,
  mark: { text: 'B1', tone: '#3b82f6' },
  streamUrl: 'https://stream.example/live.m3u8',
  hd: true,
  sourceId: 'pl-1',
  tvgId: 'bbc.one',
}

const nowProg: Programme = {
  id: 'p-1',
  channelId: 'bbc.one',
  start: Date.now() - 1000 * 60 * 15, // 15 mins ago
  stop: Date.now() + 1000 * 60 * 45, // 45 mins remaining
  title: 'Morning News Bulletin',
  category: 'News',
  desc: 'Morning news report',
  episode: null,
}

const nextProg: Programme = {
  id: 'p-2',
  channelId: 'bbc.one',
  start: Date.now() + 1000 * 60 * 45,
  stop: Date.now() + 1000 * 60 * 105,
  title: 'Investigative Documentary',
  category: 'Documentary',
  desc: 'In-depth investigation',
  episode: null,
}

describe('ZappingOverlay component', () => {
  it('renders clean title, channel number, badges, and now/next programme information', () => {
    act(() => {
      root.render(
        <ZappingOverlay
          channel={sampleChannel}
          nowProgramme={nowProg}
          nextProgramme={nextProg}
          visible={true}
          onClose={() => {}}
        />,
      )
    })

    expect(container.textContent).toContain('BBC One')
    expect(container.textContent).toContain('101')
    expect(container.textContent).toContain('1080p')
    expect(container.textContent).toContain('60fps')
    expect(container.textContent).toContain('Morning News Bulletin')
    expect(container.textContent).toContain('Investigative Documentary')
  })

  it('does not render anything when visible is false', () => {
    act(() => {
      root.render(
        <ZappingOverlay
          channel={sampleChannel}
          nowProgramme={nowProg}
          nextProgramme={nextProg}
          visible={false}
          onClose={() => {}}
        />,
      )
    })

    expect(container.textContent).toBe('')
  })

  it('triggers onNextChannel and onPrevChannel callbacks when step buttons are clicked', () => {
    const onNext = vi.fn()
    const onPrev = vi.fn()

    act(() => {
      root.render(
        <ZappingOverlay
          channel={sampleChannel}
          nowProgramme={nowProg}
          nextProgramme={nextProg}
          visible={true}
          onClose={() => {}}
          onNextChannel={onNext}
          onPrevChannel={onPrev}
        />,
      )
    })

    const buttons = container.querySelectorAll<HTMLButtonElement>('.zapping-step-btn')
    expect(buttons.length).toBe(2)

    act(() => {
      buttons[0]?.click()
    })
    expect(onNext).toHaveBeenCalledTimes(1)

    act(() => {
      buttons[1]?.click()
    })
    expect(onPrev).toHaveBeenCalledTimes(1)
  })

  it('auto-dismisses via onClose timer after 3.5 seconds', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()

    act(() => {
      root.render(
        <ZappingOverlay
          channel={sampleChannel}
          nowProgramme={nowProg}
          nextProgramme={nextProg}
          visible={true}
          onClose={onClose}
        />,
      )
    })

    expect(onClose).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(3500)
    })

    expect(onClose).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
