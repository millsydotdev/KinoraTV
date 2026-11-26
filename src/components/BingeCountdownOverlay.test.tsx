// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BingeCountdownOverlay } from './BingeCountdownOverlay'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('BingeCountdownOverlay', () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(() => {
    vi.useFakeTimers()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    host.remove()
    vi.useRealTimers()
  })

  it('renders nothing when open is false', async () => {
    await act(async () => {
      root.render(
        <BingeCountdownOverlay
          open={false}
          nextTitle="Half Loop"
          nextEpisodeCode="S1 E2"
          onPlayNext={() => {}}
          onCancel={() => {}}
        />,
      )
    })
    expect(host.querySelector('.binge-overlay')).toBeNull()
  })

  it('renders countdown and episode details when open', async () => {
    await act(async () => {
      root.render(
        <BingeCountdownOverlay
          open={true}
          nextTitle="Half Loop"
          nextEpisodeCode="S1 E2"
          initialSeconds={10}
          onPlayNext={() => {}}
          onCancel={() => {}}
        />,
      )
    })

    expect(host.textContent).toContain('S1 E2')
    expect(host.textContent).toContain('Half Loop')
    expect(host.textContent).toContain('10')
  })

  it('triggers onPlayNext when Play Now is clicked', async () => {
    const handlePlayNext = vi.fn()
    const handleCancel = vi.fn()

    await act(async () => {
      root.render(
        <BingeCountdownOverlay
          open={true}
          nextTitle="Half Loop"
          nextEpisodeCode="S1 E2"
          onPlayNext={handlePlayNext}
          onCancel={handleCancel}
        />,
      )
    })

    const playBtn = host.querySelector('.binge-play-btn') as HTMLButtonElement
    expect(playBtn).not.toBeNull()

    await act(async () => {
      playBtn.click()
    })

    expect(handlePlayNext).toHaveBeenCalled()
  })

  it('triggers onCancel when Cancel is clicked', async () => {
    const handlePlayNext = vi.fn()
    const handleCancel = vi.fn()

    await act(async () => {
      root.render(
        <BingeCountdownOverlay
          open={true}
          nextTitle="Half Loop"
          nextEpisodeCode="S1 E2"
          onPlayNext={handlePlayNext}
          onCancel={handleCancel}
        />,
      )
    })

    const cancelBtn = host.querySelectorAll('.binge-actions button')[1] as HTMLButtonElement
    expect(cancelBtn).not.toBeNull()

    await act(async () => {
      cancelBtn.click()
    })

    expect(handleCancel).toHaveBeenCalled()
  })

  it('counts down and triggers onPlayNext automatically at 0', async () => {
    const handlePlayNext = vi.fn()

    await act(async () => {
      root.render(
        <BingeCountdownOverlay
          open={true}
          nextTitle="Half Loop"
          nextEpisodeCode="S1 E2"
          initialSeconds={3}
          onPlayNext={handlePlayNext}
          onCancel={() => {}}
        />,
      )
    })

    expect(host.textContent).toContain('3')

    // Advance 1 second
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(host.textContent).toContain('2')

    // Advance 2 more seconds
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    expect(handlePlayNext).toHaveBeenCalled()
  })
})
