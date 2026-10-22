import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import { NavMenuContext, PageHeader } from './components/PageHeader'
import { Sidebar } from './components/Sidebar'
import { StateBlock } from './components/ui'
import { Home } from './screens/Home'
import { Library } from './screens/Library'
import { LiveTV } from './screens/LiveTV'
import { MovieDetail } from './screens/MovieDetail'
import { Movies } from './screens/Movies'
import { Player } from './screens/Player'
import { Search } from './screens/Search'
import { SeriesBrowse } from './screens/SeriesBrowse'
import { SeriesDetail } from './screens/SeriesDetail'
import { Settings } from './screens/Settings'
import { AddSource, Sources } from './screens/Sources'
import { ACCENTS, accentTokens } from './lib/theme'
import { StoreProvider, useStore } from './state/store'

function Shell() {
  const { prefs } = useStore()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const inPlayer = pathname.startsWith('/watch/')
  const [navOpen, setNavOpen] = useState(false)
  const closeNav = useCallback(() => setNavOpen(false), [])
  const openNav = useCallback(() => setNavOpen(true), [])

  useEffect(() => {
    const el = document.documentElement
    el.dataset.theme = prefs.theme
    el.dataset.density = prefs.density
    el.dataset.text = prefs.textSize
    el.dataset.motion = prefs.reduceMotion ? 'reduce' : 'full'
    const t = accentTokens(prefs.accent === 'custom' ? prefs.customAccent : ACCENTS[prefs.accent], prefs.theme)
    el.style.setProperty('--accent', t.accent)
    el.style.setProperty('--accent-ink', t.ink)
    el.style.setProperty('--accent-text', t.text)
  }, [prefs.theme, prefs.density, prefs.accent, prefs.customAccent, prefs.textSize, prefs.reduceMotion])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      const typing = t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !document.querySelector('dialog[open]')) {
        e.preventDefault()
        navigate('/search')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  return (
    <NavMenuContext.Provider value={openNav}>
      <a href="#main" className="skip-link">Skip to content</a>
      <div className={inPlayer ? '' : 'shell'}>
      {!inPlayer && <Sidebar open={navOpen} onClose={closeNav} />}
      <main id="main" className="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/live" element={<LiveTV />} />
          <Route path="/movies" element={<Movies />} />
          <Route path="/movies/:id" element={<MovieDetail />} />
          <Route path="/series" element={<SeriesBrowse />} />
          <Route path="/series/:id" element={<SeriesDetail />} />
          <Route path="/search" element={<Search />} />
          <Route path="/library" element={<Library />} />
          <Route path="/sources" element={<Sources />} />
          <Route path="/sources/add" element={<AddSource />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/:section" element={<Settings />} />
          <Route path="/watch/:ref" element={<Player />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      </div>
    </NavMenuContext.Provider>
  )
}

function NotFound() {
  return (
    <div className="page">
      <PageHeader title="Not found" />
      <StateBlock icon="warning" title="This page does not exist" action={<Link to="/" className="btn btn-primary">Back to Home</Link>}>
        The address may be mistyped, or the title was removed from the demonstration catalogue.
      </StateBlock>
    </div>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <StoreProvider>
        <ToastProvider>
          <Shell />
        </ToastProvider>
      </StoreProvider>
    </BrowserRouter>
  )
}
