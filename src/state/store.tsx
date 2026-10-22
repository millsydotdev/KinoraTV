import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { demoProviders, demoSources } from '../data/sources'
import type { DiscoveryProvider, Source } from '../data/types'
import { ACCENTS, THEME_BG, safeHex, type AccentName, type ThemeName } from '../lib/theme'

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
  autoRefresh: boolean
  refreshInterval: '6h' | '12h' | '24h' | 'manual'
  validateOnAdd: boolean
  dropAfterFailures: 'never' | '3' | '5' | '10'
  parallelChecks: 4 | 8 | 16
}

const DAY = 86_400_000

export const defaultPrefs: Prefs = {
  theme: 'dark', accent: 'red', customAccent: '#d6202e', density: 'comfortable', textSize: 'standard', reduceMotion: false, movieLayout: 'poster', hideWatched: false, keepHistory: true,
  autoplayNext: true, resume: 'resume', quality: 'auto', hardwareDecoding: true, skipIntros: false,
  audioLanguage: 'English', audioOutput: 'stereo', dialogueBoost: false, normaliseVolume: true,
  subtitles: false, subtitleLanguage: 'English', subtitleSize: 'medium', subtitleStyle: 'shadow',
  timeFormat: '24h', guideZoom: 3, guideArt: true, guideStart: 'now',
  autoRefresh: true, refreshInterval: '12h', validateOnAdd: true, dropAfterFailures: '5', parallelChecks: 8,
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
function sanitizePrefs(p: Prefs): Prefs {
  const pick = <K extends keyof Prefs>(key: K, allowed: readonly Prefs[K][]) => (allowed.includes(p[key]) ? p[key] : defaultPrefs[key])
  return {
    ...p,
    theme: pick('theme', Object.keys(THEME_BG) as ThemeName[]),
    accent: pick('accent', [...(Object.keys(ACCENTS) as AccentName[]), 'custom']),
    customAccent: safeHex(p.customAccent) ?? defaultPrefs.customAccent,
    density: pick('density', ['compact', 'comfortable', 'spacious']),
  }
}

const toggleIn = (list: string[], item: string) => (list.includes(item) ? list.filter((x) => x !== item) : [item, ...list])

function useStoreValue() {
  const [library, setLibrary] = usePersisted<Library>('kinora.library.v1', () => demoLibrary(Date.now()))
  const [prefs, setPrefs] = usePersisted<Prefs>('kinora.prefs.v2', () => defaultPrefs, sanitizePrefs)
  const [src, setSrc] = usePersisted<SourcesState>('kinora.sources.v1', () => ({ sources: demoSources(Date.now()), providers: demoProviders }))

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

  return { library, prefs, setPref, sources: src.sources, providers: src.providers, ...actions }
}

type Store = ReturnType<typeof useStoreValue>
const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const store = useStoreValue()
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
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
