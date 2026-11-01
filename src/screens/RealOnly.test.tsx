import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toast'
import { movies, series } from '../data/catalog'
import type { PlaylistChannel } from '../lib/native'
import { createSource } from '../state/playlists'
import { StoreProvider } from '../state/store'
import { Home } from './Home'
import { Library } from './Library'
import { MovieDetail } from './MovieDetail'
import { Movies } from './Movies'
import { Player } from './Player'
import { Search } from './Search'
import { SeriesBrowse } from './SeriesBrowse'
import { SeriesDetail } from './SeriesDetail'

// With a real playlist imported, nothing fictional is shown: the demonstration films and series exist
// only for the first-run preview (D8 follow-up: the owner saw them next to real channels).
beforeAll(() => vi.stubGlobal('window', { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) }))
afterAll(() => vi.unstubAllGlobals())

const channel = (i: number): PlaylistChannel => ({
  key: `tvg:real.${i}`, tvgId: `real.${i}`, name: `Real Channel ${i}`, group: 'News', logo: null, language: null, country: null, chno: null,
  streamUrl: `https://cdn.example/${i}.m3u8`, streamDisplay: 'https://cdn.example/…',
})
const real = createSource('pl-real', { name: 'Real lineup', origin: 'url', url: 'https://playlists.example/real.m3u', label: 'https://playlists.example/…' },
  { channels: [channel(1), channel(2)], skipped: 0, duplicates: 0, warnings: [], host: 'playlists.example' }, Date.now())
const film = movies[0]!
const show = series[0]!
const fictional = [film.title, show.title, 'Featured movie', 'New Movies', 'Continue Watching', 'fictional demonstration']

function render(path: string, route: string, element: ReactNode, withPlaylist = true) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <StoreProvider initialPlaylists={withPlaylist ? [real] : []} initialDemo={!withPlaylist}>
        <ToastProvider><Routes><Route path={route} element={element} /></Routes></ToastProvider>
      </StoreProvider>
    </MemoryRouter>,
  )
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('with a real playlist, no fictional films or series anywhere', () => {
  it('Home shows real channels and no fictional titles', () => {
    const t = text(render('/', '/', <Home />))
    expect(t).toContain('Real Channel 1')
    for (const f of fictional) expect(t).not.toContain(f)
  })

  it('Movies and Series say there is no source yet', () => {
    for (const [path, route, el] of [['/movies', '/movies', <Movies />], ['/series', '/series', <SeriesBrowse />]] as const) {
      const t = text(render(path, route, el))
      expect(t).toContain('no source for')
      expect(t).not.toContain(film.title)
      expect(t).not.toContain(show.title)
    }
  })

  it('detail pages and the player do not open fictional titles', () => {
    expect(text(render(`/movies/${film.id}`, '/movies/:id', <MovieDetail />))).not.toContain(film.synopsis)
    expect(text(render(`/series/${show.id}`, '/series/:id', <SeriesDetail />))).not.toContain(show.synopsis)
    expect(text(render(`/watch/${encodeURIComponent(`movie:${film.id}`)}`, '/watch/:ref', <Player />))).toContain('Nothing to play here')
  })

  it('Search and Library leave fictional titles out', () => {
    const word = film.title.split(' ')[0]!.toLowerCase()
    expect(text(render(`/search?q=${word}`, '/search', <Search />))).not.toContain(film.title)
    expect(text(render('/library', '/library', <Library />))).not.toContain(film.title)
  })

  it('sample mode shows the demonstration catalogue', () => {
    expect(text(render('/movies', '/movies', <Movies />, false))).toContain(film.title)
  })

  it('a channel with no artwork shows no "artwork unavailable" text over its card', () => {
    expect(text(render('/', '/', <Home />))).not.toContain('Artwork unavailable')
  })
})
