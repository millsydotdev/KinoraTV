import { useSearchParams } from 'react-router-dom'
import { genresOf, series } from '../data/catalog'
import { episodeCode } from '../data/refs'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { PosterCard } from '../components/Tiles'
import { StateBlock } from '../components/ui'
import { seriesNextUp } from '../lib/library'
import { useStore } from '../state/store'
import { BrowseTabs, NoTitles } from './Movies'
import './Browse.css'

const sorts = { added: 'Sort: Recently added', title: 'Sort: Title A to Z', episodes: 'Sort: Most episodes' } as const
type SortKey = keyof typeof sorts

export function SeriesBrowse() {
  const { library, demoTitles } = useStore()
  const [params, setParams] = useSearchParams()
  const genre = params.get('genre') ?? 'All'
  const sort = (params.get('sort') ?? 'added') as SortKey
  const status = params.get('status') ?? 'all'

  const set = (key: string, value: string, fallback: string) => {
    const next = new URLSearchParams(params)
    if (value === fallback) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  const list = series
    .map((s) => ({ s, up: seriesNextUp(library, s) }))
    .filter(({ s }) => genre === 'All' || s.genres.includes(genre))
    .filter(({ up }) => status === 'all' || (status === 'watching' ? up.state === 'resume' || up.state === 'next' : up.state === 'start'))
    .sort((a, b) =>
      sort === 'title' ? a.s.title.localeCompare(b.s.title)
        : sort === 'episodes' ? b.s.seasons.flat().length - a.s.seasons.flat().length
          : b.s.added.localeCompare(a.s.added),
    )

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
