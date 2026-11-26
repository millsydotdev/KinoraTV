import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useContext, useEffect, useRef, useState } from 'react'
import type { Channel, Programme } from '../data/types'
import { clock } from '../lib/time'
import { loadXtreamArtwork } from '../lib/native'
import { cleanChannelTitle } from '../state/playlists'
import { Icon, type IconName } from './Icon'
import { Art, ChannelMark, ProgressBar, ProgrammeArt } from './ui'
import { StoreContext, useStore } from '../state/store'
import { useUniversalPlayback } from '../state/playbackContext'
import { useToast } from './Toast'
import { ContextMenu, type ContextMenuItem } from './design-system/ContextMenu'
import { CollectionDialog } from './CollectionDialog'
import { ArtworkDiagnosticsModal } from './ArtworkDiagnosticsModal'
import { artworkEngine, isGenericOrPromoGraphic, type ArtworkType } from '../data/artworkEngine'
import { TechnicalBadge, type TechnicalFormat } from './TechnicalBadges'
import { useArtwork } from '../lib/useArtwork'
import { loadMetadataConfig } from '../data/metadataProviders'

export function useCardContextMenu(to: string, title: string, itemRef?: string) {
  const store = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const [collectOpen, setCollectOpen] = useState(false)
  const [diagOpen, setDiagOpen] = useState(false)

  let ref = itemRef
  if (!ref) {
    if (to.startsWith('/watch/')) ref = decodeURIComponent(to.slice(7))
    else if (to.startsWith('/movies/')) ref = `movie:${to.slice(8)}`
    else if (to.startsWith('/series/')) ref = `series:${to.slice(8)}`
    else if (to.startsWith('/live?channel=')) ref = `channel:${to.slice(14)}`
  }

  const inWatchlist = ref ? store.library.watchlist.includes(ref) : false
  const inFavourites = ref ? store.library.favourites.includes(ref) : false

  const isWatched = ref ? store.library.watched.includes(ref) : false

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setMenuPos({ x: e.clientX, y: e.clientY })
  }

  const items: (ContextMenuItem | 'separator')[] = []

  const playTarget = to.startsWith('/watch/') || to.startsWith('/live')
    ? to
    : (ref?.startsWith('movie:') || ref?.startsWith('episode:') || ref?.startsWith('channel:'))
      ? `/watch/${encodeURIComponent(ref)}`
      : null

  if (playTarget) {
    items.push({
      id: 'play',
      label: 'Watch Now',
      icon: 'play',
      run: () => navigate(playTarget),
    })
  }

  items.push({
    id: 'open',
    label: 'Open Details',
    icon: 'info',
    run: () => navigate(to),
  })

  if (ref) {
    items.push({
      id: 'watched',
      label: isWatched ? 'Mark as Unwatched' : 'Mark as Watched',
      icon: 'check',
      run: () => {
        store.setWatched([ref!], !isWatched)
        toast(isWatched ? `Marked ${title} as unwatched` : `Marked ${title} as watched`)
      },
    })
    items.push({
      id: 'watchlist',
      label: inWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist',
      icon: inWatchlist ? 'check' : 'bookmark',
      run: () => {
        store.toggleWatchlist(ref!)
        toast(inWatchlist ? `Removed ${title} from watchlist` : `Added ${title} to watchlist`)
      },
    })
    items.push({
      id: 'favourite',
      label: inFavourites ? 'Remove from Favourites' : 'Add to Favourites',
      icon: 'heart',
      run: () => {
        store.toggleFavourite(ref!)
        toast(inFavourites ? `Removed ${title} from favourites` : `Added ${title} to favourites`)
      },
    })
    items.push({
      id: 'collection',
      label: 'Add to Collection...',
      icon: 'folder',
      run: () => setCollectOpen(true),
    })

    if (store.library.progress[ref]) {
      items.push({
        id: 'remove-progress',
        label: 'Remove from Continue Watching',
        icon: 'close',
        run: () => {
          const savedProgress = store.library.progress[ref!]
          store.removeProgress(ref!)
          toast(`Removed “${title}” from Continue Watching`, {
            label: 'Undo',
            run: () => {
              if (savedProgress) {
                store.restoreProgress(ref!, savedProgress)
                toast(`Restored “${title}” to Continue Watching`)
              }
            },
          })
        },
      })
    }
  }

  items.push('separator')
  items.push({
    id: 'copy-link',
    label: 'Copy Link',
    icon: 'link',
    run: () => {
      try {
        void navigator.clipboard.writeText(`${window.location.origin}${to}`)
        toast(`Copied link to ${title}`)
      } catch {}
    },
  })
  items.push({
    id: 'copy',
    label: 'Copy Title',
    icon: 'edit',
    run: () => {
      try {
        void navigator.clipboard.writeText(title)
        toast(`Copied “${title}”`)
      } catch {}
    },
  })
  items.push({
    id: 'diagnostics',
    label: 'Artwork Details and Diagnostics...',
    icon: 'film',
    run: () => setDiagOpen(true),
  })

  return {
    onContextMenu,
    menu: (
      <>
        {menuPos && (
          <ContextMenu
            open={!!menuPos}
            x={menuPos.x}
            y={menuPos.y}
            items={items}
            onClose={() => setMenuPos(null)}
            header={<strong>{title}</strong>}
          />
        )}
        {collectOpen && ref && (
          <CollectionDialog
            open={collectOpen}
            onClose={() => setCollectOpen(false)}
            itemRef={ref}
            itemTitle={title}
          />
        )}
        {diagOpen && (
          <ArtworkDiagnosticsModal
            open={diagOpen}
            onClose={() => setDiagOpen(false)}
            itemRef={ref}
            title={title}
          />
        )}
      </>
    ),
  }
}

/** Poster card: clean 2:3 artwork with optional caption underneath. */
export function PosterCard({ to, title, art, posterUrl, artworkKey, focus = 50, line, flag, badges, year, imdbId, itemRef, hideCaption = false }: {
  to: string; title: string; art?: string; posterUrl?: string; artworkKey?: string; focus?: number; line?: string; flag?: ReactNode; badges?: TechnicalFormat[]; year?: number | null; imdbId?: string | null; itemRef?: string; hideCaption?: boolean
}) {
  const { onContextMenu, menu } = useCardContextMenu(to, title, itemRef)
  const isSeries = to.startsWith('/series') || (itemRef && itemRef.startsWith('series:'))
  const artType: ArtworkType = isSeries ? 'series-poster' : 'movie-poster'
  const resolvedId = itemRef || (to.startsWith('/movies/') ? `movie:${to.slice(8)}` : to.startsWith('/series/') ? `series:${to.slice(8)}` : undefined)
  const resolved = useArtwork({
    contentId: resolvedId,
    title,
    type: artType,
    providerArt: posterUrl || art,
    imdbId,
    year,
  })
  const effectiveArt = resolved.src || posterUrl || art || ''
  return (
    <>
      <Link to={to} className="card card-poster" aria-label={line ? `${title}, ${line}` : title} onContextMenu={onContextMenu}>
        {flag && <span className="card-flag">{flag}</span>}
        {badges && badges.length > 0 && (
          <span className="card-poster-badges">
            {badges.map((b) => (
              <TechnicalBadge key={b} format={b} compact />
            ))}
          </span>
        )}
        {artworkKey ? (
          <XtreamArt artworkKey={artworkKey} alt={title} contentId={resolvedId} artType={artType} className="card-media" fallbackTitle={title} fallbackYear={year} fallbackIcon={isSeries ? 'series' : 'film'} />
        ) : (
          <Art
            src={effectiveArt}
            alt={title}
            contentId={resolvedId || to}
            focus={focus}
            fitMode="poster"
            className="card-media"
            fallbackIcon={isSeries ? 'series' : 'film'}
            fallbackYear={year}
          />
        )}
        {!hideCaption && (
          <span className="card-caption" aria-hidden="true">
            <strong>{title}</strong>
            {line && <span>{line}</span>}
          </span>
        )}
      </Link>
      {menu}
    </>
  )
}

/** Provider art is fetched by Rust only when the poster nears the viewport; falls back to custom/metadata artwork when missing or preferred. */
export function XtreamArt({
  artworkKey,
  alt = '',
  className = '',
  eager = false,
  fallbackTitle,
  fallbackYear,
  fallbackIcon = 'film',
  contentId,
  artType,
}: {
  artworkKey?: string | null
  alt?: string
  className?: string
  eager?: boolean
  fallbackTitle?: string
  fallbackYear?: number | null
  fallbackIcon?: IconName
  contentId?: string
  artType?: ArtworkType
}) {
  const artRef = useRef<HTMLDivElement>(null)
  const [art, setArt] = useState('')
  const [failed, setFailed] = useState(false)
  const [isPortrait, setIsPortrait] = useState(false)
  const effectiveTitle = fallbackTitle || alt
  const resolvedType: ArtworkType = artType ?? (fallbackIcon === 'series' ? 'series-poster' : 'movie-poster')
  const enriched = useArtwork({
    contentId: contentId || (artworkKey ? `xt:${artworkKey}` : undefined),
    title: effectiveTitle,
    type: resolvedType,
    year: fallbackYear,
    autoEnrich: true,
  })
  const preferMetadata = loadMetadataConfig().artworkSourcePreference === 'metadata-first'

  useEffect(() => {
    let active = true
    setFailed(false)
    setIsPortrait(false)
    if (!artworkKey) {
      setFailed(true)
      return () => { active = false }
    }
    const load = () => {
      void loadXtreamArtwork(artworkKey).then((image) => {
        if (active) {
          if (image) setArt(image)
          else setFailed(true)
        }
      })
    }
    if (eager || typeof IntersectionObserver === 'undefined' || !artRef.current) load()
    else {
      const observer = new IntersectionObserver(([entry]) => {
        if (entry?.isIntersecting) { observer.disconnect(); load() }
      }, { rootMargin: '160px' })
      observer.observe(artRef.current)
      return () => { active = false; observer.disconnect() }
    }
    return () => { active = false }
  }, [artworkKey, eager])

  // Priority: custom artwork always wins; genuine external metadata (TMDB/TVmaze/TVDB) used when preferred or when Xtream art fails (never demo bundled art)
  const isGenuineExternal = enriched.provider === 'metadata' && Boolean(enriched.src)
  const overrideSrc =
    enriched.provider === 'custom'
      ? enriched.src
      : preferMetadata && isGenuineExternal
        ? enriched.src
        : (!art || failed) && isGenuineExternal
          ? enriched.src
          : null

  const displaySrc = overrideSrc || (art && !failed ? art : '')

  return (
    <div ref={artRef} className={`xtream-art ${isPortrait ? 'is-portrait' : 'is-landscape'} ${className}`}>
      {displaySrc ? (
        <Art
          src={displaySrc}
          alt={alt}
          contentId={contentId || (artworkKey ? `xt:${artworkKey}` : undefined)}
          eager={eager}
          fallbackIcon={fallbackIcon}
          fallbackYear={fallbackYear}
          onLoad={(e) => {
            const img = e.currentTarget
            setIsPortrait(img.naturalHeight > img.naturalWidth * 1.05)
          }}
        />
      ) : (
        <div className="xtream-art-fallback" role="img" aria-label={alt ? `${alt}, artwork unavailable` : 'Artwork unavailable'}>
          <div className="xtream-fallback-gradient" />
          <div className="xtream-fallback-content">
            <span className="xtream-fallback-icon"><Icon name={fallbackIcon} size={28} /></span>
            {fallbackTitle && <strong className="xtream-fallback-title">{fallbackTitle}</strong>}
            {fallbackYear != null && <span className="xtream-fallback-year">{fallbackYear}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

/** Local media artwork loaded safely through Rust IPC (never raw filesystem paths in <img>), with external enrichment fallback. */
export function LocalMediaArt({
  mediaId,
  title,
  year,
  kind = 'movie',
  variant = 'poster',
  localArtPath,
  className = '',
  eager = false,
}: {
  mediaId: string
  title: string
  year?: number | null
  kind?: 'movie' | 'series' | 'episode'
  variant?: 'poster' | 'backdrop' | 'still'
  localArtPath?: string | null
  className?: string
  eager?: boolean
}) {
  const artType: ArtworkType =
    variant === 'still'
      ? 'episode-still'
      : variant === 'backdrop'
        ? kind === 'series'
          ? 'series-backdrop'
          : 'movie-backdrop'
        : kind === 'series'
          ? 'series-poster'
          : 'movie-poster'
  const resolved = useArtwork({
    contentId: `local-${kind}:${mediaId}`,
    localMediaId: mediaId,
    localArt: localArtPath,
    title,
    year,
    type: artType,
  })
  return (
    <Art
      src={resolved.src || ''}
      alt={title}
      contentId={`local-${kind}:${mediaId}`}
      eager={eager}
      className={className}
      fallbackIcon={kind === 'series' || kind === 'episode' ? 'series' : 'film'}
      fallbackYear={year}
    />
  )
}

export function XtreamPosterCard({ to, title, artworkKey, line, year, flag }: { to: string; title: string; artworkKey?: string | null; line?: string; year?: number | null; flag?: ReactNode }) {
  const isSeries = to.startsWith('/series')
  return (
    <Link to={to} className="card card-poster" aria-label={line ? `${title}, ${line}` : title}>
      {flag && <span className="card-flag">{flag}</span>}
      <XtreamArt
        artworkKey={artworkKey}
        alt={title}
        contentId={artworkKey ? `xt:${artworkKey}` : undefined}
        artType={isSeries ? 'series-poster' : 'movie-poster'}
        fallbackIcon={isSeries ? 'series' : 'film'}
        className="card-media"
        fallbackTitle={title}
        fallbackYear={year}
      />
      <span className="card-caption"><strong>{title}</strong>{line && <span>{line}</span>}</span>
    </Link>
  )
}

export interface EpisodeCardProps {
  to: string
  seriesId: string
  seriesTitle: string
  episodeId: string
  episodeTitle: string
  seasonNumber: number
  episodeNumber: number
  stillUrl?: string
  artworkKey?: string | null
  seriesBackdropUrl?: string
  runtimeMin?: number | null
  airDate?: string | null
  synopsis?: string
  progress?: number | null
  watched?: boolean
  isNext?: boolean
  itemRef?: string
  onToggleWatched?: () => void
  onOpenDetails?: () => void
}

/**
 * Dedicated 16:9 landscape episode card with genuine still, season/episode badge,
 * progress bar, play affordance, details trigger, and deliberate series fallback.
 */
export function EpisodeCard({
  to,
  seriesId,
  seriesTitle,
  episodeId,
  episodeTitle,
  seasonNumber,
  episodeNumber,
  stillUrl,
  artworkKey,
  seriesBackdropUrl,
  runtimeMin,
  airDate,
  synopsis,
  progress,
  watched = false,
  isNext = false,
  itemRef,
  onToggleWatched,
  onOpenDetails,
}: EpisodeCardProps) {
  const ref = itemRef || `episode:${seriesId}/${episodeId}`
  const { onContextMenu, menu } = useCardContextMenu(to, episodeTitle, ref)

  const resolvedEp = useArtwork({
    contentId: seriesId,
    title: `${seriesTitle} S${seasonNumber}E${episodeNumber}`,
    type: 'episode-still',
    providerArt: stillUrl,
    seasonNumber,
    episodeNumber,
    autoEnrich: false,
  })
  const resolvedStill = resolvedEp.src || undefined

  const isFallback = !resolvedStill && !artworkKey && Boolean(seriesBackdropUrl)
  const displayStill = resolvedStill || seriesBackdropUrl || ''
  const epCode = `S${String(seasonNumber).padStart(2, '0')} E${String(episodeNumber).padStart(2, '0')}`

  return (
    <>
      <div
        className={`card episode-card${watched ? ' is-watched' : ''}${isNext ? ' is-next' : ''}`}
        onContextMenu={onContextMenu}
      >
        <div className="episode-still-container">
          <Link
            to={to}
            className="episode-still"
            aria-label={`Play ${epCode}, ${episodeTitle}`}
          >
            {artworkKey ? (
              <XtreamArt
                artworkKey={artworkKey}
                alt={episodeTitle}
                className="card-media episode-card-art"
                fallbackTitle={`Episode ${episodeNumber}`}
                fallbackIcon="series"
              />
            ) : (
              <Art
                src={displayStill}
                alt={episodeTitle}
                contentId={ref}
                className="card-media episode-card-art"
                fallbackIcon="series"
              />
            )}

            <span className="episode-still-badge">{epCode}</span>

            {isFallback && (
              <span className="episode-fallback-tag" title="Deliberate series artwork fallback">
                Still unavailable
              </span>
            )}

            <span className="episode-still-play" aria-hidden="true">
              <span className="episode-play-circle">
                <Icon name="play" size={18} />
              </span>
            </span>

            {progress != null && (
              <ProgressBar value={progress} label={`${Math.round(progress * 100)}% watched`} />
            )}
          </Link>
        </div>

        <div className="episode-card-content">
          <div className="episode-card-meta">
            <span className="episode-code-label">{epCode}</span>
            {airDate && <span className="episode-meta-text">{airDate}</span>}
            {runtimeMin != null && <span className="episode-meta-text">{runtimeMin} min</span>}
            {isNext && <span className="episode-next-badge">Up next</span>}
          </div>

          <h3 className="episode-card-heading">
            {onOpenDetails ? (
              <button
                type="button"
                className="episode-title-button"
                onClick={onOpenDetails}
                title={`Open details for ${episodeTitle}`}
              >
                {episodeTitle}
              </button>
            ) : (
              <Link to={to} className="episode-title-link">
                {episodeTitle}
              </Link>
            )}
          </h3>

          {synopsis && <p className="episode-card-plot">{synopsis}</p>}

          <div className="episode-card-btn-row">
            <Link to={to} className="btn btn-primary btn-small episode-btn-play" aria-label={`Play ${episodeTitle}`}>
              <Icon name="play" size={13} />
              <span>{progress != null ? 'Resume' : 'Play'}</span>
            </Link>

            {onOpenDetails && (
              <button
                type="button"
                className="btn btn-secondary btn-small episode-btn-details"
                onClick={onOpenDetails}
                aria-label={`View details for ${episodeTitle}`}
              >
                <Icon name="info" size={13} />
                <span>Details</span>
              </button>
            )}

            {onToggleWatched && (
              <button
                type="button"
                className={`episode-card-check ${watched ? 'is-checked' : ''}`}
                role="checkbox"
                aria-checked={watched}
                aria-label={`${epCode} watched`}
                title={watched ? 'Mark as unwatched' : 'Mark as watched'}
                onClick={onToggleWatched}
              >
                <Icon name="check" size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
      {menu}
    </>
  )
}

/**
 * Landscape card. Text sits over a soft scrim by default; `captionBelow` moves it under the image
 * (series rows); `playable` shows a play affordance on hover/focus (continue watching).
 */
export function WideCard({ to, title, sub, art, backdropUrl, artworkKey, focus = 50, progress, flag, captionBelow = false, playable = false, itemRef, onDismiss }: {
  to: string; title: string; sub?: string; art?: string; backdropUrl?: string; artworkKey?: string; focus?: number; progress?: number | null; flag?: ReactNode; captionBelow?: boolean; playable?: boolean; itemRef?: string; onDismiss?: () => void
}) {
  const { onContextMenu, menu } = useCardContextMenu(to, title, itemRef)
  const isSeries = to.startsWith('/series') || (itemRef && itemRef.startsWith('series:'))
  const artType: ArtworkType = isSeries ? 'series-backdrop' : 'movie-backdrop'
  const resolvedId = itemRef || (to.startsWith('/movies/') ? `movie:${to.slice(8)}` : to.startsWith('/series/') ? `series:${to.slice(8)}` : undefined)
  const resolved = useArtwork({
    contentId: resolvedId,
    title,
    type: artType,
    providerArt: backdropUrl || art,
  })
  const effectiveArt = resolved.src || backdropUrl || art || ''
  return (
    <>
      <Link to={to} className="card card-wide" aria-label={sub ? `${title}, ${sub}` : title} onContextMenu={onContextMenu}>
        {flag && <span className="card-flag">{flag}</span>}
        {onDismiss && (
          <button
            type="button"
            className="card-dismiss-btn"
            aria-label={`Remove ${title} from Continue Watching`}
            title="Remove from Continue Watching"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onDismiss()
            }}
          >
            <Icon name="close" size={14} />
          </button>
        )}
        <button
          type="button"
          className="card-more-btn"
          aria-label={`Options for ${title}`}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onContextMenu(e)
          }}
        >
          <Icon name="more" size={16} />
        </button>
        {artworkKey ? (
          <div className={`card-media${captionBelow ? '' : ' card-shade'}`}>
            <XtreamArt artworkKey={artworkKey} alt={title} className="card-media" fallbackTitle={title} />
            {playable && <span className="card-play" aria-hidden="true"><Icon name="play" size={18} /></span>}
            {!captionBelow && (
              <span className={`card-overlay${progress != null ? ' has-progress' : ''}`} aria-hidden="true">
                <strong>{title}</strong>
                {sub && <span>{sub}</span>}
              </span>
            )}
            {progress != null && <ProgressBar value={progress} label={`${Math.round(progress * 100)}% watched`} />}
          </div>
        ) : (
          <Art
            src={effectiveArt}
            alt={title}
            contentId={itemRef || to}
            focus={focus}
            className={`card-media${captionBelow ? '' : ' card-shade'}`}
            fallbackIcon={isSeries ? 'series' : 'film'}
          >
            {playable && <span className="card-play" aria-hidden="true"><Icon name="play" size={18} /></span>}
            {!captionBelow && (
              <span className={`card-overlay${progress != null ? ' has-progress' : ''}`} aria-hidden="true">
                <strong>{title}</strong>
                {sub && <span>{sub}</span>}
              </span>
            )}
            {progress != null && <ProgressBar value={progress} label={`${Math.round(progress * 100)}% watched`} />}
          </Art>
        )}
        {captionBelow && (
          <span className="card-caption" aria-hidden="true">
            <strong>{title}</strong>
            {sub && <span>{sub}</span>}
          </span>
        )}
      </Link>
      {menu}
    </>
  )
}

/** What a channel shows with no current programme: playlist channels have no guide data yet. */
export const idleLabel = (c: Channel) => (c.sourceId ? 'No guide information' : 'Off air')

/** Live channel card: wordmark and LIVE badge on top, programme, progress and next slot below. */
export function ChannelCard({ channel, now, next, to, format, selected, at }: {
  channel: Channel; now?: Programme; next?: Programme; to: string; format: '24h' | '12h'; selected?: boolean; at: number
}) {
  const store = useContext(StoreContext)
  const playbackCtx = useUniversalPlayback()
  const navigate = useNavigate()
  const failure = channel.id ? store?.getStreamFailure(channel.id) : undefined

  const displayName = cleanChannelTitle(channel.name)
  const isPlayable = Boolean(channel.streamUrl)
  const itemRef = channel.id ? `channel:${channel.id}` : undefined
  const { onContextMenu, menu } = useCardContextMenu(to, displayName, itemRef)
  const remainingMins = now && now.stop > at ? Math.max(1, Math.round((now.stop - at) / 60000)) : undefined
  const isGenericTitle = Boolean(
    now?.title &&
      /^(news|न्यूज़|breaking news|daily news|weather|मौसम|special|स्पेशल|आस्था स्पेशल|आस्था भजन स्पेशल|teleshopping|shopping|live|off air|no information)$/i.test(
        now.title.trim(),
      ),
  )
  const isPromoIcon = Boolean(now?.icon && isGenericOrPromoGraphic(now.icon, now.title))
  const enrichedArt = !isGenericTitle && now?.title
    ? artworkEngine.findArtwork(now.title, 'epg-programme-artwork', undefined, channel.id)?.sourceUrl
    : null
  const hasValidProgrammeArt = Boolean(now?.art || (!isPromoIcon && (now?.icon || enrichedArt)))
  return (
    <>
      <Link
        to={to}
        className={`card channel-card${selected ? ' is-selected' : ''}`}
        aria-label={`${displayName}: ${now?.title ?? idleLabel(channel)}${failure ? `, stream offline: ${failure.message}` : ''}${next ? `, next at ${clock(next.start, format)}` : ''}${selected ? ', watching' : ''}`}
        onContextMenu={onContextMenu}
        onClick={() => {
          if (failure && channel.id) {
            store?.clearStreamFailure(channel.id)
          }
        }}
      >
        <div className="card-media card-shade channel-card-media" style={{ ['--channel-tone' as string]: channel.mark.tone }}>
          {hasValidProgrammeArt ? (
            <ProgrammeArt programme={now} channel={channel} alt={now?.title || ''} backdropOnly className="channel-card-art" />
          ) : (
            <div className="channel-card-ambient">
              <div className="channel-card-ambient-logo">
                <ChannelMark channel={channel} size={52} />
              </div>
            </div>
          )}
          <span className="card-top">
            <ChannelMark channel={channel} size={32} />
            <span className="channel-wordmark">{displayName}</span>
            {channel.name !== displayName && <span className="sr-only">{channel.name}</span>}
            <span className="card-top-badges">
              {channel.hd && <span className="badge badge-hd">HD</span>}
              {(channel.streamOptions?.length ?? 0) > 1 && <span className="badge badge-hd" title={`${channel.streamOptions?.length} stream servers available`}>{channel.streamOptions?.length} servers</span>}
              {failure ? (
                <span
                  className="badge badge-offline channel-card-offline-badge"
                  title={`Stream offline: ${failure.message}`}
                  data-testid="channel-offline-badge"
                >
                  <Icon name="warning" size={10} />
                  <span>Offline</span>
                  {failure.canRetry && (
                    <button
                      type="button"
                      className="channel-card-retry-btn"
                      aria-label={`Retry tuning ${displayName}`}
                      title="Retry tuning"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (channel.id) store?.clearStreamFailure(channel.id)
                        if (selected) {
                          playbackCtx.retry()
                        } else {
                          navigate(to)
                        }
                      }}
                    >
                      <Icon name="refresh" size={10} />
                    </button>
                  )}
                </span>
              ) : selected ? (
                <span className="badge badge-accent">Watching</span>
              ) : now ? (
                <span className="badge badge-live">Live</span>
              ) : null}
              {!isPlayable && channel.sourceId && !failure && (
                <span className="badge badge-offline" title="Stream address pending source refresh">Unverified</span>
              )}
            </span>
          </span>
          <span className="card-overlay has-progress" aria-hidden="true">
            <span className="channel-card-prog-row">
              <strong className="channel-prog-title">{now?.title ?? idleLabel(channel)}</strong>
              {failure ? (
                <span className="channel-card-time-left channel-card-error-text" title={failure.message}>
                  Offline
                </span>
              ) : remainingMins != null ? (
                <span className="channel-card-time-left">{remainingMins} min left</span>
              ) : null}
            </span>
            {next && <span className="tnum channel-next-info">Next {clock(next.start, format)} · {next.title}</span>}
          </span>
          {now && <ProgressBar value={(at - now.start) / (now.stop - now.start)} label="Programme progress" />}
        </div>
      </Link>
      {menu}
    </>
  )
}

/** Section: icon, title, optional count, "View All" on the right, then a grid of equal cards. */
export function Section({ icon, title, sub, viewAll, children, grid = 'grid-6' }: { icon: IconName; title: string; sub?: string; viewAll?: string; children: ReactNode; grid?: string }) {
  return (
    <section aria-label={title}>
      <div className="section-head">
        <h2 className="section-title"><Icon name={icon} size={18} />{title}{sub && <span className="section-sub">{sub}</span>}</h2>
        {viewAll && <Link to={viewAll} className="view-all">View All<Icon name="right" size={16} /></Link>}
      </div>
      <div className={grid}>{children}</div>
    </section>
  )
}
