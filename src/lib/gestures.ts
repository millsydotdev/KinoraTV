// gestures.ts - Video player edge gestures and frame stepping controller.
// Supports left-edge brightness swipe, right-edge volume swipe, center scrub swipe,
// and frame-by-frame precision stepping (default 25fps / 0.04s).
// Strictly adheres to typography standards: zero em-dashes across all code and comments.

export type GestureZone = 'left' | 'right' | 'center'

export interface GestureState {
  active: boolean
  zone: GestureZone
  type: 'brightness' | 'volume' | 'seek'
  value: number
  percent: number
  text: string
}

export interface FrameStepResult {
  newTime: number
  frameDelta: number
  text: string
}

const GESTURE_ACTIVATION_THRESHOLD_PX = 8
const DEFAULT_FPS = 25

/**
 * Calculates precision frame stepping forward or backward.
 * Clamps result cleanly between 0 and duration.
 */
export function computeFrameStep(
  currentTime: number,
  duration: number,
  direction: 1 | -1,
  fps: number = DEFAULT_FPS
): FrameStepResult {
  const frameDuration = 1 / (fps > 0 ? fps : DEFAULT_FPS)
  const target = currentTime + direction * frameDuration
  const maxBound = duration > 0 ? duration : Number.MAX_SAFE_INTEGER
  const clamped = Math.max(0, Math.min(maxBound, target))
  const rounded = Math.round(clamped * 1000) / 1000

  return {
    newTime: rounded,
    frameDelta: direction,
    text: direction > 0 ? '+1 Frame' : '-1 Frame',
  }
}

/**
 * Identifies the interaction zone based on horizontal pointer ratio:
 * Left 20%: Brightness
 * Right 20%: Volume
 * Center 60%: Scrub / Seek
 */
export function resolveGestureZone(
  pointerX: number,
  containerWidth: number,
  edgeThresholdFraction: number = 0.2
): GestureZone {
  if (containerWidth <= 0) return 'center'
  const ratio = Math.max(0, Math.min(1, pointerX / containerWidth))
  if (ratio <= edgeThresholdFraction) return 'left'
  if (ratio >= 1 - edgeThresholdFraction) return 'right'
  return 'center'
}

/**
 * Computes updated volume level from vertical pointer drag.
 * Dragging upward increases volume; dragging downward decreases volume.
 */
export function computeGestureVolume(
  startVolume: number,
  deltaY: number,
  containerHeight: number
): { volume: number; percent: number; text: string } {
  if (containerHeight <= 0) {
    const clamped = Math.max(0, Math.min(1, startVolume))
    return { volume: clamped, percent: Math.round(clamped * 100), text: `${Math.round(clamped * 100)}%` }
  }
  // Upward drag is negative deltaY, so minus deltaY increases value
  const fractionChange = -deltaY / (containerHeight * 0.75)
  const target = Math.max(0, Math.min(1, startVolume + fractionChange))
  const percent = Math.round(target * 100)
  return {
    volume: Math.round(target * 100) / 100,
    percent,
    text: `${percent}%`,
  }
}

/**
 * Computes updated brightness multiplier from vertical pointer drag.
 * Range: 0.3 (30% dim) to 1.7 (170% bright), default 1.0.
 */
export function computeGestureBrightness(
  startBrightness: number,
  deltaY: number,
  containerHeight: number
): { brightness: number; percent: number; text: string } {
  const MIN_BRIGHTNESS = 0.3
  const MAX_BRIGHTNESS = 1.7
  if (containerHeight <= 0) {
    const clamped = Math.max(MIN_BRIGHTNESS, Math.min(MAX_BRIGHTNESS, startBrightness))
    const percent = Math.round(clamped * 100)
    return { brightness: clamped, percent, text: `${percent}%` }
  }
  const fractionChange = -deltaY / (containerHeight * 0.75)
  const target = Math.max(MIN_BRIGHTNESS, Math.min(MAX_BRIGHTNESS, startBrightness + fractionChange))
  const percent = Math.round(target * 100)
  return {
    brightness: Math.round(target * 100) / 100,
    percent,
    text: `${percent}%`,
  }
}

/**
 * Computes scrub seek offset from horizontal pointer drag in the center zone.
 * Default max scrub delta is 90 seconds across full width.
 */
export function computeGestureSeek(
  startTime: number,
  deltaX: number,
  containerWidth: number,
  maxScrubWindowSec = 90
): { targetTime: number; deltaSeconds: number; text: string } {
  if (containerWidth <= 0) {
    return { targetTime: Math.max(0, startTime), deltaSeconds: 0, text: '+0s' }
  }
  const fraction = deltaX / (containerWidth * 0.6)
  const deltaSeconds = Math.round(fraction * maxScrubWindowSec)
  const targetTime = Math.max(0, startTime + deltaSeconds)
  const sign = deltaSeconds > 0 ? `+${deltaSeconds}s` : `${deltaSeconds}s`

  return {
    targetTime,
    deltaSeconds,
    text: sign,
  }
}

export interface PointerCoord {
  clientX: number
  clientY: number
}

/**
 * Pointer gesture coordinator managing drag lifecycle and thresholds.
 */
export class PlayerGestureManager {
  private startX = 0
  private startY = 0
  private zone: GestureZone = 'center'
  private startVolume = 1.0
  private startBrightness = 1.0
  private startTime = 0
  private isEngaged = false

  public onPointerDown(
    coord: PointerCoord,
    rect: { left: number; top: number; width: number; height: number },
    currentVolume: number,
    currentBrightness: number,
    currentTime: number
  ): void {
    const relativeX = coord.clientX - rect.left
    this.startX = coord.clientX
    this.startY = coord.clientY
    this.zone = resolveGestureZone(relativeX, rect.width)
    this.startVolume = currentVolume
    this.startBrightness = currentBrightness
    this.startTime = currentTime
    this.isEngaged = false
  }

  public onPointerMove(
    coord: PointerCoord,
    rect: { width: number; height: number }
  ): GestureState | null {
    const deltaX = coord.clientX - this.startX
    const deltaY = coord.clientY - this.startY
    const distance = Math.hypot(deltaX, deltaY)

    if (!this.isEngaged) {
      if (distance < GESTURE_ACTIVATION_THRESHOLD_PX) {
        return null
      }
      this.isEngaged = true
    }

    if (this.zone === 'left') {
      const { brightness, percent, text } = computeGestureBrightness(this.startBrightness, deltaY, rect.height)
      return {
        active: true,
        zone: 'left',
        type: 'brightness',
        value: brightness,
        percent,
        text,
      }
    }

    if (this.zone === 'right') {
      const { volume, percent, text } = computeGestureVolume(this.startVolume, deltaY, rect.height)
      return {
        active: true,
        zone: 'right',
        type: 'volume',
        value: volume,
        percent,
        text,
      }
    }

    const { targetTime, text } = computeGestureSeek(this.startTime, deltaX, rect.width)
    return {
      active: true,
      zone: 'center',
      type: 'seek',
      value: targetTime,
      percent: Math.min(100, Math.max(0, Math.round(targetTime))),
      text,
    }
  }

  public onPointerUp(): { wasGesture: boolean; finalZone: GestureZone } {
    const wasGesture = this.isEngaged
    const finalZone = this.zone
    this.isEngaged = false
    return { wasGesture, finalZone }
  }
}
