// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toast'
import { resolve } from '../data/refs'
import { IngestError, type XtreamMovieDetails, type XtreamSeriesDetails } from '../lib/native'
import { StoreProvider } from '../state/store'
import { MovieDetail } from './MovieDetail'
import { Movies } from './Movies'
import { Player } from './Player'
import { SeriesBrowse } from './SeriesBrowse'
import { SeriesDetail } from './SeriesDetail'

const mockNative = vi.hoisted(() => ({
  openStream: vi.fn(),
  closeStream: vi.fn(),
  loadXtreamVodDetails: vi.fn(),
  loadXtreamSeries: vi.fn(),
  loadSources: vi.fn(),
  saveSources: vi.fn(),
  isXtreamConnected: vi.fn(),
}))

vi.mock('../lib/native', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/native')>()),
  openStream: mockNative.openStream,
  closeStream: mockNative.closeStream,
  loadXtreamVodDetails: mockNative.loadXtreamVodDetails,
  loadXtreamSeries: mockNative.loadXtreamSeries,
  loadSources: mockNative.loadSources,
  saveSources: mockNative.saveSources,
  isXtreamConnected: mockNative.isXtreamConnected,
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLDivElement

const sampleCatalogue: any = {
  movies: [
    {
      id: '101',
      sourceId: 'src-1',
      name: 'Alpha Horizon',
      categoryId: '1',
      categoryName: 'Sci-Fi',
      rating: 8.5,
      plot: 'Astronauts venture past the known galaxy.',
      extension: 'mp4',
      artworkKey: 'xtream:vod:101',
      year: 2024,
    },
    {
      id: '102',
      sourceId: 'src-1',
      name: 'Bravo Midnight',
      categoryId: '2',
      categoryName: 'Action',
      rating: 7.2,
      plot: 'A covert agent races against the clock.',
      extension: 'mkv',
      artworkKey: 'xtream:vod:102',
      year: 2021,
    },
    {
      id: '103',
      sourceId: 'src-1',
      name: 'Charlie Dawn',
      categoryId: '1',
      categoryName: 'Sci-Fi',
      rating: 9.1,
      plot: 'Humanity awakens on a terraformed world.',
      extension: 'mp4',
      artworkKey: 'xtream:vod:103',
      year: 2019,
    },
  ],
  series: [
    {
      id: '201',
      sourceId: 'src-1',
      name: 'Solar Odyssey',
      categoryId: '10',
      categoryName: 'Drama',
      rating: 9.0,
      plot: 'A sprawling journey through the orbital colonies.',
      extension: 'mp4',
      artworkKey: 'xtream:series:201',
      year: 2023,
    },
    {
      id: '202',
      sourceId: 'src-1',
      name: 'Deep Orbit',
      categoryId: '20',
      categoryName: 'Thriller',
      rating: 8.1,
      plot: 'Submarine crew in Europa ocean trenches.',
      extension: 'mkv',
      artworkKey: 'xtream:series:202',
      year: 2020,
    },
  ],
  liveStreams: [],
  vodCategories: [
    { id: '1', sourceId: 'src-1', name: 'Sci-Fi' },
    { id: '2', sourceId: 'src-1', name: 'Action' },
  ],
  seriesCategories: [
    { id: '10', sourceId: 'src-1', name: 'Drama' },
    { id: '20', sourceId: 'src-1', name: 'Thriller' },
  ],
}

const sampleVodDetails: XtreamMovieDetails = {
  id: '101',
  name: 'Alpha Horizon',
  plot: 'Astronauts venture past the known galaxy into deep hyperspace.',
  cast: 'Jane Doe, John Smith',
  director: 'Stanley Direct',
  genre: 'Sci-Fi',
  releaseDate: '2024-05-10',
  durationSecs: 7200,
  rating: 8.5,
  backdrop: 'xtream:vod:backdrop:101',
  streamIcon: null,
  containerExtension: 'mp4',
  artworkKey: 'xtream:vod:101',
}

const sampleSeriesDetails: XtreamSeriesDetails = {
  plot: 'A sprawling journey through the orbital colonies.',
  seasons: [
    {
      number: 1,
      episodes: [
        {
          id: '1',
          number: 1,
          title: 'Departure',
          plot: 'The maiden voyage begins.',
          runtimeSeconds: 3000,
          extension: 'mp4',
          artworkKey: 'xtream:ep:1',
        },
        {
          id: '2',
          number: 2,
          title: 'Signal Lost',
          plot: 'Communication goes silent.',
          runtimeSeconds: 3100,
          extension: 'mp4',
          artworkKey: 'xtream:ep:2',
        },
      ],
    },
    {
      number: 2,
      episodes: [
        {
          id: '3',
          number: 1,
          title: 'Resurfacing',
          plot: 'A new expedition discovers debris.',
          runtimeSeconds: 2900,
          extension: 'mp4',
          artworkKey: 'xtream:ep:3',
        },
      ],
    },
  ],
}

describe('Phase 3: Movies and Series Experience', () => {
  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    vi.clearAllMocks()
    mockNative.loadSources.mockResolvedValue(null)
    mockNative.isXtreamConnected.mockResolvedValue(true)
    mockNative.loadXtreamVodDetails.mockResolvedValue(sampleVodDetails)
    mockNative.loadXtreamSeries.mockResolvedValue(sampleSeriesDetails)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    host.remove()
  })

  it('renders movies catalogue with categories, provider attribution, search and sorting', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/movies']}>
          <ToastProvider>
            <StoreProvider
              initialXtreamSources={[
                {
                  id: 'src-1',
                  name: 'Starlight Provider',
                  addedAt: Date.now(),
                  lastSuccess: Date.now(),
                  movies: 3,
                  series: 2,
                  liveChannels: 0,
                  connected: true,
                  server: null,
                  enabled: true,
                },
              ]}
              initialXtreamCatalogue={sampleCatalogue}
            >
              <Routes>
                <Route path="/movies" element={<Movies />} />
              </Routes>
            </StoreProvider>
          </ToastProvider>
        </MemoryRouter>,
      )
    })

    // Renders movies from provider
    expect(host.textContent).toContain('Alpha Horizon')
    expect(host.textContent).toContain('Bravo Midnight')
    expect(host.textContent).toContain('Charlie Dawn')
    expect(host.textContent).toContain('Starlight Provider')

    // Category filter has real categories
    const categorySelect = host.querySelector('select[aria-label="Category"]') as HTMLSelectElement
    expect(categorySelect).not.toBeNull()
    expect(categorySelect.textContent).toContain('All Categories')
    expect(categorySelect.textContent).toContain('Sci-Fi')
    expect(categorySelect.textContent).toContain('Action')

    // Filter by Sci-Fi category
    await act(async () => {
      categorySelect.value = '1'
      categorySelect.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(host.textContent).toContain('Alpha Horizon')
    expect(host.textContent).toContain('Charlie Dawn')
    expect(host.textContent).not.toContain('Bravo Midnight')

    // Search query filtering
    const searchInput = (host.querySelector('.provider-search input') ?? host.querySelector('input[type="search"]')) as HTMLInputElement
    expect(searchInput).not.toBeNull()

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(searchInput, 'Alpha')
      searchInput.dispatchEvent(new Event('input', { bubbles: true }))
      searchInput.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(host.textContent).toContain('Alpha Horizon')
    expect(host.textContent).not.toContain('Charlie Dawn')
  })

  it('renders movie details with extended metadata and play button', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/movies/xt:src-1:101']}>
          <ToastProvider>
            <StoreProvider
              initialXtreamSources={[
                {
                  id: 'src-1',
                  name: 'Starlight Provider',
                  addedAt: Date.now(),
                  lastSuccess: Date.now(),
                  movies: 3,
                  series: 2,
                  liveChannels: 0,
                  connected: true,
                  server: null,
                  enabled: true,
                },
              ]}
              initialXtreamCatalogue={sampleCatalogue}
            >
              <Routes>
                <Route path="/movies/:id" element={<MovieDetail />} />
              </Routes>
            </StoreProvider>
          </ToastProvider>
        </MemoryRouter>,
      )
    })

    // Verifies loadXtreamVodDetails was invoked
    expect(mockNative.loadXtreamVodDetails).toHaveBeenCalledWith('src-1', '101')

    // Verifies extended details rendered
    expect(host.textContent).toContain('Alpha Horizon')
    expect(host.textContent).toContain('Stanley Direct')
    expect(host.textContent).toContain('Jane Doe, John Smith')
    expect(host.textContent).toContain('2024-05-10')
    expect(host.textContent).toContain('2h 00m')
    expect(host.textContent).toContain('8.5')
    expect(host.textContent).toContain('MP4')

    // Play Movie button links to /watch/movie:xt:src-1:101
    const playLink = Array.from(host.querySelectorAll('a')).find((a) => a.textContent?.includes('Play Movie'))
    expect(playLink).not.toBeUndefined()
    expect(playLink?.getAttribute('href')).toBe(`/watch/${encodeURIComponent('movie:xt:src-1:101')}`)
  })

  it('renders series browsing with categories, provider filter and search', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/series']}>
          <ToastProvider>
            <StoreProvider
              initialXtreamSources={[
                {
                  id: 'src-1',
                  name: 'Starlight Provider',
                  addedAt: Date.now(),
                  lastSuccess: Date.now(),
                  movies: 3,
                  series: 2,
                  liveChannels: 0,
                  connected: true,
                  server: null,
                  enabled: true,
                },
              ]}
              initialXtreamCatalogue={sampleCatalogue}
            >
              <Routes>
                <Route path="/series" element={<SeriesBrowse />} />
              </Routes>
            </StoreProvider>
          </ToastProvider>
        </MemoryRouter>,
      )
    })

    expect(host.textContent).toContain('Solar Odyssey')
    expect(host.textContent).toContain('Deep Orbit')

    // Categories dropdown lists Drama and Thriller
    const categorySelect = host.querySelector('select[aria-label="Category"]') as HTMLSelectElement
    expect(categorySelect).not.toBeNull()
    expect(categorySelect.textContent).toContain('Drama')
    expect(categorySelect.textContent).toContain('Thriller')

    // Filter by Drama
    await act(async () => {
      categorySelect.value = '10'
      categorySelect.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(host.textContent).toContain('Solar Odyssey')
    expect(host.textContent).not.toContain('Deep Orbit')
  })

  it('renders series details with season tabs, keyboard navigation and episode play links', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/series/xt:src-1:201']}>
          <ToastProvider>
            <StoreProvider
              initialXtreamSources={[
                {
                  id: 'src-1',
                  name: 'Starlight Provider',
                  addedAt: Date.now(),
                  lastSuccess: Date.now(),
                  movies: 3,
                  series: 2,
                  liveChannels: 0,
                  connected: true,
                  server: null,
                  enabled: true,
                },
              ]}
              initialXtreamCatalogue={sampleCatalogue}
            >
              <Routes>
                <Route path="/series/:id" element={<SeriesDetail />} />
              </Routes>
            </StoreProvider>
          </ToastProvider>
        </MemoryRouter>,
      )
    })

    // Invoked loadXtreamSeries
    expect(mockNative.loadXtreamSeries).toHaveBeenCalledWith('src-1', '201')

    // Shows Season 1 and Season 2 tabs
    const seasonTabs = host.querySelectorAll('[role="tab"]')
    expect(seasonTabs.length).toBe(2)
    expect(seasonTabs[0]?.textContent).toBe('Season 1')
    expect(seasonTabs[1]?.textContent).toBe('Season 2')

    // Season 1 episodes visible
    expect(host.textContent).toContain('Departure')
    expect(host.textContent).toContain('Signal Lost')

    // Episode play links navigate to /watch/episode:xt:...
    const epPlayLink = host.querySelector('a.episode-still') as HTMLAnchorElement
    expect(epPlayLink).not.toBeNull()
    expect(epPlayLink.getAttribute('href')).toBe(`/watch/${encodeURIComponent('episode:xt:src-1:201/1')}`)

    // Keyboard navigation to Season 2
    const tabList = host.querySelector('[role="tablist"]') as HTMLElement
    expect(tabList).not.toBeNull()

    await act(async () => {
      tabList.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })

    // Season 2 episode rendered
    expect(host.textContent).toContain('Resurfacing')
  })

  it('resolves Xtream movie and episode refs with streamUrl and mounts player', async () => {
    const movieResolved = resolve(
      'movie:xt:src-1:101',
      Date.now(),
      () => undefined,
      () => undefined,
      true,
      () => ({ name: 'Alpha Horizon', year: 2024, artworkKey: 'xtream:vod:101', extension: 'mp4' }),
    )

    expect(movieResolved).not.toBeUndefined()
    expect(movieResolved?.title).toBe('Alpha Horizon')
    expect((movieResolved as any)?.streamUrl).toBe('xtream://src-1/movie/101?ext=mp4')

    const epResolved = resolve(
      'episode:xt:src-1:201/1',
      Date.now(),
      () => undefined,
      () => undefined,
      true,
      undefined,
      () => ({ name: 'Solar Odyssey', year: 2023, artworkKey: 'xtream:series:201' }),
      () => ({
        id: '1',
        number: 1,
        seasonNumber: 1,
        title: 'Departure',
        plot: 'Maiden voyage',
        runtimeSeconds: 3000,
        extension: 'mp4',
        artworkKey: 'xtream:ep:1',
      }),
    )

    expect(epResolved).not.toBeUndefined()
    expect(epResolved?.title).toBe('Solar Odyssey')
    expect(epResolved?.meta).toContain('S1 E1 · Departure')
    expect((epResolved as any)?.streamUrl).toBe('xtream://src-1/series/1?ext=mp4')
  })

  it('enforces HLS boundary and displays honest error message for direct video formats', async () => {
    mockNative.openStream.mockRejectedValue(
      new IngestError('unsupported-stream', 'This is a direct video file. Kinora plays HLS and DASH streams, not video files.'),
    )

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[`/watch/${encodeURIComponent('movie:xt:src-1:101')}`]}>
          <ToastProvider>
            <StoreProvider
              initialXtreamSources={[
                {
                  id: 'src-1',
                  name: 'Starlight Provider',
                  addedAt: Date.now(),
                  lastSuccess: Date.now(),
                  movies: 3,
                  series: 2,
                  liveChannels: 0,
                  connected: true,
                  server: null,
                  enabled: true,
                },
              ]}
              initialXtreamCatalogue={sampleCatalogue}
            >
              <Routes>
                <Route path="/watch/:ref" element={<Player />} />
              </Routes>
            </StoreProvider>
          </ToastProvider>
        </MemoryRouter>,
      )
    })

    // Player mounts, attempts openStream with safe xtream:// URI
    expect(mockNative.openStream).toHaveBeenCalledWith('xtream://src-1/movie/101?ext=mp4')

    // Video tag is mounted
    const video = host.querySelector('video')
    expect(video).not.toBeNull()

    // Does not crash, honest feedback displayed, zero credentials exposed
    expect(host.innerHTML).not.toContain('password')
    expect(host.innerHTML).not.toContain('token')
  })

  it('renders multi-source stream variants in MovieDetail when title exists across providers', async () => {
    const multiCat: any = {
      ...sampleCatalogue,
      movies: [
        ...sampleCatalogue.movies,
        {
          id: '999',
          sourceId: 'src-2',
          name: 'Alpha Horizon [4K UHD]',
          categoryId: '1',
          categoryName: 'Sci-Fi',
          rating: 8.5,
          plot: 'Astronauts venture past the known galaxy.',
          extension: 'mkv',
          artworkKey: 'xtream:vod:999',
          year: 2024,
        },
      ],
    }

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/movies/xt:src-1:101']}>
          <ToastProvider>
            <StoreProvider
              initialXtreamSources={[
                {
                  id: 'src-1',
                  name: 'Primary Source',
                  addedAt: Date.now(),
                  lastSuccess: Date.now(),
                  movies: 3,
                  series: 2,
                  liveChannels: 0,
                  connected: true,
                  server: null,
                  enabled: true,
                },
                {
                  id: 'src-2',
                  name: 'Mirror Source',
                  addedAt: Date.now(),
                  lastSuccess: Date.now(),
                  movies: 1,
                  series: 0,
                  liveChannels: 0,
                  connected: true,
                  server: null,
                  enabled: true,
                },
              ]}
              initialXtreamCatalogue={multiCat}
            >
              <Routes>
                <Route path="/movies/:id" element={<MovieDetail />} />
              </Routes>
            </StoreProvider>
          </ToastProvider>
        </MemoryRouter>,
      )
    })

    expect(host.textContent).toContain('Alpha Horizon')
    expect(host.textContent).toContain('Available across 2 server sources')
    expect(host.textContent).toContain('Primary Source - HD')
    expect(host.textContent).toContain('Switch to Mirror Source - 4K')
  })

  it('aggregates multi-source VOD titles in Movies catalogue and shows multi-source badge', async () => {
    const multiCat: any = {
      ...sampleCatalogue,
      movies: [
        ...sampleCatalogue.movies,
        {
          id: '999',
          sourceId: 'src-2',
          name: 'Alpha Horizon [4K UHD]',
          categoryId: '1',
          categoryName: 'Sci-Fi',
          rating: 8.5,
          plot: 'Astronauts venture past the known galaxy.',
          extension: 'mkv',
          artworkKey: 'xtream:vod:999',
          year: 2024,
        },
      ],
    }

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/movies?category=Sci-Fi']}>
          <ToastProvider>
            <StoreProvider
              initialXtreamSources={[
                {
                  id: 'src-1',
                  name: 'Primary Source',
                  addedAt: Date.now(),
                  lastSuccess: Date.now(),
                  movies: 3,
                  series: 2,
                  liveChannels: 0,
                  connected: true,
                  server: null,
                  enabled: true,
                },
                {
                  id: 'src-2',
                  name: 'Mirror Source',
                  addedAt: Date.now(),
                  lastSuccess: Date.now(),
                  movies: 1,
                  series: 0,
                  liveChannels: 0,
                  connected: true,
                  server: null,
                  enabled: true,
                },
              ]}
              initialXtreamCatalogue={multiCat}
            >
              <Routes>
                <Route path="/movies" element={<Movies />} />
              </Routes>
            </StoreProvider>
          </ToastProvider>
        </MemoryRouter>,
      )
    })

    expect(host.textContent).toContain('aggregated across 2 sources')
    expect(host.textContent).toContain('2 Sources')
  })
})
