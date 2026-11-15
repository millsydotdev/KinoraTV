import { useId, useState, type ReactNode } from 'react'
import './design-system.css'

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right'

export interface TooltipProps {
  content: ReactNode
  position?: TooltipPosition
  children: ReactNode
  className?: string
  disabled?: boolean
}

export function Tooltip({
  content,
  position = 'top',
  children,
  className = '',
  disabled = false,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const tooltipId = useId()

  if (disabled || !content) {
    return <>{children}</>
  }

  return (
    <div
      className={`ds-tooltip-wrapper ${className}`}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocusCapture={() => setIsVisible(true)}
      onBlurCapture={() => setIsVisible(false)}
    >
      <div aria-describedby={isVisible ? tooltipId : undefined} className="ds-tooltip-trigger">
        {children}
      </div>
      {isVisible && (
        <div
          id={tooltipId}
          role="tooltip"
          className={`ds-tooltip ds-tooltip-${position}`}
        >
          {content}
        </div>
      )}
    </div>
  )
}
