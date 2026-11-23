import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LiveReconnectController } from './reconnectController'

describe('LiveReconnectController', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('initializes with idle state', () => {
    const controller = new LiveReconnectController()
    expect(controller.getState()).toEqual({
      status: 'idle',
      attempt: 0,
      lastError: null,
      nextRetryInMs: null,
    })
  })

  it('marks state connected on playback success', () => {
    const controller = new LiveReconnectController()
    controller.onPlaybackSuccess()
    expect(controller.getState().status).toBe('connected')
    expect(controller.getState().attempt).toBe(0)
  })

  it('schedules reconnection with exponential backoff on failure', () => {
    const controller = new LiveReconnectController({
      maxAttempts: 3,
      baseDelayMs: 1000,
      backoffFactor: 2.0,
      maxDelayMs: 8000,
    })

    const onRetry = vi.fn()
    controller.handleFailure('Network connection dropped', onRetry)

    expect(controller.getState().status).toBe('reconnecting')
    expect(controller.getState().attempt).toBe(1)
    expect(controller.getState().lastError).toBe('Network connection dropped')
    expect(onRetry).not.toHaveBeenCalled()

    // Base delay for attempt 1 is 1000ms
    vi.advanceTimersByTime(1000)
    expect(onRetry).toHaveBeenCalledTimes(1)

    // Next failure
    controller.handleFailure('Upstream offline', onRetry)
    expect(controller.getState().attempt).toBe(2)
    // Attempt 2 backoff is 1000 * 2 = 2000ms
    vi.advanceTimersByTime(1999)
    expect(onRetry).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(onRetry).toHaveBeenCalledTimes(2)
  })

  it('transitions to failed state after exceeding max attempts', () => {
    const controller = new LiveReconnectController({ maxAttempts: 2, baseDelayMs: 500 })
    const onRetry = vi.fn()

    controller.handleFailure('Err 1', onRetry)
    vi.advanceTimersByTime(500)
    expect(onRetry).toHaveBeenCalledTimes(1)

    controller.handleFailure('Err 2', onRetry)
    vi.advanceTimersByTime(1000)
    expect(onRetry).toHaveBeenCalledTimes(2)

    // Third failure exceeds maxAttempts of 2
    controller.handleFailure('Err 3', onRetry)
    expect(controller.getState().status).toBe('failed')
    expect(controller.getState().attempt).toBe(3)

    vi.advanceTimersByTime(10000)
    expect(onRetry).toHaveBeenCalledTimes(2) // No further retries
  })

  it('triggers reconnection on stall timeout if not cleared', () => {
    const controller = new LiveReconnectController({
      stallTimeoutMs: 5000,
      baseDelayMs: 500,
    })
    const onRetry = vi.fn()

    controller.onStall(onRetry)
    expect(controller.getState().status).toBe('idle')

    // Advance 4999ms: stall not yet triggered
    vi.advanceTimersByTime(4999)
    expect(controller.getState().status).toBe('idle')

    // Advance 1ms: stall timeout fires, transitions to reconnecting
    vi.advanceTimersByTime(1)
    expect(controller.getState().status).toBe('reconnecting')
    expect(controller.getState().lastError).toContain('Stream stalled')

    // Advance retry delay (500ms)
    vi.advanceTimersByTime(500)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('clears stall watchdog when clearStall is called before timeout', () => {
    const controller = new LiveReconnectController({ stallTimeoutMs: 5000 })
    const onRetry = vi.fn()

    controller.onStall(onRetry)
    vi.advanceTimersByTime(3000)
    controller.clearStall()

    vi.advanceTimersByTime(5000)
    expect(controller.getState().status).toBe('idle')
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('cancels all timers and resets state on cancel()', () => {
    const controller = new LiveReconnectController({ baseDelayMs: 2000 })
    const onRetry = vi.fn()

    controller.handleFailure('Err', onRetry)
    expect(controller.getState().status).toBe('reconnecting')

    controller.cancel()
    expect(controller.getState().status).toBe('idle')
    expect(controller.getState().attempt).toBe(0)

    vi.advanceTimersByTime(5000)
    expect(onRetry).not.toHaveBeenCalled()
  })
})
