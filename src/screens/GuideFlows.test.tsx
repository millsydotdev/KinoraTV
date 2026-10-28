// @vitest-environment happy-dom
// XMLTV guides end to end through the real screens, with the native commands mocked as if inside the
// desktop app: Live TV listings, the player, startup with a slow or unreachable guide, Add Source,
// matching by hand, removal and saving. Times are relative to now; the zone is fixed so the
// clock-change test is deterministic (this file runs in its own process).
process.env.TZ = 'Europe/London'

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toast'
import {
  IngestError, type GuideAnswer, type GuideProgramme, type GuideQuery, type GuideSummary, type PlaylistChannel, type PlaylistReport, type SavedGuide,
  type SavedMapping, type SavedSource, type SavedState,
} from '../lib/native'
import { StoreProvider } from '../state/store'
import { LiveTV } from './LiveTV'
import { Player } from './Player'
import { Settings } from './Settings'
import { AddSource, Sources } from './Sources'

const native = vi.hoisted(() => ({
  inNativeShell: vi.fn(() => true), loadSources: vi.fn(), saveSources: vi.fn(), fetchPlaylist: vi.fn(), readPlaylistFile: vi.fn(),
  openStream: vi.fn(), closeStream: vi.fn(),
  loadGuide: vi.fn(), fetchGuide: vi.fn(), readGuideFile: vi.fn(), guideProgrammes: vi.fn(), guideChannels: vi.fn(), removeGuide: vi.fn(),
}))
vi.mock('../lib/native', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/native')>()), ...native }))
vi.mock('hls.js/light', () => ({
  default: class { static isSupported = () => true; static Events = {}; static ErrorTypes = {}; on() {} attachMedia() {} loadSource() {} destroy() {} },
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const MIN = 60_000
const GUIDE_URL = 'https://guides.example/epg.xml.gz?token=GUIDETOKEN'
const STREAM = 'https://cdn.example/live/1.m3u8?token=STREAMTOKEN'
const SECRETS = ['GUIDETOKEN', 'STREAMTOKEN', 'cdn.example', 'epg.xml.gz']

const playlist: SavedSource = {
  id: 'pl-url1', name: 'Web lineup', origin: 'url', url: 'https://playlists.example/list.m3u', label: 'https://playlists.example/…', addedAt: 1000, lastSuccess: 2000,
  skipped: 0, duplicates: 0, channels: [
    { key: 'tvg:one', tvgId: 'One.uk', name: 'Channel One', group: 'News', chno: 1 },
    { key: 'tvg:gone', tvgId: 'gone.uk', name: 'Gone Channel', group: 'News', chno: 2 },
    { key: 'name:abc#1', tvgId: null, name: 'No Id Channel', group: 'News', chno: 3 },
  ],
}
const savedGuide: SavedGuide = {
  id: 'gd-g1', name: 'UK guide', origin: 'url', url: GUIDE_URL, label: 'https://guides.example/…', addedAt: 1000, lastSuccess: 2000, playlists: ['pl-url1'],
}
const channelId = (key: string) => `pl-url1~${key.replace(':', '_3a_').replace('#', '_23_')}`
const entry = (key: string, tvgId: string | null, name: string): PlaylistChannel => ({
  key, tvgId, name, group: 'News', logo: null, language: null, country: null, chno: null, streamUrl: STREAM, streamDisplay: 'https://cdn.example/…',
})
const fresh: PlaylistReport = {
  channels: [entry('tvg:one', 'One.uk', 'Channel One'), entry('tvg:gone', 'gone.uk', 'Gone Channel'), entry('name:abc#1', null, 'No Id Channel')],
  skipped: 0, duplicates: 0, warnings: [], host: 'playlists.example',
}

let now = Date.now()
const show = (title: string, from: number, to: number, extra: Partial<GuideProgramme> = {}): GuideProgramme =>
  ({ channel: '', start: now + from * MIN, stop: now + to * MIN, stopEstimated: false, title, subtitle: null, desc: null, category: null, episode: null, ...extra })
/** The guide's channels by normalised id, as Rust would match them. */
let listings: Record<string, { id: string; programmes: GuideProgramme[] }> = {}
const summary = (over: Partial<GuideSummary> = {}): GuideSummary =>
  ({ channels: 2, programmes: 3, first: now - 90 * MIN, last: now + 90 * MIN, fetchedAt: 5000, skipped: 0, duplicates: 0, warnings: [], ...over })
const answerWith = (titleOf: (p: GuideProgramme) => string) => async (queries: GuideQuery[], from: number, to: number): Promise<GuideAnswer[]> => queries.map((q) => ({
  guide: q.guide,
  loaded: true,
  matches: q.ids.map((id) => ({ id, channel: listings[id.trim().toLowerCase()]?.id ?? null })),
  programmes: q.ids.flatMap((id) => {
    const ch = listings[id.trim().toLowerCase()]
    return ch ? ch.programmes.filter((p) => p.stop > from && p.start < to).map((p) => ({ ...p, channel: ch.id, title: titleOf(p) })) : []
  }),
}))

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
const settle = async () => { for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve() }) }
const text = () => document.body.textContent ?? ''
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click() }); await settle() }
const button = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().includes(label))!
const navigate = async (to: string) => { await act(async () => { go(to) }); await settle() }
const typeInto = async (el: HTMLInputElement, value: string) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
const row = (name: string) => [...document.querySelectorAll('.guide-row')].find((r) => r.textContent?.includes(name))!
const lastState = (): SavedState => native.saveSources.mock.calls.at(-1)?.[0]
const loaded = (guides: SavedGuide[] = [savedGuide], mappings: SavedMapping[] = []) => ({ sources: [playlist], guides, mappings, notice: null })
const openSource = (name: string) => click([...document.querySelectorAll('.source-main')].find((b) => b.textContent?.includes(name))!)

beforeEach(() => {
  now = Date.now()
  listings = {
    'one.uk': { id: 'One.uk', programmes: [
      show('Earlier Show', -90, -30),
      show('Current Show', -30, 30, { subtitle: 'Midday edition', desc: 'The headlines, then the weather.', category: 'News', episode: 'S2 E5' }),
      show('Next Show', 30, 90, { stopEstimated: true }),
    ] },
  }
  localStorage.clear()
  for (const fn of Object.values(native)) fn.mockReset()
  native.inNativeShell.mockReturnValue(true)
  native.saveSources.mockResolvedValue(undefined)
  native.loadSources.mockResolvedValue(loaded())
  native.fetchPlaylist.mockResolvedValue(fresh)
  native.loadGuide.mockResolvedValue(summary())
  native.fetchGuide.mockResolvedValue(summary({ fetchedAt: 6000 }))
  native.guideProgrammes.mockImplementation(answerWith((p) => p.title))
  native.guideChannels.mockResolvedValue([{ id: 'One.uk', name: 'One' }, { id: 'Gone.Real', name: 'Gone (real id)' }])
  native.removeGuide.mockResolvedValue(undefined)
  native.openStream.mockResolvedValue({ url: `kstream://localhost/${'1'.repeat(32)}`, session: 1 })
  native.closeStream.mockResolvedValue(undefined)
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
})
afterEach(async () => {
  await unmount()
  document.body.replaceChildren()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Live TV with a guide', () => {
  it('lists real programmes for matched channels, marks only the one airing now, and labels the rest honestly', async () => {
    await mount('/live')
    const one = row('Channel One')
    const current = [...one.querySelectorAll('.prog')].find((p) => p.textContent?.includes('Current Show'))!
    expect(current.className).toContain('is-now')
    expect(current.getAttribute('aria-label')).toMatch(/, on now$/)
    const next = [...one.querySelectorAll('.prog')].find((p) => p.textContent?.includes('Next Show'))!
    expect(next.className).not.toContain('is-now')
    expect(next.getAttribute('aria-label')).not.toContain('on now')
    expect([...one.querySelectorAll('.prog')].find((p) => p.textContent?.includes('Earlier Show'))?.className).toContain('is-past')
    expect(row('Gone Channel').textContent).toContain('Not found in its guide; match it in Sources')
    expect(row('No Id Channel').textContent).toContain('No guide id; match it in Sources')
    expect(text()).toContain('programmes from your XMLTV guides, shown in your local time')
    expect(text()).toContain('Now Playing: Channel One - Current Show')
    for (const s of SECRETS) expect(document.documentElement.outerHTML).not.toContain(s)
  })

  it('a programme opens its details, and the channel opens in the player', async () => {
    await mount('/live')
    await click([...row('Channel One').querySelectorAll('.prog')].find((p) => p.textContent?.includes('Current Show'))!)
    expect(text()).toContain('Midday edition')
    expect(text()).toContain('The headlines, then the weather.')
    expect(text()).toContain('S2 E5')
    await click([...row('Channel One').querySelectorAll('.prog')].find((p) => p.textContent?.includes('Next Show'))!)
    expect(text()).toContain('The guide gives no end time; this is when the next programme starts.')
    await click([...row('Channel One').querySelectorAll('.prog')].find((p) => p.textContent?.includes('Current Show'))!)
    const open = [...document.querySelectorAll('a')].find((a) => a.textContent?.includes('Open player'))!
    expect(open.getAttribute('href')).toBe(`/watch/${encodeURIComponent(`channel:${channelId('tvg:one')}`)}`)
    await navigate(open.getAttribute('href')!)
    expect(text()).toContain('Current Show · until')
    expect(native.openStream).toHaveBeenCalledWith(STREAM)
  })

  it('channels view and other days use the same guide data', async () => {
    await mount('/live?view=channels')
    expect(text()).toContain('Current Show')
    await unmount()
    await mount('/live')
    const days = native.guideProgrammes.mock.calls.length
    // Today and tomorrow are always loaded; the day after is asked for when shown.
    for (let i = 0; i < 2; i++) await click(document.querySelector('[aria-label="Next day"]')!)
    expect(native.guideProgrammes.mock.calls.length).toBe(days + 1)
    expect(row('Channel One').textContent).toContain('No listings in this period')
  })

  it('a day with a clock change is 25 hours long and programmes crossing midnight are cut at the edge', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.UTC(2026, 9, 25, 10) }) // the UK clocks went back at 01:00 UTC
    now = Date.now()
    // 22:00 to 00:00 UTC is 23:00 to 01:00 BST: it starts before local midnight (23:00 UTC) and ends after it.
    listings = { 'one.uk': { id: 'One.uk', programmes: [show('Late Film', -12 * 60, -10 * 60)] } }
    await mount('/live')
    expect(document.querySelectorAll('.guide-ticks .tick')).toHaveLength(50)
    const film = [...row('Channel One').querySelectorAll('.prog')].find((p) => p.textContent?.includes('Late Film')) as HTMLElement
    expect(film.style.left).toBe('0px')
  })
})

describe('startup', () => {
  it('a slow guide does not hold the app: cached programmes show while it updates', async () => {
    native.fetchGuide.mockReturnValue(new Promise(() => {}))
    await mount('/live?view=channels')
    expect(text()).toContain('Current Show')
    await navigate('/sources')
    expect(text()).toContain('Updating guide…')
  })

  it('an unreachable guide keeps its last programmes and says the refresh failed', async () => {
    native.fetchGuide.mockRejectedValue(new IngestError('network', 'Could not connect to guides.example.'))
    await mount('/sources')
    expect(native.fetchGuide).toHaveBeenCalledWith('gd-g1', GUIDE_URL)
    expect(text()).toContain('Refresh failed · 3 programmes kept')
    await openSource('UK guide')
    expect(text()).toContain('Could not connect to guides.example. The programmes from the last successful update are still shown.')
    await navigate('/live')
    expect(row('Channel One').textContent).toContain('Current Show')
  })

  it('an answer to an older question never replaces a newer one', async () => {
    const stale = [deferred<GuideAnswer[]>(), deferred<GuideAnswer[]>()]
    const refresh = deferred<GuideSummary>()
    native.fetchGuide.mockReturnValue(refresh.promise)
    native.guideProgrammes.mockImplementationOnce(() => stale[0]!.promise).mockImplementationOnce(() => stale[1]!.promise)
    await mount('/live')
    native.guideProgrammes.mockImplementation(answerWith((p) => `New ${p.title}`))
    await act(async () => { refresh.resolve(summary({ fetchedAt: 7000 })) })
    await settle()
    const old = answerWith((p) => `Old ${p.title}`)
    await act(async () => { for (const d of stale) d.resolve(await old([{ guide: 'gd-g1', ids: ['One.uk'] }], now - 86_400_000, now + 86_400_000)) })
    await settle()
    expect(row('Channel One').textContent).toContain('New Current Show')
    expect(text()).not.toContain('Old ')
  })
})

describe('adding a guide', () => {
  const chooseGuideType = () => click(button('XMLTV Guide'))

  it('by address: read through Rust under its own id, matched, associated and saved without programmes', async () => {
    native.loadSources.mockResolvedValue(loaded([]))
    await mount('/sources/add')
    await chooseGuideType()
    expect(text()).toContain('Paste a guide URL')
    await typeInto(document.querySelector<HTMLInputElement>('input[type=url]')!, GUIDE_URL)
    await click(button('Scan & Validate'))
    const [id, url] = native.fetchGuide.mock.calls[0] ?? []
    expect(id).toMatch(/^gd-[a-z0-9-]+$/)
    expect(url).toBe(GUIDE_URL)
    expect(text()).toContain('Guide read: 2 channels, 3 programmes')
    expect(text()).toContain('1 of 2 guide ids in your playlists are in this guide')
    expect(text()).toContain('Icons and links in the guide are not downloaded.')
    await typeInto(document.querySelector<HTMLInputElement>('.add-form input.input')!, 'My guide')
    await click(button('Continue'))
    expect(text()).toContain('Web lineup')
    await click([...document.querySelectorAll('.add-actions button')].find((b) => b.textContent?.includes('Add Source'))!)
    const saved = lastState()
    expect(saved.guides).toEqual([expect.objectContaining({ id, name: 'My guide', origin: 'url', url: GUIDE_URL, playlists: ['pl-url1'] })])
    expect(JSON.stringify(saved)).not.toMatch(/Current Show|programmes":/)
    expect(native.removeGuide).not.toHaveBeenCalledWith(id)
    expect(text()).toContain('My guide')
  })

  it('a guide read but not added is forgotten by Rust', async () => {
    native.loadSources.mockResolvedValue(loaded([]))
    await mount('/sources/add')
    await chooseGuideType()
    await typeInto(document.querySelector<HTMLInputElement>('input[type=url]')!, GUIDE_URL)
    await click(button('Scan & Validate'))
    const [id] = native.fetchGuide.mock.calls[0] ?? []
    await navigate('/sources')
    expect(native.removeGuide).toHaveBeenCalledWith(id)
    expect(native.saveSources.mock.calls.every(([saved]) => (saved as SavedState).guides.length === 0)).toBe(true)
  })

  it('from a file: the file goes to Rust (never a path), and errors are shown as Rust wrote them', async () => {
    native.loadSources.mockResolvedValue(loaded([]))
    native.readGuideFile.mockRejectedValueOnce(new IngestError('not-guide', 'The guide declares its own XML entities, which Kinora does not allow.'))
    await mount('/sources/add')
    await chooseGuideType()
    const input = document.querySelector<HTMLInputElement>('input[type=file]')!
    expect(input.accept).toContain('.gz')
    const file = new File(['<tv/>'], 'uk-guide.xml.gz')
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    await settle()
    expect(text()).toContain('The guide declares its own XML entities, which Kinora does not allow.')
    native.readGuideFile.mockResolvedValueOnce(summary())
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    await settle()
    const [id, sent] = native.readGuideFile.mock.calls.at(-1) ?? []
    expect(id).toMatch(/^gd-/)
    expect(sent).toBe(file)
    expect((document.querySelector<HTMLInputElement>('.add-form input.input'))?.value).toBe('uk-guide')
  })
})

describe('managing a guide', () => {
  it('matching a channel by hand: searched, chosen, saved and used', async () => {
    listings['gone.real'] = { id: 'Gone.Real', programmes: [show('Found Show', -10, 50)] }
    await mount('/sources')
    await openSource('UK guide')
    expect(text()).toContain('1 of 3 channels matched to this guide by guide id')
    expect(text()).toContain('2 not matched, so they show no programmes')
    const goneRow = [...document.querySelectorAll('.guide-missing li')].find((l) => l.textContent?.includes('Gone Channel'))!
    expect(goneRow.textContent).toContain('Its guide id is not in this guide')
    await click([...goneRow.querySelectorAll('button')].find((b) => b.textContent?.includes('Match by hand'))!)
    expect(native.guideChannels).toHaveBeenCalledWith('gd-g1')
    expect(document.querySelectorAll('.match-picker li')).toHaveLength(2) // nothing is suggested from the name: the list starts unfiltered
    await typeInto(document.querySelector<HTMLInputElement>('.match-picker input')!, 'gone')
    expect(document.querySelectorAll('.match-picker li')).toHaveLength(1)
    await click(document.querySelector('.match-picker li button')!)
    expect(lastState().mappings).toEqual([{ channel: channelId('tvg:gone'), guide: 'gd-g1', xmltvId: 'Gone.Real' }])
    expect(text()).toContain('Matched by hand to Gone.Real')
    await navigate('/live')
    expect(row('Gone Channel').textContent).toContain('Found Show')
  })

  it('choosing which playlists use a guide is saved', async () => {
    await mount('/sources')
    await openSource('UK guide')
    await click(document.querySelector('[aria-label="Use UK guide for Web lineup"]')!)
    expect(lastState().guides[0]?.playlists).toEqual([])
    await navigate('/live')
    expect(row('Channel One').textContent).toContain('No guide for this playlist')
  })

  it('removing a guide forgets its programmes and hand matches, and nothing else', async () => {
    native.loadSources.mockResolvedValue(loaded([savedGuide], [{ channel: channelId('tvg:gone'), guide: 'gd-g1', xmltvId: 'Gone.Real' }]))
    localStorage.setItem('kinora.library.v1', JSON.stringify({ favourites: [`channel:${channelId('tvg:one')}`], history: [] }))
    await mount('/sources')
    await openSource('UK guide')
    await click(button('Remove'))
    expect(text()).toContain('Your channels, favourites and history are not affected.')
    await click(button('Remove source'))
    expect(native.removeGuide).toHaveBeenCalledWith('gd-g1')
    expect(lastState()).toMatchObject({ guides: [], mappings: [], sources: [expect.objectContaining({ id: 'pl-url1' })] })
    expect(JSON.parse(localStorage.getItem('kinora.library.v1') ?? '{}').favourites).toEqual([`channel:${channelId('tvg:one')}`])
  })

  it('removing a playlist takes it out of its guides and drops its hand matches', async () => {
    native.loadSources.mockResolvedValue(loaded([savedGuide], [{ channel: channelId('tvg:gone'), guide: 'gd-g1', xmltvId: 'Gone.Real' }]))
    await mount('/sources')
    await openSource('Web lineup')
    await click(button('Remove'))
    await click(button('Remove source'))
    expect(lastState()).toEqual({ sources: [], guides: [expect.objectContaining({ id: 'gd-g1', playlists: [] })], mappings: [] })
  })

  it('the data export holds no guide address or token', async () => {
    const exported: Blob[] = []
    Object.assign(URL, { createObjectURL: vi.fn((b: Blob) => { exported.push(b); return 'blob:x' }), revokeObjectURL: vi.fn() })
    await mount('/settings/data')
    await click(button('Export'))
    const json = await exported[0]!.text()
    for (const s of [...SECRETS, 'guides.example']) expect(json).not.toContain(s)
  })
})
