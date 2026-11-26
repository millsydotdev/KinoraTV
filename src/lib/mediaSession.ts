/**
 * OS Media Session controller for Kinora.
 * Connects playback to MPRIS (Linux), SMTC (Windows), and macOS Now Playing media keys.
 */

export interface MediaSessionInfo {
  title: string
  artist?: string
  album?: string
  artwork?: Array<{ src: string; sizes?: string; type?: string }>
}

export interface MediaSessionCallbacks {
  onPlay?: () => void
  onPause?: () => void
  onSeekForward?: (deltaSec: number) => void
  onSeekBackward?: (deltaSec: number) => void
  onSeekTo?: (timeSec: number) => void
  onPreviousTrack?: () => void
  onNextTrack?: () => void
  onStop?: () => void
}

/**
 * Updates OS media session metadata (title, artist, artwork).
 */
export function updateMediaSessionMetadata(info: MediaSessionInfo | null): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') {
    return
  }

  if (!info) {
    navigator.mediaSession.metadata = null
    return
  }

  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: info.title,
      artist: info.artist || 'Kinora',
      album: info.album || 'Kinora',
      artwork: info.artwork && info.artwork.length > 0 ? info.artwork : [],
    })
  } catch {
    // MediaMetadata instantiation safe guard
  }
}

/**
 * Updates OS media playback state (playing, paused, none).
 */
export function updateMediaSessionPlaybackState(state: 'playing' | 'paused' | 'none'): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
    return
  }
  try {
    navigator.mediaSession.playbackState = state
  } catch {
    // Safe guard for unsupported environments
  }
}

/**
 * Updates OS media position state (duration, playback rate, position).
 */
export function updateMediaSessionPositionState(position: number, duration: number, playbackRate = 1.0): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) {
    return
  }

  if (duration > 0 && isFinite(duration) && isFinite(position)) {
    try {
      navigator.mediaSession.setPositionState({
        duration: Math.max(0, duration),
        playbackRate: Math.max(0.1, playbackRate),
        position: Math.max(0, Math.min(position, duration)),
      })
    } catch {
      // Ignore browsers that enforce strict position bounds on live streams
    }
  }
}

/**
 * Registers OS media transport hardware key callbacks.
 * Returns an unbind cleanup function.
 */
export function registerMediaSessionHandlers(callbacks: MediaSessionCallbacks): () => void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
    return () => {}
  }

  const ms = navigator.mediaSession

  const setHandler = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
    try {
      ms.setActionHandler(action, handler)
    } catch {
      // Unsupported actions in certain OS web engines
    }
  }

  if (callbacks.onPlay) {
    setHandler('play', () => callbacks.onPlay?.())
  }
  if (callbacks.onPause) {
    setHandler('pause', () => callbacks.onPause?.())
  }
  if (callbacks.onSeekForward) {
    setHandler('seekforward', (details) => callbacks.onSeekForward?.(details.seekOffset ?? 10))
  }
  if (callbacks.onSeekBackward) {
    setHandler('seekbackward', (details) => callbacks.onSeekBackward?.(details.seekOffset ?? 10))
  }
  if (callbacks.onSeekTo) {
    setHandler('seekto', (details) => {
      if (typeof details.seekTime === 'number') {
        callbacks.onSeekTo?.(details.seekTime)
      }
    })
  }
  if (callbacks.onPreviousTrack) {
    setHandler('previoustrack', () => callbacks.onPreviousTrack?.())
  }
  if (callbacks.onNextTrack) {
    setHandler('nexttrack', () => callbacks.onNextTrack?.())
  }
  if (callbacks.onStop) {
    setHandler('stop', () => callbacks.onStop?.())
  }

  return () => {
    const actions: MediaSessionAction[] = [
      'play',
      'pause',
      'seekforward',
      'seekbackward',
      'seekto',
      'previoustrack',
      'nexttrack',
      'stop',
    ]
    for (const a of actions) {
      setHandler(a, null)
    }
  }
}
