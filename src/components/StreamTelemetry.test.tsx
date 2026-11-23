// @vitest-environment happy-dom
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StreamTelemetry } from './StreamTelemetry'

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

describe('StreamTelemetry component', () => {
  it('renders telemetry diagnostics information and responds to close button', () => {
    const onClose = vi.fn()

    act(() => {
      root.render(
        <StreamTelemetry
          videoElement={null}
          hasRealStream={true}
          playbackStatus="playing"
          playbackSpeed={1}
          audioDelayMs={150}
          subDelaySecs={0.5}
          watchdogState="healthy"
          onClose={onClose}
        />,
      )
    })

    expect(container.textContent).toContain('STREAM TELEMETRY')
    expect(container.textContent).toContain('PLAYING (1x)')
    expect(container.textContent).toContain('Active (Healthy)')
    expect(container.textContent).toContain('HLS (kstream:// direct proxy)')
    expect(container.textContent).toContain('Audio: 150ms / Sub: 0.5s')

    const closeBtn = container.querySelector<HTMLButtonElement>('.close-btn')
    expect(closeBtn).toBeTruthy()
    act(() => {
      closeBtn?.click()
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('displays buffering watchdog state when stream is stalling', () => {
    act(() => {
      root.render(
        <StreamTelemetry
          videoElement={null}
          hasRealStream={true}
          playbackStatus="buffering"
          playbackSpeed={1}
          audioDelayMs={0}
          subDelaySecs={0}
          watchdogState="buffering"
          onClose={() => {}}
        />,
      )
    })

    expect(container.textContent).toContain('Buffering Watchdog')
    expect(container.textContent).toContain('BUFFERING')
  })
})
