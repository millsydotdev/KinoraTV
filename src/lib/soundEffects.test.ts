// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

class MockAudioParam {
  setValueAtTime = vi.fn()
  exponentialRampToValueAtTime = vi.fn()
  linearRampToValueAtTime = vi.fn()
}

class MockOscillator {
  type = 'sine'
  frequency = new MockAudioParam()
  connect = vi.fn()
  disconnect = vi.fn()
  start = vi.fn()
  stop = vi.fn()
  private listeners = new Map<string, () => void>()

  addEventListener = vi.fn((event: string, callback: () => void) => {
    this.listeners.set(event, callback)
  })

  emit(event: string) {
    this.listeners.get(event)?.()
  }
}

class MockGain {
  gain = new MockAudioParam()
  connect = vi.fn()
  disconnect = vi.fn()
}

class MockAudioContext {
  state: AudioContextState = 'running'
  currentTime = 0
  destination = { name: 'destination' }
  resume = vi.fn(async () => {
    this.state = 'running'
  })
  createOscillator = vi.fn(() => new MockOscillator())
  createGain = vi.fn(() => new MockGain())
}

async function loadService() {
  return import('./soundEffects')
}

describe('soundEffects', () => {
  let context: MockAudioContext
  let AudioContextMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    context = new MockAudioContext()
    AudioContextMock = vi.fn(function MockAudioContextCtor() {
      return context
    })
    vi.stubGlobal('AudioContext', AudioContextMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('plays channel switch rising blip and disconnects on ended', async () => {
    const { playChannelSwitchSound, setSoundFeedbackEnabled } = await loadService()
    setSoundFeedbackEnabled(true)

    playChannelSwitchSound()

    expect(AudioContextMock).toHaveBeenCalledTimes(1)
    expect(context.createOscillator).toHaveBeenCalled()
    expect(context.createGain).toHaveBeenCalled()

    const osc = context.createOscillator.mock.results[0]!.value as MockOscillator
    const gain = context.createGain.mock.results[0]!.value as MockGain
    expect(osc.type).toBe('sine')
    expect(osc.connect).toHaveBeenCalledWith(gain)
    expect(gain.connect).toHaveBeenCalledWith(context.destination)
    expect(osc.start).toHaveBeenCalled()
    expect(osc.stop).toHaveBeenCalled()

    // Simulate ended event
    osc.emit('ended')
    expect(osc.disconnect).toHaveBeenCalled()
    expect(gain.disconnect).toHaveBeenCalled()
  })

  it('plays navigation tick micro-click', async () => {
    const { playNavTickSound, setSoundFeedbackEnabled } = await loadService()
    setSoundFeedbackEnabled(true)

    playNavTickSound()

    const osc = context.createOscillator.mock.results[0]!.value as MockOscillator
    expect(osc.type).toBe('triangle')
    expect(osc.start).toHaveBeenCalled()
    expect(osc.stop).toHaveBeenCalled()
  })

  it('plays favorite two-tone chime', async () => {
    const { playFavoriteSound, setSoundFeedbackEnabled } = await loadService()
    setSoundFeedbackEnabled(true)

    playFavoriteSound()

    expect(context.createOscillator).toHaveBeenCalledTimes(2)
    expect(context.createGain).toHaveBeenCalledTimes(2)
  })

  it('silences all sound effects when disabled', async () => {
    const { playChannelSwitchSound, playNavTickSound, setSoundFeedbackEnabled } = await loadService()
    setSoundFeedbackEnabled(false)

    playChannelSwitchSound()
    playNavTickSound()

    expect(context.createOscillator).not.toHaveBeenCalled()
  })

  it('safely handles missing AudioContext without throwing', async () => {
    vi.stubGlobal('AudioContext', undefined)
    const { playChannelSwitchSound, playNavTickSound, playFavoriteSound } = await loadService()

    expect(() => {
      playChannelSwitchSound()
      playNavTickSound()
      playFavoriteSound()
    }).not.toThrow()
  })
})
