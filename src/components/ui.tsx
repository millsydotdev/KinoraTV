import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Channel, Programme } from '../data/types'
import { Icon, type IconName } from './Icon'
import { inNativeShell, loadCachedArtwork, loadChannelLogo, loadProgrammeArtwork } from '../lib/native'
import { getCustomArtwork } from '../state/customArtwork'
import { artworkEngine, isGenericOrPromoGraphic } from '../data/artworkEngine'
import { clock } from '../lib/time'

/** Artwork with explicit loading and failed states, so a missing image never leaves a blank hole. */
export function Art({
  src,
  alt = '',
  focus = 50,
  className = '',
  eager = false,
  contentId,
  fallbackIcon = 'film',
  fallbackYear,
  onLoad: onImageLoad,
  onError: onImageError,
  children,
}: {
  src: string
  alt?: string
  focus?: number
  className?: string
  eager?: boolean
  contentId?: string
  fallbackIcon?: IconName
  fallbackYear?: number | null
  onLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void
  onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void
  children?: ReactNode
}) {
  type ImageState = 'loading' | 'loaded' | 'error'
  const custom = (contentId || alt) ? getCustomArtwork(contentId || alt) : undefined
  const effectiveSrc = custom?.dataUrl || src
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const isRemote = Boolean(effectiveSrc && (effectiveSrc.startsWith('http://') || effectiveSrc.startsWith('https://')))
  const native = inNativeShell()

  const [resolvedSrc, setResolvedSrc] = useState<string>(() => {
    if (!effectiveSrc) return ''
    if (isRemote && native) return ''
    return effectiveSrc
  })

  const [imageState, setImageState] = useState<ImageState>(() => {
    if (!effectiveSrc) return 'error'
    return 'loading'
  })

  useEffect(() => {
    let active = true
    if (!effectiveSrc) {
      setResolvedSrc('')
      setImageState('error')
      return
    }

    const startLoad = () => {
      if (isRemote) {
        if (native) {
          setResolvedSrc('')
          setImageState('loading')
          const cacheKey = contentId ? `art:${contentId}:${effectiveSrc}` : `url:${effectiveSrc}`
          loadCachedArtwork(cacheKey, effectiveSrc)
            .then((dataUri) => {
              if (!active) return
              if (dataUri) {
                setResolvedSrc(dataUri)
              } else {
                setImageState('error')
              }
            })
            .catch(() => {
              if (active) setImageState('error')
            })
        } else {
          setImageState('loading')
          setResolvedSrc(effectiveSrc)
        }
      } else {
        setImageState('loading')
        setResolvedSrc(effectiveSrc)
      }
    }

    if (eager || typeof IntersectionObserver === 'undefined' || !containerRef.current) {
      startLoad()
    } else {
      let started = false
      const trigger = () => {
        if (!started) {
          started = true
          startLoad()
        }
      }
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) {
            observer.disconnect()
            trigger()
          }
        },
        { rootMargin: '400px' },
      )
      observer.observe(containerRef.current)
      // Safety fallback: if IntersectionObserver does not fire within 600ms (e.g. inside horizontal rails or programmatic scroll), trigger load
      const timer = setTimeout(trigger, 600)
      return () => {
        active = false
        clearTimeout(timer)
        observer.disconnect()
      }
    }

    return () => {
      active = false
    }
  }, [effectiveSrc, isRemote, native, contentId, eager])

  useEffect(() => {
    if (!resolvedSrc) return
    const el = imgRef.current
    if (el && el.complete) {
      if (el.naturalWidth > 0) {
        setImageState('loaded')
        onImageLoad?.({ currentTarget: el, target: el } as unknown as React.SyntheticEvent<HTMLImageElement>)
      } else {
        setImageState('error')
      }
    }
  }, [resolvedSrc, onImageLoad])

  const state = !effectiveSrc ? 'error' : imageState

  return (
    <div ref={containerRef} className={`art ${state === 'loading' ? 'is-loading' : ''} ${className}`}>
      {state !== 'error' && resolvedSrc ? (
        <img
          ref={imgRef}
          src={resolvedSrc}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding={eager ? 'sync' : 'async'}
          style={{ objectPosition: `${focus}% 50%` }}
          className={state === 'loaded' ? 'is-loaded' : ''}
          onLoad={(e) => {
            setImageState('loaded')
            onImageLoad?.(e)
          }}
          onError={(e) => {
            setImageState('error')
            onImageError?.(e)
          }}
        />
      ) : null}
      {state === 'error' && (
        <div
          className="art-fallback art-fallback-branded"
          role="img"
          aria-label={alt ? `Artwork for ${alt}` : 'Artwork unavailable'}
        >
          <div className="art-fallback-glow" aria-hidden="true" />
          <Icon name={fallbackIcon} size={28} className="fallback-icon" />
          {alt && <span className="fallback-title">{alt}</span>}
          {fallbackYear != null && <span className="fallback-year">{fallbackYear}</span>}
        </div>
      )}
      {children}
    </div>
  )
}

/**
 * Polished, honest branded programme placeholder.
 * Used when a real-mode broadcast has no XMLTV icon or when artwork retrieval fails.
 * Uses channel mark, programme title, broadcast times, and subtle channel styling.
 */
export function ProgrammeAmbientCard({
  programme,
  channel,
  className = '',
  compact = false,
  backdropOnly = false,
}: {
  programme?: Programme | null
  channel?: Channel | null
  className?: string
  compact?: boolean
  backdropOnly?: boolean
}) {
  const tone = channel?.mark.tone ?? '#3d4650'
  const markText = channel?.mark.text ?? (programme?.channelId ? programme.channelId.slice(0, 3).toUpperCase() : '')
  const title = programme?.title ?? (channel?.sourceId ? 'No guide information' : 'Television Broadcast')
  const category = programme?.category
  const time = programme?.start && programme?.stop
    ? `${clock(programme.start, '24h')} - ${clock(programme.stop, '24h')}`
    : null

  return (
    <div
      className={`programme-ambient-card ${compact ? 'is-compact' : ''} ${backdropOnly ? 'is-backdrop-only' : ''} ${className}`}
      style={{ ['--ambient-tone' as string]: tone }}
      role={backdropOnly ? 'presentation' : 'img'}
      aria-label={backdropOnly ? undefined : `${title}${channel ? ` on ${channel.name}` : ''}`}
      aria-hidden={backdropOnly ? true : undefined}
    >
      <div className="programme-ambient-mesh" />
      <div className="programme-ambient-watermark" aria-hidden="true">
        {markText}
      </div>
      {!backdropOnly && (
        <div className="programme-ambient-content">
          <div className="programme-ambient-header">
            {channel && <ChannelMark channel={channel} size={compact ? 24 : 32} />}
            {category && <span className="programme-ambient-pill">{category}</span>}
          </div>
          <div className="programme-ambient-footer">
            <strong className="programme-ambient-title">{title}</strong>
            {time && <span className="programme-ambient-time">{time}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Renders programme artwork with honest fallback hierarchy:
 * 1. Valid programme artwork (fetched from remote icon URL via guarded Rust backend).
 * 2. Explicit demo artwork (when explicitly provided or in demo mode: `programme.art`).
 * 3. Honest branded programme placeholder (`ProgrammeAmbientCard`), NEVER unrelated scenic demo photos.
 */
export function ProgrammeArt({
  programme,
  channel,
  icon: directIcon,
  art: directArt,
  alt,
  focus = 50,
  className = '',
  eager = false,
  backdropOnly = false,
  children,
}: {
  programme?: Programme | null
  channel?: Channel | null
  icon?: string | null
  art?: string | null
  alt?: string
  focus?: number
  className?: string
  eager?: boolean
  backdropOnly?: boolean
  children?: ReactNode
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rawIconUrl = directIcon !== undefined ? directIcon : programme?.icon ?? null
  // Normalize Sky metadata pd-image URLs so 16:9 photographic stills are requested instead of portrait covers
  const normalizedRawIcon =
    rawIconUrl?.includes('images.metadata.sky.com/pd-image/') && rawIconUrl.endsWith('/cover')
      ? rawIconUrl.replace(/\/cover$/, '/16-9')
      : rawIconUrl

  // Refuse channel logo URLs masquerading as programme artwork
  const isChannelLogo = Boolean(
    (channel?.logoUrl && normalizedRawIcon && channel.logoUrl === normalizedRawIcon) ||
    (normalizedRawIcon && (/\/tv-logo\/|\/channel-logo\/|channel_icon/i.test(normalizedRawIcon)))
  )

  // When rendering card backdrops, refuse isolated title logos and wordmarks
  const isTitleLogo = Boolean(
    backdropOnly && normalizedRawIcon && (/\/logos?\/|title[-_]logo|wordmark|clearart/i.test(normalizedRawIcon))
  )

  // Refuse generic category graphics, stock news graphics, or broadcaster promotional cards
  const isPromoOrGeneric = Boolean(
    normalizedRawIcon && isGenericOrPromoGraphic(normalizedRawIcon, programme?.title)
  )

  const iconUrl = isChannelLogo || isTitleLogo || isPromoOrGeneric ? null : normalizedRawIcon

  // Check user-selected custom artwork first (Priority 1)
  const customRecord = programme?.id
    ? getCustomArtwork(programme.id, 'epg-programme-artwork')
    : (programme?.title ? getCustomArtwork(programme.title, 'epg-programme-artwork') : undefined)

  // Check if central artwork engine has resolved genuine artwork for this programme
  // Never match generic category titles cross-channel
  const isGenericTitle = Boolean(
    programme?.title &&
      /^(news|न्यूज़|breaking news|daily news|weather|मौसम|special|स्पेशल|आस्था स्पेशल|आस्था भजन स्पेशल|teleshopping|shopping|live|off air|no information)$/i.test(
        programme.title.trim(),
      ),
  )
  const enrichedRecord =
    programme?.title && !isGenericTitle
      ? artworkEngine.findArtwork(programme.title, 'epg-programme-artwork', undefined, channel?.id)
      : null
  const effectiveIconUrl = customRecord?.dataUrl || iconUrl || (enrichedRecord?.sourceUrl ? enrichedRecord.sourceUrl : null)

  // Only use explicit art prop or demo programme art (never silent scenic fallback)
  const explicitArt = directArt !== undefined ? directArt : programme?.art ?? null
  const label = alt ?? programme?.title ?? ''

  const [remoteArt, setRemoteArt] = useState<string | null>(null)
  const [remoteFailed, setRemoteFailed] = useState(false)
  const [aspect, setAspect] = useState<'landscape' | 'portrait'>('landscape')

  useEffect(() => {
    let active = true
    setRemoteFailed(false)
    setRemoteArt(null)
    if (!effectiveIconUrl) return

    // If it is a data URI or local image path, apply immediately without network roundtrip
    if (effectiveIconUrl.startsWith('data:') || effectiveIconUrl.startsWith('/')) {
      setRemoteArt(effectiveIconUrl)
      return () => {
        active = false
      }
    }

    const load = () => {
      if (programme) {
        artworkEngine.registerProgrammeIcon(programme, channel ?? undefined)
      }
      void loadProgrammeArtwork(effectiveIconUrl)
        .then((data) => {
          if (!active) return
          if (data) {
            setRemoteArt(data)
          } else {
            setRemoteFailed(true)
            artworkEngine.registerFailedDownload(programme?.id || effectiveIconUrl, effectiveIconUrl, 'Download returned invalid or non-raster bytes')
          }
        })
        .catch((err) => {
          if (active) {
            setRemoteFailed(true)
            artworkEngine.registerFailedDownload(programme?.id || effectiveIconUrl, effectiveIconUrl, String(err?.message || 'Network fetch failed'))
          }
        })
    }

    if (eager || typeof IntersectionObserver === 'undefined' || !containerRef.current) {
      load()
    } else {
      let started = false
      const trigger = () => {
        if (!started) {
          started = true
          load()
        }
      }
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) {
            observer.disconnect()
            trigger()
          }
        },
        { rootMargin: '300px' },
      )
      observer.observe(containerRef.current)
      const timer = setTimeout(trigger, 600)
      return () => {
        active = false
        clearTimeout(timer)
        observer.disconnect()
      }
    }
    return () => {
      active = false
    }
  }, [effectiveIconUrl, eager])

  const effectiveSrc = (remoteArt && !remoteFailed ? remoteArt : explicitArt) || null

  // If no authentic image is available (no icon, or download failed, and no demo art)
  if (!effectiveSrc) {
    return (
      <div ref={containerRef} className={`programme-art is-ambient ${className}`}>
        <ProgrammeAmbientCard programme={programme} channel={channel} backdropOnly={backdropOnly} />
        {children}
      </div>
    )
  }

  const isPortrait = aspect === 'portrait'

  return (
    <div ref={containerRef} className={`programme-art ${isPortrait ? 'is-portrait' : 'is-landscape'} ${className}`}>
      {isPortrait && (
        <div
          className="programme-art-stage-backdrop"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse at center, var(--surface-2) 0%, var(--bg) 100%)',
            zIndex: 0,
            pointerEvents: 'none',
          }}
          aria-hidden="true"
        />
      )}
      <Art
        src={effectiveSrc}
        alt={label}
        focus={focus}
        eager={eager}
        onLoad={(e) => {
          const img = e.currentTarget
          if (img.naturalHeight > img.naturalWidth * 1.05) {
            setAspect('portrait')
          } else {
            setAspect('landscape')
          }
        }}
        onError={() => setRemoteFailed(true)}
      >
        {children}
      </Art>
    </div>
  )
}

export function ChannelMark({ channel, size = 40 }: { channel: Channel; size?: number }) {
  const mark = useRef<HTMLSpanElement>(null)
  const [logo, setLogo] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    setFailed(false)
    const custom = getCustomArtwork(channel.id, 'channel-logo') || (channel.tvgId ? getCustomArtwork(channel.tvgId, 'channel-logo') : undefined)
    if (custom?.dataUrl) {
      setLogo(custom.dataUrl)
      return () => { active = false }
    }
    if (channel.logoUrl && channel.logoUrl.startsWith('data:')) {
      setLogo(channel.logoUrl)
      return () => { active = false }
    }
    const load = () => {
      void loadChannelLogo(channel.logoUrl, channel.id, channel.tvgId).then((data) => {
        if (active) {
          if (data) setLogo(data)
          else if (!inNativeShell() && channel.logoUrl) setLogo(channel.logoUrl)
        }
      })
    }
    if (typeof IntersectionObserver === 'undefined' || !mark.current) load()
    else {
      const observer = new IntersectionObserver(([entry]) => {
        if (entry?.isIntersecting) { observer.disconnect(); load() }
      }, { rootMargin: '96px' })
      observer.observe(mark.current)
      return () => { active = false; observer.disconnect() }
    }
    return () => { active = false }
  }, [channel.id, channel.logoUrl, channel.tvgId])
  return (
    <span ref={mark} className="channel-mark" style={{ width: size, background: channel.mark.tone, fontSize: size * (channel.mark.text.length > 2 ? 0.3 : 0.36) }} aria-hidden="true">
      {logo && !failed
        ? <img src={logo} alt="" loading="lazy" onError={() => setFailed(true)} />
        : channel.mark.text}
    </span>
  )
}

export function Switch({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string }) {
  return <button id={id} type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />
}

export function Segmented<T extends string | number>({ value, options, onChange, label, className = '' }: {
  value: T; options: { value: T; label: string; icon?: IconName; name?: string }[]; onChange: (v: T) => void; label: string; className?: string
}) {
  const move = (dir: number) => {
    const i = options.findIndex((o) => o.value === value)
    const next = options[(i + dir + options.length) % options.length]
    if (next) onChange(next.value)
  }
  return (
    <div
      className={`segmented ${className}`}
      role="radiogroup"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(1) }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
      }}
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          onClick={() => onChange(o.value)}
          aria-label={o.label ? undefined : o.name ?? String(o.value)}
          title={o.label ? undefined : o.name}
        >
          {o.icon && <Icon name={o.icon} size={16} />}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function StateBlock({ icon = 'info', title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="state" role="status">
      <span className="icon-mark"><Icon name={icon} /></span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function DemoNote({ children }: { children: ReactNode }) {
  return (
    <p className="demo-note">
      <Icon name="info" size={16} />
      <span>{children}</span>
    </p>
  )
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  return (
    <div className="progress" role="progressbar" aria-label={label ?? 'Progress'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <i style={{ width: `${Math.max(2, value * 100)}%` }} />
    </div>
  )
}
