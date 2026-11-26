import { useMemo, useState } from 'react'
import { NavLink, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { genresOf, movies } from '../data/catalog'
import { OPEN_MOVIES } from '../data/openCatalogue'
import { movieRef, runtimeLabel } from '../data/refs'
import type { Movie } from '../data/types'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { PosterCard, XtreamPosterCard } from '../components/Tiles'
import { GenreCard } from '../components/GenreCard'
import { Art, StateBlock } from '../components/ui'
import { useToast } from '../components/Toast'
import { ShareModal } from '../components/ShareModal'
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
import { GENRES_BY_MEDIA_TYPE, getGenreById, getSubgenresForParent, type GenreDefinition } from '../data/genreTaxonomy'
import { useProfiles } from '../state/profiles'
import { useStore } from '../state/store'
import { useLocalMedia } from '../state/localMedia'
import { TrailerPlayerModal } from '../components/TrailerPlayerModal'
import { aggregateVodTitles } from '../lib/vodAggregation'
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
    <div className="streaming-page movies-screen">
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

const MOVIE_GENRE_DEFS: GenreDefinition[] = GENRES_BY_MEDIA_TYPE.movies
const MOVIE_GENRES: GenreItem[] = MOVIE_GENRE_DEFS.map((g) => ({
  id: g.id,
  name: g.name,
}))

const MOVIE_TABS: NavTabItem[] = [
  { id: 'browse', label: 'All Movies', icon: 'grid' },
  { id: 'popular', label: 'Popular', icon: 'flame' },
  { id: 'top-rated', label: 'Top Rated', icon: 'star' },
  { id: 'new-releases', label: 'New Releases', icon: 'calendar' },
  { id: 'genres', label: 'Genres', icon: 'tag' },
  { id: 'year', label: 'Year', icon: 'calendar' },
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
  const toast = useToast()
  const navigate = useNavigate()
  const { isKidsMode } = useProfiles()
  const { prefs, library } = store
  const [params, setParams] = useSearchParams()

  const [activeTab, setActiveTab] = useState<string>('browse')
  const [selectedMovie, setSelectedMovie] = useState<any>(null)
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null)
  const [selectedSubgenre, setSelectedSubgenre] = useState<string | null>(null)
  const [heroIndex, setHeroIndex] = useState(0)
  const [trailerModal, setTrailerModal] = useState<{
    open: boolean
    title: string
    trailerUrl?: string | null
    posterUrl?: string
    playFullUrl?: string
  }>({ open: false, title: '' })
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

  const openMovies = useMemo(() => {
    return filterKidSafeTitles(OPEN_MOVIES, isKidsMode)
  }, [isKidsMode])

  const isSampleProvider = typeof window !== 'undefined' && window.sessionStorage?.getItem('kinora.sample_provider_view') === '1'
  const { catalogue: localCatalogue } = useLocalMedia()
  const hasXtream = store.xtreamSources.length > 0 && safeXtreamMovies.length > 0
  const hasDemo = (store.demoTitles || isSampleProvider) && safeMovies.length > 0
  const activeCinemaMovies = useMemo(() => hasDemo ? safeMovies : openMovies, [hasDemo, safeMovies, openMovies])

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

  const activeParentGenre = useMemo(() => {
    if (!selectedGenre) return null
    return getGenreById(selectedGenre)
  }, [selectedGenre])

  const subgenres = useMemo(() => {
    if (!activeParentGenre) return []
    return getSubgenresForParent(activeParentGenre.id)
  }, [activeParentGenre])

  const genreMatches = (itemGenres: string[], itemCat?: string, itemText?: string): boolean => {
    if (!selectedGenre) return true
    if (selectedSubgenre && activeParentGenre) {
      const sub = subgenres.find((s: GenreDefinition) => s.id === selectedSubgenre)
      const targetName = (sub?.name ?? selectedSubgenre).toLowerCase()
      const targetId = selectedSubgenre.toLowerCase()
      return (
        itemGenres.some((g) => g.toLowerCase().includes(targetName) || g.toLowerCase().includes(targetId)) ||
        Boolean(itemCat && (itemCat.toLowerCase().includes(targetName) || itemCat.toLowerCase().includes(targetId))) ||
        Boolean(itemText && (itemText.toLowerCase().includes(targetName) || itemText.toLowerCase().includes(targetId)))
      )
    }
    if (activeParentGenre) {
      const names = [
        activeParentGenre.name.toLowerCase(),
        activeParentGenre.id.toLowerCase(),
        ...activeParentGenre.aliases.map((a: string) => a.toLowerCase()),
      ]
      return (
        itemGenres.some((g) => names.some((n) => g.toLowerCase().includes(n))) ||
        Boolean(itemCat && names.some((n) => itemCat.toLowerCase().includes(n))) ||
        Boolean(itemText && names.some((n) => itemText.toLowerCase().includes(n)))
      )
    }
    return (
      itemGenres.some((g) => g.toLowerCase() === selectedGenre.toLowerCase()) ||
      Boolean(itemCat && itemCat.toLowerCase().includes(selectedGenre.toLowerCase()))
    )
  }

  // Filtered Xtream movies for catalogue searches/filters
  const filteredXtream = useMemo(() => {
    if (!hasXtream) return []
    return safeXtreamMovies
      .filter((m) => category === 'All' || m.categoryId === category || m.categoryName === category)
      .filter((m) => provider === 'All' || m.sourceId === provider)
      .filter((m) => year === 'All' || String(m.year) === year)
      .filter((m) => genreMatches([], m.categoryName ?? undefined, m.name))
      .filter((m) => !prefs.hideWatched || !library.watched.includes(`movie:xt:${m.sourceId}:${m.id}`))
      .filter((m) => !normalizedQuery || m.name.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => {
        if (activeTab === 'new-releases' || sort === 'newest') return (b.year ?? 0) - (a.year ?? 0)
        if (sort === 'oldest') return (a.year ?? 0) - (b.year ?? 0)
        if (activeTab === 'top-rated') return (b.rating ?? 0) - (a.rating ?? 0) || (b.year ?? 0) - (a.year ?? 0)
        return a.name.localeCompare(b.name)
      })
  }, [hasXtream, safeXtreamMovies, category, provider, year, selectedGenre, selectedSubgenre, activeParentGenre, prefs.hideWatched, library.watched, normalizedQuery, sort, activeTab])

  const sourceNames = useMemo(() => {
    const map: Record<string, string> = {}
    for (const s of enabledSources) {
      map[s.id] = s.name
    }
    return map
  }, [enabledSources])

  // Multi-source aggregated titles for unified catalogue browsing
  const displayedXtream = useMemo(() => {
    if (enabledSources.length > 1 && provider === 'All') {
      return aggregateVodTitles(filteredXtream, sourceNames)
    }
    return filteredXtream.map((m) => ({ ...m, variants: [], totalSources: 1 }))
  }, [filteredXtream, enabledSources.length, provider, sourceNames])

  // Filtered catalogue movies (curated demo or verified open cinema)
  const filteredDemo = useMemo(() => {
    if (!hasDemo && openMovies.length === 0) return []
    const topDemoIds = new Set(['low-orbit', 'the-salt-meridian', 'harbour-lights', 'neon-district', 'valley-of-ashes'])
    return activeCinemaMovies
      .filter((m) => category === 'All' || m.genres.some((g) => g.toLowerCase() === category.toLowerCase()))
      .filter((m) => year === 'All' || String(m.year) === year)
      .filter((m) => genreMatches(m.genres, undefined, m.title + ' ' + m.synopsis))
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
  }, [hasDemo, openMovies.length, activeCinemaMovies, category, year, selectedGenre, selectedSubgenre, activeParentGenre, prefs.hideWatched, library.watched, normalizedQuery, sort, activeTab])

  // Filtered public discovery movies
  const filteredPublicDiscovery = useMemo(() => {
    if (hasXtream || hasDemo) return []
    return publicDiscoveryFilms
      .filter((r) => genreMatches(r.tags ?? [], r.subcategory, r.name + ' ' + r.description))
      .filter((r) => !normalizedQuery || r.name.toLowerCase().includes(normalizedQuery) || r.description.toLowerCase().includes(normalizedQuery) || r.provider.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => {
        if (sort === 'newest') return b.dateDiscovered.localeCompare(a.dateDiscovered)
        if (sort === 'oldest') return a.dateDiscovered.localeCompare(b.dateDiscovered)
        return a.name.localeCompare(b.name)
      })
  }, [hasXtream, hasDemo, publicDiscoveryFilms, selectedGenre, selectedSubgenre, activeParentGenre, normalizedQuery, sort])

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
      const demoList = [
        safeMovies.find((m) => m.id === 'low-orbit'),
        safeMovies.find((m) => m.id === 'the-salt-meridian'),
        safeMovies.find((m) => m.id === 'harbour-lights'),
        safeMovies.find((m) => m.id === 'neon-district'),
        safeMovies.find((m) => m.id === 'valley-of-ashes'),
      ].filter((m): m is Movie => !!m)
      const listToUse = demoList.length > 0 ? demoList : safeMovies.slice(0, 5)

      const topMovies: HeroSlideData[] = listToUse.map((m, idx) => {
        const hours = Math.floor(m.runtime / 60)
        const mins = m.runtime % 60
        return {
          id: m.id,
          kicker: idx === 0 ? 'TRENDING NOW' : 'FEATURED MOVIE',
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
          trailerUrl: m.trailerUrl,
        }
      })
      return topMovies
    }
    if (openMovies.length > 0) {
      return openMovies.slice(0, 5).map((m, idx) => {
        const hours = Math.floor(m.runtime / 60)
        const mins = m.runtime % 60
        return {
          id: m.id,
          kicker: idx === 0 ? 'FEATURED CINEMA' : 'CLASSIC MOVIE',
          title: m.title,
          synopsis: m.synopsis,
          art: m.art,
          backdropUrl: m.backdropUrl || m.art,
          year: m.year,
          genre: m.genres[0] || 'Drama',
          runtime: `${hours}h ${mins}m`,
          ageRating: m.certificate,
          badges: getTechnicalBadges(m),
          playUrl: `/watch/${encodeURIComponent(movieRef(m.id))}`,
          detailUrl: `/movies/${m.id}`,
          itemRef: movieRef(m.id),
          trailerUrl: m.trailerUrl,
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
  const trendingCatalogue = useMemo(() => activeCinemaMovies.slice(0, 8), [activeCinemaMovies])

  const newReleaseXtream = useMemo(() => {
    return [...safeXtreamMovies].sort((a, b) => (b.year ?? 0) - (a.year ?? 0)).slice(0, 8)
  }, [safeXtreamMovies])
  const newReleaseCatalogue = useMemo(() => {
    return [...activeCinemaMovies].sort((a, b) => b.year - a.year).slice(0, 8)
  }, [activeCinemaMovies])

  const popularXtream = useMemo(() => safeXtreamMovies.slice(4, 12), [safeXtreamMovies])
  const popularDemo = useMemo(() => {
    return [...safeMovies].sort((a, b) => a.title.localeCompare(b.title)).slice(0, 8)
  }, [safeMovies])
  const popularCatalogue = useMemo(() => {
    return [...activeCinemaMovies].sort((a, b) => a.title.localeCompare(b.title)).slice(0, 8)
  }, [activeCinemaMovies])
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

  const availableCategories = useMemo(() => {
    if (hasXtream) return vodCategories.map((c) => ({ id: c.id, name: c.name }))
    if (hasDemo || openMovies.length > 0) return genresOf(activeCinemaMovies).map((g) => ({ id: g, name: g }))
    const set = new Set<string>()
    for (const r of publicDiscoveryFilms) {
      if (r.tags) {
        for (const t of r.tags) set.add(t)
      }
    }
    return Array.from(set).sort().map((t) => ({ id: t, name: t }))
  }, [hasXtream, vodCategories, hasDemo, openMovies.length, activeCinemaMovies, publicDiscoveryFilms])

  const isFiltering = category !== 'All' || provider !== 'All' || year !== 'All' || Boolean(normalizedQuery) || Boolean(selectedGenre) || activeTab === 'a-z'

  const sourceName = (id: string) => store.xtreamSources.find((s) => s.id === id)?.name ?? 'Provider'

  const defaultSelectedMovie = useMemo(() => {
    const firstMovie = safeMovies[0]
    if (firstMovie) {
      const hours = Math.floor(firstMovie.runtime / 60)
      const mins = firstMovie.runtime % 60
      return {
        id: firstMovie.id,
        title: firstMovie.title,
        year: String(firstMovie.year),
        genre: firstMovie.genres.join(', ') || 'Drama',
        runtime: `${hours}h ${mins}m`,
        ageRating: firstMovie.certificate || '12A',
        rating: '8.5',
        ratingCount: '500K',
        tomatoRating: '92%',
        synopsis: firstMovie.synopsis,
        director: 'Director',
        cast: 'Cast',
        language: firstMovie.audio.join(', ') || 'English',
        subtitles: firstMovie.subtitles.join(', ') || 'Multiple',
        art: firstMovie.art,
        playUrl: `/watch/${encodeURIComponent(movieRef(firstMovie.id))}`,
        imdbId: 'tt1234567',
        similar: safeMovies.slice(1, 5).map((sm) => ({
          id: sm.id,
          title: `${sm.title} (${sm.year})`,
          year: sm.year,
          art: sm.art,
          to: `/movies/${sm.id}`,
        })),
      }
    }
    return {
      id: 'demo-movie',
      title: 'Featured Movie',
      year: '2024',
      genre: 'Drama',
      runtime: '2h 00m',
      ageRating: '12A',
      rating: '8.0',
      ratingCount: '100K',
      tomatoRating: '90%',
      synopsis: 'Featured cinema presentation on Kinora.',
      director: 'Director',
      cast: 'Cast',
      language: 'English',
      subtitles: 'Multiple',
      art: '',
      playUrl: '/movies',
      imdbId: 'tt0000000',
      similar: [],
    }
  }, [safeMovies])

  const [shareModalOpen, setShareModalOpen] = useState(false)
  const activeMovie = selectedMovie

  const sidePanel = (
    <aside
      className={`movies-side-panel ${activeMovie ? 'is-open' : ''}`}
      aria-label="Movie Details"
    >
      {activeMovie ? (
        <>
          <div className="movies-side-head-bar">
            <span className="movies-side-head-label">Quick Look</span>
            <button
              type="button"
              className="movies-side-close-btn"
              onClick={() => setSelectedMovie(null)}
              aria-label="Close movie details"
            >
              <Icon name="close" size={16} />
            </button>
          </div>

          <div className="movies-side-poster-wrap">
            {activeMovie.art ? (
              <Art
                src={activeMovie.art}
                alt={activeMovie.title}
                contentId={activeMovie.id}
                fallbackIcon="film"
                className="movies-side-poster-img"
              />
            ) : (
              <div className="movies-side-poster-fallback">
                <Icon name="film" size={40} />
              </div>
            )}
            <Link to={activeMovie.playUrl} className="movies-side-play-overlay" aria-label={`Play ${activeMovie.title}`}>
              <div className="movies-side-play-btn">
                <Icon name="play" size={20} />
              </div>
            </Link>
          </div>

          <h3 className="movies-side-title">{activeMovie.title}</h3>
          <div className="movies-side-meta">
            <span>{activeMovie.year}</span>
            <span>·</span>
            <span>{activeMovie.genre}</span>
            <span>·</span>
            <span>{activeMovie.runtime}</span>
            <span>·</span>
            <span>{activeMovie.ageRating}</span>
          </div>

          {(activeMovie.rating || activeMovie.tomatoRating) && (
            <div className="movies-side-ratings-row">
              {activeMovie.rating && (
                <div className="movies-side-rating-item" style={{ color: '#f59e0b' }}>
                  <Icon name="star" size={15} />
                  <span>{activeMovie.rating} {activeMovie.ratingCount && <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>({activeMovie.ratingCount})</span>}</span>
                </div>
              )}
              {activeMovie.tomatoRating && (
                <div className="movies-side-rating-item" style={{ color: '#ef4444' }}>
                  <span className="rt-badge" style={{ fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.05em', background: '#ef4444', color: '#fff', padding: '1px 4px', borderRadius: '3px', marginRight: '4px' }}>RT</span>
                  <span>{activeMovie.tomatoRating}</span>
                </div>
              )}
            </div>
          )}

          <p className="movies-side-synopsis">{activeMovie.synopsis}</p>

          <div className="movies-side-actions">
            <Link to={activeMovie.playUrl} className="movies-side-watch-btn">
              <Icon name="play" size={16} />
              <span>Watch Now</span>
            </Link>
            <button
              type="button"
              className="movies-side-icon-btn"
              aria-label="Mark as watched or add to list"
              onClick={() => {
                store.toggleWatchlist(activeMovie.id)
                toast('Updated watchlist')
              }}
            >
              <Icon name="check" size={18} />
            </button>
            <button
              type="button"
              className="movies-side-icon-btn"
              aria-label="Share movie"
              onClick={() => setShareModalOpen(true)}
            >
              <Icon name="share" size={18} />
            </button>
            <button
              type="button"
              className="movies-side-icon-btn"
              aria-label="Watch trailer preview"
              title="Watch trailer preview"
              onClick={() =>
                setTrailerModal({
                  open: true,
                  title: activeMovie.title,
                  trailerUrl: activeMovie.trailerUrl,
                  posterUrl: activeMovie.art,
                  playFullUrl: activeMovie.playUrl,
                })
              }
            >
              <Icon name="film" size={18} />
            </button>
          </div>

          <div className="movies-side-specs-table">
            {activeMovie.director && (
              <div className="movies-side-spec-row">
                <span className="movies-side-spec-label">Director</span>
                <span className="movies-side-spec-val">{activeMovie.director}</span>
              </div>
            )}
            {activeMovie.cast && (
              <div className="movies-side-spec-row">
                <span className="movies-side-spec-label">Cast</span>
                <span className="movies-side-spec-val">{activeMovie.cast}</span>
              </div>
            )}
            <div className="movies-side-spec-row">
              <span className="movies-side-spec-label">Genre</span>
              <span className="movies-side-spec-val">{activeMovie.genre}</span>
            </div>
            <div className="movies-side-spec-row">
              <span className="movies-side-spec-label">Language</span>
              <span className="movies-side-spec-val">{activeMovie.language || 'English'}</span>
            </div>
            <div className="movies-side-spec-row">
              <span className="movies-side-spec-label">Subtitles</span>
              <span className="movies-side-spec-val">{activeMovie.subtitles || 'Multiple'}</span>
            </div>
          </div>

          {activeMovie.similar && activeMovie.similar.length > 0 && (
            <>
              <h4 className="movies-side-similar-heading">Similar Movies</h4>
              <div className="movies-side-similar-grid">
                {activeMovie.similar.map((sim: any) => (
                  <Link key={sim.id} to={sim.to} className="movies-side-similar-card" title={sim.title}>
                    {sim.art ? (
                      <Art src={sim.art} alt={sim.title} contentId={sim.id} fallbackIcon="film" className="movies-side-similar-thumb" />
                    ) : (
                      <div className="movies-side-similar-fallback">
                        <Icon name="film" size={20} />
                      </div>
                    )}
                    <span className="movies-side-similar-title">{sim.title}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <div style={{ padding: '40px 16px', textAlign: 'center', color: 'rgba(255,255,255,0.6)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <Icon name="film" size={40} />
          <h3 style={{ color: '#fff', fontSize: '1rem', fontWeight: 600 }}>No Film Selected</h3>
          <p style={{ fontSize: '0.8125rem', lineHeight: 1.5, margin: 0 }}>
            Select a title to view synopsis, specifications and details.
          </p>
        </div>
      )}
    </aside>
  )

  return (
    <div className="streaming-page movies-screen">
      <PageHeader
        title="Movies"
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
        style={activeTab === 'browse' && !isFiltering ? undefined : { padding: '12px var(--gutter, 24px)', background: 'var(--surface-1)', borderBottom: '1px solid var(--line)', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}
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
            {availableCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
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
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="pill pill-pending"
              style={{ cursor: 'pointer', border: '1px solid var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={() => {
                setSelectedGenre(null)
                setSelectedSubgenre(null)
              }}
              title="Clear genre filter"
            >
              <span>Genre: {selectedGenre}</span>
              <Icon name="close" size={14} />
            </button>
            {activeParentGenre && (
              <Link
                to={`/genres/${activeParentGenre.id}${selectedSubgenre ? `/${selectedSubgenre}` : ''}`}
                className="btn btn-ghost btn-small"
                style={{ fontSize: '0.75rem' }}
                title="Open dedicated genre browse page"
              >
                <Icon name="tag" size={12} />
                <span>Open {activeParentGenre.name} Hub</span>
              </Link>
            )}
          </div>
        )}
      </div>

      {activeParentGenre && subgenres.length > 0 && (
        <div className="subgenre-filter-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0 16px', alignItems: 'center', padding: '0 24px' }}>
          <span className="faint" style={{ fontSize: '0.75rem', fontWeight: 600 }}>Subgenres:</span>
          <button
            type="button"
            className={`chip ${!selectedSubgenre ? 'is-active' : ''}`}
            onClick={() => setSelectedSubgenre(null)}
          >
            All {activeParentGenre.name}
          </button>
          {subgenres.map((sub: GenreDefinition) => (
            <button
              key={sub.id}
              type="button"
              className={`chip ${selectedSubgenre === sub.id ? 'is-active' : ''}`}
              onClick={() => setSelectedSubgenre(selectedSubgenre === sub.id ? null : sub.id)}
            >
              {sub.name}
            </button>
          ))}
        </div>
      )}

      {/* Main Streaming Discovery View (Browse Tab) */}
      {activeTab === 'browse' && !isFiltering && (
        <div className="movies-smarttv-layout">
          <div className="movies-main-col">
            {/* Featured Hero Stage */}
            <StreamingHero
              slides={heroSlides}
              activeIndex={heroIndex}
              onPrev={() => setHeroIndex((i) => (i - 1 + heroSlides.length) % heroSlides.length)}
              onNext={() => setHeroIndex((i) => (i + 1) % heroSlides.length)}
              onSelectIndex={setHeroIndex}
              onPlayTrailer={(slide) =>
                setTrailerModal({
                  open: true,
                  title: slide.title,
                  trailerUrl: slide.trailerUrl,
                  posterUrl: slide.backdropUrl || slide.art,
                  playFullUrl: slide.playUrl,
                })
              }
            />

            {/* Continue Watching Rail */}
            {(continueWatchingMovies.length > 0 || hasDemo) && (
              <StreamingRail
                title="Continue Watching"
                iconName="history"
                onSeeAll={() => navigate('/library?tab=history')}
              >
                {continueWatchingMovies.length > 0 ? (
                  continueWatchingMovies.map((movie) => {
                    const ref = movieRef(movie.id)
                    const progress = library.progress[ref]
                    return (
                      <StreamingCard
                        key={movie.id}
                        to={`/watch/${encodeURIComponent(ref)}`}
                        title={movie.title}
                        sub={`${movie.year} · ${movie.genres[0] || 'Film'}`}
                        art={movie.art}
                        progress={progress?.dur ? progress.pos / progress.dur : 0.65}
                        itemRef={ref}
                      />
                    )
                  })
                ) : hasDemo ? (
                  safeMovies.slice(0, 4).map((m, idx) => {
                    const progress = [0.55, 0.65, 0.5, 0.72][idx] ?? 0.5
                    const leftMins = Math.round(m.runtime * (1 - progress))
                    const leftH = Math.floor(leftMins / 60)
                    const leftM = leftMins % 60
                    const sub = leftH > 0 ? `${leftH}h ${leftM}m left` : `${leftM}m left`
                    return (
                      <StreamingCard
                        key={m.id}
                        to={`/watch/${encodeURIComponent(movieRef(m.id))}`}
                        title={m.title}
                        sub={sub}
                        art={m.art}
                        progress={progress}
                        itemRef={movieRef(m.id)}
                      />
                    )
                  })
                ) : null}
              </StreamingRail>
            )}

            {/* Popular Movies Rail */}
            <StreamingRail
              title="Popular Movies"
              iconName="flame"
              iconColor="var(--accent)"
              onSeeAll={() => setActiveTab('popular')}
            >
              {(hasXtream ? popularXtream : popularCatalogue).map((movie: any) => {
                const isXt = Boolean(movie.sourceId)
                const routeId = isXt ? `xt:${movie.sourceId}:${movie.id}` : movie.id
                return (
                  <div
                    key={routeId}
                    onClick={() =>
                      setSelectedMovie({
                        id: movie.id,
                        title: movie.name || movie.title,
                        year: movie.year,
                        genre: movie.genres?.[0] || 'Film',
                        runtime: movie.runtime ? `${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m` : undefined,
                        ageRating: movie.certificate || undefined,
                        rating: movie.rating ? String(movie.rating) : undefined,
                        ratingCount: movie.ratingCount ? String(movie.ratingCount) : undefined,
                        tomatoRating: movie.tomatoRating ? String(movie.tomatoRating) : undefined,
                        synopsis: movie.synopsis || movie.plot || 'Stream this feature film directly on Kinora.',
                        director: movie.director || undefined,
                        cast: Array.isArray(movie.cast) ? movie.cast.join(', ') : typeof movie.cast === 'string' ? movie.cast : undefined,
                        language: movie.language || 'English',
                        subtitles: movie.subtitles || 'Multiple',
                        art: movie.art || movie.posterUrl,
                        playUrl: `/watch/${encodeURIComponent(isXt ? `movie:${routeId}` : movieRef(movie.id))}`,
                        similar: hasDemo ? defaultSelectedMovie.similar : [],
                      })
                    }
                  >
                    <StreamingCard
                      to={`/movies/${encodeURIComponent(routeId)}`}
                      title={movie.name || movie.title}
                      sub={[movie.year, isXt ? sourceName(movie.sourceId) : movie.genres?.[0]].filter(Boolean).join(' · ')}
                      art={movie.posterUrl || movie.art}
                      artworkKey={movie.artworkKey}
                      badges={getTechnicalBadges(movie)}
                      itemRef={isXt ? `movie:${routeId}` : movieRef(movie.id)}
                      layout="poster"
                    />
                  </div>
                )
              })}
            </StreamingRail>

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

            {/* Local Media Library Movies Rail */}
            {localCatalogue.movies.length > 0 && (
              <StreamingRail
                title="From Your Local Media Library"
                iconName="folder"
                iconColor="var(--accent-red-primary)"
                onSeeAll={() => navigate('/library?tab=local')}
              >
                {localCatalogue.movies.map((movie) => {
                  const routeId = `local-movie:${movie.id}`
                  return (
                    <StreamingCard
                      key={movie.id}
                      to={`/watch/${encodeURIComponent(routeId)}`}
                      title={movie.title}
                      sub={[movie.year, movie.edition, 'Local'].filter(Boolean).join(' · ')}
                      art={movie.artPath || undefined}
                      badges={['LOCAL', ...(movie.resolution ? [movie.resolution] : [])]}
                      itemRef={routeId}
                      layout="poster"
                    />
                  )
                })}
              </StreamingRail>
            )}

            {/* Trending Movies Rail */}
            <StreamingRail
              title="Trending Movies"
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
                        layout="poster"
                      />
                    )
                  })
                : trendingCatalogue.map((movie) => {
                    const ref = movieRef(movie.id)
                    const isWatched = library.watched.includes(ref)
                    const progress = library.progress[ref]
                    return (
                      <StreamingCard
                        key={movie.id}
                        to={`/movies/${movie.id}`}
                        title={movie.title}
                        sub={`${movie.year} · ${movie.genres[0] || 'Film'} · ${runtimeLabel(movie.runtime)}`}
                        art={movie.posterUrl || movie.art}
                        badges={getTechnicalBadges(movie)}
                        itemRef={ref}
                        watched={isWatched}
                        progress={progress?.dur ? progress.pos / progress.dur : undefined}
                        layout="poster"
                      />
                    )
                  })}
            </StreamingRail>

            {/* New Releases Rail */}
            <StreamingRail
              title="New Releases"
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
                        layout="poster"
                      />
                    )
                  })
                : newReleaseCatalogue.map((movie) => {
                    const ref = movieRef(movie.id)
                    return (
                      <StreamingCard
                        key={movie.id}
                        to={`/movies/${movie.id}`}
                        title={movie.title}
                        sub={`${movie.year} · ${movie.genres[0] || 'Film'}`}
                        art={movie.posterUrl || movie.art}
                        badges={getTechnicalBadges(movie)}
                        itemRef={ref}
                        layout="poster"
                      />
                    )
                  })}
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
                      layout="poster"
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
                        layout="poster"
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
                      layout="poster"
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
                        layout="poster"
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
                          layout="poster"
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
                        layout="poster"
                      />
                    ))}
              </StreamingRail>
            )}
            </div>
          </div>
          {activeMovie && (
            <div
              className="movies-side-backdrop"
              onClick={() => setSelectedMovie(null)}
              aria-hidden="true"
            />
          )}
          {sidePanel}
        </div>
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
                  role="button"
                  tabIndex={0}
                  style={{ padding: 18, borderRadius: 8, cursor: 'pointer', background: 'var(--surface-1)', border: '1px solid var(--line)' }}
                  onClick={() => {
                    window.location.href = `/library?tab=collections&c=${encodeURIComponent(col.id)}`
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      window.location.href = `/library?tab=collections&c=${encodeURIComponent(col.id)}`
                    }
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Browse by Genre</h2>
              <p className="faint" style={{ margin: '4px 0 0 0', fontSize: '0.875rem' }}>
                Explore feature films categorized by themes, moods and storytelling styles.
              </p>
            </div>
            <Link to="/discover" className="btn btn-secondary">
              <Icon name="tag" size={14} />
              <span>Full Taxonomy &amp; Discovery</span>
            </Link>
          </div>
          <div className="streaming-genre-grid">
            {MOVIE_GENRE_DEFS.map((g) => (
              <GenreCard
                key={g.id}
                genre={g}
                showSubgenres={false}
                onClick={() => setSelectedGenre(g.name)}
              />
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
                Showing {Math.min(displayedXtream.length, providerLimit)} of {displayedXtream.length} movies{enabledSources.length > 1 ? ` (aggregated across ${enabledSources.length} sources)` : ' from connected sources'}.
              </p>
              {displayedXtream.length === 0 ? (
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
                  {displayedXtream.slice(0, providerLimit).map((movie) => {
                    const routeId = `xt:${movie.sourceId}:${movie.id}`
                    const isMultiSource = movie.totalSources > 1
                    const sourceLabel = isMultiSource ? `${movie.totalSources} sources` : sourceName(movie.sourceId)
                    const line = [movie.year, sourceLabel].filter(Boolean).join(' · ')
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
                        flag={
                          isWatched ? (
                            <><Icon name="check" size={12} />Watched</>
                          ) : isMultiSource ? (
                            <span style={{ fontSize: '0.7rem' }}>{movie.totalSources} Sources</span>
                          ) : undefined
                        }
                      />
                    )
                  })}
                </div>
              )}
            </div>
          ) : (hasDemo || openMovies.length > 0) ? (
            <div>
              <p className="browse-count faint">
                Showing {filteredDemo.length} films in {hasDemo ? 'curated' : 'open'} catalogue.
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
                      art={movie.posterUrl || movie.art}
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
      <ShareModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        item={
          activeMovie
            ? {
                title: activeMovie.title,
                kind: 'movie',
                year: activeMovie.year,
                certificate: activeMovie.ageRating,
                genres: activeMovie.genre ? [activeMovie.genre] : undefined,
                art: activeMovie.art,
                imdbId: (activeMovie as { imdbId?: string }).imdbId,
                deepLinkPath: activeMovie.playUrl || `/movies/${activeMovie.id}`,
              }
            : null
        }
      />
      {trailerModal.open && (
        <TrailerPlayerModal
          open={trailerModal.open}
          onClose={() => setTrailerModal((prev) => ({ ...prev, open: false }))}
          title={trailerModal.title}
          trailerUrl={trailerModal.trailerUrl}
          posterUrl={trailerModal.posterUrl}
          playFullUrl={trailerModal.playFullUrl}
        />
      )}
    </div>
  )
}
