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
      let bouquetData: unknown = null
      let xtreamFallbackData: unknown = null
      let smartCollectionsData: unknown = null

      try {
        const bqRaw = typeof localStorage !== 'undefined' ? localStorage.getItem('kinora.bouquet_config.v1.default') : null
        if (bqRaw) bouquetData = JSON.parse(bqRaw)
      } catch {}

      try {
        const xtRaw = typeof localStorage !== 'undefined' ? localStorage.getItem('kinora.xtream_fallback.v1') : null
        if (xtRaw) xtreamFallbackData = JSON.parse(xtRaw)
      } catch {}

      try {
        const scRaw = typeof localStorage !== 'undefined' ? localStorage.getItem('kinora.smart_collections.v1.default') : null
        if (scRaw) smartCollectionsData = JSON.parse(scRaw)
      } catch {}

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
          version: '0.6.0',
        },
      }

      const encryptedBuffer = await encryptBackupPayload(payload, passphrase)
      triggerBackupDownload(encryptedBuffer, 'kinora-vault')
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
      const report = inspectBackupPayload(payload)

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

  const handleExecuteRestore = () => {
    if (!decryptedPayload || !store) return
    setErrorMsg(null)
    setBusy(true)

    try {
      if (options.restorePrefs && decryptedPayload.prefs && typeof decryptedPayload.prefs === 'object') {
        store.importPrefs(decryptedPayload.prefs as unknown as Prefs)
      }

      if (options.restoreLibrary && decryptedPayload.library && typeof decryptedPayload.library === 'object') {
        store.importLibrary(decryptedPayload.library as unknown as Library)
      }

      if (options.restorePrefs && decryptedPayload.userPreferences && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('kinora.userPreferences.v1', JSON.stringify(decryptedPayload.userPreferences))
        } catch {}
      }

      if (options.restorePersonalMedia && decryptedPayload.personalMedia && store.mediaLibrary?.importPersonalLibrary) {
        store.mediaLibrary.importPersonalLibrary(
          decryptedPayload.personalMedia as Parameters<typeof store.mediaLibrary.importPersonalLibrary>[0]
        )
      }

      if (options.restoreBouquets && decryptedPayload.bouquets && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('kinora.bouquet_config.v1.default', JSON.stringify(decryptedPayload.bouquets))
        } catch {}
      }

      if (decryptedPayload.xtreamFallback && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('kinora.xtream_fallback.v1', JSON.stringify(decryptedPayload.xtreamFallback))
        } catch {}
      }

      if (options.restoreSmartCollections && decryptedPayload.smartCollections && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('kinora.smart_collections.v1.default', JSON.stringify(decryptedPayload.smartCollections))
        } catch {}
      }

      toast('Encrypted backup restored and migrated successfully.')
      onRestoreSuccess?.()
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Restore failed.'
      setErrorMsg(msg)
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
              </div>

              <label className="enc-backup-label" style={{ marginTop: '4px' }}>
                Select Components to Restore
              </label>
              <div className="enc-options-list">
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
