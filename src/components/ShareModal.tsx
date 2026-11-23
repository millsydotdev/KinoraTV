import { useEffect, useState, useRef } from 'react'
import { Icon } from './Icon'
import { Art } from './ui'
import { useToast } from './Toast'
import './ShareModal.css'

export interface ShareItem {
  title: string
  kind: 'movie' | 'series' | 'episode' | 'channel' | 'programme' | 'resource'
  year?: number | string
  certificate?: string
  genres?: string[]
  art?: string
  imdbId?: string
  tmdbId?: number | string
  synopsis?: string
  deepLinkPath?: string
}

interface ShareModalProps {
  open: boolean
  onClose: () => void
  item: ShareItem | null
}

export function getCanonicalOrigin(): string {
  if (typeof window === 'undefined') return 'https://kinora.tv'
  const hostname = window.location.hostname
  const protocol = window.location.protocol
  const port = window.location.port
  if (
    protocol === 'tauri:' ||
    protocol === 'asset:' ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.localhost') ||
    port === '5199' ||
    port === '5173' ||
    port === '3000'
  ) {
    return 'https://kinora.tv'
  }
  return window.location.origin
}

export function buildKinoraDeepLink(deepLinkPath?: string): { webUrl: string; appSchemeUrl: string } {
  const origin = getCanonicalOrigin()
  const rawPath = deepLinkPath
    ? deepLinkPath
    : typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}`
      : '/'
  const normalizedPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`
  const webUrl = `${origin}${normalizedPath}`
  const appSchemeUrl = `kinora://${normalizedPath.replace(/^\/+/, '')}`
  return { webUrl, appSchemeUrl }
}

export function ShareModal({ open, onClose, item }: ShareModalProps) {
  const toast = useToast()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [copiedType, setCopiedType] = useState<'imdb' | 'kinora' | 'app' | null>(null)
  const [linkFormat, setLinkFormat] = useState<'web' | 'app'>('web')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      if (!dialog.open) dialog.showModal()
    } else {
      if (dialog.open) dialog.close()
    }
  }, [open])

  useEffect(() => {
    if (!copiedType) return
    const t = setTimeout(() => setCopiedType(null), 2500)
    return () => clearTimeout(t)
  }, [copiedType])

  if (!open || !item) return null

  const { webUrl, appSchemeUrl } = buildKinoraDeepLink(item.deepLinkPath)
  const activeKinoraUrl = linkFormat === 'web' ? webUrl : appSchemeUrl
  const kinoraUrl = webUrl
  const imdbUrl = item.imdbId ? `https://www.imdb.com/title/${item.imdbId}/` : null
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const copyImdb = async () => {
    if (!imdbUrl) return
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(imdbUrl)
        setCopiedType('imdb')
        toast('IMDb link copied to clipboard')
      }
    } catch {
      toast('Failed to copy to clipboard')
    }
  }

  const copyKinora = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(webUrl)
        setCopiedType('kinora')
        toast('Kinora web link copied to clipboard')
      }
    } catch {
      toast('Failed to copy to clipboard')
    }
  }

  const copyAppScheme = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(appSchemeUrl)
        setCopiedType('app')
        toast('Kinora app link (kinora://) copied to clipboard')
      }
    } catch {
      toast('Failed to copy to clipboard')
    }
  }

  const handleNativeShare = async () => {
    if (!canNativeShare) return
    try {
      await navigator.share({
        title: item.title,
        text: `Check out ${item.title} on Kinora`,
        url: imdbUrl || kinoraUrl,
      })
    } catch (err) {
      // User cancelled or share failed
      if ((err as Error)?.name !== 'AbortError') {
        toast('Native sharing was cancelled')
      }
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="share-modal-dialog"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose()
      }}
      aria-label={`Share ${item.title}`}
    >
      <div className="share-modal-content">
        <header className="share-modal-header">
          <div className="share-modal-title-row">
            <Icon name="share" size={20} className="share-modal-icon" />
            <h3 className="share-modal-heading">Share Title</h3>
          </div>
          <button
            type="button"
            className="share-modal-close-btn"
            onClick={onClose}
            aria-label="Close share dialog"
          >
            <Icon name="x" size={18} />
          </button>
        </header>

        {/* Media Preview Card */}
        <div className="share-media-card">
          {item.art ? (
            <Art src={item.art} alt={item.title} className="share-media-art" fallbackIcon={item.kind === 'series' ? 'series' : 'film'} />
          ) : (
            <div className="share-media-art-placeholder">
              <Icon name="film" size={24} />
            </div>
          )}
          <div className="share-media-info">
            <span className="share-media-kind-badge">{item.kind.toUpperCase()}</span>
            <h4 className="share-media-title">{item.title}</h4>
            <div className="share-media-meta">
              {item.year && <span>{item.year}</span>}
              {item.certificate && <span className="share-cert-badge">{item.certificate}</span>}
              {item.genres && item.genres.length > 0 && <span>{item.genres.slice(0, 2).join(', ')}</span>}
            </div>
            {item.synopsis && (
              <p className="share-media-synopsis" style={{ fontSize: '0.8125rem', color: 'var(--text-2)', marginTop: '8px', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {item.synopsis}
              </p>
            )}
          </div>
        </div>

        {/* TMDB & IMDb Metadata Integration */}
        {item.tmdbId && (
          <div className="share-section">
            <h5 className="share-section-title">The Movie Database (TMDB)</h5>
            <div className="share-imdb-card">
              <div className="share-imdb-info">
                <span className="share-imdb-badge" style={{ background: '#01b4e4' }}>TMDB</span>
                <span className="share-imdb-id">#{item.tmdbId}</span>
                <span className="share-verified-tag">
                  <Icon name="check" size={12} /> Enriched
                </span>
              </div>
              <div className="share-imdb-actions">
                <a
                  href={`https://www.themoviedb.org/${item.kind === 'series' ? 'tv' : 'movie'}/${item.tmdbId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-sm"
                  title="Open official TMDB page"
                >
                  <Icon name="externalLink" size={14} /> Open TMDB
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Verified IMDb Integration */}
        <div className="share-section">
          <h5 className="share-section-title">IMDb Title Page</h5>
          {item.imdbId && imdbUrl ? (
            <div className="share-imdb-card">
              <div className="share-imdb-info">
                <span className="share-imdb-badge">IMDb</span>
                <span className="share-imdb-id">{item.imdbId}</span>
                <span className="share-verified-tag">
                  <Icon name="check" size={12} /> Verified
                </span>
              </div>
              <div className="share-imdb-actions">
                <a
                  href={imdbUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-sm"
                  title="Open official IMDb page"
                >
                  <Icon name="externalLink" size={14} /> Open IMDb
                </a>
                <button
                  type="button"
                  className={`btn btn-secondary btn-sm ${copiedType === 'imdb' ? 'is-success' : ''}`}
                  onClick={copyImdb}
                >
                  <Icon name={copiedType === 'imdb' ? 'check' : 'copy'} size={14} />
                  {copiedType === 'imdb' ? 'Copied!' : 'Copy IMDb Link'}
                </button>
              </div>
            </div>
          ) : (
            <div className="share-imdb-unavailable">
              <Icon name="info" size={16} />
              <span>No verified IMDb identifier associated with this item.</span>
            </div>
          )}
        </div>

        {/* Kinora Link */}
        <div className="share-section">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <h5 className="share-section-title" style={{ margin: 0 }}>Kinora Deep Link</h5>
            <div className="share-link-format-pills" role="radiogroup" aria-label="Link format">
              <button
                type="button"
                className={`share-pill-btn ${linkFormat === 'web' ? 'is-active' : ''}`}
                onClick={() => setLinkFormat('web')}
              >
                Web (https)
              </button>
              <button
                type="button"
                className={`share-pill-btn ${linkFormat === 'app' ? 'is-active' : ''}`}
                onClick={() => setLinkFormat('app')}
              >
                App (kinora://)
              </button>
            </div>
          </div>
          <div className="share-url-row">
            <input
              type="text"
              readOnly
              value={activeKinoraUrl}
              className="share-url-input"
              aria-label="Kinora share URL"
            />
            <button
              type="button"
              className={`btn btn-primary btn-sm ${copiedType === 'kinora' || copiedType === 'app' ? 'is-success' : ''}`}
              onClick={linkFormat === 'web' ? copyKinora : copyAppScheme}
            >
              <Icon name={copiedType === 'kinora' || copiedType === 'app' ? 'check' : 'copy'} size={14} />
              {copiedType === 'kinora' || copiedType === 'app' ? 'Copied!' : 'Copy Link'}
            </button>
          </div>
        </div>

        {/* Native System Share */}
        {canNativeShare && (
          <div className="share-native-row">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleNativeShare}
            >
              <Icon name="share" size={15} /> Share via System Dialog...
            </button>
          </div>
        )}
      </div>
    </dialog>
  )
}
