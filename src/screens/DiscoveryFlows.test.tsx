// @vitest-environment happy-dom
// Discovery end to end through the real screens, with the native commands mocked as if inside the
// desktop app: browsing the catalogue, offline and stale copies, and explicit import through the
// ordinary guarded playlist import.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toast'
import { IngestError, type Catalogue, type CatalogueEntry, type PlaylistChannel, type PlaylistReport, type SavedSource, type SavedState } from '../lib/native'
import { StoreProvider } from '../state/store'
import { LiveTV } from './LiveTV'
import { Sources } from './Sources'

const native = vi.hoisted(() => ({
  inNativeShell: vi.fn(() => true), loadSources: vi.fn(), saveSources: vi.fn(), fetchPlaylist: vi.fn(), readPlaylistFile: vi.fn(),
  loadGuide: vi.fn(), fetchGuide: vi.fn(), guideProgrammes: vi.fn(), loadCatalogue: vi.fn(), refreshCatalogue: vi.fn(),
}))
vi.mock('../lib/native', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/native')>()), ...native }))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const DAY = 86_400_000
const STREAM = 'https://cdn.example/live/1.m3u8?token=STREAMTOKEN'
const entry = (kind: CatalogueEntry['kind'], folder: string, code: string, name: string, extra: Partial<CatalogueEntry> = {}): CatalogueEntry => ({
  id: `${folder}/${code}`, kind, code, name, flag: null, parent: null, channels: null, url: `https://iptv-org.github.io/iptv/${folder}/${code}.m3u`, ...extra,
})
const UK = entry('country', 'countries', 'uk', 'United Kingdom', { flag: '🇬🇧' })
const entries = [
  UK, entry('country', 'countries', 'ci', 'Côte d’Ivoire'), entry('country', 'countries', 'al', 'Albania'),
  entry('subdivision', 'subdivisions', 'al-04', 'Fier', { parent: 'countries/al' }),
  entry('language', 'languages', 'eng', 'English', { channels: 3016 }),
  entry('category', 'categories', 'news', 'News', { channels: 1049 }),
]
const catalogue = (fetchedAt = Date.now(), list = entries): Catalogue => ({ fetchedAt, entries: list, skipped: 0 })
const channel = (key: string, name: string): PlaylistChannel => ({
  key, tvgId: null, name, group: 'News', logo: null, language: null, country: null, chno: null, streamUrl: STREAM, streamDisplay: 'https://cdn.example/…',
})
const report: PlaylistReport = { channels: [channel('name:1', 'BBC Test'), channel('name:2', 'ITV Test')], skipped: 1, duplicates: 0, warnings: [], host: 'iptv-org.github.io' }
const saved: SavedSource = {
  id: 'pl-mine', name: 'My lineup', origin: 'url', url: 'https://playlists.example/list.m3u', label: 'https://playlists.example/…', addedAt: 1, lastSuccess: 1,
  skipped: 0, duplicates: 0, channels: [{ key: 'name:x', tvgId: null, name: 'Mine One', group: null, chno: null }],
}

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
              <Route path="/live" element={<LiveTV />} />
            </Routes>
          </ToastProvider>
        </StoreProvider>
      </MemoryRouter>,
    )
  })
  await settle()
}
const settle = async () => { for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve() }) }
const text = () => document.body.textContent ?? ''
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click() }); await settle() }
const button = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim().includes(label))!
const navigate = async (to: string) => { await act(async () => { go(to) }); await settle() }
const rows = () => [...document.querySelectorAll('.discovery .source-row strong')].map((e) => e.textContent)
const search = (value: string) => act(async () => {
  const el = document.querySelector<HTMLInputElement>('.catalogue-search input')!
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
const openEntry = (name: string) => click([...document.querySelectorAll('.discovery .source-main')].find((b) => b.querySelector('strong')?.textContent === name)!)
const lastState = (): SavedState => native.saveSources.mock.calls.at(-1)?.[0]

beforeEach(() => {
  localStorage.clear()
  for (const fn of Object.values(native)) fn.mockReset()
  native.inNativeShell.mockReturnValue(true)
  native.loadSources.mockResolvedValue({ sources: [saved], guides: [], mappings: [], notice: null })
  native.saveSources.mockResolvedValue(undefined)
  native.fetchPlaylist.mockImplementation(async (url: string) => (url === saved.url ? { ...report, channels: [channel('name:x', 'Mine One')] } : report))
  native.loadGuide.mockResolvedValue(null)
  native.guideProgrammes.mockResolvedValue([])
  native.loadCatalogue.mockResolvedValue(catalogue())
  native.refreshCatalogue.mockResolvedValue(catalogue())
})
afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  root = null
  document.body.replaceChildren()
})

describe('browsing', () => {
  it('nothing is fetched from the catalogue until Discovery is opened', async () => {
    await mount('/sources')
    expect(native.loadCatalogue).not.toHaveBeenCalled()
    expect(native.refreshCatalogue).not.toHaveBeenCalled()
    await navigate('/sources?tab=discovery')
    expect(native.loadCatalogue).toHaveBeenCalledTimes(1)
    expect(native.refreshCatalogue).not.toHaveBeenCalled() // the cached copy is fresh
  })

  it('lists countries first, filters by kind, and searches names and codes without accents', async () => {
    await mount('/sources?tab=discovery')
    expect(text()).toContain('iptv-org')
    expect(text()).toContain('does not run, check or endorse')
    // The desktop app has no way to open an outside address, so the credit is text, not a dead link.
    expect(document.querySelector('.discovery .demo-note a')).toBeNull()
    expect(text()).toContain('github.com/iptv-org/iptv')
    expect(rows()).toEqual(['United Kingdom', 'Côte d’Ivoire', 'Albania'])
    await search('cote')
    expect(rows()).toEqual(['Côte d’Ivoire'])
    await search('zzz')
    expect(text()).toContain('No countries match “zzz”.')
    await search('')
    await click(button('Languages'))
    expect(rows()).toEqual(['English'])
    expect(text()).toContain('3016 channels listed by iptv-org')
    await click(button('Local areas'))
    expect(text()).toContain('Area playlist · Albania')
  })

  it('shows a large catalogue a page at a time', async () => {
    const many = Array.from({ length: 5000 }, (_, i) => entry('city', 'cities', `c${i}`, `Town ${i}`))
    native.loadCatalogue.mockResolvedValue(catalogue(Date.now(), many))
    await mount('/sources?tab=discovery')
    await click(button('Local areas'))
    expect(text()).toContain('5000 playlists')
    expect(document.querySelectorAll('.discovery .source-row')).toHaveLength(50)
    await click(button('Show 50 more of 4950'))
    expect(document.querySelectorAll('.discovery .source-row')).toHaveLength(100)
  })

  it('every entry is a labelled button, and the search box has a label', async () => {
    await mount('/sources?tab=discovery')
    const first = document.querySelector('.discovery .source-main')!
    expect(first.tagName).toBe('BUTTON')
    expect(first.getAttribute('aria-label')).toBe('United Kingdom, Country playlist. Open details')
    expect(document.querySelector('.catalogue-search')?.textContent).toContain('Search the catalogue')
  })
})

describe('freshness and failures', () => {
  it('an out-of-date copy is shown at once and updated', async () => {
    const update = deferred<Catalogue>()
    native.loadCatalogue.mockResolvedValue(catalogue(Date.now() - 3 * DAY))
    native.refreshCatalogue.mockReturnValue(update.promise)
    await mount('/sources?tab=discovery')
    expect(rows()).toContain('United Kingdom')
    expect(text()).toContain('Checking for an updated catalogue…')
    expect(button('Check for updates').disabled).toBe(true)
    await act(async () => { update.resolve(catalogue(Date.now(), [...entries, entry('country', 'countries', 'fr', 'France')])) })
    await settle()
    expect(rows()).toContain('France')
    expect(text()).not.toContain('out of date')
  })

  it('offline with a cached copy: the copy stays, says why, and can be retried', async () => {
    native.loadCatalogue.mockResolvedValue(catalogue(Date.now() - 3 * DAY))
    native.refreshCatalogue.mockRejectedValueOnce(new IngestError('network', 'Could not connect to raw.githubusercontent.com.'))
    await mount('/sources?tab=discovery')
    expect(rows()).toContain('United Kingdom')
    expect(text()).toContain('Could not connect to raw.githubusercontent.com. The copy fetched 3 days ago is shown.')
    expect(text()).toContain('so it may be out of date')
    await click(button('Check for updates'))
    expect(text()).not.toContain('Could not connect')
    expect(native.refreshCatalogue).toHaveBeenCalledTimes(2)
  })

  it('offline with no copy: says it is unavailable, keeps everything else, and retries', async () => {
    native.loadCatalogue.mockResolvedValue(null)
    native.refreshCatalogue.mockRejectedValueOnce(new IngestError('not-catalogue', 'The catalogue could not be read. Its format may have changed; your sources are not affected.'))
    await mount('/sources?tab=discovery')
    expect(text()).toContain('The catalogue is not available')
    expect(text()).toContain('Your sources, guides and favourites are not affected.')
    await click(button('Try again'))
    expect(rows()).toContain('United Kingdom')
    await navigate('/sources')
    expect(text()).toContain('My lineup')
    await navigate('/live?view=channels')
    expect(text()).toContain('Mine One')
  })
})

describe('adding a catalogue playlist', () => {
  it('reads it through the guarded import, previews Kinora’s own result, and adds it as an ordinary source', async () => {
    await mount('/sources?tab=discovery')
    await openEntry('United Kingdom')
    expect(text()).toContain('Not stated by iptv-org')
    expect(text()).toContain('public domain (Unlicense)')
    expect(native.fetchPlaylist).not.toHaveBeenCalledWith(UK.url)
    await click(button('Read this playlist'))
    expect(native.fetchPlaylist).toHaveBeenCalledWith(UK.url)
    expect(text()).toContain('Kinora read the playlist: 2 channels')
    expect(text()).toContain('1 malformed entry was skipped')
    expect(document.querySelector<HTMLInputElement>('.validate-box input')?.value).toBe('iptv-org · United Kingdom')
    await click(button('Add to my sources'))
    expect(lastState().sources).toEqual([
      expect.objectContaining({ id: 'pl-mine' }),
      expect.objectContaining({ name: 'iptv-org · United Kingdom', origin: 'url', url: UK.url, label: 'https://iptv-org.github.io/…', channels: [expect.objectContaining({ name: 'BBC Test' }), expect.objectContaining({ name: 'ITV Test' })] }),
    ])
    expect(JSON.stringify(lastState())).not.toContain('STREAMTOKEN')
    expect(text()).toContain('Added as iptv-org · United Kingdom')
    expect(native.fetchGuide).not.toHaveBeenCalled()
    for (const s of ['STREAMTOKEN', 'cdn.example']) expect(document.documentElement.outerHTML).not.toContain(s)
    await navigate('/sources')
    expect(text()).toContain('iptv-org · United Kingdom')
    expect(text()).toContain('Parsed · 2 channels')
  })

  it('an entry already added (same address) offers no second import; a same-named source elsewhere is not a duplicate', async () => {
    native.loadSources.mockResolvedValue({
      sources: [saved, { ...saved, id: 'pl-uk', name: 'iptv-org · United Kingdom', url: UK.url, label: 'https://iptv-org.github.io/…' }], guides: [], mappings: [], notice: null,
    })
    native.loadCatalogue.mockResolvedValue(catalogue(Date.now(), [...entries, entry('country', 'countries', 'my', 'My lineup')]))
    await mount('/sources?tab=discovery')
    const ukRow = [...document.querySelectorAll('.discovery .source-row')].find((r) => r.textContent?.includes('United Kingdom'))!
    expect(ukRow.textContent).toContain('Added')
    await openEntry('United Kingdom')
    expect(text()).toContain('Added as iptv-org · United Kingdom')
    expect([...document.querySelectorAll('button')].some((b) => b.textContent?.includes('Read this playlist'))).toBe(false)
    await act(async () => { (document.querySelector('dialog[open] [aria-label="Close"]') as HTMLElement).click() })
    await openEntry('My lineup')
    expect(text()).not.toContain('Added as')
    await click(button('Read this playlist'))
    expect(document.querySelector<HTMLInputElement>('.validate-box input')?.value).toBe('iptv-org · My lineup')
  })

  it('a read can be cancelled; its late result is ignored', async () => {
    const slow = deferred<PlaylistReport>()
    native.fetchPlaylist.mockImplementation((url: string) => (url === UK.url ? slow.promise : Promise.resolve(report)))
    await mount('/sources?tab=discovery')
    await openEntry('United Kingdom')
    await click(button('Read this playlist'))
    expect(text()).toContain('Reading playlist…')
    await click(button('Cancel'))
    expect(text()).toContain('Read this playlist')
    await act(async () => { slow.resolve(report) })
    await settle()
    expect(text()).not.toContain('Kinora read the playlist')
    expect(native.saveSources.mock.calls.every(([s]) => (s as SavedState).sources.length === 1)).toBe(true)
  })

  it('a refused import says why, adds nothing, and can be retried', async () => {
    let first = true
    native.fetchPlaylist.mockImplementation(async (url: string) => {
      if (url === entries[5]!.url && first) { first = false; throw new IngestError('blocked', '10.0.0.5 is a local, private or reserved network address. Kinora only fetches playlists from public internet addresses.') }
      return report
    })
    await mount('/sources?tab=discovery')
    await click(button('Categories'))
    await openEntry('News')
    await click(button('Read this playlist'))
    expect(text()).toContain('Kinora only fetches playlists from public internet addresses.')
    await click(button('Try again'))
    expect(text()).toContain('Kinora read the playlist: 2 channels')
  })

  it('an unreadable result never shows a raw error', async () => {
    native.fetchPlaylist.mockImplementation(async (url: string) => {
      if (url === entries[5]!.url) throw new Error('https://iptv-org.github.io/iptv/categories/news.m3u?token=X failed: os error')
      return report
    })
    await mount('/sources?tab=discovery')
    await click(button('Categories'))
    await openEntry('News')
    await click(button('Read this playlist'))
    expect(text()).toContain('Kinora could not read that playlist.')
    expect(text()).not.toContain('os error')
  })
})
