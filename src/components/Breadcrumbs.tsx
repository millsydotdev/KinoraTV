import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import './Breadcrumbs.css'

export interface BreadcrumbCrumb {
  label: string
  to?: string
}

export interface BreadcrumbsProps {
  crumbs: BreadcrumbCrumb[]
  className?: string
}

export function Breadcrumbs({ crumbs, className = '' }: BreadcrumbsProps) {
  if (!crumbs || crumbs.length <= 1) return null

  return (
    <nav aria-label="Breadcrumb" className={`breadcrumbs-nav ${className}`}>
      <ol style={{ display: 'flex', alignItems: 'center', gap: '8px', listStyle: 'none', margin: 0, padding: 0 }}>
        {crumbs.map((crumb, idx) => {
          const isLast = idx === crumbs.length - 1
          return (
            <li key={idx} className="breadcrumb-item">
              {idx > 0 && (
                <span className="breadcrumb-separator" aria-hidden="true">
                  <Icon name="right" size={12} />
                </span>
              )}
              {crumb.to && !isLast ? (
                <Link to={crumb.to} className="breadcrumb-link">
                  {crumb.label}
                </Link>
              ) : (
                <span className="breadcrumb-current" aria-current={isLast ? 'page' : undefined}>
                  {crumb.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
