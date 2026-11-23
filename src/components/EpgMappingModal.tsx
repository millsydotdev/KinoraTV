// EpgMappingModal.tsx - Interactive EPG channel search and manual mapping dialog.
// Allows users to match playlist channels to XMLTV guide channels with live fuzzy ranking.
// Strictly adheres to typography standards: zero em-dashes across all code and comments.

import { useEffect, useMemo, useState } from 'react'
import type { Channel } from '../data/types'
import type { SavedMapping, GuideChannel } from '../lib/native'
import { guideChannels } from '../lib/native'
import { useStore } from '../state/store'
import { rankGuideChannels, cleanChannelForMatching, type ScoredGuideChannel } from '../lib/epgFuzzy'
import { Icon } from './Icon'
import './EpgMappingModal.css'

export interface EpgMappingModalProps {
  open: boolean
  channel: Channel
  currentMapping?: SavedMapping | null
  onClose: () => void
  onSaveMapping: (channelId: string, guideId: string, xmltvId: string) => void
  onClearMapping: (channelId: string) => void
}

export function EpgMappingModal({
  open,
  channel,
  currentMapping,
  onClose,
  onSaveMapping,
  onClearMapping,
}: EpgMappingModalProps) {
  const store = useStore()
  const availableGuides = store.guides.filter((g) => g.status === 'ready' || g.summary)

  const [selectedGuideId, setSelectedGuideId] = useState<string>(() => {
    return currentMapping?.guide || availableGuides[0]?.id || ''
  })

  const [searchTerm, setSearchTerm] = useState('')
  const [guideChannelList, setGuideChannelList] = useState<GuideChannel[]>([])
  const [loadingChannels, setLoadingChannels] = useState(false)
  const [selectedXmltvId, setSelectedXmltvId] = useState<string>(() => {
    return currentMapping?.xmltvId || ''
  })

  useEffect(() => {
    if (!open) return
    setSelectedGuideId(currentMapping?.guide || availableGuides[0]?.id || '')
    setSelectedXmltvId(currentMapping?.xmltvId || '')
    setSearchTerm(cleanChannelForMatching(channel.name))
  }, [open, channel, currentMapping, availableGuides])

  // Load guide channels when selected guide changes
  useEffect(() => {
    if (!open || !selectedGuideId) return
    let active = true
    setLoadingChannels(true)

    guideChannels(selectedGuideId)
      .then((chans) => {
        if (active) {
          setGuideChannelList(chans)
          setLoadingChannels(false)
        }
      })
      .catch(() => {
        if (active) {
          setGuideChannelList([])
          setLoadingChannels(false)
        }
      })

    return () => {
      active = false
    }
  }, [open, selectedGuideId])

  const rankedCandidates = useMemo<ScoredGuideChannel[]>(() => {
    if (!searchTerm.trim()) return []
    return rankGuideChannels(searchTerm, guideChannelList, 0.2, 50)
  }, [searchTerm, guideChannelList])

  if (!open) return null

  const handleSave = () => {
    if (!selectedXmltvId || !selectedGuideId) return
    onSaveMapping(channel.id, selectedGuideId, selectedXmltvId)
    onClose()
  }

  const handleClear = () => {
    onClearMapping(channel.id)
    onClose()
  }

  const activeGuide = availableGuides.find((g) => g.id === selectedGuideId)

  return (
    <div className="epg-mapping-overlay" onClick={onClose} role="presentation">
      <div
        className="epg-mapping-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="epg-mapping-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="epg-mapping-header">
          <div className="epg-mapping-title-wrap">
            <div className="epg-mapping-icon">
              <Icon name="guide" size={22} />
            </div>
            <div>
              <h2 id="epg-mapping-title">Map EPG Channel</h2>
              <div className="epg-mapping-channel-badge">
                {channel.name} {channel.number ? `(Ch. ${channel.number})` : ''}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="epg-mapping-body">
          {/* Current mapping banner */}
          <div className="epg-mapping-current-banner">
            <div className="epg-mapping-current-info">
              <span className="epg-mapping-current-label">Active Guide Mapping</span>
              <span className="epg-mapping-current-val">
                {currentMapping
                  ? `${currentMapping.xmltvId} (${activeGuide?.name || 'Assigned Guide'})`
                  : 'No manual mapping assigned'}
              </span>
            </div>
            {currentMapping && (
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={handleClear}
                style={{ color: '#ef4444' }}
              >
                Clear
              </button>
            )}
          </div>

          {/* Guide source selector if multiple guides exist */}
          {availableGuides.length > 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor="epg-guide-select" style={{ fontSize: '0.8125rem', color: 'var(--text-2)' }}>
                Target XMLTV Guide Source:
              </label>
              <select
                id="epg-guide-select"
                className="input"
                value={selectedGuideId}
                onChange={(e) => setSelectedGuideId(e.target.value)}
              >
                {availableGuides.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.summary?.channels ?? 0} channels)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Live Search Input */}
          <div className="epg-mapping-controls-row">
            <div className="epg-mapping-search-box">
              <Icon name="search" size={16} className="epg-mapping-search-icon" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search XMLTV channels by title or ID..."
                autoFocus
              />
            </div>
          </div>

          {/* Results list */}
          <div className="epg-mapping-results-list">
            {loadingChannels ? (
              <div className="epg-mapping-empty-state">
                <Icon name="refresh" size={20} className="spin" />
                <span>Reading guide channel index...</span>
              </div>
            ) : rankedCandidates.length === 0 ? (
              <div className="epg-mapping-empty-state">
                <Icon name="warning" size={20} />
                <span>
                  {searchTerm.trim()
                    ? 'No matching guide channels found for this query.'
                    : 'Type a channel name to search the guide.'}
                </span>
              </div>
            ) : (
              rankedCandidates.map((cand) => {
                const isSelected = selectedXmltvId === cand.id
                const scoreTier =
                  cand.score >= 0.95
                    ? 'exact'
                    : cand.score >= 0.75
                    ? 'high'
                    : 'partial'

                return (
                  <button
                    key={cand.id}
                    type="button"
                    className={`epg-mapping-result-item ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => setSelectedXmltvId(cand.id)}
                  >
                    <div className="epg-mapping-result-meta">
                      <span className="epg-mapping-result-name">{cand.name}</span>
                      <span className="epg-mapping-result-id">{cand.id}</span>
                    </div>
                    <span className={`epg-mapping-score-pill epg-mapping-score-${scoreTier}`}>
                      {cand.score >= 0.95
                        ? '100% Match'
                        : `${Math.round(cand.score * 100)}% Match`}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>

        <footer className="epg-mapping-footer">
          <div>
            {selectedXmltvId && (
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-2)' }}>
                Selected: <code>{selectedXmltvId}</code>
              </span>
            )}
          </div>
          <div className="epg-mapping-footer-end">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!selectedXmltvId}
              onClick={handleSave}
            >
              Save Mapping
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
