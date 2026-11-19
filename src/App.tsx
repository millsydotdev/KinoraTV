import { useCallback, useEffect, useRef, useState } from 'react'
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
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
import { Library } from './screens/Library'
import { LiveTV } from './screens/LiveTV'
import { Recordings } from './screens/Recordings'
import { MovieDetail } from './screens/MovieDetail'
import { Movies } from './screens/Movies'
import { Player } from './screens/Player'
import { Search } from './screens/Search'
import { Setup } from './screens/Setup'
import { SeriesBrowse } from './screens/SeriesBrowse'
import { SeriesDetail } from './screens/SeriesDetail'
import { Settings } from './screens/Settings'
import { AddSource, Sources } from './screens/Sources'
import { RadioScreen } from './screens/RadioScreen'
import { MusicScreen } from './screens/MusicScreen'
import { PodcastsScreen } from './screens/PodcastsScreen'
import { AudiobooksScreen } from './screens/AudiobooksScreen'
import { DocumentariesScreen } from './screens/DocumentariesScreen'
import { EducationScreen } from './screens/EducationScreen'
import { NewsScreen } from './screens/NewsScreen'
import { SportsScreen } from './screens/SportsScreen'
import { BooksScreen } from './screens/BooksScreen'
import { CultureScreen } from './screens/CultureScreen'
import { GamingScreen } from './screens/GamingScreen'
import { NatureScienceScreen } from './screens/NatureScienceScreen'
import { LanguageScreen } from './screens/LanguageScreen'
import { ArchivesScreen } from './screens/ArchivesScreen'
import { AudioPlayerBar } from './components/AudioPlayerBar'
import { OfflineBanner } from './components/OfflineBanner'
import { WhatsNewModal, hasSeenWhatsNew } from './components/WhatsNewModal'
import { applyThemeTokensToElement } from './lib/theme'
import { ProfileProvider } from './state/profiles'
import { StoreProvider, useStore } from './state/store'
import { LocalMediaProvider } from './state/localMedia'

function Shell() {
  const { prefs, setupDone, mediaLibrary } = useStore()
  const navigate = useNavigate()
  useEffect(() => {
    ;(window as unknown as { __kinora_navigate?: (to: string) => void }).__kinora_navigate = (to: string) => navigate(to)
    return () => {
      delete (window as unknown as { __kinora_navigate?: (to: string) => void }).__kinora_navigate
    }
  }, [navigate])
  const { pathname } = useLocation()
  // Full-window screens: no sidebar.
  const inPlayer = pathname.startsWith('/watch/') || pathname === '/setup'
  const [navOpen, setNavOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [whatsNewOpen, setWhatsNewOpen] = useState(false)
  const closeNav = useCallback(() => setNavOpen(false), [])
  const openNav = useCallback(() => setNavOpen(true), [])

  const checkedUpgrade = useRef(false)
  useEffect(() => {
    if (checkedUpgrade.current) return
    checkedUpgrade.current = true
    try {
      const lastVersion = localStorage.getItem('kinora.version.v1')
      if (lastVersion && lastVersion !== '0.5.0' && !hasSeenWhatsNew('0.5.0')) {
        setWhatsNewOpen(true)
      }
      localStorage.setItem('kinora.version.v1', '0.5.0')
    } catch {
      // Ignore storage errors
    }
  }, [])

  useEffect(() => {
    const el = document.documentElement
    el.dataset.theme = prefs.theme
    el.dataset.density = prefs.density
    el.dataset.text = prefs.textSize
    el.dataset.motion = prefs.reduceMotion ? 'reduce' : 'full'
    applyThemeTokensToElement(el, prefs.theme, prefs.accent, prefs.customAccent)
  }, [prefs.theme, prefs.density, prefs.accent, prefs.customAccent, prefs.textSize, prefs.reduceMotion])

  useEffect(() => {
    window.scrollTo(0, 0)
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
      const t = e.target as HTMLElement
      const typing = t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)

      // Command palette: Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setPaletteOpen((prev) => !prev)
        return
      }

      // Keyboard shortcuts: ?
      if (e.key === '?' && !typing && !e.ctrlKey && !e.metaKey && !document.querySelector('dialog[open]')) {
        e.preventDefault()
        setShortcutsOpen((prev) => !prev)
        return
      }

      // Quick numbers navigation 1-8
      if (!typing && !e.ctrlKey && !e.metaKey && !document.querySelector('dialog[open]')) {
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

      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !document.querySelector('dialog[open]')) {
        e.preventDefault()
        navigate('/search')
      }
    }

    const openPalette = () => setPaletteOpen(true)
    const openShortcuts = () => setShortcutsOpen(true)
    const onOnline = () => window.dispatchEvent(new CustomEvent('kinora:network-online'))

    window.addEventListener('keydown', onKey)
    window.addEventListener('kinora:command-palette', openPalette)
    window.addEventListener('kinora:shortcuts', openShortcuts)
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('kinora:command-palette', openPalette)
      window.removeEventListener('kinora:shortcuts', openShortcuts)
      window.removeEventListener('online', onOnline)
    }
  }, [navigate])

  return (
    <NavMenuContext.Provider value={openNav}>
      <a href="#main" className="skip-link">Skip to content</a>
      <OfflineBanner />
      <div className={inPlayer ? '' : 'shell'}>
      {!inPlayer && <Sidebar open={navOpen} onClose={closeNav} />}
      <main id="main" className="main" tabIndex={-1}>
        <ErrorBoundary key={pathname}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/live" element={<LiveTV />} />
            <Route path="/recordings" element={<Recordings />} />
            <Route path="/movies" element={<Movies />} />
            <Route path="/movies/:id" element={<MovieDetail />} />
            <Route path="/series" element={<SeriesBrowse />} />
            <Route path="/series/:id" element={<SeriesDetail />} />
            <Route path="/tv-shows" element={<SeriesBrowse />} />
            <Route path="/tv-shows/:id" element={<SeriesDetail />} />
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
            <Route path="/sources" element={<Sources />} />
            <Route path="/sources/add" element={<AddSource />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/:section" element={<Settings />} />
            <Route path="/watch/:ref" element={<Player />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
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
        />
      )}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <WhatsNewModal open={whatsNewOpen} onClose={() => setWhatsNewOpen(false)} />
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
                  <Shell />
                </ToastProvider>
              </BackgroundTaskProvider>
            </NotificationProvider>
          </LocalMediaProvider>
        </StoreProvider>
      </ProfileProvider>
    </BrowserRouter>
  )
}
