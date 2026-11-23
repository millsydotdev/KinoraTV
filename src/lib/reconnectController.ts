/**
 * Live stream auto-reconnect controller with exponential backoff and stall detection.
 * Manages retry cycles and stall watchdogs for IPTV live streams.
 */

export interface ReconnectConfig {
  maxAttempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  backoffFactor?: number
  stallTimeoutMs?: number
}

export type ReconnectStatus = 'idle' | 'connected' | 'reconnecting' | 'failed'

export interface ReconnectState {
  status: ReconnectStatus
  attempt: number
  lastError: string | null
  nextRetryInMs: number | null
}

export class LiveReconnectController {
  private maxAttempts: number
  private baseDelayMs: number
  private maxDelayMs: number
  private backoffFactor: number
  private stallTimeoutMs: number

  private status: ReconnectStatus = 'idle'
  private attempt = 0
  private lastError: string | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private stallTimer: ReturnType<typeof setTimeout> | null = null
  private listeners: Set<(state: ReconnectState) => void> = new Set()

  constructor(config: ReconnectConfig = {}) {
    this.maxAttempts = config.maxAttempts ?? 5
    this.baseDelayMs = config.baseDelayMs ?? 1000
    this.maxDelayMs = config.maxDelayMs ?? 16000
    this.backoffFactor = config.backoffFactor ?? 1.5
    this.stallTimeoutMs = config.stallTimeoutMs ?? 10000
  }

  public getState(): ReconnectState {
    return {
      status: this.status,
      attempt: this.attempt,
      lastError: this.lastError,
      nextRetryInMs: this.retryTimer ? this.computeDelay(this.attempt) : null,
    }
  }

  public subscribe(listener: (state: ReconnectState) => void): () => void {
    this.listeners.add(listener)
    listener(this.getState())
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify() {
    const s = this.getState()
    for (const l of this.listeners) {
      l(s)
    }
  }

  public computeDelay(attempt: number): number {
    const factor = Math.pow(this.backoffFactor, Math.max(0, attempt - 1))
    const raw = this.baseDelayMs * factor
    return Math.min(this.maxDelayMs, Math.round(raw))
  }

  /**
   * Called when video successfully plays or advances time.
   */
  public onPlaybackSuccess() {
    this.clearTimers()
    this.attempt = 0
    this.lastError = null
    this.status = 'connected'
    this.notify()
  }

  /**
   * Starts a stall watchdog when video is waiting or buffering.
   */
  public onStall(onTriggerReconnect: () => void) {
    if (this.stallTimer || this.status === 'reconnecting' || this.status === 'failed') {
      return
    }
    this.stallTimer = setTimeout(() => {
      this.stallTimer = null
      this.handleFailure('Stream stalled: buffer underrun or frozen video frame', onTriggerReconnect)
    }, this.stallTimeoutMs)
  }

  /**
   * Clears any active stall watchdog (e.g. on playing or timeupdate).
   */
  public clearStall() {
    if (this.stallTimer) {
      clearTimeout(this.stallTimer)
      this.stallTimer = null
    }
  }

  /**
   * Handles a fatal network error or stall timeout.
   */
  public handleFailure(errorMessage: string, onTriggerReconnect: () => void) {
    this.clearStall()
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }

    this.attempt += 1
    this.lastError = errorMessage

    if (this.attempt > this.maxAttempts) {
      this.status = 'failed'
      this.notify()
      return
    }

    this.status = 'reconnecting'
    const delay = this.computeDelay(this.attempt)
    this.notify()

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      onTriggerReconnect()
    }, delay)
  }

  /**
   * Resets and cancels all active timers and reconnection attempts.
   */
  public cancel() {
    this.clearTimers()
    this.status = 'idle'
    this.attempt = 0
    this.lastError = null
    this.notify()
  }

  private clearTimers() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    if (this.stallTimer) {
      clearTimeout(this.stallTimer)
      this.stallTimer = null
    }
  }
}
