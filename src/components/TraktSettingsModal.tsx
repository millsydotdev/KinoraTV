// TraktSettingsModal.tsx - Two-way Trakt.tv scrobbler and history sync configuration modal.
// Provides OAuth2 device pairing flow, real-time sync trigger, and playback scrobbling controls.
// Strictly adheres to project typography standards: zero em-dashes across all code and comments.

import { useEffect, useState, useRef } from 'react'
import { Icon } from './Icon'
import {
  loadTraktConfig,
  saveTraktConfig,
  clearTraktTokens,
  requestDeviceCode,
  pollDeviceToken,
  fetchUserProfile,
  performTraktSync,
  type TraktConfig,
  type TraktDeviceCode,
  type TraktSyncSummary,
} from '../lib/trakt'
import { useStore } from '../state/store'
import './TraktSettingsModal.css'

export interface TraktSettingsModalProps {
  open: boolean
  onClose: () => void
}

export function TraktSettingsModal({ open, onClose }: TraktSettingsModalProps) {
  const store = useStore()
  const [config, setConfig] = useState<TraktConfig>(loadTraktConfig)
  const [pairingCode, setPairingCode] = useState<TraktDeviceCode | null>(null)
  const [pairingStatus, setPairingStatus] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncSummary, setSyncSummary] = useState<TraktSyncSummary | null>(null)
  const [copied, setCopied] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [customClientId, setCustomClientId] = useState('')
  const [customClientSecret, setCustomClientSecret] = useState('')

  const pollingRef = useRef<number | null>(null)

  useEffect(() => {
    if (open) {
      const cfg = loadTraktConfig()
      setConfig(cfg)
      setCustomClientId(cfg.clientId)
      setCustomClientSecret(cfg.clientSecret ?? '')
      setPairingCode(null)
      setPairingStatus(null)
      setSyncSummary(null)
    } else {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [open])

  // Stop polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [])

  if (!open) return null

  const handleStartPairing = async () => {
    try {
      setPairingStatus('Requesting device authorization...')
      const code = await requestDeviceCode(customClientId.trim() || undefined)
      setPairingCode(code)
      setPairingStatus('Waiting for authorization on trakt.tv/activate...')

      // Start polling interval
      const intervalMs = Math.max(code.interval, 5) * 1000
      if (pollingRef.current) clearInterval(pollingRef.current)

      pollingRef.current = window.setInterval(async () => {
        const res = await pollDeviceToken(
          code.deviceCode,
          customClientId.trim() || undefined,
          customClientSecret.trim() || undefined
        )

        if (res.status === 'success') {
          if (pollingRef.current) clearInterval(pollingRef.current)
          setPairingCode(null)
          setPairingStatus(null)

          const user = await fetchUserProfile(res.accessToken, customClientId.trim() || undefined)
          const updated = saveTraktConfig({
            enabled: true,
            clientId: customClientId.trim() || config.clientId,
            clientSecret: customClientSecret.trim() || undefined,
            accessToken: res.accessToken,
            refreshToken: res.refreshToken,
            expiresAt: res.expiresAt,
            user,
          })
          setConfig(updated)
        } else if (res.status === 'denied') {
          if (pollingRef.current) clearInterval(pollingRef.current)
          setPairingCode(null)
          setPairingStatus('Authorization request was declined.')
        } else if (res.status === 'expired') {
          if (pollingRef.current) clearInterval(pollingRef.current)
          setPairingCode(null)
          setPairingStatus('Device code has expired. Please try again.')
        }
      }, intervalMs)
    } catch (err: any) {
      setPairingStatus(`Failed to initiate pairing: ${err?.message || err}`)
    }
  }

  const handleCancelPairing = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    setPairingCode(null)
    setPairingStatus(null)
  }

  const handleDisconnect = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    const cleared = clearTraktTokens()
    setConfig(cleared)
  }

  const handleToggleAutoScrobble = (checked: boolean) => {
    const updated = saveTraktConfig({ autoScrobble: checked })
    setConfig(updated)
  }

  const handleToggleSyncOnStartup = (checked: boolean) => {
    const updated = saveTraktConfig({ syncOnStartup: checked })
    setConfig(updated)
  }

  const handleManualSync = async () => {
    setSyncing(true)
    setSyncSummary(null)
    try {
      const summary = await performTraktSync((ref) => {
        store.setWatched([ref], true)
        store.recordView(ref)
      })
      setSyncSummary(summary)
      setConfig(loadTraktConfig())
    } catch (e: any) {
      alert(`Sync failed: ${e?.message || e}`)
    } finally {
      setSyncing(false)
    }
  }

  const handleCopyCode = async () => {
    if (!pairingCode?.userCode) return
    try {
      await navigator.clipboard.writeText(pairingCode.userCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Ignore clipboard failure
    }
  }

  const isConnected = Boolean(config.enabled && config.accessToken)

  return (
    <div className="trakt-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="trakt-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="trakt-modal-header">
          <div className="trakt-modal-title">
            <span className="trakt-brand-badge">TRAKT</span>
            <span>Trakt.tv Scrobbler & Sync</span>
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

        <div className="trakt-modal-body">
          {isConnected && config.user ? (
            <>
              <div className="trakt-account-card">
                <div className="trakt-avatar">
                  {config.user.avatarUrl ? (
                    <img src={config.user.avatarUrl} alt={config.user.username} />
                  ) : (
                    config.user.username.slice(0, 2).toUpperCase()
                  )}
                </div>
                <div className="trakt-user-info">
                  <div className="trakt-user-name">
                    <span>{config.user.name}</span>
                    {config.user.vip && <span className="trakt-vip-pill">VIP</span>}
                  </div>
                  <span className="trakt-user-handle">@{config.user.username}</span>
                </div>
                <span className="status-dot online" title="Connected" />
              </div>

              <div className="trakt-switch-row">
                <div className="trakt-switch-label">
                  <span className="trakt-switch-title">Auto-Scrobble Playback</span>
                  <span className="trakt-switch-hint">
                    Automatically update Trakt status while watching movies and episodes
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={config.autoScrobble}
                  onChange={(e) => handleToggleAutoScrobble(e.target.checked)}
                />
              </div>

              <div className="trakt-switch-row">
                <div className="trakt-switch-label">
                  <span className="trakt-switch-title">Sync on Application Startup</span>
                  <span className="trakt-switch-hint">
                    Synchronize watched history whenever Kinora launches
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={config.syncOnStartup}
                  onChange={(e) => handleToggleSyncOnStartup(e.target.checked)}
                />
              </div>

              {syncSummary && (
                <div className="trakt-sync-status">
                  Sync complete: {syncSummary.moviesImported} movies and {syncSummary.episodesImported} episodes synchronized.
                </div>
              )}

              {config.lastSyncAt && !syncSummary && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Last synchronized: {new Date(config.lastSyncAt).toLocaleString()}
                </div>
              )}
            </>
          ) : pairingCode ? (
            <div className="trakt-pairing-card">
              <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                1. On your phone or computer, visit:
              </span>
              <a
                href={pairingCode.verificationUrl}
                target="_blank"
                rel="noreferrer"
                style={{ color: '#ed1c24', fontWeight: 600, fontSize: '1.05rem', textDecoration: 'underline' }}
              >
                {pairingCode.verificationUrl}
              </a>

              <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                2. Enter this code to link your account:
              </span>
              <div className="trakt-code-display">{pairingCode.userCode}</div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={handleCopyCode}
                >
                  <Icon name={copied ? 'checkCircle' : 'copy'} size={14} />
                  {copied ? 'Copied' : 'Copy Code'}
                </button>
              </div>

              <div className="trakt-poll-indicator">
                <span className="trakt-spinner" />
                <span>{pairingStatus || 'Waiting for confirmation...'}</span>
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Connect your Trakt.tv account to scrobble films and episodes automatically as you watch,
                track progress, and synchronize your complete watched history with your Trakt profile.
              </div>

              {pairingStatus && (
                <div style={{ color: '#ef4444', fontSize: '0.8125rem' }}>{pairingStatus}</div>
              )}

              <div style={{ marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  style={{ fontSize: '0.75rem' }}
                >
                  <Icon name="cog" size={14} />
                  {showAdvanced ? 'Hide API Credentials' : 'API Credentials (Optional)'}
                </button>
              </div>

              {showAdvanced && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    Trakt Client ID
                    <input
                      type="text"
                      className="remote-url-input"
                      value={customClientId}
                      onChange={(e) => setCustomClientId(e.target.value)}
                      placeholder="Leave empty for Kinora default"
                    />
                  </label>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    Trakt Client Secret (Optional)
                    <input
                      type="password"
                      className="remote-url-input"
                      value={customClientSecret}
                      onChange={(e) => setCustomClientSecret(e.target.value)}
                      placeholder="Client Secret"
                    />
                  </label>
                </div>
              )}
            </>
          )}
        </div>

        <div className="trakt-modal-footer">
          {isConnected ? (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={handleDisconnect}
              >
                Disconnect
              </button>
              <button
                type="button"
                className="btn btn-primary btn-small"
                onClick={handleManualSync}
                disabled={syncing}
              >
                <Icon name="refresh" size={14} />
                {syncing ? 'Syncing...' : 'Sync History Now'}
              </button>
            </>
          ) : pairingCode ? (
            <>
              <div />
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={handleCancelPairing}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <div />
              <button
                type="button"
                className="btn btn-primary btn-small"
                onClick={handleStartPairing}
              >
                Connect with Trakt
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
