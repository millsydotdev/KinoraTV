// @vitest-environment happy-dom
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  PlaybackProvider,
  useUniversalPlayback,
  type ActiveStreamItem,
  type UniversalPlaybackContextValue,
} from './playbackContext'
import { dispatchKinoraCommand } from '../lib/commands'
import { StoreProvider } from './store'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('Universal PlaybackContext', () => {
  let host: HTMLDivElement
  let root: Root
  let currentContext: UniversalPlaybackContextValue | null = null

  function TestConsumer() {
    const ctx = useUniversalPlayback()
    useEffect(() => {
      currentContext = ctx
    })
    return null
  }

  beforeEach(() => {
    currentContext = null
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    host.remove()
  })

  it('provides fallback defaults when consumed outside provider', async () => {
    await act(async () => {
      root.render(<TestConsumer />)
    })

    expect(currentContext).not.toBeNull()
    expect(currentContext?.activeStream).toBeNull()
    expect(currentContext?.pipMode).toBe('hidden')
    expect(currentContext?.playbackState.status).toBe('idle')
  })

  it('updates active stream and initiates docked pip mode on playStream', async () => {
    await act(async () => {
      root.render(
        <StoreProvider>
          <PlaybackProvider>
            <TestConsumer />
          </PlaybackProvider>
        </StoreProvider>
      )
    })

    const sampleItem: ActiveStreamItem = {
      ref: 'movie:test-title',
      streamUrl: 'https://example.com/live/master.m3u8',
      title: 'Test Live Stream',
      isLive: true,
    }

    act(() => {
      currentContext?.playStream(sampleItem)
    })

    expect(currentContext?.activeStream).toEqual(sampleItem)
    expect(currentContext?.pipMode).toBe('docked')
  })

  it('preserves existing stream without restarting when playing identical streamUrl', async () => {
    await act(async () => {
      root.render(
        <StoreProvider>
          <PlaybackProvider>
            <TestConsumer />
          </PlaybackProvider>
        </StoreProvider>
      )
    })

    const item1: ActiveStreamItem = {
      streamUrl: 'https://example.com/same-stream.m3u8',
      title: 'Initial Title',
    }

    const item2: ActiveStreamItem = {
      streamUrl: 'https://example.com/same-stream.m3u8',
      title: 'Updated Metadata',
    }

    act(() => {
      currentContext?.playStream(item1)
    })

    const initialStream = currentContext?.activeStream

    act(() => {
      currentContext?.playStream(item2)
    })

    expect(currentContext?.activeStream?.title).toBe('Updated Metadata')
    expect(currentContext?.activeStream?.streamUrl).toBe(initialStream?.streamUrl)
  })

  it('resets stream and hides dock on stopPlayback', async () => {
    await act(async () => {
      root.render(
        <StoreProvider>
          <PlaybackProvider>
            <TestConsumer />
          </PlaybackProvider>
        </StoreProvider>
      )
    })

    act(() => {
      currentContext?.playStream({
        streamUrl: 'https://example.com/test.m3u8',
        title: 'Playing Stream',
      })
    })

    expect(currentContext?.activeStream).not.toBeNull()

    act(() => {
      currentContext?.stopPlayback()
    })

    expect(currentContext?.activeStream).toBeNull()
    expect(currentContext?.pipMode).toBe('hidden')
  })

  it('updates pipMode between docked, minimized, and fullscreen', async () => {
    await act(async () => {
      root.render(
        <StoreProvider>
          <PlaybackProvider>
            <TestConsumer />
          </PlaybackProvider>
        </StoreProvider>
      )
    })

    act(() => {
      currentContext?.setPipMode('minimized')
    })
    expect(currentContext?.pipMode).toBe('minimized')

    act(() => {
      currentContext?.setPipMode('fullscreen')
    })
    expect(currentContext?.pipMode).toBe('fullscreen')

    act(() => {
      currentContext?.setPipMode('docked')
    })
    expect(currentContext?.pipMode).toBe('docked')
  })

  it('responds to global playMedia commands via central dispatcher', async () => {
    await act(async () => {
      root.render(
        <StoreProvider>
          <PlaybackProvider>
            <TestConsumer />
          </PlaybackProvider>
        </StoreProvider>
      )
    })

    act(() => {
      dispatchKinoraCommand({
        type: 'playMedia',
        payload: {
          streamUrl: 'https://example.com/remote-cmd.m3u8',
          title: 'Remote Command Stream',
          isLive: true,
        },
      })
    })

    expect(currentContext?.activeStream?.streamUrl).toBe('https://example.com/remote-cmd.m3u8')
    expect(currentContext?.activeStream?.title).toBe('Remote Command Stream')
    expect(currentContext?.pipMode).toBe('docked')
  })
})
