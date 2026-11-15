import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from 'react'
import { Icon } from '../Icon'
import './design-system.css'

export type SelectSize = 'small' | 'medium' | 'large'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string
  error?: string
  helperText?: string
  size?: SelectSize
  options: SelectOption[]
  placeholder?: string
  children?: ReactNode
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    label,
    error,
    helperText,
    size = 'medium',
    options,
    placeholder,
    className = '',
    id: externalId,
    disabled = false,
    value,
    ...rest
  },
  ref,
) {
  const generatedId = useId()
  const selectId = externalId || `select-${generatedId}`
  const errorId = `${selectId}-error`
  const helperId = `${selectId}-helper`

  return (
    <div className={`ds-field-wrapper ds-field-${size} ${error ? 'has-error' : ''} ${disabled ? 'is-disabled' : ''} ${className}`}>
      {label && (
        <label htmlFor={selectId} className="ds-field-label">
          {label}
        </label>
      )}
      <div className="ds-select-container">
        <select
          ref={ref}
          id={selectId}
          disabled={disabled}
          value={value}
          aria-invalid={Boolean(error)}
          aria-describedby={[error ? errorId : null, helperText ? helperId : null].filter(Boolean).join(' ') || undefined}
          className="ds-select"
          {...rest}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        <Icon name="down" size={14} className="ds-select-arrow" aria-hidden="true" />
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
