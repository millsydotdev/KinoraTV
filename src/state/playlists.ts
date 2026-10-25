// Playlist sources imported through the Rust ingest commands (src/lib/native.ts). Kept in memory
// only: nothing here is saved, and nothing here has been played or playback-tested.
import type { Channel, SourceKind } from '../data/types'
import { IngestError, type PlaylistReport } from '../lib/native'

export const UNCATEGORISED = 'Uncategorised'
export const NOT_TESTED = 'Streams not playback-tested'
export const DESKTOP_ONLY = 'Importing playlists needs the Kinora desktop app. This browser preview cannot fetch or read playlists.'
const GENERIC_ERROR = 'Kinora could not read that playlist.'

export interface PlaylistSource {
  id: string
  name: string
  origin: 'url' | 'file'
  /** URL sources only, kept in memory so Refresh can fetch it again. Never shown, logged or saved. */
  url: string | null
  /** Safe to show: `https://host/…` or the file name. */
  label: string
  addedAt: number
  status: 'importing' | 'parsed' | 'failed'
  /** Latest operation started for this source; results of older operations are dropped. */
  op: number
  lastAttempt: number
  lastSuccess: number | null
  /** Channels from the last successful import. A failed refresh keeps them, and says so. */
  channels: Channel[]
  skipped: number
  duplicates: number
  /** From Rust: line numbers and reasons only, never addresses. */
  warnings: string[]
  /** Safe message from the latest failed attempt. */
  error: string | null
}

/**
 * Validates the address typed into Add Source: well-formed http(s), no embedded credentials, not
 * already added, and an M3U type. Rust checks scheme, credentials and destination again before fetching.
 */
export function checkPlaylistUrl(raw: string, kind: SourceKind, existing: (string | null)[]): { url: string } | { error: string } {
  if (!raw.trim()) return { error: 'Paste the playlist address.' }
  let parsed: URL
  try {
    parsed = new URL(raw.trim())
  } catch {
    return { error: 'Use a full address starting with http:// or https://' }
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return { error: 'Use a full address starting with http:// or https://' }
  if (parsed.username || parsed.password) return { error: 'Remove the username and password from the address. Sign-in details are not stored in URLs.' }
  if (existing.includes(parsed.href)) return { error: 'This address is already one of your sources.' }
  if (kind === 'xmltv' || kind === 'url-list') return { error: 'Kinora can import M3U playlists so far. XMLTV guides and URL lists are not supported yet.' }
  return { url: parsed.href }
}

/** One Add Source read, turned into what the Validate step shows: the report, or a safe message. */
export async function readForPreview(read: () => Promise<PlaylistReport | null>): Promise<{ report: PlaylistReport } | { error: string }> {
  try {
    const report = await read()
    if (!report) return { error: DESKTOP_ONLY }
    if (report.channels.length === 0) return { error: 'The playlist was read, but it lists no channels to add.' }
    return { report }
  } catch (e) {
    return { error: userMessage(e) }
  }
}

/** `https://host[:port]/…`: no path, query or credentials, which can hold tokens. */
export function addressLabel(url: string): string {
  try {
    const u = new URL(url)
    return `${u.protocol}//${u.host}/…`
  } catch {
    return 'Playlist address'
  }
}

export const fileLabel = (name: string) => name.trim().slice(0, 80) || 'Playlist file'

export function defaultName(origin: PlaylistSource['origin'], value: string): string {
  if (origin === 'file') return fileLabel(value).replace(/\.m3u8?$/i, '') || 'Playlist file'
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return 'Playlist'
  }
}

/** Only messages Rust wrote for the user (host at most) are shown; anything else is replaced. */
export function userMessage(e: unknown): string {
  return e instanceof IngestError && e.code !== 'internal' ? e.message : GENERIC_ERROR
}

// Initials backgrounds, the same muted set the demonstration channels use.
const TONES = ['#2f4a6b', '#3a3f6e', '#7a2e2e', '#1f5a43', '#6b5326', '#3f5f2a', '#5b2a44', '#22566a', '#6a5a1e', '#4e2f6a', '#3d4650', '#6e3b2c']

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + (c.codePointAt(0) ?? 0)) >>> 0, 7)

function initials(name: string): string {
  const words = name.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w))
  const letters = words.slice(0, 2).map((w) => [...w.replace(/^[^\p{L}\p{N}]+/u, '')][0] ?? '')
  return letters.join('').toUpperCase() || '?'
}

/** `Animation; Comedy;;comedy` → ['Animation', 'Comedy']: trimmed, empties and repeats (any case) dropped. */
export function splitCategories(raw: string | null): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of (raw ?? '').split(';')) {
    const label = part.trim()
    if (label && !seen.has(label.toLowerCase())) {
      seen.add(label.toLowerCase())
      out.push(label)
    }
  }
  return out.length > 0 ? out : [UNCATEGORISED]
}

export const inCategory = (c: Channel, label: string) => c.categories.some((x) => x.toLowerCase() === label.toLowerCase())
export const categoryLabel = (c: Channel) => c.categories.join(' · ')

/** The channel list for a category chip; each channel appears once whatever its number of categories. */
export function filterChannels(channels: Channel[], group: string, favouriteIds: string[]): Channel[] {
  if (group === 'All') return channels
  if (group === 'Favourites') return channels.filter((c) => favouriteIds.includes(c.id))
  return channels.filter((c) => inCategory(c, group))
}

/**
 * Escapes a Rust key into `[A-Za-z0-9._-]`: every other character, `_` included, becomes `_<hex>_`, so
 * the mapping is one-to-one, and the id passes through `?channel=` links and `channel:` refs unchanged.
 */
const idSafe = (key: string) =>
  [...key].map((ch) => (/[A-Za-z0-9.-]/.test(ch) ? ch : `_${(ch.codePointAt(0) ?? 0).toString(16)}_`)).join('')

/**
 * Maps parsed entries to channels. Ids are `<sourceId>~<escaped Rust key>`: unique within a source,
 * stable across refreshes, and never shared between sources, so separate sources are never merged.
 * Within one source, Rust has already dropped exact repeats (same guide id and stream address).
 */
export function toChannels(sourceId: string, report: PlaylistReport): Channel[] {
  return report.channels.map((c, i) => {
    const name = c.name.trim() || 'Unnamed channel'
    return {
      id: `${sourceId}~${idSafe(c.key)}`,
      number: c.chno ?? i + 1,
      name,
      group: c.group?.trim() || UNCATEGORISED,
      categories: splitCategories(c.group),
      logoUrl: null, // remote logos stay blocked by the CSP; initials are shown instead
      mark: { text: initials(name), tone: TONES[hash(c.key) % TONES.length] ?? '#3d4650' },
      streamUrl: c.streamUrl,
      hd: false,
      sourceId,
      tvgId: c.tvgId,
    }
  })
}

export function createSource(
  id: string,
  input: { name: string; origin: PlaylistSource['origin']; url: string | null; label: string },
  report: PlaylistReport,
  now: number,
): PlaylistSource {
  return {
    id, ...input, addedAt: now, status: 'parsed', op: 0, lastAttempt: now, lastSuccess: now,
    channels: toChannels(id, report), skipped: report.skipped, duplicates: report.duplicates, warnings: report.warnings, error: null,
  }
}

export const begin = (list: PlaylistSource[], id: string, op: number, now: number): PlaylistSource[] =>
  list.map((s) => (s.id === id ? { ...s, status: 'importing', op, lastAttempt: now } : s))

/** Replaces the source's channels wholesale, so a refresh never leaves stale entries behind. */
export const succeed = (list: PlaylistSource[], id: string, op: number, report: PlaylistReport, now: number): PlaylistSource[] =>
  list.map((s) => (s.id !== id || s.op !== op ? s : {
    ...s, status: 'parsed', channels: toChannels(id, report), skipped: report.skipped, duplicates: report.duplicates,
    warnings: report.warnings, error: null, lastSuccess: now,
  }))

export const fail = (list: PlaylistSource[], id: string, op: number, message: string): PlaylistSource[] =>
  list.map((s) => (s.id !== id || s.op !== op ? s : { ...s, status: 'failed', error: message }))

export const removeSource = (list: PlaylistSource[], id: string) => list.filter((s) => s.id !== id)

/**
 * Fetches or reads a playlist and applies the result, unless a newer operation on the same source
 * started meanwhile or the source was removed. `op` must be unique and increasing per call.
 */
export async function runImport(
  update: (fn: (list: PlaylistSource[]) => PlaylistSource[]) => void,
  id: string,
  op: number,
  load: () => Promise<PlaylistReport | null>,
  now: () => number = Date.now,
): Promise<void> {
  update((l) => begin(l, id, op, now()))
  let report: PlaylistReport | null
  try {
    report = await load()
  } catch (e) {
    update((l) => fail(l, id, op, userMessage(e)))
    return
  }
  if (report) update((l) => succeed(l, id, op, report, now()))
  else update((l) => fail(l, id, op, DESKTOP_ONLY))
}

/** Playlist channels when any playlist source exists, otherwise the demonstration catalogue. Never both. */
export function activeChannels(sources: PlaylistSource[], demo: Channel[]): Channel[] {
  return sources.length > 0 ? sources.flatMap((s) => s.channels) : demo
}

/** Individual categories (first spelling seen, case-insensitive) in alphabetical order, Uncategorised last. */
export function channelGroups(channels: Channel[]): string[] {
  const labels = new Map<string, string>()
  for (const label of channels.flatMap((c) => c.categories)) if (!labels.has(label.toLowerCase())) labels.set(label.toLowerCase(), label)
  const sorted = [...labels.values()].filter((g) => g !== UNCATEGORISED).sort((a, b) => a.localeCompare(b))
  return labels.has(UNCATEGORISED.toLowerCase()) ? [...sorted, UNCATEGORISED] : sorted
}

export function statusText(s: PlaylistSource): string {
  const n = s.channels.length
  const count = `${n} channel${n === 1 ? '' : 's'}`
  if (s.status === 'importing') return 'Importing…'
  if (s.status === 'parsed') return `Parsed · ${count}`
  return s.lastSuccess ? `Refresh failed · ${count} kept` : 'Import failed'
}

export const statusTone = (s: PlaylistSource) => (s.status === 'importing' ? 'scanning' : s.status === 'parsed' ? 'healthy' : 'failing')
