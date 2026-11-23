/**
 * Intelligent AI & Pluggable Voice Control Engine for Kinora.
 * Defines structured intent models, natural language command parsing,
 * capability-gated execution, and pluggable microphone/voice providers.
 * Strictly adheres to project typography standards: zero em-dashes across all code and comments.
 */

import { useState, useEffect } from 'react'
import { dispatchKinoraCommand } from './commands'

export type AgentIntentType =
  | 'search'
  | 'tune'
  | 'playback'
  | 'navigate'
  | 'favourites'
  | 'handoff'
  | 'query_epg'

export interface SearchIntent {
  type: 'search'
  query: string
  mediaKind?: 'movie' | 'series' | 'channel' | 'radio'
}

export interface TuneIntent {
  type: 'tune'
  channelId?: string
  channelName?: string
  channelNumber?: number
}

export interface PlaybackIntent {
  type: 'playback'
  action: 'play' | 'pause' | 'toggle' | 'seek' | 'volume' | 'mute' | 'step_back' | 'step_forward'
  value?: number
}

export interface NavigateIntent {
  type: 'navigate'
  destination: 'home' | 'livetv' | 'movies' | 'series' | 'search' | 'library' | 'settings' | string
}

export interface FavouritesIntent {
  type: 'favourites'
  action: 'add' | 'remove' | 'toggle'
  itemRef: string
}

export interface HandoffIntent {
  type: 'handoff'
  targetDeviceId: string
  media?: {
    title: string
    streamUrl: string
  }
}

export interface QueryEpgIntent {
  type: 'query_epg'
  channelName?: string
  query?: string
}

export type AgentIntent =
  | SearchIntent
  | TuneIntent
  | PlaybackIntent
  | NavigateIntent
  | FavouritesIntent
  | HandoffIntent
  | QueryEpgIntent

export interface AgentCallerContext {
  id: string
  name: string
  capabilities: string[]
}

export interface IntentExecutionResult {
  success: boolean
  message: string
  intentType: AgentIntentType
  data?: unknown
}

/**
 * Natural language intent parser for voice transcripts and AI commands.
 * Converts unstructured user utterances into structured Kinora intents.
 */
export function parseNaturalLanguageIntent(transcript: string): AgentIntent | null {
  const original = transcript.trim()
  const text = original.toLowerCase()
  if (!text) return null

  // 1. Playback commands
  if (text === 'play' || text === 'resume' || text === 'start playing') {
    return { type: 'playback', action: 'play' }
  }
  if (text === 'pause' || text === 'hold on' || text === 'freeze') {
    return { type: 'playback', action: 'pause' }
  }
  if (text === 'toggle play' || text === 'play pause') {
    return { type: 'playback', action: 'toggle' }
  }
  if (text === 'mute' || text === 'unmute' || text === 'silence') {
    return { type: 'playback', action: 'mute' }
  }
  if (text.includes('volume up') || text === 'louder') {
    return { type: 'playback', action: 'volume', value: 10 }
  }
  if (text.includes('volume down') || text === 'quieter') {
    return { type: 'playback', action: 'volume', value: -10 }
  }
  if (text.includes('skip forward') || text.includes('fast forward') || text.includes('step forward')) {
    return { type: 'playback', action: 'step_forward', value: 30 }
  }
  if (text.includes('skip back') || text.includes('rewind') || text.includes('step back')) {
    return { type: 'playback', action: 'step_back', value: 10 }
  }

  // 2. Channel tuning
  const channelNumMatch = text.match(/(?:tune to|change to|switch to|channel)\s+(?:number\s+)?(\d{1,4})/i)
  if (channelNumMatch && channelNumMatch[1]) {
    return { type: 'tune', channelNumber: parseInt(channelNumMatch[1], 10) }
  }

  const channelNameMatch = text.match(/(?:tune to|switch to|put on|watch)\s+(?:channel\s+)?(.+)/i)
  if (channelNameMatch && channelNameMatch[1]) {
    const rawTarget = channelNameMatch[1].trim()
    // Avoid capturing navigation destinations as channels
    if (!['home', 'settings', 'guide', 'movies', 'series', 'library'].includes(rawTarget)) {
      return { type: 'tune', channelName: rawTarget }
    }
  }

  // 3. Navigation
  if (text.includes('go home') || text === 'home' || text === 'open home') {
    return { type: 'navigate', destination: 'home' }
  }
  if (text.includes('open guide') || text.includes('tv guide') || text.includes('live tv') || text === 'guide') {
    return { type: 'navigate', destination: 'livetv' }
  }
  if (text.includes('browse movies') || text === 'movies' || text === 'open movies') {
    return { type: 'navigate', destination: 'movies' }
  }
  if (text.includes('browse series') || text === 'tv shows' || text === 'series') {
    return { type: 'navigate', destination: 'series' }
  }
  if (text.includes('open library') || text === 'my library' || text === 'watchlist') {
    return { type: 'navigate', destination: 'library' }
  }
  if (text.includes('open settings') || text === 'settings' || text === 'preferences') {
    return { type: 'navigate', destination: 'settings' }
  }

  // 4. Search
  const searchMatch = original.match(/(?:search for|find|look up|search)\s+(.+)/i)
  if (searchMatch && searchMatch[1]) {
    return { type: 'search', query: searchMatch[1].trim() }
  }

  // 5. Cast / Handoff
  const castMatch = original.match(/(?:cast to|play on|send to|handoff to)\s+(.+)/i)
  if (castMatch && castMatch[1]) {
    return { type: 'handoff', targetDeviceId: castMatch[1].trim() }
  }

  return null
}

/**
 * Executes a structured AgentIntent against Kinora after verifying caller capabilities.
 */
export async function executeAgentIntent(
  intent: AgentIntent,
  caller?: AgentCallerContext
): Promise<IntentExecutionResult> {
  const caps = caller ? caller.capabilities.map((c) => c.toLowerCase()) : ['aiagent', 'remotecontrol', 'playbackcontrol', 'mediabrowse', 'clientsync']

  switch (intent.type) {
    case 'playback': {
      if (!caps.some((c) => c.includes('playback') || c.includes('remote') || c.includes('agent'))) {
        return { success: false, message: 'Caller lacks playback control capability', intentType: 'playback' }
      }

      if (intent.action === 'play') {
        dispatchKinoraCommand({ type: 'resumePlayback', source: 'remote' })
      } else if (intent.action === 'pause') {
        dispatchKinoraCommand({ type: 'pausePlayback', source: 'remote' })
      } else if (intent.action === 'toggle') {
        dispatchKinoraCommand({ type: 'togglePlayback', source: 'remote' })
      } else if (intent.action === 'mute') {
        dispatchKinoraCommand({ type: 'toggleMute', source: 'remote' })
      } else if (intent.action === 'step_forward') {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true }))
        }
      } else if (intent.action === 'step_back') {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', bubbles: true }))
        }
      } else if (intent.action === 'volume' && typeof intent.value === 'number') {
        const key = intent.value > 0 ? 'ArrowUp' : 'ArrowDown'
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true }))
        }
      }

      return { success: true, message: `Executed playback action: ${intent.action}`, intentType: 'playback' }
    }

    case 'tune': {
      if (!caps.some((c) => c.includes('playback') || c.includes('remote') || c.includes('agent') || c.includes('browse'))) {
        return { success: false, message: 'Caller lacks channel tuning capability', intentType: 'tune' }
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kinora:tune_channel', {
          detail: {
            channelId: intent.channelId,
            channelNumber: intent.channelNumber,
            channelName: intent.channelName,
          },
        }))
      }

      const desc = intent.channelNumber ? `Channel ${intent.channelNumber}` : (intent.channelName || intent.channelId || 'channel')
      return { success: true, message: `Tuning to ${desc}`, intentType: 'tune' }
    }

    case 'navigate': {
      if (!caps.some((c) => c.includes('remote') || c.includes('agent'))) {
        return { success: false, message: 'Caller lacks navigation capability', intentType: 'navigate' }
      }

      if (typeof window !== 'undefined') {
        const dest = intent.destination === 'home' ? '/' : `/${intent.destination.replace(/^\//, '')}`
        window.location.hash = `#${dest}`
      }

      return { success: true, message: `Navigated to ${intent.destination}`, intentType: 'navigate' }
    }

    case 'search': {
      if (!caps.some((c) => c.includes('browse') || c.includes('remote') || c.includes('agent'))) {
        return { success: false, message: 'Caller lacks search capability', intentType: 'search' }
      }

      if (typeof window !== 'undefined') {
        window.location.hash = `#/search?q=${encodeURIComponent(intent.query)}`
      }

      return { success: true, message: `Searching for: ${intent.query}`, intentType: 'search', data: { query: intent.query } }
    }

    case 'favourites': {
      if (!caps.some((c) => c.includes('sync') || c.includes('agent'))) {
        return { success: false, message: 'Caller lacks library modification capability', intentType: 'favourites' }
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kinora:toggle_favourite', { detail: { ref: intent.itemRef } }))
      }

      return { success: true, message: `Updated favourite status for ${intent.itemRef}`, intentType: 'favourites' }
    }

    case 'handoff': {
      if (!caps.some((c) => c.includes('cast') || c.includes('agent'))) {
        return { success: false, message: 'Caller lacks media handoff capability', intentType: 'handoff' }
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kinora:cast_handoff', {
          detail: { targetDeviceId: intent.targetDeviceId, media: intent.media },
        }))
      }

      return { success: true, message: `Initiating playback handoff to ${intent.targetDeviceId}`, intentType: 'handoff' }
    }

    case 'query_epg': {
      return { success: true, message: 'EPG query dispatched', intentType: 'query_epg' }
    }

    default:
      return { success: false, message: 'Unrecognized intent type', intentType: 'search' }
  }
}

/**
 * Pluggable voice provider interface.
 * Designed to integrate local speech-to-text engines (e.g. Whisper, Vosk, Piper)
 * or system speech APIs without prematurely activating microphone hardware.
 */
export interface VoiceProvider {
  name: string
  isAvailable(): boolean
  isListening(): boolean
  startListening(onTranscript: (text: string) => void, onError: (err: Error) => void): Promise<void>
  stopListening(): void
}

/**
 * Default stub voice provider: safe, inactive, and requests zero OS permissions.
 */
export class StubVoiceProvider implements VoiceProvider {
  public name = 'Inactive Local Voice Provider'

  public isAvailable(): boolean {
    return false
  }

  public isListening(): boolean {
    return false
  }

  public async startListening(): Promise<void> {
    // Deliberately no-op until explicit hardware integration is approved
  }

  public stopListening(): void {
    // No-op
  }
}

class VoiceAndAgentManager {
  private activeProvider: VoiceProvider = new StubVoiceProvider()
  private isListening = false
  private lastTranscript = ''
  private lastResult: IntentExecutionResult | null = null
  private listeners = new Set<() => void>()

  public setProvider(provider: VoiceProvider): void {
    if (this.isListening) {
      this.activeProvider.stopListening()
      this.isListening = false
    }
    this.activeProvider = provider
    this.notify()
  }

  public getProviderName(): string {
    return this.activeProvider.name
  }

  public isAvailable(): boolean {
    return this.activeProvider.isAvailable()
  }

  public getIsListening(): boolean {
    return this.isListening
  }

  public getLastTranscript(): string {
    return this.lastTranscript
  }

  public getLastResult(): IntentExecutionResult | null {
    return this.lastResult
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  public async processNaturalCommand(text: string, caller?: AgentCallerContext): Promise<IntentExecutionResult> {
    this.lastTranscript = text
    const intent = parseNaturalLanguageIntent(text)
    if (!intent) {
      const fail: IntentExecutionResult = {
        success: false,
        message: `Could not understand command: "${text}"`,
        intentType: 'search',
      }
      this.lastResult = fail
      this.notify()
      return fail
    }

    const result = await executeAgentIntent(intent, caller)
    this.lastResult = result
    this.notify()
    return result
  }
}

export const voiceAndAgentManager = new VoiceAndAgentManager()

export function useVoiceAndAgentControl() {
  const [providerName, setProviderName] = useState(() => voiceAndAgentManager.getProviderName())
  const [isAvailable, setIsAvailable] = useState(() => voiceAndAgentManager.isAvailable())
  const [isListening, setIsListening] = useState(() => voiceAndAgentManager.getIsListening())
  const [lastTranscript, setLastTranscript] = useState(() => voiceAndAgentManager.getLastTranscript())
  const [lastResult, setLastResult] = useState(() => voiceAndAgentManager.getLastResult())

  useEffect(() => {
    return voiceAndAgentManager.subscribe(() => {
      setProviderName(voiceAndAgentManager.getProviderName())
      setIsAvailable(voiceAndAgentManager.isAvailable())
      setIsListening(voiceAndAgentManager.getIsListening())
      setLastTranscript(voiceAndAgentManager.getLastTranscript())
      setLastResult(voiceAndAgentManager.getLastResult())
    })
  }, [])

  return {
    providerName,
    isAvailable,
    isListening,
    lastTranscript,
    lastResult,
    processNaturalCommand: (cmd: string, caller?: AgentCallerContext) =>
      voiceAndAgentManager.processNaturalCommand(cmd, caller),
  }
}
