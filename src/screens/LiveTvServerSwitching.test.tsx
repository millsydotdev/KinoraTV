// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toast'
import type { PlaylistChannel, PlaylistReport } from '../lib/native'
import { createSource, type PlaylistSource } from '../state/playlists'
import { StoreProvider } from '../state/store'
import { LiveTV } from './LiveTV'
import { Player } from './Player'

const native = vi.hoisted(() => ({
  openStream: vi.fn(),
  closeStream: vi.fn(),
  testSourceConnection: vi.fn(),
  loadSources: vi.fn(),
  saveSources: vi.fn(),
}))

const fakeHls = vi.hoisted(() => {
  type Handler = (event: string, data: unknown) => void
  class FakeHls {
    static isSupported = () => true
    static Events = {
      MANIFEST_PARSED: 'hlsManifestParsed',
      ERROR: 'hlsError',
      AUDIO_TRACKS_UPDATED: 'hlsAudioTracksUpdated',
      SUBTITLE_TRACKS_UPDATED: 'hlsSubtitleTracksUpdated',
      AUDIO_TRACK_SWITCHED: 'hlsAudioTrackSwitched',
      SUBTITLE_TRACK_SWITCH: 'hlsSubtitleTrackSwitch',
      LEVEL_SWITCHED: 'hlsLevelSwitched',
    }
    static ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError', OTHER_ERROR: 'otherError' }
    static instances: FakeHls[] = []
    handlers = new Map<string, Handler[]>()
    levels: { height: number }[] = [{ height: 720 }, { height: 1080 }]
    currentLevel = 1
    nextLevel = -1
    autoLevelCapping = -1
    autoLevelEnabled = true
    audioTracks: { id: number; name: string; lang?: string }[] = [{ id: 0, name: 'English', lang: 'en' }]
    audioTrack = 0
    subtitleTracks: { id: number; name: string; lang?: string }[] = [{ id: 0, name: 'English CC', lang: 'en' }]
    subtitleTrack = -1
    destroyed = false
    url: string | null = null
    constructor() { FakeHls.instances.push(this) }
    on(event: string, fn: Handler) { this.handlers.set(event, [...(this.handlers.get(event) ?? []), fn]) }
    emit(event: string, data: unknown = {}) { for (const fn of this.handlers.get(event) ?? []) fn(event, data) }
    attachMedia() {}
    loadSource(url: string) { this.url = url }
    recoverMediaError() {}
    destroy() { this.destroyed = true }
  }
  return { FakeHls }
})

vi.mock('../lib/native', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/native')>()),
  ...native,
}))
vi.mock('hls.js', () => ({ default: fakeHls.FakeHls }))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const KSTREAM_1 = `kstream://localhost/${'1'.repeat(32)}`
const KSTREAM_2 = `kstream://localhost/${'2'.repeat(32)}`

const entry = (
  key: string,
  tvgId: string | null,
  name: string,
  group: string,
  streamUrl: string,
  country: string | null = 'UK',
): PlaylistChannel => ({
  key,
  tvgId,
  name,
  group,
  logo: null,
  language: 'en',
  country,
  chno: null,
  streamUrl,
  streamDisplay: 'https://cdn.example/...',
})

const report = (channels: PlaylistChannel[], host = 'cdn.example'): PlaylistReport => ({
  channels,
  skipped: 0,
  duplicates: 0,
  warnings: [],
  host,
})

const sourceUkMain = createSource(
  'pl-uk-main',
  { name: 'Free-TV UK', origin: 'url', url: 'https://example.com/uk1.m3u', label: 'https://example.com/...' },
  report([
    entry('tvg:bbc1', 'BBCOne.uk', 'BBC One HD', 'Entertainment', 'https://uk1.example/bbc1_secret_token.m3u8', 'UK'),
    entry('tvg:bbc1scot', 'BBCOne.uk@Scotland', 'BBC One Scotland HD', 'Regional', 'https://uk1.example/bbc1scot.m3u8', 'UK'),
    entry('tvg:skynews', 'SkyNews.uk', 'Sky News FHD', 'News', 'https://uk1.example/skynews.m3u8', 'UK'),
  ]),
  1000,
)

const sourceUkBackup = createSource(
  'pl-uk-backup',
  { name: 'iptv-org UK', origin: 'url', url: 'https://example.com/uk2.m3u', label: 'https://example.com/...' },
  report([
    entry('tvg:bbc1-alt', 'BBCOne.uk', 'BBC One (720p)', 'General', 'https://uk2.example/bbc1_backup_secret.m3u8', 'UK'),
    entry('tvg:skynews-alt', 'SkyNews.uk', 'Sky News HD', 'News', 'https://uk2.example/skynews_backup.m3u8', 'UK'),
  ]),
  2000,
)

const sourceIntl = createSource(
  'pl-intl',
  { name: 'Global News Feed', origin: 'url', url: 'https://example.com/intl.m3u', label: 'https://example.com/...' },
  report([
    entry('tvg:bbc1-intl', 'BBCOne.uk', 'BBC One SD', 'Entertainment', 'https://intl.example/bbc1_third.m3u8', 'UK'),
    entry('tvg:f24', 'France24.fr', 'France 24 English HD', 'News', 'https://intl.example/f24.m3u8', 'FR'),
  ]),
  3000,
)

let root: Root | null = null
let host: HTMLDivElement | null = null

async function mountApp(initialPath: string, playlists: PlaylistSource[] = [sourceUkMain, sourceUkBackup, sourceIntl]) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[initialPath]}>
        <StoreProvider initialPlaylists={playlists}>
          <ToastProvider>
            <Routes>
              <Route path="/live" element={<LiveTV />} />
              <Route path="/watch/:ref" element={<Player />} />
            </Routes>
          </ToastProvider>
        </StoreProvider>
      </MemoryRouter>,
    )
  })
}

const flush = async () => {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  localStorage.clear()
  fakeHls.FakeHls.instances = []
  native.openStream.mockReset()
  native.closeStream.mockReset().mockResolvedValue(undefined)
  native.testSourceConnection.mockReset()
  native.loadSources.mockReset().mockResolvedValue(null)
  native.saveSources.mockReset().mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
})

afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  root = null
  host?.remove()
  host = null
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('Live TV multi-server organisation and category filtering', () => {
  it('combines identical channels across sources into one canonical entry with server count while keeping regional feeds distinct', async () => {
    await mountApp('/live')
    const rows = [...document.querySelectorAll('.guide-row')]
    // 4 canonical channels: BBC One (3 servers), BBC One Scotland (1 server), Sky News (2 servers), France 24 (1 server)
    expect(rows).toHaveLength(4)

    const bodyText = document.body.textContent ?? ''
    expect(bodyText).toContain('3 servers')
    expect(bodyText).toContain('2 servers')
    expect(bodyText).toContain('BBC One Scotland')
    // Never leaks upstream stream URLs or secret tokens
    expect(bodyText).not.toContain('bbc1_secret_token')
    expect(bodyText).not.toContain('bbc1_backup_secret')
  })

  it('supports switching between provider groups and standard categories, plus country and provider filters', async () => {
    await mountApp('/live?view=channels')

    // Toggle to Standard Categories
    const modeBtn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Provider Groups') || b.textContent?.includes('Standard Categories'),
    )!
    expect(modeBtn).toBeTruthy()
    await act(async () => { modeBtn.click() })

    const chipLabels = [...document.querySelectorAll('.live-chips .chip')].map((c) => c.textContent?.trim())
    expect(chipLabels).toContain('Entertainment')
    expect(chipLabels).toContain('News')
    expect(chipLabels).toContain('Regional')

    // Filter by country (France)
    const countrySelect = document.querySelector<HTMLSelectElement>('select[aria-label="Filter by country"]')!
    expect(countrySelect).toBeTruthy()
    await act(async () => {
      countrySelect.value = 'France'
      countrySelect.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const cardsAfterCountry = [...document.querySelectorAll('.channel-card')]
    expect(cardsAfterCountry).toHaveLength(1)
    expect(cardsAfterCountry[0]?.textContent).toContain('France 24')
  })
})

describe('Full-screen Player multi-server switching, preferred server persistence and automatic fallback', () => {
  const bbcCanonicalId = sourceUkMain.channels[0]!.id

  it('opens the Server Selector, Diagnostics and Quick EPG drawers and switches servers manually', async () => {
    native.openStream
      .mockResolvedValueOnce({ url: KSTREAM_1, session: 1 })
      .mockResolvedValueOnce({ url: KSTREAM_2, session: 2 })

    await mountApp(`/watch/${encodeURIComponent(`channel:${bbcCanonicalId}`)}`)
    await flush()

    expect(native.openStream).toHaveBeenCalledWith('https://uk1.example/bbc1_secret_token.m3u8')

    // Open Server Selector drawer via top bar button or 'S' shortcut
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }))
    })

    const drawer = document.querySelector('[aria-label="Stream Server Selector"]')
    expect(drawer).not.toBeNull()
    expect(drawer?.textContent).toContain('Server 1 - Free-TV UK - United Kingdom - HD')
    expect(drawer?.textContent).toContain('Server 2 - iptv-org UK - United Kingdom - 720p')
    expect(drawer?.textContent).toContain('Server 3 - Global News Feed - United Kingdom - SD')

    // Select Server 2 by clicking its server card
    const serverCards = [...drawer!.querySelectorAll<HTMLElement>('.server-card')]
    expect(serverCards).toHaveLength(3)
    await act(async () => {
      serverCards[1]!.click()
    })
    await flush()

    expect(native.openStream).toHaveBeenLastCalledWith('https://uk2.example/bbc1_backup_secret.m3u8')

    // Open Stream Information & Diagnostics drawer ('I')
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', bubbles: true }))
    })
    const diagDrawer = document.querySelector('[aria-label="Playback Diagnostics and Technical Info"]')
    expect(diagDrawer).not.toBeNull()
    expect(diagDrawer?.textContent).toContain('Detected Playback Metrics')
    expect(diagDrawer?.textContent).toContain('Source & Provider Metadata')
    expect(diagDrawer?.textContent).toContain('3 available servers')

    // Open Quick EPG Schedule drawer ('G')
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }))
    })
    const epgDrawer = document.querySelector('[aria-label="Channel Broadcast Schedule"]')
    expect(epgDrawer).not.toBeNull()
    expect(epgDrawer?.textContent).toContain('Schedule')
  })

  it('persists preferred server selection across player remounts', async () => {
    native.openStream.mockResolvedValue({ url: KSTREAM_2, session: 10 })

    await mountApp(`/watch/${encodeURIComponent(`channel:${bbcCanonicalId}`)}`)
    await flush()

    // Open server drawer and choose Server 2
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }))
    })
    const drawer = document.querySelector('[aria-label="Stream Server Selector"]')!
    const serverCards = [...drawer.querySelectorAll<HTMLElement>('.server-card')]
    await act(async () => {
      serverCards[1]!.click()
    })
    await flush()

    // Unmount and remount Player: should immediately open Server 2 (preferred)
    await act(async () => root!.unmount())
    root = null
    host?.remove()
    native.openStream.mockClear()

    await mountApp(`/watch/${encodeURIComponent(`channel:${bbcCanonicalId}`)}`)
    await flush()
    expect(native.openStream).toHaveBeenCalledTimes(1)
    expect(native.openStream).toHaveBeenCalledWith('https://uk2.example/bbc1_backup_secret.m3u8')
  })

  it('automatically falls back to the next server when playback fails and stops without endless loops', async () => {
    // All 3 servers reject so we verify automatic progression through Server 1 -> Server 2 -> Server 3 and then stopping
    native.openStream.mockRejectedValue(new Error('Upstream stream offline'))

    await mountApp(`/watch/${encodeURIComponent(`channel:${bbcCanonicalId}`)}`)
    await flush()
    await flush()
    await flush()

    expect(native.openStream).toHaveBeenCalledTimes(3)
    expect(native.openStream).toHaveBeenNthCalledWith(1, 'https://uk1.example/bbc1_secret_token.m3u8')
    expect(native.openStream).toHaveBeenNthCalledWith(2, 'https://uk2.example/bbc1_backup_secret.m3u8')
    expect(native.openStream).toHaveBeenNthCalledWith(3, 'https://intl.example/bbc1_third.m3u8')
  })

  it('tests individual stream server availability from the Server Selector drawer', async () => {
    native.openStream.mockResolvedValue({ url: KSTREAM_1, session: 1 })
    native.testSourceConnection.mockResolvedValueOnce({
      ok: true,
      status: 200,
      host: 'uk2.example',
      roundTripMs: 37,
      message: 'Host reachable (HTTP 200 OK)',
      category: 'success',
    })

    await mountApp(`/watch/${encodeURIComponent(`channel:${bbcCanonicalId}`)}`)
    await flush()

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }))
    })
    const drawer = document.querySelector('[aria-label="Stream Server Selector"]')!
    const testBtns = [...drawer.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Test Connection')
    expect(testBtns.length).toBe(3)

    await act(async () => {
      testBtns[1]!.click()
    })
    await flush()

    expect(native.testSourceConnection).toHaveBeenCalledWith('https://uk2.example/bbc1_backup_secret.m3u8')
    expect(drawer.textContent).toContain('37 ms')
  })
})
