import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { addDays, channels as demoChannels, nextProgramme as demoNext, programmeAt as demoAt, scheduleFor as demoSchedule, startOfDay } from '../data/channels'
import { demoProviders, demoSources } from '../data/sources'
import type { Channel, DiscoveryProvider, Programme, Source } from '../data/types'
import {
  fetchGuide, fetchPlaylist, guideProgrammes, inNativeShell, loadGuide, loadSources, readGuideFile, readPlaylistFile, removeGuide as forgetGuide, saveSources,
  type GuideSummary, type PlaylistReport, type SavedState, type StorageNotice,
} from '../lib/native'
import { createGuide, guideQueries, programmesFor, resolveMatches, restoreGuide, runGuideImport, toSavedGuide, type GuideMatch, type GuideSource, type Mapping } from './guides'
import { ACCENTS, THEME_BG, safeHex, type AccentName, type ThemeName } from '../lib/theme'
import { activeChannels, createSource, fileLabel, removeSource, restoreSource, runImport, toSaved, type PlaylistSource } from './playlists'

/** `movie:<id>`, `series:<id>`, `channel:<id>` or `episode:<seriesId>/<episodeId>` */
export type Ref = string

export interface Progress { pos: number; dur: number; at: number }
export interface Collection { id: string; name: string; items: Ref[]; createdAt: number }

export interface Library {
  favourites: Ref[]
  watchlist: Ref[]
  progress: Record<Ref, Progress>
  watched: Ref[]
  history: { ref: Ref; at: number }[]
  collections: Collection[]
  reminders: string[]
  recentSearches: string[]
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
  hardwareDecoding: boolean
  skipIntros: boolean
  audioLanguage: string
  audioOutput: 'stereo' | 'surround'
  dialogueBoost: boolean
  normaliseVolume: boolean
  subtitles: boolean
  subtitleLanguage: string
  subtitleSize: 'small' | 'medium' | 'large'
  subtitleStyle: 'shadow' | 'outline' | 'boxed'
  timeFormat: '24h' | '12h'
  guideZoom: 2 | 3 | 4
  guideArt: boolean
  guideStart: 'now' | 'day'
}

/** Source-checking settings removed in D3.1: nothing used them. Stripped from saved prefs so they stop being stored. */
type RemovedPrefs = { autoRefresh?: unknown; refreshInterval?: unknown; validateOnAdd?: unknown; dropAfterFailures?: unknown; parallelChecks?: unknown }

const DAY = 86_400_000

export const defaultPrefs: Prefs = {
  theme: 'dark', accent: 'red', customAccent: '#d6202e', density: 'comfortable', textSize: 'standard', reduceMotion: false, movieLayout: 'poster', hideWatched: false, keepHistory: true,
  autoplayNext: true, resume: 'resume', quality: 'auto', hardwareDecoding: true, skipIntros: false,
  audioLanguage: 'English', audioOutput: 'stereo', dialogueBoost: false, normaliseVolume: true,
  subtitles: false, subtitleLanguage: 'English', subtitleSize: 'medium', subtitleStyle: 'shadow',
  timeFormat: '24h', guideZoom: 3, guideArt: true, guideStart: 'now',
}

export const emptyLibrary: Library = {
  favourites: [], watchlist: [], progress: {}, watched: [], history: [], collections: [], reminders: [], recentSearches: [],
}

/** Sample activity so the library screens have something to show. Clearly reset-able from Settings > Data. */
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
      { ref: 'channel:pitchside', at: now - 2.1 * DAY },
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

interface SourcesState { sources: Source[]; providers: DiscoveryProvider[] }

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
  const { autoRefresh: _a, refreshInterval: _r, validateOnAdd: _v, dropAfterFailures: _d, parallelChecks: _p, ...p } = stored
  const pick = <K extends keyof Prefs>(key: K, allowed: readonly Prefs[K][]) => (allowed.includes(p[key]) ? p[key] : defaultPrefs[key])
  return {
    ...p,
    theme: pick('theme', Object.keys(THEME_BG) as ThemeName[]),
    accent: pick('accent', [...(Object.keys(ACCENTS) as AccentName[]), 'custom']),
    customAccent: safeHex(p.customAccent) ?? defaultPrefs.customAccent,
    density: pick('density', ['compact', 'comfortable', 'spacious']),
  }
}

/** Removes one playlist source's channels from favourites, watchlist, history and collections; nothing else. */
export function dropSourceRefs(l: Library, sourceId: string): Library {
  const prefix = `channel:${sourceId}~`
  const keep = (r: Ref) => !r.startsWith(prefix)
  return {
    ...l,
    favourites: l.favourites.filter(keep),
    watchlist: l.watchlist.filter(keep),
    history: l.history.filter((h) => keep(h.ref)),
    collections: l.collections.map((c) => ({ ...c, items: c.items.filter(keep) })),
  }
}

/** How long to wait for the saved-sources file before starting without it (and without saving over it). */
const RESTORE_TIMEOUT_MS = 5000

const toggleIn = (list: string[], item: string) => (list.includes(item) ? list.filter((x) => x !== item) : [item, ...list])

type Epg = { key: string; matches: Map<string, GuideMatch>; days: Map<number, Map<string, Programme[]>> }
const NO_DAYS = new Map<number, Map<string, Programme[]>>()

function useStoreValue(initialPlaylists: PlaylistSource[], initialGuides: GuideSource[], initialMappings: Mapping[]) {
  const [library, setLibrary] = usePersisted<Library>('kinora.library.v1', () => demoLibrary(Date.now()))
  const [prefs, setPrefs] = usePersisted<Prefs>('kinora.prefs.v2', () => defaultPrefs, sanitizePrefs)
  const [src, setSrc] = usePersisted<SourcesState>('kinora.sources.v1', () => ({ sources: demoSources(Date.now()), providers: demoProviders }))

  // Imported playlists: saved by Rust (sources.rs), never in localStorage. Restored once at start.
  const [playlists, setPlaylists] = useState<PlaylistSource[]>(initialPlaylists)
  const lastOp = useRef(0)
  const [restored, setRestored] = useState(() => !inNativeShell())
  const [storageNotice, setStorageNotice] = useState<StorageNotice | 'save-failed' | null>(null)
  const canSave = useRef(false)
  const lastSaved = useRef('')
  // XMLTV guides (definitions and hand-picked matches); their programmes are held by Rust.
  const [guides, setGuides] = useState<GuideSource[]>(initialGuides)
  const [mappings, setMappings] = useState<Mapping[]>(initialMappings)

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
        const restoredGuides = loaded.guides.map(restoreGuide)
        canSave.current = loaded.notice !== 'newer-version' && loaded.notice !== 'unreadable'
        lastSaved.current = JSON.stringify({ sources: list.map(toSaved), guides: restoredGuides.map(toSavedGuide), mappings: loaded.mappings })
        setPlaylists((current) => (current.length > 0 ? current : list))
        setGuides((current) => (current.length > 0 ? current : restoredGuides))
        setMappings((current) => (current.length > 0 ? current : loaded.mappings))
        setRestored(true)
        // Guides: cached programmes first (local, quick), then address guides refreshed one at a time,
        // alongside the playlist refreshes. Each is bounded by fetch.rs's limits; nothing waits on them.
        void (async () => {
          for (const g of loaded.guides) {
            const summary = await loadGuide(g.id).catch(() => null)
            if (!live) return
            if (summary) setGuides((l) => l.map((x) => (x.id === g.id && x.status === 'saved' && !x.summary ? { ...x, summary } : x)))
          }
          for (const g of loaded.guides) {
            const url = g.url
            if (!live) return
            if (g.origin === 'url' && url) await runGuideImport(setGuides, g.id, ++lastOp.current, () => fetchGuide(g.id, url))
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
    const saved: SavedState = { sources: playlists.map(toSaved), guides: guides.map(toSavedGuide), mappings }
    const json = JSON.stringify(saved)
    if (json === lastSaved.current) return
    lastSaved.current = json
    saveSources(saved).then(
      () => setStorageNotice((n) => (n === 'save-failed' ? null : n)),
      () => setStorageNotice('save-failed'),
    )
  }, [playlists, guides, mappings, restored])
  const channels = useMemo(() => activeChannels(playlists, demoChannels), [playlists])
  const findChannel = useCallback((id: string): Channel | undefined => channels.find((c) => c.id === id), [channels])

  // Guide programmes, fetched from Rust one local day at a time for the matched channels only. Results
  // are keyed by what was asked, so an answer to an older question (before a refresh, a new match or a
  // playlist change) is dropped instead of replacing a newer one.
  const [today, setToday] = useState(() => startOfDay(Date.now()))
  useEffect(() => {
    const timer = window.setTimeout(() => setToday(startOfDay(Date.now())), addDays(today, 1) - Date.now() + 1000)
    return () => window.clearTimeout(timer)
  }, [today])
  const queries = useMemo(() => guideQueries(channels, guides, mappings), [channels, guides, mappings])
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
      if (!answers || currentKey.current !== epgKey) return
      const matches = resolveMatches(channels, guides, mappings, answers)
      setEpg((e) => {
        const days = new Map(e.key === epgKey ? e.days : NO_DAYS)
        days.set(day, programmesFor(matches, answers))
        return { key: epgKey, matches, days }
      })
    }, () => { requested.current.delete(tag) })
  }, [epgKey, queries, channels, guides, mappings])
  useEffect(() => {
    requestGuideDay(today)
    requestGuideDay(addDays(today, 1))
  }, [requestGuideDay, today])
  const current = epg.key === epgKey
  const days = current ? epg.days : NO_DAYS
  const unloadedMatches = useMemo(() => resolveMatches(channels, guides, mappings, []), [channels, guides, mappings])
  const matches = current ? epg.matches : unloadedMatches
  const guide = useMemo(() => {
    const listed = (c: Channel, day: number) => days.get(day)?.get(c.id) ?? []
    return {
      /** Programmes overlapping the local day starting at `day`: generated for demo channels, from guides otherwise. */
      schedule: (c: Channel, day: number): Programme[] => (c.sourceId === null ? demoSchedule(c, day) : listed(c, day)),
      programmeAt: (c: Channel, t: number): Programme | undefined =>
        c.sourceId === null ? demoAt(c, t) : listed(c, startOfDay(t)).find((p) => p.start <= t && t < p.stop),
      nextProgramme: (c: Channel, t: number): Programme | undefined => {
        if (c.sourceId === null) return demoNext(c, t)
        const day = startOfDay(t)
        return [...listed(c, day), ...listed(c, addDays(day, 1))].find((p) => p.start > t)
      },
      /** Why a playlist channel has guide data or not; `undefined` for demo channels. */
      guideMatch: (c: Channel): GuideMatch | undefined => matches.get(c.id),
      /** False while a day's programmes are still being fetched. */
      guideDayLoaded: (day: number) => queries.length === 0 || days.has(day),
      requestGuideDay,
    }
  }, [days, matches, queries, requestGuideDay])
  const playlistActions = useMemo(() => {
    const run = (id: string, load: () => Promise<PlaylistReport | null>) => runImport(setPlaylists, id, ++lastOp.current, load)
    return {
      addPlaylist: (input: { name: string; origin: PlaylistSource['origin']; url: string | null; label: string }, report: PlaylistReport) => {
        const id = `pl-${Date.now().toString(36)}-${(++lastOp.current).toString(36)}`
        setPlaylists((l) => [...l, createSource(id, input, report, Date.now())])
        return id
      },
      refreshPlaylist: (source: PlaylistSource) => (source.url ? run(source.id, () => fetchPlaylist(source.url ?? '')) : Promise.resolve()),
      reimportPlaylist: (id: string, file: File) => {
        setPlaylists((l) => l.map((s) => (s.id === id ? { ...s, label: fileLabel(file.name) } : s)))
        return run(id, () => readPlaylistFile(file))
      },
      removePlaylist: (id: string) => {
        setPlaylists((l) => removeSource(l, id))
        setLibrary((l) => dropSourceRefs(l, id))
        setGuides((l) => l.map((g) => (g.playlists.includes(id) ? { ...g, playlists: g.playlists.filter((p) => p !== id) } : g)))
        setMappings((l) => l.filter((m) => !m.channel.startsWith(`${id}~`)))
      },
    }
  }, [setLibrary])
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
      setMapping: (channel: string, guide: string, xmltvId: string) =>
        setMappings((l) => [...l.filter((m) => m.channel !== channel), { channel, guide, xmltvId }]),
      clearMapping: (channel: string) => setMappings((l) => l.filter((m) => m.channel !== channel)),
    }
  }, [])

  const keepHistory = prefs.keepHistory
  const setPref = useCallback(<K extends keyof Prefs>(key: K, value: Prefs[K]) => setPrefs((p) => ({ ...p, [key]: value })), [setPrefs])

  const actions = useMemo(() => ({
    toggleFavourite: (ref: Ref) => setLibrary((l) => ({ ...l, favourites: toggleIn(l.favourites, ref) })),
    toggleWatchlist: (ref: Ref) => setLibrary((l) => ({ ...l, watchlist: toggleIn(l.watchlist, ref) })),
    setWatched: (refs: Ref[], watched: boolean) =>
      setLibrary((l) => {
        const rest = l.watched.filter((r) => !refs.includes(r))
        const progress = { ...l.progress }
        if (watched) for (const r of refs) delete progress[r]
        return { ...l, watched: watched ? [...refs, ...rest] : rest, progress }
      }),
    setProgress: (ref: Ref, pos: number, dur: number) =>
      setLibrary((l) => ({ ...l, progress: { ...l.progress, [ref]: { pos, dur, at: Date.now() } } })),
    recordView: (ref: Ref) => {
      if (!keepHistory) return
      setLibrary((l) => (l.history[0]?.ref === ref ? l : { ...l, history: [{ ref, at: Date.now() }, ...l.history.filter((h) => h.ref !== ref)].slice(0, 100) }))
    },
    removeHistory: (ref: Ref) => setLibrary((l) => ({ ...l, history: l.history.filter((h) => h.ref !== ref) })),
    clearHistory: () => setLibrary((l) => ({ ...l, history: [], progress: {} })),
    createCollection: (name: string, items: Ref[] = []) => {
      const id = `c-${Date.now().toString(36)}`
      setLibrary((l) => ({ ...l, collections: [...l.collections, { id, name, items, createdAt: Date.now() }] }))
      return id
    },
    renameCollection: (id: string, name: string) =>
      setLibrary((l) => ({ ...l, collections: l.collections.map((c) => (c.id === id ? { ...c, name } : c)) })),
    deleteCollection: (id: string) => setLibrary((l) => ({ ...l, collections: l.collections.filter((c) => c.id !== id) })),
    toggleInCollection: (id: string, ref: Ref) =>
      setLibrary((l) => ({ ...l, collections: l.collections.map((c) => (c.id === id ? { ...c, items: toggleIn(c.items, ref) } : c)) })),
    toggleReminder: (programmeId: string) => setLibrary((l) => ({ ...l, reminders: toggleIn(l.reminders, programmeId) })),
    addRecentSearch: (q: string) =>
      setLibrary((l) => ({ ...l, recentSearches: [q, ...l.recentSearches.filter((s) => s.toLowerCase() !== q.toLowerCase())].slice(0, 8) })),
    removeRecentSearch: (q: string) => setLibrary((l) => ({ ...l, recentSearches: l.recentSearches.filter((s) => s !== q) })),
    resetLibrary: (to: 'empty' | 'demo') => setLibrary(to === 'empty' ? emptyLibrary : demoLibrary(Date.now())),
    resetPrefs: () => setPrefs(defaultPrefs),
    addSource: (s: Source) => setSrc((x) => ({ ...x, sources: [...x.sources, s] })),
    removeSource: (id: string) => setSrc((x) => ({ ...x, sources: x.sources.filter((s) => s.id !== id) })),
    queueRefresh: (id: string) => setSrc((x) => ({ ...x, sources: x.sources.map((s) => (s.id === id ? { ...s, status: 'queued' as const } : s)) })),
    toggleProvider: (id: string) =>
      setSrc((x) => ({ ...x, providers: x.providers.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p)) })),
    resetSources: () => setSrc({ sources: demoSources(Date.now()), providers: demoProviders }),
  }), [setLibrary, setPrefs, setSrc, keepHistory])

  return {
    library, prefs, setPref, sources: src.sources, providers: src.providers, ...actions,
    playlists, ...playlistActions, restored, storageNotice, guides, mappings, ...guideActions, ...guide,
    /** The channel catalogue every screen shows: playlist channels, or the demonstration set when there are no playlists. */
    channels, findChannel, channelMode: playlists.length > 0 ? 'playlists' as const : 'demo' as const,
  }
}

type Store = ReturnType<typeof useStoreValue>
const StoreContext = createContext<Store | null>(null)

/** The `initial…` props seed imported playlists, guides and matches for tests; the app always starts with none. */
export function StoreProvider({ children, initialPlaylists = [], initialGuides = [], initialMappings = [] }: {
  children: ReactNode; initialPlaylists?: PlaylistSource[]; initialGuides?: GuideSource[]; initialMappings?: Mapping[]
}) {
  const store = useStoreValue(initialPlaylists, initialGuides, initialMappings)
  // Wait for the saved sources (a local file) so demo channels never flash before real ones.
  return <StoreContext.Provider value={store}>{store.restored ? children : null}</StoreContext.Provider>
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
