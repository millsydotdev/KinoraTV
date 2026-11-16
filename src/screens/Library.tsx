import { useState, useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { resolve, type Resolved } from '../data/refs'
import type { Channel, Programme } from '../data/types'
import { Dialog } from '../components/Dialog'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { PosterCard, Section, WideCard, XtreamArt } from '../components/Tiles'
import { useToast } from '../components/Toast'
import { Art, ChannelMark, StateBlock } from '../components/ui'
import { isRefKidSafe } from '../lib/kidsMode'
import { continueWatching } from '../lib/library'
import { dayLabel, minutesLeft, relative, useNow } from '../lib/time'
import { useProfiles } from '../state/profiles'
import { useStore, type Collection } from '../state/store'
import { SourcesPersonalTab } from './SourcesPersonalTab'
import { ResourceCard } from '../components/ResourceCard'
import { ResourceDetailModal } from '../components/ResourceDetailModal'
import type { MediaResource } from '../data/personalLibrary'
import { RatingControls } from '../components/RatingControls'
import type { RatingValue, DislikeReason } from '../state/userPreferences'
import { Badge } from '../components/design-system/Badge'
import { SaveIndicator } from '../components/design-system/Feedback'
import { movies, series } from '../data/catalog'
import './Library.css'

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'watchlist', label: 'Watchlist' },
  { id: 'favourites', label: 'Favourites' },
  { id: 'ratings', label: 'Ratings & Preferences' },
  { id: 'sources', label: 'Saved Sources' },
  { id: 'collections', label: 'Collections' },
  { id: 'history', label: 'Recently watched' },
  { id: 'hidden', label: 'Hidden Items' },
] as const
type TabId = (typeof tabs)[number]['id']
type Kind = 'all' | 'channel' | 'movie' | 'series'

const resolveAll = (
  refs: string[], now: number, find: (id: string) => Channel | undefined, at: (c: Channel, t: number) => Programme | undefined,
  titles: boolean,
  findMovie?: (sourceId: string, id: string) => { name: string; year: number | null; artworkKey: string | null; extension: string } | undefined,
  findSeries?: (sourceId: string, id: string) => { name: string; year: number | null; artworkKey: string | null } | undefined,
) =>
  refs.map((r) => resolve(r, now, find, at, titles, findMovie, findSeries)).filter((r): r is Resolved => !!r)

const findCatalogTitle = (id: string) => movies.find((m) => m.id === id) ?? series.find((s) => s.id === id)

export function Library() {
  const store = useStore()
  const { mediaLibrary } = store
  const [params, setParams] = useSearchParams()
  const [selectedResource, setSelectedResource] = useState<MediaResource | null>(null)
  const tab = (tabs.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'overview') as TabId
  const go = (id: TabId) => setParams(id === 'overview' ? {} : { tab: id }, { replace: true })
  const tabsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const activeEl = document.getElementById(`lib-tab-${tab}`)
    if (activeEl && tabsRef.current) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    }
  }, [tab])

  const tabList = (
      <div
        ref={tabsRef}
        className="tabs"
        role="tablist"
        aria-label="Library sections"
        onKeyDown={(e) => {
          const i = tabs.findIndex((t) => t.id === tab)
          let targetIndex = i
          if (e.key === 'ArrowRight') {
            targetIndex = (i + 1) % tabs.length
          } else if (e.key === 'ArrowLeft') {
            targetIndex = (i - 1 + tabs.length) % tabs.length
          } else if (e.key === 'Home') {
            targetIndex = 0
          } else if (e.key === 'End') {
            targetIndex = tabs.length - 1
          } else {
            return
          }
          e.preventDefault()
          const next = tabs[targetIndex]
          if (next) {
            go(next.id)
            document.getElementById(`lib-tab-${next.id}`)?.focus()
          }
        }}
      >
        {tabs.map((t) => (
          <button key={t.id} id={`lib-tab-${t.id}`} type="button" role="tab" className="tab" aria-selected={tab === t.id} tabIndex={tab === t.id ? 0 : -1} aria-controls="lib-panel" onClick={() => go(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
  )

  const inLib = selectedResource ? mediaLibrary.isInPersonalLibrary(selectedResource.id) : false
  const isFav = selectedResource ? mediaLibrary.isResourceFavourite(selectedResource.id) : false
  const notes = selectedResource ? mediaLibrary.getResourceNotes(selectedResource.id) : ''

  const handlePlay = (res: MediaResource) => {
    const streamUrl = res.playbackUrl || res.url
    if (streamUrl) {
      mediaLibrary.playAudio({
        id: res.id,
        name: res.name,
        provider: res.provider,
        streamUrl,
        artworkUrl: res.artworkUrl,
        accentHue: res.accentHue,
      })
    }
  }

  return (
    <>
    <PageHeader title="Library" tabs={tabList} />
    <div className="page library">
      <p className="page-intro">Everything you have saved, started and sorted, kept on this device.</p>
      <div id="lib-panel" role="tabpanel" aria-labelledby={`lib-tab-${tab}`} className="lib-panel">
        {tab === 'overview' && <Overview go={go} onSelectResource={setSelectedResource} />}
        {tab === 'watchlist' && <SavedList list="watchlist" />}
        {tab === 'favourites' && <SavedList list="favourites" />}
        {tab === 'ratings' && <RatingsTab />}
        {tab === 'sources' && <SourcesPersonalTab />}
        {tab === 'collections' && <Collections />}
        {tab === 'history' && <History />}
        {tab === 'hidden' && <HiddenTab />}
      </div>
    </div>
    <ResourceDetailModal
      resource={selectedResource}
      inLibrary={inLib}
      isFavourite={isFav}
      userNotes={notes}
      isEnabled={selectedResource ? mediaLibrary.isSourceEnabled(selectedResource.id) : true}
      onClose={() => setSelectedResource(null)}
      onToggleLibrary={() => {
        if (!selectedResource) return
        if (inLib) mediaLibrary.removeFromPersonalLibrary(selectedResource.id)
        else mediaLibrary.addToPersonalLibrary(selectedResource.id)
      }}
      onToggleFavourite={() => selectedResource && mediaLibrary.toggleResourceFavourite(selectedResource.id)}
      onToggleEnabled={() => selectedResource && mediaLibrary.toggleSourceEnabled(selectedResource.id)}
      onSaveNotes={(n) => selectedResource && mediaLibrary.updateResourceNotes(selectedResource.id, n)}
      onSaveConfig={(updates) => selectedResource && mediaLibrary.updateSourceConfig(selectedResource.id, updates)}
      onVerifyNow={(id) => mediaLibrary.verifyResourceNow(id)}
      onPlay={handlePlay}
      isPlaying={selectedResource ? mediaLibrary.currentAudio?.id === selectedResource.id && mediaLibrary.isAudioPlaying : false}
    />
    </>
  )
}

function Overview({ go, onSelectResource }: { go: (t: TabId) => void; onSelectResource?: (r: MediaResource) => void }) {
  const now = useNow()
  const store = useStore()
  const { library, findChannel, programmeAt, demoTitles, xtreamCatalogue, mediaLibrary } = store
  const { isKidsMode } = useProfiles()
  const [, setParams] = useSearchParams()
  const [analyticsTimeRange, setAnalyticsTimeRange] = useState<'7d' | '30d' | '1y' | 'all'>('all')
  const findMovie = (sId: string, id: string) => xtreamCatalogue.movies.find((m) => m.sourceId === sId && m.id === id)
  const findSeries = (sId: string, id: string) => xtreamCatalogue.series.find((s) => s.sourceId === sId && s.id === id)
  const safeRef = (r: string) => isRefKidSafe(r, isKidsMode, findChannel, findCatalogTitle)
  const resume = continueWatching(library, demoTitles).filter((r) => safeRef(r.ref))
  const favRefs = isKidsMode ? library.favourites.filter(safeRef) : library.favourites
  const favs = resolveAll(favRefs, now, findChannel, programmeAt, demoTitles, findMovie, findSeries)
  const channels = favs.filter((r) => r.kind === 'channel')
  const films = favs.filter((r) => r.kind === 'movie')
  const shows = favs.filter((r) => r.kind === 'series')
  const historyRefs = isKidsMode ? library.history.map((h) => h.ref).filter(safeRef) : library.history.map((h) => h.ref)
  const recent = resolveAll(historyRefs, now, findChannel, programmeAt, demoTitles, findMovie, findSeries).slice(0, 8)
  const seeAll = (t: TabId) => <button type="button" className="view-all" onClick={() => go(t)}>View All<Icon name="right" size={16} /></button>

  const nowMs = Date.now()
  const filteredHistory = library.history.filter((h) => {
    if (analyticsTimeRange === '7d') return nowMs - h.at <= 7 * 86400000
    if (analyticsTimeRange === '30d') return nowMs - h.at <= 30 * 86400000
    if (analyticsTimeRange === '1y') return nowMs - h.at <= 365 * 86400000
    return true
  })

  if (!resume.length && !favs.length && !recent.length && !library.watchlist.length && !library.collections.length && !mediaLibrary.mySources.length) {
    return (
      <StateBlock icon="library" title="Your library is empty" action={<Link to="/" className="btn btn-primary">Find something to watch</Link>}>
        Add films and series to your watchlist, heart the channels you return to, and start watching. It all collects here.
      </StateBlock>
    )
  }

  return (
    <div className="stack">
      {/* Viewing Analytics HUD */}
      <section className="library-analytics-card" aria-label="Viewing Analytics">
        <div className="section-head" style={{ marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 className="section-title"><Icon name="radar" size={18} />Viewing Analytics & Library Metrics</h2>
          <select
            className="select select-inline"
            value={analyticsTimeRange}
            onChange={(e) => setAnalyticsTimeRange(e.target.value as '7d' | '30d' | '1y' | 'all')}
            aria-label="Time range for viewing metrics"
          >
            <option value="7d">Past 7 Days</option>
            <option value="30d">Past 30 Days</option>
            <option value="1y">This Year</option>
            <option value="all">All Time</option>
          </select>
        </div>
        <div className="library-analytics-grid">
          <div className="lib-metric-box">
            <span className="lib-metric-num">{filteredHistory.length}</span>
            <span className="lib-metric-label">Titles Watched</span>
          </div>
          <div className="lib-metric-box">
            <span className="lib-metric-num">{library.watched.length}</span>
            <span className="lib-metric-label">Marked Completed</span>
          </div>
          <div className="lib-metric-box">
            <span className="lib-metric-num">{resume.length}</span>
            <span className="lib-metric-label">In Progress</span>
          </div>
          <div className="lib-metric-box">
            <span className="lib-metric-num">{favs.length}</span>
            <span className="lib-metric-label">Saved Favourites</span>
          </div>
        </div>
        <div className="lib-analytics-distribution">
          <div className="lib-dist-header">
            <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Library Distribution</span>
            <span className="faint" style={{ fontSize: '0.75rem' }}>
              {films.length} Films · {shows.length} Series · {channels.length} Channels · {mediaLibrary.mySources.length} Sources
            </span>
          </div>
          <div className="lib-dist-bar" aria-hidden="true">
            <div style={{ width: `${Math.max(8, (films.length / Math.max(1, favs.length + 1)) * 100)}%`, background: '#f59e0b' }} title="Films" />
            <div style={{ width: `${Math.max(8, (shows.length / Math.max(1, favs.length + 1)) * 100)}%`, background: '#8b5cf6' }} title="Series" />
            <div style={{ width: `${Math.max(8, (channels.length / Math.max(1, favs.length + 1)) * 100)}%`, background: '#3b82f6' }} title="Channels" />
          </div>
        </div>
      </section>

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
          {films.map((r) => <PosterCard key={r.ref} to={r.href} title={r.title} art={r.art} artworkKey={'artworkKey' in r ? r.artworkKey ?? undefined : undefined} focus={r.focus} line={r.meta} />)}
        </Section>
      )}
      {shows.length > 0 && (
        <Section icon="series" title="Your Series" grid="grid-cards">
          {shows.map((r) => <WideCard key={r.ref} to={r.href} title={r.title} sub={r.meta} art={r.art} artworkKey={'artworkKey' in r ? r.artworkKey ?? undefined : undefined} focus={r.focus} />)}
        </Section>
      )}
      {mediaLibrary.mySources.length > 0 && (
        <section>
          <div className="section-head">
            <h2 className="section-title"><Icon name="sources" size={18} />Saved Media Sources ({mediaLibrary.mySources.length})</h2>
            {seeAll('sources')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {mediaLibrary.mySources.slice(0, 4).map((item) => (
              <ResourceCard
                key={item.resourceId}
                resource={item.resource}
                variant="wide"
                inLibrary={true}
                isFavourite={item.isFavourite}
                onToggleLibrary={() => mediaLibrary.removeFromPersonalLibrary(item.resourceId)}
                onToggleFavourite={() => mediaLibrary.toggleResourceFavourite(item.resourceId)}
                onOpenDetails={() => onSelectResource?.(item.resource)}
                onPlay={(r) => {
                  const streamUrl = r.playbackUrl || r.url
                  if (streamUrl) {
                    mediaLibrary.playAudio({
                      id: r.id,
                      name: r.name,
                      provider: r.provider,
                      streamUrl,
                      artworkUrl: r.artworkUrl,
                      accentHue: r.accentHue,
                      mediaType: r.category === 'radio' ? 'radio' : r.category === 'podcasts' ? 'podcast' : r.category === 'audiobooks' ? 'audiobook' : r.category === 'music' ? 'music' : 'stream',
                    })
                  }
                }}
                isPlaying={mediaLibrary.currentAudio?.id === item.resourceId && mediaLibrary.isAudioPlaying}
              />
            ))}
          </div>
        </section>
      )}
      {recent.length > 0 && (
        <Section icon="history" title="Recently Watched" grid="grid-cards">
          {recent.map((r) => <WideCard key={r.ref} to={r.kind === 'channel' ? r.play : r.href} title={r.title} sub={r.meta} art={r.art} artworkKey={'artworkKey' in r ? r.artworkKey ?? undefined : undefined} focus={r.focus} />)}
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

function ItemGrid({
  items,
  onRemove,
  onReorder,
  selectMode = false,
  selectedRefs = [],
  onToggleSelect,
}: {
  items: Resolved[]
  onRemove: (r: Resolved) => void
  onReorder?: (fromIdx: number, toIdx: number) => void
  selectMode?: boolean
  selectedRefs?: string[]
  onToggleSelect?: (ref: string) => void
}) {
  return (
    <ul className="item-grid">
      {items.map((r, idx) => {
        const isSelected = selectedRefs.includes(r.ref)
        return (
          <li key={r.ref} className={`item-cell ${isSelected ? 'is-selected' : ''}`} style={{ position: 'relative' }}>
            {selectMode && onToggleSelect && (
              <label
                className="item-checkbox-label"
                style={{ position: 'absolute', top: 8, left: 8, zIndex: 10, background: 'rgba(0,0,0,0.7)', borderRadius: 4, padding: '2px 4px' }}
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleSelect(r.ref)}
                  aria-label={`Select ${r.title}`}
                />
              </label>
            )}
            <WideCard to={r.kind === 'channel' ? r.play : r.href} title={r.title} sub={`${{ movie: 'Movie', series: 'Series', episode: 'Episode', channel: 'Channel', catchup: 'Catch-up', recording: 'Recording' }[r.kind]} · ${r.meta}`} art={r.art} artworkKey={'artworkKey' in r ? r.artworkKey ?? undefined : undefined} focus={r.focus} />
            {onReorder && (
              <div className="reorder-btns" style={{ position: 'absolute', top: 8, right: 38, display: 'flex', gap: 2, zIndex: 5 }}>
                <button
                  type="button"
                  className="icon-btn"
                  disabled={idx === 0}
                  aria-label={`Move ${r.title} up`}
                  onClick={() => onReorder(idx, idx - 1)}
                  style={{ width: 24, height: 24, minWidth: 24, padding: 0 }}
                >
                  <Icon name="up" size={14} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  disabled={idx === items.length - 1}
                  aria-label={`Move ${r.title} down`}
                  onClick={() => onReorder(idx, idx + 1)}
                  style={{ width: 24, height: 24, minWidth: 24, padding: 0 }}
                >
                  <Icon name="down" size={14} />
                </button>
              </div>
            )}
            {!selectMode && (
              <button type="button" className="icon-btn remove-btn" aria-label={`Remove ${r.title}`} onClick={() => onRemove(r)}>
                <Icon name="close" size={16} />
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function SavedList({ list }: { list: 'watchlist' | 'favourites' }) {
  const now = useNow()
  const store = useStore()
  const { isKidsMode } = useProfiles()
  const toast = useToast()
  const [kind, setKind] = useState<Kind>('all')
  const [sort, setSort] = useState<'added' | 'title'>('added')
  const [selectMode, setSelectMode] = useState(false)
  const [selectedRefs, setSelectedRefs] = useState<string[]>([])
  const findMovie = (sId: string, id: string) => store.xtreamCatalogue.movies.find((m) => m.sourceId === sId && m.id === id)
  const findSeries = (sId: string, id: string) => store.xtreamCatalogue.series.find((s) => s.sourceId === sId && s.id === id)
  const rawList = store.library[list]
  const targetRefs = isKidsMode
    ? rawList.filter((r) => isRefKidSafe(r, isKidsMode, store.findChannel, findCatalogTitle))
    : rawList
  const all = resolveAll(targetRefs, now, store.findChannel, store.programmeAt, store.demoTitles, findMovie, findSeries)
  const items = all.filter((r) => kind === 'all' || r.kind === kind).sort((a, b) => (sort === 'title' ? a.title.localeCompare(b.title) : 0))
  const kinds: Kind[] = list === 'favourites' ? ['all', 'channel', 'movie', 'series'] : ['all', 'movie', 'series']
  const kindLabel: Record<Kind, string> = { all: 'All', channel: 'Channels', movie: 'Movies', series: 'TV Shows' }
  const remove = (r: Resolved) => {
    const toggle = list === 'watchlist' ? store.toggleWatchlist : store.toggleFavourite
    toggle(r.ref)
    toast(`Removed ${r.title}`, { label: 'Undo', run: () => toggle(r.ref) })
  }
  const channels = items.filter((r) => r.kind === 'channel')
  const others = items.filter((r) => r.kind !== 'channel')

  const toggleSelect = (ref: string) => {
    setSelectedRefs((prev) => prev.includes(ref) ? prev.filter((x) => x !== ref) : [...prev, ref])
  }

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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            className={`btn btn-small ${selectMode ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => {
              setSelectMode(!selectMode)
              setSelectedRefs([])
            }}
          >
            {selectMode ? 'Done' : 'Select'}
          </button>
          <select className="select select-inline" value={sort} onChange={(e) => setSort(e.target.value as 'added' | 'title')} aria-label="Sort">
            <option value="added">Most recently added</option>
            <option value="title">Title A to Z</option>
          </select>
        </div>
      </div>

      {selectMode && (
        <div className="batch-action-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: '10px 16px', background: 'var(--surface-2)', borderRadius: 'var(--r-m)', margin: '10px 0 16px' }}>
          <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
            {selectedRefs.length} selected
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => setSelectedRefs(others.map((r) => r.ref))}
          >
            Select All
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => setSelectedRefs([])}
          >
            Deselect All
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            disabled={selectedRefs.length === 0}
            onClick={() => {
              store.setWatched(selectedRefs, true)
              toast(`Marked ${selectedRefs.length} item${selectedRefs.length === 1 ? '' : 's'} as watched`)
              setSelectedRefs([])
            }}
          >
            <Icon name="check" size={14} /> Mark Watched
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-small"
            disabled={selectedRefs.length === 0}
            onClick={() => {
              const count = selectedRefs.length
              selectedRefs.forEach((r) => {
                const toggle = list === 'watchlist' ? store.toggleWatchlist : store.toggleFavourite
                toggle(r)
              })
              toast(`Removed ${count} item${count === 1 ? '' : 's'} from ${list}`)
              setSelectedRefs([])
            }}
          >
            <Icon name="trash" size={14} /> Remove
          </button>
        </div>
      )}

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
          {channels.length > 0 && <ChannelGrid items={channels} onRemove={selectMode ? undefined : remove} />}
          {others.length > 0 && (
            <ItemGrid
              items={others}
              onRemove={remove}
              selectMode={selectMode}
              selectedRefs={selectedRefs}
              onToggleSelect={toggleSelect}
            />
          )}
        </div>
      )}
    </>
  )
}

function CollectionCards({ collections, onOpen }: { collections: Collection[]; onOpen: (id: string) => void }) {
  const { findChannel, programmeAt, demoTitles, xtreamCatalogue } = useStore()
  const findMovie = (sId: string, id: string) => xtreamCatalogue.movies.find((m) => m.sourceId === sId && m.id === id)
  const findSeries = (sId: string, id: string) => xtreamCatalogue.series.find((s) => s.sourceId === sId && s.id === id)
  return (
    <ul className="collection-cards">
      {collections.map((c) => {
        const art = resolveAll(c.items, Date.now(), findChannel, programmeAt, demoTitles, findMovie, findSeries).slice(0, 3)
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
    const { isKidsMode } = useProfiles()
    const findMovie = (sId: string, id: string) => store.xtreamCatalogue.movies.find((m) => m.sourceId === sId && m.id === id)
    const findSeries = (sId: string, id: string) => store.xtreamCatalogue.series.find((s) => s.sourceId === sId && s.id === id)
    const targetItems = isKidsMode
      ? open.items.filter((r) => isRefKidSafe(r, isKidsMode, store.findChannel, findCatalogTitle))
      : open.items
    const items = resolveAll(targetItems, now, store.findChannel, store.programmeAt, store.demoTitles, findMovie, findSeries)
    return (
      <>
        <div className="collection-head">
          <button type="button" className="text-link" onClick={() => setOpen(null)}><Icon name="back" size={16} />All collections</button>
          <h2 className="title-l">{open.name}</h2>
          <p className="faint">{items.length} {items.length === 1 ? 'title' : 'titles'} · created {relative(open.createdAt, now)}</p>
          <div className="title-actions">
            <button type="button" className="btn btn-ghost btn-small" onClick={() => startDialog('rename')}><Icon name="edit" size={16} />Rename</button>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => {
                const lines = ['#EXTM3U', `#PLAYLIST:${open.name}`]
                for (const item of items) {
                  lines.push(`#EXTINF:-1,${item.title}`)
                  if ('channel' in item && (item as any).channel?.streamUrl) {
                    lines.push((item as any).channel.streamUrl)
                  } else {
                    lines.push(`# Kinora reference: ${item.ref}`)
                  }
                }
                const blob = new Blob([lines.join('\n')], { type: 'audio/x-mpegurl;charset=utf-8' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `${open.name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}.m3u8`
                a.click()
                URL.revokeObjectURL(url)
                toast(`Exported collection “${open.name}” to M3U`)
              }}
            >
              <Icon name="download" size={16} />Export M3U
            </button>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => startDialog('delete')}><Icon name="trash" size={16} />Delete</button>
          </div>
        </div>
        {items.length === 0 ? (
          <StateBlock icon="folder" title="This collection is empty" action={<Link to="/movies" className="btn btn-ghost">Browse films</Link>}>
            Open any film or series and use the folder button to add it here.
          </StateBlock>
        ) : (
          <ItemGrid
            items={items}
            onRemove={(r) => { store.toggleInCollection(open.id, r.ref); toast(`Removed ${r.title} from ${open.name}`, { label: 'Undo', run: () => store.toggleInCollection(open.id, r.ref) }) }}
            onReorder={(fromIdx, toIdx) => {
              const nextRefs = [...open.items]
              const [moved] = nextRefs.splice(fromIdx, 1)
              if (moved) {
                nextRefs.splice(toIdx, 0, moved)
                store.reorderCollectionItems(open.id, nextRefs)
                toast('Updated collection order')
              }
            }}
          />
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
  const { isKidsMode } = useProfiles()
  const toast = useToast()
  const [confirm, setConfirm] = useState(false)
  const findMovie = (sId: string, id: string) => store.xtreamCatalogue.movies.find((m) => m.sourceId === sId && m.id === id)
  const findSeries = (sId: string, id: string) => store.xtreamCatalogue.series.find((s) => s.sourceId === sId && s.id === id)
  const rawHistory = isKidsMode
    ? store.library.history.filter((h) => isRefKidSafe(h.ref, isKidsMode, store.findChannel, findCatalogTitle))
    : store.library.history
  const entries = rawHistory.map((h) => ({ h, r: resolve(h.ref, now, store.findChannel, store.programmeAt, store.demoTitles, findMovie, findSeries) })).filter((x): x is { h: typeof x.h; r: Resolved } => !!x.r)
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
                    {r.kind === 'channel' ? <ChannelMark channel={r.item} size={48} /> : 'artworkKey' in r && r.artworkKey ? <XtreamArt artworkKey={r.artworkKey} alt={r.title} className="history-thumb" /> : <Art src={r.art} focus={r.focus} className="history-thumb" />}
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

function RatingsTab() {
  const store = useStore()
  const now = useNow()
  const toast = useToast()
  const [filter, setFilter] = useState<'all' | 'like' | 'strong-like' | 'dislike'>('all')

  const findMovie = (sId: string, id: string) => store.xtreamCatalogue.movies.find((m) => m.sourceId === sId && m.id === id)
  const findSeries = (sId: string, id: string) => store.xtreamCatalogue.series.find((s) => s.sourceId === sId && s.id === id)

  const ratingsMap = store.userPreferences?.preferences.ratings ?? {}
  const dislikeFeedback = store.userPreferences?.preferences.dislikeFeedback ?? {}

  const entries: Array<{ ref: string; val: RatingValue; reason?: DislikeReason; r: Resolved }> = []
  for (const [ref, val] of Object.entries(ratingsMap)) {
    const r = resolve(ref, now, store.findChannel, store.programmeAt, store.demoTitles, findMovie, findSeries)
    if (r) {
      entries.push({
        ref,
        val: val as RatingValue,
        reason: dislikeFeedback[ref]?.reason,
        r,
      })
    }
  }

  const filtered = filter === 'all' ? entries : entries.filter((e) => e.val === filter)

  return (
    <div className="lib-ratings-tab">
      <div className="lib-toolbar">
        <div className="lib-filters">
          {(['all', 'strong-like', 'like', 'dislike'] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={`chip ${filter === k ? 'is-active' : ''}`}
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
            >
              {k === 'all' ? 'All ratings' : k === 'strong-like' ? 'Loved' : k === 'like' ? 'Liked' : 'Disliked'}
              <span className="chip-count">
                {k === 'all' ? entries.length : entries.filter((e) => e.val === k).length}
              </span>
            </button>
          ))}
        </div>
        <SaveIndicator status={store.userPreferences?.saveState ?? 'idle'} />
      </div>

      {filtered.length === 0 ? (
        <StateBlock
          icon="sparkles"
          title="No ratings in this category"
          action={<Link to="/" className="btn btn-ghost">Discover titles on Home</Link>}
        >
          Rate movies, series, or channels using the thumbs up or love buttons to tune your local recommendation rails.
        </StateBlock>
      ) : (
        <ul className="lib-ratings-list">
          {filtered.map(({ ref, val, reason, r }) => (
            <li key={ref} className="lib-rating-row">
              <Link to={r.kind === 'channel' ? r.play : r.href} className="lib-rating-link">
                {r.kind === 'channel' ? (
                  <ChannelMark channel={r.item} size={44} />
                ) : 'artworkKey' in r && r.artworkKey ? (
                  <XtreamArt artworkKey={r.artworkKey} alt={r.title} className="history-thumb" />
                ) : (
                  <Art src={r.art} focus={r.focus} className="history-thumb" />
                )}
                <div className="lib-rating-info">
                  <strong>{r.title}</strong>
                  <span className="faint">{r.meta}</span>
                  {reason && <span className="lib-dislike-reason">Reason: {reason.replace(/-/g, ' ')}</span>}
                </div>
              </Link>
              <div className="lib-rating-actions">
                <Badge
                  tone={val === 'strong-like' ? 'accent' : val === 'like' ? 'emerald' : 'crimson'}
                  icon={val === 'strong-like' ? 'sparkles' : val === 'like' ? 'thumbsUp' : 'thumbsDown'}
                >
                  {val === 'strong-like' ? 'Loved' : val === 'like' ? 'Liked' : 'Disliked'}
                </Badge>
                <RatingControls itemRef={ref} title={r.title} compact />
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Clear rating for ${r.title}`}
                  title="Clear rating"
                  onClick={() => {
                    store.userPreferences?.setRating(ref, null)
                    toast(`Cleared rating for ${r.title}`)
                  }}
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function HiddenTab() {
  const store = useStore()
  const now = useNow()
  const toast = useToast()

  const findMovie = (sId: string, id: string) => store.xtreamCatalogue.movies.find((m) => m.sourceId === sId && m.id === id)
  const findSeries = (sId: string, id: string) => store.xtreamCatalogue.series.find((s) => s.sourceId === sId && s.id === id)

  const hidden = store.userPreferences?.preferences.hiddenItems ?? []
  const resolved = hidden.map((ref) => {
    const r = resolve(ref, now, store.findChannel, store.programmeAt, store.demoTitles, findMovie, findSeries)
    return { ref, r }
  })

  return (
    <div className="lib-hidden-tab">
      <div className="lib-toolbar">
        <p className="faint">
          {hidden.length} {hidden.length === 1 ? 'item hidden' : 'items hidden'} from discovery rails and guides.
        </p>
        {hidden.length > 0 && (
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => {
              hidden.forEach((ref) => store.userPreferences?.unhideItem(ref))
              toast('Restored all hidden items')
            }}
          >
            Unhide all
          </button>
        )}
      </div>

      {hidden.length === 0 ? (
        <StateBlock icon="eye" title="No hidden items">
          Titles or channels you hide from your recommendations or guides will appear here, where you can restore them at any time.
        </StateBlock>
      ) : (
        <ul className="lib-ratings-list">
          {resolved.map(({ ref, r }) => (
            <li key={ref} className="lib-rating-row">
              <div className="lib-rating-link">
                {r && (r.kind === 'channel' ? (
                  <ChannelMark channel={r.item} size={44} />
                ) : 'artworkKey' in r && r.artworkKey ? (
                  <XtreamArt artworkKey={r.artworkKey} alt={r.title} className="history-thumb" />
                ) : (
                  <Art src={r.art} focus={r.focus} className="history-thumb" />
                ))}
                <div className="lib-rating-info">
                  <strong>{r?.title ?? ref}</strong>
                  <span className="faint">{r?.meta ?? 'Hidden element'}</span>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => {
                  store.userPreferences?.unhideItem(ref)
                  toast(`Unhid ${r?.title ?? 'item'}`)
                }}
              >
                <Icon name="eye" size={14} />
                Unhide
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
