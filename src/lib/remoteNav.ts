// Reusable universal spatial navigation and remote control manager for Kinora 0.6.0.
// Supports keyboard directional controls, television remotes, and game controllers.
// Strictly adheres to project typography standards: zero em-dashes across all code and comments.

import {
  kinoraChangeChannel,
  kinoraNavigate,
  kinoraTogglePlayback,
} from './commands'

export type NavDirection = 'up' | 'down' | 'left' | 'right'

export interface RemoteNavOptions {
  enabled?: boolean
  debug?: boolean
  onNavigateBack?: () => void
  onNavigateHome?: () => void
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"]):not([disabled])',
  '[role="button"]:not([disabled])',
  '[role="tab"]:not([disabled])',
  '[role="radio"]:not([disabled])',
  '[role="menuitem"]:not([disabled])',
  '.card[role="button"]:not([disabled])',
  '.tile:not([disabled])',
  '.rail-card:not([disabled])',
  '.btn:not([disabled])',
  '.chip:not([disabled])',
  '[data-nav-item="true"]:not([disabled])',
].join(', ')

// Memory storage for restoring focus when navigating between routes
const routeFocusMemory = new Map<string, string>()

/** Determines whether the user is currently editing text or in an input field. */
export function isTypingActive(): boolean {
  if (typeof document === 'undefined') return false
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT') {
    const inputType = (el as HTMLInputElement).type?.toLowerCase()
    // Range and checkbox controls can still accept remote navigation
    return !['checkbox', 'radio', 'range', 'button', 'submit'].includes(inputType)
  }
  return (
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable ||
    Boolean(el.closest('[contenteditable="true"]'))
  )
}

/** Finds the active containment boundary (e.g. open modal dialog, popover, or main window). */
export function getActiveContainer(): HTMLElement {
  if (typeof document === 'undefined') return {} as HTMLElement
  const openModal = document.querySelector(
    'dialog[open], [role="dialog"][aria-modal="true"], .modal-backdrop, .ds-command-backdrop'
  ) as HTMLElement | null

  if (openModal) {
    return openModal
  }

  const main = document.getElementById('main')
  return main || document.body
}

/** Collects all currently visible, focusable elements within the active container. */
export function getFocusableCandidates(container: HTMLElement = getActiveContainer()): HTMLElement[] {
  if (!container || typeof container.querySelectorAll !== 'function') return []
  const elements = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))

  return elements.filter((el) => {
    // Exclude hidden or zero-size elements
    if (el.getAttribute('aria-hidden') === 'true') return false
    if (el.style.display === 'none' || el.style.visibility === 'hidden') return false
    const rect = el.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  })
}

/**
 * Calculates a directional score between two bounding boxes.
 * Lower scores represent closer and better-aligned spatial targets.
 */
export function calculateSpatialScore(
  fromRect: DOMRect,
  toRect: DOMRect,
  direction: NavDirection
): number | null {
  const fromCenter = {
    x: fromRect.left + fromRect.width / 2,
    y: fromRect.top + fromRect.height / 2,
  }
  const toCenter = {
    x: toRect.left + toRect.width / 2,
    y: toRect.top + toRect.height / 2,
  }

  let primaryDist = 0
  let orthogonalDist = 0
  let isAligned = false

  switch (direction) {
    case 'right':
      if (toRect.left < fromRect.right - 6) return null // Must be to the right
      primaryDist = toRect.left - fromRect.right
      orthogonalDist = Math.abs(toCenter.y - fromCenter.y)
      isAligned = Math.max(fromRect.top, toRect.top) < Math.min(fromRect.bottom, toRect.bottom)
      break

    case 'left':
      if (toRect.right > fromRect.left + 6) return null // Must be to the left
      primaryDist = fromRect.left - toRect.right
      orthogonalDist = Math.abs(toCenter.y - fromCenter.y)
      isAligned = Math.max(fromRect.top, toRect.top) < Math.min(fromRect.bottom, toRect.bottom)
      break

    case 'down':
      if (toRect.top < fromRect.bottom - 6) return null // Must be below
      primaryDist = toRect.top - fromRect.bottom
      orthogonalDist = Math.abs(toCenter.x - fromCenter.x)
      isAligned = Math.max(fromRect.left, toRect.left) < Math.min(fromRect.right, toRect.right)
      break

    case 'up':
      if (toRect.bottom > fromRect.top + 6) return null // Must be above
      primaryDist = fromRect.top - toRect.bottom
      orthogonalDist = Math.abs(toCenter.x - fromCenter.x)
      isAligned = Math.max(fromRect.left, toRect.left) < Math.min(fromRect.right, toRect.right)
      break
  }

  // Orthogonal distance penalty: prefer items directly aligned with movement axis
  const alignmentBonus = isAligned ? 0.6 : 2.2
  return Math.max(0, primaryDist) + orthogonalDist * alignmentBonus
}

/** Navigates spatially from the currently focused element in the given direction. */
export function navigateSpatial(direction: NavDirection): boolean {
  if (isTypingActive()) return false

  const container = getActiveContainer()
  const candidates = getFocusableCandidates(container)
  if (candidates.length === 0) return false

  const current = document.activeElement as HTMLElement | null

  // If no element or an out-of-scope element is focused, pick the first sensible default
  if (!current || !container.contains(current) || current === document.body) {
    const defaultItem =
      container.querySelector<HTMLElement>('[data-nav-default="true"]') ||
      candidates[0]
    if (defaultItem) {
      focusAndReveal(defaultItem)
      return true
    }
    return false
  }

  const fromRect = current.getBoundingClientRect()
  let bestCandidate: HTMLElement | null = null
  let bestScore = Infinity

  for (const candidate of candidates) {
    if (candidate === current) continue
    const toRect = candidate.getBoundingClientRect()
    const score = calculateSpatialScore(fromRect, toRect, direction)

    if (score !== null && score < bestScore) {
      bestScore = score
      bestCandidate = candidate
    }
  }

  if (bestCandidate) {
    focusAndReveal(bestCandidate)
    return true
  }

  return false
}

/** Sets focus on an element and ensures it is scrolled smoothly into view. */
export function focusAndReveal(element: HTMLElement) {
  if (!element || typeof element.focus !== 'function') return
  element.focus()

  try {
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    })
  } catch {
    // Fallback for test environments without layout engine
  }
}

/** Remembers the focused element for the current pathname. */
export function saveRouteFocus(pathname: string) {
  if (typeof document === 'undefined') return
  const active = document.activeElement as HTMLElement | null
  if (!active || active === document.body) return

  // Build a unique selector or identifier if possible
  const id = active.id ? `#${active.id}` : null
  const role = active.getAttribute('role')
  const navTag = active.getAttribute('data-nav-id')
  const selector = navTag
    ? `[data-nav-id="${navTag}"]`
    : id || (role ? `[role="${role}"]` : null)

  if (selector) {
    routeFocusMemory.set(pathname, selector)
  }
}

/** Restores previous focus when returning to a pathname. */
export function restoreRouteFocus(pathname: string): boolean {
  if (typeof document === 'undefined') return false
  const selector = routeFocusMemory.get(pathname)
  if (selector) {
    const target = document.querySelector<HTMLElement>(selector)
    if (target && target.offsetParent !== null) {
      focusAndReveal(target)
      return true
    }
  }

  // Fallback to default focusable element on this screen
  const container = getActiveContainer()
  const defaultTarget =
    container.querySelector<HTMLElement>('[data-nav-default="true"]') ||
    container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)

  if (defaultTarget) {
    focusAndReveal(defaultTarget)
    return true
  }
  return false
}

// Gamepad API integration

interface GamepadState {
  lastActionTime: number
  activeButton: number | null
}

const gamepadState: GamepadState = {
  lastActionTime: 0,
  activeButton: null,
}

let gamepadRafId: number | null = null
let connectedGamepadCount = 0

function pollGamepad() {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return
  const gamepads = navigator.getGamepads()
  const now = Date.now()

  for (const gp of gamepads) {
    if (!gp) continue

    // Directional D-pad buttons: 12 (Up), 13 (Down), 14 (Left), 15 (Right)
    const axisY = gp.axes[1] ?? 0
    const axisX = gp.axes[0] ?? 0
    const btnUp = Boolean(gp.buttons[12]?.pressed || axisY < -0.55)
    const btnDown = Boolean(gp.buttons[13]?.pressed || axisY > 0.55)
    const btnLeft = Boolean(gp.buttons[14]?.pressed || axisX < -0.55)
    const btnRight = Boolean(gp.buttons[15]?.pressed || axisX > 0.55)

    // Action buttons: 0 (A/Cross), 1 (B/Circle), 2 (X/Square), 4 (LB), 5 (RB), 8 (Select), 9 (Start)
    const btnA = gp.buttons[0]?.pressed
    const btnB = gp.buttons[1]?.pressed
    const btnX = gp.buttons[2]?.pressed
    const btnLB = gp.buttons[4]?.pressed
    const btnRB = gp.buttons[5]?.pressed
    const btnHome = gp.buttons[8]?.pressed || gp.buttons[9]?.pressed

    const isPressed =
      btnUp || btnDown || btnLeft || btnRight || btnA || btnB || btnX || btnLB || btnRB || btnHome

    if (!isPressed) {
      gamepadState.activeButton = null
      continue
    }

    // Debounce and repeat handling: 260ms initial delay, 110ms repeat rate
    const repeatDelay = gamepadState.activeButton !== null ? 110 : 260
    if (now - gamepadState.lastActionTime < repeatDelay) continue

    gamepadState.lastActionTime = now
    gamepadState.activeButton = 1

    if (btnUp) navigateSpatial('up')
    else if (btnDown) navigateSpatial('down')
    else if (btnLeft) navigateSpatial('left')
    else if (btnRight) navigateSpatial('right')
    else if (btnA) {
      const active = document.activeElement as HTMLElement | null
      if (active && typeof active.click === 'function') active.click()
    } else if (btnB) {
      handleRemoteBack()
    } else if (btnX) {
      kinoraTogglePlayback()
    } else if (btnLB) {
      kinoraChangeChannel('down')
    } else if (btnRB) {
      kinoraChangeChannel('up')
    } else if (btnHome) {
      handleRemoteHome()
    }
  }

  if (connectedGamepadCount > 0) {
    gamepadRafId = requestAnimationFrame(pollGamepad)
  }
}

function handleRemoteBack() {
  // If an overlay or modal is open, dismiss it
  const openDialog = document.querySelector('dialog[open], .ds-command-backdrop, .modal-backdrop') as HTMLElement | null
  if (openDialog) {
    const closeBtn = openDialog.querySelector<HTMLElement>(
      'button[aria-label="Close"], button.close-btn, .dialog-close'
    )
    if (closeBtn) {
      closeBtn.click()
      return
    }
  }

  // Otherwise perform navigation back
  if (typeof window !== 'undefined') {
    const nav = (window as unknown as { __kinora_navigate?: (to: string | number) => void }).__kinora_navigate
    if (nav) {
      nav(-1)
    } else {
      window.history.back()
    }
  }
}

function handleRemoteHome() {
  kinoraNavigate('/')
}

/**
 * Initializes global remote navigation listeners for keyboard and gamepads.
 * Returns an unregister cleanup function.
 */
export function initGlobalRemoteNav(_options: RemoteNavOptions = {}): () => void {
  if (typeof window === 'undefined') return () => {}

  const onKeyDown = (e: KeyboardEvent) => {
    if (isTypingActive()) return

    // Directional keys
    if (e.key === 'ArrowUp') {
      if (navigateSpatial('up')) e.preventDefault()
    } else if (e.key === 'ArrowDown') {
      if (navigateSpatial('down')) e.preventDefault()
    } else if (e.key === 'ArrowLeft') {
      // In Live TV guide grid, horizontal keys may be handled by the grid itself
      const active = document.activeElement
      if (active?.closest('.guide-grid')) return
      if (navigateSpatial('left')) e.preventDefault()
    } else if (e.key === 'ArrowRight') {
      const active = document.activeElement
      if (active?.closest('.guide-grid')) return
      if (navigateSpatial('right')) e.preventDefault()
    } else if (e.key === 'Escape' || e.key === 'BrowserBack') {
      handleRemoteBack()
    } else if (e.key === 'Home' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      handleRemoteHome()
    } else if (e.key === 'MediaPlayPause' || e.key === 'Play' || e.key === 'Pause') {
      e.preventDefault()
      kinoraTogglePlayback()
    } else if (e.key === 'ChannelUp' || e.key === 'PageUp') {
      // If Live TV is active, change channel up
      if (window.location.pathname.startsWith('/live') || document.querySelector('.pip-dock-container')) {
        e.preventDefault()
        kinoraChangeChannel('up')
      }
    } else if (e.key === 'ChannelDown' || e.key === 'PageDown') {
      // If Live TV is active, change channel down
      if (window.location.pathname.startsWith('/live') || document.querySelector('.pip-dock-container')) {
        e.preventDefault()
        kinoraChangeChannel('down')
      }
    }
  }

  const onGamepadConnected = () => {
    connectedGamepadCount += 1
    if (connectedGamepadCount === 1 && gamepadRafId === null) {
      gamepadRafId = requestAnimationFrame(pollGamepad)
    }
  }

  const onGamepadDisconnected = () => {
    connectedGamepadCount = Math.max(0, connectedGamepadCount - 1)
    if (connectedGamepadCount === 0 && gamepadRafId !== null) {
      cancelAnimationFrame(gamepadRafId)
      gamepadRafId = null
    }
  }

  window.addEventListener('keydown', onKeyDown, { capture: false })
  window.addEventListener('gamepadconnected', onGamepadConnected)
  window.addEventListener('gamepaddisconnected', onGamepadDisconnected)

  return () => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('gamepadconnected', onGamepadConnected)
    window.removeEventListener('gamepaddisconnected', onGamepadDisconnected)
    if (gamepadRafId !== null) {
      cancelAnimationFrame(gamepadRafId)
      gamepadRafId = null
    }
  }
}
