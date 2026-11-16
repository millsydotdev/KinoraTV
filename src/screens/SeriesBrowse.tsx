import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
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
  type NavTabItem,
  type HeroSlideData,
  type GenreItem,
} from '../components/StreamingComponents'
import { filterKidSafeTitles, filterKidSafeXtreamTitles } from '../lib/kidsMode'
import { seriesNextUp } from '../lib/library'
import { useProfiles } from '../state/profiles'
import { useStore } from '../state/store'
import { NoTitles } from './Movies'
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

  const hasXtream = store.xtreamSources.length > 0 && safeXtreamSeries.length > 0
  const hasDemo = store.demoTitles && safeSeries.length > 0
  const hasAnyContent = hasXtream || hasDemo

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
      .filter((s) => !normalizedQuery || s.name.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => {
        if (sort === 'newest') return (b.year ?? 0) - (a.year ?? 0)
        if (sort === 'oldest') return (a.year ?? 0) - (b.year ?? 0)
        if (sort === 'rating') return (b.rating ?? 0) - (a.rating ?? 0)
        return a.name.localeCompare(b.name)
      })
  }, [hasXtream, safeXtreamSeries, category, provider, selectedGenre, normalizedQuery, sort])

  // Filtered demo series
  const filteredDemo = useMemo(() => {
    if (!hasDemo) return []
    return safeSeries
      .filter((s) => category === 'All' || s.genres.some((g) => g.toLowerCase() === category.toLowerCase()))
      .filter((s) => !selectedGenre || s.genres.some((g) => g.toLowerCase() === selectedGenre.toLowerCase()))
      .filter((s) => !normalizedQuery || s.title.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => {
        if (sort === 'episodes') return b.seasons.flat().length - a.seasons.flat().length
        if (sort === 'added') return b.added.localeCompare(a.added)
        return a.title.localeCompare(b.title)
      })
  }, [hasDemo, safeSeries, category, selectedGenre, normalizedQuery, sort])

  // Hero slides
  const heroSlides = useMemo<HeroSlideData[]>(() => {
    if (hasXtream) {
      return safeXtreamSeries.slice(0, 5).map((s) => ({
        id: `xt:${s.sourceId}:${s.id}`,
        kicker: 'FEATURED SERIES',
        title: s.name,
        synopsis: s.plot || 'Stream television series and binge all seasons through your connected on-demand provider.',
        art: '/art/ninth-ward.jpg',
        artworkKey: s.artworkKey,
        year: s.year ?? 'VOD',
        genre: s.categoryName || 'TV Series',
        runtime: 'Series',
        ageRating: 'TV-MA',
        badges: ['4K', 'HDR'],
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
        runtime: `${s.seasons.length} Season${s.seasons.length > 1 ? 's' : ''}`,
        ageRating: s.certificate,
        badges: ['4K', 'HDR'],
        playUrl: `/series/${s.id}`,
        detailUrl: `/series/${s.id}`,
        itemRef: seriesRef(s.id),
      }))
    }
    return []
  }, [hasXtream, hasDemo, safeXtreamSeries, safeSeries])

  // Rails data
  const trendingXtream = useMemo(() => safeXtreamSeries.slice(0, 8), [safeXtreamSeries])
  const trendingDemo = useMemo(() => safeSeries.slice(0, 8), [safeSeries])

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
    return [...safeSeries].sort((a, b) => b.seasons.flat().length - a.seasons.flat().length).slice(0, 8)
  }, [safeSeries])

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

  if (!hasAnyContent) {
    return <NoTitles kind="series" />
  }

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
        style={activeTab === 'browse' && !isFiltering ? undefined : { padding: '12px 40px', background: 'var(--surface-1)', borderBottom: '1px solid var(--line)', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}
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
            style={{ cursor: 'pointer', border: '1px solid var(--accent)' }}
            onClick={() => setSelectedGenre(null)}
            title="Clear genre filter"
          >
            Genre: {selectedGenre} ✕
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

            {/* Trending TV Shows Rail */}
            <StreamingRail
              title="Trending TV Shows"
              icon="🔥"
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
                        badges={['4K', 'HDR']}
                        itemRef={`series:${routeId}`}
                      />
                    )
                  })
                : trendingDemo.map((show) => {
                    const ref = seriesRef(show.id)
                    return (
                      <StreamingCard
                        key={show.id}
                        to={`/series/${show.id}`}
                        title={show.title}
                        sub={`${show.seasons.length} Season${show.seasons.length > 1 ? 's' : ''} · ${show.genres[0] || 'Drama'}`}
                        art={show.art}
                        badges={['4K', 'HDR']}
                        itemRef={ref}
                      />
                    )
                  })}
            </StreamingRail>

            {/* New Episodes Rail */}
            {newEpisodes.length > 0 && (
              <StreamingRail
                title="New Episodes"
                icon="📅"
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
                    badges={['4K']}
                    itemRef={episodeRef(ep.showId, `s${ep.season}e${ep.number}`)}
                  />
                ))}
              </StreamingRail>
            )}

            {/* Popular Shows Rail */}
            <StreamingRail
              title="Popular Shows"
              icon="⭐"
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
                      badges={['4K']}
                      itemRef={`series:xt:${s.sourceId}:${s.id}`}
                    />
                  ))
                : popularDemo.map((show) => {
                    return (
                      <StreamingCard
                        key={`pop-${show.id}`}
                        to={`/series/${show.id}`}
                        title={show.title}
                        sub={`${show.seasons.length} Season${show.seasons.length > 1 ? 's' : ''} · ${show.certificate}`}
                        art={show.art}
                        badges={['4K']}
                        itemRef={seriesRef(show.id)}
                      />
                    )
                  })}
            </StreamingRail>

            {/* Returning Shows Rail */}
            {returningShows.length > 0 && (
              <StreamingRail
                title="Returning Shows"
                icon="🔄"
                onSeeAll={() => setActiveTab('returning')}
              >
                {returningShows.map((show) => (
                  <StreamingCard
                    key={`ret-${show.id}`}
                    to={`/series/${show.id}`}
                    title={show.title}
                    sub={`${show.years} · On Air`}
                    art={show.art}
                    badges={['4K']}
                    itemRef={seriesRef(show.id)}
                  />
                ))}
              </StreamingRail>
            )}

            {/* Continue Watching Rail */}
            {continueWatchingShows.length > 0 && (
              <StreamingRail
                title="Continue Watching"
                icon="⏱️"
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
                    badges={['4K']}
                    itemRef={episodeRef(show.id, up.episode.id)}
                  />
                ))}
              </StreamingRail>
            )}

            {/* My Shows Rail */}
            {(myShowsXtream.length > 0 || myShowsDemo.length > 0) && (
              <StreamingRail
                title="My Shows"
                icon="🔖"
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
                        badges={['4K']}
                        itemRef={`series:xt:${s.sourceId}:${s.id}`}
                      />
                    ))
                  : myShowsDemo.map((show) => {
                      return (
                        <StreamingCard
                          key={`ms-${show.id}`}
                          to={`/series/${show.id}`}
                          title={show.title}
                          sub={`${show.seasons.length} Season${show.seasons.length > 1 ? 's' : ''}`}
                          art={show.art}
                          badges={['4K']}
                          itemRef={seriesRef(show.id)}
                        />
                      )
                    })}
              </StreamingRail>
            )}
          </div>
        </>
      )}

      {/* Filtered Grid or Non-Browse Tab View */}
      {(isFiltering || activeTab !== 'browse') && (
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
          ) : (
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
          )}
        </div>
      )}
    </div>
  )
}
