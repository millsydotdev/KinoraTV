import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { genresOf, series } from '../data/catalog'
import { episodeCode, episodeRef, seriesRef } from '../data/refs'
import type { Series } from '../data/types'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { PosterCard, XtreamPosterCard } from '../components/Tiles'
import { StateBlock } from '../components/ui'
import {
  StreamingHero,
  StreamingGenreRow,
  StreamingRail,
  StreamingCard,
  StreamingProviderPrompt,
  getTechnicalBadges,
  type NavTabItem,
  type HeroSlideData,
  type GenreItem,
} from '../components/StreamingComponents'
import { filterKidSafeResources, filterKidSafeTitles, filterKidSafeXtreamTitles } from '../lib/kidsMode'
import { seriesNextUp } from '../lib/library'
import { useProfiles } from '../state/profiles'
import { useStore } from '../state/store'
import { useLocalMedia } from '../state/localMedia'
import './Browse.css'
import './MediaStreaming.css'

const TV_GENRES: GenreItem[] = [
  { id: 'drama', name: 'Drama', art: '/art/kingsmoor.jpg' },
  { id: 'crime', name: 'Crime', art: '/art/ninth-ward.jpg' },
  { id: 'comedy', name: 'Comedy', art: '/art/midnight-arcade.jpg' },
  { id: 'action', name: 'Action & Adventure', art: '/art/the-outpost.jpg' },
  { id: 'scifi', name: 'Sci-Fi & Fantasy', art: '/art/fathom.jpg' },
  { id: 'horror', name: 'Horror', art: '/art/copper-saints.jpg' },
  { id: 'documentary', name: 'Documentary', art: '/art/live-ocean.jpg' },
  { id: 'animation', name: 'Animation', art: '/art/live-kids.jpg' },
  { id: 'reality', name: 'Reality', art: '/art/live-quiz.jpg' },
]

const TV_TABS: NavTabItem[] = [
  { id: 'browse', label: 'Browse', icon: 'grid' },
  { id: 'my-shows', label: 'My Shows', icon: 'bookmark' },
  { id: 'genres', label: 'Genres', icon: 'tag' },
  { id: 'new-episodes', label: 'New Episodes', icon: 'calendar' },
  { id: 'returning', label: 'Returning', icon: 'refresh' },
  { id: 'popular', label: 'Popular', icon: 'star' },
  { id: 'a-z', label: 'A-Z', icon: 'sortAsc' },
]

const sorts = {
  title: 'Sort: Title A to Z',
  added: 'Sort: Recently added',
  episodes: 'Sort: Most episodes',
  newest: 'Sort: Newest',
  oldest: 'Sort: Oldest',
  rating: 'Sort: Rating',
} as const
type SortKey = keyof typeof sorts

export function SeriesBrowse() {
  const store = useStore()
  const navigate = useNavigate()
  const { isKidsMode } = useProfiles()
  const { library } = store
  const [params, setParams] = useSearchParams()

  const [activeTab, setActiveTab] = useState<string>('browse')
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null)
  const [heroIndex, setHeroIndex] = useState(0)
  const [providerLimit, setProviderLimit] = useState(100)
  const [providerQuery, setProviderQuery] = useState('')

  const enabledSources = useMemo(() => store.xtreamSources.filter((s) => s.enabled), [store.xtreamSources])
  const enabledSourceIds = useMemo(() => new Set(enabledSources.map((s) => s.id)), [enabledSources])

  const safeXtreamSeries = useMemo(() => {
    const enabledSeries = store.xtreamCatalogue.series.filter((s) => enabledSourceIds.has(s.sourceId))
    return filterKidSafeXtreamTitles(enabledSeries, isKidsMode)
  }, [store.xtreamCatalogue.series, enabledSourceIds, isKidsMode])

  const seriesCategories = useMemo(() => {
    const list = store.xtreamCatalogue.seriesCategories.filter((c) => enabledSourceIds.has(c.sourceId))
    const seen = new Set<string>()
    return list.filter((c) => {
      if (seen.has(c.name)) return false
      seen.add(c.name)
      return true
    })
  }, [store.xtreamCatalogue.seriesCategories, enabledSourceIds])

  const safeSeries = useMemo(() => {
    return filterKidSafeTitles(series, isKidsMode)
  }, [isKidsMode])

  const isSampleProvider = typeof window !== 'undefined' && window.sessionStorage?.getItem('kinora.sample_provider_view') === '1'
  const { catalogue: localCatalogue } = useLocalMedia()
  const hasXtream = store.xtreamSources.length > 0 && safeXtreamSeries.length > 0
  const hasDemo = (store.demoTitles || isSampleProvider) && safeSeries.length > 0

  // Public discovery television & documentary series
  const publicDiscoverySeries = useMemo(() => {
    const list = store.mediaLibrary.allResources.filter(
      (r) =>
        r.category === 'series' ||
        r.subcategory.includes('tv') ||
        r.subcategory.includes('series') ||
        r.subcategory.includes('broadcasting'),
    )
    return isKidsMode ? filterKidSafeResources(list, true) : list
  }, [store.mediaLibrary.allResources, isKidsMode])

  const normalizedQuery = providerQuery.trim().toLowerCase()
  const category = params.get('category') ?? 'All'
  const provider = params.get('provider') ?? 'All'
  const sort = (params.get('sort') ?? 'title') as SortKey

  const setFilter = (key: string, value: string, fallback: string) => {
    const next = new URLSearchParams(params)
    if (value === fallback) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  // Filtered Xtream series
  const filteredXtream = useMemo(() => {
    if (!hasXtream) return []
    return safeXtreamSeries
      .filter((s) => category === 'All' || s.categoryId === category || s.categoryName === category)
      .filter((s) => provider === 'All' || s.sourceId === provider)
      .filter((s) => !selectedGenre || s.categoryName?.toLowerCase().includes(selectedGenre.toLowerCase()))
      .filter((s) => activeTab !== 'my-shows' || library.watchlist.includes(`series:xt:${s.sourceId}:${s.id}`))
      .filter((s) => !normalizedQuery || s.name.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => {
        if (activeTab === 'popular') return (b.rating ?? 0) - (a.rating ?? 0) || (b.year ?? 0) - (a.year ?? 0)
        if (activeTab === 'new-episodes' || sort === 'newest') return (b.year ?? 0) - (a.year ?? 0)
        if (sort === 'oldest') return (a.year ?? 0) - (b.year ?? 0)
        if (sort === 'rating') return (b.rating ?? 0) - (a.rating ?? 0)
        return a.name.localeCompare(b.name)
      })
  }, [hasXtream, safeXtreamSeries, category, provider, selectedGenre, normalizedQuery, sort, activeTab, library.watchlist])

  // Filtered demo series
  const filteredDemo = useMemo(() => {
    if (!hasDemo) return []
    return safeSeries
      .filter((s) => category === 'All' || s.genres.some((g) => g.toLowerCase() === category.toLowerCase()))
      .filter((s) => !selectedGenre || s.genres.some((g) => g.toLowerCase() === selectedGenre.toLowerCase()))
      .filter((s) => activeTab !== 'my-shows' || library.watchlist.includes(seriesRef(s.id)))
      .filter((s) => activeTab !== 'returning' || s.years.toLowerCase().includes('present'))
      .filter((s) => !normalizedQuery || s.title.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => {
        if (activeTab === 'popular' || sort === 'episodes') {
          const bCount = Array.isArray(b.seasons) ? b.seasons.flat().length : 0
          const aCount = Array.isArray(a.seasons) ? a.seasons.flat().length : 0
          return bCount - aCount
        }
        if (sort === 'added') return b.added.localeCompare(a.added)
        return a.title.localeCompare(b.title)
      })
  }, [hasDemo, safeSeries, category, selectedGenre, normalizedQuery, sort, activeTab, library.watchlist])

  // Filtered public discovery series
  const filteredPublicDiscovery = useMemo(() => {
    if (hasXtream || hasDemo) return []
    return publicDiscoverySeries
      .filter((r) => !selectedGenre || r.tags.some((t) => t.toLowerCase().includes(selectedGenre.toLowerCase())) || r.subcategory.toLowerCase().includes(selectedGenre.toLowerCase()))
      .filter((r) => !normalizedQuery || r.name.toLowerCase().includes(normalizedQuery) || r.description.toLowerCase().includes(normalizedQuery) || r.provider.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [hasXtream, hasDemo, publicDiscoverySeries, selectedGenre, normalizedQuery])

  // Hero slides
  const heroSlides = useMemo<HeroSlideData[]>(() => {
    if (hasXtream) {
      return safeXtreamSeries.slice(0, 5).map((s) => ({
        id: `xt:${s.sourceId}:${s.id}`,
        kicker: 'FEATURED SERIES',
        title: s.name,
        synopsis: s.plot || 'Stream television series and binge all seasons through your connected on-demand provider.',
        art: undefined,
        artworkKey: s.artworkKey,
        year: s.year ?? 'VOD',
        genre: s.categoryName || 'TV Series',
        runtime: undefined,
        ageRating: undefined,
        badges: getTechnicalBadges(s),
        playUrl: `/series/${encodeURIComponent(`xt:${s.sourceId}:${s.id}`)}`,
        detailUrl: `/series/${encodeURIComponent(`xt:${s.sourceId}:${s.id}`)}`,
        itemRef: `series:xt:${s.sourceId}:${s.id}`,
      }))
    }
    if (hasDemo) {
      const topSeries = [
        safeSeries.find((s) => s.id === 'ninth-ward'),
        safeSeries.find((s) => s.id === 'fathom'),
        safeSeries.find((s) => s.id === 'kingsmoor'),
        safeSeries.find((s) => s.id === 'wildfire-season'),
        safeSeries.find((s) => s.id === 'static'),
      ].filter((s): s is Series => !!s)

      return topSeries.map((s) => ({
        id: s.id,
        kicker: 'FEATURED SERIES',
        title: s.title,
        synopsis: s.synopsis,
        art: s.art,
        year: s.years.split(' ')[0] || 2023,
        genre: s.genres[0] || 'Drama',
        runtime: `${s.seasons?.length || 0} Season${(s.seasons?.length || 0) > 1 ? 's' : ''}`,
        ageRating: s.certificate,
        badges: getTechnicalBadges(s),
        playUrl: `/series/${s.id}`,
        detailUrl: `/series/${s.id}`,
        itemRef: seriesRef(s.id),
      }))
    }
    if (publicDiscoverySeries.length > 0) {
      return publicDiscoverySeries.slice(0, 5).map((s) => ({
        id: s.id,
        kicker: 'FEATURED TELEVISION ARCHIVE',
        title: s.name,
        synopsis: s.description,
        art: s.artworkUrl,
        year: 'Public Archive',
        genre: s.subcategory.replace(/-/g, ' ').toUpperCase(),
        runtime: 'Broadcast Series',
        badges: ['ARCHIVE', 'EPISODIC'],
        playUrl: `/series/${encodeURIComponent(s.id)}`,
        detailUrl: `/series/${encodeURIComponent(s.id)}`,
        itemRef: `res:${s.id}`,
      }))
    }
    return []
  }, [hasXtream, hasDemo, publicDiscoverySeries, safeXtreamSeries, safeSeries])

  // Rails data
  const trendingXtream = useMemo(() => safeXtreamSeries.slice(0, 8), [safeXtreamSeries])
  const trendingDemo = useMemo(() => safeSeries.slice(0, 8), [safeSeries])
  const trendingPublicDiscovery = useMemo(() => publicDiscoverySeries.slice(0, 8), [publicDiscoverySeries])

  // New Episodes (latest season episodes)
  const newEpisodes = useMemo(() => {
    if (hasDemo) {
      const eps: {
        id: string
        showId: string
        showTitle: string
        episodeTitle: string
        season: number
        number: number
        art: string
      }[] = []

      for (const s of safeSeries) {
        const lastSeason = s.seasons[s.seasons.length - 1]
        if (lastSeason && lastSeason.length > 0) {
          const lastEp = lastSeason[lastSeason.length - 1]
          if (lastEp) {
            eps.push({
              id: `${s.id}-${lastEp.id}`,
              showId: s.id,
              showTitle: s.title,
              episodeTitle: lastEp.title,
              season: lastEp.season,
              number: lastEp.number,
              art: lastEp.still || s.art,
            })
          }
        }
      }
      return eps
    }
    return []
  }, [hasDemo, safeSeries])

  // Popular Shows
  const popularXtream = useMemo(() => safeXtreamSeries.slice(2, 10), [safeXtreamSeries])
  const popularDemo = useMemo(() => {
    return [...safeSeries].sort((a, b) => {
      const bCount = Array.isArray(b.seasons) ? b.seasons.flat().length : 0
      const aCount = Array.isArray(a.seasons) ? a.seasons.flat().length : 0
      return bCount - aCount
    }).slice(0, 8)
  }, [safeSeries])
  const popularPublicDiscovery = useMemo(() => publicDiscoverySeries.slice(4, 12), [publicDiscoverySeries])

  // Returning Shows (continuing on-air series)
  const returningShows = useMemo(() => {
    if (hasDemo) {
      return safeSeries.filter((s) => s.years.toLowerCase().includes('present')).slice(0, 8)
    }
    return []
  }, [hasDemo, safeSeries])

  // My Shows (watchlist or favourites)
  const myShowsXtream = useMemo(() => {
    if (hasXtream) {
      return safeXtreamSeries.filter((s) => library.watchlist.includes(`series:xt:${s.sourceId}:${s.id}`))
    }
    return []
  }, [hasXtream, safeXtreamSeries, library.watchlist])

  const myShowsDemo = useMemo(() => {
    if (hasDemo) {
      return safeSeries.filter((s) => library.watchlist.includes(seriesRef(s.id)))
    }
    return []
  }, [hasDemo, safeSeries, library.watchlist])

  const myShowsPublicDiscovery = useMemo(() => {
    if (!hasXtream && !hasDemo) {
      return publicDiscoverySeries.filter((r) => store.mediaLibrary.isInPersonalLibrary(r.id) || library.watchlist.includes(`res:${r.id}`))
    }
    return []
  }, [hasXtream, hasDemo, publicDiscoverySeries, store.mediaLibrary, library.watchlist])

  // Continue Watching
  const continueWatchingShows = useMemo(() => {
    if (hasDemo) {
      return safeSeries
        .map((s) => ({ s, up: seriesNextUp(library, s) }))
        .filter(({ up }) => up.state === 'resume' || up.state === 'next')
        .map(({ s, up }) => ({
          show: s,
          up,
        }))
    }
    return []
  }, [hasDemo, safeSeries, library])

  const isFiltering = category !== 'All' || provider !== 'All' || Boolean(normalizedQuery) || Boolean(selectedGenre) || activeTab === 'a-z'
  const sourceName = (id: string) => store.xtreamSources.find((s) => s.id === id)?.name ?? 'Provider'

  return (
    <div className="streaming-page">
      <PageHeader
        title={
          <div className="streaming-title-group">
            <div className="streaming-icon-badge" aria-hidden="true">
              <Icon name="tv" size={20} />
            </div>
            <div className="streaming-title-meta">
              <span className="streaming-title">TV Shows</span>
              <span className="streaming-subtitle">Discover, binge and manage your TV series collection.</span>
            </div>
          </div>
        }
        searchPlaceholder="Search TV shows, seasons, episodes..."
      />

      {/* Sub-Navigation Tabs */}
      <div className="streaming-header-wrap" style={{ paddingTop: 0, paddingBottom: 14 }}>
        <nav className="streaming-nav-tabs" aria-label="TV Shows navigation">
          {TV_TABS.map((tab) => {
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
          <span className="sr-only">Search TV shows</span>
          <input
            className="input"
            type="search"
            value={providerQuery}
            onChange={(e) => {
              setProviderQuery(e.target.value)
              setProviderLimit(100)
            }}
            placeholder="Search TV shows..."
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
            {hasXtream && seriesCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
            {!hasXtream && genresOf(safeSeries).map((g) => (
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
            <option value="episodes">Sort: Most episodes</option>
            <option value="added">Sort: Recently added</option>
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
            isTv
          />

          <div className="streaming-body">
            {!hasXtream && <StreamingProviderPrompt kind="tv" />}

            {/* Browse by Genre Row */}
            <StreamingGenreRow
              genres={TV_GENRES}
              selectedGenre={selectedGenre}
              onSelectGenre={(genreName) => {
                setSelectedGenre(genreName)
                setActiveTab('browse')
              }}
              onViewAll={() => setActiveTab('genres')}
            />

            {/* Local Media Library TV Shows Rail */}
            {Boolean(localCatalogue?.series && localCatalogue.series.length > 0) && (
              <StreamingRail
                title="From Your Local Media Library"
                iconName="folder"
                iconColor="var(--accent-red-primary)"
                onSeeAll={() => navigate('/library?tab=local')}
              >
                {(localCatalogue?.series || []).map((s) => {
                  const routeId = `local-series:${s.id}`
                  const totalEpisodes = (s.seasons || []).reduce((acc, sn) => acc + (sn.episodes?.length || 0), 0)
                  return (
                    <StreamingCard
                      key={s.id}
                      to="/library?tab=local"
                      title={s.title}
                      sub={[s.year, `${s.seasons?.length || 0} Seasons`, `${totalEpisodes} Episodes`].filter(Boolean).join(' · ')}
                      art={s.artPath || undefined}
                      badges={['LOCAL']}
                      itemRef={routeId}
                      layout="poster"
                    />
                  )
                })}
              </StreamingRail>
            )}

            {/* Trending TV Shows Rail */}
            <StreamingRail
              title={hasXtream ? 'Trending TV Shows' : hasDemo ? 'Trending TV Shows' : 'Broadcast & Episodic Archives'}
              iconName="flame"
              iconColor="var(--accent)"
              onSeeAll={() => setActiveTab('a-z')}
            >
              {hasXtream
                ? trendingXtream.map((s) => {
                    const routeId = `xt:${s.sourceId}:${s.id}`
                    return (
                      <StreamingCard
                        key={routeId}
                        to={`/series/${encodeURIComponent(routeId)}`}
                        title={s.name}
                        sub={[s.year, sourceName(s.sourceId)].filter(Boolean).join(' · ')}
                        artworkKey={s.artworkKey}
                        badges={getTechnicalBadges(s)}
                        itemRef={`series:${routeId}`}
                        layout="poster"
                      />
                    )
                  })
                : hasDemo
                ? trendingDemo.map((show) => {
                    const ref = seriesRef(show.id)
                    return (
                      <StreamingCard
                        key={show.id}
                        to={`/series/${show.id}`}
                        title={show.title}
                        sub={`${show.seasons?.length || 0} Season${(show.seasons?.length || 0) > 1 ? 's' : ''} · ${show.genres[0] || 'Drama'}`}
                        art={show.art}
                        badges={getTechnicalBadges(show)}
                        itemRef={ref}
                        layout="poster"
                      />
                    )
                  })
                : trendingPublicDiscovery.map((r) => (
                    <StreamingCard
                      key={r.id}
                      to={`/series/${encodeURIComponent(r.id)}`}
                      title={r.name}
                      sub={[r.provider, r.country ?? 'Open Archive'].filter(Boolean).join(' · ')}
                      art={r.artworkUrl}
                      badges={['ARCHIVE', 'EPISODIC']}
                      itemRef={`res:${r.id}`}
                      layout="poster"
                    />
                  ))}
            </StreamingRail>

            {/* New Episodes Rail */}
            {newEpisodes.length > 0 && (
              <StreamingRail
                title="New Episodes"
                iconName="calendar"
                onSeeAll={() => setActiveTab('new-episodes')}
              >
                {newEpisodes.map((ep) => (
                  <StreamingCard
                    key={ep.id}
                    to={`/series/${ep.showId}?season=${ep.season}`}
                    title={ep.showTitle}
                    sub={`S${ep.season} E${ep.number} · ${ep.episodeTitle}`}
                    art={ep.art}
                    episodeBadge={`S${ep.season} E${ep.number}`}
                    badges={getTechnicalBadges({ title: ep.episodeTitle })}
                    itemRef={episodeRef(ep.showId, `s${ep.season}e${ep.number}`)}
                  />
                ))}
              </StreamingRail>
            )}

            {/* Popular Shows Rail */}
            <StreamingRail
              title={hasXtream ? 'Popular Shows' : hasDemo ? 'Popular Shows' : 'Documentary & National TV Series'}
              iconName="star"
              onSeeAll={() => setActiveTab('popular')}
            >
              {hasXtream
                ? popularXtream.map((s) => (
                    <StreamingCard
                      key={`pop-xt-${s.id}`}
                      to={`/series/${encodeURIComponent(`xt:${s.sourceId}:${s.id}`)}`}
                      title={s.name}
                      sub={[s.year, sourceName(s.sourceId)].filter(Boolean).join(' · ')}
                      artworkKey={s.artworkKey}
                      badges={getTechnicalBadges(s)}
                      itemRef={`series:xt:${s.sourceId}:${s.id}`}
                      layout="poster"
                    />
                  ))
                : hasDemo
                ? popularDemo.map((show) => {
                    return (
                      <StreamingCard
                        key={`pop-${show.id}`}
                        to={`/series/${show.id}`}
                        title={show.title}
                        sub={`${show.seasons?.length || 0} Season${(show.seasons?.length || 0) > 1 ? 's' : ''} · ${show.certificate}`}
                        art={show.art}
                        badges={getTechnicalBadges(show)}
                        itemRef={seriesRef(show.id)}
                        layout="poster"
                      />
                    )
                  })
                : popularPublicDiscovery.map((r) => (
                    <StreamingCard
                      key={`pop-res-${r.id}`}
                      to={`/series/${encodeURIComponent(r.id)}`}
                      title={r.name}
                      sub={[r.provider, r.subcategory].filter(Boolean).join(' · ')}
                      art={r.artworkUrl}
                      badges={['ARCHIVE']}
                      itemRef={`res:${r.id}`}
                      layout="poster"
                    />
                  ))}
            </StreamingRail>

            {/* Returning Shows Rail */}
            {returningShows.length > 0 && (
              <StreamingRail
                title="Returning Shows"
                iconName="refresh"
                onSeeAll={() => setActiveTab('returning')}
              >
                {returningShows.map((show) => (
                  <StreamingCard
                    key={`ret-${show.id}`}
                    to={`/series/${show.id}`}
                    title={show.title}
                    sub={`${show.years} · On Air`}
                    art={show.art}
                    badges={getTechnicalBadges(show)}
                    itemRef={seriesRef(show.id)}
                    layout="poster"
                  />
                ))}
              </StreamingRail>
            )}

            {/* Continue Watching Rail */}
            {continueWatchingShows.length > 0 && (
              <StreamingRail
                title="Continue Watching"
                iconName="clock"
                onSeeAll={() => setActiveTab('browse')}
              >
                {continueWatchingShows.map(({ show, up }) => (
                  <StreamingCard
                    key={`cw-${show.id}`}
                    to={`/series/${show.id}?season=${up.episode.season}`}
                    title={show.title}
                    sub={`${up.state === 'resume' ? 'Resume' : 'Next'} ${episodeCode(up.episode)} · ${up.episode.title}`}
                    art={up.episode.still || show.art}
                    episodeBadge={episodeCode(up.episode)}
                    badges={getTechnicalBadges(show)}
                    itemRef={episodeRef(show.id, up.episode.id)}
                  />
                ))}
              </StreamingRail>
            )}

            {/* My Shows Rail */}
            {(myShowsXtream.length > 0 || myShowsDemo.length > 0 || myShowsPublicDiscovery.length > 0) && (
              <StreamingRail
                title="My Shows"
                iconName="bookmark"
                onSeeAll={() => setActiveTab('my-shows')}
              >
                {hasXtream
                  ? myShowsXtream.map((s) => (
                      <StreamingCard
                        key={`ms-xt-${s.id}`}
                        to={`/series/${encodeURIComponent(`xt:${s.sourceId}:${s.id}`)}`}
                        title={s.name}
                        sub={[s.year, sourceName(s.sourceId)].filter(Boolean).join(' · ')}
                        artworkKey={s.artworkKey}
                        badges={getTechnicalBadges(s)}
                        itemRef={`series:xt:${s.sourceId}:${s.id}`}
                        layout="poster"
                      />
                    ))
                  : hasDemo
                  ? myShowsDemo.map((show) => {
                      return (
                        <StreamingCard
                          key={`ms-${show.id}`}
                          to={`/series/${show.id}`}
                          title={show.title}
                          sub={`${show.seasons?.length || 0} Season${(show.seasons?.length || 0) > 1 ? 's' : ''}`}
                          art={show.art}
                          badges={getTechnicalBadges(show)}
                          itemRef={seriesRef(show.id)}
                          layout="poster"
                        />
                      )
                    })
                  : myShowsPublicDiscovery.map((r) => (
                      <StreamingCard
                        key={`ms-res-${r.id}`}
                        to={`/series/${encodeURIComponent(r.id)}`}
                        title={r.name}
                        sub={[r.provider, 'Saved'].join(' · ')}
                        art={r.artworkUrl}
                        badges={['SAVED']}
                        itemRef={`res:${r.id}`}
                        layout="poster"
                      />
                    ))}
              </StreamingRail>
            )}
          </div>
        </>
      )}

      {/* My Shows Tab View (Empty State) */}
      {activeTab === 'my-shows' && myShowsXtream.length === 0 && myShowsDemo.length === 0 && myShowsPublicDiscovery.length === 0 && (
        <div className="streaming-body" style={{ paddingTop: 24 }}>
          <StateBlock
            icon="bookmark"
            title="No saved shows in your list"
            action={
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setActiveTab('browse')}
              >
                Browse TV shows
              </button>
            }
          >
            Add shows to My Shows from any series details page to keep track of what to binge.
          </StateBlock>
        </div>
      )}

      {/* Genres Tab View (Full Grid when no specific genre selected) */}
      {activeTab === 'genres' && !selectedGenre && (
        <div className="streaming-body" style={{ paddingTop: 24 }}>
          <div style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Browse by Genre</h2>
            <p className="faint" style={{ margin: '4px 0 0 0', fontSize: '0.875rem' }}>
              Explore television series categorized by format, storyline and storytelling styles.
            </p>
          </div>
          <div className="streaming-genre-grid">
            {TV_GENRES.map((g) => (
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
      {(activeTab !== 'my-shows' || myShowsXtream.length > 0 || myShowsDemo.length > 0 || myShowsPublicDiscovery.length > 0) && (activeTab !== 'genres' || Boolean(selectedGenre)) && (isFiltering || activeTab !== 'browse') && (
        <div className="streaming-body" style={{ paddingTop: 20 }}>
          {hasXtream ? (
            <div>
              <p className="browse-count faint">
                Showing {Math.min(filteredXtream.length, providerLimit)} of {filteredXtream.length} series from Starlight Provider and connected sources.
              </p>
              {filteredXtream.length === 0 ? (
                <StateBlock
                  icon="search"
                  title="No TV shows match your criteria"
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
                  {filteredXtream.slice(0, providerLimit).map((show) => {
                    const routeId = `xt:${show.sourceId}:${show.id}`
                    const line = [show.year, sourceName(show.sourceId)].filter(Boolean).join(' · ')
                    return (
                      <XtreamPosterCard
                        key={`${show.sourceId}:${show.id}`}
                        to={`/series/${encodeURIComponent(routeId)}`}
                        title={show.name}
                        artworkKey={show.artworkKey}
                        line={line}
                        year={show.year}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          ) : hasDemo ? (
            <div>
              <p className="browse-count faint">
                Showing {filteredDemo.length} TV shows in catalogue.
              </p>
              {filteredDemo.length === 0 ? (
                <StateBlock
                  icon="series"
                  title="No TV shows found"
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
                  {filteredDemo.map((s) => {
                    const up = seriesNextUp(library, s)
                    const watching = up.state === 'resume' || up.state === 'next'
                    return (
                      <PosterCard
                        key={s.id}
                        to={`/series/${s.id}`}
                        title={s.title}
                        art={s.art}
                        focus={s.focus}
                        line={watching ? `${up.state === 'resume' ? 'Resume' : 'Up next'} ${episodeCode(up.episode)}` : `${s.seasons.length} season${s.seasons.length > 1 ? 's' : ''} · ${s.certificate}`}
                        flag={watching ? <><Icon name="play" size={10} />Watching</> : undefined}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            <div>
              <p className="browse-count faint">
                Showing {filteredPublicDiscovery.length} public broadcast and episodic archive collections.
              </p>
              {filteredPublicDiscovery.length === 0 ? (
                <StateBlock
                  icon="series"
                  title="No television archives found"
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
                  {filteredPublicDiscovery.map((r) => (
                    <PosterCard
                      key={r.id}
                      to={`/series/${encodeURIComponent(r.id)}`}
                      title={r.name}
                      art={r.artworkUrl}
                      line={[r.provider, r.subcategory].filter(Boolean).join(' · ')}
                      flag={<><Icon name="library" size={10} />Archive</>}
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
