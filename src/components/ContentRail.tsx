import type { ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon, type IconName } from './Icon'
import './ContentRail.css'

export interface ContentRailProps {
  id?: string
  title: string
  sub?: string
  icon?: IconName
  viewAll?: string
  layout?: 'poster' | 'wide' | 'tile'
  children: ReactNode
}

/**
 * Reusable horizontal content rail for Netflix-style discovery rows.
 * Features contained scrolling, mouse chevrons, and full arrow-key navigation
 * with finite boundaries (no endless wrapping) and auto-scroll tracking.
 */
export function ContentRail({
  id,
  title,
  sub,
  icon,
  viewAll,
  layout = 'poster',
  children,
}: ContentRailProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollState = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const atStart = el.scrollLeft <= 4
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 6
    setCanScrollLeft(!atStart)
    setCanScrollRight(!atEnd && el.scrollWidth > el.clientWidth)
  }, [])

  useEffect(() => {
    const el = trackRef.current
    if (!el) return

    updateScrollState()
    const onScroll = () => updateScrollState()
    el.addEventListener('scroll', onScroll, { passive: true })

    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => updateScrollState())
      observer.observe(el)
    }

    return () => {
      el.removeEventListener('scroll', onScroll)
      observer?.disconnect()
    }
  }, [updateScrollState])

  useEffect(() => {
    // Re-check scroll state when children update
    updateScrollState()
  }, [children, updateScrollState])

  const scrollByStep = (direction: -1 | 1) => {
    const el = trackRef.current
    if (!el) return
    const step = Math.max(300, Math.floor(el.clientWidth * 0.72))
    el.scrollBy({ left: direction * step, behavior: 'smooth' })
  }

  // Get all focusable card elements in this rail
  const getNavCards = (): HTMLElement[] => {
    if (!trackRef.current) return []
    const cards: HTMLElement[] = []
    const childrenList = Array.from(trackRef.current.children) as HTMLElement[]
    for (const child of childrenList) {
      if (child.matches('.card, .res-card, .resource-card, a, button')) {
        cards.push(child)
      } else {
        const inner = child.querySelector<HTMLElement>('.card, .res-card, .resource-card, a, button')
        if (inner) cards.push(inner)
      }
    }
    return cards
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Only intercept arrow keys and home/end when a card has focus
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
      return
    }

    const cards = getNavCards()
    if (cards.length === 0) return

    const active = document.activeElement as HTMLElement | null
    if (!active) return

    // Find the currently focused card or its containing card
    const currentIndex = cards.findIndex((c) => c === active || c.contains(active))
    if (currentIndex === -1) return

    if (e.key === 'ArrowRight') {
      e.preventDefault()
      e.stopPropagation()
      if (currentIndex < cards.length - 1) {
        const next = cards[currentIndex + 1]
        if (next) {
          next.focus()
          next.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
        }
      }
      // Finite end: stops at last card, does not wrap
      return
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      e.stopPropagation()
      if (currentIndex > 0) {
        const prev = cards[currentIndex - 1]
        if (prev) {
          prev.focus()
          prev.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
        }
      }
      // Finite start: stops at first card, does not wrap
      return
    }

    if (e.key === 'Home') {
      e.preventDefault()
      e.stopPropagation()
      const first = cards[0]
      if (first) {
        first.focus()
        first.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
      }
      return
    }

    if (e.key === 'End') {
      e.preventDefault()
      e.stopPropagation()
      const last = cards[cards.length - 1]
      if (last) {
        last.focus()
        last.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
      }
      return
    }

    if (e.key === 'ArrowDown') {
      // Find all content rail tracks on the page
      const rails = Array.from(document.querySelectorAll<HTMLElement>('.content-rail-track'))
      const currentRailIndex = trackRef.current ? rails.indexOf(trackRef.current) : -1
      if (currentRailIndex !== -1 && currentRailIndex < rails.length - 1) {
        const nextRail = rails[currentRailIndex + 1]
        if (nextRail) {
          const nextCards = Array.from(nextRail.querySelectorAll<HTMLElement>('.card, .res-card, .resource-card, a[href], button:not([tabindex="-1"])'))
          const firstNext = nextCards[0]
          if (firstNext) {
            e.preventDefault()
            e.stopPropagation()
            const curRect = active.getBoundingClientRect()
            const curCenter = curRect.left + curRect.width / 2
            let bestCard = firstNext
            let bestDiff = Math.abs((firstNext.getBoundingClientRect().left + firstNext.getBoundingClientRect().width / 2) - curCenter)
            for (const candidate of nextCards) {
              const r = candidate.getBoundingClientRect()
              const diff = Math.abs((r.left + r.width / 2) - curCenter)
              if (diff < bestDiff) {
                bestDiff = diff
                bestCard = candidate
              }
            }
            bestCard.focus()
            bestCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
          }
        }
      }
      return
    }

    if (e.key === 'ArrowUp') {
      const rails = Array.from(document.querySelectorAll<HTMLElement>('.content-rail-track'))
      const currentRailIndex = trackRef.current ? rails.indexOf(trackRef.current) : -1
      if (currentRailIndex > 0) {
        const prevRail = rails[currentRailIndex - 1]
        if (prevRail) {
          const prevCards = Array.from(prevRail.querySelectorAll<HTMLElement>('.card, .res-card, .resource-card, a[href], button:not([tabindex="-1"])'))
          const firstPrev = prevCards[0]
          if (firstPrev) {
            e.preventDefault()
            e.stopPropagation()
            const curRect = active.getBoundingClientRect()
            const curCenter = curRect.left + curRect.width / 2
            let bestCard = firstPrev
            let bestDiff = Math.abs((firstPrev.getBoundingClientRect().left + firstPrev.getBoundingClientRect().width / 2) - curCenter)
            for (const candidate of prevCards) {
              const r = candidate.getBoundingClientRect()
              const diff = Math.abs((r.left + r.width / 2) - curCenter)
              if (diff < bestDiff) {
                bestDiff = diff
                bestCard = candidate
              }
            }
            bestCard.focus()
            bestCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
          }
        }
      } else if (currentRailIndex === 0) {
        // At the top rail: move focus to hero action buttons if present
        const heroAction = document.querySelector<HTMLElement>('.hero-actions .btn, .hero-actions a')
        if (heroAction) {
          e.preventDefault()
          e.stopPropagation()
          heroAction.focus()
          heroAction.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }
      }
      return
    }
  }

  const headingId = id ? `rail-title-${id}` : undefined

  return (
    <section className="content-rail" aria-labelledby={headingId} data-rail-id={id}>
      <div className="content-rail-header">
        <div className="content-rail-titles">
          {icon && (
            <span className={`content-rail-icon is-${icon}`}>
              <Icon name={icon} size={icon === 'play' ? 11 : 18} />
            </span>
          )}
          <h2 id={headingId} className="content-rail-title">{title}</h2>
          {sub && <span className="content-rail-sub">{sub}</span>}
        </div>
        {viewAll && (
          <Link to={viewAll} className="content-rail-view-all">
            <span>See All</span>
            <Icon name="right" size={14} />
          </Link>
        )}
      </div>

      <div className={`content-rail-viewport${canScrollRight ? ' has-more-right' : ''}`}>
        <button
          type="button"
          className={`content-rail-control content-rail-control-prev${canScrollLeft ? ' is-active' : ''}`}
          aria-label={`Scroll ${title} left`}
          tabIndex={-1}
          onClick={() => scrollByStep(-1)}
        >
          <span className="content-rail-control-icon">
            <Icon name="left" size={20} />
          </span>
        </button>

        <div
          ref={trackRef}
          className={`content-rail-track ${layout === 'wide' ? 'is-wide' : layout === 'tile' ? 'is-tile' : 'is-poster'}`}
          role="region"
          aria-label={title}
          onKeyDown={handleKeyDown}
        >
          {children}
        </div>

        <button
          type="button"
          className={`content-rail-control content-rail-control-next${canScrollRight ? ' is-active' : ''}`}
          aria-label={`Scroll ${title} right`}
          tabIndex={-1}
          onClick={() => scrollByStep(1)}
        >
          <span className="content-rail-control-icon">
            <Icon name="right" size={20} />
          </span>
        </button>
      </div>
    </section>
  )
}
