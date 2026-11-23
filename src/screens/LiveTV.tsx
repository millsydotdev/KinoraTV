import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CHANNEL_GROUPS, GUIDE_DAYS, MIN, addDays, startOfDay } from '../data/channels'
import { movies, series } from '../data/catalog'
import { catchupRef, channelRef, m3uCatchupRef, recordingRef } from '../data/refs'
import type { Channel, Programme } from '../data/types'
import { Dialog } from '../components/Dialog'
import { Icon } from '../components/Icon'
import { AgeRatingBadge } from '../components/AgeRatingBadge'
import { TechnicalBadge } from '../components/TechnicalBadges'
import { useToast } from '../components/Toast'
import { PageHeader } from '../components/PageHeader'
import { ChannelCard } from '../components/Tiles'
import { Art, ChannelMark, ProgressBar, ProgrammeArt, StateBlock } from '../components/ui'
import { filterKidSafeChannels, filterKidSafeProgrammes, isChannelKidSafe } from '../lib/kidsMode'
import { playbackText, type PlaybackStatus } from '../lib/playback'
import { useUniversalPlayback } from '../state/playbackContext'
import { clock, dayLabel, useNow } from '../lib/time'
import { noListingsText } from '../state/guides'
import { categoryLabel, channelGroups, inCategory, unavailableReason, cleanChannelTitle, parseChannelMetadata } from '../state/playlists'
import { LIVE_TV_CATEGORIES, classifyChannelCategory, extractChannelLocation, getCategoryIcon } from '../data/channelCategories'
import { BouquetManagerModal } from '../components/BouquetManagerModal'
import { CategoryDrawer } from '../components/CategoryDrawer'
import { LiveMosaicGrid } from '../components/LiveMosaicGrid'
import { CatchupBrowserModal } from '../components/CatchupBrowserModal'
import { EpgStatusModal } from '../components/EpgStatusModal'
import { EpgMappingModal } from '../components/EpgMappingModal'
import { loadBouquetConfig, applyCategoryPreferences, type BouquetConfig } from '../lib/bouquetManager'
import { useProfiles } from '../state/profiles'
import { useStore } from '../state/store'
import { MediaContextMenu } from '../components/MediaContextMenu'
import { ShareModal, type ShareItem } from '../components/ShareModal'
import { NumericZapHUD } from '../components/NumericZapHUD'
import { playChannelSwitchSound, playFavoriteSound } from '../lib/soundEffects'
import { sortChannels, SORT_MODE_LABELS, type ChannelSortMode } from '../lib/channelSorting'
import './LiveTV.css'

// Guide row height per density setting (px), mirrored by --guide-row in global.css.
const ROW_H = { compact: 52, comfortable: 64, spacious: 76 } as const
// Rows and cards rendered per page. Unbounded, 10,000 channels took seconds per render and per
// scrolled frame (D8 measurements); a virtualised guide would lift this limit.
const GUIDE_PAGE = 100
const CARD_PAGE = 120


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

function GuidePreviewPlayer({
  channel,
  onInfo,
  onTune,
}: {
  channel: Channel
  onInfo: () => void
  onTune: () => void
}) {
  const { activeStream, togglePlay, toggleMute, setVolume, muted, volume, playbackState } = useUniversalPlayback()
  const hasActivePrimary = activeStream !== null
  const isPlayingThisChannel = activeStream?.channel?.id === channel.id || activeStream?.ref === channelRef(channel.id)
  const isPlaying = isPlayingThisChannel && playbackState.status === 'playing'

  const playback = {
    togglePlay: isPlayingThisChannel ? togglePlay : onTune,
    toggleMute,
    setVolume,
    muted,
    volume,
  }

  return (
    <div className="tvguide-player-card">
      <div className="tvguide-player-media-wrap">
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0d1117', gap: 12, padding: 16, textAlign: 'center' }}>
          <ChannelMark channel={channel} size={56} />
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text, #ffffff)' }}>
            {channel.number} {channel.name}
          </div>
          {isPlayingThisChannel ? (
            <div style={{ fontSize: '0.8125rem', color: 'var(--accent, #3b82f6)' }}>
              Currently playing in primary player
            </div>
          ) : hasActivePrimary ? (
            <div style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.6)' }}>
              Preview paused: primary playback active on {activeStream.title}
            </div>
          ) : !channel.streamUrl ? (
            <div style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.6)' }}>
              No direct stream address configured for this channel
            </div>
          ) : (
            <div style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.6)' }}>
              Ready to watch
            </div>
          )}
        </div>
      </div>

      <div className="tvguide-player-scrim" />
      <div className="tvguide-player-top-badge">
        <span className="tvguide-live-pill">LIVE</span>
        <span>{channel.name}{channel.number ? ` Ch ${channel.number}` : ''}</span>
      </div>

      <div className="tvguide-player-controls-bar">
        <div className="tvguide-player-ctrl-group">
          {channel.streamUrl ? (
            <button
              type="button"
              className="tvguide-ctrl-icon-btn"
              onClick={playback.togglePlay}
              aria-label={isPlaying ? 'Pause live stream' : 'Play live stream'}
            >
              <Icon name={isPlaying ? 'pause' : 'play'} size={16} />
            </button>
          ) : (
            <button
              type="button"
              className="tvguide-ctrl-icon-btn"
              onClick={onTune}
              aria-label="Tune to channel"
            >
              <Icon name="play" size={16} />
            </button>
          )}
          <button
            type="button"
            className="tvguide-ctrl-icon-btn"
            onClick={playback.toggleMute}
            aria-label={playback.muted ? 'Unmute' : 'Mute'}
          >
            <Icon name={playback.muted ? 'mute' : 'volume'} size={16} />
          </button>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(playback.volume * 100)}
            onChange={(e) => playback.setVolume(Number(e.target.value) / 100)}
            onInput={(e) => playback.setVolume(Number((e.target as HTMLInputElement).value) / 100)}
            className="tvguide-volume-slider"
            aria-label="Volume"
          />
        </div>
        <div className="tvguide-player-ctrl-group">
          <button
            type="button"
            className="tvguide-ctrl-icon-btn"
            onClick={onInfo}
            aria-label="Show programme information"
          >
            <Icon name="info" size={16} />
          </button>
          <Link
            to={`/watch/${encodeURIComponent(channelRef(channel.id))}`}
            className="tvguide-ctrl-icon-btn"
            aria-label="Fullscreen player"
          >
            <Icon name="fullscreen" size={16} />
          </Link>
        </div>
      </div>
    </div>
  )
}

export function LiveTV() {
  const now = useNow(15_000)
  const store = useStore()
  const { isKidsMode, activeProfile } = useProfiles()
  const profileId = activeProfile?.id ?? 'default'
  const [bouquetConfig, setBouquetConfig] = useState<BouquetConfig>(() => loadBouquetConfig(profileId))
  const [bouquetModalOpen, setBouquetModalOpen] = useState(false)
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false)
  const [mosaicOpen, setMosaicOpen] = useState(false)
  const [catchupModalOpen, setCatchupModalOpen] = useState(false)
  const [epgStatusOpen, setEpgStatusOpen] = useState(false)

  useEffect(() => {
    setBouquetConfig(loadBouquetConfig(profileId))
  }, [profileId])

  const refreshBouquetConfig = () => {
    setBouquetConfig(loadBouquetConfig(profileId))
  }
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
  const [sortMode, setSortMode] = useState<ChannelSortMode>('default')
  const [shareItem, setShareItem] = useState<ShareItem | null>(null)
  const [previewExpanded, setPreviewExpanded] = useState(false)

  const favIds = library.favourites.filter((r) => r.startsWith('channel:')).map((r) => r.slice(8))
  const recentChannelIds = useMemo(
    () => library.history.filter((r) => r.ref.startsWith('channel:')).map((r) => r.ref.slice(8)),
    [library.history],
  )

  const hiddenItems = userPreferences?.preferences.hiddenItems ?? []
  const notHidden = useMemo(
    () => channels.filter((c) => !hiddenItems.includes(channelRef(c.id))),
    [channels, hiddenItems],
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


  const activeCategories = useMemo(() => {
    const base = groupingMode === 'canonical' ? canonicalCategories : providerCategories
    return applyCategoryPreferences(base, bouquetConfig)
  }, [groupingMode, canonicalCategories, providerCategories, bouquetConfig])

  const bouquetGroupIds = useMemo(() => bouquetConfig.bouquets.map((b) => `bouquet:${b.id}`), [bouquetConfig.bouquets])

  const allSelectableGroups = useMemo(
    () => Array.from(new Set(['All', 'Favourites', 'Recently Watched', 'Catch-up', 'Reminders', ...bouquetGroupIds, ...canonicalCategories, ...providerCategories])),
    [bouquetGroupIds, canonicalCategories, providerCategories],
  )
  const tabParam = params.get('tab')
  const requestedGroup = params.get('group') ?? (tabParam === 'catchup' ? 'Catch-up' : tabParam === 'reminders' ? 'Reminders' : null)
  const group = requestedGroup && allSelectableGroups.includes(requestedGroup) ? requestedGroup : 'All'
  const hasCatchupChannels = useMemo(() => notHidden.some((c) => (c.tvArchive && c.tvArchive > 0) || inCategory(c, 'Catch-up')), [notHidden])
  const hasReminders = (library.reminders ?? []).length > 0
  const groups = [
    'All',
    'Favourites',
    ...(recentChannelIds.length > 0 ? ['Recently Watched'] : []),
    ...(hasCatchupChannels || group === 'Catch-up' ? ['Catch-up'] : []),
    ...(hasReminders || group === 'Reminders' ? ['Reminders'] : []),
    ...bouquetGroupIds,
    ...activeCategories,
  ]
  const view = params.get('view') === 'channels' ? 'channels' : 'guide'
  const [dayOffset, setDayOffset] = useState(0)
  const [selected, setSelected] = useState<Programme | null>(null)
  const [matchingChannel, setMatchingChannel] = useState<Channel | null>(null)
  const [playerOpen, setPlayerOpen] = useState(() => !!params.get('channel') && !isPlayingBlocked)
  const [playerStatus, setPlayerStatus] = useState<PlaybackStatus>('idle')
  // "Watching" follows the media element's real state, never just the selection.
  const reallyPlaying = playerOpen && ['playing', 'buffering', 'paused'].includes(playerStatus)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [focusChannelId, setFocusChannelId] = useState<string | null>(null)

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

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>()
    counts.set('All', notHidden.length)
    counts.set('Favourites', favIds.filter((id) => notHidden.some((c) => c.id === id)).length)
    counts.set('Recently Watched', recentChannelIds.filter((id) => notHidden.some((c) => c.id === id)).length)
    counts.set('Catch-up', notHidden.filter((c) => (c.tvArchive && c.tvArchive > 0) || inCategory(c, 'Catch-up')).length)
    const reminderSet = new Set(library.reminders ?? [])
    counts.set('Reminders', reminderSet.size === 0 ? 0 : notHidden.filter((c) => store.schedule(c, now).some((p) => reminderSet.has(p.id))).length)

    for (const c of notHidden) {
      if (groupingMode === 'canonical') {
        const cat = classifyChannelCategory(c)
        counts.set(cat.category, (counts.get(cat.category) ?? 0) + 1)
      } else {
        const catList = c.categories && c.categories.length > 0 ? c.categories : c.group ? [c.group] : ['General']
        for (const g of catList) {
          counts.set(g, (counts.get(g) ?? 0) + 1)
        }
      }
    }
    return counts
  }, [notHidden, favIds, recentChannelIds, library.reminders, store, now, groupingMode])

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
    } else if (group === 'Catch-up') {
      list = notHidden.filter((c) => (c.tvArchive && c.tvArchive > 0) || inCategory(c, 'Catch-up'))
    } else if (group === 'Reminders') {
      const reminderSet = new Set(library.reminders ?? [])
      list = reminderSet.size === 0 ? [] : notHidden.filter((c) => {
        const sched = store.schedule(c, now)
        return sched.some((p) => reminderSet.has(p.id))
      })
    } else if (group.startsWith('bouquet:')) {
      const bqId = group.replace('bouquet:', '')
      const targetBouquet = bouquetConfig.bouquets.find((b) => b.id === bqId)
      if (targetBouquet) {
        const bqSet = new Set(targetBouquet.channelIds)
        list = notHidden.filter((c) => bqSet.has(c.id))
      } else {
        list = notHidden
      }
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
  }, [notHidden, group, favIds, recentChannelIds, countryFilter, sourceFilter, library.reminders, store, now])
  const filtered = filterQuery.trim()
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

  const visible = useMemo(() => {
    return sortChannels(filtered, sortMode, favIds)
  }, [filtered, sortMode, favIds])

  // How many of `visible` to render; back to one page whenever the view or category changes.
  const [paged, setPaged] = useState({ key: '', count: 0 })
  const pageKey = `${view}:${group}:${countryFilter}:${sourceFilter}:${sortMode}`
  const pageSize = view === 'guide' ? GUIDE_PAGE : CARD_PAGE
  const shownCount = paged.key === pageKey ? paged.count : pageSize
  const shown = visible.slice(0, shownCount)
  const more = visible.length - shown.length
  // Local midnights, so a day with a clock change is 23 or 25 hours long.
  const dayStart = addDays(startOfDay(now), dayOffset)
  const dayEnd = addDays(dayStart, 1)
  useEffect(() => requestGuideDay(dayStart), [requestGuideDay, dayStart])

  const scheduleSearchResults = useMemo(() => {
    if (!epgSearchQuery.trim() || epgSearchQuery.length < 2) return []
    const q = epgSearchQuery.toLowerCase()
    const results: { programme: Programme; channel: Channel }[] = []
    const searchPool = visible.slice(0, 300)
    for (const c of searchPool) {
      const progs = filterKidSafeProgrammes(store.schedule(c, dayStart), isKidsMode)
      for (const p of progs) {
        if (
          p.title.toLowerCase().includes(q) ||
          (p.desc && p.desc.toLowerCase().includes(q)) ||
          (p.category && p.category.toLowerCase().includes(q))
        ) {
          results.push({ programme: p, channel: c })
          if (results.length >= 50) break
        }
      }
      if (results.length >= 50) break
    }
    return results
  }, [visible, epgSearchQuery, store, dayStart, isKidsMode])

  // Geometry: the visible window shows `guideZoom` hours across whatever width the guide has.
  const scroller = useRef<HTMLDivElement>(null)
  const scrollRaf = useRef<number | null>(null)
  const [width, setWidth] = useState(1200)
  const [scrollState, setScrollState] = useState({
    left: 0,
    top: 0,
    clientWidth: 1200,
    clientHeight: 0,
  })

  const onGridScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const left = el.scrollLeft
    const top = el.scrollTop
    const clientWidth = el.clientWidth || 1200
    const clientHeight = el.clientHeight || 0

    // In React testing environment (happy-dom), update synchronously for act()
    if (typeof window !== 'undefined' && (window as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT) {
      setScrollState({ left, top, clientWidth, clientHeight })
      return
    }

    if (scrollRaf.current !== null) {
      cancelAnimationFrame(scrollRaf.current)
    }
    scrollRaf.current = requestAnimationFrame(() => {
      setScrollState((prev) => {
        if (
          Math.abs(prev.left - left) < 4 &&
          Math.abs(prev.top - top) < 4 &&
          prev.clientWidth === clientWidth &&
          prev.clientHeight === clientHeight
        ) {
          return prev
        }
        return { left, top, clientWidth, clientHeight }
      })
      scrollRaf.current = null
    })
  }, [])

  useEffect(() => {
    return () => {
      if (scrollRaf.current !== null) {
        cancelAnimationFrame(scrollRaf.current)
      }
    }
  }, [])

  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      if (e) {
        setWidth(e.contentRect.width)
        setScrollState((prev) => ({
          ...prev,
          clientWidth: el.clientWidth || e.contentRect.width || 1200,
          clientHeight: el.clientHeight || 0,
        }))
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [view])
  const colW = compactCol ? 64 : 248
  const rawPpm = (width - colW) / (prefs.guideZoom * 60)
  const ppm = Number.isFinite(rawPpm) && rawPpm > 0 ? Math.max(3, rawPpm) : 3
  const x = (t: number) => {
    const val = ((t - dayStart) / MIN) * ppm
    return Number.isFinite(val) ? val : 0
  }

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
    if (announce) {
      toast(`Switched to ${c.number} ${c.name}`)
      playChannelSwitchSound()
    }
  }
  const step = (dir: number) => {
    const list = visible.length ? visible : channels
    const i = list.findIndex((c) => c.id === playing?.id)
    const c = list[(i + dir + list.length) % list.length]
    if (c) tune(c)
  }
  const setGroup = (g: string) => {
    const next = new URLSearchParams(params)
    next.delete('tab')
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
      if (e.altKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault()
        setCategoryDrawerOpen((prev) => !prev)
      }
      if (e.altKey && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault()
        setMosaicOpen((prev) => !prev)
      }
      if (e.altKey && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault()
        setCatchupModalOpen((prev) => !prev)
      }
      if (/^[a-zA-Z]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const letter = e.key.toUpperCase()
        const matchIdx = visible.findIndex((c) => cleanChannelTitle(c.name).toUpperCase().startsWith(letter))
        if (matchIdx >= 0) {
          const matchChan = visible[matchIdx]
          if (matchChan) {
            if (view === 'guide' && scrollState.clientHeight > 0 && visible.length > 15) {
              const targetTop = Math.max(0, matchIdx * ROW_H[prefs.density] - (scrollState.clientHeight || 600) / 3)
              scroller.current?.scrollTo({ top: targetTop, behavior: 'smooth' })
              setFocusChannelId(matchChan.id)
            } else {
              if (matchIdx >= shownCount) {
                setPaged({ key: pageKey, count: Math.ceil((matchIdx + 1) / pageSize) * pageSize })
              }
              window.setTimeout(() => {
                const row = document.getElementById(`guide-row-${matchChan.id}`)
                row?.scrollIntoView({ block: 'center', behavior: 'smooth' })
              }, 40)
            }
            toast(`Jumped to '${letter}': ${matchChan.name}`)
          }
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const select = (p: Programme) => {
    setSelected(p)
    setFocusId(p.id)
    setFocusChannelId(p.channelId)
  }

  const rowH = ROW_H[prefs.density]
  // Two-axis virtualisation is active in guide view when the scroll container has real height and more than 10 rows.
  const isVirtualised = view === 'guide' && scrollState.clientHeight > 0 && visible.length > 10
  const guideChannels = isVirtualised ? visible : shown
  const totalRowCount = guideChannels.length
  const visibleRowCount = isVirtualised ? Math.ceil(scrollState.clientHeight / rowH) : totalRowCount
  const rowBuffer = 8

  let startRowIdx = 0
  let endRowIdx = totalRowCount

  if (isVirtualised) {
    startRowIdx = Math.max(0, Math.floor(scrollState.top / rowH) - rowBuffer)
    endRowIdx = Math.min(totalRowCount, startRowIdx + visibleRowCount + rowBuffer * 2)

    // Ensure focused channel's row is included in the rendered slice if nearby
    if (focusChannelId) {
      const fIdx = guideChannels.findIndex((c) => c.id === focusChannelId)
      if (fIdx >= 0 && Math.abs(fIdx - Math.floor(scrollState.top / rowH)) <= visibleRowCount + rowBuffer * 2) {
        if (fIdx < startRowIdx) startRowIdx = Math.max(0, fIdx - 1)
        if (fIdx >= endRowIdx) endRowIdx = Math.min(totalRowCount, fIdx + 2)
      }
    }
  }

  const topPadHeight = isVirtualised ? startRowIdx * rowH : 0
  const bottomPadHeight = isVirtualised ? Math.max(0, (totalRowCount - endRowIdx) * rowH) : 0
  const renderedChannels = isVirtualised ? guideChannels.slice(startRowIdx, endRowIdx) : shown

  const showMore = (
    !isVirtualised && more > 0 && (
      <button type="button" className="btn btn-secondary btn-small live-more" onClick={() => setPaged({ key: pageKey, count: shownCount + pageSize })}>
        Show {Math.min(pageSize, more)} more of {more} channels ({shown.length} of {visible.length} shown)
      </button>
    )
  )
  const countSummary = visible.length > 0 && (
    <p className="live-count-summary faint tnum" role="status">
      {group === 'All'
        ? `Showing ${isVirtualised ? visible.length : shown.length} of ${visible.length} unique ${visible.length === 1 ? 'channel' : 'channels'}${store.totalPlaylistEntries > channels.length ? ` (${store.totalPlaylistEntries} playlist entries across ${store.playlists.length} ${store.playlists.length === 1 ? 'playlist' : 'playlists'})` : ''}`
        : `Showing ${isVirtualised ? visible.length : shown.length} of ${visible.length} ${visible.length === 1 ? 'channel' : 'channels'} in ${group} (${channels.length} unique ${channels.length === 1 ? 'channel' : 'channels'} total)`}
    </p>
  )

  const renderedRows = useMemo(() => {
    return renderedChannels.map((c) => ({
      channel: c,
      programmes: filterKidSafeProgrammes(store.schedule(c, dayStart), isKidsMode),
    }))
  }, [renderedChannels, store, dayStart, isKidsMode])

  // Roving focus across the grid: arrows move between programmes, like a remote.
  const effectiveFocus = useMemo(() => {
    if (focusId) {
      const inRendered = renderedRows.some((r) => r.programmes.some((p) => p.id === focusId))
      if (inRendered) return focusId
    }
    const playingRow = renderedRows.find((r) => r.channel.id === playing?.id)
    const anchorRow = playingRow ?? renderedRows[0]
    if (!anchorRow) return null
    const prog = anchorRow.programmes.find((p) => p.start <= Math.max(now, dayStart) && Math.max(now, dayStart) < p.stop)
    return prog?.id ?? anchorRow.programmes[0]?.id ?? null
  }, [focusId, renderedRows, playing?.id, now, dayStart])

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key) || !effectiveFocus) return
    const r = renderedRows.findIndex((row) => row.programmes.some((p) => p.id === effectiveFocus))
    const row = renderedRows[r]
    if (!row) return
    const i = row.programmes.findIndex((p) => p.id === effectiveFocus)
    const cur = row.programmes[i] as Programme
    let target: Programme | undefined
    if (e.key === 'ArrowLeft') target = row.programmes[i - 1]
    if (e.key === 'ArrowRight') target = row.programmes[i + 1]
    if (e.key === 'Home') target = row.programmes[0]
    if (e.key === 'End') target = row.programmes[row.programmes.length - 1]
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const channelIdx = guideChannels.findIndex((c) => c.id === row.channel.id)
      const nextChannelIdx = channelIdx + (e.key === 'ArrowUp' ? -1 : 1)
      if (nextChannelIdx >= 0 && nextChannelIdx < guideChannels.length) {
        const nextChannel = guideChannels[nextChannelIdx]
        if (nextChannel) {
          const nextProgs = filterKidSafeProgrammes(store.schedule(nextChannel, dayStart), isKidsMode)
          const anchor = Math.max(cur.start, dayStart) + 60_000
          target = nextProgs.find((p) => p.start <= anchor && anchor < p.stop) ?? nextProgs[0]
          if (target) {
            setFocusChannelId(nextChannel.id)
            if (isVirtualised) {
              const targetTop = nextChannelIdx * rowH
              if (targetTop < scrollState.top || targetTop > scrollState.top + scrollState.clientHeight - rowH) {
                scroller.current?.scrollTo({ top: Math.max(0, targetTop - scrollState.clientHeight / 2 + rowH / 2), behavior: 'auto' })
              }
            }
          }
        }
      }
    }
    if (target) {
      e.preventDefault()
      setFocusId(target.id)
      setFocusChannelId(target.channelId)
    }
  }

  const gridHasFocusRef = useRef(false)
  useEffect(() => {
    if (!gridHasFocusRef.current) return
    const inGrid = scroller.current?.contains(document.activeElement)
    if (inGrid) return

    // Active element was unmounted or focus was lost during virtual row recycling
    let targetEl: HTMLElement | null = null
    if (focusId) {
      targetEl = scroller.current?.querySelector<HTMLElement>(`[data-pid="${CSS.escape(focusId)}"]`) ?? null
    }
    if (!targetEl && focusChannelId) {
      targetEl = scroller.current?.querySelector<HTMLElement>(`#guide-row-${CSS.escape(focusChannelId)} .prog, #guide-row-${CSS.escape(focusChannelId)} .guide-channel-tune`) ?? null
    }
    if (!targetEl) {
      targetEl = scroller.current?.querySelector<HTMLElement>('.guide-row .prog, .guide-row .guide-channel-tune') ?? null
    }
    if (targetEl) {
      targetEl.focus({ preventScroll: true })
    }
  }, [focusId, focusChannelId, renderedRows])

  const ticks = Array.from({ length: Math.round((dayEnd - dayStart) / (30 * MIN)) }, (_, i) => dayStart + i * 30 * MIN)
  const innerW = colW + x(dayEnd)
  const showNow = dayOffset === 0

  // Horizontal window for programme virtualisation: 600px overscan on both sides
  const minProgX = isVirtualised ? Math.max(0, scrollState.left - 600) : 0
  const maxProgX = isVirtualised ? scrollState.left + (scrollState.clientWidth || 1200) + 600 : Number.POSITIVE_INFINITY

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
      <button type="button" role="tab" className="tab" aria-selected={view === 'guide' && group !== 'Favourites' && group !== 'Catch-up' && group !== 'Reminders'} onClick={() => { setView('guide'); if (group === 'Favourites' || group === 'Catch-up' || group === 'Reminders') setGroup('All') }}>TV Guide</button>
      <button type="button" role="tab" className="tab" aria-selected={view === 'channels' && group !== 'Favourites' && group !== 'Catch-up' && group !== 'Reminders'} onClick={() => { setView('channels'); if (group === 'Favourites' || group === 'Catch-up' || group === 'Reminders') setGroup('All') }}>Channels</button>
      <Link to="/recordings" role="tab" className="tab">Recordings</Link>
      <button type="button" role="tab" className="tab" aria-selected={group === 'Catch-up'} onClick={() => { setView('channels'); setGroup('Catch-up') }}>Catch Up</button>
      <button type="button" role="tab" className="tab" aria-selected={group === 'Favourites'} onClick={() => { setView('channels'); setGroup('Favourites') }}>Favourites</button>
      <button type="button" role="tab" className="tab" aria-selected={group === 'Reminders'} onClick={() => { setView('channels'); setGroup('Reminders') }}>Reminders</button>
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
      <button type="button" className="now-btn" onClick={() => setEpgStatusOpen(true)} aria-label="View EPG guide diagnostics and channel mapping">
        <Icon name="info" size={14} />
        <span>EPG Health</span>
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
    <div className="live-empty-guide-stage" aria-label="No channels connected">
      <StateBlock
        icon="sources"
        title="No channels yet"
        action={(
          <div className="live-empty-actions">
            <Link to="/setup" className="btn btn-primary">
              <Icon name="cog" size={16} />
              Set up Kinora
            </Link>
            <Link to="/sources/add" className="btn btn-secondary">
              <Icon name="plus" size={16} />
              Add M3U Playlist
            </Link>
            <Link to="/sources?tab=discovery" className="btn btn-ghost">
              <Icon name="search" size={16} />
              Browse Public Discovery
            </Link>
          </div>
        )}
      >
        Kinora plays the television sources you supply. Add an M3U playlist you are allowed to use, your own tuner lineup, or an XMLTV guide feed.
      </StateBlock>
      <div className="live-empty-specs-grid">
        <div className="live-spec-card">
          <Icon name="tv" size={20} />
          <strong>M3U & M3U8 Lineups</strong>
          <span className="faint">Standard IPTV channel playlists with #EXTINF metadata and category tagging.</span>
        </div>
        <div className="live-spec-card">
          <Icon name="calendar" size={20} />
          <strong>XMLTV Programme Guides</strong>
          <span className="faint">Electronic programme guides in raw XML or compressed .xml.gz formats matched automatically.</span>
        </div>
        <div className="live-spec-card">
          <Icon name="shield" size={20} />
          <strong>Local-Only Streaming Privacy</strong>
          <span className="faint">Zero tracking or remote telemetry. Tuner proxying and playback verification run strictly on this machine.</span>
        </div>
      </div>
    </div>
  ) : (
    <div className="live-empty-guide-stage">
      <StateBlock
        icon="sources"
        title="No channels to show yet"
        action={(
          <div className="live-empty-actions">
            <Link to="/sources" className="btn btn-primary">Open Sources</Link>
            <Link to="/sources/add" className="btn btn-secondary">Add Another Source</Link>
          </div>
        )}
      >
        {store.playlists.some((s) => s.status === 'importing')
          ? 'A playlist is currently being imported in the background.'
          : 'None of your imported playlists has produced any channels. Open Sources to see diagnostic status, refresh a source, or verify stream URLs.'}
      </StateBlock>
    </div>
  )

  const emptyGroupView = group === 'Favourites' ? (
    <StateBlock icon="heart" title="No favourite channels yet" action={<button type="button" className="btn btn-ghost" onClick={() => setGroup('All')}>Show all channels</button>}>
      Use the heart next to a channel name to keep it here. Favourites are saved on this device.
    </StateBlock>
  ) : group === 'Catch-up' ? (
    <StateBlock icon="rotateCw" title="No catch-up channels found" action={<button type="button" className="btn btn-ghost" onClick={() => setGroup('All')}>Show all channels</button>}>
      None of your active channels currently report catch-up or archive support.
    </StateBlock>
  ) : group === 'Reminders' ? (
    <StateBlock icon="bell" title="No programme reminders set" action={<button type="button" className="btn btn-ghost" onClick={() => setGroup('All')}>Show all channels</button>}>
      Click the bell icon on any upcoming programme in the guide to be reminded before it airs.
    </StateBlock>
  ) : filterQuery.trim() ? (
    <StateBlock icon="search" title="No matching channels" action={<button type="button" className="btn btn-ghost" onClick={() => setFilterQuery('')}>Clear search</button>}>
      {`No channels or current programmes matched "${filterQuery}".`}
    </StateBlock>
  ) : (
    <StateBlock icon="folder" title={`No channels in ${group}`} action={<button type="button" className="btn btn-ghost" onClick={() => setGroup('All')}>Show all channels</button>}>
      Try selecting another category or check your imported playlists.
    </StateBlock>
  )

  if (isPlayingBlocked) {
    return (
      <>
        <PageHeader title="Live TV" />
        <div className="page live" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', padding: '24px' }}>
          <div style={{ maxWidth: '440px', textAlign: 'center', background: 'var(--card-bg, #1a1e24)', border: '1px solid var(--line)', borderRadius: '16px', padding: '32px' }}>
            <div style={{ display: 'grid', placeItems: 'center', marginBottom: '16px', color: 'var(--accent, #e50914)' }}>
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

  const previewChannel = playing ?? (shown.length > 0 ? shown[0] : channels[0])
  const previewProg = previewChannel ? store.programmeAt(previewChannel, now) : undefined
  const nextProg = previewChannel ? store.nextProgramme(previewChannel, now) : undefined
  const minsLeft = previewProg && previewProg.stop > now
    ? Math.max(1, Math.round((previewProg.stop - now) / 60000))
    : 42
  const progProgress = previewProg && previewProg.stop > previewProg.start
    ? Math.min(1, Math.max(0, (now - previewProg.start) / (previewProg.stop - previewProg.start)))
    : 0.5

  const topStage = view === 'guide' && previewChannel && (
    <div className="tvguide-preview-wrapper">
      <div className="tvguide-compact-bar">
        <div className="tvguide-compact-channel-info">
          <ChannelMark channel={previewChannel} size={30} />
          <div className="tvguide-compact-titles">
            <span className="tvguide-compact-channel-name">{previewChannel.name}</span>
            <span className="tvguide-compact-prog-title">{previewProg?.title ?? `${previewChannel.name} Live`}</span>
            <span className="tvguide-compact-prog-time">
              {previewProg ? `${clock(previewProg.start, prefs.timeFormat)} - ${clock(previewProg.stop, prefs.timeFormat)}` : 'On air'}
            </span>
          </div>
        </div>

        {previewProg && (
          <div className="tvguide-compact-prog-bar-wrap">
            <div className="tvguide-compact-prog-bar">
              <div className="tvguide-compact-prog-fill" style={{ width: `${Math.round(progProgress * 100)}%` }} />
            </div>
            <span className="tvguide-compact-mins">{minsLeft > 0 ? `${minsLeft}m left` : 'Live'}</span>
          </div>
        )}

        <div className="tvguide-compact-actions">
          <button
            type="button"
            className="btn btn-primary btn-small tvguide-watch-live-btn"
            onClick={() => tune(previewChannel)}
          >
            <Icon name="play" size={14} />
            <span>Watch Live</span>
          </button>
          <button
            type="button"
            className={`btn btn-small btn-ghost tvguide-preview-toggle-btn ${previewExpanded ? 'is-expanded' : ''}`}
            onClick={() => setPreviewExpanded(!previewExpanded)}
            aria-label={previewExpanded ? 'Collapse video preview' : 'Expand video preview'}
            title={previewExpanded ? 'Hide player preview' : 'Show player preview'}
          >
            <Icon name="tv" size={14} />
            <span>{previewExpanded ? 'Hide Preview' : 'Show Preview'}</span>
            <Icon name={previewExpanded ? 'up' : 'down'} size={12} />
          </button>
        </div>
      </div>

      <div className={`tvguide-top-stage ${previewExpanded ? 'is-expanded' : 'is-collapsed'}`}>
        {/* Left Card: Live Video Player Preview */}
        <GuidePreviewPlayer
          channel={previewChannel}
          onInfo={() => setSelected(previewProg ?? null)}
          onTune={() => tune(previewChannel)}
        />

        {/* Right Card: Now Playing Info Card */}
        <div className="tvguide-now-card">
          <div className="tvguide-now-header-split">
            <div className="tvguide-now-meta-block">
              <span className="tvguide-now-kicker">Live On Air</span>
              <h2 className="tvguide-now-title">{previewProg?.title ?? `${previewChannel.name} Live`}</h2>
              <div className="tvguide-now-channel-time">
                <span>{previewChannel.name}</span>
                <span>•</span>
                <span>{previewProg ? `${clock(previewProg.start, prefs.timeFormat)} - ${clock(previewProg.stop, prefs.timeFormat)}` : 'On air'}</span>
              </div>
            </div>
            {nextProg && (
              <div className="tvguide-next-preview-card">
                <Art
                  src={nextProg.art || ''}
                  alt={nextProg.title}
                  className="tvguide-next-thumb"
                  fallbackIcon="tv"
                />
                <div className="tvguide-next-info">
                  <span className="tvguide-next-kicker">Next on {previewChannel.name} &gt;</span>
                  <span className="tvguide-next-name">{nextProg.title}</span>
                  <span className="tvguide-next-time">{clock(nextProg.start, prefs.timeFormat)} - {clock(nextProg.stop, prefs.timeFormat)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="tvguide-now-progress-wrap">
            <div className="tvguide-now-prog-bar">
              <div className="tvguide-now-prog-fill" style={{ width: `${Math.round(progProgress * 100)}%` }} />
            </div>
            <div className="tvguide-now-prog-meta">
              <span>{minsLeft > 0 ? `${minsLeft} min left` : 'Live'}</span>
              <span>{previewProg?.category ?? previewChannel.group ?? 'General'}</span>
            </div>
          </div>

          <p className="tvguide-now-synopsis">
            {previewProg?.desc ?? (previewChannel ? `Live broadcast on ${previewChannel.name}.` : 'Select a channel to browse live programming.')}
          </p>

          <div className="tvguide-now-actions-row">
            <button
              type="button"
              className="tvguide-watch-live-btn"
              onClick={() => tune(previewChannel)}
            >
              <Icon name="play" size={16} />
              <span>Watch Live</span>
            </button>
            <button
              type="button"
              className="tvguide-action-pill-btn"
              onClick={() => {
                if (previewProg) {
                  store.scheduleRecording(
                    previewChannel.id,
                    previewChannel.name,
                    previewProg.title,
                    previewProg.start,
                    previewProg.stop,
                    { programmeId: previewProg.id, description: previewProg.desc }
                  )
                  toast(`Recording scheduled for "${previewProg.title}"`)
                }
              }}
            >
              <Icon name="record" size={14} />
              <span>Record</span>
            </button>
            <button
              type="button"
              className="tvguide-action-pill-btn"
              onClick={() => {
                if (previewProg) {
                  store.toggleReminder(previewProg.id)
                  toast(store.library.reminders.includes(previewProg.id) ? `Reminder removed for "${previewProg.title}"` : `Reminder set for "${previewProg.title}"`)
                }
              }}
            >
              <Icon name="bell" size={14} />
              <span>Reminder</span>
            </button>
            <button
              type="button"
              className="tvguide-action-pill-btn"
              onClick={() => {
                store.toggleFavourite(channelRef(previewChannel.id))
                playFavoriteSound()
                toast(favIds.includes(previewChannel.id) ? `Removed ${previewChannel.name} from favourites` : `Added ${previewChannel.name} to favourites`)
              }}
            >
              <Icon name="star" size={14} />
              <span>Favourite</span>
            </button>
            <button
              type="button"
              className="tvguide-action-pill-btn"
              onClick={() => {
                setShareItem({
                  title: previewProg?.title || previewChannel.name,
                  kind: previewProg ? 'programme' : 'channel',
                  year: previewProg?.episode ? previewProg.episode : undefined,
                  genres: previewProg?.category ? [previewProg.category] : undefined,
                  art: previewProg?.art || previewProg?.icon || undefined,
                  deepLinkPath: `/live?channel=${encodeURIComponent(previewChannel.id)}`,
                })
              }}
            >
              <Icon name="share" size={14} />
              <span>Share</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <PageHeader title="Live TV" tabs={tabs} search={false} />
      <div className={`page live${reallyPlaying ? ' is-docked-playing' : ''}`}>
        {topStage}
        <div className="live-toolbar">
          {guideActions}
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

            <select
              className="live-filter-select"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as ChannelSortMode)}
              aria-label="Sort channels"
              title="Sort channels"
            >
              <option value="default">{SORT_MODE_LABELS['default']}</option>
              <option value="number">{SORT_MODE_LABELS['number']}</option>
              <option value="name-asc">{SORT_MODE_LABELS['name-asc']}</option>
              <option value="name-desc">{SORT_MODE_LABELS['name-desc']}</option>
              <option value="favorites-first">{SORT_MODE_LABELS['favorites-first']}</option>
            </select>

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
            className="btn btn-small btn-secondary"
            onClick={() => setMosaicOpen(true)}
            aria-label="Open multi-screen mosaic"
            title="Multi-Screen Quad View (Alt+M)"
          >
            <Icon name="grid" size={14} />
            <span>Mosaic</span>
          </button>

          <button
            type="button"
            className="btn btn-small btn-secondary"
            onClick={() => setCatchupModalOpen(true)}
            aria-label="Open Catch-up TV Hub"
            title="Catch-up TV Replay (Alt+U)"
          >
            <Icon name="history" size={14} />
            <span>Catch-up</span>
          </button>

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
          <button
            type="button"
            className="chip-action-btn chip-category-drawer"
            onClick={() => setCategoryDrawerOpen(true)}
            title="Open Category Drawer (Alt+C)"
            aria-label="Open Category Drawer"
          >
            <Icon name="layoutSidebar" size={14} />
            <span>Categories</span>
          </button>
          {groups.map((g) => {
            const isBouquet = g.startsWith('bouquet:')
            const bId = isBouquet ? g.replace('bouquet:', '') : ''
            const bq = isBouquet ? bouquetConfig.bouquets.find((b) => b.id === bId) : null
            const iconName = isBouquet ? ((bq?.icon as any) || 'sparkles') : getCategoryIcon(g)
            const label = isBouquet ? (bq?.name || 'Bouquet') : g

            return (
              <button
                key={g}
                type="button"
                className={isBouquet ? 'chip chip-bouquet' : 'chip'}
                aria-pressed={group === g}
                onClick={() => setGroup(g)}
                onFocus={(e) => e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })}
              >
                <Icon name={iconName} size={14} />
                <span>{label}</span>
              </button>
            )
          })}
          <button
            type="button"
            className="chip-action-btn chip-manage-bouquets"
            onClick={() => setBouquetModalOpen(true)}
            title="Manage Categories and Bouquets"
            aria-label="Manage Categories and Bouquets"
          >
            <Icon name="edit" size={14} />
            <span>Organize</span>
          </button>
        </div>

        {view === 'channels' ? (
          <>
            {channels.length === 0 ? noPlaylistChannels : visible.length === 0 ? emptyGroupView : (
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
          channels.length === 0 ? noPlaylistChannels : emptyGroupView
        ) : (
          <section className="guide" aria-label="TV guide">
            {channelMode !== 'demo' && store.guides.length === 0 && (
              <div className="live-no-guide-banner" role="status">
                <div className="live-no-guide-info">
                  <Icon name="info" size={16} />
                  <span>No XMLTV guide connected. Programme schedule slots will display "No listings" until an XMLTV guide is added.</span>
                </div>
                <Link to="/sources" className="btn btn-secondary btn-small">
                  <Icon name="plus" size={14} />
                  <span>Add XMLTV Guide</span>
                </Link>
              </div>
            )}
            {countSummary}
            <div className="epg-anchors-bar" role="toolbar" aria-label="Quick time anchors">
              <span className="epg-anchors-label"><Icon name="clock" size={13} /> Time Travel:</span>
              <button type="button" className="epg-anchor-pill" onClick={jumpToNow} title="Jump to current time">
                Now
              </button>
              <button type="button" className="epg-anchor-pill" onClick={() => scrollToTime(now + 2 * 60 * MIN)} title="Jump 2 hours ahead">
                +2 Hours
              </button>
              <button type="button" className="epg-anchor-pill" onClick={() => scrollToTime(dayStart + 20 * 60 * MIN)} title="Jump to Prime Time (8:00 PM)">
                Prime Time (8 PM)
              </button>
              <button type="button" className="epg-anchor-pill" onClick={() => scrollToTime(dayStart + 23 * 60 * MIN)} title="Jump to Late Night (11:00 PM)">
                Late Night (11 PM)
              </button>
              <button type="button" className="epg-anchor-pill" onClick={() => {
                if (dayOffset !== 1) setDayOffset(1)
                window.setTimeout(() => scrollToTime(dayStart + 24 * 60 * MIN + 20 * 60 * MIN, true), 50)
              }} title="Jump to Tomorrow Prime Time (8:00 PM)">
                Tomorrow (8 PM)
              </button>
            </div>
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
            <div
              className="guide-scroll"
              ref={scroller}
              onScroll={onGridScroll}
              onFocusCapture={() => { gridHasFocusRef.current = true }}
              onBlurCapture={(e) => {
                if (e.relatedTarget && !scroller.current?.contains(e.relatedTarget as Node)) {
                  gridHasFocusRef.current = false
                }
              }}
              style={{ ['--col-w' as string]: `${colW}px`, ['--row-h' as string]: `${ROW_H[prefs.density]}px` }}
            >
              <div className="guide-inner" style={{ width: innerW }} role="grid" aria-label={`Programme guide, ${dayLabel(dayStart, now)}`} aria-rowcount={(isVirtualised ? visible.length : shown.length) + 1} onKeyDown={onGridKey}>
                <div className="guide-head" role="row">
                  <div className="guide-corner" role="columnheader">
                    <select className="corner-select" value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Channel category">
                      {allSelectableGroups.map((g) => {
                        let label = g === 'All' ? 'Channels' : g
                        if (g.startsWith('bouquet:')) {
                          const bId = g.replace('bouquet:', '')
                          label = bouquetConfig.bouquets.find((b) => b.id === bId)?.name ?? 'Bouquet'
                        }
                        return <option key={g} value={g}>{label}</option>
                      })}
                    </select>
                  </div>
                  <div className="guide-ticks" role="presentation">
                    {ticks.map((t) => {
                      const isHour = new Date(t).getMinutes() === 0
                      const tickX = x(t)
                      if (isVirtualised && (tickX < minProgX - 120 || tickX > maxProgX + 120)) {
                        return null
                      }
                      return (
                        <span
                          key={t}
                          className={`tick tnum${isHour ? ' is-hour' : ' is-half'}${showNow && t <= now && now < t + 30 * MIN ? ' is-current' : ''}`}
                          style={{ left: tickX }}
                        >
                          <span className="tick-mark" aria-hidden="true" />
                          <span className="tick-label">{clock(t, prefs.timeFormat)}</span>
                        </span>
                      )
                    })}
                  </div>
                </div>
                {topPadHeight > 0 && <div className="guide-spacer-top" style={{ height: topPadHeight }} aria-hidden="true" />}
                {renderedRows.map(({ channel: c, programmes }, idx) => {
                  const fav = favIds.includes(c.id)
                  const isTuned = c.id === playing?.id
                  const isPlaying = reallyPlaying && isTuned
                  const cleanName = c.cleanName || cleanChannelTitle(c.name)
                  const badges = c.badges ?? parseChannelMetadata(c.name).badges
                  return (
                    <div key={c.id} id={`guide-row-${c.id}`} className={`guide-row${isTuned ? ' is-playing' : ''}`} role="row" aria-rowindex={(isVirtualised ? startRowIdx : 0) + idx + 2}>
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
                        <button
                          type="button"
                          className="guide-channel-tune"
                          onClick={() => tune(c)}
                          onFocus={() => {
                            setFocusChannelId(c.id)
                            gridHasFocusRef.current = true
                          }}
                          aria-label={`Watch ${c.number} ${c.name}${isPlaying ? ', now watching' : ''}`}
                          aria-current={isTuned ? 'true' : undefined}
                        >
                          <ChannelMark channel={c} size={compactCol ? 32 : 34} />
                          {!compactCol && (
                            <span className="guide-channel-name">
                              <strong title={c.name}>{cleanName}</strong>
                              {c.name !== cleanName && <span className="sr-only">{c.name}</span>}
                              <span className="guide-channel-subline">
                                {isPlaying && <span className="watching"><Icon name="play" size={9} />Watching</span>}
                                {badges.map((b, idx) => (
                                  <span key={`${b.kind}-${idx}`} className={`guide-channel-tag tag-${b.kind}`}>{b.label}</span>
                                ))}
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
                                const isGapVisible = (gapLeft + gapW >= minProgX) && (gapLeft <= maxProgX)
                                if (isGapVisible) {
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
                              }
                              const onNow = p.start <= now && now < p.stop
                              const past = p.stop <= now
                              const left = x(effStart)
                              const w = x(effStop) - left
                              const isProgVisible = (left + w >= minProgX) && (left <= maxProgX)
                              if (!isProgVisible && p.id !== effectiveFocus && selected?.id !== p.id) {
                                cursor = Math.max(cursor, effStop)
                                continue
                              }
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
                              const labelOffset = Math.min(Math.max(0, w - 80), Math.max(0, scrollState.left - left))
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
                                  onFocus={() => {
                                    setFocusId(p.id)
                                    setFocusChannelId(c.id)
                                  }}
                                  title={`${p.title} (${clock(p.start, prefs.timeFormat)} - ${clock(p.stop, prefs.timeFormat)})`}
                                  aria-label={`${p.title}, ${c.name}, ${clock(p.start, prefs.timeFormat)} to ${clock(p.stop, prefs.timeFormat)}${onNow ? ', on now' : ''}`}
                                >
                                  <span className="prog-label" style={labelOffset > 0 ? { transform: `translateX(${labelOffset}px)` } : undefined}>
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
                              const isGapVisible = (gapLeft + gapW >= minProgX) && (gapLeft <= maxProgX)
                              if (isGapVisible) {
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
                            }
                            return elements
                          })()
                        )}
                      </div>
                    </div>
                  )
                })}
                {bottomPadHeight > 0 && <div className="guide-spacer-bottom" style={{ height: bottomPadHeight }} aria-hidden="true" />}
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

        {matchingChannel && (
          <EpgMappingModal
            open={Boolean(matchingChannel)}
            channel={matchingChannel}
            currentMapping={store.mappings.find((m) => m.channel === matchingChannel.id)}
            onClose={() => setMatchingChannel(null)}
            onSaveMapping={(channelId, guideId, xmltvId) => {
              store.setMapping(channelId, guideId, xmltvId)
              toast(`Mapped ${matchingChannel.name} to ${xmltvId}`)
            }}
            onClearMapping={(channelId) => {
              store.clearMapping(channelId)
              toast(`Cleared guide mapping for ${matchingChannel.name}`)
            }}
          />
        )}

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
                        if (isVirtualised) {
                          const targetTop = Math.max(0, channelIndex * rowH - (scrollState.clientHeight || 600) / 3)
                          scroller.current?.scrollTo({ top: targetTop, behavior: 'smooth' })
                          scrollToTime(p.start, true)
                          setFocusChannelId(c.id)
                          setFocusId(p.id)
                        } else {
                          if (channelIndex >= shownCount) {
                            setPaged({ key: pageKey, count: Math.ceil((channelIndex + 1) / pageSize) * pageSize })
                          }
                          select(p)
                          window.setTimeout(() => {
                            scrollToTime(p.start, true)
                            const row = document.getElementById(`guide-row-${c.id}`)
                            row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
                          }, 50)
                        }
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
        <ShareModal
          open={Boolean(shareItem)}
          onClose={() => setShareItem(null)}
          item={shareItem}
        />
        <NumericZapHUD
          channels={channels}
          onTune={(ch) => tune(ch, true)}
        />
        <BouquetManagerModal
          open={bouquetModalOpen}
          onClose={() => setBouquetModalOpen(false)}
          categories={activeCategories}
          channels={notHidden}
          onConfigChange={refreshBouquetConfig}
        />
        <CategoryDrawer
          open={categoryDrawerOpen}
          onClose={() => setCategoryDrawerOpen(false)}
          groups={groups}
          activeGroup={group}
          onSelectGroup={(g) => setGroup(g)}
          categoryCounts={categoryCounts}
          onOpenManager={() => setBouquetModalOpen(true)}
          bouquets={bouquetConfig.bouquets}
        />
        <LiveMosaicGrid
          open={mosaicOpen}
          onClose={() => setMosaicOpen(false)}
          channels={channels}
          initialChannel={playing}
          onTuneFullChannel={(ch) => tune(ch, true)}
        />
        <CatchupBrowserModal
          open={catchupModalOpen}
          onClose={() => setCatchupModalOpen(false)}
        />
        <EpgStatusModal
          open={epgStatusOpen}
          onClose={() => setEpgStatusOpen(false)}
          channels={store.channels}
          guides={store.guides}
          mappings={store.mappings}
          getMatch={store.guideMatch}
          onOpenManualMap={(channel: Channel) => {
            setEpgStatusOpen(false)
            setMatchingChannel(channel)
          }}
          onClearMapping={(channelId: string) => {
            store.clearMapping(channelId)
          }}
        />
      </div>
    </>
  )
}

function LivePlayer({ channel, programme, now, onStep, onClose, onStatus }: {
  channel: Channel; programme?: Programme; now: number; onStep: (dir: number) => void; onClose: () => void; onStatus: (s: PlaybackStatus) => void
}) {
  const store = useStore()
  const { prefs } = store
  const {
    playbackState,
    playStream,
    selectServer,
    retry,
  } = useUniversalPlayback()

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

  useEffect(() => {
    if (chosen?.streamUrl) {
      playStream({
        ref: channelRef(channel.id),
        streamUrl: chosen.streamUrl,
        title: channel.name,
        subtitle: programme?.title,
        channel,
        isLive: true,
        sourceId: channel.sourceId ?? undefined,
        streamOptions: options,
        selectedServerId: optionId,
      })
    }
  }, [channel.id, chosen?.streamUrl, playStream])

  const status = playbackState.status
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
            ? <span>{noAddress ?? playbackText(playbackState)}{playbackState.canRetry && <>{' '}<button type="button" className="text-link" onClick={retry}>Retry</button></>}</span>
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
                  selectServer(event.target.value)
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
  const canCatchup = Boolean(
    ended &&
    channel?.tvArchive === 1 &&
    channel.sourceId &&
    (channel.xtreamStreamId || (channel.streamUrl && (channel.catchupType || channel.catchupSource))) &&
    (now - p.start) <= archiveWindowMs
  )

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
              to={`/watch/${encodeURIComponent(
                channel.xtreamStreamId
                  ? catchupRef(channel.sourceId!, channel.xtreamStreamId, Math.floor(p.start / 1000), Math.max(1, mins))
                  : m3uCatchupRef(channel.id, Math.floor(p.start / 1000), Math.max(1, mins), Math.floor(p.stop / 1000))
              )}`}
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
