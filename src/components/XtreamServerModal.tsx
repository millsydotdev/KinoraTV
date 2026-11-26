import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { Switch } from './ui'
import {
  addMirror,
  getAccountFallbackConfig,
  removeMirror,
  setActiveServer,
  testAllAccountMirrors,
  testMirrorLatency,
  toggleAutoFailover,
  type XtreamAccountFallbackConfig,
} from '../lib/xtreamFallback'
import './XtreamServerModal.css'

export interface XtreamServerModalProps {
  open: boolean
  onClose: () => void
  sourceId: string
  sourceName: string
  primaryServer: string
  onServerSwitched?: (newServerUrl: string) => void
}

export function XtreamServerModal({
  open,
  onClose,
  sourceId,
  sourceName,
  primaryServer,
  onServerSwitched,
}: XtreamServerModalProps) {
  const [config, setConfig] = useState<XtreamAccountFallbackConfig>(() =>
    getAccountFallbackConfig(sourceId, primaryServer),
  )
  const [newUrl, setNewUrl] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [isTesting, setIsTesting] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setConfig(getAccountFallbackConfig(sourceId, primaryServer))
    }
  }, [open, sourceId, primaryServer])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newUrl.trim()) return
    const updated = addMirror(sourceId, newUrl, newLabel, primaryServer)
    setConfig({ ...updated })
    setNewUrl('')
    setNewLabel('')
  }

  const handleRemove = (mirrorId: string) => {
    const updated = removeMirror(sourceId, mirrorId)
    setConfig({ ...updated })
  }

  const handleSelectActive = (serverUrl: string) => {
    const updated = setActiveServer(sourceId, serverUrl)
    setConfig({ ...updated })
    onServerSwitched?.(serverUrl)
  }

  const handleToggleFailover = (enabled: boolean) => {
    const updated = toggleAutoFailover(sourceId, enabled)
    setConfig({ ...updated })
  }

  const handleTestSingle = async (mirrorId: string, url: string) => {
    setTestingId(mirrorId)
    try {
      const res = await testMirrorLatency(url)
      setConfig((prev) => ({
        ...prev,
        mirrors: prev.mirrors.map((m) =>
          m.id === mirrorId
            ? {
                ...m,
                lastChecked: Date.now(),
                latencyMs: res.latencyMs,
                status: res.ok
                  ? m.url === prev.activeServerUrl
                    ? 'active'
                    : 'standby'
                  : 'error',
                errorMessage: res.error,
              }
            : m,
        ),
      }))
    } finally {
      setTestingId(null)
    }
  }

  const handleTestAll = async () => {
    setIsTesting(true)
    try {
      const updated = await testAllAccountMirrors(sourceId)
      setConfig({ ...updated })
    } finally {
      setIsTesting(false)
    }
  }

  const isPrimaryActive = config.activeServerUrl === config.primaryServer

  return (
    <div
      className="xtream-server-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="xtream-server-modal-heading"
    >
      <div className="xtream-server-modal" onClick={(e) => e.stopPropagation()}>
        <div className="xtream-server-header">
          <div className="xtream-server-title" id="xtream-server-modal-heading">
            <Icon name="link" size={20} />
            <span>Server Mirrors & DNS Failover: {sourceName}</span>
          </div>
          <button
            type="button"
            className="xtream-server-close"
            onClick={onClose}
            aria-label="Close server failover configuration"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="xtream-server-body">
          {/* Active Server Card */}
          <div className="xtream-server-card">
            <div className="xtream-server-card-header">
              <span className="xtream-server-card-title">Active Endpoint</span>
              <span className="xtream-server-active-pill">
                <Icon name="check" size={12} />
                Live Connection
              </span>
            </div>
            <div className="xtream-server-url-display">
              {config.activeServerUrl || 'No server active'}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 4,
              }}
            >
              <span style={{ fontSize: '0.85rem', color: 'var(--fg-dim, #9ca3af)' }}>
                Auto-failover on stream stalls or network drops
              </span>
              <Switch
                checked={config.autoFailoverEnabled}
                onChange={handleToggleFailover}
                label="Toggle auto failover"
                id="xtream-auto-failover-switch"
              />
            </div>
          </div>

          {/* Primary Server Row */}
          <div className="xtream-mirror-list">
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--fg-dim)' }}>
              Primary & Backup Mirrors
            </div>

            <div
              className={`xtream-mirror-item ${isPrimaryActive ? 'is-active' : ''}`}
            >
              <div className="xtream-mirror-info">
                <div className="xtream-mirror-label">
                  <span>Primary Host</span>
                  {isPrimaryActive && (
                    <span className="xtream-server-active-pill">Active</span>
                  )}
                </div>
                <div className="xtream-mirror-url">{config.primaryServer}</div>
              </div>
              <div className="xtream-mirror-actions">
                {!isPrimaryActive && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() => handleSelectActive(config.primaryServer)}
                  >
                    Switch to Primary
                  </button>
                )}
              </div>
            </div>

            {/* Configured Mirrors */}
            {config.mirrors.map((mirror) => {
              const isActive = mirror.url === config.activeServerUrl
              return (
                <div
                  key={mirror.id}
                  className={`xtream-mirror-item ${isActive ? 'is-active' : ''}`}
                >
                  <div className="xtream-mirror-info">
                    <div className="xtream-mirror-label">
                      <span>{mirror.label}</span>
                      {isActive ? (
                        <span className="xtream-server-active-pill">Active</span>
                      ) : mirror.status === 'error' ? (
                        <span className="xtream-server-active-pill error">Offline</span>
                      ) : (
                        <span className="xtream-server-active-pill standby">Standby</span>
                      )}
                      {mirror.latencyMs !== undefined && mirror.latencyMs >= 0 && (
                        <span
                          className={`xtream-server-latency-badge ${
                            mirror.latencyMs > 250
                              ? 'slow'
                              : mirror.status === 'error'
                                ? 'down'
                                : ''
                          }`}
                        >
                          {mirror.latencyMs}ms
                        </span>
                      )}
                    </div>
                    <div className="xtream-mirror-url">{mirror.url}</div>
                    {mirror.errorMessage && (
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: '#f87171',
                          marginTop: 2,
                        }}
                      >
                        {mirror.errorMessage}
                      </div>
                    )}
                  </div>
                  <div className="xtream-mirror-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      disabled={testingId === mirror.id}
                      onClick={() => handleTestSingle(mirror.id, mirror.url)}
                      aria-label={`Test latency for ${mirror.label}`}
                    >
                      {testingId === mirror.id ? 'Testing...' : 'Test'}
                    </button>
                    {!isActive && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        onClick={() => handleSelectActive(mirror.url)}
                      >
                        Make Active
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => handleRemove(mirror.id)}
                      aria-label={`Remove mirror ${mirror.label}`}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add Mirror Form */}
          <form className="xtream-server-add-form" onSubmit={handleAdd}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--fg-dim)' }}>
              Add Backup Domain or Alternate DNS
            </div>
            <div className="xtream-server-add-inputs">
              <input
                type="text"
                placeholder="http://mirror.example.com:8080"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                style={{
                  flex: 2,
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-sm, 6px)',
                  background: 'rgb(255 255 255 / 0.05)',
                  border: '1px solid var(--border, #2a2e3d)',
                  color: 'var(--fg, #ffffff)',
                }}
              />
              <input
                type="text"
                placeholder="Label (optional)"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                style={{
                  flex: 1,
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-sm, 6px)',
                  background: 'rgb(255 255 255 / 0.05)',
                  border: '1px solid var(--border, #2a2e3d)',
                  color: 'var(--fg, #ffffff)',
                }}
              />
              <button type="submit" className="btn btn-primary btn-small">
                <Icon name="plus" size={14} />
                Add Mirror
              </button>
            </div>
          </form>
        </div>

        <div className="xtream-server-footer">
          <button
            type="button"
            className="btn btn-ghost btn-small"
            disabled={isTesting}
            onClick={handleTestAll}
          >
            <Icon name="refresh" size={14} />
            {isTesting ? 'Testing all endpoints...' : 'Test all endpoints'}
          </button>
          <button type="button" className="btn btn-secondary btn-small" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
