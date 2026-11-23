import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { genresOf, movies, series, titles } from '../data/catalog'
import { OPEN_MOVIES, OPEN_SERIES } from '../data/openCatalogue'
import { startOfDay } from '../data/channels'
import { episodeCode, episodeRef } from '../data/refs'
import { Icon, type IconName } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { LocalMediaArt, XtreamArt } from '../components/Tiles'
import { Art, ChannelMark, ProgrammeArt, StateBlock } from '../components/ui'
import { clock, useNow } from '../lib/time'
import { categoryLabel, cleanChannelTitle } from '../state/playlists'
import { isLogoArtwork, getRoleLabel } from '../components/ResourceCard'
import { classifyMediaResource } from '../data/provenance'
import { DISCOVERED_RESOURCES } from '../data/discoveredResources'
import '../components/ResourceCard.css'
import { useStore } from '../state/store'
import { useLocalMedia } from '../state/localMedia'
import { useToast } from '../components/Toast'
import {
  filterKidSafeChannels,
  filterKidSafeProgrammes,
  filterKidSafeResources,
  filterKidSafeTitles,
  filterKidSafeXtreamTitles,
  isSearchQueryKidSafe,
} from '../lib/kidsMode'
import { SmartCollectionModal } from '../components/SmartCollectionModal'
import { buildUnifiedMediaCatalog } from '../lib/smartCollections'
import { artworkEngine } from '../data/artworkEngine'
import { VoiceSearchButton } from '../components/VoiceSearchButton'
import { VirtualKeyboard } from '../components/VirtualKeyboard'
import {
  scoreMatrixItem,
  normalizeSearchString,
  type MatrixItem,
} from '../lib/globalSearchMatrix'
import './Search.css'

interface SavedSearch {
  id: string
  query: string
  type?: string
  hdOnly?: boolean
  savedAt: number
}

type Group = 'channels' | 'tv' | 'films' | 'series' | 'episodes' | 'resources'
const groupLabels: Record<Group, string> = { channels: 'Live TV', tv: 'On TV Today', films: 'Movies', series: 'TV Shows', episodes: 'Episodes', resources: 'Media Resources' }
const groupIcons: Record<Group, IconName> = { channels: 'live', tv: 'guide', films: 'film', series: 'series', episodes: 'play', resources: 'sources' }
const PER_GROUP = 8

type Hit = { key: string; to: string; thumb: ReactNode; title: string; sub: string; badge?: ReactNode }

function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q) : -1
  if (i < 0) return <>{text}</>
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>
}

export function Search() {
  const now = useNow()
  const store = useStore()
  const { catalogue: localCatalogue } = useLocalMedia()
  const { channels } = store
  const { prefs, library } = store
  const [params, setParams] = useSearchParams()
  // The input owns its text; the URL follows it, so fast typing never waits on navigation.
  const [q, setQ] = useState(() => params.get('q') ?? '')

  useEffect(() => {
    const urlQ = params.get('q')
    if (urlQ !== null && urlQ !== q) {
      setQ(urlQ)
      setShowSuggestions(false)
    }
  }, [params])
  const filter = (params.get('type') ?? 'all') as Group | 'all'
  const [hdOnly, setHdOnly] = useState(false)
  const [scope, setScope] = useState<'all' | 'library' | 'guide'>('all')
  const [sortBy, setSortBy] = useState<'relevance' | 'newest' | 'title'>('relevance')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [smartModalOpen, setSmartModalOpen] = useState(false)
  const [vkOpen, setVkOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const results = useRef<HTMLDivElement>(null)
  const needle = q.trim().toLowerCase()

  const unifiedCatalog = useMemo(() => {
    return buildUnifiedMediaCatalog(
      movies,
      series,
      store.xtreamCatalogue,
      [...(localCatalogue?.movies || []), ...(localCatalogue?.series || [])],
      channels,
      library.watched,
    )
  }, [movies, series, store.xtreamCatalogue, localCatalogue, channels, library.watched])

  const toast = useToast()
  const profileId = store.activeProfile?.id ?? 'default'
  const savedKey = profileId === 'default' ? 'kinora.saved_searches.v1' : `kinora.saved_searches.v1.${profileId}`

  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>(() => {
    try {
      const saved = localStorage.getItem(savedKey)
      return saved ? (JSON.parse(saved) as SavedSearch[]) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    try {
      const saved = localStorage.getItem(savedKey)
      setSavedSearches(saved ? (JSON.parse(saved) as SavedSearch[]) : [])
    } catch {}
  }, [savedKey])

  const persistSavedSearches = (list: SavedSearch[]) => {
    setSavedSearches(list)
    try {
      localStorage.setItem(savedKey, JSON.stringify(list))
    } catch {}
  }

  const isCurrentSaved = savedSearches.some((s) => s.query.toLowerCase() === q.trim().toLowerCase())

  const toggleSaveCurrentSearch = () => {
    const trimmed = q.trim()
    if (!trimmed) return
    if (isCurrentSaved) {
      persistSavedSearches(savedSearches.filter((s) => s.query.toLowerCase() !== trimmed.toLowerCase()))
      toast(`Removed “${trimmed}” from saved searches`)
    } else {
      const newItem: SavedSearch = {
        id: `search-${Date.now()}`,
        query: trimmed,
        type: filter === 'all' ? undefined : filter,
        hdOnly: hdOnly || undefined,
        savedAt: Date.now(),
      }
      persistSavedSearches([newItem, ...savedSearches])
      toast(`Saved search “${trimmed}”`)
    }
  }

  const removeSavedSearch = (id: string) => {
    persistSavedSearches(savedSearches.filter((s) => s.id !== id))
    toast('Saved search removed')
  }

  const applySavedSearch = (s: SavedSearch) => {
    setQ(s.query)
    setHdOnly(!!s.hdOnly)
    update('type', s.type ?? '')
  }

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

  const has = (...fields: (string | undefined | null)[]) => fields.some((f) => Boolean(f && f.toLowerCase().includes(needle)))
  const isSafeSearchBlocked = store.isKidsMode && needle ? !isSearchQueryKidSafe(needle) : false
  const groups: Record<Group, Hit[]> = { channels: [], tv: [], films: [], series: [], episodes: [], resources: [] }
  if (needle && !isSafeSearchBlocked) {
    const rawResources = filterKidSafeResources(store.mediaLibrary.allResources, store.isKidsMode)
    groups.resources = rawResources
      .filter((r) => has(r.name, r.provider, r.category, r.subcategory, r.description, ...(r.tags ?? [])))
      .map((r) => {
        let to = `/sources?tab=my-sources&select=${encodeURIComponent(r.id)}`
        if (r.category === 'radio') to = '/radio'
        else if (r.category === 'podcasts') to = '/podcasts'
        else if (r.category === 'music') to = '/music'
        else if (r.category === 'audiobooks') to = '/audiobooks'
        else if (r.category === 'books') to = '/books'
        else if (r.category === 'documentaries') to = '/documentaries'
        else if (r.category === 'news') to = '/news'
        else if (r.category === 'sports') to = '/sports'
        else if (r.category === 'education') to = '/education'
        else if (r.category === 'gaming') to = '/gaming'
        else if (r.category === 'nature-science') to = '/nature-science'
        else if (r.category === 'archives') to = '/archives'
        else if (r.category === 'culture') to = '/culture'
        const isLogo = isLogoArtwork(r)
        const isPersonal = store.mediaLibrary.isInPersonalLibrary(r.id)
        const { provenance } = classifyMediaResource(r, isPersonal, store.demoTitles)
        return {
          key: `res:${r.id}`,
          to,
          thumb: r.artworkUrl ? (
            <div style={{ width: 44, height: 44, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-3)', overflow: 'hidden', border: '1px solid var(--line)' }}>
              <Art src={r.artworkUrl} alt={r.name} contentId={`res:${r.id}`} className={isLogo ? 'res-logo-art' : ''} fallbackIcon={r.category === 'radio' ? 'radio' : r.category === 'podcasts' ? 'podcast' : r.category === 'music' ? 'music' : 'sources'} />
            </div>
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-3)', color: 'var(--accent-text)', border: '1px solid var(--line)' }}>
              <Icon name={r.category === 'radio' ? 'radio' : r.category === 'podcasts' ? 'podcast' : r.category === 'music' ? 'music' : 'sources'} size={20} />
            </div>
          ),
          title: r.name,
          sub: `${getRoleLabel(r)} · ${r.provider}${r.country ? ` · ${r.country}` : ''}`,
          badge: (
            <span
              className={`res-provenance-pill ${provenance.badgeClass}`}
              style={{ fontSize: '0.6875rem', padding: '1px 6px', borderRadius: 4 }}
            >
              {provenance.shortLabel}
            </span>
          ),
        }
      })

    const safeChannels = filterKidSafeChannels(channels, store.isKidsMode)
    groups.channels = safeChannels
      .filter((c) => (!hdOnly || c.hd) && has(c.name, ...c.categories, String(c.number)))
      .map((c) => {
      const displayName = cleanChannelTitle(c.name)
      return {
        key: c.id, to: `/live?channel=${c.id}`, thumb: <ChannelMark channel={c} size={44} />, title: displayName,
        sub: `${c.number} · ${categoryLabel(c)}${c.hd ? ' · HD' : ''}${store.programmeAt(c, now) ? ` · Now: ${store.programmeAt(c, now)?.title}` : ''}`,
        badge: (
          <span
            className={`res-provenance-pill ${store.demoTitles ? 'provenance-dev-fixture' : 'provenance-live-broadcast'}`}
            style={{ fontSize: '0.6875rem', padding: '1px 6px', borderRadius: 4 }}
          >
            {store.demoTitles ? 'Dev Channel' : 'Live TV'}
          </span>
        ),
      }
    })
    const seen = new Set<string>()
    groups.tv = safeChannels
      .flatMap((c) => {
        const schedule = store.schedule(c, startOfDay(now))
        const safeSchedule = store.isKidsMode ? filterKidSafeProgrammes(schedule, store.isKidsMode) : schedule
        return safeSchedule.filter((p) => p.stop > now && has(p.title, p.category)).map((p) => ({ c, p }))
      })
      .sort((a, b) => a.p.start - b.p.start)
      .filter(({ c, p }) => !seen.has(c.id + p.title) && !!seen.add(c.id + p.title))
      .map(({ c, p }) => ({
        key: p.id, to: `/live?channel=${c.id}`, thumb: (p.art || p.icon) ? <ProgrammeArt programme={p} channel={c} /> : <ChannelMark channel={c} size={44} />, title: p.title,
        sub: `${p.start <= now ? 'On now' : clock(p.start, prefs.timeFormat)} · ${c.name} · ${p.category}`,
        badge: (
          <span
            className={`res-provenance-pill ${store.demoTitles ? 'provenance-dev-fixture' : 'provenance-live-broadcast'}`}
            style={{ fontSize: '0.6875rem', padding: '1px 6px', borderRadius: 4 }}
          >
            Guide
          </span>
        ),
      }))

    const safeXtreamMovies = filterKidSafeXtreamTitles(store.xtreamCatalogue.movies, store.isKidsMode)
    const xtMovies = safeXtreamMovies.filter((m) => has(m.name, String(m.year ?? ''))).map((m) => {
      const routeId = `xt:${m.sourceId}:${m.id}`
      return {
        key: `xt:movie:${m.sourceId}:${m.id}`,
        to: `/movies/${encodeURIComponent(routeId)}`,
        thumb: <XtreamArt artworkKey={m.artworkKey} fallbackTitle={m.name} fallbackYear={m.year} className="result-poster" />,
        title: m.name,
        sub: `Movie · ${m.year ?? 'Provider catalogue'}`,
        badge: (
          <span
            className="res-provenance-pill provenance-provider-catalogue"
            style={{ fontSize: '0.6875rem', padding: '1px 6px', borderRadius: 4 }}
          >
            Provider
          </span>
        ),
      }
    })
    const safeXtreamSeries = filterKidSafeXtreamTitles(store.xtreamCatalogue.series, store.isKidsMode)
    const xtSeries = safeXtreamSeries.filter((s) => has(s.name, String(s.year ?? ''))).map((s) => {
      const routeId = `xt:${s.sourceId}:${s.id}`
      return {
        key: `xt:series:${s.sourceId}:${s.id}`,
        to: `/series/${encodeURIComponent(routeId)}`,
        thumb: <XtreamArt artworkKey={s.artworkKey} fallbackTitle={s.name} fallbackYear={s.year} className="result-poster" />,
        title: s.name,
        sub: `Series · ${s.year ?? 'Provider catalogue'}`,
        badge: (
          <span
            className="res-provenance-pill provenance-provider-catalogue"
            style={{ fontSize: '0.6875rem', padding: '1px 6px', borderRadius: 4 }}
          >
            Provider
          </span>
        ),
      }
    })

    const discFilms = DISCOVERED_RESOURCES
      .filter((r) => r.category === 'films' || r.category === 'movies' || r.subcategory.includes('film') || r.subcategory.includes('cinema'))
      .filter((r) => has(r.name, r.provider, r.description, ...(r.tags ?? [])))
      .map((r) => ({
        key: `res:${r.id}`,
        to: `/movies/${encodeURIComponent(r.id)}`,
        thumb: r.artworkUrl ? (
          <div style={{ width: 44, height: 44, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-3)', overflow: 'hidden', border: '1px solid var(--line)' }}>
            <Art src={r.artworkUrl} alt={r.name} contentId={`res:${r.id}`} fallbackIcon="film" />
          </div>
        ) : (
          <div style={{ width: 44, height: 44, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-3)', color: 'var(--accent-text)', border: '1px solid var(--line)' }}>
            <Icon name="film" size={20} />
          </div>
        ),
        title: r.name,
        sub: `Public Archive · ${r.provider}${r.country ? ` · ${r.country}` : ''}`,
        badge: (
          <span
            className="res-provenance-pill provenance-public-discovery"
            style={{ fontSize: '0.6875rem', padding: '1px 6px', borderRadius: 4 }}
          >
            Discovery
          </span>
        ),
      }))

    const discSeries = DISCOVERED_RESOURCES
      .filter((r) => r.category === 'tv' || r.category === 'series' || r.subcategory.includes('series') || r.subcategory.includes('television'))
      .filter((r) => has(r.name, r.provider, r.description, ...(r.tags ?? [])))
      .map((r) => ({
        key: `res:${r.id}`,
        to: `/series/${encodeURIComponent(r.id)}`,
        thumb: r.artworkUrl ? (
          <div style={{ width: 44, height: 44, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-3)', overflow: 'hidden', border: '1px solid var(--line)' }}>
            <Art src={r.artworkUrl} alt={r.name} contentId={`res:${r.id}`} fallbackIcon="film" />
          </div>
        ) : (
          <div style={{ width: 44, height: 44, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-3)', color: 'var(--accent-text)', border: '1px solid var(--line)' }}>
            <Icon name="series" size={20} />
          </div>
        ),
        title: r.name,
        sub: `Broadcast Archive · ${r.provider}${r.country ? ` · ${r.country}` : ''}`,
        badge: (
          <span
            className="res-provenance-pill provenance-public-discovery"
            style={{ fontSize: '0.6875rem', padding: '1px 6px', borderRadius: 4 }}
          >
            Discovery
          </span>
        ),
      }))

    const safeMovies = filterKidSafeTitles(movies, store.isKidsMode)
    const safeSeries = filterKidSafeTitles(series, store.isKidsMode)

    const localMovieHits: Hit[] = localCatalogue.movies
      .filter((m) => has(m.title, m.edition ?? ''))
      .map((m) => ({
        key: `local-movie:${m.id}`,
        to: `/watch/${encodeURIComponent('local-movie:' + m.id)}`,
        thumb: (
          <LocalMediaArt
            mediaId={m.id}
            title={m.title}
            year={m.year}
            kind="movie"
            localArtPath={m.artPath}
            className="result-poster"
          />
        ),
        title: m.title,
        sub: `Local Film · ${m.year ?? ''} ${m.resolution ? `· ${m.resolution}` : ''}`,
        badge: (
          <span
            className="res-provenance-pill"
            style={{ fontSize: '0.6875rem', padding: '1px 6px', borderRadius: 4, background: 'rgba(229, 9, 20, 0.2)', color: '#ff3847', border: '1px solid rgba(229, 9, 20, 0.4)' }}
          >
            Local Library
          </span>
        ),
      }))

    const localSeriesHits: Hit[] = localCatalogue.series
      .filter((s) => has(s.title))
      .map((s) => ({
        key: `local-series:${s.id}`,
        to: '/library?tab=local',
        thumb: (
          <LocalMediaArt
            mediaId={s.id}
            title={s.title}
            year={s.year}
            kind="series"
            localArtPath={s.artPath}
            className="result-poster"
          />
        ),
        title: s.title,
        sub: `Local Series · ${s.year ?? ''} · ${s.seasons.length} Season(s)`,
        badge: (
          <span
            className="res-provenance-pill"
            style={{ fontSize: '0.6875rem', padding: '1px 6px', borderRadius: 4, background: 'rgba(229, 9, 20, 0.2)', color: '#ff3847', border: '1px solid rgba(229, 9, 20, 0.4)' }}
          >
            Local Library
          </span>
        ),
      }))

    const openMovieHits: Hit[] = filterKidSafeTitles(OPEN_MOVIES, store.isKidsMode)
      .filter((m) => has(m.title, m.synopsis, ...m.genres))
      .map((m) => {
        const enriched = artworkEngine.findArtwork(m.title, 'movie-poster', m.year)?.sourceUrl
        const poster = enriched || m.posterUrl || m.art
        return {
          key: m.id,
          to: `/movies/${m.id}`,
          thumb: <Art src={poster} alt={m.title} contentId={`movie:${m.id}`} eager focus={m.focus} fallbackIcon="film" fallbackYear={m.year} />,
          title: m.title,
          sub: `Movie · ${m.year} · ${m.genres.join(' / ')}`,
          badge: (
            <span
              className="res-provenance-pill provenance-public-discovery"
              style={{ fontSize: '0.6875rem', padding: '1px 6px', borderRadius: 4 }}
            >
              Open Media
            </span>
          ),
        }
      })

    const openSeriesHits: Hit[] = filterKidSafeTitles(OPEN_SERIES, store.isKidsMode)
      .filter((s) => has(s.title, s.synopsis, ...s.genres))
      .map((s) => {
        const year = parseInt(s.years, 10) || null
        const enriched = artworkEngine.findArtwork(s.title, 'series-poster', year)?.sourceUrl
        const poster = enriched || s.posterUrl || s.art
        return {
          key: s.id,
          to: `/series/${s.id}`,
          thumb: <Art src={poster} alt={s.title} contentId={`series:${s.id}`} eager focus={s.focus} fallbackIcon="series" />,
          title: s.title,
          sub: `Series · ${s.seasons.length} season${s.seasons.length > 1 ? 's' : ''} · ${s.genres.join(' / ')}`,
          badge: (
            <span
              className="res-provenance-pill provenance-public-discovery"
              style={{ fontSize: '0.6875rem', padding: '1px 6px', borderRadius: 4 }}
            >
              Open Media
            </span>
          ),
        }
      })

    const openEpisodeHits: Hit[] = filterKidSafeTitles(OPEN_SERIES, store.isKidsMode).flatMap((s) =>
      s.seasons.flat().filter((e) => has(e.title, e.synopsis)).map((e) => {
        const epKey = `episode:still:${s.id}:${e.season || 1}:${e.number || 1}`
        const enrichedStill = artworkEngine.getArtwork(epKey, 'episode-still')?.sourceUrl
        const still = enrichedStill || e.still || s.backdropUrl || s.art
        return {
          key: `${s.id}/${e.id}`,
          to: `/watch/${encodeURIComponent(episodeRef(s.id, e.id))}`,
          thumb: <Art src={still} focus={e.stillFocus} eager fallbackIcon="series" />,
          title: e.title,
          sub: `${s.title} · ${episodeCode(e)} · ${e.runtime} min`,
          badge: (
            <span
              className="res-provenance-pill provenance-public-discovery"
              style={{ fontSize: '0.6875rem', padding: '1px 6px', borderRadius: 4 }}
            >
              Open Media
            </span>
          ),
        }
      }),
    )

    groups.films = store.demoTitles
      ? [...safeMovies.filter((m) => has(m.title, m.synopsis, ...m.genres)).map((m) => ({
          key: m.id, to: `/movies/${m.id}`, thumb: <Art src={m.posterUrl || m.art} alt={m.title} contentId={`movie:${m.id}`} focus={m.focus} fallbackIcon="film" fallbackYear={m.year} />, title: m.title, sub: `Movie · ${m.year} · ${m.genres.join(' / ')}`,
          badge: (
            <span
              className="res-provenance-pill provenance-dev-fixture"
              style={{ fontSize: '0.6875rem', padding: '1px 6px', borderRadius: 4 }}
            >
              Dev Fixture
            </span>
          ),
        })), ...localMovieHits]
      : [...openMovieHits, ...xtMovies, ...discFilms, ...localMovieHits]
    groups.series = store.demoTitles
      ? [...safeSeries.filter((s) => has(s.title, s.synopsis, ...s.genres)).map((s) => ({
          key: s.id, to: `/series/${s.id}`, thumb: <Art src={s.posterUrl || s.art} alt={s.title} contentId={`series:${s.id}`} focus={s.focus} fallbackIcon="series" />, title: s.title, sub: `Series · ${s.seasons.length} season${s.seasons.length > 1 ? 's' : ''} · ${s.genres.join(' / ')}`,
          badge: (
            <span
              className="res-provenance-pill provenance-dev-fixture"
              style={{ fontSize: '0.6875rem', padding: '1px 6px', borderRadius: 4 }}
            >
              Dev Fixture
            </span>
          ),
        })), ...localSeriesHits]
      : [...openSeriesHits, ...xtSeries, ...discSeries, ...localSeriesHits]
    groups.episodes = store.demoTitles
      ? safeSeries.flatMap((s) =>
          s.seasons.flat().filter((e) => has(e.title, e.synopsis)).map((e) => ({
            key: `${s.id}/${e.id}`,
            to: `/watch/${encodeURIComponent(episodeRef(s.id, e.id))}`,
            thumb: <Art src={e.still} focus={e.stillFocus} />,
            title: e.title,
            sub: `${s.title} · ${episodeCode(e)} · ${e.runtime} min`,
            badge: (
              <span
                className="res-provenance-pill provenance-dev-fixture"
                style={{ fontSize: '0.6875rem', padding: '1px 6px', borderRadius: 4 }}
              >
                Dev Fixture
              </span>
            ),
          })),
        )
      : openEpisodeHits
    if (scope === 'library') {
      groups.channels = []
      groups.tv = []
      groups.episodes = []
      groups.films = groups.films.filter((f) => library.watchlist.includes(f.key) || library.favourites.includes(f.key) || library.watched.includes(f.key) || !!library.progress[f.key])
      groups.series = groups.series.filter((s) => library.watchlist.includes(s.key) || library.favourites.includes(s.key))
      groups.resources = groups.resources.filter((r) => store.mediaLibrary.isInPersonalLibrary(r.key.replace('res:', '')))
    } else if (scope === 'guide') {
      groups.films = []
      groups.series = []
      groups.episodes = []
      groups.resources = []
    }
  }
  const order: Group[] = ['channels', 'tv', 'films', 'series', 'episodes', 'resources']

  if (sortBy === 'title') {
    for (const g of order) {
      groups[g].sort((a, b) => a.title.localeCompare(b.title))
    }
  } else if (sortBy === 'newest') {
    for (const g of order) {
      groups[g].reverse()
    }
  } else if (sortBy === 'relevance' && needle) {
    const qNorm = normalizeSearchString(needle)
    for (const g of order) {
      groups[g].sort((a, b) => {
        const itemA: MatrixItem = {
          id: a.key,
          ref: a.key,
          title: a.title,
          cleanTitle: a.title,
          mediaType: g === 'films' ? 'film' : g === 'series' ? 'series' : g === 'channels' ? 'channel' : g === 'episodes' ? 'episode' : 'resource',
          genres: [],
          to: a.to,
          subText: a.sub,
          isFavourite: library.favourites.includes(a.key),
        }
        const itemB: MatrixItem = {
          id: b.key,
          ref: b.key,
          title: b.title,
          cleanTitle: b.title,
          mediaType: g === 'films' ? 'film' : g === 'series' ? 'series' : g === 'channels' ? 'channel' : g === 'episodes' ? 'episode' : 'resource',
          genres: [],
          to: b.to,
          subText: b.sub,
          isFavourite: library.favourites.includes(b.key),
        }
        return scoreMatrixItem(itemB, qNorm) - scoreMatrixItem(itemA, qNorm)
      })
    }
  }

  const total = order.reduce((n, g) => n + groups[g].length, 0)
  const shown = order.filter((g) => (filter === 'all' || filter === g) && groups[g].length > 0)

  const items = () => Array.from(results.current?.querySelectorAll<HTMLElement>('[data-result]') ?? [])
  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); items()[0]?.focus() }
    if (e.key === 'Escape') {
      e.preventDefault()
      if (showSuggestions) setShowSuggestions(false)
      else if (q) setQ('')
    }
    if (e.key === 'Enter') {
      setShowSuggestions(false)
      if (needle) store.addRecentSearch(q.trim())
    }
  }

  // Quick suggestions
  const suggestions: Array<{ title: string; type: string; to: string }> = []
  if (needle.length >= 2 && !isSafeSearchBlocked) {
    for (const c of channels) {
      if (c.name.toLowerCase().includes(needle)) {
        suggestions.push({ title: c.name, type: 'Channel', to: `/live?channel=${c.id}` })
        if (suggestions.length >= 5) break
      }
    }
    if (suggestions.length < 5) {
      if (store.demoTitles) {
        for (const m of movies) {
          if (m.title.toLowerCase().includes(needle)) {
            suggestions.push({ title: m.title, type: 'Movie', to: `/movies/${m.id}` })
            if (suggestions.length >= 5) break
          }
        }
      } else {
        for (const m of store.xtreamCatalogue.movies) {
          if (m.name.toLowerCase().includes(needle)) {
            suggestions.push({ title: m.name, type: 'Movie', to: `/movies/${encodeURIComponent(`xt:${m.sourceId}:${m.id}`)}` })
            if (suggestions.length >= 5) break
          }
        }
      }
    }
    if (suggestions.length < 5) {
      for (const r of store.mediaLibrary.allResources) {
        if (r.name.toLowerCase().includes(needle)) {
          suggestions.push({ title: r.name, type: r.category, to: `/sources?tab=my-sources&select=${encodeURIComponent(r.id)}` })
          if (suggestions.length >= 5) break
        }
      }
    }
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
      <div className="search-field-wrapper">
        <div className="search-field">
          <Icon name="search" size={26} />
          <input
            ref={input}
            type="search"
            className="search-input"
            placeholder="Channels, programmes, films, series, media resources"
            aria-label="Search the catalogue and guide"
            aria-describedby="search-help"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setShowSuggestions(true)
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => {
              // Slight delay to allow clicking suggestion buttons
              window.setTimeout(() => setShowSuggestions(false), 200)
            }}
            onKeyDown={onInputKey}
            autoComplete="off"
            spellCheck={false}
          />
          <VoiceSearchButton
            onSearchQuery={(query) => {
              setQ(query)
              setParams({ q: query })
            }}
          />
          <button
            type="button"
            className="icon-btn vk-toggle-btn"
            onClick={() => setVkOpen(true)}
            aria-label="Open on-screen keyboard"
            title="Open on-screen remote keyboard"
          >
            <Icon name="keyboard" />
          </button>
          {q && (
            <button type="button" className="icon-btn" onClick={() => { setQ(''); input.current?.focus() }} aria-label="Clear search">
              <Icon name="close" />
            </button>
          )}
        </div>

        {showSuggestions && suggestions.length > 0 && (
          <div className="search-autocomplete-dropdown" role="listbox" aria-label="Search suggestions">
            <div className="search-autocomplete-header">Quick Suggestions</div>
            {suggestions.map((s) => (
              <button
                key={s.to + s.title}
                type="button"
                className="autocomplete-item"
                onClick={() => {
                  setQ(s.title)
                  setShowSuggestions(false)
                  store.addRecentSearch(s.title)
                }}
              >
                <Icon name="search" size={16} />
                <span className="autocomplete-title">{s.title}</span>
                <span className="autocomplete-type">{s.type}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <p id="search-help" className="faint search-help">Searches your live channels, programme guide, on-demand titles, and media library. Down arrow moves into results, Escape clears.</p>

      <div className="search-scope-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '8px 0 16px', alignItems: 'center' }}>
        <span className="faint" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Scope:</span>
        <button
          type="button"
          className={`chip ${scope === 'all' ? 'is-active' : ''}`}
          aria-pressed={scope === 'all'}
          onClick={() => setScope('all')}
        >
          All Content
        </button>
        <button
          type="button"
          className={`chip ${scope === 'library' ? 'is-active' : ''}`}
          aria-pressed={scope === 'library'}
          onClick={() => setScope('library')}
        >
          My Library Only
        </button>
        <button
          type="button"
          className={`chip ${scope === 'guide' ? 'is-active' : ''}`}
          aria-pressed={scope === 'guide'}
          onClick={() => setScope('guide')}
        >
          Live Guide Only
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={() => setSmartModalOpen(true)}
            title="Dynamic Smart Collections"
          >
            <Icon name="sparkles" size={14} />
            <span>Smart Collections</span>
          </button>
          <label htmlFor="search-sort" className="faint" style={{ fontSize: '0.8125rem' }}>Sort:</label>
          <select
            id="search-sort"
            className="select select-inline"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'relevance' | 'newest' | 'title')}
            aria-label="Sort results"
          >
            <option value="relevance">Best Match</option>
            <option value="newest">Newest</option>
            <option value="title">Title A to Z</option>
          </select>
        </div>
      </div>

      {needle && (
        <div className="chips search-filters" role="group" aria-label="Result type">
          <button type="button" className="chip" aria-pressed={filter === 'all'} onClick={() => update('type', '')}>All <span className="count tnum">{total}</span></button>
          {order.filter((g) => groups[g].length > 0).map((g) => (
            <button key={g} type="button" className="chip" aria-pressed={filter === g} onClick={() => update('type', g)}>
              {groupLabels[g]} <span className="count tnum">{groups[g].length}</span>
            </button>
          ))}
          <button
            type="button"
            className="chip"
            aria-pressed={hdOnly}
            onClick={() => setHdOnly(!hdOnly)}
          >
            HD Only
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-small search-save-btn"
            style={{ marginLeft: 'auto' }}
            onClick={toggleSaveCurrentSearch}
          >
            <Icon name={isCurrentSaved ? 'bookmark' : 'plus'} size={14} />
            {isCurrentSaved ? 'Saved search' : 'Save search'}
          </button>
        </div>
      )}

      <div ref={results} onKeyDown={onResultsKey} aria-live="polite">
        {!needle && (
          <div className="search-idle">
            {savedSearches.length > 0 && (
              <section aria-labelledby="saved-h">
                <div className="recent-head">
                  <h2 id="saved-h" className="section-title"><Icon name="bookmark" size={18} />Saved Searches</h2>
                </div>
                <div className="chips" style={{ marginBottom: 24, gap: 8, display: 'flex', flexWrap: 'wrap' }}>
                  {savedSearches.map((s) => (
                    <span key={s.id} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        style={{ background: 'none', border: 'none', color: 'inherit', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, font: 'inherit' }}
                        onClick={() => applySavedSearch(s)}
                      >
                        <Icon name="bookmark" size={14} />
                        <strong>{s.query}</strong>
                        {s.type && <span className="faint">({s.type})</span>}
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        style={{ width: 18, height: 18, minWidth: 18, padding: 0 }}
                        aria-label={`Remove saved search ${s.query}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          removeSavedSearch(s.id)
                        }}
                      >
                        <Icon name="close" size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </section>
            )}
            <section aria-labelledby="recent-h">
              <div className="recent-head">
                <h2 id="recent-h" className="section-title"><Icon name="history" size={18} />Recent Searches</h2>
                {library.recentSearches.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() => {
                      const prev = [...library.recentSearches]
                      store.clearRecentSearches()
                      toast('Cleared recent search history', {
                        label: 'Undo',
                        run: () => {
                          prev.forEach((s) => store.addRecentSearch(s))
                        },
                      })
                    }}
                  >
                    Clear all
                  </button>
                )}
              </div>
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

        {needle && isSafeSearchBlocked && (
          <StateBlock icon="shield" title="Safe Search Active">
            Adult keywords and search terms are restricted in Kids Mode. Try searching for family-friendly films, cartoons, or educational channels.
          </StateBlock>
        )}

        {needle && !isSafeSearchBlocked && total === 0 && (
          <StateBlock icon="search" title={`Nothing found for “${q.trim()}”`}>
            Check the spelling, or try a channel name, a genre such as “Thriller”, or part of a title. Search covers the demonstration catalogue and today's guide only.
          </StateBlock>
        )}

        {needle && !isSafeSearchBlocked && total > 0 && (
          <div className="search-results-banner" style={{ marginBottom: 16 }}>
            <h2 className="section-title" style={{ fontSize: '1.25rem', fontWeight: 700 }}>Results for &ldquo;{q.trim()}&rdquo;</h2>
          </div>
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
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><Highlight text={h.title} q={needle} /></strong>
                          {h.badge}
                          {(g === 'films' || g === 'series') && (
                            <span className="badge-tech" style={{ marginLeft: 'auto', fontSize: '0.625rem' }}>4K HDR</span>
                          )}
                        </span>
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
      <SmartCollectionModal
        open={smartModalOpen}
        onClose={() => setSmartModalOpen(false)}
        allMediaItems={unifiedCatalog}
        onSelectCollection={(col) => {
          const firstGenreRule = col.rules.find((r) => r.field === 'genre')
          const firstKeywordRule = col.rules.find((r) => r.field === 'keyword')
          const searchTerm = firstKeywordRule ? String(firstKeywordRule.value) : firstGenreRule ? String(firstGenreRule.value) : col.name
          setQ(searchTerm)
        }}
      />
      <VirtualKeyboard
        open={vkOpen}
        value={q}
        onChange={(val) => {
          setQ(val)
          setParams(val ? { q: val } : {})
          setShowSuggestions(true)
        }}
        onSubmit={() => {
          setVkOpen(false)
          input.current?.focus()
        }}
        onClose={() => setVkOpen(false)}
        title="Search Catalogue & Guide"
        placeholder="Enter title, channel or genre..."
        urlMode={false}
      />
    </div>
    </>
  )
}
