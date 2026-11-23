// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  parseNaturalLanguageIntent,
  executeAgentIntent,
  voiceAndAgentManager,
} from './voiceAndAgent'

describe('voiceAndAgent natural language parser', () => {
  it('parses playback commands accurately', () => {
    expect(parseNaturalLanguageIntent('play')).toEqual({ type: 'playback', action: 'play' })
    expect(parseNaturalLanguageIntent('pause')).toEqual({ type: 'playback', action: 'pause' })
    expect(parseNaturalLanguageIntent('toggle play')).toEqual({ type: 'playback', action: 'toggle' })
    expect(parseNaturalLanguageIntent('mute')).toEqual({ type: 'playback', action: 'mute' })
    expect(parseNaturalLanguageIntent('volume up')).toEqual({ type: 'playback', action: 'volume', value: 10 })
    expect(parseNaturalLanguageIntent('volume down')).toEqual({ type: 'playback', action: 'volume', value: -10 })
    expect(parseNaturalLanguageIntent('skip forward 30 seconds')).toEqual({ type: 'playback', action: 'step_forward', value: 30 })
    expect(parseNaturalLanguageIntent('rewind 10 seconds')).toEqual({ type: 'playback', action: 'step_back', value: 10 })
  })

  it('parses channel tuning commands with numbers and names', () => {
    expect(parseNaturalLanguageIntent('tune to channel 101')).toEqual({
      type: 'tune',
      channelNumber: 101,
    })
    expect(parseNaturalLanguageIntent('switch to BBC One')).toEqual({
      type: 'tune',
      channelName: 'bbc one',
    })
    expect(parseNaturalLanguageIntent('watch Sky News')).toEqual({
      type: 'tune',
      channelName: 'sky news',
    })
  })

  it('parses navigation commands to known screens', () => {
    expect(parseNaturalLanguageIntent('go home')).toEqual({ type: 'navigate', destination: 'home' })
    expect(parseNaturalLanguageIntent('open guide')).toEqual({ type: 'navigate', destination: 'livetv' })
    expect(parseNaturalLanguageIntent('browse movies')).toEqual({ type: 'navigate', destination: 'movies' })
    expect(parseNaturalLanguageIntent('browse series')).toEqual({ type: 'navigate', destination: 'series' })
    expect(parseNaturalLanguageIntent('open settings')).toEqual({ type: 'navigate', destination: 'settings' })
    expect(parseNaturalLanguageIntent('open library')).toEqual({ type: 'navigate', destination: 'library' })
  })

  it('parses media search queries', () => {
    expect(parseNaturalLanguageIntent('search for Inception')).toEqual({
      type: 'search',
      query: 'Inception',
    })
    expect(parseNaturalLanguageIntent('find Doctor Who')).toEqual({
      type: 'search',
      query: 'Doctor Who',
    })
  })

  it('parses playback casting and handoff commands', () => {
    expect(parseNaturalLanguageIntent('cast to Living Room TV')).toEqual({
      type: 'handoff',
      targetDeviceId: 'Living Room TV',
    })
    expect(parseNaturalLanguageIntent('play on Bedroom Shield')).toEqual({
      type: 'handoff',
      targetDeviceId: 'Bedroom Shield',
    })
  })

  it('returns null for unrecognized or empty input', () => {
    expect(parseNaturalLanguageIntent('')).toBeNull()
    expect(parseNaturalLanguageIntent('   ')).toBeNull()
    expect(parseNaturalLanguageIntent('random gibberish xyz')).toBeNull()
  })
})

describe('executeAgentIntent capability enforcement', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('enforces capabilities when caller is restricted', async () => {
    const unprivilegedCaller = {
      id: 'dev-guest',
      name: 'Guest Remote',
      capabilities: ['RemoteControl'],
    }

    // Favourites requires ClientSync or AiAgent
    const res = await executeAgentIntent(
      { type: 'favourites', action: 'add', itemRef: 'movie:test' },
      unprivilegedCaller
    )
    expect(res.success).toBe(false)
    expect(res.message).toContain('lacks library modification capability')
  })

  it('allows navigation when caller has RemoteControl or AiAgent', async () => {
    const agentCaller = {
      id: 'agent-jarvis',
      name: 'Local Assistant',
      capabilities: ['AiAgent', 'RemoteControl', 'PlaybackControl'],
    }

    const res = await executeAgentIntent({ type: 'navigate', destination: 'settings' }, agentCaller)
    expect(res.success).toBe(true)
    expect(window.location.hash).toBe('#/settings')
  })

  it('dispatches search intent to location hash', async () => {
    const res = await executeAgentIntent({ type: 'search', query: 'Cosmos' })
    expect(res.success).toBe(true)
    expect(window.location.hash).toBe('#/search?q=Cosmos')
  })

  it('dispatches channel tuning custom event', async () => {
    const tuneSpy = vi.fn()
    window.addEventListener('kinora:tune_channel', tuneSpy)

    const res = await executeAgentIntent({ type: 'tune', channelNumber: 102 })
    expect(res.success).toBe(true)
    expect(tuneSpy).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { channelNumber: 102 } })
    )

    window.removeEventListener('kinora:tune_channel', tuneSpy)
  })
})

describe('voiceAndAgentManager lifecycle and provider security', () => {
  it('defaults to safe StubVoiceProvider with zero microphone permissions', () => {
    expect(voiceAndAgentManager.getProviderName()).toContain('Inactive Local Voice Provider')
    expect(voiceAndAgentManager.isAvailable()).toBe(false)
    expect(voiceAndAgentManager.getIsListening()).toBe(false)
  })

  it('processes natural command and updates state', async () => {
    const res = await voiceAndAgentManager.processNaturalCommand('open guide')
    expect(res.success).toBe(true)
    expect(res.intentType).toBe('navigate')
    expect(voiceAndAgentManager.getLastTranscript()).toBe('open guide')
    expect(voiceAndAgentManager.getLastResult()?.success).toBe(true)
  })

  it('handles unknown commands cleanly without throwing', async () => {
    const res = await voiceAndAgentManager.processNaturalCommand('make me a cup of tea')
    expect(res.success).toBe(false)
    expect(res.message).toContain('Could not understand command')
  })
})
