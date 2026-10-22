import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { channelById, scheduleFor } from '../data/channels'
import { clock, dayLabel, useNow } from '../lib/time'
import { useStore } from '../state/store'
import { Icon } from './Icon'
import './PageHeader.css'

export const NavMenuContext = createContext<() => void>(() => undefined)

/** Reminder ids are XMLTV-style `<channelId>@<startMs>` programme ids. */
function parseReminder(id: string) {
  const [channelId = '', start = ''] = id.split('@')
  const channel = channelById(channelId)
  const programme = channel && scheduleFor(channel, Number(start)).find((p) => p.id === id)
  return channel && programme ? { id, channel, start: programme.start, title: programme.title } : null
}

function Reminders() {
  const store = useStore()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const now = useNow()
  const list = store.library.reminders.map(parseReminder).filter((r): r is NonNullable<typeof r> => !!r && r.start > now).sort((a, b) => a.start - b.start)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div className="reminders" ref={box}>
      <button type="button" className="icon-btn" aria-label={`Reminders, ${list.length} set`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="bell" />
        {list.length > 0 && <span className="bell-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className="reminders-pop" role="group" aria-label="Reminders">
          <p className="label">Reminders</p>
          {list.length === 0 ? (
            <p className="faint reminders-empty">No reminders. Open a programme in the Live TV guide and choose Remind me.</p>
          ) : (
            <ul>
              {list.map((r) => (
                <li key={r.id}>
                  <Link to={`/live?channel=${r.channel.id}`} onClick={() => setOpen(false)}>
                    <span className="tnum faint">{dayLabel(r.start, now)} {clock(r.start, store.prefs.timeFormat)}</span>
                    <span>{r.title}<span className="faint"> · {r.channel.name}</span></span>
                  </Link>
                  <button type="button" className="icon-btn" aria-label="Remove reminder" onClick={() => store.toggleReminder(r.id)}><Icon name="close" size={16} /></button>
                </li>
              ))}
            </ul>
          )}
          <p className="faint reminders-note">Alerts start working once playback is connected.</p>
        </div>
      )}
    </div>
  )
}

/** Per-screen header from the mockup: title and sub-tabs on the left, search, bell and clock on the right. */
export function PageHeader({ title, tabs, search = true, overlay = false, actions }: { title?: ReactNode; tabs?: ReactNode; search?: boolean; overlay?: boolean; actions?: ReactNode }) {
  const now = useNow()
  const { prefs } = useStore()
  const openNav = useContext(NavMenuContext)
  return (
    <header className={`page-header${overlay ? ' is-overlay' : ''}`}>
      <button type="button" className="icon-btn menu-btn" aria-label="Open menu" onClick={openNav}><Icon name="menu" /></button>
      <div className="page-header-left">
        {title && <h1 className="page-title">{title}</h1>}
        {tabs}
      </div>
      <div className="page-header-right">
        {search && (
          <Link to="/search" className="search-pill" aria-label="Search, shortcut slash">
            <Icon name="search" size={18} />
            <span>Search movies, series, channels…</span>
          </Link>
        )}
        {actions}
        <Reminders />
        {/* Profile avatar from the mockup; with no accounts yet it opens the viewer's own library. */}
        <Link to="/library" className="avatar" aria-label="Your library" title="Your library"><Icon name="user" size={18} /></Link>
        <time className="header-clock tnum" dateTime={new Date(now).toISOString()}>{clock(now, prefs.timeFormat)}</time>
      </div>
    </header>
  )
}
