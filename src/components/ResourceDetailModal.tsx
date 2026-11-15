import { useState } from 'react'
import type { MediaResource } from '../data/personalLibrary'
import { VERIFICATION_STATUS_META } from '../data/personalLibrary'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { BookReaderModal } from './BookReaderModal'
import { PodcastFeedModal } from './PodcastFeedModal'
import './ResourceDetailModal.css'

interface ResourceDetailModalProps {
  resource: MediaResource | null
  inLibrary: boolean
  isFavourite: boolean
  userNotes: string
  isEnabled?: boolean
  checkStatus?: 'online' | 'offline' | 'degraded' | 'unchecked'
  lastChecked?: number
  isCustomResource?: boolean
  onClose: () => void
  onToggleLibrary: () => void
  onToggleFavourite: () => void
  onToggleEnabled?: () => void
  onSaveNotes: (notes: string) => void
  onSaveConfig?: (updates: Partial<MediaResource>) => void
  onVerifyNow?: (resourceId: string) => void
  onPlay?: (resource: MediaResource) => void
  isPlaying?: boolean
  onImportPlaylist?: (resource: MediaResource) => void
  onImportGuide?: (resource: MediaResource) => void
  isPlaylistImported?: boolean
  isGuideImported?: boolean
  importingNative?: boolean
}

export function ResourceDetailModal({
  resource,
  inLibrary,
  isFavourite,
  userNotes,
  isEnabled = true,
  checkStatus,
  lastChecked,
  isCustomResource,
  onClose,
  onToggleLibrary,
  onToggleFavourite,
  onToggleEnabled,
  onSaveNotes,
  onSaveConfig,
  onVerifyNow,
  onPlay,
  isPlaying,
  onImportPlaylist,
  onImportGuide,
  isPlaylistImported = false,
  isGuideImported = false,
  importingNative = false,
}: ResourceDetailModalProps) {
  const [notes, setNotes] = useState(userNotes)
  const [editingNotes, setEditingNotes] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [readerOpen, setReaderOpen] = useState(false)
  const [podcastFeedOpen, setPodcastFeedOpen] = useState(false)
  const [confirmExternalOpen, setConfirmExternalOpen] = useState(false)

  // Custom resource config editing
  const [editingConfig, setEditingConfig] = useState(false)
  const [editName, setEditName] = useState(resource?.name ?? '')
  const [editUrl, setEditUrl] = useState(resource?.url ?? '')
  const [editPlaybackUrl, setEditPlaybackUrl] = useState(resource?.playbackUrl ?? '')
  const [editProvider, setEditProvider] = useState(resource?.provider ?? '')

  if (!resource) return null

  const statusMeta = VERIFICATION_STATUS_META[resource.verificationStatus] ?? VERIFICATION_STATUS_META.discovered
  const isPlayable = Boolean(resource.playbackUrl) && (resource.playbackType === 'audio' || resource.playbackType === 'hls')

  const handleVerify = () => {
    if (!onVerifyNow) return
    setVerifying(true)
    onVerifyNow(resource.id)
    setTimeout(() => setVerifying(false), 2000)
  }

  const handleNotesSave = () => {
    onSaveNotes(notes)
    setEditingNotes(false)
  }

  const handleConfigSave = () => {
    if (!onSaveConfig) return
    onSaveConfig({
      name: editName.trim() || resource.name,
      url: editUrl.trim() || resource.url,
      playbackUrl: editPlaybackUrl.trim() || undefined,
      provider: editProvider.trim() || resource.provider,
    })
    setEditingConfig(false)
  }

  return (
    <>
      <Dialog open={true} onClose={onClose} title={resource.name} wide>
      <div className="res-detail-modal">
        {/* Top Badges & Status */}
        <div className="res-detail-header-meta">
          <div className="res-detail-status-block">
            <span className="res-status-pill" style={{ '--pill-color': statusMeta.tone } as React.CSSProperties}>
              <span className="res-status-dot" aria-hidden="true" />
              {statusMeta.label}
            </span>
            {checkStatus && checkStatus !== 'unchecked' && (
              <span className={`res-status-pill res-pill-check res-check-${checkStatus}`}>
                <span className="res-status-dot" aria-hidden="true" />
                {checkStatus.toUpperCase()}
              </span>
            )}
            <span className="res-detail-type-pill">{resource.resourceType.toUpperCase()}</span>
            {resource.country && <span className="res-detail-country-pill">{resource.country}</span>}
            {resource.language && <span className="res-detail-lang-pill">{resource.language}</span>}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {inLibrary && onToggleEnabled && (
              <button
                type="button"
                className={`res-toggle-btn ${isEnabled ? 'is-on' : 'is-off'}`}
                onClick={onToggleEnabled}
                title={isEnabled ? 'Source active: click to disable' : 'Source disabled: click to enable'}
              >
                <span className="res-switch-track"><span className="res-switch-thumb" /></span>
                <span>{isEnabled ? 'Active' : 'Disabled'}</span>
              </button>
            )}

            <button
              type="button"
              className={`res-detail-fav-btn ${isFavourite ? 'is-fav' : ''}`}
              onClick={onToggleFavourite}
              title={isFavourite ? 'Remove from favourites' : 'Mark as favourite'}
            >
              <Icon name="heart" size={18} />
              <span>{isFavourite ? 'Favourited' : 'Favourite'}</span>
            </button>
          </div>
        </div>

        {/* Description & Overview */}
        <p className="res-detail-desc">{resource.description}</p>

        {/* Grid of Key Properties */}
        <div className="res-detail-props-grid">
          <div className="res-detail-prop">
            <span className="res-detail-prop-label">Provider</span>
            <span className="res-detail-prop-val">{resource.provider}</span>
          </div>

          <div className="res-detail-prop">
            <span className="res-detail-prop-label">Category</span>
            <span className="res-detail-prop-val">{resource.category} › {resource.subcategory.replace(/-/g, ' ')}</span>
          </div>

          <div className="res-detail-prop">
            <span className="res-detail-prop-label">Licence / Terms</span>
            <span className="res-detail-prop-val">{resource.licence ?? 'Not specified / Public service'}</span>
          </div>

          <div className="res-detail-prop">
            <span className="res-detail-prop-label">Kinora Support</span>
            <span className={`res-detail-prop-val ${resource.supportedByKinora ? 'val-good' : 'val-warn'}`}>
              {resource.supportedByKinora ? 'Directly Supported' : 'External / Catalog Reference'}
            </span>
          </div>

          <div className="res-detail-prop">
            <span className="res-detail-prop-label">Date Discovered</span>
            <span className="res-detail-prop-val">{resource.dateDiscovered}</span>
          </div>

          <div className="res-detail-prop">
            <span className="res-detail-prop-label">Last Verified</span>
            <span className="res-detail-prop-val">{resource.lastVerified}</span>
          </div>

          {resource.channelCount !== undefined && (
            <div className="res-detail-prop">
              <span className="res-detail-prop-label">Channel Count</span>
              <span className="res-detail-prop-val tnum">{resource.channelCount} {resource.channelCount === 1 ? 'channel' : 'channels'}</span>
            </div>
          )}

          {resource.epgAvailable !== undefined && (
            <div className="res-detail-prop">
              <span className="res-detail-prop-label">EPG Electronic Guide</span>
              <span className={`res-detail-prop-val ${resource.epgAvailable ? 'val-good' : 'val-warn'}`}>
                {resource.epgAvailable ? 'Available' : 'No Guide'}
              </span>
            </div>
          )}

          {resource.region && (
            <div className="res-detail-prop">
              <span className="res-detail-prop-label">Region</span>
              <span className="res-detail-prop-val">{resource.region}</span>
            </div>
          )}

          {lastChecked && (
            <div className="res-detail-prop">
              <span className="res-detail-prop-label">Endpoint Probe Check</span>
              <span className={`res-detail-prop-val val-${checkStatus === 'online' ? 'good' : 'warn'}`}>
                {checkStatus?.toUpperCase()} ({new Date(lastChecked).toLocaleTimeString()})
              </span>
            </div>
          )}
        </div>

        {/* What it Provides */}
        <div className="res-detail-section">
          <h4 className="res-detail-sec-title">What this resource provides</h4>
          <p className="res-detail-sec-body">{resource.provides}</p>
        </div>

        {/* Compatibility Notes */}
        {resource.compatibilityNotes && (
          <div className="res-detail-section">
            <h4 className="res-detail-sec-title">Compatibility & Architecture Notes</h4>
            <p className="res-detail-sec-body font-mono">{resource.compatibilityNotes}</p>
          </div>
        )}

        {/* URLs & Endpoints */}
        <div className="res-detail-section">
          <div className="res-detail-notes-head">
            <h4 className="res-detail-sec-title">Endpoints & Provenance</h4>
            {isCustomResource && onSaveConfig && !editingConfig && (
              <button type="button" className="text-btn" onClick={() => setEditingConfig(true)}>
                <Icon name="edit" size={14} /> Edit Source Config
              </button>
            )}
          </div>

          {editingConfig ? (
            <div className="res-detail-config-edit" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>Source Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="personal-search-input"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>Provider / Organisation</label>
                <input
                  type="text"
                  value={editProvider}
                  onChange={(e) => setEditProvider(e.target.value)}
                  className="personal-search-input"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>Endpoint / Portal URL</label>
                <input
                  type="url"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  className="personal-search-input"
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>Direct Playback Stream URL (optional)</label>
                <input
                  type="url"
                  value={editPlaybackUrl}
                  onChange={(e) => setEditPlaybackUrl(e.target.value)}
                  placeholder="https://... direct audio or video stream"
                  className="personal-search-input"
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button type="button" className="btn btn-small btn-primary" onClick={handleConfigSave}>Save Changes</button>
                <button type="button" className="btn btn-small btn-secondary" onClick={() => setEditingConfig(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <div className="res-detail-link-row">
                <span className="res-detail-link-label">Source URL / Endpoint:</span>
                <code className="res-detail-url" title={resource.url}>{resource.url}</code>
              </div>
              {resource.playbackUrl && (
                <div className="res-detail-link-row">
                  <span className="res-detail-link-label">Direct Playback URL:</span>
                  <code className="res-detail-url" title={resource.playbackUrl}>{resource.playbackUrl}</code>
                </div>
              )}
              <div className="res-detail-link-row">
                <span className="res-detail-link-label">Provenance / Documentation:</span>
                <a href={resource.discoveryUrl} target="_blank" rel="noopener noreferrer" className="res-detail-anchor">
                  {resource.discoveryUrl}
                  <Icon name="link" size={12} />
                </a>
              </div>
            </>
          )}
        </div>

        {/* Personal Notes */}
        <div className="res-detail-section">
          <div className="res-detail-notes-head">
            <h4 className="res-detail-sec-title">My Personal Notes</h4>
            {!editingNotes && (
              <button type="button" className="text-btn" onClick={() => setEditingNotes(true)}>
                <Icon name="edit" size={14} /> Edit notes
              </button>
            )}
          </div>

          {editingNotes ? (
            <div className="res-detail-notes-edit">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add personal notes, specific station preferences, or usage tips..."
                rows={3}
                className="res-detail-textarea"
              />
              <div className="res-detail-notes-actions">
                <button type="button" className="btn btn-small btn-primary" onClick={handleNotesSave}>Save Notes</button>
                <button type="button" className="btn btn-small btn-secondary" onClick={() => { setNotes(userNotes); setEditingNotes(false) }}>Cancel</button>
              </div>
            </div>
          ) : (
            <p className="res-detail-notes-display">
              {userNotes.trim() ? userNotes : <span className="faint-italic">No personal notes recorded yet.</span>}
            </p>
          )}
        </div>

        {/* Modal Bottom Actions */}
        <div className="res-detail-actions-bar">
          <div className="res-detail-left-actions">
            {onVerifyNow && (
              <button type="button" className="btn btn-secondary btn-small" onClick={handleVerify} disabled={verifying}>
                <Icon name="refresh" size={14} />
                {verifying ? 'Checking...' : 'Check Availability'}
              </button>
            )}
          </div>

          <div className="res-detail-right-actions">
            {isPlayable && onPlay && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onPlay(resource)}
              >
                <Icon name={isPlaying ? 'pause' : 'play'} size={16} />
                {isPlaying ? 'Pause Audio' : 'Play Stream'}
              </button>
            )}

            {(resource.category === 'books' || resource.category === 'education' || resource.resourceType === 'opds') && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setReaderOpen(true)}
              >
                <Icon name="book" size={16} />
                <span>Read Document</span>
              </button>
            )}

            {(resource.category === 'podcasts' || resource.resourceType === 'rss') && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setPodcastFeedOpen(true)}
              >
                <Icon name="podcast" size={16} />
                <span>Browse Episodes</span>
              </button>
            )}

            {!isPlayable && resource.url && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirmExternalOpen(true)}
                title="Opens in your default system browser"
              >
                <Icon name="link" size={16} />
                <span>Open Resource Portal</span>
                <span className="pill pill-pending" style={{ fontSize: '0.6875rem', padding: '1px 5px', marginLeft: 4 }}>External</span>
              </button>
            )}

            {resource.resourceType === 'm3u' && onImportPlaylist && (
              <button
                type="button"
                className={`btn ${isPlaylistImported ? 'btn-secondary' : 'btn-primary'}`}
                onClick={() => onImportPlaylist(resource)}
                disabled={isPlaylistImported || importingNative}
              >
                <Icon name={isPlaylistImported ? 'check' : 'live'} size={16} />
                {importingNative ? 'Reading Playlist...' : isPlaylistImported ? 'Imported to Live TV' : 'Import to Live TV'}
              </button>
            )}

            {resource.resourceType === 'xmltv' && onImportGuide && (
              <button
                type="button"
                className={`btn ${isGuideImported ? 'btn-secondary' : 'btn-primary'}`}
                onClick={() => onImportGuide(resource)}
                disabled={isGuideImported || importingNative}
              >
                <Icon name={isGuideImported ? 'check' : 'guide'} size={16} />
                {importingNative ? 'Scanning Guide...' : isGuideImported ? 'Imported to Guides' : 'Import to XMLTV Guides'}
              </button>
            )}

            <button
              type="button"
              className={`btn ${inLibrary ? 'btn-secondary' : 'btn-primary'}`}
              onClick={onToggleLibrary}
            >
              <Icon name={inLibrary ? 'trash' : 'plus'} size={16} />
              {inLibrary ? 'Remove from My Sources' : 'Save to My Sources'}
            </button>
          </div>
        </div>
      </div>
    </Dialog>
    {confirmExternalOpen && (
      <Dialog
        open={confirmExternalOpen}
        onClose={() => setConfirmExternalOpen(false)}
        title="Open External Resource?"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmExternalOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                window.open(resource.url, '_blank', 'noopener,noreferrer')
                setConfirmExternalOpen(false)
              }}
            >
              Open in Browser
            </button>
          </>
        }
      >
        <p className="muted" style={{ margin: 0 }}>
          You are about to open <strong>{resource.name}</strong> ({resource.url}) in your external system web browser outside the native Kinora application.
        </p>
      </Dialog>
    )}
    {readerOpen && (
      <BookReaderModal
        isOpen={readerOpen}
        onClose={() => setReaderOpen(false)}
        title={resource.name}
        author={resource.provider}
        sourceName={resource.category.toUpperCase()}
      />
    )}
    {podcastFeedOpen && (
      <PodcastFeedModal
        isOpen={podcastFeedOpen}
        onClose={() => setPodcastFeedOpen(false)}
        podcast={resource}
      />
    )}
  </>
  )
}
