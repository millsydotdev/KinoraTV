import { useRef, useState } from 'react'
import { MediaCategoryPage } from '../components/MediaCategoryPage'
import { Icon } from '../components/Icon'
import { BookReaderModal } from '../components/BookReaderModal'
import { useToast } from '../components/Toast'
import { useProfiles } from '../state/profiles'
import { fetchOpdsCatalogue, type OpdsEntry, type OpdsCatalogConfig } from '../lib/opds'
import { getOpdsCatalogs, removeOpdsCatalog, saveOpdsCatalog } from '../state/opdsCatalogs'
import { loadAllBookProgress, parseLocalBookFile, type ParsedBook } from '../lib/bookParser'

export function BooksScreen() {
  const toast = useToast()
  const { activeProfile } = useProfiles()
  const profileId = activeProfile?.id ?? 'default'
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [catalogs, setCatalogs] = useState<OpdsCatalogConfig[]>(() => getOpdsCatalogs())
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>(() => catalogs[0]?.id ?? '')
  const [opdsBooks, setOpdsBooks] = useState<OpdsEntry[]>([])
  const [opdsFeedTitle, setOpdsFeedTitle] = useState<string>('')
  const [opdsLoading, setOpdsLoading] = useState(false)
  const [opdsError, setOpdsError] = useState<string | null>(null)
  const [opdsOpen, setOpdsOpen] = useState(false)

  const [newCatalogName, setNewCatalogName] = useState('')
  const [newCatalogUrl, setNewCatalogUrl] = useState('')

  const [readerOpen, setReaderOpen] = useState(false)
  const [activeBook, setActiveBook] = useState<ParsedBook | null>(null)

  const recentProgress = Object.values(loadAllBookProgress(profileId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 4)

  const handleOpenLocalBook = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const parsed = await parseLocalBookFile(file)
      setActiveBook(parsed)
      setReaderOpen(true)
      toast(`Opened "${parsed.title}"`)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to open book file.')
    }
  }

  const handleBrowseOpds = async (catalog?: OpdsCatalogConfig) => {
    const target = catalog ?? catalogs.find((c) => c.id === selectedCatalogId) ?? catalogs[0]
    if (!target) return
    setSelectedCatalogId(target.id)
    setOpdsOpen(true)
    setOpdsLoading(true)
    setOpdsError(null)
    try {
      const feed = await fetchOpdsCatalogue(target.url)
      setOpdsFeedTitle(feed.title || target.name)
      setOpdsBooks(feed.entries)
      if (feed.entries.length === 0) {
        setOpdsError('Catalogue loaded, but no book entries were found at this feed level.')
      }
    } catch (err) {
      setOpdsBooks([])
      setOpdsError(err instanceof Error ? err.message : 'Could not fetch OPDS catalogue.')
    } finally {
      setOpdsLoading(false)
    }
  }

  const handleAddOpdsCatalog = (e: React.FormEvent) => {
    e.preventDefault()
    const url = newCatalogUrl.trim()
    const name = newCatalogName.trim() || url
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      toast('OPDS catalogue address must start with http:// or https://')
      return
    }
    const created: OpdsCatalogConfig = {
      id: `opds-custom-${Date.now()}`,
      name,
      url,
      icon: 'book',
      isDefault: false,
    }
    saveOpdsCatalog(created)
    setCatalogs(getOpdsCatalogs())
    setNewCatalogName('')
    setNewCatalogUrl('')
    toast(`Added OPDS catalogue: ${name}`)
    void handleBrowseOpds(created)
  }

  const customHero = (
    <div className="media-hero-banner books-hero">
      <input
        ref={fileInputRef}
        type="file"
        accept=".epub,.pdf,.txt,.md,.html,.xhtml,.htm"
        style={{ display: 'none' }}
        onChange={handleOpenLocalBook}
      />
      <div className="media-hero-content">
        <span className="media-hero-kicker">DIGITAL LIBRARIES &amp; LITERATURE</span>
        <h1 className="media-hero-title">Books, Ebooks &amp; Reading</h1>
        <p className="media-hero-subtitle">
          Read local EPUB, PDF, text, and HTML books with saved progress and bookmarks, or browse open OPDS catalogues through Kinora's guarded feed fetcher.
        </p>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '14px' }}>
          <button
            type="button"
            className="btn btn-primary btn-small"
            onClick={() => fileInputRef.current?.click()}
          >
            <Icon name="folder" size={15} />
            <span>Open Local Book (.epub, .pdf, .txt)</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={() => {
              if (opdsOpen) setOpdsOpen(false)
              else void handleBrowseOpds()
            }}
          >
            <Icon name="library" size={15} />
            <span>{opdsOpen ? 'Hide OPDS Browser' : 'Browse OPDS Catalogues'}</span>
          </button>
        </div>

        {recentProgress.length > 0 && (
          <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', fontSize: '0.8125rem', color: 'var(--text-2)' }}>
            <span>Reading progress:</span>
            {recentProgress.map((item) => (
              <span key={item.bookKey} style={{ padding: '2px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)' }}>
                {item.title} ({item.percent}%)
              </span>
            ))}
          </div>
        )}

        {opdsOpen && (
          <div style={{ marginTop: '16px', padding: '14px', borderRadius: '10px', background: 'rgba(0,0,0,0.45)', border: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
              {catalogs.map((cat) => (
                <div key={cat.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <button
                    type="button"
                    className={`btn btn-small ${selectedCatalogId === cat.id ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => void handleBrowseOpds(cat)}
                  >
                    {cat.name}
                  </button>
                  {!cat.isDefault && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      aria-label={`Remove ${cat.name}`}
                      onClick={() => {
                        removeOpdsCatalog(cat.id)
                        setCatalogs(getOpdsCatalogs())
                      }}
                    >
                      x
                    </button>
                  )}
                </div>
              ))}
            </div>

            <form onSubmit={handleAddOpdsCatalog} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <input
                type="text"
                className="input-text"
                placeholder="Catalogue name"
                value={newCatalogName}
                onChange={(e) => setNewCatalogName(e.target.value)}
                style={{ width: '180px', padding: '5px 8px', fontSize: '0.8125rem' }}
              />
              <input
                type="url"
                className="input-text"
                placeholder="https://example.org/opds/feed.xml"
                value={newCatalogUrl}
                onChange={(e) => setNewCatalogUrl(e.target.value)}
                style={{ flex: 1, minWidth: '220px', padding: '5px 8px', fontSize: '0.8125rem' }}
              />
              <button type="submit" className="btn btn-secondary btn-small">
                Add OPDS Feed
              </button>
            </form>

            {opdsLoading && <p className="muted" style={{ margin: '8px 0' }}>Loading OPDS catalogue...</p>}
            {opdsError && <p style={{ margin: '8px 0', color: 'var(--red, #e55)', fontSize: '0.875rem' }}>{opdsError}</p>}

            {!opdsLoading && opdsBooks.length > 0 && (
              <div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-2)', marginBottom: '8px' }}>
                  {opdsFeedTitle}: {opdsBooks.length} entries
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px', maxHeight: '280px', overflowY: 'auto' }}>
                  {opdsBooks.slice(0, 24).map((book) => {
                    const epubOrPdf = book.acquisitionLinks.find((l) => (l.type ?? '').includes('epub') || (l.type ?? '').includes('pdf')) ?? book.acquisitionLinks[0]
                    const formatLabel = book.supportedFormats[0]?.toUpperCase() || epubOrPdf?.title || 'Download'
                    return (
                      <div key={book.id} style={{ padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <strong style={{ fontSize: '0.875rem' }}>{book.title}</strong>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{book.authors.join(', ') || 'Unknown Author'}</span>
                        {epubOrPdf && (
                          <a
                            href={epubOrPdf.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-link"
                            style={{ fontSize: '0.75rem', marginTop: '4px' }}
                          >
                            Acquire ({formatLabel})
                          </a>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )

  const featured = ['res-boo-project-gutenberg', 'res-boo-standard-ebooks', 'res-boo-open-library', 'res-boo-comic-book-plus']

  return (
    <>
      <MediaCategoryPage categoryId="books" customBannerHero={customHero} featuredIds={featured} />
      <BookReaderModal
        isOpen={readerOpen}
        onClose={() => setReaderOpen(false)}
        title={activeBook?.title ?? 'Book Reader'}
        author={activeBook?.author}
        sourceName="Local Book"
        initialBook={activeBook}
      />
    </>
  )
}
