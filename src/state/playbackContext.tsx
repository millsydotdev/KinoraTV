// Persistent universal playback context for Kinora 0.6.0.
// Keeps active stream alive during route transitions and powers the television PiP dock.
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
import type { Channel } from '../data/types'
import {
  useStreamPlayback,
  type PlaybackState,
  type Tracks,
} from '../lib/playback'
import { registerCommandHandler } from '../lib/commands'
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
}

export type PipMode = 'hidden' | 'docked' | 'minimized' | 'fullscreen'

export interface UniversalPlaybackContextValue {
  activeStream: ActiveStreamItem | null
  playbackState: PlaybackState
  pipMode: PipMode
  tracks: Tracks
  muted: boolean
  volume: number
  videoRef: RefObject<HTMLVideoElement | null>
  playStream: (item: ActiveStreamItem) => void
  stopPlayback: () => void
  togglePlay: () => void
  toggleMute: () => void
  setVolume: (v: number) => void
  setPipMode: (mode: PipMode) => void
  retry: () => void
}

const defaultPlaybackState: PlaybackState = {
  status: 'idle',
  message: null,
  canRetry: false,
}

const UniversalPlaybackContext = createContext<UniversalPlaybackContextValue | null>(null)

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const { prefs } = useStore()
  const [activeStream, setActiveStream] = useState<ActiveStreamItem | null>(null)
  const [pipMode, setPipMode] = useState<PipMode>('hidden')
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const playback = useStreamPlayback(
    activeStream?.streamUrl ?? null,
    videoRef,
    prefs
  )

  const playStream = useCallback((item: ActiveStreamItem) => {
    setActiveStream((prev) => {
      // Do not restart identical streams during navigation
      if (prev && prev.streamUrl === item.streamUrl) {
        return { ...prev, ...item }
      }
      return item
    })
    setPipMode((prev) => (prev === 'hidden' ? 'docked' : prev))
  }, [])

  const stopPlayback = useCallback(() => {
    setActiveStream(null)
    setPipMode('hidden')
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
      const v = videoRef.current
      if (v && !v.paused) v.pause()
    })

    const unregResume = registerCommandHandler('resumePlayback', () => {
      const v = videoRef.current
      if (v && v.paused) v.play().catch(() => {})
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
  }, [playStream, playback])

  const value: UniversalPlaybackContextValue = {
    activeStream,
    playbackState: playback.state,
    pipMode,
    tracks: playback.tracks,
    muted: playback.muted,
    volume: playback.volume,
    videoRef,
    playStream,
    stopPlayback,
    togglePlay: playback.togglePlay,
    toggleMute: playback.toggleMute,
    setVolume: playback.setVolume,
    setPipMode,
    retry: playback.retry,
  }

  return (
    <UniversalPlaybackContext.Provider value={value}>
      {children}
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
      tracks: { audio: [], audioId: -1, subtitles: [], subtitleId: -1, levels: [], levelId: -1 },
      muted: false,
      volume: 1,
      videoRef: { current: null },
      playStream: () => {},
      stopPlayback: () => {},
      togglePlay: () => {},
      toggleMute: () => {},
      setVolume: () => {},
      setPipMode: () => {},
      retry: () => {},
    }
  }
  return ctx
}
