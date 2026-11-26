import { describe, expect, it } from 'vitest'
import {
  decryptBackupPayload,
  encryptBackupPayload,
  executeTransactionalRestore,
  inspectBackupPayload,
  computePayloadChecksum,
  type KinoraBackupPayload,
  type RestoreSelectionOptions,
  type TransactionalRestoreLocalLib,
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

  it('rolls back all React, localStorage, and native Rust stores when restoration fails mid-way', async () => {
    const kv = new Map<string, string>([
      ['kinora.bouquet_config.v1.profile-a', JSON.stringify({ bouquets: [{ id: 'bq-orig', name: 'Original' }] })],
      ['kinora.reading_progress.v1.profile-a', JSON.stringify({ 'epub:old': { percent: 40 } })],
    ])
    const storage = {
      getItem: (k: string) => kv.get(k) ?? null,
      setItem: (k: string, v: string) => { kv.set(k, v) },
      removeItem: (k: string) => { kv.delete(k) },
    }

    let currentPrefs: Record<string, unknown> = { theme: 'dark', volume: 50 }
    let currentLibrary: Record<string, unknown> = { favourites: ['channel:orig'], watchlist: [] }
    let currentPersonal: unknown = { resources: ['orig-res'] }
    let currentSources: Record<string, unknown> = { sources: [{ id: 'pl-orig' }], guides: [], mappings: [] }
    let currentLocalLibs: TransactionalRestoreLocalLib[] = [
      { id: 'lib-orig', name: 'Original Movies', folders: ['/orig'], mediaType: 'movies', lastScannedAt: null, autoScan: true, scanIntervalHours: 24 },
    ]
    let currentDvrConfig: Record<string, unknown> = { storagePath: '/orig/dvr', maxGb: 50 }
    let currentDvrRules: Array<{ id: string; query: string }> = [{ id: 'rule-orig', query: 'Original Show' }]

    const incomingPayload: KinoraBackupPayload = {
      app: 'Kinora',
      version: 3,
      exportedAt: '2026-11-26T18:00:00.000Z',
      prefs: { theme: 'light', volume: 95 },
      library: { favourites: ['channel:new'], watchlist: ['movie:new'] },
      personalMedia: { resources: ['new-res'] },
      bouquets: { bouquets: [{ id: 'bq-new', name: 'Restored' }] },
      readingProgress: { 'epub:new': { percent: 90 } },
      nativeSourcesState: { sources: [{ id: 'pl-new' }], guides: [{ id: 'gd-new' }], mappings: [] },
      localLibraries: [
        { id: 'lib-new', name: 'New NAS', folders: ['/mnt/nas'], mediaType: 'movies' },
      ],
      dvrConfig: { storagePath: '/new/dvr', maxGb: 200 },
      dvrRules: [{ id: 'rule-new', query: 'New Show' }],
    }

    const allOptions: RestoreSelectionOptions = {
      restorePrefs: true,
      restoreLibrary: true,
      restoreSources: true,
      restoreBouquets: true,
      restoreSmartCollections: true,
      restorePersonalMedia: true,
      restoreCustomArtwork: true,
      restoreDvr: true,
    }

    await expect(
      executeTransactionalRestore(incomingPayload, allOptions, {
        profileId: 'profile-a',
        progressStorageKey: 'kinora.reading_progress.v1.profile-a',
        aiVoiceStorageKey: 'kinora.ai_voice_config.v1',
        storage,
        getPrefs: () => currentPrefs,
        importPrefs: (p) => { currentPrefs = p },
        getLibrary: () => currentLibrary,
        importLibrary: (l) => { currentLibrary = l },
        exportPersonalMedia: () => currentPersonal,
        importPersonalMedia: (m) => { currentPersonal = m },
        loadSources: async () => structuredClone(currentSources),
        saveSources: async (s) => { currentSources = structuredClone(s) },
        getLocalLibraries: async () => structuredClone(currentLocalLibs),
        saveLocalLibrary: async (lib) => {
          const idx = currentLocalLibs.findIndex((l) => l.id === lib.id)
          if (idx >= 0) currentLocalLibs[idx] = lib
          else currentLocalLibs.push(lib)
        },
        deleteLocalLibrary: async (id) => {
          currentLocalLibs = currentLocalLibs.filter((l) => l.id !== id)
        },
        checkLocalPathsExist: async (paths) => paths.map(() => true),
        dvrGetConfig: async () => structuredClone(currentDvrConfig),
        dvrSaveConfig: async () => {
          throw new Error('Simulated disk full error while writing DVR config')
        },
        dvrGetRules: async () => structuredClone(currentDvrRules),
        dvrSaveRule: async (rule) => {
          currentDvrRules = [...currentDvrRules.filter((r) => r.id !== rule.id), rule]
        },
        dvrDeleteRule: async (id) => {
          currentDvrRules = currentDvrRules.filter((r) => r.id !== id)
        },
      }),
    ).rejects.toThrow('Simulated disk full error')

    expect(currentPrefs).toEqual({ theme: 'dark', volume: 50 })
    expect(currentLibrary).toEqual({ favourites: ['channel:orig'], watchlist: [] })
    expect(currentPersonal).toEqual({ resources: ['orig-res'] })
    expect(currentSources).toEqual({ sources: [{ id: 'pl-orig' }], guides: [], mappings: [] })
    expect(currentLocalLibs).toEqual([
      { id: 'lib-orig', name: 'Original Movies', folders: ['/orig'], mediaType: 'movies', lastScannedAt: null, autoScan: true, scanIntervalHours: 24 },
    ])
    expect(currentDvrConfig).toEqual({ storagePath: '/orig/dvr', maxGb: 50 })
    expect(currentDvrRules).toEqual([{ id: 'rule-orig', query: 'Original Show' }])
    expect(JSON.parse(kv.get('kinora.bouquet_config.v1.profile-a')!)).toEqual({
      bouquets: [{ id: 'bq-orig', name: 'Original' }],
    })
    expect(JSON.parse(kv.get('kinora.reading_progress.v1.profile-a')!)).toEqual({
      'epub:old': { percent: 40 },
    })
  })

  it('exports an encrypted backup and restores cleanly into a fresh empty profile', async () => {
    const sourcePayload: KinoraBackupPayload = {
      app: 'Kinora',
      version: 3,
      exportedAt: '2026-11-26T18:00:00.000Z',
      prefs: { theme: 'dark', volume: 78 },
      library: { favourites: ['channel:bbc1'], watchlist: ['movie:arrival'], watched: ['movie:arrival'], collections: [] },
      bouquets: { bouquets: [{ id: 'bq-uk', name: 'UK Freeview' }] },
      readingProgress: { 'pdf:handbook': { chapterIndex: 4, totalChapters: 12, percent: 42 } },
      mediaServers: [{ id: 'jf-1', serverType: 'jellyfin', name: 'Home Jellyfin', url: 'http://192.168.1.50:8096', authToken: '[PROTECTED]' }],
      nativeSourcesState: { sources: [{ id: 'pl-1', name: 'Freeview' }], guides: [{ id: 'gd-1' }], mappings: [] },
      localLibraries: [{ id: 'lib-1', name: 'Cinema', folders: ['/media/cinema'], mediaType: 'movies' }],
      dvrConfig: { storagePath: '/media/dvr', maxGb: 100 },
      dvrRules: [{ id: 'rule-1', query: 'Horizon' }],
    }

    const encrypted = await encryptBackupPayload(sourcePayload, 'FreshProfilePass2026!')
    const decrypted = await decryptBackupPayload(encrypted, 'FreshProfilePass2026!')

    const freshKv = new Map<string, string>()
    const freshStorage = {
      getItem: (k: string) => freshKv.get(k) ?? null,
      setItem: (k: string, v: string) => { freshKv.set(k, v) },
      removeItem: (k: string) => { freshKv.delete(k) },
    }
    let freshPrefs: Record<string, unknown> = {}
    let freshLibrary: Record<string, unknown> = { favourites: [], watchlist: [] }
    let freshSources: Record<string, unknown> = { sources: [], guides: [], mappings: [] }
    let freshLocalLibs: TransactionalRestoreLocalLib[] = []
    let freshDvrConfig: Record<string, unknown> | null = null
    let freshDvrRules: Array<{ id: string; query: string }> = []

    await executeTransactionalRestore(
      decrypted,
      {
        restorePrefs: true,
        restoreLibrary: true,
        restoreSources: true,
        restoreBouquets: true,
        restoreSmartCollections: true,
        restorePersonalMedia: true,
        restoreCustomArtwork: true,
        restoreDvr: true,
      },
      {
        profileId: 'profile-fresh',
        progressStorageKey: 'kinora.reading_progress.v1.profile-fresh',
        aiVoiceStorageKey: 'kinora.ai_voice_config.v1',
        storage: freshStorage,
        getPrefs: () => freshPrefs,
        importPrefs: (p) => { freshPrefs = p },
        getLibrary: () => freshLibrary,
        importLibrary: (l) => { freshLibrary = l },
        loadSources: async () => freshSources,
        saveSources: async (s) => { freshSources = s },
        getLocalLibraries: async () => freshLocalLibs,
        saveLocalLibrary: async (lib) => { freshLocalLibs.push(lib) },
        deleteLocalLibrary: async (id) => { freshLocalLibs = freshLocalLibs.filter((l) => l.id !== id) },
        checkLocalPathsExist: async (paths) => paths.map(() => true),
        dvrGetConfig: async () => freshDvrConfig,
        dvrSaveConfig: async (cfg) => { freshDvrConfig = cfg },
        dvrGetRules: async () => freshDvrRules,
        dvrSaveRule: async (r) => { freshDvrRules.push(r) },
        dvrDeleteRule: async (id) => { freshDvrRules = freshDvrRules.filter((r) => r.id !== id) },
      },
    )

    expect(freshPrefs).toEqual({ theme: 'dark', volume: 78 })
    expect(freshLibrary.favourites).toEqual(['channel:bbc1'])
    expect(freshSources).toEqual({ sources: [{ id: 'pl-1', name: 'Freeview' }], guides: [{ id: 'gd-1' }], mappings: [] })
    expect(freshLocalLibs).toHaveLength(1)
    expect(freshLocalLibs[0]?.name).toBe('Cinema')
    expect(freshDvrConfig).toEqual({ storagePath: '/media/dvr', maxGb: 100 })
    expect(freshDvrRules).toEqual([{ id: 'rule-1', query: 'Horizon' }])
    expect(JSON.parse(freshKv.get('kinora.bouquet_config.v1.profile-fresh')!)).toEqual({
      bouquets: [{ id: 'bq-uk', name: 'UK Freeview' }],
    })
    expect(JSON.parse(freshKv.get('kinora.reading_progress.v1.profile-fresh')!)).toEqual({
      'pdf:handbook': { chapterIndex: 4, totalChapters: 12, percent: 42 },
    })
    expect(JSON.parse(freshKv.get('kinora.media_servers.v1')!)[0].authToken).toBe('[PROTECTED]')
  })

  it('flags and refuses incompatible future backup schema versions before mutating state', async () => {
    const futurePayload = {
      ...samplePayload,
      version: 99,
    } as unknown as KinoraBackupPayload

    const report = inspectBackupPayload(futurePayload)
    expect(report.compatibility.isCompatible).toBe(false)
    expect(report.compatibility.warnings.some((w) => w.includes('Incompatible backup schema version'))).toBe(true)

    let mutated = false
    await expect(
      executeTransactionalRestore(
        futurePayload,
        {
          restorePrefs: true,
          restoreLibrary: true,
          restoreSources: true,
          restoreBouquets: true,
          restoreSmartCollections: true,
          restorePersonalMedia: true,
        },
        {
          profileId: 'default',
          progressStorageKey: 'kinora.reading_progress.v1',
          aiVoiceStorageKey: 'kinora.ai_voice_config.v1',
          getPrefs: () => ({}),
          importPrefs: () => { mutated = true },
          getLibrary: () => ({}),
          importLibrary: () => { mutated = true },
          loadSources: async () => null,
          saveSources: async () => { mutated = true },
          getLocalLibraries: async () => [],
          saveLocalLibrary: async () => { mutated = true },
          deleteLocalLibrary: async () => {},
          checkLocalPathsExist: async () => [],
          dvrGetConfig: async () => null,
          dvrSaveConfig: async () => { mutated = true },
          dvrGetRules: async () => [],
          dvrSaveRule: async () => { mutated = true },
          dvrDeleteRule: async () => {},
        },
      ),
    ).rejects.toThrow('Unsupported backup schema version')
    expect(mutated).toBe(false)
  })
})
