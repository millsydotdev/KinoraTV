// downloader.ts - Downloader utilities, formatting, progress calculation, and offline playback URL generation.
// Strictly adheres to project typography standards: zero em-dashes across all code and comments.

import type { DownloadItem, DownloadStatus } from './native'

/**
 * Formats a byte quantity into a human-readable string (B, KB, MB, GB).
 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0 || !Number.isFinite(bytes)) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const val = bytes / Math.pow(1024, i)
  return `${val.toFixed(i === 0 ? 0 : i === 1 ? 1 : 2)} ${units[i]}`
}

/**
 * Formats download speed in bytes per second into human-readable rate.
 */
export function formatSpeed(bps: number): string {
  if (bps <= 0 || !Number.isFinite(bps)) return '0 B/s'
  return `${formatBytes(bps)}/s`
}

/**
 * Formats remaining duration in seconds into human-readable ETA.
 */
export function formatEta(seconds: number | null): string {
  if (seconds === null || seconds < 0 || !Number.isFinite(seconds)) return '--'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const mins = Math.floor(seconds / 60)
  const remainingSecs = Math.round(seconds % 60)
  if (mins < 60) {
    return `${mins}m ${remainingSecs}s`
  }
  const hours = Math.floor(mins / 60)
  const remainingMins = mins % 60
  return `${hours}h ${remainingMins}m`
}

/**
 * Calculates download completion percentage (0 - 100).
 */
export function calculateProgress(downloaded: number, total: number): number {
  if (total <= 0 || !Number.isFinite(total)) return 0
  const pct = (downloaded / total) * 100
  return Math.min(Math.max(Math.round(pct), 0), 100)
}

/**
 * Generates an opaque, secure kstream URI for offline playback of a downloaded file.
 */
export function getOfflinePlaybackUrl(item: DownloadItem): string {
  const safeId = encodeURIComponent(item.id)
  const safeExt = encodeURIComponent(item.extension.replace(/^\./, ''))
  return `kstream://localhost/downloads/${safeId}/video.${safeExt}`
}

/**
 * Maps download status to human-friendly UI label.
 */
export function statusLabel(status: DownloadStatus): string {
  switch (status) {
    case 'queued':
      return 'Queued'
    case 'downloading':
      return 'Downloading'
    case 'paused':
      return 'Paused'
    case 'completed':
      return 'Completed'
    case 'failed':
      return 'Failed'
    case 'cancelled':
      return 'Cancelled'
    default:
      return 'Unknown'
  }
}

/**
 * Maps download status to design-system color tone.
 */
export function statusTone(status: DownloadStatus): 'success' | 'warn' | 'error' | 'accent' | 'faint' {
  switch (status) {
    case 'completed':
      return 'success'
    case 'downloading':
      return 'accent'
    case 'paused':
      return 'warn'
    case 'failed':
      return 'error'
    case 'queued':
    case 'cancelled':
    default:
      return 'faint'
  }
}
