/**
 * Media Server Connection and Management Modal for Kinora.
 *
 * Provides connection controls, credential validation, and library
 * synchronization for Jellyfin, Emby, and Plex servers.
 *
 * Strictly adheres to the zero em-dash typography standard.
 */

import { useState } from 'react'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { useToast } from './Toast'
import {
  mediaServerManager,
  type MediaServerConfig,
  type MediaServerConnectionTest,
  type MediaServerType,
} from '../lib/mediaServer'
import './MediaServerModal.css'

export interface MediaServerModalProps {
  open: boolean
  onClose: () => void
  onServerUpdated?: () => void
}

export function MediaServerModal({ open, onClose, onServerUpdated }: MediaServerModalProps) {
  if (!open) return null

  const toast = useToast()
  const [servers, setServers] = useState<MediaServerConfig[]>(() => mediaServerManager.loadServers())
  const [serverType, setServerType] = useState<MediaServerType>('jellyfin')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [authToken, setAuthToken] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isTesting, setIsTesting] = useState(false)
  const [isSyncing, setIsSyncing] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<MediaServerConnectionTest | null>(null)

  const handleTest = async () => {
    if (!url.trim()) {
      toast('Please enter a server address.')
      return
    }

    setIsTesting(true)
    setTestResult(null)

    try {
      const result = await mediaServerManager.testConnection(
        serverType,
        url.trim(),
        authToken.trim() || undefined,
        username.trim() || undefined,
        password.trim() || undefined,
      )
      setTestResult(result)
      if (result.success) {
        toast(`Connected to ${result.serverName} (${result.version})`)
      } else {
        toast(result.message || 'Connection failed.')
      }
    } catch (e) {
      setTestResult({
        success: false,
        serverName: 'Server',
        version: 'Unknown',
        message: e instanceof Error ? e.message : 'Connection failed.',
      })
      toast('Connection test failed.')
    } finally {
      setIsTesting(false)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return

    const serverId = `srv-${serverType}-${Date.now()}`
    const serverName = name.trim() || testResult?.serverName || `${serverType.toUpperCase()} Server`

    const newConfig: MediaServerConfig = {
      id: serverId,
      serverType,
      name: serverName,
      url: url.trim(),
      authToken: authToken.trim(),
      userId: testResult?.userId,
      username: username.trim() || undefined,
      lastConnected: new Date().toISOString(),
    }

    mediaServerManager.saveServer(newConfig)
    toast(`Saved ${serverName}`)

    // Start background sync
    try {
      setIsSyncing(serverId)
      await mediaServerManager.syncServer(serverId)
      toast(`Synced libraries for ${serverName}`)
    } catch {
      toast(`Could not sync libraries for ${serverName}`)
    } finally {
      setIsSyncing(null)
    }

    setServers(mediaServerManager.loadServers())
    setName('')
    setUrl('')
    setAuthToken('')
    setUsername('')
    setPassword('')
    setTestResult(null)
    onServerUpdated?.()
  }

  const handleManualSync = async (serverId: string) => {
    setIsSyncing(serverId)
    try {
      const items = await mediaServerManager.syncServer(serverId)
      toast(`Synced ${items.length} items from media server.`)
      setServers(mediaServerManager.loadServers())
      onServerUpdated?.()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Sync failed.')
    } finally {
      setIsSyncing(null)
    }
  }

  const handleRemove = (serverId: string) => {
    mediaServerManager.removeServer(serverId)
    setServers(mediaServerManager.loadServers())
    toast('Media server removed.')
    onServerUpdated?.()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Personal Media Servers (Jellyfin / Emby / Plex)"
      footer={
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="ms-modal-container">
        {/* Connected Servers List */}
        {servers.length > 0 && (
          <div className="ms-section">
            <h4 className="ms-subheading">Connected Servers</h4>
            <div className="ms-list">
              {servers.map((srv) => (
                <div key={srv.id} className="ms-card">
                  <div className="ms-card-icon">
                    <Icon name="database" size={20} />
                  </div>
                  <div className="ms-card-content">
                    <div className="ms-card-header">
                      <strong>{srv.name}</strong>
                      <span className="ms-badge">{srv.serverType.toUpperCase()}</span>
                    </div>
                    <span className="ms-card-url tnum">{srv.url}</span>
                    {srv.lastConnected && (
                      <span className="ms-card-meta muted">
                        Last synced: {new Date(srv.lastConnected).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <div className="ms-card-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleManualSync(srv.id)}
                      disabled={isSyncing === srv.id}
                    >
                      <Icon name="refresh" size={14} />
                      {isSyncing === srv.id ? 'Syncing...' : 'Sync'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm text-danger"
                      onClick={() => handleRemove(srv.id)}
                    >
                      <Icon name="close" size={14} /> Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add New Server Form */}
        <div className="ms-section">
          <h4 className="ms-subheading">Connect Media Server</h4>
          <form className="ms-form" onSubmit={handleSave}>
            <div className="ms-type-tabs">
              <button
                type="button"
                className={`ms-type-tab ${serverType === 'jellyfin' ? 'active' : ''}`}
                onClick={() => {
                  setServerType('jellyfin')
                  setTestResult(null)
                }}
              >
                Jellyfin
              </button>
              <button
                type="button"
                className={`ms-type-tab ${serverType === 'emby' ? 'active' : ''}`}
                onClick={() => {
                  setServerType('emby')
                  setTestResult(null)
                }}
              >
                Emby
              </button>
              <button
                type="button"
                className={`ms-type-tab ${serverType === 'plex' ? 'active' : ''}`}
                onClick={() => {
                  setServerType('plex')
                  setTestResult(null)
                }}
              >
                Plex
              </button>
            </div>

            <div className="ms-field-grid">
              <div className="ms-field">
                <label className="ms-label">Server Name (Optional)</label>
                <input
                  className="input"
                  placeholder={serverType === 'jellyfin' ? 'Home Jellyfin' : serverType === 'emby' ? 'Home Emby' : 'Home Plex'}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="ms-field">
                <label className="ms-label">Server Address URL</label>
                <input
                  className="input"
                  placeholder={
                    serverType === 'plex'
                      ? 'http://192.168.1.100:32400'
                      : 'http://192.168.1.100:8096'
                  }
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
              </div>
            </div>

            {serverType === 'plex' ? (
              <div className="ms-field">
                <label className="ms-label">Plex Access Token (X-Plex-Token)</label>
                <input
                  className="input"
                  type="password"
                  placeholder="Paste your Plex X-Plex-Token"
                  value={authToken}
                  onChange={(e) => setAuthToken(e.target.value)}
                  required
                />
              </div>
            ) : (
              <div className="ms-auth-fields">
                <div className="ms-field-grid">
                  <div className="ms-field">
                    <label className="ms-label">Username</label>
                    <input
                      className="input"
                      placeholder="Username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  </div>
                  <div className="ms-field">
                    <label className="ms-label">Password</label>
                    <input
                      className="input"
                      type="password"
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>

                <div className="ms-field">
                  <label className="ms-label">Or API Key / Access Token</label>
                  <input
                    className="input"
                    type="password"
                    placeholder="API Token (optional if using username/password)"
                    value={authToken}
                    onChange={(e) => setAuthToken(e.target.value)}
                  />
                </div>
              </div>
            )}

            {testResult && (
              <div className={`ms-test-result ${testResult.success ? 'success' : 'error'}`}>
                <Icon name={testResult.success ? 'check' : 'close'} size={16} />
                <span>{testResult.message}</span>
              </div>
            )}

            <div className="ms-form-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleTest}
                disabled={isTesting || !url.trim()}
              >
                {isTesting ? 'Testing Connection...' : 'Test Connection'}
              </button>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={!url.trim() || isTesting}
              >
                Save and Sync Libraries
              </button>
            </div>
          </form>
        </div>
      </div>
    </Dialog>
  )
}
