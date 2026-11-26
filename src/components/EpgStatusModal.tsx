import { useState, useMemo } from 'react'
import { Icon } from './Icon'
import type { Channel } from '../data/types'
import type { GuideSource, Mapping } from '../state/guides'
import type { GuideMatch } from '../state/guides'
import './EpgStatusModal.css'

export interface EpgStatusModalProps {
  open: boolean
  onClose: () => void
  channels: Channel[]
  guides: GuideSource[]
  mappings: Mapping[]
  getMatch: (channel: Channel) => GuideMatch | undefined
  onOpenManualMap?: (channel: Channel) => void
  onClearMapping?: (channelId: string) => void
}

type FilterTab = 'all' | 'matched' | 'unmatched' | 'manual'

export function EpgStatusModal({
  open,
  onClose,
  channels,
  guides,
  mappings,
  getMatch,
  onOpenManualMap,
  onClearMapping,
}: EpgStatusModalProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Compute stats across all channels
  const stats = useMemo(() => {
    let matchedCount = 0
    let manualCount = 0
    let noIdCount = 0
    let unmatchedCount = 0
    let noGuideCount = 0

    for (const ch of channels) {
      const match = getMatch(ch)
      if (match?.state === 'matched') {
        matchedCount++
        if (match.manual) {
          manualCount++
        }
      } else if (match?.state === 'no-id') {
        noIdCount++
        unmatchedCount++
      } else if (match?.state === 'unmatched' || match?.state === 'match-lost') {
        unmatchedCount++
      } else if (match?.state === 'no-guide') {
        noGuideCount++
      }
    }

    const total = channels.length
    const matchPercentage = total > 0 ? Math.round((matchedCount / total) * 100) : 0

    return {
      total,
      matchedCount,
      manualCount,
      noIdCount,
      unmatchedCount,
      noGuideCount,
      matchPercentage,
    }
  }, [channels, getMatch])

  // Filter channels based on tab and query
  const filteredChannels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return channels.filter((ch) => {
      const match = getMatch(ch)
      const isMatched = match?.state === 'matched'
      const isManual = isMatched && match?.manual

      if (activeTab === 'matched' && !isMatched) return false
      if (activeTab === 'unmatched' && isMatched) return false
      if (activeTab === 'manual' && !isManual) return false

      if (q) {
        const nameMatch = ch.name.toLowerCase().includes(q)
        const numMatch = String(ch.number).includes(q)
        const tvgMatch = ch.tvgId ? ch.tvgId.toLowerCase().includes(q) : false
        if (!nameMatch && !numMatch && !tvgMatch) return false
      }

      return true
    })
  }, [channels, getMatch, activeTab, searchQuery])

  if (!open) return null

  return (
    <div
      className="epg-status-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="EPG Guide Health and Match Diagnostics"
      onClick={onClose}
    >
      <div
        className="epg-status-card"
        onClick={(e) => e.stopPropagation()}
        data-nav-boundary="epg-status"
      >
        <div className="epg-status-header">
          <div className="epg-status-title">
            <Icon name="calendar" size={20} className="epg-status-title-icon" />
            <span>EPG Guide Health & Diagnostics</span>
          </div>
          <button
            type="button"
            className="epg-status-close-btn"
            onClick={onClose}
            aria-label="Close EPG diagnostics"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* Metrics Grid */}
        <div className="epg-status-metrics-grid">
          <div className="epg-metric-card">
            <div className="epg-metric-label">Match Coverage</div>
            <div className="epg-metric-value">{stats.matchPercentage}%</div>
            <div className="epg-metric-sub">
              {stats.matchedCount} of {stats.total} channels
            </div>
          </div>

          <div className="epg-metric-card">
            <div className="epg-metric-label">Active Guides</div>
            <div className="epg-metric-value">{guides.length}</div>
            <div className="epg-metric-sub">
              {guides.reduce((acc, g) => acc + (g.summary?.channels ?? 0), 0)} listings indexed
            </div>
          </div>

          <div className="epg-metric-card">
            <div className="epg-metric-label">Unmatched Channels</div>
            <div className="epg-metric-value text-amber">{stats.unmatchedCount}</div>
            <div className="epg-metric-sub">Missing schedule data</div>
          </div>

          <div className="epg-metric-card">
            <div className="epg-metric-label">Hand Mappings</div>
            <div className="epg-metric-value text-blue">{mappings.length}</div>
            <div className="epg-metric-sub">Custom mapped pairs</div>
          </div>
        </div>

        {/* Guides Overview List */}
        {guides.length > 0 && (
          <div className="epg-status-guides-section">
            <h4 className="epg-section-heading">Configured Guide Sources</h4>
            <div className="epg-guides-pills">
              {guides.map((g) => (
                <div key={g.id} className="epg-guide-pill">
                  <span className="epg-guide-pill-name">{g.name}</span>
                  <span className="epg-guide-pill-badge">
                    {g.summary?.channels ?? 0} channels
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter Tabs and Search Bar */}
        <div className="epg-status-controls">
          <div className="epg-status-tabs">
            <button
              type="button"
              className={`epg-tab-btn ${activeTab === 'all' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              All ({channels.length})
            </button>
            <button
              type="button"
              className={`epg-tab-btn ${activeTab === 'matched' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('matched')}
            >
              Matched ({stats.matchedCount})
            </button>
            <button
              type="button"
              className={`epg-tab-btn ${activeTab === 'unmatched' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('unmatched')}
            >
              Unmatched ({stats.unmatchedCount})
            </button>
            <button
              type="button"
              className={`epg-tab-btn ${activeTab === 'manual' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('manual')}
            >
              Manual ({stats.manualCount})
            </button>
          </div>

          <div className="epg-search-box">
            <Icon name="search" size={14} className="epg-search-icon" />
            <input
              type="text"
              className="epg-search-input"
              placeholder="Filter channels by name, number, or tvg-id..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Channels Table / List */}
        <div className="epg-channels-table-container">
          {filteredChannels.length === 0 ? (
            <div className="epg-empty-state">No channels match current filter.</div>
          ) : (
            <div className="epg-channels-list">
              {filteredChannels.slice(0, 150).map((ch) => {
                const match = getMatch(ch)
                const isMatched = match?.state === 'matched'
                const isManual = isMatched && match.manual

                return (
                  <div key={ch.id} className="epg-channel-row" data-testid={`epg-row-${ch.id}`}>
                    <div className="epg-channel-info">
                      <span className="epg-channel-num">#{ch.number}</span>
                      <span className="epg-channel-name">{ch.name}</span>
                      {ch.tvgId && (
                        <span className="epg-channel-tvgid" title="M3U tvg-id tag">
                          {ch.tvgId}
                        </span>
                      )}
                    </div>

                    <div className="epg-channel-status-col">
                      {isMatched ? (
                        <span className="epg-badge badge-matched">
                          <Icon name="check" size={12} />
                          {isManual ? 'Manual Match' : 'Matched'}
                        </span>
                      ) : match?.state === 'no-id' ? (
                        <span className="epg-badge badge-no-id">Missing tvg-id</span>
                      ) : (
                        <span className="epg-badge badge-unmatched">Unmatched</span>
                      )}
                    </div>

                    <div className="epg-channel-actions">
                      {onOpenManualMap && (
                        <button
                          type="button"
                          className="epg-row-action-btn"
                          onClick={() => onOpenManualMap(ch)}
                          title="Map or edit XMLTV match"
                        >
                          <Icon name="edit" size={13} />
                          <span>{isMatched ? 'Change' : 'Map'}</span>
                        </button>
                      )}
                      {isManual && onClearMapping && (
                        <button
                          type="button"
                          className="epg-row-action-btn btn-danger"
                          onClick={() => onClearMapping(ch.id)}
                          title="Clear manual mapping"
                        >
                          <Icon name="trash" size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
              {filteredChannels.length > 150 && (
                <div className="epg-list-truncated-note">
                  Showing first 150 of {filteredChannels.length} channels. Use search to find specific items.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
