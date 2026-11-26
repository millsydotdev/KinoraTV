// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import {
  dispatchKinoraCommand,
  registerCommandHandler,
  kinoraNavigate,
  kinoraPlayMedia,
  kinoraTogglePlayback,
  kinoraChangeChannel,
  kinoraSetVolume,
  kinoraToggleViewMode,
  type KinoraCommand,
} from './commands'

describe('Kinora Central Application Command Dispatcher', () => {
  it('dispatches commands to registered handlers', () => {
    const handler = vi.fn()
    const unregister = registerCommandHandler('navigate', handler)

    kinoraNavigate('/movies')

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'navigate',
        payload: { to: '/movies', replace: false },
        source: 'ui',
      })
    )

    unregister()
    kinoraNavigate('/series')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('dispatches media playback commands correctly', () => {
    const playHandler = vi.fn()
    const toggleHandler = vi.fn()

    const unregPlay = registerCommandHandler('playMedia', playHandler)
    const unregToggle = registerCommandHandler('togglePlayback', toggleHandler)

    kinoraPlayMedia({
      ref: 'movie:dune-2',
      title: 'Dune Part Two',
      streamUrl: 'https://example.com/stream.m3u8',
    })
    kinoraTogglePlayback()

    expect(playHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'playMedia',
        payload: {
          ref: 'movie:dune-2',
          title: 'Dune Part Two',
          streamUrl: 'https://example.com/stream.m3u8',
        },
      })
    )
    expect(toggleHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'togglePlayback',
      })
    )

    unregPlay()
    unregToggle()
  })

  it('clamps volume levels between 0 and 1', () => {
    const volumeHandler = vi.fn()
    const unreg = registerCommandHandler('setVolume', volumeHandler)

    kinoraSetVolume(1.5)
    expect(volumeHandler).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'setVolume',
        payload: { level: 1 },
      })
    )

    kinoraSetVolume(-0.2)
    expect(volumeHandler).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'setVolume',
        payload: { level: 0 },
      })
    )

    kinoraSetVolume(0.75)
    expect(volumeHandler).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'setVolume',
        payload: { level: 0.75 },
      })
    )

    unreg()
  })

  it('supports channel switching commands', () => {
    const channelHandler = vi.fn()
    const unreg = registerCommandHandler('changeChannel', channelHandler)

    kinoraChangeChannel('up')
    expect(channelHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'changeChannel',
        payload: { direction: 'up', channelNumber: undefined },
      })
    )

    kinoraChangeChannel('down', 101)
    expect(channelHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'changeChannel',
        payload: { direction: 'down', channelNumber: 101 },
      })
    )

    unreg()
  })

  it('supports viewMode toggle commands', () => {
    const viewHandler = vi.fn()
    const unreg = registerCommandHandler('toggleViewMode', viewHandler)

    kinoraToggleViewMode('tv')
    expect(viewHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'toggleViewMode',
        payload: { mode: 'tv' },
      })
    )

    unreg()
  })

  it('dispatches DOM custom events safely', () => {
    const domListener = vi.fn()
    window.addEventListener('kinora:command', domListener)

    dispatchKinoraCommand({
      type: 'searchMedia',
      payload: { query: 'interstellar' },
      source: 'remote',
    })

    expect(domListener).toHaveBeenCalledTimes(1)
    const callArgs = domListener.mock.calls[0]
    expect(callArgs).toBeDefined()
    const event = callArgs![0] as CustomEvent<KinoraCommand<'searchMedia'>>
    expect(event.detail.type).toBe('searchMedia')
    expect(event.detail.payload?.query).toBe('interstellar')
    expect(event.detail.source).toBe('remote')

    window.removeEventListener('kinora:command', domListener)
  })

  it('safely handles errors thrown inside command listeners', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const faultyHandler = vi.fn(() => {
      throw new Error('Simulation fault')
    })
    const normalHandler = vi.fn()

    const unreg1 = registerCommandHandler('navigate', faultyHandler)
    const unreg2 = registerCommandHandler('navigate', normalHandler)

    expect(() => kinoraNavigate('/safe')).not.toThrow()
    expect(faultyHandler).toHaveBeenCalled()
    expect(normalHandler).toHaveBeenCalled()

    unreg1()
    unreg2()
    consoleSpy.mockRestore()
  })
})
