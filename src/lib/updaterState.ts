/**
 * Software Updater Lifecycle State Machine for Kinora.
 * Accurately distinguishes every stage of checking, downloading, verifying,
 * installing, and restarting an update, and persists release channel preferences.
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
  currentVersion: string
  targetVersion: string | null
  releaseDate: string | null
  releaseNotes: string | null
  downloadUrl: string | null
  hasSignature: boolean
  signatureVerified: boolean
  percent: number | null
  downloadedBytes: number
  totalBytes: number
  message: string
  error: string | null
  lastCheckedAt: string | null
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

export function createInitialUpdaterState(currentVersion: string, channel?: UpdateChannel): UpdaterState {
  return {
    stage: 'idle',
    channel: channel ?? loadUpdateChannel(),
    currentVersion,
    targetVersion: null,
    releaseDate: null,
    releaseNotes: null,
    downloadUrl: null,
    hasSignature: false,
    signatureVerified: false,
    percent: null,
    downloadedBytes: 0,
    totalBytes: 0,
    message: 'Check for newer releases from the official Kinora release channel.',
    error: null,
    lastCheckedAt: null,
  }
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
    return {
      ...state,
      stage: 'available',
      currentVersion: res.currentVersion,
      targetVersion: res.latestVersion,
      releaseDate: res.releaseDate,
      releaseNotes: res.releaseNotes,
      downloadUrl: res.downloadUrl,
      hasSignature: res.hasSignature,
      signatureVerified: false,
      percent: null,
      error: null,
      message: `Update available: Kinora v${res.latestVersion ?? 'latest'}${res.hasSignature ? ' (signed release)' : ' (signature missing)'}.`,
      lastCheckedAt: checkedAt,
    }
  }

  if (res.status === 'upToDate') {
    return {
      ...state,
      stage: 'upToDate',
      currentVersion: res.currentVersion,
      targetVersion: res.latestVersion,
      releaseDate: res.releaseDate,
      releaseNotes: res.releaseNotes,
      downloadUrl: res.downloadUrl,
      hasSignature: res.hasSignature,
      error: null,
      message: `Kinora is up to date (v${res.currentVersion}).`,
      lastCheckedAt: checkedAt,
    }
  }

  if (res.status === 'unsupportedPlatform') {
    return {
      ...state,
      stage: 'unsupportedPlatform',
      currentVersion: res.currentVersion,
      targetVersion: res.latestVersion,
      releaseDate: res.releaseDate,
      releaseNotes: res.releaseNotes,
      downloadUrl: null,
      hasSignature: false,
      error: res.error,
      message: res.error ?? `Release v${res.latestVersion ?? ''} does not include a package for ${res.platformKey}.`,
      lastCheckedAt: checkedAt,
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
