import { Link, NavLink, useSearchParams } from 'react-router-dom'
import { genresOf, movies } from '../data/catalog'
import { movieRef, runtimeLabel } from '../data/refs'
import type { Movie } from '../data/types'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { PosterCard, WideCard } from '../components/Tiles'
import { Segmented, StateBlock } from '../components/ui'
import { useStore } from '../state/store'
import './Browse.css'

/** Shown instead of the fictional catalogue once real playlists exist: Kinora has no film or series source yet. */
export function NoTitles({ kind }: { kind: 'films' | 'series' }) {
  return (
    <>
      <PageHeader title={kind === 'films' ? 'Movies' : 'Series'} tabs={<BrowseTabs />} />
      <div className="page">
        <StateBlock icon={kind === 'films' ? 'film' : 'series'} title={kind === 'films' ? 'No films yet' : 'No series yet'} action={<Link to="/live" className="btn btn-ghost">Go to Live TV</Link>}>
          Kinora has no source for films and series yet. Your imported playlists provide live TV.
        </StateBlock>
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
  const { prefs, library } = store
  const [params, setParams] = useSearchParams()
  const genre = params.get('genre') ?? 'All'
  const year = params.get('year') ?? 'All'
  const sort = (params.get('sort') ?? 'added') as SortKey

  const set = (key: string, value: string, fallback: string) => {
    const next = new URLSearchParams(params)
    if (value === fallback) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  const years = [...new Set(movies.map((m) => m.year))].sort((a, b) => b - a)
  const list = movies
    .filter((m) => genre === 'All' || m.genres.includes(genre))
    .filter((m) => year === 'All' || String(m.year) === year)
    .filter((m) => !prefs.hideWatched || !library.watched.includes(movieRef(m.id)))
    .sort((sorts[sort] ?? sorts.added).fn)
  const filtered = genre !== 'All' || year !== 'All'
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
