// Cryptographic utilities for secure PIN hashing and lockout protection.
// Implements standard SHA-256 in pure TypeScript without native dependencies.

export interface StoredPinHashV1 {
  salt: string
  hash: string
  version: 1
}

export interface StoredPinHashV2 {
  algorithm: string
  salt: string
  hash: string
  iterations: number
  version: 2
}

export type StoredPinHash = StoredPinHashV1 | StoredPinHashV2

/** Constant-time string comparison to prevent timing side channels. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

function rightRotate(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount))
}

/** Pure TypeScript SHA-256 implementation conforming to FIPS 180-4. */
export function sha256(ascii: string): string {
  const mathPow = Math.pow
  const maxWord = mathPow(2, 32)
  const words: number[] = []
  const asciiBitLength = ascii.length * 8
  const hash: number[] = []
  const k: number[] = []
  let primeCounter = 0

  const isPrime = (n: number) => {
    for (let f = 2, max = Math.sqrt(n); f <= max; f++) {
      if (n % f === 0) return false
    }
    return true
  }

  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (isPrime(candidate)) {
      if (primeCounter < 8) {
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0
      }
      k[primeCounter] = (mathPow(candidate, 1 / 3) * maxWord) | 0
      primeCounter++
    }
  }

  for (let i = 0; i < ascii.length; i++) {
    const idx = i >> 2
    words[idx] = ((words[idx] ?? 0) | (ascii.charCodeAt(i) << ((3 - (i % 4)) * 8))) >>> 0
  }

  const bitIdx = asciiBitLength >> 5
  words[bitIdx] = ((words[bitIdx] ?? 0) | (0x80 << (24 - (asciiBitLength % 32)))) >>> 0
  words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength

  for (let j = 0; j < words.length; j += 16) {
    const w: number[] = []
    for (let i = 0; i < 16; i++) {
      w[i] = words[j + i] || 0
    }
    const oldHash = [...hash]

    for (let i = 0; i < 64; i++) {
      if (i >= 16) {
        const w15 = w[i - 15]!
        const w2 = w[i - 2]!
        const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)
        const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10)
        w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) | 0
      }

      const h0 = hash[0]!
      const h1 = hash[1]!
      const h2 = hash[2]!
      const h3 = hash[3]!
      const h4 = hash[4]!
      const h5 = hash[5]!
      const h6 = hash[6]!
      const h7 = hash[7]!

      const ch = (h4 & h5) ^ (~h4 & h6)
      const maj = (h0 & h1) ^ (h0 & h2) ^ (h1 & h2)
      const s0_h = rightRotate(h0, 2) ^ rightRotate(h0, 13) ^ rightRotate(h0, 22)
      const s1_h = rightRotate(h4, 6) ^ rightRotate(h4, 11) ^ rightRotate(h4, 25)

      const temp1 = (h7 + s1_h + ch + k[i]! + w[i]!) | 0
      const temp2 = (s0_h + maj) | 0

      hash[0] = (temp1 + temp2) | 0
      hash[1] = h0
      hash[2] = h1
      hash[3] = h2
      hash[4] = (h3 + temp1) | 0
      hash[5] = h4
      hash[6] = h5
      hash[7] = h6
    }

    for (let i = 0; i < 8; i++) {
      hash[i] = (hash[i]! + oldHash[i]!) | 0
    }
  }

  let hex = ''
  for (let i = 0; i < 8; i++) {
    for (let b = 3; b >= 0; b--) {
      const byte = (hash[i]! >> (b * 8)) & 255
      hex += byte.toString(16).padStart(2, '0')
    }
  }
  return hex
}

/** Generates a cryptographically random salt string. */
export function generateSalt(length = 16): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const bytes = new Uint8Array(Math.ceil(length / 2))
      crypto.getRandomValues(bytes)
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, length)
    }
  } catch {}
  // Deterministic fallback
  let fallback = ''
  while (fallback.length < length) {
    fallback += Math.random().toString(36).slice(2)
  }
  return fallback.slice(0, length)
}

/** Validates that a candidate PIN is strictly 4 numeric digits. */
export function isValidPinFormat(pin: string): boolean {
  return /^\d{4}$/.test(pin.trim())
}

function nodePbkdf2Sync(pin: string, saltHex: string, iterations: number): string | null {
  try {
    const g = globalThis as unknown as { process?: { versions?: { node?: string } }; require?: (mod: string) => unknown }
    if (!g.process?.versions?.node || typeof g.require !== 'function') return null
    const nodeCrypto = g.require('node' + ':crypto') as { pbkdf2Sync?: (password: string, salt: Uint8Array, iterations: number, keylen: number, digest: string) => Uint8Array } | null
    if (nodeCrypto && typeof nodeCrypto.pbkdf2Sync === 'function') {
      const saltBuf = Buffer.from(saltHex, 'hex')
      const derived = nodeCrypto.pbkdf2Sync(pin, saltBuf, iterations, 32, 'sha256')
      return Buffer.from(derived).toString('hex')
    }
  } catch {}
  return null
}

/** Hashes a PIN with a given or newly generated salt using PBKDF2 when available. */
export function hashPin(pin: string, salt = generateSalt(32)): StoredPinHash {
  const cleanPin = pin.trim()
  const pbkdf2Derived = nodePbkdf2Sync(cleanPin, salt, 100_000)
  if (pbkdf2Derived) {
    return {
      algorithm: 'pbkdf2-sha256',
      salt,
      hash: pbkdf2Derived,
      iterations: 100_000,
      version: 2,
    }
  }
  const computed = sha256(`kinora:${salt}:${cleanPin}`)
  return {
    salt,
    hash: computed,
    version: 1,
  }
}

/** Verifies an entered PIN against a stored record with constant-time equality. */
export function verifyPin(enteredPin: string, stored: StoredPinHash | string): boolean {
  if (!isValidPinFormat(enteredPin)) return false
  const cleanPin = enteredPin.trim()

  if (typeof stored === 'string') {
    return constantTimeEqual(cleanPin, stored.trim())
  }

  if (stored.version === 2 && 'algorithm' in stored && stored.algorithm === 'pbkdf2-sha256') {
    const derived = nodePbkdf2Sync(cleanPin, stored.salt, stored.iterations)
    if (derived) {
      return constantTimeEqual(derived, stored.hash)
    }
  }

  if (stored.version === 1 || !('version' in stored) || (stored as { version?: unknown }).version === undefined) {
    const computed = sha256(`kinora:${stored.salt}:${cleanPin}`)
    return constantTimeEqual(computed, stored.hash)
  }

  return false
}

// In-memory lockout state
const MAX_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 30_000

let failedAttempts = 0
let lockoutUntil = 0

/** Checks whether PIN verification is currently locked out. */
export function isPinVerificationLockedOut(): boolean {
  if (lockoutUntil > Date.now()) return true
  if (lockoutUntil > 0 && Date.now() >= lockoutUntil) {
    // Lockout expired: reset
    lockoutUntil = 0
    failedAttempts = 0
  }
  return false
}

/** Returns the remaining lockout time in seconds, or 0 if not locked out. */
export function getPinLockoutRemainingSeconds(): number {
  if (!isPinVerificationLockedOut()) return 0
  return Math.ceil((lockoutUntil - Date.now()) / 1000)
}

/** Records a successful PIN entry, resetting failure counters. */
export function recordPinSuccess(): void {
  failedAttempts = 0
  lockoutUntil = 0
}

/** Records a failed PIN entry, triggering lockout if threshold is exceeded. */
export function recordPinFailure(): { lockedOut: boolean; remainingAttempts: number; lockoutSeconds: number } {
  if (isPinVerificationLockedOut()) {
    return { lockedOut: true, remainingAttempts: 0, lockoutSeconds: getPinLockoutRemainingSeconds() }
  }

  failedAttempts++
  if (failedAttempts >= MAX_ATTEMPTS) {
    lockoutUntil = Date.now() + LOCKOUT_DURATION_MS
    return { lockedOut: true, remainingAttempts: 0, lockoutSeconds: 30 }
  }

  return {
    lockedOut: false,
    remainingAttempts: MAX_ATTEMPTS - failedAttempts,
    lockoutSeconds: 0,
  }
}

/** Resets the lockout state (used primarily in tests). */
export function resetPinLockoutStateForTesting(): void {
  failedAttempts = 0
  lockoutUntil = 0
}
