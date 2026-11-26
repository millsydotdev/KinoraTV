/**
 * Intelligent AI & Pluggable Voice Control Engine for Kinora.
 * Defines structured intent models, natural language command parsing,
 * capability-gated execution via Kinora's unified capability service,
 * opt-in push-to-talk speech recognition, optional spoken responses,
 * and user-configured AI provider metadata.
 * Strictly adheres to project typography standards: zero em-dashes across all code and comments.
 */

import { useState, useEffect } from 'react'
import { kinoraCapabilities, type CapabilityCaller } from './capabilities'

export type AgentIntentType =
  | 'search'
  | 'tune'
  | 'playback'
  | 'navigate'
  | 'favourites'
  | 'watchlist'
  | 'handoff'
  | 'query_epg'
  | 'now_playing'
  | 'recordings_status'
  | 'device_status'

export interface SearchIntent {
  type: 'search'
  query: string
  mediaKind?: 'movie' | 'series' | 'channel' | 'radio' | 'podcast' | 'book'
}

export interface TuneIntent {
  type: 'tune'
  channelId?: string
  channelName?: string
  channelNumber?: number
}

export interface PlaybackIntent {
  type: 'playback'
  action: 'play' | 'pause' | 'toggle' | 'seek' | 'volume' | 'mute' | 'step_back' | 'step_forward' | 'resume_last'
  value?: number
}

export interface NavigateIntent {
  type: 'navigate'
  destination: 'home' | 'livetv' | 'movies' | 'series' | 'search' | 'library' | 'settings' | 'podcasts' | 'books' | 'recordings' | 'sources' | string
}

export interface FavouritesIntent {
  type: 'favourites'
  action: 'add' | 'remove' | 'toggle'
  itemRef: string
}

export interface WatchlistIntent {
  type: 'watchlist'
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

export interface NowPlayingIntent {
  type: 'now_playing'
}

export interface RecordingsStatusIntent {
  type: 'recordings_status'
}

export interface DeviceStatusIntent {
  type: 'device_status'
}

export type AgentIntent =
  | SearchIntent
  | TuneIntent
  | PlaybackIntent
  | NavigateIntent
  | FavouritesIntent
  | WatchlistIntent
  | HandoffIntent
  | QueryEpgIntent
  | NowPlayingIntent
  | RecordingsStatusIntent
  | DeviceStatusIntent

export interface AgentCallerContext extends CapabilityCaller {
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

export type AiProviderKind = 'none' | 'local-ollama' | 'openai-compatible' | 'custom-agent'

export interface AiVoiceConfig {
  /** Microphone push-to-talk is strictly opt-in and off by default. Never always-on. */
  microphoneEnabled: boolean
  /** Optional spoken replies via browser/OS SpeechSynthesis. Off by default. */
  spokenResponsesEnabled: boolean
  /** Speech recognition BCP-47 locale tag. */
  voiceLanguage: string
  /** Configured external or local AI provider (no single provider is hardcoded). */
  providerKind: AiProviderKind
  /** User-supplied provider endpoint URL (e.g. http://localhost:11434 or https://api.example.com/v1). */
  providerEndpoint: string
  /** Optional model identifier for the configured provider. */
  providerModel: string
}

export const AI_VOICE_CONFIG_STORAGE_KEY = 'kinora.ai_voice_config.v1'

export const DEFAULT_AI_VOICE_CONFIG: AiVoiceConfig = {
  microphoneEnabled: false,
  spokenResponsesEnabled: false,
  voiceLanguage: 'en-GB',
  providerKind: 'none',
  providerEndpoint: '',
  providerModel: '',
}

export function loadAiVoiceConfig(): AiVoiceConfig {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_AI_VOICE_CONFIG }
  try {
    const raw = localStorage.getItem(AI_VOICE_CONFIG_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_AI_VOICE_CONFIG }
    const parsed = JSON.parse(raw) as Partial<AiVoiceConfig>
    const validProviders: AiProviderKind[] = ['none', 'local-ollama', 'openai-compatible', 'custom-agent']
    return {
      microphoneEnabled: Boolean(parsed.microphoneEnabled),
      spokenResponsesEnabled: Boolean(parsed.spokenResponsesEnabled),
      voiceLanguage: typeof parsed.voiceLanguage === 'string' && parsed.voiceLanguage.trim() ? parsed.voiceLanguage.trim() : DEFAULT_AI_VOICE_CONFIG.voiceLanguage,
      providerKind: parsed.providerKind && validProviders.includes(parsed.providerKind) ? parsed.providerKind : 'none',
      providerEndpoint: typeof parsed.providerEndpoint === 'string' ? parsed.providerEndpoint.trim() : '',
      providerModel: typeof parsed.providerModel === 'string' ? parsed.providerModel.trim() : '',
    }
  } catch {
    return { ...DEFAULT_AI_VOICE_CONFIG }
  }
}

export function saveAiVoiceConfig(next: Partial<AiVoiceConfig>): AiVoiceConfig {
  const merged = { ...loadAiVoiceConfig(), ...next }
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(AI_VOICE_CONFIG_STORAGE_KEY, JSON.stringify(merged))
    } catch {
      // Storage quota safety
    }
  }
  return merged
}

/**
 * Natural language intent parser for voice transcripts and AI commands.
 * Converts unstructured user utterances into structured Kinora intents.
 */
export function parseNaturalLanguageIntent(transcript: string): AgentIntent | null {
  const original = transcript.trim()
  const text = original.toLowerCase().replace(/[?!.]+$/, '').trim()
  if (!text) return null

  // 1. Live EPG & now-playing status queries
  if (
    text === 'what is playing' ||
    text === "what's playing" ||
    text === 'now playing' ||
    text === 'what am i watching'
  ) {
    return { type: 'now_playing' }
  }

  const epgChannelMatch = original.match(/what(?:'s| is)\s+(?:currently\s+)?on\s+(?:channel\s+)?(.+?)(?:\s+right now)?[?]?$/i)
  if (epgChannelMatch && epgChannelMatch[1]) {
    const target = epgChannelMatch[1].trim()
    const lowerTarget = target.toLowerCase()
    if (lowerTarget === 'tv' || lowerTarget === 'television' || lowerTarget === 'live tv' || lowerTarget === 'now') {
      return { type: 'query_epg' }
    }
    return { type: 'query_epg', channelName: target }
  }

  if (text.includes('what is on television') || text.includes('what is on tv') || text.includes("what's on tv")) {
    return { type: 'query_epg' }
  }

  // 2. Recordings & device status queries
  if (
    text.includes('recording') &&
    (text.includes('complete') || text.includes('finish') || text.includes('status') || text.includes('check') || text.includes('my recording'))
  ) {
    return { type: 'recordings_status' }
  }

  if (
    text.includes('connected devices') ||
    text.includes('which devices are connected') ||
    text.includes('server status') ||
    text.includes('device status')
  ) {
    return { type: 'device_status' }
  }

  // 3. Playback commands
  if (text === 'continue watching' || text === 'continue what i was watching' || text === 'resume what i was watching') {
    return { type: 'playback', action: 'resume_last' }
  }
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

  // 4. Channel tuning
  const channelNumMatch = text.match(/(?:tune to|change to|switch to|channel)\s+(?:number\s+)?(\d{1,4})/i)
  if (channelNumMatch && channelNumMatch[1]) {
    return { type: 'tune', channelNumber: parseInt(channelNumMatch[1], 10) }
  }

  const channelNameMatch = text.match(/(?:tune to|switch to|put on|watch)\s+(?:channel\s+)?(.+)/i)
  if (channelNameMatch && channelNameMatch[1]) {
    const rawTarget = channelNameMatch[1].trim()
    if (!['home', 'settings', 'guide', 'movies', 'series', 'library', 'podcasts', 'books', 'recordings'].includes(rawTarget)) {
      return { type: 'tune', channelName: rawTarget }
    }
  }

  // 5. Navigation
  if (text.includes('go home') || text === 'home' || text === 'open home') {
    return { type: 'navigate', destination: 'home' }
  }
  if (text.includes('open guide') || text.includes('tv guide') || text.includes('live tv') || text === 'guide') {
    return { type: 'navigate', destination: 'livetv' }
  }
  if (text.includes('browse movies') || text === 'movies' || text === 'open movies') {
    return { type: 'navigate', destination: 'movies' }
  }
  if (text.includes('browse series') || text === 'tv shows' || text === 'series' || text === 'open series') {
    return { type: 'navigate', destination: 'series' }
  }
  if (text.includes('open library') || text === 'my library' || text === 'watchlist') {
    return { type: 'navigate', destination: 'library' }
  }
  if (text.includes('open podcasts') || text === 'podcasts') {
    return { type: 'navigate', destination: 'podcasts' }
  }
  if (text.includes('open books') || text === 'books') {
    return { type: 'navigate', destination: 'books' }
  }
  if (text.includes('open recordings') || text === 'recordings') {
    return { type: 'navigate', destination: 'recordings' }
  }
  if (text.includes('open sources') || text === 'sources') {
    return { type: 'navigate', destination: 'sources' }
  }
  if (text.includes('open settings') || text === 'settings' || text === 'preferences') {
    return { type: 'navigate', destination: 'settings' }
  }

  // 6. Media-kind specific searches (podcasts / books)
  const podcastSearchMatch = original.match(/(?:find|search)\s+podcasts?\s+(?:about|for)?\s*(.+)/i)
  if (podcastSearchMatch && podcastSearchMatch[1]) {
    return { type: 'search', query: podcastSearchMatch[1].trim(), mediaKind: 'podcast' }
  }
  const bookSearchMatch = original.match(/(?:find|search)\s+books?\s+(?:about|for|by)?\s*(.+)/i)
  if (bookSearchMatch && bookSearchMatch[1]) {
    return { type: 'search', query: bookSearchMatch[1].trim(), mediaKind: 'book' }
  }

  // 7. Generic Search
  const searchMatch = original.match(/(?:search for|find me|find|look up|search)\s+(.+)/i)
  if (searchMatch && searchMatch[1]) {
    return { type: 'search', query: searchMatch[1].trim() }
  }

  // 8. Cast / Handoff
  const castMatch = original.match(/(?:cast to|play on|send to|handoff to)\s+(.+)/i)
  if (castMatch && castMatch[1]) {
    return { type: 'handoff', targetDeviceId: castMatch[1].trim() }
  }

  // 9. Favourites & Watchlist
  const favMatch = original.match(/add\s+(.+?)\s+to\s+(?:my\s+)?favou?rites/i)
  if (favMatch && favMatch[1]) {
    return { type: 'favourites', action: 'add', itemRef: favMatch[1].trim() }
  }
  const watchMatch = original.match(/add\s+(.+?)\s+to\s+(?:my\s+)?watchlist/i)
  if (watchMatch && watchMatch[1]) {
    return { type: 'watchlist', action: 'add', itemRef: watchMatch[1].trim() }
  }

  return null
}

/**
 * Executes a structured AgentIntent through Kinora's unified capability service.
 */
export async function executeAgentIntent(
  intent: AgentIntent,
  caller?: AgentCallerContext
): Promise<IntentExecutionResult> {
  switch (intent.type) {
    case 'playback': {
      const res = kinoraCapabilities.controlPlayback(intent.action, intent.value, caller)
      return { success: res.ok, message: res.message, intentType: 'playback', data: res.data }
    }

    case 'tune': {
      const res = kinoraCapabilities.tuneChannel(
        {
          channelId: intent.channelId,
          channelNumber: intent.channelNumber,
          channelName: intent.channelName,
        },
        caller,
      )
      return { success: res.ok, message: res.message, intentType: 'tune', data: res.data }
    }

    case 'navigate': {
      const res = kinoraCapabilities.navigate(intent.destination, caller)
      return { success: res.ok, message: res.message, intentType: 'navigate', data: res.data }
    }

    case 'search': {
      const res = kinoraCapabilities.search(intent.query, { mediaKind: intent.mediaKind, openResults: true }, caller)
      return { success: res.ok, message: res.message, intentType: 'search', data: res.data }
    }

    case 'favourites': {
      const res = kinoraCapabilities.updateLibraryList('favourites', intent.action, intent.itemRef, caller)
      return { success: res.ok, message: res.message, intentType: 'favourites', data: res.data }
    }

    case 'watchlist': {
      const res = kinoraCapabilities.updateLibraryList('watchlist', intent.action, intent.itemRef, caller)
      return { success: res.ok, message: res.message, intentType: 'watchlist', data: res.data }
    }

    case 'handoff': {
      const res = await kinoraCapabilities.handoffPlayback(intent.targetDeviceId, intent.media, caller)
      return { success: res.ok, message: res.message, intentType: 'handoff', data: res.data }
    }

    case 'query_epg': {
      const res = kinoraCapabilities.queryEpg({ channelName: intent.channelName, query: intent.query }, caller)
      return { success: res.ok, message: res.message, intentType: 'query_epg', data: res.data }
    }

    case 'now_playing': {
      const res = kinoraCapabilities.getNowPlaying(caller)
      return { success: res.ok, message: res.message, intentType: 'now_playing', data: res.data }
    }

    case 'recordings_status': {
      const res = await kinoraCapabilities.getRecordingsStatus(caller)
      return { success: res.ok, message: res.message, intentType: 'recordings_status', data: res.data }
    }

    case 'device_status': {
      const res = await kinoraCapabilities.getDevicesAndServerStatus(caller)
      return { success: res.ok, message: res.message, intentType: 'device_status', data: res.data }
    }

    default:
      return { success: false, message: 'Unrecognized intent type', intentType: 'search' }
  }
}

/**
 * Pluggable voice provider interface.
 * Microphone access is strictly push-to-talk and opt-in; never always-on.
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
    // Deliberately no-op until user explicitly enables push-to-talk microphone access
  }

  public stopListening(): void {
    // No-op
  }
}

/**
 * Opt-in Push-to-Talk browser/WebView Speech Recognition provider.
 * Requests microphone access only when the user explicitly clicks Push-to-Talk
 * after enabling microphone access in Settings. Automatically stops after a single utterance.
 */
export class WebSpeechVoiceProvider implements VoiceProvider {
  public name = 'Push-to-Talk Speech Recognition'
  private recognition: {
    lang: string
    continuous: boolean
    interimResults: boolean
    onstart: (() => void) | null
    onresult: ((ev: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
    onerror: ((ev: { error?: string }) => void) | null
    onend: (() => void) | null
    start: () => void
    stop: () => void
  } | null = null
  private listening = false
  private lang: string

  constructor(lang = 'en-GB') {
    this.lang = lang
  }

  public isAvailable(): boolean {
    if (typeof window === 'undefined') return false
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition)
  }

  public isListening(): boolean {
    return this.listening
  }

  public async startListening(onTranscript: (text: string) => void, onError: (err: Error) => void): Promise<void> {
    if (!this.isAvailable()) {
      onError(new Error('Speech recognition is not supported by this desktop runtime.'))
      return
    }
    if (this.listening) return

    // Request explicit microphone permission if MediaDevices API is available
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        // Release raw stream immediately; SpeechRecognition manages its own bounded capture
        stream.getTracks().forEach((t) => t.stop())
      } catch {
        onError(new Error('Microphone permission was denied. Enable microphone access to use push-to-talk.'))
        return
      }
    }

    const w = window as unknown as { SpeechRecognition?: new () => NonNullable<WebSpeechVoiceProvider['recognition']>; webkitSpeechRecognition?: new () => NonNullable<WebSpeechVoiceProvider['recognition']> }
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!Ctor) {
      onError(new Error('Speech recognition engine unavailable.'))
      return
    }

    try {
      const rec = new Ctor()
      rec.lang = this.lang
      rec.continuous = false // Single-utterance push-to-talk only, never always-on
      rec.interimResults = false
      rec.onstart = () => {
        this.listening = true
      }
      rec.onresult = (event) => {
        let finalTranscript = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const item = event.results[i]
          if (item && item[0]?.transcript) {
            finalTranscript += item[0].transcript
          }
        }
        this.listening = false
        if (finalTranscript.trim()) {
          onTranscript(finalTranscript.trim())
        }
      }
      rec.onerror = (ev) => {
        this.listening = false
        const code = ev?.error || 'recognition-error'
        onError(new Error(`Voice input stopped (${code}).`))
      }
      rec.onend = () => {
        this.listening = false
      }
      this.recognition = rec
      rec.start()
    } catch (e) {
      this.listening = false
      onError(e instanceof Error ? e : new Error('Could not start speech recognition.'))
    }
  }

  public stopListening(): void {
    if (this.recognition && this.listening) {
      try {
        this.recognition.stop()
      } catch {
        // Safe ignore
      }
    }
    this.listening = false
  }
}

export function speakTextIfEnabled(text: string, config?: AiVoiceConfig): boolean {
  const cfg = config ?? loadAiVoiceConfig()
  if (!cfg.spokenResponsesEnabled) return false
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    return false
  }
  try {
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = cfg.voiceLanguage || 'en-GB'
    window.speechSynthesis.speak(utterance)
    return true
  } catch {
    return false
  }
}

class VoiceAndAgentManager {
  private activeProvider: VoiceProvider = new StubVoiceProvider()
  private isListening = false
  private lastTranscript = ''
  private lastResult: IntentExecutionResult | null = null
  private lastError: string | null = null
  private config: AiVoiceConfig = loadAiVoiceConfig()
  private listeners = new Set<() => void>()

  public setProvider(provider: VoiceProvider): void {
    if (this.isListening) {
      this.activeProvider.stopListening()
      this.isListening = false
    }
    this.activeProvider = provider
    this.notify()
  }

  public getConfig(): AiVoiceConfig {
    return { ...this.config }
  }

  public updateConfig(patch: Partial<AiVoiceConfig>): AiVoiceConfig {
    this.config = saveAiVoiceConfig(patch)
    if (this.config.microphoneEnabled) {
      const speech = new WebSpeechVoiceProvider(this.config.voiceLanguage)
      if (speech.isAvailable()) {
        this.activeProvider = speech
      }
    } else {
      if (this.isListening) {
        this.activeProvider.stopListening()
        this.isListening = false
      }
      this.activeProvider = new StubVoiceProvider()
    }
    this.notify()
    return { ...this.config }
  }

  public getProviderName(): string {
    return this.activeProvider.name
  }

  public isAvailable(): boolean {
    return this.activeProvider.isAvailable()
  }

  public isSpeechHardwareSupported(): boolean {
    return new WebSpeechVoiceProvider(this.config.voiceLanguage).isAvailable()
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

  public getLastError(): string | null {
    return this.lastError
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

  public async startPushToTalk(): Promise<void> {
    this.lastError = null
    if (!this.config.microphoneEnabled) {
      this.lastError = 'Microphone push-to-talk is disabled. Enable it first to capture a voice command.'
      this.notify()
      return
    }
    if (!this.activeProvider.isAvailable()) {
      const speech = new WebSpeechVoiceProvider(this.config.voiceLanguage)
      if (speech.isAvailable()) {
        this.activeProvider = speech
      } else {
        this.lastError = 'Speech recognition is not supported on this device runtime.'
        this.notify()
        return
      }
    }

    this.isListening = true
    this.notify()

    await this.activeProvider.startListening(
      (transcript) => {
        this.isListening = false
        this.notify()
        void this.processNaturalCommand(transcript)
      },
      (err) => {
        this.isListening = false
        this.lastError = err.message
        this.notify()
      },
    )
  }

  public stopPushToTalk(): void {
    this.activeProvider.stopListening()
    this.isListening = false
    this.notify()
  }

  public async processNaturalCommand(text: string, caller?: AgentCallerContext): Promise<IntentExecutionResult> {
    this.lastTranscript = text
    this.lastError = null
    const intent = parseNaturalLanguageIntent(text)
    if (!intent) {
      const fail: IntentExecutionResult = {
        success: false,
        message: `Could not understand command: "${text}". Try "what is on TV", "open guide", "search for...", or "pause".`,
        intentType: 'search',
      }
      this.lastResult = fail
      this.notify()
      return fail
    }

    const result = await executeAgentIntent(intent, caller)
    this.lastResult = result
    if (result.success) {
      speakTextIfEnabled(result.message, this.config)
    }
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
  const [lastError, setLastError] = useState(() => voiceAndAgentManager.getLastError())
  const [config, setConfig] = useState<AiVoiceConfig>(() => voiceAndAgentManager.getConfig())

  useEffect(() => {
    return voiceAndAgentManager.subscribe(() => {
      setProviderName(voiceAndAgentManager.getProviderName())
      setIsAvailable(voiceAndAgentManager.isAvailable())
      setIsListening(voiceAndAgentManager.getIsListening())
      setLastTranscript(voiceAndAgentManager.getLastTranscript())
      setLastResult(voiceAndAgentManager.getLastResult())
      setLastError(voiceAndAgentManager.getLastError())
      setConfig(voiceAndAgentManager.getConfig())
    })
  }, [])

  return {
    providerName,
    isAvailable,
    isSpeechSupported: voiceAndAgentManager.isSpeechHardwareSupported(),
    isListening,
    lastTranscript,
    lastResult,
    lastError,
    config,
    updateConfig: (patch: Partial<AiVoiceConfig>) => voiceAndAgentManager.updateConfig(patch),
    startPushToTalk: () => voiceAndAgentManager.startPushToTalk(),
    stopPushToTalk: () => voiceAndAgentManager.stopPushToTalk(),
    processNaturalCommand: (cmd: string, caller?: AgentCallerContext) =>
      voiceAndAgentManager.processNaturalCommand(cmd, caller),
  }
}
