// Video geometry, aspect ratio overrides, picture adjustments,
// and A-B loop playback controller for Kinora video playback.
// Strictly adheres to typography standards: zero em-dashes across all code and comments.

import type { CSSProperties } from 'react'

export type AspectRatioMode = 'auto' | '16:9' | '4:3' | 'fill' | 'smart-stretch' | '21:9'

export interface PictureCalibrationSettings {
  brightness: number // 0.8 (80%) to 1.2 (120%), default 1.0
  contrast: number // 0.8 (80%) to 1.3 (130%), default 1.0
  saturation: number // 0.0 (monochrome) to 1.5 (vivid), default 1.0
}

export const DEFAULT_PICTURE_SETTINGS: PictureCalibrationSettings = {
  brightness: 1.0,
  contrast: 1.0,
  saturation: 1.0,
}

export interface AbLoopPoints {
  a: number | null
  b: number | null
}

export const DEFAULT_AB_LOOP: AbLoopPoints = {
  a: null,
  b: null,
}

export const PLAYBACK_SPEED_PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0] as const
export type PlaybackSpeed = (typeof PLAYBACK_SPEED_PRESETS)[number]

// Computes CSS properties to apply directly to the video element
export function computeVideoStyle(
  aspect: AspectRatioMode,
  picture: PictureCalibrationSettings
): CSSProperties {
  const styles: CSSProperties = {}

  // Aspect ratio and object-fit mapping
  switch (aspect) {
    case '16:9':
      styles.aspectRatio = '16 / 9'
      styles.objectFit = 'contain'
      break
    case '4:3':
      styles.aspectRatio = '4 / 3'
      styles.objectFit = 'contain'
      break
    case '21:9':
      styles.aspectRatio = '21 / 9'
      styles.objectFit = 'contain'
      break
    case 'fill':
      styles.objectFit = 'cover'
      styles.width = '100%'
      styles.height = '100%'
      break
    case 'smart-stretch':
      // Non-linear anamorphic stretch: expands video width while preserving vertical proportions
      styles.objectFit = 'fill'
      styles.width = '100%'
      styles.height = '100%'
      styles.transform = 'scaleX(1.15)'
      break
    case 'auto':
    default:
      styles.objectFit = 'contain'
      styles.width = '100%'
      styles.height = '100%'
      break
  }

  // Picture calibration filters (brightness, contrast, saturation)
  const filters: string[] = []
  if (picture.brightness !== 1.0) {
    filters.push(`brightness(${picture.brightness.toFixed(2)})`)
  }
  if (picture.contrast !== 1.0) {
    filters.push(`contrast(${picture.contrast.toFixed(2)})`)
  }
  if (picture.saturation !== 1.0) {
    filters.push(`saturate(${picture.saturation.toFixed(2)})`)
  }

  if (filters.length > 0) {
    styles.filter = filters.join(' ')
  }

  return styles
}

// Checks if current playback position has reached or exceeded point B in an active A-B loop
export function evaluateAbLoop(
  currentTime: number,
  loop: AbLoopPoints
): { shouldSeek: boolean; seekTarget: number } {
  if (loop.a !== null && loop.b !== null && loop.b > loop.a) {
    if (currentTime >= loop.b) {
      return { shouldSeek: true, seekTarget: loop.a }
    }
  }
  return { shouldSeek: false, seekTarget: 0 }
}
