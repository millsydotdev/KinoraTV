// DownloadsModal.tsx - Modal interface for managing offline VOD and episode downloads.
// Strictly adheres to project typography standards: zero em-dashes across all code and comments.

import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import {
  deleteDownload,
  getDownloads,
  pauseDownload,
  resumeDownload,
  type DownloadItem,
} from '../lib/native'
import {
  calculateProgress,
  formatBytes,
  formatEta,
  formatSpeed,
  getOfflinePlaybackUrl,
  statusLabel,
  statusTone,
} from '../lib/downloader'
import './DownloadsModal.css'

export interface DownloadsModalProps {
  open: boolean
  onClose: () => void
  onPlayItem?: (item: DownloadItem, streamUrl: string) => void
}

type FilterTab = 'all' | 'active' | 'completed'

export function DownloadsModal({ open, onClose, onPlayItem }: DownloadsModalProps) {
  const [items, setItems] = useState<DownloadItem[]>([])
  const [filter, setFilter] = useState<FilterTab>('all')

  const refreshDownloads = async () => {
    try {
      const list = await getDownloads()
      setItems(list)
    } catch {
      // Fail safely
    }
  }

  useEffect(() => {
    if (open) {
      void refreshDownloads()
    }
  }, [open])

  // Polling loop for active downloads
  useEffect(() => {
    if (!open) return

    const hasActive = items.some(
      (i) => i.status === 'downloading' || i.status === 'queued'
    )
    if (!hasActive) return

    const timer = setInterval(() => {
      void refreshDownloads()
    }, 1500)

    return () => clearInterval(timer)
  }, [open, items])

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const handlePause = async (id: string) => {
    await pauseDownload(id)
    await refreshDownloads()
  }

  const handleResume = async (id: string) => {
    await resumeDownload(id)
    await refreshDownloads()
  }

  const handleDelete = async (id: string) => {
    await deleteDownload(id)
    await refreshDownloads()
  }

  const filteredItems = items.filter((item) => {
    if (filter === 'active') {
      return item.status === 'downloading' || item.status === 'queued' || item.status === 'paused'
    }
    if (filter === 'completed') {
      return item.status === 'completed'
    }
    return true
  })

  const activeCount = items.filter(
    (i) => i.status === 'downloading' || i.status === 'queued' || i.status === 'paused'
  ).length
  const completedCount = items.filter((i) => i.status === 'completed').length

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="downloads-modal-title">
      <div className="downloads-modal">
        <div className="downloads-modal-header">
          <div className="downloads-modal-title-group">
            <h2 id="downloads-modal-title" className="downloads-modal-title">
              <Icon name="download" size={20} />
              Downloads & Offline Playback
            </h2>
            <p className="downloads-modal-subtitle">
              Manage downloaded VOD movies, episodes, and offline media
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            aria-label="Close downloads modal"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="downloads-filter-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'all'}
            className={`downloads-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({items.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'active'}
            className={`downloads-tab ${filter === 'active' ? 'active' : ''}`}
            onClick={() => setFilter('active')}
          >
            In Progress ({activeCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'completed'}
            className={`downloads-tab ${filter === 'completed' ? 'active' : ''}`}
            onClick={() => setFilter('completed')}
          >
            Completed ({completedCount})
          </button>
        </div>

        <div className="downloads-modal-body">
          {filteredItems.length === 0 ? (
            <div className="downloads-empty-state">
              <Icon name="download" size={32} />
              <p className="downloads-empty-title">
                {filter === 'active'
                  ? 'No active downloads in progress'
                  : filter === 'completed'
                  ? 'No completed downloads yet'
                  : 'No downloads saved on this device'}
              </p>
              <p className="downloads-empty-hint">
                Downloaded movies and TV episodes will appear here for offline viewing.
              </p>
            </div>
          ) : (
            <div className="downloads-list">
              {filteredItems.map((item) => {
                const progress = calculateProgress(item.downloadedBytes, item.totalBytes)
                const tone = statusTone(item.status)
                const isDownloading = item.status === 'downloading'
                const isPaused = item.status === 'paused'
                const isCompleted = item.status === 'completed'

                return (
                  <div key={item.id} className="download-row">
                    <div className="download-row-media">
                      {item.artworkUrl ? (
                        <img src={item.artworkUrl} alt="" className="download-artwork" />
                      ) : (
                        <div className="download-icon-fallback">
                          <Icon
                            name={item.kind === 'audio' ? 'audio' : 'film'}
                            size={20}
                          />
                        </div>
                      )}
                    </div>

                    <div className="download-row-content">
                      <div className="download-header-line">
                        <span className="download-title" title={item.title}>
                          {item.title}
                        </span>
                        <span className={`download-status-badge ${tone}`}>
                          {statusLabel(item.status)}
                        </span>
                      </div>

                      {!isCompleted && item.status !== 'failed' && (
                        <div className="download-progress-container">
                          <div className="download-progress-bar">
                            <div
                              className="download-progress-fill"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <div className="download-stats-line">
                            <span>
                              {formatBytes(item.downloadedBytes)} of{' '}
                              {item.totalBytes > 0 ? formatBytes(item.totalBytes) : 'Unknown'} ({progress}%)
                            </span>
                            {isDownloading && item.speedBps > 0 && (
                              <span>
                                {formatSpeed(item.speedBps)} · ETA: {formatEta(item.etaSeconds)}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {isCompleted && (
                        <div className="download-completed-info">
                          <span>
                            {formatBytes(item.totalBytes)} · Ready for offline playback
                          </span>
                        </div>
                      )}

                      {item.errorMessage && (
                        <div className="download-error-text">
                          <Icon name="alertCircle" size={12} />
                          <span>{item.errorMessage}</span>
                        </div>
                      )}
                    </div>

                    <div className="download-row-actions">
                      {isCompleted && onPlayItem && (
                        <button
                          type="button"
                          className="btn btn-primary btn-small"
                          onClick={() => onPlayItem(item, getOfflinePlaybackUrl(item))}
                          title="Play offline stream"
                        >
                          <Icon name="play" size={14} />
                          Play
                        </button>
                      )}

                      {isDownloading && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-icon"
                          onClick={() => handlePause(item.id)}
                          aria-label={`Pause ${item.title}`}
                          title="Pause download"
                        >
                          <Icon name="pause" size={14} />
                        </button>
                      )}

                      {isPaused && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-icon"
                          onClick={() => handleResume(item.id)}
                          aria-label={`Resume ${item.title}`}
                          title="Resume download"
                        >
                          <Icon name="play" size={14} />
                        </button>
                      )}

                      <button
                        type="button"
                        className="btn btn-ghost btn-icon download-delete-btn"
                        onClick={() => handleDelete(item.id)}
                        aria-label={`Delete download ${item.title}`}
                        title="Delete download and file"
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
