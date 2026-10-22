import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Icon } from './Icon'

/** Native <dialog> gives focus trapping, Escape-to-close and inert background for free. */
export function Dialog({ open, onClose, title, children, footer, variant = 'dialog', wide = false, describedBy }: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  variant?: 'dialog' | 'sheet'
  wide?: boolean
  describedBy?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`${variant}${wide ? ' dialog-wide' : ''}`}
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      {open && (
        <>
          <div className="dialog-head">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="close" />
            </button>
          </div>
          <div className="dialog-body">{children}</div>
          {footer && <div className="dialog-foot">{footer}</div>}
        </>
      )}
    </dialog>
  )
}
