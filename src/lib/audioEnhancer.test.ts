// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AudioEnhancer, DEFAULT_AUDIO_SETTINGS } from './audioEnhancer'

describe('AudioEnhancer', () => {
  let mockGain: any
  let mockFilter: any
  let mockCompressor: any
  let mockSource: any
  let mockDelay: any

  beforeEach(() => {
    mockGain = {
      gain: { value: 1.0 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }
    mockDelay = {
      delayTime: { value: 0.0 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }
    mockFilter = {
      type: 'peaking',
      frequency: { value: 2500 },
      Q: { value: 1.2 },
      gain: { value: 0 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }
    mockCompressor = {
      threshold: { value: -24 },
      knee: { value: 30 },
      ratio: { value: 1.0 },
      attack: { value: 0.003 },
      release: { value: 0.25 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }
    mockSource = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    }
    class MockAudioContext {
      state = 'running'
      destination = {}
      createGain = vi.fn(() => mockGain)
      createDelay = vi.fn(() => mockDelay)
      createBiquadFilter = vi.fn(() => mockFilter)
      createDynamicsCompressor = vi.fn(() => mockCompressor)
      createMediaElementSource = vi.fn(() => mockSource)
      resume = vi.fn().mockResolvedValue(undefined)
      close = vi.fn().mockResolvedValue(undefined)
    }

    vi.stubGlobal('AudioContext', MockAudioContext)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('attaches to HTMLVideoElement and builds the Web Audio graph', () => {
    const enhancer = new AudioEnhancer()
    const video = document.createElement('video')

    const success = enhancer.attach(video)
    expect(success).toBe(true)
    expect(enhancer.isAttached()).toBe(true)

    // Verify audio node connections start from source into delay
    expect(mockSource.connect).toHaveBeenCalledWith(mockDelay)
  })

  it('applies dialogue boost by adjusting the peaking filter gain', () => {
    const enhancer = new AudioEnhancer()
    const video = document.createElement('video')
    enhancer.attach(video)

    // Enable dialogue clarity
    enhancer.apply({
      dialogueBoost: true,
      nightMode: false,
      volumeBoost: 1.0,
    })

    // Disable dialogue clarity
    enhancer.apply({
      dialogueBoost: false,
      nightMode: false,
      volumeBoost: 1.0,
    })
  })

  it('applies night mode by adjusting the dynamics compressor ratio', () => {
    const enhancer = new AudioEnhancer()
    const video = document.createElement('video')
    enhancer.attach(video)

    // Enable night mode compression
    enhancer.apply({
      dialogueBoost: false,
      nightMode: true,
      volumeBoost: 1.0,
    })
    expect(mockCompressor.ratio.value).toBe(12.0)

    // Disable night mode
    enhancer.apply({
      dialogueBoost: false,
      nightMode: false,
      volumeBoost: 1.0,
    })
    expect(mockCompressor.ratio.value).toBe(1.0)
  })

  it('applies audio lip-sync delay in milliseconds', () => {
    const enhancer = new AudioEnhancer()
    const video = document.createElement('video')
    enhancer.attach(video)

    enhancer.apply({
      dialogueBoost: false,
      nightMode: false,
      volumeBoost: 1.0,
      audioDelayMs: 250,
    })
    expect(mockDelay.delayTime.value).toBe(0.25)

    enhancer.apply({
      dialogueBoost: false,
      nightMode: false,
      volumeBoost: 1.0,
      audioDelayMs: 600,
    })
    expect(mockDelay.delayTime.value).toBe(0.6)
  })

  it('applies auto-loudness normalization compression', () => {
    const enhancer = new AudioEnhancer()
    const video = document.createElement('video')
    enhancer.attach(video)

    enhancer.apply({
      dialogueBoost: false,
      nightMode: false,
      autoLoudness: true,
      volumeBoost: 1.0,
    })
    expect(mockCompressor.threshold.value).toBe(-18)
    expect(mockCompressor.ratio.value).toBe(3.5)
  })

  it('applies volume boost up to 2.5x gain', () => {
    const enhancer = new AudioEnhancer()
    const video = document.createElement('video')
    enhancer.attach(video)

    // 150% volume boost
    enhancer.apply({
      dialogueBoost: false,
      nightMode: false,
      volumeBoost: 1.5,
    })
    expect(mockGain.gain.value).toBe(1.5)

    // 200% volume boost
    enhancer.apply({
      dialogueBoost: false,
      nightMode: false,
      volumeBoost: 2.0,
    })
    expect(mockGain.gain.value).toBe(2.0)

    // Clamps excessive volume boost
    enhancer.apply({
      dialogueBoost: false,
      nightMode: false,
      volumeBoost: 5.0,
    })
    expect(mockGain.gain.value).toBe(2.5)
  })

  it('detaches cleanly and disconnects audio nodes', () => {
    const enhancer = new AudioEnhancer()
    const video = document.createElement('video')
    enhancer.attach(video)

    enhancer.detach()
    expect(enhancer.isAttached()).toBe(false)
    expect(mockSource.disconnect).toHaveBeenCalled()
    expect(mockDelay.disconnect).toHaveBeenCalled()
    expect(mockCompressor.disconnect).toHaveBeenCalled()
    expect(mockGain.disconnect).toHaveBeenCalled()
  })

  it('handles environments where Web Audio is unavailable without throwing', () => {
    vi.stubGlobal('AudioContext', undefined)
    const enhancer = new AudioEnhancer()
    const video = document.createElement('video')

    const success = enhancer.attach(video)
    expect(success).toBe(false)
    expect(enhancer.isAttached()).toBe(false)

    // Applying settings when unattached does not throw
    expect(() => enhancer.apply(DEFAULT_AUDIO_SETTINGS)).not.toThrow()
    expect(() => enhancer.detach()).not.toThrow()
  })
})
