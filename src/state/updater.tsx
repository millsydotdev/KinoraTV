import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { APP_VERSION, checkForUpdates, inNativeShell, installUpdate, restartApp } from '../lib/native'
import {
  createInitialUpdaterState,
  loadPendingUpdateVersion,
  recordUpdateHistory,
  reduceUpdateCheckResult,
  saveAutoCheckEnabled,
  saveDismissedUpdateVersion,
  savePendingUpdateVersion,
  saveUpdateChannel,
  shouldShowUpdateNotification,
  updateDismissalKey,
  type UpdateChannel,
  type UpdaterState,
} from '../lib/updaterState'

const STARTUP_CHECK_DELAY_MS = 12_000
const PERIODIC_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 hours

export interface UpdaterContextValue {
  state: UpdaterState
  notificationVisible: boolean
  isBusy: boolean
  setChannel: (channel: UpdateChannel) => void
  setAutoCheckEnabled: (enabled: boolean) => void
  checkNow: (opts?: { force?: boolean; silent?: boolean }) => Promise<void>
  downloadAndInstall: () => Promise<{ success: boolean; error?: string }>
  restartNow: () => Promise<void>
  dismissNotification: () => void
  /** For tests or diagnostics: clears any prior dismissal for the current available version. */
  resetDismissal: () => void
}

const UpdaterContext = createContext<UpdaterContextValue | null>(null)

export function UpdaterProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UpdaterState>(() => createInitialUpdaterState(APP_VERSION))
  const checkInFlightRef = useRef(false)
  const installInFlightRef = useRef(false)
  const channelRef = useRef<UpdateChannel>(state.channel)
  channelRef.current = state.channel

  // Confirm post-restart installation on startup when running the newly installed version
  useEffect(() => {
    const pending = loadPendingUpdateVersion()
    if (pending && pending === APP_VERSION) {
      recordUpdateHistory({
        fromVersion: 'previous',
        toVersion: APP_VERSION,
        stage: 'updated',
        note: `Verified restart on Kinora v${APP_VERSION}.`,
      })
      savePendingUpdateVersion(null)
      saveDismissedUpdateVersion(null)
      setState((prev) => ({
        ...prev,
        stage: 'updated',
        message: `Successfully updated to Kinora v${APP_VERSION}.`,
        dismissedVersion: null,
      }))
    }
  }, [])

  const checkNow = useCallback(async (opts?: { force?: boolean; silent?: boolean }) => {
    if (checkInFlightRef.current || installInFlightRef.current) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      if (!opts?.silent) {
        setState((prev) => ({
          ...prev,
          stage: 'failed',
          error: 'Device is offline.',
          message: 'Update check failed: device is currently offline.',
          lastCheckedAt: new Date().toISOString(),
        }))
      }
      return
    }

    checkInFlightRef.current = true
    const force = Boolean(opts?.force)
    const allowPrereleases = channelRef.current === 'prerelease'

    if (!opts?.silent) {
      setState((prev) => ({
        ...prev,
        stage: 'checking',
        error: null,
        message:
          allowPrereleases
            ? 'Checking official Kinora pre-release and stable channels...'
            : 'Checking official Kinora stable release channel...',
      }))
    }

    try {
      const res = await checkForUpdates(null, allowPrereleases, force)
      setState((prev) => {
        const next = reduceUpdateCheckResult(prev, res)
        // Manual check clears dismissal so user sees the update immediately
        if (!opts?.silent && next.stage === 'available') {
          saveDismissedUpdateVersion(null)
          return { ...next, dismissedVersion: null }
        }
        return next
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not reach release server.'
      if (!opts?.silent) {
        setState((prev) => ({
          ...prev,
          stage: 'failed',
          error: msg,
          message: `Update check failed: ${msg}`,
          lastCheckedAt: new Date().toISOString(),
        }))
      }
    } finally {
      checkInFlightRef.current = false
    }
  }, [])

  // Startup delayed check + periodic 6-hour background check inside Tauri desktop shell
  useEffect(() => {
    if (!state.autoCheckEnabled || !inNativeShell()) return

    const startupTimer = window.setTimeout(() => {
      void checkNow({ force: false, silent: true })
    }, STARTUP_CHECK_DELAY_MS)

    const periodicTimer = window.setInterval(() => {
      void checkNow({ force: false, silent: true })
    }, PERIODIC_CHECK_INTERVAL_MS)

    return () => {
      window.clearTimeout(startupTimer)
      window.clearInterval(periodicTimer)
    }
  }, [state.autoCheckEnabled, state.channel, checkNow])

  const setChannel = useCallback((channel: UpdateChannel) => {
    saveUpdateChannel(channel)
    channelRef.current = channel
    setState((prev) => ({ ...prev, channel }))
  }, [])

  const setAutoCheckEnabled = useCallback((enabled: boolean) => {
    saveAutoCheckEnabled(enabled)
    setState((prev) => ({ ...prev, autoCheckEnabled: enabled }))
  }, [])

  const dismissNotification = useCallback(() => {
    setState((prev) => {
      const key = updateDismissalKey(prev.targetVersion, prev.buildCommit, prev.sameVersionRefresh)
      if (key) {
        saveDismissedUpdateVersion(key)
        return { ...prev, dismissedVersion: key }
      }
      return prev
    })
  }, [])

  const resetDismissal = useCallback(() => {
    saveDismissedUpdateVersion(null)
    setState((prev) => ({ ...prev, dismissedVersion: null }))
  }, [])

  const downloadAndInstall = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (installInFlightRef.current) {
      return { success: false, error: 'An update installation is already in progress.' }
    }
    if (!state.hasSignature) {
      const err = 'Refused to install update: missing cryptographic Minisign signature in release manifest.'
      setState((prev) => ({ ...prev, stage: 'failed', error: err, message: err }))
      return { success: false, error: err }
    }

    installInFlightRef.current = true
    setState((prev) => ({
      ...prev,
      stage: 'downloading',
      percent: 0,
      downloadedBytes: 0,
      totalBytes: prev.assetSizeBytes ?? 0,
      error: null,
      message: 'Downloading signed update package...',
    }))

    try {
      const res = await installUpdate(
        (progress) => {
          setState((prev) => {
            if (progress.stage === 'downloading') {
              return {
                ...prev,
                stage: 'downloading',
                percent: progress.percent ?? prev.percent,
                downloadedBytes: progress.downloadedBytes ?? prev.downloadedBytes,
                totalBytes: progress.totalBytes ?? prev.totalBytes,
                message:
                  progress.percent !== undefined
                    ? `Downloading update (${progress.percent}%)...`
                    : 'Downloading update...',
              }
            }
            if (progress.stage === 'downloaded') {
              return { ...prev, stage: 'downloaded', percent: 100, message: 'Download completed. Preparing verification...' }
            }
            if (progress.stage === 'verifying') {
              return { ...prev, stage: 'verifying', percent: 100, message: 'Verifying Minisign cryptographic signature...' }
            }
            if (progress.stage === 'verified') {
              return { ...prev, stage: 'verified', signatureVerified: true, message: 'Signature verified. Preparing installation...' }
            }
            if (progress.stage === 'installing') {
              return { ...prev, stage: 'installing', message: 'Installing verified update package...' }
            }
            if (progress.stage === 'restartRequired' || progress.stage === 'done') {
              return {
                ...prev,
                stage: 'restartRequired',
                signatureVerified: true,
                message: 'Update verified and installed. Restart Kinora to apply the new version.',
              }
            }
            return prev
          })
        },
        state.manifestUrl,
      )

      if (res.success) {
        const installedVer = res.installedVersion ?? state.targetVersion ?? 'latest'
        savePendingUpdateVersion(installedVer)
        recordUpdateHistory({
          fromVersion: state.currentVersion,
          toVersion: installedVer,
          stage: 'restartRequired',
          note: 'Verified Minisign signature and installed via Tauri updater; restart required.',
        })
        setState((prev) => ({
          ...prev,
          stage: 'restartRequired',
          signatureVerified: true,
          message: `Kinora v${installedVer} verified and installed. Restart Kinora to complete the upgrade.`,
        }))
        return { success: true }
      }

      const err = res.error ?? 'Unknown installation error.'
      recordUpdateHistory({
        fromVersion: state.currentVersion,
        toVersion: state.targetVersion ?? 'unknown',
        stage: 'failed',
        note: err,
      })
      setState((prev) => ({
        ...prev,
        stage: 'failed',
        error: err,
        message: `Update failed (current version v${prev.currentVersion} remains intact): ${err}`,
      }))
      return { success: false, error: err }
    } catch (e) {
      const err = e instanceof Error ? e.message : 'Update installation failed.'
      recordUpdateHistory({
        fromVersion: state.currentVersion,
        toVersion: state.targetVersion ?? 'unknown',
        stage: 'failed',
        note: err,
      })
      setState((prev) => ({
        ...prev,
        stage: 'failed',
        error: err,
        message: `Update failed (current version v${prev.currentVersion} remains intact): ${err}`,
      }))
      return { success: false, error: err }
    } finally {
      installInFlightRef.current = false
    }
  }, [state.hasSignature, state.manifestUrl, state.currentVersion, state.targetVersion, state.assetSizeBytes])

  const restartNow = useCallback(async () => {
    await restartApp()
  }, [])

  const isBusy =
    state.stage === 'checking' ||
    state.stage === 'downloading' ||
    state.stage === 'verifying' ||
    state.stage === 'installing'

  const notificationVisible = useMemo(() => shouldShowUpdateNotification(state), [state])

  const value = useMemo<UpdaterContextValue>(
    () => ({
      state,
      notificationVisible,
      isBusy,
      setChannel,
      setAutoCheckEnabled,
      checkNow,
      downloadAndInstall,
      restartNow,
      dismissNotification,
      resetDismissal,
    }),
    [
      state,
      notificationVisible,
      isBusy,
      setChannel,
      setAutoCheckEnabled,
      checkNow,
      downloadAndInstall,
      restartNow,
      dismissNotification,
      resetDismissal,
    ],
  )

  return <UpdaterContext.Provider value={value}>{children}</UpdaterContext.Provider>
}

export function useUpdater(): UpdaterContextValue {
  const ctx = useContext(UpdaterContext)
  if (!ctx) {
    throw new Error('useUpdater must be used inside UpdaterProvider')
  }
  return ctx
}

/** Optional variant for isolated component/screen unit tests rendered without UpdaterProvider. */
export function useOptionalUpdater(): UpdaterContextValue | null {
  return useContext(UpdaterContext)
}
