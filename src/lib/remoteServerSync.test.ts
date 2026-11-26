// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  handleIncomingRemoteCommand,
  addRemoteCommandListener,
  broadcastRemotePlaybackState,
} from './remoteServerSync'
import { mergeRemoteLibraryIntoLocal } from './clientSync'
import * as nativeModule from './native'

vi.mock('./remoteNav', () => ({
  navigateSpatial: vi.fn(),
}))

vi.mock('./commands', () => ({
  kinoraChangeChannel: vi.fn(),
  kinoraTogglePlayback: vi.fn(),
  dispatchKinoraCommand: vi.fn(),
}))

describe('remoteServerSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('notifies custom command listeners when command arrives', () => {
    const listener = vi.fn()
    const unsubscribe = addRemoteCommandListener(listener)

    handleIncomingRemoteCommand({
      command: 'test_cmd',
      timestamp: Date.now(),
      clientId: 'client-1',
    })

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ command: 'test_cmd', clientId: 'client-1' })
    )

    unsubscribe()
    handleIncomingRemoteCommand({
      command: 'test_cmd_2',
      timestamp: Date.now(),
    })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('handles spatial navigation d-pad commands', async () => {
    const { navigateSpatial } = await import('./remoteNav')

    handleIncomingRemoteCommand({ command: 'dpad_up', timestamp: Date.now() })
    expect(navigateSpatial).toHaveBeenCalledWith('up')

    handleIncomingRemoteCommand({ command: 'dpad_down', timestamp: Date.now() })
    expect(navigateSpatial).toHaveBeenCalledWith('down')

    handleIncomingRemoteCommand({ command: 'dpad_left', timestamp: Date.now() })
    expect(navigateSpatial).toHaveBeenCalledWith('left')

    handleIncomingRemoteCommand({ command: 'dpad_right', timestamp: Date.now() })
    expect(navigateSpatial).toHaveBeenCalledWith('right')
  })

  it('handles playback toggling and state commands', async () => {
    const { kinoraTogglePlayback, dispatchKinoraCommand } = await import('./commands')

    handleIncomingRemoteCommand({ command: 'play_pause', timestamp: Date.now() })
    expect(kinoraTogglePlayback).toHaveBeenCalled()

    handleIncomingRemoteCommand({ command: 'play', timestamp: Date.now() })
    expect(dispatchKinoraCommand).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'resumePlayback', source: 'remote' })
    )

    handleIncomingRemoteCommand({ command: 'pause', timestamp: Date.now() })
    expect(dispatchKinoraCommand).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'pausePlayback', source: 'remote' })
    )

    handleIncomingRemoteCommand({ command: 'mute', timestamp: Date.now() })
    expect(dispatchKinoraCommand).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'toggleMute', source: 'remote' })
    )
  })

  it('handles channel switching commands', async () => {
    const { kinoraChangeChannel } = await import('./commands')

    handleIncomingRemoteCommand({ command: 'ch_up', timestamp: Date.now() })
    expect(kinoraChangeChannel).toHaveBeenCalledWith('up')

    handleIncomingRemoteCommand({ command: 'ch_down', timestamp: Date.now() })
    expect(kinoraChangeChannel).toHaveBeenCalledWith('down')
  })

  it('dispatches keyboard and custom events for shortcuts and numeric zap', () => {
    const keydownSpy = vi.fn()
    window.addEventListener('keydown', keydownSpy)

    const zapSpy = vi.fn()
    window.addEventListener('kinora:numeric_zap', zapSpy)

    handleIncomingRemoteCommand({ command: 'subtitles', timestamp: Date.now() })
    expect(keydownSpy).toHaveBeenCalledWith(expect.objectContaining({ key: 'c' }))

    handleIncomingRemoteCommand({ command: 'aspect', timestamp: Date.now() })
    expect(keydownSpy).toHaveBeenCalledWith(expect.objectContaining({ key: 'a' }))

    handleIncomingRemoteCommand({ command: 'seek_forward', timestamp: Date.now() })
    expect(keydownSpy).toHaveBeenCalledWith(expect.objectContaining({ key: 'ArrowRight' }))

    handleIncomingRemoteCommand({ command: 'seek_backward', timestamp: Date.now() })
    expect(keydownSpy).toHaveBeenCalledWith(expect.objectContaining({ key: 'ArrowLeft' }))

    handleIncomingRemoteCommand({
      command: 'digit',
      payload: { digit: 5 },
      timestamp: Date.now(),
    })
    expect(zapSpy).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { digit: 5 } })
    )

    window.removeEventListener('keydown', keydownSpy)
    window.removeEventListener('kinora:numeric_zap', zapSpy)
  })

  it('handles remote input_text, tune_channel and agent commands', () => {
    const tuneSpy = vi.fn()
    window.addEventListener('kinora:tune_channel', tuneSpy)

    handleIncomingRemoteCommand({
      command: 'tune_channel',
      payload: { channelId: 'ch-99', channelNumber: 105 },
      timestamp: Date.now(),
    })
    expect(tuneSpy).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { channelId: 'ch-99', channelNumber: 105 } })
    )

    handleIncomingRemoteCommand({
      command: 'agent_tune',
      payload: { channelId: 'ch-42' },
      timestamp: Date.now(),
    })
    expect(tuneSpy).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { channelId: 'ch-42' } })
    )

    handleIncomingRemoteCommand({
      command: 'input_text',
      payload: { text: 'nature documentary' },
      timestamp: Date.now(),
    })
    expect(window.location.hash).toContain('nature%20documentary')

    handleIncomingRemoteCommand({
      command: 'agent_search',
      payload: { query: 'planet earth' },
      timestamp: Date.now(),
    })
    expect(window.location.hash).toContain('planet%20earth')

    const castSpy = vi.fn()
    window.addEventListener('kinora:cast_media', castSpy)
    handleIncomingRemoteCommand({
      command: 'cast_media',
      payload: { title: 'Test Film', streamUrl: 'http://test.com/stream.m3u8' },
      timestamp: Date.now(),
    })
    expect(castSpy).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.objectContaining({ title: 'Test Film' }) })
    )
    window.removeEventListener('kinora:cast_media', castSpy)

    window.removeEventListener('kinora:tune_channel', tuneSpy)
  })

  it('broadcasts playback state updates to native layer', async () => {
    const updateSpy = vi.spyOn(nativeModule, 'updateRemotePlaybackState').mockResolvedValue(true)

    const dummyState: nativeModule.RemotePlaybackState = {
      title: 'BBC One HD',
      isPlaying: true,
      volume: 0.9,
      isMuted: false,
      durationSec: 3600,
      positionSec: 120,
    }

    broadcastRemotePlaybackState(dummyState, true)
    expect(updateSpy).toHaveBeenCalledWith(dummyState)
  })

  it('handles seek_to by dispatching kinora:remote_seek and updating active video', () => {
    const video = document.createElement('video')
    Object.defineProperty(video, 'duration', { value: 600, configurable: true })
    document.body.appendChild(video)

    const seekSpy = vi.fn()
    window.addEventListener('kinora:remote_seek', seekSpy)

    handleIncomingRemoteCommand({
      command: 'seek_to',
      payload: { positionSec: 245 },
      timestamp: Date.now(),
    })
    expect(video.currentTime).toBe(245)
    expect(seekSpy).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { positionSec: 245 } })
    )

    // Invalid negative seek values are ignored safely
    handleIncomingRemoteCommand({
      command: 'seek_to',
      payload: { positionSec: -10 },
      timestamp: Date.now(),
    })
    expect(seekSpy).toHaveBeenCalledTimes(1)

    window.removeEventListener('kinora:remote_seek', seekSpy)
    video.remove()
  })

  it('handles play_media_item by dispatching event and falling back to search hash when unhandled', () => {
    window.location.hash = '#/'
    const mediaSpy = vi.fn()
    window.addEventListener('kinora:play_media_item', mediaSpy)

    handleIncomingRemoteCommand({
      command: 'play_media_item',
      payload: { mediaId: 'mov-1', title: 'Solaris', kind: 'movie' },
      timestamp: Date.now(),
    })
    expect(mediaSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { mediaId: 'mov-1', title: 'Solaris', kind: 'movie' },
      })
    )
    expect(window.location.hash).toBe('#/search?q=Solaris')
    window.removeEventListener('kinora:play_media_item', mediaSpy)

    // When a screen handles the event via preventDefault, hash is not overwritten
    window.location.hash = '#/movies'
    const cancelHandler = (e: Event) => e.preventDefault()
    window.addEventListener('kinora:play_media_item', cancelHandler)
    handleIncomingRemoteCommand({
      command: 'play_media_item',
      payload: { mediaId: 'mov-2', title: 'Stalker', kind: 'movie' },
      timestamp: Date.now(),
    })
    expect(window.location.hash).toBe('#/movies')
    window.removeEventListener('kinora:play_media_item', cancelHandler)
  })

  it('normalizes agent_navigate aliases and dispatches seek/volume delta events', async () => {
    const { dispatchKinoraCommand } = await import('./commands')
    const seekDeltaSpy = vi.fn()
    const volDeltaSpy = vi.fn()
    window.addEventListener('kinora:remote_seek_delta', seekDeltaSpy)
    window.addEventListener('kinora:remote_volume_delta', volDeltaSpy)

    handleIncomingRemoteCommand({
      command: 'agent_navigate',
      payload: { destination: 'livetv' },
      timestamp: Date.now(),
    })
    expect(dispatchKinoraCommand).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'navigate', payload: { to: '/live' }, source: 'remote' })
    )

    handleIncomingRemoteCommand({ command: 'step_forward', timestamp: Date.now() })
    expect(seekDeltaSpy).toHaveBeenCalledWith(expect.objectContaining({ detail: { deltaSec: 30 } }))

    handleIncomingRemoteCommand({ command: 'step_back', timestamp: Date.now() })
    expect(seekDeltaSpy).toHaveBeenCalledWith(expect.objectContaining({ detail: { deltaSec: -10 } }))

    handleIncomingRemoteCommand({ command: 'volume_up', timestamp: Date.now() })
    expect(volDeltaSpy).toHaveBeenCalledWith(expect.objectContaining({ detail: { delta: 0.1 } }))

    handleIncomingRemoteCommand({ command: 'volume_down', timestamp: Date.now() })
    expect(volDeltaSpy).toHaveBeenCalledWith(expect.objectContaining({ detail: { delta: -0.1 } }))

    window.removeEventListener('kinora:remote_seek_delta', seekDeltaSpy)
    window.removeEventListener('kinora:remote_volume_delta', volDeltaSpy)
  })

  it('dispatches remote_search, sync_progress, and sync_library events and normalizes sync timestamps', async () => {
    const { dispatchKinoraCommand } = await import('./commands')
    const progSpy = vi.fn()
    const libSpy = vi.fn()
    window.addEventListener('kinora:remote_sync_progress', progSpy)
    window.addEventListener('kinora:remote_sync_library', libSpy)

    handleIncomingRemoteCommand({
      command: 'remote_search',
      payload: { query: 'Blade Runner' },
      timestamp: Date.now(),
    })
    expect(dispatchKinoraCommand).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'searchMedia', payload: { query: 'Blade Runner' }, source: 'remote' })
    )

    handleIncomingRemoteCommand({
      command: 'sync_progress',
      payload: { itemRef: 'movie:blade', position: 612, duration: 7000, updatedAt: 1800000000 },
      timestamp: Date.now(),
    })
    expect(progSpy).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.objectContaining({ itemRef: 'movie:blade', position: 612 }) })
    )

    handleIncomingRemoteCommand({
      command: 'sync_library',
      payload: { action: 'toggle_favourite', id: 'movie:blade', favourites: ['movie:blade'], watchlist: [] },
      timestamp: Date.now(),
    })
    expect(libSpy).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.objectContaining({ action: 'toggle_favourite', id: 'movie:blade' }) })
    )

    // Seconds-based server updatedAt must beat an older ms-based local timestamp
    const merged = mergeRemoteLibraryIntoLocal(
      {
        favourites: [],
        watchlist: [],
        progress: { 'movie:blade': { pos: 120, dur: 7000, at: 1_799_000_000_000 } },
      },
      {
        favourites: ['movie:blade'],
        watchlist: [],
        watchProgress: [{ itemRef: 'movie:blade', title: 'Blade', position: 612, duration: 7000, updatedAt: 1_800_000_000 }],
      },
      true
    )
    expect(merged.progress['movie:blade']?.pos).toBe(612)
    expect(merged.progress['movie:blade']?.at).toBe(1_800_000_000_000)

    window.removeEventListener('kinora:remote_sync_progress', progSpy)
    window.removeEventListener('kinora:remote_sync_library', libSpy)
  })
})
