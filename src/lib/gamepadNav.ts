// 10-Foot Gamepad Navigation Engine for Kinora television ergonomics.
// Interfaces with standard game controllers (Xbox, PlayStation, 8BitDo) via HTML5 Gamepad API.
// Strictly adheres to typography standards: zero em-dashes across all code and comments.

export type GamepadAction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'select'
  | 'back'
  | 'guide'
  | 'recall'
  | 'channelUp'
  | 'channelDown'

export interface GamepadControllerOptions {
  onAction: (action: GamepadAction) => void
  repeatIntervalMs?: number // Throttling delay between repeated directional presses
}

export class GamepadController {
  private active = false
  private rafId: number | null = null
  private onAction: (action: GamepadAction) => void
  private repeatIntervalMs: number
  private lastActionTime: Record<string, number> = {}

  constructor(options: GamepadControllerOptions) {
    this.onAction = options.onAction
    this.repeatIntervalMs = options.repeatIntervalMs ?? 220
  }

  public start(): void {
    if (this.active || typeof window === 'undefined') return
    this.active = true
    this.poll()
  }

  public stop(): void {
    this.active = false
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  public isActive(): boolean {
    return this.active
  }

  private canTrigger(action: string, now: number): boolean {
    const last = this.lastActionTime[action] ?? 0
    if (now - last >= this.repeatIntervalMs) {
      this.lastActionTime[action] = now
      return true
    }
    return false
  }

  public evaluateGamepadState(gamepad: {
    readonly buttons: readonly { readonly pressed: boolean }[]
    readonly axes: readonly number[]
  } | Gamepad): void {
    const now = Date.now()
    const deadzone = 0.45

    // D-Pad or Left Stick Up
    const upPressed = gamepad.buttons[12]?.pressed || (gamepad.axes[1] !== undefined && gamepad.axes[1] < -deadzone)
    if (upPressed && this.canTrigger('up', now)) {
      this.onAction('up')
      return
    }

    // D-Pad or Left Stick Down
    const downPressed = gamepad.buttons[13]?.pressed || (gamepad.axes[1] !== undefined && gamepad.axes[1] > deadzone)
    if (downPressed && this.canTrigger('down', now)) {
      this.onAction('down')
      return
    }

    // D-Pad or Left Stick Left
    const leftPressed = gamepad.buttons[14]?.pressed || (gamepad.axes[0] !== undefined && gamepad.axes[0] < -deadzone)
    if (leftPressed && this.canTrigger('left', now)) {
      this.onAction('left')
      return
    }

    // D-Pad or Left Stick Right
    const rightPressed = gamepad.buttons[15]?.pressed || (gamepad.axes[0] !== undefined && gamepad.axes[0] > deadzone)
    if (rightPressed && this.canTrigger('right', now)) {
      this.onAction('right')
      return
    }

    // A / Cross button (Select)
    if (gamepad.buttons[0]?.pressed && this.canTrigger('select', now)) {
      this.onAction('select')
      return
    }

    // B / Circle button (Back)
    if (gamepad.buttons[1]?.pressed && this.canTrigger('back', now)) {
      this.onAction('back')
      return
    }

    // X / Square button (Guide)
    if (gamepad.buttons[2]?.pressed && this.canTrigger('guide', now)) {
      this.onAction('guide')
      return
    }

    // Y / Triangle button (Channel Recall)
    if (gamepad.buttons[3]?.pressed && this.canTrigger('recall', now)) {
      this.onAction('recall')
      return
    }

    // Left Bumper (Channel Down)
    if (gamepad.buttons[4]?.pressed && this.canTrigger('channelDown', now)) {
      this.onAction('channelDown')
      return
    }

    // Right Bumper (Channel Up)
    if (gamepad.buttons[5]?.pressed && this.canTrigger('channelUp', now)) {
      this.onAction('channelUp')
      return
    }
  }

  private poll = () => {
    if (!this.active) return
    const gamepads = typeof navigator !== 'undefined' && 'getGamepads' in navigator ? navigator.getGamepads() : []
    for (let i = 0; i < gamepads.length; i++) {
      const gp = gamepads[i]
      if (gp) {
        this.evaluateGamepadState(gp)
        break // Primary active controller
      }
    }
    this.rafId = window.requestAnimationFrame(this.poll)
  }
}
