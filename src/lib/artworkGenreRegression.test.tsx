// @vitest-environment happy-dom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Art } from '../components/ui'
import { StreamingCard, StreamingGenreRow } from '../components/StreamingComponents'
import { GenreCard } from '../components/GenreCard'
import { StoreProvider } from '../state/store'
import { ToastProvider } from '../components/Toast'
import { GENRE_ARTWORK, DEFAULT_GENRE_ARTWORK, matchGenreArtwork } from '../data/genre-art'
import { getGenreById } from '../data/genreTaxonomy'
import {
  isLegacyGenreArtworkPath,
  loadSavedCustomizations,
  sanitizeCustomGenreArtwork,
} from '../state/genreCustomizations'
import { validateArtworkSuitability } from './artworkSuitability'
import { buildHomeFeed } from './homeFeed'
import { movies, series } from '../data/catalog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLDivElement | null = null

async function mount(node: ReactNode) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(node)
  })
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount()
    })
    root = null
  }
  host?.remove()
  host = null
})

describe('Series artwork framing and Art loading stability', () => {
  it('does not override poster CSS object-position with inline 50% 50% and marks loaded images cleanly', async () => {
    await mount(<Art src="/art/genres/crime.jpg" alt="Test Series" fitMode="poster" />)
    const img = document.querySelector('img') as HTMLImageElement | null
    expect(img).not.toBeNull()
    // Default focus must not inject inline objectPosition: 50% 50%
    expect(img!.style.objectPosition).toBe('')

    // Simulate portrait 2:3 natural load -> keeps cover framing without aspect-contain class
    Object.defineProperty(img!, 'naturalWidth', { configurable: true, value: 680 })
    Object.defineProperty(img!, 'naturalHeight', { configurable: true, value: 1000 })
    Object.defineProperty(img!, 'complete', { configurable: true, value: true })
    await act(async () => {
      img!.dispatchEvent(new Event('load'))
    })
    expect(img!.className).toContain('is-loaded')
    expect(img!.parentElement?.className).not.toContain('is-aspect-contain')
  })

  it('protects badly proportioned landscape images in poster containers via is-aspect-contain', async () => {
    await mount(<Art src="/art/genres/drama.jpg" alt="Wide In Poster" fitMode="poster" />)
    const img = document.querySelector('img') as HTMLImageElement
    Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 1920 })
    Object.defineProperty(img, 'naturalHeight', { configurable: true, value: 1080 })
    await act(async () => {
      img.dispatchEvent(new Event('load'))
    })
    expect(img.parentElement?.className).toContain('is-aspect-contain')
  })

  it('protects portrait images in backdrop containers via is-portrait-art', async () => {
    await mount(<Art src="/art/genres/comedy.jpg" alt="Portrait In Backdrop" fitMode="backdrop" />)
    const img = document.querySelector('img') as HTMLImageElement
    Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 680 })
    Object.defineProperty(img, 'naturalHeight', { configurable: true, value: 1000 })
    await act(async () => {
      img.dispatchEvent(new Event('load'))
    })
    expect(img.parentElement?.className).toContain('is-portrait-art')
  })

  it('renders StreamingCard poster layout with unobstructed media frame separate from caption', async () => {
    await mount(
      <MemoryRouter>
        <StoreProvider>
          <ToastProvider>
            <StreamingCard
              to="/series/beverly-hillbillies"
              title="The Beverly Hillbillies"
              sub="2 Seasons · Comedy"
              art="/art/genres/comedy.jpg"
              itemRef="series:beverly-hillbillies"
              layout="poster"
            />
          </ToastProvider>
        </StoreProvider>
      </MemoryRouter>,
    )
    expect(document.querySelector('.streaming-card-poster-media')).not.toBeNull()
    expect(document.querySelector('.streaming-card-poster-caption')?.textContent).toContain('The Beverly Hillbillies')
    // Poster card must not overlay a bottom scrim over the artwork
    expect(document.querySelector('.streaming-card-poster .streaming-card-scrim')).toBeNull()
  })

  it('enforces role suitability across series posters, backdrops, episode stills, and logos', () => {
    expect(
      validateArtworkSuitability('https://static.tvmaze.com/uploads/images/original_untouched/11/29898.jpg', 'series-poster', {
        width: 680,
        height: 1000,
      }).isValid,
    ).toBe(true)
    expect(
      validateArtworkSuitability('https://example.com/logos/show-title-logo.png', 'series-backdrop').isValid,
    ).toBe(false)
    expect(
      validateArtworkSuitability('https://example.com/poster.jpg', 'series-backdrop', {
        width: 680,
        height: 1000,
      }).isValid,
    ).toBe(false)
    expect(
      validateArtworkSuitability('https://example.com/still-16x9.jpg', 'episode-still', {
        width: 1280,
        height: 720,
      }).isValid,
    ).toBe(true)
  })
})

describe('Legacy genre artwork removal, resolver consistency, and cache migration', () => {
  it('ensures genre-art.ts never returns obsolete /art/<demo>.jpg paths', () => {
    expect(DEFAULT_GENRE_ARTWORK.startsWith('/art/genres/')).toBe(true)
    for (const url of Object.values(GENRE_ARTWORK)) {
      expect(url.startsWith('/art/genres/')).toBe(true)
      expect(isLegacyGenreArtworkPath(url)).toBe(false)
    }
    expect(matchGenreArtwork('Crime Drama').startsWith('/art/genres/')).toBe(true)
    expect(matchGenreArtwork('Sports').startsWith('/art/genres/')).toBe(true)
  })

  it('migrates cached legacy genre artwork paths while preserving user-customised artwork', () => {
    const raw = {
      crime: { landscape: '/art/harbour-lights.jpg', banner: '/art/harbour-lights.jpg' },
      drama: { landscape: 'data:image/png;base64,USER_CUSTOM_DATA', banner: '/art/kingsmoor.jpg' },
      comedy: { landscape: 'https://cdn.example.com/my-comedy.jpg' },
      action: { landscape: '/art/genres/action.jpg' },
    }
    const { sanitized, migrated } = sanitizeCustomGenreArtwork(raw)
    expect(migrated).toBe(true)
    expect(sanitized.crime).toBeUndefined()
    expect(sanitized.drama).toEqual({ landscape: 'data:image/png;base64,USER_CUSTOM_DATA' })
    expect(sanitized.comedy).toEqual({ landscape: 'https://cdn.example.com/my-comedy.jpg' })
    expect(sanitized.action).toEqual({ landscape: '/art/genres/action.jpg' })

    localStorage.setItem(
      'kinora.genreCustomizations.v1',
      JSON.stringify({ version: 1, customArtwork: raw }),
    )
    const loaded = loadSavedCustomizations()
    expect(loaded.customArtwork.crime).toBeUndefined()
    expect(loaded.customArtwork.drama?.landscape).toBe('data:image/png;base64,USER_CUSTOM_DATA')
  })

  it('uses the same resolved genre artwork across GenreCard and StreamingGenreRow including user overrides', async () => {
    const customUrl = 'data:image/png;base64,CUSTOM_CRIME_ART'
    localStorage.setItem(
      'kinora.genreCustomizations.v1',
      JSON.stringify({ version: 1, customArtwork: { crime: { landscape: customUrl } } }),
    )
    const crime = getGenreById('crime')!
    await mount(
      <MemoryRouter>
        <div>
          <GenreCard genre={crime} />
          <StreamingGenreRow
            genres={[{ id: crime.id, name: crime.name }]}
            selectedGenre={null}
            onSelectGenre={() => {}}
            onViewAll={() => {}}
          />
        </div>
      </MemoryRouter>,
    )
    const cardImg = document.querySelector('.genre-card-img') as HTMLImageElement | null
    const rowImg = document.querySelector('.streaming-genre-tile-art') as HTMLImageElement | null
    expect(cardImg?.getAttribute('src')).toBe(customUrl)
    expect(rowImg?.getAttribute('src')).toBe(customUrl)
  })

  it('excludes fictional demo titles like Redline from Home recentlyAdded when demoTitles is false', () => {
    const feed = buildHomeFeed({
      now: Date.now(),
      demoTitles: false,
      isKidsMode: false,
      library: {
        favourites: [],
        watchlist: [],
        watched: [],
        progress: {},
        history: [],
        collections: [],
        recentSearches: [],
        reminders: [],
      },
      channels: [],
      findChannel: () => undefined,
      programmeAt: () => undefined,
      nextProgramme: () => undefined,
      allMovies: movies,
      allSeries: series,
      xtreamCatalogue: { movies: [], series: [] },
      mediaLibrary: { mySources: [], allResources: [] },
      userPreferences: undefined,
    })
    const ids = feed.recentlyAdded.map((t) => t.id)
    expect(ids).not.toContain('redline')
    expect(ids).not.toContain('valley-of-ashes')
  })
})
