import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { Icon, type IconName } from '../Icon'
import './design-system.css'

export type InputSize = 'small' | 'medium' | 'large'

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  error?: string
  helperText?: string
  size?: InputSize
  startIcon?: IconName
  endIcon?: IconName
  clearable?: boolean
  onClear?: () => void
  startAdornment?: ReactNode
  endAdornment?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    error,
    helperText,
    size = 'medium',
    startIcon,
    endIcon,
    clearable = false,
    onClear,
    startAdornment,
    endAdornment,
    className = '',
    id: externalId,
    disabled = false,
    type = 'text',
    value,
    ...rest
  },
  ref,
) {
  const generatedId = useId()
  const inputId = externalId || `input-${generatedId}`
  const errorId = `${inputId}-error`
  const helperId = `${inputId}-helper`
  const [showPassword, setShowPassword] = useState(false)

  const isPassword = type === 'password'
  const effectiveType = isPassword ? (showPassword ? 'text' : 'password') : type
  const hasValue = value !== undefined && value !== null && String(value).length > 0

  return (
    <div className={`ds-field-wrapper ds-field-${size} ${error ? 'has-error' : ''} ${disabled ? 'is-disabled' : ''} ${className}`}>
      {label && (
        <label htmlFor={inputId} className="ds-field-label">
          {label}
        </label>
      )}
      <div className="ds-input-container">
        {startIcon && <Icon name={startIcon} size={size === 'small' ? 14 : size === 'large' ? 18 : 16} className="ds-input-icon ds-input-start-icon" />}
        {startAdornment && <span className="ds-input-adornment ds-input-adornment-start">{startAdornment}</span>}
        <input
          ref={ref}
          id={inputId}
          type={effectiveType}
          disabled={disabled}
          value={value}
          aria-invalid={Boolean(error)}
          aria-describedby={[error ? errorId : null, helperText ? helperId : null].filter(Boolean).join(' ') || undefined}
          className="ds-input"
          {...rest}
        />
        {clearable && hasValue && !disabled && (
          <button
            type="button"
            className="ds-input-btn"
            aria-label="Clear input"
            onClick={(e) => {
              e.preventDefault()
              onClear?.()
            }}
          >
            <Icon name="close" size={14} />
          </button>
        )}
        {isPassword && !disabled && (
          <button
            type="button"
            className="ds-input-btn"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            onClick={() => setShowPassword(!showPassword)}
          >
            <Icon name={showPassword ? 'close' : 'info'} size={14} />
          </button>
        )}
        {endIcon && !clearable && !isPassword && (
          <Icon name={endIcon} size={size === 'small' ? 14 : size === 'large' ? 18 : 16} className="ds-input-icon ds-input-end-icon" />
        )}
        {endAdornment && <span className="ds-input-adornment ds-input-adornment-end">{endAdornment}</span>}
      </div>
      {error && (
        <p id={errorId} className="ds-field-message ds-field-error" role="alert">
          {error}
        </p>
      )}
      {!error && helperText && (
        <p id={helperId} className="ds-field-message ds-field-helper">
          {helperText}
        </p>
      )}
    </div>
  )
})
