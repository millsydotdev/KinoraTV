// Persistent universal playback context for Kinora 0.6.0.
// Sole authority for stream playback, video element, and presentation modes.
// Strictly follows project typography standards: zero em-dashes across all code and comments.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { useLocation } from 'react-router-dom'
import type { Channel, StreamVariant } from '../data/types'
export type { StreamVariant }
import {
  useStreamPlayback,
  type PlaybackState,
  type Tracks,
} from '../lib/playback'
import { registerCommandHandler } from '../lib/commands'
import { PersistentPlayerDock } from '../components/PersistentPlayerDock'
import {
  type AspectRatioMode,
  type PictureCalibrationSettings,
  DEFAULT_PICTURE_SETTINGS,
  type AbLoopPoints,
  DEFAULT_AB_LOOP,
  evaluateAbLoop,
} from '../lib/videoGeometry'
import { getNextFailoverUrl, replaceStreamUrlHost } from '../lib/xtreamFallback'
import { useStore } from './store'
import { artworkEngine } from '../data/artworkEngine'
import { broadcastRemotePlaybackState } from '../lib/remoteServerSync'
import { scrobbleMedia } from '../lib/trakt'
import { type EdlEntry, parseEdl, findActiveEdlCut } from '../lib/edlParser'
import { LiveReconnectController } from '../lib/reconnectController'

export interface ActiveStreamItem {
  ref?: string
  streamUrl: string
  title: string
  subtitle?: string
  channel?: Channel
  isLive?: boolean
  programmeArt?: string
  art?: string
  duration?: number
  position?: number
  sourceId?: string
  streamOptions?: StreamVariant[]
  selectedServerId?: string
  httpUserAgent?: string
  httpReferrer?: string
  customHeaders?: Record<string, string>
  edl?: EdlEntry[] | string
}

export type PipMode = 'hidden' | 'docked' | 'minimized' | 'fullscreen'

export interface UniversalPlaybackContextValue {
  activeStream: ActiveStreamItem | null
  playbackState: PlaybackState
  pipMode: PipMode
  tracks: Tracks
  muted: boolean
  volume: number
  ready: boolean
  currentTime: number
  duration: number
  playbackSpeed: number
  audioDelayMs: number
  subDelaySecs: number
  timeshiftOffsetSecs: number
  isTimeshiftDelayed: boolean
  aspectRatio: AspectRatioMode
  pictureSettings: PictureCalibrationSettings
  abLoop: AbLoopPoints
  watchdogState: 'healthy' | 'buffering' | 'stalled'
  streamOptions: StreamVariant[]
  selectedServerId: string | null
  attemptedServers: Set<string>
  fallbackNotice: string | null
  retryAttempt: number
  retryTimerRemaining: number | null
  videoRef: RefObject<HTMLVideoElement | null>
  playStream: (item: ActiveStreamItem) => void
  stopPlayback: () => void
  play: () => void
  pause: () => void
  triggerAutoRecovery: () => void
  togglePlay: () => void
  toggleMute: () => void
  setVolume: (v: number) => void
  setAudioTrack: (id: number) => void
  setSubtitleTrack: (id: number) => void
  setLevel: (id: number) => void
  seek: (toSecs: number) => void
  seekDelta: (deltaSecs: number) => void
  seekTimeshift: (deltaSecs: number) => void
  jumpToLiveEdge: () => void
  setPlaybackSpeed: (speed: number) => void
  setAudioDelayMs: (ms: number) => void
  setSubDelaySecs: (secs: number) => void
  setAspectRatio: (ar: AspectRatioMode) => void
  setPictureSettings: (settings: PictureCalibrationSettings) => void
  setAbLoop: (loop: AbLoopPoints) => void
  selectServer: (serverId: string) => void
  setPipMode: (mode: PipMode) => void
  retry: () => void
  cancelRetry: () => void
  dismissFallbackNotice: () => void
}

const defaultPlaybackState: PlaybackState = {
  status: 'idle',
  message: null,
  canRetry: false,
}

const defaultTracks: Tracks = {
  audio: [],
  audioId: -1,
  subtitles: [],
  subtitleId: -1,
  levels: [],
  levelId: -1,
}

const UniversalPlaybackContext = createContext<UniversalPlaybackContextValue | null>(null)

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const store = useStore()
  const { prefs } = store

  let pathname = ''
  try {
    pathname = useLocation().pathname
  } catch {
    // Safe fallback when rendered outside router
  }

  const [activeStream, setActiveStream] = useState<ActiveStreamItem | null>(null)
  const [pipMode, setPipMode] = useState<PipMode>(() => {
    return pathname.startsWith('/watch/') ? 'fullscreen' : 'hidden'
  })
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackSpeed, setPlaybackSpeedState] = useState(1.0)
  const [audioDelayMs, setAudioDelayMs] = useState(0)
  const [subDelaySecs, setSubDelaySecs] = useState(0)
  const [timeshiftOffsetSecs, setTimeshiftOffsetSecs] = useState(0)
  const [aspectRatio, setAspectRatio] = useState<AspectRatioMode>('auto')
  const [pictureSettings, setPictureSettings] = useState<PictureCalibrationSettings>(DEFAULT_PICTURE_SETTINGS)
  const [abLoop, setAbLoop] = useState<AbLoopPoints>(DEFAULT_AB_LOOP)
  const abLoopRef = useRef<AbLoopPoints>(DEFAULT_AB_LOOP)

  useEffect(() => {
    abLoopRef.current = abLoop
  }, [abLoop])

  const edlEntries = useMemo(() => {
    if (!activeStream?.edl) return []
    if (Array.isArray(activeStream.edl)) return activeStream.edl
    return parseEdl(activeStream.edl)
  }, [activeStream?.edl])
  const edlEntriesRef = useRef<EdlEntry[]>([])

  useEffect(() => {
    edlEntriesRef.current = edlEntries
  }, [edlEntries])
  const [attemptedServers, setAttemptedServers] = useState<Set<string>>(new Set())
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null)
  const [retryAttempt, setRetryAttempt] = useState(0)
  const [retryTimerRemaining, setRetryTimerRemaining] = useState<number | null>(null)
  const retryIntervalRef = useRef<number>(0)

  const [watchdogState, setWatchdogState] = useState<'healthy' | 'buffering' | 'stalled'>('healthy')
  const stallTimerRef = useRef<number | null>(null)
  const lastProgressTimeRef = useRef<number>(Date.now())
  const lastCurrentTimeRef = useRef<number>(0)

  const reconnectControllerRef = useRef<LiveReconnectController | null>(null)
  if (!reconnectControllerRef.current) {
    reconnectControllerRef.current = new LiveReconnectController({
      maxAttempts: 5,
      baseDelayMs: 1000,
      maxDelayMs: 16000,
      backoffFactor: 2,
      stallTimeoutMs: 10000,
    })
  }

  useEffect(() => {
    const ctrl = reconnectControllerRef.current
    if (!ctrl) return
    return ctrl.subscribe((s) => {
      setRetryAttempt(s.attempt)
      if (s.nextRetryInMs) {
        setRetryTimerRemaining(Math.ceil(s.nextRetryInMs / 1000))
      } else if (s.status === 'connected' || s.status === 'idle') {
        setRetryTimerRemaining(null)
      }
    })
  }, [])

  const streamOptions = useMemo(() => {
    const userAgent = activeStream?.httpUserAgent || prefs.customUserAgent || undefined
    const referrer = activeStream?.httpReferrer || prefs.customReferrer || undefined
    const headers = activeStream?.customHeaders || undefined
    if (!userAgent && !referrer && !headers) return undefined
    return {
      userAgent: userAgent || null,
      referrer: referrer || null,
      headers: headers || null,
    }
  }, [activeStream?.httpUserAgent, activeStream?.httpReferrer, activeStream?.customHeaders, prefs.customUserAgent, prefs.customReferrer])

  const combinedPrefs = useMemo(() => ({
    ...prefs,
    streamOptions,
  }), [prefs, streamOptions])

  const playback = useStreamPlayback(
    activeStream?.streamUrl ?? null,
    videoRef,
    combinedPrefs
  )

  useEffect(() => {
    const handleOnline = () => {
      if (playback.state.status === 'error' && playback.state.canRetry) {
        reconnectControllerRef.current?.cancel()
        playback.retry()
      }
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [playback.state.status, playback.state.canRetry, playback.retry])

  const isTimeshiftDelayed = timeshiftOffsetSecs > 0

  const playStream = useCallback((item: ActiveStreamItem) => {
    setActiveStream((prev) => {
      // Do not restart identical streams during navigation or metadata updates
      if (prev && prev.streamUrl === item.streamUrl && prev.ref === item.ref) {
        return { ...prev, ...item }
      }
      return item
    })
    artworkEngine.setPlaybackActive(true)
    reconnectControllerRef.current?.cancel()
    setAttemptedServers(new Set())
    setFallbackNotice(null)
    setRetryAttempt(0)
    setRetryTimerRemaining(null)
    if (retryIntervalRef.current) window.clearInterval(retryIntervalRef.current)
    if (stallTimerRef.current !== null) {
      window.clearTimeout(stallTimerRef.current)
      stallTimerRef.current = null
    }
    setWatchdogState('healthy')
    lastProgressTimeRef.current = Date.now()
    lastCurrentTimeRef.current = 0
    setTimeshiftOffsetSecs(0)
    setPipMode((prev) => (prev === 'hidden' ? 'docked' : prev))
  }, [])

  const stopPlayback = useCallback(() => {
    if (activeStream && !activeStream.isLive && duration > 0) {
      const progress = Math.max(0, Math.min(100, (currentTime / duration) * 100))
      void scrobbleMedia('stop', {
        movie: activeStream.ref?.includes('movie') ? { title: activeStream.title } : undefined,
        show: !activeStream.ref?.includes('movie') ? { title: activeStream.title } : undefined,
        progress,
      })
    }
    artworkEngine.setPlaybackActive(false)
    reconnectControllerRef.current?.cancel()
    setActiveStream(null)
    setPipMode('hidden')
    setFallbackNotice(null)
    setAttemptedServers(new Set())
    setRetryAttempt(0)
    setRetryTimerRemaining(null)
    if (retryIntervalRef.current) window.clearInterval(retryIntervalRef.current)
    if (stallTimerRef.current !== null) {
      window.clearTimeout(stallTimerRef.current)
      stallTimerRef.current = null
    }
    setWatchdogState('healthy')
    lastProgressTimeRef.current = Date.now()
    lastCurrentTimeRef.current = 0
    setTimeshiftOffsetSecs(0)
    setCurrentTime(0)
    setDuration(0)
  }, [])

  const selectServer = useCallback((serverId: string) => {
    setActiveStream((prev) => {
      if (!prev) return null
      const variant = prev.streamOptions?.find((o) => o.id === serverId)
      if (!variant || !variant.streamUrl) return prev
      return {
        ...prev,
        selectedServerId: serverId,
        streamUrl: variant.streamUrl,
      }
    })
  }, [])

  const dismissFallbackNotice = useCallback(() => {
    setFallbackNotice(null)
  }, [])

  // Automatic server fallback on stream playback failure or buffer stall
  const attemptServerFallback = useCallback(() => {
    if (!activeStream) return false

    // Check multi-server options first
    if (activeStream.streamOptions && activeStream.streamOptions.length > 1) {
      const currentOptionId = activeStream.selectedServerId ?? activeStream.streamOptions[0]?.id
      const currentOption = activeStream.streamOptions.find((o) => o.id === currentOptionId)
      let candidateFound = false
      setAttemptedServers((prev) => {
        const nextSet = new Set(prev)
        if (currentOption) nextSet.add(currentOption.id)
        const nextCandidate = activeStream.streamOptions?.find((opt) => !nextSet.has(opt.id) && opt.streamUrl)
        if (nextCandidate) {
          setFallbackNotice(`Server "${currentOption?.name ?? 'current'}" failed or stalled. Trying "${nextCandidate.name}"...`)
          selectServer(nextCandidate.id)
          candidateFound = true
        } else if (nextSet.size >= (activeStream.streamOptions?.length ?? 0)) {
          setFallbackNotice('All available servers for this channel have been attempted.')
        }
        return nextSet
      })
      if (candidateFound) return true
    }

    // Check Xtream DNS / mirror failover
    if (activeStream.sourceId && activeStream.streamUrl) {
      const nextMirror = getNextFailoverUrl(activeStream.sourceId, activeStream.streamUrl)
      if (nextMirror) {
        const newStreamUrl = replaceStreamUrlHost(activeStream.streamUrl, nextMirror)
        if (newStreamUrl !== activeStream.streamUrl) {
          setFallbackNotice(`Primary endpoint unreachable. Auto-failing over to mirror: ${nextMirror}`)
          playStream({
            ...activeStream,
            streamUrl: newStreamUrl,
          })
          return true
        }
      }
    }

    return false
  }, [activeStream, selectServer, playStream])

  const triggerAutoRecovery = useCallback(() => {
    setWatchdogState('stalled')
    const fellBack = store.autoFallbackEnabled && attemptServerFallback()
    if (!fellBack) {
      setFallbackNotice('Stream stall detected (>10s). Re-establishing stream buffer...')
      playback.retry()
    }
  }, [attemptServerFallback, playback, store.autoFallbackEnabled])

  // Automatic server fallback on stream playback failure
  useEffect(() => {
    if (!activeStream) return
    const hasOptions = Boolean(activeStream.streamOptions && activeStream.streamOptions.length > 1)
    const hasSource = Boolean(activeStream.sourceId)
    if (!hasOptions && !hasSource) return

    if (playback.state.status === 'error') {
      if (store.autoFallbackEnabled) {
        attemptServerFallback()
      }
    }
  }, [playback.state.status, activeStream, store.autoFallbackEnabled, attemptServerFallback])

  // Automated exponential backoff retry for stream errors
  useEffect(() => {
    if (playback.state.status === 'playing') {
      reconnectControllerRef.current?.onPlaybackSuccess()
      setRetryAttempt(0)
      setRetryTimerRemaining(null)
      if (retryIntervalRef.current) window.clearInterval(retryIntervalRef.current)
      return
    }

    if (playback.state.status === 'error' && playback.state.canRetry && retryAttempt < 5) {
      const backoffSecs = Math.min(16, Math.pow(2, retryAttempt))
      setRetryTimerRemaining(backoffSecs)
      if (retryIntervalRef.current) window.clearInterval(retryIntervalRef.current)

      retryIntervalRef.current = window.setInterval(() => {
        setRetryTimerRemaining((prev) => {
          if (prev === null || prev <= 1) {
            window.clearInterval(retryIntervalRef.current)
            setRetryAttempt((a) => a + 1)
            playback.retry()
            return null
          }
          return prev - 1
        })
      }, 1000)
    }

    return () => {
      if (retryIntervalRef.current) window.clearInterval(retryIntervalRef.current)
    }
  }, [playback.state.status, playback.state.canRetry, retryAttempt, playback.retry])

  const { recordStreamFailure, clearStreamFailure } = store

  const retry = useCallback(() => {
    if (retryIntervalRef.current) window.clearInterval(retryIntervalRef.current)
    reconnectControllerRef.current?.cancel()
    setRetryTimerRemaining(null)
    const channelId = activeStream?.channel?.id || (activeStream?.ref?.startsWith('channel:') ? activeStream.ref.slice('channel:'.length) : null)
    if (channelId) {
      clearStreamFailure(channelId)
    }
    playback.retry()
  }, [playback, activeStream, clearStreamFailure])

  // Synchronise real-play stream failures with session state in store (Finding 6, 18).
  useEffect(() => {
    if (!activeStream) return
    const channelId = activeStream.channel?.id || (activeStream.ref?.startsWith('channel:') ? activeStream.ref.slice('channel:'.length) : null)
    if (!channelId) return

    if (playback.state.status === 'error' || playback.state.status === 'unsupported') {
      if (!playback.state.message?.includes('desktop app')) {
        recordStreamFailure(channelId, {
          message: playback.state.message || 'Stream playback failed',
          canRetry: playback.state.canRetry,
        })
      }
    } else if (playback.state.status === 'playing') {
      clearStreamFailure(channelId)
    }
  }, [playback.state.status, playback.state.message, playback.state.canRetry, activeStream?.channel?.id, activeStream?.ref, recordStreamFailure, clearStreamFailure])

  const cancelRetry = useCallback(() => {
    if (retryIntervalRef.current) window.clearInterval(retryIntervalRef.current)
    reconnectControllerRef.current?.cancel()
    setRetryTimerRemaining(null)
    setRetryAttempt(5)
  }, [])

  // Instant auto-reconnect upon network restoration
  useEffect(() => {
    const handleOnline = () => {
      if (playback.state.status === 'error' && playback.state.canRetry) {
        if (retryIntervalRef.current) window.clearInterval(retryIntervalRef.current)
        setRetryTimerRemaining(null)
        setRetryAttempt(0)
        playback.retry()
      }
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('kinora:network-online', handleOnline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('kinora:network-online', handleOnline)
    }
  }, [playback])

  // Sync playbackRate to the single video element
  useEffect(() => {
    if (videoRef.current) {
      try {
        videoRef.current.playbackRate = playbackSpeed
      } catch {
        // Ignore if element is not ready
      }
    }
  }, [playbackSpeed, playback.state.status])

  // Video element event listeners: track time, duration, progress, and buffer stalls
  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    const clearStallTimer = () => {
      if (stallTimerRef.current !== null) {
        window.clearTimeout(stallTimerRef.current)
        stallTimerRef.current = null
      }
    }

    const onTimeUpdate = () => {
      setCurrentTime(el.currentTime)
      if (abLoopRef.current.a !== null && abLoopRef.current.b !== null) {
        const loopCheck = evaluateAbLoop(el.currentTime, abLoopRef.current)
        if (loopCheck.shouldSeek) {
          try {
            el.currentTime = loopCheck.seekTarget
          } catch {
            // Ignore seek errors
          }
        }
      }
      if (edlEntriesRef.current.length > 0) {
        const activeCut = findActiveEdlCut(el.currentTime, edlEntriesRef.current)
        if (activeCut) {
          try {
            el.currentTime = activeCut.endSec + 0.05
          } catch {
            // Ignore seek errors
          }
        }
      }
      if (Math.abs(el.currentTime - lastCurrentTimeRef.current) > 0.05) {
        lastCurrentTimeRef.current = el.currentTime
        lastProgressTimeRef.current = Date.now()
        clearStallTimer()
        reconnectControllerRef.current?.clearStall()
        setWatchdogState('healthy')
      }
      if (activeStream?.ref && !activeStream.isLive && el.duration > 0) {
        const pos = Math.floor(el.currentTime)
        const dur = Math.floor(el.duration)
        if (pos > 0 && pos % 5 === 0) {
          store.setProgress(activeStream.ref, pos, dur)
        }
      }
    }

    const onLoadedMetadata = () => {
      setDuration(el.duration || 0)
      if (activeStream?.position && activeStream.position > 0) {
        try {
          el.currentTime = activeStream.position
        } catch {
          // Ignore if seeking is not immediately available
        }
      }
    }

    const onDurationChange = () => {
      setDuration(el.duration || 0)
    }

    const onPlaying = () => {
      clearStallTimer()
      reconnectControllerRef.current?.clearStall()
      setWatchdogState('healthy')
      lastProgressTimeRef.current = Date.now()
      lastCurrentTimeRef.current = el.currentTime
    }

    const onWaitingOrStalled = () => {
      if (el.paused) return
      setWatchdogState('buffering')
      reconnectControllerRef.current?.onStall(() => triggerAutoRecovery())
      if (stallTimerRef.current === null) {
        stallTimerRef.current = window.setTimeout(() => {
          triggerAutoRecovery()
        }, 10000)
      }
    }

    el.addEventListener('timeupdate', onTimeUpdate)
    el.addEventListener('loadedmetadata', onLoadedMetadata)
    el.addEventListener('durationchange', onDurationChange)
    el.addEventListener('playing', onPlaying)
    el.addEventListener('waiting', onWaitingOrStalled)
    el.addEventListener('stalled', onWaitingOrStalled)

    return () => {
      clearStallTimer()
      el.removeEventListener('timeupdate', onTimeUpdate)
      el.removeEventListener('loadedmetadata', onLoadedMetadata)
      el.removeEventListener('durationchange', onDurationChange)
      el.removeEventListener('playing', onPlaying)
      el.removeEventListener('waiting', onWaitingOrStalled)
      el.removeEventListener('stalled', onWaitingOrStalled)
    }
  }, [activeStream, store, triggerAutoRecovery])

  // Periodic watchdog heartbeat check
  useEffect(() => {
    if (playback.state.status !== 'playing' || !activeStream) return
    const interval = window.setInterval(() => {
      const el = videoRef.current
      if (!el || el.paused) return
      if (Date.now() - lastProgressTimeRef.current > 10000 && watchdogState !== 'stalled') {
        triggerAutoRecovery()
      }
    }, 2000)
    return () => window.clearInterval(interval)
  }, [playback.state.status, activeStream, watchdogState, triggerAutoRecovery])

  const play = useCallback(() => {
    const v = videoRef.current
    if (v && v.paused) {
      v.play().catch(() => {})
    }
  }, [])

  const pause = useCallback(() => {
    const v = videoRef.current
    if (v && !v.paused) {
      v.pause()
    }
  }, [])

  const seek = useCallback((toSecs: number) => {
    const v = videoRef.current
    if (!v) return
    const target = Math.max(0, toSecs)
    try {
      v.currentTime = target
      setCurrentTime(target)
      if (activeStream?.ref && !activeStream.isLive) {
        store.setProgress(activeStream.ref, Math.floor(target), Math.floor(v.duration || duration || 0))
      }
    } catch {
      // Ignore if seeking fails
    }
  }, [activeStream, duration, store])

  const seekDelta = useCallback((deltaSecs: number) => {
    const v = videoRef.current
    if (!v) return
    seek(v.currentTime + deltaSecs)
  }, [seek])

  const maxTimeshiftSecs = (store.dvrConfig?.timeshiftBufferMins ?? 60) * 60

  const seekTimeshift = useCallback((deltaSecs: number) => {
    setTimeshiftOffsetSecs((prev) => Math.max(0, Math.min(maxTimeshiftSecs, prev - deltaSecs)))
    const v = videoRef.current
    if (v) {
      try {
        const bufferedStart = v.buffered.length > 0 ? v.buffered.start(0) : 0
        const minTime = bufferedStart + 0.5
        const target = Math.max(minTime, v.currentTime + deltaSecs)
        v.currentTime = target
      } catch {
        // Ignore if seek not available
      }
    }
  }, [maxTimeshiftSecs])

  const jumpToLiveEdge = useCallback(() => {
    setTimeshiftOffsetSecs(0)
    const v = videoRef.current
    if (v && v.buffered.length > 0) {
      try {
        const end = v.buffered.end(v.buffered.length - 1)
        v.currentTime = Math.max(0, end - 0.5)
      } catch {
        // Ignore
      }
    }
  }, [])

  const setPlaybackSpeed = useCallback((speed: number) => {
    setPlaybackSpeedState(speed)
    const v = videoRef.current
    if (v) {
      try {
        v.playbackRate = speed
      } catch {
        // Ignore
      }
    }
  }, [])

  // Listen to central application commands for playback
  useEffect(() => {
    const unregPlay = registerCommandHandler('playMedia', (cmd) => {
      if (cmd.payload?.streamUrl) {
        playStream({
          ref: cmd.payload.ref,
          streamUrl: cmd.payload.streamUrl,
          title: cmd.payload.title || 'Live Stream',
          subtitle: cmd.payload.subtitle,
          isLive: cmd.payload.isLive ?? true,
        })
      }
    })

    const unregToggle = registerCommandHandler('togglePlayback', () => {
      playback.togglePlay()
    })

    const unregPause = registerCommandHandler('pausePlayback', () => {
      pause()
    })

    const unregResume = registerCommandHandler('resumePlayback', () => {
      play()
    })

    const unregVol = registerCommandHandler('setVolume', (cmd) => {
      if (cmd.payload && typeof cmd.payload.level === 'number') {
        playback.setVolume(cmd.payload.level)
      }
    })

    const unregMute = registerCommandHandler('toggleMute', () => {
      playback.toggleMute()
    })

    const unregPip = registerCommandHandler('togglePiP', (cmd) => {
      if (cmd.payload?.state) {
        setPipMode(cmd.payload.state)
      } else {
        setPipMode((curr) => (curr === 'docked' ? 'minimized' : curr === 'minimized' ? 'docked' : 'docked'))
      }
    })

    return () => {
      unregPlay()
      unregToggle()
      unregPause()
      unregResume()
      unregVol()
      unregMute()
      unregPip()
    }
  }, [playStream, playback, play, pause])

  const value: UniversalPlaybackContextValue = {
    activeStream,
    playbackState: playback.state,
    pipMode,
    tracks: playback.tracks,
    muted: playback.muted,
    volume: playback.volume,
    ready: playback.ready,
    currentTime,
    duration,
    playbackSpeed,
    audioDelayMs,
    subDelaySecs,
    timeshiftOffsetSecs,
    isTimeshiftDelayed,
    aspectRatio,
    pictureSettings,
    abLoop,
    watchdogState,
    streamOptions: activeStream?.streamOptions ?? [],
    selectedServerId: activeStream?.selectedServerId ?? null,
    attemptedServers,
    fallbackNotice,
    retryAttempt,
    retryTimerRemaining,
    videoRef,
    playStream,
    stopPlayback,
    play,
    pause,
    triggerAutoRecovery,
    togglePlay: playback.togglePlay,
    toggleMute: playback.toggleMute,
    setVolume: playback.setVolume,
    setAudioTrack: playback.setAudioTrack,
    setSubtitleTrack: playback.setSubtitleTrack,
    setLevel: playback.setLevel,
    seek,
    seekDelta,
    seekTimeshift,
    jumpToLiveEdge,
    setPlaybackSpeed,
    setAudioDelayMs,
    setSubDelaySecs,
    setAspectRatio,
    setPictureSettings,
    setAbLoop,
    selectServer,
    setPipMode,
    retry,
    cancelRetry,
    dismissFallbackNotice,
  }

  useEffect(() => {
    broadcastRemotePlaybackState({
      title: activeStream?.title || 'Kinora TV',
      subtitle: activeStream?.subtitle || activeStream?.channel?.name || null,
      isPlaying: playback.state.status === 'playing',
      volume: playback.volume,
      isMuted: playback.muted,
      durationSec: duration,
      positionSec: currentTime,
      channelName: activeStream?.channel?.name || null,
      channelNumber: activeStream?.channel?.number || null,
    })
  }, [activeStream, playback.state.status, playback.volume, playback.muted, duration, currentTime])

  const lastScrobbleRef = useRef<{ action: string; progress: number; at: number } | null>(null)
  useEffect(() => {
    if (!activeStream || activeStream.isLive || duration <= 0) return

    const progress = Math.max(0, Math.min(100, (currentTime / duration) * 100))
    const status = playback.state.status

    if (status === 'playing') {
      const last = lastScrobbleRef.current
      const now = Date.now()
      if (!last || last.action !== 'start' || (now - last.at > 300000 && Math.abs(progress - last.progress) > 10)) {
        lastScrobbleRef.current = { action: 'start', progress, at: now }
        void scrobbleMedia('start', {
          movie: activeStream.ref?.includes('movie') ? { title: activeStream.title } : undefined,
          show: !activeStream.ref?.includes('movie') ? { title: activeStream.title } : undefined,
          progress,
        })
      }
    } else if (status === 'paused') {
      const last = lastScrobbleRef.current
      if (last && last.action === 'start') {
        lastScrobbleRef.current = { action: 'pause', progress, at: Date.now() }
        void scrobbleMedia('pause', {
          movie: activeStream.ref?.includes('movie') ? { title: activeStream.title } : undefined,
          show: !activeStream.ref?.includes('movie') ? { title: activeStream.title } : undefined,
          progress,
        })
      }
    }
  }, [activeStream, playback.state.status, currentTime, duration])

  if (typeof window !== 'undefined') {
    (window as unknown as { __kinoraPlayback?: UniversalPlaybackContextValue }).__kinoraPlayback = value
  }

  return (
    <UniversalPlaybackContext.Provider value={value}>
      {children}
      <PersistentPlayerDock />
    </UniversalPlaybackContext.Provider>
  )
}

export function useUniversalPlayback(): UniversalPlaybackContextValue {
  const ctx = useContext(UniversalPlaybackContext)
  if (!ctx) {
    // Return fallback for tests or components rendered outside provider
    return {
      activeStream: null,
      playbackState: defaultPlaybackState,
      pipMode: 'hidden',
      tracks: defaultTracks,
      muted: false,
      volume: 1,
      ready: false,
      currentTime: 0,
      duration: 0,
      playbackSpeed: 1.0,
      audioDelayMs: 0,
      subDelaySecs: 0,
      timeshiftOffsetSecs: 0,
      isTimeshiftDelayed: false,
      aspectRatio: 'auto',
      pictureSettings: DEFAULT_PICTURE_SETTINGS,
      abLoop: DEFAULT_AB_LOOP,
      watchdogState: 'healthy',
      streamOptions: [],
      selectedServerId: null,
      attemptedServers: new Set(),
      fallbackNotice: null,
      retryAttempt: 0,
      retryTimerRemaining: null,
      videoRef: { current: null },
      playStream: () => {},
      stopPlayback: () => {},
      play: () => {},
      pause: () => {},
      triggerAutoRecovery: () => {},
      togglePlay: () => {},
      toggleMute: () => {},
      setVolume: () => {},
      setAudioTrack: () => {},
      setSubtitleTrack: () => {},
      setLevel: () => {},
      seek: () => {},
      seekDelta: () => {},
      seekTimeshift: () => {},
      jumpToLiveEdge: () => {},
      setPlaybackSpeed: () => {},
      setAudioDelayMs: () => {},
      setSubDelaySecs: () => {},
      setAspectRatio: () => {},
      setPictureSettings: () => {},
      setAbLoop: () => {},
      selectServer: () => {},
      setPipMode: () => {},
      retry: () => {},
      cancelRetry: () => {},
      dismissFallbackNotice: () => {},
    }
  }
  return ctx
}
