/**
 * SyncPlay Room-Based Co-Watching Controller for Kinora.
 * Manages synchronized group playback, clock drift calculation,
 * peer presence, and real-time state consensus.
 * Strictly adheres to project typography standards: zero em-dashes across all code and comments.
 */

export interface SyncPeer {
  id: string
  name: string
  positionSec: number
  state: 'playing' | 'paused' | 'buffering'
  latencyMs: number
  lastHeartbeat: number
  isHost: boolean
}

export interface SyncRoom {
  id: string
  name: string
  hostId: string
  mediaRef: string
  mediaTitle: string
  playbackState: 'playing' | 'paused' | 'buffering'
  positionSec: number
  updatedAt: number
  peers: SyncPeer[]
}

export type SyncActionType =
  | 'JOIN'
  | 'LEAVE'
  | 'HEARTBEAT'
  | 'PLAY'
  | 'PAUSE'
  | 'SEEK'
  | 'STATE_SYNC'

export interface SyncAction {
  type: SyncActionType
  roomId: string
  peerId: string
  peerName: string
  positionSec: number
  playbackState: 'playing' | 'paused' | 'buffering'
  timestamp: number
  mediaRef?: string
  mediaTitle?: string
}

export const DRIFT_TOLERANCE_SECS = 0.5 // 500 ms threshold

/**
 * Generates a memorable, human-friendly 6-character room code.
 */
export function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `KIN-${code.slice(0, 3)}-${code.slice(3)}`
}

/**
 * Calculates drift between local playback position and the consensus room position.
 */
export function calculateClockDrift(
  localPosSec: number,
  roomPosSec: number,
  playbackState: 'playing' | 'paused' | 'buffering',
  lastUpdatedMs: number,
  nowMs = Date.now(),
  latencyMs = 0,
): { driftSec: number; needsSeek: boolean; targetSeekSec: number } {
  // If playing, advance room position by elapsed wall clock time
  let projectedRoomPos = roomPosSec
  if (playbackState === 'playing') {
    const elapsedSecs = Math.max(0, (nowMs - lastUpdatedMs) / 1000)
    projectedRoomPos += elapsedSecs
  }

  // Account for half round-trip latency
  const latencySecs = Math.max(0, latencyMs / 2000)
  const targetSeekSec = Number((projectedRoomPos + latencySecs).toFixed(2))

  const driftSec = Number((localPosSec - targetSeekSec).toFixed(3))
  const needsSeek = Math.abs(driftSec) > DRIFT_TOLERANCE_SECS

  return {
    driftSec,
    needsSeek,
    targetSeekSec,
  }
}

/**
 * Creates a new initialized SyncRoom instance.
 */
export function createSyncRoom(
  roomId: string,
  roomName: string,
  host: { id: string; name: string },
  media?: { ref: string; title: string },
): SyncRoom {
  const now = Date.now()
  const hostPeer: SyncPeer = {
    id: host.id,
    name: host.name,
    positionSec: 0,
    state: 'paused',
    latencyMs: 15,
    lastHeartbeat: now,
    isHost: true,
  }

  return {
    id: roomId,
    name: roomName || `Watch Party ${roomId}`,
    hostId: host.id,
    mediaRef: media?.ref || '',
    mediaTitle: media?.title || 'Unknown Media',
    playbackState: 'paused',
    positionSec: 0,
    updatedAt: now,
    peers: [hostPeer],
  }
}

/**
 * Applies an incoming sync action immutably to a SyncRoom state.
 */
export function applySyncAction(room: SyncRoom, action: SyncAction): SyncRoom {
  if (action.roomId !== room.id) return room

  const now = Date.now()
  const peers = [...room.peers]
  const existingPeerIdx = peers.findIndex((p) => p.id === action.peerId)

  if (action.type === 'LEAVE') {
    return {
      ...room,
      peers: peers.filter((p) => p.id !== action.peerId),
    }
  }

  if (existingPeerIdx >= 0) {
    const p = peers[existingPeerIdx]!
    peers[existingPeerIdx] = {
      ...p,
      name: action.peerName || p.name,
      positionSec: action.positionSec,
      state: action.playbackState,
      lastHeartbeat: now,
    }
  } else if (action.type === 'JOIN' || action.type === 'HEARTBEAT') {
    peers.push({
      id: action.peerId,
      name: action.peerName || 'Viewer',
      positionSec: action.positionSec,
      state: action.playbackState,
      latencyMs: 25,
      lastHeartbeat: now,
      isHost: action.peerId === room.hostId,
    })
  }

  // Update playback state if host initiated or state sync
  let nextState = room.playbackState
  let nextPos = room.positionSec
  let nextUpdatedAt = room.updatedAt
  let nextMediaRef = room.mediaRef
  let nextMediaTitle = room.mediaTitle

  const isHostAction = action.peerId === room.hostId || room.peers.length === 1

  if (isHostAction) {
    if (action.type === 'PLAY') {
      nextState = 'playing'
      nextPos = action.positionSec
      nextUpdatedAt = now
    } else if (action.type === 'PAUSE') {
      nextState = 'paused'
      nextPos = action.positionSec
      nextUpdatedAt = now
    } else if (action.type === 'SEEK') {
      nextPos = action.positionSec
      nextUpdatedAt = now
    } else if (action.type === 'STATE_SYNC') {
      nextState = action.playbackState
      nextPos = action.positionSec
      nextUpdatedAt = now
      if (action.mediaRef) nextMediaRef = action.mediaRef
      if (action.mediaTitle) nextMediaTitle = action.mediaTitle
    }
  }

  return {
    ...room,
    playbackState: nextState,
    positionSec: nextPos,
    updatedAt: nextUpdatedAt,
    mediaRef: nextMediaRef,
    mediaTitle: nextMediaTitle,
    peers,
  }
}

/**
 * Client controller managing SyncPlay broadcast channel and sync lifecycle.
 */
export class SyncPlayManager {
  private channel: BroadcastChannel | null = null
  private currentRoom: SyncRoom | null = null
  private localPeerId: string
  private localPeerName: string
  private listeners = new Set<(room: SyncRoom | null) => void>()
  private onSyncActionHandlers = new Set<(action: SyncAction) => void>()

  constructor(peerName = 'Kinora Viewer') {
    this.localPeerId = `peer-${Math.random().toString(36).slice(2, 9)}`
    this.localPeerName = peerName

    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel('kinora.syncplay.v1')
        this.channel.onmessage = (event) => {
          this.handleChannelMessage(event.data)
        }
      } catch {
        // Fallback for environments without BroadcastChannel support
      }
    }
  }

  public getRoom(): SyncRoom | null {
    return this.currentRoom
  }

  public getPeerId(): string {
    return this.localPeerId
  }

  public getPeerName(): string {
    return this.localPeerName
  }

  public setPeerName(name: string): void {
    this.localPeerName = name
  }

  public createRoom(
    roomName: string,
    media?: { ref: string; title: string },
  ): SyncRoom {
    const id = generateRoomId()
    const room = createSyncRoom(
      id,
      roomName,
      { id: this.localPeerId, name: this.localPeerName },
      media,
    )
    this.currentRoom = room
    this.broadcast({
      type: 'STATE_SYNC',
      roomId: id,
      peerId: this.localPeerId,
      peerName: this.localPeerName,
      positionSec: 0,
      playbackState: 'paused',
      timestamp: Date.now(),
      mediaRef: media?.ref,
      mediaTitle: media?.title,
    })
    this.notify()
    return room
  }

  public joinRoom(
    roomId: string,
    media?: { ref: string; title: string },
  ): SyncRoom {
    const room = createSyncRoom(
      roomId,
      `Room ${roomId}`,
      { id: 'remote-host', name: 'Host' },
      media,
    )
    this.currentRoom = room
    this.broadcast({
      type: 'JOIN',
      roomId,
      peerId: this.localPeerId,
      peerName: this.localPeerName,
      positionSec: 0,
      playbackState: 'paused',
      timestamp: Date.now(),
    })
    this.notify()
    return room
  }

  public leaveRoom(): void {
    if (!this.currentRoom) return
    this.broadcast({
      type: 'LEAVE',
      roomId: this.currentRoom.id,
      peerId: this.localPeerId,
      peerName: this.localPeerName,
      positionSec: 0,
      playbackState: 'paused',
      timestamp: Date.now(),
    })
    this.currentRoom = null
    this.notify()
  }

  public sendAction(
    type: SyncActionType,
    positionSec: number,
    playbackState: 'playing' | 'paused' | 'buffering',
  ): void {
    if (!this.currentRoom) return
    const action: SyncAction = {
      type,
      roomId: this.currentRoom.id,
      peerId: this.localPeerId,
      peerName: this.localPeerName,
      positionSec,
      playbackState,
      timestamp: Date.now(),
    }
    this.currentRoom = applySyncAction(this.currentRoom, action)
    this.broadcast(action)
    this.notify()
  }

  public subscribe(listener: (room: SyncRoom | null) => void): () => void {
    this.listeners.add(listener)
    listener(this.currentRoom)
    return () => {
      this.listeners.delete(listener)
    }
  }

  public onAction(handler: (action: SyncAction) => void): () => void {
    this.onSyncActionHandlers.add(handler)
    return () => {
      this.onSyncActionHandlers.delete(handler)
    }
  }

  private handleChannelMessage(action: SyncAction): void {
    if (!action || !action.roomId) return
    if (!this.currentRoom || this.currentRoom.id !== action.roomId) return

    // Ignore self messages
    if (action.peerId === this.localPeerId) return

    this.currentRoom = applySyncAction(this.currentRoom, action)
    for (const handler of this.onSyncActionHandlers) {
      try {
        handler(action)
      } catch {
        // Safe handler execution
      }
    }
    this.notify()
  }

  private broadcast(action: SyncAction): void {
    if (this.channel) {
      try {
        this.channel.postMessage(action)
      } catch {
        // Channel post fallback
      }
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.currentRoom)
    }
  }

  public destroy(): void {
    if (this.channel) {
      try {
        this.channel.close()
      } catch {
        // Channel close fallback
      }
      this.channel = null
    }
    this.listeners.clear()
    this.onSyncActionHandlers.clear()
  }
}

export const syncPlayManager = new SyncPlayManager()
