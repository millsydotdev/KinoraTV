// Central application command dispatcher for Kinora 0.6.0.
// Unifies keyboard shortcuts, remote controls, UI controls, and future AI/Jarvis integrations.
// Follows strict project typography rules: zero em-dashes across all code and comments.

export type CommandType =
  | 'navigate'
  | 'playMedia'
  | 'pausePlayback'
  | 'resumePlayback'
  | 'togglePlayback'
  | 'changeChannel'
  | 'searchMedia'
  | 'setVolume'
  | 'toggleMute'
  | 'toggleViewMode'
  | 'openSettings'
  | 'openQuickSettings'
  | 'togglePiP'

export interface CommandPayloadMap {
  navigate: { to: string; replace?: boolean }
  playMedia: { ref?: string; streamUrl?: string; title?: string; subtitle?: string; isLive?: boolean; channelId?: string }
  pausePlayback: Record<string, never>
  resumePlayback: Record<string, never>
  togglePlayback: Record<string, never>
  changeChannel: { direction?: 'up' | 'down'; channelId?: string; channelNumber?: number }
  searchMedia: { query: string }
  setVolume: { level: number }
  toggleMute: Record<string, never>
  toggleViewMode: { mode?: 'tv' | 'desktop' }
  openSettings: { section?: string }
  openQuickSettings: Record<string, never>
  togglePiP: { state?: 'docked' | 'minimized' | 'hidden' | 'fullscreen' }
}

export interface KinoraCommand<K extends CommandType = CommandType> {
  type: K
  payload?: CommandPayloadMap[K]
  source?: 'keyboard' | 'remote' | 'ui' | 'api'
  timestamp?: number
}

type CommandHandler<K extends CommandType = CommandType> = (cmd: KinoraCommand<K>) => void

const handlers = new Map<CommandType, Set<CommandHandler<any>>>()

/** Registers a listener for a specific command type. Returns an unregister cleanup function. */
export function registerCommandHandler<K extends CommandType>(
  type: K,
  handler: CommandHandler<K>
): () => void {
  let bucket = handlers.get(type)
  if (!bucket) {
    bucket = new Set()
    handlers.set(type, bucket)
  }
  bucket.add(handler as CommandHandler<any>)
  return () => {
    bucket?.delete(handler as CommandHandler<any>)
    if (bucket?.size === 0) {
      handlers.delete(type)
    }
  }
}

/** Dispatches a Kinora application command to registered listeners and global window events. */
export function dispatchKinoraCommand<K extends CommandType>(command: KinoraCommand<K>): boolean {
  const stamped: KinoraCommand<K> = {
    ...command,
    timestamp: command.timestamp ?? Date.now(),
  }

  // 1. Notify typed memory listeners
  const bucket = handlers.get(command.type)
  if (bucket && bucket.size > 0) {
    bucket.forEach((fn) => {
      try {
        fn(stamped)
      } catch (err) {
        console.error(`Error in command handler for ${command.type}:`, err)
      }
    })
  }

  // 2. Dispatch DOM custom event for decoupled listeners
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('kinora:command', { detail: stamped }))
      // Also emit individual event for easy backward-compatible bindings
      window.dispatchEvent(new CustomEvent(`kinora:command:${command.type}`, { detail: stamped }))
    } catch {
      // In non-DOM testing environments
    }
  }

  return true
}

// Convenience helper wrappers

export function kinoraNavigate(to: string, replace = false): boolean {
  return dispatchKinoraCommand({
    type: 'navigate',
    payload: { to, replace },
    source: 'ui',
  })
}

export function kinoraPlayMedia(payload: CommandPayloadMap['playMedia']): boolean {
  return dispatchKinoraCommand({
    type: 'playMedia',
    payload,
    source: 'ui',
  })
}

export function kinoraPausePlayback(): boolean {
  return dispatchKinoraCommand({
    type: 'pausePlayback',
    payload: {},
    source: 'ui',
  })
}

export function kinoraResumePlayback(): boolean {
  return dispatchKinoraCommand({
    type: 'resumePlayback',
    payload: {},
    source: 'ui',
  })
}

export function kinoraTogglePlayback(): boolean {
  return dispatchKinoraCommand({
    type: 'togglePlayback',
    payload: {},
    source: 'ui',
  })
}

export function kinoraChangeChannel(direction: 'up' | 'down', channelNumber?: number): boolean {
  return dispatchKinoraCommand({
    type: 'changeChannel',
    payload: { direction, channelNumber },
    source: 'ui',
  })
}

export function kinoraSetVolume(level: number): boolean {
  return dispatchKinoraCommand({
    type: 'setVolume',
    payload: { level: Math.max(0, Math.min(1, level)) },
    source: 'ui',
  })
}

export function kinoraToggleMute(): boolean {
  return dispatchKinoraCommand({
    type: 'toggleMute',
    payload: {},
    source: 'ui',
  })
}

export function kinoraToggleViewMode(mode?: 'tv' | 'desktop'): boolean {
  return dispatchKinoraCommand({
    type: 'toggleViewMode',
    payload: { mode },
    source: 'ui',
  })
}

export function kinoraSearchMedia(query: string): boolean {
  return dispatchKinoraCommand({
    type: 'searchMedia',
    payload: { query },
    source: 'ui',
  })
}

export function kinoraOpenSettings(section?: string): boolean {
  return dispatchKinoraCommand({
    type: 'openSettings',
    payload: { section },
    source: 'ui',
  })
}

export function kinoraTogglePiP(state?: 'docked' | 'minimized' | 'hidden' | 'fullscreen'): boolean {
  return dispatchKinoraCommand({
    type: 'togglePiP',
    payload: { state },
    source: 'ui',
  })
}
