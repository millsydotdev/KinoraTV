import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { useToast } from './Toast'
import { useProfiles } from '../state/profiles'
import './BookReaderModal.css'

export interface BookReaderModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  author?: string
  sourceName?: string
  chapters?: { title: string; subtitle?: string; content: string[] }[]
}

const DEFAULT_CHAPTERS = [
  {
    title: 'Chapter 1: The Gathering at the Threshold',
    subtitle: 'From the Open Public Domain Archives',
    content: [
      'It is a truth universally acknowledged, that a reader in possession of an open digital library must be in want of a tranquil evening. The library doors swung open without a whisper, inviting scholars and travelers alike to explore the infinite shelves stretching into the soft ambient glow.',
      'The morning sun began to filter through the grand clerestory windows, striking the dust motes dancing above rows of leather and vellum bindings. Every volume represented a mind across centuries: philosophers, poets, cartographers, and astronomers who recorded the motions of celestial spheres long before modern satellites charted the stars.',
      'To read in peace is one of humanity’s oldest sanctuaries. Here, disconnected from the fleeting noise of notifications and fleeting feeds, one discovers that the deepest thoughts are those given time to unfold across unbroken paragraphs and measured prose.',
    ],
  },
  {
    title: 'Chapter 2: The Cartography of Unknown Seas',
    subtitle: 'Voyages, Discoveries and Ancient Observations',
    content: [
      'We weighed anchor at dawn, watching the harbor lights of Alexandria recede into the morning haze. The astrolabe and compass lay before the navigator, its brass dials reflecting the first golden rays of sunrise.',
      'According to the elder chronicles, the currents along these northern archipelagos were governed by tidal rhythms unmentioned in standard coastal charts. Each island presented a different shoreline: chalk cliffs sculpted by winter squalls, quiet coves fringed by silver olive groves, and ancient beacons standing vigil upon the headlands.',
      'As evening descended, the captain ordered all lanterns dimmed except for the stern light. Under the arc of the Milky Way, the sea turned from sapphire to ink, and the voyage into unmapped waters truly commenced.',
    ],
  },
  {
    title: 'Chapter 3: The Architecture of Thought',
    subtitle: 'Reflections on Science, Art and Digital Preservation',
    content: [
      'Every civilization builds monuments to endure beyond the fleeting tenure of its founders. In the classical era, stone and marble anchored memory; in our time, open standards and shared digital archives hold the living heritage of mankind.',
      'Preservation is not merely passive storage: it is active reading, contemplation, and reinterpretation. When open libraries provide free access to literature, education ceases to be a privilege of geography and becomes a universal foundation.',
      'We turn the page not to escape the world, but to return to it with clearer eyes, deeper empathy, and a mind enriched by the voices of those who walked these paths before us.',
    ],
  },
]

type ReaderTheme = 'dark' | 'sepia' | 'black' | 'light'
type ReaderFont = 'serif' | 'sans' | 'mono'

export function BookReaderModal({
  isOpen,
  onClose,
  title,
  author = 'Public Domain Collection',
  sourceName = 'Open Library',
  chapters = DEFAULT_CHAPTERS,
}: BookReaderModalProps) {
  const toast = useToast()
  const { activeProfile } = useProfiles()
  const profileId = activeProfile?.id ?? 'default'
  const bookmarkStorageKey = profileId === 'default' ? 'kinora.reading_bookmarks.v1' : `kinora.reading_bookmarks.v1.${profileId}`

  const [currentPage, setCurrentPage] = useState(0)
  const [theme, setTheme] = useState<ReaderTheme>('dark')
  const [fontFamily, setFontFamily] = useState<ReaderFont>('serif')
  const [fontSize, setFontSize] = useState<number>(18)
  const [lineHeight, setLineHeight] = useState<number>(1.75)
  const [showSettings, setShowSettings] = useState(false)

  const activeChapter = chapters[currentPage] ?? chapters[0]!
  const totalPages = chapters.length

  // Load bookmark on open
  useEffect(() => {
    if (!isOpen) return
    try {
      const raw = localStorage.getItem(bookmarkStorageKey)
      if (raw) {
        const bookmarks = JSON.parse(raw) as Record<string, number>
        if (bookmarks[title] !== undefined && bookmarks[title]! < totalPages) {
          setCurrentPage(bookmarks[title]!)
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, [isOpen, title, totalPages, bookmarkStorageKey])

  // Pinch-to-zoom / wheel font size scaling (Audit #83)
  useEffect(() => {
    if (!isOpen) return
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault()
        if (e.deltaY < 0) {
          setFontSize((s) => Math.min(32, s + 1))
        } else if (e.deltaY > 0) {
          setFontSize((s) => Math.max(12, s - 1))
        }
      }
    }
    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => window.removeEventListener('wheel', handleWheel)
  }, [isOpen])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault()
        setCurrentPage((p) => Math.min(totalPages - 1, p + 1))
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        setCurrentPage((p) => Math.max(0, p - 1))
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, totalPages, onClose])

  const saveBookmark = () => {
    try {
      const raw = localStorage.getItem(bookmarkStorageKey)
      const bookmarks = raw ? (JSON.parse(raw) as Record<string, number>) : {}
      bookmarks[title] = currentPage
      localStorage.setItem(bookmarkStorageKey, JSON.stringify(bookmarks))
      toast(`Saved bookmark at Page ${currentPage + 1}`)
    } catch {
      toast('Failed to save bookmark')
    }
  }

  if (!isOpen) return null

  return (
    <div className={`book-reader-overlay theme-${theme}`} role="dialog" aria-modal="true" aria-label={`Reading: ${title}`}>
      {/* Top Header */}
      <header className="book-reader-header">
        <div className="book-reader-title-group">
          <Icon name="book" size={20} />
          <div>
            <div className="book-reader-book-title">{title}</div>
            <div className="book-reader-author">{author} ({sourceName})</div>
          </div>
        </div>

        <div className="book-reader-controls">
          <button
            type="button"
            className="book-reader-tool-btn"
            onClick={saveBookmark}
            title="Save bookmark for this page"
          >
            <Icon name="bookmark" size={15} />
            <span>Bookmark</span>
          </button>

          <button
            type="button"
            className="book-reader-tool-btn"
            onClick={() => setShowSettings(!showSettings)}
            aria-expanded={showSettings}
            title="Typography and appearance settings"
          >
            <Icon name="settings" size={15} />
            <span>Appearance</span>
          </button>

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

      {/* Reader Appearance Settings Bar */}
      {showSettings && (
        <section className="book-reader-settings-bar" aria-label="Reader appearance settings">
          {/* Theme Selector */}
          <div className="book-setting-group">
            <span className="book-setting-label">Theme:</span>
            <div className="book-theme-options" role="radiogroup" aria-label="Reading theme">
              <button
                type="button"
                className={`book-theme-swatch swatch-dark ${theme === 'dark' ? 'is-active' : ''}`}
                onClick={() => setTheme('dark')}
                title="Cinema Dark theme"
                aria-label="Dark theme"
              />
              <button
                type="button"
                className={`book-theme-swatch swatch-sepia ${theme === 'sepia' ? 'is-active' : ''}`}
                onClick={() => setTheme('sepia')}
                title="Warm Sepia theme"
                aria-label="Sepia theme"
              />
              <button
                type="button"
                className={`book-theme-swatch swatch-black ${theme === 'black' ? 'is-active' : ''}`}
                onClick={() => setTheme('black')}
                title="Night Black theme"
                aria-label="Black theme"
              />
              <button
                type="button"
                className={`book-theme-swatch swatch-light ${theme === 'light' ? 'is-active' : ''}`}
                onClick={() => setTheme('light')}
                title="Paper Light theme"
                aria-label="Light theme"
              />
            </div>
          </div>

          {/* Font Family */}
          <div className="book-setting-group">
            <span className="book-setting-label">Font:</span>
            <button
              type="button"
              className={`book-reader-tool-btn ${fontFamily === 'serif' ? 'is-active' : ''}`}
              onClick={() => setFontFamily('serif')}
            >
              Serif
            </button>
            <button
              type="button"
              className={`book-reader-tool-btn ${fontFamily === 'sans' ? 'is-active' : ''}`}
              onClick={() => setFontFamily('sans')}
            >
              Sans
            </button>
            <button
              type="button"
              className={`book-reader-tool-btn ${fontFamily === 'mono' ? 'is-active' : ''}`}
              onClick={() => setFontFamily('mono')}
            >
              Mono
            </button>
          </div>

          {/* Font Size */}
          <div className="book-setting-group">
            <span className="book-setting-label">Size:</span>
            <button
              type="button"
              className="book-reader-tool-btn"
              onClick={() => setFontSize((s) => Math.max(14, s - 2))}
              title="Decrease font size"
            >
              A-
            </button>
            <span style={{ minWidth: 32, textAlign: 'center', fontWeight: 600 }}>{fontSize}px</span>
            <button
              type="button"
              className="book-reader-tool-btn"
              onClick={() => setFontSize((s) => Math.min(26, s + 2))}
              title="Increase font size"
            >
              A+
            </button>
          </div>

          {/* Line Spacing */}
          <div className="book-setting-group">
            <span className="book-setting-label">Spacing:</span>
            <button
              type="button"
              className={`book-reader-tool-btn ${lineHeight === 1.5 ? 'is-active' : ''}`}
              onClick={() => setLineHeight(1.5)}
            >
              Compact
            </button>
            <button
              type="button"
              className={`book-reader-tool-btn ${lineHeight === 1.75 ? 'is-active' : ''}`}
              onClick={() => setLineHeight(1.75)}
            >
              Normal
            </button>
            <button
              type="button"
              className={`book-reader-tool-btn ${lineHeight === 2.0 ? 'is-active' : ''}`}
              onClick={() => setLineHeight(2.0)}
            >
              Spacious
            </button>
          </div>
        </section>
      )}

      {/* Main Reading Content */}
      <main className="book-reader-content-wrap">
        <article
          className={`book-reader-page font-${fontFamily}`}
          style={{ fontSize: `${fontSize}px`, lineHeight }}
        >
          <header className="book-reader-page-header">
            <h2 className="book-reader-chapter-title">{activeChapter.title}</h2>
            {activeChapter.subtitle && (
              <div className="book-reader-chapter-sub">{activeChapter.subtitle}</div>
            )}
          </header>

          <div className="book-reader-text">
            {activeChapter.content.map((paragraph, idx) => (
              <p key={idx}>{paragraph}</p>
            ))}
          </div>
        </article>
      </main>

      {/* Bottom Footer Navigation */}
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
          <span>Page {currentPage + 1} of {totalPages}</span>
          <div className="book-reader-progress-bar" role="progressbar" aria-valuenow={currentPage + 1} aria-valuemin={1} aria-valuemax={totalPages}>
            <div
              className="book-reader-progress-fill"
              style={{ width: `${((currentPage + 1) / totalPages) * 100}%` }}
            />
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
    </div>
  )
}
