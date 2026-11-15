import { useEffect, useRef, type ReactNode } from 'react'
import { Icon, type IconName } from '../Icon'
import './ContextMenu.css'

export interface ContextMenuItem {
  id: string
  label: string
  icon?: IconName
  shortcut?: string
  destructive?: boolean
  disabled?: boolean
  run: () => void
}

export function ContextMenu({
  open,
  x,
  y,
  items,
  onClose,
  header,
}: {
  open: boolean
  x: number
  y: number
  items: (ContextMenuItem | 'separator')[]
  onClose: () => void
  header?: ReactNode
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  // Ensure menu stays within viewport
  const viewportW = window.innerWidth
  const viewportH = window.innerHeight
  const adjustedX = Math.min(x, viewportW - 220)
  const adjustedY = Math.min(y, viewportH - 300)

  return (
    <div
      ref={menuRef}
      className="ds-context-menu"
      style={{ left: `${adjustedX}px`, top: `${adjustedY}px` }}
      role="menu"
      aria-label="Context Menu"
    >
      {header && <div className="ds-context-header">{header}</div>}
      <div className="ds-context-list">
        {items.map((item, idx) => {
          if (item === 'separator') {
            return <div key={`sep-${idx}`} className="ds-context-sep" role="separator" />
          }
          return (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={`ds-context-item ${item.destructive ? 'is-destructive' : ''}`}
              onClick={() => {
                item.run()
                onClose()
              }}
            >
              {item.icon && <Icon name={item.icon} size={16} className="ds-context-icon" />}
              <span className="ds-context-label">{item.label}</span>
              {item.shortcut && <span className="ds-context-shortcut">{item.shortcut}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
