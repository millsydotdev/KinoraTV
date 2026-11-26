import { useState, useEffect, useContext, useRef } from 'react'
import { Icon } from './Icon'
import { ChannelMark } from './ui'
import type { Channel } from '../data/types'
import { StoreContext } from '../state/store'
import { useStreamPlayback, playbackText } from '../lib/playback'
import './LiveMosaicGrid.css'

export interface LiveMosaicGridProps {
  open: boolean
  onClose: () => void
  channels: Channel[]
  initialChannel?: Channel | null
  onTuneFullChannel: (channel: Channel) => void
}

export type MosaicLayout = '2x2' | '1+3' | '2x1'

interface TileSlot {
  channel: Channel | null
}

export function LiveMosaicGrid({
  open,
  onClose,
  channels,
  initialChannel,
  onTuneFullChannel,
}: LiveMosaicGridProps) {
  const store = useContext(StoreContext)
  const [layout, setLayout] = useState<MosaicLayout>('2x2')
  const [focusedIndex, setFocusedIndex] = useState<number>(0)
  const [pickingSlotIndex, setPickingSlotIndex] = useState<number | null>(null)
  const [channelSearch, setChannelSearch] = useState('')
  const [nowTick, setNowTick] = useState(() => Date.now())
  const activeVideoRef = useRef<HTMLVideoElement | null>(null)

  const [slots, setSlots] = useState<TileSlot[]>(() => {
    const list: TileSlot[] = [
      { channel: initialChannel ?? channels[0] ?? null },
      { channel: channels[1] ?? null },
      { channel: channels[2] ?? null },
      { channel: channels[3] ?? null },
    ]
    return list
  })

  // Refresh live EPG progress bars every 30s while open
  useEffect(() => {
    if (!open) return
    setNowTick(Date.now())
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [open])

  const activeChannel = open ? (slots[focusedIndex]?.channel ?? null) : null
  const activeStreamUrl = activeChannel?.streamUrl ?? null
  const playback = useStreamPlayback(activeStreamUrl, activeVideoRef)

  // Sync initial channel if provided and slots[0] is empty or different
  useEffect(() => {
    if (initialChannel) {
      setSlots((prev) => {
        const next = [...prev]
        next[0] = { channel: initialChannel }
        return next
      })
    }
  }, [initialChannel])

  // Keyboard navigation
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (pickingSlotIndex !== null) return
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === '1') {
        setFocusedIndex(0)
      } else if (e.key === '2') {
        setFocusedIndex(1)
      } else if (e.key === '3') {
        setFocusedIndex(2)
      } else if (e.key === '4') {
        setFocusedIndex(3)
      } else if (e.key === 'm' || e.key === 'M') {
        setLayout((prev) => (prev === '2x2' ? '1+3' : prev === '1+3' ? '2x1' : '2x2'))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, pickingSlotIndex, onClose])

  if (!open) return null

  const handleSelectChannelForSlot = (channel: Channel) => {
    if (pickingSlotIndex === null) return
    setSlots((prev) => {
      const next = [...prev]
      next[pickingSlotIndex] = { channel }
      return next
    })
    setPickingSlotIndex(null)
    setChannelSearch('')
  }

  const handleSwapToPrimary = (index: number) => {
    if (index === 0) return
    setSlots((prev) => {
      const primary = prev[0]
      const target = prev[index]
      if (!primary || !target) return prev
      const next = [...prev]
      next[0] = target
      next[index] = primary
      return next
    })
    setFocusedIndex(0)
  }

  const handleClearSlot = (index: number) => {
    setSlots((prev) => {
      const next = [...prev]
      next[index] = { channel: null }
      return next
    })
  }

  const filteredChannels = channels.filter((c) => {
    if (!channelSearch.trim()) return true
    const q = channelSearch.toLowerCase()
    return c.name.toLowerCase().includes(q) || (c.group && c.group.toLowerCase().includes(q))
  })

  return (
    <div className="mosaic-backdrop" role="dialog" aria-label="Live TV Multi-Screen Mosaic">
      <div className="mosaic-header">
        <div className="mosaic-header-left">
          <Icon name="grid" size={20} className="mosaic-title-icon" />
          <h2 className="mosaic-title">Multi-Screen Mosaic</h2>
          <span className="mosaic-hint">Click or press 1-4 to switch live focus · Double click for full screen</span>
        </div>

        <div className="mosaic-header-right">
          {activeStreamUrl && (
            <button
              type="button"
              className="mosaic-btn-mute"
              onClick={() => playback.toggleMute()}
              aria-label={playback.muted ? 'Unmute active channel' : 'Mute active channel'}
            >
              <Icon name={playback.muted ? 'mute' : 'volume'} size={15} />
              <span>{playback.muted ? 'Unmute' : 'Mute'}</span>
            </button>
          )}
          <div className="mosaic-layout-switch">
            <button
              type="button"
              className={`mosaic-btn-mode ${layout === '2x2' ? 'is-active' : ''}`}
              onClick={() => setLayout('2x2')}
              aria-label="2 by 2 Quad Grid Layout"
              title="2x2 Quad Grid"
            >
              <Icon name="grid" size={16} />
              <span>2×2 Quad</span>
            </button>
            <button
              type="button"
              className={`mosaic-btn-mode ${layout === '1+3' ? 'is-active' : ''}`}
              onClick={() => setLayout('1+3')}
              aria-label="1 plus 3 Focus Layout"
              title="1+3 Focus View"
            >
              <Icon name="layoutCompact" size={16} />
              <span>1+3 Focus</span>
            </button>
            <button
              type="button"
              className={`mosaic-btn-mode ${layout === '2x1' ? 'is-active' : ''}`}
              onClick={() => setLayout('2x1')}
              aria-label="2 by 1 Dual Split Layout"
              title="2x1 Dual Split"
            >
              <Icon name="split" size={16} />
              <span>2×1 Dual</span>
            </button>
          </div>

          <button
            type="button"
            className="icon-btn mosaic-close-btn"
            onClick={onClose}
            aria-label="Close mosaic view"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      </div>

      <div className={`mosaic-grid layout-${layout}`}>
        {slots.map((slot, index) => {
          const isFocused = focusedIndex === index
          const channel = slot.channel
          const prog = channel && store ? store.programmeAt(channel, nowTick) : null
          const progPct =
            prog && prog.stop > prog.start
              ? Math.max(0, Math.min(100, Math.round(((nowTick - prog.start) / (prog.stop - prog.start)) * 100)))
              : 0
          const minsLeft = prog ? Math.max(1, Math.round((prog.stop - nowTick) / 60_000)) : null
          const showLiveVideo = isFocused && Boolean(channel?.streamUrl)

          return (
            <div
              key={index}
              className={`mosaic-tile slot-${index} ${isFocused ? 'is-focused' : ''} ${!channel ? 'is-empty' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => setFocusedIndex(index)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  if (isFocused && channel) {
                    onTuneFullChannel(channel)
                    onClose()
                  } else {
                    setFocusedIndex(index)
                  }
                }
              }}
              onDoubleClick={() => {
                if (channel) {
                  onTuneFullChannel(channel)
                  onClose()
                }
              }}
            >
              {channel ? (
                <>
                  <div className={`mosaic-tile-stage ${showLiveVideo ? 'is-live-video' : ''}`}>
                    <div className="mosaic-tile-badge-slot">#{index + 1}</div>
                    {isFocused && (
                      <div className="mosaic-tile-live-pill">
                        {showLiveVideo
                          ? playback.state.status === 'playing'
                            ? 'LIVE'
                            : playback.state.status === 'error' || playback.state.status === 'unsupported'
                              ? 'OFFLINE'
                              : 'TUNING'
                          : 'FOCUS'}
                      </div>
                    )}
                    {showLiveVideo ? (
                      <>
                        <video
                          ref={activeVideoRef}
                          className="mosaic-video-el"
                          playsInline
                          autoPlay
                          muted={playback.muted}
                        />
                        {playback.state.status !== 'playing' && (
                          <div className="mosaic-video-status-overlay">
                            <ChannelMark channel={channel} size={44} />
                            <span className="mosaic-video-status-text">{playbackText(playback.state)}</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="mosaic-standby-content">
                        <ChannelMark channel={channel} size={52} />
                        {!isFocused && (
                          <div className="mosaic-tile-center-play" aria-hidden="true">
                            <Icon name="play" size={24} />
                          </div>
                        )}
                        {isFocused && !channel.streamUrl && (
                          <span className="mosaic-demo-label">Demo Channel · Open Fullscreen</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mosaic-tile-info">
                    <div className="mosaic-tile-channel-name">
                      <span className="mosaic-ch-num">{channel.number}</span>
                      <span className="mosaic-ch-title">{channel.name}</span>
                      {minsLeft !== null && (
                        <span className="mosaic-mins-left">{minsLeft}m left</span>
                      )}
                    </div>
                    {prog && (
                      <>
                        <div className="mosaic-tile-prog-name">{prog.title}</div>
                        <div className="mosaic-epg-track" aria-hidden="true">
                          <div className="mosaic-epg-fill" style={{ width: `${progPct}%` }} />
                        </div>
                      </>
                    )}
                  </div>

                  <div className="mosaic-tile-controls">
                    <button
                      type="button"
                      className={`mosaic-audio-badge ${isFocused ? 'is-active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (isFocused && showLiveVideo) {
                          playback.toggleMute()
                        } else {
                          setFocusedIndex(index)
                        }
                      }}
                      title={isFocused ? (playback.muted ? 'Unmute audio' : 'Audio active') : 'Click to tune & focus'}
                    >
                      <Icon name={isFocused && !playback.muted ? 'volume' : 'mute'} size={14} />
                      <span>{isFocused ? (playback.muted ? 'Muted' : 'Live Audio') : 'Standby'}</span>
                    </button>

                    <div className="mosaic-tile-actions">
                      {index !== 0 && (
                        <button
                          type="button"
                          className="mosaic-tile-action-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleSwapToPrimary(index)
                          }}
                          title="Swap to Primary Screen"
                          aria-label="Swap to Primary Screen"
                        >
                          <Icon name="swap" size={13} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="mosaic-tile-action-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          setPickingSlotIndex(index)
                        }}
                        title="Change Channel"
                        aria-label="Change Channel"
                      >
                        <Icon name="refresh" size={13} />
                      </button>
                      <button
                        type="button"
                        className="mosaic-tile-action-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          onTuneFullChannel(channel)
                          onClose()
                        }}
                        title="Watch Fullscreen"
                        aria-label="Watch Fullscreen"
                      >
                        <Icon name="fullscreen" size={13} />
                      </button>
                      <button
                        type="button"
                        className="mosaic-tile-action-btn danger"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleClearSlot(index)
                        }}
                        title="Remove Channel"
                        aria-label="Remove Channel"
                      >
                        <Icon name="x" size={13} />
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="mosaic-tile-empty-state">
                  <span className="mosaic-tile-badge-slot">#{index + 1}</span>
                  <Icon name="plus" size={32} className="mosaic-empty-icon" />
                  <p>Slot #{index + 1} Empty</p>
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    onClick={(e) => {
                      e.stopPropagation()
                      setPickingSlotIndex(index)
                    }}
                  >
                    Add Channel
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {pickingSlotIndex !== null && (
        <div className="mosaic-picker-overlay" onClick={() => setPickingSlotIndex(null)}>
          <div className="mosaic-picker-card" onClick={(e) => e.stopPropagation()}>
            <div className="mosaic-picker-head">
              <h3>Select Channel for Screen #{pickingSlotIndex + 1}</h3>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setPickingSlotIndex(null)}
                aria-label="Close picker"
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            <div className="mosaic-picker-search">
              <Icon name="search" size={14} className="mosaic-picker-search-icon" />
              <input
                type="text"
                className="mosaic-picker-input"
                placeholder="Search channels..."
                value={channelSearch}
                onChange={(e) => setChannelSearch(e.target.value)}
                autoFocus
              />
            </div>

            <div className="mosaic-picker-list">
              {filteredChannels.length === 0 ? (
                <div className="mosaic-picker-empty">No channels found.</div>
              ) : (
                filteredChannels.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="mosaic-picker-row"
                    onClick={() => handleSelectChannelForSlot(c)}
                  >
                    <span className="mosaic-picker-num">{c.number}</span>
                    <span className="mosaic-picker-name">{c.name}</span>
                    {c.group && <span className="mosaic-picker-group">{c.group}</span>}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
