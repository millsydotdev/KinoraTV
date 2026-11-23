import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from './Icon'
import { useStore } from '../state/store'
import { movies, series } from '../data/catalog'
import {
  executeMatrixSearch,
  type MatrixItem,
  type MatrixMediaType,
} from '../lib/globalSearchMatrix'
import './QuickSearchModal.css'

export interface QuickSearchModalProps {
  open: boolean
  onClose: () => void
  initialQuery?: string
}

type CategoryFilter = 'all' | 'channel' | 'film' | 'series' | 'resource'

const CATEGORY_TABS: { id: CategoryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'channel', label: 'Live TV' },
  { id: 'film', label: 'Movies' },
  { id: 'series', label: 'Series' },
  { id: 'resource', label: 'Audio & Media' },
]

function HighlightMatchedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

export function QuickSearchModal({ open, onClose, initialQuery = '' }: QuickSearchModalProps) {
  const navigate = useNavigate()
  const store = useStore()
  const [query, setQuery] = useState(initialQuery)
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Build matrix searchable items
  const matrixItems = useMemo<MatrixItem[]>(() => {
    const list: MatrixItem[] = []

    // 1. Live channels
    for (const c of store.channels) {
      list.push({
        id: `ch-${c.id}`,
        ref: `channel:${c.id}`,
        title: c.name,
        cleanTitle: c.name,
        mediaType: 'channel',
        genres: c.categories || [c.group || 'General'],
        to: `/live?channel=${encodeURIComponent(c.id)}`,
        subText: `Channel ${c.number || ''} (${c.categories?.[0] || c.group || 'Live TV'})`,
        badgeText: 'Live TV',
      })
    }

    // 2. Movies catalog
    for (const m of movies) {
      list.push({
        id: `movie-${m.id}`,
        ref: `movie:${m.id}`,
        title: m.title,
        cleanTitle: m.title,
        mediaType: 'film',
        genres: m.genres || [],
        year: m.year,
        to: `/movies?movie=${encodeURIComponent(m.id)}`,
        subText: `${m.year} · ${m.genres?.slice(0, 2).join(', ') || 'Movie'}`,
        badgeText: 'Movie',
      })
    }

    // 3. Series catalog
    for (const s of series) {
      list.push({
        id: `series-${s.id}`,
        ref: `series:${s.id}`,
        title: s.title,
        cleanTitle: s.title,
        mediaType: 'series',
        genres: s.genres || [],
        to: `/series?series=${encodeURIComponent(s.id)}`,
        subText: `${s.seasons?.length || 1} Seasons · ${s.genres?.slice(0, 2).join(', ') || 'Series'}`,
        badgeText: 'Series',
      })
    }

    const movieCats = new Map(
      (store.xtreamCatalogue?.vodCategories || []).map((c) => [c.id, String(c.name)]),
    )
    const seriesCats = new Map(
      (store.xtreamCatalogue?.seriesCategories || []).map((c) => [c.id, String(c.name)]),
    )

    // 4. Xtream Movies
    for (const xm of store.xtreamCatalogue?.movies || []) {
      const catName = xm.categoryId ? movieCats.get(xm.categoryId) : undefined
      list.push({
        id: `xm-${xm.id}`,
        ref: `movie:xt:${xm.sourceId}:${xm.id}`,
        title: xm.name,
        cleanTitle: xm.name,
        mediaType: 'film',
        genres: catName ? [catName] : [],
        year: xm.year || undefined,
        to: `/watch/movie:xt:${encodeURIComponent(xm.sourceId)}:${encodeURIComponent(xm.id)}`,
        subText: `${xm.year || ''} · ${catName || 'VOD'}`,
        badgeText: 'VOD',
      })
    }

    // 5. Xtream Series
    for (const xs of store.xtreamCatalogue?.series || []) {
      const catName = xs.categoryId ? seriesCats.get(xs.categoryId) : undefined
      list.push({
        id: `xs-${xs.id}`,
        ref: `series:xt:${xs.sourceId}:${xs.id}`,
        title: xs.name,
        cleanTitle: xs.name,
        mediaType: 'series',
        genres: catName ? [catName] : [],
        year: xs.year || undefined,
        to: `/series?series=xt:${encodeURIComponent(xs.sourceId)}:${encodeURIComponent(xs.id)}`,
        subText: `${xs.year || ''} · ${catName || 'Series'}`,
        badgeText: 'Series',
      })
    }

    return list
  }, [store.channels, store.xtreamCatalogue])

  // Filtered results
  const searchResults = useMemo(() => {
    const q = query.trim()
    const options = {
      query: q,
      mediaType: (category === 'all' ? 'all' : category) as MatrixMediaType | 'all',
      limitPerGroup: 25,
    }
    const results = executeMatrixSearch(matrixItems, options)
    const combined: MatrixItem[] = []
    if (category === 'all' || category === 'channel') combined.push(...results.channels)
    if (category === 'all' || category === 'film') combined.push(...results.films)
    if (category === 'all' || category === 'series') combined.push(...results.series)
    if (category === 'all' || category === 'resource') combined.push(...results.resources)
    return combined.slice(0, 20)
  }, [matrixItems, query, category])

  useEffect(() => {
    if (open) {
      setQuery(initialQuery)
      setSelectedIndex(0)
      window.setTimeout(() => inputRef.current?.focus(), 60)
    }
  }, [open, initialQuery])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query, category])

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return
    const activeEl = listRef.current.querySelector('.quick-search-item.is-selected') as HTMLElement
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  if (!open) return null

  const handleSelect = (item: MatrixItem) => {
    onClose()
    navigate(item.to)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : Math.max(0, searchResults.length - 1)))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const selected = searchResults[selectedIndex]
      if (selected) {
        handleSelect(selected)
      } else if (query.trim()) {
        onClose()
        navigate(`/search?q=${encodeURIComponent(query.trim())}`)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div
      className="quick-search-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Quick Search"
    >
      <div className="quick-search-modal">
        <header className="quick-search-header">
          <div className="quick-search-input-row">
            <Icon name="search" size={18} className="quick-search-input-icon" />
            <input
              ref={inputRef}
              type="search"
              className="quick-search-input"
              placeholder="Quick search titles, channels, genres..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete="off"
              spellCheck={false}
              aria-label="Quick search query input"
            />
            {query && (
              <button
                type="button"
                className="quick-search-clear-btn"
                onClick={() => {
                  setQuery('')
                  inputRef.current?.focus()
                }}
                aria-label="Clear query"
              >
                <Icon name="close" size={16} />
              </button>
            )}
          </div>

          <div className="quick-search-category-pills" role="tablist" aria-label="Search category filters">
            {CATEGORY_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={category === tab.id}
                className={`quick-search-pill ${category === tab.id ? 'is-active' : ''}`}
                onClick={() => setCategory(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </header>

        <div className="quick-search-body">
          {searchResults.length > 0 ? (
            <ul ref={listRef} className="quick-search-results-list" role="listbox">
              {searchResults.map((item, idx) => {
                const isSelected = idx === selectedIndex
                return (
                  <li
                    key={item.id}
                    role="option"
                    aria-selected={isSelected}
                    className={`quick-search-item ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <div className="quick-search-item-info">
                      <span className="quick-search-item-title">
                        <HighlightMatchedText text={item.title} query={query.trim()} />
                      </span>
                      <span className="quick-search-item-sub">{item.subText}</span>
                    </div>
                    {item.badgeText && (
                      <span className="quick-search-item-badge">{item.badgeText}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="quick-search-empty">
              {query.trim()
                ? `No matches found for "${query.trim()}". Press Enter for deep search.`
                : 'Type to search channels, movies, series, and media resources.'}
            </div>
          )}
        </div>

        <footer className="quick-search-footer">
          <div className="quick-search-shortcuts">
            <span className="quick-search-shortcut">
              <kbd className="quick-search-kbd">↑</kbd>
              <kbd className="quick-search-kbd">↓</kbd> Navigate
            </span>
            <span className="quick-search-shortcut">
              <kbd className="quick-search-kbd">↵</kbd> Select
            </span>
            <span className="quick-search-shortcut">
              <kbd className="quick-search-kbd">Esc</kbd> Close
            </span>
          </div>
          <span>Kinora Quick Search</span>
        </footer>
      </div>
    </div>
  )
}
