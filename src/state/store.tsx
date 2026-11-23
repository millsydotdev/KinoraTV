import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { hydrateMetadataCredentialsFromVault, loadMetadataConfig } from '../data/metadataProviders'
import { artworkEngine } from '../data/artworkEngine'
import { addDays, channels as demoChannels, nextProgramme as demoNext, programmeAt as demoAt, scheduleFor as demoSchedule, startOfDay } from '../data/channels'
import { realLibrary } from '../lib/migrate'
import { demoSources } from '../data/sources'
import type { Channel, Collection, Library, Programme, Progress, Ref, Source, StreamVariant, XtreamTitle } from '../data/types'
import {
  disconnectXtream, fetchGuide, fetchPlaylist, guideProgrammes, inNativeShell, isXtreamConnected, loadCatalogue, loadGuide, loadSources, loadXtreamCatalogue, loadXtreamSeries, readGuideFile, readPlaylistFile, refreshCatalogue, refreshXtream,
  removeGuide as forgetGuide, saveSources, loadXtreamVodDetails, loadXtreamEpg, updateRemoteChannels, updateRemoteSources, updateRemoteLibrary,
  dvrGetRecordings, dvrStartRecording, dvrStopRecording, dvrScheduleRecording, dvrCancelRecording, dvrDeleteRecording, dvrProtectRecording,
  dvrGetRules, dvrSaveRule, dvrDeleteRule, dvrGetConfig, dvrSaveConfig, dvrGetStorageInfo,
  type GuideSummary, type PlaylistReport, type SavedState, type SavedXtreamSource, type StorageNotice, type XtreamCatalogue, type XtreamEntry, type XtreamSeriesDetails,
  type XtreamCategory, type XtreamLiveStream, type XtreamUserInfo, type XtreamServerInfo, type XtreamCapabilities, type XtreamEpisode,
  type Recording, type SeriesRule, type DvrConfig, type StorageInfo,
} from '../lib/native'
import { idleCatalogue, isStale, runCatalogue, type CatalogueState } from './catalogue'
import { createGuide, guideQueries, includePlaylistsInGuides, programmesFor, resolveMatches, restoreGuide, runGuideImport, toSavedGuide, type GuideMatch, type GuideSource, type Mapping } from './guides'
import { ACCENTS, THEME_BG, safeHex, type AccentName, type ThemeName } from '../lib/theme'
import { activeChannels, createSource, fileLabel, removeSource, restoreSource, runImport, toSaved, type PlaylistSource } from './playlists'
import { combineChannels } from './channel-matching'
import { registerRecordingLookup, registerResourceLookup } from '../data/refs'
import { usePersonalMediaLibrary } from './mediaLibrary'
import { useUserPreferencesStore } from './userPreferences'
import { useProfiles } from './profiles'
import { filterKidSafeChannels, filterKidSafeProgrammes, filterKidSafeXtreamTitles, isProgrammeKidSafe } from '../lib/kidsMode'
import { PlaybackProvider } from './playbackContext'
import { useClientSync } from '../lib/clientSync'

export type { Collection, Library, Progress, Ref, XtreamTitle }

export interface XtreamSource extends SavedXtreamSource {
  connected: boolean
  /** Kept only in React memory so the form can reconnect during this app session. */
  server: string | null
  capabilities?: XtreamCapabilities | null
  userInfo?: XtreamUserInfo | null
  serverInfo?: XtreamServerInfo | null
}

export interface XtreamCatalogueState {
  movies: XtreamTitle[]
  series: XtreamTitle[]
  liveStreams: (XtreamLiveStream & { sourceId: string })[]
  liveCategories: (XtreamCategory & { sourceId: string })[]
  vodCategories: (XtreamCategory & { sourceId: string })[]
  seriesCategories: (XtreamCategory & { sourceId: string })[]
}

function xtreamStreamToChannel(stream: XtreamLiveStream, sourceId: string, _sourceName: string, categoryName?: string): Channel {
  const cat = categoryName || 'Uncategorised'
  return {
    id: `${sourceId}~${stream.id}`,
    name: stream.name,
    number: stream.num ?? 0,
    streamUrl: `xtream://${sourceId}/live/${stream.id}`,
    logoUrl: stream.streamIcon ?? null,
    mark: { text: stream.name.slice(0, 2).toUpperCase(), tone: '#3d4650' },
    hd: true,
    tvgId: stream.epgChannelId || stream.name,
    group: cat,
    categories: [cat],
    sourceId,
    tvArchive: stream.tvArchive,
    tvArchiveDuration: stream.tvArchiveDuration,
    xtreamStreamId: stream.id,
  }
}

export interface Prefs {
  theme: ThemeName
  accent: AccentName | 'custom'
  customAccent: string
  density: 'compact' | 'comfortable' | 'spacious'
  textSize: 'standard' | 'large'
  reduceMotion: boolean
  movieLayout: 'poster' | 'landscape'
  hideWatched: boolean
  keepHistory: boolean
  autoplayNext: boolean
  resume: 'resume' | 'ask' | 'start'
  quality: 'auto' | '2160p' | '1080p' | '720p' | '480p'
  audioLanguage: string
  subtitles: boolean
  subtitleLanguage: string
  subtitleSize: 'small' | 'medium' | 'large'
  subtitleStyle: 'shadow' | 'outline' | 'boxed'
  timeFormat: '24h' | '12h'
  guideZoom: 1 | 2 | 3 | 4
  guideArt: boolean
  guideStart: 'now' | 'day'
  /** Fictional sample content, only when the user asks for it and has no real source. */
  demoMode: boolean
  sidebarCollapsed: boolean
  homeHubCollapsed: boolean
  layoutMode: 'standard' | 'compact' | 'wide' | 'tv'
  viewMode: 'desktop' | 'tv'
  showArtworkBackgrounds: boolean
  animatedTransitions: boolean
  showMediaRatings: boolean
  /** 'system' follows the OS colour scheme; the resolved theme is stored in `theme`. */
  themeMode: 'dark' | 'midnight' | 'dim' | 'slate' | 'oled' | 'light' | 'system'
  /** Optional custom User-Agent override for stream playback. Empty string means default Kinora agent. */
  customUserAgent: string
  /** Optional custom HTTP Referrer override for stream playback. Empty string means none. */
  customReferrer: string
}

/** Source-checking settings removed in D3.1: nothing used them. Stripped from saved prefs so they stop being stored. */
type RemovedPrefs = {
  autoRefresh?: unknown; refreshInterval?: unknown; validateOnAdd?: unknown; dropAfterFailures?: unknown; parallelChecks?: unknown
  // Removed after the completion audit: nothing could honour them (WebKit decides decoding and audio output).
  hardwareDecoding?: unknown; skipIntros?: unknown; audioOutput?: unknown; dialogueBoost?: unknown; normaliseVolume?: unknown
}

const DAY = 86_400_000

export const defaultPrefs: Prefs = {
  theme: 'dark', accent: 'red', customAccent: '#f20d24', density: 'comfortable', textSize: 'standard', reduceMotion: false, movieLayout: 'poster', hideWatched: false, keepHistory: true,
  autoplayNext: true, resume: 'resume', quality: 'auto',
  audioLanguage: 'English',
  subtitles: false, subtitleLanguage: 'English', subtitleSize: 'medium', subtitleStyle: 'shadow',
  timeFormat: '24h', guideZoom: 3, guideArt: true, guideStart: 'now', demoMode: false, sidebarCollapsed: false, homeHubCollapsed: false,
  layoutMode: 'standard', viewMode: 'desktop', showArtworkBackgrounds: true, animatedTransitions: true, showMediaRatings: true, themeMode: 'dark',
  customUserAgent: '', customReferrer: '',
}

export const emptyLibrary: Library = {
  favourites: [], watchlist: [], progress: {}, watched: [], history: [], collections: [], reminders: [], recentSearches: [],
}

/** Sample activity for sample mode only. It is kept apart from the real library and never mixed with it. */
export function demoLibrary(now: number): Library {
  const p = (pos: number, dur: number, daysAgo: number): Progress => ({ pos, dur, at: now - daysAgo * DAY })
  const ninthS1 = [1, 2, 3, 4, 5, 6].map((e) => `episode:ninth-ward/s1e${e}`)
  return {
    favourites: ['channel:northlight-one', 'channel:pitchside', 'channel:habitat', 'channel:encore', 'movie:harbour-lights', 'movie:velvet-hour', 'movie:cartographer', 'series:ninth-ward', 'series:kingsmoor'],
    watchlist: ['movie:low-orbit', 'series:fathom', 'movie:signal-fire', 'movie:undertow', 'series:static'],
    progress: {
      'movie:glasshouse': p(3900, 6240, 0.2),
      'episode:ninth-ward/s2e3': p(1250, 3120, 0.6),
      'episode:kingsmoor/s1e2': p(2500, 3360, 1.4),
      'movie:northern-trace': p(3120, 6840, 2.2),
      'movie:northbound': p(1400, 7020, 3),
      'episode:understudies/s1e4': p(400, 1680, 4),
    },
    watched: [...ninthS1, 'episode:ninth-ward/s2e1', 'episode:ninth-ward/s2e2', 'episode:kingsmoor/s1e1', 'movie:velvet-hour', 'movie:long-quiet', 'episode:understudies/s1e1', 'episode:understudies/s1e2', 'episode:understudies/s1e3'],
    history: [
      { ref: 'movie:glasshouse', at: now - 0.2 * DAY },
      { ref: 'channel:meridian-news', at: now - 0.4 * DAY },
      { ref: 'episode:ninth-ward/s2e3', at: now - 0.6 * DAY },
      { ref: 'episode:ninth-ward/s2e2', at: now - 0.7 * DAY },
      { ref: 'episode:kingsmoor/s1e2', at: now - 1.4 * DAY },
      { ref: 'movie:northern-trace', at: now - 2.2 * DAY },
      { ref: 'channel:pitchside', at: now - 2.5 * DAY },
      { ref: 'movie:northbound', at: now - 3 * DAY },
      { ref: 'episode:understudies/s1e4', at: now - 4 * DAY },
      { ref: 'movie:velvet-hour', at: now - 6 * DAY },
      { ref: 'movie:long-quiet', at: now - 9 * DAY },
    ],
    collections: [
      { id: 'c-rainy', name: 'Rainy Sunday', items: ['movie:velvet-hour', 'movie:northbound', 'series:kingsmoor', 'movie:cartographer'], createdAt: now - 20 * DAY },
      { id: 'c-night', name: 'Night shift', items: ['movie:harbour-lights', 'series:ninth-ward', 'series:static', 'movie:undertow'], createdAt: now - 12 * DAY },
      { id: 'c-family', name: 'Family film night', items: ['movie:paper-kingdoms', 'movie:midnight-arcade'], createdAt: now - 5 * DAY },
    ],
    reminders: [],
    recentSearches: ['harbour', 'football', 'kingsmoor'],
  }
}

interface SourcesState { sources: Source[] }

function load<T>(key: string, fallback: () => T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...fallback(), ...(JSON.parse(raw) as T) } : fallback()
  } catch {
    // Corrupt or unavailable storage: start from the fallback rather than crash the shell.
    return fallback()
  }
}

function usePersisted<T>(key: string, fallback: () => T, sanitize: (v: T) => T = (v) => v) {
  const [value, setValue] = useState<T>(() => sanitize(load(key, fallback)))
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Storage full or blocked (private mode). State still works for this session.
    }
  }, [key, value])
  return [value, setValue] as const
}

/** Stored preferences come from localStorage, so out-of-range values (or ones from older builds) fall back to defaults. */
export function sanitizePrefs(stored: Prefs & RemovedPrefs): Prefs {
  const {
    autoRefresh: _a, refreshInterval: _r, validateOnAdd: _v, dropAfterFailures: _d, parallelChecks: _p,
    hardwareDecoding: _h, skipIntros: _s, audioOutput: _o, dialogueBoost: _b, normaliseVolume: _n, ...p
  } = stored
  const pick = <K extends keyof Prefs>(key: K, allowed: readonly Prefs[K][]) => (allowed.includes(p[key]) ? p[key] : defaultPrefs[key])
  return {
    ...p,
    theme: pick('theme', Object.keys(THEME_BG) as ThemeName[]),
    accent: pick('accent', [...(Object.keys(ACCENTS) as AccentName[]), 'custom']),
    customAccent: safeHex(p.customAccent) ?? defaultPrefs.customAccent,
    density: pick('density', ['compact', 'comfortable', 'spacious']),
    sidebarCollapsed: Boolean(p.sidebarCollapsed),
    homeHubCollapsed: Boolean(p.homeHubCollapsed),
    layoutMode: pick('layoutMode', ['standard', 'compact', 'wide', 'tv']),
    viewMode: (p.viewMode === 'tv' || p.layoutMode === 'tv') ? 'tv' : pick('viewMode', ['desktop', 'tv']),
    showArtworkBackgrounds: p.showArtworkBackgrounds !== false,
    animatedTransitions: p.animatedTransitions !== false,
    showMediaRatings: p.showMediaRatings !== false,
    themeMode: pick('themeMode', ['dark', 'midnight', 'dim', 'slate', 'oled', 'light', 'system']),
  }
}

/** Removes one playlist source's channels from favourites, watchlist, history and collections; nothing else. */
export function dropSourceRefs(l: Library, sourceId: string, remap: ReadonlyMap<string, string> = new Map()): Library {
  const prefix = `channel:${sourceId}~`
  const rewrite = (r: Ref): Ref | null => {
    if (!r.startsWith('channel:')) return r
    const id = r.slice('channel:'.length)
    const replacement = remap.get(id)
    if (replacement) return `channel:${replacement}`
    return r.startsWith(prefix) ? null : r
  }
  const refs = (values: Ref[]) => [...new Set(values.map(rewrite).filter((r): r is Ref => r !== null))]
  const progress = Object.fromEntries(Object.entries(l.progress).flatMap(([ref, value]) => {
    const next = rewrite(ref)
    return next ? [[next, value]] : []
  }))
  const reminders = l.reminders.map((id) => {
    for (const [from, to] of remap) if (id.startsWith(`${from}@`)) return `${to}${id.slice(from.length)}`
    return id
  })
  return {
    ...l,
    favourites: refs(l.favourites),
    watchlist: refs(l.watchlist),
    progress,
    watched: refs(l.watched),
    history: l.history.flatMap((h) => { const ref = rewrite(h.ref); return ref ? [{ ...h, ref }] : [] }),
    collections: l.collections.map((c) => ({ ...c, items: refs(c.items) })),
    reminders: [...new Set(reminders)],
  }
}

/** How long to wait for the saved-sources file before starting without it (and without saving over it). */
const RESTORE_TIMEOUT_MS = 5000

const toggleIn = (list: string[], item: string) => (list.includes(item) ? list.filter((x) => x !== item) : [item, ...list])

type Epg = { key: string; matches: Map<string, GuideMatch>; days: Map<number, Map<string, Programme[]>> }
const NO_DAYS = new Map<number, Map<string, Programme[]>>()

/** The real library: loaded and persisted per profile. The default profile uses kinora.library.v2 for backwards compatibility. */
export function loadProfileLibrary(profileId = 'default'): Library {
  try {
    const key = profileId === 'default' ? 'kinora.library.v2' : `kinora.library.v2.${profileId}`
    let raw = localStorage.getItem(key)
    if (!raw && profileId === 'default') {
      const old = localStorage.getItem('kinora.library.v1')
      if (old) return realLibrary({ ...emptyLibrary, ...(JSON.parse(old) as Library) })
    }
    if (raw) {
      return { ...emptyLibrary, ...(JSON.parse(raw) as Library) }
    }
  } catch {
    // Unreadable: start empty.
  }
  return emptyLibrary
}

function loadProfilePrefs(profileId: string, initialDemo: boolean): Prefs {
  const key = profileId === 'default' ? 'kinora.prefs.v2' : `kinora.prefs.v2.${profileId}`
  try {
    const raw = localStorage.getItem(key)
    if (raw) return sanitizePrefs(JSON.parse(raw))
    const defaultRaw = localStorage.getItem('kinora.prefs.v2')
    if (defaultRaw) return sanitizePrefs(JSON.parse(defaultRaw))
  } catch {}
  return { ...defaultPrefs, demoMode: initialDemo }
}

function useStoreValue(
  initialPlaylists: PlaylistSource[],
  initialGuides: GuideSource[],
  initialMappings: Mapping[],
  initialDemo: boolean,
  initialXtreamSources: XtreamSource[] = [],
  initialXtreamCatalogue: Partial<XtreamCatalogueState> = { movies: [], series: [] },
) {
  const { activeProfile, isKidsMode } = useProfiles()
  const profileId = activeProfile?.id ?? 'default'
  const clientSync = useClientSync()

  const [realLib, setRealLibState] = useState<Library>(() => loadProfileLibrary(profileId))

  useEffect(() => {
    setRealLibState(loadProfileLibrary(profileId))
  }, [profileId])

  const setRealLib = useCallback((updater: Library | ((prev: Library) => Library)) => {
    setRealLibState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      try {
        const key = profileId === 'default' ? 'kinora.library.v2' : `kinora.library.v2.${profileId}`
        localStorage.setItem(key, JSON.stringify(next))
      } catch {}
      return next
    })
  }, [profileId])

  useEffect(() => {
    try {
      const key = profileId === 'default' ? 'kinora.library.v2' : `kinora.library.v2.${profileId}`
      localStorage.setItem(key, JSON.stringify(realLib))
    } catch {}
  }, [profileId, realLib])

  const [demoLib, setDemoLib] = usePersisted<Library>('kinora.demoLibrary.v1', () => demoLibrary(Date.now()))
  const [prefs, setPrefsState] = useState<Prefs>(() => loadProfilePrefs(profileId, initialDemo))

  useEffect(() => {
    setPrefsState(loadProfilePrefs(profileId, initialDemo))
  }, [profileId, initialDemo])

  const setPrefs = useCallback((updater: Prefs | ((prev: Prefs) => Prefs)) => {
    setPrefsState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      const clean = sanitizePrefs(next)
      try {
        const key = profileId === 'default' ? 'kinora.prefs.v2' : `kinora.prefs.v2.${profileId}`
        localStorage.setItem(key, JSON.stringify(clean))
      } catch {}
      return clean
    })
  }, [profileId])
  const [setup, setSetup] = usePersisted<{ done: boolean }>('kinora.setup.v1', () => ({ done: false }))
  // `providers` (the demonstration discovery switches before D7) is dropped from older saved copies.
  const [src, setSrc] = usePersisted<SourcesState>('kinora.sources.v1', () => ({ sources: demoSources(Date.now()) }), ({ sources }) => ({ sources }))

  // Imported playlists: saved by Rust (sources.rs), never in localStorage. Restored once at start.
  const [playlists, setPlaylists] = useState<PlaylistSource[]>(() => {
    if (initialPlaylists && initialPlaylists.length > 0) return initialPlaylists
    if (!inNativeShell()) {
      try {
        const raw = localStorage.getItem('kinora.browser_playlists.v1')
        if (raw) return JSON.parse(raw)
      } catch {}
    }
    return initialPlaylists
  })
  const lastOp = useRef(0)
  useEffect(() => {
    void hydrateMetadataCredentialsFromVault().then(() => {
      const cfg = loadMetadataConfig()
      if (cfg.tmdbEnabled || cfg.tvmazeEnabled) {
        void artworkEngine.runEnrichment()
      }
    })
  }, [])
  const [restored, setRestored] = useState(() => !inNativeShell())
  const [storageNotice, setStorageNotice] = useState<StorageNotice | 'save-failed' | null>(null)
  const canSave = useRef(false)
  const lastSaved = useRef('')
  // XMLTV guides (definitions and hand-picked matches); their programmes are held by Rust.
  const [guides, setGuides] = useState<GuideSource[]>(initialGuides)
  const [mappings, setMappings] = useState<Mapping[]>(initialMappings)
  const [xtreamSources, setXtreamSources] = useState<XtreamSource[]>(initialXtreamSources)
  const [xtreamCatalogue, setXtreamCatalogue] = useState<XtreamCatalogueState>(() => ({
    movies: initialXtreamCatalogue.movies ?? [],
    series: initialXtreamCatalogue.series ?? [],
    liveStreams: initialXtreamCatalogue.liveStreams ?? [],
    liveCategories: initialXtreamCatalogue.liveCategories ?? [],
    vodCategories: initialXtreamCatalogue.vodCategories ?? [],
    seriesCategories: initialXtreamCatalogue.seriesCategories ?? [],
  }))
  const [xtreamSeriesDetails, setXtreamSeriesDetails] = useState<Record<string, XtreamSeriesDetails>>({})
  const mediaLibrary = usePersonalMediaLibrary(profileId)
  const userPreferences = useUserPreferencesStore(profileId)

  // Restore saved sources, then refresh URL sources one at a time through the guarded Rust fetcher.
  // Until a refresh succeeds a restored source's channels are listed but have no stream address.
  useEffect(() => {
    let live = true
    let timer = 0
    const timeout = new Promise<'timeout'>((resolve) => { timer = window.setTimeout(() => resolve('timeout'), RESTORE_TIMEOUT_MS) })
    void Promise.race([loadSources(), timeout])
      .then(async (loaded) => {
        if (!live || loaded === null) return // browser preview: sources stay in memory
        if (loaded === 'timeout') return setStorageNotice('unreadable') // never save over what could not be read
        setStorageNotice(loaded.notice)
        const list = loaded.sources.map(restoreSource)
        const restoredGuides = includePlaylistsInGuides(loaded.guides.map(restoreGuide), list.map((source) => source.id))
        const restoredXtream: XtreamSource[] = await Promise.all(
          (loaded.xtreamSources ?? []).map(async (source) => {
            const connected = await isXtreamConnected(source.id).catch(() => false)
            return {
              ...source,
              connected,
              server: null,
              enabled: source.enabled !== false,
            }
          }),
        )
        canSave.current = loaded.notice !== 'newer-version' && loaded.notice !== 'unreadable'
        lastSaved.current = JSON.stringify({
          sources: list.map(toSaved), guides: restoredGuides.map(toSavedGuide), mappings: loaded.mappings,
          xtreamSources: restoredXtream.map(({ id, name, addedAt, lastSuccess, movies, series, liveChannels, hasLive, hasVod, hasSeries, hasEpg, hasCatchup, status, expDate, enabled }) => ({
            id, name, addedAt, lastSuccess, movies, series,
            liveChannels: liveChannels ?? 0,
            hasLive: Boolean(hasLive),
            hasVod: Boolean(hasVod),
            hasSeries: Boolean(hasSeries),
            hasEpg: Boolean(hasEpg),
            hasCatchup: Boolean(hasCatchup),
            status: status ?? null,
            expDate: expDate ?? null,
            enabled: enabled !== false,
          })),
        })
        setPlaylists((current) => (current.length > 0 ? current : list))
        setGuides((current) => (current.length > 0 ? current : restoredGuides))
        setMappings((current) => (current.length > 0 ? current : loaded.mappings))
        setXtreamSources((current) => current.length > 0 ? current : restoredXtream)
        setRestored(true)
        // Guides: cached programmes first (local, quick), then address guides refreshed one at a time,
        // alongside the playlist refreshes. Each is bounded by fetch.rs's limits; nothing waits on them.
        void (async () => {
          const loadedSummaries = new Map(
            await Promise.all(
              loaded.guides.map(async (g) => [g.id, await loadGuide(g.id).catch(() => null)] as const),
            ),
          )
          if (!live) return
          if ([...loadedSummaries.values()].some(Boolean)) {
            setGuides((l) => l.map((x) => {
              const summary = loadedSummaries.get(x.id)
              return summary && x.status === 'saved' && !x.summary ? { ...x, summary } : x
            }))
          }
          for (const g of loaded.guides) {
            const url = g.url
            if (!live) return
            if (g.origin === 'url' && url) await runGuideImport(setGuides, g.id, ++lastOp.current, () => fetchGuide(g.id, url))
          }
        })()
        // Xtream: restore cached movie, series and live catalogues so channels, titles and artwork appear immediately after restart
        void (async () => {
          for (const xs of loaded.xtreamSources ?? []) {
            const cat = await loadXtreamCatalogue(xs.id).catch(() => null)
            if (!live || !cat) continue
            const withSource = (items: XtreamEntry[], kind: XtreamTitle['kind']): XtreamTitle[] => items.map((item) => ({ ...item, sourceId: xs.id, kind }))
            const liveWithSource = (cat.liveStreams ?? []).map((s) => ({ ...s, sourceId: xs.id }))
            const liveCatsWithSource = (cat.liveCategories ?? []).map((c) => ({ ...c, sourceId: xs.id }))
            const vodCatsWithSource = (cat.vodCategories ?? []).map((c) => ({ ...c, sourceId: xs.id }))
            const seriesCatsWithSource = (cat.seriesCategories ?? []).map((c) => ({ ...c, sourceId: xs.id }))
            setXtreamCatalogue((current) => ({
              movies: [...current.movies.filter((item) => item.sourceId !== xs.id), ...withSource(cat.movies, 'movie')],
              series: [...current.series.filter((item) => item.sourceId !== xs.id), ...withSource(cat.series, 'series')],
              liveStreams: [...current.liveStreams.filter((item) => item.sourceId !== xs.id), ...liveWithSource],
              liveCategories: [...current.liveCategories.filter((item) => item.sourceId !== xs.id), ...liveCatsWithSource],
              vodCategories: [...current.vodCategories.filter((item) => item.sourceId !== xs.id), ...vodCatsWithSource],
              seriesCategories: [...current.seriesCategories.filter((item) => item.sourceId !== xs.id), ...seriesCatsWithSource],
            }))
            if (cat.capabilities || cat.userInfo || cat.serverInfo) {
              setXtreamSources((current) => current.map((s) => s.id === xs.id ? {
                ...s,
                capabilities: cat.capabilities ?? s.capabilities,
                userInfo: cat.userInfo ?? s.userInfo,
                serverInfo: cat.serverInfo ?? s.serverInfo,
              } : s))
            }
          }
        })()
        for (const s of loaded.sources) {
          const url = s.url
          if (!live) return
          if (s.origin === 'url' && url) await runImport(setPlaylists, s.id, ++lastOp.current, () => fetchPlaylist(url))
        }
      }, () => { if (live) setStorageNotice('unreadable') })
      .finally(() => {
        window.clearTimeout(timer)
        if (live) setRestored(true)
      })
    return () => { live = false }
  }, [])

  // Save whenever what is saved changes (status changes alone do not). Never while read-only.
  useEffect(() => {
    if (!restored || !canSave.current) return
    const saved: SavedState = {
      sources: playlists.map(toSaved), guides: guides.map(toSavedGuide), mappings,
      xtreamSources: xtreamSources.map(({ id, name, addedAt, lastSuccess, movies, series, liveChannels, hasLive, hasVod, hasSeries, hasEpg, hasCatchup, status, expDate, enabled }) => ({
        id, name, addedAt, lastSuccess, movies, series,
        liveChannels: liveChannels ?? 0,
        hasLive: Boolean(hasLive),
        hasVod: Boolean(hasVod),
        hasSeries: Boolean(hasSeries),
        hasEpg: Boolean(hasEpg),
        hasCatchup: Boolean(hasCatchup),
        status: status ?? null,
        expDate: expDate ?? null,
        enabled: enabled !== false,
      })),
    }
    const json = JSON.stringify(saved)
    if (json === lastSaved.current) return
    lastSaved.current = json
    saveSources(saved).then(
      () => setStorageNotice((n) => (n === 'save-failed' ? null : n)),
      () => setStorageNotice('save-failed'),
    )
  }, [playlists, guides, mappings, xtreamSources, restored])

  const xtreamChannels = useMemo(() => {
    const list: Channel[] = []
    for (const source of xtreamSources) {
      if (source.enabled === false) continue
      const cats = new Map(
        xtreamCatalogue.liveCategories
          .filter((c) => c.sourceId === source.id)
          .map((c) => [c.id, c.name] as const),
      )
      for (const stream of xtreamCatalogue.liveStreams) {
        if (stream.sourceId !== source.id) continue
        const catName = stream.categoryId ? cats.get(stream.categoryId) : undefined
        list.push(xtreamStreamToChannel(stream, source.id, source.name, catName))
      }
    }
    return list
  }, [xtreamSources, xtreamCatalogue.liveStreams, xtreamCatalogue.liveCategories])

  // Sample content needs an explicit opt-in, and goes away as soon as there is a real source.
  const demoActive = prefs.demoMode && playlists.length === 0 && xtreamSources.length === 0
  const library = demoActive ? demoLib : realLib
  const setLibrary = demoActive ? setDemoLib : setRealLib
  const playlistChannels = useMemo(() => activeChannels(playlists, demoActive ? demoChannels : []), [playlists, demoActive])
  const allChannels = useMemo(() => [...playlistChannels, ...xtreamChannels], [playlistChannels, xtreamChannels])

  // Guide programmes, fetched from Rust one local day at a time for the matched channels only. Results
  // are keyed by what was asked, so an answer to an older question (before a refresh, a new match or a
  // playlist change) is dropped instead of replacing a newer one.
  const [today, setToday] = useState(() => startOfDay(Date.now()))
  useEffect(() => {
    const timer = window.setTimeout(() => setToday(startOfDay(Date.now())), addDays(today, 1) - Date.now() + 1000)
    return () => window.clearTimeout(timer)
  }, [today])
  const queries = useMemo(() => guideQueries(allChannels, guides, mappings), [allChannels, guides, mappings])
  const epgKey = useMemo(() => JSON.stringify([queries, guides.map((g) => g.summary?.fetchedAt ?? null)]), [queries, guides])
  const currentKey = useRef(epgKey)
  currentKey.current = epgKey
  const requested = useRef(new Set<string>())
  const [epg, setEpg] = useState<Epg>({ key: '', matches: new Map(), days: NO_DAYS })
  const requestGuideDay = useCallback((day: number) => {
    const tag = `${epgKey}|${day}`
    if (queries.length === 0 || requested.current.has(tag)) return
    requested.current.add(tag)
    guideProgrammes(queries, day, addDays(day, 1)).then((answers) => {
      if (!answers || currentKey.current !== epgKey) {
        requested.current.delete(tag)
        return
      }
      const allLoaded = answers.length > 0 && answers.every((a) => a.loaded)
      if (!allLoaded) {
        requested.current.delete(tag)
      }
      const matches = resolveMatches(allChannels, guides, mappings, answers)
      setEpg((e) => {
        const days = new Map(e.key === epgKey ? e.days : NO_DAYS)
        days.set(day, programmesFor(matches, answers))
        return { key: epgKey, matches, days }
      })
    }, () => { requested.current.delete(tag) })
  }, [epgKey, queries, allChannels, guides, mappings])
  useEffect(() => {
    requestGuideDay(today)
    requestGuideDay(addDays(today, 1))
  }, [requestGuideDay, today])
  const current = epg.key === epgKey
  const unloadedMatches = useMemo(() => resolveMatches(allChannels, guides, mappings, []), [allChannels, guides, mappings])
  const hasPreviousEpg = queries.length > 0 && epg.days.size > 0
  const days = current ? epg.days : (hasPreviousEpg ? epg.days : NO_DAYS)
  const matches = useMemo(() => {
    if (current) return epg.matches
    if (!hasPreviousEpg) return unloadedMatches
    const merged = new Map(unloadedMatches)
    for (const [id, m] of epg.matches) {
      if (unloadedMatches.get(id)?.state === 'no-data') merged.set(id, m)
    }
    return merged
  }, [current, hasPreviousEpg, epg.matches, unloadedMatches])
  const findXtreamMovie = useCallback(
    (sourceId: string, id: string | number): XtreamTitle | undefined => {
      return xtreamCatalogue.movies.find((m) => m.sourceId === sourceId && (m.id === id || String(m.id) === String(id)))
    },
    [xtreamCatalogue.movies],
  )
  const findXtreamSeries = useCallback(
    (sourceId: string, id: string | number): XtreamTitle | undefined => {
      return xtreamCatalogue.series.find((s) => s.sourceId === sourceId && (s.id === id || String(s.id) === String(id)))
    },
    [xtreamCatalogue.series],
  )
  const findXtreamEpisode = useCallback(
    (sourceId: string, seriesId: string | number, episodeId: string | number): (XtreamEpisode & { seasonNumber: number }) | undefined => {
      const details = xtreamSeriesDetails[`${sourceId}:${seriesId}`]
      if (!details?.seasons) return undefined
      for (const season of details.seasons) {
        const ep = season.episodes.find((e) => e.id === episodeId || String(e.id) === String(episodeId))
        if (ep) return { ...ep, seasonNumber: season.number }
      }
      return undefined
    },
    [xtreamSeriesDetails],
  )

  const allSources = useMemo(() => [
    ...playlists.map((p) => ({ id: p.id, name: p.name, origin: p.origin })),
    ...xtreamSources.map((x) => ({ id: x.id, name: x.name, origin: 'xtream' })),
  ], [playlists, xtreamSources])

  const clientChannels = useMemo<Channel[]>(() => {
    if (clientSync.status !== 'connected' || clientSync.channels.length === 0) return []
    return clientSync.channels.map((c, idx) => ({
      id: c.id,
      name: c.name,
      number: c.number ?? idx + 1,
      group: c.group ?? 'Server Channels',
      categories: c.group ? [c.group] : ['General'],
      logoUrl: c.logo || null,
      mark: { text: c.name.slice(0, 3).toUpperCase(), tone: 'accent' },
      streamUrl: `client-sync://${c.id}`,
      streamDisplay: 'Kinora Server Stream',
      hd: true,
      sourceId: 'kinora-server',
      tvgId: null,
      isRadio: false,
      resolution: 'HD',
    }))
  }, [clientSync.status, clientSync.channels])

  const rawChannels = useMemo(() => {
    if (clientSync.status === 'connected' && clientChannels.length > 0) {
      return clientChannels
    }
    return demoActive ? playlistChannels : combineChannels(allChannels, allSources, matches)
  }, [clientSync.status, clientChannels, demoActive, playlistChannels, allChannels, allSources, matches])
  const channels = useMemo(
    () => isKidsMode ? filterKidSafeChannels(rawChannels, true) : rawChannels,
    [rawChannels, isKidsMode],
  )
  const channelIndex = useMemo(() => new Map(channels.flatMap((c) => [c.id, ...(c.memberIds ?? [])].map((id) => [id, c] as const))), [channels])
  const findChannel = useCallback((id: string): Channel | undefined => channelIndex.get(id), [channelIndex])

  useEffect(() => {
    if (channels.length > 0 && clientSync.status !== 'connected') {
      const summaries = channels.slice(0, 300).map((c) => ({
        id: c.id,
        name: c.name,
        number: c.number,
        group: c.group,
        logo: c.logoUrl,
        streamUrl: c.streamUrl ?? undefined,
      }))
      void updateRemoteChannels(summaries)
    }
  }, [channels, clientSync.status])

  useEffect(() => {
    if (playlists.length > 0) {
      const srcSummaries = playlists.map((p) => ({
        id: p.id,
        label: p.label,
        origin: p.origin === 'url' ? (p.url || p.label) : p.label,
        channelCount: p.channels.length,
        kind: 'playlist',
      }))
      void updateRemoteSources(srcSummaries)
    }
  }, [playlists])

  useEffect(() => {
    const watchProgress = Object.entries(library.progress || {}).map(([ref, p]) => ({
      itemRef: ref,
      title: ref,
      position: p.pos,
      duration: p.dur,
      updatedAt: p.at,
    }))
    void updateRemoteLibrary({
      favourites: library.favourites || [],
      watchlist: library.watchlist || [],
      watchProgress,
    })
  }, [library])

  const getPreferredServer = useCallback(
    (channel: Channel): StreamVariant | undefined => {
      const options = channel.streamOptions ?? []
      if (options.length === 0) return undefined
      const savedId = userPreferences.preferences.preferredServers?.[channel.id]
      if (savedId) {
        const found = options.find((opt) => opt.id === savedId)
        if (found) return found
      }
      return options[0]
    },
    [userPreferences.preferences.preferredServers],
  )
  const guide = useMemo(() => {
    const listed = (c: Channel, day: number) => {
      const programmes = days.get(day)
      if (!programmes) return []
      for (const id of c.memberIds ?? [c.id]) {
        const found = programmes.get(id)
        if (found?.length) return found.map((p) => ({ ...p, channelId: c.id, id: `${c.id}@${p.start}` }))
      }
      return []
    }
    const channelMatch = (c: Channel) => (c.memberIds ?? [c.id]).map((id) => matches.get(id)).find((m) => m?.state === 'matched') ?? matches.get(c.id)
    return {
      /** Programmes overlapping the local day starting at `day`: generated for demo channels, from guides otherwise. */
      schedule: (c: Channel, day: number): Programme[] => {
        const progs = c.sourceId === null ? demoSchedule(c, day) : listed(c, day)
        return isKidsMode ? filterKidSafeProgrammes(progs, true) : progs
      },
      programmeAt: (c: Channel, t: number): Programme | undefined => {
        const prog = c.sourceId === null ? demoAt(c, t) : listed(c, startOfDay(t)).find((p) => p.start <= t && t < p.stop)
        if (!prog) return undefined
        if (isKidsMode && !isProgrammeKidSafe(prog)) return undefined
        return prog
      },
      nextProgramme: (c: Channel, t: number): Programme | undefined => {
        if (c.sourceId === null) {
          const next = demoNext(c, t)
          return isKidsMode && next && !isProgrammeKidSafe(next) ? undefined : next
        }
        const day = startOfDay(t)
        const candidates = [...listed(c, day), ...listed(c, addDays(day, 1))]
        const found = candidates.find((p) => p.start > t)
        if (!found) return undefined
        if (isKidsMode && !isProgrammeKidSafe(found)) return undefined
        return found
      },
      /** Why a playlist channel has guide data or not; `undefined` for demo channels. */
      guideMatch: (c: Channel): GuideMatch | undefined => channelMatch(c),
      /** False while a day's programmes are still being fetched. */
      guideDayLoaded: (day: number) => queries.length === 0 || days.has(day),
      requestGuideDay,
    }
  }, [days, isKidsMode, matches, queries, requestGuideDay])
  const playlistActions = useMemo(() => {
    const run = (id: string, load: () => Promise<PlaylistReport | null>) => runImport(setPlaylists, id, ++lastOp.current, load)
    return {
      addPlaylist: (input: { name: string; origin: PlaylistSource['origin']; url: string | null; label: string }, report: PlaylistReport) => {
        const id = `pl-${Date.now().toString(36)}-${(++lastOp.current).toString(36)}`
        setPlaylists((l) => [...l, createSource(id, input, report, Date.now())])
        setGuides((l) => includePlaylistsInGuides(l, [id]))
        return id
      },
      refreshPlaylist: (source: PlaylistSource) => (source.url ? run(source.id, () => fetchPlaylist(source.url ?? '')) : Promise.resolve()),
      cancelRefreshPlaylist: (id: string) => {
        const nextOp = ++lastOp.current
        setPlaylists((l) => l.map((s) => s.id === id ? { ...s, status: s.lastSuccess ? 'parsed' : 'failed', op: nextOp, error: 'Refresh cancelled' } : s))
      },
      reimportPlaylist: (id: string, file: File) => {
        setPlaylists((l) => l.map((s) => (s.id === id ? { ...s, label: fileLabel(file.name) } : s)))
        return run(id, () => readPlaylistFile(file))
      },
      removePlaylist: (id: string) => {
        const remaining = playlists.filter((s) => s.id !== id)
        const remainingRaw = activeChannels(remaining, demoActive ? demoChannels : [])
        const remainingSources = [
          ...remaining.map((p) => ({ id: p.id, name: p.name, origin: p.origin })),
          ...xtreamSources.map((x) => ({ id: x.id, name: x.name, origin: 'xtream' })),
        ]
        const remainingCombined = combineChannels(remainingRaw, remainingSources, matches)
        const remap = new Map<string, string>()
        for (const channel of channels) {
          const members = channel.memberIds ?? [channel.id]
          const survivor = remainingCombined.find((candidate) => (candidate.memberIds ?? [candidate.id]).some((member) => members.includes(member)))
          if (!survivor) continue
          for (const member of members) if (member.startsWith(`${id}~`)) remap.set(member, survivor.id)
          if (channel.id.startsWith(`${id}~`)) remap.set(channel.id, survivor.id)
        }
        setPlaylists((l) => removeSource(l, id))
        setRealLib((l) => dropSourceRefs(l, id, remap))
        setGuides((l) => l.map((g) => (g.playlists.includes(id) ? { ...g, playlists: g.playlists.filter((p) => p !== id) } : g)))
        setMappings((l) => l.filter((m) => !m.channel.startsWith(`${id}~`)))
      },
    }
  }, [channels, demoActive, matches, playlists, setRealLib])
  const xtreamActions = useMemo(() => {
    const replaceCatalogue = (sourceId: string, catalogue: XtreamCatalogue) => {
      const withSource = (items: XtreamEntry[], kind: XtreamTitle['kind']): XtreamTitle[] => {
        const seen = new Set<string | number>()
        const list: XtreamTitle[] = []
        for (const item of items) {
          if (!seen.has(item.id)) {
            seen.add(item.id)
            list.push({ ...item, sourceId, kind })
          }
        }
        return list
      }
      const liveWithSource = (catalogue.liveStreams ?? []).map((s) => ({ ...s, sourceId }))
      const liveCatsWithSource = (catalogue.liveCategories ?? []).map((c) => ({ ...c, sourceId }))
      const vodCatsWithSource = (catalogue.vodCategories ?? []).map((c) => ({ ...c, sourceId }))
      const seriesCatsWithSource = (catalogue.seriesCategories ?? []).map((c) => ({ ...c, sourceId }))

      setXtreamCatalogue((current) => ({
        movies: [...current.movies.filter((item) => item.sourceId !== sourceId), ...withSource(catalogue.movies, 'movie')],
        series: [...current.series.filter((item) => item.sourceId !== sourceId), ...withSource(catalogue.series, 'series')],
        liveStreams: [...current.liveStreams.filter((item) => item.sourceId !== sourceId), ...liveWithSource],
        liveCategories: [...current.liveCategories.filter((item) => item.sourceId !== sourceId), ...liveCatsWithSource],
        vodCategories: [...current.vodCategories.filter((item) => item.sourceId !== sourceId), ...vodCatsWithSource],
        seriesCategories: [...current.seriesCategories.filter((item) => item.sourceId !== sourceId), ...seriesCatsWithSource],
      }))

      setXtreamSources((current) => current.map((source) => source.id === sourceId
        ? {
            ...source,
            connected: true,
            lastSuccess: Date.now(),
            movies: catalogue.movies.length,
            series: catalogue.series.length,
            liveChannels: catalogue.liveStreams?.length ?? 0,
            hasLive: Boolean(catalogue.capabilities?.hasLive ?? (catalogue.liveStreams?.length ?? 0) > 0),
            hasVod: Boolean(catalogue.capabilities?.hasVod ?? catalogue.movies.length > 0),
            hasSeries: Boolean(catalogue.capabilities?.hasSeries ?? catalogue.series.length > 0),
            hasEpg: Boolean(catalogue.capabilities?.hasEpg),
            hasCatchup: Boolean(catalogue.capabilities?.hasCatchup),
            status: catalogue.userInfo?.status ?? source.status,
            expDate: catalogue.userInfo?.expDate ?? source.expDate,
            capabilities: catalogue.capabilities ?? source.capabilities,
            userInfo: catalogue.userInfo ?? source.userInfo,
            serverInfo: catalogue.serverInfo ?? source.serverInfo,
          }
        : source))
    }
    return {
      addXtreamSource: (source: XtreamSource, catalogue: XtreamCatalogue) => {
        setXtreamSources((current) => [...current.filter((saved) => saved.id !== source.id), source])
        replaceCatalogue(source.id, catalogue)
      },
      refreshXtreamSource: async (sourceId: string) => {
        const catalogue = await refreshXtream(sourceId)
        if (!catalogue) throw new Error('Connect to a provider in the Kinora desktop app first.')
        replaceCatalogue(sourceId, catalogue)
      },
      toggleXtreamSource: (sourceId: string, enabled?: boolean) => {
        setXtreamSources((current) => current.map((s) => s.id === sourceId ? { ...s, enabled: enabled ?? !s.enabled } : s))
      },
      loadXtreamSeries: async (sourceId: string, seriesId: string) => {
        const details = await loadXtreamSeries(sourceId, seriesId)
        if (!details) throw new Error('Connect to this provider in the Kinora desktop app to load episodes.')
        setXtreamSeriesDetails((current) => ({ ...current, [`${sourceId}:${seriesId}`]: details }))
        return details
      },
      loadXtreamVodDetails: async (sourceId: string, vodId: string) => {
        return loadXtreamVodDetails(sourceId, vodId)
      },
      loadXtreamEpg: async (sourceId: string, streamId: string) => {
        return loadXtreamEpg(sourceId, streamId)
      },
      removeXtreamSource: async (sourceId: string) => {
        await disconnectXtream(sourceId)
        setXtreamSources((current) => current.filter((source) => source.id !== sourceId))
        setXtreamCatalogue((current) => ({
          movies: current.movies.filter((item) => item.sourceId !== sourceId),
          series: current.series.filter((item) => item.sourceId !== sourceId),
          liveStreams: current.liveStreams.filter((item) => item.sourceId !== sourceId),
          liveCategories: current.liveCategories.filter((item) => item.sourceId !== sourceId),
          vodCategories: current.vodCategories.filter((item) => item.sourceId !== sourceId),
          seriesCategories: current.seriesCategories.filter((item) => item.sourceId !== sourceId),
        }))
        setXtreamSeriesDetails((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${sourceId}:`))))
      },
    }
  }, [])
  // The public source catalogue (Discovery). Only read when Discovery opens, never at startup, so a
  // missing network never touches anything else.
  const [catalogue, setCatalogue] = useState<CatalogueState>(idleCatalogue)
  const catalogueOp = useRef(0)
  const catalogueOpened = useRef(false)
  const catalogueBusy = useRef(false)
  const catalogueActions = useMemo(() => {
    const refresh = async () => {
      if (catalogueBusy.current) return // one refresh at a time
      catalogueBusy.current = true
      try {
        await runCatalogue(setCatalogue, ++catalogueOp.current, refreshCatalogue)
      } finally {
        catalogueBusy.current = false
      }
    }
    return {
      /** The cached copy first, then a refresh when there is none or it is out of date. Once per session. */
      openCatalogue: async () => {
        if (catalogueOpened.current) return
        catalogueOpened.current = true
        const op = ++catalogueOp.current
        setCatalogue((s) => ({ ...s, status: 'loading', op }))
        const cached = await loadCatalogue().catch(() => null)
        if (catalogueOp.current !== op) return
        if (cached) setCatalogue({ status: 'ready', catalogue: cached, error: null, op })
        if (!cached || isStale(cached, Date.now())) await refresh()
      },
      refreshCatalogue: refresh,
    }
  }, [])

  const guideActions = useMemo(() => {
    const run = (id: string, load: () => Promise<GuideSummary | null>) => runGuideImport(setGuides, id, ++lastOp.current, load)
    return {
      /** `id` is the one the guide was read under in Add Source, so Rust already holds its programmes. */
      addGuide: (id: string, input: { name: string; origin: GuideSource['origin']; url: string | null; label: string; playlists: string[] }, summary: GuideSummary) =>
        setGuides((l) => [...l, createGuide(id, input, summary, Date.now())]),
      /** Ignored while the guide is already updating, so refreshes never pile up. */
      refreshGuide: (g: GuideSource) => {
        const url = g.url
        return g.status === 'importing' || !url ? Promise.resolve() : run(g.id, () => fetchGuide(g.id, url))
      },
      reimportGuide: (id: string, file: File) => {
        setGuides((l) => l.map((g) => (g.id === id ? { ...g, label: fileLabel(file.name) } : g)))
        return run(id, () => readGuideFile(id, file))
      },
      removeGuide: (id: string) => {
        setGuides((l) => l.filter((g) => g.id !== id))
        setMappings((l) => l.filter((m) => m.guide !== id))
        void forgetGuide(id).catch(() => undefined) // its cache is also pruned at the next start
      },
      setGuidePlaylists: (id: string, playlists: string[]) => setGuides((l) => l.map((g) => (g.id === id ? { ...g, playlists } : g))),
      setMapping: (channel: string, guide: string, xmltvId: string) => {
        const target = findChannel(channel)
        const members = target?.memberIds ?? [channel]
        setMappings((l) => [
          ...l.filter((m) => !members.includes(m.channel)),
          ...members.map((member) => ({ channel: member, guide, xmltvId })),
        ])
      },
      clearMapping: (channel: string) => {
        const target = findChannel(channel)
        const members = target?.memberIds ?? [channel]
        setMappings((l) => l.filter((m) => !members.includes(m.channel)))
      },
    }
  }, [findChannel])

  const keepHistory = prefs.keepHistory
  const setPref = useCallback(<K extends keyof Prefs>(key: K, value: Prefs[K]) => setPrefs((p) => ({ ...p, [key]: value })), [setPrefs])

  const actions = useMemo(() => ({
    toggleFavourite: (ref: Ref) => {
      setLibrary((l) => ({ ...l, favourites: toggleIn(l.favourites, ref) }))
      if (clientSync.status === 'connected') {
        void clientSync.toggleLibraryItem('toggle_favourite', String(ref))
      }
    },
    toggleWatchlist: (ref: Ref) => {
      setLibrary((l) => ({ ...l, watchlist: toggleIn(l.watchlist, ref) }))
      if (clientSync.status === 'connected') {
        void clientSync.toggleLibraryItem('toggle_watchlist', String(ref))
      }
    },
    setWatched: (refs: Ref[], watched: boolean) =>
      setLibrary((l) => {
        const rest = l.watched.filter((r) => !refs.includes(r))
        const progress = { ...l.progress }
        if (watched) for (const r of refs) delete progress[r]
        return { ...l, watched: watched ? [...refs, ...rest] : rest, progress }
      }),
    setProgress: (ref: Ref, pos: number, dur: number) => {
      setLibrary((l) => ({ ...l, progress: { ...l.progress, [ref]: { pos, dur, at: Date.now() } } }))
      if (clientSync.status === 'connected') {
        void clientSync.syncWatchProgress(String(ref), String(ref), pos, dur)
      }
    },
    removeProgress: (ref: Ref) =>
      setLibrary((l) => {
        const progress = { ...l.progress }
        delete progress[ref]
        return { ...l, progress }
      }),
    restoreProgress: (ref: Ref, p: Progress) =>
      setLibrary((l) => ({ ...l, progress: { ...l.progress, [ref]: p } })),
    recordView: (ref: Ref) => {
      if (!keepHistory) return
      setLibrary((l) => (l.history[0]?.ref === ref ? l : { ...l, history: [{ ref, at: Date.now() }, ...l.history.filter((h) => h.ref !== ref)].slice(0, 100) }))
    },
    removeHistory: (ref: Ref) => setLibrary((l) => ({ ...l, history: l.history.filter((h) => h.ref !== ref) })),
    clearHistory: () => setLibrary((l) => ({ ...l, history: [], progress: {} })),
    createCollection: (name: string, items: Ref[] = [], description = '') => {
      const id = `c-${Date.now().toString(36)}`
      setLibrary((l) => ({ ...l, collections: [...l.collections, { id, name, description, items, createdAt: Date.now() }] }))
      return id
    },
    renameCollection: (id: string, name: string, description?: string) =>
      setLibrary((l) => ({ ...l, collections: l.collections.map((c) => (c.id === id ? { ...c, name, ...(description !== undefined ? { description } : {}) } : c)) })),
    deleteCollection: (id: string) => setLibrary((l) => ({ ...l, collections: l.collections.filter((c) => c.id !== id) })),
    toggleInCollection: (id: string, ref: Ref) =>
      setLibrary((l) => ({ ...l, collections: l.collections.map((c) => (c.id === id ? { ...c, items: toggleIn(c.items, ref) } : c)) })),
    addCollectionItem: (id: string, ref: Ref) =>
      setLibrary((l) => ({ ...l, collections: l.collections.map((c) => (c.id === id && !c.items.includes(ref) ? { ...c, items: [...c.items, ref] } : c)) })),
    removeCollectionItem: (id: string, ref: Ref) =>
      setLibrary((l) => ({ ...l, collections: l.collections.map((c) => (c.id === id ? { ...c, items: c.items.filter((item) => item !== ref) } : c)) })),
    reorderCollectionItems: (id: string, items: Ref[]) =>
      setLibrary((l) => ({ ...l, collections: l.collections.map((c) => (c.id === id ? { ...c, items } : c)) })),
    toggleReminder: (programmeId: string) => setLibrary((l) => ({ ...l, reminders: toggleIn(l.reminders, programmeId) })),
    addRecentSearch: (q: string) =>
      setLibrary((l) => ({ ...l, recentSearches: [q, ...l.recentSearches.filter((s) => s.toLowerCase() !== q.toLowerCase())].slice(0, 8) })),
    removeRecentSearch: (q: string) => setLibrary((l) => ({ ...l, recentSearches: l.recentSearches.filter((s) => s !== q) })),
    clearRecentSearches: () => setLibrary((l) => ({ ...l, recentSearches: [] })),
    importLibrary: (lib: Library) => setLibrary(lib),
    importPrefs: (p: Partial<Prefs>) => setPrefs((prev) => ({ ...prev, ...p })),
    /** Empties the library in use; in sample mode, puts the sample activity back instead when asked. */
    resetLibrary: (to: 'empty' | 'demo') => setLibrary(to === 'empty' ? emptyLibrary : demoLibrary(Date.now())),
    resetPrefs: () => setPrefs(defaultPrefs),
    addSource: (s: Source) => setSrc((x) => ({ ...x, sources: [...x.sources, s] })),
    removeSource: (id: string) => setSrc((x) => ({ ...x, sources: x.sources.filter((s) => s.id !== id) })),
    queueRefresh: (id: string) => setSrc((x) => ({ ...x, sources: x.sources.map((s) => (s.id === id ? { ...s, status: 'queued' as const } : s)) })),
    resetSources: () => setSrc({ sources: demoSources(Date.now()) }),
  }), [setLibrary, setPrefs, setSrc, keepHistory])

  // DVR State & Actions
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [seriesRules, setSeriesRules] = useState<SeriesRule[]>([])
  const [dvrConfig, setDvrConfig] = useState<DvrConfig | null>(null)
  const [dvrStorageInfo, setDvrStorageInfo] = useState<StorageInfo | null>(null)

  useEffect(() => {
    registerRecordingLookup((id) => recordings.find((r) => r.id === id))
  }, [recordings])

  useEffect(() => {
    registerResourceLookup((id) => {
      const clean = id.replace(/^res:/, '')
      return mediaLibrary.allResources.find((r) => r.id === clean || r.id === id)
    })
  }, [mediaLibrary.allResources])

  const refreshDvrState = useCallback(async () => {
    try {
      const [recs, rules, cfg, storage] = await Promise.all([
        dvrGetRecordings(),
        dvrGetRules(),
        dvrGetConfig(),
        dvrGetStorageInfo(),
      ])
      setRecordings(recs)
      setSeriesRules(rules)
      setDvrConfig(cfg)
      setDvrStorageInfo(storage)
    } catch {
      // Ignore errors in non-native environments
    }
  }, [])

  useEffect(() => {
    void refreshDvrState()
  }, [refreshDvrState])

  const dvrActions = useMemo(() => ({
    refreshDvrState,
    startRecording: async (
      channelId: string,
      channelName: string,
      title: string,
      opts?: { channelLogo?: string | null; programmeId?: string | null; description?: string | null; durationSecs?: number },
    ) => {
      const rec = await dvrStartRecording(channelId, channelName, title, opts)
      await refreshDvrState()
      return rec
    },
    stopRecording: async (recordingId: string) => {
      const rec = await dvrStopRecording(recordingId)
      await refreshDvrState()
      return rec
    },
    scheduleRecording: async (
      channelId: string,
      channelName: string,
      title: string,
      startTime: number,
      endTime: number,
      opts?: { channelLogo?: string | null; programmeId?: string | null; description?: string | null; paddingStart?: number; paddingEnd?: number; seriesRuleId?: string | null },
    ) => {
      const rec = await dvrScheduleRecording(channelId, channelName, title, startTime, endTime, opts)
      await refreshDvrState()
      return rec
    },
    cancelRecording: async (recordingId: string) => {
      const rec = await dvrCancelRecording(recordingId)
      await refreshDvrState()
      return rec
    },
    deleteRecording: async (recordingId: string, deleteFiles = true) => {
      await dvrDeleteRecording(recordingId, deleteFiles)
      await refreshDvrState()
    },
    protectRecording: async (recordingId: string, isProtected: boolean) => {
      const rec = await dvrProtectRecording(recordingId, isProtected)
      await refreshDvrState()
      return rec
    },
    saveSeriesRule: async (rule: SeriesRule) => {
      const saved = await dvrSaveRule(rule)
      await refreshDvrState()
      return saved
    },
    deleteSeriesRule: async (ruleId: string) => {
      await dvrDeleteRule(ruleId)
      await refreshDvrState()
    },
    updateDvrConfig: async (config: DvrConfig) => {
      const updated = await dvrSaveConfig(config)
      await refreshDvrState()
      return updated
    },
    getRecordingForProgramme: (programmeId?: string, channelId?: string, startTimeMs?: number) => {
      const startSecs = startTimeMs ? Math.floor(startTimeMs / 1000) : undefined
      return recordings.find((r) => {
        if (r.status === 'cancelled' || r.status === 'failed') return false
        if (programmeId && r.programmeId === programmeId) return true
        if (channelId && startSecs !== undefined && r.channelId === channelId && Math.abs(r.startTime - startSecs) < 120) return true
        return false
      })
    },
  }), [refreshDvrState, recordings, clientSync])

  return {
    library, prefs, setPref, sources: demoActive ? src.sources : [], ...actions, catalogue, ...catalogueActions,
    setupDone: setup.done || playlists.length > 0 || guides.length > 0 || xtreamSources.length > 0,
    finishSetup: () => setSetup({ done: true }),
    restartSetup: () => setSetup({ done: false }),
    playlists, ...playlistActions, restored, storageNotice, guides, mappings, ...guideActions, ...guide,
    activeProfile,
    isKidsMode,
    xtreamSources,
    xtreamCatalogue: isKidsMode
      ? {
          ...xtreamCatalogue,
          movies: filterKidSafeXtreamTitles(xtreamCatalogue.movies, true),
          series: filterKidSafeXtreamTitles(xtreamCatalogue.series, true),
        }
      : xtreamCatalogue,
    xtreamSeriesDetails, ...xtreamActions,
    recordings,
    seriesRules,
    dvrConfig,
    dvrStorageInfo,
    ...dvrActions,
    /** The channel catalogue every screen shows: playlist channels, the sample set in sample mode, or nothing. */
    channels,
    /** Total raw channel entries across all imported playlists before cross-playlist deduplication. */
    totalPlaylistEntries: (playlists.length > 0 ? playlistChannels.length : 0) + xtreamChannels.length,
    findChannel,
    getPreferredServer,
    setPreferredServer: userPreferences.setPreferredServer,
    resetPreferredServer: userPreferences.resetPreferredServer,
    autoFallbackEnabled: userPreferences.preferences.autoFallbackEnabled ?? true,
    setAutoFallbackEnabled: userPreferences.setAutoFallbackEnabled,
    findXtreamMovie,
    findXtreamSeries,
    findXtreamEpisode,
    channelMode: (playlists.length > 0 || xtreamChannels.length > 0) ? 'playlists' as const : demoActive ? 'demo' as const : 'none' as const,
    /** The fictional films and series exist only in sample mode. */
    demoTitles: demoActive,
    mediaLibrary,
    userPreferences,
  }
}

type Store = ReturnType<typeof useStoreValue>
export const StoreContext = createContext<Store | null>(null)

/** The `initial…` props seed imported playlists, guides, matches and sample mode for tests; the app always starts with none. */
export function StoreProvider({
  children,
  initialPlaylists = [],
  initialGuides = [],
  initialMappings = [],
  initialDemo = false,
  initialXtreamSources = [],
  initialXtreamCatalogue = { movies: [], series: [] },
}: {
  children: ReactNode
  initialPlaylists?: PlaylistSource[]
  initialGuides?: GuideSource[]
  initialMappings?: Mapping[]
  initialDemo?: boolean
  initialXtreamSources?: XtreamSource[]
  initialXtreamCatalogue?: Partial<XtreamCatalogueState>
}) {
  const store = useStoreValue(initialPlaylists, initialGuides, initialMappings, initialDemo, initialXtreamSources, initialXtreamCatalogue)
  useEffect(() => {
    ;(window as unknown as { __kinora_store?: Store }).__kinora_store = store
    return () => {
      delete (window as unknown as { __kinora_store?: Store }).__kinora_store
    }
  }, [store])
  // Wait for the saved sources (a local file) so an empty Home never flashes before real channels.
  return (
    <StoreContext.Provider value={store}>
      {store.restored ? <PlaybackProvider>{children}</PlaybackProvider> : null}
    </StoreContext.Provider>
  )
}

export function useStore(): Store {
  const s = useContext(StoreContext)
  if (!s) throw new Error('useStore must be used inside <StoreProvider>')
  return s
}

/** Fraction watched for a ref, or null if never started. */
export function progressOf(library: Library, ref: Ref): number | null {
  const p = library.progress[ref]
  return p && p.dur > 0 ? Math.min(1, p.pos / p.dur) : null
}
