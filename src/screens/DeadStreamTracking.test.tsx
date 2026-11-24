// @vitest-environment happy-dom
// Dead Stream Playback Failure Tracking & Status Badges (Audit Finding 6 & 18).
// Verifies session-isolated stream failure tracking from real playback attempts,
// failure badges on channel cards and guide rows, one-click retry, and bounded timeouts.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChannelCard } from '../components/Tiles'
import { ToastProvider } from '../components/Toast'
import type { Channel, Programme } from '../data/types'
import { IngestError, type OpenedStream, type PlaylistChannel } from '../lib/native'
import { createSource, type PlaylistSource } from '../state/playlists'
import { StoreProvider, useStore, type StreamFailure } from '../state/store'
import { Player } from './Player'
import { LiveTV } from './LiveTV'

const native = vi.hoisted(() => ({ openStream: vi.fn(), closeStream: vi.fn() }))
vi.mock('../lib/native', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/native')>()), ...native }))

const fake = vi.hoisted(() => {
  class FakeHls {
    static instances: FakeHls[] = []
    static isSupported = () => true
    static Events = {
      ERROR: 'hlsError',
      MANIFEST_PARSED: 'hlsManifestParsed',
      AUDIO_TRACKS_UPDATED: 'a',
      SUBTITLE_TRACKS_UPDATED: 's',
      AUDIO_TRACK_SWITCHED: 'as',
      SUBTITLE_TRACK_SWITCH: 'ss',
      LEVEL_SWITCHED: 'ls',
    }
    audioTracks: unknown[] = []
    subtitleTracks: unknown[] = []
    levels: { height: number }[] = []
    audioTrack = -1
    subtitleTrack = -1
    autoLevelEnabled = true
    autoLevelCapping = -1
    currentLevel = -1
    nextLevel = -1
    static ErrorTypes = { MEDIA_ERROR: 'mediaError', NETWORK_ERROR: 'networkError' }
    config: unknown
    handlers = new Map<string, (event: string, data: unknown) => void>()
    media: HTMLVideoElement | null = null
    source: string | null = null
    destroyed = false
    recoverMediaError = vi.fn()
    constructor(config: unknown) {
      this.config = config
      FakeHls.instances.push(this)
    }
    on(event: string, fn: (event: string, data: unknown) => void) { this.handlers.set(event, fn) }
    attachMedia(el: HTMLVideoElement) { this.media = el }
    loadSource(url: string) { this.source = url }
    destroy() { this.destroyed = true }
    emit(event: string, data: unknown = {}) { this.handlers.get(event)?.(event, data) }
  }
  return { FakeHls }
})
vi.mock('hls.js', () => ({ default: fake.FakeHls }))
const { FakeHls } = fake

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const UPSTREAM = 'https://cdn.example/live/stream1/index.m3u8?token=SECRET123'
const entry = (key: string, name: string, streamUrl: string): PlaylistChannel => ({
  key, tvgId: null, name, group: 'News', logo: null, language: null, country: null, chno: null, streamUrl, streamDisplay: 'https://cdn.example/…',
})
const source: PlaylistSource = createSource('pl-dead', { name: 'Live Lineup', origin: 'file', url: null, label: 'test.m3u' }, {
  channels: [
    entry('tvg:dead1', 'Dead Stream News', UPSTREAM),
    entry('tvg:good2', 'Working Channel', 'https://cdn.example/good/index.m3u8'),
  ],
  skipped: 0, duplicates: 0, warnings: [], host: null,
}, Date.now())
const [deadChannel] = source.channels as [PlaylistSource['channels'][number]]

const opened = (session: number): OpenedStream => ({ url: `kstream://localhost/${String(session).padStart(32, '0')}`, session })

let root: Root
let host: HTMLDivElement

beforeEach(() => {
  FakeHls.instances = []
  native.openStream.mockReset()
  native.closeStream.mockReset()
  native.closeStream.mockResolvedValue(undefined)
  native.openStream.mockResolvedValue(opened(1))
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})

afterEach(async () => {
  if (root) {
    await act(async () => root.unmount())
  }
  if (host) {
    host.remove()
  }
  document.body.replaceChildren()
  localStorage.clear()
  vi.restoreAllMocks()
})

const settle = async () => { for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve() }) }

describe('Dead stream failure tracking in store', () => {
  it('stores failures in session memory, retrieves them, and clears them without writing to localStorage', async () => {
    let storeRef!: ReturnType<typeof useStore>
    function StoreInspector() {
      storeRef = useStore()
      return <div>Ready</div>
    }

    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root.render(
        <StoreProvider initialPlaylists={[source]} initialDemo={false}>
          <StoreInspector />
        </StoreProvider>,
      )
    })
    await settle()

    expect(storeRef.getStreamFailure(deadChannel.id)).toBeUndefined()

    // Record failure
    act(() => {
      storeRef.recordStreamFailure(deadChannel.id, {
        message: 'The stream stopped responding.',
        canRetry: true,
      })
    })

    const failure = storeRef.getStreamFailure(deadChannel.id)
    expect(failure).toBeDefined()
    expect(failure?.channelId).toBe(deadChannel.id)
    expect(failure?.message).toBe('The stream stopped responding.')
    expect(failure?.canRetry).toBe(true)
    expect(failure?.at).toBeGreaterThan(0)

    // Verify localStorage has NOT been polluted with stream failure data
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      expect(key).not.toContain('stream_failure')
      expect(key).not.toContain('dead_stream')
    }

    // Clear failure
    act(() => {
      storeRef.clearStreamFailure(deadChannel.id)
    })
    expect(storeRef.getStreamFailure(deadChannel.id)).toBeUndefined()
  })
})

describe('ChannelCard offline badges and retry actions', () => {
  const dummyChannel: Channel = {
    id: 'ch-offline-1',
    name: 'BBC News HD',
    number: 101,
    streamUrl: 'https://example.com/stream.m3u8',
    logoUrl: null,
    mark: { text: 'BB', tone: '#b91c1c' },
    hd: true,
    tvgId: 'bbc.news',
    group: 'News',
    categories: ['News'],
    sourceId: 'pl-dead',
  }

  const dummyProgramme: Programme = {
    id: 'prog-1',
    channelId: 'ch-offline-1',
    title: 'World Business Today',
    desc: 'Daily business news and global market analysis.',
    category: 'News',
    episode: null,
    start: Date.now() - 600000,
    stop: Date.now() + 1200000,
  }

  it('renders subtle offline badge with warning icon and retry button when failure exists', async () => {
    const initialFailures = new Map<string, StreamFailure>([
      [
        'ch-offline-1',
        {
          channelId: 'ch-offline-1',
          at: Date.now(),
          message: 'The stream server could not be reached or refused the request.',
          canRetry: true,
        },
      ],
    ])

    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root.render(
        <MemoryRouter>
          <StoreProvider initialStreamFailures={initialFailures} initialDemo={false}>
            <ToastProvider>
              <ChannelCard
                channel={dummyChannel}
                now={dummyProgramme}
                to="/live?channel=ch-offline-1"
                format="24h"
                at={Date.now()}
              />
            </ToastProvider>
          </StoreProvider>
        </MemoryRouter>,
      )
    })
    await settle()

    const badge = document.querySelector('[data-testid="channel-offline-badge"]')
    expect(badge).not.toBeNull()
    expect(badge?.textContent).toContain('Offline')
    expect(badge?.getAttribute('title')).toContain('The stream server could not be reached')

    // Retry button present
    const retryBtn = document.querySelector<HTMLButtonElement>('.channel-card-retry-btn')
    expect(retryBtn).not.toBeNull()
    expect(retryBtn?.getAttribute('aria-label')).toContain('Retry tuning BBC News HD')

    // Card subtitle row shows offline indicator
    const progRow = document.querySelector('.channel-card-prog-row')
    expect(progRow?.textContent).toContain('Offline')
  })

  it('clears stream failure when clicking retry button on ChannelCard', async () => {
    let currentStore!: ReturnType<typeof useStore>
    function StoreWatcher() {
      currentStore = useStore()
      return null
    }

    const initialFailures = new Map<string, StreamFailure>([
      [
        'ch-offline-1',
        {
          channelId: 'ch-offline-1',
          at: Date.now(),
          message: 'Stream stopped responding.',
          canRetry: true,
        },
      ],
    ])

    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root.render(
        <MemoryRouter>
          <StoreProvider initialStreamFailures={initialFailures} initialDemo={false}>
            <ToastProvider>
              <StoreWatcher />
              <ChannelCard
                channel={dummyChannel}
                now={dummyProgramme}
                to="/live?channel=ch-offline-1"
                format="24h"
                at={Date.now()}
              />
            </ToastProvider>
          </StoreProvider>
        </MemoryRouter>,
      )
    })
    await settle()

    expect(currentStore.getStreamFailure('ch-offline-1')).toBeDefined()

    const retryBtn = document.querySelector<HTMLButtonElement>('.channel-card-retry-btn')
    expect(retryBtn).not.toBeNull()

    await act(async () => {
      retryBtn?.click()
    })
    await settle()

    // Failure state should now be cleared
    expect(currentStore.getStreamFailure('ch-offline-1')).toBeUndefined()
  })

  it('clears stream failure when clicking the card body to re-tune', async () => {
    let currentStore!: ReturnType<typeof useStore>
    function StoreWatcher() {
      currentStore = useStore()
      return null
    }

    const initialFailures = new Map<string, StreamFailure>([
      [
        'ch-offline-1',
        {
          channelId: 'ch-offline-1',
          at: Date.now(),
          message: 'Stream stopped responding.',
          canRetry: true,
        },
      ],
    ])

    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root.render(
        <MemoryRouter>
          <StoreProvider initialStreamFailures={initialFailures} initialDemo={false}>
            <ToastProvider>
              <StoreWatcher />
              <ChannelCard
                channel={dummyChannel}
                now={dummyProgramme}
                to="/live?channel=ch-offline-1"
                format="24h"
                at={Date.now()}
              />
            </ToastProvider>
          </StoreProvider>
        </MemoryRouter>,
      )
    })
    await settle()

    expect(currentStore.getStreamFailure('ch-offline-1')).toBeDefined()

    const cardLink = document.querySelector<HTMLAnchorElement>('.channel-card')
    expect(cardLink).not.toBeNull()

    await act(async () => {
      cardLink?.click()
    })
    await settle()

    expect(currentStore.getStreamFailure('ch-offline-1')).toBeUndefined()
  })
})

describe('LiveTV guide row failure indicators', () => {
  it('displays offline tag in guide subline and clearing on tune', async () => {
    let currentStore!: ReturnType<typeof useStore>
    function StoreWatcher() {
      currentStore = useStore()
      return null
    }

    const initialFailures = new Map<string, StreamFailure>([
      [
        deadChannel.id,
        {
          channelId: deadChannel.id,
          at: Date.now(),
          message: 'Connection timed out.',
          canRetry: true,
        },
      ],
    ])

    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/live?view=guide']}>
          <StoreProvider initialPlaylists={[source]} initialStreamFailures={initialFailures} initialDemo={false}>
            <ToastProvider>
              <StoreWatcher />
              <LiveTV />
            </ToastProvider>
          </StoreProvider>
        </MemoryRouter>,
      )
    })
    await settle()

    const guideTag = document.querySelector('[data-testid="guide-channel-offline-badge"]')
    expect(guideTag).not.toBeNull()
    expect(guideTag?.textContent).toContain('Offline')

    // Tune to channel by clicking the row tune button
    const tuneBtn = document.querySelector<HTMLButtonElement>(`#guide-row-${CSS.escape(deadChannel.id)} .guide-channel-tune`)
    expect(tuneBtn).not.toBeNull()

    await act(async () => {
      tuneBtn?.click()
    })
    await settle()

    // Failure state should be cleared upon tuning
    expect(currentStore.getStreamFailure(deadChannel.id)).toBeUndefined()
  })
})

describe('End-to-end player error recording', () => {
  it('records stream failure in store when openStream rejects with network error and clears on retry', async () => {
    let currentStore!: ReturnType<typeof useStore>
    function StoreWatcher() {
      currentStore = useStore()
      return null
    }

    native.openStream.mockRejectedValueOnce(
      new IngestError('blocked', 'Stream connection refused by host.')
    )

    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[`/watch/${encodeURIComponent(`channel:${deadChannel.id}`)}`]}>
          <StoreProvider initialPlaylists={[source]} initialDemo={false}>
            <ToastProvider>
              <StoreWatcher />
              <Routes>
                <Route path="/watch/:ref" element={<Player />} />
              </Routes>
            </ToastProvider>
          </StoreProvider>
        </MemoryRouter>,
      )
    })
    await settle()

    // Expect store to have recorded the playback failure
    const failure = currentStore.getStreamFailure(deadChannel.id)
    expect(failure).toBeDefined()
    expect(failure?.channelId).toBe(deadChannel.id)
    expect(failure?.message).toContain('This stream refers to an address Kinora does not fetch from')

    // Clicking Retry clears the recorded failure and tries opening again
    native.openStream.mockResolvedValueOnce(opened(2))
    const retryBtn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Retry')
    expect(retryBtn).toBeDefined()

    await act(async () => {
      retryBtn?.click()
    })
    await settle()

    expect(currentStore.getStreamFailure(deadChannel.id)).toBeUndefined()
  })
})
