import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { InactivityGuard } from './inactivityGuard'

describe('InactivityGuard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts in idle state and transitions to watching on start()', () => {
    const guard = new InactivityGuard({ inactivityThresholdMs: 5000 })
    expect(guard.getState().state).toBe('idle')

    guard.start()
    expect(guard.getState().state).toBe('watching')
  })

  it('triggers prompt after inactivity threshold', () => {
    const onPrompt = vi.fn()
    const guard = new InactivityGuard({
      inactivityThresholdMs: 5000,
      promptGracePeriodMs: 10000,
      onPrompt,
    })

    guard.start()
    vi.advanceTimersByTime(4999)
    expect(guard.getState().state).toBe('watching')
    expect(onPrompt).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(guard.getState().state).toBe('prompting')
    expect(guard.getState().countdownSecs).toBe(10)
    expect(onPrompt).toHaveBeenCalledTimes(1)
  })

  it('counts down grace period and times out if no activity', () => {
    const onTimeout = vi.fn()
    const guard = new InactivityGuard({
      inactivityThresholdMs: 2000,
      promptGracePeriodMs: 3000,
      onTimeout,
    })

    guard.start()
    vi.advanceTimersByTime(2000)
    expect(guard.getState().state).toBe('prompting')

    // First second of grace period
    vi.advanceTimersByTime(1000)
    expect(guard.getState().countdownSecs).toBe(2)

    // Second second
    vi.advanceTimersByTime(1000)
    expect(guard.getState().countdownSecs).toBe(1)

    // Final second: expires
    vi.advanceTimersByTime(1000)
    expect(guard.getState().state).toBe('timed_out')
    expect(onTimeout).toHaveBeenCalledTimes(1)
  })

  it('resets inactivity timer on recordActivity() during watching', () => {
    const onPrompt = vi.fn()
    const guard = new InactivityGuard({
      inactivityThresholdMs: 3000,
      onPrompt,
    })

    guard.start()
    vi.advanceTimersByTime(2000)
    guard.recordActivity()

    // 2 more seconds pass (total 4s), but was reset at 2s, so 2s of 3s elapsed
    vi.advanceTimersByTime(2000)
    expect(guard.getState().state).toBe('watching')
    expect(onPrompt).not.toHaveBeenCalled()

    // 1 more second reaches 3s since last activity
    vi.advanceTimersByTime(1000)
    expect(guard.getState().state).toBe('prompting')
  })

  it('confirms still watching during prompt and resets to watching', () => {
    const onPrompt = vi.fn()
    const onTimeout = vi.fn()
    const guard = new InactivityGuard({
      inactivityThresholdMs: 2000,
      promptGracePeriodMs: 5000,
      onPrompt,
      onTimeout,
    })

    guard.start()
    vi.advanceTimersByTime(2000)
    expect(guard.getState().state).toBe('prompting')

    guard.confirmStillWatching()
    expect(guard.getState().state).toBe('watching')

    // Advance 4000ms: prompt does not time out because it was reset
    vi.advanceTimersByTime(4000)
    expect(onTimeout).not.toHaveBeenCalled()
  })

  it('stops cleanly and clears all timers', () => {
    const onTimeout = vi.fn()
    const guard = new InactivityGuard({
      inactivityThresholdMs: 1000,
      promptGracePeriodMs: 2000,
      onTimeout,
    })

    guard.start()
    vi.advanceTimersByTime(1000)
    expect(guard.getState().state).toBe('prompting')

    guard.stop()
    expect(guard.getState().state).toBe('idle')

    vi.advanceTimersByTime(5000)
    expect(onTimeout).not.toHaveBeenCalled()
  })
})
