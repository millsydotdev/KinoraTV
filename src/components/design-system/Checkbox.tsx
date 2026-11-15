import { forwardRef, useEffect, useId, useRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { Icon } from '../Icon'
import './design-system.css'

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode
  description?: ReactNode
  indeterminate?: boolean
  error?: string
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  {
    label,
    description,
    indeterminate = false,
    checked = false,
    error,
    disabled = false,
    className = '',
    id: externalId,
    onChange,
    ...rest
  },
  ref,
) {
  const generatedId = useId()
  const checkboxId = externalId || `chk-${generatedId}`
  const innerRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = (ref && 'current' in ref ? ref.current : null) || innerRef.current
    if (el) {
      el.indeterminate = indeterminate
    }
  }, [indeterminate, ref])

  return (
    <div className={`ds-checkbox-wrapper ${disabled ? 'is-disabled' : ''} ${error ? 'has-error' : ''} ${className}`}>
      <label htmlFor={checkboxId} className="ds-checkbox-label">
        <span className="ds-checkbox-input-container">
          <input
            ref={(node) => {
              if (typeof ref === 'function') ref(node)
              else if (ref) (ref as { current: HTMLInputElement | null }).current = node
              ;(innerRef as { current: HTMLInputElement | null }).current = node
            }}
            id={checkboxId}
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={onChange}
            className="ds-checkbox-input"
            aria-invalid={Boolean(error)}
            {...rest}
          />
          <span className={`ds-checkbox-box ${checked ? 'is-checked' : ''} ${indeterminate ? 'is-indeterminate' : ''}`}>
            {checked && !indeterminate && <Icon name="check" size={12} className="ds-checkbox-icon" />}
            {indeterminate && <span className="ds-checkbox-dash" aria-hidden="true" />}
          </span>
        </span>
        {(label || description) && (
          <span className="ds-checkbox-content">
            {label && <span className="ds-checkbox-title">{label}</span>}
            {description && <span className="ds-checkbox-desc">{description}</span>}
          </span>
        )}
      </label>
      {error && (
        <p className="ds-field-message ds-field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
})
