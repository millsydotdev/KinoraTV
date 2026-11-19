import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Channel, Programme } from '../data/types'
import { Icon, type IconName } from './Icon'
import { loadChannelLogo, loadProgrammeArtwork } from '../lib/native'
import { getCustomArtwork } from '../state/customArtwork'
import { artworkEngine } from '../data/artworkEngine'
import { clock } from '../lib/time'

/** Artwork with explicit loading and failed states, so a missing image never leaves a blank hole. */
export function Art({
  src,
  alt = '',
  focus = 50,
  className = '',
  eager = false,
  contentId,
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
  onLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void
  onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void
  children?: ReactNode
}) {
  type ImageState = 'loading' | 'loaded' | 'error'
  const custom = (contentId || alt) ? getCustomArtwork(contentId || alt) : undefined
  const effectiveSrc = custom?.dataUrl || src
  const imgRef = useRef<HTMLImageElement>(null)
  const [resolvedSrc, setResolvedSrc] = useState<string>(effectiveSrc)
  const [image, setImage] = useState<{ src: string; state: ImageState }>({
    src: effectiveSrc,
    state: effectiveSrc ? 'loading' : 'error',
  })

  useEffect(() => {
    let active = true
    if (!effectiveSrc) {
      setImage({ src: '', state: 'error' })
      return
    }

    if (effectiveSrc.startsWith('http://') || effectiveSrc.startsWith('https://')) {
      loadProgrammeArtwork(effectiveSrc)
        .then((dataUri) => {
          if (!active) return
          if (dataUri) {
            setResolvedSrc(dataUri)
          } else {
            setResolvedSrc(effectiveSrc)
          }
        })
        .catch(() => {
          if (active) setResolvedSrc(effectiveSrc)
        })
    } else {
      setResolvedSrc(effectiveSrc)
    }

    return () => {
      active = false
    }
  }, [effectiveSrc])

  const state = image.src === resolvedSrc ? image.state : resolvedSrc ? 'loading' : 'error'

  useEffect(() => {
    if (!resolvedSrc) {
      setImage({ src: '', state: 'error' })
      return
    }
    const el = imgRef.current
    if (el && el.complete) {
      if (el.naturalWidth > 0) {
        setImage({ src: resolvedSrc, state: 'loaded' })
        onImageLoad?.({ currentTarget: el, target: el } as unknown as React.SyntheticEvent<HTMLImageElement>)
      } else {
        setImage({ src: resolvedSrc, state: 'error' })
      }
      return
    }
    setImage((cur) => (cur.src === resolvedSrc ? cur : { src: resolvedSrc, state: 'loading' }))
  }, [resolvedSrc, onImageLoad])

  return (
    <div className={`art ${state === 'loading' ? 'is-loading' : ''} ${className}`}>
      {state !== 'error' && (
        <img
          ref={imgRef}
          src={resolvedSrc}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding={eager ? 'sync' : 'async'}
          style={{ objectPosition: `${focus}% 50%` }}
          className={state === 'loaded' ? 'is-loaded' : ''}
          onLoad={(e) => {
            setImage((current) => current.src === resolvedSrc ? { src: resolvedSrc, state: 'loaded' } : current)
            onImageLoad?.(e)
          }}
          onError={(e) => {
            setImage((current) => current.src === resolvedSrc ? { src: resolvedSrc, state: 'error' } : current)
            onImageError?.(e)
          }}
        />
      )}
      {state === 'error' && (
        <div className="art-fallback art-fallback-branded" role="img" aria-label={alt ? `Artwork for ${alt}` : 'Artwork unavailable'}>
          <Icon name="film" size={24} className="fallback-icon" />
          {alt && <span className="fallback-title">{alt}</span>}
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
  // Refuse channel logo URLs masquerading as programme artwork
  const isChannelLogo = Boolean(
    (channel?.logoUrl && rawIconUrl && channel.logoUrl === rawIconUrl) ||
    (rawIconUrl && (/\/tv-logo\/|\/channel-logo\/|channel_icon/i.test(rawIconUrl)))
  )
  const iconUrl = isChannelLogo ? null : rawIconUrl

  // Check user-selected custom artwork first (Priority 1)
  const customRecord = programme?.id
    ? getCustomArtwork(programme.id, 'epg-programme-artwork')
    : (programme?.title ? getCustomArtwork(programme.title, 'epg-programme-artwork') : undefined)

  // Check if central artwork engine has resolved genuine artwork for this programme
  const enrichedRecord = programme?.title
    ? artworkEngine.findArtwork(programme.title, 'epg-programme-artwork')
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
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) {
            observer.disconnect()
            load()
          }
        },
        { rootMargin: '160px' },
      )
      observer.observe(containerRef.current)
      return () => {
        active = false
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
    const load = () => {
      void loadChannelLogo(channel.logoUrl, channel.id, channel.tvgId).then((data) => {
        if (active && data) setLogo(data)
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
