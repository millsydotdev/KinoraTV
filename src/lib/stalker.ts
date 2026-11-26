// stalker.ts - Frontend portal management, MAC formatting, channel mapping, and storage for MAG / Stalker portals.
// Strictly adheres to project typography standards: zero em-dashes across all code and comments.

import type { PlaylistChannel, PlaylistReport, StalkerCatalogue, StalkerChannel, StalkerVodItem } from './native'
import type { Channel, Programme } from '../data/types'

export interface StalkerCapabilities {
  supportsItv: boolean
  supportsVod: boolean
  supportsEpg: boolean
  supportsCatchup: boolean
  serverVersion?: string | null
}

export interface StalkerEpgProgramme {
  id: string
  channelId: string
  name: string
  time: string
  timeTo: string
  duration: number
  desc?: string | null
}

export interface SavedStalkerPortal {
  id: string
  portalUrl: string
  mac: string
  label?: string
  lastConnected?: string
  channelCount?: number
  vodCount?: number
  expDate?: string | null
}

export const STALKER_PORTALS_STORAGE_KEY = 'kinora.stalker.portals.v1'

/**
 * Normalizes user input into a formatted MAC address string (e.g. 00:1A:79:AB:CD:EF).
 * Strips non-hex characters, slices to 12 characters, inserts colons, and transforms to uppercase.
 */
export function formatMacInput(raw: string): string {
  const hexOnly = raw.replace(/[^0-9a-fA-F]/g, '').slice(0, 12).toUpperCase()
  const segments: string[] = []
  for (let i = 0; i < hexOnly.length; i += 2) {
    segments.push(hexOnly.slice(i, i + 2))
  }
  return segments.join(':')
}

/**
 * Validates whether a given string is a valid 6-byte hexadecimal MAC address.
 */
export function isValidMacAddress(mac: string): boolean {
  return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i.test(mac.trim())
}

/**
 * Retrieves saved Stalker portals from local storage.
 */
export function loadSavedStalkerPortals(): SavedStalkerPortal[] {
  try {
    const raw = localStorage.getItem(STALKER_PORTALS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((p): p is SavedStalkerPortal =>
      typeof p === 'object' &&
      p !== null &&
      typeof p.id === 'string' &&
      typeof p.portalUrl === 'string' &&
      typeof p.mac === 'string'
    )
  } catch {
    return []
  }
}

/**
 * Saves or updates a Stalker portal in local storage.
 */
export function saveStalkerPortal(portal: SavedStalkerPortal): void {
  try {
    const existing = loadSavedStalkerPortals()
    const index = existing.findIndex((p) => p.id === portal.id || (p.portalUrl === portal.portalUrl && p.mac === portal.mac))
    if (index >= 0) {
      existing[index] = { ...existing[index], ...portal }
    } else {
      existing.push(portal)
    }
    localStorage.setItem(STALKER_PORTALS_STORAGE_KEY, JSON.stringify(existing))
  } catch {
    // Fail safely if storage quota is exceeded
  }
}

/**
 * Removes a saved Stalker portal by ID.
 */
export function removeSavedStalkerPortal(id: string): void {
  try {
    const existing = loadSavedStalkerPortals()
    const filtered = existing.filter((p) => p.id !== id)
    localStorage.setItem(STALKER_PORTALS_STORAGE_KEY, JSON.stringify(filtered))
  } catch {
    // Fail safely
  }
}

/**
 * Maps Stalker channels into Kinora Channel format for seamless display in Live TV.
 */
export function mapStalkerToKinoraChannels(catalogue: StalkerCatalogue): Channel[] {
  const genreMap = new Map<string, string>()
  for (const g of catalogue.genres) {
    genreMap.set(g.id, g.title)
  }

  return catalogue.channels.map((c: StalkerChannel, index: number): Channel => {
    const groupName = genreMap.get(c.genreId) || 'Uncategorised'
    const number = c.number > 0 ? c.number : index + 1
    return {
      id: `stalker-${encodeURIComponent(c.id)}`,
      name: c.name || `Channel ${number}`,
      number,
      group: groupName,
      categories: [groupName],
      streamUrl: `stalker://${encodeURIComponent(c.cmd)}`,
      logoUrl: c.logo || null,
      mark: { text: 'STALKER', tone: 'accent' },
      hd: c.name.toLowerCase().includes('hd'),
      sourceId: null,
      tvgId: null,
    }
  })
}

/**
 * Converts a Stalker catalogue into a PlaylistReport compatible with store.addPlaylist.
 */
export function stalkerToPlaylistReport(catalogue: StalkerCatalogue): PlaylistReport {
  const genreMap = new Map<string, string>()
  for (const g of catalogue.genres) {
    genreMap.set(g.id, g.title)
  }

  const channels: PlaylistChannel[] = catalogue.channels.map((c: StalkerChannel, i: number) => {
    const group = genreMap.get(c.genreId) || 'Uncategorised'
    const safeUrl = `stalker://${encodeURIComponent(c.cmd)}`
    return {
      key: `stalker-${c.id}-${i}`,
      tvgId: null,
      name: c.name,
      group,
      logo: c.logo || null,
      language: null,
      country: null,
      chno: c.number > 0 ? c.number : i + 1,
      streamUrl: safeUrl,
      streamDisplay: 'stalker://stream',
    }
  })

  return {
    channels,
    skipped: 0,
    duplicates: 0,
    warnings: [],
    host: null,
  }
}

/**
 * Maps Stalker VOD items to a normalized representation for movies and on-demand titles.
 */
export function mapStalkerVodToItems(catalogue: StalkerCatalogue): Array<{
  id: string
  name: string
  cmd: string
  poster: string | null
  year: number | null
  categoryId: string | null
  streamUrl: string
}> {
  return catalogue.vod.map((item: StalkerVodItem) => {
    const parsedYear = item.year ? parseInt(item.year, 10) : null
    const year = Number.isNaN(parsedYear) ? null : parsedYear
    return {
      id: `stalker-vod-${encodeURIComponent(item.id)}`,
      name: item.name,
      cmd: item.cmd,
      poster: item.poster,
      year,
      categoryId: item.categoryId,
      streamUrl: `stalker://${encodeURIComponent(item.cmd)}`,
    }
  })
}

/**
 * Maps Stalker EPG timetable entries into Kinora Programme format.
 */
export function mapStalkerEpgToProgrammes(
  epgList: StalkerEpgProgramme[],
  channelId: string,
): Programme[] {
  return epgList.map((item, index) => {
    const parsedStart = item.time ? Date.parse(item.time.replace(' ', 'T') + 'Z') : NaN
    const startMs = Number.isNaN(parsedStart) ? Date.now() + index * 3600000 : parsedStart
    const parsedEnd = item.timeTo ? Date.parse(item.timeTo.replace(' ', 'T') + 'Z') : NaN
    const endMs = Number.isNaN(parsedEnd) ? startMs + (item.duration || 3600) * 1000 : parsedEnd

    return {
      id: `stalker-epg-${item.id || index}`,
      channelId,
      title: item.name || 'Untitled Programme',
      start: startMs,
      stop: endMs,
      desc: item.desc || '',
      category: 'General',
      episode: null,
    }
  })
}

/**
 * Builds a catch-up playback request descriptor for Stalker archive streams.
 */
export function buildStalkerCatchupRequest(
  cmd: string,
  startTimestampSec: number,
  durationSec: number,
): { cmd: string; start: number; duration: number } {
  return {
    cmd,
    start: startTimestampSec,
    duration: Math.max(60, durationSec),
  }
}
