import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import './ArtworkLightboxModal.css'

export interface ArtworkLightboxModalProps {
  isOpen: boolean
  onClose: () => void
  imageUrl: string
  title: string
  aspectRatio?: '2:3' | '16:9' | 'square'
  dimensions?: string
  format?: string
}

export function ArtworkLightboxModal({
  isOpen,
  onClose,
  imageUrl,
  title,
  dimensions = 'High Resolution Artwork',
  format = 'WEBP/JPEG',
}: ArtworkLightboxModalProps) {
  const [zoomed, setZoomed] = useState(false)

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'z' || e.key === 'Z') {
        setZoomed((z) => !z)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="artwork-lightbox-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Artwork inspection: ${title}`}
      onClick={onClose}
    >
      <header className="lightbox-header" onClick={(e) => e.stopPropagation()}>
        <div className="lightbox-title-wrap">
          <h3 className="lightbox-title">{title}</h3>
          <span className="lightbox-subtitle">{dimensions} · {format}</span>
        </div>

        <div className="lightbox-actions">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setZoomed(!zoomed)}
            aria-label={zoomed ? 'Zoom out' : 'Zoom in'}
            title={zoomed ? 'Zoom out (Z)' : 'Zoom in (Z)'}
          >
            <Icon name={zoomed ? 'pip' : 'fullscreen'} size={18} />
          </button>

          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close artwork viewer"
            title="Close (Esc)"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      </header>

      <main className="lightbox-body" onClick={(e) => { e.stopPropagation(); setZoomed(!zoomed) }}>
        <div className={`lightbox-image-wrap ${zoomed ? 'is-zoomed' : ''}`}>
          <img src={imageUrl} alt={title} className="lightbox-img" />
        </div>
      </main>

      <footer className="lightbox-footer" onClick={(e) => e.stopPropagation()}>
        <span>Click image or press Z to toggle zoom · Press Esc to exit</span>
      </footer>
    </div>
  )
}
