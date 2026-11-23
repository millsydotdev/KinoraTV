import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseVoiceIntent,
  executeVoiceAction,
  isVoiceSupported,
  VoiceRecognitionController,
} from './voiceCommand'

describe('Voice Command Subsystem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('isVoiceSupported', () => {
    it('returns false when window SpeechRecognition is not present', () => {
      expect(isVoiceSupported()).toBe(false)
    })
  })

  describe('parseVoiceIntent', () => {
    it('parses playback controls accurately', () => {
      expect(parseVoiceIntent('pause')).toEqual({ type: 'playback', command: 'pause' })
      expect(parseVoiceIntent('Pause Video.')).toEqual({ type: 'playback', command: 'pause' })
      expect(parseVoiceIntent('resume')).toEqual({ type: 'playback', command: 'play' })
      expect(parseVoiceIntent('play')).toEqual({ type: 'playback', command: 'play' })
      expect(parseVoiceIntent('mute')).toEqual({ type: 'playback', command: 'toggle_mute' })
      expect(parseVoiceIntent('volume up')).toEqual({ type: 'playback', command: 'volume_up' })
      expect(parseVoiceIntent('volume down')).toEqual({ type: 'playback', command: 'volume_down' })
      expect(parseVoiceIntent('fullscreen')).toEqual({ type: 'playback', command: 'fullscreen' })
      expect(parseVoiceIntent('next episode')).toEqual({ type: 'playback', command: 'next_episode' })
    })

    it('parses navigation intents accurately', () => {
      expect(parseVoiceIntent('go to home')).toEqual({ type: 'navigate', path: '/', label: 'Home' })
      expect(parseVoiceIntent('open live tv')).toEqual({ type: 'navigate', path: '/live', label: 'Live TV' })
      expect(parseVoiceIntent('open movies')).toEqual({ type: 'navigate', path: '/movies', label: 'Movies' })
      expect(parseVoiceIntent('browse series')).toEqual({ type: 'navigate', path: '/series', label: 'Series' })
      expect(parseVoiceIntent('open library')).toEqual({ type: 'navigate', path: '/library', label: 'Library' })
      expect(parseVoiceIntent('go to sources')).toEqual({ type: 'navigate', path: '/sources', label: 'Sources' })
      expect(parseVoiceIntent('open settings')).toEqual({ type: 'navigate', path: '/settings', label: 'Settings' })
      expect(parseVoiceIntent('open downloads')).toEqual({ type: 'navigate', path: '/downloads', label: 'Downloads' })
    })

    it('parses channel zapping and tuning commands', () => {
      expect(parseVoiceIntent('channel 101')).toEqual({
        type: 'tune_channel',
        query: '101',
        channelNumber: 101,
      })
      expect(parseVoiceIntent('zap to 5')).toEqual({
        type: 'tune_channel',
        query: '5',
        channelNumber: 5,
      })
      expect(parseVoiceIntent('tune to BBC One')).toEqual({
        type: 'tune_channel',
        query: 'bbc one',
      })
      expect(parseVoiceIntent('switch to Sky Sports Main Event')).toEqual({
        type: 'tune_channel',
        query: 'sky sports main event',
      })
    })

    it('parses explicit search queries', () => {
      expect(parseVoiceIntent('search for Inception')).toEqual({
        type: 'search',
        query: 'inception',
      })
      expect(parseVoiceIntent('find Oppenheimer')).toEqual({
        type: 'search',
        query: 'oppenheimer',
      })
    })

    it('falls back to search for unrecognized utterances', () => {
      expect(parseVoiceIntent('documentaries about space')).toEqual({
        type: 'search',
        query: 'documentaries about space',
      })
      expect(parseVoiceIntent('')).toEqual({
        type: 'unknown',
        query: '',
      })
    })
  })

  describe('executeVoiceAction', () => {
    it('executes navigation action via provided navigate callback', () => {
      const navigate = vi.fn()
      const handled = executeVoiceAction(
        { type: 'navigate', path: '/movies', label: 'Movies' },
        navigate
      )
      expect(handled).toBe(true)
      expect(navigate).toHaveBeenCalledWith('/movies')
    })

    it('invokes onTuneChannel callback when tuning channel', () => {
      const navigate = vi.fn()
      const onTune = vi.fn()
      const handled = executeVoiceAction(
        { type: 'tune_channel', query: '101', channelNumber: 101 },
        navigate,
        { onTuneChannel: onTune }
      )
      expect(handled).toBe(true)
      expect(onTune).toHaveBeenCalledWith('101', 101)
      expect(navigate).not.toHaveBeenCalled()
    })

    it('navigates to /live?tune=... when onTuneChannel is not provided', () => {
      const navigate = vi.fn()
      const handled = executeVoiceAction(
        { type: 'tune_channel', query: 'bbc one' },
        navigate
      )
      expect(handled).toBe(true)
      expect(navigate).toHaveBeenCalledWith('/live?tune=bbc%20one')
    })

    it('invokes onSearch callback or navigates to search page', () => {
      const navigate = vi.fn()
      const onSearch = vi.fn()
      executeVoiceAction({ type: 'search', query: 'matrix' }, navigate, { onSearch })
      expect(onSearch).toHaveBeenCalledWith('matrix')

      executeVoiceAction({ type: 'search', query: 'interstellar' }, navigate)
      expect(navigate).toHaveBeenCalledWith('/search?q=interstellar')
    })

    it('dispatches kinora command for playback intents', () => {
      const navigate = vi.fn()
      const handled = executeVoiceAction({ type: 'playback', command: 'pause' }, navigate)
      expect(handled).toBe(true)
    })
  })

  describe('VoiceRecognitionController', () => {
    it('initializes to unsupported state when Web Speech API is absent', () => {
      const ctrl = new VoiceRecognitionController()
      expect(ctrl.getState()).toBe('unsupported')
      expect(ctrl.start()).toBe(false)
      expect(ctrl.getTranscript()).toBe('')
    })
  })
})
