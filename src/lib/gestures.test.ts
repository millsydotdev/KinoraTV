// gestures.test.ts - Test suite for frame stepping and edge swipe gesture calculations.
// Strictly adheres to typography standards: zero em-dashes across all code and comments.

import { describe, expect, it } from 'vitest'
import {
  computeFrameStep,
  resolveGestureZone,
  computeGestureVolume,
  computeGestureBrightness,
  computeGestureSeek,
  PlayerGestureManager,
} from './gestures'

describe('Frame stepping calculation', () => {
  it('advances forward by one frame at 25 fps', () => {
    const res = computeFrameStep(10.0, 100.0, 1, 25)
    expect(res.newTime).toBe(10.04)
    expect(res.frameDelta).toBe(1)
    expect(res.text).toBe('+1 Frame')
  })

  it('steps backward by one frame at 25 fps', () => {
    const res = computeFrameStep(10.0, 100.0, -1, 25)
    expect(res.newTime).toBe(9.96)
    expect(res.frameDelta).toBe(-1)
    expect(res.text).toBe('-1 Frame')
  })

  it('clamps at zero when stepping backward at start', () => {
    const res = computeFrameStep(0.02, 100.0, -1, 25)
    expect(res.newTime).toBe(0)
  })

  it('clamps at duration when stepping forward at end', () => {
    const res = computeFrameStep(99.98, 100.0, 1, 25)
    expect(res.newTime).toBe(100.0)
  })

  it('supports custom framerates such as 50 fps', () => {
    const res = computeFrameStep(5.0, 100.0, 1, 50)
    expect(res.newTime).toBe(5.02)
  })
})

describe('Gesture zone resolution', () => {
  it('identifies left edge for brightness', () => {
    expect(resolveGestureZone(50, 1000)).toBe('left')
    expect(resolveGestureZone(190, 1000)).toBe('left')
  })

  it('identifies right edge for volume', () => {
    expect(resolveGestureZone(850, 1000)).toBe('right')
    expect(resolveGestureZone(980, 1000)).toBe('right')
  })

  it('identifies center region for seek', () => {
    expect(resolveGestureZone(300, 1000)).toBe('center')
    expect(resolveGestureZone(500, 1000)).toBe('center')
    expect(resolveGestureZone(700, 1000)).toBe('center')
  })
})

describe('Volume swipe computation', () => {
  it('increases volume on upward drag', () => {
    const res = computeGestureVolume(0.5, -150, 600)
    expect(res.volume).toBeGreaterThan(0.5)
    expect(res.percent).toBeGreaterThan(50)
    expect(res.text).toContain('%')
  })

  it('decreases volume on downward drag', () => {
    const res = computeGestureVolume(0.5, 150, 600)
    expect(res.volume).toBeLessThan(0.5)
    expect(res.percent).toBeLessThan(50)
  })

  it('clamps volume cleanly between 0% and 100%', () => {
    const maxRes = computeGestureVolume(0.9, -1000, 600)
    expect(maxRes.volume).toBe(1.0)
    expect(maxRes.percent).toBe(100)

    const minRes = computeGestureVolume(0.1, 1000, 600)
    expect(minRes.volume).toBe(0.0)
    expect(minRes.percent).toBe(0)
  })
})

describe('Brightness swipe computation', () => {
  it('increases brightness on upward drag', () => {
    const res = computeGestureBrightness(1.0, -150, 600)
    expect(res.brightness).toBeGreaterThan(1.0)
    expect(res.percent).toBeGreaterThan(100)
  })

  it('decreases brightness on downward drag', () => {
    const res = computeGestureBrightness(1.0, 150, 600)
    expect(res.brightness).toBeLessThan(1.0)
    expect(res.percent).toBeLessThan(100)
  })

  it('clamps brightness within safe bounds [0.3, 1.7]', () => {
    const dimRes = computeGestureBrightness(0.5, 2000, 600)
    expect(dimRes.brightness).toBe(0.3)

    const brightRes = computeGestureBrightness(1.5, -2000, 600)
    expect(brightRes.brightness).toBe(1.7)
  })
})

describe('Scrub seek swipe computation', () => {
  it('computes forward seek on rightward drag', () => {
    const res = computeGestureSeek(120, 200, 1000)
    expect(res.targetTime).toBeGreaterThan(120)
    expect(res.deltaSeconds).toBeGreaterThan(0)
    expect(res.text).toMatch(/^\+\d+s$/)
  })

  it('computes backward seek on leftward drag', () => {
    const res = computeGestureSeek(120, -200, 1000)
    expect(res.targetTime).toBeLessThan(120)
    expect(res.deltaSeconds).toBeLessThan(0)
    expect(res.text).toMatch(/^-\d+s$/)
  })
})

describe('PlayerGestureManager lifecycle', () => {
  it('does not activate gesture before movement exceeds threshold', () => {
    const manager = new PlayerGestureManager()
    manager.onPointerDown(
      { clientX: 50, clientY: 300 },
      { left: 0, top: 0, width: 1000, height: 600 },
      0.8,
      1.0,
      45
    )

    // Minor jitter less than 8px
    const state = manager.onPointerMove({ clientX: 52, clientY: 303 }, { width: 1000, height: 600 })
    expect(state).toBeNull()

    const { wasGesture } = manager.onPointerUp()
    expect(wasGesture).toBe(false)
  })

  it('activates brightness gesture on left edge vertical drag', () => {
    const manager = new PlayerGestureManager()
    manager.onPointerDown(
      { clientX: 50, clientY: 300 },
      { left: 0, top: 0, width: 1000, height: 600 },
      0.8,
      1.0,
      45
    )

    // Drag upward by 80px (well past 8px threshold)
    const state = manager.onPointerMove({ clientX: 50, clientY: 220 }, { width: 1000, height: 600 })
    expect(state).not.toBeNull()
    expect(state?.type).toBe('brightness')
    expect(state?.zone).toBe('left')
    expect(state?.value).toBeGreaterThan(1.0)

    const { wasGesture, finalZone } = manager.onPointerUp()
    expect(wasGesture).toBe(true)
    expect(finalZone).toBe('left')
  })

  it('activates volume gesture on right edge vertical drag', () => {
    const manager = new PlayerGestureManager()
    manager.onPointerDown(
      { clientX: 950, clientY: 300 },
      { left: 0, top: 0, width: 1000, height: 600 },
      0.5,
      1.0,
      45
    )

    const state = manager.onPointerMove({ clientX: 950, clientY: 200 }, { width: 1000, height: 600 })
    expect(state).not.toBeNull()
    expect(state?.type).toBe('volume')
    expect(state?.zone).toBe('right')
    expect(state?.value).toBeGreaterThan(0.5)

    const { wasGesture, finalZone } = manager.onPointerUp()
    expect(wasGesture).toBe(true)
    expect(finalZone).toBe('right')
  })
})
