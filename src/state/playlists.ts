// Playlist sources imported through the Rust ingest commands (src/lib/native.ts). Saved by Rust
// (sources.rs) without stream addresses: a restored source lists its channels, which play again once
// the source is refreshed (or, for a file, chosen again). Nothing here has been playback-tested.
import type { Channel, SourceKind } from '../data/types'
import { IngestError, type PlaylistChannel, type PlaylistReport, type SavedChannel, type SavedSource } from '../lib/native'

export const UNCATEGORISED = 'Uncategorised'
export const NOT_TESTED = 'Streams not playback-tested'
export const DESKTOP_ONLY = 'Importing playlists needs the Kinora desktop app. This browser preview cannot fetch or read playlists.'
const GENERIC_ERROR = 'Kinora could not read that playlist.'

export interface PlaylistSource {
  id: string
  name: string
  origin: 'url' | 'file'
  /** URL sources only, so Refresh can fetch it again. Saved by Rust; never shown or logged. */
  url: string | null
  /** Safe to show: `https://host/…` or the file name. */
  label: string
  addedAt: number
  /** `saved`: restored from disk and not refreshed this session, so its channels cannot play yet. */
  status: 'saved' | 'importing' | 'parsed' | 'failed'
  /** Latest operation started for this source; results of older operations are dropped. */
  op: number
  lastAttempt: number
  lastSuccess: number | null
  /** Channels from the last successful import. A failed refresh keeps them, and says so. */
  channels: Channel[]
  /** The same channels as saved to disk: metadata only, never a stream address. */
  entries: SavedChannel[]
  skipped: number
  duplicates: number
  /** From Rust: line numbers and reasons only, never addresses. */
  warnings: string[]
  /** Safe message from the latest failed attempt. */
  error: string | null
}

/**
 * Validates a playlist address typed into Add Source: well-formed http(s), no embedded credentials,
 * not already added, and not a URL list. Guides use `checkGuideUrl` (guides.ts). Rust checks scheme,
 * credentials and destination again before fetching.
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
  if (kind === 'url-list') return { error: 'Kinora can import M3U playlists and XMLTV guides so far. URL lists are not supported yet.' }
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
  const active = channels.filter((c) => !c.isDivider)
  if (group === 'All') return active
  if (group === 'Favourites') return active.filter((c) => favouriteIds.includes(c.id))
  return active.filter((c) => inCategory(c, group))
}

/**
 * Escapes a Rust key into `[A-Za-z0-9._-]`: every other character, `_` included, becomes `_<hex>_`, so
 * the mapping is one-to-one, and the id passes through `?channel=` links and `channel:` refs unchanged.
 */
const idSafe = (key: string) =>
  [...key].map((ch) => (/[A-Za-z0-9.-]/.test(ch) ? ch : `_${(ch.codePointAt(0) ?? 0).toString(16)}_`)).join('')

/** A channel as parsed (with its stream address) or as restored from disk (without one). */
type ChannelEntry = SavedChannel & Partial<Pick<PlaylistChannel, 'logo' | 'language' | 'country' | 'catchup' | 'catchupDays' | 'catchupSource' | 'streamDisplay'>> & { streamUrl: string | null }

import { cleanChannelTitle, isDividerChannel, parseChannelMetadata } from '../lib/cleanTitle'
export { cleanChannelTitle, isDividerChannel, parseChannelMetadata }

/**
 * Maps entries to channels. Ids are `<sourceId>~<escaped Rust key>`: unique within a source, stable
 * across refreshes and restarts, and never shared between sources, so separate sources never merge.
 * Within one source, Rust has already dropped exact repeats (same guide id and stream address).
 */
export function toChannels(sourceId: string, entries: ChannelEntry[]): Channel[] {
  return entries.map((c, i) => {
    const name = c.name.trim() || 'Unnamed channel'
    const meta = parseChannelMetadata(name)
    const isHd = meta.resolution === 'HD' || meta.resolution === '720p' || meta.resolution === '1080p' || meta.resolution === '4K' || /\b(hd|fhd|1080p?|uhd|4k)\b/i.test(name)
    const isDivider = isDividerChannel(name, c.streamUrl)
    const hasCatchup = Boolean(c.catchup || (c.catchupDays && c.catchupDays > 0) || c.catchupSource)
    const tvArchive = hasCatchup ? 1 : undefined
    const tvArchiveDuration = c.catchupDays ? c.catchupDays * 24 * 3600 : undefined
    return {
      id: `${sourceId}~${idSafe(c.key)}`,
      number: c.chno ?? i + 1,
      name,
      cleanName: meta.cleanTitle,
      badges: meta.badges,
      isDivider,
      group: c.group?.trim() || UNCATEGORISED,
      categories: splitCategories(c.group),
      logoUrl: c.logo ?? null,
      mark: { text: initials(name), tone: TONES[hash(c.key) % TONES.length] ?? '#3d4650' },
      streamUrl: c.streamUrl,
      hd: isHd,
      sourceId,
      tvgId: c.tvgId,
      tvArchive,
      tvArchiveDuration,
      catchupType: c.catchup ?? null,
      catchupSource: c.catchupSource ?? null,
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
    channels: toChannels(id, report.channels), entries: report.channels.map(savedChannel), skipped: report.skipped, duplicates: report.duplicates,
    warnings: report.warnings, error: null,
  }
}

/** Returns true only if the URL is a safe, public, credential-free HTTP(S) address. */
export function isCredentialSafeLogoUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string' || url.length > 2048) return false
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    if (u.username || u.password) return false
    const pathLower = u.pathname.toLowerCase()
    if (['hunter2', 'password', 'secret', 'token'].some((t) => pathLower.includes(t))) return false
    const sensitive = [
      'token', 'auth', 'key', 'sig', 'signature', 'pass', 'password', 'user', 'username',
      'hash', 'secret', 'session', 'jwt', 'ticket', 'bearer', 'credential', 'api_key',
      'apikey', 'code', 'access_token', 'refresh_token', 'client_secret',
    ]
    for (const [k, v] of u.searchParams.entries()) {
      const kLower = k.toLowerCase()
      if (sensitive.some((s) => kLower === s || kLower.includes(s))) return false
      if (v.length >= 32 && /^[A-Za-z0-9_-]+$/.test(v)) return false
    }
    return true
  } catch {
    return false
  }
}

const savedChannel = ({ key, tvgId, name, group, chno, logo }: SavedChannel & { logo?: string | null }): SavedChannel => ({
  key,
  tvgId,
  name,
  group,
  chno,
  ...(isCredentialSafeLogoUrl(logo) ? { logo: logo! } : {}),
})

/** A source restored from disk: its channels are listed, but have no stream address until refreshed. */
export function restoreSource(saved: SavedSource): PlaylistSource {
  return {
    id: saved.id, name: saved.name, origin: saved.origin, url: saved.url, label: saved.label, addedAt: saved.addedAt,
    status: 'saved', op: 0, lastAttempt: saved.lastSuccess ?? saved.addedAt, lastSuccess: saved.lastSuccess,
    channels: toChannels(saved.id, saved.channels.map((c) => ({ ...c, streamUrl: null }))), entries: saved.channels,
    skipped: saved.skipped, duplicates: saved.duplicates, warnings: [], error: null,
  }
}

/** What is written to disk for a source: no stream or logo addresses; an address only for URL sources. */
export function toSaved(s: PlaylistSource): SavedSource {
  return {
    id: s.id, name: s.name, origin: s.origin, url: s.origin === 'url' ? s.url : null, label: s.label, addedAt: s.addedAt,
    lastSuccess: s.lastSuccess, skipped: s.skipped, duplicates: s.duplicates, channels: s.entries.map(savedChannel),
  }
}

export const begin = (list: PlaylistSource[], id: string, op: number, now: number): PlaylistSource[] =>
  list.map((s) => (s.id === id ? { ...s, status: 'importing', op, lastAttempt: now } : s))

/** Replaces the source's channels wholesale, so a refresh never leaves stale entries behind. */
export const succeed = (list: PlaylistSource[], id: string, op: number, report: PlaylistReport, now: number): PlaylistSource[] =>
  list.map((s) => (s.id !== id || s.op !== op ? s : {
    ...s, status: 'parsed', channels: toChannels(id, report.channels), entries: report.channels.map(savedChannel), skipped: report.skipped, duplicates: report.duplicates,
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
  if (s.status === 'saved') return `Saved · ${count}`
  return s.lastSuccess ? `Refresh failed · ${count} kept` : 'Import failed'
}

export const statusTone = (s: PlaylistSource) =>
  s.status === 'importing' ? 'scanning' : s.status === 'parsed' ? 'healthy' : s.status === 'saved' ? 'pending' : 'failing'

/** Why a restored channel cannot play yet, or `null` when it can. */
export function unavailableReason(s: PlaylistSource | undefined): string | null {
  if (!s || s.status === 'parsed') return null
  if (s.status === 'importing') return 'Updating this source’s channel list…'
  if (s.origin === 'file') return 'This channel comes from a playlist file. Choose the file again in Sources to play its channels.'
  return s.status === 'failed'
    ? 'This source could not be refreshed, so its streams are unavailable. Refresh it in Sources.'
    : 'This source has not been refreshed yet this session.'
}
