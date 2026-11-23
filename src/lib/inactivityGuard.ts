/**
 * Inactivity guard for TV and leanback binge sessions.
 * Monitors user interaction and triggers a grace-period prompt before pausing playback.
 */

export interface InactivityGuardConfig {
  inactivityThresholdMs?: number
  promptGracePeriodMs?: number
  onPrompt?: () => void
  onTimeout?: () => void
}

export type InactivityState = 'idle' | 'watching' | 'prompting' | 'timed_out'

export class InactivityGuard {
  private inactivityThresholdMs: number
  private promptGracePeriodMs: number
  private onPromptCallback?: () => void
  private onTimeoutCallback?: () => void

  private state: InactivityState = 'idle'
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null
  private countdownTimer: ReturnType<typeof setInterval> | null = null
  private remainingCountdownSecs = 0
  private listeners: Set<(state: InactivityState, countdownSecs: number) => void> = new Set()

  constructor(config: InactivityGuardConfig = {}) {
    // Default 3 hours of inactivity before prompt (10800000 ms)
    this.inactivityThresholdMs = config.inactivityThresholdMs ?? 3 * 60 * 60 * 1000
    // Default 60 seconds grace period before pausing
    this.promptGracePeriodMs = config.promptGracePeriodMs ?? 60 * 1000
    this.onPromptCallback = config.onPrompt
    this.onTimeoutCallback = config.onTimeout
  }

  public subscribe(listener: (state: InactivityState, countdownSecs: number) => void): () => void {
    this.listeners.add(listener)
    listener(this.state, this.remainingCountdownSecs)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.state, this.remainingCountdownSecs)
    }
  }

  public start() {
    this.resetInactivityTimer()
    this.state = 'watching'
    this.remainingCountdownSecs = Math.ceil(this.promptGracePeriodMs / 1000)
    this.notify()
  }

  public recordActivity() {
    if (this.state === 'prompting') {
      this.confirmStillWatching()
      return
    }
    if (this.state === 'watching') {
      this.resetInactivityTimer()
    }
  }

  public confirmStillWatching() {
    this.clearAllTimers()
    this.state = 'watching'
    this.remainingCountdownSecs = Math.ceil(this.promptGracePeriodMs / 1000)
    this.resetInactivityTimer()
    this.notify()
  }

  public stop() {
    this.clearAllTimers()
    this.state = 'idle'
    this.remainingCountdownSecs = 0
    this.notify()
  }

  public getState(): { state: InactivityState; countdownSecs: number } {
    return {
      state: this.state,
      countdownSecs: this.remainingCountdownSecs,
    }
  }

  private resetInactivityTimer() {
    this.clearAllTimers()
    this.inactivityTimer = setTimeout(() => {
      this.inactivityTimer = null
      this.triggerPrompt()
    }, this.inactivityThresholdMs)
  }

  private triggerPrompt() {
    this.state = 'prompting'
    this.remainingCountdownSecs = Math.ceil(this.promptGracePeriodMs / 1000)
    this.notify()
    if (this.onPromptCallback) {
      this.onPromptCallback()
    }

    this.countdownTimer = setInterval(() => {
      this.remainingCountdownSecs -= 1
      if (this.remainingCountdownSecs <= 0) {
        this.clearAllTimers()
        this.state = 'timed_out'
        this.remainingCountdownSecs = 0
        this.notify()
        if (this.onTimeoutCallback) {
          this.onTimeoutCallback()
        }
      } else {
        this.notify()
      }
    }, 1000)
  }

  private clearAllTimers() {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer)
      this.inactivityTimer = null
    }
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer)
      this.countdownTimer = null
    }
  }
}
