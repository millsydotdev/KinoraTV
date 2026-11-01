import { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useStore } from '../state/store'
import { Icon, type IconName } from './Icon'
import './Sidebar.css'

const items: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/live', label: 'Live TV', icon: 'live' },
  { to: '/movies', label: 'Movies', icon: 'film' },
  { to: '/series', label: 'Series', icon: 'series' },
  { to: '/library', label: 'Library', icon: 'library' },
  { to: '/sources', label: 'Sources', icon: 'link' },
  { to: '/search', label: 'Search', icon: 'search' },
  { to: '/settings', label: 'Settings', icon: 'cog' },
]

export function Logo() {
  return (
    <span className="logo">
      <svg className="logo-mark" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M6 3.5 27 16 6 28.5Z" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinejoin="round" />
        <path d="M12.5 12.2 19 16l-6.5 3.8Z" fill="currentColor" />
      </svg>
      <span className="logo-word">KINORA<span className="logo-tv"> TV</span></span>
    </span>
  )
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { sources, playlists, channels, channelMode } = useStore()
  const { pathname } = useLocation()

  useEffect(() => onClose(), [pathname, onClose])

  return (
    <>
      <aside className={`sidebar${open ? ' is-open' : ''}`} aria-label="Main">
        <NavLink to="/" className="sidebar-brand" aria-label="Kinora home"><Logo /></NavLink>
        <nav className="sidebar-nav" aria-label="Primary">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end} className="side-link" title={i.label}>
              <Icon name={i.icon} />
              <span>{i.label}</span>
            </NavLink>
          ))}
        </nav>
        {channelMode === 'playlists' ? (
          <div className="sidebar-status" title="Imported playlists, saved on this device">
            <p><span className="status-dot" aria-hidden="true" />Imported playlists</p>
            <p className="faint">{playlists.length} {playlists.length === 1 ? 'source' : 'sources'} · {channels.length} channels</p>
          </div>
        ) : channelMode === 'demo' ? (
          <div className="sidebar-status" title="Sample mode: fictional content, nothing streams">
            <p><span className="status-dot" aria-hidden="true" />Sample mode</p>
            <p className="faint">{sources.length} sample sources · {channels.length} channels</p>
          </div>
        ) : (
          <div className="sidebar-status" title="No sources added yet">
            <p><span className="status-dot" aria-hidden="true" />No sources yet</p>
            <p className="faint"><NavLink to="/setup" className="text-link">Set up Kinora</NavLink></p>
          </div>
        )}
      </aside>
      {open && <button type="button" className="sidebar-scrim" aria-label="Close menu" onClick={onClose} />}
    </>
  )
}
