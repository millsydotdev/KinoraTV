import { useState, useEffect, useMemo, useRef } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Icon } from '../components/Icon'
import { useToast } from '../components/Toast'
import { useStore } from '../state/store'
import {
  listCustomArtworks,
  saveCustomArtwork,
  deleteCustomArtwork,
  validateAndProcessImageFile,
  type CustomArtworkRecord,
  type CustomArtworkType,
  type CustomArtworkAspectRatio,
} from '../state/customArtwork'
import './ArtworkLibraryScreen.css'

const ARTWORK_TYPES: { id: CustomArtworkType; label: string; ratio: CustomArtworkAspectRatio }[] = [
  { id: 'channel-logo', label: 'Channel Logo', ratio: '1:1' },
  { id: 'movie-poster', label: 'Movie Poster', ratio: '2:3' },
  { id: 'movie-backdrop', label: 'Movie Backdrop', ratio: '16:9' },
  { id: 'series-poster', label: 'Series Poster', ratio: '2:3' },
  { id: 'series-backdrop', label: 'Series Backdrop', ratio: '16:9' },
  { id: 'episode-still', label: 'Episode Still', ratio: '16:9' },
  { id: 'epg-programme-artwork', label: 'EPG Programme Artwork', ratio: '16:9' },
]

export function ArtworkLibraryScreen() {
  const toast = useToast()
  const store = useStore()
  const [artworks, setArtworks] = useState<CustomArtworkRecord[]>(listCustomArtworks)
  const [filterType, setFilterType] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [replacingTarget, setReplacingTarget] = useState<CustomArtworkRecord | null>(null)

  const reload = () => setArtworks(listCustomArtworks())

  useEffect(() => {
    const handleUpdate = () => reload()
    window.addEventListener('kinora:custom-artwork-changed', handleUpdate)
    return () => window.removeEventListener('kinora:custom-artwork-changed', handleUpdate)
  }, [])

  // Metrics
  const stats = useMemo(() => {
    const total = artworks.length
    const logos = artworks.filter((a) => a.artworkType === 'channel-logo').length
    const posters = artworks.filter((a) => a.artworkType === 'movie-poster' || a.artworkType === 'series-poster').length
    const backdrops = artworks.filter((a) => a.artworkType === 'movie-backdrop' || a.artworkType === 'series-backdrop').length
    const totalBytes = artworks.reduce((acc, a) => acc + (a.fileSize || 0), 0)
    const formattedBytes =
      totalBytes > 1024 * 1024
        ? `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`
        : `${(totalBytes / 1024).toFixed(0)} KB`

    return { total, logos, posters, backdrops, formattedBytes }
  }, [artworks])

  const filtered = useMemo(() => {
    let list = artworks
    if (filterType !== 'all') {
      list = list.filter((a) => a.artworkType === filterType)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (a) => a.title.toLowerCase().includes(q) || a.contentId.toLowerCase().includes(q) || a.fileName.toLowerCase().includes(q),
      )
    }
    return list
  }, [artworks, filterType, searchQuery])

  const handleRemove = (record: CustomArtworkRecord) => {
    deleteCustomArtwork(record.contentId)
    reload()
    toast(`Restored automatic artwork for ${record.title}`)
  }

  const handleOpenReplace = (record: CustomArtworkRecord) => {
    setReplacingTarget(record)
    setUploadModalOpen(true)
  }

  return (
    <div className="artwork-library-page">
      <PageHeader
        title={
          <div className="artwork-lib-header-title">
            <div className="artwork-lib-header-icon" aria-hidden="true">
              <Icon name="palette" size={20} />
            </div>
            <div>
              <span className="artwork-lib-title">Personal Artwork Library</span>
              <span className="artwork-lib-subtitle">
                Manage user-assigned custom channel logos, posters, and backdrops with absolute priority.
              </span>
            </div>
          </div>
        }
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setReplacingTarget(null)
              setUploadModalOpen(true)
            }}
          >
            <Icon name="plus" size={16} />
            <span>Upload & Assign Artwork</span>
          </button>
        }
      />

      {/* Metrics HUD */}
      <div className="artwork-lib-hud">
        <div className="artwork-hud-card">
          <span className="artwork-hud-value">{stats.total}</span>
          <span className="artwork-hud-label">Custom Artworks</span>
        </div>
        <div className="artwork-hud-card">
          <span className="artwork-hud-value">{stats.logos}</span>
          <span className="artwork-hud-label">Channel Logos</span>
        </div>
        <div className="artwork-hud-card">
          <span className="artwork-hud-value">{stats.posters + stats.backdrops}</span>
          <span className="artwork-hud-label">Posters & Backdrops</span>
        </div>
        <div className="artwork-hud-card">
          <span className="artwork-hud-value">{stats.formattedBytes}</span>
          <span className="artwork-hud-label">Storage Used</span>
        </div>
      </div>

      {/* Controls & Filter Bar */}
      <div className="artwork-lib-controls">
        <div className="artwork-lib-filters" role="group" aria-label="Filter by artwork type">
          <button
            type="button"
            className={`artwork-filter-btn ${filterType === 'all' ? 'is-active' : ''}`}
            onClick={() => setFilterType('all')}
          >
            All ({artworks.length})
          </button>
          <button
            type="button"
            className={`artwork-filter-btn ${filterType === 'channel-logo' ? 'is-active' : ''}`}
            onClick={() => setFilterType('channel-logo')}
          >
            Channel Logos ({stats.logos})
          </button>
          <button
            type="button"
            className={`artwork-filter-btn ${filterType === 'movie-poster' ? 'is-active' : ''}`}
            onClick={() => setFilterType('movie-poster')}
          >
            Movie Posters
          </button>
          <button
            type="button"
            className={`artwork-filter-btn ${filterType === 'movie-backdrop' ? 'is-active' : ''}`}
            onClick={() => setFilterType('movie-backdrop')}
          >
            Movie Backdrops
          </button>
          <button
            type="button"
            className={`artwork-filter-btn ${filterType === 'series-poster' ? 'is-active' : ''}`}
            onClick={() => setFilterType('series-poster')}
          >
            Series Posters
          </button>
          <button
            type="button"
            className={`artwork-filter-btn ${filterType === 'epg-programme-artwork' ? 'is-active' : ''}`}
            onClick={() => setFilterType('epg-programme-artwork')}
          >
            Programme Artwork
          </button>
        </div>

        <div className="artwork-lib-search">
          <Icon name="search" size={16} className="artwork-search-icon" />
          <input
            type="text"
            className="artwork-search-input"
            placeholder="Search custom artwork by title or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="artwork-search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              <Icon name="x" size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {filtered.length > 0 ? (
        <div className="artwork-grid">
          {filtered.map((item) => (
            <div key={item.id} className="artwork-card">
              <div className={`artwork-thumb-wrap is-${item.aspectRatio.replace(':', '-')}`}>
                <img src={item.dataUrl} alt={item.title} className="artwork-thumb-img" />
                <span className="artwork-ratio-badge">{item.aspectRatio}</span>
              </div>
              <div className="artwork-card-body">
                <span className="artwork-type-tag">{item.artworkType.replace('-', ' ').toUpperCase()}</span>
                <h4 className="artwork-card-title" title={item.title}>
                  {item.title}
                </h4>
                <div className="artwork-card-meta">
                  <span>{item.width} × {item.height} px</span>
                  <span>·</span>
                  <span>{(item.fileSize / 1024).toFixed(0)} KB</span>
                </div>
                <div className="artwork-target-row faint" title={item.contentId}>
                  Target: <code>{item.contentId}</code>
                </div>
              </div>
              <div className="artwork-card-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleOpenReplace(item)}
                  title="Replace with a new image"
                >
                  <Icon name="adjustments" size={14} /> Replace
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleRemove(item)}
                  title="Restore automatic artwork"
                >
                  <Icon name="rotateCw" size={14} /> Restore Auto
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="artwork-empty-state">
          <div className="artwork-empty-icon" aria-hidden="true">
            <Icon name="palette" size={48} />
          </div>
          <h3 className="artwork-empty-title">
            {searchQuery || filterType !== 'all' ? 'No matching custom artwork' : 'Personal Artwork Library is Empty'}
          </h3>
          <p className="artwork-empty-desc">
            {searchQuery || filterType !== 'all'
              ? 'Try adjusting your search query or artwork type filters above.'
              : 'Upload custom high-resolution posters, backdrops, and channel logos to personalise your library. Custom artwork has highest priority and overrides automatic metadata.'}
          </p>
          <div className="artwork-empty-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setReplacingTarget(null)
                setUploadModalOpen(true)
              }}
            >
              <Icon name="plus" size={16} />
              <span>Upload Custom Artwork</span>
            </button>
            {store.channels.length > 0 && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setReplacingTarget(null)
                  setUploadModalOpen(true)
                }}
              >
                <span>Assign Channel Logo</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Upload & Assignment Modal */}
      {uploadModalOpen && (
        <ArtworkUploadModal
          replacing={replacingTarget}
          onClose={() => {
            setUploadModalOpen(false)
            setReplacingTarget(null)
          }}
          onSaved={() => {
            setUploadModalOpen(false)
            setReplacingTarget(null)
            reload()
          }}
        />
      )}
    </div>
  )
}

function ArtworkUploadModal({
  replacing,
  onClose,
  onSaved,
}: {
  replacing: CustomArtworkRecord | null
  onClose: () => void
  onSaved: () => void
}) {
  const store = useStore()
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [fileData, setFileData] = useState<{
    width: number
    height: number
    mimeType: string
    dataUrl: string
    aspectRatio: CustomArtworkAspectRatio
    fileName: string
    fileSize: number
  } | null>(
    replacing
      ? {
          width: replacing.width,
          height: replacing.height,
          mimeType: replacing.mimeType,
          dataUrl: replacing.dataUrl,
          aspectRatio: replacing.aspectRatio,
          fileName: replacing.fileName,
          fileSize: replacing.fileSize,
        }
      : null,
  )

  const [artworkType, setArtworkType] = useState<CustomArtworkType>(replacing?.artworkType ?? 'channel-logo')
  const [targetKind, setTargetKind] = useState<'channel' | 'movie' | 'series' | 'custom'>('channel')
  const [selectedTargetId, setSelectedTargetId] = useState<string>(replacing?.contentId ?? '')
  const [customTitle, setCustomTitle] = useState<string>(replacing?.title ?? '')
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleFileChange = async (file: File) => {
    setErrorMsg(null)
    setIsProcessing(true)
    try {
      const processed = await validateAndProcessImageFile(file)
      setFileData({
        ...processed,
        fileName: file.name,
        fileSize: file.size,
      })
      // Auto-suggest artwork type from aspect ratio
      if (processed.aspectRatio === '1:1') {
        setArtworkType('channel-logo')
        setTargetKind('channel')
      } else if (processed.aspectRatio === '2:3') {
        setArtworkType('movie-poster')
        setTargetKind('movie')
      } else if (processed.aspectRatio === '16:9') {
        setArtworkType('movie-backdrop')
        setTargetKind('movie')
      }
    } catch (err) {
      setErrorMsg((err as Error).message || 'Invalid image file.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSave = () => {
    if (!fileData) {
      setErrorMsg('Please select an image file.')
      return
    }

    let contentId = selectedTargetId.trim()
    let title = customTitle.trim()

    if (targetKind === 'channel') {
      const ch = store.channels.find((c) => c.id === contentId || c.tvgId === contentId)
      if (ch) {
        title = title || ch.name
        contentId = ch.id
      }
    }

    if (!contentId) {
      setErrorMsg('Please select a target channel or media item.')
      return
    }

    if (!title) {
      title = contentId
    }

    saveCustomArtwork({
      contentId,
      title,
      artworkType,
      aspectRatio: fileData.aspectRatio,
      dataUrl: fileData.dataUrl,
      fileName: fileData.fileName,
      fileSize: fileData.fileSize,
      width: fileData.width,
      height: fileData.height,
      mimeType: fileData.mimeType,
    })

    toast(`Custom artwork assigned to ${title}`)
    onSaved()
  }

  return (
    <div className="artwork-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="artwork-modal-card" role="dialog" aria-modal="true" aria-labelledby="artwork-modal-title">
        <header className="artwork-modal-header">
          <div className="artwork-modal-title-row">
            <Icon name="palette" size={20} className="artwork-modal-header-icon" />
            <h3 id="artwork-modal-title" className="artwork-modal-heading">
              {replacing ? `Replace Artwork for ${replacing.title}` : 'Upload & Assign Custom Artwork'}
            </h3>
          </div>
          <button type="button" className="artwork-modal-close-btn" onClick={onClose} aria-label="Close dialog">
            <Icon name="x" size={18} />
          </button>
        </header>

        <div className="artwork-modal-body">
          {errorMsg && (
            <div className="artwork-modal-error">
              <Icon name="alertCircle" size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* STEP 1: Image File Selection & Preview */}
          <div className="artwork-modal-section">
            <label className="artwork-modal-label">1. Image File (PNG, JPEG, WebP, GIF - Max 5MB)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleFileChange(file)
              }}
            />

            {fileData ? (
              <div className="artwork-preview-box">
                <img src={fileData.dataUrl} alt="Preview" className="artwork-preview-img" />
                <div className="artwork-preview-meta">
                  <span className="artwork-preview-name">{fileData.fileName}</span>
                  <span className="artwork-preview-specs">
                    {fileData.width} × {fileData.height} px · {(fileData.fileSize / 1024).toFixed(0)} KB · {fileData.aspectRatio}
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Icon name="folder" size={14} /> Change Image
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="artwork-dropzone"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const file = e.dataTransfer.files?.[0]
                  if (file) void handleFileChange(file)
                }}
              >
                <Icon name="upload" size={32} />
                <p className="artwork-dropzone-title">Click to select image or drag & drop here</p>
                <span className="artwork-dropzone-hint faint">Supports high-resolution PNG, JPEG, WebP, and GIF up to 5 MB</span>
              </div>
            )}
          </div>

          {/* STEP 2: Artwork Type */}
          <div className="artwork-modal-section">
            <label className="artwork-modal-label">2. Artwork Category</label>
            <div className="artwork-types-grid">
              {ARTWORK_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`artwork-type-btn ${artworkType === t.id ? 'is-active' : ''}`}
                  onClick={() => setArtworkType(t.id)}
                >
                  <span className="artwork-type-label">{t.label}</span>
                  <span className="artwork-type-ratio faint">{t.ratio}</span>
                </button>
              ))}
            </div>
          </div>

          {/* STEP 3: Assignment Target */}
          <div className="artwork-modal-section">
            <label className="artwork-modal-label">3. Target Assignment</label>
            <div className="artwork-targets-tabs">
              <button
                type="button"
                className={`artwork-target-tab ${targetKind === 'channel' ? 'is-active' : ''}`}
                onClick={() => setTargetKind('channel')}
              >
                TV Channel
              </button>
              <button
                type="button"
                className={`artwork-target-tab ${targetKind === 'movie' ? 'is-active' : ''}`}
                onClick={() => setTargetKind('movie')}
              >
                Movie
              </button>
              <button
                type="button"
                className={`artwork-target-tab ${targetKind === 'series' ? 'is-active' : ''}`}
                onClick={() => setTargetKind('series')}
              >
                TV Series
              </button>
              <button
                type="button"
                className={`artwork-target-tab ${targetKind === 'custom' ? 'is-active' : ''}`}
                onClick={() => setTargetKind('custom')}
              >
                Custom ID
              </button>
            </div>

            {targetKind === 'channel' && (
              <div className="artwork-select-wrap">
                <select
                  className="artwork-select"
                  value={selectedTargetId}
                  onChange={(e) => {
                    setSelectedTargetId(e.target.value)
                    const ch = store.channels.find((c) => c.id === e.target.value)
                    if (ch) setCustomTitle(ch.name)
                  }}
                >
                  <option value="">Select a TV Channel ({store.channels.length} available)...</option>
                  {store.channels.slice(0, 500).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.number ? `${c.number}. ` : ''}{c.name} {c.tvgId ? `(${c.tvgId})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {targetKind === 'custom' && (
              <div className="artwork-custom-inputs">
                <input
                  type="text"
                  className="artwork-text-input"
                  placeholder="Target Content ID (e.g. channel:bbc-one or movie:dune-part-two)"
                  value={selectedTargetId}
                  onChange={(e) => setSelectedTargetId(e.target.value)}
                />
                <input
                  type="text"
                  className="artwork-text-input"
                  placeholder="Display Title (e.g. BBC One)"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                />
              </div>
            )}

            {(targetKind === 'movie' || targetKind === 'series') && (
              <div className="artwork-custom-inputs">
                <input
                  type="text"
                  className="artwork-text-input"
                  placeholder={`Enter ${targetKind === 'movie' ? 'Movie' : 'Series'} ID or Title`}
                  value={selectedTargetId}
                  onChange={(e) => {
                    setSelectedTargetId(e.target.value)
                    setCustomTitle(e.target.value)
                  }}
                />
              </div>
            )}
          </div>
        </div>

        <footer className="artwork-modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!fileData || isProcessing}
            onClick={handleSave}
          >
            <Icon name="check" size={16} />
            <span>Save & Assign Artwork</span>
          </button>
        </footer>
      </div>
    </div>
  )
}
