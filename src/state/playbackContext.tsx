// Persistent universal playback context for Kinora 0.6.0.
// Sole authority for stream playback, video element, and presentation modes.
// Strictly follows project typography standards: zero em-dashes across all code and comments.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
import { useStore } from './store'

export interface ActiveStreamItem {
  ref?: string
  streamUrl: string
  title: string
  subtitle?: string
  channel?: Channel
  isLive?: boolean
  programmeArt?: string
  duration?: number
  position?: number
  sourceId?: string
  streamOptions?: StreamVariant[]
  selectedServerId?: string
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
  aspectRatio: 'auto' | '16:9' | '4:3' | 'fill'
  streamOptions: StreamVariant[]
  selectedServerId: string | null
  attemptedServers: Set<string>
  fallbackNotice: string | null
  retryAttempt: number
  videoRef: RefObject<HTMLVideoElement | null>
  playStream: (item: ActiveStreamItem) => void
  stopPlayback: () => void
  play: () => void
  pause: () => void
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
  setAspectRatio: (ar: 'auto' | '16:9' | '4:3' | 'fill') => void
  selectServer: (serverId: string) => void
  setPipMode: (mode: PipMode) => void
  retry: () => void
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
  const [aspectRatio, setAspectRatio] = useState<'auto' | '16:9' | '4:3' | 'fill'>('auto')
  const [attemptedServers, setAttemptedServers] = useState<Set<string>>(new Set())
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null)
  const [retryAttempt, setRetryAttempt] = useState(0)

  const playback = useStreamPlayback(
    activeStream?.streamUrl ?? null,
    videoRef,
    prefs
  )

  const isTimeshiftDelayed = timeshiftOffsetSecs > 0

  const playStream = useCallback((item: ActiveStreamItem) => {
    setActiveStream((prev) => {
      // Do not restart identical streams during navigation or metadata updates
      if (prev && prev.streamUrl === item.streamUrl && prev.ref === item.ref) {
        return { ...prev, ...item }
      }
      return item
    })
    setAttemptedServers(new Set())
    setFallbackNotice(null)
    setRetryAttempt(0)
    setTimeshiftOffsetSecs(0)
    setPipMode((prev) => (prev === 'hidden' ? 'docked' : prev))
  }, [])

  const stopPlayback = useCallback(() => {
    setActiveStream(null)
    setPipMode('hidden')
    setFallbackNotice(null)
    setAttemptedServers(new Set())
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

  // Automatic server fallback on stream playback failure
  useEffect(() => {
    if (!activeStream || !activeStream.streamOptions || activeStream.streamOptions.length <= 1) return
    if (playback.state.status === 'error') {
      if (store.autoFallbackEnabled) {
        const currentOptionId = activeStream.selectedServerId ?? activeStream.streamOptions[0]?.id
        const currentOption = activeStream.streamOptions.find((o) => o.id === currentOptionId)
        setAttemptedServers((prev) => {
          const nextSet = new Set(prev)
          if (currentOption) nextSet.add(currentOption.id)
          const nextCandidate = activeStream.streamOptions?.find((opt) => !nextSet.has(opt.id) && opt.streamUrl)
          if (nextCandidate) {
            setFallbackNotice(`Server "${currentOption?.name ?? 'current'}" failed. Trying "${nextCandidate.name}"...`)
            selectServer(nextCandidate.id)
          } else if (nextSet.size >= (activeStream.streamOptions?.length ?? 0)) {
            setFallbackNotice('All available servers for this channel have been attempted.')
          }
          return nextSet
        })
      }
    }
  }, [playback.state.status, activeStream, store.autoFallbackEnabled, selectServer])

  // Automated exponential backoff retry for stream errors
  useEffect(() => {
    if (playback.state.status === 'playing') {
      setRetryAttempt(0)
      return
    }

    if (playback.state.status === 'error' && playback.state.canRetry && retryAttempt < 5) {
      const delays = [1000, 2000, 4000, 8000, 16000]
      const delay = delays[retryAttempt] ?? 16000
      const timer = window.setTimeout(() => {
        setRetryAttempt((prev) => prev + 1)
        playback.retry()
      }, delay)
      return () => window.clearTimeout(timer)
    }
  }, [playback.state.status, playback.state.canRetry, retryAttempt, playback.retry])

  // Video element event listeners: track time, duration, and progress
  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    const onTimeUpdate = () => {
      setCurrentTime(el.currentTime)
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

    el.addEventListener('timeupdate', onTimeUpdate)
    el.addEventListener('loadedmetadata', onLoadedMetadata)
    el.addEventListener('durationchange', onDurationChange)

    return () => {
      el.removeEventListener('timeupdate', onTimeUpdate)
      el.removeEventListener('loadedmetadata', onLoadedMetadata)
      el.removeEventListener('durationchange', onDurationChange)
    }
  }, [activeStream, store])

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
    streamOptions: activeStream?.streamOptions ?? [],
    selectedServerId: activeStream?.selectedServerId ?? null,
    attemptedServers,
    fallbackNotice,
    retryAttempt,
    videoRef,
    playStream,
    stopPlayback,
    play,
    pause,
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
    selectServer,
    setPipMode,
    retry: playback.retry,
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
      streamOptions: [],
      selectedServerId: null,
      attemptedServers: new Set(),
      fallbackNotice: null,
      retryAttempt: 0,
      videoRef: { current: null },
      playStream: () => {},
      stopPlayback: () => {},
      play: () => {},
      pause: () => {},
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
      selectServer: () => {},
      setPipMode: () => {},
      retry: () => {},
    }
  }
  return ctx
}
