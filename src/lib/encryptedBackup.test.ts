import { describe, expect, it } from 'vitest'
import {
  decryptBackupPayload,
  encryptBackupPayload,
  type KinoraBackupPayload,
} from './encryptedBackup'

describe('Encrypted Backup & Restore Engine (.kinorabackup)', () => {
  const samplePayload: KinoraBackupPayload = {
    app: 'Kinora',
    version: 2,
    exportedAt: '2026-11-22T12:00:00.000Z',
    prefs: {
      theme: 'dark',
      themeMode: 'black-jade',
      volume: 85,
    },
    library: {
      watchlist: ['movie:1', 'series:2'],
      favourites: ['channel:101'],
      watched: ['movie:1'],
      collections: [],
    },
    userPreferences: {
      autoFallback: true,
    },
  }

  it('encrypts and decrypts payload successfully with correct passphrase', async () => {
    const passphrase = 'SecretPassword123!'
    const encrypted = await encryptBackupPayload(samplePayload, passphrase)

    expect(encrypted.byteLength).toBeGreaterThan(64)

    const decrypted = await decryptBackupPayload(encrypted, passphrase)
    expect(decrypted.app).toBe('Kinora')
    expect(decrypted.version).toBe(2)
    expect(decrypted.prefs).toEqual(samplePayload.prefs)
    expect(decrypted.library).toEqual(samplePayload.library)
  })

  it('rejects decryption when wrong passphrase is provided', async () => {
    const encrypted = await encryptBackupPayload(samplePayload, 'CorrectPassphrase')

    await expect(
      decryptBackupPayload(encrypted, 'WrongPassphrase'),
    ).rejects.toThrow('Incorrect passphrase or damaged backup file.')
  })

  it('rejects decryption for truncated or corrupted data', async () => {
    const shortBuffer = new ArrayBuffer(10)
    await expect(
      decryptBackupPayload(shortBuffer, 'AnyPassphrase'),
    ).rejects.toThrow('Corrupted or invalid backup file: file too short.')
  })

  it('rejects decryption when magic container signature is missing', async () => {
    const buffer = new Uint8Array(100)
    buffer.fill(1) // fill with bogus data without magic header

    await expect(
      decryptBackupPayload(buffer.buffer, 'AnyPassphrase'),
    ).rejects.toThrow('Invalid backup file: missing Kinora container signature.')
  })

  it('enforces minimum passphrase length during encryption', async () => {
    await expect(
      encryptBackupPayload(samplePayload, '12'),
    ).rejects.toThrow('Backup passphrase must be at least 4 characters long.')
  })
})
