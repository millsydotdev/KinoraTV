import { useContext, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from './Icon'
import { StoreContext } from '../state/store'
import { startOfDay } from '../data/channels'
import type { Channel, Programme } from '../data/types'
import {
  collectCatchupProgrammes,
  getCatchupDayBuckets,
  isCatchupSupportedChannel,
  type CatchupProgrammeItem,
} from '../lib/xtreamCatchup'
import './CatchupBrowserModal.css'

export interface CatchupBrowserModalProps {
  open: boolean
  onClose: () => void
  initialChannelId?: string
  onPlayCatchup?: (ref: string) => void
}

function formatClock(t: number, format: '24h' | '12h' = '24h'): string {
  const d = new Date(t)
  if (format === '12h') {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function CatchupBrowserModal({
  open,
  onClose,
  initialChannelId,
  onPlayCatchup,
}: CatchupBrowserModalProps) {
  const store = useContext(StoreContext)
  const navigate = useNavigate()

  const [selectedDayOffset, setSelectedDayOffset] = useState<number>(0)
  const [selectedChannelId, setSelectedChannelId] = useState<string>(initialChannelId || 'all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (initialChannelId) {
      setSelectedChannelId(initialChannelId)
    }
  }, [initialChannelId])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const now = useMemo(() => Date.now(), [])
  const dayBuckets = useMemo(() => getCatchupDayBuckets(7, now), [now])
  const selectedBucket = useMemo(
    () =>
      dayBuckets.find((b) => b.dayOffset === selectedDayOffset) ??
      dayBuckets[0] ?? {
        dayOffset: 0,
        label: 'Today',
        dateString: '',
        startOfDay: Date.now(),
        endOfDay: Date.now(),
      },
    [dayBuckets, selectedDayOffset],
  )

  const allChannels: Channel[] = useMemo(() => store?.channels || [], [store?.channels])
  const catchupChannels = useMemo(
    () => allChannels.filter(isCatchupSupportedChannel),
    [allChannels],
  )

  // Fetch schedules for eligible channels for the selected bucket day
  const schedulesByChannel = useMemo(() => {
    if (!store?.schedule) return {}
    const map: Record<string, Programme[]> = {}
    const dayStart = startOfDay(selectedBucket.startOfDay)

    for (const ch of catchupChannels) {
      if (selectedChannelId !== 'all' && ch.id !== selectedChannelId) continue
      try {
        map[ch.id] = store.schedule(ch, dayStart) || []
      } catch {
        map[ch.id] = []
      }
    }
    return map
  }, [store, catchupChannels, selectedBucket, selectedChannelId])

  const programmes: CatchupProgrammeItem[] = useMemo(() => {
    return collectCatchupProgrammes(catchupChannels, schedulesByChannel, {
      dayOffset: selectedDayOffset,
      channelId: selectedChannelId === 'all' ? undefined : selectedChannelId,
      searchQuery,
      now,
    })
  }, [catchupChannels, schedulesByChannel, selectedDayOffset, selectedChannelId, searchQuery, now])

  if (!open) return null

  const handlePlay = (ref: string) => {
    onClose()
    if (onPlayCatchup) {
      onPlayCatchup(ref)
    } else {
      navigate(`/watch/${encodeURIComponent(ref)}`)
    }
  }

  return (
    <div
      className="catchup-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="catchup-browser-heading"
    >
      <div className="catchup-modal" onClick={(e) => e.stopPropagation()}>
        <div className="catchup-modal-header">
          <div className="catchup-modal-title" id="catchup-browser-heading">
            <Icon name="history" size={20} />
            <span>Catch-up TV Hub</span>
          </div>
          <button
            type="button"
            className="catchup-modal-close"
            onClick={onClose}
            aria-label="Close Catch-up TV browser"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* Day Selector Tabs */}
        <div className="catchup-modal-days-nav" role="tablist" aria-label="Catch-up Broadcast Days">
          {dayBuckets.map((bucket) => {
            const isActive = bucket.dayOffset === selectedDayOffset
            return (
              <button
                key={bucket.dayOffset}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`catchup-day-tab ${isActive ? 'is-active' : ''}`}
                onClick={() => setSelectedDayOffset(bucket.dayOffset)}
              >
                <span className="catchup-day-tab-label">{bucket.label}</span>
                <span className="catchup-day-tab-date">{bucket.dateString}</span>
              </button>
            )
          })}
        </div>

        {/* Filter bar */}
        <div className="catchup-modal-filters">
          <input
            type="search"
            className="catchup-search-input"
            placeholder="Search past broadcasts, programmes, or channels..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search catch-up programmes"
          />

          <select
            className="catchup-select-filter"
            value={selectedChannelId}
            onChange={(e) => setSelectedChannelId(e.target.value)}
            aria-label="Filter catch-up by channel"
          >
            <option value="all">All Catch-up Channels ({catchupChannels.length})</option>
            {catchupChannels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.number ? `${c.number}. ` : ''}{c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Programme Content List */}
        <div className="catchup-modal-content">
          {programmes.length === 0 ? (
            <div className="catchup-empty-state">
              <Icon name="tv" size={36} />
              <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--fg)' }}>
                No Catch-up Broadcasts Found
              </div>
              <p style={{ maxWidth: 400, margin: 0, fontSize: '0.875rem' }}>
                There are no recorded programmes matching your criteria for {selectedBucket.label} ({selectedBucket.dateString}). Try picking another day or clearing your search filter.
              </p>
            </div>
          ) : (
            programmes.map((item) => {
              const timeRange = `${formatClock(item.start)} - ${formatClock(item.stop)} (${item.durationMins}m)`
              return (
                <div key={`${item.channelId}-${item.programmeId}`} className="catchup-programme-card">
                  <div className="catchup-card-left">
                    <div className="catchup-card-channel-row">
                      <span className="catchup-channel-badge">{item.channelName}</span>
                      <span className="catchup-card-time">{timeRange}</span>
                      {item.category && (
                        <span className="chip" style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem' }}>
                          {item.category}
                        </span>
                      )}
                    </div>
                    <div className="catchup-card-title">{item.title}</div>
                    {item.description && (
                      <div className="catchup-card-desc">{item.description}</div>
                    )}
                  </div>

                  <div className="catchup-card-right">
                    <button
                      type="button"
                      className="btn btn-primary btn-small"
                      onClick={() => handlePlay(item.ref)}
                    >
                      <Icon name="play" size={14} />
                      Watch Replay
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
