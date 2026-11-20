import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { startOfDay } from '../data/channels'
import type { Channel, Programme } from '../data/types'
import { clock, useNow } from '../lib/time'
import { useStore } from '../state/store'
import { useProfiles, type UserProfile } from '../state/profiles'
import { Icon } from './Icon'
import { useNotifications } from './Notifications'
import { BackgroundTaskTrigger } from './BackgroundTaskCenter'
import { CastModal } from './CastModal'
import { useCasting } from '../lib/casting/manager'
import './PageHeader.css'

export const NavMenuContext = createContext<() => void>(() => undefined)

/** Reminder ids are XMLTV-style `<channelId>@<startMs>` programme ids. */
function parseReminder(id: string, find: (id: string) => Channel | undefined, schedule: (c: Channel, day: number) => Programme[]) {
  const at = id.lastIndexOf('@')
  const channel = find(id.slice(0, at))
  const programme = channel && schedule(channel, startOfDay(Number(id.slice(at + 1)))).find((p) => p.id === id)
  return channel && programme ? { id, channel, start: programme.start, title: programme.title } : null
}

function NotificationsAndReminders() {
  const store = useStore()
  const navigate = useNavigate()
  const { unreadCount, openCenter, push } = useNotifications()
  const now = useNow()
  const notifiedRef = useRef<Set<string>>(new Set())

  const reminders = store.library.reminders
    .map((id) => parseReminder(id, store.findChannel, store.schedule))
    .filter((r): r is NonNullable<typeof r> => !!r && r.start > now - 10 * 60 * 1000)

  useEffect(() => {
    for (const r of reminders) {
      const diff = r.start - now
      // If reminder is within 5 minutes or starting now and hasn't been notified yet
      if (diff <= 5 * 60 * 1000 && diff >= -2 * 60 * 1000 && !notifiedRef.current.has(r.id)) {
        notifiedRef.current.add(r.id)
        const mins = Math.max(1, Math.round(diff / 60000))
        push(
          `Upcoming: ${r.title}`,
          diff > 30000 ? `Starts in ${mins} min on ${r.channel.number} ${r.channel.name}` : `Starting now on ${r.channel.number} ${r.channel.name}`,
          {
            level: 'info',
            category: 'epg',
            action: {
              label: 'Tune In',
              run: () => navigate(`/live?channel=${encodeURIComponent(r.channel.id)}`),
            },
          },
        )
      }
    }
  }, [reminders, now, push, navigate])

  const futureReminders = reminders.filter((r) => r.start > now)
  const totalBadges = unreadCount + futureReminders.length

  return (
    <button
      type="button"
      className="icon-btn header-notif-btn"
      aria-label={`Notifications and reminders, ${totalBadges} unread`}
      title="Notifications & reminders"
      onClick={openCenter}
    >
      <Icon name="bell" />
      {totalBadges > 0 && (
        <span className="bell-dot" aria-hidden="true">
          {totalBadges > 9 ? '9+' : totalBadges}
        </span>
      )}
    </button>
  )
}

function HeaderProfileMenu() {
  const { profiles, activeProfile, switchProfileWithPin, requiresPinToSwitch, isKidsMode } = useProfiles()
  const [open, setOpen] = useState(false)
  const [pinTargetId, setPinTargetId] = useState<string | null>(null)
  const [enteredPin, setEnteredPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const handleSelectProfile = (p: UserProfile) => {
    if (p.id === activeProfile.id) {
      setOpen(false)
      triggerRef.current?.focus()
      return
    }

    if (requiresPinToSwitch(p.id)) {
      setPinTargetId(p.id)
      setEnteredPin('')
      setPinError(null)
      setOpen(false)
      return
    }

    switchProfileWithPin(p.id)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!pinTargetId) return
    const res = switchProfileWithPin(pinTargetId, enteredPin)
    if (res.success) {
      setPinTargetId(null)
      setEnteredPin('')
      setPinError(null)
      triggerRef.current?.focus()
    } else {
      setPinError(res.error ?? 'Incorrect PIN. Please try again.')
    }
  }

  const targetProfile = profiles.find((p) => p.id === pinTargetId)

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        className="header-profile-pill"
        onClick={() => setOpen(!open)}
        aria-label={`Profile: ${activeProfile.name}${isKidsMode ? ' (Kids Mode)' : ''}`}
        title={`Profile: ${activeProfile.name}`}
      >
        <span
          className="header-profile-avatar"
          style={{
            background: activeProfile.avatarColor,
            color: '#ffffff',
          }}
        >
          <Icon name={activeProfile.avatarIcon} size={14} />
        </span>
        <span className="header-profile-name">{activeProfile.name || 'My Profile'}</span>
        <Icon name="down" size={12} className="header-profile-chevron" />
        {isKidsMode && (
          <span
            style={{
              fontSize: '8px',
              fontWeight: 800,
              background: 'var(--accent, #e50914)',
              color: 'var(--accent-ink, #ffffff)',
              padding: '1px 4px',
              borderRadius: '3px',
              letterSpacing: '0.5px',
            }}
          >
            KIDS
          </span>
        )}
      </button>

      {open && (
        <div
          className="ds-context-menu"
          style={{
            position: 'absolute',
            top: '46px',
            right: 0,
            width: '220px',
            zIndex: 1000,
          }}
          role="menu"
          aria-label="Profile Switcher"
        >
          <div className="ds-context-header" style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>
            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{activeProfile.name}</div>
            <div className="faint" style={{ fontSize: '0.75rem' }}>{isKidsMode ? 'Kids Profile' : 'Household Member'}</div>
          </div>
          <div className="ds-context-list" style={{ padding: '4px 0' }}>
            {profiles.map((p) => (
              <button
                key={p.id}
                type="button"
                role="menuitem"
                className="ds-context-item"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '8px 12px',
                  background: p.id === activeProfile.id ? 'rgb(255 255 255 / 0.08)' : 'transparent',
                }}
                onClick={() => handleSelectProfile(p)}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: p.avatarColor,
                    display: 'grid',
                    placeItems: 'center',
                    color: '#fff',
                  }}
                >
                  <Icon name={p.avatarIcon} size={12} />
                </span>
                <span style={{ flex: 1, textAlign: 'left', fontWeight: p.id === activeProfile.id ? 600 : 400 }}>{p.name}</span>
                {p.isKids && <span className="pill" style={{ fontSize: '9px', padding: '1px 4px' }}>Kids</span>}
                {p.id === activeProfile.id && <Icon name="check" size={14} />}
              </button>
            ))}
            <div style={{ height: '1px', background: 'var(--line)', margin: '4px 0' }} />
            <Link
              to="/settings/profiles"
              className="ds-context-item"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                textDecoration: 'none',
                color: 'var(--text-2)',
              }}
              onClick={() => setOpen(false)}
            >
              <Icon name="cog" size={14} />
              <span>Manage Profiles</span>
            </Link>
          </div>
        </div>
      )}

      {pinTargetId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Parental Lock PIN Verification"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgb(0 0 0 / 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              background: 'var(--card-bg, #1a1e24)',
              border: '1px solid var(--line)',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '360px',
              width: '90%',
              boxShadow: '0 8px 32px rgb(0 0 0 / 0.5)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Icon name="lock" size={20} />
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Parental PIN Required</h3>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', marginBottom: '16px' }}>
              Switching from Kids Mode to <strong>{targetProfile?.name ?? 'profile'}</strong> requires the parental lock PIN.
            </p>
            <form onSubmit={handlePinSubmit}>
              <input
                type="password"
                maxLength={8}
                pattern="[0-9]*"
                inputMode="numeric"
                autoFocus
                placeholder="Enter PIN"
                value={enteredPin}
                onChange={(e) => {
                  setEnteredPin(e.target.value)
                  setPinError(null)
                }}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  border: '1px solid var(--line)',
                  background: 'var(--bg, #0f1216)',
                  color: '#fff',
                  fontSize: '1.2rem',
                  letterSpacing: '4px',
                  textAlign: 'center',
                  marginBottom: '12px',
                }}
              />
              {pinError && (
                <div style={{ color: '#ef4444', fontSize: '0.8rem', marginBottom: '12px', textAlign: 'center' }}>
                  {pinError}
                </div>
              )}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() => {
                    setPinTargetId(null)
                    setPinError(null)
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-small" disabled={!enteredPin.trim()}>
                  Unlock & Switch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

/** Per-screen header from the mockup: title and sub-tabs on the left, search, bell and clock on the right. */
export function PageHeader({
  title,
  tabs,
  search = true,
  searchPlaceholder = 'Search movies, series, channels, programmes and more...',
  overlay = false,
  actions,
}: {
  title?: ReactNode
  tabs?: ReactNode
  search?: boolean
  searchPlaceholder?: string
  overlay?: boolean
  actions?: ReactNode
}) {
  const navigate = useNavigate()
  const now = useNow()
  const { prefs } = useStore()
  const openNav = useContext(NavMenuContext)
  const [castOpen, setCastOpen] = useState(false)
  const { isConnected, session } = useCasting()

  const openPalette = () => {
    window.dispatchEvent(new CustomEvent('kinora:command-palette'))
  }

  const openShortcuts = () => {
    window.dispatchEvent(new CustomEvent('kinora:shortcuts'))
  }

  return (
    <header className={`page-header${overlay ? ' is-overlay' : ''}`}>
      <button type="button" className="icon-btn menu-btn" aria-label="Open menu" onClick={openNav}><Icon name="menu" /></button>
      
      <div className="header-history-nav">
        <button
          type="button"
          className="header-history-btn"
          onClick={() => navigate(-1)}
          aria-label="Go back"
          title="Back"
        >
          <Icon name="left" size={16} />
        </button>
        <button
          type="button"
          className="header-history-btn"
          onClick={() => navigate(1)}
          aria-label="Go forward"
          title="Forward"
        >
          <Icon name="right" size={16} />
        </button>
      </div>

      <div className="page-header-left">
        {title && <h1 className="page-title">{title}</h1>}
        {tabs}
      </div>

      <div className="page-header-right">
        {search && (
          <button
            type="button"
            className="search-pill"
            aria-label="Search movies, series, channels and more (shortcut /)"
            title="Search movies, series, channels (/)"
            onClick={() => navigate('/search')}
          >
            <Icon name="search" size={16} />
            <span className="search-pill-label">{searchPlaceholder}</span>
            <kbd className="search-pill-kbd">/</kbd>
          </button>
        )}
        {actions}
        <BackgroundTaskTrigger />
        <NotificationsAndReminders />
        <button
          type="button"
          className="icon-btn header-grid-btn"
          aria-label="Command Palette (Ctrl+K)"
          title="Command Palette (Ctrl+K)"
          onClick={openPalette}
        >
          <Icon name="grid" size={18} />
        </button>
        <button
          type="button"
          className={`icon-btn header-cast-btn ${isConnected ? 'is-connected' : ''}`}
          aria-label={isConnected ? `Casting to ${session?.device.name}` : 'Cast to device'}
          title={isConnected ? `Casting to ${session?.device.name}` : 'Cast to device'}
          onClick={() => setCastOpen(true)}
        >
          <Icon name="cast" size={18} />
        </button>
        <button
          type="button"
          className="icon-btn header-help-btn"
          aria-label="Keyboard shortcuts (?)"
          title="Keyboard shortcuts (?)"
          onClick={openShortcuts}
        >
          <Icon name="helpCircle" size={18} />
        </button>
        {/* Profile avatar and household profile switcher */}
        <HeaderProfileMenu />
        <time className="header-clock tnum" dateTime={new Date(now).toISOString()}>{clock(now, prefs.timeFormat)}</time>
      </div>
      <CastModal open={castOpen} onClose={() => setCastOpen(false)} />
    </header>
  )
}
