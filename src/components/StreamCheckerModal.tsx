// StreamCheckerModal.tsx - Stream health inspector modal with bulk availability verification.
// Concurrency-limited native network checks and verified bouquet creation.
// Strictly adheres to typography standards: zero em-dashes across all code and comments.

import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import {
  StreamHealthChecker,
  probeChannelStream,
  filterHealthyChannelIds,
  type StreamProbeResult,
  type StreamCheckerProgress,
} from '../lib/streamChecker'
import { createBouquet } from '../lib/bouquetManager'
import type { Channel } from '../data/types'
import './StreamCheckerModal.css'

export interface StreamCheckerModalProps {
  open: boolean
  onClose: () => void
  channels: Channel[]
  profileId?: string
  onBouquetCreated?: (bouquetName: string) => void
}

export function StreamCheckerModal({
  open,
  onClose,
  channels,
  profileId = 'default',
  onBouquetCreated,
}: StreamCheckerModalProps) {
  const [filter, setFilter] = useState<'all' | 'online' | 'offline' | 'blocked'>('all')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Map<string, StreamProbeResult>>(() => new Map())
  const [progress, setProgress] = useState<StreamCheckerProgress>({
    total: channels.length,
    checked: 0,
    online: 0,
    offline: 0,
    blocked: 0,
    avgLatencyMs: 0,
    percent: 0,
    isRunning: false,
    isPaused: false,
  })
  const [notice, setNotice] = useState<string | null>(null)
  const checkerRef = useRef<StreamHealthChecker | null>(null)

  // Initialize health checker instance
  useEffect(() => {
    if (!open) return
    const checker = new StreamHealthChecker(channels, 3)
    checkerRef.current = checker

    const unsub = checker.subscribe((p, res) => {
      setProgress(p)
      setResults(new Map(res))
    })

    return () => {
      checker.cancel()
      unsub()
      checkerRef.current = null
    }
  }, [open, channels])

  if (!open) return null

  const handleStart = () => {
    setNotice(null)
    checkerRef.current?.start()
  }

  const handlePause = () => {
    checkerRef.current?.pause()
  }

  const handleResume = () => {
    checkerRef.current?.resume()
  }

  const handleCancel = () => {
    checkerRef.current?.cancel()
  }

  const handleSingleProbe = async (channel: Channel) => {
    const res = await probeChannelStream(channel)
    setResults((prev) => {
      const next = new Map(prev)
      next.set(channel.id, res)
      return next
    })
  }

  const handleCreateBouquet = () => {
    const healthyIds = filterHealthyChannelIds(results)
    if (healthyIds.length === 0) return

    const dateStr = new Date().toISOString().slice(0, 10)
    const name = `Verified Channels (${dateStr})`
    createBouquet(name, healthyIds, 'check', profileId)
    onBouquetCreated?.(name)
    setNotice(`Created bouquet "${name}" with ${healthyIds.length} verified streams.`)
  }

  const resultList = Array.from(results.values())
  const filteredList = resultList.filter((item) => {
    if (filter === 'online' && item.status !== 'online') return false
    if (filter === 'offline' && item.status !== 'offline' && item.status !== 'timeout') return false
    if (filter === 'blocked' && item.status !== 'blocked') return false

    if (search.trim()) {
      const q = search.toLowerCase()
      const matchName = item.channelName.toLowerCase().includes(q)
      const matchGroup = item.group ? item.group.toLowerCase().includes(q) : false
      const matchNumber = item.channelNumber ? String(item.channelNumber).includes(q) : false
      if (!matchName && !matchGroup && !matchNumber) return false
    }

    return true
  })

  const onlineCount = progress.online

  return (
    <div
      className="stream-checker-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Stream Health Inspector"
    >
      <div className="stream-checker-dialog">
        {/* Header */}
        <header className="stream-checker-header">
          <div className="stream-checker-title-group">
            <Icon name="activity" size={24} className="stream-checker-title-icon" />
            <div>
              <h2 className="stream-checker-title">Stream Health Inspector</h2>
              <p className="stream-checker-subtitle">
                Safely probes remote channel endpoints via native guarded networking.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close Stream Health Inspector"
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        {/* Stats summary */}
        <div className="stream-checker-stats-bar">
          <span className="stream-stat-pill online">
            <Icon name="check" size={12} />
            <span>Online: {progress.online}</span>
          </span>
          <span className="stream-stat-pill offline">
            <Icon name="x" size={12} />
            <span>Offline: {progress.offline}</span>
          </span>
          <span className="stream-stat-pill blocked">
            <Icon name="warning" size={12} />
            <span>Blocked / Timeout: {progress.blocked}</span>
          </span>
          {progress.avgLatencyMs > 0 && (
            <span className="stream-stat-pill latency">
              <Icon name="clock" size={12} />
              <span>Avg Latency: {progress.avgLatencyMs} ms</span>
            </span>
          )}
          <span style={{ fontSize: '0.75rem', opacity: 0.7, marginLeft: 'auto' }}>
            {progress.checked} / {progress.total} Checked ({progress.percent}%)
          </span>
        </div>

        {/* Progress bar */}
        <div className="stream-checker-progress-container">
          <div className="stream-checker-progress-track">
            <div
              className="stream-checker-progress-fill"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="stream-checker-toolbar">
          <div className="stream-checker-actions">
            {!progress.isRunning ? (
              <button
                type="button"
                className="btn btn-primary btn-small"
                onClick={handleStart}
              >
                <Icon name="play" size={14} />
                <span>{progress.checked > 0 ? 'Restart Inspection' : 'Start Inspection'}</span>
              </button>
            ) : progress.isPaused ? (
              <button
                type="button"
                className="btn btn-primary btn-small"
                onClick={handleResume}
              >
                <Icon name="play" size={14} />
                <span>Resume</span>
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={handlePause}
              >
                <Icon name="pause" size={14} />
                <span>Pause</span>
              </button>
            )}

            {progress.isRunning && (
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={handleCancel}
              >
                <Icon name="close" size={14} />
                <span>Stop</span>
              </button>
            )}

            <button
              type="button"
              className="btn btn-secondary btn-small"
              disabled={onlineCount === 0}
              onClick={handleCreateBouquet}
              title={onlineCount === 0 ? 'No online channels detected' : 'Create a new bouquet from online streams'}
            >
              <Icon name="sparkles" size={14} />
              <span>Create Verified Bouquet ({onlineCount})</span>
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Filter tabs */}
            <div className="stream-checker-filter-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={filter === 'all'}
                className={`stream-tab-btn ${filter === 'all' ? 'is-active' : ''}`}
                onClick={() => setFilter('all')}
              >
                All ({resultList.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filter === 'online'}
                className={`stream-tab-btn ${filter === 'online' ? 'is-active' : ''}`}
                onClick={() => setFilter('online')}
              >
                Online ({progress.online})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filter === 'offline'}
                className={`stream-tab-btn ${filter === 'offline' ? 'is-active' : ''}`}
                onClick={() => setFilter('offline')}
              >
                Offline ({progress.offline})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={filter === 'blocked'}
                className={`stream-tab-btn ${filter === 'blocked' ? 'is-active' : ''}`}
                onClick={() => setFilter('blocked')}
              >
                Blocked ({progress.blocked})
              </button>
            </div>

            {/* Search */}
            <div className="stream-checker-search">
              <Icon name="search" size={14} />
              <input
                type="text"
                placeholder="Filter channels..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Filter inspected channels"
              />
            </div>
          </div>
        </div>

        {notice && (
          <div
            style={{
              padding: '10px 24px',
              background: 'rgba(16, 185, 129, 0.15)',
              borderBottom: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#10b981',
              fontSize: '0.8125rem',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Icon name="check" size={16} />
            <span>{notice}</span>
          </div>
        )}

        {/* Results Table */}
        <div className="stream-checker-table-container">
          <table className="stream-checker-table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>#</th>
                <th>Channel Name</th>
                <th>Category</th>
                <th style={{ width: 140 }}>Status</th>
                <th style={{ width: 100 }}>Latency</th>
                <th style={{ width: 70 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '32px 16px', opacity: 0.6 }}>
                    No channels match the active filter or query.
                  </td>
                </tr>
              ) : (
                filteredList.map((item) => {
                  const rawChan = channels.find((c) => c.id === item.channelId)

                  return (
                    <tr key={item.channelId}>
                      <td style={{ opacity: 0.6 }}>{item.channelNumber || '-'}</td>
                      <td>
                        <strong>{item.channelName}</strong>
                      </td>
                      <td style={{ opacity: 0.8 }}>{item.group || 'General'}</td>
                      <td>
                        <span className={`stream-status-badge ${item.status}`}>
                          {item.status === 'probing' && (
                            <span className="stream-checker-spinner" aria-hidden="true" />
                          )}
                          <span>{item.status}</span>
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.75rem' }}>
                        {item.latencyMs !== undefined ? `${item.latencyMs} ms` : '-'}
                      </td>
                      <td>
                        {rawChan && (
                          <button
                            type="button"
                            className="icon-btn"
                            style={{ width: 24, height: 24 }}
                            onClick={() => handleSingleProbe(rawChan)}
                            title="Re-test channel"
                            aria-label={`Re-test ${item.channelName}`}
                          >
                            <Icon name="refresh" size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <footer className="stream-checker-footer">
          <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>
            Guarded network checking conforms to SSRF and token redaction policies.
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={onClose}
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  )
}
