import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from './Icon'
import { useToast } from './Toast'
import { useStore } from '../state/store'
import { ArtworkDiagnosticsModal } from './ArtworkDiagnosticsModal'
import './MediaContextMenu.css'

export interface MediaContextMenuProps {
  isOpen: boolean
  position: { x: number; y: number }
  onClose: () => void
  itemRef: string
  title: string
  playUrl?: string
  detailUrl?: string
  kind?: 'movie' | 'series' | 'channel' | 'resource' | 'episode'
  onPlayAction?: () => void
  onDetailsAction?: () => void
}

export function MediaContextMenu({
  isOpen,
  position,
  onClose,
  itemRef,
  title,
  playUrl,
  detailUrl,
  kind,
  onPlayAction,
  onDetailsAction,
}: MediaContextMenuProps) {
  const store = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const menuRef = useRef<HTMLDivElement>(null)
  const [diagOpen, setDiagOpen] = useState(false)

  const inWatchlist = store.library.watchlist.includes(itemRef)
  const isFavourite = store.library.favourites.includes(itemRef)
  const isWatched = store.library.watched.includes(itemRef)

  // Close on outside click or Escape
  useEffect(() => {
    if (!isOpen || diagOpen) return

    const handleDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }

    document.addEventListener('mousedown', handleDown)
    document.addEventListener('keydown', handleKey, true)
    return () => {
      document.removeEventListener('mousedown', handleDown)
      document.removeEventListener('keydown', handleKey, true)
    }
  }, [isOpen, diagOpen, onClose])

  if (!isOpen && !diagOpen) return null

  // Ensure menu stays within viewport
  const menuWidth = 220
  const menuHeight = 280
  const adjustedX = Math.max(10, Math.min(position.x, window.innerWidth - menuWidth - 10))
  const adjustedY = Math.max(10, Math.min(position.y, window.innerHeight - menuHeight - 10))

  return (
    <>
      {isOpen && !diagOpen ? (
        <div
          ref={menuRef}
          className="media-context-menu"
          style={{ left: adjustedX, top: adjustedY }}
          role="menu"
          aria-label={`Actions for ${title}`}
        >
      <div className="context-menu-header">
        <span className="context-menu-title" title={title}>{title}</span>
        {kind && <span className="context-menu-kind">{kind.toUpperCase()}</span>}
      </div>

      <div className="context-menu-divider" />

      {(playUrl || onPlayAction) && (
        <button
          type="button"
          className="context-menu-item"
          role="menuitem"
          onClick={() => {
            onClose()
            if (onPlayAction) onPlayAction()
            else if (playUrl) navigate(playUrl)
          }}
        >
          <Icon name="play" size={16} />
          <span>{kind === 'resource' ? 'Play Stream' : 'Watch Now'}</span>
        </button>
      )}

      {(detailUrl || onDetailsAction) && (
        <button
          type="button"
          className="context-menu-item"
          role="menuitem"
          onClick={() => {
            onClose()
            if (onDetailsAction) onDetailsAction()
            else if (detailUrl) navigate(detailUrl)
          }}
        >
          <Icon name="info" size={16} />
          <span>View Details</span>
        </button>
      )}

      <button
        type="button"
        className="context-menu-item"
        role="menuitem"
        onClick={() => {
          store.toggleWatchlist(itemRef)
          toast(inWatchlist ? `Removed “${title}” from Watchlist` : `Added “${title}” to Watchlist`)
          onClose()
        }}
      >
        <Icon name={inWatchlist ? 'check' : 'plus'} size={16} />
        <span>{inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}</span>
      </button>

      <button
        type="button"
        className="context-menu-item"
        role="menuitem"
        onClick={() => {
          store.toggleFavourite(itemRef)
          toast(isFavourite ? `Removed “${title}” from Favourites` : `Added “${title}” to Favourites`)
          onClose()
        }}
      >
        <Icon name="heart" size={16} />
        <span>{isFavourite ? 'Favourited' : 'Add to Favourites'}</span>
      </button>

      {kind !== 'channel' && (
        <button
          type="button"
          className="context-menu-item"
          role="menuitem"
          onClick={() => {
            store.setWatched([itemRef], !isWatched)
            toast(isWatched ? `Marked “${title}” as unwatched` : `Marked “${title}” as watched`)
            onClose()
          }}
        >
          <Icon name="check" size={16} />
          <span>{isWatched ? 'Mark as Unwatched' : 'Mark as Watched'}</span>
        </button>
      )}

      {Boolean(store.library.progress[itemRef]) && (
        <button
          type="button"
          className="context-menu-item"
          role="menuitem"
          onClick={() => {
            const saved = store.library.progress[itemRef]
            store.removeProgress(itemRef)
            toast(`Removed “${title}” from Continue Watching`, {
              label: 'Undo',
              run: () => {
                if (saved) {
                  store.restoreProgress(itemRef, saved)
                  toast(`Restored “${title}” to Continue Watching`)
                }
              },
            })
            onClose()
          }}
        >
          <Icon name="close" size={16} />
          <span>Remove from Continue Watching</span>
        </button>
      )}

      <button
        type="button"
        className="context-menu-item"
        role="menuitem"
        onClick={() => {
          const shareUrl = detailUrl ? `${window.location.origin}${detailUrl}` : playUrl ? `${window.location.origin}${playUrl}` : itemRef
          void navigator.clipboard?.writeText(shareUrl).then(() => {
            toast('Link copied to clipboard')
          }).catch(() => {
            toast('Could not access clipboard')
          })
          onClose()
        }}
      >
        <Icon name="link" size={16} />
        <span>Copy Link</span>
      </button>

      <button
        type="button"
        className="context-menu-item"
        role="menuitem"
        onClick={() => {
          setDiagOpen(true)
        }}
      >
        <Icon name="film" size={16} />
        <span>Artwork Details and Diagnostics...</span>
      </button>

      <div className="context-menu-divider" />

      <button
        type="button"
        className="context-menu-item text-danger"
        role="menuitem"
        onClick={() => {
          store.userPreferences?.hideItem(itemRef)
          toast(`Hidden “${title}” from recommendations`, {
            label: 'Undo',
            run: () => store.userPreferences?.unhideItem(itemRef),
          })
          onClose()
        }}
      >
        <Icon name="close" size={16} />
        <span>Hide Item</span>
      </button>
    </div>
  ) : null}

  {diagOpen && (
    <ArtworkDiagnosticsModal
      open={diagOpen}
      onClose={() => {
        setDiagOpen(false)
        onClose()
      }}
      itemRef={itemRef}
      title={title}
    />
  )}
  </>
  )
}
