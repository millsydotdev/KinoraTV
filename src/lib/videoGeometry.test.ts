import { describe, expect, it } from 'vitest'
import {
  computeVideoStyle,
  DEFAULT_PICTURE_SETTINGS,
  evaluateAbLoop,
} from './videoGeometry'

describe('videoGeometry', () => {
  it('computes default styles for auto aspect ratio and flat picture settings', () => {
    const style = computeVideoStyle('auto', DEFAULT_PICTURE_SETTINGS)
    expect(style.objectFit).toBe('contain')
    expect(style.width).toBe('100%')
    expect(style.height).toBe('100%')
    expect(style.filter).toBeUndefined()
  })

  it('maps standard aspect ratios correctly', () => {
    const style169 = computeVideoStyle('16:9', DEFAULT_PICTURE_SETTINGS)
    expect(style169.aspectRatio).toBe('16 / 9')
    expect(style169.objectFit).toBe('contain')

    const style43 = computeVideoStyle('4:3', DEFAULT_PICTURE_SETTINGS)
    expect(style43.aspectRatio).toBe('4 / 3')
    expect(style43.objectFit).toBe('contain')

    const style219 = computeVideoStyle('21:9', DEFAULT_PICTURE_SETTINGS)
    expect(style219.aspectRatio).toBe('21 / 9')
    expect(style219.objectFit).toBe('contain')

    const styleFill = computeVideoStyle('fill', DEFAULT_PICTURE_SETTINGS)
    expect(styleFill.objectFit).toBe('cover')
  })

  it('configures smart-stretch mode with non-linear scale transform', () => {
    const style = computeVideoStyle('smart-stretch', DEFAULT_PICTURE_SETTINGS)
    expect(style.objectFit).toBe('fill')
    expect(style.transform).toBe('scaleX(1.15)')
  })

  it('generates combined CSS filters for picture calibration adjustments', () => {
    const style = computeVideoStyle('auto', {
      brightness: 1.1,
      contrast: 1.2,
      saturation: 0.9,
    })
    expect(style.filter).toContain('brightness(1.10)')
    expect(style.filter).toContain('contrast(1.20)')
    expect(style.filter).toContain('saturate(0.90)')
  })

  it('evaluates active A-B loop boundaries', () => {
    const loop = { a: 15.0, b: 30.0 }

    // Before reaching point B
    const check1 = evaluateAbLoop(25.0, loop)
    expect(check1.shouldSeek).toBe(false)

    // At or past point B -> triggers loop back to point A
    const check2 = evaluateAbLoop(30.0, loop)
    expect(check2.shouldSeek).toBe(true)
    expect(check2.seekTarget).toBe(15.0)

    const check3 = evaluateAbLoop(32.5, loop)
    expect(check3.shouldSeek).toBe(true)
    expect(check3.seekTarget).toBe(15.0)

    // Incomplete loop points -> no seek
    const incompleteLoop = { a: 10.0, b: null }
    expect(evaluateAbLoop(15.0, incompleteLoop).shouldSeek).toBe(false)
  })
})
