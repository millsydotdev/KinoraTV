// @vitest-environment happy-dom
// Playback for playlist channels, driven in a DOM with the native commands and hls.js faked. Media
// events are dispatched by hand: real decoding is covered by the native smoke tests instead.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toast'
import { fromHlsError, levelCap, matchLanguage } from '../lib/playback'
import { IngestError, type OpenedStream, type PlaylistChannel } from '../lib/native'
import { createSource, type PlaylistSource } from '../state/playlists'
import { StoreProvider } from '../state/store'
import { Player } from './Player'

const native = vi.hoisted(() => ({ openStream: vi.fn(), closeStream: vi.fn() }))
vi.mock('../lib/native', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/native')>()), ...native }))

/** Stands in for hls.js: records what the player asks of it and lets tests raise its events. */
const fake = vi.hoisted(() => {
  class FakeHls {
    static instances: FakeHls[] = []
    static isSupported = () => true
    static Events = { ERROR: 'hlsError', MANIFEST_PARSED: 'hlsManifestParsed', AUDIO_TRACKS_UPDATED: 'a', SUBTITLE_TRACKS_UPDATED: 's', AUDIO_TRACK_SWITCHED: 'as', SUBTITLE_TRACK_SWITCH: 'ss', LEVEL_SWITCHED: 'ls' }
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

const UPSTREAM = 'https://cdn.example/live/alice/hunter2/index.m3u8?token=SECRET123'
const SECRETS = ['cdn.example', 'alice', 'hunter2', 'SECRET123', 'index.m3u8']
const entry = (key: string, name: string, streamUrl: string): PlaylistChannel => ({
  key, tvgId: null, name, group: 'News', logo: null, language: null, country: null, chno: null, streamUrl, streamDisplay: 'https://cdn.example/…',
})
const source: PlaylistSource = createSource('pl-a', { name: 'Lineup', origin: 'file', url: null, label: 'l.m3u' }, {
  channels: [entry('tvg:one', 'Channel One', UPSTREAM), entry('tvg:two', 'Channel Two', 'https://cdn.example/two.m3u8?token=SECRET123')],
  skipped: 0, duplicates: 0, warnings: [], host: null,
}, Date.now())
const [one, two] = source.channels as [PlaylistSource['channels'][number], PlaylistSource['channels'][number]]
const watch = (id: string) => `/watch/${encodeURIComponent(`channel:${id}`)}`
const opened = (session: number): OpenedStream => ({ url: `kstream://localhost/${String(session).padStart(32, '0')}`, session })

let root: Root
let host: HTMLDivElement
let go: NavigateFunction
function Navigator() {
  go = useNavigate()
  return null
}
async function mount(path: string, playlists: PlaylistSource[] = [source]) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <StoreProvider initialPlaylists={playlists} initialDemo={playlists.length === 0}>
          <ToastProvider>
            <Navigator />
            <Routes><Route path="/watch/:ref" element={<Player />} /><Route path="*" element={<p>elsewhere</p>} /></Routes>
          </ToastProvider>
        </StoreProvider>
      </MemoryRouter>,
    )
  })
  await settle()
}
/** Lets the open/import promise chain finish. */
const settle = async () => { for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve() }) }
const video = () => document.querySelector<HTMLVideoElement>('video.player-video')!
const media = (name: string) => act(async () => { video().dispatchEvent(new Event(name)) })
const text = () => document.body.textContent ?? ''
const control = (label: string) => document.querySelector<HTMLButtonElement | HTMLInputElement>(`[aria-label="${label}"]`)
const click = (el: HTMLElement) => act(async () => { el.click() })
const latest = () => FakeHls.instances.at(-1)!
/** The Live badge itself: text matching would merge it with the category ("LiveNews"). */
const live = () => document.querySelector('.live-dot') !== null

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
  await act(async () => root.unmount())
  host.remove()
  document.body.replaceChildren()
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('starting playback', () => {
  it('hands the channel’s address to Rust and only the opaque address to hls.js, with workers off', async () => {
    await mount(watch(one.id))
    expect(native.openStream).toHaveBeenCalledWith(UPSTREAM)
    expect(FakeHls.instances).toHaveLength(1)
    expect(latest().source).toBe(opened(1).url)
    expect(latest().media).toBe(video())
    expect(latest().config).toMatchObject({ enableWorker: false })
    expect(text()).toContain('Loading stream…')
    for (const s of SECRETS) expect(document.documentElement.outerHTML).not.toContain(s)
  })

  it('is not “playing” until the media says so', async () => {
    await mount(watch(one.id))
    await act(async () => { latest().emit('hlsManifestParsed') })
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled()
    expect(text()).toContain('Loading stream…')
    expect(live()).toBe(false)
    expect(control('Play, unavailable until the stream loads')?.hasAttribute('disabled')).toBe(true)
    expect(control('Mute')).toBeNull()
    expect(control('Volume')).toBeNull()

    await media('playing')
    expect(text()).not.toContain('Loading stream…')
    expect(live()).toBe(true)
    expect(control('Pause')?.hasAttribute('disabled')).toBe(false)
    expect(control('Mute')).not.toBeNull()
    expect(control('Volume')).not.toBeNull()
    for (const menu of ['Subtitles', 'Audio', 'Quality']) expect(control(menu)).toBeNull()
  })

  it('shows buffering while the media waits for data', async () => {
    await mount(watch(one.id))
    await media('playing')
    await media('waiting')
    expect(text()).toContain('Buffering…')
    expect(live()).toBe(false)
  })
})

describe('controls', () => {
  it('pause and resume act on the real video element', async () => {
    await mount(watch(one.id))
    await media('playing')
    Object.defineProperty(video(), 'paused', { configurable: true, value: false })
    await click(control('Pause') as HTMLButtonElement)
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(1)
    Object.defineProperty(video(), 'paused', { configurable: true, value: true })
    await media('pause')
    expect(text()).toContain('Paused')
    const play = control('Play') as HTMLButtonElement
    expect(play.disabled).toBe(false)
    vi.mocked(HTMLMediaElement.prototype.play).mockClear()
    await click(play)
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)
  })

  it('mute, volume and the M key change the video element itself', async () => {
    await mount(watch(one.id))
    await media('playing')
    await click(control('Mute') as HTMLButtonElement)
    expect(video().muted).toBe(true)
    await media('volumechange')
    expect(control('Unmute')?.getAttribute('aria-pressed')).toBe('true')
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' })) })
    expect(video().muted).toBe(false)
    const slider = control('Volume') as HTMLInputElement
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(slider, '40')
      slider.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(video().volume).toBeCloseTo(0.4)
  })
})

describe('errors and retry', () => {
  it('a recoverable failure offers Retry, which starts a fresh session and releases the old one', async () => {
    native.openStream.mockResolvedValueOnce(opened(1)).mockResolvedValueOnce(opened(2))
    await mount(watch(one.id))
    const first = latest()
    await act(async () => { first.emit('hlsError', { fatal: true, type: 'networkError', details: 'manifestLoadError', response: { code: 504, text: '' } }) })
    expect(text()).toContain('The stream server did not answer in time.')
    await click([...document.querySelectorAll('button')].find((b) => b.textContent === 'Retry')!)
    await settle()
    expect(first.destroyed).toBe(true)
    expect(native.closeStream).toHaveBeenCalledWith(1)
    expect(native.openStream).toHaveBeenCalledTimes(2)
    expect(latest()).not.toBe(first)
    expect(latest().source).toBe(opened(2).url)
    expect(text()).toContain('Loading stream…')
  })

  it('tries one decoder reset before reporting a media error', async () => {
    await mount(watch(one.id))
    await act(async () => { latest().emit('hlsError', { fatal: true, type: 'mediaError', details: 'bufferAppendError' }) })
    expect(latest().recoverMediaError).toHaveBeenCalledTimes(1)
    expect(text()).toContain('Loading stream…')
    await act(async () => { latest().emit('hlsError', { fatal: true, type: 'mediaError', details: 'bufferAppendError' }) })
    expect(text()).toContain('could not be decoded')
  })

  it('ignores non-fatal hls.js errors', async () => {
    await mount(watch(one.id))
    await media('playing')
    await act(async () => { latest().emit('hlsError', { fatal: false, type: 'networkError', details: 'fragLoadError', response: { code: 502 } }) })
    expect(live()).toBe(true)
  })

  it('unsupported streams say why and offer no retry', async () => {
    native.openStream.mockRejectedValueOnce(new IngestError('unsupported-stream', 'This stream is not HLS. Kinora can play HLS streams only so far.'))
    await mount(watch(one.id))
    expect(text()).toContain('This stream is not HLS.')
    expect([...document.querySelectorAll('button')].some((b) => b.textContent === 'Retry')).toBe(false)
    expect(FakeHls.instances).toHaveLength(0)
  })

  it('a stream on a private or local address is refused without naming the host', async () => {
    native.openStream.mockRejectedValueOnce(new IngestError('blocked', '192.168.1.20 is a local, private or reserved network address. Kinora only fetches playlists from public internet addresses.'))
    await mount(watch(one.id))
    expect(text()).toContain('This stream refers to an address Kinora does not fetch from')
    expect(text()).not.toContain('192.168.1.20')
    expect([...document.querySelectorAll('button')].some((b) => b.textContent === 'Retry')).toBe(false)
  })

  it('maps protocol statuses to honest messages without addresses', () => {
    expect(fromHlsError({ type: 'networkError', response: { code: 422 } })).toMatchObject({ status: 'unsupported', canRetry: false })
    expect(fromHlsError({ type: 'networkError', response: { code: 403 } }).message).toContain('local or private network')
    expect(fromHlsError({ type: 'networkError', response: { code: 503 } })).toMatchObject({ status: 'error', canRetry: true })
    expect(fromHlsError({ type: 'otherError' })).toMatchObject({ status: 'error', canRetry: true })
  })

  it('outside the desktop app it says playback needs it', async () => {
    native.openStream.mockResolvedValueOnce(null)
    await mount(watch(one.id))
    expect(text()).toContain('Playback needs the Kinora desktop app.')
  })
})

describe('switching and leaving', () => {
  it('switching channel releases the old session and ignores its late events', async () => {
    native.openStream.mockResolvedValueOnce(opened(1)).mockResolvedValueOnce(opened(2))
    await mount(watch(one.id))
    const first = latest()
    await act(async () => { go(watch(two.id)) })
    await settle()
    expect(first.destroyed).toBe(true)
    expect(native.closeStream).toHaveBeenCalledWith(1)
    expect(native.openStream).toHaveBeenLastCalledWith('https://cdn.example/two.m3u8?token=SECRET123')
    // The previous channel's player fails after it was replaced: nothing on screen may change.
    await act(async () => { first.emit('hlsError', { fatal: true, type: 'networkError', details: 'fragLoadError', response: { code: 502 } }) })
    expect(text()).toContain('Channel Two')
    expect(text()).toContain('Loading stream…')
    expect(text()).not.toContain('could not be reached')
  })

  it('a session that opens after the player moved on is closed and never played', async () => {
    let resolveFirst!: (v: OpenedStream) => void
    native.openStream.mockReturnValueOnce(new Promise((r) => { resolveFirst = r })).mockResolvedValueOnce(opened(2))
    await mount(watch(one.id))
    await act(async () => { go(watch(two.id)) })
    await settle()
    await act(async () => { resolveFirst(opened(1)) })
    await settle()
    expect(native.closeStream).toHaveBeenCalledWith(1)
    expect(FakeHls.instances.map((h) => h.source)).toEqual([opened(2).url])
  })

  it('a late failure from the previous channel does not replace the new channel’s state', async () => {
    let failFirst!: (e: unknown) => void
    native.openStream.mockReturnValueOnce(new Promise((_, reject) => { failFirst = reject })).mockResolvedValueOnce(opened(2))
    await mount(watch(one.id))
    await act(async () => { go(watch(two.id)) })
    await settle()
    await act(async () => { failFirst(new IngestError('unsupported-stream', 'This stream is not HLS. Kinora can play HLS streams only so far.')) })
    await settle()
    expect(text()).toContain('Channel Two')
    expect(text()).toContain('Loading stream…')
    expect(text()).not.toContain('not HLS')
  })

  it('leaving the player preserves playback in the dock; explicit stop destroys hls.js and closes the session', async () => {
    await mount(watch(one.id))
    const player = latest()
    await act(async () => { go('/elsewhere') })
    expect(player.destroyed).toBe(false)
    expect(native.closeStream).not.toHaveBeenCalled()
    expect(text()).toContain('elsewhere')
    expect(document.querySelector('.pip-dock-container.is-docked')).not.toBeNull()

    const closeBtn = document.querySelector<HTMLButtonElement>('button[aria-label="Close player"]')!
    await click(closeBtn)
    expect(player.destroyed).toBe(true)
    expect(native.closeStream).toHaveBeenCalledWith(1)
  })
})

describe('demo channels', () => {
  it('keep their demonstration player and never open a stream', async () => {
    localStorage.setItem('kinora.prefs.v2', JSON.stringify({ demoMode: true }))
    await mount(watch('northlight-one'), [])
    expect(native.openStream).not.toHaveBeenCalled()
    expect(document.querySelector('video')).toBeNull()
    expect(text()).toContain('No stream connected: sample channel.')
    for (const label of ['Mute', 'Volume', 'Subtitles', 'Play, unavailable: no stream connected']) expect(control(label)).not.toBeNull()
  })
})

describe('nothing waits forever', () => {
  const later = (ms: number) => act(async () => { vi.advanceTimersByTime(ms); await Promise.resolve() })
  const useTimers = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('a stream that never starts stops loading, says so, closes its session and can be retried', async () => {
    useTimers()
    await mount(watch(one.id))
    await settle()
    expect(text()).toContain('Loading stream')
    await later(29_000)
    expect(text()).toContain('Loading stream')
    await later(2_000)
    expect(text()).not.toContain('Loading stream')
    expect(text()).toContain('did not start within 30 seconds')
    expect(latest().destroyed).toBe(true)
    expect(native.closeStream).toHaveBeenCalledWith(1)
    expect(live()).toBe(false)
    await click([...document.querySelectorAll('button')].find((b) => b.textContent === 'Retry')!)
    await settle()
    expect(native.openStream).toHaveBeenCalledTimes(2)
  })

  it('without an H.264 decoder it says what to install, sooner', async () => {
    useTimers()
    vi.stubGlobal('MediaSource', { isTypeSupported: (t: string) => !t.includes('avc1') && !t.includes('hvc1') })
    await mount(watch(one.id))
    await settle()
    await later(13_000)
    expect(text()).toContain('gstreamer1-plugin-openh264')
    expect(document.querySelector('.player-status button')).toBeNull() // retrying cannot help
  })

  it('a stream that plays then stalls gives up after 30 seconds, and recovers if media resumes first', async () => {
    useTimers()
    await mount(watch(one.id))
    await settle()
    await media('playing')
    await later(120_000)
    expect(live()).toBe(true) // playing has no time limit
    await media('waiting')
    await later(20_000)
    await media('playing')
    await later(60_000)
    expect(live()).toBe(true)
    await media('waiting')
    await later(31_000)
    expect(text()).toContain('stopped sending video')
    expect(latest().destroyed).toBe(true)
  })

  it('a paused stream never times out', async () => {
    useTimers()
    await mount(watch(one.id))
    await settle()
    await media('playing')
    await media('pause')
    await later(600_000)
    expect(text()).toContain('Paused')
  })

  it('leaving before the timeout cancels it', async () => {
    useTimers()
    await mount(watch(one.id))
    await settle()
    await act(async () => root.unmount())
    await later(60_000)
    await mount(watch(two.id))
    await settle()
    expect(text()).toContain('Loading stream')
  })

  it('an incompatible codec named by hls.js gets the same advice', () => {
    expect(fromHlsError({ type: 'mediaError', details: 'bufferAddCodecError' }).message).toContain('gstreamer1-plugin-openh264')
    expect(fromHlsError({ type: 'networkError', details: 'manifestLoadError', response: { code: 422 } }).status).toBe('unsupported')
  })
})

describe('language and quality choices', () => {
  const tracks = [{ id: 0, label: 'Français', lang: 'fr' }, { id: 1, label: 'English', lang: 'en' }, { id: 2, label: 'Deutsch', lang: 'deu' }]
  it('matches a preferred language by name or code', () => {
    expect(matchLanguage(tracks, 'English')?.id).toBe(1)
    expect(matchLanguage(tracks, 'English (SDH)')?.id).toBe(1)
    expect(matchLanguage(tracks, 'French')?.id).toBe(0)
    expect(matchLanguage(tracks, 'German')?.id).toBe(2)
    expect(matchLanguage(tracks, 'Welsh')).toBeUndefined()
  })
  it('caps quality at the highest level not over the setting', () => {
    const levels = [{ height: 360 }, { height: 720 }, { height: 1080 }]
    expect(levelCap(levels, '720p')).toBe(1)
    expect(levelCap(levels, '2160p')).toBe(2)
    expect(levelCap(levels, '480p')).toBe(0)
    expect(levelCap(levels, 'auto')).toBe(-1)
    expect(levelCap([{ height: 1080 }], '480p')).toBe(-1)
  })

  it('formats level bitrate and names cleanly for player menus', () => {
    const lvl = { id: 1, height: 1080, bitrate: 5_500_000 }
    const mbps = lvl.bitrate ? ` (${(lvl.bitrate / 1_000_000).toFixed(1)} Mbps)` : ''
    expect(`${lvl.height}p${mbps}`).toBe('1080p (5.5 Mbps)')
  })
})

describe('direct media playback', () => {
  it('attaches direct stream url directly to video element without loading hls.js', async () => {
    native.openStream.mockResolvedValueOnce({
      url: 'kstream://localhost/0123456789abcdef0123456789abcdef',
      session: 42,
      format: 'direct',
    })
    await mount(watch(one.id))
    await settle()
    const v = video()
    expect(v).not.toBeNull()
    expect(v?.src).toBe('kstream://localhost/0123456789abcdef0123456789abcdef')
    expect(FakeHls.instances).toHaveLength(0)
  })
})
