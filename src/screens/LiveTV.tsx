import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CHANNEL_GROUPS, GUIDE_DAYS, MIN, addDays, startOfDay } from '../data/channels'
import { movies, series } from '../data/catalog'
import { catchupRef, channelRef, recordingRef } from '../data/refs'
import type { Channel, Programme } from '../data/types'
import { Dialog } from '../components/Dialog'
import { Icon } from '../components/Icon'
import { AgeRatingBadge } from '../components/AgeRatingBadge'
import { TechnicalBadge } from '../components/TechnicalBadges'
import { useToast } from '../components/Toast'
import { PageHeader } from '../components/PageHeader'
import { ChannelCard } from '../components/Tiles'
import { ChannelMark, ProgressBar, ProgrammeArt, StateBlock } from '../components/ui'
import { filterKidSafeChannels, filterKidSafeProgrammes, isChannelKidSafe } from '../lib/kidsMode'
import { guideChannels, type GuideChannel } from '../lib/native'
import { useStreamPlayback, playbackText, type PlaybackStatus } from '../lib/playback'
import { clock, dayLabel, useNow } from '../lib/time'
import { noListingsText } from '../state/guides'
import { categoryLabel, channelGroups, inCategory, unavailableReason, cleanChannelTitle } from '../state/playlists'
import { LIVE_TV_CATEGORIES, classifyChannelCategory, extractChannelLocation, getCategoryIcon } from '../data/channelCategories'
import { useProfiles } from '../state/profiles'
import { useStore } from '../state/store'
import { MediaContextMenu } from '../components/MediaContextMenu'
import './LiveTV.css'

// Guide row height per density setting (px), mirrored by --guide-row in global.css.
const ROW_H = { compact: 52, comfortable: 64, spacious: 76 } as const
// Rows and cards rendered per page. Unbounded, 10,000 channels took seconds per render and per
// scrolled frame (D8 measurements); a virtualised guide would lift this limit.
const GUIDE_PAGE = 100
const CARD_PAGE = 120

function parseChannelTag(name: string): { title: string; tag?: string } {
  const match = name.match(/^(.*?)(?:\s*\(([^)]+)\))?(?:\s*\[([^\]]+)\])?$/i)
  if (!match) return { title: name }
  const clean = match[1]?.trim()
  const tag = match[2] || (match[3] ? match[3].slice(0, 10) : undefined)
  return { title: clean || name, tag }
}

const EPG_GENRES = [
  { name: 'All', color: undefined },
  { name: 'Movies', color: '#f59e0b' },
  { name: 'Sports', color: '#10b981' },
  { name: 'News', color: '#3b82f6' },
  { name: 'Series', color: '#8b5cf6' },
  { name: 'Kids', color: '#ec4899' },
  { name: 'Documentary', color: '#14b8a6' },
] as const

const TIME_PRESETS = [
  { label: 'Morning', time: '08:00', hour: 8 },
  { label: 'Midday', time: '12:00', hour: 12 },
  { label: 'Afternoon', time: '15:00', hour: 15 },
  { label: 'Prime Time', time: '20:00', hour: 20 },
  { label: 'Late Night', time: '23:00', hour: 23 },
]

function getProgrammeGenreClass(category?: string): string {
  if (!category) return ''
  const cat = category.toLowerCase()
  if (cat.includes('movie') || cat.includes('film') || cat.includes('cinema')) return 'prog-genre-movie'
  if (cat.includes('sport') || cat.includes('football') || cat.includes('soccer')) return 'prog-genre-sport'
  if (cat.includes('news') || cat.includes('current')) return 'prog-genre-news'
  if (cat.includes('series') || cat.includes('drama') || cat.includes('comedy')) return 'prog-genre-series'
  if (cat.includes('kid') || cat.includes('child') || cat.includes('anim')) return 'prog-genre-kids'
  if (cat.includes('doc') || cat.includes('nature') || cat.includes('sci')) return 'prog-genre-doc'
  return ''
}

function useMedia(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const m = window.matchMedia(query)
    const on = () => setMatch(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [query])
  return match
}

export function LiveTV() {
  const now = useNow(15_000)
  const store = useStore()
  const { isKidsMode } = useProfiles()
  const rawChannels = store.channels
  const channels = useMemo(() => filterKidSafeChannels(rawChannels, isKidsMode), [rawChannels, isKidsMode])
  const { prefs, library, findChannel, channelMode, requestGuideDay } = store
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const compactCol = useMedia('(max-width: 640px)')

  // Only a channel the user chose: nothing is tuned just because it is first in the list.
  const candidatePlaying = findChannel(params.get('channel') ?? '')
  const isPlayingBlocked = isKidsMode && candidatePlaying && !isChannelKidSafe(candidatePlaying)
  const playing = isPlayingBlocked ? null : candidatePlaying

  const userPreferences = store.userPreferences
  const [groupingMode, setGroupingMode] = useState<'canonical' | 'provider'>(() =>
    userPreferences?.preferences.liveTvGroupingMode ?? 'provider'
  )
  const [countryFilter, setCountryFilter] = useState<string>('All')
  const [sourceFilter, setSourceFilter] = useState<string>('All')

  const favIds = library.favourites.filter((r) => r.startsWith('channel:')).map((r) => r.slice(8))
  const recentChannelIds = useMemo(
    () => library.history.filter((r) => r.ref.startsWith('channel:')).map((r) => r.ref.slice(8)),
    [library.history],
  )

  const providerCategories = useMemo(
    () => (channelMode === 'playlists' ? channelGroups(channels) : CHANNEL_GROUPS.filter((g) => channels.some((c) => inCategory(c, g)))),
    [channelMode, channels],
  )
  const canonicalCategories = useMemo(() => {
    const present = new Set<string>()
    for (const c of channels) {
      const cat = classifyChannelCategory(c)
      present.add(cat.category)
    }
    return LIVE_TV_CATEGORIES.map((def) => def.name).filter((name) => present.has(name))
  }, [channels])

  const activeCategories = groupingMode === 'canonical' ? canonicalCategories : providerCategories
  const allSelectableGroups = useMemo(
    () => Array.from(new Set(['All', 'Favourites', 'Recently Watched', ...canonicalCategories, ...providerCategories])),
    [canonicalCategories, providerCategories],
  )
  const groups = [
    'All',
    'Favourites',
    ...(recentChannelIds.length > 0 ? ['Recently Watched'] : []),
    ...activeCategories,
  ]
  const requestedGroup = params.get('group')
  const group = requestedGroup && allSelectableGroups.includes(requestedGroup) ? requestedGroup : 'All'
  const view = params.get('view') === 'channels' ? 'channels' : 'guide'
  const [dayOffset, setDayOffset] = useState(0)
  const [selected, setSelected] = useState<Programme | null>(null)
  const [matchingChannel, setMatchingChannel] = useState<Channel | null>(null)
  const [playerOpen, setPlayerOpen] = useState(() => !!params.get('channel') && !isPlayingBlocked)
  const [playerStatus, setPlayerStatus] = useState<PlaybackStatus>('idle')
  // "Watching" follows the media element's real state, never just the selection.
  const reallyPlaying = playerOpen && ['playing', 'buffering', 'paused'].includes(playerStatus)
  const [focusId, setFocusId] = useState<string | null>(null)

  const [filterQuery, setFilterQuery] = useState('')
  const [manageMode, setManageMode] = useState(false)
  const [selectedChannels, setSelectedChannels] = useState<string[]>([])
  const [contextChannel, setContextChannel] = useState<{ channel: Channel; x: number; y: number } | null>(null)
  const prevChannelRef = useRef<Channel | null>(null)

  const [timeJumpOpen, setTimeJumpOpen] = useState(false)
  const [customJumpHour, setCustomJumpHour] = useState(20)
  const [epgSearchOpen, setEpgSearchOpen] = useState(false)
  const [epgSearchQuery, setEpgSearchQuery] = useState('')
  const [epgGenre, setEpgGenre] = useState<string>('All')

  const hiddenItems = userPreferences?.preferences.hiddenItems ?? []
  const notHidden = useMemo(
    () => channels.filter((c) => !hiddenItems.includes(channelRef(c.id))),
    [channels, hiddenItems],
  )

  const availableCountries = useMemo(() => {
    const set = new Set<string>()
    for (const c of notHidden) {
      const loc = extractChannelLocation(c)
      if (loc.country) set.add(loc.country)
      for (const opt of c.streamOptions ?? []) {
        if (opt.country) set.add(opt.country)
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [notHidden])

  const availableSources = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of store.playlists) {
      if (s.channels.length > 0) map.set(s.id, s.name)
    }
    for (const c of notHidden) {
      for (const opt of c.streamOptions ?? []) {
        if (opt.sourceId && opt.sourceName && !map.has(opt.sourceId)) {
          map.set(opt.sourceId, opt.sourceName)
        }
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [store.playlists, notHidden])

  const baseVisible = useMemo(() => {
    let list: Channel[]
    if (group === 'All') {
      list = notHidden
    } else if (group === 'Favourites') {
      list = notHidden.filter((c) => favIds.includes(c.id))
    } else if (group === 'Recently Watched') {
      list = recentChannelIds
        .map((id) => notHidden.find((c) => c.id === id))
        .filter((c): c is Channel => Boolean(c))
    } else {
      list = notHidden.filter((c) => {
        if (inCategory(c, group)) return true
        const classified = classifyChannelCategory(c)
        return classified.category === group || classified.subcategory === group
      })
    }

    if (countryFilter !== 'All') {
      list = list.filter((c) => {
        const loc = extractChannelLocation(c)
        if (loc.country === countryFilter) return true
        return (c.streamOptions ?? []).some((opt) => opt.country === countryFilter)
      })
    }

    if (sourceFilter !== 'All') {
      list = list.filter((c) => {
        if (c.sourceId === sourceFilter) return true
        return (c.streamOptions ?? []).some((opt) => opt.sourceId === sourceFilter)
      })
    }

    return list
  }, [notHidden, group, favIds, recentChannelIds, countryFilter, sourceFilter])
  const visible = filterQuery.trim()
    ? baseVisible.filter((c) => {
        const needle = filterQuery.trim().toLowerCase()
        const prog = store.programmeAt(c, now)
        return (
          c.name.toLowerCase().includes(needle) ||
          String(c.number).includes(needle) ||
          (prog && prog.title.toLowerCase().includes(needle))
        )
      })
    : baseVisible
  // How many of `visible` to render; back to one page whenever the view or category changes.
  const [paged, setPaged] = useState({ key: '', count: 0 })
  const pageKey = `${view}:${group}:${countryFilter}:${sourceFilter}`
  const pageSize = view === 'guide' ? GUIDE_PAGE : CARD_PAGE
  const shownCount = paged.key === pageKey ? paged.count : pageSize
  const shown = visible.slice(0, shownCount)
  const more = visible.length - shown.length
  const showMore = (
    more > 0 && (
      <button type="button" className="btn btn-secondary btn-small live-more" onClick={() => setPaged({ key: pageKey, count: shownCount + pageSize })}>
        Show {Math.min(pageSize, more)} more of {more} channels ({shown.length} of {visible.length} shown)
      </button>
    )
  )
  const countSummary = visible.length > 0 && (
    <p className="live-count-summary faint tnum" role="status">
      {group === 'All'
        ? `Showing ${shown.length} of ${visible.length} unique ${visible.length === 1 ? 'channel' : 'channels'}${store.totalPlaylistEntries > channels.length ? ` (${store.totalPlaylistEntries} playlist entries across ${store.playlists.length} ${store.playlists.length === 1 ? 'playlist' : 'playlists'})` : ''}`
        : `Showing ${shown.length} of ${visible.length} ${visible.length === 1 ? 'channel' : 'channels'} in ${group} (${channels.length} unique ${channels.length === 1 ? 'channel' : 'channels'} total)`}
    </p>
  )

  // Local midnights, so a day with a clock change is 23 or 25 hours long.
  const dayStart = addDays(startOfDay(now), dayOffset)
  const dayEnd = addDays(dayStart, 1)
  useEffect(() => requestGuideDay(dayStart), [requestGuideDay, dayStart])
  const rows = shown.map((c) => ({
    channel: c,
    programmes: filterKidSafeProgrammes(store.schedule(c, dayStart), isKidsMode),
  }))

  const scheduleSearchResults = useMemo(() => {
    if (!epgSearchQuery.trim() || epgSearchQuery.length < 2) return []
    const q = epgSearchQuery.toLowerCase()
    const results: { programme: Programme; channel: Channel }[] = []
    for (const r of rows) {
      for (const p of r.programmes) {
        if (
          p.title.toLowerCase().includes(q) ||
          (p.desc && p.desc.toLowerCase().includes(q)) ||
          (p.category && p.category.toLowerCase().includes(q))
        ) {
          results.push({ programme: p, channel: r.channel })
          if (results.length >= 50) break
        }
      }
      if (results.length >= 50) break
    }
    return results
  }, [rows, epgSearchQuery])

  // Geometry: the visible window shows `guideZoom` hours across whatever width the guide has.
  const scroller = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(1200)
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => e && setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [view])
  const colW = compactCol ? 64 : 248
  const ppm = Math.max(3, (width - colW) / (prefs.guideZoom * 60))
  const x = (t: number) => ((t - dayStart) / MIN) * ppm

  const scrollToTime = (t: number, smooth = true) =>
    scroller.current?.scrollTo({ left: Math.max(0, x(t) - 30 * ppm), behavior: smooth ? 'smooth' : 'auto' })

  const jumpToNow = () => {
    if (dayOffset !== 0) {
      setDayOffset(0)
    }
    window.setTimeout(() => scrollToTime(now, true), 40)
  }

  // Position once per day/zoom: at now (or start of day) for today, early evening for later days.
  const positioned = useRef('')
  const positionKey = `${view}:${visible.length}:${dayStart}:${Math.round(ppm)}`
  useEffect(() => {
    if (positioned.current === positionKey) return
    positioned.current = positionKey
    if (dayOffset === 0) scrollToTime(prefs.guideStart === 'now' ? now : dayStart + 30 * MIN, false)
    else scrollToTime(dayStart + 18.5 * 60 * MIN, false)
  })

  const current = playing ? store.programmeAt(playing, now) : undefined

  const tune = (c: Channel, announce = true) => {
    if (playing && playing.id !== c.id) {
      prevChannelRef.current = playing
    }
    const next = new URLSearchParams(params)
    next.set('channel', c.id)
    setParams(next, { replace: true })
    setSelected(null)
    setPlayerOpen(true)
    store.recordView(channelRef(c.id))
    if (announce) toast(`Switched to ${c.number} ${c.name}`)
  }
  const step = (dir: number) => {
    const list = visible.length ? visible : channels
    const i = list.findIndex((c) => c.id === playing?.id)
    const c = list[(i + dir + list.length) % list.length]
    if (c) tune(c)
  }
  const setGroup = (g: string) => {
    const next = new URLSearchParams(params)
    if (g === 'All') next.delete('group')
    else next.set('group', g)
    setParams(next, { replace: true })
  }

  // Channel up/down and previous channel from anywhere on the page.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName) || document.querySelector('dialog[open]')) return
      if (e.key === 'PageUp') { e.preventDefault(); step(-1) }
      if (e.key === 'PageDown') { e.preventDefault(); step(1) }
      if ((e.key === 'p' || e.key === 'P' || (e.altKey && e.key === 'ArrowLeft')) && prevChannelRef.current) {
        e.preventDefault()
        tune(prevChannelRef.current)
      }
      if (/^[a-zA-Z]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const letter = e.key.toUpperCase()
        const matchIdx = visible.findIndex((c) => cleanChannelTitle(c.name).toUpperCase().startsWith(letter))
        if (matchIdx >= 0) {
          const matchChan = visible[matchIdx]
          if (matchIdx >= shownCount) {
            setPaged({ key: pageKey, count: Math.ceil((matchIdx + 1) / pageSize) * pageSize })
          }
          window.setTimeout(() => {
            const row = document.getElementById(`guide-row-${matchChan?.id}`)
            row?.scrollIntoView({ block: 'center', behavior: 'smooth' })
          }, 40)
          toast(`Jumped to '${letter}': ${matchChan?.name}`)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const select = (p: Programme) => {
    setSelected(p)
    setFocusId(p.id)
  }

  // Roving focus across the grid: arrows move between programmes, like a remote.
  const effectiveFocus = focusId && rows.some((r) => r.programmes.some((p) => p.id === focusId))
    ? focusId
    : (rows.find((r) => r.channel.id === playing?.id) ?? rows[0])?.programmes.find((p) => p.start <= Math.max(now, dayStart) && Math.max(now, dayStart) < p.stop)?.id ?? rows[0]?.programmes[0]?.id ?? null
  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key) || !effectiveFocus) return
    const r = rows.findIndex((row) => row.programmes.some((p) => p.id === effectiveFocus))
    const row = rows[r]
    if (!row) return
    const i = row.programmes.findIndex((p) => p.id === effectiveFocus)
    const cur = row.programmes[i] as Programme
    let target: Programme | undefined
    if (e.key === 'ArrowLeft') target = row.programmes[i - 1]
    if (e.key === 'ArrowRight') target = row.programmes[i + 1]
    if (e.key === 'Home') target = row.programmes[0]
    if (e.key === 'End') target = row.programmes[row.programmes.length - 1]
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const other = rows[r + (e.key === 'ArrowUp' ? -1 : 1)]
      const anchor = Math.max(cur.start, dayStart) + 60_000
      target = other?.programmes.find((p) => p.start <= anchor && anchor < p.stop)
    }
    if (target) {
      e.preventDefault()
      setFocusId(target.id)
    }
  }
  useEffect(() => {
    if (!focusId) return
    const el = scroller.current?.querySelector<HTMLElement>(`[data-pid="${CSS.escape(focusId)}"]`)
    if (el && scroller.current?.contains(document.activeElement)) {
      el.focus({ preventScroll: true })
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }, [focusId])

  const ticks = Array.from({ length: Math.round((dayEnd - dayStart) / (30 * MIN)) }, (_, i) => dayStart + i * 30 * MIN)
  const innerW = colW + x(dayEnd)
  const showNow = dayOffset === 0

  const panel = selected && (
    <ProgrammePanel
      programme={selected}
      channel={findChannel(selected.channelId)}
      now={now}
      isPlayingChannel={selected.channelId === playing?.id}
      isSelection
      onTune={(c) => { tune(c); setSelected(null) }}
      onClear={() => setSelected(null)}
      onSelect={select}
    />
  )

  const setView = (v: 'guide' | 'channels') => {
    const next = new URLSearchParams(params)
    if (v === 'guide') next.delete('view')
    else next.set('view', v)
    setParams(next, { replace: true })
  }

  const tabs = (
    <div className="tabs" role="tablist" aria-label="Live TV views">
      <button type="button" role="tab" className="tab" aria-selected={view === 'guide' && group !== 'Favourites' && group !== 'Catch-up'} onClick={() => { setView('guide'); if (group === 'Favourites' || group === 'Catch-up') setGroup('All') }}>TV Guide</button>
      <button type="button" role="tab" className="tab" aria-selected={view === 'channels' && group !== 'Favourites' && group !== 'Catch-up'} onClick={() => { setView('channels'); if (group === 'Favourites' || group === 'Catch-up') setGroup('All') }}>Channels</button>
      <Link to="/recordings" role="tab" className="tab">Recordings</Link>
      <button type="button" role="tab" className="tab" aria-selected={group === 'Catch-up'} onClick={() => { setView('channels'); setGroup('Catch-up') }}>Catch Up</button>
      <button type="button" role="tab" className="tab" aria-selected={group === 'Favourites'} onClick={() => { setView('channels'); setGroup('Favourites') }}>Favourites</button>
    </div>
  )

  // Header controls: unified pill group with consistent height and alignment
  const guideActions = view === 'guide' && (
    <div className="guide-actions">
      <div className="guide-date-group">
        <button type="button" className="icon-btn" onClick={() => setDayOffset((d) => Math.max(0, d - 1))} disabled={dayOffset === 0} aria-label="Previous day"><Icon name="left" size={16} /></button>
        <select className="date-select" value={dayOffset} onChange={(e) => setDayOffset(Number(e.target.value))} aria-label="Guide day">
          {Array.from({ length: GUIDE_DAYS }, (_, i) => (
            <option key={i} value={i}>{new Date(addDays(startOfDay(now), i)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</option>
          ))}
        </select>
        <button type="button" className="icon-btn" onClick={() => setDayOffset((d) => Math.min(GUIDE_DAYS - 1, d + 1))} disabled={dayOffset === GUIDE_DAYS - 1} aria-label="Next day"><Icon name="right" size={16} /></button>
      </div>
      <button type="button" className="now-btn" onClick={jumpToNow} aria-label="Jump to current time"><span className="live-dot" aria-hidden="true" />Now</button>
      <button type="button" className="now-btn" onClick={() => setTimeJumpOpen(true)} aria-label="Jump to timeline preset">
        <Icon name="history" size={14} />
        <span>Time Jump</span>
      </button>
      <button type="button" className="now-btn" onClick={() => setEpgSearchOpen(true)} aria-label="Search guide schedule">
        <Icon name="search" size={14} />
        <span>Find Show</span>
      </button>
      <div className="guide-zoom-group timeline-zoom-controls">
        <button
          type="button"
          className="icon-btn zoom-btn"
          disabled={prefs.guideZoom <= 1}
          onClick={() => store.setPref('guideZoom', Math.max(1, prefs.guideZoom - 1) as 1 | 2 | 3 | 4)}
          aria-label="Zoom in timeline"
          title="Zoom in (-)"
        >
          <Icon name="minus" size={14} />
        </button>
        <button
          type="button"
          className="icon-btn zoom-btn zoom-reset-btn"
          onClick={() => store.setPref('guideZoom', 2)}
          aria-label="Reset zoom"
          title="Reset zoom (1x)"
        >
          <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>1x</span>
        </button>
        <button
          type="button"
          className="icon-btn zoom-btn"
          disabled={prefs.guideZoom >= 4}
          onClick={() => store.setPref('guideZoom', Math.min(4, prefs.guideZoom + 1) as 1 | 2 | 3 | 4)}
          aria-label="Zoom out timeline"
          title="Zoom out (+)"
        >
          <Icon name="plus" size={14} />
        </button>
        <select className="guide-zoom-select" value={prefs.guideZoom} onChange={(e) => store.setPref('guideZoom', Number(e.target.value) as 1 | 2 | 3 | 4)} aria-label="Hours visible">
          <option value={1}>1 hour</option>
          <option value={2}>2 hours</option>
          <option value={3}>3 hours</option>
          <option value={4}>4 hours</option>
        </select>
      </div>
    </div>
  )

  const noPlaylistChannels = channelMode === 'none' ? (
    <StateBlock icon="sources" title="No channels yet" action={<Link to="/setup" className="btn btn-primary">Set up Kinora</Link>}>
      Add a TV playlist you are allowed to use and its channels appear here.
    </StateBlock>
  ) : (
    <StateBlock icon="sources" title="No channels to show yet" action={<Link to="/sources" className="btn btn-ghost">Open Sources</Link>}>
      {store.playlists.some((s) => s.status === 'importing')
        ? 'A playlist is still being imported.'
        : 'None of your imported playlists has produced any channels. Open Sources to see why, refresh a source or add another.'}
    </StateBlock>
  )

  const emptyFavourites = (
    <StateBlock icon="heart" title="No favourite channels yet" action={<button type="button" className="btn btn-ghost" onClick={() => setGroup('All')}>Show all channels</button>}>
      Use the heart next to a channel name to keep it here. Favourites are saved on this device.
    </StateBlock>
  )

  if (isPlayingBlocked) {
    return (
      <>
        <PageHeader title="Live TV" />
        <div className="page live" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', padding: '24px' }}>
          <div style={{ maxWidth: '440px', textAlign: 'center', background: 'var(--card-bg, #1a1e24)', border: '1px solid var(--line)', borderRadius: '16px', padding: '32px' }}>
            <div style={{ display: 'grid', placeItems: 'center', marginBottom: '16px', color: '#e50914' }}>
              <Icon name="lock" size={48} />
            </div>
            <h2 style={{ fontSize: '1.4rem', marginBottom: '8px' }}>Restricted in Kids Mode</h2>
            <p style={{ color: 'var(--text-2)', fontSize: '0.95rem', marginBottom: '24px' }}>
              This channel is restricted and unavailable in Kids Mode.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                const next = new URLSearchParams(params)
                next.delete('channel')
                setParams(next)
              }}
            >
              Back to Channels
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Live TV" tabs={tabs} search={false} actions={guideActions} />
      <div className={`page live${reallyPlaying ? ' is-docked-playing' : ''}`}>
        <div className="live-toolbar">
          <div className="live-toolbar-filters">
            <div className="live-search-box">
              <Icon name="search" size={16} />
              <input
                type="search"
                placeholder="Filter channels or on air..."
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                aria-label="Filter channels or programmes"
              />
              {filterQuery && (
                <button type="button" className="icon-btn" onClick={() => setFilterQuery('')} aria-label="Clear filter">
                  <Icon name="close" size={14} />
                </button>
              )}
            </div>

            {availableCountries.length > 1 && (
              <select
                className="live-filter-select"
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                aria-label="Filter by country"
              >
                <option value="All">All countries ({availableCountries.length})</option>
                {availableCountries.map((country) => (
                  <option key={country} value={country}>{country}</option>
                ))}
              </select>
            )}

            {availableSources.length > 1 && (
              <select
                className="live-filter-select"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                aria-label="Filter by provider"
              >
                <option value="All">All providers ({availableSources.length})</option>
                {availableSources.map((src) => (
                  <option key={src.id} value={src.id}>{src.name}</option>
                ))}
              </select>
            )}

            <button
              type="button"
              className="btn btn-small btn-ghost"
              onClick={() => {
                const next = groupingMode === 'canonical' ? 'provider' : 'canonical'
                setGroupingMode(next)
                userPreferences?.setLiveTvGroupingMode(next)
              }}
              aria-label="Switch category grouping mode"
              title={groupingMode === 'canonical' ? 'Showing standard categories - click for provider groups' : 'Showing provider groups - click for standard categories'}
            >
              <Icon name="folder" size={14} />
              {groupingMode === 'canonical' ? 'Standard Categories' : 'Provider Groups'}
            </button>
          </div>

          <button
            type="button"
            className={`btn btn-small ${manageMode ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => {
              setManageMode(!manageMode)
              setSelectedChannels([])
            }}
          >
            <Icon name="command" size={14} />
            {manageMode ? 'Done Managing' : 'Manage Channels'}
          </button>
        </div>

        {manageMode && (
          <div className="live-manage-bar" role="toolbar" aria-label="Bulk channel actions">
            <input
              type="checkbox"
              className="live-bulk-check"
              checked={selectedChannels.length === shown.length && shown.length > 0}
              onChange={(e) => {
                if (e.target.checked) setSelectedChannels(shown.map((c) => c.id))
                else setSelectedChannels([])
              }}
              aria-label="Select all visible channels"
            />
            <span className="tnum">
              <strong>{selectedChannels.length}</strong> of {shown.length} selected
            </span>
            {selectedChannels.length > 0 && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() => {
                    selectedChannels.forEach((id) => {
                      if (!favIds.includes(id)) store.toggleFavourite(channelRef(id))
                    })
                    toast(`Added ${selectedChannels.length} channels to favourites`)
                    setSelectedChannels([])
                  }}
                >
                  <Icon name="heart" size={14} />
                  Favourite
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() => {
                    selectedChannels.forEach((id) => {
                      userPreferences?.hideItem(channelRef(id))
                    })
                    toast(`Hidden ${selectedChannels.length} channels`)
                    setSelectedChannels([])
                  }}
                >
                  <Icon name="eyeOff" size={14} />
                  Hide
                </button>
              </>
            )}
          </div>
        )}

        <div className="chips live-chips" role="group" aria-label="Channel category">
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              className="chip"
              aria-pressed={group === g}
              onClick={() => setGroup(g)}
              onFocus={(e) => e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })}
            >
              <Icon name={getCategoryIcon(g)} size={14} />
              <span>{g}</span>
            </button>
          ))}
        </div>

        {view === 'channels' ? (
          <>
            {channels.length === 0 ? noPlaylistChannels : visible.length === 0 ? emptyFavourites : (
              <>
                {countSummary}
                <div className="grid-cards">
                  {shown.map((c) => (
                    <ChannelCard key={c.id} channel={c} now={store.programmeAt(c, now)} next={store.nextProgramme(c, now)} to={`/live?channel=${c.id}`} format={prefs.timeFormat} selected={reallyPlaying && c.id === playing?.id} at={now} />
                  ))}
                </div>
                {showMore}
              </>
            )}
          </>
        ) : visible.length === 0 ? (
          channels.length === 0 ? noPlaylistChannels : emptyFavourites
        ) : (
          <section className="guide" aria-label="TV guide">
            {countSummary}
            <div className="epg-genre-bar" role="group" aria-label="EPG genre filter">
              {EPG_GENRES.map((g) => (
                <button
                  key={g.name}
                  type="button"
                  className={`epg-genre-pill ${epgGenre === g.name ? 'is-active' : ''}`}
                  onClick={() => setEpgGenre(g.name)}
                  aria-pressed={epgGenre === g.name}
                >
                  {g.color && <span className="epg-genre-pill-dot" style={{ background: g.color }} aria-hidden="true" />}
                  <span>{g.name}</span>
                </button>
              ))}
            </div>
            <div className="guide-scroll" ref={scroller} style={{ ['--col-w' as string]: `${colW}px`, ['--row-h' as string]: `${ROW_H[prefs.density]}px` }}>
              <div className="guide-inner" style={{ width: innerW }} role="grid" aria-label={`Programme guide, ${dayLabel(dayStart, now)}`} aria-rowcount={rows.length + 1} onKeyDown={onGridKey}>
                <div className="guide-head" role="row">
                  <div className="guide-corner" role="columnheader">
                    <select className="corner-select" value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Channel category">
                      {allSelectableGroups.map((g) => <option key={g} value={g}>{g === 'All' ? 'Channels' : g}</option>)}
                    </select>
                  </div>
                  <div className="guide-ticks" role="presentation">
                    {ticks.map((t) => {
                      const isHour = new Date(t).getMinutes() === 0
                      return (
                        <span
                          key={t}
                          className={`tick tnum${isHour ? ' is-hour' : ' is-half'}${showNow && t <= now && now < t + 30 * MIN ? ' is-current' : ''}`}
                          style={{ left: x(t) }}
                        >
                          <span className="tick-mark" aria-hidden="true" />
                          <span className="tick-label">{clock(t, prefs.timeFormat)}</span>
                        </span>
                      )
                    })}
                  </div>
                </div>
                {rows.map(({ channel: c, programmes }) => {
                  const fav = favIds.includes(c.id)
                  const isTuned = c.id === playing?.id
                  const isPlaying = reallyPlaying && isTuned
                  const { title: cleanName, tag: qualityTag } = parseChannelTag(c.name)
                  return (
                    <div key={c.id} id={`guide-row-${c.id}`} className={`guide-row${isTuned ? ' is-playing' : ''}`} role="row">
                      <div
                        className="guide-channel"
                        role="rowheader"
                        onContextMenu={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setContextChannel({ channel: c, x: e.clientX, y: e.clientY })
                        }}
                      >
                        {manageMode && (
                          <input
                            type="checkbox"
                            className="live-bulk-check"
                            checked={selectedChannels.includes(c.id)}
                            onChange={(e) => {
                              e.stopPropagation()
                              setSelectedChannels((prev) =>
                                e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id),
                              )
                            }}
                            aria-label={`Select ${c.name}`}
                          />
                        )}
                        <button type="button" className="guide-channel-tune" onClick={() => tune(c)} aria-label={`Watch ${c.number} ${c.name}${isPlaying ? ', now watching' : ''}`} aria-current={isTuned ? 'true' : undefined}>
                          <ChannelMark channel={c} size={compactCol ? 32 : 34} />
                          {!compactCol && (
                            <span className="guide-channel-name">
                              <strong title={c.name}>{cleanName}</strong>
                              <span className="guide-channel-subline">
                                {isPlaying && <span className="watching"><Icon name="play" size={9} />Watching</span>}
                                {qualityTag && <span className="guide-channel-tag">{qualityTag}</span>}
                                {c.tvArchive === 1 && <span className="guide-channel-tag" title="Catch-up TV available">Catch-up</span>}
                                {(c.streamOptions?.length ?? 0) > 1 && (
                                  <span className="guide-channel-tag" title="Available stream servers">
                                    {c.streamOptions?.length} servers
                                  </span>
                                )}
                              </span>
                            </span>
                          )}
                          {!compactCol && <span className="guide-channel-no tnum">{c.number}</span>}
                        </button>
                        {!compactCol && (
                          <button type="button" className={`icon-btn fav-btn${fav ? ' is-fav' : ''}`} aria-pressed={fav} aria-label={fav ? `Remove ${c.name} from favourites` : `Add ${c.name} to favourites`} onClick={() => store.toggleFavourite(channelRef(c.id))}>
                            <Icon name="heart" size={14} />
                          </button>
                        )}
                      </div>
                      <div className="guide-track">
                        {programmes.length === 0 ? (
                          <>
                            <div
                              className="prog prog-gap prog-gap-full"
                              style={{ left: 0, width: Math.max(0, x(dayEnd)) }}
                              aria-hidden="true"
                            />
                            <span className="guide-noinfo faint">
                              <span>{c.sourceId === null ? 'No guide information' : noListingsText(store.guideMatch(c), !store.guideDayLoaded(dayStart))}</span>
                              {c.sourceId !== null && store.guides.some((g) => g.summary) && ['unmatched', 'no-id', 'match-lost'].includes(store.guideMatch(c)?.state ?? '') && (
                                <button type="button" className="text-link guide-match-btn" onClick={() => setMatchingChannel(c)} aria-label={`Match ${c.name} to an XMLTV guide`}>
                                  Match guide
                                </button>
                              )}
                            </span>
                          </>
                        ) : (
                          (() => {
                            const elements: React.ReactNode[] = []
                            let cursor = dayStart
                            for (const p of programmes) {
                              if (p.stop <= dayStart || p.start >= dayEnd) continue
                              const effStart = Math.max(p.start, dayStart)
                              const effStop = Math.min(p.stop, dayEnd)
                              if (effStart > cursor + 2 * MIN) {
                                const gapLeft = x(cursor)
                                const gapW = x(effStart) - gapLeft
                                elements.push(
                                  <div
                                    key={`gap-${c.id}-${cursor}`}
                                    className="prog prog-gap"
                                    style={{ left: gapLeft, width: Math.max(0, gapW) }}
                                    aria-hidden="true"
                                  >
                                    {gapW >= 70 && (
                                      <span className="prog-label">
                                        <span className="prog-title prog-gap-title">No listings</span>
                                      </span>
                                    )}
                                  </div>
                                )
                              }
                              const onNow = p.start <= now && now < p.stop
                              const past = p.stop <= now
                              const left = x(effStart)
                              const w = x(effStop) - left
                              const progRec = store.getRecordingForProgramme(p.id, c.id, p.start)
                              const genreClass = getProgrammeGenreClass(p.category)
                              const genreMatches = epgGenre === 'All' ? false : (
                                (epgGenre === 'Movies' && genreClass === 'prog-genre-movie') ||
                                (epgGenre === 'Sports' && genreClass === 'prog-genre-sport') ||
                                (epgGenre === 'News' && genreClass === 'prog-genre-news') ||
                                (epgGenre === 'Series' && genreClass === 'prog-genre-series') ||
                                (epgGenre === 'Kids' && genreClass === 'prog-genre-kids') ||
                                (epgGenre === 'Documentary' && genreClass === 'prog-genre-doc')
                              )
                              const isDimmed = epgGenre !== 'All' && !genreMatches
                              elements.push(
                                <button
                                  key={p.id}
                                  type="button"
                                  role="gridcell"
                                  data-pid={p.id}
                                  tabIndex={p.id === effectiveFocus ? 0 : -1}
                                  aria-selected={selected?.id === p.id}
                                  className={`prog${onNow ? ' is-now' : ''}${onNow && isPlaying ? ' is-playing' : ''}${past ? ' is-past' : ''}${selected?.id === p.id ? ' is-selected' : ''}${genreClass ? ` ${genreClass}` : ''}${genreMatches ? ' is-genre-matched' : ''}${isDimmed ? ' is-genre-dimmed' : ''}`}
                                  style={{ left, width: Math.max(0, w) }}
                                  onClick={() => select(p)}
                                  onFocus={() => setFocusId(p.id)}
                                  title={`${p.title} (${clock(p.start, prefs.timeFormat)} - ${clock(p.stop, prefs.timeFormat)})`}
                                  aria-label={`${p.title}, ${c.name}, ${clock(p.start, prefs.timeFormat)} to ${clock(p.stop, prefs.timeFormat)}${onNow ? ', on now' : ''}`}
                                >
                                  <span className="prog-label">
                                    <span className="prog-title">
                                      {onNow && isPlaying && <Icon name="play" size={10} className="prog-playing" />}
                                      {onNow && (w >= 100 || p.title.toLowerCase().includes('live')) && (
                                        <span className="badge-live" style={{ fontSize: '0.625rem', padding: '1px 5px', marginRight: 5, verticalAlign: 'middle' }}>LIVE</span>
                                      )}
                                      {past && c.tvArchive === 1 && (
                                        <span
                                          title="Catch-up available"
                                          style={{ color: 'var(--accent)', marginRight: 4, display: 'inline-flex', alignItems: 'center' }}
                                        >
                                          <Icon name="history" size={10} />
                                        </span>
                                      )}
                                      {progRec?.status === 'recording' && (
                                        <span
                                          title="Recording in progress"
                                          style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', display: 'inline-block', marginRight: 5 }}
                                        />
                                      )}
                                      {p.title}
                                    </span>
                                    {w >= 70 && <span className="prog-time tnum">{w >= 120 ? `${clock(p.start, prefs.timeFormat)} - ${clock(p.stop, prefs.timeFormat)}` : clock(p.start, prefs.timeFormat)}</span>}
                                  </span>
                                  {progRec?.status === 'scheduled' && <Icon name="record" size={13} className="prog-bell" />}
                                  {progRec?.status === 'completed' && <Icon name="checkCircle" size={13} className="prog-bell" />}
                                  {library.reminders.includes(p.id) && <Icon name="bell" size={13} className="prog-bell" />}
                                </button>
                              )
                              cursor = Math.max(cursor, effStop)
                            }
                            if (cursor < dayEnd - 2 * MIN) {
                              const gapLeft = x(cursor)
                              const gapW = x(dayEnd) - gapLeft
                              elements.push(
                                <div
                                  key={`gap-${c.id}-${cursor}`}
                                  className="prog prog-gap"
                                  style={{ left: gapLeft, width: Math.max(0, gapW) }}
                                  aria-hidden="true"
                                >
                                  {gapW >= 70 && (
                                    <span className="prog-label">
                                      <span className="prog-title prog-gap-title">No listings</span>
                                    </span>
                                  )}
                                </div>
                              )
                            }
                            return elements
                          })()
                        )}
                      </div>
                    </div>
                  )
                })}
                {showNow && <div className="now-line" style={{ left: colW + x(now) }} aria-hidden="true" />}
              </div>
            </div>
            {showMore}
            <p className="guide-hint faint">
              {channelMode === 'demo'
                ? 'Arrow keys move through the guide, Enter opens a programme, Page Up and Page Down change channel. Sample mode: channels and schedule are fictional.'
                : store.guides.length > 0
                  ? 'Channels come from your imported playlists and programmes from your XMLTV guides, shown in your local time. Whether a stream plays depends on its host. Arrow keys move through the guide; Page Up and Page Down change channel.'
                  : 'Channels come from your imported playlists. Add an XMLTV guide in Sources to see their programmes. Whether a stream plays depends on its host. Page Up and Page Down change channel.'}
            </p>
          </section>
        )}

        {playing && playerOpen && (
          <aside className="mini-player" aria-label="Player">
            <LivePlayer channel={playing} programme={current} now={now} onStep={step} onClose={() => setPlayerOpen(false)} onStatus={setPlayerStatus} />
          </aside>
        )}

        {playing && (
          <button type="button" className="now-playing" aria-expanded={playerOpen} onClick={() => setPlayerOpen(!playerOpen)}>
            <span className="np-dot" aria-hidden="true" />
            {reallyPlaying ? 'Now Playing' : playerOpen ? 'Opening' : 'Selected'}: {playing.name}{current ? ` - ${current.title}` : ''}
          </button>
        )}

        <Dialog open={!!selected} onClose={() => setSelected(null)} title="Programme" variant="sheet">
          {panel}
        </Dialog>

        <Dialog open={!!matchingChannel} onClose={() => setMatchingChannel(null)} title={matchingChannel ? `Match ${matchingChannel.name} to a guide` : 'Match guide'}>
          {matchingChannel && <LiveMatchGuideDialog channel={matchingChannel} onClose={() => setMatchingChannel(null)} />}
        </Dialog>

        {contextChannel && (
          <MediaContextMenu
            isOpen={Boolean(contextChannel)}
            position={{ x: contextChannel.x, y: contextChannel.y }}
            onClose={() => setContextChannel(null)}
            itemRef={channelRef(contextChannel.channel.id)}
            title={contextChannel.channel.name}
            kind="channel"
            playUrl={`/watch/${encodeURIComponent(channelRef(contextChannel.channel.id))}`}
            onPlayAction={() => { tune(contextChannel.channel); setContextChannel(null) }}
          />
        )}

        {/* Time Jump Dialog */}
        <Dialog open={timeJumpOpen} onClose={() => setTimeJumpOpen(false)} title="Jump Timeline to Time">
          <div className="time-jump-dialog">
            <p className="faint" style={{ margin: 0, fontSize: '0.8125rem' }}>
              Select a schedule milestone or specify an exact hour to navigate the timeline without dragging.
            </p>
            <div className="time-jump-presets-grid">
              <button
                type="button"
                className="time-jump-preset-btn"
                onClick={() => {
                  jumpToNow()
                  setTimeJumpOpen(false)
                }}
              >
                <span className="time-jump-preset-title">Now</span>
                <span className="time-jump-preset-time">{clock(now, prefs.timeFormat)}</span>
              </button>
              {TIME_PRESETS.map((p) => {
                const targetTime = dayStart + p.hour * 60 * MIN
                return (
                  <button
                    key={p.label}
                    type="button"
                    className="time-jump-preset-btn"
                    onClick={() => {
                      scrollToTime(targetTime, true)
                      setTimeJumpOpen(false)
                      toast(`Jumped to ${p.label} (${clock(targetTime, prefs.timeFormat)})`)
                    }}
                  >
                    <span className="time-jump-preset-title">{p.label}</span>
                    <span className="time-jump-preset-time">{p.time}</span>
                  </button>
                )
              })}
            </div>
            <div className="time-jump-custom">
              <label htmlFor="custom-jump-hour" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Custom Hour:</label>
              <select
                id="custom-jump-hour"
                value={customJumpHour}
                onChange={(e) => setCustomJumpHour(Number(e.target.value))}
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-primary btn-small"
                onClick={() => {
                  const targetTime = dayStart + customJumpHour * 60 * MIN
                  scrollToTime(targetTime, true)
                  setTimeJumpOpen(false)
                  toast(`Jumped to ${String(customJumpHour).padStart(2, '0')}:00`)
                }}
              >
                Jump
              </button>
            </div>
          </div>
        </Dialog>

        {/* In-EPG Schedule Search Dialog */}
        <Dialog open={epgSearchOpen} onClose={() => { setEpgSearchOpen(false); setEpgSearchQuery('') }} title="Search Today's Schedule">
          <div className="epg-search-dialog">
            <div className="epg-search-input-wrap">
              <Icon name="search" size={16} />
              <input
                type="search"
                className="epg-search-input"
                placeholder="Search programme titles, categories or descriptions..."
                value={epgSearchQuery}
                onChange={(e) => setEpgSearchQuery(e.target.value)}
                autoFocus
              />
              {epgSearchQuery && (
                <button type="button" className="icon-btn" onClick={() => setEpgSearchQuery('')} aria-label="Clear search">
                  <Icon name="close" size={14} />
                </button>
              )}
            </div>

            <div className="epg-search-results">
              {epgSearchQuery.trim().length >= 2 ? (
                scheduleSearchResults.length > 0 ? (
                  scheduleSearchResults.map(({ programme: p, channel: c }) => (
                    <button
                      key={`${c.id}-${p.id}`}
                      type="button"
                      className="epg-search-item"
                      onClick={() => {
                        const channelIndex = visible.findIndex((item) => item.id === c.id)
                        if (channelIndex >= shownCount) {
                          setPaged({ key: pageKey, count: Math.ceil((channelIndex + 1) / pageSize) * pageSize })
                        }
                        select(p)
                        window.setTimeout(() => {
                          scrollToTime(p.start, true)
                          const row = document.getElementById(`guide-row-${c.id}`)
                          row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
                        }, 50)
                        setEpgSearchOpen(false)
                        setEpgSearchQuery('')
                        toast(`Jumped to ${p.title} on ${c.name}`)
                      }}
                    >
                      <span className="epg-search-time tnum">{clock(p.start, prefs.timeFormat)}</span>
                      <span className="epg-search-info">
                        <strong className="epg-search-title">{p.title}</strong>
                        <span className="epg-search-channel">{c.name} · {p.category || 'General'}</span>
                      </span>
                      <Icon name="right" size={14} />
                    </button>
                  ))
                ) : (
                  <p className="faint" style={{ textAlign: 'center', padding: '24px 0', fontSize: '0.875rem' }}>
                    No programmes found matching "{epgSearchQuery}".
                  </p>
                )
              ) : (
                <p className="faint" style={{ textAlign: 'center', padding: '24px 0', fontSize: '0.875rem' }}>
                  Type at least 2 characters to search across today's schedule.
                </p>
              )}
            </div>
          </div>
        </Dialog>
      </div>
    </>
  )
}

function LivePlayer({ channel, programme, now, onStep, onClose, onStatus }: {
  channel: Channel; programme?: Programme; now: number; onStep: (dir: number) => void; onClose: () => void; onStatus: (s: PlaybackStatus) => void
}) {
  const store = useStore()
  const { prefs } = store
  const video = useRef<HTMLVideoElement>(null)
  const options = channel.streamOptions?.length
    ? channel.streamOptions
    : channel.sourceId
      ? [{
          id: channel.id,
          channelId: channel.id,
          sourceId: channel.sourceId,
          sourceName: store.playlists.find((s) => s.id === channel.sourceId)?.name ?? 'Source',
          name: store.playlists.find((s) => s.id === channel.sourceId)?.name ?? 'Source',
          streamUrl: channel.streamUrl,
        }]
      : []
  const preferredOption = store.getPreferredServer(channel)
  const defaultOptionId = preferredOption?.id ?? options.find((option) => option.sourceId === channel.sourceId)?.id ?? options[0]?.id ?? ''
  const [selection, setSelection] = useState({ channelId: channel.id, optionId: defaultOptionId })
  const optionId = selection.channelId === channel.id && options.some((o) => o.id === selection.optionId)
    ? selection.optionId
    : defaultOptionId
  const chosen = options.find((option) => option.id === optionId) ?? options[0]
  const playback = useStreamPlayback(chosen?.streamUrl ?? null, video)
  const status = playback.state.status
  useEffect(() => {
    onStatus(status)
    return () => onStatus('idle')
  }, [status, onStatus])
  const noAddress = channel.sourceId && chosen?.streamUrl === null
    ? unavailableReason(store.playlists.find((s) => s.id === chosen.sourceId)) ?? 'This channel cannot play yet.'
    : null
  return (
    <div className="live-player force-dark">
      {(programme?.art || programme?.icon) && <ProgrammeArt key={programme?.id ?? programme?.art} programme={programme} alt="" eager />}
      {channel.sourceId && <video ref={video} className="live-player-video" playsInline aria-label={`${channel.name} video`} />}
      <div className="live-player-shade" />
      <div className="live-player-bug">
        <ChannelMark channel={channel} size={30} />
        <span>
          <strong>{channel.number} {channel.name}</strong>
          <span className="faint">{categoryLabel(channel)}{channel.hd ? ' · HD' : ''}</span>
        </span>
      </div>
      {status !== 'playing' && (
        <div className="live-player-status" role="status">
          <Icon name="sources" size={18} />
          {channel.sourceId
            ? <span>{noAddress ?? playbackText(playback.state)}{playback.state.canRetry && <>{' '}<button type="button" className="text-link" onClick={playback.retry}>Retry</button></>}</span>
            : <span>No stream connected: sample channel. <Link to="/sources" className="text-link">Add a source</Link></span>}
        </div>
      )}
      <div className="live-player-bar">
        {programme && (
          <div className="live-player-now">
            {status === 'playing' && <span className="live-dot">Live</span>}
            <span className="tnum faint">{clock(programme.start, prefs.timeFormat)} - {clock(programme.stop, prefs.timeFormat)}</span>
            <ProgressBar value={(now - programme.start) / (programme.stop - programme.start)} label="Programme progress" />
          </div>
        )}
        <div className="live-player-controls">
          {options.length > 1 && (
            <label className="live-source-choice">
              <span className="sr-only">Stream source</span>
              <select
                value={chosen?.id ?? ''}
                onChange={(event) => {
                  setSelection({ channelId: channel.id, optionId: event.target.value })
                  store.setPreferredServer(channel.id, event.target.value)
                }}
                aria-label="Stream source"
              >
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name || option.sourceName}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="button" className="icon-btn" onClick={() => onStep(-1)} aria-label="Previous channel"><Icon name="up" /></button>
          <button type="button" className="icon-btn" onClick={() => onStep(1)} aria-label="Next channel"><Icon name="down" /></button>
          <Link to={`/watch/${encodeURIComponent(channelRef(channel.id))}`} className="icon-btn" aria-label="Open full-screen player"><Icon name="fullscreen" /></Link>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close player"><Icon name="close" /></button>
        </div>
      </div>
    </div>
  )
}

function ProgrammePanel({ programme: p, channel, now, isPlayingChannel, isSelection, onTune, onClear, onSelect }: {
  programme: Programme; channel?: Channel; now: number; isPlayingChannel: boolean; isSelection: boolean
  onTune: (c: Channel) => void; onClear: () => void; onSelect: (p: Programme) => void
}) {
  const store = useStore()
  const toast = useToast()
  const { prefs } = store
  const onNow = p.start <= now && now < p.stop
  const ended = p.stop <= now
  const reminded = store.library.reminders.includes(p.id)
  const isFav = channel ? store.library.favourites.includes(channelRef(channel.id)) : false
  const mins = Math.round((p.stop - p.start) / MIN)
  const existingRec = store.getRecordingForProgramme(p.id, channel?.id, p.start)
  const existingRule = store.seriesRules.find((r) => r.title.toLowerCase() === p.title.toLowerCase() && r.isActive)
  const archiveWindowMs = (channel?.tvArchiveDuration || 7) * 86400 * 1000
  const canCatchup = Boolean(ended && channel?.tvArchive === 1 && channel.sourceId && channel.xtreamStreamId && (now - p.start) <= archiveWindowMs)

  const rating = useMemo(() => {
    const matchM = movies.find((m) => m.title.toLowerCase() === p.title.toLowerCase())
    if (matchM?.certificate) return matchM.certificate
    const matchS = series.find((s) => s.title.toLowerCase() === p.title.toLowerCase())
    if (matchS?.certificate) return matchS.certificate
    const cat = (p.category || channel?.group || '').toLowerCase()
    if (cat.includes('kids') || cat.includes('animation') || cat.includes('family')) return 'U'
    if (cat.includes('horror') || cat.includes('crime') || cat.includes('adult')) return '18'
    if (cat.includes('action') || cat.includes('thriller')) return '15'
    return '12'
  }, [p.title, p.category, channel?.group])

  const is4K = Boolean(channel?.name.includes('4K') || channel?.name.includes('UHD') || p.title.includes('4K'))
  const isHD = Boolean(!is4K && (channel?.name.includes('HD') || p.title.includes('HD') || true))

  return (
    <div className="panel-inner">
      <div className="panel-head">
        <span className="label">Selected programme</span>
        {isSelection && <button type="button" className="text-link" onClick={onClear}>Back to now watching</button>}
      </div>

      {prefs.guideArt && (
        <div className="panel-art-frame">
          <ProgrammeArt programme={p} channel={channel} className="panel-art" />
        </div>
      )}

      {channel && (
        <p className="panel-channel">
          <ChannelMark channel={channel} size={28} />
          <span>{channel.number} {channel.name}</span>
        </p>
      )}

      <h2 className="panel-title">{p.title}</h2>
      {p.subtitle && <p className="panel-subtitle">{p.subtitle}</p>}

      <div className="panel-badges">
        <AgeRatingBadge rating={rating} />
        {onNow && <TechnicalBadge format="Live" compact />}
        {is4K ? <TechnicalBadge format="4K" compact /> : isHD ? <TechnicalBadge format="HD" compact /> : null}
        {(canCatchup || channel?.tvArchive === 1) && <TechnicalBadge format="Catch-up" compact />}
      </div>

      <div className="meta">
        <span className="panel-time-pill tnum">
          <Icon name="clock" size={13} />
          {dayLabel(p.start, now)}, {clock(p.start, prefs.timeFormat)} to {clock(p.stop, prefs.timeFormat)}
        </span>
        <span>{mins} min</span>
        {p.category && <span>{p.category}</span>}
        {p.episode && <span>{p.episode}</span>}
      </div>

      {p.stopEstimated && <p className="faint">The guide gives no end time; this is when the next programme starts.</p>}
      {onNow && <ProgressBar value={(now - p.start) / (p.stop - p.start)} label="Programme progress" />}
      {p.desc && <p className="panel-desc">{p.desc}</p>}

      {channel?.streamOptions && channel.streamOptions.length > 1 && (
        <div className="panel-servers-section">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <Icon name="sources" size={14} />
            <span>Available Stream Servers ({channel.streamOptions.length})</span>
          </div>
          <div className="panel-servers-list">
            {channel.streamOptions.map((opt) => {
              const preferred = store.getPreferredServer(channel)?.id === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={`panel-server-btn${preferred ? ' is-preferred' : ''}`}
                  onClick={() => {
                    store.setPreferredServer(channel.id, opt.id)
                    toast(`Preferred server set to ${opt.name || opt.sourceName}`)
                  }}
                >
                  <div className="panel-server-info">
                    <strong>{opt.name || opt.sourceName}</strong>
                    <span className="panel-server-meta">{opt.format ? opt.format.toUpperCase() : 'HLS Direct'}</span>
                  </div>
                  <span className="panel-server-badge">
                    {preferred ? 'Active' : opt.quality || opt.format?.toUpperCase() || 'HLS'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="panel-actions">
        {onNow && channel && !isPlayingChannel && (
          <button type="button" className="btn btn-primary" onClick={() => onTune(channel)}>
            <Icon name="play" size={18} />Watch {channel.name}
          </button>
        )}
        {onNow && isPlayingChannel && channel && (
          <Link to={`/watch/${encodeURIComponent(channelRef(channel.id))}`} className="btn btn-primary">
            <Icon name="play" size={16} />Open player
          </Link>
        )}
        {existingRec?.status === 'completed' && (
          <Link to={`/watch/${encodeURIComponent(recordingRef(existingRec.id))}`} className="btn btn-primary">
            <Icon name="play" size={16} />Watch Recording
          </Link>
        )}
        {ended && (
          canCatchup && channel ? (
            <Link
              to={`/watch/${encodeURIComponent(catchupRef(channel.sourceId!, channel.xtreamStreamId!, Math.floor(p.start / 1000), Math.max(1, mins)))}`}
              className="btn btn-primary"
            >
              <Icon name="play" size={16} />Watch on Catch-up
            </Link>
          ) : (
            <span className="faint">Catch-up unavailable for this broadcast</span>
          )
        )}
        {onNow && channel && (
          existingRec?.status === 'recording' ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={async () => {
                await store.stopRecording(existingRec.id)
                toast(`Stopped recording "${p.title}"`)
              }}
            >
              <Icon name="close" size={16} />Stop Recording
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={async () => {
                await store.startRecording(channel.id, channel.name, p.title, {
                  channelLogo: channel.logoUrl,
                  programmeId: p.id,
                  description: p.desc,
                  durationSecs: Math.max(60, Math.round((p.stop - now) / 1000)),
                })
                toast(`Recording "${p.title}" on ${channel.name}`)
              }}
            >
              <Icon name="record" size={16} />Record Now
            </button>
          )
        )}
        {!onNow && !ended && channel && (
          existingRec?.status === 'scheduled' ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={async () => {
                await store.cancelRecording(existingRec.id)
                toast(`Cancelled scheduled recording for "${p.title}"`)
              }}
            >
              <Icon name="close" size={16} />Cancel Recording
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={async () => {
                await store.scheduleRecording(
                  channel.id,
                  channel.name,
                  p.title,
                  Math.floor(p.start / 1000),
                  Math.floor(p.stop / 1000),
                  {
                    channelLogo: channel.logoUrl,
                    programmeId: p.id,
                    description: p.desc,
                  },
                )
                toast(`Scheduled recording for "${p.title}"`)
              }}
            >
              <Icon name="record" size={16} />Schedule Recording
            </button>
          )
        )}
        {!ended && channel && (
          <button
            type="button"
            className="btn btn-ghost"
            aria-pressed={Boolean(existingRule)}
            onClick={async () => {
              if (existingRule) {
                await store.deleteSeriesRule(existingRule.id)
                toast(`Removed series rule for "${p.title}"`)
              } else {
                const nowSecs = Math.floor(Date.now() / 1000)
                await store.saveSeriesRule({
                  id: `rule_${nowSecs}_${Math.random().toString(16).slice(2, 7)}`,
                  title: p.title,
                  channelId: channel.id,
                  recordType: 'all_episodes',
                  paddingStartMins: store.dvrConfig?.defaultPaddingStartMins ?? 2,
                  paddingEndMins: store.dvrConfig?.defaultPaddingEndMins ?? 5,
                  retentionDays: store.dvrConfig?.retentionDays ?? 30,
                  keepMaxEpisodes: null,
                  isActive: true,
                  createdAt: nowSecs,
                })
                toast(`Created series recording rule for "${p.title}"`)
              }
            }}
          >
            <Icon name={existingRule ? 'check' : 'plus'} size={16} />
            {existingRule ? 'Series Rule Active' : 'Record Series'}
          </button>
        )}
        {!onNow && !ended && (
          <button
            type="button"
            className="btn btn-ghost"
            aria-pressed={reminded}
            onClick={() => {
              store.toggleReminder(p.id)
              toast(reminded ? 'Reminder removed' : `Reminder saved for ${p.title}. Alerts arrive with the playback service.`)
            }}
          >
            <Icon name={reminded ? 'check' : 'bell'} size={18} />
            {reminded ? 'Reminder set' : 'Remind me'}
          </button>
        )}
        {channel && (
          <button
            type="button"
            className="btn btn-ghost"
            aria-pressed={isFav}
            onClick={() => {
              store.toggleFavourite(channelRef(channel.id))
              toast(isFav ? `Removed ${channel.name} from favourites` : `Added ${channel.name} to favourites`)
            }}
          >
            <Icon name={isFav ? 'check' : 'heart'} size={16} />
            {isFav ? 'Favourited' : 'Add Favourite'}
          </button>
        )}
      </div>

      {channel && (
        <div className="later">
          <h3 className="label">Later on {channel.name}</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 4 }}>
            {[...store.schedule(channel, startOfDay(now)), ...store.schedule(channel, addDays(startOfDay(now), 1))]
              .filter((x, i, all) => x.start >= p.stop && all.findIndex((y) => y.id === x.id) === i)
              .slice(0, 4)
              .map((x) => (
                <li key={x.id}>
                  <button type="button" className="panel-upcoming-item" onClick={() => onSelect(x)}>
                    <span className="tnum faint">{clock(x.start, prefs.timeFormat)}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.title}</span>
                    {store.library.reminders.includes(x.id) ? <Icon name="bell" size={14} /> : <span />}
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function LiveMatchGuideDialog({ channel, onClose }: { channel: Channel; onClose: () => void }) {
  const store = useStore()
  const toast = useToast()
  const availableGuides = store.guides.filter((g) => g.summary)
  const [guideId, setGuideId] = useState(() => availableGuides[0]?.id ?? '')
  const [list, setList] = useState<GuideChannel[] | null>(null)
  const [query, setQuery] = useState('')
  const selectedGuide = availableGuides.find((g) => g.id === guideId) ?? availableGuides[0]

  useEffect(() => {
    if (!selectedGuide) return
    let live = true
    setList(null)
    guideChannels(selectedGuide.id).then((l) => { if (live) setList(l) }, () => { if (live) setList([]) })
    return () => { live = false }
  }, [selectedGuide?.id])

  if (!selectedGuide) {
    return <p className="faint">No loaded XMLTV guides are available to match against yet.</p>
  }

  const q = query.trim().toLowerCase()
  const results = (list ?? []).filter((c) => !q || c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)).slice(0, 16)

  return (
    <div className="live-match-dialog">
      <p className="faint">
        Choose an XMLTV guide and search by channel name or XMLTV ID to map <strong>{channel.name}</strong>{channel.tvgId ? ` (${channel.tvgId})` : ''}.
      </p>
      {availableGuides.length > 1 && (
        <label className="field">
          <span>XMLTV guide</span>
          <select className="input" value={selectedGuide.id} onChange={(e) => setGuideId(e.target.value)}>
            {availableGuides.map((g) => (
              <option key={g.id} value={g.id}>{g.name} ({g.summary?.channels ?? 0} channels)</option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        <span>Search {selectedGuide.name}</span>
        <input
          className="input"
          value={query}
          placeholder="Channel name or XMLTV id"
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </label>
      {list === null ? (
        <p className="faint" role="status">Loading guide channels…</p>
      ) : results.length === 0 ? (
        <p className="faint">No guide channel matches that search.</p>
      ) : (
        <ul className="live-match-results">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => {
                  store.setMapping(channel.id, selectedGuide.id, r.id)
                  toast(`Matched ${channel.name} to ${r.name} (${r.id})`)
                  onClose()
                }}
              >
                <strong>{r.name}</strong>
                <span className="faint"> · {r.id}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
