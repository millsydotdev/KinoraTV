/**
 * Artwork Diagnostics and User Customization Modal for Kinora.
 *
 * Provides users and operators with complete transparency and control over:
 * - Media Identity, Kind, and Source Integration provenance.
 * - Current Artwork Role and Assigned Aspect Ratio.
 * - Validation results, suitability scores, and rejection rationales.
 * - Candidate gallery: view alternative images across connected providers.
 * - Action controls: assign alternative, upload custom image, clear override, refresh.
 *
 * Strictly adheres to the zero em-dash typography standard.
 */

import { useState } from 'react'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { useToast } from './Toast'
import { saveCustomArtwork, deleteCustomArtwork, getCustomArtwork, type CustomArtworkType } from '../state/customArtwork'
import { artworkEngine, type ArtworkRecord, type ArtworkType } from '../data/artworkEngine'
import { resolveArtwork } from '../lib/artworkResolver'
import { classifyMediaKind } from '../data/mediaAssetModel'
import './ArtworkDiagnosticsModal.css'

export interface ArtworkDiagnosticsModalProps {
  open: boolean
  onClose: () => void
  itemRef?: string
  title: string
  role?: ArtworkType
  channelId?: string
  currentUrl?: string | null
  year?: number | null
}

export function ArtworkDiagnosticsModal({
  open,
  onClose,
  itemRef,
  title,
  role = 'movie-poster',
  channelId,
  currentUrl,
  year,
}: ArtworkDiagnosticsModalProps) {
  if (!open) return null

  const toast = useToast()
  const mediaKind = itemRef ? classifyMediaKind(itemRef) : 'programme'
  const customKey = itemRef || title
  const existingCustom = getCustomArtwork(customKey, role as CustomArtworkType)
  const [customInputUrl, setCustomInputUrl] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Compute live resolution and diagnostics
  const resolution = resolveArtwork({
    contentId: itemRef,
    title,
    type: role,
    channelId,
    year,
    providerArt: currentUrl,
  })

  // Find candidate matches stored in the central artwork engine registry
  const candidates: ArtworkRecord[] = []
  if (itemRef) {
    const direct = artworkEngine.getArtwork(itemRef, role)
    if (direct) candidates.push(direct)
  }
  const byTitle = artworkEngine.findArtwork(title, role, year, channelId)
  if (byTitle && !candidates.some((c) => c.sourceUrl === byTitle.sourceUrl)) {
    candidates.push(byTitle)
  }

  const handleApplyCustomUrl = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = customInputUrl.trim()
    if (!trimmed) return

    await saveCustomArtwork({
      contentId: customKey,
      title,
      artworkType: role as CustomArtworkType,
      aspectRatio: resolution.aspectRatio,
      dataUrl: trimmed,
      fileName: 'custom-url',
      fileSize: 0,
      width: 0,
      height: 0,
      mimeType: 'image/jpeg',
    })
    toast(`Custom artwork assigned for ${title}`)
    setCustomInputUrl('')
    onClose()
  }

  const handleClearCustom = async () => {
    deleteCustomArtwork(customKey)
    toast(`Custom artwork cleared for ${title}`)
    onClose()
  }

  const handleSelectCandidate = async (candidate: ArtworkRecord) => {
    await saveCustomArtwork({
      contentId: customKey,
      title,
      artworkType: role as CustomArtworkType,
      aspectRatio: resolution.aspectRatio,
      dataUrl: candidate.sourceUrl,
      fileName: `provider-${candidate.sourceProvider}`,
      fileSize: 0,
      width: candidate.width || 0,
      height: candidate.height || 0,
      mimeType: 'image/jpeg',
    })
    toast(`Assigned ${candidate.sourceProvider.toUpperCase()} image for ${title}`)
    onClose()
  }

  const handleRefreshEnrichment = () => {
    setIsRefreshing(true)
    const id = itemRef || `${mediaKind}:${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    artworkEngine.requestEnrichment({
      id,
      title,
      year: typeof year === 'number' ? year : undefined,
      type: mediaKind === 'movie' ? 'movie' : 'series',
    })
    setTimeout(() => {
      setIsRefreshing(false)
      toast(`Refreshed metadata enrichment for ${title}`)
    }, 1200)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Artwork Diagnostics and Provenance"
      footer={
        <div className="art-diag-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      }
    >
      <div className="art-diag-container">
        <header className="art-diag-header">
          <h3 className="art-diag-title">{title}</h3>
          <span className="art-diag-kind-badge">{mediaKind.toUpperCase()}</span>
          <span className="art-diag-role-badge">{role}</span>
        </header>

        {/* Current Active Artwork Section */}
        <div className="art-diag-active-section">
          <div className="art-diag-preview-wrap">
            {resolution.src ? (
              <img src={resolution.src} alt={title} className="art-diag-preview-img" />
            ) : (
              <div className="art-diag-missing-preview">
                <Icon name="film" size={32} />
                <span>No genuine image selected</span>
              </div>
            )}
          </div>
          <div className="art-diag-meta-grid">
            <div className="art-diag-meta-row">
              <span className="art-diag-label">Selected Provider:</span>
              <span className="art-diag-val art-diag-pill">{resolution.provider.toUpperCase()}</span>
            </div>
            <div className="art-diag-meta-row">
              <span className="art-diag-label">Aspect Ratio:</span>
              <span className="art-diag-val">{resolution.aspectRatio}</span>
            </div>
            <div className="art-diag-meta-row">
              <span className="art-diag-label">Attribution:</span>
              <span className="art-diag-val">{resolution.attribution || 'Automatic Ambient Fallback'}</span>
            </div>
            <div className="art-diag-meta-row">
              <span className="art-diag-label">Selection Rationale:</span>
              <span className="art-diag-val muted">
                {resolution.diagnostics?.rationale || 'Selected via universal role priority'}
              </span>
            </div>
            {resolution.src && (
              <div className="art-diag-meta-row">
                <span className="art-diag-label">Asset URL:</span>
                <span className="art-diag-val tnum art-diag-url-truncate" title={resolution.src.split('?')[0]}>
                  {resolution.src.split('?')[0]}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* User Override Controls */}
        <div className="art-diag-controls-box">
          <h4 className="art-diag-section-sub">User Artwork Override</h4>
          {existingCustom ? (
            <div className="art-diag-custom-active">
              <span className="art-diag-val">Custom override is currently active for this role.</span>
              <button type="button" className="btn btn-ghost" onClick={handleClearCustom}>
                <Icon name="close" size={14} /> Clear Override
              </button>
            </div>
          ) : (
            <form className="art-diag-input-form" onSubmit={handleApplyCustomUrl}>
              <input
                className="input art-diag-url-input"
                placeholder="Paste custom image URL (https://...)"
                value={customInputUrl}
                onChange={(e) => setCustomInputUrl(e.target.value)}
              />
              <button type="submit" className="btn btn-ghost" disabled={!customInputUrl.trim()}>
                Assign URL
              </button>
            </form>
          )}
        </div>

        {/* Alternative Candidate Images Gallery */}
        <div className="art-diag-candidates-box">
          <div className="art-diag-candidates-head">
            <h4 className="art-diag-section-sub">Connected Provider Candidates</h4>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleRefreshEnrichment}
              disabled={isRefreshing}
            >
              <Icon name="refresh" size={14} /> {isRefreshing ? 'Refreshing...' : 'Re-enrich'}
            </button>
          </div>

          {candidates.length === 0 ? (
            <p className="faint art-diag-empty-candidates">
              No alternate candidate records registered for this role. Click Re-enrich to query external metadata providers.
            </p>
          ) : (
            <div className="art-diag-candidates-grid">
              {candidates.map((cand, idx) => (
                <div key={idx} className="art-diag-candidate-card">
                  <img src={cand.sourceUrl} alt={cand.title} className="art-diag-candidate-img" />
                  <div className="art-diag-candidate-info">
                    <span className="art-diag-candidate-provider">{cand.sourceProvider.toUpperCase()}</span>
                    <span className="art-diag-candidate-confidence">{(cand.confidence * 100).toFixed(0)}% Match</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm art-diag-candidate-apply-btn"
                    onClick={() => handleSelectCandidate(cand)}
                  >
                    Select Image
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  )
}
