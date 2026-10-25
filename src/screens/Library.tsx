import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { resolve, type Resolved } from '../data/refs'
import type { Channel } from '../data/types'
import { Dialog } from '../components/Dialog'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { PosterCard, Section, WideCard } from '../components/Tiles'
import { useToast } from '../components/Toast'
import { Art, ChannelMark, StateBlock } from '../components/ui'
import { continueWatching } from '../lib/library'
import { dayLabel, minutesLeft, relative, useNow } from '../lib/time'
import { useStore, type Collection } from '../state/store'
import './Library.css'

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'watchlist', label: 'Watchlist' },
  { id: 'favourites', label: 'Favourites' },
  { id: 'collections', label: 'Collections' },
  { id: 'history', label: 'Recently watched' },
] as const
type TabId = (typeof tabs)[number]['id']
type Kind = 'all' | 'channel' | 'movie' | 'series'

const resolveAll = (refs: string[], now: number, find: (id: string) => Channel | undefined) =>
  refs.map((r) => resolve(r, now, find)).filter((r): r is Resolved => !!r)

export function Library() {
  const [params, setParams] = useSearchParams()
  const tab = (tabs.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'overview') as TabId
  const go = (id: TabId) => setParams(id === 'overview' ? {} : { tab: id }, { replace: true })

  const tabList = (
      <div className="tabs" role="tablist" aria-label="Library sections"
        onKeyDown={(e) => {
          const i = tabs.findIndex((t) => t.id === tab)
          const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
          if (!d) return
          const next = tabs[(i + d + tabs.length) % tabs.length]
          if (next) { go(next.id); document.getElementById(`lib-tab-${next.id}`)?.focus() }
        }}
      >
        {tabs.map((t) => (
          <button key={t.id} id={`lib-tab-${t.id}`} type="button" role="tab" className="tab" aria-selected={tab === t.id} tabIndex={tab === t.id ? 0 : -1} aria-controls="lib-panel" onClick={() => go(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
  )

  return (
    <>
    <PageHeader title="Library" tabs={tabList} />
    <div className="page library">
      <p className="page-intro">Everything you have saved, started and sorted, kept on this device. The starting contents are sample activity you can clear in Settings › Data.</p>
      <div id="lib-panel" role="tabpanel" aria-labelledby={`lib-tab-${tab}`} className="lib-panel">
        {tab === 'overview' && <Overview go={go} />}
        {tab === 'watchlist' && <SavedList list="watchlist" />}
        {tab === 'favourites' && <SavedList list="favourites" />}
        {tab === 'collections' && <Collections />}
        {tab === 'history' && <History />}
      </div>
    </div>
    </>
  )
}

function Overview({ go }: { go: (t: TabId) => void }) {
  const now = useNow()
  const { library, findChannel } = useStore()
  const [, setParams] = useSearchParams()
  const resume = continueWatching(library)
  const favs = resolveAll(library.favourites, now, findChannel)
  const channels = favs.filter((r) => r.kind === 'channel')
  const films = favs.filter((r) => r.kind === 'movie')
  const shows = favs.filter((r) => r.kind === 'series')
  const recent = resolveAll(library.history.map((h) => h.ref), now, findChannel).slice(0, 8)
  const seeAll = (t: TabId) => <button type="button" className="view-all" onClick={() => go(t)}>View All<Icon name="right" size={16} /></button>

  if (!resume.length && !favs.length && !recent.length && !library.watchlist.length && !library.collections.length) {
    return (
      <StateBlock icon="library" title="Your library is empty" action={<Link to="/" className="btn btn-primary">Find something to watch</Link>}>
        Add films and series to your watchlist, heart the channels you return to, and start watching. It all collects here.
      </StateBlock>
    )
  }

  return (
    <div className="stack">
      {resume.length > 0 && (
        <Section icon="history" title="Continue Watching" grid="grid-cards">
          {resume.map((r) => (
            <WideCard key={r.ref} to={r.play} title={r.title} sub={`${r.kind === 'episode' ? r.meta : 'Movie'} · ${minutesLeft(0, r.secondsLeft)} min left`} art={r.art} focus={r.focus} progress={r.progress} />
          ))}
        </Section>
      )}
      {channels.length > 0 && (
        <section>
          <div className="section-head"><h2 className="section-title"><Icon name="tv" size={18} />Favourite Channels</h2>{seeAll('favourites')}</div>
          <ChannelGrid items={channels} />
        </section>
      )}
      {films.length > 0 && (
        <Section icon="film" title="Favourite Movies" grid="grid-posters">
          {films.map((r) => <PosterCard key={r.ref} to={r.href} title={r.title} art={r.art} focus={r.focus} line={r.meta} />)}
        </Section>
      )}
      {shows.length > 0 && (
        <Section icon="series" title="Your Series" grid="grid-cards">
          {shows.map((r) => <WideCard key={r.ref} to={r.href} title={r.title} sub={r.meta} art={r.art} focus={r.focus} />)}
        </Section>
      )}
      {recent.length > 0 && (
        <Section icon="history" title="Recently Watched" grid="grid-cards">
          {recent.map((r) => <WideCard key={r.ref} to={r.kind === 'channel' ? r.play : r.href} title={r.title} sub={r.meta} art={r.art} focus={r.focus} />)}
        </Section>
      )}
      {library.collections.length > 0 && (
        <section>
          <div className="section-head"><h2 className="section-title"><Icon name="folder" size={18} />Collections</h2>{seeAll('collections')}</div>
          <CollectionCards collections={library.collections} onOpen={(id) => setParams({ tab: 'collections', c: id })} />
        </section>
      )}
    </div>
  )
}

function ChannelGrid({ items, onRemove }: { items: Resolved[]; onRemove?: (r: Resolved) => void }) {
  return (
    <ul className="channel-grid">
      {items.map((r) => r.kind === 'channel' && (
        <li key={r.ref}>
          <Link to={r.play} className="card channel-tile">
            <ChannelMark channel={r.item} size={48} />
            <span><strong>{r.title}</strong><span className="faint">{r.meta}</span></span>
          </Link>
          {onRemove && <button type="button" className="icon-btn remove-btn" aria-label={`Remove ${r.title}`} onClick={() => onRemove(r)}><Icon name="close" size={16} /></button>}
        </li>
      ))}
    </ul>
  )
}

function ItemGrid({ items, onRemove }: { items: Resolved[]; onRemove: (r: Resolved) => void }) {
  return (
    <ul className="item-grid">
      {items.map((r) => (
        <li key={r.ref} className="item-cell">
          <WideCard to={r.kind === 'channel' ? r.play : r.href} title={r.title} sub={`${{ movie: 'Movie', series: 'Series', episode: 'Episode', channel: 'Channel' }[r.kind]} · ${r.meta}`} art={r.art} focus={r.focus} />
          <button type="button" className="icon-btn remove-btn" aria-label={`Remove ${r.title}`} onClick={() => onRemove(r)}><Icon name="close" size={16} /></button>
        </li>
      ))}
    </ul>
  )
}

function SavedList({ list }: { list: 'watchlist' | 'favourites' }) {
  const now = useNow()
  const store = useStore()
  const toast = useToast()
  const [kind, setKind] = useState<Kind>('all')
  const [sort, setSort] = useState<'added' | 'title'>('added')
  const all = resolveAll(store.library[list], now, store.findChannel)
  const items = all.filter((r) => kind === 'all' || r.kind === kind).sort((a, b) => (sort === 'title' ? a.title.localeCompare(b.title) : 0))
  const kinds: Kind[] = list === 'favourites' ? ['all', 'channel', 'movie', 'series'] : ['all', 'movie', 'series']
  const kindLabel: Record<Kind, string> = { all: 'All', channel: 'Channels', movie: 'Films', series: 'Series' }
  const remove = (r: Resolved) => {
    const toggle = list === 'watchlist' ? store.toggleWatchlist : store.toggleFavourite
    toggle(r.ref)
    toast(`Removed ${r.title}`, { label: 'Undo', run: () => toggle(r.ref) })
  }
  const channels = items.filter((r) => r.kind === 'channel')
  const others = items.filter((r) => r.kind !== 'channel')

  return (
    <>
      <div className="lib-toolbar">
        <div className="chips" role="group" aria-label="Type">
          {kinds.map((k) => (
            <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
              {kindLabel[k]} <span className="count tnum">{k === 'all' ? all.length : all.filter((r) => r.kind === k).length}</span>
            </button>
          ))}
        </div>
        <select className="select select-inline" value={sort} onChange={(e) => setSort(e.target.value as 'added' | 'title')} aria-label="Sort">
          <option value="added">Most recently added</option>
          <option value="title">Title A to Z</option>
        </select>
      </div>
      {items.length === 0 ? (
        <StateBlock
          icon={list === 'watchlist' ? 'bookmark' : 'heart'}
          title={all.length === 0 ? (list === 'watchlist' ? 'Your watchlist is empty' : 'No favourites yet') : `No ${kindLabel[kind].toLowerCase()} here`}
          action={all.length === 0 ? <Link to="/movies" className="btn btn-ghost">Browse films</Link> : <button type="button" className="btn btn-ghost" onClick={() => setKind('all')}>Show everything</button>}
        >
          {list === 'watchlist' ? 'Use Watchlist on any film or series to save it for later.' : 'Use the heart on films, series and channels to keep them here.'}
        </StateBlock>
      ) : (
        <div className="stack">
          {channels.length > 0 && <ChannelGrid items={channels} onRemove={remove} />}
          {others.length > 0 && <ItemGrid items={others} onRemove={remove} />}
        </div>
      )}
    </>
  )
}

function CollectionCards({ collections, onOpen }: { collections: Collection[]; onOpen: (id: string) => void }) {
  const { findChannel } = useStore()
  return (
    <ul className="collection-cards">
      {collections.map((c) => {
        const art = resolveAll(c.items, Date.now(), findChannel).slice(0, 3)
        return (
          <li key={c.id}>
            <button type="button" className="card collection-card" onClick={() => onOpen(c.id)}>
              <span className={`collection-stack n${art.length}`} aria-hidden="true">
                {art.length === 0 ? <span className="collection-empty"><Icon name="folder" /></span> : art.map((r) => <Art key={r.ref} src={r.art} focus={r.focus} />)}
              </span>
              <strong>{c.name}</strong>
              <span className="faint">{c.items.length} {c.items.length === 1 ? 'title' : 'titles'}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function Collections() {
  const now = useNow()
  const store = useStore()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const openId = params.get('c')
  const open = store.library.collections.find((c) => c.id === openId)
  const [dialog, setDialog] = useState<null | 'new' | 'rename' | 'delete'>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const setOpen = (id: string | null) => setParams(id ? { tab: 'collections', c: id } : { tab: 'collections' })
  const startDialog = (d: 'new' | 'rename' | 'delete') => { setName(d === 'rename' && open ? open.name : ''); setError(''); setDialog(d) }
  const submitName = () => {
    const n = name.trim()
    if (!n) return setError('Give the collection a name.')
    if (store.library.collections.some((c) => c.name.toLowerCase() === n.toLowerCase() && c.id !== open?.id)) return setError('You already have a collection with that name.')
    if (dialog === 'new') { const id = store.createCollection(n); setOpen(id); toast(`Created “${n}”`) }
    if (dialog === 'rename' && open) { store.renameCollection(open.id, n); toast('Collection renamed') }
    setDialog(null)
  }

  const nameDialog = (
    <Dialog
      open={dialog === 'new' || dialog === 'rename'}
      onClose={() => setDialog(null)}
      title={dialog === 'new' ? 'New collection' : 'Rename collection'}
      footer={<>
        <button type="button" className="btn btn-secondary" onClick={() => setDialog(null)}>Cancel</button>
        <button type="submit" form="collection-name" className="btn btn-primary">{dialog === 'new' ? 'Create' : 'Save'}</button>
      </>}
    >
      <form id="collection-name" onSubmit={(e) => { e.preventDefault(); submitName() }}>
        <label className="field">
          <span>Name</span>
          <input className="input" autoFocus value={name} maxLength={40} onChange={(e) => { setName(e.target.value); setError('') }} placeholder="Collection name" aria-invalid={error ? true : undefined} />
        </label>
        {error && <p className="field-error" role="alert" style={{ marginTop: 8 }}>{error}</p>}
      </form>
    </Dialog>
  )

  if (open) {
    const items = resolveAll(open.items, now, store.findChannel)
    return (
      <>
        <div className="collection-head">
          <button type="button" className="text-link" onClick={() => setOpen(null)}><Icon name="back" size={16} />All collections</button>
          <h2 className="title-l">{open.name}</h2>
          <p className="faint">{items.length} {items.length === 1 ? 'title' : 'titles'} · created {relative(open.createdAt, now)}</p>
          <div className="title-actions">
            <button type="button" className="btn btn-ghost btn-small" onClick={() => startDialog('rename')}><Icon name="edit" size={16} />Rename</button>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => startDialog('delete')}><Icon name="trash" size={16} />Delete</button>
          </div>
        </div>
        {items.length === 0 ? (
          <StateBlock icon="folder" title="This collection is empty" action={<Link to="/movies" className="btn btn-ghost">Browse films</Link>}>
            Open any film or series and use the folder button to add it here.
          </StateBlock>
        ) : (
          <ItemGrid items={items} onRemove={(r) => { store.toggleInCollection(open.id, r.ref); toast(`Removed ${r.title} from ${open.name}`, { label: 'Undo', run: () => store.toggleInCollection(open.id, r.ref) }) }} />
        )}
        {nameDialog}
        <Dialog
          open={dialog === 'delete'}
          onClose={() => setDialog(null)}
          title="Delete this collection?"
          footer={<>
            <button type="button" className="btn btn-secondary" onClick={() => setDialog(null)}>Keep it</button>
            <button type="button" className="btn btn-danger" onClick={() => { store.deleteCollection(open.id); setDialog(null); setOpen(null); toast(`Deleted “${open.name}”`) }}>Delete collection</button>
          </>}
        >
          <p className="muted">“{open.name}” will be removed. The {items.length} titles in it stay in the catalogue and in any other lists.</p>
        </Dialog>
      </>
    )
  }

  return (
    <>
      <div className="lib-toolbar">
        <p className="faint">{store.library.collections.length} collections</p>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => startDialog('new')}><Icon name="plus" size={16} />New collection</button>
      </div>
      {store.library.collections.length === 0 ? (
        <StateBlock icon="folder" title="No collections yet" action={<button type="button" className="btn btn-primary" onClick={() => startDialog('new')}>Create a collection</button>}>
          Group titles your own way, such as “Rainy Sunday” or “Watch with Dad”.
        </StateBlock>
      ) : (
        <CollectionCards collections={store.library.collections} onOpen={setOpen} />
      )}
      {nameDialog}
    </>
  )
}

function History() {
  const now = useNow()
  const store = useStore()
  const toast = useToast()
  const [confirm, setConfirm] = useState(false)
  const entries = store.library.history.map((h) => ({ h, r: resolve(h.ref, now, store.findChannel) })).filter((x): x is { h: typeof x.h; r: Resolved } => !!x.r)
  const byDay = new Map<string, typeof entries>()
  for (const e of entries) {
    const k = dayLabel(e.h.at, now)
    byDay.set(k, [...(byDay.get(k) ?? []), e])
  }

  return (
    <>
      <div className="lib-toolbar">
        <p className="faint">{store.prefs.keepHistory ? 'Viewing history is saved on this device.' : 'History is paused in Settings. Nothing new is being recorded.'}</p>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => setConfirm(true)} disabled={entries.length === 0}><Icon name="trash" size={16} />Clear history</button>
      </div>
      {entries.length === 0 ? (
        <StateBlock icon="history" title="Nothing watched yet" action={<Link to="/live" className="btn btn-ghost">Open Live TV</Link>}>
          Channels you tune to and titles you open in the player appear here, newest first.
        </StateBlock>
      ) : (
        [...byDay.entries()].map(([day, list]) => (
          <section key={day} className="history-day">
            <h2 className="label">{day}</h2>
            <ul>
              {list.map(({ h, r }) => (
                <li key={h.ref} className="history-row">
                  <Link to={r.kind === 'channel' ? r.play : r.kind === 'episode' ? r.play : r.href} className="history-link">
                    {r.kind === 'channel' ? <ChannelMark channel={r.item} size={48} /> : <Art src={r.art} focus={r.focus} className="history-thumb" />}
                    <span className="result-text">
                      <strong>{r.title}</strong>
                      <span>{r.meta}</span>
                    </span>
                    <span className="faint history-when">{relative(h.at, now)}</span>
                  </Link>
                  <button type="button" className="icon-btn" aria-label={`Remove ${r.title} from history`} onClick={() => store.removeHistory(h.ref)}><Icon name="close" size={16} /></button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Clear viewing history?"
        footer={<>
          <button type="button" className="btn btn-secondary" onClick={() => setConfirm(false)}>Cancel</button>
          <button type="button" className="btn btn-danger" onClick={() => { store.clearHistory(); setConfirm(false); toast('Viewing history cleared') }}>Clear history</button>
        </>}
      >
        <p className="muted">This removes recently watched items and resume points for every film and episode. Favourites, watchlist and collections are kept.</p>
      </Dialog>
    </>
  )
}
