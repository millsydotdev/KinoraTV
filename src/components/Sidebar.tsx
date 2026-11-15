import { useState, useEffect, useRef, useLayoutEffect, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useStore } from '../state/store'
import { Icon, type IconName } from './Icon'
import './Sidebar.css'

interface NavItem {
  to: string
  label: string
  icon: IconName
  end?: boolean
}

const watchItems: NavItem[] = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/live', label: 'Live TV', icon: 'live' },
  { to: '/movies', label: 'Movies', icon: 'film' },
  { to: '/series', label: 'Series', icon: 'series' },
]

const listenItems: NavItem[] = [
  { to: '/radio', label: 'Radio', icon: 'radio' },
  { to: '/music', label: 'Music', icon: 'music' },
  { to: '/podcasts', label: 'Podcasts', icon: 'podcast' },
  { to: '/audiobooks', label: 'Audiobooks', icon: 'book' },
]

const exploreCoreItems: NavItem[] = [
  { to: '/library', label: 'Library', icon: 'library' },
  { to: '/sources', label: 'Sources', icon: 'sources' },
  { to: '/search', label: 'Search', icon: 'search' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

const exploreMoreItems: NavItem[] = [
  { to: '/recordings', label: 'Recordings', icon: 'record' },
  { to: '/documentaries', label: 'Documentaries', icon: 'documentary' },
  { to: '/news', label: 'News', icon: 'news' },
  { to: '/sports', label: 'Sports', icon: 'sports' },
  { to: '/education', label: 'Education', icon: 'education' },
  { to: '/books', label: 'Books', icon: 'book' },
  { to: '/culture', label: 'Culture & Arts', icon: 'palette' },
  { to: '/nature-science', label: 'Nature & Space', icon: 'nature' },
  { to: '/gaming', label: 'Gaming', icon: 'gaming' },
  { to: '/language', label: 'Languages', icon: 'globe' },
  { to: '/archives', label: 'Media Archives', icon: 'archive' },
]

export function Logo() {
  return (
    <span className="logo">
      <svg className="logo-mark" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M7 4.5 L26 16 L7 27.5 Z" fill="#e50914" />
        <path d="M13 12 L19 16 L13 20 Z" fill="#ffffff" />
      </svg>
      <span className="logo-word">KINORA<span className="logo-tv"> TV</span></span>
    </span>
  )
}

interface GroupState {
  watch: boolean
  listen: boolean
  explore: boolean
}

const STORAGE_KEY = 'kinora.sidebar.groups.v1'

function loadSavedGroupState(): GroupState {
  if (typeof window === 'undefined') return { watch: true, listen: true, explore: true }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // Ignore storage parse error
  }
  return { watch: true, listen: true, explore: true }
}

function getSynchronousSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = localStorage.getItem('kinora.prefs.v2')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (typeof parsed?.sidebarCollapsed === 'boolean') {
        return parsed.sidebarCollapsed
      }
    }
  } catch {}
  return false
}

// Synchronously apply dataset attribute immediately before mount to eliminate visual layout flash
if (typeof document !== 'undefined') {
  const initialCollapsed = getSynchronousSidebarCollapsed()
  document.documentElement.dataset.sidebar = initialCollapsed ? 'collapsed' : 'expanded'
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { sources, playlists, channels, totalPlaylistEntries, channelMode, mediaLibrary, prefs, setPref, recordings = [], xtreamSources = [], guides = [] } = useStore()
  const { pathname } = useLocation()

  const [groupState, setGroupState] = useState<GroupState>(loadSavedGroupState)
  const [initialCollapsed] = useState(getSynchronousSidebarCollapsed)
  const collapsed = prefs.sidebarCollapsed ?? initialCollapsed
  const setCollapsed = (val: boolean | ((c: boolean) => boolean)) => {
    const next = typeof val === 'function' ? val(collapsed) : val
    setPref('sidebarCollapsed', next)
  }
  const isExploreMoreActive = exploreMoreItems.some((i) => pathname.startsWith(i.to))
  const [exploreMoreOpen, setExploreMoreOpen] = useState(isExploreMoreActive)
  const exploreNavRef = useRef<HTMLElement>(null)

  useEffect(() => onClose(), [pathname, onClose])

  useEffect(() => {
    if (isExploreMoreActive) setExploreMoreOpen(true)
  }, [isExploreMoreActive])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(groupState))
    } catch {
      // Ignore storage write error
    }
  }, [groupState])

  // Ensure group containing active item is open
  useEffect(() => {
    if (watchItems.some((i) => pathname === i.to || (i.to !== '/' && pathname.startsWith(i.to)))) {
      setGroupState((s) => (s.watch ? s : { ...s, watch: true }))
    } else if (listenItems.some((i) => pathname.startsWith(i.to))) {
      setGroupState((s) => (s.listen ? s : { ...s, listen: true }))
    } else if (
      exploreCoreItems.some((i) => pathname.startsWith(i.to)) ||
      exploreMoreItems.some((i) => pathname.startsWith(i.to))
    ) {
      setGroupState((s) => (s.explore ? s : { ...s, explore: true }))
    }
  }, [pathname])

  useLayoutEffect(() => {
    document.documentElement.dataset.sidebar = collapsed ? 'collapsed' : 'expanded'
  }, [collapsed])

  const toggleGroup = (key: keyof GroupState) => {
    setGroupState((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // Live navigation badges (Audit #89)
  const isAnyRecording = recordings.some((r) => r.status === 'recording')
  const totalSources = playlists.length + xtreamSources.length + guides.length

  const getNavBadge = (to: string): ReactNode => {
    if (to === '/live' && channels.length > 0) {
      return <span className="side-link-badge">{channels.length}</span>
    }
    if (to === '/sources' && totalSources > 0) {
      return <span className="side-link-badge">{totalSources}</span>
    }
    if (to === '/recordings') {
      if (isAnyRecording) {
        return (
          <span className="side-link-badge is-rec" title="Recording active">
            <span className="rec-pulse-dot" /> REC
          </span>
        )
      }
      const scheduledCount = recordings.filter((r) => r.status === 'scheduled').length
      if (scheduledCount > 0) {
        return <span className="side-link-badge">{scheduledCount}</span>
      }
    }
    return null
  }

  return (
    <>
      <aside className={`sidebar${open ? ' is-open' : ''}${collapsed ? ' is-collapsed' : ''}`} aria-label="Main navigation">
        <div className="sidebar-top">
          <NavLink to="/" className="sidebar-brand" aria-label="Kinora home" title="Kinora Home">
            <Logo />
          </NavLink>
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            <Icon name={collapsed ? 'right' : 'left'} size={16} />
          </button>
        </div>

        <div className="sidebar-scrollable">
          {/* WATCH GROUP */}
          <div className="sidebar-section">
            <button
              type="button"
              className="sidebar-section-header-btn"
              onClick={() => toggleGroup('watch')}
              aria-expanded={groupState.watch}
              aria-controls="sidebar-nav-watch"
              title={groupState.watch ? 'Collapse Watch section' : 'Expand Watch section'}
            >
              <span className="sidebar-section-title">Watch</span>
              <Icon name="down" size={13} className={`sidebar-chevron sidebar-expand-icon ${groupState.watch ? 'is-open' : ''}`} />
            </button>
            <div
              id="sidebar-nav-watch"
              className={`sidebar-collapsible-grid ${groupState.watch ? 'is-open' : ''}`}
            >
              <nav className="sidebar-nav" aria-label="Watch">
                {watchItems.map((i) => (
                  <NavLink key={i.to} to={i.to} end={i.end} className="side-link" title={i.label} data-tip={i.label}>
                    <Icon name={i.icon} size={18} />
                    <span>{i.label}</span>
                    {getNavBadge(i.to)}
                  </NavLink>
                ))}
              </nav>
            </div>
          </div>

          {/* LISTEN GROUP */}
          <div className="sidebar-section">
            <button
              type="button"
              className="sidebar-section-header-btn"
              onClick={() => toggleGroup('listen')}
              aria-expanded={groupState.listen}
              aria-controls="sidebar-nav-listen"
              title={groupState.listen ? 'Collapse Listen section' : 'Expand Listen section'}
            >
              <span className="sidebar-section-title">Listen</span>
              <Icon name="down" size={13} className={`sidebar-chevron sidebar-expand-icon ${groupState.listen ? 'is-open' : ''}`} />
            </button>
            <div
              id="sidebar-nav-listen"
              className={`sidebar-collapsible-grid ${groupState.listen ? 'is-open' : ''}`}
            >
              <nav className="sidebar-nav" aria-label="Listen">
                {listenItems.map((i) => (
                  <NavLink key={i.to} to={i.to} end={i.end} className="side-link" title={i.label} data-tip={i.label}>
                    <Icon name={i.icon} size={18} />
                    <span>{i.label}</span>
                  </NavLink>
                ))}
              </nav>
            </div>
          </div>

          {/* EXPLORE GROUP */}
          <div className="sidebar-section sidebar-section-explore">
            <button
              type="button"
              className="sidebar-section-header-btn"
              onClick={() => setExploreMoreOpen((o) => !o)}
              aria-expanded={exploreMoreOpen}
              aria-controls="sidebar-nav-explore-wrapper"
              title={exploreMoreOpen ? 'Collapse additional categories' : 'Expand additional categories'}
            >
              <span className="sidebar-section-title">Explore</span>
              <Icon name="down" size={13} className={`sidebar-chevron sidebar-expand-icon ${exploreMoreOpen ? 'is-open' : ''}`} />
            </button>
            <div
              id="sidebar-nav-explore-wrapper"
              className="sidebar-collapsible-grid is-open"
            >
              <nav className="sidebar-nav" aria-label="Explore">
                {exploreCoreItems.map((i) => (
                  <NavLink key={i.to} to={i.to} end={i.end} className="side-link" title={i.label} data-tip={i.label}>
                    <Icon name={i.icon} size={18} />
                    <span>{i.label}</span>
                    {getNavBadge(i.to)}
                  </NavLink>
                ))}
              </nav>

              {exploreMoreOpen && (
                <nav ref={exploreNavRef} className="sidebar-nav sidebar-nav-explore" aria-label="Explore Categories">
                  {exploreMoreItems.map((i) => (
                    <NavLink
                      key={i.to}
                      to={i.to}
                      end={i.end}
                      className="side-link side-link-sub"
                      title={i.label}
                      data-tip={i.label}
                    >
                      <Icon name={i.icon} size={17} />
                      <span>{i.label}</span>
                      {getNavBadge(i.to)}
                    </NavLink>
                  ))}
                </nav>
              )}
            </div>
          </div>
        </div>

        {/* BOTTOM STORAGE CARD & STATUS */}
        <div className="sidebar-bottom">
          <div className="sidebar-storage-card" title="Personal storage and media library space">
            <div className="storage-card-row">
              <span className="storage-card-icon">
                <Icon name="hardDrive" size={18} />
              </span>
              <div className="storage-card-meta">
                <strong className="storage-card-title">Library</strong>
                <span className="storage-card-sub">4.2 TB free of 8 TB</span>
              </div>
            </div>
            <div className="storage-progress-bar" aria-label="Storage used: 3.8 of 8 TB">
              <div className="storage-progress-fill" style={{ width: '47.5%' }} />
            </div>
          </div>

          <div
            className="sidebar-status-card"
            title={
              channelMode === 'playlists'
                ? `${totalPlaylistEntries} total playlist entries combined into ${channels.length} unique channels`
                : channelMode === 'demo'
                  ? 'Sample mode: fictional content, nothing streams'
                  : 'Personal media library'
            }
          >
            {channelMode === 'playlists' ? (
              <>
                <p>
                  <span className="status-dot is-live" aria-hidden="true" />
                  <span>Playlist mode</span>
                </p>
                <p className="faint">
                  {playlists.length} {playlists.length === 1 ? 'playlist' : 'playlists'} · {channels.length} channels
                </p>
              </>
            ) : channelMode === 'demo' ? (
              <>
                <p>
                  <span className="status-dot is-live" aria-hidden="true" />
                  <span>Sample mode</span>
                </p>
                <p className="faint">
                  {sources.length} sample sources · {channels.length} channels
                </p>
              </>
            ) : (
              <>
                <p>
                  <span className="status-dot is-live" aria-hidden="true" />
                  <span>Media library</span>
                </p>
                <p className="faint">{mediaLibrary.mySources.length} saved personal sources</p>
              </>
            )}
          </div>
        </div>
      </aside>
      {open && <button type="button" className="sidebar-scrim" aria-label="Close menu" onClick={onClose} />}
    </>
  )
}
