import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toast'
import type { PlaylistChannel, PlaylistReport } from '../lib/native'
import { addressLabel, createSource, removeSource, type PlaylistSource } from '../state/playlists'
import { StoreProvider } from '../state/store'
import { Home } from './Home'
import { LiveTV } from './LiveTV'
import { Player } from './Player'
import { Search } from './Search'
import { Settings } from './Settings'
import { AddSource, Sources } from './Sources'

// Real screens rendered to HTML with the store seeded, so these cover what users see on each screen.
// Click-driven flows need a DOM, which this project's test setup does not have (see the D3.1 report).

// LiveTV reads the viewport width while rendering; no DOM here, so answer "wide window".
beforeAll(() => vi.stubGlobal('window', { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) }))
afterAll(() => vi.unstubAllGlobals())

const SECRET_STREAM = 'http://alice:pw1@provider.example:8080/live/alice/hunter2/1.ts?token=SECRET123'
const SECRETS = ['alice', 'pw1', 'hunter2', 'SECRET123', 'provider.example', 'img.example', 'LOGOSIG', '/live/']

const entry = (key: string, name: string, group: string | null): PlaylistChannel => ({
  key, tvgId: null, name, group, logo: 'https://img.example/l.png?sig=LOGOSIG', language: null, country: null, chno: null,
  streamUrl: SECRET_STREAM, streamDisplay: 'http://provider.example:8080/…',
})
const report = (channels: PlaylistChannel[]): PlaylistReport => ({ channels, skipped: 0, duplicates: 0, warnings: [], host: 'playlists.example' })
const lineup = createSource('pl-a', { name: 'My lineup', origin: 'url', url: 'https://playlists.example/get.php?password=hunter2', label: addressLabel('https://playlists.example/get.php?password=hunter2') }, report([
  entry('tvg:toons.uk', 'Toon Time', 'Animation;Comedy'),
  entry('tvg:laughs:uk/hd#2', 'Laugh Line', ' comedy '),
  entry('name:00ff00ff00ff00ff', 'Mystery Feed', null),
]), Date.now())
const [toons, laughs, mystery] = lineup.channels as [PlaylistSource['channels'][number], PlaylistSource['channels'][number], PlaylistSource['channels'][number]]

function render(path: string, element: ReactNode, playlists: PlaylistSource[] = [lineup], route = '*', demo = playlists.length === 0) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <StoreProvider initialPlaylists={playlists} initialDemo={demo}>
        <ToastProvider><Routes><Route path={route} element={element} /></Routes></ToastProvider>
      </StoreProvider>
    </MemoryRouter>,
  )
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/\s+/g, ' ')
const chips = (html: string) => [...html.matchAll(/<button type="button" class="chip"[^>]*>(.*?)<\/button>/g)].map((m) => text(m[1] ?? '').trim())
const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => (m[1] ?? '').replace(/&amp;/g, '&'))

describe('Live TV catalogue', () => {
  it('shows the demonstration catalogue when there are no playlist sources', () => {
    const t = text(render('/live', <LiveTV />, []))
    expect(t).toContain('Northlight One')
    expect(t).toContain('fictional')
    expect(t).not.toContain('Toon Time')
  })

  it('shows only playlist channels while a playlist source exists', () => {
    const html = render('/live', <LiveTV />)
    const t = text(html)
    for (const name of ['Toon Time', 'Laugh Line', 'Mystery Feed']) expect(t).toContain(name)
    expect(t).not.toContain('Northlight One')
    expect(html.match(/class="guide-noinfo/g)).toHaveLength(3)
    for (const s of SECRETS) expect(html).not.toContain(s)
  })

  it('shows nothing fictional when the last source is removed', () => {
    const t = text(render('/live', <LiveTV />, removeSource([lineup], 'pl-a'), '*', false))
    expect(t).not.toContain('Northlight One')
    expect(t).toContain('No channels yet')
    expect(t).not.toContain('Toon Time')
  })

  it('offers each category once and filters multi-category channels into each of them', () => {
    const all = render('/live?view=channels', <LiveTV />)
    expect(chips(all)).toEqual(['All', 'Favourites', 'Animation', 'Comedy', 'Uncategorised'])
    const comedy = text(render('/live?view=channels&group=Comedy', <LiveTV />))
    expect(comedy).toContain('Toon Time')
    expect(comedy).toContain('Laugh Line')
    expect(comedy).not.toContain('Mystery Feed')
    expect(comedy.split('Toon Time').length - 1).toBe(1) // listed once, not once per category
    const none = text(render('/live?view=channels&group=Uncategorised', <LiveTV />))
    expect(none).toContain('Mystery Feed')
    expect(none).not.toContain('Toon Time')
  })

  it('links each channel to itself, including ids built from punctuated keys', () => {
    const links = hrefs(render('/live?view=channels', <LiveTV />)).filter((h) => h.startsWith('/live?channel='))
    const ids = links.map((h) => new URLSearchParams(h.split('?')[1]).get('channel'))
    expect(ids).toEqual([toons.id, laughs.id, mystery.id])
    // Following the link selects that channel, not the first one.
    const html = render(`/live?channel=${laughs.id}`, <LiveTV />)
    expect(html.match(/aria-current="true"/g)).toHaveLength(1)
    expect(html).toMatch(/aria-label="Watch \d+ Laugh Line" aria-current="true"/)
    expect(html).not.toContain('now watching') // chosen is not playing
  })
})

describe('player for a playlist channel', () => {
  const player = (id: string, playlists = [lineup]) => render(`/watch/${encodeURIComponent(`channel:${id}`)}`, <Player />, playlists, '/watch/:ref')

  it('starts in a loading state with nothing shown as playing and no controls before there is media', () => {
    const html = player(laughs.id)
    const t = text(html)
    expect(t).toContain('Laugh Line')
    expect(t).toContain('Loading stream…')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Play, unavailable until the stream loads"/)
    expect(html).toContain('<video class="player-video"')
    for (const control of ['aria-label="Mute"', 'aria-label="Volume"', 'aria-label="Subtitles"', 'aria-label="Audio"', 'aria-label="Quality"', 'aria-label="Pause"']) expect(html).not.toContain(control)
    expect(t).not.toMatch(/\bLive\b/)
    for (const s of SECRETS) expect(html).not.toContain(s)
  })

  it('keeps the demonstration player controls for demo channels', () => {
    const html = render(`/watch/${encodeURIComponent('channel:northlight-one')}`, <Player />, [], '/watch/:ref')
    for (const control of ['aria-label="Mute"', 'aria-label="Volume"', 'aria-label="Subtitles"']) expect(html).toContain(control)
    expect(html).toContain('aria-label="Play, unavailable: no stream connected"')
  })
})

describe('other channel screens and Sources', () => {
  it('Home shows playlist channels without guide or live claims', () => {
    const t = text(render('/', <Home />))
    expect(t).toContain('Toon Time')
    expect(t).toContain('No guide information')
    expect(t).toContain('Channels come from your imported playlists')
  })

  it('Search finds playlist channels by individual category', () => {
    const t = text(render('/search?q=animation', <Search />))
    expect(t).toContain('Toon Time')
    expect(t).toContain('Animation · Comedy')
    expect(t).not.toContain('Laugh Line')
  })

  it('Sources lists imported playlists apart from the sample sources, with no addresses shown', () => {
    const html = render('/sources', <Sources />)
    const t = text(html)
    expect(t).toContain('My lineup')
    expect(t).toContain('Parsed · 3 channels')
    expect(t).toContain('Streams not playback-tested')
    expect(t).not.toContain('Sample')
    expect(html).not.toContain('get.php')
    for (const s of SECRETS) expect(html).not.toContain(s)
  })

  it('Settings › Sources describes manual refresh with no controls for features that do not exist', () => {
    const html = render('/settings/sources', <Settings />, [], '/settings/:section')
    const t = text(html)
    expect(t).toContain('Automatic refresh is not available yet')
    expect(t).toContain('Checking streams is not available yet')
    expect(html).not.toMatch(/role="switch"|<select|aria-label="Parallel checks"/)
    expect(t).not.toMatch(/Refresh sources automatically|Default refresh interval|Drop a stream after|Streams checked at once/)
  })

  it('Add Source offers address and file import, and says streams are not checked and sources are saved', () => {
    const t = text(render('/sources/add', <AddSource />))
    expect(t).toContain('Scan & Validate')
    expect(t).toContain('Import a playlist file')
    expect(t).toContain('It does not open or test any stream')
    expect(t).toContain('Sources are saved on this device.')
    expect(t).not.toMatch(/Refresh every|Check before adding|Every 12 hours/)
  })
})
