/**
 * OPDS Catalogue Browser Modal for Kinora.
 *
 * Browses open publication catalogues (Project Gutenberg, Standard Ebooks),
 * subsections, publication covers, and acquisition formats.
 *
 * Strictly adheres to the zero em-dash typography standard.
 */

import { useEffect, useState } from 'react'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { useToast } from './Toast'
import {
  fetchOpdsCatalogue,
  buildOpdsSearchUrl,
  type OpdsCatalogConfig,
  type OpdsEntry,
  type OpdsFeedResult,
} from '../lib/opds'
import { getOpdsCatalogs, saveOpdsCatalog } from '../state/opdsCatalogs'
import './OpdsCatalogModal.css'

export interface OpdsCatalogModalProps {
  open: boolean
  onClose: () => void
  initialCatalogUrl?: string
}

export function OpdsCatalogModal({ open, onClose, initialCatalogUrl }: OpdsCatalogModalProps) {
  if (!open) return null

  const toast = useToast()
  const [catalogs, setCatalogs] = useState<OpdsCatalogConfig[]>(() => getOpdsCatalogs())
  const [currentUrl, setCurrentUrl] = useState<string>(
    initialCatalogUrl || catalogs[0]?.url || 'https://standardebooks.org/opds/all',
  )
  const [history, setHistory] = useState<string[]>([])
  const [feedResult, setFeedResult] = useState<OpdsFeedResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [customUrlInput, setCustomUrlInput] = useState('')

  const loadFeed = async (url: string, pushHistory = true) => {
    setIsLoading(true)
    try {
      const res = await fetchOpdsCatalogue(url)
      if (pushHistory && currentUrl && currentUrl !== url) {
        setHistory((prev) => [...prev, currentUrl])
      }
      setCurrentUrl(url)
      setFeedResult(res)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not load OPDS catalogue.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      loadFeed(currentUrl, false)
    }
  }, [open])

  const handleBack = () => {
    if (history.length === 0) return
    const prevUrl = history[history.length - 1]
    if (prevUrl) {
      setHistory((prev) => prev.slice(0, -1))
      loadFeed(prevUrl, false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim() || !feedResult?.searchUrl) return
    const searchUrl = buildOpdsSearchUrl(feedResult.searchUrl, searchQuery)
    loadFeed(searchUrl)
  }

  const handleAddCustomCatalog = (e: React.FormEvent) => {
    e.preventDefault()
    if (!customUrlInput.trim()) return

    const newCat: OpdsCatalogConfig = {
      id: `opds-${Date.now()}`,
      name: `Custom Catalogue (${new URL(customUrlInput).hostname})`,
      url: customUrlInput.trim(),
    }
    saveOpdsCatalog(newCat)
    setCatalogs(getOpdsCatalogs())
    setCustomUrlInput('')
    loadFeed(newCat.url)
    toast('Added custom OPDS catalogue.')
  }

  const handleAcquisitionClick = (entry: OpdsEntry, href: string, type?: string) => {
    const isHtml = type?.includes('html') || href.endsWith('.html') || href.endsWith('.htm')
    if (isHtml) {
      window.open(href, '_blank', 'noopener,noreferrer')
      toast(`Opening web edition of ${entry.title}`)
    } else {
      // Direct link to EPUB/PDF
      const a = document.createElement('a')
      a.href = href
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.download = ''
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      toast(`Starting download for ${entry.title}`)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={feedResult?.title || 'OPDS Book Catalogue'}
      wide
      footer={
        <div className="opds-modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      }
    >
      <div className="opds-modal-container">
        {/* Catalog Switcher & Navigation Toolbar */}
        <div className="opds-toolbar">
          <div className="opds-catalog-selector">
            {history.length > 0 && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleBack}
                title="Go back"
              >
                <Icon name="chevronLeft" size={16} /> Back
              </button>
            )}

            <div className="opds-catalog-chips">
              {catalogs.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`opds-chip ${currentUrl === c.url ? 'active' : ''}`}
                  onClick={() => loadFeed(c.url)}
                >
                  <Icon name="book" size={12} />
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          </div>

          {feedResult?.searchUrl && (
            <form className="opds-search-form" onSubmit={handleSearch}>
              <Icon name="search" size={14} />
              <input
                className="opds-search-input"
                placeholder="Search catalog publications..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </form>
          )}
        </div>

        {/* Loading Indicator */}
        {isLoading && (
          <div className="opds-loading-bar">
            <span>Loading publications...</span>
          </div>
        )}

        {/* Subsections & Navigation Links */}
        {feedResult?.navigation && feedResult.navigation.length > 0 && (
          <div className="opds-subsections-strip">
            <span className="opds-strip-label">Sections:</span>
            {feedResult.navigation.map((nav, idx) => (
              <button
                key={idx}
                type="button"
                className="btn btn-ghost btn-sm opds-nav-btn"
                onClick={() => loadFeed(nav.href)}
              >
                {nav.title}
              </button>
            ))}
          </div>
        )}

        {/* Book Entries Grid */}
        <div className="opds-entries-grid">
          {feedResult?.entries && feedResult.entries.length > 0 ? (
            feedResult.entries.map((entry) => (
              <article key={entry.id} className="opds-book-card">
                <div className="opds-book-cover-wrap">
                  {entry.coverUrl ? (
                    <img src={entry.coverUrl} alt={entry.title} className="opds-book-cover" />
                  ) : (
                    <div className="opds-book-cover-placeholder">
                      <Icon name="book" size={32} />
                    </div>
                  )}
                </div>

                <div className="opds-book-info">
                  <h4 className="opds-book-title" title={entry.title}>
                    {entry.title}
                  </h4>
                  <span className="opds-book-authors">
                    {entry.authors.join(', ')}
                  </span>
                  {entry.summary && (
                    <p className="opds-book-summary">{entry.summary}</p>
                  )}

                  <div className="opds-book-actions">
                    {entry.acquisitionLinks.map((link, lIdx) => (
                      <button
                        key={lIdx}
                        type="button"
                        className="btn btn-ghost btn-sm opds-acq-btn"
                        onClick={() => handleAcquisitionClick(entry, link.href, link.type)}
                      >
                        <Icon name="download" size={12} />
                        <span>{link.title || 'Get Book'}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </article>
            ))
          ) : (
            !isLoading && (
              <p className="faint opds-empty-notice">
                No publications found in this catalogue subsection.
              </p>
            )
          )}
        </div>

        {/* Pagination Toolbar */}
        {(feedResult?.prevPageUrl || feedResult?.nextPageUrl) && (
          <div className="opds-pagination-bar">
            {feedResult.prevPageUrl && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => loadFeed(feedResult.prevPageUrl!)}
              >
                <Icon name="chevronLeft" size={14} /> Previous Page
              </button>
            )}
            {feedResult.nextPageUrl && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => loadFeed(feedResult.nextPageUrl!)}
              >
                Next Page <Icon name="chevronRight" size={14} />
              </button>
            )}
          </div>
        )}

        {/* Custom OPDS Feed Drawer */}
        <div className="opds-custom-drawer">
          <form className="opds-custom-form" onSubmit={handleAddCustomCatalog}>
            <label className="opds-custom-label">Add Custom OPDS Feed URL:</label>
            <div className="opds-custom-input-row">
              <input
                className="input opds-custom-input"
                placeholder="https://example.com/opds"
                value={customUrlInput}
                onChange={(e) => setCustomUrlInput(e.target.value)}
              />
              <button type="submit" className="btn btn-secondary btn-sm" disabled={!customUrlInput.trim()}>
                Load Feed
              </button>
            </div>
          </form>
        </div>
      </div>
    </Dialog>
  )
}
