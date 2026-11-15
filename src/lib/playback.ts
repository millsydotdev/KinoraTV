// Real HLS playback for playlist channels. Rust opens a guarded stream session and gives the page an
// opaque `kstream` address (never the upstream one); hls.js (loaded on demand, no workers) plays it
// through Media Source Extensions. Status comes only from media and hls.js events: selecting a channel
// or starting a request never counts as playing. Nothing waits forever: starting and buffering are
// both bounded, and a timeout tears the attempt down and says so.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { closeStream, IngestError, openStream, openXtreamCatchup } from './native'

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

/** How long a stream may take to show its first frame, and how long it may buffer once playing. */
export const START_TIMEOUT_MS = 30_000
export const STALL_TIMEOUT_MS = 30_000
/** Without H.264 almost nothing can play, so do not make the user wait as long to find out. */
const START_TIMEOUT_NO_H264_MS = 12_000

export interface CodecSupport { h264: boolean; hevc: boolean; av1: boolean; vp9: boolean; aac: boolean; mp3: boolean }

/** What the system's media stack says it can decode through Media Source Extensions. */
export function codecSupport(): CodecSupport | null {
  const ms = typeof MediaSource === 'undefined' ? null : MediaSource
  if (!ms) return null
  const can = (t: string) => ms.isTypeSupported(t)
  return {
    h264: can('video/mp4; codecs="avc1.42e01e"'),
    hevc: can('video/mp4; codecs="hvc1.1.6.L93.B0"'),
    av1: can('video/mp4; codecs="av01.0.05M.08"'),
    vp9: can('video/mp4; codecs="vp09.00.10.08"'),
    aac: can('audio/mp4; codecs="mp4a.40.2"'),
    mp3: can('audio/mpeg'),
  }
}

export const CODEC_HELP = 'Your system has no decoder for this video. On Fedora, install gstreamer1-plugin-openh264 (H.264) or the RPM Fusion codecs. On Debian or Ubuntu, install gstreamer1.0-libav. Then restart Kinora. Settings › Playback shows what your system supports.'

const INCOMPATIBLE = new Set(['manifestIncompatibleCodecsError', 'bufferIncompatibleCodecsError', 'bufferAddCodecError'])

/** Turns a fatal hls.js error into a state. Exported for tests. */
export function fromHlsError(data: { type: string; details?: string; response?: { code?: number } }): PlaybackState {
  const code = data.response?.code
  if (code !== undefined && BY_STATUS[code]) return BY_STATUS[code]
  if (data.details && INCOMPATIBLE.has(data.details)) return state('unsupported', CODEC_HELP)
  if (data.type === 'mediaError') return state('error', 'This stream could not be decoded. Your system may be missing a video codec: see Settings › Playback.', true)
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

export interface Track { id: number; label: string; lang: string | null }
export interface Tracks { audio: Track[]; audioId: number; subtitles: Track[]; subtitleId: number; levels: { id: number; height: number }[]; levelId: number }
const NO_TRACKS: Tracks = { audio: [], audioId: -1, subtitles: [], subtitleId: -1, levels: [], levelId: -1 }

export interface PlaybackPrefs { quality: string; audioLanguage: string; subtitles: boolean; subtitleLanguage: string }
const NO_PREFS: PlaybackPrefs = { quality: 'auto', audioLanguage: 'English', subtitles: false, subtitleLanguage: 'English' }

const LANG_CODES: Record<string, string[]> = { English: ['en', 'eng'], French: ['fr', 'fra', 'fre'], German: ['de', 'deu', 'ger'], Spanish: ['es', 'spa'], Welsh: ['cy', 'cym', 'wel'] }

/** The track for a preferred language name, by name or language code. Exported for tests. */
export function matchLanguage(tracks: Track[], language: string): Track | undefined {
  const base = language.split(' (')[0] ?? language
  const codes = LANG_CODES[base] ?? []
  return tracks.find((t) => t.label.toLowerCase().startsWith(base.toLowerCase()))
    ?? tracks.find((t) => t.lang !== null && codes.includes(t.lang.toLowerCase().split('-')[0] ?? ''))
}

/** The highest level at or under a quality cap such as `720p`; -1 means no cap. Exported for tests. */
export function levelCap(levels: { height: number }[], quality: string): number {
  const max = Number.parseInt(quality, 10)
  if (Number.isNaN(max)) return -1
  let best = -1
  levels.forEach((l, i) => { if (l.height <= max && (best < 0 || l.height >= (levels[best]?.height ?? 0))) best = i })
  return best
}

export interface Playback {
  state: PlaybackState
  tracks: Tracks
  setAudioTrack: (id: number) => void
  setSubtitleTrack: (id: number) => void
  setLevel: (id: number) => void
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
export function useStreamPlayback(streamUrl: string | null, video: RefObject<HTMLVideoElement | null>, prefs: PlaybackPrefs = NO_PREFS): Playback {
  const [current, setCurrent] = useState<PlaybackState>(streamUrl ? LOADING : IDLE)
  const [tracks, setTracks] = useState<Tracks>(NO_TRACKS)
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs
  const hlsRef = useRef<import('hls.js').default | null>(null)
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
    setTracks(NO_TRACKS)

    // One watchdog: armed while the stream should be making progress, cleared when it does.
    let timer = 0
    const disarm = () => window.clearTimeout(timer)
    const stopAttempt = () => {
      disarm()
      hls?.destroy()
      hls = null
      hlsRef.current = null
      if (session !== null) void closeStream(session)
      session = null
    }
    const arm = (ms: number, message: () => PlaybackState) => {
      disarm()
      timer = window.setTimeout(() => {
        if (!live) return
        set(message())
        stopAttempt()
      }, ms)
    }
    const support = codecSupport()
    const noH264 = support !== null && !support.h264
    arm(noH264 ? START_TIMEOUT_NO_H264_MS : START_TIMEOUT_MS, () => (noH264
      ? state('unsupported', CODEC_HELP)
      : state('error', 'The stream did not start within 30 seconds. It may be offline, blocked where you are, or too slow.', true)))

    const onPlaying = () => { disarm(); set(state('playing')) }
    const onPause = () => { disarm(); set(state('paused')) }
    const onWaiting = () => {
      set(state('buffering'))
      arm(STALL_TIMEOUT_MS, () => state('error', 'The stream stopped sending video for 30 seconds.', true))
    }
    const onMediaError = () => {
      if (!el.error) return
      disarm()
      set(el.error.code === 4 ? state('unsupported', CODEC_HELP) : state('error', 'This stream could not be decoded.', true))
    }
    const onVolume = () => {
      if (!live) return
      setMuted(el.muted)
      setVolumeState(el.volume)
    }
    const events: [string, () => void][] = [['playing', onPlaying], ['pause', onPause], ['waiting', onWaiting], ['volumechange', onVolume], ['error', onMediaError]]
    for (const [name, fn] of events) el.addEventListener(name, fn)

    const start = async () => {
      let opened
      try {
        if (streamUrl.startsWith('kstream://')) {
          opened = { url: streamUrl, session: 0 }
        } else if (streamUrl.startsWith('catchup://')) {
          const parsed = new URL(streamUrl)
          const sourceId = parsed.hostname || parsed.host
          const parts = parsed.pathname.trim().replace(/^\//, '').split('/')
          const streamId = parts[0] || ''
          const startTimestamp = parseInt(parts[1] || '0', 10)
          const durationMins = parseInt(parts[2] || '60', 10)
          opened = await openXtreamCatchup(sourceId, streamId, startTimestamp, durationMins)
        } else {
          opened = await openStream(streamUrl)
        }
      } catch (e) {
        disarm()
        return set(fromOpenError(e))
      }
      if (!opened) { disarm(); return set(state('unsupported', 'Playback needs the Kinora desktop app.')) }
      if (!live) return void closeStream(opened.session) // left or switched while Rust was opening
      session = opened.session
      const { default: Hls } = await import('hls.js')
      if (!live) return
      if (!Hls.isSupported()) { disarm(); return set(state('unsupported', 'This system cannot play HLS: Media Source Extensions are unavailable.')) }
      const player = new Hls({ enableWorker: false, lowLatencyMode: false })
      hls = player
      hlsRef.current = player
      const showTracks = () => {
        if (!live) return
        setTracks({
          audio: player.audioTracks.map((t) => ({ id: t.id, label: t.name || t.lang || `Track ${t.id + 1}`, lang: t.lang ?? null })),
          audioId: player.audioTrack,
          subtitles: player.subtitleTracks.map((t) => ({ id: t.id, label: t.name || t.lang || `Track ${t.id + 1}`, lang: t.lang ?? null })),
          subtitleId: player.subtitleTrack,
          levels: player.levels.map((l, id) => ({ id, height: l.height })),
          levelId: player.autoLevelEnabled ? -1 : player.currentLevel,
        })
      }
      player.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_e, data) => {
        const list = data.audioTracks.map((t) => ({ id: t.id, label: t.name, lang: t.lang ?? null }))
        const pick = matchLanguage(list, prefsRef.current.audioLanguage)
        if (pick && pick.id !== player.audioTrack) player.audioTrack = pick.id
        showTracks()
      })
      player.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_e, data) => {
        const list = data.subtitleTracks.map((t) => ({ id: t.id, label: t.name, lang: t.lang ?? null }))
        const pick = prefsRef.current.subtitles ? matchLanguage(list, prefsRef.current.subtitleLanguage) ?? list[0] : undefined
        player.subtitleTrack = pick ? pick.id : -1
        showTracks()
      })
      player.on(Hls.Events.AUDIO_TRACK_SWITCHED, showTracks)
      player.on(Hls.Events.SUBTITLE_TRACK_SWITCH, showTracks)
      player.on(Hls.Events.LEVEL_SWITCHED, showTracks)
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
        stopAttempt()
      })
      player.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!live) return
        const cap = levelCap(player.levels, prefsRef.current.quality)
        if (cap >= 0) player.autoLevelCapping = cap
        showTracks()
        const tryPlay = () => el.play().catch((e: unknown) => {
          if (!live) return
          // Interrupted by the media pipeline (seen on live streams): try again once there is data, watchdog still running.
          if (e instanceof DOMException && e.name === 'AbortError') el.addEventListener('canplay', () => void tryPlay(), { once: true })
          else { disarm(); set(state('paused', 'Press Play to start.')) }
        })
        void tryPlay()
      })
      player.attachMedia(el)
      player.loadSource(opened.url)
    }
    start().catch(() => { disarm(); set(state('error', 'Playback could not start.', true)) })

    return () => {
      live = false
      for (const [name, fn] of events) el.removeEventListener(name, fn)
      disarm()
      hls?.destroy() // stops its loaders and detaches the media source
      hlsRef.current = null
      el.removeAttribute('src')
      el.load()
      if (session !== null) void closeStream(session)
    }
  }, [streamUrl, attempt, video])

  const el = () => video.current
  return {
    state: current,
    tracks,
    setAudioTrack: (id) => { const h = hlsRef.current; if (h) h.audioTrack = id },
    setSubtitleTrack: (id) => { const h = hlsRef.current; if (h) h.subtitleTrack = id; setTracks((t) => ({ ...t, subtitleId: id })) },
    setLevel: (id) => { const h = hlsRef.current; if (h) h.nextLevel = id; setTracks((t) => ({ ...t, levelId: id })) },
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
