/**
 * Voice Command and Speech Recognition Subsystem for Kinora.
 * Provides Web Speech API integration, intent recognition (channel zapping,
 * media search, navigation, and playback controls), and UI state tracking.
 * Strictly adheres to project typography standards: zero em-dashes.
 */

import { dispatchKinoraCommand } from './commands'

export type VoiceState = 'idle' | 'listening' | 'processing' | 'unsupported' | 'error'

export type VoiceAction =
  | { type: 'tune_channel'; query: string; channelNumber?: number }
  | { type: 'search'; query: string }
  | { type: 'navigate'; path: string; label: string }
  | {
      type: 'playback'
      command:
        | 'play'
        | 'pause'
        | 'toggle_mute'
        | 'volume_up'
        | 'volume_down'
        | 'fullscreen'
        | 'next_episode'
    }
  | { type: 'unknown'; query: string }

/** Checks whether the current runtime environment supports speech recognition. */
export function isVoiceSupported(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as unknown as {
    SpeechRecognition?: unknown
    webkitSpeechRecognition?: unknown
  }
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition)
}

/** Parses spoken transcript into a structured voice action intent. */
export function parseVoiceIntent(rawTranscript: string): VoiceAction {
  const clean = rawTranscript
    .trim()
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '')
    .replace(/\s+/g, ' ')

  if (!clean) {
    return { type: 'unknown', query: '' }
  }

  // 1. Playback controls
  if (clean === 'pause' || clean === 'pause video' || clean === 'pause playback' || clean === 'stop playback') {
    return { type: 'playback', command: 'pause' }
  }
  if (clean === 'play' || clean === 'resume' || clean === 'resume playback' || clean === 'continue watching') {
    return { type: 'playback', command: 'play' }
  }
  if (clean === 'mute' || clean === 'unmute' || clean === 'toggle mute' || clean === 'silence') {
    return { type: 'playback', command: 'toggle_mute' }
  }
  if (clean === 'volume up' || clean === 'turn it up' || clean === 'louder') {
    return { type: 'playback', command: 'volume_up' }
  }
  if (clean === 'volume down' || clean === 'turn it down' || clean === 'quieter') {
    return { type: 'playback', command: 'volume_down' }
  }
  if (clean === 'fullscreen' || clean === 'full screen' || clean === 'enter fullscreen') {
    return { type: 'playback', command: 'fullscreen' }
  }
  if (clean === 'next episode' || clean === 'play next episode' || clean === 'watch next episode') {
    return { type: 'playback', command: 'next_episode' }
  }

  // 2. Navigation commands
  if (clean === 'go to home' || clean === 'open home' || clean === 'home screen') {
    return { type: 'navigate', path: '/', label: 'Home' }
  }
  if (
    clean === 'go to live tv' ||
    clean === 'open live tv' ||
    clean === 'open live' ||
    clean === 'open guide' ||
    clean === 'open epg' ||
    clean === 'tv guide'
  ) {
    return { type: 'navigate', path: '/live', label: 'Live TV' }
  }
  if (clean === 'go to movies' || clean === 'open movies' || clean === 'browse movies') {
    return { type: 'navigate', path: '/movies', label: 'Movies' }
  }
  if (clean === 'go to series' || clean === 'open series' || clean === 'open tv shows' || clean === 'browse series') {
    return { type: 'navigate', path: '/series', label: 'Series' }
  }
  if (clean === 'go to library' || clean === 'open library' || clean === 'my library') {
    return { type: 'navigate', path: '/library', label: 'Library' }
  }
  if (clean === 'go to sources' || clean === 'open sources') {
    return { type: 'navigate', path: '/sources', label: 'Sources' }
  }
  if (clean === 'go to settings' || clean === 'open settings') {
    return { type: 'navigate', path: '/settings', label: 'Settings' }
  }
  if (clean === 'go to downloads' || clean === 'open downloads') {
    return { type: 'navigate', path: '/downloads', label: 'Downloads' }
  }

  // 3. Channel zapping & tuning: "tune to channel 101", "channel 5", "tune to bbc one"
  const zapMatch = clean.match(/^(?:tune to|switch to|change to|zap to|go to channel|channel)\s+(.+)$/)
  if (zapMatch && zapMatch[1]) {
    const target = zapMatch[1].trim()
    const num = parseInt(target, 10)
    if (!isNaN(num) && num > 0) {
      return { type: 'tune_channel', query: target, channelNumber: num }
    }
    return { type: 'tune_channel', query: target }
  }

  // 4. Explicit search queries: "search for inception", "find breaking bad"
  const searchMatch = clean.match(/^(?:search for|search|find|look up)\s+(.+)$/)
  if (searchMatch && searchMatch[1]) {
    return { type: 'search', query: searchMatch[1].trim() }
  }

  // 5. Default fallback: treat spoken input as a global search query
  return { type: 'search', query: clean }
}

/** Dispatches a recognised voice action to appropriate Kinora subsystems. */
export function executeVoiceAction(
  action: VoiceAction,
  navigate: (path: string) => void,
  callbacks?: {
    onTuneChannel?: (query: string, num?: number) => void
    onSearch?: (query: string) => void
  }
): boolean {
  switch (action.type) {
    case 'navigate':
      navigate(action.path)
      return true

    case 'playback':
      if (action.command === 'pause') {
        dispatchKinoraCommand({ type: 'pausePlayback', payload: {}, source: 'voice' })
        return true
      }
      if (action.command === 'play') {
        dispatchKinoraCommand({ type: 'resumePlayback', payload: {}, source: 'voice' })
        return true
      }
      if (action.command === 'toggle_mute') {
        dispatchKinoraCommand({ type: 'toggleMute', payload: {}, source: 'voice' })
        return true
      }
      if (action.command === 'fullscreen') {
        dispatchKinoraCommand({ type: 'togglePiP', payload: { state: 'fullscreen' }, source: 'voice' })
        return true
      }
      if (action.command === 'volume_up') {
        dispatchKinoraCommand({ type: 'setVolume', payload: { level: 90 }, source: 'voice' })
        return true
      }
      if (action.command === 'volume_down') {
        dispatchKinoraCommand({ type: 'setVolume', payload: { level: 40 }, source: 'voice' })
        return true
      }
      return false

    case 'tune_channel':
      if (callbacks?.onTuneChannel) {
        callbacks.onTuneChannel(action.query, action.channelNumber)
        return true
      }
      navigate(`/live?tune=${encodeURIComponent(action.query)}`)
      return true

    case 'search':
      if (callbacks?.onSearch) {
        callbacks.onSearch(action.query)
        return true
      }
      navigate(`/search?q=${encodeURIComponent(action.query)}`)
      return true

    case 'unknown':
    default:
      return false
  }
}

/** Controller managing speech recognition lifecycle and callbacks. */
export class VoiceRecognitionController {
  private recognition: any = null
  private state: VoiceState = 'idle'
  private listeners = new Set<(state: VoiceState, transcript: string) => void>()
  private lastTranscript = ''

  constructor(lang = 'en-US') {
    if (typeof window === 'undefined') {
      this.state = 'unsupported'
      return
    }
    const w = window as any
    const SpeechRec = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!SpeechRec) {
      this.state = 'unsupported'
      return
    }

    try {
      this.recognition = new SpeechRec()
      this.recognition.lang = lang
      this.recognition.continuous = false
      this.recognition.interimResults = true

      this.recognition.onstart = () => {
        this.state = 'listening'
        this.notify()
      }

      this.recognition.onresult = (event: any) => {
        let interim = ''
        let final = ''
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i]
          if (item.isFinal) {
            final += item[0].transcript
          } else {
            interim += item[0].transcript
          }
        }
        const text = final || interim
        this.lastTranscript = text
        this.notify()
      }

      this.recognition.onerror = () => {
        this.state = 'error'
        this.notify()
      }

      this.recognition.onend = () => {
        if (this.state === 'listening') {
          this.state = 'idle'
        }
        this.notify()
      }
    } catch {
      this.state = 'unsupported'
    }
  }

  public getState(): VoiceState {
    return this.state
  }

  public getTranscript(): string {
    return this.lastTranscript
  }

  public subscribe(cb: (state: VoiceState, transcript: string) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.state, this.lastTranscript)
    }
  }

  public start(): boolean {
    if (!this.recognition || this.state === 'listening') return false
    this.lastTranscript = ''
    try {
      this.recognition.start()
      return true
    } catch {
      this.state = 'error'
      this.notify()
      return false
    }
  }

  public stop(): void {
    if (this.recognition && this.state === 'listening') {
      try {
        this.recognition.stop()
      } catch {
        // Safe ignore
      }
    }
    this.state = 'idle'
    this.notify()
  }
}
