// remoteServerSync.ts - Synchronizes Kinora state with the wireless mobile remote server.
// Dispatches incoming remote commands to spatial navigation and playback dispatchers.
// Strictly adheres to project typography standards: zero em-dashes across all code and comments.

import { isTauri } from './native'
import {
  kinoraChangeChannel,
  kinoraTogglePlayback,
  dispatchKinoraCommand,
} from './commands'
import { navigateSpatial } from './remoteNav'
import {
  updateRemotePlaybackState,
  type RemoteCommandEvent,
  type RemotePlaybackState,
} from './native'

export type RemoteCommandHandler = (cmd: RemoteCommandEvent) => void

let unlistenRemoteCommand: (() => void) | null = null
let customHandlers: Set<RemoteCommandHandler> = new Set()

/**
 * Handles an incoming remote command and maps it to Kinora navigation or playback actions.
 */
export function handleIncomingRemoteCommand(event: RemoteCommandEvent): void {
  // Notify registered custom subscribers first
  for (const handler of customHandlers) {
    try {
      handler(event)
    } catch (e) {
      console.error('Error in custom remote command handler:', e)
    }
  }

  const cmd = event.command
  const payload = event.payload ?? {}

  switch (cmd) {
    case 'dpad_up':
      navigateSpatial('up')
      break

    case 'dpad_down':
      navigateSpatial('down')
      break

    case 'dpad_left':
      navigateSpatial('left')
      break

    case 'dpad_right':
      navigateSpatial('right')
      break

    case 'dpad_select': {
      if (typeof document !== 'undefined') {
        const active = document.activeElement as HTMLElement | null
        if (active && typeof active.click === 'function') {
          active.click()
        } else {
          // Dispatch synthetic Enter key
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }))
        }
      }
      break
    }

    case 'back': {
      if (typeof window !== 'undefined') {
        const openDialog = document.querySelector('dialog[open], .ds-command-backdrop, .modal-backdrop') as HTMLElement | null
        if (openDialog) {
          const closeBtn = openDialog.querySelector<HTMLElement>(
            'button[aria-label="Close"], button.close-btn, .dialog-close'
          )
          if (closeBtn) {
            closeBtn.click()
            break
          }
        }
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))
      }
      break
    }

    case 'home': {
      if (typeof window !== 'undefined') {
        window.location.hash = '#/'
        window.dispatchEvent(new CustomEvent('kinora:navigate_home'))
      }
      break
    }

    case 'play_pause':
      kinoraTogglePlayback()
      break

    case 'play':
      dispatchKinoraCommand({ type: 'resumePlayback', source: 'remote' })
      break

    case 'pause':
      dispatchKinoraCommand({ type: 'pausePlayback', source: 'remote' })
      break

    case 'seek_forward':
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true }))
      }
      break

    case 'seek_backward':
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', bubbles: true }))
      }
      break

    case 'mute':
    case 'toggle_mute':
      dispatchKinoraCommand({ type: 'toggleMute', source: 'remote' })
      break

    case 'vol_up':
    case 'volume_up':
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', bubbles: true }))
      }
      break

    case 'vol_down':
    case 'volume_down':
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }))
      }
      break

    case 'ch_up':
    case 'channel_up':
      kinoraChangeChannel('up')
      break

    case 'ch_down':
    case 'channel_down':
      kinoraChangeChannel('down')
      break

    case 'step_back':
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', bubbles: true }))
      }
      break

    case 'step_forward':
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true }))
      }
      break

    case 'seek_to': {
      const rawPos = Number(payload.positionSec)
      if (!Number.isFinite(rawPos) || rawPos < 0) break
      if (typeof document !== 'undefined') {
        const video = document.querySelector('video') as HTMLVideoElement | null
        if (video) {
          const maxDur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : rawPos
          video.currentTime = Math.min(rawPos, maxDur)
        }
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kinora:remote_seek', { detail: { positionSec: rawPos } }))
      }
      break
    }

    case 'play_media_item': {
      const mediaId = typeof payload.mediaId === 'string' ? payload.mediaId : ''
      const title = typeof payload.title === 'string' ? payload.title : ''
      const kind = typeof payload.kind === 'string' ? payload.kind : 'movie'
      if (typeof window !== 'undefined') {
        const ev = new CustomEvent('kinora:play_media_item', {
          detail: { mediaId, title, kind },
          cancelable: true,
        })
        const notPrevented = window.dispatchEvent(ev)
        if (notPrevented && title) {
          window.location.hash = `#/search?q=${encodeURIComponent(title)}`
        }
      }
      break
    }

    case 'subtitles':
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', bubbles: true }))
      }
      break

    case 'aspect':
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA', bubbles: true }))
      }
      break

    case 'tune_channel': {
      const channelId = typeof payload.channelId === 'string' ? payload.channelId : undefined
      const channelNumber = typeof payload.channelNumber === 'number' ? payload.channelNumber : undefined
      dispatchKinoraCommand({
        type: 'changeChannel',
        payload: { channelId, channelNumber },
        source: 'remote',
      })
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kinora:tune_channel', { detail: payload }))
      }
      break
    }

    case 'input_text': {
      if (typeof document !== 'undefined') {
        const text = typeof payload.text === 'string' ? payload.text : ''
        const active = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
          active.value = text
          active.dispatchEvent(new Event('input', { bubbles: true }))
          active.dispatchEvent(new Event('change', { bubbles: true }))
        } else {
          // If no input is focused, open search with this query
          window.location.hash = `#/search?q=${encodeURIComponent(text)}`
        }
      }
      break
    }

    case 'keypad_digit':
    case 'digit': {
      const digit = payload.digit
      if (digit !== undefined && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kinora:numeric_zap', { detail: { digit } }))
        window.dispatchEvent(new KeyboardEvent('keydown', { key: String(digit), code: `Digit${digit}`, bubbles: true }))
      }
      break
    }

    case 'agent_search': {
      if (typeof window !== 'undefined') {
        const query = typeof payload.query === 'string' ? payload.query : ''
        window.location.hash = `#/search?q=${encodeURIComponent(query)}`
      }
      break
    }

    case 'agent_tune': {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kinora:tune_channel', { detail: payload }))
      }
      break
    }

    case 'agent_navigate': {
      if (typeof window !== 'undefined') {
        const dest = typeof payload.destination === 'string' ? payload.destination : '/'
        window.location.hash = dest.startsWith('#') ? dest : `#${dest}`
      }
      break
    }

    case 'cast_media': {
      const streamUrl = typeof payload.streamUrl === 'string' ? payload.streamUrl : ''
      const title = typeof payload.title === 'string' ? payload.title : 'Cast Media'
      const subtitle = typeof payload.subtitle === 'string' ? payload.subtitle : undefined
      const isLive = Boolean(payload.isLive)
      if (streamUrl) {
        dispatchKinoraCommand({
          type: 'playMedia',
          payload: {
            streamUrl,
            title,
            subtitle,
            isLive,
          },
          source: 'remote',
        })
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('kinora:cast_media', { detail: payload }))
      }
      break
    }

    default:
      console.warn('Unknown remote control command:', cmd)
      break
  }
}

/**
 * Registers a callback for incoming remote commands. Returns an unregister cleanup function.
 */
export function addRemoteCommandListener(handler: RemoteCommandHandler): () => void {
  customHandlers.add(handler)
  return () => {
    customHandlers.delete(handler)
  }
}

/**
 * Starts listening to native Tauri events for remote commands.
 */
export async function initializeRemoteControlBridge(): Promise<() => void> {
  if (unlistenRemoteCommand) {
    return unlistenRemoteCommand
  }

  if (isTauri()) {
    try {
      const { listen } = await import('@tauri-apps/api/event')
      const unlisten = await listen<RemoteCommandEvent>('kinora:remote_command', (event) => {
        handleIncomingRemoteCommand(event.payload)
      })
      unlistenRemoteCommand = unlisten
      return () => {
        unlisten()
        unlistenRemoteCommand = null
      }
    } catch (err) {
      console.error('Failed to register Tauri remote command listener:', err)
    }
  }

  return () => {
    unlistenRemoteCommand = null
  }
}

let lastBroadcastStateJson = ''
let broadcastTimeout: ReturnType<typeof setTimeout> | null = null

/**
 * Broadcasts the current player playback state to the remote server with light debouncing.
 */
export function broadcastRemotePlaybackState(state: RemotePlaybackState, immediate = false): void {
  const json = JSON.stringify(state)
  if (json === lastBroadcastStateJson && !immediate) {
    return
  }

  if (broadcastTimeout) {
    clearTimeout(broadcastTimeout)
    broadcastTimeout = null
  }

  if (immediate) {
    lastBroadcastStateJson = json
    void updateRemotePlaybackState(state)
    return
  }

  broadcastTimeout = setTimeout(() => {
    lastBroadcastStateJson = json
    void updateRemotePlaybackState(state)
    broadcastTimeout = null
  }, 250)
}
