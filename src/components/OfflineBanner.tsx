import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import './OfflineBanner.css'

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(() => (typeof navigator !== 'undefined' ? !navigator.onLine : false))
  const [justRestored, setJustRestored] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const handleOffline = () => {
      setIsOffline(true)
      setJustRestored(false)
      setDismissed(false)
    }

    const handleOnline = () => {
      setIsOffline(false)
      setJustRestored(true)
      const timer = window.setTimeout(() => setJustRestored(false), 3500)
      return () => window.clearTimeout(timer)
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  if (dismissed) return null

  if (justRestored) {
    return (
      <div className="offline-banner is-online-restored" role="status">
        <div className="offline-banner-content">
          <Icon name="check" size={16} />
          <span>Network connection restored. All stream endpoints and guides operational.</span>
        </div>
        <button
          type="button"
          className="offline-banner-dismiss"
          onClick={() => setJustRestored(false)}
          aria-label="Dismiss banner"
        >
          <Icon name="close" size={14} />
        </button>
      </div>
    )
  }

  if (!isOffline) return null

  return (
    <div className="offline-banner" role="alert">
      <div className="offline-banner-content">
        <Icon name="warning" size={16} />
        <span>You are currently offline. Kinora is operating with cached schedules and saved library content.</span>
      </div>
      <button
        type="button"
        className="offline-banner-dismiss"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss offline notice"
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  )
}
