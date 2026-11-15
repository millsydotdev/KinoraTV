// Demonstration sources. URLs use reserved example domains or a private LAN address;
// nothing is fetched, scanned or validated in this build.
import { channels } from './channels'
import type { Source } from './types'

const HOUR = 3_600_000

export function demoSources(now: number): Source[] {
  return [
    {
      id: 'living-room', name: 'Living room tuner', kind: 'm3u', url: 'http://192.168.1.20/lineup.m3u',
      addedAt: now - 40 * 24 * HOUR, lastChecked: null, status: 'pending',
      streams: { total: 64, working: 0, failed: 0 }, scan: null, history: [], refreshInterval: 'manual',
    },
    {
      id: 'regional-fta', name: 'Regional free-to-air', kind: 'm3u8', url: 'https://example.com/fta/regional.m3u8',
      addedAt: now - 22 * 24 * HOUR, lastChecked: null, status: 'pending',
      streams: { total: 212, working: 0, failed: 0 }, scan: null, history: [], refreshInterval: 'manual',
    },
    {
      id: 'weekly-guide', name: 'Weekly programme guide', kind: 'xmltv', url: 'https://example.org/guide/xmltv.xml.gz',
      addedAt: now - 22 * 24 * HOUR, lastChecked: null, status: 'pending',
      streams: null, scan: null, history: [], refreshInterval: 'manual',
    },
    {
      id: 'community-sport', name: 'Community sports list', kind: 'url-list', url: 'https://example.net/lists/sport.txt',
      addedAt: now - 6 * 24 * HOUR, lastChecked: null, status: 'pending',
      streams: { total: 960, working: 0, failed: 0 }, scan: null, history: [], refreshInterval: 'manual',
    },
    {
      id: 'archive-list', name: 'Archive mirror', kind: 'm3u', url: 'https://example.com/archive/old-mirror.m3u',
      addedAt: now - 90 * 24 * HOUR, lastChecked: null, status: 'pending',
      streams: { total: 140, working: 0, failed: 0 }, scan: null, history: [], refreshInterval: 'manual',
    },
  ]
}

export type ValidationResult = { channel: string; group: string; status: 'working' | 'failed' | 'timeout'; responseMs: number | null; detail: string }

/** Demonstration validation rows for the details panel, derived deterministically from the source id. */
export function demoValidation(source: Source): ValidationResult[] {
  if (!source.streams) return []
  const failShare = source.streams.failed / source.streams.total
  return channels.map((c, i) => {
    const roll = ((i + 1) * 37 + source.id.length * 13) % 100 / 100
    if (roll < failShare * 0.6) return { channel: c.name, group: c.group, status: 'failed', responseMs: null, detail: 'HTTP 404 from stream host' }
    if (roll < failShare) return { channel: c.name, group: c.group, status: 'timeout', responseMs: null, detail: 'No response within 8 s' }
    return { channel: c.name, group: c.group, status: 'working', responseMs: 120 + Math.round(roll * 600), detail: c.hd ? 'HLS, 1080p' : 'HLS, 576p' }
  })
}
