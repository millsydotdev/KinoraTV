import { useState, useMemo, useEffect, useRef } from 'react'
import { Icon, type IconName } from './Icon'
import type { Bouquet } from '../lib/bouquetManager'
import './CategoryDrawer.css'

interface CategoryDrawerProps {
  open: boolean
  onClose: () => void
  groups: string[]
  activeGroup: string
  onSelectGroup: (group: string) => void
  categoryCounts: Map<string, number>
  onOpenManager: () => void
  bouquets?: Bouquet[]
}

function getCategoryIcon(g: string): IconName {
  const lower = g.toLowerCase()
  if (lower === 'all') return 'tv'
  if (lower === 'favourites') return 'heart'
  if (lower === 'recently watched') return 'history'
  if (lower === 'catch-up') return 'rotateCw'
  if (lower === 'reminders') return 'bell'
  if (lower.includes('sport')) return 'sports'
  if (lower.includes('movie') || lower.includes('cinema')) return 'film'
  if (lower.includes('news')) return 'news'
  if (lower.includes('doc')) return 'documentary'
  if (lower.includes('music')) return 'music'
  if (lower.includes('kid') || lower.includes('animation')) return 'sparkles'
  if (lower.includes('game') || lower.includes('gaming')) return 'gaming'
  if (lower.includes('edu')) return 'education'
  return 'tag'
}

export function CategoryDrawer({
  open,
  onClose,
  groups,
  activeGroup,
  onSelectGroup,
  categoryCounts,
  onOpenManager,
  bouquets = [],
}: CategoryDrawerProps) {
  const [filter, setFilter] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setFilter('')
    }
  }, [open])

  // Handle escape key
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  const filteredGroups = useMemo(() => {
    if (!filter.trim()) return groups
    const q = filter.toLowerCase()
    return groups.filter((g) => g.toLowerCase().includes(q))
  }, [groups, filter])

  if (!open) return null

  return (
    <div className="category-drawer-backdrop" onClick={onClose} role="presentation">
      <div
        className="category-drawer-panel"
        ref={drawerRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Channel Categories and Bouquets"
      >
        <div className="category-drawer-head">
          <div className="category-drawer-title">
            <Icon name="layoutSidebar" size={18} />
            <h2>Categories</h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close categories drawer"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="category-drawer-search">
          <Icon name="search" size={14} className="category-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="category-search-field"
            placeholder="Search categories..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {filter && (
            <button
              type="button"
              className="icon-btn-micro"
              onClick={() => setFilter('')}
              aria-label="Clear filter"
            >
              <Icon name="x" size={12} />
            </button>
          )}
        </div>

        <div className="category-drawer-content">
          {bouquets.length > 0 && !filter && (
            <div className="category-section">
              <span className="category-section-title">Custom Bouquets</span>
              <div className="category-items">
                {bouquets.map((b) => {
                  const isSelected = activeGroup === `bouquet:${b.id}`
                  return (
                    <button
                      key={b.id}
                      type="button"
                      className={`category-item-btn ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => {
                        onSelectGroup(`bouquet:${b.id}`)
                        onClose()
                      }}
                    >
                      <Icon name={(b.icon as IconName) || 'sparkles'} size={15} className="cat-icon" />
                      <span className="cat-name">{b.name}</span>
                      <span className="cat-count">{b.channelIds.length}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="category-section">
            {bouquets.length > 0 && !filter && (
              <span className="category-section-title">All Categories</span>
            )}
            <div className="category-items">
              {filteredGroups.map((g) => {
                const isSelected = activeGroup === g
                const count = categoryCounts.get(g)
                return (
                  <button
                    key={g}
                    type="button"
                    className={`category-item-btn ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => {
                      onSelectGroup(g)
                      onClose()
                    }}
                  >
                    <Icon name={getCategoryIcon(g)} size={15} className="cat-icon" />
                    <span className="cat-name">{g}</span>
                    {count !== undefined && count > 0 && (
                      <span className="cat-count">{count}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="category-drawer-footer">
          <button
            type="button"
            className="btn btn-secondary category-manage-btn"
            onClick={() => {
              onClose()
              onOpenManager()
            }}
          >
            <Icon name="edit" size={14} />
            <span>Manage Bouquets & Categories</span>
          </button>
        </div>
      </div>
    </div>
  )
}
