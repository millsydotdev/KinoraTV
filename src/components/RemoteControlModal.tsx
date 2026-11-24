// RemoteControlModal.tsx - Wireless mobile remote control and trusted device management hub.
// Shows 4-digit pairing PIN, inline QR code, local Wi-Fi URL, connected devices, and audit log.
// Strictly adheres to project typography standards: zero em-dashes across all code and comments.

import { useEffect, useState, useMemo } from 'react'
import { Icon } from './Icon'
import {
  getRemoteServerStatus,
  startRemoteServer,
  stopRemoteServer,
  getTrustedDevices,
  revokeTrustedDevice,
  renameTrustedDevice,
  getAuditLog,
  type RemoteServerStatus,
  type TrustedDevice,
  type AuditedAction,
} from '../lib/native'
import { generateQrMatrix, qrMatrixToSvgPath } from '../lib/qrCode'
import './RemoteControlModal.css'

export interface RemoteControlModalProps {
  open: boolean
  onClose: () => void
}

export function RemoteControlModal({ open, onClose }: RemoteControlModalProps) {
  const [status, setStatus] = useState<RemoteServerStatus | null>(null)
  const [devices, setDevices] = useState<TrustedDevice[]>([])
  const [auditLog, setAuditLog] = useState<AuditedAction[]>([])
  const [activeTab, setActiveTab] = useState<'pairing' | 'devices' | 'audit'>('pairing')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  // Load status and data on open
  useEffect(() => {
    if (!open) return
    let active = true

    async function load() {
      const res = await getRemoteServerStatus()
      if (active) {
        if (res && !res.running) {
          // Auto-start server if currently inactive
          const started = await startRemoteServer(res.port, res.pairingPin)
          setStatus(started ?? res)
        } else {
          setStatus(res)
        }
      }

      const devList = await getTrustedDevices()
      if (active) setDevices(devList)

      const audits = await getAuditLog()
      if (active) setAuditLog(audits)
    }

    load()
    return () => {
      active = false
    }
  }, [open])

  // Generate QR code SVG
  const qrSvgData = useMemo(() => {
    if (!status || !status.serverUrl) return null
    try {
      const matrix = generateQrMatrix(status.serverUrl)
      const cellSize = 6
      const path = qrMatrixToSvgPath(matrix, cellSize)
      const totalSize = matrix.size * cellSize
      return { path, totalSize }
    } catch (e) {
      console.error('Failed to generate QR code:', e)
      return null
    }
  }, [status?.serverUrl])

  if (!open) return null

  const handleToggleRunning = async () => {
    if (!status) return
    setLoading(true)
    try {
      if (status.running) {
        await stopRemoteServer()
        setStatus({ ...status, running: false, connectedClients: 0 })
      } else {
        const next = await startRemoteServer(status.port, status.pairingPin)
        if (next) setStatus(next)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleRegeneratePin = async () => {
    if (!status) return
    setLoading(true)
    try {
      const newPin = Math.floor(100000 + Math.random() * 900000).toString()
      await stopRemoteServer()
      const next = await startRemoteServer(status.port, newPin)
      if (next) setStatus(next)
    } finally {
      setLoading(false)
    }
  }

  const handleRefreshData = async () => {
    setLoading(true)
    try {
      const [res, devList, audits] = await Promise.all([
        getRemoteServerStatus(),
        getTrustedDevices(),
        getAuditLog(),
      ])
      if (res) setStatus(res)
      setDevices(devList)
      setAuditLog(audits)
    } finally {
      setLoading(false)
    }
  }

  const handleCopyUrl = async () => {
    if (!status?.serverUrl) return
    try {
      await navigator.clipboard.writeText(status.serverUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Ignore clipboard write failure
    }
  }

  const handleRevokeDevice = async (deviceId: string) => {
    const ok = await revokeTrustedDevice(deviceId)
    if (ok) {
      setDevices(devices.map((d) => (d.id === deviceId ? { ...d, revoked: true } : d)))
      const audits = await getAuditLog()
      setAuditLog(audits)
    }
  }

  const handleStartRename = (dev: TrustedDevice) => {
    setEditingDeviceId(dev.id)
    setEditingName(dev.name)
  }

  const handleSaveRename = async (deviceId: string) => {
    const trimmed = editingName.trim()
    if (!trimmed) return
    const ok = await renameTrustedDevice(deviceId, trimmed)
    if (ok) {
      setDevices(devices.map((d) => (d.id === deviceId ? { ...d, name: trimmed } : d)))
    }
    setEditingDeviceId(null)
    setEditingName('')
  }

  const isRunning = status?.running ?? false
  const activeDevices = devices.filter((d) => !d.revoked)
  const clientCount = status?.connectedClients ?? activeDevices.length

  return (
    <div className="remote-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="remote-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="remote-modal-header">
          <div className="remote-modal-title">
            <Icon name="remote" size={20} />
            <span>Wireless Remote Control & Connected Devices</span>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-icon-only"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <nav className="remote-tab-bar">
          <button
            type="button"
            className={`remote-tab-btn ${activeTab === 'pairing' ? 'active' : ''}`}
            onClick={() => setActiveTab('pairing')}
          >
            Pairing & QR Code
          </button>
          <button
            type="button"
            className={`remote-tab-btn ${activeTab === 'devices' ? 'active' : ''}`}
            onClick={() => setActiveTab('devices')}
          >
            Trusted Devices ({activeDevices.length})
          </button>
          <button
            type="button"
            className={`remote-tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit')}
          >
            Audit Log
          </button>
        </nav>

        <div className="remote-modal-body">
          <div className="remote-status-banner">
            <div className="remote-status-indicator">
              <span className={`status-dot ${isRunning ? 'online' : ''}`} />
              <span>{isRunning ? 'Server Online' : 'Server Stopped'}</span>
              {isRunning && status && (
                <span style={{ color: 'var(--text-muted)' }}>: port {status.port}</span>
              )}
            </div>
            <div className="remote-clients-badge">
              {clientCount === 1 ? '1 client connected' : `${clientCount} clients connected`}
            </div>
          </div>

          {activeTab === 'pairing' ? (
            <>
              {isRunning && status ? (
                <div className="remote-pairing-section">
                  <div className="remote-qr-container" title="Scan with mobile camera to open remote">
                    {qrSvgData ? (
                      <svg
                        viewBox={`0 0 ${qrSvgData.totalSize} ${qrSvgData.totalSize}`}
                        shapeRendering="crispEdges"
                      >
                        <path d={qrSvgData.path} fill="#0d0f14" />
                      </svg>
                    ) : (
                      <Icon name="radar" size={48} />
                    )}
                  </div>

                  <div className="remote-details-column">
                    <div className="remote-pin-block">
                      <span className="remote-pin-label">Pairing PIN</span>
                      <span className="remote-pin-display">{status.pairingPin}</span>
                    </div>

                    <div className="remote-url-block">
                      <span className="remote-pin-label">Browser Address</span>
                      <div className="remote-url-input-wrap">
                        <input
                          type="text"
                          className="remote-url-input"
                          value={status.serverUrl}
                          readOnly
                        />
                        <button
                          type="button"
                          className="btn btn-ghost btn-small"
                          onClick={handleCopyUrl}
                          title="Copy URL"
                        >
                          <Icon name={copied ? 'checkCircle' : 'copy'} size={14} />
                          {copied ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                  Server is currently inactive. Click Start Server below to enable remote access and device pairing.
                </div>
              )}

              <div className="remote-instructions">
                <ol>
                  <li>Ensure your smartphone, tablet, or AI agent is on the same local Wi-Fi.</li>
                  <li>Scan the QR code or open the browser address shown above.</li>
                  <li>Enter the pairing PIN on your device to complete secure pairing.</li>
                </ol>
              </div>
            </>
          ) : activeTab === 'devices' ? (
            <div className="remote-devices-list">
              {devices.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)' }}>
                  No trusted devices paired yet. Scan the QR code from any phone or tablet to connect.
                </div>
              ) : (
                devices.map((dev) => (
                  <div key={dev.id} className="device-item-card">
                    <div className="device-info-left">
                      <div className="device-name-row">
                        {editingDeviceId === dev.id ? (
                          <input
                            type="text"
                            className="remote-url-input"
                            aria-label="New device name"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void handleSaveRename(dev.id)
                              if (e.key === 'Escape') setEditingDeviceId(null)
                            }}
                            style={{ maxWidth: '180px', padding: '4px 8px', fontSize: '0.85rem' }}
                            autoFocus
                          />
                        ) : (
                          <span>{dev.name}</span>
                        )}
                        <span className="device-badge">{dev.deviceType}</span>
                        {dev.revoked && <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>(Revoked)</span>}
                      </div>
                      <div className="device-meta-row">
                        <span>IP: {dev.ipAddress || 'LAN'}</span> &bull;{' '}
                        <span>Capabilities: {dev.capabilities.join(', ')}</span>
                      </div>
                    </div>
                    {!dev.revoked && (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {editingDeviceId === dev.id ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-primary btn-small"
                              onClick={() => void handleSaveRename(dev.id)}
                              title="Save device name"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-small"
                              onClick={() => setEditingDeviceId(null)}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="btn btn-ghost btn-small"
                              onClick={() => handleStartRename(dev)}
                              title="Rename device"
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-small"
                              onClick={() => handleRevokeDevice(dev.id)}
                              style={{ color: '#ef4444' }}
                              title="Revoke device access"
                            >
                              Revoke
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="remote-audit-container">
              {auditLog.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)' }}>
                  No audit actions recorded in this session.
                </div>
              ) : (
                <table className="audit-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Device</th>
                      <th>Action</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLog.slice(-15).reverse().map((a) => (
                      <tr key={a.id}>
                        <td>{new Date(a.timestamp * 1000).toLocaleTimeString()}</td>
                        <td>{a.deviceName}</td>
                        <td>{a.action}</td>
                        <td style={{ color: a.status === 'success' || a.status === 'dispatched' ? '#10b981' : '#f59e0b' }}>
                          {a.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        <div className="remote-modal-footer">
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={handleRegeneratePin}
              disabled={loading || !isRunning}
            >
              <Icon name="refresh" size={14} />
              New PIN
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={handleRefreshData}
              disabled={loading}
              title="Refresh connected devices and audit log"
            >
              Refresh
            </button>
          </div>

          <button
            type="button"
            className={`btn ${isRunning ? 'btn-ghost' : 'btn-primary'} btn-small`}
            onClick={handleToggleRunning}
            disabled={loading}
          >
            <Icon name={isRunning ? 'eyeOff' : 'wifi'} size={14} />
            {isRunning ? 'Stop Server' : 'Start Server'}
          </button>
        </div>
      </div>
    </div>
  )
}
