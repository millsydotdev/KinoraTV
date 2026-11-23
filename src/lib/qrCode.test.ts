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
})
