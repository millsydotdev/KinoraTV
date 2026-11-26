// encryptedBackup.ts - Secure AES-GCM 256-bit encrypted backup and migration engine for Kinora.
// Encapsulates application preferences, playlists, bouquets, smart collections, watch history,
// custom artwork, EPG mappings, and user settings into an encrypted .kinorabackup container.
// Built strictly on the standard Web Crypto API with zero runtime dependencies.
// Strictly adheres to project typography standards: zero em-dashes across all code and comments.

export interface BackupLocalLibrary {
  id: string
  name: string
  path?: string
  kind?: string
  folders?: string[]
  mediaType?: 'movies' | 'tv' | string
  lastScannedAt?: number | null
  autoScan?: boolean
  scanIntervalHours?: number
}

export interface KinoraBackupPayload {
  app: 'Kinora'
  version: 2 | 3
  exportedAt: string
  prefs: Record<string, unknown>
  library: Record<string, unknown>
  userPreferences?: Record<string, unknown>
  personalMedia?: unknown
  bouquets?: unknown
  xtreamFallback?: unknown
  smartCollections?: unknown
  savedSources?: unknown
  nativeSourcesState?: unknown
  guideMappings?: unknown
  customArtwork?: unknown
  channelOrganization?: unknown
  dvrRules?: unknown
  dvrConfig?: unknown
  localLibraries?: BackupLocalLibrary[]
  mediaServers?: unknown
  podcastSubscriptions?: unknown
  podcastProgress?: unknown
  opdsCatalogs?: unknown
  readingProgress?: unknown
  stalkerPortals?: unknown
  platformConfig?: {
    mode?: string
    serverUrl?: string | null
  }
  aiVoiceConfig?: {
    microphoneEnabled?: boolean
    spokenResponsesEnabled?: boolean
    voiceLanguage?: string
    providerKind?: string
    providerEndpoint?: string
    providerModel?: string
  }
  whatsNewSeen?: string[]
  checksum?: string
  deviceInfo?: {
    platform?: string
    version?: string
    arch?: string
  }
}

export interface BackupHistoryEntry {
  id: string
  action: 'export' | 'restore'
  timestamp: string
  version: string
  summary: string
}

export const BACKUP_HISTORY_STORAGE_KEY = 'kinora.backup_history.v1'

export function loadBackupHistory(): BackupHistoryEntry[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(BACKUP_HISTORY_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as BackupHistoryEntry[]) : []
  } catch {
    return []
  }
}

export function recordBackupHistory(action: 'export' | 'restore', version: string, summary: string): void {
  if (typeof localStorage === 'undefined') return
  try {
    const current = loadBackupHistory()
    const next: BackupHistoryEntry[] = [
      {
        id: `bk-${Date.now()}`,
        action,
        timestamp: new Date().toISOString(),
        version,
        summary,
      },
      ...current,
    ].slice(0, 12)
    localStorage.setItem(BACKUP_HISTORY_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage quota safety
  }
}

export interface BackupInspectionReport {
  app: 'Kinora'
  version: number
  exportedAt: string
  itemCounts: {
    favourites: number
    watchlist: number
    history: number
    collections: number
    sources: number
    guides: number
    guideMappings: number
    bouquets: number
    smartCollections: number
    customArtwork: number
    dvrRules: number
    localLibraries: number
    mediaServers: number
    podcastSubscriptions: number
    opdsCatalogs: number
    readingBooks?: number
    stalkerPortals: number
  }
  compatibility: {
    isCompatible: boolean
    migrationNeeded: boolean
    warnings: string[]
  }
}

export interface RestoreSelectionOptions {
  restorePrefs: boolean
  restoreLibrary: boolean
  restoreSources: boolean
  restoreBouquets: boolean
  restoreSmartCollections: boolean
  restorePersonalMedia: boolean
  restoreCustomArtwork?: boolean
  restoreDvr?: boolean
  restoreMediaServers?: boolean
  restorePodcasts?: boolean
  restoreOpds?: boolean
  restoreStalker?: boolean
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
 * Computes a SHA-256 hex digest of a JSON string for integrity verification.
 */
export async function computePayloadChecksum(payload: KinoraBackupPayload): Promise<string> {
  const clone = { ...payload }
  delete clone.checksum
  const str = JSON.stringify(clone)
  const bytes = new TextEncoder().encode(str)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  const hashArray = Array.from(new Uint8Array(hash))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
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

  // Calculate and attach tamper-evident checksum
  const checksum = await computePayloadChecksum(payload)
  const finalPayload: KinoraBackupPayload = {
    ...payload,
    version: 3,
    checksum,
  }

  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const key = await deriveEncryptionKey(passphrase, salt)

  const jsonString = JSON.stringify(finalPayload)
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
 * Decrypts a binary .kinorabackup container using the provided passphrase.
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

    // If checksum exists, verify it
    if (payload.checksum) {
      const computed = await computePayloadChecksum(payload)
      if (computed !== payload.checksum) {
        throw new Error('Integrity validation failed: backup contents have been altered or corrupted.')
      }
    }

    return payload
  } catch (err: unknown) {
    if (err instanceof Error && (err.message.includes('Invalid backup contents') || err.message.includes('Integrity validation'))) {
      throw err
    }
    throw new Error('Incorrect passphrase or damaged backup file.')
  }
}

/**
 * Inspects a decrypted backup payload and provides a structured pre-flight validation report.
 */
export function inspectBackupPayload(
  payload: KinoraBackupPayload,
  missingLocalPaths: string[] = [],
): BackupInspectionReport {
  const warnings: string[] = []
  let migrationNeeded = false
  let isCompatible = true

  if (!Number.isFinite(payload.version) || payload.version > 3) {
    warnings.push(
      `Incompatible backup schema version (v${payload.version}). Update Kinora to a newer version before restoring this archive.`,
    )
    isCompatible = false
  } else if (payload.version < 3) {
    warnings.push('Legacy backup schema detected (v2). Auto-upgraded to current schema during restore.')
    migrationNeeded = true
  }

  const lib = payload.library as Record<string, unknown> | undefined
  const favourites = Array.isArray(lib?.favourites) ? lib.favourites.length : 0
  const watchlist = Array.isArray(lib?.watchlist) ? lib.watchlist.length : 0
  const history = Array.isArray(lib?.history) ? lib.history.length : 0
  const collections = Array.isArray(lib?.collections) ? lib.collections.length : 0

  const nativeState = payload.nativeSourcesState as {
    sources?: { origin?: string }[]
    guides?: unknown[]
    mappings?: unknown[]
    xtreamSources?: unknown[]
  } | undefined

  let sources = 0
  if (Array.isArray(nativeState?.sources)) {
    sources = nativeState.sources.length
  } else if (Array.isArray(payload.savedSources)) {
    sources = payload.savedSources.length
  }

  const guides = Array.isArray(nativeState?.guides) ? nativeState.guides.length : 0
  const guideMappings = Array.isArray(nativeState?.mappings)
    ? nativeState.mappings.length
    : Array.isArray(payload.guideMappings)
    ? payload.guideMappings.length
    : 0

  if (Array.isArray(nativeState?.xtreamSources) && nativeState.xtreamSources.length > 0) {
    warnings.push(
      `Xtream providers (${nativeState.xtreamSources.length}): provider passwords are excluded from portable backups; reconnect accounts after restore.`,
    )
    migrationNeeded = true
  }

  if (Array.isArray(nativeState?.sources) && nativeState.sources.some((s) => s.origin === 'file')) {
    warnings.push('One or more file-based playlists are included: re-import the local .m3u file if stream URLs need refreshing.')
  }

  let bouquets = 0
  if (payload.bouquets && typeof payload.bouquets === 'object') {
    const bqObj = payload.bouquets as Record<string, unknown>
    if (Array.isArray(bqObj.bouquets)) bouquets = bqObj.bouquets.length
  }

  let smartCollections = 0
  if (Array.isArray(payload.smartCollections)) {
    smartCollections = payload.smartCollections.length
  }

  let customArtwork = 0
  if (payload.customArtwork && typeof payload.customArtwork === 'object') {
    customArtwork = Object.keys(payload.customArtwork as object).length
  }

  const dvrRules = Array.isArray(payload.dvrRules) ? payload.dvrRules.length : 0
  const localLibraries = Array.isArray(payload.localLibraries) ? payload.localLibraries.length : 0
  const mediaServers = Array.isArray(payload.mediaServers) ? payload.mediaServers.length : 0
  const podcastSubscriptions = Array.isArray(payload.podcastSubscriptions) ? payload.podcastSubscriptions.length : 0
  const opdsCatalogs = Array.isArray(payload.opdsCatalogs) ? payload.opdsCatalogs.length : 0
  const readingBooks =
    payload.readingProgress && typeof payload.readingProgress === 'object'
      ? Object.keys(payload.readingProgress as object).length
      : 0
  const stalkerPortals = Array.isArray(payload.stalkerPortals) ? payload.stalkerPortals.length : 0

  if (payload.platformConfig?.serverUrl) {
    warnings.push('Kinora Server URL is included without device auth tokens: re-pair this device with the server PIN after restore.')
    migrationNeeded = true
  }

  if (mediaServers > 0) {
    warnings.push(`Media servers (${mediaServers}): Access tokens and credentials should be re-verified after restore.`)
  }

  if (stalkerPortals > 0) {
    warnings.push(`Stalker portals (${stalkerPortals}): Portal MAC addresses are restored; verify portal authorization on your network.`)
  }

  if (missingLocalPaths.length > 0) {
    warnings.push(
      `Missing local media folder(s) on this device (${missingLocalPaths.length}): ${missingLocalPaths.slice(0, 3).join(', ')}. Update paths in Sources after restore.`,
    )
    migrationNeeded = true
  }

  if (payload.deviceInfo?.platform && typeof window !== 'undefined') {
    const currentPlatform = navigator.userAgent
    if (!currentPlatform.toLowerCase().includes(payload.deviceInfo.platform.toLowerCase())) {
      warnings.push(`Cross-device migration: Created on ${payload.deviceInfo.platform}, restoring on current system.`)
    }
  }

  return {
    app: payload.app,
    version: payload.version,
    exportedAt: payload.exportedAt,
    itemCounts: {
      favourites,
      watchlist,
      history,
      collections,
      sources,
      guides,
      guideMappings,
      bouquets,
      smartCollections,
      customArtwork,
      dvrRules,
      localLibraries,
      mediaServers,
      podcastSubscriptions,
      opdsCatalogs,
      readingBooks,
      stalkerPortals,
    },
    compatibility: {
      isCompatible,
      migrationNeeded,
      warnings,
    },
  }
}

/**
 * Helper to download an encrypted backup file as .kinorabackup.
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

export interface TransactionalRestoreStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

export interface TransactionalRestoreLocalLib {
  id: string
  name: string
  folders: string[]
  mediaType: 'movies' | 'tv'
  lastScannedAt: number | null
  autoScan: boolean
  scanIntervalHours: number
}

export interface TransactionalRestoreAdapters<TPrefs, TLibrary, TPersonalMedia, TSavedState, TDvrConfig, TDvrRule extends { id: string }> {
  profileId: string
  progressStorageKey: string
  aiVoiceStorageKey: string
  storage?: TransactionalRestoreStorage | null
  getPrefs: () => TPrefs
  importPrefs: (prefs: TPrefs) => void
  getLibrary: () => TLibrary
  importLibrary: (library: TLibrary) => void
  exportPersonalMedia?: () => TPersonalMedia | undefined
  importPersonalMedia?: (media: TPersonalMedia) => void
  loadSources: () => Promise<TSavedState | null>
  saveSources: (saved: TSavedState) => Promise<void>
  getLocalLibraries: () => Promise<TransactionalRestoreLocalLib[]>
  saveLocalLibrary: (lib: TransactionalRestoreLocalLib) => Promise<unknown>
  deleteLocalLibrary: (libraryId: string) => Promise<unknown>
  checkLocalPathsExist: (paths: string[]) => Promise<boolean[]>
  dvrGetConfig: () => Promise<TDvrConfig | null>
  dvrSaveConfig: (cfg: TDvrConfig) => Promise<unknown>
  dvrGetRules: () => Promise<TDvrRule[]>
  dvrSaveRule: (rule: TDvrRule) => Promise<unknown>
  dvrDeleteRule: (ruleId: string) => Promise<unknown>
}

/**
 * Executes a transactional restore across React store state, profile-scoped localStorage,
 * and native Rust stores (saved sources, local media libraries, DVR config & rules).
 * Snapshots every affected store before mutation and rolls back every store if any write fails.
 */
export async function executeTransactionalRestore<
  TPrefs,
  TLibrary,
  TPersonalMedia,
  TSavedState,
  TDvrConfig,
  TDvrRule extends { id: string },
>(
  payload: KinoraBackupPayload,
  options: RestoreSelectionOptions,
  adapters: TransactionalRestoreAdapters<TPrefs, TLibrary, TPersonalMedia, TSavedState, TDvrConfig, TDvrRule>,
): Promise<void> {
  const { profileId, progressStorageKey, aiVoiceStorageKey, storage } = adapters

  if (!Number.isFinite(payload.version) || payload.version > 3) {
    throw new Error(`Unsupported backup schema version (v${payload.version}). Update Kinora before restoring.`)
  }

  const managedKeys = [
    'kinora.userPreferences.v1',
    `kinora.userPreferences.v1.${profileId}`,
    'kinora.bouquet_config.v1.default',
    `kinora.bouquet_config.v1.${profileId}`,
    'kinora.xtream_fallback.v1',
    'kinora.smart_collections.v1.default',
    `kinora.smart_collections.v1.${profileId}`,
    'kinora.custom_artwork.v1',
    'kinora.media_servers.v1',
    'kinora.podcast.subscriptions.v1',
    'kinora.podcast.progress.v1',
    'kinora.opds.catalogs.v1',
    progressStorageKey,
    'kinora.stalker.portals.v1',
    'kinora.platform.mode.v1',
    'kinora.platform.serverUrl.v1',
    aiVoiceStorageKey,
    'kinora.whats_new_seen.v1',
  ]

  // 1. Snapshot all in-memory, localStorage, and native Rust stores before any mutation
  const prevPrefs = structuredClone(adapters.getPrefs())
  const prevLibrary = structuredClone(adapters.getLibrary())
  const prevPersonalMedia = adapters.exportPersonalMedia ? structuredClone(adapters.exportPersonalMedia()) : undefined
  const prevStorage = new Map<string, string | null>()
  if (storage) {
    for (const k of managedKeys) {
      prevStorage.set(k, storage.getItem(k))
    }
  }

  const willTouchSources = Boolean(options.restoreSources && payload.nativeSourcesState && typeof payload.nativeSourcesState === 'object')
  const willTouchLocalLibs = Boolean(options.restoreSources && Array.isArray(payload.localLibraries) && payload.localLibraries.length > 0)
  const willTouchDvrConfig = Boolean(options.restoreDvr !== false && payload.dvrConfig && typeof payload.dvrConfig === 'object')
  const willTouchDvrRules = Boolean(options.restoreDvr !== false && Array.isArray(payload.dvrRules) && payload.dvrRules.length > 0)

  const [prevNativeSources, prevLocalLibraries, prevDvrConfig, prevDvrRules] = await Promise.all([
    willTouchSources ? adapters.loadSources().catch(() => null) : Promise.resolve(null),
    willTouchLocalLibs ? adapters.getLocalLibraries().catch(() => []) : Promise.resolve([] as TransactionalRestoreLocalLib[]),
    willTouchDvrConfig ? adapters.dvrGetConfig().catch(() => null) : Promise.resolve(null),
    willTouchDvrRules ? adapters.dvrGetRules().catch(() => []) : Promise.resolve([] as TDvrRule[]),
  ])

  let sourcesMutated = false
  const mutatedLocalLibIds = new Set<string>()
  let dvrConfigMutated = false
  const mutatedDvrRuleIds = new Set<string>()
  let personalMediaMutated = false

  try {
    if (options.restorePrefs && payload.prefs && typeof payload.prefs === 'object') {
      adapters.importPrefs(payload.prefs as unknown as TPrefs)
    }

    if (options.restoreLibrary && payload.library && typeof payload.library === 'object') {
      adapters.importLibrary(payload.library as unknown as TLibrary)
    }

    if (options.restorePrefs && payload.userPreferences && storage) {
      storage.setItem(`kinora.userPreferences.v1.${profileId}`, JSON.stringify(payload.userPreferences))
      if (profileId === 'default') {
        storage.setItem('kinora.userPreferences.v1', JSON.stringify(payload.userPreferences))
      }
    }

    if (options.restorePersonalMedia && payload.personalMedia && adapters.importPersonalMedia) {
      adapters.importPersonalMedia(payload.personalMedia as TPersonalMedia)
      personalMediaMutated = true
    }

    if (options.restoreBouquets && payload.bouquets && storage) {
      storage.setItem(`kinora.bouquet_config.v1.${profileId}`, JSON.stringify(payload.bouquets))
    }

    if (payload.xtreamFallback && storage) {
      storage.setItem('kinora.xtream_fallback.v1', JSON.stringify(payload.xtreamFallback))
    }

    if (options.restoreSmartCollections && payload.smartCollections && storage) {
      storage.setItem(`kinora.smart_collections.v1.${profileId}`, JSON.stringify(payload.smartCollections))
    }

    if (options.restoreCustomArtwork !== false && payload.customArtwork && storage) {
      storage.setItem('kinora.custom_artwork.v1', JSON.stringify(payload.customArtwork))
    }

    if (willTouchSources) {
      await adapters.saveSources(payload.nativeSourcesState as TSavedState)
      sourcesMutated = true
    }

    if (willTouchLocalLibs && payload.localLibraries) {
      const paths = payload.localLibraries.flatMap((l) => (l.folders?.length ? l.folders : l.path ? [l.path] : []))
      const existsFlags = await adapters.checkLocalPathsExist(paths)
      for (let i = 0; i < payload.localLibraries.length; i++) {
        const lib = payload.localLibraries[i]
        const libFolders = lib?.folders?.length ? lib.folders : lib?.path ? [lib.path] : []
        if (lib && existsFlags[i] !== false) {
          await adapters.saveLocalLibrary({
            id: lib.id,
            name: lib.name,
            folders: libFolders,
            mediaType: (lib.mediaType as 'movies' | 'tv') || (lib.kind === 'tv' ? 'tv' : 'movies'),
            lastScannedAt: lib.lastScannedAt ?? null,
            autoScan: lib.autoScan ?? true,
            scanIntervalHours: lib.scanIntervalHours ?? 24,
          })
          mutatedLocalLibIds.add(lib.id)
        }
      }
    }

    if (willTouchDvrConfig) {
      await adapters.dvrSaveConfig(payload.dvrConfig as TDvrConfig)
      dvrConfigMutated = true
    }

    if (willTouchDvrRules && Array.isArray(payload.dvrRules)) {
      for (const rule of payload.dvrRules) {
        if (rule && typeof rule === 'object' && typeof (rule as { id?: unknown }).id === 'string') {
          const typedRule = rule as TDvrRule
          await adapters.dvrSaveRule(typedRule)
          mutatedDvrRuleIds.add(typedRule.id)
        }
      }
    }

    if (options.restoreMediaServers !== false && payload.mediaServers && storage) {
      storage.setItem('kinora.media_servers.v1', JSON.stringify(payload.mediaServers))
    }

    if (options.restorePodcasts !== false && storage) {
      if (payload.podcastSubscriptions) {
        storage.setItem('kinora.podcast.subscriptions.v1', JSON.stringify(payload.podcastSubscriptions))
      }
      if (payload.podcastProgress) {
        storage.setItem('kinora.podcast.progress.v1', JSON.stringify(payload.podcastProgress))
      }
    }

    if (options.restoreOpds !== false && storage) {
      if (payload.opdsCatalogs) {
        storage.setItem('kinora.opds.catalogs.v1', JSON.stringify(payload.opdsCatalogs))
      }
      if (payload.readingProgress) {
        storage.setItem(progressStorageKey, JSON.stringify(payload.readingProgress))
      }
    }

    if (options.restoreStalker !== false && payload.stalkerPortals && storage) {
      storage.setItem('kinora.stalker.portals.v1', JSON.stringify(payload.stalkerPortals))
    }

    if (options.restorePrefs && storage) {
      if (payload.platformConfig?.mode) {
        storage.setItem('kinora.platform.mode.v1', payload.platformConfig.mode)
      }
      if (payload.platformConfig?.serverUrl) {
        storage.setItem('kinora.platform.serverUrl.v1', payload.platformConfig.serverUrl)
      }
      if (payload.aiVoiceConfig) {
        storage.setItem(aiVoiceStorageKey, JSON.stringify(payload.aiVoiceConfig))
      }
      if (Array.isArray(payload.whatsNewSeen)) {
        storage.setItem('kinora.whats_new_seen.v1', JSON.stringify(payload.whatsNewSeen))
      }
    }
  } catch (err: unknown) {
    // Transactional rollback across React state, localStorage, AND native Rust stores
    try {
      if (mutatedDvrRuleIds.size > 0) {
        const prevRuleMap = new Map(prevDvrRules.map((r) => [r.id, r]))
        for (const id of mutatedDvrRuleIds) {
          if (!prevRuleMap.has(id)) {
            await adapters.dvrDeleteRule(id).catch(() => {})
          }
        }
        for (const rule of prevDvrRules) {
          await adapters.dvrSaveRule(rule).catch(() => {})
        }
      }

      if (dvrConfigMutated && prevDvrConfig) {
        await adapters.dvrSaveConfig(prevDvrConfig).catch(() => {})
      }

      if (mutatedLocalLibIds.size > 0) {
        const prevLibMap = new Map(prevLocalLibraries.map((l) => [l.id, l]))
        for (const id of mutatedLocalLibIds) {
          if (!prevLibMap.has(id)) {
            await adapters.deleteLocalLibrary(id).catch(() => {})
          }
        }
        for (const lib of prevLocalLibraries) {
          await adapters.saveLocalLibrary(lib).catch(() => {})
        }
      }

      if (sourcesMutated && prevNativeSources) {
        await adapters.saveSources(prevNativeSources).catch(() => {})
      }

      if (personalMediaMutated && prevPersonalMedia !== undefined && adapters.importPersonalMedia) {
        adapters.importPersonalMedia(prevPersonalMedia)
      }

      adapters.importPrefs(prevPrefs)
      adapters.importLibrary(prevLibrary)

      if (storage) {
        for (const [k, v] of prevStorage.entries()) {
          if (v === null) storage.removeItem(k)
          else storage.setItem(k, v)
        }
      }
    } catch {
      // Best effort rollback
    }
    throw err
  }
}
