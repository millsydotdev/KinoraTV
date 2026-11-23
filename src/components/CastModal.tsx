import { useEffect } from 'react'
import { Icon } from './Icon'
import { useCasting } from '../lib/casting/manager'
import './CastModal.css'

interface CastModalProps {
  open: boolean
  onClose: () => void
}

export function CastModal({ open, onClose }: CastModalProps) {
  const {
    devices,
    session,
    isScanning,
    isConnected,
    startDiscovery,
    connect,
    disconnect,
    setVolume,
    toggleMute,
  } = useCasting()

  useEffect(() => {
    if (open) {
      startDiscovery()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="cast-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="cast-modal-heading">
      <div className="cast-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cast-modal-header">
          <div className="cast-modal-title" id="cast-modal-heading">
            <Icon name="cast" size={20} />
            <span>Cast to Device</span>
          </div>
          <button type="button" className="cast-close-btn" onClick={onClose} aria-label="Close casting menu">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="cast-modal-body">
          {isConnected && session && (
            <div className="cast-connected-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--accent, #ff1a2a)', fontWeight: 700, textTransform: 'uppercase' }}>
                    Active Casting Session
                  </div>
                  <strong style={{ fontSize: '1rem', color: '#fff' }}>{session.device.name}</strong>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={disconnect}
                  style={{ color: '#ff6b74' }}
                >
                  Disconnect
                </button>
              </div>

              <div className="cast-volume-slider">
                <button type="button" onClick={toggleMute} aria-label={session.isMuted ? 'Unmute' : 'Mute'}>
                  <Icon name={session.isMuted ? 'mute' : 'volume'} size={18} />
                </button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={session.isMuted ? 0 : session.volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  aria-label="Casting Volume"
                />
                <span style={{ fontSize: '0.75rem', width: '28px', color: 'var(--text-3)' }}>
                  {session.isMuted ? '0%' : `${session.volume}%`}
                </span>
              </div>
            </div>
          )}

          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Available Receivers
          </div>

          <div className="cast-device-list">
            {devices.map((device) => {
              const active = session?.device.id === device.id
              return (
                <button
                  type="button"
                  key={device.id}
                  className={`cast-device-item ${active ? 'is-connected' : ''}`}
                  onClick={() => {
                    if (active) disconnect()
                    else connect(device)
                  }}
                  aria-label={`${active ? 'Disconnect from' : 'Connect to'} ${device.name}`}
                >
                  <div className="cast-device-info">
                    <span className="cast-device-name">{device.name}</span>
                    <span className="cast-device-sub">
                      <span className="cast-proto-badge">{device.protocol}</span>
                      <span>{device.location || device.model}</span>
                    </span>
                  </div>
                  <div>
                    {active ? (
                      <span style={{ color: 'var(--accent, #ff1a2a)', fontSize: '0.8125rem', fontWeight: 600 }}>
                        Connected
                      </span>
                    ) : (
                      <Icon name="right" size={16} />
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="cast-modal-footer">
          <button
            type="button"
            className="cast-scan-btn"
            onClick={startDiscovery}
            disabled={isScanning}
          >
            <Icon name="refresh" size={14} className={isScanning ? 'is-spinning' : ''} />
            <span>{isScanning ? 'Scanning network...' : 'Scan for Devices'}</span>
          </button>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>
            Chromecast · AirPlay · DLNA
          </span>
        </div>
      </div>
    </div>
  )
}
