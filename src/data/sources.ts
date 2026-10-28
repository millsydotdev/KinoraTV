// Demonstration sources. URLs use reserved example domains or a private LAN address;
// nothing is fetched, scanned or validated in this build.
import { channels } from './channels'
import type { DiscoveryProvider, HealthCheck, Source } from './types'

const HOUR = 3_600_000

function history(seed: number, total: number, failRate: number, now: number): HealthCheck[] {
  return Array.from({ length: 14 }, (_, i) => {
    const wobble = ((seed * (i + 3) * 7919) % 100) / 100
    const failed = Math.round(total * failRate * (0.6 + wobble * 0.8))
    return { at: now - (13 - i) * 12 * HOUR, working: total - failed, failed }
  })
}

export function demoSources(now: number): Source[] {
  return [
    {
      id: 'living-room', name: 'Living room tuner', kind: 'm3u', url: 'http://192.168.1.20/lineup.m3u',
      addedAt: now - 40 * 24 * HOUR, lastChecked: now - 0.2 * HOUR, status: 'healthy',
      streams: { total: 64, working: 63, failed: 1 }, scan: null, history: history(3, 64, 0.02, now), refreshInterval: '12h',
    },
    {
      id: 'regional-fta', name: 'Regional free-to-air', kind: 'm3u8', url: 'https://example.com/fta/regional.m3u8',
      addedAt: now - 22 * 24 * HOUR, lastChecked: now - 1.5 * HOUR, status: 'degraded',
      streams: { total: 212, working: 171, failed: 41 }, scan: null, history: history(5, 212, 0.18, now), refreshInterval: '24h',
    },
    {
      id: 'weekly-guide', name: 'Weekly programme guide', kind: 'xmltv', url: 'https://example.org/guide/xmltv.xml.gz',
      addedAt: now - 22 * 24 * HOUR, lastChecked: now - 3 * HOUR, status: 'healthy',
      streams: null, scan: null, history: [], refreshInterval: '24h',
    },
    {
      id: 'community-sport', name: 'Community sports list', kind: 'url-list', url: 'https://example.net/lists/sport.txt',
      addedAt: now - 6 * 24 * HOUR, lastChecked: now - 26 * HOUR, status: 'scanning',
      streams: { total: 960, working: 388, failed: 24 }, scan: { done: 412, total: 960 }, history: history(7, 960, 0.06, now), refreshInterval: '6h',
    },
    {
      id: 'archive-list', name: 'Archive mirror', kind: 'm3u', url: 'https://example.com/archive/old-mirror.m3u',
      addedAt: now - 90 * 24 * HOUR, lastChecked: now - 50 * HOUR, status: 'failing',
      streams: { total: 140, working: 9, failed: 131 }, scan: null, history: history(11, 140, 0.85, now), refreshInterval: 'manual',
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

export const demoProviders: DiscoveryProvider[] = [
  { id: 'local-network', name: 'Local network tuners', description: 'Looks for HDHomeRun-style tuners and DLNA servers on your own network.', enabled: true },
  { id: 'public-directories', name: 'Public playlist directories', description: 'Checks directories you add yourself for playlists their owners publish for reuse. Unlicensed or access-restricted lists are skipped.', enabled: false },
  { id: 'guide-providers', name: 'Programme guide providers', description: 'Suggests XMLTV guides that list your channels.', enabled: true },
]
