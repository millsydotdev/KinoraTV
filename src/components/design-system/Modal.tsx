import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Icon } from '../Icon'
import './design-system.css'

export type ModalSize = 'small' | 'medium' | 'large' | 'full'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: ReactNode
  description?: ReactNode
  size?: ModalSize
  children: ReactNode
  footer?: ReactNode
  hideCloseButton?: boolean
  className?: string
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  size = 'medium',
  children,
  footer,
  hideCloseButton = false,
  className = '',
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement
      document.body.style.overflow = 'hidden'
      // Focus modal container or first focusable element
      window.setTimeout(() => {
        const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        if (focusable && focusable.length > 0 && focusable[0]) {
          focusable[0].focus()
        } else {
          modalRef.current?.focus()
        }
      }, 50)
    } else {
      document.body.style.overflow = ''
      previousActiveElement.current?.focus()
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }

    if (e.key === 'Tab' && modalRef.current) {
      const focusable = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      )
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  if (!isOpen) return null

  return (
    <div className="ds-modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'ds-modal-title' : undefined}
        aria-describedby={description ? 'ds-modal-desc' : undefined}
        tabIndex={-1}
        className={`ds-modal-dialog ds-modal-${size} ${className}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {(title || !hideCloseButton) && (
          <div className="ds-modal-header">
            <div className="ds-modal-header-text">
              {title && (
                <h2 id="ds-modal-title" className="ds-modal-title">
                  {title}
                </h2>
              )}
              {description && (
                <p id="ds-modal-desc" className="ds-modal-description">
                  {description}
                </p>
              )}
            </div>
            {!hideCloseButton && (
              <button
                type="button"
                className="ds-modal-close-btn"
                aria-label="Close dialog"
                onClick={onClose}
              >
                <Icon name="close" size={18} />
              </button>
            )}
          </div>
        )}
        <div className="ds-modal-body">{children}</div>
        {footer && <div className="ds-modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
