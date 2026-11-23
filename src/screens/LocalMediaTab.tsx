import { useState, useId } from 'react'
import { Link } from 'react-router-dom'
import { useLocalMedia } from '../state/localMedia'
import { Icon } from '../components/Icon'
import { Dialog } from '../components/Dialog'
import { LocalMediaArt } from '../components/Tiles'
import { useToast } from '../components/Toast'
import type { LocalLibrary } from '../lib/native'

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const val = bytes / Math.pow(1024, i)
  return `${val >= 10 || i === 0 ? val.toFixed(1) : val.toFixed(2)} ${units[i]}`
}

function timeAgo(timestamp: number | null): string {
  if (!timestamp) return 'Never scanned'
  const diffSec = Math.floor((Date.now() - timestamp) / 1000)
  if (diffSec < 60) return 'Just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}h ago`
  return new Date(timestamp).toLocaleDateString()
}

export function LocalMediaTab() {
  const {
    libraries,
    catalogue,
    storageSummary,
    scanning,
    addLibrary,
    removeLibrary,
    scanLibrary,
    chooseFolder,
    refreshStorage,
  } = useLocalMedia()

  const toast = useToast()
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addType, setAddType] = useState<'movies' | 'tv'>('movies')
  const [addName, setAddName] = useState('')
  const [addPath, setAddPath] = useState('')
  const [adding, setAdding] = useState(false)
  const [activeMediaFilter, setActiveMediaFilter] = useState<'all' | 'movies' | 'tv'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedSeriesId, setExpandedSeriesId] = useState<string | null>(null)

  const nameId = useId()
  const pathId = useId()

  const handleBrowseFolder = async () => {
    try {
      const selected = await chooseFolder(addPath || undefined)
      if (selected) {
        setAddPath(selected)
        if (!addName) {
          const parts = selected.replace(/[\\/]+$/, '').split(/[\\/]/)
          const leaf = parts[parts.length - 1]
          if (leaf) setAddName(leaf)
        }
      }
    } catch {
      toast('Could not open folder picker.')
    }
  }

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addPath.trim()) {
      toast('Please provide a valid folder path.')
      return
    }
    const finalName = addName.trim() || (addType === 'movies' ? 'Movies' : 'TV Shows')
    setAdding(true)
    try {
      const created = await addLibrary(finalName, addType, addPath.trim())
      if (created) {
        toast(`Added library "${finalName}". Scanning started.`)
        setAddModalOpen(false)
        setAddName('')
        setAddPath('')
      } else {
        toast('Failed to save library. Ensure folder is accessible.')
      }
    } finally {
      setAdding(false)
    }
  }

  const handleScan = async (lib: LocalLibrary) => {
    toast(`Scanning "${lib.name}"...`)
    const res = await scanLibrary(lib.id)
    if (res) {
      toast(`Scan complete: ${res.itemsIndexed} indexed, ${res.itemsRemoved} removed.`)
    } else {
      toast(`Scan completed for "${lib.name}".`)
    }
    await refreshStorage()
  }

  const handleRemove = async (lib: LocalLibrary) => {
    if (window.confirm(`Are you sure you want to disconnect folder "${lib.name}"? Media files will not be deleted from disk.`)) {
      const ok = await removeLibrary(lib.id)
      if (ok) {
        toast(`Disconnected "${lib.name}".`)
      }
    }
  }

  const filteredMovies = catalogue.movies.filter((m) => {
    if (activeMediaFilter === 'tv') return false
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return m.title.toLowerCase().includes(q) || (m.year && m.year.toString().includes(q))
  })

  const filteredSeries = catalogue.series.filter((s) => {
    if (activeMediaFilter === 'movies') return false
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return s.title.toLowerCase().includes(q) || (s.year && s.year.toString().includes(q))
  })

  return (
    <div className="local-media-tab">
      {/* STORAGE OVERVIEW HUD */}
      {storageSummary && (
        <section className="storage-overview-card" aria-label="System Storage Overview">
          <div className="storage-overview-head">
            <div className="storage-stat-group">
              <span className="storage-stat-icon">
                <Icon name="hardDrive" size={24} />
              </span>
              <div>
                <h3 className="storage-stat-title">Connected Storage Volumes</h3>
                <p className="storage-stat-sub">
                  {storageSummary.volumes.length} physical drive volume(s) connected
                </p>
              </div>
            </div>
            <div className="storage-metric-summary">
              <span className="storage-metric-val">
                {formatBytes(storageSummary.availableDiskBytes)} free of {formatBytes(storageSummary.totalDiskBytes)}
              </span>
              <span className="storage-metric-pct">
                {storageSummary.percentUsed.toFixed(1)}% Used
              </span>
            </div>
          </div>

          <div className="storage-bar-track" aria-hidden="true">
            <div
              className="storage-bar-fill"
              style={{ width: `${Math.min(100, Math.max(0, storageSummary.percentUsed))}%` }}
            />
          </div>

          <div className="storage-volumes-grid">
            {storageSummary.volumes.map((vol) => (
              <div key={vol.id} className="storage-volume-pill" title={`${vol.label} (${vol.mountPoint})`}>
                <Icon name="hardDrive" size={14} />
                <span className="vol-mount">{vol.mountPoint}</span>
                <span className="vol-avail">{formatBytes(vol.availableBytes)} free</span>
              </div>
            ))}
            <div className="storage-volume-pill is-indexed">
              <Icon name="film" size={14} />
              <span className="vol-mount">Indexed in Kinora</span>
              <span className="vol-avail">
                {formatBytes(storageSummary.mediaIndexedBytes)} ({storageSummary.mediaItemCount} titles)
              </span>
            </div>
          </div>
        </section>
      )}

      {/* LIBRARIES CONTROLS */}
      <section className="local-libraries-section">
        <div className="section-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 className="section-title">
              <Icon name="folder" size={20} />
              Local Media Folders
            </h2>
            <p className="section-sub">
              Manage personal movie and TV directories scanned from your internal or external drives.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setAddModalOpen(true)}
            data-testid="add-local-folder-btn"
          >
            <Icon name="plus" size={16} />
            Connect Folder
          </button>
        </div>

        {libraries.length === 0 ? (
          <div className="local-empty-card">
            <Icon name="folder" size={36} />
            <h3>No Local Folders Connected</h3>
            <p>
              Connect folders containing your personal movies or TV series to stream them directly
              within Kinora with automatic technical badges, resolution detection, and local artwork.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setAddModalOpen(true)}
            >
              <Icon name="plus" size={16} />
              Connect Folder
            </button>
          </div>
        ) : (
          <div className="local-libraries-grid">
            {libraries.map((lib) => {
              const isScanning = Boolean(scanning[lib.id])
              return (
                <div key={lib.id} className="local-library-card">
                  <div className="lib-card-top">
                    <span className="lib-type-badge">
                      <Icon name={lib.mediaType === 'movies' ? 'film' : 'series'} size={14} />
                      {lib.mediaType === 'movies' ? 'Movies' : 'TV Shows'}
                    </span>
                    <span className="lib-last-scan">{timeAgo(lib.lastScannedAt)}</span>
                  </div>

                  <h3 className="lib-name">{lib.name}</h3>
                  <code className="lib-path" title={lib.folders.join(', ')}>
                    {lib.folders[0] || 'No path configured'}
                  </code>

                  <div className="lib-card-actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleScan(lib)}
                      disabled={isScanning}
                      title="Scan folder for new and updated media files"
                    >
                      <Icon name={isScanning ? 'refresh' : 'search'} size={14} className={isScanning ? 'spin' : ''} />
                      {isScanning ? 'Scanning...' : 'Scan Now'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleRemove(lib)}
                      title="Disconnect folder from Kinora"
                    >
                      <Icon name="trash" size={14} />
                      Disconnect
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* INDEXED MEDIA CATALOGUE */}
      {(catalogue.movies.length > 0 || catalogue.series.length > 0) && (
        <section className="indexed-media-section">
          <div className="indexed-toolbar">
            <div className="filter-chips">
              <button
                type="button"
                className={`chip ${activeMediaFilter === 'all' ? 'is-active' : ''}`}
                onClick={() => setActiveMediaFilter('all')}
              >
                All Media ({catalogue.movies.length + catalogue.series.length})
              </button>
              <button
                type="button"
                className={`chip ${activeMediaFilter === 'movies' ? 'is-active' : ''}`}
                onClick={() => setActiveMediaFilter('movies')}
              >
                Movies ({catalogue.movies.length})
              </button>
              <button
                type="button"
                className={`chip ${activeMediaFilter === 'tv' ? 'is-active' : ''}`}
                onClick={() => setActiveMediaFilter('tv')}
              >
                TV Series ({catalogue.series.length})
              </button>
            </div>

            <div className="indexed-search">
              <Icon name="search" size={16} />
              <input
                type="search"
                className="input input-sm"
                placeholder="Filter local titles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Filter local titles"
              />
            </div>
          </div>

          {/* MOVIES GRID */}
          {filteredMovies.length > 0 && (
            <div className="media-group">
              <h3 className="group-title">
                <Icon name="film" size={18} />
                Indexed Movies ({filteredMovies.length})
              </h3>
              <div className="local-media-grid">
                {filteredMovies.map((movie) => (
                  <div key={movie.id} className="local-movie-card">
                    <div className="movie-poster-wrap">
                      <LocalMediaArt
                        mediaId={movie.id}
                        title={movie.title}
                        year={movie.year}
                        kind="movie"
                        variant="poster"
                        localArtPath={movie.artPath}
                        className="movie-poster"
                      />
                      <div className="movie-poster-overlay">
                        <Link
                          to={`/watch/${encodeURIComponent('local-movie:' + movie.id)}`}
                          className="btn btn-primary btn-sm"
                          title={`Play ${movie.title}`}
                        >
                          <Icon name="play" size={14} /> Play
                        </Link>
                      </div>
                      <span className="local-badge">Local</span>
                      {movie.resolution && (
                        <span className="res-badge">{movie.resolution}</span>
                      )}
                    </div>
                    <div className="movie-info">
                      <strong className="movie-title" title={movie.title}>{movie.title}</strong>
                      <div className="movie-meta">
                        {movie.year && <span>{movie.year}</span>}
                        {movie.edition && <span className="edition-tag">{movie.edition}</span>}
                        <span>{formatBytes(movie.fileSizeBytes)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SERIES GRID */}
          {filteredSeries.length > 0 && (
            <div className="media-group">
              <h3 className="group-title">
                <Icon name="series" size={18} />
                Indexed TV Series ({filteredSeries.length})
              </h3>
              <div className="local-series-list">
                {filteredSeries.map((s) => {
                  const totalEpisodes = s.seasons.reduce((acc, sn) => acc + sn.episodes.length, 0)
                  const isExpanded = expandedSeriesId === s.id
                  return (
                    <div key={s.id} className="local-series-card">
                      <div className="series-header-row" onClick={() => setExpandedSeriesId(isExpanded ? null : s.id)}>
                        <div className="series-main-meta">
                          <Icon name="series" size={20} />
                          <div>
                            <strong className="series-title">{s.title}</strong>
                            <span className="series-sub">
                              {s.year ? `${s.year} · ` : ''}{s.seasons.length} Season(s), {totalEpisodes} Episode(s)
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          aria-label={isExpanded ? 'Collapse season details' : 'Expand season details'}
                        >
                          <Icon name={isExpanded ? 'up' : 'down'} size={16} />
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="series-episodes-panel">
                          {s.seasons.map((season) => (
                            <div key={season.seasonNumber} className="season-group">
                              <h4 className="season-heading">Season {season.seasonNumber}</h4>
                              <div className="episodes-list">
                                {season.episodes.map((ep) => (
                                  <div key={ep.id} className="episode-row">
                                    <div className="ep-meta">
                                      <span className="ep-num">E{ep.episodeNumber}</span>
                                      <span className="ep-title">{ep.title || `Episode ${ep.episodeNumber}`}</span>
                                      {ep.resolution && <span className="res-badge">{ep.resolution}</span>}
                                      <span className="ep-size">{formatBytes(ep.fileSizeBytes)}</span>
                                    </div>
                                    <Link
                                      to={`/watch/${encodeURIComponent('local-episode:' + ep.id)}`}
                                      className="btn btn-secondary btn-sm"
                                    >
                                      <Icon name="play" size={12} /> Play
                                    </Link>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ADD LIBRARY MODAL */}
      <Dialog
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Connect Local Media Folder"
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setAddModalOpen(false)}
              disabled={adding}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="add-local-folder-form"
              className="btn btn-primary"
              disabled={adding || !addPath.trim()}
            >
              {adding ? 'Connecting...' : 'Connect & Scan'}
            </button>
          </>
        }
      >
        <form id="add-local-folder-form" onSubmit={handleAddSubmit} className="add-library-form">
          <p className="modal-description">
            Choose a directory containing movies or television series. Kinora will index videos,
            detect resolutions, and map local poster and backdrop art without modifying your files.
          </p>

          <div className="form-field">
            <span className="label">Content Type</span>
            <div className="radio-pill-group">
              <button
                type="button"
                className={`pill-btn ${addType === 'movies' ? 'is-selected' : ''}`}
                onClick={() => setAddType('movies')}
              >
                <Icon name="film" size={16} /> Movies
              </button>
              <button
                type="button"
                className={`pill-btn ${addType === 'tv' ? 'is-selected' : ''}`}
                onClick={() => setAddType('tv')}
              >
                <Icon name="series" size={16} /> TV Shows
              </button>
            </div>
          </div>

          <div className="form-field">
            <label htmlFor={nameId} className="label">Library Name</label>
            <input
              id={nameId}
              type="text"
              className="input"
              placeholder={addType === 'movies' ? 'e.g. 4K Movies, Documentaries' : 'e.g. Anime, Drama Series'}
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
            />
          </div>

          <div className="form-field">
            <label htmlFor={pathId} className="label">Folder Directory Path</label>
            <div className="input-group">
              <input
                id={pathId}
                type="text"
                className="input"
                placeholder={addType === 'movies' ? '/mnt/storage/Movies' : '/mnt/storage/TV'}
                value={addPath}
                onChange={(e) => setAddPath(e.target.value)}
                required
              />
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleBrowseFolder}
                title="Browse folder via system dialog"
              >
                <Icon name="folder" size={16} /> Browse...
              </button>
            </div>
            <span className="input-hint">
              Absolute path to your local media directory. Kinora verifies path containment before playback.
            </span>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
