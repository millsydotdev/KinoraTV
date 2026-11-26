import { useMemo, useState } from 'react'
import type { Channel, Programme } from '../data/types'
import { ChannelMark } from './ui'
import { Icon } from './Icon'
import { cleanChannelTitle } from '../lib/cleanTitle'
import { channelGroups, inCategory } from '../state/playlists'
import './QuickChannelDrawer.css'

export interface QuickChannelDrawerProps {
  channels: Channel[]
  currentChannelId?: string
  favouriteIds: string[]
  onTune: (channel: Channel) => void
  onToggleFavourite: (channelId: string) => void
  onClose: () => void
  getProgramme?: (channelId: string) => Programme | null
  getNextProgramme?: (channelId: string) => Programme | null
}

export function QuickChannelDrawer({
  channels,
  currentChannelId,
  favouriteIds,
  onTune,
  onToggleFavourite,
  onClose,
  getProgramme,
  getNextProgramme,
}: QuickChannelDrawerProps) {
  const [filterQuery, setFilterQuery] = useState('')
  const [selectedGroup, setSelectedGroup] = useState<string>('All')

  const groups = useMemo(() => {
    const list = channelGroups(channels)
    return ['All', 'Favourites', ...list.filter((g) => g !== 'All' && g !== 'Favourites')]
  }, [channels])

  const filteredChannels = useMemo(() => {
    return channels.filter((c) => {
      if (c.isDivider) return false

      // Category check
      if (selectedGroup === 'Favourites') {
        if (!favouriteIds.includes(c.id)) return false
      } else if (selectedGroup !== 'All') {
        if (!inCategory(c, selectedGroup)) return false
      }

      // Search query check
      if (filterQuery.trim()) {
        const q = filterQuery.toLowerCase()
        const clean = (c.cleanName || cleanChannelTitle(c.name)).toLowerCase()
        const raw = c.name.toLowerCase()
        const num = String(c.number)
        return clean.includes(q) || raw.includes(q) || num === q
      }

      return true
    })
  }, [channels, selectedGroup, favouriteIds, filterQuery])

  return (
    <aside className="quick-channel-drawer" role="dialog" aria-label="Quick channel selector">
      <div className="quick-drawer-header">
        <div className="quick-drawer-title-row">
          <h3>
            <Icon name="tv" size={18} />
            <span>Channels ({filteredChannels.length})</span>
          </h3>
          <button
            type="button"
            className="icon-btn close-btn"
            onClick={onClose}
            aria-label="Close channels drawer"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="quick-drawer-search">
          <Icon name="search" size={14} />
          <input
            type="text"
            className="quick-search-input"
            placeholder="Search channels..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            autoFocus
          />
          {filterQuery && (
            <button
              type="button"
              className="quick-clear-btn"
              onClick={() => setFilterQuery('')}
              aria-label="Clear search"
            >
              <Icon name="close" size={12} />
            </button>
          )}
        </div>

        <div className="quick-drawer-chips" role="tablist">
          {groups.map((group) => {
            const active = selectedGroup === group
            return (
              <button
                key={group}
                type="button"
                role="tab"
                aria-selected={active}
                className={`quick-chip${active ? ' is-active' : ''}`}
                onClick={() => setSelectedGroup(group)}
              >
                {group}
              </button>
            )
          })}
        </div>
      </div>

      <div className="quick-drawer-list" role="list">
        {filteredChannels.length === 0 ? (
          <div className="quick-empty-state">
            <p>No matching channels found.</p>
          </div>
        ) : (
          filteredChannels.map((c) => {
            const isCurrent = c.id === currentChannelId || c.memberIds?.includes(currentChannelId ?? '')
            const isFav = favouriteIds.includes(c.id)
            const clean = c.cleanName || cleanChannelTitle(c.name)
            const prog = getProgramme?.(c.id)
            const nextProg = getNextProgramme?.(c.id)

            return (
              <div
                key={c.id}
                className={`quick-channel-row${isCurrent ? ' is-current' : ''}`}
                role="listitem"
              >
                <button
                  type="button"
                  className="quick-channel-tune-btn"
                  onClick={() => onTune(c)}
                  aria-label={`Tune to ${c.number} ${clean}`}
                >
                  <ChannelMark channel={c} size={32} />
                  <div className="quick-channel-info">
                    <div className="quick-channel-headline">
                      <span className="quick-channel-number tnum">{c.number}</span>
                      <strong className="quick-channel-name">{clean}</strong>
                      {c.badges && c.badges.slice(0, 2).map((b, idx) => (
                        <span key={`${b.kind}-${idx}`} className={`guide-channel-tag tag-${b.kind}`}>
                          {b.label}
                        </span>
                      ))}
                    </div>
                    {prog && (
                      <div className="quick-channel-prog-title">
                        <span>Now: {prog.title}</span>
                        {nextProg && <span style={{ opacity: 0.7, marginLeft: 6 }}>· Next: {nextProg.title}</span>}
                      </div>
                    )}
                  </div>
                </button>

                <button
                  type="button"
                  className={`icon-btn quick-fav-btn${isFav ? ' is-fav' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleFavourite(c.id)
                  }}
                  aria-pressed={isFav}
                  aria-label={isFav ? `Remove ${clean} from favourites` : `Add ${clean} to favourites`}
                >
                  <Icon name="heart" size={14} />
                </button>
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}
