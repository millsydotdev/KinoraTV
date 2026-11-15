import type { ReactNode } from 'react'
import { Icon, type IconName } from '../Icon'
import './design-system.css'

export function ProgressBar({
  progress,
  className = '',
  label,
}: {
  progress?: number // 0-100; undefined = indeterminate
  className?: string
  label?: string
}) {
  const isIndeterminate = progress === undefined
  return (
    <div
      className={`ds-progress-bar ${isIndeterminate ? 'is-indeterminate' : ''} ${className}`}
      role="progressbar"
      aria-valuenow={isIndeterminate ? undefined : Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? 'Progress'}
    >
      <div
        className="ds-progress-fill"
        style={isIndeterminate ? undefined : { width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
    </div>
  )
}

export function SkeletonCard({
  layout = 'wide',
  className = '',
}: {
  layout?: 'wide' | 'poster' | 'square'
  className?: string
}) {
  return (
    <div className={`ds-skeleton-card ds-skeleton-${layout} ${className}`} aria-hidden="true">
      <div className="ds-skeleton-thumb" />
      <div className="ds-skeleton-lines">
        <div className="ds-skeleton-line ds-skeleton-line-title" />
        <div className="ds-skeleton-line ds-skeleton-line-sub" />
      </div>
    </div>
  )
}

export function SkeletonRail({
  layout = 'wide',
  count = 6,
  className = '',
}: {
  layout?: 'wide' | 'poster' | 'square'
  count?: number
  className?: string
}) {
  return (
    <div className={`ds-skeleton-rail ${className}`} aria-hidden="true">
      <div className="ds-skeleton-header">
        <div className="ds-skeleton-line ds-skeleton-rail-title" />
      </div>
      <div className="ds-skeleton-track">
        {Array.from({ length: count }, (_, i) => (
          <SkeletonCard key={i} layout={layout} />
        ))}
      </div>
    </div>
  )
}

export type SaveStatusState = 'idle' | 'saving' | 'saved' | 'error'

export function SaveIndicator({
  status,
  onRetry,
  className = '',
}: {
  status: SaveStatusState
  onRetry?: () => void
  className?: string
}) {
  if (status === 'idle') return null
  return (
    <div className={`ds-save-indicator ds-save-${status} ${className}`} role="status">
      {status === 'saving' && (
        <>
          <span className="ds-btn-spinner" aria-hidden="true" />
          <span>Saving…</span>
        </>
      )}
      {status === 'saved' && (
        <>
          <Icon name="check" size={14} />
          <span>Saved</span>
        </>
      )}
      {status === 'error' && (
        <>
          <Icon name="warning" size={14} />
          <span>Save failed</span>
          {onRetry && (
            <button type="button" className="ds-save-retry-btn" onClick={onRetry}>
              Retry
            </button>
          )}
        </>
      )}
    </div>
  )
}

export function EmptyState({
  icon = 'info',
  title,
  description,
  action,
  className = '',
}: {
  icon?: IconName
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={`ds-empty-state ${className}`}>
      <div className="ds-empty-icon" aria-hidden="true">
        <Icon name={icon} size={36} />
      </div>
      <h3 className="ds-empty-title">{title}</h3>
      {description && <p className="ds-empty-desc">{description}</p>}
      {action && <div className="ds-empty-action">{action}</div>}
    </div>
  )
}
