// @vitest-environment happy-dom
// Saved sources across a restart, driven through the real screens with the native commands mocked as
// if inside the desktop app. Each mount is a fresh start: only the mocked Rust store carries over.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toast'
import { IngestError, type PlaylistChannel, type PlaylistReport, type SavedSource } from '../lib/native'
import { StoreProvider } from '../state/store'
import { LiveTV } from './LiveTV'
import { Player } from './Player'
import { Settings } from './Settings'
import { AddSource, Sources } from './Sources'

const native = vi.hoisted(() => ({
  inNativeShell: vi.fn(() => true), loadSources: vi.fn(), saveSources: vi.fn(), fetchPlaylist: vi.fn(), readPlaylistFile: vi.fn(),
  openStream: vi.fn(), closeStream: vi.fn(),
}))
vi.mock('../lib/native', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/native')>()), ...native }))
const fake = vi.hoisted(() => {
  class FakeHls {
    static instances: FakeHls[] = []
    static isSupported = () => true
    static Events = { ERROR: 'hlsError', MANIFEST_PARSED: 'hlsManifestParsed' }
    static ErrorTypes = { MEDIA_ERROR: 'mediaError', NETWORK_ERROR: 'networkError' }
    source: string | null = null
    constructor() { FakeHls.instances.push(this) }
    on() {}
    attachMedia() {}
    loadSource(url: string) { this.source = url }
    destroy() {}
  }
  return { FakeHls }
})
vi.mock('hls.js/light', () => ({ default: fake.FakeHls }))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const SOURCE_URL = 'https://playlists.example/get.php?username=alice&password=hunter2&token=SECRET123'
const STREAM = 'https://cdn.example/live/alice/hunter2/1.m3u8?token=SECRET123'
const SECRETS = ['hunter2', 'SECRET123', 'alice', 'get.php', 'cdn.example']

const savedUrlSource: SavedSource = {
  id: 'pl-url1', name: 'Web lineup', origin: 'url', url: SOURCE_URL, label: 'https://playlists.example/…', addedAt: 1000, lastSuccess: 2000,
  skipped: 0, duplicates: 0, channels: [{ key: 'tvg:one', tvgId: 'one', name: 'Channel One', group: 'News', chno: null }, { key: 'tvg:two', tvgId: 'two', name: 'Channel Two', group: null, chno: null }],
}
const savedFileSource: SavedSource = {
  id: 'pl-file1', name: 'File lineup', origin: 'file', url: null, label: 'lineup.m3u', addedAt: 1000, lastSuccess: 2000,
  skipped: 0, duplicates: 0, channels: [{ key: 'tvg:local', tvgId: 'local', name: 'Local Feed', group: 'Local', chno: null }],
}
const entry = (key: string, name: string, group: string | null = 'News'): PlaylistChannel => ({
  key, tvgId: key.replace('tvg:', ''), name, group, logo: 'https://img.example/l.png?sig=LOGOSIG', language: null, country: null, chno: null, streamUrl: STREAM, streamDisplay: 'https://cdn.example/…',
})
const report = (...channels: PlaylistChannel[]): PlaylistReport => ({ channels, skipped: 0, duplicates: 0, warnings: [], host: 'playlists.example' })
const fresh = report(entry('tvg:one', 'Channel One'), entry('tvg:two', 'Channel Two', null))
const channelId = (sourceId: string, key: string) => `${sourceId}~${key.replace(':', '_3a_')}`

function deferred<T>() {
  let settle!: { resolve: (v: T) => void; reject: (e: unknown) => void }
  const promise = new Promise<T>((resolve, reject) => { settle = { resolve, reject } })
  return { promise, ...settle }
}

let root: Root | null = null
let host: HTMLDivElement
let go: NavigateFunction
function Navigator() {
  go = useNavigate()
  return null
}
async function mount(path: string) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[path]}>
        <StoreProvider>
          <ToastProvider>
            <Navigator />
            <Routes>
              <Route path="/sources" element={<Sources />} />
              <Route path="/sources/add" element={<AddSource />} />
              <Route path="/live" element={<LiveTV />} />
              <Route path="/watch/:ref" element={<Player />} />
              <Route path="/settings/:section" element={<Settings />} />
            </Routes>
          </ToastProvider>
        </StoreProvider>
      </MemoryRouter>,
    )
  })
  await settle()
}
async function unmount() {
  if (!root) return
  await act(async () => root!.unmount())
  root = null
  host.remove()
}
const settle = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve() }) }
const text = () => document.body.textContent ?? ''
const click = (el: Element) => act(async () => { (el as HTMLElement).click() })
const button = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().includes(label))!
const navigate = async (to: string) => { await act(async () => { go(to) }); await settle() }
const cardNames = () => [...document.querySelectorAll('.channel-wordmark')].map((e) => e.textContent)
const lastSave = (): SavedSource[] => native.saveSources.mock.calls.at(-1)?.[0]

beforeEach(() => {
  localStorage.clear()
  for (const fn of Object.values(native)) fn.mockReset()
  native.inNativeShell.mockReturnValue(true)
  native.saveSources.mockResolvedValue(undefined)
  native.loadSources.mockResolvedValue({ sources: [], notice: null })
  native.fetchPlaylist.mockResolvedValue(fresh)
  native.openStream.mockResolvedValue({ url: `kstream://localhost/${'1'.repeat(32)}`, session: 1 })
  native.closeStream.mockResolvedValue(undefined)
  fake.FakeHls.instances = []
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
})
afterEach(async () => {
  await unmount()
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('restoring saved sources at start', () => {
  it('shows nothing until the saved sources are read, so demo channels never flash first', async () => {
    const pending = deferred<{ sources: SavedSource[]; notice: null }>()
    native.loadSources.mockReturnValue(pending.promise)
    await mount('/live?view=channels')
    expect(text()).toBe('')
    await act(async () => { pending.resolve({ sources: [savedFileSource], notice: null }) })
    await settle()
    expect(cardNames()).toEqual(['Local Feed'])
  })

  it('restores sources, then refreshes URL sources once through the guarded fetcher', async () => {
    native.loadSources.mockResolvedValue({ sources: [savedUrlSource, savedFileSource], notice: null })
    const refresh = deferred<PlaylistReport>()
    native.fetchPlaylist.mockReturnValue(refresh.promise)
    await mount('/sources')
    expect(native.fetchPlaylist).toHaveBeenCalledTimes(1)
    expect(native.fetchPlaylist).toHaveBeenCalledWith(SOURCE_URL)
    expect(native.readPlaylistFile).not.toHaveBeenCalled()
    expect(text()).toContain('Importing…') // the URL source is refreshing
    expect(text()).toContain('Saved · 1 channel') // the file source shows its saved list
    await act(async () => { refresh.resolve(fresh) })
    await settle()
    expect(text()).toContain('Parsed · 2 channels')
    for (const s of SECRETS) expect(document.documentElement.outerHTML).not.toContain(s)
  })

  it('a failed startup refresh keeps the saved channels listed and says so', async () => {
    native.loadSources.mockResolvedValue({ sources: [savedUrlSource], notice: null })
    native.fetchPlaylist.mockRejectedValue(new IngestError('network', 'Could not connect to playlists.example.'))
    await mount('/sources')
    expect(text()).toContain('Refresh failed · 2 channels kept')
    await navigate('/live?view=channels')
    expect(cardNames()).toEqual(['Channel One', 'Channel Two'])
  })

  it('keeps favourites and history of playlist channels across a restart', async () => {
    localStorage.setItem('kinora.library.v1', JSON.stringify({ favourites: [`channel:${channelId('pl-file1', 'tvg:local')}`], history: [] }))
    native.loadSources.mockResolvedValue({ sources: [savedFileSource], notice: null })
    await mount('/live?view=channels&group=Favourites')
    expect(cardNames()).toEqual(['Local Feed'])
  })

  it('never mixes demo channels in, and shows the demo catalogue only when nothing is saved', async () => {
    native.loadSources.mockResolvedValue({ sources: [savedFileSource], notice: null })
    await mount('/live?view=channels')
    expect(cardNames()).not.toContain('Northlight One')
    await unmount()
    native.loadSources.mockResolvedValue({ sources: [], notice: null })
    await mount('/live?view=channels')
    expect(cardNames()).toContain('Northlight One')
  })
})

describe('saving', () => {
  it('does not rewrite the file just for restoring it, and saves when a refresh changes it', async () => {
    native.loadSources.mockResolvedValue({ sources: [savedUrlSource], notice: null })
    const refresh = deferred<PlaylistReport>()
    native.fetchPlaylist.mockReturnValue(refresh.promise)
    await mount('/sources')
    expect(native.saveSources).not.toHaveBeenCalled() // restored, then importing: nothing saved has changed
    await act(async () => { refresh.resolve(report(entry('tvg:one', 'Channel One'), entry('tvg:three', 'Channel Three'))) })
    await settle()
    expect(native.saveSources).toHaveBeenCalledTimes(1)
    const [saved] = lastSave()
    expect(saved?.url).toBe(SOURCE_URL)
    expect(saved?.channels.map((c) => c.name)).toEqual(['Channel One', 'Channel Three'])
    const json = JSON.stringify(lastSave())
    for (const s of ['streamUrl', 'cdn.example', 'LOGOSIG', 'logo']) expect(json).not.toContain(s)
  })

  it('saves a newly added source, without its stream addresses', async () => {
    await mount('/sources/add')
    native.readPlaylistFile.mockResolvedValue(report(entry('tvg:x', 'Xray')))
    const input = document.querySelector<HTMLInputElement>('input[type=file]')!
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['#EXTM3U'], 'mine.m3u')] })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    await settle()
    await click(button('Continue'))
    await click(button('Add Source'))
    await settle()
    expect(lastSave()).toHaveLength(1)
    expect(lastSave()[0]).toMatchObject({ origin: 'file', url: null, label: 'mine.m3u', channels: [{ key: 'tvg:x', name: 'Xray' }] })
    expect(JSON.stringify(lastSave())).not.toContain('cdn.example')
  })

  it('removing a source saves without it and drops only its channels from the library', async () => {
    localStorage.setItem('kinora.library.v1', JSON.stringify({
      favourites: [`channel:${channelId('pl-file1', 'tvg:local')}`, `channel:${channelId('pl-url1', 'tvg:one')}`, 'movie:harbour-lights'],
      history: [{ ref: `channel:${channelId('pl-file1', 'tvg:local')}`, at: 1 }],
    }))
    native.loadSources.mockResolvedValue({ sources: [savedUrlSource, savedFileSource], notice: null })
    await mount('/sources')
    native.saveSources.mockClear()
    await click([...document.querySelectorAll('.source-main')].find((b) => b.textContent?.includes('File lineup'))!)
    await click(button('Remove'))
    expect(text()).toContain('and from your favourites, history and collections')
    await click(button('Remove source'))
    await settle()
    expect(lastSave().map((s) => s.id)).toEqual(['pl-url1'])
    const library = JSON.parse(localStorage.getItem('kinora.library.v1') ?? '{}')
    expect(library.favourites).toEqual([`channel:${channelId('pl-url1', 'tvg:one')}`, 'movie:harbour-lights'])
    expect(library.history).toEqual([])
  })

  it('a saved file written by a newer Kinora is left alone: a notice, and no saves', async () => {
    native.loadSources.mockResolvedValue({ sources: [], notice: 'newer-version' })
    await mount('/sources/add')
    native.readPlaylistFile.mockResolvedValue(report(entry('tvg:x', 'Xray')))
    const input = document.querySelector<HTMLInputElement>('input[type=file]')!
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['#EXTM3U'], 'mine.m3u')] })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    await settle()
    await click(button('Continue'))
    await click(button('Add Source'))
    await settle()
    expect(native.saveSources).not.toHaveBeenCalled()
    expect(text()).toContain('written by a newer version of Kinora')
  })

  it('a damaged file that was set aside is reported, and saving works again', async () => {
    native.loadSources.mockResolvedValue({ sources: [], notice: 'recovered' })
    await mount('/sources')
    expect(text()).toContain('It was set aside, not deleted')
  })

  it('reports a failed save', async () => {
    native.loadSources.mockResolvedValue({ sources: [savedUrlSource], notice: null })
    native.saveSources.mockRejectedValue(new IngestError('storage', 'Kinora could not save your sources.'))
    await mount('/sources')
    expect(text()).toContain('Recent changes to your sources could not be saved.')
  })
})

describe('playback after restoring', () => {
  it('a restored channel does not try to play until its source has refreshed, then plays the fresh address', async () => {
    native.loadSources.mockResolvedValue({ sources: [savedUrlSource], notice: null })
    const refresh = deferred<PlaylistReport>()
    native.fetchPlaylist.mockReturnValue(refresh.promise)
    await mount(`/watch/${encodeURIComponent(`channel:${channelId('pl-url1', 'tvg:one')}`)}`)
    expect(text()).toContain('Channel One')
    expect(text()).toContain('Updating this source’s channel list')
    expect(native.openStream).not.toHaveBeenCalled()
    await act(async () => { refresh.resolve(fresh) })
    await settle()
    expect(native.openStream).toHaveBeenCalledWith(STREAM)
    expect(fake.FakeHls.instances.at(-1)?.source).toMatch(/^kstream:\/\/localhost\//)
  })

  it('a restored file channel explains how to play it again', async () => {
    native.loadSources.mockResolvedValue({ sources: [savedFileSource], notice: null })
    await mount(`/watch/${encodeURIComponent(`channel:${channelId('pl-file1', 'tvg:local')}`)}`)
    expect(text()).toContain('Choose the file again in Sources')
    expect(native.openStream).not.toHaveBeenCalled()
  })
})

describe('export', () => {
  it('the data export never contains playlist addresses, tokens or stream addresses', async () => {
    native.loadSources.mockResolvedValue({ sources: [savedUrlSource], notice: null })
    const exported: Blob[] = []
    const create = vi.fn((blob: Blob) => { exported.push(blob); return 'blob:export' })
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() })
    await mount('/settings/data')
    await click(button('Export'))
    expect(exported).toHaveLength(1)
    const json = await exported[0]!.text()
    expect(json).toContain('"prefs"')
    for (const s of [...SECRETS, 'playlists.example']) expect(json).not.toContain(s)
  })
})
