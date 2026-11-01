// Real HLS playback for playlist channels. Rust opens a guarded stream session and gives the page an
// opaque `kstream` address (never the upstream one); hls.js (light build, loaded on demand, no
// workers) plays it through Media Source Extensions. Status comes only from media and hls.js events:
// selecting a channel or starting a request never counts as playing.
import { useCallback, useEffect, useState, type RefObject } from 'react'
import { closeStream, IngestError, openStream } from './native'

export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'error' | 'unsupported'

export interface PlaybackState {
  status: PlaybackStatus
  /** Safe to show: never contains a stream address. */
  message: string | null
  canRetry: boolean
}

const IDLE: PlaybackState = { status: 'idle', message: null, canRetry: false }
const LOADING: PlaybackState = { status: 'loading', message: null, canRetry: false }
const state = (status: PlaybackStatus, message: string | null = null, canRetry = false): PlaybackState => ({ status, message, canRetry })

/** Statuses the `kstream` protocol answers with (src-tauri/src/stream.rs), as messages. */
const BY_STATUS: Record<number, PlaybackState> = {
  403: state('unsupported', 'This stream refers to an address Kinora does not fetch from, such as a local or private network.'),
  404: state('error', 'The stream session expired.', true),
  410: state('error', 'The stream was closed.', true),
  413: state('unsupported', 'Part of this stream is larger than Kinora allows.'),
  415: state('unsupported', 'This stream is not HLS. Kinora can play HLS streams only so far.'),
  416: state('error', 'The stream asked for an invalid byte range.', true),
  422: state('unsupported', 'This stream uses features Kinora does not support, such as DRM.'),
  502: state('error', 'The stream server could not be reached or refused the request.', true),
  503: state('error', 'The stream is busy. Try again in a moment.', true),
  504: state('error', 'The stream server did not answer in time.', true),
}

/** Turns a fatal hls.js error into a state. Exported for tests. */
export function fromHlsError(data: { type: string; response?: { code?: number } }): PlaybackState {
  const code = data.response?.code
  if (code !== undefined && BY_STATUS[code]) return BY_STATUS[code]
  if (data.type === 'mediaError') return state('error', 'This stream could not be decoded. Your system may be missing a video codec.', true)
  if (data.type === 'networkError') return state('error', 'The stream stopped responding.', true)
  return state('error', 'This stream could not be played.', true)
}

function fromOpenError(e: unknown): PlaybackState {
  if (!(e instanceof IngestError)) return state('error', 'Playback could not start.', true)
  // Stream refusals from Rust name no address; the shared address refusals mention the host, so the
  // player uses its own wording for those, the same as for a stream that turns out to be blocked.
  if (e.code === 'unsupported-stream') return state('unsupported', e.message)
  if (e.code === 'blocked') return BY_STATUS[403] ?? state('unsupported', 'This stream cannot be played.')
  if (e.code === 'invalid-url') return state('unsupported', 'This stream’s address is not valid.')
  return state('error', 'Playback could not start.', true)
}

/** The status line for a playlist stream; messages never contain a stream address. */
export function playbackText(s: PlaybackState): string {
  if (s.message) return s.message
  if (s.status === 'buffering') return 'Buffering…'
  if (s.status === 'paused') return 'Paused'
  return 'Loading stream…'
}

export interface Playback {
  state: PlaybackState
  muted: boolean
  volume: number
  /** True once there is media to control (playing, paused or buffering). */
  ready: boolean
  retry: () => void
  togglePlay: () => void
  toggleMute: () => void
  setVolume: (v: number) => void
}

/** Plays `streamUrl` (a playlist channel's address, held in memory only) into `video`. `null` plays nothing. */
export function useStreamPlayback(streamUrl: string | null, video: RefObject<HTMLVideoElement | null>): Playback {
  const [current, setCurrent] = useState<PlaybackState>(streamUrl ? LOADING : IDLE)
  const [attempt, setAttempt] = useState(0)
  const [muted, setMuted] = useState(false)
  const [volume, setVolumeState] = useState(1)

  useEffect(() => {
    const el = video.current
    if (!streamUrl || !el) {
      setCurrent(IDLE)
      return
    }
    // Everything below belongs to this channel and attempt; once superseded it must not touch state.
    let live = true
    let session: number | null = null
    let hls: { destroy: () => void } | null = null
    const set = (s: PlaybackState) => { if (live) setCurrent(s) }
    set(LOADING)

    const onPlaying = () => set(state('playing'))
    const onPause = () => set(state('paused'))
    const onWaiting = () => set(state('buffering'))
    const onVolume = () => {
      if (!live) return
      setMuted(el.muted)
      setVolumeState(el.volume)
    }
    const events: [string, () => void][] = [['playing', onPlaying], ['pause', onPause], ['waiting', onWaiting], ['volumechange', onVolume]]
    for (const [name, fn] of events) el.addEventListener(name, fn)

    const start = async () => {
      let opened
      try {
        opened = await openStream(streamUrl)
      } catch (e) {
        return set(fromOpenError(e))
      }
      if (!opened) return set(state('unsupported', 'Playback needs the Kinora desktop app.'))
      if (!live) return void closeStream(opened.session) // left or switched while Rust was opening
      session = opened.session
      const { default: Hls } = await import('hls.js/light')
      if (!live) return
      if (!Hls.isSupported()) return set(state('unsupported', 'This system cannot play HLS: Media Source Extensions are unavailable.'))
      const player = new Hls({ enableWorker: false, lowLatencyMode: false })
      hls = player
      let recovered = false
      player.on(Hls.Events.ERROR, (_event, data) => {
        if (!live || !data.fatal) return
        // One decoder reset is worth trying before giving up on a media error.
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) {
          recovered = true
          player.recoverMediaError()
          return
        }
        set(fromHlsError(data))
      })
      player.on(Hls.Events.MANIFEST_PARSED, () => {
        if (live) el.play().catch(() => set(state('paused', 'Press Play to start.')))
      })
      player.attachMedia(el)
      player.loadSource(opened.url)
    }
    start().catch(() => set(state('error', 'Playback could not start.', true)))

    return () => {
      live = false
      for (const [name, fn] of events) el.removeEventListener(name, fn)
      hls?.destroy() // stops its loaders and detaches the media source
      el.removeAttribute('src')
      el.load()
      if (session !== null) void closeStream(session)
    }
  }, [streamUrl, attempt, video])

  const el = () => video.current
  return {
    state: current,
    muted,
    volume,
    ready: ['playing', 'paused', 'buffering'].includes(current.status),
    retry: useCallback(() => setAttempt((n) => n + 1), []),
    togglePlay: () => {
      const v = el()
      if (!v) return
      if (v.paused) v.play().catch(() => setCurrent(state('paused', 'Press Play to start.')))
      else v.pause()
    },
    toggleMute: () => { const v = el(); if (v) v.muted = !v.muted },
    setVolume: (level: number) => {
      const v = el()
      if (!v) return
      v.volume = level
      v.muted = level === 0
    },
  }
}
