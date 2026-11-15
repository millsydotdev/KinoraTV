import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import './design-system.css'

export type CardVariant = 'default' | 'surface' | 'interactive' | 'outline'
export type CardPadding = 'none' | 'small' | 'medium' | 'large'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
  padding?: CardPadding
  header?: ReactNode
  footer?: ReactNode
  children: ReactNode
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  {
    variant = 'default',
    padding = 'medium',
    header,
    footer,
    children,
    className = '',
    onClick,
    ...rest
  },
  ref,
) {
  const isClickable = Boolean(onClick) || variant === 'interactive'

  return (
    <div
      ref={ref}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick?.(e as unknown as React.MouseEvent<HTMLDivElement>)
              }
            }
          : undefined
      }
      className={`ds-card ds-card-${variant} ds-card-pad-${padding} ${isClickable ? 'is-clickable' : ''} ${className}`}
      {...rest}
    >
      {header && <div className="ds-card-header">{header}</div>}
      <div className="ds-card-body">{children}</div>
      {footer && <div className="ds-card-footer">{footer}</div>}
    </div>
  )
})
