// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  handleIncomingRemoteCommand,
  addRemoteCommandListener,
  broadcastRemotePlaybackState,
} from './remoteServerSync'
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
})
