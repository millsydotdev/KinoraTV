/**
 * SyncPlay Modal for Co-Watching and Group Playback Synchronization in Kinora.
 * Allows creating and joining watch parties with synchronized playback timing and member rosters.
 * Strictly adheres to project typography standards: zero em-dashes across all code and comments.
 */

import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import {
  syncPlayManager,
  type SyncRoom,
} from '../lib/syncPlay'
import './SyncPlayModal.css'

export interface SyncPlayModalProps {
  open: boolean
  onClose: () => void
  mediaRef?: string
  mediaTitle?: string
  currentPositionSec?: number
  isPlaying?: boolean
  onSeek?: (sec: number) => void
}

export function SyncPlayModal({
  open,
  onClose,
  mediaRef = '',
  mediaTitle = '',
  currentPositionSec = 0,
  isPlaying = false,
  onSeek,
}: SyncPlayModalProps) {
  const [activeTab, setActiveTab] = useState<'create' | 'join'>('create')
  const [room, setRoom] = useState<SyncRoom | null>(() => syncPlayManager.getRoom())
  const [roomName, setRoomName] = useState('Kinora Movie Night')
  const [roomCode, setRoomCode] = useState('')
  const [userName, setUserName] = useState(() => syncPlayManager.getPeerName())
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const unsub = syncPlayManager.subscribe((r) => {
      setRoom(r)
    })
    return () => unsub()
  }, [])

  if (!open) return null

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault()
    syncPlayManager.setPeerName(userName.trim() || 'Kinora Viewer')
    syncPlayManager.createRoom(roomName.trim() || 'Watch Party', {
      ref: mediaRef,
      title: mediaTitle || 'Current Video',
    })
  }

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault()
    const cleanCode = roomCode.trim().toUpperCase()
    if (!cleanCode) return
    syncPlayManager.setPeerName(userName.trim() || 'Kinora Viewer')
    syncPlayManager.joinRoom(cleanCode, {
      ref: mediaRef,
      title: mediaTitle || 'Current Video',
    })
  }

  const handleLeaveRoom = () => {
    syncPlayManager.leaveRoom()
  }

  const handleCopyCode = () => {
    if (room?.id) {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(room.id)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleBroadcastSync = () => {
    syncPlayManager.sendAction(
      isPlaying ? 'PLAY' : 'PAUSE',
      currentPositionSec,
      isPlaying ? 'playing' : 'paused',
    )
    if (onSeek) {
      onSeek(currentPositionSec)
    }
  }

  return (
    <div
      className="syncplay-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="SyncPlay Co-Watching"
    >
      <div className="syncplay-modal" onClick={(e) => e.stopPropagation()}>
        <div className="syncplay-header">
          <h2 className="syncplay-title">
            <Icon name="cast" size={20} />
            SyncPlay Co-Watching
          </h2>
          <button
            type="button"
            className="syncplay-close-btn"
            onClick={onClose}
            aria-label="Close SyncPlay dialog"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="syncplay-body">
          {room ? (
            /* Active Room View */
            <>
              <div className="syncplay-room-card">
                <div className="syncplay-room-header">
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Room Code</span>
                    <div className="syncplay-room-code-badge">{room.id}</div>
                  </div>
                  <button
                    type="button"
                    className="syncplay-action-btn"
                    onClick={handleCopyCode}
                    style={{ padding: '6px 12px', fontSize: '0.8125rem' }}
                  >
                    <Icon name={copied ? 'check' : 'layers'} size={14} />
                    {copied ? 'Copied' : 'Copy Code'}
                  </button>
                </div>
                <div className="syncplay-media-title">
                  Watching: <strong>{room.mediaTitle || mediaTitle || 'Live Stream'}</strong>
                </div>
              </div>

              <h4 className="syncplay-roster-title">
                Connected Viewers ({room.peers.length})
              </h4>

              <div className="syncplay-roster">
                {room.peers.map((peer) => (
                  <div key={peer.id} className="syncplay-peer-item">
                    <div className="syncplay-peer-left">
                      <span
                        className={`syncplay-status-dot ${
                          peer.state === 'buffering'
                            ? 'is-buffering'
                            : peer.state === 'paused'
                            ? 'is-paused'
                            : ''
                        }`}
                        title={`Status: ${peer.state}`}
                      />
                      <span className="syncplay-peer-name">{peer.name}</span>
                    </div>
                    <span className="syncplay-peer-badge">
                      {peer.isHost ? 'Host' : 'Viewer'}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  className="syncplay-action-btn syncplay-primary-btn"
                  onClick={handleBroadcastSync}
                  style={{ flex: 1 }}
                >
                  <Icon name="activity" size={16} />
                  Broadcast Sync
                </button>
                <button
                  type="button"
                  className="syncplay-action-btn syncplay-danger-btn"
                  onClick={handleLeaveRoom}
                >
                  <Icon name="trash" size={16} />
                  Leave Room
                </button>
              </div>
            </>
          ) : (
            /* Create / Join Tabs */
            <>
              <div className="syncplay-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'create'}
                  className={`syncplay-tab-btn ${activeTab === 'create' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('create')}
                >
                  Create Room
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'join'}
                  className={`syncplay-tab-btn ${activeTab === 'join' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('join')}
                >
                  Join Room
                </button>
              </div>

              <div className="syncplay-form-group">
                <label className="syncplay-label" htmlFor="syncplay-user-name">
                  Your Display Name
                </label>
                <input
                  id="syncplay-user-name"
                  type="text"
                  className="syncplay-input"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Your Name"
                />
              </div>

              {activeTab === 'create' ? (
                <form onSubmit={handleCreateRoom} className="syncplay-form-group">
                  <label className="syncplay-label" htmlFor="syncplay-room-name">
                    Watch Party Room Name
                  </label>
                  <input
                    id="syncplay-room-name"
                    type="text"
                    className="syncplay-input"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="e.g. Sci-Fi Sunday Party"
                  />
                  <button
                    type="submit"
                    className="syncplay-action-btn syncplay-primary-btn"
                    style={{ marginTop: '8px' }}
                  >
                    <Icon name="check" size={16} />
                    Start Watch Party
                  </button>
                </form>
              ) : (
                <form onSubmit={handleJoinRoom} className="syncplay-form-group">
                  <label className="syncplay-label" htmlFor="syncplay-room-code">
                    Room Code
                  </label>
                  <input
                    id="syncplay-room-code"
                    type="text"
                    className="syncplay-input"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value)}
                    placeholder="e.g. KIN-A8F-92K"
                    maxLength={11}
                  />
                  <button
                    type="submit"
                    className="syncplay-action-btn syncplay-primary-btn"
                    style={{ marginTop: '8px' }}
                  >
                    <Icon name="check" size={16} />
                    Join Watch Party
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
