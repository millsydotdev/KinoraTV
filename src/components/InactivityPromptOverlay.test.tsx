// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InactivityPromptOverlay } from './InactivityPromptOverlay'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('InactivityPromptOverlay', () => {
  let root: Root | null = null
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount()
      })
      root = null
    }
    document.body.replaceChildren()
  })

  it('renders nothing when open is false', () => {
    act(() => {
      root!.render(
        <InactivityPromptOverlay
          open={false}
          countdownSecs={60}
          onConfirmStillWatching={vi.fn()}
          onStopPlayback={vi.fn()}
        />
      )
    })
    expect(container.firstChild).toBeNull()
  })

  it('renders countdown and messages when open', () => {
    act(() => {
      root!.render(
        <InactivityPromptOverlay
          open={true}
          countdownSecs={45}
          onConfirmStillWatching={vi.fn()}
          onStopPlayback={vi.fn()}
        />
      )
    })

    expect(container.querySelector('[role="dialog"]')).toBeTruthy()
    expect(container.textContent).toContain('Are you still watching?')
    expect(container.textContent).toContain('45s')
    expect(container.textContent).toContain("I'm Still Watching")
  })

  it('triggers onConfirmStillWatching when clicking primary button or pressing Enter', () => {
    const onConfirm = vi.fn()
    act(() => {
      root!.render(
        <InactivityPromptOverlay
          open={true}
          countdownSecs={30}
          onConfirmStillWatching={onConfirm}
          onStopPlayback={vi.fn()}
        />
      )
    })

    const primaryBtn = container.querySelector('.inactivity-btn-primary') as HTMLButtonElement
    expect(primaryBtn).toBeTruthy()
    act(() => {
      primaryBtn.click()
    })
    expect(onConfirm).toHaveBeenCalledTimes(1)

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    })
    expect(onConfirm).toHaveBeenCalledTimes(2)
  })

  it('triggers onStopPlayback when clicking secondary button', () => {
    const onStop = vi.fn()
    act(() => {
      root!.render(
        <InactivityPromptOverlay
          open={true}
          countdownSecs={30}
          onConfirmStillWatching={vi.fn()}
          onStopPlayback={onStop}
        />
      )
    })

    const secondaryBtn = container.querySelector('.inactivity-btn-secondary') as HTMLButtonElement
    expect(secondaryBtn).toBeTruthy()
    act(() => {
      secondaryBtn.click()
    })
    expect(onStop).toHaveBeenCalledTimes(1)
  })
})
