import { useState, useEffect, useLayoutEffect } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../state/store'
import { Icon, type IconName } from './Icon'
import { KPlayMark } from './KPlayMark'
import './Sidebar.css'

export function Logo() {
  return (
    <span className="logo">
      <KPlayMark size={26} className="logo-mark" idPrefix="sb-logo" />
      <span className="logo-text">
        <span className="logo-word">KINORA</span>
        <span className="logo-badge logo-tv">TV</span>
      </span>
    </span>
  )
}

interface NavLeaf {
  to: string
  label: string
  icon: IconName
  exact?: boolean
}

interface NavSection {
  id: string
  label: string
  icon: IconName
  to?: string
  children?: NavLeaf[]
}

interface NavGroup {
  id: string
  title?: string
  sections: NavSection[]
}

const navGroups: NavGroup[] = [
  {
    id: 'primary',
    sections: [
      {
        id: 'home',
        label: 'Home',
        icon: 'home',
        to: '/',
      },
      {
        id: 'live',
        label: 'Live TV',
        icon: 'live',
        to: '/live',
        children: [
          { to: '/live', label: 'TV Guide', icon: 'calendar', exact: true },
          { to: '/live?view=channels', label: 'Channels', icon: 'grid' },
          { to: '/live?tab=catchup', label: 'Catch-Up', icon: 'rotateCw' },
          { to: '/recordings', label: 'Recordings', icon: 'record' },
        ],
      },
      {
        id: 'movies-series',
        label: 'Movies & Series',
        icon: 'film',
        to: '/movies',
        children: [
          { to: '/movies', label: 'Movies', icon: 'film' },
          { to: '/series', label: 'TV Shows', icon: 'series' },
        ],
      },
      {
        id: 'library',
        label: 'Media Library',
        icon: 'library',
        to: '/library',
      },
      {
        id: 'sources',
        label: 'Sources',
        icon: 'sources',
        to: '/sources',
      },
    ],
  },
  {
    id: 'audio-reading',
    title: 'Audio & Books',
    sections: [
      {
        id: 'audio',
        label: 'Audio',
        icon: 'audio',
        to: '/radio',
        children: [
          { to: '/radio', label: 'Radio', icon: 'radio' },
          { to: '/music', label: 'Music', icon: 'music' },
          { to: '/podcasts', label: 'Podcasts', icon: 'podcast' },
          { to: '/audiobooks', label: 'Audiobooks', icon: 'book' },
        ],
      },
      {
        id: 'reading',
        label: 'Books',
        icon: 'book',
        to: '/books',
      },
    ],
  },
  {
    id: 'explore-group',
    title: 'Discover',
    sections: [
      {
        id: 'discover',
        label: 'Discover',
        icon: 'compass',
        to: '/documentaries',
        children: [
          { to: '/documentaries', label: 'Documentaries', icon: 'documentary' },
          { to: '/news', label: 'News', icon: 'news' },
          { to: '/sports', label: 'Sports', icon: 'sports' },
          { to: '/education', label: 'Education', icon: 'education' },
          { to: '/culture', label: 'Culture & Arts', icon: 'palette' },
          { to: '/nature-science', label: 'Nature & Space', icon: 'nature' },
          { to: '/gaming', label: 'Gaming', icon: 'gaming' },
          { to: '/language', label: 'Languages', icon: 'globe' },
          { to: '/archives', label: 'Media Archives', icon: 'archive' },
        ],
      },
    ],
  },
]

const STORAGE_KEY = 'kinora.sidebar.sections.v2'

function loadSavedSectionState(): Record<string, boolean> {
  if (typeof window === 'undefined') return { live: true, 'movies-series': true }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { live: true, 'movies-series': true }
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

if (typeof document !== 'undefined') {
  const initialCollapsed = getSynchronousSidebarCollapsed()
  document.documentElement.dataset.sidebar = initialCollapsed ? 'collapsed' : 'expanded'
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { playlists, prefs, setPref, recordings = [], xtreamSources = [], guides = [] } = useStore()
  const location = useLocation()
  const { pathname, search } = location

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(loadSavedSectionState)
  const [initialCollapsed] = useState(getSynchronousSidebarCollapsed)
  const collapsed = prefs.sidebarCollapsed ?? initialCollapsed

  const setCollapsed = (val: boolean | ((c: boolean) => boolean)) => {
    const next = typeof val === 'function' ? val(collapsed) : val
    setPref('sidebarCollapsed', next)
  }

  useEffect(() => onClose(), [pathname, search, onClose])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(expandedSections))
    } catch {}
  }, [expandedSections])

  useLayoutEffect(() => {
    document.documentElement.dataset.sidebar = collapsed ? 'collapsed' : 'expanded'
  }, [collapsed])

  // Keyboard shortcut: Ctrl+B or Cmd+B to toggle sidebar collapse
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b' && !e.shiftKey && !e.altKey) {
        const activeEl = document.activeElement
        const isInput = activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement
        if (!isInput) {
          e.preventDefault()
          setCollapsed((c) => !c)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [collapsed])

  const isLeafActive = (leaf: NavLeaf) => {
    if (leaf.to.includes('?')) {
      const [leafPath, leafQuery] = leaf.to.split('?')
      return pathname === leafPath && search === `?${leafQuery}`
    }
    if (leaf.exact) {
      return pathname === leaf.to && !search
    }
    if (leaf.to === '/series') {
      return pathname === '/series' || pathname.startsWith('/series/') || pathname.startsWith('/tv-shows')
    }
    return pathname === leaf.to || pathname.startsWith(leaf.to + '/')
  }

  // Automatically expand group containing active item
  useEffect(() => {
    for (const group of navGroups) {
      for (const section of group.sections) {
        if (section.children) {
          const matchesChild = section.children.some(isLeafActive)
          if (matchesChild && !expandedSections[section.id]) {
            setExpandedSections((prev) => ({ ...prev, [section.id]: true }))
          }
        }
      }
    }
  }, [pathname, search])

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const isSectionActive = (section: NavSection) => {
    if (section.to === '/') return pathname === '/'
    if (section.id === 'live') {
      return pathname === '/live' || pathname.startsWith('/live/') || pathname === '/recordings'
    }
    if (section.id === 'movies-series') {
      return (
        pathname === '/movies' ||
        pathname.startsWith('/movies/') ||
        pathname === '/series' ||
        pathname.startsWith('/series/') ||
        pathname.startsWith('/tv-shows')
      )
    }
    if (section.id === 'audio') {
      return pathname === '/radio' || pathname === '/music' || pathname === '/podcasts' || pathname === '/audiobooks'
    }
    if (section.id === 'discover') {
      return section.children?.some(isLeafActive) ?? false
    }
    if (section.to) {
      return pathname === section.to || pathname.startsWith(section.to + '/')
    }
    if (section.children) {
      return section.children.some(isLeafActive)
    }
    return false
  }

  const isSettingsActive = pathname === '/settings' || pathname.startsWith('/settings/')
  const totalSources = playlists.length + xtreamSources.length + guides.length
  const isAnyRecording = recordings.some((r) => r.status === 'recording')

  return (
    <>
      <aside className={`sidebar${open ? ' is-open' : ''}${collapsed ? ' is-collapsed' : ''}`} aria-label="Main navigation">
        {/* Dedicated Rounded Header Area */}
        <div className="sidebar-top">
          <NavLink to="/" className="sidebar-brand" aria-label="Kinora home" title="Kinora Home">
            <Logo />
          </NavLink>
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
            title={collapsed ? 'Expand navigation (Ctrl+B)' : 'Collapse navigation (Ctrl+B)'}
          >
            <Icon name="layoutSidebar" size={18} />
          </button>
        </div>

        {/* Separated Navigation Sections */}
        <nav className="sidebar-scrollable" aria-label="Primary navigation">
          {navGroups.map((group, groupIdx) => (
            <div key={group.id} className="sidebar-group-block">
              {groupIdx > 0 && (
                <div className="sidebar-section-divider sidebar-group-divider" aria-hidden="true" />
              )}

              {group.title && !collapsed && (
                <div className="sidebar-group-header">
                  <span className="sidebar-group-label">{group.title}</span>
                </div>
              )}

              <div className="sidebar-group-surface">
                {group.sections.map((section) => {
                  const hasChildren = Boolean(section.children && section.children.length > 0)
                  const isExpanded = Boolean(expandedSections[section.id])
                  const active = isSectionActive(section)

                  if (!hasChildren) {
                    return (
                      <div key={section.id} className="sidebar-item-wrap">
                        <NavLink
                          to={section.to ?? '/'}
                          className={({ isActive }) => `sidebar-root-btn ${isActive ? 'is-active' : ''}`}
                          title={section.id === 'sources' ? `Sources (${playlists.length} playlists, ${guides.length} guide feeds)` : section.label}
                        >
                          <span className="sidebar-icon-box">
                            <Icon name={section.icon} size={20} className="sidebar-icon" />
                          </span>
                          {!collapsed && <span className="sidebar-label">{section.label}</span>}
                          {!collapsed && section.id === 'sources' && totalSources > 0 && (
                            <span className="sidebar-badge">{totalSources}</span>
                          )}
                        </NavLink>
                      </div>
                    )
                  }

                  // If expanded and not collapsed, the parent button should not look selected when a child is active
                  const isHeaderActive = active && (!isExpanded || collapsed)

                  return (
                    <div key={section.id} className={`sidebar-section-wrap ${active ? 'is-active-parent' : ''}`}>
                      <div className="sidebar-group-header-row">
                        <button
                          type="button"
                          className={`sidebar-root-btn ${isHeaderActive ? 'is-active' : ''}`}
                          onClick={() => {
                            if (collapsed) {
                              const target = section.to ?? section.children?.[0]?.to ?? '/'
                              navigate(target)
                            } else {
                              toggleSection(section.id)
                            }
                          }}
                          title={section.label}
                          aria-expanded={isExpanded}
                        >
                          <span className="sidebar-icon-box">
                            <Icon name={section.icon} size={20} className="sidebar-icon" />
                          </span>
                          {!collapsed && <span className="sidebar-label">{section.label}</span>}
                          {!collapsed && section.id === 'live' && isAnyRecording && (
                            <span className="sidebar-badge is-rec" title="Recording active">
                              <span className="sidebar-rec-dot" /> REC
                            </span>
                          )}
                          {!collapsed && (
                            <Icon
                              name="chevronRight"
                              size={14}
                              className={`sidebar-chevron ${isExpanded ? 'is-open' : ''}`}
                            />
                          )}
                        </button>
                      </div>

                      {!collapsed && isExpanded && (
                        <div className={`sidebar-children-list ${section.id === 'discover' ? 'sidebar-nav-explore' : ''}`}>
                          {section.children!.map((child) => {
                            const childActive = isLeafActive(child)
                            return (
                              <NavLink
                                key={child.to + child.label}
                                to={child.to}
                                className={`sidebar-child-link side-link ${childActive ? 'is-active' : ''}`}
                              >
                                <Icon name={child.icon} size={16} className="sidebar-child-icon" />
                                <span className="sidebar-child-label">{child.label}</span>
                                {child.to === '/recordings' && isAnyRecording && (
                                  <span className="sidebar-rec-dot" title="Active recording" />
                                )}
                              </NavLink>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Visually Separate Settings Area Anchored at the Bottom */}
        <div className="sidebar-bottom">
          <div className="sidebar-section-divider sidebar-bottom-divider" aria-hidden="true" />
          <div className="sidebar-settings-card">
            <NavLink
              to="/settings"
              className={`sidebar-root-btn settings-root-btn ${isSettingsActive ? 'is-active' : ''}`}
              title="Settings"
            >
              <span className="sidebar-icon-box">
                <Icon name="settings" size={20} className="sidebar-icon" />
              </span>
              {!collapsed && <span className="sidebar-label">Settings</span>}
            </NavLink>
          </div>
        </div>
      </aside>

      {open && <div className="sidebar-backdrop" onClick={onClose} aria-hidden="true" />}
    </>
  )
}
