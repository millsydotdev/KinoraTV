import { useState, type ReactNode } from 'react'
import type { Channel } from '../data/types'
import { Icon, type IconName } from './Icon'

/** Artwork with explicit loading and failed states, so a missing image never leaves a blank hole. */
export function Art({ src, alt = '', focus = 50, className = '', eager = false, children }: {
  src: string; alt?: string; focus?: number; className?: string; eager?: boolean; children?: ReactNode
}) {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>(src ? 'loading' : 'error')
  return (
    <div className={`art ${state === 'loading' ? 'is-loading' : ''} ${className}`}>
      {state !== 'error' && (
        <img
          src={src}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          style={{ objectPosition: `${focus}% 50%` }}
          className={state === 'loaded' ? 'is-loaded' : ''}
          onLoad={() => setState('loaded')}
          onError={() => setState('error')}
        />
      )}
      {state === 'error' && src && <div className="art-fallback">{alt ? `Artwork unavailable: ${alt}` : 'Artwork unavailable'}</div>}
      {children}
    </div>
  )
}

export function ChannelMark({ channel, size = 40 }: { channel: Channel; size?: number }) {
  return (
    <span className="channel-mark" style={{ width: size, background: channel.mark.tone, fontSize: size * (channel.mark.text.length > 2 ? 0.3 : 0.36) }} aria-hidden="true">
      {channel.logoUrl ? <img src={channel.logoUrl} alt="" /> : channel.mark.text}
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
