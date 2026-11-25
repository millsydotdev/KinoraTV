import { describe, it, expect } from 'vitest'
import { generateQrMatrix, qrMatrixToSvgPath } from './qrCode'

describe('qrCode', () => {
  it('generates a valid QR matrix for short URL', () => {
    const url = 'http://192.168.1.100:5198'
    const matrix = generateQrMatrix(url)

    expect(matrix.size).toBeGreaterThanOrEqual(21)
    expect(matrix.modules.length).toBe(matrix.size)
    expect(matrix.modules[0]?.length).toBe(matrix.size)

    // Check finder pattern at top-left: 7x7 dark outline, 3x3 center
    expect(matrix.modules[0]?.[0]).toBe(true)
    expect(matrix.modules[0]?.[6]).toBe(true)
    expect(matrix.modules[6]?.[0]).toBe(true)
    expect(matrix.modules[6]?.[6]).toBe(true)
    expect(matrix.modules[3]?.[3]).toBe(true)
  })

  it('renders SVG path string with cells', () => {
    const matrix = generateQrMatrix('test')
    const path = qrMatrixToSvgPath(matrix, 4)

    expect(path).toContain('M0,0h4v4h-4z')
    expect(typeof path).toBe('string')
    expect(path.length).toBeGreaterThan(100)
  })

  it('selects higher version when payload exceeds version 1 capacity', () => {
    const longUrl = 'http://192.168.1.100:5198/app?token=abcdef1234567890abcdef1234567890abcdef1234567890'
    const matrix = generateQrMatrix(longUrl)

    expect(matrix.size).toBeGreaterThan(21)
  })

  it('writes ISO 18004 format info 0x77C4 (EC-L, Mask 0) in top-left, bottom-left, and top-right', () => {
    const matrix = generateQrMatrix('http://192.168.0.77:5198')
    const s = matrix.size
    // Expected 15 bits MSB-first for 0x77C4: 111011111000100
    const expected = [true, true, true, false, true, true, true, true, true, false, false, false, true, false, false]
    const topLeft = [
      matrix.modules[8]?.[0],
      matrix.modules[8]?.[1],
      matrix.modules[8]?.[2],
      matrix.modules[8]?.[3],
      matrix.modules[8]?.[4],
      matrix.modules[8]?.[5],
      matrix.modules[8]?.[7],
      matrix.modules[8]?.[8],
      matrix.modules[7]?.[8],
      matrix.modules[5]?.[8],
      matrix.modules[4]?.[8],
      matrix.modules[3]?.[8],
      matrix.modules[2]?.[8],
      matrix.modules[1]?.[8],
      matrix.modules[0]?.[8],
    ]
    expect(topLeft).toEqual(expected)

    // Bottom-left vertical (bits 14..8 bottom-to-top) and top-right horizontal (bits 7..0 left-to-right)
    const bottomLeft = Array.from({ length: 7 }, (_, i) => matrix.modules[s - 1 - i]?.[8])
    const topRight = Array.from({ length: 8 }, (_, i) => matrix.modules[8]?.[s - 8 + i])
    expect([...bottomLeft, ...topRight]).toEqual(expected)
  })
})
