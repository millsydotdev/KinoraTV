/**
 * Secure AES-GCM 256-bit encrypted backup and restore engine for Kinora.
 * Encapsulates application preferences, playlists metadata, custom bouquets,
 * smart collections, watch history, and user settings into an encrypted `.kinorabackup` container.
 * Built strictly on the standard Web Crypto API with zero runtime dependencies.
 */

export interface KinoraBackupPayload {
  app: 'Kinora'
  version: 2
  exportedAt: string
  prefs: Record<string, unknown>
  library: Record<string, unknown>
  userPreferences?: Record<string, unknown>
  personalMedia?: unknown
  bouquets?: unknown
  xtreamFallback?: unknown
  smartCollections?: unknown
}

const MAGIC_HEADER = 'KINORA_BACKUP_V1'
const MAGIC_BYTES = new TextEncoder().encode(MAGIC_HEADER) // 16 bytes
const SALT_LENGTH = 16
const IV_LENGTH = 12
const PBKDF2_ITERATIONS = 100000

/**
 * Derives an AES-GCM 256-bit CryptoKey from a user passphrase and random salt
 * using PBKDF2 with HMAC-SHA-256.
 */
async function deriveEncryptionKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/**
 * Encrypts a Kinora backup payload with a passphrase, producing a binary ArrayBuffer
 * containing the magic header, salt, IV, and AES-GCM ciphertext.
 */
export async function encryptBackupPayload(
  payload: KinoraBackupPayload,
  passphrase: string,
): Promise<ArrayBuffer> {
  if (!passphrase || passphrase.length < 4) {
    throw new Error('Backup passphrase must be at least 4 characters long.')
  }

  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const key = await deriveEncryptionKey(passphrase, salt)

  const jsonString = JSON.stringify(payload)
  const plaintextBytes = new TextEncoder().encode(jsonString)

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintextBytes,
  )

  const ciphertextBytes = new Uint8Array(ciphertext)
  const totalLength = MAGIC_BYTES.length + SALT_LENGTH + IV_LENGTH + ciphertextBytes.length
  const output = new Uint8Array(totalLength)

  let offset = 0
  output.set(MAGIC_BYTES, offset)
  offset += MAGIC_BYTES.length

  output.set(salt, offset)
  offset += SALT_LENGTH

  output.set(iv, offset)
  offset += IV_LENGTH

  output.set(ciphertextBytes, offset)

  return output.buffer
}

/**
 * Decrypts a binary `.kinorabackup` container using the provided passphrase.
 * Validates the file header, extracts salt and IV, and decrypts the AES-GCM payload.
 */
export async function decryptBackupPayload(
  buffer: ArrayBuffer,
  passphrase: string,
): Promise<KinoraBackupPayload> {
  if (!passphrase) {
    throw new Error('A passphrase is required to decrypt this backup.')
  }

  const minLength = MAGIC_BYTES.length + SALT_LENGTH + IV_LENGTH + 16 // 16 bytes min tag
  if (buffer.byteLength < minLength) {
    throw new Error('Corrupted or invalid backup file: file too short.')
  }

  const bytes = new Uint8Array(buffer)

  // Verify magic header
  for (let i = 0; i < MAGIC_BYTES.length; i++) {
    if (bytes[i] !== MAGIC_BYTES[i]) {
      throw new Error('Invalid backup file: missing Kinora container signature.')
    }
  }

  let offset = MAGIC_BYTES.length
  const salt = bytes.slice(offset, offset + SALT_LENGTH)
  offset += SALT_LENGTH

  const iv = bytes.slice(offset, offset + IV_LENGTH)
  offset += IV_LENGTH

  const ciphertext = bytes.slice(offset)

  try {
    const key = await deriveEncryptionKey(passphrase, salt)
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext,
    )

    const jsonString = new TextDecoder().decode(decrypted)
    const payload = JSON.parse(jsonString) as KinoraBackupPayload

    if (!payload || payload.app !== 'Kinora' || typeof payload.prefs !== 'object') {
      throw new Error('Invalid backup contents.')
    }

    return payload
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('Invalid backup contents')) {
      throw err
    }
    throw new Error('Incorrect passphrase or damaged backup file.')
  }
}

/**
 * Helper to download an encrypted backup file as `.kinorabackup`.
 */
export function triggerBackupDownload(buffer: ArrayBuffer, filenamePrefix = 'kinora-vault'): void {
  const blob = new Blob([buffer], { type: 'application/octet-stream' })
  const dateStr = new Date().toISOString().slice(0, 10)
  const filename = `${filenamePrefix}-${dateStr}.kinorabackup`

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
