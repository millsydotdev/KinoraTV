// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PlayerNowNextBar } from './PlayerNowNextBar'
import type { Channel, Programme } from '../data/types'

function makeChannel(id: string, name: string, number: number): Channel {
  return {
    id,
    name,
    number,
    group: 'General',
    categories: ['General'],
    logoUrl: null,
    mark: { text: id, tone: 'neutral' },
    streamUrl: `http://example.com/${id}.m3u8`,
    hd: true,
    sourceId: 'src-1',
    tvgId: null,
  }
}

describe('PlayerNowNextBar', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.useRealTimers()
  })

  const ch1 = makeChannel('ch-1', 'BBC One', 101)
  const ch2 = makeChannel('ch-2', 'BBC Two', 102)

  const progNow: Programme = {
    id: 'p-1',
    channelId: 'ch-1',
    start: 1000,
    stop: 2000,
    title: 'Evening News',
    desc: 'Nightly news broadcast',
    category: 'News',
    episode: null,
  }

  const progNext: Programme = {
    id: 'p-2',
    channelId: 'ch-1',
    start: 2000,
    stop: 3000,
    title: 'Documentary',
    desc: 'Nature and science',
    category: 'Documentary',
    episode: null,
  }

  it('renders current channel and schedule info', () => {
    const onTune = vi.fn()
    const onClose = vi.fn()

    act(() => {
      root.render(
        <PlayerNowNextBar
          currentChannel={ch1}
          allChannels={[ch1, ch2]}
          currentProgramme={progNow}
          nextProgramme={progNext}
          now={1500}
          onTuneChannel={onTune}
          onClose={onClose}
        />
      )
    })

    expect(container.textContent).toContain('BBC One')
    expect(container.textContent).toContain('101')
    expect(container.textContent).toContain('Evening News')
    expect(container.textContent).toContain('Documentary')
  })

  it('peeks next channel on arrow click and triggers tuning on Enter', () => {
    const onTune = vi.fn()
    const onClose = vi.fn()

    act(() => {
      root.render(
        <PlayerNowNextBar
          currentChannel={ch1}
          allChannels={[ch1, ch2]}
          currentProgramme={progNow}
          nextProgramme={progNext}
          now={1500}
          onTuneChannel={onTune}
          onClose={onClose}
        />
      )
    })

    const nextBtn = container.querySelector('[aria-label="Next channel preview"]') as HTMLButtonElement
    expect(nextBtn).toBeDefined()

    act(() => {
      nextBtn.click()
    })

    expect(container.textContent).toContain('BBC Two')
    expect(container.textContent).toContain('Preview')

    // Press Enter to tune:
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    })

    expect(onTune).toHaveBeenCalledWith(ch2)
  })

  it('auto-dismisses after timer expiration', () => {
    const onTune = vi.fn()
    const onClose = vi.fn()

    act(() => {
      root.render(
        <PlayerNowNextBar
          currentChannel={ch1}
          allChannels={[ch1, ch2]}
          currentProgramme={progNow}
          nextProgramme={progNext}
          now={1500}
          onTuneChannel={onTune}
          onClose={onClose}
        />
      )
    })

    expect(onClose).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(6500)
    })

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
