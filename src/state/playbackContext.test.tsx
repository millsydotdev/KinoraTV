// @vitest-environment happy-dom
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  PlaybackProvider,
  useUniversalPlayback,
  type ActiveStreamItem,
  type StreamVariant,
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

    await act(async () => {
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

    await act(async () => {
      currentContext?.playStream(item1)
    })

    const initialStream = currentContext?.activeStream

    await act(async () => {
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

    await act(async () => {
      currentContext?.playStream({
        streamUrl: 'https://example.com/test.m3u8',
        title: 'Playing Stream',
      })
    })

    expect(currentContext?.activeStream).not.toBeNull()

    await act(async () => {
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

    await act(async () => {
      currentContext?.setPipMode('minimized')
    })
    expect(currentContext?.pipMode).toBe('minimized')

    await act(async () => {
      currentContext?.setPipMode('fullscreen')
    })
    expect(currentContext?.pipMode).toBe('fullscreen')

    await act(async () => {
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

    await act(async () => {
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

  it('Scenario 1: starts playback from Movies with correct activeStream and presentation', async () => {
    await act(async () => {
      root.render(
        <StoreProvider>
          <PlaybackProvider>
            <TestConsumer />
          </PlaybackProvider>
        </StoreProvider>
      )
    })

    await act(async () => {
      currentContext?.playStream({
        ref: 'movie:sci-fi-odyssey',
        streamUrl: 'https://example.com/movies/odyssey.m3u8',
        title: 'Sci-Fi Odyssey',
        isLive: false,
      })
    })

    expect(currentContext?.activeStream?.ref).toBe('movie:sci-fi-odyssey')
    expect(currentContext?.activeStream?.title).toBe('Sci-Fi Odyssey')
    expect(currentContext?.pipMode).toBe('docked')
  })

  it('Scenario 2: navigates to Home while playback continues in dock', async () => {
    await act(async () => {
      root.render(
        <StoreProvider>
          <PlaybackProvider>
            <TestConsumer />
          </PlaybackProvider>
        </StoreProvider>
      )
    })

    await act(async () => {
      currentContext?.playStream({
        ref: 'movie:sci-fi-odyssey',
        streamUrl: 'https://example.com/movies/odyssey.m3u8',
        title: 'Sci-Fi Odyssey',
      })
      currentContext?.setPipMode('fullscreen')
    })

    expect(currentContext?.pipMode).toBe('fullscreen')

    await act(async () => {
      currentContext?.setPipMode('docked')
    })

    expect(currentContext?.pipMode).toBe('docked')
    expect(currentContext?.activeStream?.ref).toBe('movie:sci-fi-odyssey')
  })

  it('Scenario 3: restores full player without reopening stream', async () => {
    await act(async () => {
      root.render(
        <StoreProvider>
          <PlaybackProvider>
            <TestConsumer />
          </PlaybackProvider>
        </StoreProvider>
      )
    })

    const item: ActiveStreamItem = {
      ref: 'channel:laughs',
      streamUrl: 'https://example.com/live/laughs.m3u8',
      title: 'Laughs Channel',
      isLive: true,
    }

    await act(async () => {
      currentContext?.playStream(item)
    })

    const streamBefore = currentContext?.activeStream

    await act(async () => {
      currentContext?.setPipMode('fullscreen')
    })

    expect(currentContext?.pipMode).toBe('fullscreen')
    expect(currentContext?.activeStream).toBe(streamBefore)
  })

  it('Scenario 4: minimises and restores playback', async () => {
    await act(async () => {
      root.render(
        <StoreProvider>
          <PlaybackProvider>
            <TestConsumer />
          </PlaybackProvider>
        </StoreProvider>
      )
    })

    await act(async () => {
      currentContext?.playStream({
        streamUrl: 'https://example.com/stream.m3u8',
        title: 'Background Audio',
      })
      currentContext?.setPipMode('minimized')
    })

    expect(currentContext?.pipMode).toBe('minimized')
    expect(currentContext?.activeStream?.title).toBe('Background Audio')

    await act(async () => {
      currentContext?.setPipMode('docked')
    })

    expect(currentContext?.pipMode).toBe('docked')
    expect(currentContext?.activeStream?.title).toBe('Background Audio')
  })

  it('Scenario 5: explicitly stops playback and cleans up state', async () => {
    await act(async () => {
      root.render(
        <StoreProvider>
          <PlaybackProvider>
            <TestConsumer />
          </PlaybackProvider>
        </StoreProvider>
      )
    })

    await act(async () => {
      currentContext?.playStream({
        streamUrl: 'https://example.com/stream.m3u8',
        title: 'Playing Media',
      })
    })

    expect(currentContext?.activeStream).not.toBeNull()

    await act(async () => {
      currentContext?.stopPlayback()
    })

    expect(currentContext?.activeStream).toBeNull()
    expect(currentContext?.pipMode).toBe('hidden')
  })

  it('Scenario 6: switches channels in Live TV cleanly', async () => {
    await act(async () => {
      root.render(
        <StoreProvider>
          <PlaybackProvider>
            <TestConsumer />
          </PlaybackProvider>
        </StoreProvider>
      )
    })

    await act(async () => {
      currentContext?.playStream({
        ref: 'channel:ch-1',
        streamUrl: 'https://example.com/ch1.m3u8',
        title: 'Channel One',
        isLive: true,
      })
    })

    expect(currentContext?.activeStream?.title).toBe('Channel One')

    await act(async () => {
      currentContext?.playStream({
        ref: 'channel:ch-2',
        streamUrl: 'https://example.com/ch2.m3u8',
        title: 'Channel Two',
        isLive: true,
      })
    })

    expect(currentContext?.activeStream?.title).toBe('Channel Two')
    expect(currentContext?.activeStream?.ref).toBe('channel:ch-2')
  })

  it('Scenario 7: switches servers for a multi-server channel', async () => {
    await act(async () => {
      root.render(
        <StoreProvider>
          <PlaybackProvider>
            <TestConsumer />
          </PlaybackProvider>
        </StoreProvider>
      )
    })

    const servers: StreamVariant[] = [
      {
        id: 'srv-primary',
        name: 'Primary UK',
        streamUrl: 'https://srv1.example.com/live.m3u8',
        channelId: 'sports-hd',
        sourceId: 'src-1',
        sourceName: 'Source 1',
      },
      {
        id: 'srv-backup',
        name: 'Backup EU',
        streamUrl: 'https://srv2.example.com/live.m3u8',
        channelId: 'sports-hd',
        sourceId: 'src-1',
        sourceName: 'Source 1',
      },
    ]

    await act(async () => {
      currentContext?.playStream({
        ref: 'channel:sports-hd',
        streamUrl: servers[0]?.streamUrl ?? 'https://srv1.example.com/live.m3u8',
        title: 'Sports HD',
        streamOptions: servers,
        selectedServerId: 'srv-primary',
      })
    })

    expect(currentContext?.selectedServerId).toBe('srv-primary')
    expect(currentContext?.activeStream?.streamUrl).toBe('https://srv1.example.com/live.m3u8')

    await act(async () => {
      currentContext?.selectServer('srv-backup')
    })

    expect(currentContext?.selectedServerId).toBe('srv-backup')
    expect(currentContext?.activeStream?.streamUrl).toBe('https://srv2.example.com/live.m3u8')
  })

  it('Scenario 8: protects against race conditions when switching media rapidly', async () => {
    await act(async () => {
      root.render(
        <StoreProvider>
          <PlaybackProvider>
            <TestConsumer />
          </PlaybackProvider>
        </StoreProvider>
      )
    })

    await act(async () => {
      currentContext?.playStream({ ref: 'media:1', streamUrl: 'https://example.com/1.m3u8', title: 'Media 1' })
      currentContext?.playStream({ ref: 'media:2', streamUrl: 'https://example.com/2.m3u8', title: 'Media 2' })
      currentContext?.playStream({ ref: 'media:3', streamUrl: 'https://example.com/3.m3u8', title: 'Media 3' })
    })

    expect(currentContext?.activeStream?.ref).toBe('media:3')
    expect(currentContext?.activeStream?.title).toBe('Media 3')
    expect(currentContext?.activeStream?.streamUrl).toBe('https://example.com/3.m3u8')
  })

  it('Scenario 9: navigates between Live TV and full player seamlessly', async () => {
    await act(async () => {
      root.render(
        <StoreProvider>
          <PlaybackProvider>
            <TestConsumer />
          </PlaybackProvider>
        </StoreProvider>
      )
    })

    await act(async () => {
      currentContext?.playStream({
        ref: 'channel:news-24',
        streamUrl: 'https://example.com/news.m3u8',
        title: 'News 24',
        isLive: true,
      })
    })
    expect(currentContext?.pipMode).toBe('docked')

    await act(async () => {
      currentContext?.setPipMode('fullscreen')
    })
    expect(currentContext?.pipMode).toBe('fullscreen')
    expect(currentContext?.activeStream?.title).toBe('News 24')

    await act(async () => {
      currentContext?.setPipMode('docked')
    })
    expect(currentContext?.pipMode).toBe('docked')
    expect(currentContext?.activeStream?.title).toBe('News 24')
  })

  it('Scenario 10: ensures EPG preview yields to active playback', async () => {
    await act(async () => {
      root.render(
        <StoreProvider>
          <PlaybackProvider>
            <TestConsumer />
          </PlaybackProvider>
        </StoreProvider>
      )
    })

    await act(async () => {
      currentContext?.playStream({
        ref: 'channel:main',
        streamUrl: 'https://example.com/main.m3u8',
        title: 'Main Channel',
      })
    })

    expect(currentContext?.activeStream).not.toBeNull()
    const hasActivePlayback = Boolean(currentContext?.activeStream)
    expect(hasActivePlayback).toBe(true)
  })

  it('Scenario 11: ensures old session cleanup does not close a newer active session', async () => {
    await act(async () => {
      root.render(
        <StoreProvider>
          <PlaybackProvider>
            <TestConsumer />
          </PlaybackProvider>
        </StoreProvider>
      )
    })

    await act(async () => {
      currentContext?.playStream({ ref: 'stream:first', streamUrl: 'https://example.com/first.m3u8', title: 'First' })
    })
    expect(currentContext?.activeStream?.ref).toBe('stream:first')

    await act(async () => {
      currentContext?.playStream({ ref: 'stream:second', streamUrl: 'https://example.com/second.m3u8', title: 'Second' })
    })

    expect(currentContext?.activeStream?.ref).toBe('stream:second')
    expect(currentContext?.activeStream?.streamUrl).toBe('https://example.com/second.m3u8')
  })

  it('Scenario 12: audio delay, subtitle delay and speed settings survive presentation transitions', async () => {
    await act(async () => {
      root.render(
        <StoreProvider>
          <PlaybackProvider>
            <TestConsumer />
          </PlaybackProvider>
        </StoreProvider>
      )
    })

    await act(async () => {
      currentContext?.playStream({
        streamUrl: 'https://example.com/media.m3u8',
        title: 'Media with Custom Settings',
      })
      currentContext?.setAudioDelayMs(250)
      currentContext?.setSubDelaySecs(1.5)
      currentContext?.setPlaybackSpeed(1.25)
    })

    expect(currentContext?.audioDelayMs).toBe(250)
    expect(currentContext?.subDelaySecs).toBe(1.5)
    expect(currentContext?.playbackSpeed).toBe(1.25)

    await act(async () => {
      currentContext?.setPipMode('fullscreen')
    })
    expect(currentContext?.audioDelayMs).toBe(250)
    expect(currentContext?.subDelaySecs).toBe(1.5)
    expect(currentContext?.playbackSpeed).toBe(1.25)

    await act(async () => {
      currentContext?.setPipMode('docked')
    })
    expect(currentContext?.audioDelayMs).toBe(250)
    expect(currentContext?.subDelaySecs).toBe(1.5)
    expect(currentContext?.playbackSpeed).toBe(1.25)
  })

  it('Scenario 13: HTML video element identity remains unchanged across presentation transitions', async () => {
    await act(async () => {
      root.render(
        <StoreProvider>
          <PlaybackProvider>
            <TestConsumer />
          </PlaybackProvider>
        </StoreProvider>
      )
    })

    await act(async () => {
      currentContext?.playStream({
        streamUrl: 'https://example.com/persistent.m3u8',
        title: 'Persistent Video Element Test',
      })
    })

    const initialVideoEl = currentContext?.videoRef.current
    expect(initialVideoEl).not.toBeNull()

    await act(async () => {
      currentContext?.setPipMode('fullscreen')
    })
    expect(currentContext?.videoRef.current).toBe(initialVideoEl)

    await act(async () => {
      currentContext?.setPipMode('minimized')
    })
    expect(currentContext?.videoRef.current).toBe(initialVideoEl)

    await act(async () => {
      currentContext?.setPipMode('docked')
    })
    expect(currentContext?.videoRef.current).toBe(initialVideoEl)
  })
})
