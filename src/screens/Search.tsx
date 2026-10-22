import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { genresOf, movies, series, titles } from '../data/catalog'
import { channels, programmeAt, scheduleFor } from '../data/channels'
import { episodeCode, episodeRef } from '../data/refs'
import { Icon, type IconName } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { Art, ChannelMark, StateBlock } from '../components/ui'
import { clock, useNow } from '../lib/time'
import { useStore } from '../state/store'
import './Search.css'

type Group = 'channels' | 'tv' | 'films' | 'series' | 'episodes'
const groupLabels: Record<Group, string> = { channels: 'Channels', tv: 'On TV Today', films: 'Movies', series: 'Series', episodes: 'Episodes' }
const groupIcons: Record<Group, IconName> = { channels: 'tv', tv: 'guide', films: 'film', series: 'series', episodes: 'play' }
const PER_GROUP = 8

type Hit = { key: string; to: string; thumb: ReactNode; title: string; sub: string }

function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q) : -1
  if (i < 0) return <>{text}</>
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>
}

export function Search() {
  const now = useNow()
  const store = useStore()
  const { prefs, library } = store
  const [params, setParams] = useSearchParams()
  // The input owns its text; the URL follows it, so fast typing never waits on navigation.
  const [q, setQ] = useState(() => params.get('q') ?? '')
  const filter = (params.get('type') ?? 'all') as Group | 'all'
  const input = useRef<HTMLInputElement>(null)
  const results = useRef<HTMLDivElement>(null)
  const needle = q.trim().toLowerCase()

  useEffect(() => input.current?.focus(), [])
  useEffect(() => {
    if ((params.get('q') ?? '') === q) return
    const next = new URLSearchParams(params)
    if (q) next.set('q', q)
    else next.delete('q')
    setParams(next, { replace: true })
  }, [q, params, setParams])

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const has = (...fields: string[]) => fields.some((f) => f.toLowerCase().includes(needle))
  const groups: Record<Group, Hit[]> = { channels: [], tv: [], films: [], series: [], episodes: [] }
  if (needle) {
    groups.channels = channels.filter((c) => has(c.name, c.group, String(c.number))).map((c) => ({
      key: c.id, to: `/live?channel=${c.id}`, thumb: <ChannelMark channel={c} size={44} />, title: c.name,
      sub: `${c.number} · ${c.group}${programmeAt(c, now) ? ` · Now: ${programmeAt(c, now)?.title}` : ''}`,
    }))
    const seen = new Set<string>()
    groups.tv = channels
      .flatMap((c) => scheduleFor(c, now).filter((p) => p.stop > now && has(p.title, p.category)).map((p) => ({ c, p })))
      .sort((a, b) => a.p.start - b.p.start)
      .filter(({ c, p }) => !seen.has(c.id + p.title) && !!seen.add(c.id + p.title))
      .map(({ c, p }) => ({
        key: p.id, to: `/live?channel=${c.id}`, thumb: <Art src={p.art} />, title: p.title,
        sub: `${p.start <= now ? 'On now' : clock(p.start, prefs.timeFormat)} · ${c.name} · ${p.category}`,
      }))
    groups.films = movies.filter((m) => has(m.title, m.synopsis, ...m.genres)).map((m) => ({
      key: m.id, to: `/movies/${m.id}`, thumb: <Art src={m.art} focus={m.focus} />, title: m.title, sub: `Movie · ${m.year} · ${m.genres.join(' / ')}`,
    }))
    groups.series = series.filter((s) => has(s.title, s.synopsis, ...s.genres)).map((s) => ({
      key: s.id, to: `/series/${s.id}`, thumb: <Art src={s.art} focus={s.focus} />, title: s.title, sub: `Series · ${s.seasons.length} season${s.seasons.length > 1 ? 's' : ''} · ${s.genres.join(' / ')}`,
    }))
    groups.episodes = series.flatMap((s) =>
      s.seasons.flat().filter((e) => has(e.title, e.synopsis)).map((e) => ({
        key: `${s.id}/${e.id}`, to: `/watch/${encodeURIComponent(episodeRef(s.id, e.id))}`, thumb: <Art src={e.still} focus={e.stillFocus} />,
        title: e.title, sub: `${s.title} · ${episodeCode(e)} · ${e.runtime} min`,
      })),
    )
  }
  const order: Group[] = ['channels', 'tv', 'films', 'series', 'episodes']
  const total = order.reduce((n, g) => n + groups[g].length, 0)
  const shown = order.filter((g) => (filter === 'all' || filter === g) && groups[g].length > 0)

  const items = () => Array.from(results.current?.querySelectorAll<HTMLElement>('[data-result]') ?? [])
  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); items()[0]?.focus() }
    if (e.key === 'Escape' && q) { e.preventDefault(); setQ('') }
    if (e.key === 'Enter' && needle) store.addRecentSearch(q.trim())
  }
  const onResultsKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const list = items()
    const i = list.indexOf(document.activeElement as HTMLElement)
    if (i < 0) return
    e.preventDefault()
    if (e.key === 'ArrowUp' && i === 0) input.current?.focus()
    else list[Math.min(list.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus()
  }

  return (
    <>
    <PageHeader title="Search" search={false} />
    <div className="page search">
      <div className="search-field">
        <Icon name="search" size={26} />
        <input
          ref={input}
          type="search"
          className="search-input"
          placeholder="Channels, programmes, films, series, episodes"
          aria-label="Search the catalogue and guide"
          aria-describedby="search-help"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onInputKey}
          autoComplete="off"
          spellCheck={false}
        />
        {q && (
          <button type="button" className="icon-btn" onClick={() => { setQ(''); input.current?.focus() }} aria-label="Clear search">
            <Icon name="close" />
          </button>
        )}
      </div>
      <p id="search-help" className="faint search-help">Searches the demonstration catalogue and today's guide. Down arrow moves into the results, Escape clears.</p>

      {needle && (
        <div className="chips search-filters" role="group" aria-label="Result type">
          <button type="button" className="chip" aria-pressed={filter === 'all'} onClick={() => update('type', '')}>All <span className="count tnum">{total}</span></button>
          {order.map((g) => (
            <button key={g} type="button" className="chip" aria-pressed={filter === g} onClick={() => update('type', g)} disabled={groups[g].length === 0}>
              {groupLabels[g]} <span className="count tnum">{groups[g].length}</span>
            </button>
          ))}
        </div>
      )}

      <div ref={results} onKeyDown={onResultsKey} aria-live="polite">
        {!needle && (
          <div className="search-idle">
            <section aria-labelledby="recent-h">
              <h2 id="recent-h" className="section-title"><Icon name="history" size={18} />Recent Searches</h2>
              {library.recentSearches.length === 0 ? (
                <p className="faint">Searches you run with Enter are kept here on this device.</p>
              ) : (
                <ul className="recent">
                  {library.recentSearches.map((s) => (
                    <li key={s}>
                      <button type="button" data-result onClick={() => setQ(s)}><Icon name="history" size={16} />{s}</button>
                      <button type="button" className="icon-btn" aria-label={`Remove ${s} from recent searches`} onClick={() => store.removeRecentSearch(s)}><Icon name="close" size={16} /></button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-labelledby="browse-h">
              <h2 id="browse-h" className="section-title"><Icon name="film" size={18} />Browse by Genre</h2>
              <div className="genre-links">
                {genresOf(titles).map((g) => (
                  <Link key={g} to={`/movies?genre=${encodeURIComponent(g)}`} className="chip" data-result>{g}</Link>
                ))}
              </div>
            </section>
          </div>
        )}

        {needle && total === 0 && (
          <StateBlock icon="search" title={`Nothing found for “${q.trim()}”`}>
            Check the spelling, or try a channel name, a genre such as “Thriller”, or part of a title. Search covers the demonstration catalogue and today's guide only.
          </StateBlock>
        )}

        {shown.map((g) => {
          const hits = filter === 'all' ? groups[g].slice(0, PER_GROUP) : groups[g]
          return (
            <section key={g} className="result-group" aria-labelledby={`group-${g}`}>
              <div className="section-head">
                <h2 id={`group-${g}`} className="section-title"><Icon name={groupIcons[g]} size={18} />{groupLabels[g]}</h2>
                {filter === 'all' && groups[g].length > PER_GROUP && (
                  <button type="button" className="text-link" onClick={() => update('type', g)}>All {groups[g].length}<Icon name="right" size={16} /></button>
                )}
              </div>
              <ul className={`results results-${g}`}>
                {hits.map((h) => (
                  <li key={h.key}>
                    <Link to={h.to} data-result className="card result" onClick={() => store.addRecentSearch(q.trim())}>
                      <span className="result-thumb">{h.thumb}</span>
                      <span className="result-text">
                        <strong><Highlight text={h.title} q={needle} /></strong>
                        <span>{h.sub}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
    </>
  )
}
