import { useEffect, useState } from 'react'
import type { MediaResource } from '../data/personalLibrary'
import { classifyMediaResource } from '../data/provenance'
import { inNativeShell, loadProgrammeArtwork } from '../lib/native'
import { Icon, type IconName } from './Icon'
import { MediaContextMenu } from './MediaContextMenu'
import './ResourceCard.css'

export type ResourceCardVariant = 'compact' | 'square' | 'poster' | 'wide'

interface ResourceCardProps {
  resource: MediaResource
  inLibrary: boolean
  isFavourite: boolean
  isEnabled?: boolean
  checkStatus?: 'online' | 'offline' | 'degraded' | 'unchecked'
  lastChecked?: number
  onToggleLibrary: () => void
  onToggleFavourite: () => void
  onToggleEnabled?: () => void
  onOpenDetails: () => void
  onPlay?: (resource: MediaResource) => void
  isPlaying?: boolean
  variant?: ResourceCardVariant
}

function getCategoryIcon(cat: string): IconName {
  switch (cat) {
    case 'radio': return 'radio'
    case 'podcasts': return 'podcast'
    case 'music': return 'music'
    case 'audiobooks':
    case 'books': return 'book'
    case 'documentaries': return 'documentary'
    case 'news': return 'news'
    case 'sports': return 'sports'
    case 'education': return 'education'
    case 'culture': return 'palette'
    case 'nature-science': return 'nature'
    case 'gaming': return 'gaming'
    case 'archives': return 'archive'
    case 'live-tv': return 'tv'
    case 'movies': return 'film'
    case 'series': return 'series'
    default: return 'sources'
  }
}

function getDefaultVariant(cat: string): ResourceCardVariant {
  if (cat === 'radio' || cat === 'podcasts' || cat === 'music') return 'square'
  if (cat === 'audiobooks' || cat === 'books') return 'poster'
  return 'wide'
}

export function isLogoArtwork(res: MediaResource): boolean {
  if (res.category === 'radio' || res.category === 'music' || res.category === 'live-tv' || res.category === 'news') return true
  if (res.resourceType === 'stream' || res.resourceType === 'directory' || res.resourceType === 'api' || res.resourceType === 'dataset') return true
  if (res.artworkUrl && (res.artworkUrl.includes('logo') || res.artworkUrl.includes('Logo') || res.artworkUrl.includes('badge') || res.artworkUrl.includes('.svg'))) return true
  return false
}

function getMonogram(name: string): string {
  const words = name.replace(/[^a-zA-Z0-9\s]/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'KN'
  if (words.length === 1) return words[0]!.slice(0, 3).toUpperCase()
  return words.slice(0, 3).map((w) => w[0]!).join('').toUpperCase()
}

export function getRoleLabel(res: MediaResource): string {
  if (res.resourceType === 'stream') return res.category === 'radio' ? 'Radio Station' : 'Live Stream'
  if (res.resourceType === 'rss') return 'Podcast Show'
  if (res.resourceType === 'archive') return 'Media Archive'
  if (res.resourceType === 'opds') return 'Book Collection'
  if (res.resourceType === 'directory') return 'Directory'
  if (res.resourceType === 'api') return 'Metadata API'
  if (res.resourceType === 'xmltv') return 'EPG Schedule'
  if (res.playbackUrl) return 'Live Audio'
  return 'Open Catalogue'
}

export function ResourceCard({
  resource,
  inLibrary,
  isFavourite,
  isEnabled = true,
  checkStatus: _checkStatus,
  lastChecked: _lastChecked,
  onToggleLibrary,
  onToggleFavourite,
  onToggleEnabled,
  onOpenDetails,
  onPlay,
  isPlaying,
  variant,
}: ResourceCardProps) {
  const hue = resource.accentHue ?? 215
  const iconName = resource.artworkFallbackIcon ?? getCategoryIcon(resource.category)
  const computedVariant = variant ?? getDefaultVariant(resource.category)
  const isPlayable = Boolean(resource.playbackUrl) && (resource.playbackType === 'audio' || resource.playbackType === 'hls')
  const { capability } = classifyMediaResource(resource, inLibrary)
  const isLogo = isLogoArtwork(resource)
  const roleLabel = getRoleLabel(resource)
  const monogram = getMonogram(resource.name)
  const nativeShell = inNativeShell()
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(() => (nativeShell ? null : resource.artworkUrl ?? null))
  const [imgFailed, setImgFailed] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setMenuPos({ x: e.clientX, y: e.clientY })
  }

  const contextMenu = (
    <MediaContextMenu
      isOpen={!!menuPos}
      position={menuPos ?? { x: 0, y: 0 }}
      onClose={() => setMenuPos(null)}
      itemRef={resource.id}
      title={resource.name}
      kind="resource"
      onPlayAction={isPlayable && onPlay ? () => onPlay(resource) : undefined}
      onDetailsAction={onOpenDetails}
    />
  )

  useEffect(() => {
    setImgFailed(false)
    setImgLoaded(false)
    if (!resource.artworkUrl) {
      setResolvedSrc(null)
      return
    }
    if (!nativeShell) {
      setResolvedSrc(resource.artworkUrl)
      return
    }
    let live = true
    setResolvedSrc(null)
    loadProgrammeArtwork(resource.artworkUrl).then((uri) => {
      if (!live) return
      if (uri) {
        setResolvedSrc(uri)
        setImgLoaded(true)
      } else {
        setImgFailed(true)
      }
    }).catch(() => {
      if (live) setImgFailed(true)
    })
    return () => { live = false }
  }, [resource.artworkUrl, nativeShell])

  // COMPACT VARIANT: Used primarily for Radio stations & quick audio stream cards
  if (computedVariant === 'compact') {
    return (
      <>
        <article
          className={`res-card res-card-compact ${isPlaying ? 'is-playing' : ''} ${!isEnabled ? 'is-disabled-card' : ''}`}
          tabIndex={0}
          onClick={onOpenDetails}
          onKeyDown={(e) => { if (e.key === 'Enter') onOpenDetails() }}
          onContextMenu={handleContextMenu}
        >
        <div className="res-compact-media" style={{ '--card-hue': hue } as React.CSSProperties}>
          {(!resolvedSrc || imgFailed || !imgLoaded) && (
            <div className="res-compact-fallback">
              <Icon name={iconName} size={22} />
            </div>
          )}
          {resolvedSrc && !imgFailed && (
            <img
              src={resolvedSrc}
              alt=""
              className={`res-compact-img ${isLogo ? 'res-compact-img-contain' : ''}`}
              style={imgLoaded ? undefined : { opacity: 0, position: 'absolute', inset: 0 }}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgFailed(true)}
            />
          )}
          {isPlaying && <span className="res-compact-live-dot" aria-hidden="true" />}
          {!isEnabled && <span className="res-compact-disabled-pill">Off</span>}
        </div>

        <div className="res-compact-body">
          <div className="res-compact-header">
            <h3 className="res-compact-title" title={resource.name}>{resource.name}</h3>
            {resource.country && <span className="res-compact-country">{resource.country}</span>}
          </div>
          <div className="res-compact-meta">
            <span className="res-role-pill-inline">{roleLabel}</span>
            {resource.provider && (
              <>
                <span className="res-compact-separator" aria-hidden="true">·</span>
                <span className="res-compact-provider">{resource.provider}</span>
              </>
            )}
          </div>
        </div>

        <div className="res-compact-actions">
          {isPlayable && onPlay && isEnabled && (
            <button
              type="button"
              className={`res-compact-play-btn ${isPlaying ? 'is-active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                onPlay(resource)
              }}
              aria-label={isPlaying ? 'Pause' : 'Play stream'}
              title={isPlaying ? 'Currently playing' : 'Play stream'}
            >
              <Icon name={isPlaying ? 'pause' : 'play'} size={16} />
            </button>
          )}

          {inLibrary && onToggleEnabled && (
            <button
              type="button"
              className={`res-compact-toggle-btn ${isEnabled ? 'is-on' : 'is-off'}`}
              onClick={(e) => {
                e.stopPropagation()
                onToggleEnabled()
              }}
              aria-label={isEnabled ? 'Disable source' : 'Enable source'}
              title={isEnabled ? 'Source enabled in Kinora: click to disable' : 'Source disabled: click to enable'}
            >
              <span className="res-switch-track"><span className="res-switch-thumb" /></span>
            </button>
          )}

          <button
            type="button"
            className={`res-card-fav-btn res-compact-fav ${isFavourite ? 'is-fav' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              onToggleFavourite()
            }}
            aria-label={isFavourite ? 'Remove from favourites' : 'Add to favourites'}
            title={isFavourite ? 'Favourited' : 'Add to favourites'}
          >
            <Icon name="heart" size={15} />
          </button>

          <button
            type="button"
            className={`res-compact-add-btn ${inLibrary ? 'in-lib' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              onToggleLibrary()
            }}
            title={inLibrary ? 'Saved in personal library' : 'Save to My Sources'}
          >
            <Icon name={inLibrary ? 'check' : 'plus'} size={14} />
          </button>
        </div>
      </article>
      {contextMenu}
    </>
    )
  }

  // STANDARD VARIANTS: square (podcasts/music), poster (audiobooks/books), wide (documentaries/video/etc.)
  return (
    <>
      <article
        className={`res-card res-card-${computedVariant} ${!isEnabled ? 'is-disabled-card' : ''}`}
        tabIndex={0}
        onClick={onOpenDetails}
        onKeyDown={(e) => { if (e.key === 'Enter') onOpenDetails() }}
        onContextMenu={handleContextMenu}
      >
      {/* Visual Header / Artwork Tile */}
      <div className={`res-card-media res-media-${computedVariant}`} style={{ '--card-hue': hue } as React.CSSProperties}>
        {(!resolvedSrc || imgFailed || !imgLoaded) && (
          <div className="res-card-cinematic-fallback">
            <div className="res-card-fallback-glow" />
            <div className="res-card-fallback-watermark" aria-hidden="true">
              <Icon name={iconName} size={computedVariant === 'poster' ? 68 : 54} />
            </div>
            <div className="res-card-fallback-content">
              <span className="res-card-fallback-monogram" aria-hidden="true">{monogram}</span>
              <span className="res-card-fallback-cat">{resource.category.replace(/-/g, ' ').toUpperCase()}</span>
            </div>
          </div>
        )}
        {resolvedSrc && !imgFailed && (
          <img
            src={resolvedSrc}
            alt=""
            className={`res-card-img ${isLogo ? 'res-img-contain' : 'res-img-cover'}`}
            style={imgLoaded ? undefined : { opacity: 0, position: 'absolute', inset: 0 }}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgFailed(true)}
          />
        )}

        {/* Essential format & status badge only */}
        <div className="res-card-badges">
          {!isEnabled && (
            <span className="res-status-pill res-pill-disabled" title="Source is currently disabled">
              <span className="res-status-dot" aria-hidden="true" />
              Disabled
            </span>
          )}
          <span className="res-cap-pill" title={capability.description}>
            <Icon name={capability.icon} size={11} />
            <span>{roleLabel}</span>
          </span>
        </div>

        {/* Top-right Favourite action */}
        <button
          type="button"
          className={`res-card-fav-btn ${isFavourite ? 'is-fav' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onToggleFavourite()
          }}
          aria-label={isFavourite ? 'Remove from favourites' : 'Add to favourites'}
          title={isFavourite ? 'Favourited' : 'Add to favourites'}
        >
          <Icon name="heart" size={16} />
        </button>

        {/* Play overlay if stream is directly playable */}
        {isPlayable && onPlay && isEnabled && (
          <button
            type="button"
            className={`res-card-play-btn ${isPlaying ? 'is-active' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              onPlay(resource)
            }}
            aria-label={isPlaying ? 'Pause' : 'Play stream'}
            title={isPlaying ? 'Currently playing' : 'Play live'}
          >
            <Icon name={isPlaying ? 'pause' : 'play'} size={20} />
          </button>
        )}
      </div>

      {/* Card Content */}
      <div className="res-card-body">
        <div className="res-card-meta-top">
          <span className="res-card-provider">{resource.provider}</span>
          {resource.country && <span className="res-card-country">{resource.country}</span>}
        </div>

        <h3 className="res-card-name" title={resource.name}>{resource.name}</h3>
        <p className="res-card-desc">{resource.description}</p>

        {/* Tags / Subcategory */}
        <div className="res-card-tags">
          <span className="res-tag res-tag-category">{resource.subcategory.replace(/-/g, ' ')}</span>
          {resource.channelCount !== undefined && <span className="res-tag res-tag-channels">{resource.channelCount} {resource.channelCount === 1 ? 'channel' : 'channels'}</span>}
        </div>

        {/* Card Footer Actions */}
        <div className="res-card-foot">
          {inLibrary && onToggleEnabled && (
            <button
              type="button"
              className={`res-toggle-btn ${isEnabled ? 'is-on' : 'is-off'}`}
              onClick={(e) => {
                e.stopPropagation()
                onToggleEnabled()
              }}
              title={isEnabled ? 'Source active in Kinora: click to disable' : 'Source disabled: click to enable'}
            >
              <span className="res-switch-track"><span className="res-switch-thumb" /></span>
              <span>{isEnabled ? 'Active' : 'Disabled'}</span>
            </button>
          )}

          <button
            type="button"
            className={`res-action-btn ${inLibrary ? 'res-in-lib' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              onToggleLibrary()
            }}
            title={inLibrary ? 'Saved in personal library' : 'Save to My Sources'}
          >
            <Icon name={inLibrary ? 'check' : 'plus'} size={14} />
            <span>{inLibrary ? 'Saved' : 'Add Source'}</span>
          </button>

          <button
            type="button"
            className="res-details-btn"
            onClick={(e) => {
              e.stopPropagation()
              onOpenDetails()
            }}
            title="Inspect resource verification and endpoint details"
          >
            <Icon name="info" size={14} />
            <span>Details</span>
          </button>
        </div>
      </div>
    </article>
    {contextMenu}
  </>
  )
}
