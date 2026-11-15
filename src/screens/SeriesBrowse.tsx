import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { genresOf, series } from '../data/catalog'
import { episodeCode } from '../data/refs'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { PosterCard, XtreamPosterCard } from '../components/Tiles'
import { StateBlock } from '../components/ui'
import { filterKidSafeTitles, filterKidSafeXtreamTitles } from '../lib/kidsMode'
import { seriesNextUp } from '../lib/library'
import { useProfiles } from '../state/profiles'
import { useStore } from '../state/store'
import { BrowseTabs, NoTitles } from './Movies'
import './Browse.css'

const sorts = { added: 'Sort: Recently added', title: 'Sort: Title A to Z', episodes: 'Sort: Most episodes' } as const
type SortKey = keyof typeof sorts

export function SeriesBrowse() {
  const store = useStore()
  const { isKidsMode } = useProfiles()
  const { library, demoTitles } = store
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

  const normalizedProviderQuery = providerQuery.trim().toLocaleLowerCase()
  const [params, setParams] = useSearchParams()
  const genre = params.get('genre') ?? 'All'
  const category = params.get('category') ?? 'All'
  const provider = params.get('provider') ?? 'All'
  const sort = (params.get('sort') ?? 'added') as SortKey
  const status = params.get('status') ?? 'all'
  const seriesStatus = params.get('seriesStatus') ?? 'All'

  const safeSeries = useMemo(() => {
    return filterKidSafeTitles(series, isKidsMode)
  }, [isKidsMode])

  const set = (key: string, value: string, fallback: string) => {
    const next = new URLSearchParams(params)
    if (value === fallback) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  const list = safeSeries
    .map((s) => ({ s, up: seriesNextUp(library, s) }))
    .filter(({ s }) => genre === 'All' || s.genres.includes(genre))
    .filter(({ s }) => {
      if (seriesStatus === 'All') return true
      const isContinuing = s.years.endsWith('-') || s.years.includes('Present') || !s.years.includes('-')
      return seriesStatus === 'Continuing' ? isContinuing : !isContinuing
    })
    .filter(({ up }) => status === 'all' || (status === 'watching' ? up.state === 'resume' || up.state === 'next' : up.state === 'start'))
    .sort((a, b) =>
      sort === 'title' ? a.s.title.localeCompare(b.s.title)
        : sort === 'episodes' ? b.s.seasons.flat().length - a.s.seasons.flat().length
          : b.s.added.localeCompare(a.s.added),
    )

  if (store.xtreamSources.length > 0) {
    if (enabledSources.length === 0 || (safeXtreamSeries.length === 0 && !enabledSources.some((source) => source.connected))) {
      return <NoTitles kind="series" />
    }
    if (safeXtreamSeries.length === 0) {
      return (
        <>
          <PageHeader title="Series" tabs={<BrowseTabs />} />
          <div className="page">
            <StateBlock icon="series" title="No series in this catalogue" action={<Link to="/sources" className="btn btn-ghost">Open Sources</Link>}>
              The provider connection succeeded, but it returned no series entries.
            </StateBlock>
          </div>
        </>
      )
    }

    const sortFn = (a: (typeof safeXtreamSeries)[number], b: (typeof safeXtreamSeries)[number]) => {
      const s = params.get('sort') ?? 'title'
      if (s === 'title-desc') return b.name.localeCompare(a.name)
      if (s === 'newest') return (b.year ?? 0) - (a.year ?? 0)
      if (s === 'oldest') return (a.year ?? 0) - (b.year ?? 0)
      if (s === 'rating') return (b.rating ?? 0) - (a.rating ?? 0)
      return a.name.localeCompare(b.name)
    }

    const filteredXtream = safeXtreamSeries
      .filter((s) => category === 'All' || s.categoryId === category || s.categoryName === category)
      .filter((s) => provider === 'All' || s.sourceId === provider)
      .filter((s) => !normalizedProviderQuery || s.name.toLocaleLowerCase().includes(normalizedProviderQuery))
      .sort(sortFn)

    const isFiltered = category !== 'All' || provider !== 'All' || Boolean(normalizedProviderQuery)
    const shown = filteredXtream.slice(0, providerLimit)
    const sourceName = (id: string) => store.xtreamSources.find((source) => source.id === id)?.name ?? 'Provider'
    const importedProviders = new Set(filteredXtream.map((show) => show.sourceId)).size

    return (
      <>
        <PageHeader title="Series" tabs={<BrowseTabs />} />
        <div className="page browse">
          <div className="browse-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <label className="provider-search" style={{ flex: '1 1 200px', minWidth: '180px' }}>
              <span className="sr-only">Search imported series</span>
              <input
                className="input"
                type="search"
                value={providerQuery}
                onChange={(event) => { setProviderQuery(event.target.value); setProviderLimit(100) }}
                placeholder="Search series..."
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
                {seriesCategories.map((c) => (
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
          </div>

          <p className="browse-count faint" aria-live="polite">
            Showing {shown.length} of {filteredXtream.length} imported series across {importedProviders} provider{importedProviders === 1 ? '' : 's'}.
          </p>

          {filteredXtream.length === 0 ? (
            <StateBlock
              icon="search"
              title="No series match these filters"
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
              {isFiltered ? 'Try clearing the search query or changing category and provider filters.' : 'No series found.'}
            </StateBlock>
          ) : (
            <div className="grid-posters">
              {shown.map((show) => {
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

          {shown.length < filteredXtream.length && (
            <button
              type="button"
              className="btn btn-secondary catalogue-more"
              onClick={() => setProviderLimit((limit) => Math.min(filteredXtream.length, limit + 100))}
            >
              Show 100 more series
            </button>
          )}
        </div>
      </>
    )
  }
  if (!demoTitles) return <NoTitles kind="series" />
  return (
    <>
      <PageHeader title="Series" tabs={<BrowseTabs />} />
      <div className="page browse">
        <div className="browse-bar">
          <div className="filters">
            <select className="select select-inline" value={genre} onChange={(e) => set('genre', e.target.value, 'All')} aria-label="Genre">
              <option value="All">All Genres</option>
              {genresOf(series).map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <select className="select select-inline" value={status} onChange={(e) => set('status', e.target.value, 'all')} aria-label="Watching status">
              <option value="all">All Series</option>
              <option value="watching">Watching</option>
              <option value="new">Not started</option>
            </select>
            <select className="select select-inline" value={seriesStatus} onChange={(e) => set('seriesStatus', e.target.value, 'All')} aria-label="Series status">
              <option value="All">All Statuses</option>
              <option value="Continuing">Continuing (On Air)</option>
              <option value="Ended">Ended (Box Sets)</option>
            </select>
            <select className="select select-inline" value={sort} onChange={(e) => set('sort', e.target.value, 'added')} aria-label="Sort">
              {Object.entries(sorts).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        <p className="browse-count faint" aria-live="polite">{list.length} series · demonstration catalogue</p>

        {list.length === 0 ? (
          <StateBlock icon="series" title="No series match these filters" action={<button type="button" className="btn btn-ghost" onClick={() => setParams({}, { replace: true })}>Clear filters</button>}>
            {status === 'watching' ? 'You have not started any series in this genre yet.' : 'Try another genre or status.'}
          </StateBlock>
        ) : (
          <div className="grid-posters">
            {list.map(({ s, up }) => {
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
    </>
  )
}
