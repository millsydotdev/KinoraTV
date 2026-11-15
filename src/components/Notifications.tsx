import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import './Notifications.css'

export type NotificationLevel = 'info' | 'success' | 'warning' | 'error'
export type NotificationCategory = 'playback' | 'sources' | 'epg' | 'library' | 'system'

export interface AppNotification {
  id: string
  category: NotificationCategory
  level: NotificationLevel
  title: string
  message: string
  timestamp: number
  read: boolean
  action?: {
    label: string
    run: () => void
  }
}

interface NotificationContextType {
  notifications: AppNotification[]
  unreadCount: number
  push: (
    title: string,
    message: string,
    options?: {
      level?: NotificationLevel
      category?: NotificationCategory
      action?: { label: string; run: () => void }
      duration?: number
      silent?: boolean
    },
  ) => void
  markRead: (id: string) => void
  markAllRead: () => void
  clear: (id: string) => void
  clearAll: () => void
  isCenterOpen: boolean
  openCenter: () => void
  closeCenter: () => void
}

const STORAGE_KEY = 'kinora.notifications.v1'

export const NotificationContext = createContext<NotificationContextType | null>(null)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) return JSON.parse(saved) as AppNotification[]
    } catch {
      // Storage unavailable
    }
    return [
      {
        id: 'notif-welcome',
        category: 'system',
        level: 'info',
        title: 'Welcome to Kinora',
        message: 'Your personal media platform is ready. Press ? for keyboard shortcuts.',
        timestamp: Date.now() - 3600000,
        read: false,
      },
    ]
  })

  const [toasts, setToasts] = useState<AppNotification[]>([])
  const [isCenterOpen, setIsCenterOpen] = useState(false)

  // Sync notifications to storage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.slice(0, 50)))
    } catch {
      // Ignore storage errors
    }
  }, [notifications])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (
      title: string,
      message: string,
      options?: {
        level?: NotificationLevel
        category?: NotificationCategory
        action?: { label: string; run: () => void }
        duration?: number
        silent?: boolean
      },
    ) => {
      const notif: AppNotification = {
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title,
        message,
        level: options?.level ?? 'info',
        category: options?.category ?? 'system',
        timestamp: Date.now(),
        read: false,
        action: options?.action,
      }

      setNotifications((prev) => [notif, ...prev.slice(0, 49)])

      if (!options?.silent) {
        // Trigger transient toast
        setToasts((prev) => [...prev.slice(-2), notif])
        window.setTimeout(() => dismissToast(notif.id), options?.duration ?? 4500)
      }
    },
    [dismissToast],
  )

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }, [])

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }, [])

  const clear = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  const clearAll = useCallback(() => {
    setNotifications([])
  }, [])

  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        push,
        markRead,
        markAllRead,
        clear,
        clearAll,
        isCenterOpen,
        openCenter: () => setIsCenterOpen(true),
        closeCenter: () => setIsCenterOpen(false),
      }}
    >
      {children}

      {/* Ephemeral Toast Banners */}
      <div className="ds-toast-container" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`ds-toast ds-toast-${t.level}`}>
            <div className="ds-toast-content">
              <strong className="ds-toast-title">{t.title}</strong>
              <span className="ds-toast-msg">{t.message}</span>
            </div>
            {t.action && (
              <button
                type="button"
                className="ds-toast-action-btn"
                onClick={() => {
                  t.action?.run()
                  dismissToast(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              className="ds-toast-close-btn"
              aria-label="Dismiss toast"
              onClick={() => dismissToast(t.id)}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Notification Center Drawer */}
      <NotificationCenterDrawer
        open={isCenterOpen}
        onClose={() => setIsCenterOpen(false)}
        notifications={notifications}
        onMarkRead={markRead}
        onMarkAllRead={markAllRead}
        onClear={clear}
        onClearAll={clearAll}
      />
    </NotificationContext.Provider>
  )
}

const defaultNotificationContext: NotificationContextType = {
  notifications: [],
  unreadCount: 0,
  push: () => {},
  markRead: () => {},
  markAllRead: () => {},
  clear: () => {},
  clearAll: () => {},
  isCenterOpen: false,
  openCenter: () => {},
  closeCenter: () => {},
}

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  return ctx ?? defaultNotificationContext
}

function NotificationCenterDrawer({
  open,
  onClose,
  notifications,
  onMarkRead,
  onMarkAllRead,
  onClear,
  onClearAll,
}: {
  open: boolean
  onClose: () => void
  notifications: AppNotification[]
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
  onClear: (id: string) => void
  onClearAll: () => void
}) {
  const [filter, setFilter] = useState<NotificationCategory | 'all'>('all')

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const filtered = filter === 'all' ? notifications : notifications.filter((n) => n.category === filter)

  const levelIcon: Record<NotificationLevel, IconName> = {
    info: 'info',
    success: 'check',
    warning: 'warning',
    error: 'warning',
  }

  return (
    <div className="ds-notif-backdrop" onClick={onClose}>
      <aside
        className="ds-notif-drawer"
        role="dialog"
        aria-label="Notification Center"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ds-notif-header">
          <div className="ds-notif-header-title">
            <Icon name="bell" size={20} />
            <h2>Notifications</h2>
            {notifications.filter((n) => !n.read).length > 0 && (
              <span className="ds-notif-unread-badge">
                {notifications.filter((n) => !n.read).length} new
              </span>
            )}
          </div>
          <div className="ds-notif-header-actions">
            {notifications.length > 0 && (
              <>
                <button type="button" className="ds-notif-text-btn" onClick={onMarkAllRead}>
                  Mark all read
                </button>
                <button type="button" className="ds-notif-text-btn" onClick={onClearAll}>
                  Clear all
                </button>
              </>
            )}
            <button
              type="button"
              className="icon-btn"
              aria-label="Close notification center"
              onClick={onClose}
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        </div>

        {/* Filter categories */}
        <div className="ds-notif-filters" role="group" aria-label="Notification category">
          {(['all', 'sources', 'playback', 'epg', 'system'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              className={`ds-notif-filter-chip ${filter === cat ? 'is-active' : ''}`}
              onClick={() => setFilter(cat)}
            >
              {cat[0]?.toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>

        <div className="ds-notif-body">
          {filtered.length === 0 ? (
            <div className="ds-notif-empty">
              <Icon name="bell" size={32} />
              <p>No notifications in this category.</p>
            </div>
          ) : (
            <ul className="ds-notif-list">
              {filtered.map((n) => (
                <li
                  key={n.id}
                  className={`ds-notif-item ds-notif-item-${n.level} ${n.read ? 'is-read' : 'is-unread'}`}
                  onClick={() => !n.read && onMarkRead(n.id)}
                >
                  <div className="ds-notif-item-icon">
                    <Icon name={levelIcon[n.level]} size={16} />
                  </div>
                  <div className="ds-notif-item-content">
                    <div className="ds-notif-item-top">
                      <strong className="ds-notif-item-title">{n.title}</strong>
                      <span className="ds-notif-item-time">
                        {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="ds-notif-item-msg">{n.message}</p>
                    {n.action && (
                      <button
                        type="button"
                        className="ds-notif-item-action"
                        onClick={(e) => {
                          e.stopPropagation()
                          n.action?.run()
                          onClose()
                        }}
                      >
                        {n.action.label}
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    className="ds-notif-item-dismiss"
                    aria-label="Dismiss notification"
                    onClick={(e) => {
                      e.stopPropagation()
                      onClear(n.id)
                    }}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  )
}
