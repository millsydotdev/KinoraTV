// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { kinoraCapabilities, callerHasScope } from './capabilities'
import { parseNaturalLanguageIntent, executeAgentIntent, voiceAndAgentManager } from './voiceAndAgent'

describe('kinoraCapabilities unified service', () => {
  beforeEach(() => {
    kinoraCapabilities.clearAuditLog()
    kinoraCapabilities.registerDelegates({})
    localStorage.clear()
  })

  it('enforces granular and legacy scopes cleanly', () => {
    const readOnly = { id: 'agent-1', name: 'Read Agent', capabilities: ['read:media', 'read:epg'] }
    expect(callerHasScope(readOnly, 'read:media')).toBe(true)
    expect(callerHasScope(readOnly, 'read:epg')).toBe(true)
    expect(callerHasScope(readOnly, 'control:playback')).toBe(false)
    expect(callerHasScope(readOnly, 'admin:sensitive')).toBe(false)

    const unconfirmedAdmin = { id: 'admin-1', name: 'Admin', capabilities: ['admin:sensitive'], confirmed: false }
    expect(callerHasScope(unconfirmedAdmin, 'admin:sensitive')).toBe(false)

    const confirmedAdmin = { id: 'admin-1', name: 'Admin', capabilities: ['admin:sensitive'], confirmed: true }
    expect(callerHasScope(confirmedAdmin, 'admin:sensitive')).toBe(true)
  })

  it('uses registered BrowserRouter navigate delegate instead of mutating location hash', () => {
    const navSpy = vi.fn()
    const unregister = kinoraCapabilities.registerDelegates({ navigate: navSpy })

    const res = kinoraCapabilities.navigate('livetv')
    expect(res.ok).toBe(true)
    expect(navSpy).toHaveBeenCalledWith('/live')

    unregister()
  })

  it('queries live EPG through registered delegate and returns structured hits', () => {
    const unregister = kinoraCapabilities.registerDelegates({
      queryEpg: (channelName) => [
        {
          channelId: 'ch-bbc1',
          channelName: channelName || 'BBC One',
          channelNumber: 101,
          currentTitle: 'Evening News',
          nextTitle: 'Planet Earth',
        },
      ],
    })

    const res = kinoraCapabilities.queryEpg({ channelName: 'BBC One' })
    expect(res.ok).toBe(true)
    expect(res.message).toContain('BBC One: Evening News')
    expect(res.data?.programmes).toHaveLength(1)
    expect(kinoraCapabilities.getAuditLog()[0]?.operation).toBe('query_epg')

    unregister()
  })

  it('returns live now playing and continue watching state', () => {
    const navSpy = vi.fn()
    const unregister = kinoraCapabilities.registerDelegates({
      navigate: navSpy,
      getNowPlaying: () => ({ active: true, isPlaying: true, title: 'The Cartographer', isLive: false }),
      getContinueWatchingRef: () => ({ ref: 'movie:cartographer', title: 'The Cartographer' }),
    })

    const np = kinoraCapabilities.getNowPlaying()
    expect(np.ok).toBe(true)
    expect(np.message).toContain('Now playing: The Cartographer')

    const resume = kinoraCapabilities.controlPlayback('resume_last')
    expect(resume.ok).toBe(true)
    expect(navSpy).toHaveBeenCalledWith('/watch/movie%3Acartographer')

    unregister()
  })

  it('parses extended natural language queries for EPG, recordings, devices, podcasts, and books', async () => {
    expect(parseNaturalLanguageIntent('What is currently on TV?')).toEqual({ type: 'query_epg' })
    expect(parseNaturalLanguageIntent("What's on BBC One?")).toEqual({ type: 'query_epg', channelName: 'BBC One' })
    expect(parseNaturalLanguageIntent('Continue what I was watching')).toEqual({ type: 'playback', action: 'resume_last' })
    expect(parseNaturalLanguageIntent('Check if my recording finished')).toEqual({ type: 'recordings_status' })
    expect(parseNaturalLanguageIntent('Show which devices are connected')).toEqual({ type: 'device_status' })
    expect(parseNaturalLanguageIntent('Find podcasts about history')).toEqual({ type: 'search', query: 'history', mediaKind: 'podcast' })
    expect(parseNaturalLanguageIntent('Find books about astronomy')).toEqual({ type: 'search', query: 'astronomy', mediaKind: 'book' })
    expect(parseNaturalLanguageIntent('Add Inception to my watchlist')).toEqual({ type: 'watchlist', action: 'add', itemRef: 'Inception' })

    const devStatus = await executeAgentIntent({ type: 'device_status' })
    expect(devStatus.success).toBe(true)
    expect(devStatus.message).toContain('Kinora v')
  })

  it('keeps microphone push-to-talk strictly opt-in and off by default', async () => {
    voiceAndAgentManager.updateConfig({ microphoneEnabled: false })
    await voiceAndAgentManager.startPushToTalk()
    expect(voiceAndAgentManager.getIsListening()).toBe(false)
    expect(voiceAndAgentManager.getLastError()).toContain('disabled')
  })
})
