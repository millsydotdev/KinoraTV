import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { useToast } from './Toast'
import { useProfiles } from '../state/profiles'
import { PdfCanvasViewer } from './PdfCanvasViewer'
import {
  loadAllBookProgress,
  parseLocalBookFile,
  saveBookProgress,
  type BookBookmark,
  type BookChapter,
  type ParsedBook,
} from '../lib/bookParser'
import './BookReaderModal.css'

export interface BookReaderModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  author?: string
  sourceName?: string
  chapters?: BookChapter[]
  initialBook?: ParsedBook | null
}

const SAMPLE_TYPOGRAPHY_CHAPTERS: BookChapter[] = [
  {
    title: 'Sample Chapter: Typography & Reader Preview',
    subtitle: 'Explicitly labelled sample text for testing Kinora reader themes and font scaling',
    content: [
      'This is an explicit reader typography sample. Open any local EPUB, PDF, plain text, Markdown, or HTML file using the Open Local Book button above to read your own books with saved reading progress and bookmarks.',
      'Use the Appearance toolbar to switch between Cinema Dark, Warm Sepia, Night Black, and Paper Light themes, adjust font family and size, or use Left and Right arrow keys to move between chapters.',
    ],
  },
]

type ReaderTheme = 'dark' | 'sepia' | 'black' | 'light'
type ReaderFont = 'serif' | 'sans' | 'mono'

export function BookReaderModal({
  isOpen,
  onClose,
  title,
  author = 'Digital Library',
  sourceName = 'Kinora Reader',
  chapters,
  initialBook = null,
}: BookReaderModalProps) {
  const toast = useToast()
  const { activeProfile } = useProfiles()
  const profileId = activeProfile?.id ?? 'default'
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loadedBook, setLoadedBook] = useState<ParsedBook | null>(initialBook)
  const [useSamplePreview, setUseSamplePreview] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadingFile, setLoadingFile] = useState(false)

  const [currentPage, setCurrentPage] = useState(0)
  const [bookmarks, setBookmarks] = useState<BookBookmark[]>([])
  const [theme, setTheme] = useState<ReaderTheme>('dark')
  const [fontFamily, setFontFamily] = useState<ReaderFont>('serif')
  const [fontSize, setFontSize] = useState<number>(18)
  const [lineHeight, setLineHeight] = useState<number>(1.75)
  const [showSettings, setShowSettings] = useState(false)
  const [showToc, setShowToc] = useState(false)

  useEffect(() => {
    setLoadedBook(initialBook)
    setUseSamplePreview(false)
    setLoadError(null)
  }, [initialBook, isOpen])

  // Clean up PDF object URLs when unmounting or swapping books
  useEffect(() => {
    const url = loadedBook?.pdfBlobUrl
    return () => {
      if (url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(url)
      }
    }
  }, [loadedBook?.pdfBlobUrl])

  const effectiveTitle = loadedBook?.title ?? title
  const effectiveAuthor = loadedBook?.author ?? author
  const effectiveChapters: BookChapter[] =
    loadedBook?.chapters ??
    (chapters && chapters.length > 0 ? chapters : useSamplePreview ? SAMPLE_TYPOGRAPHY_CHAPTERS : [])

  const bookKey = loadedBook?.id ?? `book:${effectiveTitle.toLowerCase().trim()}`
  const totalPages = Math.max(1, effectiveChapters.length)
  const activeChapter = effectiveChapters[currentPage] ?? effectiveChapters[0] ?? null
  const isPdfMode = loadedBook?.format === 'pdf' && Boolean(loadedBook.pdfBytes || loadedBook.pdfBlobUrl)

  // Restore saved reading progress & bookmarks on open
  useEffect(() => {
    if (!isOpen) return
    const all = loadAllBookProgress(profileId)
    const saved = all[bookKey]
    if (saved) {
      const clamped = Math.max(0, Math.min(saved.chapterIndex, Math.max(0, effectiveChapters.length - 1)))
      setCurrentPage(clamped)
      setBookmarks(Array.isArray(saved.bookmarks) ? saved.bookmarks : [])
    } else {
      setCurrentPage(0)
      setBookmarks([])
    }
  }, [isOpen, bookKey, profileId, effectiveChapters.length])

  // Persist reading progress automatically whenever chapter changes
  useEffect(() => {
    if (!isOpen || effectiveChapters.length === 0 || useSamplePreview) return
    const percent = Math.round(((currentPage + 1) / totalPages) * 100)
    saveBookProgress(
      {
        bookKey,
        title: effectiveTitle,
        author: effectiveAuthor,
        format: loadedBook?.format ?? 'text',
        chapterIndex: currentPage,
        totalChapters: totalPages,
        percent,
        bookmarks,
        updatedAt: new Date().toISOString(),
      },
      profileId,
    )
  }, [isOpen, bookKey, effectiveTitle, effectiveAuthor, loadedBook?.format, currentPage, totalPages, bookmarks, profileId, effectiveChapters.length, useSamplePreview])

  // Ctrl + wheel font size scaling
  useEffect(() => {
    if (!isOpen) return
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault()
        if (e.deltaY < 0) setFontSize((s) => Math.min(32, s + 1))
        else if (e.deltaY > 0) setFontSize((s) => Math.max(12, s - 1))
      }
    }
    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => window.removeEventListener('wheel', handleWheel)
  }, [isOpen])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (effectiveChapters.length === 0 || isPdfMode) return
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault()
        setCurrentPage((p) => Math.min(totalPages - 1, p + 1))
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        setCurrentPage((p) => Math.max(0, p - 1))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, totalPages, onClose, effectiveChapters.length, isPdfMode])

  const handleOpenLocalFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLoadingFile(true)
    setLoadError(null)
    try {
      const parsed = await parseLocalBookFile(file)
      setLoadedBook(parsed)
      setUseSamplePreview(false)
      setCurrentPage(0)
      toast(`Opened "${parsed.title}" (${parsed.format.toUpperCase()})`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not parse selected book file.'
      setLoadError(msg)
      toast(msg)
    } finally {
      setLoadingFile(false)
    }
  }

  const addBookmark = () => {
    if (!activeChapter) return
    const existing = bookmarks.find((b) => b.chapterIndex === currentPage)
    if (existing) {
      toast(`Already bookmarked: ${existing.label}`)
      return
    }
    const next: BookBookmark = {
      id: `bm-${Date.now()}`,
      chapterIndex: currentPage,
      label: `Section ${currentPage + 1}: ${activeChapter.title.slice(0, 48)}`,
      createdAt: new Date().toISOString(),
    }
    const updated = [...bookmarks, next]
    setBookmarks(updated)
    toast(`Bookmarked Section ${currentPage + 1}`)
  }

  const removeBookmark = (id: string) => {
    setBookmarks((prev) => prev.filter((b) => b.id !== id))
  }

  if (!isOpen) return null

  return (
    <div className={`book-reader-overlay theme-${theme}`} role="dialog" aria-modal="true" aria-label={`Reading: ${effectiveTitle}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".epub,.pdf,.txt,.md,.html,.xhtml,.htm"
        style={{ display: 'none' }}
        onChange={handleOpenLocalFile}
      />

      <header className="book-reader-header">
        <div className="book-reader-title-group">
          <Icon name="book" size={20} />
          <div>
            <div className="book-reader-book-title">{effectiveTitle}</div>
            <div className="book-reader-author">
              {effectiveAuthor} ({loadedBook ? loadedBook.format.toUpperCase() : sourceName})
            </div>
          </div>
        </div>

        <div className="book-reader-controls">
          <button
            type="button"
            className="book-reader-tool-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={loadingFile}
            title="Open a local EPUB, PDF, TXT, Markdown, or HTML file"
          >
            <Icon name="folder" size={15} />
            <span>{loadingFile ? 'Opening...' : 'Open Local Book'}</span>
          </button>

          {effectiveChapters.length > 0 && !isPdfMode && (
            <>
              <button
                type="button"
                className={`book-reader-tool-btn ${showToc ? 'is-active' : ''}`}
                onClick={() => setShowToc((v) => !v)}
                aria-expanded={showToc}
                title="Table of contents and bookmarks"
              >
                <Icon name="library" size={15} />
                <span>Contents ({effectiveChapters.length})</span>
              </button>

              <button
                type="button"
                className="book-reader-tool-btn"
                onClick={addBookmark}
                title="Save bookmark for this section"
              >
                <Icon name="bookmark" size={15} />
                <span>Bookmark</span>
              </button>

              <button
                type="button"
                className={`book-reader-tool-btn ${showSettings ? 'is-active' : ''}`}
                onClick={() => setShowSettings(!showSettings)}
                aria-expanded={showSettings}
                title="Typography and appearance settings"
              >
                <Icon name="settings" size={15} />
                <span>Appearance</span>
              </button>
            </>
          )}

          <button
            type="button"
            className="book-reader-tool-btn"
            onClick={onClose}
            aria-label="Close reader"
            title="Close reader (Esc)"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      </header>

      {showSettings && !isPdfMode && (
        <section className="book-reader-settings-bar" aria-label="Reader appearance settings">
          <div className="book-setting-group">
            <span className="book-setting-label">Theme:</span>
            <div className="book-theme-options" role="radiogroup" aria-label="Reading theme">
              {(['dark', 'sepia', 'black', 'light'] as ReaderTheme[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`book-theme-swatch swatch-${t} ${theme === t ? 'is-active' : ''}`}
                  onClick={() => setTheme(t)}
                  title={`${t} theme`}
                  aria-label={`${t} theme`}
                />
              ))}
            </div>
          </div>

          <div className="book-setting-group">
            <span className="book-setting-label">Font:</span>
            {(['serif', 'sans', 'mono'] as ReaderFont[]).map((f) => (
              <button
                key={f}
                type="button"
                className={`book-reader-tool-btn ${fontFamily === f ? 'is-active' : ''}`}
                onClick={() => setFontFamily(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          <div className="book-setting-group">
            <span className="book-setting-label">Size:</span>
            <button type="button" className="book-reader-tool-btn" onClick={() => setFontSize((s) => Math.max(14, s - 2))}>
              A-
            </button>
            <span style={{ minWidth: 32, textAlign: 'center', fontWeight: 600 }}>{fontSize}px</span>
            <button type="button" className="book-reader-tool-btn" onClick={() => setFontSize((s) => Math.min(28, s + 2))}>
              A+
            </button>
          </div>

          <div className="book-setting-group">
            <span className="book-setting-label">Spacing:</span>
            {[
              { label: 'Compact', val: 1.5 },
              { label: 'Normal', val: 1.75 },
              { label: 'Spacious', val: 2.0 },
            ].map((opt) => (
              <button
                key={opt.label}
                type="button"
                className={`book-reader-tool-btn ${lineHeight === opt.val ? 'is-active' : ''}`}
                onClick={() => setLineHeight(opt.val)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {showToc && effectiveChapters.length > 0 && !isPdfMode && (
        <section
          className="book-reader-settings-bar"
          aria-label="Table of contents and bookmarks"
          style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px', maxHeight: '220px', overflowY: 'auto' }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {effectiveChapters.map((ch, idx) => (
              <button
                key={idx}
                type="button"
                className={`book-reader-tool-btn ${idx === currentPage ? 'is-active' : ''}`}
                onClick={() => {
                  setCurrentPage(idx)
                  setShowToc(false)
                }}
              >
                {idx + 1}. {ch.title}
              </button>
            ))}
          </div>
          {bookmarks.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              <span className="book-setting-label">Bookmarks:</span>
              {bookmarks.map((bm) => (
                <span key={bm.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <button
                    type="button"
                    className="book-reader-tool-btn"
                    onClick={() => {
                      setCurrentPage(bm.chapterIndex)
                      setShowToc(false)
                    }}
                  >
                    {bm.label}
                  </button>
                  <button
                    type="button"
                    className="book-reader-tool-btn"
                    onClick={() => removeBookmark(bm.id)}
                    aria-label={`Remove bookmark ${bm.label}`}
                  >
                    x
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      <main className="book-reader-content-wrap">
        {loadError && (
          <div style={{ maxWidth: '680px', margin: '16px auto', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--red, #d44)', color: 'var(--red, #f66)' }}>
            {loadError}
          </div>
        )}

        {isPdfMode && loadedBook?.pdfBytes ? (
          <PdfCanvasViewer
            bytes={loadedBook.pdfBytes}
            title={effectiveTitle}
            initialPage={currentPage}
            onPageChange={(pageIdx, pdfTotal) => {
              const percent = Math.round(((pageIdx + 1) / Math.max(1, pdfTotal)) * 100)
              saveBookProgress(
                {
                  bookKey,
                  title: effectiveTitle,
                  author: effectiveAuthor,
                  format: 'pdf',
                  chapterIndex: pageIdx,
                  totalChapters: pdfTotal,
                  percent,
                  bookmarks,
                  updatedAt: new Date().toISOString(),
                },
                profileId,
              )
            }}
          />
        ) : activeChapter ? (
          <article className={`book-reader-page font-${fontFamily}`} style={{ fontSize: `${fontSize}px`, lineHeight }}>
            <header className="book-reader-page-header">
              <h2 className="book-reader-chapter-title">{activeChapter.title}</h2>
              {activeChapter.subtitle && <div className="book-reader-chapter-sub">{activeChapter.subtitle}</div>}
            </header>

            <div className="book-reader-text">
              {activeChapter.content.map((paragraph, idx) => (
                <p key={idx}>{paragraph}</p>
              ))}
            </div>
          </article>
        ) : (
          <div style={{ maxWidth: '560px', margin: '48px auto', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center' }}>
            <Icon name="book" size={40} />
            <h2 style={{ margin: 0 }}>No Book File Loaded</h2>
            <p style={{ margin: 0, opacity: 0.8, lineHeight: 1.6 }}>
              This catalogue entry is a directory portal rather than an inline text file. Open a downloaded EPUB, PDF, plain text, Markdown, or HTML file from your device to read it inside Kinora with saved progress and bookmarks.
            </p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '6px' }}>
              <button type="button" className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
                <Icon name="folder" size={16} />
                <span>Open Local Book (.epub, .pdf, .txt)</span>
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setUseSamplePreview(true)}>
                <span>Preview Reader Typography</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {activeChapter && !isPdfMode && (
        <footer className="book-reader-footer">
          <button
            type="button"
            className="book-reader-tool-btn"
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            aria-label="Previous page"
          >
            <Icon name="left" size={16} />
            <span>Previous</span>
          </button>

          <div className="book-reader-page-info">
            <span>
              Section {currentPage + 1} of {totalPages} ({Math.round(((currentPage + 1) / totalPages) * 100)}%)
            </span>
            <div className="book-reader-progress-bar" role="progressbar" aria-valuenow={currentPage + 1} aria-valuemin={1} aria-valuemax={totalPages}>
              <div className="book-reader-progress-fill" style={{ width: `${((currentPage + 1) / totalPages) * 100}%` }} />
            </div>
          </div>

          <button
            type="button"
            className="book-reader-tool-btn"
            onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage === totalPages - 1}
            aria-label="Next page"
          >
            <span>Next</span>
            <Icon name="right" size={16} />
          </button>
        </footer>
      )}
    </div>
  )
}
