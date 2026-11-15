import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Icon, type IconName } from '../Icon'
import './design-system.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'outline' | 'accent'
export type ButtonSize = 'small' | 'medium' | 'large'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: IconName
  iconRight?: IconName
  iconSize?: number
  loading?: boolean
  success?: boolean
  children?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'medium',
    icon,
    iconRight,
    iconSize = 18,
    loading = false,
    success = false,
    disabled = false,
    className = '',
    children,
    ...rest
  },
  ref,
) {
  const classes = [
    'ds-btn',
    `ds-btn-${variant}`,
    `ds-btn-${size}`,
    loading ? 'is-loading' : '',
    success ? 'is-success' : '',
    !children && (icon || iconRight) ? 'is-icon-only' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      ref={ref}
      type="button"
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span className="ds-btn-spinner" aria-hidden="true" />
      ) : success ? (
        <Icon name="check" size={iconSize} />
      ) : (
        icon && <Icon name={icon} size={iconSize} />
      )}
      {children && <span className="ds-btn-label">{children}</span>}
      {!loading && !success && iconRight && <Icon name={iconRight} size={iconSize} />}
    </button>
  )
})
