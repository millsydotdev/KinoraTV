import { Link, NavLink, useSearchParams } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { genresOf, movies } from '../data/catalog'
import { movieRef, runtimeLabel } from '../data/refs'
import type { Movie } from '../data/types'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { PosterCard, WideCard, XtreamPosterCard } from '../components/Tiles'
import { ResourceCard } from '../components/ResourceCard'
import { ResourceDetailModal } from '../components/ResourceDetailModal'
import { Segmented, StateBlock } from '../components/ui'
import { filterKidSafeResources, filterKidSafeTitles, filterKidSafeXtreamTitles } from '../lib/kidsMode'
import { useProfiles } from '../state/profiles'
import { useStore } from '../state/store'
import './Browse.css'

/** Shown when no Xtream provider catalogue is active: Kinora provides access to verified open & public domain film archives */
export function NoTitles({ kind }: { kind: 'films' | 'series' }) {
  const store = useStore()
  const { isKidsMode } = useProfiles()
  const hasProvider = store.xtreamSources.length > 0
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null)

  const catId = kind === 'films' ? 'movies' : 'series'
  const openResources = useMemo(() => {
    const raw = store.mediaLibrary.allResources.filter((r) => r.category === catId)
    return isKidsMode ? filterKidSafeResources(raw, true) : raw
  }, [store.mediaLibrary.allResources, catId, isKidsMode])

  const selectedResource = useMemo(() => {
    if (!selectedResourceId) return null
    return store.mediaLibrary.allResources.find((r) => r.id === selectedResourceId) ?? null
  }, [selectedResourceId, store.mediaLibrary.allResources])

  return (
    <>
      <PageHeader
        title={kind === 'films' ? 'Movies' : 'Series'}
        tabs={<BrowseTabs />}
        actions={
          <Link to="/sources/add?kind=xtream" className="btn btn-small btn-primary header-action-btn">
            <Icon name="plus" size={14} /> Add Provider
          </Link>
        }
      />
      <div className="page browse">
        <div className="media-hero-banner" style={{ marginBottom: 24 }}>
          <div className="media-hero-content">
            <span className="media-hero-kicker">ON-DEMAND PROVIDER STATUS & PUBLIC ARCHIVES</span>
            <h2 className="media-hero-title">{kind === 'films' ? 'Films & Cinema' : 'Television Series'}</h2>
            <p className="media-hero-subtitle">
              {hasProvider
                ? 'Provider names and counts are saved, but its catalogue must be refreshed after restart.'
                : `Your M3U playlists provide ${store.channels.length} unique live TV channels, not on-demand ${kind === 'films' ? 'movies' : 'series'}. Connect an Xtream Codes VOD provider to import playable ${kind === 'films' ? 'films' : 'series'}, or browse the indexed public-domain archives and metadata directories below.`}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
              <span className="pill pill-pending">
                On-Demand VOD Provider: {hasProvider ? `${store.xtreamSources.length} saved (reconnect required)` : 'No Xtream provider connected (0 imported titles)'}
              </span>
              <span className="pill pill-healthy">
                External Reference Archives: {openResources.length} verified {kind === 'films' ? 'film archives' : 'series directories'} indexed
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <Link to={hasProvider ? '/sources' : '/sources/add?kind=xtream'} className="btn btn-primary btn-small">
                <Icon name="plus" size={16} /> {hasProvider ? 'Reconnect Provider in Sources' : 'Add an Xtream compatible provider'}
              </Link>
              <Link to={`/sources/add?kind=custom&category=${catId}`} className="btn btn-secondary btn-small">
                <Icon name="sources" size={16} /> Add Custom {kind === 'films' ? 'Movie' : 'Series'} Source
              </Link>
            </div>
          </div>
        </div>

        {openResources.length > 0 && (
          <section className="media-sec" aria-label={`Open ${kind === 'films' ? 'Film' : 'Series'} Archives`}>
            <div className="media-sec-header" style={{ marginBottom: 14 }}>
              <h3 className="media-sec-title">
                {kind === 'films' ? 'Verified Film Catalogues & Archives' : 'Verified Television & Serial Archives'}
                <span className="media-sec-count">({openResources.length} indexed)</span>
              </h3>
              <p className="section-sub" style={{ marginTop: 4, display: 'block' }}>
                External repositories and digital preservation archives. These entries are indexed catalogues for discovering public domain works.
              </p>
            </div>
            <div className="media-resources-grid variant-wide">
              {openResources.map((res) => (
                <ResourceCard
                  key={res.id}
                  resource={res}
                  variant="wide"
                  inLibrary={store.mediaLibrary.isInPersonalLibrary(res.id)}
                  isFavourite={store.mediaLibrary.isResourceFavourite(res.id)}
                  isEnabled={store.mediaLibrary.isSourceEnabled(res.id)}
                  onToggleLibrary={() => store.mediaLibrary.isInPersonalLibrary(res.id) ? store.mediaLibrary.removeFromPersonalLibrary(res.id) : store.mediaLibrary.addToPersonalLibrary(res.id)}
                  onToggleFavourite={() => store.mediaLibrary.toggleResourceFavourite(res.id)}
                  onToggleEnabled={() => store.mediaLibrary.toggleSourceEnabled(res.id)}
                  onOpenDetails={() => setSelectedResourceId(res.id)}
                />
              ))}
            </div>
          </section>
        )}

        {selectedResource && (
          <ResourceDetailModal
            resource={selectedResource}
            inLibrary={store.mediaLibrary.isInPersonalLibrary(selectedResource.id)}
            isFavourite={store.mediaLibrary.isResourceFavourite(selectedResource.id)}
            userNotes={store.mediaLibrary.getResourceNotes(selectedResource.id)}
            isEnabled={store.mediaLibrary.isSourceEnabled(selectedResource.id)}
            onClose={() => setSelectedResourceId(null)}
            onToggleLibrary={() => store.mediaLibrary.isInPersonalLibrary(selectedResource.id) ? store.mediaLibrary.removeFromPersonalLibrary(selectedResource.id) : store.mediaLibrary.addToPersonalLibrary(selectedResource.id)}
            onToggleFavourite={() => store.mediaLibrary.toggleResourceFavourite(selectedResource.id)}
            onToggleEnabled={() => store.mediaLibrary.toggleSourceEnabled(selectedResource.id)}
            onSaveNotes={(notes) => store.mediaLibrary.updateResourceNotes(selectedResource.id, notes)}
            onVerifyNow={(id) => store.mediaLibrary.verifyResourceNow(id)}
          />
        )}
      </div>
    </>
  )
}

export function BrowseTabs() {
  return (
    <nav className="tabs" aria-label="Catalogue">
      <NavLink to="/movies" className="tab">Movies</NavLink>
      <NavLink to="/series" className="tab">Series</NavLink>
    </nav>
  )
}

const sorts = {
  added: { label: 'Sort: Recently added', fn: (a: Movie, b: Movie) => b.added.localeCompare(a.added) },
  title: { label: 'Sort: Title A to Z', fn: (a: Movie, b: Movie) => a.title.localeCompare(b.title) },
  newest: { label: 'Sort: Newest', fn: (a: Movie, b: Movie) => b.year - a.year },
  oldest: { label: 'Sort: Oldest', fn: (a: Movie, b: Movie) => a.year - b.year },
  shortest: { label: 'Sort: Shortest', fn: (a: Movie, b: Movie) => a.runtime - b.runtime },
} as const
type SortKey = keyof typeof sorts

export function Movies() {
  const store = useStore()
  const { isKidsMode } = useProfiles()
  const { prefs, library } = store
  const [params, setParams] = useSearchParams()
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

  const xtreamYears = useMemo(() => {
    const yrs = safeXtreamMovies.map((m) => m.year).filter((y): y is number => y !== null)
    return [...new Set(yrs)].sort((a, b) => b - a)
  }, [safeXtreamMovies])

  const normalizedProviderQuery = providerQuery.trim().toLocaleLowerCase()
  const genre = params.get('genre') ?? 'All'
  const category = params.get('category') ?? 'All'
  const provider = params.get('provider') ?? 'All'
  const year = params.get('year') ?? 'All'
  const duration = params.get('duration') ?? 'All'
  const sort = (params.get('sort') ?? 'added') as SortKey

  const safeMovies = useMemo(() => {
    return filterKidSafeTitles(movies, isKidsMode)
  }, [isKidsMode])

  const set = (key: string, value: string, fallback: string) => {
    const next = new URLSearchParams(params)
    if (value === fallback) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  const years = [...new Set(safeMovies.map((m) => m.year))].sort((a, b) => b - a)
  const list = safeMovies
    .filter((m) => genre === 'All' || m.genres.includes(genre))
    .filter((m) => year === 'All' || String(m.year) === year)
    .filter((m) => {
      if (duration === 'under90') return m.runtime < 90
      if (duration === '90to120') return m.runtime >= 90 && m.runtime <= 120
      if (duration === 'over120') return m.runtime > 120
      return true
    })
    .filter((m) => !prefs.hideWatched || !library.watched.includes(movieRef(m.id)))
    .sort((sorts[sort] ?? sorts.added).fn)
  const filtered = genre !== 'All' || year !== 'All' || duration !== 'All'

  if (store.xtreamSources.length > 0) {
    if (enabledSources.length === 0 || (safeXtreamMovies.length === 0 && !enabledSources.some((source) => source.connected))) {
      return <NoTitles kind="films" />
    }
    if (safeXtreamMovies.length === 0) {
      return (
        <>
          <PageHeader title="Movies" tabs={<BrowseTabs />} />
          <div className="page">
            <StateBlock icon="film" title="No movies in this catalogue" action={<Link to="/sources" className="btn btn-ghost">Open Sources</Link>}>
              The provider connection succeeded, but it returned no movie entries.
            </StateBlock>
          </div>
        </>
      )
    }

    const sortFn = (a: (typeof safeXtreamMovies)[number], b: (typeof safeXtreamMovies)[number]) => {
      const s = params.get('sort') ?? 'title'
      if (s === 'title-desc') return b.name.localeCompare(a.name)
      if (s === 'newest') return (b.year ?? 0) - (a.year ?? 0)
      if (s === 'oldest') return (a.year ?? 0) - (b.year ?? 0)
      if (s === 'rating') return (b.rating ?? 0) - (a.rating ?? 0)
      return a.name.localeCompare(b.name)
    }

    const filteredXtream = safeXtreamMovies
      .filter((m) => category === 'All' || m.categoryId === category || m.categoryName === category)
      .filter((m) => provider === 'All' || m.sourceId === provider)
      .filter((m) => year === 'All' || String(m.year) === year)
      .filter((m) => !prefs.hideWatched || !library.watched.includes(`movie:xt:${m.sourceId}:${m.id}`))
      .filter((m) => !normalizedProviderQuery || m.name.toLocaleLowerCase().includes(normalizedProviderQuery))
      .sort(sortFn)

    const isFiltered = category !== 'All' || provider !== 'All' || year !== 'All' || Boolean(normalizedProviderQuery)
    const sourceName = (id: string) => store.xtreamSources.find((source) => source.id === id)?.name ?? 'Provider'
    const shown = filteredXtream.slice(0, providerLimit)
    const activeProviderCount = new Set(filteredXtream.map((movie) => movie.sourceId)).size

    return (
      <>
        <PageHeader title="Movies" tabs={<BrowseTabs />} />
        <div className="page browse">
          <div className="browse-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <label className="provider-search" style={{ flex: '1 1 200px', minWidth: '180px' }}>
              <span className="sr-only">Search imported movies</span>
              <input
                className="input"
                type="search"
                value={providerQuery}
                onChange={(event) => { setProviderQuery(event.target.value); setProviderLimit(100) }}
                placeholder="Search movies..."
              />
            </label>
            <div className="filters" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <select
                className="select select-inline"
                value={category}
                onChange={(e) => { set('category', e.target.value, 'All'); setProviderLimit(100) }}
                aria-label="Category"
              >
                <option value="All">All Categories</option>
                {vodCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              {enabledSources.length > 1 && (
                <select
                  className="select select-inline"
                  value={provider}
                  onChange={(e) => { set('provider', e.target.value, 'All'); setProviderLimit(100) }}
                  aria-label="Provider"
                >
                  <option value="All">All Providers</option>
                  {enabledSources.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}

              {xtreamYears.length > 0 && (
                <select
                  className="select select-inline"
                  value={year}
                  onChange={(e) => { set('year', e.target.value, 'All'); setProviderLimit(100) }}
                  aria-label="Year"
                >
                  <option value="All">All Years</option>
                  {xtreamYears.map((y) => (
                    <option key={y} value={String(y)}>{y}</option>
                  ))}
                </select>
              )}

              <select
                className="select select-inline"
                value={params.get('sort') ?? 'title'}
                onChange={(e) => { set('sort', e.target.value, 'title'); setProviderLimit(100) }}
                aria-label="Sort"
              >
                <option value="title">Sort: Title A to Z</option>
                <option value="title-desc">Sort: Title Z to A</option>
                <option value="newest">Sort: Newest</option>
                <option value="oldest">Sort: Oldest</option>
                <option value="rating">Sort: Rating</option>
              </select>
            </div>
            <Segmented
              className="icons"
              label="Layout"
              value={prefs.movieLayout}
              onChange={(v) => store.setPref('movieLayout', v)}
              options={[
                { value: 'poster', label: '', icon: 'grid', name: 'Poster grid' },
                { value: 'landscape', label: '', icon: 'rows', name: 'Wide list' },
              ]}
            />
          </div>

          <p className="browse-count faint" aria-live="polite">
            Showing {shown.length} of {filteredXtream.length} imported movies across {activeProviderCount} provider{activeProviderCount === 1 ? '' : 's'}. Artwork is loaded securely through Kinora.
          </p>

          {filteredXtream.length === 0 ? (
            <StateBlock
              icon="search"
              title="No movies match these filters"
              action={
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setParams({}, { replace: true })
                    setProviderQuery('')
                    setProviderLimit(100)
                  }}
                >
                  Clear filters
                </button>
              }
            >
              {isFiltered ? 'Try clearing the search query or changing category and year filters.' : 'No movies found.'}
            </StateBlock>
          ) : prefs.movieLayout === 'poster' ? (
            <div className="grid-posters">
              {shown.map((movie) => {
                const routeId = `xt:${movie.sourceId}:${movie.id}`
                const line = [movie.year, sourceName(movie.sourceId)].filter(Boolean).join(' · ')
                const ref = `movie:xt:${movie.sourceId}:${movie.id}`
                const isWatched = library.watched.includes(ref)
                const isProgress = library.progress[ref]
                const flag = isWatched ? <><Icon name="check" size={12} />Watched</> : isProgress ? 'In progress' : undefined
                return (
                  <XtreamPosterCard
                    key={`${movie.sourceId}:${movie.id}`}
                    to={`/movies/${encodeURIComponent(routeId)}`}
                    title={movie.name}
                    artworkKey={movie.artworkKey}
                    line={line}
                    year={movie.year}
                    flag={flag}
                  />
                )
              })}
            </div>
          ) : (
            <div className="grid-cards">
              {shown.map((movie) => {
                const routeId = `xt:${movie.sourceId}:${movie.id}`
                const line = [movie.year, movie.categoryName, sourceName(movie.sourceId)].filter(Boolean).join(' · ')
                const ref = `movie:xt:${movie.sourceId}:${movie.id}`
                const isWatched = library.watched.includes(ref)
                const isProgress = library.progress[ref]
                const flag = isWatched ? <><Icon name="check" size={12} />Watched</> : isProgress ? 'In progress' : undefined
                return (
                  <WideCard
                    key={`${movie.sourceId}:${movie.id}`}
                    to={`/movies/${encodeURIComponent(routeId)}`}
                    title={movie.name}
                    sub={line}
                    artworkKey={movie.artworkKey}
                    flag={flag}
                  />
                )
              })}
            </div>
          )}

          {shown.length < filteredXtream.length && (
            <button
              type="button"
              className="btn btn-secondary catalogue-more"
              onClick={() => setProviderLimit((limit) => Math.min(filteredXtream.length, limit + 100))}
            >
              Show 100 more movies
            </button>
          )}
        </div>
      </>
    )
  }
  if (!store.demoTitles) return <NoTitles kind="films" />

  return (
    <>
      <PageHeader title="Movies" tabs={<BrowseTabs />} />
      <div className="page browse">
        <div className="browse-bar">
          <div className="filters">
            <select className="select select-inline" value={genre} onChange={(e) => set('genre', e.target.value, 'All')} aria-label="Genre">
              <option value="All">All Genres</option>
              {genresOf(movies).map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <select className="select select-inline" value={year} onChange={(e) => set('year', e.target.value, 'All')} aria-label="Year">
              <option value="All">All Years</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <select className="select select-inline" value={duration} onChange={(e) => set('duration', e.target.value, 'All')} aria-label="Duration">
              <option value="All">All Durations</option>
              <option value="under90">Under 90 mins</option>
              <option value="90to120">90 - 120 mins</option>
              <option value="over120">Over 120 mins</option>
            </select>
            <select className="select select-inline" value={sort} onChange={(e) => set('sort', e.target.value, 'added')} aria-label="Sort">
              {Object.entries(sorts).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <Segmented className="icons" label="Layout" value={prefs.movieLayout} onChange={(v) => store.setPref('movieLayout', v)} options={[{ value: 'poster', label: '', icon: 'grid', name: 'Poster grid' }, { value: 'landscape', label: '', icon: 'rows', name: 'Wide list' }]} />
        </div>

        <p className="browse-count faint" aria-live="polite">{list.length} {list.length === 1 ? 'movie' : 'movies'}{prefs.hideWatched && ' · hiding watched'} · demonstration catalogue</p>

        {list.length === 0 ? (
          <StateBlock
            icon="film"
            title="No movies match these filters"
            action={filtered
              ? <button type="button" className="btn btn-ghost" onClick={() => setParams({}, { replace: true })}>Clear filters</button>
              : <button type="button" className="btn btn-ghost" onClick={() => store.setPref('hideWatched', false)}>Show watched films</button>}
          >
            {filtered ? 'Try another genre or year, or clear the filters to see the whole catalogue.' : 'Everything here is marked as watched. Turn off “Hide watched” in Settings to see it again.'}
          </StateBlock>
        ) : prefs.movieLayout === 'poster' ? (
          <div className="grid-posters">
            {list.map((m) => (
              <PosterCard key={m.id} to={`/movies/${m.id}`} title={m.title} art={m.art} focus={m.focus} line={`${m.year} · ${m.certificate} · ${runtimeLabel(m.runtime)}`} flag={flagFor(m, library.watched, library.progress)} />
            ))}
          </div>
        ) : (
          <div className="grid-cards">
            {list.map((m) => (
              <WideCard key={m.id} to={`/movies/${m.id}`} title={m.title} sub={`${m.year} · ${m.genres.join(' / ')} · ${runtimeLabel(m.runtime)}`} art={m.art} focus={m.focus} flag={flagFor(m, library.watched, library.progress)} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function flagFor(m: Movie, watched: string[], progress: Record<string, unknown>) {
  const ref = movieRef(m.id)
  if (watched.includes(ref)) return <><Icon name="check" size={12} />Watched</>
  if (progress[ref]) return 'In progress'
  return undefined
}
