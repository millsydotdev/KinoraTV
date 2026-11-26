/**
 * Software Updater Lifecycle State Machine for Kinora.
 * Accurately distinguishes every stage of checking, downloading, verifying,
 * installing, and restarting an update, and persists release channel,
 * auto-check, dismissal, and pending-upgrade preferences.
 * Never reports a downloaded update as installed.
 * Strictly adheres to project typography standards: zero em-dashes.
 */

import type { UpdateCheckResult } from './native'

export type UpdateChannel = 'stable' | 'prerelease'

export type UpdaterLifecycleStage =
  | 'idle'
  | 'checking'
  | 'upToDate'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'verifying'
  | 'verified'
  | 'readyToInstall'
  | 'installing'
  | 'restartRequired'
  | 'updated'
  | 'unsupportedPlatform'
  | 'failed'

export interface UpdaterState {
  stage: UpdaterLifecycleStage
  channel: UpdateChannel
  autoCheckEnabled: boolean
  currentVersion: string
  targetVersion: string | null
  releaseDate: string | null
  releaseNotes: string | null
  downloadUrl: string | null
  manifestUrl: string | null
  releaseUrl: string | null
  assetSizeBytes: number | null
  hasSignature: boolean
  signatureVerified: boolean
  percent: number | null
  downloadedBytes: number
  totalBytes: number
  message: string
  error: string | null
  lastCheckedAt: string | null
  lastSuccessfulCheckAt: string | null
  dismissedVersion: string | null
}

export interface UpdateHistoryRecord {
  id: string
  timestamp: string
  fromVersion: string
  toVersion: string
  stage: UpdaterLifecycleStage
  note: string
}

export const UPDATE_CHANNEL_KEY = 'kinora.update_channel.v1'
export const UPDATE_HISTORY_KEY = 'kinora.update_history.v1'
export const UPDATE_AUTO_CHECK_KEY = 'kinora.update_auto_check.v1'
export const UPDATE_DISMISSED_KEY = 'kinora.update_dismissed_version.v1'
export const UPDATE_LAST_CHECKED_KEY = 'kinora.update_last_checked.v1'
export const UPDATE_PENDING_VERSION_KEY = 'kinora.update_pending_version.v1'

export function loadUpdateChannel(): UpdateChannel {
  if (typeof localStorage === 'undefined') return 'stable'
  try {
    const val = localStorage.getItem(UPDATE_CHANNEL_KEY)
    return val === 'prerelease' ? 'prerelease' : 'stable'
  } catch {
    return 'stable'
  }
}

export function saveUpdateChannel(channel: UpdateChannel): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(UPDATE_CHANNEL_KEY, channel)
  } catch {
    // Storage quota safety
  }
}

export function loadAutoCheckEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true
  try {
    const val = localStorage.getItem(UPDATE_AUTO_CHECK_KEY)
    if (val === 'false' || val === '0') return false
    return true
  } catch {
    return true
  }
}

export function saveAutoCheckEnabled(enabled: boolean): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(UPDATE_AUTO_CHECK_KEY, enabled ? 'true' : 'false')
  } catch {
    // Storage quota safety
  }
}

export function loadDismissedUpdateVersion(): string | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const val = localStorage.getItem(UPDATE_DISMISSED_KEY)
    return val && val.trim() ? val.trim() : null
  } catch {
    return null
  }
}

export function saveDismissedUpdateVersion(version: string | null): void {
  if (typeof localStorage === 'undefined') return
  try {
    if (!version) localStorage.removeItem(UPDATE_DISMISSED_KEY)
    else localStorage.setItem(UPDATE_DISMISSED_KEY, version)
  } catch {
    // Storage quota safety
  }
}

export function loadLastSuccessfulCheck(): string | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const val = localStorage.getItem(UPDATE_LAST_CHECKED_KEY)
    return val && val.trim() ? val.trim() : null
  } catch {
    return null
  }
}

export function saveLastSuccessfulCheck(iso: string): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(UPDATE_LAST_CHECKED_KEY, iso)
  } catch {
    // Storage quota safety
  }
}

export function loadPendingUpdateVersion(): string | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const val = localStorage.getItem(UPDATE_PENDING_VERSION_KEY)
    return val && val.trim() ? val.trim() : null
  } catch {
    return null
  }
}

export function savePendingUpdateVersion(version: string | null): void {
  if (typeof localStorage === 'undefined') return
  try {
    if (!version) localStorage.removeItem(UPDATE_PENDING_VERSION_KEY)
    else localStorage.setItem(UPDATE_PENDING_VERSION_KEY, version)
  } catch {
    // Storage quota safety
  }
}

export function loadUpdateHistory(): UpdateHistoryRecord[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(UPDATE_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as UpdateHistoryRecord[]) : []
  } catch {
    return []
  }
}

export function recordUpdateHistory(entry: Omit<UpdateHistoryRecord, 'id' | 'timestamp'>): void {
  if (typeof localStorage === 'undefined') return
  try {
    const prev = loadUpdateHistory()
    const next: UpdateHistoryRecord[] = [
      {
        id: `upd-${Date.now()}`,
        timestamp: new Date().toISOString(),
        ...entry,
      },
      ...prev,
    ].slice(0, 20)
    localStorage.setItem(UPDATE_HISTORY_KEY, JSON.stringify(next))
  } catch {
    // Storage quota safety
  }
}

export function formatDownloadSize(bytes: number | null | undefined): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return null
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

export function createInitialUpdaterState(currentVersion: string, channel?: UpdateChannel): UpdaterState {
  return {
    stage: 'idle',
    channel: channel ?? loadUpdateChannel(),
    autoCheckEnabled: loadAutoCheckEnabled(),
    currentVersion,
    targetVersion: null,
    releaseDate: null,
    releaseNotes: null,
    downloadUrl: null,
    manifestUrl: null,
    releaseUrl: null,
    assetSizeBytes: null,
    hasSignature: false,
    signatureVerified: false,
    percent: null,
    downloadedBytes: 0,
    totalBytes: 0,
    message: 'Check for newer releases from the official Kinora release channel.',
    error: null,
    lastCheckedAt: null,
    lastSuccessfulCheckAt: loadLastSuccessfulCheck(),
    dismissedVersion: loadDismissedUpdateVersion(),
  }
}

export function shouldShowUpdateNotification(state: UpdaterState): boolean {
  if (
    state.stage === 'downloading' ||
    state.stage === 'downloaded' ||
    state.stage === 'verifying' ||
    state.stage === 'verified' ||
    state.stage === 'installing' ||
    state.stage === 'restartRequired'
  ) {
    return true
  }
  if (state.stage === 'available' && state.targetVersion) {
    return state.dismissedVersion !== state.targetVersion
  }
  return false
}

export function reduceUpdateCheckResult(state: UpdaterState, res: UpdateCheckResult | null): UpdaterState {
  const checkedAt = new Date().toISOString()
  if (!res) {
    return {
      ...state,
      stage: 'failed',
      error: 'No response from the update service.',
      message: 'Update check failed: no response received.',
      lastCheckedAt: checkedAt,
    }
  }

  if (res.status === 'available') {
    saveLastSuccessfulCheck(checkedAt)
    return {
      ...state,
      stage: 'available',
      currentVersion: res.currentVersion,
      targetVersion: res.latestVersion,
      releaseDate: res.releaseDate,
      releaseNotes: res.releaseNotes,
      downloadUrl: res.downloadUrl,
      manifestUrl: res.manifestUrl ?? null,
      releaseUrl: res.releaseUrl ?? null,
      assetSizeBytes: typeof res.assetSizeBytes === 'number' ? res.assetSizeBytes : null,
      hasSignature: res.hasSignature,
      signatureVerified: false,
      percent: null,
      error: null,
      message: `Update available: Kinora v${res.latestVersion ?? 'latest'}${res.hasSignature ? ' (signed release)' : ' (signature missing)'}.`,
      lastCheckedAt: checkedAt,
      lastSuccessfulCheckAt: checkedAt,
    }
  }

  if (res.status === 'upToDate') {
    saveLastSuccessfulCheck(checkedAt)
    return {
      ...state,
      stage: 'upToDate',
      currentVersion: res.currentVersion,
      targetVersion: res.latestVersion,
      releaseDate: res.releaseDate,
      releaseNotes: res.releaseNotes,
      downloadUrl: res.downloadUrl,
      manifestUrl: res.manifestUrl ?? null,
      releaseUrl: res.releaseUrl ?? null,
      assetSizeBytes: typeof res.assetSizeBytes === 'number' ? res.assetSizeBytes : null,
      hasSignature: res.hasSignature,
      error: null,
      message: `Kinora is up to date (v${res.currentVersion}).`,
      lastCheckedAt: checkedAt,
      lastSuccessfulCheckAt: checkedAt,
    }
  }

  if (res.status === 'unsupportedPlatform') {
    saveLastSuccessfulCheck(checkedAt)
    return {
      ...state,
      stage: 'unsupportedPlatform',
      currentVersion: res.currentVersion,
      targetVersion: res.latestVersion,
      releaseDate: res.releaseDate,
      releaseNotes: res.releaseNotes,
      downloadUrl: null,
      manifestUrl: res.manifestUrl ?? null,
      releaseUrl: res.releaseUrl ?? null,
      assetSizeBytes: null,
      hasSignature: false,
      error: res.error,
      message: res.error ?? `Release v${res.latestVersion ?? ''} does not include a package for ${res.platformKey}.`,
      lastCheckedAt: checkedAt,
      lastSuccessfulCheckAt: checkedAt,
    }
  }

  return {
    ...state,
    stage: 'failed',
    error: res.error ?? 'Could not reach update service.',
    message: `Update check failed: ${res.error ?? 'network unavailable'}.`,
    lastCheckedAt: checkedAt,
  }
}

export function describeUpdaterStage(stage: UpdaterLifecycleStage): string {
  switch (stage) {
    case 'idle':
      return 'Idle'
    case 'checking':
      return 'Checking for updates'
    case 'upToDate':
      return 'Up to date'
    case 'available':
      return 'Update available'
    case 'downloading':
      return 'Downloading'
    case 'downloaded':
      return 'Download completed'
    case 'verifying':
      return 'Verifying signature'
    case 'verified':
      return 'Verification successful'
    case 'readyToInstall':
      return 'Ready to install'
    case 'installing':
      return 'Installation in progress'
    case 'restartRequired':
      return 'Restart required'
    case 'updated':
      return 'Successfully updated'
    case 'unsupportedPlatform':
      return 'Platform package unavailable'
    case 'failed':
      return 'Update failed'
  }
}
