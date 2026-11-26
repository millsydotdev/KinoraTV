import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import { NotificationProvider } from './components/Notifications'
import { BackgroundTaskProvider } from './components/BackgroundTaskCenter'
import { CommandPalette } from './components/design-system/CommandPalette'
import { ShortcutsModal } from './components/design-system/ShortcutsModal'
import { NavMenuContext, PageHeader } from './components/PageHeader'
import { Sidebar } from './components/Sidebar'
import { StateBlock } from './components/ui'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Home } from './screens/Home'
import { LiveTV } from './screens/LiveTV'

const Library = lazy(() => import('./screens/Library').then((m) => ({ default: m.Library })))
const Recordings = lazy(() => import('./screens/Recordings').then((m) => ({ default: m.Recordings })))
const MovieDetail = lazy(() => import('./screens/MovieDetail').then((m) => ({ default: m.MovieDetail })))
const Movies = lazy(() => import('./screens/Movies').then((m) => ({ default: m.Movies })))
const Player = lazy(() => import('./screens/Player').then((m) => ({ default: m.Player })))
const Search = lazy(() => import('./screens/Search').then((m) => ({ default: m.Search })))
const Setup = lazy(() => import('./screens/Setup').then((m) => ({ default: m.Setup })))
const DiscoverScreen = lazy(() => import('./screens/DiscoverScreen').then((m) => ({ default: m.DiscoverScreen })))
const GenreBrowseScreen = lazy(() => import('./screens/GenreBrowseScreen').then((m) => ({ default: m.GenreBrowseScreen })))
const ArtworkLibraryScreen = lazy(() => import('./screens/ArtworkLibraryScreen').then((m) => ({ default: m.ArtworkLibraryScreen })))
const SeriesBrowse = lazy(() => import('./screens/SeriesBrowse').then((m) => ({ default: m.SeriesBrowse })))
const SeriesDetail = lazy(() => import('./screens/SeriesDetail').then((m) => ({ default: m.SeriesDetail })))
const Settings = lazy(() => import('./screens/Settings').then((m) => ({ default: m.Settings })))
const Sources = lazy(() => import('./screens/Sources').then((m) => ({ default: m.Sources })))
const AddSource = lazy(() => import('./screens/Sources').then((m) => ({ default: m.AddSource })))
const RadioScreen = lazy(() => import('./screens/RadioScreen').then((m) => ({ default: m.RadioScreen })))
const MusicScreen = lazy(() => import('./screens/MusicScreen').then((m) => ({ default: m.MusicScreen })))
const PodcastsScreen = lazy(() => import('./screens/PodcastsScreen').then((m) => ({ default: m.PodcastsScreen })))
const AudiobooksScreen = lazy(() => import('./screens/AudiobooksScreen').then((m) => ({ default: m.AudiobooksScreen })))
const DocumentariesScreen = lazy(() => import('./screens/DocumentariesScreen').then((m) => ({ default: m.DocumentariesScreen })))
const EducationScreen = lazy(() => import('./screens/EducationScreen').then((m) => ({ default: m.EducationScreen })))
const NewsScreen = lazy(() => import('./screens/NewsScreen').then((m) => ({ default: m.NewsScreen })))
const SportsScreen = lazy(() => import('./screens/SportsScreen').then((m) => ({ default: m.SportsScreen })))
const BooksScreen = lazy(() => import('./screens/BooksScreen').then((m) => ({ default: m.BooksScreen })))
const CultureScreen = lazy(() => import('./screens/CultureScreen').then((m) => ({ default: m.CultureScreen })))
const GamingScreen = lazy(() => import('./screens/GamingScreen').then((m) => ({ default: m.GamingScreen })))
const NatureScienceScreen = lazy(() => import('./screens/NatureScienceScreen').then((m) => ({ default: m.NatureScienceScreen })))
const LanguageScreen = lazy(() => import('./screens/LanguageScreen').then((m) => ({ default: m.LanguageScreen })))
const ArchivesScreen = lazy(() => import('./screens/ArchivesScreen').then((m) => ({ default: m.ArchivesScreen })))
import { AudioPlayerBar } from './components/AudioPlayerBar'
import { OfflineBanner } from './components/OfflineBanner'
import { UpdateNotificationBanner } from './components/UpdateNotificationBanner'
import { WhatsNewModal, hasSeenWhatsNew } from './components/WhatsNewModal'
import { AmbientScreensaver } from './components/AmbientScreensaver'
import { RemoteControlModal } from './components/RemoteControlModal'
import { RemoteHintBar } from './components/RemoteHintBar'
import { TraktSettingsModal } from './components/TraktSettingsModal'
import { DownloadsModal } from './components/DownloadsModal'
import { channelRef, downloadRef } from './data/refs'
import { loadTraktConfig, performTraktSync } from './lib/trakt'
import { registerCommandHandler } from './lib/commands'
import { kinoraCapabilities, type LiveProgrammeHit, type MediaSearchHit } from './lib/capabilities'
import { getAllReleases } from './lib/changelog'
import { initGlobalRemoteNav, restoreRouteFocus, saveRouteFocus } from './lib/remoteNav'
import { initializeRemoteControlBridge } from './lib/remoteServerSync'
import { GamepadController } from './lib/gamepadNav'
import { applyThemeTokensToElement } from './lib/theme'
import { APP_VERSION } from './lib/native'
import { ProfileProvider } from './state/profiles'
import { StoreProvider, useStore } from './state/store'
import { LocalMediaProvider } from './state/localMedia'
import { UpdaterProvider, useUpdater } from './state/updater'

function Shell() {
  const store = useStore()
  const updater = useUpdater()
  const { prefs, setPref, setupDone, mediaLibrary } = store
  const navigate = useNavigate()
  useEffect(() => {
    ;(window as unknown as { __kinora_navigate?: (to: string) => void }).__kinora_navigate = (to: string) => navigate(to)
    return () => {
      delete (window as unknown as { __kinora_navigate?: (to: string) => void }).__kinora_navigate
    }
  }, [navigate])

  useEffect(() => {
    const unregister = kinoraCapabilities.registerDelegates({
      navigate: (path) => navigate(path),
      searchMedia: (query, kind) => {
        const q = query.trim().toLowerCase()
        const hits: MediaSearchHit[] = []
        if (!kind || kind === 'channel') {
          for (const ch of store.channels) {
            if (ch.name.toLowerCase().includes(q) || (ch.group && ch.group.toLowerCase().includes(q))) {
              hits.push({
                id: ch.id,
                title: ch.name,
                kind: 'channel',
                subtitle: ch.group ?? undefined,
                route: `/watch/${encodeURIComponent(channelRef(ch.id))}`,
              })
            }
            if (hits.length >= 25) break
          }
        }
        for (const res of store.mediaLibrary.allResources) {
          if (kind && res.category !== kind && !(kind === 'podcast' && res.category === 'podcasts') && !(kind === 'book' && res.category === 'books')) {
            continue
          }
          if (res.name.toLowerCase().includes(q) || res.description.toLowerCase().includes(q) || res.provider.toLowerCase().includes(q)) {
            hits.push({
              id: res.id,
              title: res.name,
              kind: res.category === 'podcasts' ? 'podcast' : res.category === 'books' ? 'book' : res.category === 'radio' ? 'radio' : res.category === 'music' ? 'music' : 'other',
              subtitle: res.provider,
              route: `/${res.category}`,
            })
          }
          if (hits.length >= 40) break
        }
        return hits
      },
      queryEpg: (channelName, query) => {
        const now = Date.now()
        const chFilter = channelName?.trim().toLowerCase()
        const qFilter = query?.trim().toLowerCase()
        const results: LiveProgrammeHit[] = []
        for (const ch of store.channels) {
          if (chFilter && !ch.name.toLowerCase().includes(chFilter)) continue
          const cur = store.programmeAt(ch, now)
          const nxt = store.nextProgramme(ch, now)
          if (qFilter) {
            const hay = `${ch.name} ${cur?.title ?? ''} ${nxt?.title ?? ''}`.toLowerCase()
            if (!hay.includes(qFilter)) continue
          }
          if (cur || chFilter) {
            results.push({
              channelId: ch.id,
              channelName: ch.name,
              channelNumber: ch.number,
              currentTitle: cur?.title ?? null,
              nextTitle: nxt?.title ?? null,
              startIso: cur ? new Date(cur.start).toISOString() : undefined,
              stopIso: cur ? new Date(cur.stop).toISOString() : undefined,
            })
          }
          if (results.length >= 12) break
        }
        return results
      },
      getNowPlaying: () => {
        if (mediaLibrary.currentAudio) {
          return {
            active: true,
            isPlaying: mediaLibrary.isAudioPlaying,
            title: mediaLibrary.currentAudio.name,
            subtitle: mediaLibrary.currentAudio.provider,
            isLive: mediaLibrary.currentAudio.mediaType === 'radio',
          }
        }
        const video = typeof document !== 'undefined' ? (document.querySelector('video') as HTMLVideoElement | null) : null
        if (video && (video.currentSrc || video.src)) {
          return {
            active: true,
            isPlaying: !video.paused && !video.ended,
            title: document.title || 'Active Video Stream',
            positionSec: Number.isFinite(video.currentTime) ? video.currentTime : 0,
            durationSec: Number.isFinite(video.duration) ? video.duration : 0,
            isLive: !Number.isFinite(video.duration) || video.duration === Infinity,
          }
        }
        return { active: false, isPlaying: false, title: null }
      },
      getContinueWatchingRef: () => {
        const recent = store.library.history[0]
        if (!recent) return null
        return { ref: recent.ref, title: recent.ref }
      },
      toggleFavourite: (itemRef) => {
        store.toggleFavourite(itemRef)
        return true
      },
      toggleWatchlist: (itemRef) => {
        store.toggleWatchlist(itemRef)
        return true
      },
      getSourcesSummary: () =>
        store.playlists.map((p) => ({
          id: p.id,
          name: p.name,
          kind: p.origin,
          count: p.channels.length,
        })),
      getLibraryStats: () => ({
        favourites: store.library.favourites.length,
        watchlist: store.library.watchlist.length,
        history: store.library.history.length,
        collections: store.library.collections.length,
      }),
      getLatestReleaseSummary: () => {
        const latest = getAllReleases()[0]
        if (!latest) return null
        return {
          version: latest.version,
          releaseDate: latest.releaseDate,
          title: latest.title,
        }
      },
    })
    return unregister
  }, [navigate, store, mediaLibrary])
  const { pathname } = useLocation()
  // Full-window screens: no sidebar.
  const inPlayer = pathname.startsWith('/watch/') || pathname === '/setup'
  const [navOpen, setNavOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [whatsNewOpen, setWhatsNewOpen] = useState(false)
  const [remoteModalOpen, setRemoteModalOpen] = useState(false)
  const [traktModalOpen, setTraktModalOpen] = useState(false)
  const [downloadsModalOpen, setDownloadsModalOpen] = useState(false)
  const [screensaverActive, setScreensaverActive] = useState(false)
  const screensaverTimerRef = useRef<number | null>(null)

  const resetScreensaverTimer = useCallback(() => {
    if (screensaverTimerRef.current !== null) {
      window.clearTimeout(screensaverTimerRef.current)
    }
    // 3 minutes (180,000 ms) idle on desktop/TV
    screensaverTimerRef.current = window.setTimeout(() => {
      setScreensaverActive(true)
    }, 180000)
  }, [])

  useEffect(() => {
    resetScreensaverTimer()
    const onActivity = () => {
      setScreensaverActive(false)
      resetScreensaverTimer()
    }
    window.addEventListener('mousemove', onActivity)
    window.addEventListener('keydown', onActivity)
    return () => {
      if (screensaverTimerRef.current !== null) window.clearTimeout(screensaverTimerRef.current)
      window.removeEventListener('mousemove', onActivity)
      window.removeEventListener('keydown', onActivity)
    }
  }, [resetScreensaverTimer])
  const closeNav = useCallback(() => setNavOpen(false), [])
  const openNav = useCallback(() => setNavOpen(true), [])

  const checkedUpgrade = useRef(false)
  useEffect(() => {
    if (checkedUpgrade.current) return
    checkedUpgrade.current = true
    try {
      const lastVersion = localStorage.getItem('kinora.version.v1')
      if (lastVersion && lastVersion !== APP_VERSION && !hasSeenWhatsNew(APP_VERSION)) {
        setWhatsNewOpen(true)
      }
      localStorage.setItem('kinora.version.v1', APP_VERSION)
    } catch {
      // Ignore storage errors
    }
  }, [])

  useEffect(() => {
    const traktCfg = loadTraktConfig()
    if (traktCfg.enabled && traktCfg.syncOnStartup && traktCfg.accessToken) {
      void performTraktSync((ref) => {
        store.setWatched([ref], true)
        store.recordView(ref)
      })
    }
  }, [store])

  useEffect(() => {
    const el = document.documentElement
    el.dataset.theme = prefs.theme
    el.dataset.density = prefs.density
    el.dataset.text = prefs.textSize
    el.dataset.layout = prefs.layoutMode || 'standard'
    el.dataset.mode = prefs.viewMode || (prefs.layoutMode === 'tv' ? 'tv' : 'desktop')
    el.dataset.motion = prefs.reduceMotion ? 'reduce' : 'full'
    applyThemeTokensToElement(el, prefs.theme, prefs.accent, prefs.customAccent)
  }, [prefs.theme, prefs.density, prefs.accent, prefs.customAccent, prefs.textSize, prefs.layoutMode, prefs.viewMode, prefs.reduceMotion])

  useEffect(() => {
    const unregRemote = initGlobalRemoteNav()
    const remoteBridgeCleanupPromise = initializeRemoteControlBridge()
    const handleNavigateHome = () => navigate('/')
    window.addEventListener('kinora:navigate_home', handleNavigateHome)
    const handleTuneChannel = (e: Event) => {
      const detail = (e as CustomEvent<{
        channelId?: string
        channelNumber?: number
        channelName?: string
        name?: string
      }>).detail
      if (!detail) return
      const byId = detail.channelId ? store.findChannel(detail.channelId) : undefined
      const byNum =
        !byId && typeof detail.channelNumber === 'number' && detail.channelNumber > 0
          ? store.channels.find((c) => c.number === detail.channelNumber)
          : undefined
      const queryName = (detail.channelName || detail.name || '').trim().toLowerCase()
      const byName =
        !byId && !byNum && queryName
          ? store.channels.find((c) => c.name.toLowerCase().includes(queryName))
          : undefined
      const target = byId ?? byNum ?? byName
      if (target) {
        navigate(`/watch/${encodeURIComponent(channelRef(target.id))}`)
      } else {
        navigate('/live')
      }
    }
    window.addEventListener('kinora:tune_channel', handleTuneChannel)
    const handlePlayMediaItem = (e: Event) => {
      const detail = (e as CustomEvent<{ mediaId?: string; title?: string; kind?: string }>).detail
      if (!detail) return
      const id = (detail.mediaId || '').trim()
      const kind = (detail.kind || '').trim().toLowerCase()
      const title = (detail.title || '').trim()
      e.preventDefault()
      if (id && (id.startsWith('channel:') || id.startsWith('local:') || id.startsWith('movie:') || id.startsWith('episode:'))) {
        navigate(`/watch/${encodeURIComponent(id)}`)
      } else if (id && kind === 'movie') {
        navigate(`/movies/${encodeURIComponent(id)}`)
      } else if (id && (kind === 'series' || kind === 'show')) {
        navigate(`/series/${encodeURIComponent(id)}`)
      } else if (id && kind === 'local') {
        navigate(`/watch/${encodeURIComponent(`local:${id}`)}`)
      } else if (title) {
        navigate(`/search?q=${encodeURIComponent(title)}`)
      } else {
        navigate('/movies')
      }
    }
    window.addEventListener('kinora:play_media_item', handlePlayMediaItem)
    const handleOpenMobileRemote = () => setRemoteModalOpen(true)
    window.addEventListener('kinora:open-mobile-remote', handleOpenMobileRemote)
    const handleOpenTraktSync = () => setTraktModalOpen(true)
    window.addEventListener('kinora:open-trakt-sync', handleOpenTraktSync)
    const handleOpenDownloads = () => setDownloadsModalOpen(true)
    window.addEventListener('kinora:open-downloads', handleOpenDownloads)
    const handleRemoteColor = (e: Event) => {
      const custom = e as CustomEvent<{ color: string }>
      switch (custom.detail?.color) {
        case 'red':
          navigate('/library')
          break
        case 'green':
          navigate('/live')
          break
        case 'yellow':
          window.dispatchEvent(new CustomEvent('kinora:command-palette'))
          break
        case 'blue':
          navigate('/sources')
          break
      }
    }
    window.addEventListener('kinora:remote-color', handleRemoteColor)

    const gamepad = new GamepadController({
      onAction: (action) => {
        switch (action) {
          case 'up':
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
            break
          case 'down':
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
            break
          case 'left':
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
            break
          case 'right':
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
            break
          case 'select':
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
            break
          case 'back':
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
            break
          case 'guide':
            navigate('/live')
            break
          case 'recall':
            window.dispatchEvent(new CustomEvent('kinora:recall-channel'))
            break
          case 'channelUp':
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true }))
            break
          case 'channelDown':
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }))
            break
        }
      },
    })
    gamepad.start()

    return () => {
      unregRemote()
      gamepad.stop()
      window.removeEventListener('kinora:remote-color', handleRemoteColor)
      window.removeEventListener('kinora:navigate_home', handleNavigateHome)
      window.removeEventListener('kinora:tune_channel', handleTuneChannel)
      window.removeEventListener('kinora:play_media_item', handlePlayMediaItem)
      window.removeEventListener('kinora:open-mobile-remote', handleOpenMobileRemote)
      window.removeEventListener('kinora:open-trakt-sync', handleOpenTraktSync)
      window.removeEventListener('kinora:open-downloads', handleOpenDownloads)
      remoteBridgeCleanupPromise.then((unsub) => unsub?.())
    }
  }, [navigate, store])

  useEffect(() => {
    window.scrollTo(0, 0)
    const timer = setTimeout(() => {
      restoreRouteFocus(pathname)
    }, 80)
    return () => {
      saveRouteFocus(pathname)
      clearTimeout(timer)
    }
  }, [pathname])

  // A new profile opens on setup, once per launch; it can be skipped and run again from Settings › Data.
  const offeredSetup = useRef(false)
  useEffect(() => {
    if (offeredSetup.current) return
    offeredSetup.current = true
    if (!setupDone && pathname === '/') navigate('/setup', { replace: true })
  }, [setupDone, pathname, navigate])

  // Session state restoration across desktop launches
  const restoredSession = useRef(false)
  useEffect(() => {
    if (restoredSession.current) return
    restoredSession.current = true
    if (setupDone && pathname === '/') {
      try {
        const last = localStorage.getItem('kinora.last_session.v1')
        if (last && last !== '/' && !last.startsWith('/watch/') && !last.startsWith('/setup')) {
          navigate(last, { replace: true })
        }
      } catch {}
    }
  }, [setupDone, pathname, navigate])

  useEffect(() => {
    if (pathname && !pathname.startsWith('/watch/') && pathname !== '/setup') {
      try {
        localStorage.setItem('kinora.last_session.v1', pathname)
      } catch {}
    }
  }, [pathname])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const typing = Boolean(
        t && (
          t.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) ||
          t.closest('input, textarea, select, [contenteditable="true"]')
        )
      )

      // Command palette: Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K') && !e.shiftKey) {
        e.preventDefault()
        setPaletteOpen((prev) => !prev)
        return
      }

      // View mode toggle: Ctrl+Shift+T or Cmd+Shift+T
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault()
        const nextMode = prefs.viewMode === 'tv' ? 'desktop' : 'tv'
        setPref('viewMode', nextMode)
        setPref('layoutMode', nextMode === 'tv' ? 'tv' : 'standard')
        return
      }

      const hasOpenOverlay = Boolean(
        paletteOpen ||
        shortcutsOpen ||
        whatsNewOpen ||
        document.querySelector('dialog[open], [role="dialog"], [aria-modal="true"], .modal-backdrop, .ds-command-backdrop')
      )

      if (typing || hasOpenOverlay) return

      // Keyboard shortcuts: ?
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        setShortcutsOpen((prev) => !prev)
        return
      }

      // Quick numbers navigation 1-8
      if (!e.ctrlKey && !e.metaKey) {
        const numNav: Record<string, string> = {
          '1': '/',
          '2': '/live',
          '3': '/movies',
          '4': '/series',
          '5': '/radio',
          '6': '/library',
          '7': '/sources',
          '8': '/settings',
        }
        if (numNav[e.key]) {
          e.preventDefault()
          navigate(numNav[e.key]!)
          return
        }
      }

      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('kinora:quick-search'))
      }
    }

    const openPalette = () => setPaletteOpen(true)
    const openShortcuts = () => setShortcutsOpen(true)
    const onOnline = () => window.dispatchEvent(new CustomEvent('kinora:network-online'))

    window.addEventListener('keydown', onKey)
    window.addEventListener('kinora:command-palette', openPalette)
    window.addEventListener('kinora:shortcuts', openShortcuts)
    window.addEventListener('online', onOnline)

    const unregNav = registerCommandHandler('navigate', (cmd) => {
      if (cmd.payload?.to) {
        navigate(cmd.payload.to, { replace: cmd.payload.replace })
      }
    })
    const unregSearch = registerCommandHandler('searchMedia', (cmd) => {
      if (cmd.payload?.query) {
        navigate(`/search?q=${encodeURIComponent(cmd.payload.query)}`)
      }
    })
    const unregMode = registerCommandHandler('toggleViewMode', (cmd) => {
      const nextMode = cmd.payload?.mode ?? (prefs.viewMode === 'tv' ? 'desktop' : 'tv')
      setPref('viewMode', nextMode)
      setPref('layoutMode', nextMode === 'tv' ? 'tv' : 'standard')
    })
    const unregSettings = registerCommandHandler('openSettings', () => {
      navigate('/settings')
    })

    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('kinora:command-palette', openPalette)
      window.removeEventListener('kinora:shortcuts', openShortcuts)
      window.removeEventListener('online', onOnline)
      unregNav()
      unregSearch()
      unregMode()
      unregSettings()
    }
  }, [navigate, prefs.viewMode, setPref])

  useEffect(() => {
    if (updater.state.stage === 'updated' && !hasSeenWhatsNew(APP_VERSION)) {
      setWhatsNewOpen(true)
    }
  }, [updater.state.stage])

  return (
    <NavMenuContext.Provider value={openNav}>
      <a href="#main" className="skip-link">Skip to content</a>
      <OfflineBanner />
      <div className={inPlayer ? '' : `shell${mediaLibrary.currentAudio ? ' has-audio-bar' : ''}`}>
      {!inPlayer && <Sidebar open={navOpen} onClose={closeNav} />}
      <main id="main" className="main" tabIndex={-1}>
        {!inPlayer && <UpdateNotificationBanner onViewReleaseNotes={() => setWhatsNewOpen(true)} />}
        <ErrorBoundary key={pathname}>
          <Suspense fallback={<div className="page-loader" aria-label="Loading page..."><span className="spinner" /></div>}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/discover" element={<DiscoverScreen />} />
              <Route path="/genres" element={<DiscoverScreen />} />
              <Route path="/genres/:genreId" element={<GenreBrowseScreen />} />
              <Route path="/genres/:genreId/:subgenreId" element={<GenreBrowseScreen />} />
              <Route path="/live" element={<LiveTV />} />
              <Route path="/guide" element={<Navigate to="/live" replace />} />
              <Route path="/recordings" element={<Recordings />} />
              <Route path="/movies" element={<Movies />} />
              <Route path="/movies/:id" element={<MovieDetail />} />
              <Route path="/series" element={<SeriesBrowse />} />
              <Route path="/series/:id" element={<SeriesDetail />} />
              <Route path="/series/:id/episode/:epId" element={<SeriesDetail />} />
              <Route path="/tv-shows" element={<SeriesBrowse />} />
              <Route path="/tv-shows/:id" element={<SeriesDetail />} />
              <Route path="/tv-shows/:id/episode/:epId" element={<SeriesDetail />} />
              <Route path="/radio" element={<RadioScreen />} />
              <Route path="/music" element={<MusicScreen />} />
              <Route path="/podcasts" element={<PodcastsScreen />} />
              <Route path="/audiobooks" element={<AudiobooksScreen />} />
              <Route path="/documentaries" element={<DocumentariesScreen />} />
              <Route path="/education" element={<EducationScreen />} />
              <Route path="/news" element={<NewsScreen />} />
              <Route path="/sports" element={<SportsScreen />} />
              <Route path="/books" element={<BooksScreen />} />
              <Route path="/culture" element={<CultureScreen />} />
              <Route path="/gaming" element={<GamingScreen />} />
              <Route path="/nature-science" element={<NatureScienceScreen />} />
              <Route path="/language" element={<LanguageScreen />} />
              <Route path="/archives" element={<ArchivesScreen />} />
              <Route path="/search" element={<Search />} />
              <Route path="/library" element={<Library />} />
              <Route path="/artwork" element={<ArtworkLibraryScreen />} />
              <Route path="/manage/artwork" element={<ArtworkLibraryScreen />} />
              <Route path="/sources" element={<Sources />} />
              <Route path="/sources/add" element={<AddSource />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/settings/:section" element={<Settings />} />
              <Route path="/watch/:ref" element={<Player />} />
              <Route path="/setup" element={<Setup />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      </div>
      {!inPlayer && (
        <AudioPlayerBar
          track={mediaLibrary.currentAudio}
          isPlaying={mediaLibrary.isAudioPlaying}
          volume={mediaLibrary.audioVolume}
          onTogglePlay={mediaLibrary.toggleAudioPlay}
          onStop={mediaLibrary.stopAudio}
          onVolumeChange={mediaLibrary.setAudioVolume}
          queue={mediaLibrary.audioQueue}
          onPlayNext={mediaLibrary.playNextInQueue}
          onRemoveFromQueue={mediaLibrary.removeFromQueue}
          onClearQueue={mediaLibrary.clearQueue}
          sleepTimerRemaining={mediaLibrary.sleepTimerRemaining}
          onSetSleepTimer={mediaLibrary.setSleepTimer}
          onUpdateLyrics={mediaLibrary.updateAudioLyrics}
        />
      )}
      {prefs.viewMode === 'tv' && !inPlayer && (
        <RemoteHintBar
          red="Live Guide"
          green="Channels"
          yellow="Audio"
          blue="Settings"
          ok="Select"
          back="Back"
          className={!inPlayer && mediaLibrary.currentAudio ? 'remote-hint-with-audio' : ''}
        />
      )}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <WhatsNewModal
        open={whatsNewOpen}
        onClose={() => setWhatsNewOpen(false)}
        onlineReleaseNotice={
          updater.state.stage === 'available' && updater.state.targetVersion
            ? {
                version: updater.state.targetVersion,
                releaseDate: updater.state.releaseDate,
                notes: updater.state.releaseNotes,
              }
            : null
        }
      />
      <RemoteControlModal open={remoteModalOpen} onClose={() => setRemoteModalOpen(false)} />
      <TraktSettingsModal open={traktModalOpen} onClose={() => setTraktModalOpen(false)} />
      <DownloadsModal
        open={downloadsModalOpen}
        onClose={() => setDownloadsModalOpen(false)}
        onPlayItem={(item) => {
          setDownloadsModalOpen(false)
          navigate(`/watch/${encodeURIComponent(downloadRef(item.id, item.extension))}`)
        }}
      />
      <AmbientScreensaver
        visible={screensaverActive}
        onDismiss={() => {
          setScreensaverActive(false)
          resetScreensaverTimer()
        }}
      />
    </NavMenuContext.Provider>
  )
}

function NotFound() {
  return (
    <div className="page">
      <PageHeader title="Not found" />
      <StateBlock icon="warning" title="This page does not exist" action={<Link to="/" className="btn btn-primary">Back to Home</Link>}>
        The address may be mistyped, or what it pointed to has been removed.
      </StateBlock>
    </div>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <ProfileProvider>
        <StoreProvider>
          <LocalMediaProvider>
            <NotificationProvider>
              <BackgroundTaskProvider>
                <ToastProvider>
                  <UpdaterProvider>
                    <Shell />
                  </UpdaterProvider>
                </ToastProvider>
              </BackgroundTaskProvider>
            </NotificationProvider>
          </LocalMediaProvider>
        </StoreProvider>
      </ProfileProvider>
    </BrowserRouter>
  )
}
