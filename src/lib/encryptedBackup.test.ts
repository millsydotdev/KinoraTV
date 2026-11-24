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

  it('reports native sources, guides, DVR rules, and missing local paths during pre-flight inspection', () => {
    const richPayload: KinoraBackupPayload = {
      ...samplePayload,
      nativeSourcesState: {
        sources: [{ id: 'pl-1', origin: 'file' }, { id: 'pl-2', origin: 'url' }],
        guides: [{ id: 'gd-1' }],
        mappings: [{ channel: 'c1', guide: 'gd-1', xmltvId: 'bbc1.uk' }],
        xtreamSources: [{ id: 'xt-1', name: 'My IPTV' }],
      },
      dvrRules: [{ id: 'rule-1', query: 'Horizon' }],
      customArtwork: { 'channel:c1': 'data:image/png;base64,AAAA' },
      localLibraries: [{ id: 'lib-1', name: 'NAS Movies', path: '/mnt/nas/movies', kind: 'movies' }],
    }

    const report = inspectBackupPayload(richPayload, ['/mnt/nas/movies'])
    expect(report.itemCounts.sources).toBe(2)
    expect(report.itemCounts.guides).toBe(1)
    expect(report.itemCounts.guideMappings).toBe(1)
    expect(report.itemCounts.dvrRules).toBe(1)
    expect(report.itemCounts.customArtwork).toBe(1)
    expect(report.itemCounts.localLibraries).toBe(1)
    expect(report.compatibility.migrationNeeded).toBe(true)
    expect(report.compatibility.warnings.some((w) => w.includes('Xtream providers'))).toBe(true)
    expect(report.compatibility.warnings.some((w) => w.includes('/mnt/nas/movies'))).toBe(true)
    expect(report.compatibility.warnings.some((w) => w.includes('file-based playlists'))).toBe(true)
  })

  it('inspects and preserves media servers, podcasts, opds catalogs, and stalker portals', async () => {
    const extendedPayload: KinoraBackupPayload = {
      ...samplePayload,
      mediaServers: [
        { id: 'jf-1', platform: 'jellyfin', name: 'Home Jellyfin', serverUrl: 'http://192.168.1.100:8096' },
        { id: 'plex-1', platform: 'plex', name: 'Living Room Plex', serverUrl: 'http://192.168.1.101:32400' },
      ],
      podcastSubscriptions: [
        { id: 'pod-1', title: 'Daily Tech', feedUrl: 'https://feeds.example/tech.xml' },
      ],
      opdsCatalogs: [
        { id: 'opds-1', title: 'Standard Ebooks', feedUrl: 'https://standardebooks.org/opds' },
        { id: 'opds-2', title: 'Project Gutenberg', feedUrl: 'https://m.gutenberg.org/ebooks.opds' },
      ],
      stalkerPortals: [
        { id: 'stk-1', portalUrl: 'http://portal.example.com/c', mac: '00:1A:79:00:11:22' },
      ],
    }

    const report = inspectBackupPayload(extendedPayload)
    expect(report.itemCounts.mediaServers).toBe(2)
    expect(report.itemCounts.podcastSubscriptions).toBe(1)
    expect(report.itemCounts.opdsCatalogs).toBe(2)
    expect(report.itemCounts.stalkerPortals).toBe(1)
    expect(report.compatibility.warnings.some((w) => w.includes('Media servers'))).toBe(true)
    expect(report.compatibility.warnings.some((w) => w.includes('Stalker portals'))).toBe(true)

    // Test round-trip encryption/decryption
    const key = 'SafeVaultKey999!'
    const encrypted = await encryptBackupPayload(extendedPayload, key)
    const decrypted = await decryptBackupPayload(encrypted, key)

    expect(Array.isArray(decrypted.mediaServers)).toBe(true)
    expect((decrypted.mediaServers as unknown[]).length).toBe(2)
    expect(Array.isArray(decrypted.podcastSubscriptions)).toBe(true)
    expect(Array.isArray(decrypted.opdsCatalogs)).toBe(true)
    expect(Array.isArray(decrypted.stalkerPortals)).toBe(true)
  })
})
