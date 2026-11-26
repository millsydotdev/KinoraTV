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

type CategoryFilter = 'all' | 'on-now' | 'channel' | 'film' | 'series' | 'actions'

interface QuickActionEntry {
  id: string
  title: string
  subText: string
  badgeText: string
  actionLabel: string
  keywords: string[]
  run: () => void
}

const CATEGORY_TABS: { id: CategoryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'on-now', label: 'On Now' },
  { id: 'channel', label: 'Live TV' },
  { id: 'film', label: 'Movies' },
  { id: 'series', label: 'Series' },
  { id: 'actions', label: 'Actions' },
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

  // Build matrix searchable items (channels, live On Now EPG, movies, series, VOD/server media)
  const matrixItems = useMemo<MatrixItem[]>(() => {
    const list: MatrixItem[] = []
    const now = Date.now()

    // 1. Live channels + currently airing EPG programmes ("On Now")
    for (const c of store.channels) {
      const currentProg = store.programmeAt(c, now)
      list.push({
        id: `ch-${c.id}`,
        ref: `channel:${c.id}`,
        title: c.name,
        cleanTitle: c.name,
        mediaType: 'channel',
        genres: c.categories || [c.group || 'General'],
        to: `/live?channel=${encodeURIComponent(c.id)}`,
        subText: currentProg
          ? `Ch ${c.number || ''} · On Now: ${currentProg.title}`
          : `Channel ${c.number || ''} (${c.categories?.[0] || c.group || 'Live TV'})`,
        badgeText: 'Live TV',
        rawItem: { playTo: `/watch/channel:${encodeURIComponent(c.id)}`, actionLabel: 'Tune' },
      })

      if (currentProg && currentProg.title) {
        const minsLeft = Math.max(1, Math.round((currentProg.stop - now) / 60_000))
        list.push({
          id: `epg-now-${c.id}`,
          ref: `channel:${c.id}`,
          title: currentProg.title,
          cleanTitle: currentProg.title,
          mediaType: 'episode',
          genres: currentProg.category ? [currentProg.category] : [],
          to: `/watch/channel:${encodeURIComponent(c.id)}`,
          subText: `${c.name}${c.number ? ` (Ch ${c.number})` : ''} · ${minsLeft}m left`,
          badgeText: 'On Now',
          rawItem: { playTo: `/watch/channel:${encodeURIComponent(c.id)}`, actionLabel: 'Tune Now' },
        })
      }
    }

    // 2. Movies catalog
    for (const m of movies) {
      const hasProgress = Boolean(store.library.progress[`movie:${m.id}`])
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
        badgeText: hasProgress ? 'Resume' : 'Movie',
        rawItem: { playTo: `/watch/movie:${encodeURIComponent(m.id)}`, actionLabel: hasProgress ? 'Resume' : 'Watch' },
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

    // 4. Xtream / Server Movies & Local Media
    for (const xm of store.xtreamCatalogue?.movies || []) {
      const catName = xm.categoryId ? movieCats.get(xm.categoryId) : undefined
      const watchPath = `/watch/movie:xt:${encodeURIComponent(xm.sourceId)}:${encodeURIComponent(xm.id)}`
      list.push({
        id: `xm-${xm.id}`,
        ref: `movie:xt:${xm.sourceId}:${xm.id}`,
        title: xm.name,
        cleanTitle: xm.name,
        mediaType: 'film',
        genres: catName ? [catName] : [],
        year: xm.year || undefined,
        to: watchPath,
        subText: `${xm.year || ''} · ${catName || 'VOD'}`,
        badgeText: xm.sourceId === 'server' ? 'Server' : 'VOD',
        rawItem: { playTo: watchPath, actionLabel: 'Play' },
      })
    }

    // 5. Xtream / Server Series
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
  }, [store.channels, store.xtreamCatalogue, store.library.progress, store.programmeAt])

  const quickActions = useMemo<QuickActionEntry[]>(() => [
    {
      id: 'act-live',
      title: 'Live TV Guide',
      subText: 'Jump to the full interactive programme guide',
      badgeText: 'Action',
      actionLabel: 'Open',
      keywords: ['live', 'guide', 'epg', 'tv', 'channels'],
      run: () => navigate('/live'),
    },
    {
      id: 'act-library',
      title: 'Continue Watching & Library',
      subText: 'Resume titles, favourites, watchlist, and collections',
      badgeText: 'Action',
      actionLabel: 'Open',
      keywords: ['library', 'continue', 'resume', 'watchlist', 'favourites', 'favorites'],
      run: () => navigate('/library'),
    },
    {
      id: 'act-tv-mode',
      title: store.prefs.viewMode === 'tv' ? 'Switch to Desktop Layout' : 'Switch to TV 10ft Mode',
      subText: 'Toggle living-room remote-first focus layout',
      badgeText: 'Action',
      actionLabel: 'Toggle',
      keywords: ['tv', 'mode', '10ft', 'layout', 'couch', 'remote'],
      run: () => {
        const nextMode = store.prefs.viewMode === 'tv' ? 'desktop' : 'tv'
        store.setPref('viewMode', nextMode)
        store.setPref('layoutMode', nextMode === 'tv' ? 'tv' : 'standard')
      },
    },
    {
      id: 'act-theme',
      title: store.prefs.theme === 'light' ? 'Switch to Dark Theme' : 'Switch to Light Theme',
      subText: 'Toggle between Kinora Dark and Light themes',
      badgeText: 'Action',
      actionLabel: 'Toggle',
      keywords: ['theme', 'dark', 'light', 'appearance'],
      run: () => store.setPref('theme', store.prefs.theme === 'light' ? 'dark' : 'light'),
    },
    {
      id: 'act-sources',
      title: 'Manage Sources & Discovery',
      subText: 'Import playlists, XMLTV guides, and browse public catalogues',
      badgeText: 'Action',
      actionLabel: 'Open',
      keywords: ['sources', 'playlist', 'm3u', 'xtream', 'discovery', 'import'],
      run: () => navigate('/sources'),
    },
    {
      id: 'act-settings',
      title: 'Settings & Server Sync',
      subText: 'Playback, server mode, mobile remote pairing, and profiles',
      badgeText: 'Action',
      actionLabel: 'Open',
      keywords: ['settings', 'preferences', 'server', 'remote', 'pair', 'sync'],
      run: () => navigate('/settings'),
    },
  ], [navigate, store])

  // Filtered results
  const searchResults = useMemo(() => {
    const q = query.trim()
    const qLower = q.toLowerCase()

    const matchedActions: MatrixItem[] = quickActions
      .filter((a) => !qLower || a.title.toLowerCase().includes(qLower) || a.keywords.some((k) => k.includes(qLower)))
      .map((a) => ({
        id: a.id,
        ref: a.id,
        title: a.title,
        cleanTitle: a.title,
        mediaType: 'resource' as MatrixMediaType,
        genres: [],
        to: '',
        subText: a.subText,
        badgeText: a.badgeText,
        rawItem: { runAction: a.run, actionLabel: a.actionLabel },
      }))

    if (category === 'actions') {
      return matchedActions.slice(0, 20)
    }

    const matrixMediaFilter: MatrixMediaType | 'all' =
      category === 'on-now' ? 'episode' : category === 'all' ? 'all' : category
    const results = executeMatrixSearch(matrixItems, {
      query: q,
      mediaType: matrixMediaFilter,
      limitPerGroup: 25,
    })

    const combined: MatrixItem[] = []
    if (category === 'all') {
      if (qLower) {
        combined.push(...results.episodes.slice(0, 5))
        combined.push(...results.channels.slice(0, 6))
        combined.push(...results.films.slice(0, 6))
        combined.push(...results.series.slice(0, 5))
        combined.push(...matchedActions.slice(0, 3))
      } else {
        // Default quick-switch view: On Now live shows + quick actions + top channels/movies
        combined.push(...results.episodes.slice(0, 5))
        combined.push(...matchedActions.slice(0, 4))
        combined.push(...results.channels.slice(0, 5))
        combined.push(...results.films.slice(0, 6))
      }
    } else if (category === 'on-now') {
      combined.push(...results.episodes)
    } else if (category === 'channel') {
      combined.push(...results.channels)
    } else if (category === 'film') {
      combined.push(...results.films)
    } else if (category === 'series') {
      combined.push(...results.series)
    }
    return combined.slice(0, 20)
  }, [matrixItems, quickActions, query, category])

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
    if (item.rawItem?.runAction) {
      item.rawItem.runAction()
      return
    }
    if (item.to) {
      navigate(item.to)
    }
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
                    <div className="quick-search-item-right">
                      {item.rawItem?.playTo && (
                        <button
                          type="button"
                          className="quick-search-action-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            onClose()
                            navigate(item.rawItem.playTo)
                          }}
                        >
                          {item.rawItem.actionLabel || 'Play'}
                        </button>
                      )}
                      {item.badgeText && (
                        <span className={`quick-search-item-badge ${item.badgeText === 'On Now' ? 'is-live' : ''}`}>
                          {item.badgeText}
                        </span>
                      )}
                    </div>
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
