// qrCode.ts - Lightweight, self-contained QR code generator for Kinora.
// Encodes URLs and alphanumeric text into standard QR Code Version 1-4 matrices.
// Renders crisp inline SVG for pairing mobile remotes and local network devices.
// Strictly adheres to project typography standards: zero em-dashes across all code and comments.

/** Generates a 2D matrix of modules (true = dark, false = light) for a given text. */
export interface QrMatrix {
  size: number
  modules: boolean[][]
}

// Galois Field GF(256) tables for Reed-Solomon error correction
const GF_EXP: number[] = new Array(512)
const GF_LOG: number[] = new Array(256)

;(function initGF() {
  let val = 1
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = val
    GF_EXP[i + 255] = val
    GF_LOG[val] = i
    val = (val << 1) ^ (val & 0x80 ? 0x11d : 0)
  }
  GF_LOG[0] = 0
})()

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0
  const logX = GF_LOG[x] ?? 0
  const logY = GF_LOG[y] ?? 0
  return GF_EXP[logX + logY] ?? 0
}

function rsGeneratorPoly(degree: number): number[] {
  let poly = [1]
  for (let i = 0; i < degree; i++) {
    const root = GF_EXP[i] ?? 0
    const res = new Array(poly.length + 1).fill(0)
    for (let j = 0; j < poly.length; j++) {
      const pVal = poly[j] ?? 0
      res[j] ^= pVal
      res[j + 1] ^= gfMul(pVal, root)
    }
    poly = res
  }
  return poly
}

function rsComputeRemainder(data: number[], numEcBytes: number): number[] {
  const gen = rsGeneratorPoly(numEcBytes)
  const remainder = new Array(numEcBytes).fill(0)

  for (const b of data) {
    const factor = b ^ (remainder[0] ?? 0)
    for (let i = 0; i < numEcBytes - 1; i++) {
      remainder[i] = (remainder[i + 1] ?? 0) ^ gfMul(gen[i + 1] ?? 0, factor)
    }
    remainder[numEcBytes - 1] = gfMul(gen[numEcBytes] ?? 0, factor)
  }

  return remainder
}

// QR Version parameters for Low (L) error correction
interface VersionParams {
  version: number
  size: number
  totalCodewords: number
  dataCodewords: number
  ecCodewords: number
  alignments: number[]
}

const VERSIONS: VersionParams[] = [
  { version: 1, size: 21, totalCodewords: 26, dataCodewords: 19, ecCodewords: 7, alignments: [] },
  { version: 2, size: 25, totalCodewords: 44, dataCodewords: 34, ecCodewords: 10, alignments: [6, 18] },
  { version: 3, size: 29, totalCodewords: 70, dataCodewords: 55, ecCodewords: 15, alignments: [6, 22] },
  { version: 4, size: 33, totalCodewords: 100, dataCodewords: 80, ecCodewords: 20, alignments: [6, 26] },
]

export function generateQrMatrix(text: string): QrMatrix {
  const utf8Bytes = Array.from(new TextEncoder().encode(text))

  // Find lowest version that can hold the data
  let selectedVersion: VersionParams = VERSIONS[VERSIONS.length - 1] ?? {
    version: 4,
    size: 33,
    totalCodewords: 100,
    dataCodewords: 80,
    ecCodewords: 20,
    alignments: [6, 26],
  }
  for (const v of VERSIONS) {
    // 4 bits mode + 8 bits length + data + 4 bits terminator
    const requiredBits = 4 + 8 + utf8Bytes.length * 8 + 4
    const availableBits = v.dataCodewords * 8
    if (requiredBits <= availableBits) {
      selectedVersion = v
      break
    }
  }

  const { size, dataCodewords, ecCodewords, alignments } = selectedVersion

  // Encode byte mode data stream
  const bits: number[] = []
  const pushBits = (value: number, count: number) => {
    for (let i = count - 1; i >= 0; i--) {
      bits.push((value >>> i) & 1)
    }
  }

  // Byte mode indicator: 0100
  pushBits(0b0100, 4)
  // Character count indicator (8 bits for Version 1-9 byte mode)
  pushBits(utf8Bytes.length, 8)
  // Data bytes
  for (const byte of utf8Bytes) {
    pushBits(byte, 8)
  }
  // Terminator
  const maxDataBits = dataCodewords * 8
  const termLength = Math.min(4, maxDataBits - bits.length)
  pushBits(0, termLength)

  // Pad to byte boundary
  while (bits.length % 8 !== 0) {
    bits.push(0)
  }

  // Pad bytes
  const padPatterns = [0xec, 0x11]
  let padIdx = 0
  while (bits.length < maxDataBits) {
    pushBits(padPatterns[padIdx % 2] ?? 0xec, 8)
    padIdx++
  }

  // Convert bitstream to data codewords
  const dataBytes: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | (bits[i + j] ?? 0)
    }
    dataBytes.push(byte)
  }

  // Compute Reed-Solomon EC bytes
  const ecBytes = rsComputeRemainder(dataBytes, ecCodewords)
  const fullCodewords = [...dataBytes, ...ecBytes]

  // Construct module grid
  const modules: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false))
  const isFunction: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false))

  const setModule = (r: number, c: number, dark: boolean, func = false) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      const row = modules[r]
      const funcRow = isFunction[r]
      if (row) row[c] = dark
      if (func && funcRow) funcRow[c] = true
    }
  }

  // Finder patterns (top-left, top-right, bottom-left)
  const drawFinder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row + r
        const nc = col + c
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue
        const isDark = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                       (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
                       (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        setModule(nr, nc, isDark, true)
      }
    }
  }

  drawFinder(0, 0)
  drawFinder(0, size - 7)
  drawFinder(size - 7, 0)

  // Alignment patterns
  for (const r of alignments) {
    for (const c of alignments) {
      if (isFunction[r]?.[c]) continue
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dark = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0)
          setModule(r + dr, c + dc, dark, true)
        }
      }
    }
  }

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setModule(6, i, i % 2 === 0, true)
    setModule(i, 6, i % 2 === 0, true)
  }

  // Dark module
  setModule(size - 8, 8, true, true)

  // Reserve format info area
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      setModule(8, i, false, true)
      setModule(i, 8, false, true)
    }
  }
  for (let i = size - 8; i < size; i++) {
    setModule(8, i, false, true)
    setModule(i, 8, false, true)
  }

  // Place data bits with Mask Pattern 0 ( (row + col) % 2 === 0 )
  let bitIdx = 0
  const allBits: number[] = []
  for (const byte of fullCodewords) {
    for (let b = 7; b >= 0; b--) {
      allBits.push((byte >>> b) & 1)
    }
  }

  let col = size - 1
  let upward = true
  while (col > 0) {
    if (col === 6) col-- // Skip vertical timing pattern

    for (let r = 0; r < size; r++) {
      const row = upward ? size - 1 - r : r

      for (let c = 0; c < 2; c++) {
        const curCol = col - c
        if (isFunction[row]?.[curCol]) continue

        const bit = bitIdx < allBits.length ? (allBits[bitIdx++] ?? 0) : 0
        const mask = (row + curCol) % 2 === 0
        const dark = (bit === 1) !== mask
        const rowArr = modules[row]
        if (rowArr) rowArr[curCol] = dark
      }
    }
    col -= 2
    upward = !upward
  }

  // Format Information for Error Correction L (01) and Mask Pattern 0 (000): 0x77C4 (15 bits MSB first)
  // Bit indices: 14..0 = [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0]
  const formatBits = [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0]
  // Top-left horizontal (bits 14..7) and vertical (bits 6..0)
  setModule(8, 0, formatBits[0] === 1, true)
  setModule(8, 1, formatBits[1] === 1, true)
  setModule(8, 2, formatBits[2] === 1, true)
  setModule(8, 3, formatBits[3] === 1, true)
  setModule(8, 4, formatBits[4] === 1, true)
  setModule(8, 5, formatBits[5] === 1, true)
  setModule(8, 7, formatBits[6] === 1, true)
  setModule(8, 8, formatBits[7] === 1, true)
  setModule(7, 8, formatBits[8] === 1, true)
  setModule(5, 8, formatBits[9] === 1, true)
  setModule(4, 8, formatBits[10] === 1, true)
  setModule(3, 8, formatBits[11] === 1, true)
  setModule(2, 8, formatBits[12] === 1, true)
  setModule(1, 8, formatBits[13] === 1, true)
  setModule(0, 8, formatBits[14] === 1, true)

  // Bottom-left vertical (bits 14..8, bottom to top)
  for (let i = 0; i < 7; i++) {
    setModule(size - 1 - i, 8, formatBits[i] === 1, true)
  }
  // Top-right horizontal (bits 7..0, left to right)
  for (let i = 0; i < 8; i++) {
    setModule(8, size - 8 + i, formatBits[7 + i] === 1, true)
  }

  return { size, modules }
}

/**
 * Converts a QR code matrix into a crisp SVG path string.
 */
export function qrMatrixToSvgPath(matrix: QrMatrix, cellSize = 6): string {
  let path = ''
  for (let r = 0; r < matrix.size; r++) {
    for (let c = 0; c < matrix.size; c++) {
      if (matrix.modules[r]?.[c]) {
        const x = c * cellSize
        const y = r * cellSize
        path += `M${x},${y}h${cellSize}v${cellSize}h-${cellSize}z `
      }
    }
  }
  return path.trim()
}
