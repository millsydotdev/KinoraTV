import { useMemo, useState } from 'react'
import { NavLink, useNavigate, useSearchParams } from 'react-router-dom'
import { genresOf, movies } from '../data/catalog'
import { movieRef, runtimeLabel } from '../data/refs'
import type { Movie } from '../data/types'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { PosterCard, XtreamPosterCard } from '../components/Tiles'
import { StateBlock } from '../components/ui'
import {
  StreamingHero,
  StreamingGenreRow,
  StreamingRail,
  StreamingCard,
  StreamingEmptyState,
  StreamingProviderPrompt,
  getTechnicalBadges,
  type NavTabItem,
  type HeroSlideData,
  type GenreItem,
} from '../components/StreamingComponents'
import { filterKidSafeResources, filterKidSafeTitles, filterKidSafeXtreamTitles } from '../lib/kidsMode'
import { useProfiles } from '../state/profiles'
import { useStore } from '../state/store'
import './Browse.css'
import './MediaStreaming.css'

export function BrowseTabs() {
  return (
    <nav className="tabs" aria-label="Catalogue">
      <NavLink to="/movies" className="tab">Movies</NavLink>
      <NavLink to="/series" className="tab">TV Shows</NavLink>
    </nav>
  )
}

export function NoTitles({ kind, disabledSources, emptyCatalogue }: { kind: 'films' | 'series'; disabledSources?: boolean; emptyCatalogue?: boolean }) {
  const isMovies = kind === 'films'
  const store = useStore()
  const navigate = useNavigate()
  const hasSources = store.xtreamSources.length > 0
  const hasEnabled = store.xtreamSources.some((s) => s.enabled)
  const isAllDisabled = disabledSources ?? (hasSources && !hasEnabled)
  const isEmptyCat = emptyCatalogue ?? (hasEnabled && (isMovies ? store.xtreamCatalogue.movies.length === 0 : store.xtreamCatalogue.series.length === 0))

  return (
    <div className="streaming-page">
      <PageHeader
        title={isMovies ? 'Movies' : 'TV Shows'}
        searchPlaceholder={isMovies ? 'Search movies...' : 'Search TV shows...'}
      />
      <StreamingEmptyState
        kind={isMovies ? 'movies' : 'tv'}
        disabledSources={isAllDisabled}
        emptyCatalogue={isEmptyCat}
        onAddProvider={() => navigate('/sources')}
        onOpenSources={() => navigate('/sources')}
      />
    </div>
  )
}

const MOVIE_GENRES: GenreItem[] = [
  { id: 'action', name: 'Action', art: '/art/the-outpost.jpg' },
  { id: 'adventure', name: 'Adventure', art: '/art/salt-meridian.jpg' },
  { id: 'animation', name: 'Animation', art: '/art/live-kids.jpg' },
  { id: 'comedy', name: 'Comedy', art: '/art/midnight-arcade.jpg' },
  { id: 'crime', name: 'Crime', art: '/art/harbour-lights.jpg' },
  { id: 'documentary', name: 'Documentary', art: '/art/live-ocean.jpg' },
  { id: 'drama', name: 'Drama', art: '/art/kingsmoor.jpg' },
  { id: 'fantasy', name: 'Fantasy', art: '/art/ash-and-ivory.jpg' },
  { id: 'horror', name: 'Horror', art: '/art/undertow.jpg' },
  { id: 'sci-fi', name: 'Sci-Fi', art: '/art/low-orbit.jpg' },
  { id: 'thriller', name: 'Thriller', art: '/art/northern-trace.jpg' },
]

const MOVIE_TABS: NavTabItem[] = [
  { id: 'browse', label: 'Browse', icon: 'grid' },
  { id: 'collections', label: 'Collections', icon: 'folder' },
  { id: 'genres', label: 'Genres', icon: 'tag' },
  { id: 'new-releases', label: 'New Releases', icon: 'calendar' },
  { id: 'top-rated', label: 'Top Rated', icon: 'star' },
  { id: 'a-z', label: 'A-Z', icon: 'sortAsc' },
]

const sorts = {
  title: { label: 'Sort: Title A to Z', fn: (a: Movie, b: Movie) => a.title.localeCompare(b.title) },
  newest: { label: 'Sort: Newest', fn: (a: Movie, b: Movie) => b.year - a.year },
  oldest: { label: 'Sort: Oldest', fn: (a: Movie, b: Movie) => a.year - b.year },
  shortest: { label: 'Sort: Shortest', fn: (a: Movie, b: Movie) => a.runtime - b.runtime },
  added: { label: 'Sort: Recently added', fn: (a: Movie, b: Movie) => b.added.localeCompare(a.added) },
} as const
type SortKey = keyof typeof sorts

export function Movies() {
  const store = useStore()
  const { isKidsMode } = useProfiles()
  const { prefs, library } = store
  const [params, setParams] = useSearchParams()

  const [activeTab, setActiveTab] = useState<string>('browse')
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null)
  const [heroIndex, setHeroIndex] = useState(0)
  const [providerLimit, setProviderLimit] = useState(100)
  const [providerQuery, setProviderQuery] = useState('')

  const enabledSources = useMemo(() => store.xtreamSources.filter((s) => s.enabled), [store.xtreamSources])
  const enabledSourceIds = useMemo(() => new Set(enabledSources.map((s) => s.id)), [enabledSources])

  const safeXtreamMovies = useMemo(() => {
    const enabledMovies = store.xtreamCatalogue.movies.filter((m) => enabledSourceIds.has(m.sourceId))
    return filterKidSafeXtreamTitles(enabledMovies, isKidsMode)
  }, [store.xtreamCatalogue.movies, enabledSourceIds, isKidsMode])

  const vodCategories = useMemo(() => {
    const list = store.xtreamCatalogue.vodCategories.filter((c) => enabledSourceIds.has(c.sourceId))
    const seen = new Set<string>()
    return list.filter((c) => {
      if (seen.has(c.name)) return false
      seen.add(c.name)
      return true
    })
  }, [store.xtreamCatalogue.vodCategories, enabledSourceIds])

  const safeMovies = useMemo(() => {
    return filterKidSafeTitles(movies, isKidsMode)
  }, [isKidsMode])

  const isSampleProvider = typeof window !== 'undefined' && window.sessionStorage?.getItem('kinora.sample_provider_view') === '1'
  const hasXtream = store.xtreamSources.length > 0 && safeXtreamMovies.length > 0
  const hasDemo = (store.demoTitles || isSampleProvider) && safeMovies.length > 0

  // Public discovery cinema resources
  const publicDiscoveryFilms = useMemo(() => {
    const list = store.mediaLibrary.allResources.filter(
      (r) =>
        r.category === 'movies' ||
        r.subcategory === 'public-domain-films' ||
        r.subcategory === 'classic-cinema' ||
        r.subcategory === 'film-archives' ||
        r.subcategory === 'free-legal-streaming',
    )
    return isKidsMode ? filterKidSafeResources(list, true) : list
  }, [store.mediaLibrary.allResources, isKidsMode])

  const normalizedQuery = providerQuery.trim().toLowerCase()
  const category = params.get('category') ?? 'All'
  const provider = params.get('provider') ?? 'All'
  const year = params.get('year') ?? 'All'
  const sort = (params.get('sort') ?? 'title') as SortKey

  const setFilter = (key: string, value: string, fallback: string) => {
    const next = new URLSearchParams(params)
    if (value === fallback) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  // Filtered Xtream movies for catalogue searches/filters
  const filteredXtream = useMemo(() => {
    if (!hasXtream) return []
    return safeXtreamMovies
      .filter((m) => category === 'All' || m.categoryId === category || m.categoryName === category)
      .filter((m) => provider === 'All' || m.sourceId === provider)
      .filter((m) => year === 'All' || String(m.year) === year)
      .filter((m) => !selectedGenre || m.categoryName?.toLowerCase().includes(selectedGenre.toLowerCase()))
      .filter((m) => !prefs.hideWatched || !library.watched.includes(`movie:xt:${m.sourceId}:${m.id}`))
      .filter((m) => !normalizedQuery || m.name.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => {
        if (activeTab === 'new-releases' || sort === 'newest') return (b.year ?? 0) - (a.year ?? 0)
        if (sort === 'oldest') return (a.year ?? 0) - (b.year ?? 0)
        if (activeTab === 'top-rated') return (b.rating ?? 0) - (a.rating ?? 0) || (b.year ?? 0) - (a.year ?? 0)
        return a.name.localeCompare(b.name)
      })
  }, [hasXtream, safeXtreamMovies, category, provider, year, selectedGenre, prefs.hideWatched, library.watched, normalizedQuery, sort, activeTab])

  // Filtered demo movies
  const filteredDemo = useMemo(() => {
    if (!hasDemo) return []
    const topDemoIds = new Set(['low-orbit', 'the-salt-meridian', 'harbour-lights', 'neon-district', 'valley-of-ashes'])
    return safeMovies
      .filter((m) => category === 'All' || m.genres.some((g) => g.toLowerCase() === category.toLowerCase()))
      .filter((m) => year === 'All' || String(m.year) === year)
      .filter((m) => !selectedGenre || m.genres.some((g) => g.toLowerCase() === selectedGenre.toLowerCase()))
      .filter((m) => !prefs.hideWatched || !library.watched.includes(movieRef(m.id)))
      .filter((m) => !normalizedQuery || m.title.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => {
        if (activeTab === 'new-releases') return b.year - a.year
        if (activeTab === 'top-rated') {
          const aTop = topDemoIds.has(a.id) ? 1 : 0
          const bTop = topDemoIds.has(b.id) ? 1 : 0
          if (aTop !== bTop) return bTop - aTop
          return b.year - a.year
        }
        return sorts[sort]?.fn(a, b) ?? a.title.localeCompare(b.title)
      })
  }, [hasDemo, safeMovies, category, year, selectedGenre, prefs.hideWatched, library.watched, normalizedQuery, sort, activeTab])

  // Filtered public discovery movies
  const filteredPublicDiscovery = useMemo(() => {
    if (hasXtream || hasDemo) return []
    return publicDiscoveryFilms
      .filter((r) => !selectedGenre || r.tags.some((t) => t.toLowerCase().includes(selectedGenre.toLowerCase())) || r.subcategory.toLowerCase().includes(selectedGenre.toLowerCase()))
      .filter((r) => !normalizedQuery || r.name.toLowerCase().includes(normalizedQuery) || r.description.toLowerCase().includes(normalizedQuery) || r.provider.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => {
        if (sort === 'newest') return b.dateDiscovered.localeCompare(a.dateDiscovered)
        if (sort === 'oldest') return a.dateDiscovered.localeCompare(b.dateDiscovered)
        return a.name.localeCompare(b.name)
      })
  }, [hasXtream, hasDemo, publicDiscoveryFilms, selectedGenre, normalizedQuery, sort])

  // Top featured hero slides
  const heroSlides = useMemo<HeroSlideData[]>(() => {
    if (hasXtream) {
      return safeXtreamMovies.slice(0, 5).map((m) => ({
        id: `xt:${m.sourceId}:${m.id}`,
        kicker: 'FEATURED MOVIE',
        title: m.name,
        synopsis: m.plot || 'Stream this feature film directly through your connected on-demand provider.',
        art: undefined,
        artworkKey: m.artworkKey,
        year: m.year ?? 'VOD',
        genre: m.categoryName || 'Movie',
        runtime: undefined,
        ageRating: undefined,
        badges: getTechnicalBadges(m),
        playUrl: `/watch/${encodeURIComponent(`movie:xt:${m.sourceId}:${m.id}`)}`,
        detailUrl: `/movies/${encodeURIComponent(`xt:${m.sourceId}:${m.id}`)}`,
        itemRef: `movie:xt:${m.sourceId}:${m.id}`,
      }))
    }
    if (hasDemo) {
      const topMovies = [
        safeMovies.find((m) => m.id === 'low-orbit'),
        safeMovies.find((m) => m.id === 'the-salt-meridian'),
        safeMovies.find((m) => m.id === 'harbour-lights'),
        safeMovies.find((m) => m.id === 'neon-district'),
        safeMovies.find((m) => m.id === 'valley-of-ashes'),
      ].filter((m): m is Movie => !!m)

      return topMovies.map((m) => {
        const hours = Math.floor(m.runtime / 60)
        const mins = m.runtime % 60
        return {
          id: m.id,
          kicker: 'FEATURED MOVIE',
          title: m.title,
          synopsis: m.synopsis,
          art: m.art,
          backdropUrl: m.backdropUrl,
          year: m.year,
          genre: m.genres[0] || 'Drama',
          runtime: `${hours}h ${mins}m`,
          ageRating: m.certificate,
          badges: getTechnicalBadges(m),
          playUrl: `/watch/${encodeURIComponent(movieRef(m.id))}`,
          detailUrl: `/movies/${m.id}`,
          itemRef: movieRef(m.id),
        }
      })
    }
    if (publicDiscoveryFilms.length > 0) {
      return publicDiscoveryFilms.slice(0, 5).map((r) => ({
        id: r.id,
        kicker: 'PUBLIC DISCOVERY CINEMA',
        title: r.name,
        synopsis: r.description,
        art: r.artworkUrl,
        backdropUrl: r.artworkUrl,
        year: 'Public Archive',
        genre: r.subcategory.replace(/-/g, ' ').toUpperCase(),
        runtime: undefined,
        ageRating: undefined,
        badges: ['ARCHIVE', 'OPEN VOD'],
        playUrl: `/movies/${encodeURIComponent(r.id)}`,
        detailUrl: `/movies/${encodeURIComponent(r.id)}`,
        itemRef: `res:${r.id}`,
      }))
    }
    return []
  }, [hasXtream, hasDemo, publicDiscoveryFilms, safeXtreamMovies, safeMovies])

  // Rails data
  const trendingXtream = useMemo(() => safeXtreamMovies.slice(0, 8), [safeXtreamMovies])
  const trendingDemo = useMemo(() => safeMovies.slice(0, 8), [safeMovies])
  const trendingPublicDiscovery = useMemo(() => publicDiscoveryFilms.slice(0, 8), [publicDiscoveryFilms])

  const newReleaseXtream = useMemo(() => {
    return [...safeXtreamMovies].sort((a, b) => (b.year ?? 0) - (a.year ?? 0)).slice(0, 8)
  }, [safeXtreamMovies])
  const newReleaseDemo = useMemo(() => {
    return [...safeMovies].sort((a, b) => b.year - a.year).slice(0, 8)
  }, [safeMovies])
  const newReleasePublicDiscovery = useMemo(() => publicDiscoveryFilms.slice(4, 12), [publicDiscoveryFilms])

  const popularXtream = useMemo(() => safeXtreamMovies.slice(4, 12), [safeXtreamMovies])
  const popularDemo = useMemo(() => {
    return [...safeMovies].sort((a, b) => a.title.localeCompare(b.title)).slice(0, 8)
  }, [safeMovies])
  const popularPublicDiscovery = useMemo(() => publicDiscoveryFilms.slice(8, 16), [publicDiscoveryFilms])

  const continueWatchingMovies = useMemo(() => {
    if (hasDemo) {
      return safeMovies.filter((m) => Boolean(library.progress[movieRef(m.id)]))
    }
    return []
  }, [hasDemo, safeMovies, library.progress])

  const myListXtream = useMemo(() => {
    if (hasXtream) {
      return safeXtreamMovies.filter((m) => library.watchlist.includes(`movie:xt:${m.sourceId}:${m.id}`))
    }
    return []
  }, [hasXtream, safeXtreamMovies, library.watchlist])

  const myListDemo = useMemo(() => {
    if (hasDemo) {
      return safeMovies.filter((m) => library.watchlist.includes(movieRef(m.id)))
    }
    return []
  }, [hasDemo, safeMovies, library.watchlist])

  const myListPublicDiscovery = useMemo(() => {
    if (!hasXtream && !hasDemo) {
      return publicDiscoveryFilms.filter((r) => store.mediaLibrary.isInPersonalLibrary(r.id) || library.watchlist.includes(`res:${r.id}`))
    }
    return []
  }, [hasXtream, hasDemo, publicDiscoveryFilms, store.mediaLibrary, library.watchlist])

  const isFiltering = category !== 'All' || provider !== 'All' || year !== 'All' || Boolean(normalizedQuery) || Boolean(selectedGenre) || activeTab === 'a-z'

  const sourceName = (id: string) => store.xtreamSources.find((s) => s.id === id)?.name ?? 'Provider'

  return (
    <div className="streaming-page">
      <PageHeader
        title={
          <div className="streaming-title-group">
            <div className="streaming-icon-badge" aria-hidden="true">
              <Icon name="film" size={20} />
            </div>
            <div className="streaming-title-meta">
              <span className="streaming-title">Movies</span>
              <span className="streaming-subtitle">Discover, watch and manage your movie collection.</span>
            </div>
          </div>
        }
        searchPlaceholder="Search movies, TV shows, channels..."
      />

      {/* Sub-Navigation Tabs */}
      <div className="streaming-header-wrap" style={{ paddingTop: 0, paddingBottom: 14 }}>
        <nav className="streaming-nav-tabs" aria-label="Movies browsing sections">
          {MOVIE_TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                className={`streaming-nav-pill ${isActive ? 'is-active' : ''}`}
                aria-pressed={isActive}
                onClick={() => {
                  setActiveTab(tab.id)
                  if (tab.id === 'genres') setSelectedGenre(null)
                }}
              >
                <Icon name={tab.icon} size={15} />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Filter and Search Bar for Test and Filter Parity */}
      <div
        className={activeTab === 'browse' && !isFiltering ? 'streaming-compat-controls' : 'browse-bar'}
        style={activeTab === 'browse' && !isFiltering ? undefined : { padding: '12px 40px', background: 'var(--surface-1)', borderBottom: '1px solid var(--line)', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}
      >
        <label className="provider-search" style={{ margin: 0, flex: '1 1 200px', minWidth: '180px' }}>
          <span className="sr-only">Search movies</span>
          <input
            className="input"
            type="search"
            value={providerQuery}
            onChange={(e) => {
              setProviderQuery(e.target.value)
              setProviderLimit(100)
            }}
            placeholder="Search movies..."
          />
        </label>

        <div className="filters" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <select
            className="select select-inline"
            value={category}
            onChange={(e) => {
              setFilter('category', e.target.value, 'All')
              setProviderLimit(100)
            }}
            aria-label="Category"
          >
            <option value="All">All Categories</option>
            {hasXtream && vodCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
            {!hasXtream && genresOf(safeMovies).map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>

          {hasXtream && enabledSources.length > 1 && (
            <select
              className="select select-inline"
              value={provider}
              onChange={(e) => {
                setFilter('provider', e.target.value, 'All')
                setProviderLimit(100)
              }}
              aria-label="Provider"
            >
              <option value="All">All Providers</option>
              {enabledSources.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}

          <select
            className="select select-inline"
            value={params.get('sort') ?? 'title'}
            onChange={(e) => {
              setFilter('sort', e.target.value, 'title')
              setProviderLimit(100)
            }}
            aria-label="Sort"
          >
            <option value="title">Sort: Title A to Z</option>
            <option value="newest">Sort: Newest</option>
            <option value="oldest">Sort: Oldest</option>
          </select>
        </div>

        {selectedGenre && (
          <button
            type="button"
            className="pill pill-pending"
            style={{ cursor: 'pointer', border: '1px solid var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={() => setSelectedGenre(null)}
            title="Clear genre filter"
          >
            <span>Genre: {selectedGenre}</span>
            <Icon name="close" size={14} />
          </button>
        )}
      </div>

      {/* Main Streaming Discovery View (Browse Tab) */}
      {activeTab === 'browse' && !isFiltering && (
        <>
          {/* Featured Hero Stage */}
          <StreamingHero
            slides={heroSlides}
            activeIndex={heroIndex}
            onPrev={() => setHeroIndex((i) => (i - 1 + heroSlides.length) % heroSlides.length)}
            onNext={() => setHeroIndex((i) => (i + 1) % heroSlides.length)}
            onSelectIndex={setHeroIndex}
          />

          <div className="streaming-body">
            {!hasXtream && <StreamingProviderPrompt kind="movies" />}

            {/* Browse by Genre Row */}
            <StreamingGenreRow
              genres={MOVIE_GENRES}
              selectedGenre={selectedGenre}
              onSelectGenre={(genreName) => {
                setSelectedGenre(genreName)
                setActiveTab('browse')
              }}
              onViewAll={() => setActiveTab('genres')}
            />

            {/* Trending Movies Rail */}
            <StreamingRail
              title={hasXtream ? "Trending Movies" : hasDemo ? "Trending Movies" : "Preserved Cinema & Film Archives"}
              iconName="flame"
              iconColor="var(--accent)"
              onSeeAll={() => setActiveTab('a-z')}
            >
              {hasXtream
                ? trendingXtream.map((m) => {
                    const routeId = `xt:${m.sourceId}:${m.id}`
                    const isWatched = library.watched.includes(`movie:${routeId}`)
                    return (
                      <StreamingCard
                        key={routeId}
                        to={`/movies/${encodeURIComponent(routeId)}`}
                        title={m.name}
                        sub={[m.year, sourceName(m.sourceId)].filter(Boolean).join(' · ')}
                        artworkKey={m.artworkKey}
                        badges={getTechnicalBadges(m)}
                        itemRef={`movie:${routeId}`}
                        watched={isWatched}
                      />
                    )
                  })
                : hasDemo
                ? trendingDemo.map((movie) => {
                    const ref = movieRef(movie.id)
                    const isWatched = library.watched.includes(ref)
                    const progress = library.progress[ref]
                    return (
                      <StreamingCard
                        key={movie.id}
                        to={`/movies/${movie.id}`}
                        title={movie.title}
                        sub={`${movie.year} · ${movie.genres[0] || 'Film'} · ${runtimeLabel(movie.runtime)}`}
                        art={movie.art}
                        badges={getTechnicalBadges(movie)}
                        itemRef={ref}
                        watched={isWatched}
                        progress={progress?.dur ? progress.pos / progress.dur : undefined}
                      />
                    )
                  })
                : trendingPublicDiscovery.map((r) => (
                    <StreamingCard
                      key={r.id}
                      to={`/movies/${encodeURIComponent(r.id)}`}
                      title={r.name}
                      sub={[r.provider, r.country ?? 'Open Archive'].filter(Boolean).join(' · ')}
                      art={r.artworkUrl}
                      badges={['ARCHIVE']}
                      itemRef={`res:${r.id}`}
                    />
                  ))}
            </StreamingRail>

            {/* New Releases Rail */}
            <StreamingRail
              title={hasXtream ? "New Releases" : hasDemo ? "New Releases" : "National Registries & Classic Collections"}
              iconName="calendar"
              onSeeAll={() => setActiveTab('new-releases')}
            >
              {hasXtream
                ? newReleaseXtream.map((m) => {
                    const routeId = `xt:${m.sourceId}:${m.id}`
                    return (
                      <StreamingCard
                        key={routeId}
                        to={`/movies/${encodeURIComponent(routeId)}`}
                        title={m.name}
                        sub={[m.year, sourceName(m.sourceId)].filter(Boolean).join(' · ')}
                        artworkKey={m.artworkKey}
                        badges={getTechnicalBadges(m)}
                        itemRef={`movie:${routeId}`}
                      />
                    )
                  })
                : hasDemo
                ? newReleaseDemo.map((movie) => {
                    return (
                      <StreamingCard
                        key={movie.id}
                        to={`/movies/${movie.id}`}
                        title={movie.title}
                        sub={`${movie.year} · ${movie.genres[0] || 'Film'}`}
                        art={movie.art}
                        badges={getTechnicalBadges(movie)}
                        itemRef={movieRef(movie.id)}
                      />
                    )
                  })
                : newReleasePublicDiscovery.map((r) => (
                    <StreamingCard
                      key={r.id}
                      to={`/movies/${encodeURIComponent(r.id)}`}
                      title={r.name}
                      sub={[r.provider, r.country ?? 'Open Archive'].filter(Boolean).join(' · ')}
                      art={r.artworkUrl}
                      badges={['ARCHIVE']}
                      itemRef={`res:${r.id}`}
                    />
                  ))}
            </StreamingRail>

            {/* Popular Movies Rail */}
            <StreamingRail
              title={hasXtream ? "Popular Movies" : hasDemo ? "Popular Movies" : "Documentary & Cultural Archives"}
              iconName="star"
              onSeeAll={() => setActiveTab('top-rated')}
            >
              {hasXtream
                ? popularXtream.map((m) => (
                    <StreamingCard
                      key={`pop-xt-${m.id}`}
                      to={`/movies/${encodeURIComponent(`xt:${m.sourceId}:${m.id}`)}`}
                      title={m.name}
                      sub={[m.year, sourceName(m.sourceId)].filter(Boolean).join(' · ')}
                      artworkKey={m.artworkKey}
                      badges={getTechnicalBadges(m)}
                      itemRef={`movie:xt:${m.sourceId}:${m.id}`}
                    />
                  ))
                : hasDemo
                ? popularDemo.map((movie) => {
                    return (
                      <StreamingCard
                        key={`pop-${movie.id}`}
                        to={`/movies/${movie.id}`}
                        title={movie.title}
                        sub={`${movie.year} · ${movie.genres[0] || 'Film'}`}
                        art={movie.art}
                        badges={getTechnicalBadges(movie)}
                        itemRef={movieRef(movie.id)}
                      />
                    )
                  })
                : popularPublicDiscovery.map((r) => (
                    <StreamingCard
                      key={r.id}
                      to={`/movies/${encodeURIComponent(r.id)}`}
                      title={r.name}
                      sub={[r.provider, r.country ?? 'Open Archive'].filter(Boolean).join(' · ')}
                      art={r.artworkUrl}
                      badges={['OPEN ACCESS']}
                      itemRef={`res:${r.id}`}
                    />
                  ))}
            </StreamingRail>

            {/* Continue Watching Rail if progress exists */}
            {continueWatchingMovies.length > 0 && (
              <StreamingRail
                title="Continue Watching"
                iconName="clock"
                onSeeAll={() => setActiveTab('browse')}
              >
                {continueWatchingMovies.map((movie) => {
                  const ref = movieRef(movie.id)
                  const prog = library.progress[ref]
                  return (
                    <StreamingCard
                      key={`cw-${movie.id}`}
                      to={`/watch/${encodeURIComponent(ref)}`}
                      title={movie.title}
                      sub={`${movie.year} · Resume`}
                      art={movie.art}
                      badges={getTechnicalBadges(movie)}
                      itemRef={ref}
                      progress={prog?.dur ? prog.pos / prog.dur : undefined}
                    />
                  )
                })}
              </StreamingRail>
            )}

            {/* My List Rail if items saved */}
            {(myListXtream.length > 0 || myListDemo.length > 0 || myListPublicDiscovery.length > 0) && (
              <StreamingRail
                title="My List"
                iconName="bookmark"
                onSeeAll={() => setActiveTab('browse')}
              >
                {hasXtream
                  ? myListXtream.map((m) => (
                      <StreamingCard
                        key={`ml-xt-${m.id}`}
                        to={`/movies/${encodeURIComponent(`xt:${m.sourceId}:${m.id}`)}`}
                        title={m.name}
                        sub={[m.year, sourceName(m.sourceId)].filter(Boolean).join(' · ')}
                        artworkKey={m.artworkKey}
                        badges={getTechnicalBadges(m)}
                        itemRef={`movie:xt:${m.sourceId}:${m.id}`}
                      />
                    ))
                  : hasDemo
                  ? myListDemo.map((movie) => {
                      return (
                        <StreamingCard
                          key={`ml-${movie.id}`}
                          to={`/movies/${movie.id}`}
                          title={movie.title}
                          sub={`${movie.year} · In My List`}
                          art={movie.art}
                          badges={getTechnicalBadges(movie)}
                          itemRef={movieRef(movie.id)}
                        />
                      )
                    })
                  : myListPublicDiscovery.map((r) => (
                      <StreamingCard
                        key={`ml-${r.id}`}
                        to={`/movies/${encodeURIComponent(r.id)}`}
                        title={r.name}
                        sub={`${r.provider} · Saved`}
                        art={r.artworkUrl}
                        badges={['SAVED']}
                        itemRef={`res:${r.id}`}
                      />
                    ))}
              </StreamingRail>
            )}
          </div>
        </>
      )}

      {/* Collections Tab View */}
      {activeTab === 'collections' && (
        <div className="streaming-body" style={{ paddingTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Custom Collections</h2>
              <p className="faint" style={{ margin: '4px 0 0 0', fontSize: '0.875rem' }}>
                Curate and organize your favorite films into custom playlists.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => {
                window.location.href = '/library?tab=collections'
              }}
            >
              <Icon name="folder" size={15} />
              <span>Manage in Library</span>
            </button>
          </div>

          {library.collections.length === 0 ? (
            <StateBlock
              icon="folder"
              title="No collections yet"
              action={
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setActiveTab('browse')}
                >
                  Browse movies
                </button>
              }
            >
              Create custom collections in your Library or add films from any details page.
            </StateBlock>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {library.collections.map((col) => (
                <div
                  key={col.id}
                  className="panel"
                  style={{ padding: 18, borderRadius: 8, cursor: 'pointer', background: 'var(--surface-1)', border: '1px solid var(--line)' }}
                  onClick={() => {
                    window.location.href = `/library?tab=collections&c=${encodeURIComponent(col.id)}`
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <Icon name="folder" size={20} />
                    <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-1)' }}>{col.name}</span>
                  </div>
                  <p className="faint" style={{ margin: 0, fontSize: '0.85rem' }}>
                    {col.items.length} item{col.items.length === 1 ? '' : 's'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Genres Tab View (Full Grid when no specific genre selected) */}
      {activeTab === 'genres' && !selectedGenre && (
        <div className="streaming-body" style={{ paddingTop: 24 }}>
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Browse by Genre</h2>
            <p className="faint" style={{ margin: '4px 0 0 0', fontSize: '0.875rem' }}>
              Explore feature films categorized by themes, moods and storytelling styles.
            </p>
          </div>
          <div className="streaming-genre-grid">
            {MOVIE_GENRES.map((g) => (
              <button
                key={g.id}
                type="button"
                className="streaming-genre-tile"
                onClick={() => setSelectedGenre(g.name)}
              >
                <img src={g.art} alt="" className="streaming-genre-art" />
                <span className="streaming-genre-label">{g.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filtered Grid or Non-Browse Tab View */}
      {activeTab !== 'collections' && (activeTab !== 'genres' || Boolean(selectedGenre)) && (isFiltering || activeTab !== 'browse') && (
        <div className="streaming-body" style={{ paddingTop: 20 }}>
          {hasXtream ? (
            <div>
              <p className="browse-count faint">
                Showing {Math.min(filteredXtream.length, providerLimit)} of {filteredXtream.length} movies from Starlight Provider and connected sources.
              </p>
              {filteredXtream.length === 0 ? (
                <StateBlock
                  icon="search"
                  title="No movies match your criteria"
                  action={
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        setParams({}, { replace: true })
                        setProviderQuery('')
                        setSelectedGenre(null)
                        setActiveTab('browse')
                      }}
                    >
                      Clear filters
                    </button>
                  }
                >
                  Try clearing the search query or changing category filters.
                </StateBlock>
              ) : (
                <div className="grid-posters">
                  {filteredXtream.slice(0, providerLimit).map((movie) => {
                    const routeId = `xt:${movie.sourceId}:${movie.id}`
                    const line = [movie.year, sourceName(movie.sourceId)].filter(Boolean).join(' · ')
                    const ref = `movie:${routeId}`
                    const isWatched = library.watched.includes(ref)
                    return (
                      <XtreamPosterCard
                        key={`${movie.sourceId}:${movie.id}`}
                        to={`/movies/${encodeURIComponent(routeId)}`}
                        title={movie.name}
                        artworkKey={movie.artworkKey}
                        line={line}
                        year={movie.year}
                        flag={isWatched ? <><Icon name="check" size={12} />Watched</> : undefined}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          ) : hasDemo ? (
            <div>
              <p className="browse-count faint">
                Showing {filteredDemo.length} movies in development mock catalogue.
              </p>
              {filteredDemo.length === 0 ? (
                <StateBlock
                  icon="film"
                  title="No movies found"
                  action={
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        setParams({}, { replace: true })
                        setProviderQuery('')
                        setSelectedGenre(null)
                        setActiveTab('browse')
                      }}
                    >
                      Reset filters
                    </button>
                  }
                >
                  Try selecting another category or resetting the search term.
                </StateBlock>
              ) : (
                <div className="grid-posters">
                  {filteredDemo.map((movie) => (
                    <PosterCard
                      key={movie.id}
                      to={`/movies/${movie.id}`}
                      title={movie.title}
                      art={movie.art}
                      focus={movie.focus}
                      line={`${movie.year} · ${movie.certificate} · ${runtimeLabel(movie.runtime)}`}
                      flag={library.watched.includes(movieRef(movie.id)) ? <><Icon name="check" size={12} />Watched</> : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <p className="browse-count faint">
                Showing {filteredPublicDiscovery.length} films and archives in public discovery catalogue.
              </p>
              {filteredPublicDiscovery.length === 0 ? (
                <StateBlock
                  icon="film"
                  title="No movies found"
                  action={
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        setParams({}, { replace: true })
                        setProviderQuery('')
                        setSelectedGenre(null)
                        setActiveTab('browse')
                      }}
                    >
                      Reset filters
                    </button>
                  }
                >
                  Try selecting another genre or clearing the search query.
                </StateBlock>
              ) : (
                <div className="grid-posters">
                  {filteredPublicDiscovery.map((r) => (
                    <PosterCard
                      key={r.id}
                      to={`/movies/${encodeURIComponent(r.id)}`}
                      title={r.name}
                      art={r.artworkUrl}
                      line={[r.provider, r.country ?? 'Open Archive'].filter(Boolean).join(' · ')}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
