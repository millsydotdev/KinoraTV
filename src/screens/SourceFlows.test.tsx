// @vitest-environment happy-dom
// Click-through tests of the real screens in a DOM, with the native commands mocked. Nothing here
// touches the network or a stream.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toast'
import { IngestError, type PlaylistChannel, type PlaylistReport } from '../lib/native'
import { addressLabel, createSource, type PlaylistSource } from '../state/playlists'
import { StoreProvider } from '../state/store'
import { LiveTV } from './LiveTV'
import { AddSource, Sources } from './Sources'

const native = vi.hoisted(() => ({ fetchPlaylist: vi.fn(), readPlaylistFile: vi.fn() }))
vi.mock('../lib/native', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/native')>()), ...native }))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const SECRET_STREAM = 'http://alice:pw1@provider.example:8080/live/alice/hunter2/1.ts?token=SECRET123'
const SECRETS = ['alice', 'pw1', 'hunter2', 'SECRET123', 'provider.example', '/live/', 'get.php']
const entry = (key: string, name: string, group: string | null = 'News'): PlaylistChannel => ({
  key, tvgId: null, name, group, logo: null, language: null, country: null, chno: null, streamUrl: SECRET_STREAM, streamDisplay: 'http://provider.example:8080/…',
})
const report = (...channels: PlaylistChannel[]): PlaylistReport => ({ channels, skipped: 0, duplicates: 0, warnings: [], host: 'playlists.example' })
const SOURCE_URL = 'https://playlists.example/get.php?password=hunter2'
const seeded = (): PlaylistSource =>
  createSource('pl-seed', { name: 'My lineup', origin: 'url', url: SOURCE_URL, label: addressLabel(SOURCE_URL) }, report(entry('tvg:a', 'Alpha One'), entry('tvg:b', 'Bravo Two')), Date.now())

function deferred<T>() {
  let settle!: { resolve: (v: T) => void; reject: (e: unknown) => void }
  const promise = new Promise<T>((resolve, reject) => { settle = { resolve, reject } })
  return { promise, ...settle }
}

let root: Root
let host: HTMLDivElement
let go: NavigateFunction
function Navigator() {
  go = useNavigate()
  return null
}
async function mount(path: string, playlists: PlaylistSource[] = []) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <StoreProvider initialPlaylists={playlists}>
          <ToastProvider>
            <Navigator />
            <Routes>
              <Route path="/sources" element={<Sources />} />
              <Route path="/sources/add" element={<AddSource />} />
              <Route path="/live" element={<LiveTV />} />
            </Routes>
          </ToastProvider>
        </StoreProvider>
      </MemoryRouter>,
    )
  })
}
const text = () => document.body.textContent ?? ''
const button = (label: string) => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim().includes(label))
  if (!b) throw new Error(`No button "${label}" in: ${text().slice(0, 300)}`)
  return b
}
const click = (el: HTMLElement) => act(async () => { el.click() })
const settle = () => act(async () => { await Promise.resolve() })
async function typeUrl(value: string) {
  const input = document.querySelector<HTMLInputElement>('input[type=url]')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function pickFile(file: File | null) {
  const input = document.querySelector<HTMLInputElement>('input[type=file]')!
  Object.defineProperty(input, 'files', { configurable: true, value: file ? [file] : [] })
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
}
const navigate = (to: string) => act(async () => { go(to) })
const cardNames = () => [...document.querySelectorAll('.channel-wordmark')].map((e) => e.textContent)

beforeEach(() => {
  native.fetchPlaylist.mockReset()
  native.readPlaylistFile.mockReset()
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  document.body.replaceChildren()
})

describe('adding a playlist by address', () => {
  it('shows a loading state, ignores repeat submits, then adds the source with its real count', async () => {
    await mount('/sources/add')
    const pending = deferred<PlaylistReport>()
    native.fetchPlaylist.mockReturnValue(pending.promise)
    await typeUrl('  https://Playlists.Example/list.m3u  ')
    await click(button('Scan & Validate'))

    expect(native.fetchPlaylist).toHaveBeenCalledWith('https://playlists.example/list.m3u')
    const scan = button('Reading playlist…')
    expect(scan.disabled).toBe(true)
    expect(document.querySelector<HTMLInputElement>('input[type=url]')!.disabled).toBe(true)
    expect(button('Import a playlist file').disabled).toBe(true)
    await click(scan)
    await act(async () => { document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(native.fetchPlaylist).toHaveBeenCalledTimes(1)

    await act(async () => { pending.resolve(report(entry('tvg:a', 'Alpha One'), entry('tvg:b', 'Bravo Two', 'Sport;News'))) })
    expect(text()).toContain('Playlist read: 2 channels')
    expect(text()).toContain('Streams have not been playback-tested.')
    await click(button('Continue'))
    expect(text()).toContain('https://playlists.example/…')
    await click(button('Add Source'))

    expect(text()).toContain('Parsed · 2 channels')
    expect(text()).toContain('Streams not playback-tested')
    expect(text()).toContain('Added playlists.example: 2 channels. Streams have not been playback-tested.')
  })

  it('refuses invalid addresses before anything is fetched', async () => {
    await mount('/sources/add')
    await typeUrl('https://alice:hunter2@playlists.example/list.m3u')
    await click(button('Scan & Validate'))
    expect(text()).toContain('Remove the username and password from the address.')
    await typeUrl('ftp://playlists.example/list.m3u')
    await click(button('Scan & Validate'))
    expect(text()).toContain('Use a full address starting with http:// or https://')
    expect(native.fetchPlaylist).not.toHaveBeenCalled()
  })

  it('shows the safe message from Rust, and never the text of an unexpected error', async () => {
    await mount('/sources/add')
    native.fetchPlaylist.mockRejectedValueOnce(new IngestError('blocked', '10.0.0.1 is a local, private or reserved network address.'))
    await typeUrl('http://10.0.0.1/list.m3u')
    await click(button('Scan & Validate'))
    expect(text()).toContain('10.0.0.1 is a local, private or reserved network address.')
    expect(button('Scan & Validate').disabled).toBe(false) // usable again after a failure

    native.fetchPlaylist.mockRejectedValueOnce(new Error(`GET ${SOURCE_URL} failed: ${SECRET_STREAM}`))
    await typeUrl(SOURCE_URL)
    await click(button('Scan & Validate'))
    expect(text()).toContain('Kinora could not read that playlist.')
    const visible = text().replace(document.querySelector<HTMLInputElement>('input[type=url]')!.value, '')
    for (const s of SECRETS) expect(visible).not.toContain(s)
  })
})

describe('importing a playlist file', () => {
  it('does nothing when the file picker is cancelled', async () => {
    await mount('/sources/add')
    await pickFile(null)
    expect(native.readPlaylistFile).not.toHaveBeenCalled()
    expect(text()).toContain('Scan & Validate')
    expect(document.querySelector('.field-error')).toBeNull()
    await navigate('/sources')
    expect(text()).not.toContain('Parsed ·')
  })

  it('reads a picked file through Rust and adds it labelled by file name', async () => {
    await mount('/sources/add')
    native.readPlaylistFile.mockResolvedValue(report(entry('tvg:x', 'Xray Local', null)))
    const file = new File(['#EXTM3U'], 'my lineup.m3u', { type: 'audio/x-mpegurl' })
    await pickFile(file)
    expect(native.readPlaylistFile).toHaveBeenCalledWith(file)
    expect(text()).toContain('Playlist read: 1 channels')
    expect(text()).toContain('including Uncategorised')
    await click(button('Continue'))
    expect(text()).toContain('my lineup.m3u')
    await click(button('Add Source'))
    expect(text()).toContain('my lineup')
    expect(text()).toContain('Parsed · 1 channel')
  })

  it('reports an unreadable file without adding anything', async () => {
    await mount('/sources/add')
    native.readPlaylistFile.mockRejectedValue(new IngestError('hls-media', 'This is an HLS media playlist (video segments of one stream), not a channel list.'))
    await pickFile(new File(['#EXTM3U'], 'segments.m3u8'))
    expect(text()).toContain('This is an HLS media playlist')
    await navigate('/sources')
    expect(text()).not.toContain('segments')
  })
})

describe('refreshing and removing', () => {
  async function openSource() {
    await click(document.querySelector<HTMLElement>('.source-main')!)
    expect(document.querySelector('dialog')?.textContent).toContain('https://playlists.example/…')
  }

  it('refreshes a source and shows the new result', async () => {
    await mount('/sources', [seeded()])
    await openSource()
    const pending = deferred<PlaylistReport>()
    native.fetchPlaylist.mockReturnValue(pending.promise)
    await click(button('Refresh now'))
    expect(native.fetchPlaylist).toHaveBeenCalledWith(SOURCE_URL)
    expect(button('Refreshing…').disabled).toBe(true)
    expect(button('Remove').disabled).toBe(true)
    await act(async () => { pending.resolve(report(entry('tvg:a', 'Alpha One'), entry('tvg:c', 'Charlie Three'), entry('tvg:d', 'Delta Four'))) })
    expect(text()).toContain('Parsed · 3 channels')
    await navigate('/live?view=channels')
    expect(cardNames()).toEqual(['Alpha One', 'Charlie Three', 'Delta Four']) // Bravo Two is gone, nothing duplicated
  })

  it('keeps the last good channels when a refresh fails, and says so', async () => {
    await mount('/sources', [seeded()])
    await openSource()
    native.fetchPlaylist.mockRejectedValue(new IngestError('timeout', 'playlists.example did not send the playlist in time.'))
    await click(button('Refresh now'))
    await settle()
    expect(text()).toContain('Refresh failed · 2 channels kept')
    expect(text()).toContain('playlists.example did not send the playlist in time. The channels from the last successful import are still shown.')
    expect(text()).not.toContain('Parsed ·')
    await navigate('/live?view=channels')
    expect(cardNames()).toEqual(['Alpha One', 'Bravo Two'])
  })

  it('removes a source only after confirmation, and its channels with it', async () => {
    const other = createSource('pl-other', { name: 'Second list', origin: 'file', url: null, label: 'second.m3u' }, report(entry('tvg:z', 'Zulu Extra')), Date.now())
    await mount('/sources', [seeded(), other])
    await openSource()
    await click(button('Remove'))
    expect(text()).toContain('My lineup and its 2 channels will be removed from Live TV, and from your favourites, history and collections.')
    await click(button('Keep it'))
    expect(text()).toContain('My lineup')
    await openSource()
    await click(button('Remove'))
    await click(button('Remove source'))
    expect(text()).toContain('Removed My lineup and its channels')
    expect([...document.querySelectorAll('.source-main strong')].map((e) => e.textContent)).not.toContain('My lineup')
    await navigate('/live?view=channels')
    expect(cardNames()).toEqual(['Zulu Extra'])
  })

  it('restores the demonstration catalogue when the last source is removed', async () => {
    await mount('/sources', [seeded()])
    await openSource()
    await click(button('Remove'))
    await click(button('Remove source'))
    await navigate('/live?view=channels')
    expect(cardNames()).toContain('Northlight One')
    expect(cardNames()).not.toContain('Alpha One')
  })
})

describe('playlist channel links', () => {
  it('following a channel link selects that channel, even with punctuation in its key', async () => {
    const source = createSource('pl-p', { name: 'P', origin: 'file', url: null, label: 'p.m3u' }, report(
      entry('tvg:first', 'First Feed'), entry('tvg:odd:id/with#bits&x=1?y', 'Odd Feed'), entry('name:00ff00ff00ff00ff#2', 'Hash Feed'),
    ), Date.now())
    await mount('/live?view=channels', [source])
    for (const name of ['Odd Feed', 'Hash Feed']) {
      await navigate('/live?view=channels')
      const link = [...document.querySelectorAll<HTMLAnchorElement>('a.channel-card')].find((a) => a.textContent?.includes(name))!
      await click(link) // a card opens the guide with that channel selected
      const watching = [...document.querySelectorAll('.guide-channel-tune[aria-current="true"]')]
      expect(watching).toHaveLength(1)
      expect(watching[0]?.getAttribute('aria-label')).toContain(`${name}, now watching`)
    }
  })
})
