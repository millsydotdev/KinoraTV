import { describe, it, expect } from 'vitest'
import {
  formatBytes,
  formatSpeed,
  formatEta,
  calculateProgress,
  getOfflinePlaybackUrl,
  statusLabel,
  statusTone,
} from './downloader'
import type { DownloadItem } from './native'

describe('downloader library', () => {
  describe('formatBytes', () => {
    it('formats various byte sizes into appropriate units', () => {
      expect(formatBytes(0)).toBe('0 B')
      expect(formatBytes(-100)).toBe('0 B')
      expect(formatBytes(500)).toBe('500 B')
      expect(formatBytes(1024)).toBe('1.0 KB')
      expect(formatBytes(1536)).toBe('1.5 KB')
      expect(formatBytes(1048576)).toBe('1.00 MB')
      expect(formatBytes(1073741824)).toBe('1.00 GB')
      expect(formatBytes(2684354560)).toBe('2.50 GB')
    })
  })

  describe('formatSpeed', () => {
    it('formats download speeds cleanly', () => {
      expect(formatSpeed(0)).toBe('0 B/s')
      expect(formatSpeed(512000)).toBe('500.0 KB/s')
      expect(formatSpeed(10485760)).toBe('10.00 MB/s')
    })
  })

  describe('formatEta', () => {
    it('formats remaining time into readable duration', () => {
      expect(formatEta(null)).toBe('--')
      expect(formatEta(-5)).toBe('--')
      expect(formatEta(30)).toBe('30s')
      expect(formatEta(90)).toBe('1m 30s')
      expect(formatEta(3665)).toBe('1h 1m')
    })
  })

  describe('calculateProgress', () => {
    it('calculates progress percentage safely', () => {
      expect(calculateProgress(0, 0)).toBe(0)
      expect(calculateProgress(250, 1000)).toBe(25)
      expect(calculateProgress(500, 1000)).toBe(50)
      expect(calculateProgress(1000, 1000)).toBe(100)
      expect(calculateProgress(1200, 1000)).toBe(100)
    })
  })

  describe('getOfflinePlaybackUrl', () => {
    it('generates opaque kstream URL for offline playback', () => {
      const item: DownloadItem = {
        id: 'dl-123456',
        url: 'http://example.com/movie.mp4',
        title: 'Sample Movie',
        kind: 'movie',
        extension: 'mp4',
        artworkUrl: null,
        status: 'completed',
        downloadedBytes: 1000,
        totalBytes: 1000,
        speedBps: 0,
        etaSeconds: null,
        errorMessage: null,
        filePath: '/tmp/dl-123456/video.mp4',
        createdAt: 1000,
        completedAt: 2000,
      }

      expect(getOfflinePlaybackUrl(item)).toBe('kstream://localhost/downloads/dl-123456/video.mp4')
    })
  })

  describe('statusLabel and statusTone', () => {
    it('maps download statuses to labels and tones', () => {
      expect(statusLabel('downloading')).toBe('Downloading')
      expect(statusTone('downloading')).toBe('accent')

      expect(statusLabel('completed')).toBe('Completed')
      expect(statusTone('completed')).toBe('success')

      expect(statusLabel('paused')).toBe('Paused')
      expect(statusTone('paused')).toBe('warn')

      expect(statusLabel('failed')).toBe('Failed')
      expect(statusTone('failed')).toBe('error')

      expect(statusLabel('queued')).toBe('Queued')
      expect(statusTone('queued')).toBe('faint')
    })
  })
})
