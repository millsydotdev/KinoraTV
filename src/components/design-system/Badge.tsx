import type { ReactNode } from 'react'
import { Icon, type IconName } from '../Icon'
import './design-system.css'

export type BadgeTone = 'emerald' | 'amber' | 'crimson' | 'slate' | 'accent' | 'blue'

export interface BadgeProps {
  tone?: BadgeTone
  variant?: 'pill' | 'dot' | 'tag'
  icon?: IconName
  children?: ReactNode
  className?: string
  title?: string
}

export function Badge({
  tone = 'slate',
  variant = 'pill',
  icon,
  children,
  className = '',
  title,
}: BadgeProps) {
  return (
    <span className={`ds-badge ds-badge-${tone} ds-badge-${variant} ${className}`} title={title}>
      {variant === 'dot' && <span className="ds-badge-dot-indicator" aria-hidden="true" />}
      {icon && <Icon name={icon} size={13} className="ds-badge-icon" />}
      {children && <span className="ds-badge-text">{children}</span>}
    </span>
  )
}
