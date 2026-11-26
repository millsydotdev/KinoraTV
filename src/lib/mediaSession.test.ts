import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  registerMediaSessionHandlers,
  updateMediaSessionMetadata,
  updateMediaSessionPlaybackState,
  updateMediaSessionPositionState,
} from './mediaSession'

describe('mediaSession', () => {
  const originalMediaSession = navigator.mediaSession
  let mockActionHandlers: Record<string, ((details?: any) => void) | null> = {}
  let mockSetPositionState: any

  beforeEach(() => {
    mockActionHandlers = {}
    mockSetPositionState = vi.fn()

    // Setup mock navigator.mediaSession
    Object.defineProperty(navigator, 'mediaSession', {
      value: {
        metadata: null,
        playbackState: 'none',
        setActionHandler: vi.fn((action: string, handler: any) => {
          mockActionHandlers[action] = handler
        }),
        setPositionState: mockSetPositionState,
      },
      writable: true,
      configurable: true,
    })

    // Mock global MediaMetadata
    globalThis.MediaMetadata = class MockMediaMetadata {
      title: string
      artist: string
      album: string
      artwork: any[]
      constructor(init: any) {
        this.title = init.title
        this.artist = init.artist
        this.album = init.album
        this.artwork = init.artwork
      }
    } as any
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'mediaSession', {
      value: originalMediaSession,
      writable: true,
      configurable: true,
    })
    vi.restoreAllMocks()
  })

  describe('updateMediaSessionMetadata', () => {
    it('sets metadata on navigator.mediaSession', () => {
      updateMediaSessionMetadata({
        title: 'Arrival',
        artist: 'Denis Villeneuve',
        album: 'Sci-Fi Cinema',
        artwork: [{ src: 'https://example.com/poster.jpg' }],
      })

      expect(navigator.mediaSession.metadata).toBeDefined()
      expect(navigator.mediaSession.metadata?.title).toBe('Arrival')
      expect(navigator.mediaSession.metadata?.artist).toBe('Denis Villeneuve')
    })

    it('clears metadata when null is passed', () => {
      updateMediaSessionMetadata(null)
      expect(navigator.mediaSession.metadata).toBeNull()
    })
  })

  describe('updateMediaSessionPlaybackState', () => {
    it('updates playbackState', () => {
      updateMediaSessionPlaybackState('playing')
      expect(navigator.mediaSession.playbackState).toBe('playing')

      updateMediaSessionPlaybackState('paused')
      expect(navigator.mediaSession.playbackState).toBe('paused')
    })
  })

  describe('updateMediaSessionPositionState', () => {
    it('calls setPositionState with bounded parameters', () => {
      updateMediaSessionPositionState(45, 120, 1.0)
      expect(mockSetPositionState).toHaveBeenCalledWith({
        duration: 120,
        playbackRate: 1.0,
        position: 45,
      })
    })

    it('ignores non-positive duration', () => {
      updateMediaSessionPositionState(10, 0)
      expect(mockSetPositionState).not.toHaveBeenCalled()
    })
  })

  describe('registerMediaSessionHandlers', () => {
    it('registers action handlers and invokes callbacks', () => {
      const onPlay = vi.fn()
      const onPause = vi.fn()
      const onSeekForward = vi.fn()
      const onSeekTo = vi.fn()

      const cleanup = registerMediaSessionHandlers({
        onPlay,
        onPause,
        onSeekForward,
        onSeekTo,
      })

      expect(mockActionHandlers['play']).toBeDefined()
      expect(mockActionHandlers['pause']).toBeDefined()
      expect(mockActionHandlers['seekforward']).toBeDefined()
      expect(mockActionHandlers['seekto']).toBeDefined()

      // Trigger actions
      mockActionHandlers['play']!()
      expect(onPlay).toHaveBeenCalledTimes(1)

      mockActionHandlers['seekforward']!({ seekOffset: 15 })
      expect(onSeekForward).toHaveBeenCalledWith(15)

      mockActionHandlers['seekto']!({ seekTime: 65 })
      expect(onSeekTo).toHaveBeenCalledWith(65)

      // Test cleanup unbinding
      cleanup()
      expect(navigator.mediaSession.setActionHandler).toHaveBeenCalledWith('play', null)
      expect(navigator.mediaSession.setActionHandler).toHaveBeenCalledWith('pause', null)
    })
  })
})
