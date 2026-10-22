import { useRef, type KeyboardEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { seriesById } from '../data/catalog'
import { episodeCode, episodeRef } from '../data/refs'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { TitleActions } from '../components/TitleActions'
import { useToast } from '../components/Toast'
import { Art, ProgressBar, StateBlock } from '../components/ui'
import { seriesNextUp } from '../lib/library'
import { minutesLeft } from '../lib/time'
import { progressOf, useStore } from '../state/store'
import './Detail.css'

export function SeriesDetail() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const store = useStore()
  const toast = useToast()
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const s = seriesById(id)

  if (!s) {
    return (
      <div className="page">
        <PageHeader title="Series" />
        <StateBlock icon="series" title="Series not found" action={<Link to="/series" className="btn btn-primary">Browse series</Link>}>
          There is no series at this address in the demonstration catalogue.
        </StateBlock>
      </div>
    )
  }

  const up = seriesNextUp(store.library, s)
  const seasonNo = Math.min(s.seasons.length, Math.max(1, Number(params.get('season')) || up.episode.season))
  const episodes = s.seasons[seasonNo - 1] ?? []
  const seasonRefs = episodes.map((e) => episodeRef(s.id, e.id))
  const seasonWatched = seasonRefs.every((r) => store.library.watched.includes(r))
  const totalEps = s.seasons.flat().length
  const watchedEps = s.seasons.flat().filter((e) => store.library.watched.includes(episodeRef(s.id, e.id))).length

  const pickSeason = (n: number) => setParams({ season: String(n) }, { replace: true })
  const onTabKey = (e: KeyboardEvent) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    const n = ((seasonNo - 1 + dir + s.seasons.length) % s.seasons.length) + 1
    pickSeason(n)
    tabs.current[n - 1]?.focus()
  }

  return (
    <article className="detail">
      <header className="detail-hero">
        <Art src={s.art} focus={s.focus} eager className="detail-backdrop" />
        <PageHeader overlay />
        <div className="detail-hero-content">
          <Link to="/series" className="text-link detail-back"><Icon name="back" size={16} />Series</Link>
          <p className="kicker"><Icon name="series" size={16} />Series · {s.genres.join(' / ')}</p>
          <h1 className="title-xl">{s.title}</h1>
          <p className="detail-tagline">{s.tagline}</p>
          <div className="meta">
            <span>{s.years}</span>
            <span>{s.seasons.length} season{s.seasons.length > 1 ? 's' : ''}</span>
            <span>{totalEps} episodes</span>
            <span><span className="cert">{s.certificate}</span></span>
          </div>
          <p className="detail-synopsis">{s.synopsis}</p>
          {watchedEps > 0 && (
            <div className="detail-progress">
              <ProgressBar value={watchedEps / totalEps} label="Series progress" />
              <span className="faint tnum">{watchedEps} of {totalEps} episodes watched</span>
            </div>
          )}
          <TitleActions title={s} />
        </div>
      </header>

      <section className="episodes" aria-label="Episodes">
        <div className="episodes-head">
          <div className="tabs" role="tablist" aria-label="Seasons" onKeyDown={onTabKey}>
            {s.seasons.map((_, i) => (
              <button
                key={i}
                ref={(el) => { tabs.current[i] = el }}
                type="button"
                role="tab"
                id={`season-tab-${i + 1}`}
                aria-selected={seasonNo === i + 1}
                aria-controls="season-panel"
                tabIndex={seasonNo === i + 1 ? 0 : -1}
                className="tab"
                onClick={() => pickSeason(i + 1)}
              >
                Season {i + 1}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => {
              const before = seasonRefs.filter((r) => store.library.watched.includes(r))
              store.setWatched(seasonRefs, !seasonWatched)
              toast(seasonWatched ? `Season ${seasonNo} marked as not watched` : `Season ${seasonNo} marked as watched`, {
                label: 'Undo',
                run: () => {
                  store.setWatched(seasonRefs, false)
                  store.setWatched(before, true)
                },
              })
            }}
          >
            <Icon name={seasonWatched ? 'close' : 'check'} size={16} />
            {seasonWatched ? 'Mark season unwatched' : 'Mark season watched'}
          </button>
        </div>

        <ol id="season-panel" role="tabpanel" aria-labelledby={`season-tab-${seasonNo}`} className="episode-list">
          {episodes.map((e) => {
            const ref = episodeRef(s.id, e.id)
            const watched = store.library.watched.includes(ref)
            const prog = progressOf(store.library, ref)
            const isNext = up.episode.id === e.id && up.state !== 'rewatch'
            const p = store.library.progress[ref]
            return (
              <li key={e.id} className={`episode${watched ? ' is-watched' : ''}${isNext ? ' is-next' : ''}`}>
                <Link to={`/watch/${encodeURIComponent(ref)}`} className="episode-still" aria-label={`Play ${episodeCode(e)}, ${e.title}`}>
                  <Art src={e.still} focus={e.stillFocus}>
                    <span className="episode-play"><Icon name="play" size={18} /></span>
                    {prog !== null && <ProgressBar value={prog} label={`${Math.round(prog * 100)}% watched`} />}
                  </Art>
                </Link>
                <div className="episode-text">
                  <p className="episode-meta">
                    <span className="tnum">{e.number}</span>
                    <span>{e.runtime} min</span>
                    {isNext && <span className="episode-next">{up.state === 'resume' ? `Resume · ${p ? minutesLeft(p.pos, p.dur) : e.runtime} min left` : 'Up next'}</span>}
                  </p>
                  <h3>{e.title}</h3>
                  <p className="muted">{e.synopsis}</p>
                </div>
                <button
                  type="button"
                  className="episode-check"
                  role="checkbox"
                  aria-checked={watched}
                  aria-label={`${episodeCode(e)} watched`}
                  onClick={() => store.setWatched([ref], !watched)}
                >
                  <Icon name="check" size={18} />
                </button>
              </li>
            )
          })}
        </ol>
      </section>
    </article>
  )
}
