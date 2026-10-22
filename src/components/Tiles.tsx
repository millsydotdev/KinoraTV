import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Channel, Programme } from '../data/types'
import { clock } from '../lib/time'
import { Icon, type IconName } from './Icon'
import { Art, ProgressBar } from './ui'

/** Poster card: clean 2:3 artwork with the caption underneath. */
export function PosterCard({ to, title, art, focus, line, flag }: { to: string; title: string; art: string; focus: number; line?: string; flag?: ReactNode }) {
  return (
    <Link to={to} className="card card-poster" aria-label={line ? `${title}, ${line}` : title}>
      {flag && <span className="card-flag">{flag}</span>}
      <Art src={art} focus={focus} className="card-media" />
      <span className="card-caption" aria-hidden="true">
        <strong>{title}</strong>
        {line && <span>{line}</span>}
      </span>
    </Link>
  )
}

/**
 * Landscape card. Text sits over a soft scrim by default; `captionBelow` moves it under the image
 * (series rows); `playable` shows a play affordance on hover/focus (continue watching).
 */
export function WideCard({ to, title, sub, art, focus = 50, progress, flag, captionBelow = false, playable = false }: {
  to: string; title: string; sub?: string; art: string; focus?: number; progress?: number | null; flag?: ReactNode; captionBelow?: boolean; playable?: boolean
}) {
  return (
    <Link to={to} className="card" aria-label={sub ? `${title}, ${sub}` : title}>
      {flag && <span className="card-flag">{flag}</span>}
      <Art src={art} focus={focus} className={`card-media${captionBelow ? '' : ' card-shade'}`}>
        {playable && <span className="card-play" aria-hidden="true"><Icon name="play" size={18} /></span>}
        {!captionBelow && (
          <span className={`card-overlay${progress != null ? ' has-progress' : ''}`} aria-hidden="true">
            <strong>{title}</strong>
            {sub && <span>{sub}</span>}
          </span>
        )}
        {progress != null && <ProgressBar value={progress} label={`${Math.round(progress * 100)}% watched`} />}
      </Art>
      {captionBelow && (
        <span className="card-caption" aria-hidden="true">
          <strong>{title}</strong>
          {sub && <span>{sub}</span>}
        </span>
      )}
    </Link>
  )
}

/** Live channel card: wordmark and LIVE badge on top, programme, progress and next slot below. */
export function ChannelCard({ channel, now, next, to, format, selected, at }: {
  channel: Channel; now?: Programme; next?: Programme; to: string; format: '24h' | '12h'; selected?: boolean; at: number
}) {
  return (
    <Link to={to} className={`card channel-card${selected ? ' is-selected' : ''}`} aria-label={`${channel.name}: ${now?.title ?? 'Off air'}${next ? `, next at ${clock(next.start, format)}` : ''}${selected ? ', watching' : ''}`}>
      <Art src={now?.art ?? ''} className="card-media card-shade">
        <span className="card-top">
          <span className="channel-wordmark">{channel.name}</span>
          {selected ? <span className="badge badge-accent">Watching</span> : now && <span className="badge badge-live">Live</span>}
        </span>
        <span className="card-overlay has-progress" aria-hidden="true">
          <strong>{now?.title ?? 'Off air'}</strong>
          {next && <span className="tnum">Next {clock(next.start, format)} · {next.title}</span>}
        </span>
        {now && <ProgressBar value={(at - now.start) / (now.stop - now.start)} label="Programme progress" />}
      </Art>
    </Link>
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
