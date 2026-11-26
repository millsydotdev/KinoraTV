import { describe, expect, it } from 'vitest'
import {
  applySyncAction,
  calculateClockDrift,
  createSyncRoom,
  generateRoomId,
  SyncPlayManager,
  type SyncAction,
} from './syncPlay'

describe('SyncPlay Co-Watching Controller', () => {
  it('generates properly formatted room IDs', () => {
    const id = generateRoomId()
    expect(id).toMatch(/^KIN-[A-Z0-9]{3}-[A-Z0-9]{3}$/)
  })

  it('creates an initialized sync room with host peer', () => {
    const room = createSyncRoom('KIN-ABC-123', 'Movie Night', {
      id: 'host-1',
      name: 'Alice',
    }, {
      ref: 'movie:synthetic-dawn',
      title: 'Synthetic Dawn',
    })

    expect(room.id).toBe('KIN-ABC-123')
    expect(room.name).toBe('Movie Night')
    expect(room.hostId).toBe('host-1')
    expect(room.mediaTitle).toBe('Synthetic Dawn')
    expect(room.playbackState).toBe('paused')
    expect(room.peers.length).toBe(1)
    expect(room.peers[0]?.isHost).toBe(true)
  })

  it('calculates clock drift accurately and flags seeks when drift exceeds tolerance', () => {
    const lastUpdated = 10000

    // Case 1: Within tolerance (0.2s drift)
    const driftSmall = calculateClockDrift(10.2, 10.0, 'paused', lastUpdated, 10000, 20)
    expect(Math.abs(driftSmall.driftSec)).toBeLessThanOrEqual(0.3)
    expect(driftSmall.needsSeek).toBe(false)

    // Case 2: Out of sync (> 0.5s drift)
    const driftLarge = calculateClockDrift(15.0, 10.0, 'paused', lastUpdated, 10000, 20)
    expect(driftLarge.driftSec).toBeGreaterThan(4)
    expect(driftLarge.needsSeek).toBe(true)
    expect(driftLarge.targetSeekSec).toBeCloseTo(10.01, 1)

    // Case 3: Playing state projects elapsed wall-clock time
    // 5 seconds elapsed between lastUpdated and nowMs
    const driftPlaying = calculateClockDrift(15.0, 10.0, 'playing', 10000, 15000, 0)
    // Projected pos is 10 + 5 = 15. Local pos is 15 -> drift should be ~0!
    expect(Math.abs(driftPlaying.driftSec)).toBeLessThan(0.01)
    expect(driftPlaying.needsSeek).toBe(false)
  })

  it('applies peer actions correctly to room state', () => {
    let room = createSyncRoom('KIN-111-222', 'Test Room', { id: 'host-1', name: 'Alice' })

    // Join action from Bob
    const joinAction: SyncAction = {
      type: 'JOIN',
      roomId: 'KIN-111-222',
      peerId: 'peer-2',
      peerName: 'Bob',
      positionSec: 0,
      playbackState: 'paused',
      timestamp: Date.now(),
    }
    room = applySyncAction(room, joinAction)
    expect(room.peers.length).toBe(2)
    expect(room.peers[1]?.name).toBe('Bob')

    // Host plays at second 42
    const playAction: SyncAction = {
      type: 'PLAY',
      roomId: 'KIN-111-222',
      peerId: 'host-1',
      peerName: 'Alice',
      positionSec: 42,
      playbackState: 'playing',
      timestamp: Date.now(),
    }
    room = applySyncAction(room, playAction)
    expect(room.playbackState).toBe('playing')
    expect(room.positionSec).toBe(42)

    // Bob leaves
    const leaveAction: SyncAction = {
      type: 'LEAVE',
      roomId: 'KIN-111-222',
      peerId: 'peer-2',
      peerName: 'Bob',
      positionSec: 42,
      playbackState: 'playing',
      timestamp: Date.now(),
    }
    room = applySyncAction(room, leaveAction)
    expect(room.peers.length).toBe(1)
  })

  it('manages local SyncPlay room lifecycle in SyncPlayManager', () => {
    const manager = new SyncPlayManager('Test Viewer')
    expect(manager.getPeerName()).toBe('Test Viewer')

    let notifiedRoomId = ''
    const unsub = manager.subscribe((r) => {
      if (r) notifiedRoomId = r.id
    })

    const room = manager.createRoom('Co-watch Party', { ref: 'movie:test', title: 'Test Title' })
    expect(room.id).toBeTruthy()
    expect(notifiedRoomId).toBe(room.id)

    manager.leaveRoom()
    expect(manager.getRoom()).toBeNull()

    unsub()
    manager.destroy()
  })
})
