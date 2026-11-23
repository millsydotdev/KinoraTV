import { useContext, useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'
import { ToastContext } from './Toast'
import { StoreContext, type Library, type Prefs } from '../state/store'
import {
  decryptBackupPayload,
  encryptBackupPayload,
  triggerBackupDownload,
  type KinoraBackupPayload,
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

  const [passphrase, setPassphrase] = useState('')
  const [confirmPassphrase, setConfirmPassphrase] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setPassphrase('')
      setConfirmPassphrase('')
      setSelectedFile(null)
      setErrorMsg(null)
      setBusy(false)
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
        version: 2,
        exportedAt: new Date().toISOString(),
        prefs: store.prefs as unknown as Record<string, unknown>,
        library: store.library as unknown as Record<string, unknown>,
        userPreferences: store.userPreferences?.preferences as unknown as Record<string, unknown>,
        personalMedia: store.mediaLibrary?.exportPersonalLibrary?.(),
        bouquets: bouquetData,
        xtreamFallback: xtreamFallbackData,
        smartCollections: smartCollectionsData,
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

  const handleRestore = async (e: React.FormEvent) => {
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

    if (!store) {
      setErrorMsg('Store context is unavailable.')
      return
    }

    setBusy(true)
    try {
      const buffer = await selectedFile.arrayBuffer()
      const payload = await decryptBackupPayload(buffer, passphrase)

      if (payload.prefs && typeof payload.prefs === 'object') {
        store.importPrefs(payload.prefs as unknown as Prefs)
      }
      if (payload.library && typeof payload.library === 'object') {
        store.importLibrary(payload.library as unknown as Library)
      }
      if (payload.userPreferences && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('kinora.userPreferences.v1', JSON.stringify(payload.userPreferences))
        } catch {}
      }
      if (payload.personalMedia && store.mediaLibrary?.importPersonalLibrary) {
        store.mediaLibrary.importPersonalLibrary(payload.personalMedia as Parameters<typeof store.mediaLibrary.importPersonalLibrary>[0])
      }
      if (payload.bouquets && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('kinora.bouquet_config.v1.default', JSON.stringify(payload.bouquets))
        } catch {}
      }
      if (payload.xtreamFallback && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('kinora.xtream_fallback.v1', JSON.stringify(payload.xtreamFallback))
        } catch {}
      }
      if (payload.smartCollections && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('kinora.smart_collections.v1.default', JSON.stringify(payload.smartCollections))
        } catch {}
      }

      toast('Encrypted backup restored successfully.')
      onRestoreSuccess?.()
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Decryption failed.'
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
                Protect your configuration, sources, bouquets, and media library with AES-GCM 256-bit encryption. A passphrase is required to restore this file.
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
                <label className="enc-backup-label" htmlFor="enc-confirm-pass">
                  Confirm Passphrase
                </label>
                <input
                  id="enc-confirm-pass"
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
                disabled={busy}
              >
                <Icon name="download" size={14} />
                {busy ? 'Encrypting...' : 'Export .kinorabackup'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleRestore}>
            <div className="enc-backup-body">
              <p className="enc-backup-note">
                Select your encrypted <code>.kinorabackup</code> file and provide the original passphrase to restore your preferences and media library.
              </p>

              <div className="enc-backup-field">
                <label className="enc-backup-label">Select Backup File</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".kinorabackup"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setSelectedFile(e.target.files[0])
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ alignSelf: 'flex-start' }}
                >
                  <Icon name="upload" size={14} />
                  {selectedFile ? selectedFile.name : 'Choose .kinorabackup file...'}
                </button>
              </div>

              <div className="enc-backup-field">
                <label className="enc-backup-label" htmlFor="dec-pass">
                  Decryption Passphrase
                </label>
                <input
                  id="dec-pass"
                  type="password"
                  className="enc-backup-input"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Enter passphrase used during export..."
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
                disabled={busy || !selectedFile}
              >
                <Icon name="refresh" size={14} />
                {busy ? 'Decrypting...' : 'Decrypt & Restore'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
