// EncryptedBackupModal.tsx - Encrypted backup creation and multi-step restoration wizard.
// Supports schema v3 containers with pre-flight inspection, cross-device migration, and selective restore.
// Strictly adheres to project typography standards: zero em-dashes across all code and comments.

import { useContext, useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { ToastContext } from './Toast'
import { StoreContext, type Library, type Prefs } from '../state/store'
import {
  decryptBackupPayload,
  encryptBackupPayload,
  inspectBackupPayload,
  triggerBackupDownload,
  type KinoraBackupPayload,
  type BackupInspectionReport,
  type RestoreSelectionOptions,
} from '../lib/encryptedBackup'
import {
  APP_VERSION,
  checkLocalPathsExist,
  dvrSaveConfig,
  dvrSaveRule,
  getLocalLibraries,
  loadSources,
  saveLocalLibrary,
  saveSources,
  type DvrConfig,
  type SavedState,
  type SeriesRule,
} from '../lib/native'
import { recordBackupHistory } from '../lib/encryptedBackup'
import { AI_VOICE_CONFIG_STORAGE_KEY, loadAiVoiceConfig } from '../lib/voiceAndAgent'
import { loadAllBookProgress, readingProgressStorageKey } from '../lib/bookParser'
import './EncryptedBackupModal.css'

export interface EncryptedBackupModalProps {
  open: boolean
  onClose: () => void
  mode: 'export' | 'restore'
  onRestoreSuccess?: () => void
}

export function EncryptedBackupModal({
  open,
  onClose,
  mode,
  onRestoreSuccess,
}: EncryptedBackupModalProps) {
  const store = useContext(StoreContext)
  const pushToast = useContext(ToastContext)
  const toast = (msg: string) => {
    pushToast?.(msg)
  }

  // Common state
  const [passphrase, setPassphrase] = useState('')
  const [confirmPassphrase, setConfirmPassphrase] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Restore wizard state
  const [wizardStep, setWizardStep] = useState<1 | 2>(1)
  const [decryptedPayload, setDecryptedPayload] = useState<KinoraBackupPayload | null>(null)
  const [inspectionReport, setInspectionReport] = useState<BackupInspectionReport | null>(null)

  // Selective restore options
  const [options, setOptions] = useState<RestoreSelectionOptions>({
    restorePrefs: true,
    restoreLibrary: true,
    restoreSources: true,
    restoreBouquets: true,
    restoreSmartCollections: true,
    restorePersonalMedia: true,
    restoreCustomArtwork: true,
    restoreDvr: true,
  })

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setPassphrase('')
      setConfirmPassphrase('')
      setSelectedFile(null)
      setErrorMsg(null)
      setBusy(false)
      setWizardStep(1)
      setDecryptedPayload(null)
      setInspectionReport(null)
    }
  }, [open, mode])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    if (passphrase.length < 4) {
      setErrorMsg('Passphrase must be at least 4 characters long.')
      return
    }

    if (passphrase !== confirmPassphrase) {
      setErrorMsg('Passphrases do not match.')
      return
    }

    if (!store) {
      setErrorMsg('Store context is unavailable.')
      return
    }

    setBusy(true)
    try {
      const profileId = store.activeProfile?.id ?? 'default'
      let bouquetData: unknown = null
      let xtreamFallbackData: unknown = null
      let smartCollectionsData: unknown = null
      let customArtworkData: unknown = null

      try {
        const bqRaw =
          typeof localStorage !== 'undefined'
            ? localStorage.getItem(`kinora.bouquet_config.v1.${profileId}`) ?? localStorage.getItem('kinora.bouquet_config.v1.default')
            : null
        if (bqRaw) bouquetData = JSON.parse(bqRaw)
      } catch {}

      try {
        const xtRaw = typeof localStorage !== 'undefined' ? localStorage.getItem('kinora.xtream_fallback.v1') : null
        if (xtRaw) xtreamFallbackData = JSON.parse(xtRaw)
      } catch {}

      try {
        const scRaw =
          typeof localStorage !== 'undefined'
            ? localStorage.getItem(`kinora.smart_collections.v1.${profileId}`) ?? localStorage.getItem('kinora.smart_collections.v1.default')
            : null
        if (scRaw) smartCollectionsData = JSON.parse(scRaw)
      } catch {}

      try {
        const artRaw = typeof localStorage !== 'undefined' ? localStorage.getItem('kinora.custom_artwork.v1') : null
        if (artRaw) customArtworkData = JSON.parse(artRaw)
      } catch {}

      let mediaServersData: unknown = null
      let podcastData: unknown = null
      let podcastProgressData: unknown = null
      let opdsData: unknown = null
      let stalkerData: unknown = null
      let platformConfigData: KinoraBackupPayload['platformConfig'] = undefined
      let whatsNewSeenData: string[] | undefined = undefined

      try {
        const msRaw = typeof localStorage !== 'undefined' ? localStorage.getItem('kinora.media_servers.v1') : null
        if (msRaw) {
          const parsed = JSON.parse(msRaw)
          if (Array.isArray(parsed)) {
            mediaServersData = parsed.map((s: Record<string, unknown>) => ({
              ...s,
              password: s.password ? '[PROTECTED]' : undefined,
              authToken: s.authToken ? '[PROTECTED]' : undefined,
            }))
          } else {
            mediaServersData = parsed
          }
        }
      } catch {}

      try {
        const podRaw = typeof localStorage !== 'undefined' ? localStorage.getItem('kinora.podcast.subscriptions.v1') : null
        if (podRaw) podcastData = JSON.parse(podRaw)
      } catch {}

      try {
        const podProgRaw = typeof localStorage !== 'undefined' ? localStorage.getItem('kinora.podcast.progress.v1') : null
        if (podProgRaw) podcastProgressData = JSON.parse(podProgRaw)
      } catch {}

      try {
        const opdsRaw = typeof localStorage !== 'undefined' ? localStorage.getItem('kinora.opds.catalogs.v1') : null
        if (opdsRaw) opdsData = JSON.parse(opdsRaw)
      } catch {}

      try {
        const stkRaw = typeof localStorage !== 'undefined' ? localStorage.getItem('kinora.stalker.portals.v1') : null
        if (stkRaw) stalkerData = JSON.parse(stkRaw)
      } catch {}

      try {
        if (typeof localStorage !== 'undefined') {
          const modeVal = localStorage.getItem('kinora.platform.mode.v1')
          const serverUrlVal = localStorage.getItem('kinora.platform.serverUrl.v1')
          if (modeVal || serverUrlVal) {
            platformConfigData = {
              mode: modeVal ?? 'standalone',
              serverUrl: serverUrlVal ?? null,
            }
          }
          const wnRaw = localStorage.getItem('kinora.whats_new_seen.v1')
          if (wnRaw) {
            const parsedWn = JSON.parse(wnRaw)
            if (Array.isArray(parsedWn)) whatsNewSeenData = parsedWn.filter((v): v is string => typeof v === 'string')
          }
        }
      } catch {}

      const readingProgressData = loadAllBookProgress(profileId)
      const aiVoiceData = loadAiVoiceConfig()

      const [nativeLoaded, localLibs] = await Promise.all([
        loadSources().catch(() => null),
        getLocalLibraries().catch(() => []),
      ])

      const payload: KinoraBackupPayload = {
        app: 'Kinora',
        version: 3,
        exportedAt: new Date().toISOString(),
        prefs: store.prefs as unknown as Record<string, unknown>,
        library: store.library as unknown as Record<string, unknown>,
        userPreferences: store.userPreferences?.preferences as unknown as Record<string, unknown>,
        personalMedia: store.mediaLibrary?.exportPersonalLibrary?.(),
        bouquets: bouquetData,
        xtreamFallback: xtreamFallbackData,
        smartCollections: smartCollectionsData,
        customArtwork: customArtworkData,
        dvrRules: store.seriesRules ?? [],
        dvrConfig: store.dvrConfig ?? null,
        localLibraries: localLibs.map((lib) => ({
          id: lib.id,
          name: lib.name,
          folders: lib.folders,
          mediaType: lib.mediaType,
          lastScannedAt: lib.lastScannedAt,
          autoScan: lib.autoScan,
          scanIntervalHours: lib.scanIntervalHours,
        })),
        mediaServers: mediaServersData,
        podcastSubscriptions: podcastData,
        podcastProgress: podcastProgressData,
        opdsCatalogs: opdsData,
        readingProgress: readingProgressData,
        stalkerPortals: stalkerData,
        platformConfig: platformConfigData,
        aiVoiceConfig: aiVoiceData,
        whatsNewSeen: whatsNewSeenData,
        nativeSourcesState: nativeLoaded ?? undefined,
        guideMappings: store.mappings ?? [],
        savedSources: store.playlists.map((p) => ({
          id: p.id,
          name: p.name,
          label: p.label,
          origin: p.origin,
          channelCount: p.channels.length,
          addedAt: p.addedAt,
        })),
        deviceInfo: {
          platform: typeof navigator !== 'undefined' ? navigator.platform : 'Unknown',
          version: APP_VERSION,
        },
      }

      const encryptedBuffer = await encryptBackupPayload(payload, passphrase)
      triggerBackupDownload(encryptedBuffer, 'kinora-vault')
      recordBackupHistory('export', APP_VERSION, `Exported ${store.playlists.length} sources and ${store.library.favourites.length} favourites`)
      toast('Encrypted backup (.kinorabackup) downloaded successfully.')
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Encryption failed.'
      setErrorMsg(msg)
    } finally {
      setBusy(false)
    }
  }

  const handleInspect = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    if (!selectedFile) {
      setErrorMsg('Please select a .kinorabackup file to restore.')
      return
    }

    if (!passphrase) {
      setErrorMsg('Please enter the decryption passphrase.')
      return
    }

    setBusy(true)
    try {
      const buffer = await selectedFile.arrayBuffer()
      const payload = await decryptBackupPayload(buffer, passphrase)

      const missingPaths: string[] = []
      if (Array.isArray(payload.localLibraries) && payload.localLibraries.length > 0) {
        const paths = payload.localLibraries.flatMap((l) => l.folders?.length ? l.folders : (l.path ? [l.path] : []))
        const existsFlags = await checkLocalPathsExist(paths)
        paths.forEach((p, idx) => {
          if (existsFlags[idx] === false) missingPaths.push(p)
        })
      }

      const report = inspectBackupPayload(payload, missingPaths)

      setDecryptedPayload(payload)
      setInspectionReport(report)
      setWizardStep(2)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Decryption failed.'
      setErrorMsg(msg)
    } finally {
      setBusy(false)
    }
  }

  const handleExecuteRestore = async () => {
    if (!decryptedPayload || !store) return
    setErrorMsg(null)
    setBusy(true)

    const profileId = store.activeProfile?.id ?? 'default'
    const progressKey = readingProgressStorageKey(profileId)
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
      progressKey,
      'kinora.stalker.portals.v1',
      'kinora.platform.mode.v1',
      'kinora.platform.serverUrl.v1',
      AI_VOICE_CONFIG_STORAGE_KEY,
      'kinora.whats_new_seen.v1',
    ]

    // Transactional snapshot so any mid-restore failure rolls back cleanly without partial corruption
    const prevPrefs = { ...store.prefs }
    const prevLibrary = { ...store.library }
    const prevStorage = new Map<string, string | null>()
    if (typeof localStorage !== 'undefined') {
      for (const k of managedKeys) {
        prevStorage.set(k, localStorage.getItem(k))
      }
    }

    try {
      if (options.restorePrefs && decryptedPayload.prefs && typeof decryptedPayload.prefs === 'object') {
        store.importPrefs(decryptedPayload.prefs as unknown as Prefs)
      }

      if (options.restoreLibrary && decryptedPayload.library && typeof decryptedPayload.library === 'object') {
        store.importLibrary(decryptedPayload.library as unknown as Library)
      }

      if (options.restorePrefs && decryptedPayload.userPreferences && typeof localStorage !== 'undefined') {
        localStorage.setItem(`kinora.userPreferences.v1.${profileId}`, JSON.stringify(decryptedPayload.userPreferences))
        if (profileId === 'default') {
          localStorage.setItem('kinora.userPreferences.v1', JSON.stringify(decryptedPayload.userPreferences))
        }
      }

      if (options.restorePersonalMedia && decryptedPayload.personalMedia && store.mediaLibrary?.importPersonalLibrary) {
        store.mediaLibrary.importPersonalLibrary(
          decryptedPayload.personalMedia as Parameters<typeof store.mediaLibrary.importPersonalLibrary>[0]
        )
      }

      if (options.restoreBouquets && decryptedPayload.bouquets && typeof localStorage !== 'undefined') {
        localStorage.setItem(`kinora.bouquet_config.v1.${profileId}`, JSON.stringify(decryptedPayload.bouquets))
      }

      if (decryptedPayload.xtreamFallback && typeof localStorage !== 'undefined') {
        localStorage.setItem('kinora.xtream_fallback.v1', JSON.stringify(decryptedPayload.xtreamFallback))
      }

      if (options.restoreSmartCollections && decryptedPayload.smartCollections && typeof localStorage !== 'undefined') {
        localStorage.setItem(`kinora.smart_collections.v1.${profileId}`, JSON.stringify(decryptedPayload.smartCollections))
      }

      if (options.restoreCustomArtwork !== false && decryptedPayload.customArtwork && typeof localStorage !== 'undefined') {
        localStorage.setItem('kinora.custom_artwork.v1', JSON.stringify(decryptedPayload.customArtwork))
      }

      if (options.restoreSources && decryptedPayload.nativeSourcesState && typeof decryptedPayload.nativeSourcesState === 'object') {
        await saveSources(decryptedPayload.nativeSourcesState as SavedState)
      }

      if (options.restoreSources && Array.isArray(decryptedPayload.localLibraries) && decryptedPayload.localLibraries.length > 0) {
        const paths = decryptedPayload.localLibraries.flatMap((l) => l.folders?.length ? l.folders : (l.path ? [l.path] : []))
        const existsFlags = await checkLocalPathsExist(paths)
        for (let i = 0; i < decryptedPayload.localLibraries.length; i++) {
          const lib = decryptedPayload.localLibraries[i]
          const libFolders = lib?.folders?.length ? lib.folders : (lib?.path ? [lib.path] : [])
          if (lib && existsFlags[i] !== false) {
            await saveLocalLibrary({
              id: lib.id,
              name: lib.name,
              folders: libFolders,
              mediaType: (lib.mediaType as 'movies' | 'tv') || (lib.kind === 'tv' ? 'tv' : 'movies'),
              lastScannedAt: lib.lastScannedAt ?? null,
              autoScan: lib.autoScan ?? true,
              scanIntervalHours: lib.scanIntervalHours ?? 24,
            }).catch(() => {})
          }
        }
      }

      if (options.restoreDvr !== false) {
        if (decryptedPayload.dvrConfig && typeof decryptedPayload.dvrConfig === 'object') {
          await dvrSaveConfig(decryptedPayload.dvrConfig as DvrConfig).catch(() => {})
        }
        if (Array.isArray(decryptedPayload.dvrRules)) {
          for (const rule of decryptedPayload.dvrRules) {
            if (rule && typeof rule === 'object') {
              await dvrSaveRule(rule as SeriesRule).catch(() => {})
            }
          }
        }
      }

      if (options.restoreMediaServers !== false && decryptedPayload.mediaServers && typeof localStorage !== 'undefined') {
        localStorage.setItem('kinora.media_servers.v1', JSON.stringify(decryptedPayload.mediaServers))
      }

      if (options.restorePodcasts !== false && typeof localStorage !== 'undefined') {
        if (decryptedPayload.podcastSubscriptions) {
          localStorage.setItem('kinora.podcast.subscriptions.v1', JSON.stringify(decryptedPayload.podcastSubscriptions))
        }
        if (decryptedPayload.podcastProgress) {
          localStorage.setItem('kinora.podcast.progress.v1', JSON.stringify(decryptedPayload.podcastProgress))
        }
      }

      if (options.restoreOpds !== false && typeof localStorage !== 'undefined') {
        if (decryptedPayload.opdsCatalogs) {
          localStorage.setItem('kinora.opds.catalogs.v1', JSON.stringify(decryptedPayload.opdsCatalogs))
        }
        if (decryptedPayload.readingProgress) {
          localStorage.setItem(progressKey, JSON.stringify(decryptedPayload.readingProgress))
        }
      }

      if (options.restoreStalker !== false && decryptedPayload.stalkerPortals && typeof localStorage !== 'undefined') {
        localStorage.setItem('kinora.stalker.portals.v1', JSON.stringify(decryptedPayload.stalkerPortals))
      }

      if (options.restorePrefs && typeof localStorage !== 'undefined') {
        if (decryptedPayload.platformConfig?.mode) {
          localStorage.setItem('kinora.platform.mode.v1', decryptedPayload.platformConfig.mode)
        }
        if (decryptedPayload.platformConfig?.serverUrl) {
          localStorage.setItem('kinora.platform.serverUrl.v1', decryptedPayload.platformConfig.serverUrl)
        }
        if (decryptedPayload.aiVoiceConfig) {
          localStorage.setItem(AI_VOICE_CONFIG_STORAGE_KEY, JSON.stringify(decryptedPayload.aiVoiceConfig))
        }
        if (Array.isArray(decryptedPayload.whatsNewSeen)) {
          localStorage.setItem('kinora.whats_new_seen.v1', JSON.stringify(decryptedPayload.whatsNewSeen))
        }
      }

      recordBackupHistory('restore', decryptedPayload.deviceInfo?.version ?? APP_VERSION, `Restored backup from ${decryptedPayload.exportedAt.slice(0, 10)}`)
      toast('Encrypted backup restored and migrated successfully.')
      onRestoreSuccess?.()
      onClose()
    } catch (err: unknown) {
      // Atomic rollback of all mutated state
      try {
        store.importPrefs(prevPrefs)
        store.importLibrary(prevLibrary)
        if (typeof localStorage !== 'undefined') {
          for (const [k, v] of prevStorage.entries()) {
            if (v === null) localStorage.removeItem(k)
            else localStorage.setItem(k, v)
          }
        }
      } catch {
        // Best effort rollback
      }
      const msg = err instanceof Error ? err.message : 'Restore failed.'
      setErrorMsg(`Restore failed and previous settings were rolled back safely: ${msg}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="enc-backup-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="enc-backup-title"
    >
      <div className="enc-backup-modal" onClick={(e) => e.stopPropagation()}>
        <div className="enc-backup-header">
          <div className="enc-backup-title" id="enc-backup-title">
            <Icon name={mode === 'export' ? 'lock' : 'shield'} size={20} />
            <span>
              {mode === 'export'
                ? 'Create Encrypted Backup (.kinorabackup)'
                : 'Restore Encrypted Backup (.kinorabackup)'}
            </span>
          </div>
          <button
            type="button"
            className="enc-backup-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        {mode === 'export' ? (
          <form onSubmit={handleExport}>
            <div className="enc-backup-body">
              <p className="enc-backup-note">
                Protect your configuration, sources, bouquets, and media library with AES-GCM 256-bit encryption. A passphrase is required to restore this file on any device.
              </p>

              <div className="enc-backup-field">
                <label className="enc-backup-label" htmlFor="enc-pass">
                  Passphrase (minimum 4 characters)
                </label>
                <input
                  id="enc-pass"
                  type="password"
                  className="enc-backup-input"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Enter a secure passphrase..."
                  autoFocus
                  required
                />
              </div>

              <div className="enc-backup-field">
                <label className="enc-backup-label" htmlFor="enc-pass-confirm">
                  Confirm Passphrase
                </label>
                <input
                  id="enc-pass-confirm"
                  type="password"
                  className="enc-backup-input"
                  value={confirmPassphrase}
                  onChange={(e) => setConfirmPassphrase(e.target.value)}
                  placeholder="Repeat your passphrase..."
                  required
                />
              </div>

              {errorMsg && <div className="enc-backup-error">{errorMsg}</div>}
            </div>

            <div className="enc-backup-footer">
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={onClose}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-small"
                disabled={busy || !passphrase || !confirmPassphrase}
              >
                {busy ? 'Encrypting...' : 'Export Vault File'}
              </button>
            </div>
          </form>
        ) : wizardStep === 1 ? (
          <form onSubmit={handleInspect}>
            <div className="enc-backup-body">
              <div className="enc-wizard-step">Step 1 of 2: Unlock Backup File</div>
              <p className="enc-backup-note">
                Select your .kinorabackup container and enter the decryption passphrase to inspect and migrate your data.
              </p>

              <div className="enc-backup-field">
                <label className="enc-backup-label">Select Backup File</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".kinorabackup,application/octet-stream"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) setSelectedFile(f)
                  }}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Icon name="folder" size={16} />
                  {selectedFile ? selectedFile.name : 'Browse for .kinorabackup file...'}
                </button>
              </div>

              <div className="enc-backup-field">
                <label className="enc-backup-label" htmlFor="restore-pass">
                  Decryption Passphrase
                </label>
                <input
                  id="restore-pass"
                  type="password"
                  className="enc-backup-input"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Enter the passphrase used during export..."
                  autoFocus
                  required
                />
              </div>

              {errorMsg && <div className="enc-backup-error">{errorMsg}</div>}
            </div>

            <div className="enc-backup-footer">
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={onClose}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-small"
                disabled={busy || !selectedFile || !passphrase}
              >
                {busy ? 'Verifying...' : 'Inspect Backup & Continue'}
              </button>
            </div>
          </form>
        ) : (
          <div>
            <div className="enc-backup-body">
              <div className="enc-wizard-step">Step 2 of 2: Pre-Flight Review & Migration</div>

              {inspectionReport?.compatibility.warnings.length ? (
                <div className="enc-warning-box">
                  {inspectionReport.compatibility.warnings.map((w, idx) => (
                    <div key={idx}>{w}</div>
                  ))}
                </div>
              ) : null}

              <div className="enc-inspection-grid">
                <div className="enc-stat-card">
                  <span className="enc-stat-val">{inspectionReport?.itemCounts.sources ?? 0}</span>
                  <span className="enc-stat-lbl">Sources</span>
                </div>
                <div className="enc-stat-card">
                  <span className="enc-stat-val">{inspectionReport?.itemCounts.guides ?? 0}</span>
                  <span className="enc-stat-lbl">EPG Guides</span>
                </div>
                <div className="enc-stat-card">
                  <span className="enc-stat-val">{inspectionReport?.itemCounts.favourites ?? 0}</span>
                  <span className="enc-stat-lbl">Favourites</span>
                </div>
                <div className="enc-stat-card">
                  <span className="enc-stat-val">{inspectionReport?.itemCounts.history ?? 0}</span>
                  <span className="enc-stat-lbl">History & Resume</span>
                </div>
                <div className="enc-stat-card">
                  <span className="enc-stat-val">{inspectionReport?.itemCounts.watchlist ?? 0}</span>
                  <span className="enc-stat-lbl">Watchlist Items</span>
                </div>
                <div className="enc-stat-card">
                  <span className="enc-stat-val">{inspectionReport?.itemCounts.bouquets ?? 0}</span>
                  <span className="enc-stat-lbl">Bouquets</span>
                </div>
                <div className="enc-stat-card">
                  <span className="enc-stat-val">{inspectionReport?.itemCounts.customArtwork ?? 0}</span>
                  <span className="enc-stat-lbl">Custom Artwork</span>
                </div>
                <div className="enc-stat-card">
                  <span className="enc-stat-val">{inspectionReport?.itemCounts.dvrRules ?? 0}</span>
                  <span className="enc-stat-lbl">DVR Rules</span>
                </div>
              </div>

              <label className="enc-backup-label" style={{ marginTop: '4px' }}>
                Select Components to Restore
              </label>
              <div className="enc-options-list">
                <label className="enc-checkbox-row">
                  <input
                    type="checkbox"
                    checked={options.restoreSources}
                    onChange={(e) => setOptions({ ...options, restoreSources: e.target.checked })}
                  />
                  <span>Sources, Playlists, EPG Guides, Mappings, and Local Folders</span>
                </label>
                <label className="enc-checkbox-row">
                  <input
                    type="checkbox"
                    checked={options.restorePrefs}
                    onChange={(e) => setOptions({ ...options, restorePrefs: e.target.checked })}
                  />
                  <span>Preferences, Themes, and Playback Calibration</span>
                </label>
                <label className="enc-checkbox-row">
                  <input
                    type="checkbox"
                    checked={options.restoreLibrary}
                    onChange={(e) => setOptions({ ...options, restoreLibrary: e.target.checked })}
                  />
                  <span>Personal Library (Favourites, Watchlist, Watch Progress)</span>
                </label>
                <label className="enc-checkbox-row">
                  <input
                    type="checkbox"
                    checked={options.restoreBouquets}
                    onChange={(e) => setOptions({ ...options, restoreBouquets: e.target.checked })}
                  />
                  <span>Custom Bouquets and Channel Packages</span>
                </label>
                <label className="enc-checkbox-row">
                  <input
                    type="checkbox"
                    checked={options.restoreSmartCollections}
                    onChange={(e) => setOptions({ ...options, restoreSmartCollections: e.target.checked })}
                  />
                  <span>Smart Collections and Dynamic Groupings</span>
                </label>
                <label className="enc-checkbox-row">
                  <input
                    type="checkbox"
                    checked={options.restoreCustomArtwork !== false}
                    onChange={(e) => setOptions({ ...options, restoreCustomArtwork: e.target.checked })}
                  />
                  <span>Custom Artwork Assignments</span>
                </label>
                <label className="enc-checkbox-row">
                  <input
                    type="checkbox"
                    checked={options.restoreDvr !== false}
                    onChange={(e) => setOptions({ ...options, restoreDvr: e.target.checked })}
                  />
                  <span>DVR Recording Rules and Storage Configuration</span>
                </label>
              </div>

              {errorMsg && <div className="enc-backup-error">{errorMsg}</div>}
            </div>

            <div className="enc-backup-footer">
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => setWizardStep(1)}
                disabled={busy}
              >
                Back
              </button>
              <button
                type="button"
                className="btn btn-primary btn-small"
                onClick={handleExecuteRestore}
                disabled={busy}
              >
                {busy ? 'Restoring...' : 'Apply Restoration & Migrate'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
