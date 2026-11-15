import { useState, useEffect, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import './CollapsibleSection.css'

interface CollapsibleSectionProps {
  id: string
  title: ReactNode
  icon?: IconName
  badge?: string | number
  defaultOpen?: boolean
  persistKey?: string
  className?: string
  headerRight?: ReactNode
  children: ReactNode
}

export function CollapsibleSection({
  id,
  title,
  icon,
  badge,
  defaultOpen = true,
  persistKey,
  className = '',
  headerRight,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    if (persistKey && typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem(persistKey)
        if (saved !== null) {
          return Boolean(JSON.parse(saved))
        }
      } catch {
        // Fall back to default
      }
    }
    return defaultOpen
  })

  useEffect(() => {
    if (persistKey && typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(persistKey, JSON.stringify(isOpen))
      } catch {
        // Storage access may fail in restricted environments
      }
    }
  }, [isOpen, persistKey])

  const toggle = () => setIsOpen((prev) => !prev)

  return (
    <div className={`collapsible-section ${className}`.trim()} id={`collapsible-${id}`}>
      <button
        type="button"
        className="collapsible-trigger"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={`collapsible-content-${id}`}
      >
        <span className="collapsible-title-wrap">
          {icon && <Icon name={icon} size={16} />}
          <span className="collapsible-title">{title}</span>
          {badge !== undefined && badge !== null && (
            <span className="collapsible-badge">{badge}</span>
          )}
        </span>
        <span className="collapsible-trailing">
          {headerRight}
          <Icon
            name="down"
            size={14}
            className={`collapsible-chevron ${isOpen ? 'is-open' : ''}`}
          />
        </span>
      </button>

      <div
        id={`collapsible-content-${id}`}
        className={`collapsible-body-grid ${isOpen ? 'is-open' : ''}`}
        role="region"
        aria-label={typeof title === 'string' ? title : undefined}
      >
        <div className="collapsible-body-content">{children}</div>
      </div>
    </div>
  )
}
