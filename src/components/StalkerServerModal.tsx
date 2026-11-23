// StalkerServerModal.tsx - Modal for connecting and managing MAG / Stalker / Ministra middleware portals.
// Strictly adheres to project typography standards: zero em-dashes across all code and comments.

import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import {
  connectStalker,
  disconnectStalker,
  isStalkerConnected,
  loadStalkerCatalogue,
  type StalkerCatalogue,
  type StalkerProfile,
} from '../lib/native'
import {
  formatMacInput,
  isValidMacAddress,
  loadSavedStalkerPortals,
  removeSavedStalkerPortal,
  saveStalkerPortal,
  type SavedStalkerPortal,
} from '../lib/stalker'
import './StalkerServerModal.css'

export interface StalkerServerModalProps {
  open: boolean
  onClose: () => void
  onPortalConnected?: (catalogue: StalkerCatalogue) => void
}

export function StalkerServerModal({
  open,
  onClose,
  onPortalConnected,
}: StalkerServerModalProps) {
  const [portalUrl, setPortalUrl] = useState('')
  const [mac, setMac] = useState('00:1A:79:')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<StalkerProfile | null>(null)
  const [catalogue, setCatalogue] = useState<StalkerCatalogue | null>(null)
  const [savedPortals, setSavedPortals] = useState<SavedStalkerPortal[]>([])
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (open) {
      setSavedPortals(loadSavedStalkerPortals())
      void isStalkerConnected().then(setIsConnected)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  const handleMacChange = (val: string) => {
    setMac(formatMacInput(val))
    setError(null)
  }

  const handleConnect = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setError(null)

    const trimmedUrl = portalUrl.trim()
    if (!trimmedUrl) {
      setError('Please provide a Stalker portal address.')
      return
    }

    if (!isValidMacAddress(mac)) {
      setError('Please provide a valid 6-byte hexadecimal MAC address (e.g. 00:1A:79:AB:CD:EF).')
      return
    }

    setBusy(true)
    try {
      const prof = await connectStalker(trimmedUrl, mac)
      if (!prof) {
        throw new Error('Could not establish connection to the Stalker portal.')
      }
      setProfile(prof)
      setIsConnected(true)

      // Automatically load catalogue on successful handshake
      const cat = await loadStalkerCatalogue()
      if (cat) {
        setCatalogue(cat)
        const portalId = `stalker-${Date.now().toString(36)}`
        const saved: SavedStalkerPortal = {
          id: portalId,
          portalUrl: trimmedUrl,
          mac,
          label: label.trim() || prof.name || 'MAG Portal',
          lastConnected: new Date().toISOString(),
          channelCount: cat.channels.length,
          vodCount: cat.vod.length,
          expDate: prof.expDate,
        }
        saveStalkerPortal(saved)
        setSavedPortals(loadSavedStalkerPortals())
        onPortalConnected?.(cat)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to connect to Stalker portal.')
    } finally {
      setBusy(false)
    }
  }

  const handleDisconnect = async () => {
    setBusy(true)
    try {
      await disconnectStalker()
      setIsConnected(false)
      setProfile(null)
      setCatalogue(null)
    } finally {
      setBusy(false)
    }
  }

  const handleLoadSaved = (p: SavedStalkerPortal) => {
    setPortalUrl(p.portalUrl)
    setMac(p.mac)
    setLabel(p.label || '')
    setError(null)
  }

  const handleRemoveSaved = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    removeSavedStalkerPortal(id)
    setSavedPortals(loadSavedStalkerPortals())
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="stalker-modal-title">
      <div className="stalker-modal">
        <div className="stalker-modal-header">
          <div className="stalker-modal-title-group">
            <h2 id="stalker-modal-title" className="stalker-modal-title">
              <Icon name="sources" size={20} />
              Stalker / MAG Portal
            </h2>
            <p className="stalker-modal-subtitle">
              Connect to Ministra and Stalker middleware portals via MAC authentication
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            aria-label="Close Stalker portal modal"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="stalker-modal-body">
          {savedPortals.length > 0 && (
            <div className="stalker-saved-portals">
              <h3 className="stalker-section-title">Saved Portals</h3>
              <div className="stalker-portal-chips">
                {savedPortals.map((p) => (
                  <div
                    key={p.id}
                    className="stalker-portal-chip"
                    onClick={() => handleLoadSaved(p)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="stalker-chip-info">
                      <span className="stalker-chip-label">{p.label || 'MAG Portal'}</span>
                      <span className="stalker-chip-mac">{p.mac}</span>
                    </div>
                    <button
                      type="button"
                      className="stalker-chip-remove"
                      onClick={(e) => handleRemoveSaved(p.id, e)}
                      aria-label={`Remove saved portal ${p.label || p.mac}`}
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <form className="stalker-form" onSubmit={handleConnect}>
            <div className="stalker-field">
              <label htmlFor="stalker-url-input">Portal Server URL</label>
              <input
                id="stalker-url-input"
                type="url"
                className="input"
                placeholder="http://portal.example.com/c/ or /server/load.php"
                value={portalUrl}
                onChange={(e) => setPortalUrl(e.target.value)}
                disabled={busy}
                required
              />
              <span className="stalker-hint">
                Standard MAG middleware endpoint (e.g. http://example.com/c)
              </span>
            </div>

            <div className="stalker-field">
              <label htmlFor="stalker-mac-input">Device MAC Address</label>
              <input
                id="stalker-mac-input"
                type="text"
                className="input stalker-mac-input"
                placeholder="00:1A:79:XX:XX:XX"
                value={mac}
                onChange={(e) => handleMacChange(e.target.value)}
                maxLength={17}
                disabled={busy}
                required
              />
              <span className="stalker-hint">
                6-byte hardware address formatted with colons
              </span>
            </div>

            <div className="stalker-field">
              <label htmlFor="stalker-label-input">Portal Label (Optional)</label>
              <input
                id="stalker-label-input"
                type="text"
                className="input"
                placeholder="e.g. European Premium STB"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                disabled={busy}
              />
            </div>

            {error && (
              <div className="stalker-error-banner" role="alert">
                <Icon name="alertCircle" size={16} />
                <span>{error}</span>
              </div>
            )}

            {profile && (
              <div className="stalker-profile-card">
                <div className="stalker-profile-header">
                  <span className="stalker-profile-name">{profile.name}</span>
                  <span className={`stalker-status-badge ${profile.status.toLowerCase()}`}>
                    {profile.status}
                  </span>
                </div>
                <div className="stalker-profile-grid">
                  <div>
                    <span className="stalker-meta-label">MAC:</span>
                    <span className="stalker-meta-val">{profile.mac}</span>
                  </div>
                  {profile.expDate && (
                    <div>
                      <span className="stalker-meta-label">Expires:</span>
                      <span className="stalker-meta-val">{profile.expDate}</span>
                    </div>
                  )}
                  {catalogue && (
                    <>
                      <div>
                        <span className="stalker-meta-label">Channels:</span>
                        <span className="stalker-meta-val">{catalogue.channels.length}</span>
                      </div>
                      <div>
                        <span className="stalker-meta-label">VOD Titles:</span>
                        <span className="stalker-meta-val">{catalogue.vod.length}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="stalker-modal-actions">
              {isConnected ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleDisconnect}
                  disabled={busy}
                >
                  Disconnect
                </button>
              ) : null}
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy || !portalUrl.trim() || !isValidMacAddress(mac)}
              >
                {busy ? (
                  <>
                    <Icon name="refresh" size={14} className="spin" />
                    Connecting...
                  </>
                ) : (
                  'Connect Portal'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
