// RemoteControlModal.tsx - Wireless mobile remote control pairing interface.
// Shows 4-digit pairing PIN, inline QR code, local Wi-Fi URL, and server controls.
// Strictly adheres to project typography standards: zero em-dashes across all code and comments.

import { useEffect, useState, useMemo } from 'react'
import { Icon } from './Icon'
import {
  getRemoteServerStatus,
  startRemoteServer,
  stopRemoteServer,
  type RemoteServerStatus,
} from '../lib/native'
import { generateQrMatrix, qrMatrixToSvgPath } from '../lib/qrCode'
import './RemoteControlModal.css'

export interface RemoteControlModalProps {
  open: boolean
  onClose: () => void
}

export function RemoteControlModal({ open, onClose }: RemoteControlModalProps) {
  const [status, setStatus] = useState<RemoteServerStatus | null>(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)

  // Load status on open
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
      const newPin = Math.floor(1000 + Math.random() * 9000).toString()
      await stopRemoteServer()
      const next = await startRemoteServer(status.port, newPin)
      if (next) setStatus(next)
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

  const isRunning = status?.running ?? false
  const clientCount = status?.connectedClients ?? 0

  return (
    <div className="remote-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="remote-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="remote-modal-header">
          <div className="remote-modal-title">
            <Icon name="remote" size={20} />
            <span>Wireless Remote Control</span>
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
                  <span className="remote-pin-label">4-Digit Pairing PIN</span>
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
              Remote server is currently inactive. Click Start below to enable local Wi-Fi control.
            </div>
          )}

          <div className="remote-instructions">
            <ol>
              <li>Ensure your smartphone or tablet is connected to the same Wi-Fi network.</li>
              <li>Scan the QR code with your camera app or open the browser address above.</li>
              <li>Enter the 4-digit PIN on your phone to connect and start controlling playback.</li>
            </ol>
          </div>
        </div>

        <div className="remote-modal-footer">
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
