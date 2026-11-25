// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toast'
import { NotificationProvider } from '../components/Notifications'
import { StoreProvider } from '../state/store'
import { DiscoverScreen } from './DiscoverScreen'
import { GenreBrowseScreen } from './GenreBrowseScreen'
import { Settings } from './Settings'
import {
  CANONICAL_GENRES,
  PARENT_GENRES,
  getGenreById,
  getSubgenresForParent,
} from '../data/genreTaxonomy'
import { classifyGenre, classifyGenreList } from '../lib/genreClassifier'

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)

let root: Root | null = null
let host: HTMLDivElement | null = null

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  localStorage.clear()
})

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount()
    })
  }
  root = null
  if (host) {
    host.remove()
    host = null
  }
  document.body.replaceChildren()
})

const settle = async () => {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

describe('Canonical Genre Taxonomy and Discovery (Findings 4 and 11)', () => {
  it('defines structured canonical genres and subgenres with ambient color palettes', () => {
    expect(PARENT_GENRES.length).toBeGreaterThanOrEqual(10)
    expect(CANONICAL_GENRES.length).toBeGreaterThanOrEqual(PARENT_GENRES.length)

    const scifi = getGenreById('science-fiction')
    expect(scifi).toBeDefined()
    expect(scifi?.name).toBe('Science Fiction')
    expect(scifi?.artwork.ambient.primaryHue).toBeGreaterThanOrEqual(0)

    const subgenres = getSubgenresForParent('science-fiction')
    expect(subgenres.length).toBeGreaterThan(0)
    expect(subgenres.some((s) => s.id === 'scifi-cyberpunk')).toBe(true)
  })

  it('accurately classifies raw category names and tags into canonical genres', () => {
    const res1 = classifyGenre('Action & Adventure')
    expect(res1.canonical?.id).toBe('action')

    const res2 = classifyGenre('Cyberpunk')
    expect(res2.canonical?.id).toBe('scifi-cyberpunk')

    const resList = classifyGenreList(['Science Fiction', 'Cyberpunk', 'Space'], 'movies')
    expect(resList.canonicalGenres.some((g) => g.id === 'science-fiction')).toBe(true)
    expect(resList.subgenres.some((s) => s.id === 'scifi-cyberpunk')).toBe(true)
  })

  it('renders DiscoverScreen with parent genre cards and search filter', async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/discover']}>
          <ToastProvider>
            <NotificationProvider>
              <StoreProvider initialDemo={true}>
                <DiscoverScreen />
              </StoreProvider>
            </NotificationProvider>
          </ToastProvider>
        </MemoryRouter>
      )
    })
    await settle()

    const cards = document.querySelectorAll('.genre-card')
    expect(cards.length).toBeGreaterThan(0)

    const header = document.querySelector('h1')
    expect(header?.textContent).toContain('Discover')
  })

  it('renders GenreBrowseScreen for a canonical parent genre with subgenre chips', async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/genres/science-fiction']}>
          <ToastProvider>
            <NotificationProvider>
              <StoreProvider initialDemo={true}>
                <Routes>
                  <Route path="/genres/:genreId" element={<GenreBrowseScreen />} />
                  <Route path="/genres/:genreId/:subgenreId" element={<GenreBrowseScreen />} />
                </Routes>
              </StoreProvider>
            </NotificationProvider>
          </ToastProvider>
        </MemoryRouter>
      )
    })
    await settle()

    const title = document.querySelector('.genre-hero-title')
    expect(title?.textContent).toContain('Science Fiction')

    const pills = document.querySelectorAll('.streaming-nav-pill')
    expect(pills.length).toBeGreaterThan(0)
  })

  it('renders GenreArtworkSettings inside Settings', async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/settings/genres']}>
          <ToastProvider>
            <NotificationProvider>
              <StoreProvider>
                <Routes>
                  <Route path="/settings/:section" element={<Settings />} />
                </Routes>
              </StoreProvider>
            </NotificationProvider>
          </ToastProvider>
        </MemoryRouter>
      )
    })
    await settle()

    const genreWrap = document.querySelector('.genre-settings-wrap')
    expect(genreWrap).not.toBeNull()

    const cards = document.querySelectorAll('.genre-settings-card')
    expect(cards.length).toBeGreaterThan(0)
  })

  it('strictly adheres to the zero em-dash typography standard across discovery views', async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/discover']}>
          <ToastProvider>
            <NotificationProvider>
              <StoreProvider initialDemo={true}>
                <DiscoverScreen />
              </StoreProvider>
            </NotificationProvider>
          </ToastProvider>
        </MemoryRouter>
      )
    })
    await settle()

    const text = document.body.textContent || ''
    expect(text).not.toContain('\u2014')
  })
})
