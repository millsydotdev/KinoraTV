import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import type { Channel, Programme } from '../data/types'
import { clock } from '../lib/time'
import { loadXtreamArtwork } from '../lib/native'
import { cleanChannelTitle } from '../state/playlists'
import { Icon, type IconName } from './Icon'
import { Art, ChannelMark, ProgressBar, ProgrammeArt } from './ui'
import { useStore } from '../state/store'
import { useToast } from './Toast'
import { ContextMenu, type ContextMenuItem } from './design-system/ContextMenu'
import { CollectionDialog } from './CollectionDialog'
import { artworkEngine } from '../data/artworkEngine'
import { TechnicalBadge, type TechnicalFormat } from './TechnicalBadges'

export function useCardContextMenu(to: string, title: string, itemRef?: string) {
  const store = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const [collectOpen, setCollectOpen] = useState(false)

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
      </>
    ),
  }
}

/** Poster card: clean 2:3 artwork with optional caption underneath. */
export function PosterCard({ to, title, art, posterUrl, artworkKey, focus = 50, line, flag, badges, year, itemRef, hideCaption = false }: {
  to: string; title: string; art?: string; posterUrl?: string; artworkKey?: string; focus?: number; line?: string; flag?: ReactNode; badges?: TechnicalFormat[]; year?: number | null; itemRef?: string; hideCaption?: boolean
}) {
  const { onContextMenu, menu } = useCardContextMenu(to, title, itemRef)
  const resolvedArtwork = !posterUrl && !art
    ? artworkEngine.findArtwork(title, 'movie-poster')?.sourceUrl ||
      artworkEngine.findArtwork(title, 'series-poster')?.sourceUrl
    : ''
  const effectiveArt = posterUrl || art || resolvedArtwork || ''
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
          <XtreamArt artworkKey={artworkKey} alt={title} className="card-media" fallbackTitle={title} fallbackYear={year} />
        ) : (
          <Art src={effectiveArt} focus={focus} className="card-media" />
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

/** Provider art is fetched by Rust only when the poster nears the viewport; the remote URL stays native-side. */
export function XtreamArt({ artworkKey, alt = '', className = '', eager = false, fallbackTitle, fallbackYear }: {
  artworkKey?: string | null; alt?: string; className?: string; eager?: boolean; fallbackTitle?: string; fallbackYear?: number | null
}) {
  const artRef = useRef<HTMLDivElement>(null)
  const [art, setArt] = useState('')
  const [failed, setFailed] = useState(false)
  const [isPortrait, setIsPortrait] = useState(false)
  useEffect(() => {
    let active = true
    setFailed(false)
    setIsPortrait(false)
    if (!artworkKey) return () => { active = false }
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
  return (
    <div ref={artRef} className={`xtream-art ${isPortrait ? 'is-portrait' : 'is-landscape'} ${className}`}>
      {art && !failed ? (
        <Art
          src={art}
          alt={alt}
          eager={eager}
          onLoad={(e) => {
            const img = e.currentTarget
            setIsPortrait(img.naturalHeight > img.naturalWidth * 1.05)
          }}
        />
      ) : (
        <div className="xtream-art-fallback" role="img" aria-label={alt ? `${alt}, artwork unavailable` : 'Artwork unavailable'}>
          <div className="xtream-fallback-gradient" />
          <div className="xtream-fallback-content">
            <span className="xtream-fallback-icon"><Icon name="film" size={28} /></span>
            {fallbackTitle && <strong className="xtream-fallback-title">{fallbackTitle}</strong>}
            {fallbackYear != null && <span className="xtream-fallback-year">{fallbackYear}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

export function XtreamPosterCard({ to, title, artworkKey, line, year, flag }: { to: string; title: string; artworkKey?: string | null; line?: string; year?: number | null; flag?: ReactNode }) {
  return (
    <Link to={to} className="card card-poster" aria-label={line ? `${title}, ${line}` : title}>
      {flag && <span className="card-flag">{flag}</span>}
      <XtreamArt artworkKey={artworkKey} alt={title} className="card-media" fallbackTitle={title} fallbackYear={year} />
      <span className="card-caption"><strong>{title}</strong>{line && <span>{line}</span>}</span>
    </Link>
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
  const resolvedBackdrop = !backdropUrl && !art
    ? artworkEngine.findArtwork(title, 'movie-backdrop')?.sourceUrl ||
      artworkEngine.findArtwork(title, 'series-backdrop')?.sourceUrl ||
      artworkEngine.findArtwork(title, 'episode-still')?.sourceUrl
    : ''
  const effectiveArt = backdropUrl || art || resolvedBackdrop || ''
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
          <XtreamArt artworkKey={artworkKey} alt={title} className={`card-media${captionBelow ? '' : ' card-shade'}`} fallbackTitle={title} />
        ) : (
          <Art src={effectiveArt} focus={focus} className={`card-media${captionBelow ? '' : ' card-shade'}`}>
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
  const displayName = cleanChannelTitle(channel.name)
  const isPlayable = Boolean(channel.streamUrl)
  const itemRef = channel.id ? `channel:${channel.id}` : undefined
  const { onContextMenu, menu } = useCardContextMenu(to, displayName, itemRef)
  return (
    <>
      <Link
        to={to}
        className={`card channel-card${selected ? ' is-selected' : ''}`}
        aria-label={`${displayName}: ${now?.title ?? idleLabel(channel)}${next ? `, next at ${clock(next.start, format)}` : ''}${selected ? ', watching' : ''}`}
        onContextMenu={onContextMenu}
      >
        <div className="card-media card-shade channel-card-media" style={{ ['--channel-tone' as string]: channel.mark.tone }}>
          {now?.art || now?.icon || (now?.title && artworkEngine.findArtwork(now.title, 'epg-programme-artwork')?.sourceUrl) ? (
            <ProgrammeArt programme={now} channel={channel} alt={now.title} backdropOnly className="channel-card-art" />
          ) : (
            <div className="channel-card-ambient" />
          )}
          <span className="card-top">
            <ChannelMark channel={channel} size={32} />
            <span className="channel-wordmark">{displayName}</span>
            <span className="card-top-badges">
              {channel.hd && <span className="badge badge-hd">HD</span>}
              {(channel.streamOptions?.length ?? 0) > 1 && <span className="badge badge-hd" title={`${channel.streamOptions?.length} stream servers available`}>{channel.streamOptions?.length} servers</span>}
              {selected ? <span className="badge badge-accent">Watching</span> : now && <span className="badge badge-live">Live</span>}
              {!isPlayable && channel.sourceId && <span className="badge badge-offline" title="Stream address pending source refresh">Unverified</span>}
            </span>
          </span>
          <span className="card-overlay has-progress" aria-hidden="true">
            <strong>{now?.title ?? idleLabel(channel)}</strong>
            {next && <span className="tnum">Next {clock(next.start, format)} · {next.title}</span>}
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
