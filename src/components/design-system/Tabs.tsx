import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Icon, type IconName } from '../Icon'
import './design-system.css'

export interface TabItem {
  id: string
  label: ReactNode
  icon?: IconName
  count?: number | string
  disabled?: boolean
}

export type TabsVariant = 'line' | 'pills' | 'segmented'
export type TabsSize = 'small' | 'medium' | 'large'

export interface TabsProps {
  items: TabItem[]
  activeId: string
  onChange: (id: string) => void
  variant?: TabsVariant
  size?: TabsSize
  ariaLabel?: string
  className?: string
}

export function Tabs({
  items,
  activeId,
  onChange,
  variant = 'line',
  size = 'medium',
  ariaLabel = 'Navigation tabs',
  className = '',
}: TabsProps) {
  const tabListRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const currentItem = items[currentIndex]
    if (!currentItem) return
    const enabledTabs = items.filter((item) => !item.disabled)
    const currentEnabledIndex = enabledTabs.findIndex((item) => item.id === currentItem.id)
    if (currentEnabledIndex < 0 || enabledTabs.length === 0) return

    let nextIndex = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      nextIndex = (currentEnabledIndex + 1) % enabledTabs.length
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      nextIndex = (currentEnabledIndex - 1 + enabledTabs.length) % enabledTabs.length
    } else if (e.key === 'Home') {
      e.preventDefault()
      nextIndex = 0
    } else if (e.key === 'End') {
      e.preventDefault()
      nextIndex = enabledTabs.length - 1
    }

    if (nextIndex >= 0) {
      const targetItem = enabledTabs[nextIndex]
      if (!targetItem) return
      const targetId = targetItem.id
      onChange(targetId)
      const tabElements = tabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      const targetElement = Array.from(tabElements || []).find((el) => el.getAttribute('data-tab-id') === targetId)
      targetElement?.focus()
    }
  }

  return (
    <div
      ref={tabListRef}
      role="tablist"
      aria-label={ariaLabel}
      className={`ds-tabs ds-tabs-${variant} ds-tabs-${size} ${className}`}
    >
      {items.map((item, index) => {
        const isActive = item.id === activeId
        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            data-tab-id={item.id}
            id={`ds-tab-${item.id}`}
            aria-controls={`ds-tabpanel-${item.id}`}
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            disabled={item.disabled}
            onClick={() => !item.disabled && onChange(item.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={`ds-tab ${isActive ? 'is-active' : ''} ${item.disabled ? 'is-disabled' : ''}`}
          >
            {item.icon && <Icon name={item.icon} size={size === 'small' ? 14 : size === 'large' ? 18 : 16} />}
            <span className="ds-tab-label">{item.label}</span>
            {item.count !== undefined && item.count !== null && (
              <span className="ds-tab-count tnum">{item.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
