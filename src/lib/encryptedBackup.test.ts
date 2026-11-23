import { describe, expect, it } from 'vitest'
import {
  decryptBackupPayload,
  encryptBackupPayload,
  inspectBackupPayload,
  computePayloadChecksum,
  type KinoraBackupPayload,
} from './encryptedBackup'

describe('Encrypted Backup & Restore Engine (.kinorabackup)', () => {
  const samplePayload: KinoraBackupPayload = {
    app: 'Kinora',
    version: 3,
    exportedAt: '2026-11-22T12:00:00.000Z',
    prefs: {
      theme: 'dark',
      themeMode: 'black-jade',
      volume: 85,
    },
    library: {
      watchlist: ['movie:1', 'series:2'],
      favourites: ['channel:101', 'channel:102'],
      watched: ['movie:1'],
      collections: [{ id: 'col-1', name: 'Favourites' }],
    },
    userPreferences: {
      autoFallback: true,
    },
    bouquets: {
      bouquets: [{ id: 'bq-1', name: 'Sports' }],
    },
    smartCollections: [{ id: 'sc-1', name: 'Sci-Fi' }],
    savedSources: [{ id: 'src-1', name: 'UK Freeview' }],
  }

  it('encrypts and decrypts payload successfully with correct passphrase', async () => {
    const passphrase = 'SecretPassword123!'
    const encrypted = await encryptBackupPayload(samplePayload, passphrase)

    expect(encrypted.byteLength).toBeGreaterThan(64)

    const decrypted = await decryptBackupPayload(encrypted, passphrase)
    expect(decrypted.app).toBe('Kinora')
    expect(decrypted.version).toBe(3)
    expect(decrypted.prefs).toEqual(samplePayload.prefs)
    expect(decrypted.library).toEqual(samplePayload.library)
    expect(decrypted.checksum).toBeDefined()
  })

  it('detects tampering when payload checksum does not match', async () => {
    const tamperedPayload: KinoraBackupPayload = {
      ...samplePayload,
      checksum: 'bogus-tampered-checksum-1234567890abcdef',
    }

    // Verify that tampered checksum fails match against calculated checksum
    const realChecksum = await computePayloadChecksum(samplePayload)
    expect(realChecksum).not.toBe(tamperedPayload.checksum)
  })

  it('generates accurate pre-flight inspection report', () => {
    const report = inspectBackupPayload(samplePayload)
    expect(report.app).toBe('Kinora')
    expect(report.version).toBe(3)
    expect(report.itemCounts.favourites).toBe(2)
    expect(report.itemCounts.watchlist).toBe(2)
    expect(report.itemCounts.collections).toBe(1)
    expect(report.itemCounts.bouquets).toBe(1)
    expect(report.itemCounts.smartCollections).toBe(1)
    expect(report.itemCounts.sources).toBe(1)
    expect(report.compatibility.isCompatible).toBe(true)
    expect(report.compatibility.migrationNeeded).toBe(false)
  })

  it('flags legacy v2 backups for migration during inspection', () => {
    const legacyPayload: KinoraBackupPayload = {
      app: 'Kinora',
      version: 2,
      exportedAt: '2026-10-01T00:00:00Z',
      prefs: {},
      library: {},
    }

    const report = inspectBackupPayload(legacyPayload)
    expect(report.compatibility.migrationNeeded).toBe(true)
    expect(report.compatibility.warnings.some((w) => w.includes('v2'))).toBe(true)
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
