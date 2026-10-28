// The typed boundary between React and the Rust shell (src-tauri/src/lib.rs). In a plain browser
// (Vite dev server, Vitest) there is no shell, so calls resolve to null instead of failing.
import { invoke, isTauri } from '@tauri-apps/api/core'

/** Mirrors `AppInfo` in src-tauri/src/lib.rs (serde camelCase). */
export interface AppInfo {
  name: string
  version: string
  profile: 'debug' | 'release'
  os: string
  arch: string
  tauriVersion: string
}

const isText = (v: unknown, max = 64): v is string => typeof v === 'string' && v.length > 0 && v.length <= max

/** Data crossing IPC is checked on arrival rather than trusted from the type annotation. */
export function parseAppInfo(raw: unknown): AppInfo {
  const v = raw as Record<string, unknown> | null
  if (
    typeof v !== 'object' || v === null ||
    !isText(v.name) || !isText(v.version) || !isText(v.os) || !isText(v.arch) || !isText(v.tauriVersion) ||
    (v.profile !== 'debug' && v.profile !== 'release')
  ) {
    throw new Error('The native shell returned app information in an unexpected shape.')
  }
  return { name: v.name, version: v.version, profile: v.profile, os: v.os, arch: v.arch, tauriVersion: v.tauriVersion }
}

/** True inside the Kinora desktop app; false in a plain browser and in tests. */
export const inNativeShell = () => isTauri()

export async function getAppInfo(): Promise<AppInfo | null> {
  if (!isTauri()) return null
  return parseAppInfo(await invoke('app_info'))
}

/** Mirrors `MAX_PLAYLIST_BYTES` in src-tauri/src/ingest.rs. */
export const MAX_PLAYLIST_BYTES = 25 * 1024 * 1024
const MAX_CHANNELS = 50_000

/** Mirrors `Channel` in src-tauri/src/m3u.rs. Parsed metadata only: nothing here has been played. */
export interface PlaylistChannel {
  key: string
  tvgId: string | null
  name: string
  group: string | null
  logo: string | null
  language: string | null
  country: string | null
  chno: number | null
  /** As written in the playlist; may hold account names, passwords or tokens. Never display or log it. */
  streamUrl: string
  /** `scheme://host[:port]/…`: the only form of the stream address to show. */
  streamDisplay: string
}

/** Mirrors `Report` in src-tauri/src/ingest.rs. */
export interface PlaylistReport {
  channels: PlaylistChannel[]
  skipped: number
  duplicates: number
  warnings: string[]
  host: string | null
}

const INGEST_CODES = [
  'invalid-url', 'blocked', 'too-many-redirects', 'timeout', 'too-large', 'too-many-entries',
  'http-status', 'web-page', 'hls-media', 'hls-master', 'not-playlist', 'network', 'busy', 'unsupported-stream', 'storage',
  'not-guide',
] as const
/** Codes from `ErrorCode` in ingest.rs, plus `internal` for a failure that did not come from it. */
export type IngestErrorCode = (typeof INGEST_CODES)[number] | 'internal'

export class IngestError extends Error {
  readonly code: IngestErrorCode
  constructor(code: IngestErrorCode, message: string) {
    super(message)
    this.name = 'IngestError'
    this.code = code
  }
}

const isIngestCode = (v: unknown): v is (typeof INGEST_CODES)[number] => INGEST_CODES.some((c) => c === v)
const isCount = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max
const isOptText = (v: unknown, max: number): v is string | null => v === null || isText(v, max)

function parseChannel(raw: unknown): PlaylistChannel {
  const v = raw as Record<string, unknown> | null
  if (
    typeof v !== 'object' || v === null ||
    !isText(v.key, 600) || !isText(v.name, 1024) || !isText(v.streamUrl, 4096) || !isText(v.streamDisplay, 600) ||
    !isOptText(v.tvgId, 1024) || !isOptText(v.group, 1024) || !isOptText(v.logo, 2048) ||
    !isOptText(v.language, 1024) || !isOptText(v.country, 1024) ||
    !(v.chno === null || (isCount(v.chno, 99_999) && v.chno > 0))
  ) {
    throw new Error('The native shell returned a playlist channel in an unexpected shape.')
  }
  return { key: v.key, tvgId: v.tvgId, name: v.name, group: v.group, logo: v.logo, language: v.language, country: v.country, chno: v.chno, streamUrl: v.streamUrl, streamDisplay: v.streamDisplay }
}

export function parsePlaylistReport(raw: unknown): PlaylistReport {
  const v = raw as Record<string, unknown> | null
  if (
    typeof v !== 'object' || v === null ||
    !Array.isArray(v.channels) || v.channels.length > MAX_CHANNELS ||
    !isCount(v.skipped, Number.MAX_SAFE_INTEGER) || !isCount(v.duplicates, Number.MAX_SAFE_INTEGER) ||
    !Array.isArray(v.warnings) || v.warnings.length > 20 || !v.warnings.every((w): w is string => isText(w, 1024)) ||
    !isOptText(v.host, 256)
  ) {
    throw new Error('The native shell returned a playlist report in an unexpected shape.')
  }
  return { channels: v.channels.map(parseChannel), skipped: v.skipped, duplicates: v.duplicates, warnings: [...v.warnings], host: v.host }
}

/** Turns an `invoke` rejection into a typed error. Unrecognised shapes are not echoed to the UI. */
export function toIngestError(raw: unknown): IngestError {
  const v = raw as Record<string, unknown> | null
  if (typeof v === 'object' && v !== null && isIngestCode(v.code) && isText(v.message, 500)) {
    return new IngestError(v.code, v.message)
  }
  return new IngestError('internal', 'Kinora could not read that playlist.')
}

async function ingest(command: string, args: Record<string, string>): Promise<PlaylistReport> {
  let raw: unknown
  try {
    raw = await invoke(command, args)
  } catch (e) {
    throw toIngestError(e)
  }
  return parsePlaylistReport(raw)
}

/** Downloads and parses a playlist in Rust. `null` outside the native shell (browser dev, tests). */
export async function fetchPlaylist(url: string): Promise<PlaylistReport | null> {
  if (!isTauri()) return null
  return ingest('fetch_playlist', { url })
}

/** Reads a file the user picked with `<input type="file">` and parses it in Rust; no path is shared. */
export async function readPlaylistFile(file: File): Promise<PlaylistReport | null> {
  if (!isTauri()) return null
  if (file.size > MAX_PLAYLIST_BYTES) throw new IngestError('too-large', 'That file is larger than the 25 MB playlist limit.')
  return ingest('parse_playlist_text', { text: await file.text() })
}

/** Mirrors `Opened` in src-tauri/src/stream.rs. */
export interface OpenedStream {
  /** `kstream://localhost/<handle>`: the only address the page ever gets for a stream. */
  url: string
  session: number
}

const STREAM_ADDRESS = /^kstream:\/\/localhost\/[0-9a-f]{32}$/

export function parseOpenedStream(raw: unknown): OpenedStream {
  const v = raw as Record<string, unknown> | null
  if (typeof v !== 'object' || v === null || typeof v.url !== 'string' || !STREAM_ADDRESS.test(v.url) || !isCount(v.session, Number.MAX_SAFE_INTEGER) || v.session < 1) {
    throw new Error('The native shell returned a stream session in an unexpected shape.')
  }
  return { url: v.url, session: v.session }
}

/** Runs async commands one at a time, in the order they were asked for, whatever happens to each. */
function serial() {
  let tail: Promise<unknown> = Promise.resolve()
  return <T>(run: () => Promise<T>): Promise<T> => {
    const next = tail.then(run, run)
    tail = next.catch(() => undefined)
    return next
  }
}

// Rust keeps one stream session: each open ends the previous one. The commands are async in Rust and
// may finish out of order, so they are sent one at a time: the session Rust keeps is then always the
// last one the page asked for (rapid channel changes, React's double-run effects in development).
const queued = serial()

/**
 * Starts a guarded playback session in Rust for a playlist channel's stream address and returns an
 * opaque `kstream` address for hls.js. `null` outside the native shell. Rejects with `IngestError`
 * (`unsupported-stream`, `blocked`...) when the stream cannot be played.
 */
export async function openStream(streamUrl: string): Promise<OpenedStream | null> {
  if (!isTauri()) return null
  return queued(async () => {
    let raw: unknown
    try {
      raw = await invoke('open_stream', { url: streamUrl })
    } catch (e) {
      throw toIngestError(e)
    }
    return parseOpenedStream(raw)
  })
}

/** Ends a playback session in Rust, cancelling its requests. Closing an older session is harmless. */
export async function closeStream(session: number): Promise<void> {
  if (!isTauri()) return
  await queued(() => invoke('close_stream', { session }))
}

/** Mirrors `SavedChannel` in src-tauri/src/sources.rs: metadata only, never a stream address. */
export interface SavedChannel {
  key: string
  tvgId: string | null
  name: string
  group: string | null
  chno: number | null
}

/** Mirrors `SavedSource` in src-tauri/src/sources.rs. `url` may carry a token: never display it. */
export interface SavedSource {
  id: string
  name: string
  origin: 'url' | 'file'
  url: string | null
  label: string
  addedAt: number
  lastSuccess: number | null
  skipped: number
  duplicates: number
  channels: SavedChannel[]
}

/** Mirrors `Notice` in sources.rs: why saved sources could not simply be loaded. */
export type StorageNotice = 'recovered' | 'newer-version' | 'unreadable'
const NOTICES: readonly StorageNotice[] = ['recovered', 'newer-version', 'unreadable']

const isNotice = (v: unknown): v is StorageNotice => NOTICES.some((n) => n === v)
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

function parseSavedChannel(raw: unknown): SavedChannel {
  const v = raw as Record<string, unknown> | null
  if (typeof v !== 'object' || v === null || !isText(v.key, 600) || !isText(v.name, 1024) || !isOptText(v.tvgId, 1024) ||
      !(v.group === null || (typeof v.group === 'string' && v.group.length <= 1024)) || !(v.chno === null || (isCount(v.chno, 99_999) && v.chno > 0))) {
    throw new Error('Saved channel data is in an unexpected shape.')
  }
  return { key: v.key, tvgId: v.tvgId, name: v.name, group: v.group, chno: v.chno }
}

export function parseSavedSource(raw: unknown): SavedSource {
  const v = raw as Record<string, unknown> | null
  if (typeof v !== 'object' || v === null || !isText(v.id, 48) || !/^pl-[a-z0-9-]+$/.test(v.id) || !isText(v.name, 200) || !isText(v.label, 480) ||
      !(v.origin === 'url' ? isText(v.url, 2048) : v.origin === 'file' && v.url === null) ||
      !isTime(v.addedAt) || !(v.lastSuccess === null || isTime(v.lastSuccess)) ||
      !isCount(v.skipped, 2 ** 32) || !isCount(v.duplicates, 2 ** 32) || !Array.isArray(v.channels) || v.channels.length > MAX_CHANNELS) {
    throw new Error('Saved source data is in an unexpected shape.')
  }
  const origin = v.origin === 'url' ? 'url' : 'file'
  return {
    id: v.id, name: v.name, origin, url: origin === 'url' && typeof v.url === 'string' ? v.url : null, label: v.label, addedAt: v.addedAt,
    lastSuccess: v.lastSuccess, skipped: v.skipped, duplicates: v.duplicates, channels: v.channels.map(parseSavedChannel),
  }
}

/** Mirrors `SavedGuide` in src-tauri/src/sources.rs. `url` may carry a token: never display it. */
export interface SavedGuide {
  id: string
  name: string
  origin: 'url' | 'file'
  url: string | null
  label: string
  addedAt: number
  lastSuccess: number | null
  /** Playlist sources whose channels this guide is matched against. */
  playlists: string[]
}

/** Mirrors `SavedMapping` in sources.rs: a playlist channel matched by hand to a guide channel. */
export interface SavedMapping {
  channel: string
  guide: string
  xmltvId: string
}

/** Everything Rust saves (sources.rs `Saved`). */
export interface SavedState {
  sources: SavedSource[]
  guides: SavedGuide[]
  mappings: SavedMapping[]
}

const MAX_GUIDES = 8
const GUIDE_ID = /^gd-[a-z0-9-]+$/

export function parseSavedGuide(raw: unknown): SavedGuide {
  const v = raw as Record<string, unknown> | null
  if (typeof v !== 'object' || v === null || !isText(v.id, 48) || !GUIDE_ID.test(v.id) || !isText(v.name, 200) || !isText(v.label, 480) ||
      !(v.origin === 'url' ? isText(v.url, 2048) : v.origin === 'file' && v.url === null) ||
      !isTime(v.addedAt) || !(v.lastSuccess === null || isTime(v.lastSuccess)) ||
      !Array.isArray(v.playlists) || v.playlists.length > 100 || !v.playlists.every((p): p is string => isText(p, 48))) {
    throw new Error('Saved guide data is in an unexpected shape.')
  }
  const origin = v.origin === 'url' ? 'url' : 'file'
  return {
    id: v.id, name: v.name, origin, url: origin === 'url' && typeof v.url === 'string' ? v.url : null, label: v.label,
    addedAt: v.addedAt, lastSuccess: v.lastSuccess, playlists: [...v.playlists],
  }
}

export function parseSavedMapping(raw: unknown): SavedMapping {
  const v = raw as Record<string, unknown> | null
  if (typeof v !== 'object' || v === null || !isText(v.channel, 8192) || !isText(v.guide, 48) || !isText(v.xmltvId, 1024)) {
    throw new Error('Saved guide match is in an unexpected shape.')
  }
  return { channel: v.channel, guide: v.guide, xmltvId: v.xmltvId }
}

/** Loads saved sources from Rust. `null` outside the native shell (browser dev and tests keep memory-only sources). */
export async function loadSources(): Promise<(SavedState & { notice: StorageNotice | null }) | null> {
  if (!isTauri()) return null
  const raw = await invoke('load_sources') as Record<string, unknown> | null
  const notice = raw?.notice ?? null
  if (typeof raw !== 'object' || raw === null || !Array.isArray(raw.sources) || !Array.isArray(raw.guides) || raw.guides.length > MAX_GUIDES ||
      !Array.isArray(raw.mappings) || raw.mappings.length > 50_000 || !(notice === null || isNotice(notice))) {
    throw new Error('Saved sources arrived in an unexpected shape.')
  }
  return { sources: raw.sources.map(parseSavedSource), guides: raw.guides.map(parseSavedGuide), mappings: raw.mappings.map(parseSavedMapping), notice }
}

const saves = serial()

/** Replaces the saved sources, guides and matches. Saves run in order, so the last one asked for is the one kept. */
export async function saveSources(saved: SavedState): Promise<void> {
  if (!isTauri()) return
  await saves(async () => {
    try {
      await invoke('save_sources', { saved })
    } catch (e) {
      throw toIngestError(e)
    }
  })
}

/** Mirrors `MAX_GUIDE_BYTES` in src-tauri/src/fetch.rs: a downloaded or picked guide, before decompression. */
export const MAX_GUIDE_BYTES = 64 * 1024 * 1024

/** Mirrors `Summary` in src-tauri/src/guides.rs: what Rust holds for one guide. */
export interface GuideSummary {
  channels: number
  programmes: number
  /** Earliest start and latest stop kept (UTC ms); null when there are no programmes. */
  first: number | null
  last: number | null
  /** When the guide was read (UTC ms). */
  fetchedAt: number
  skipped: number
  duplicates: number
  warnings: string[]
}

const isOptTime = (v: unknown): v is number | null => v === null || (typeof v === 'number' && Number.isFinite(v))

export function parseGuideSummary(raw: unknown): GuideSummary {
  const v = raw as Record<string, unknown> | null
  if (typeof v !== 'object' || v === null || !isCount(v.channels, 20_000) || !isCount(v.programmes, 150_000) ||
      !isOptTime(v.first) || !isOptTime(v.last) || !isTime(v.fetchedAt) || !isCount(v.skipped, 2 ** 32) || !isCount(v.duplicates, 2 ** 32) ||
      !Array.isArray(v.warnings) || v.warnings.length > 20 || !v.warnings.every((w): w is string => isText(w, 300))) {
    throw new Error('The native shell returned a guide summary in an unexpected shape.')
  }
  return { channels: v.channels, programmes: v.programmes, first: v.first, last: v.last, fetchedAt: v.fetchedAt, skipped: v.skipped, duplicates: v.duplicates, warnings: [...v.warnings] }
}

async function guideCall(command: string, args: Parameters<typeof invoke>[1], options?: Parameters<typeof invoke>[2]): Promise<GuideSummary> {
  let raw: unknown
  try {
    raw = await invoke(command, args, options)
  } catch (e) {
    throw toIngestError(e)
  }
  return parseGuideSummary(raw)
}

/** Downloads and parses an XMLTV guide in Rust, under the page's id for it. `null` outside the native shell. */
export async function fetchGuide(id: string, url: string): Promise<GuideSummary | null> {
  if (!isTauri()) return null
  return guideCall('fetch_guide', { id, url })
}

/** Sends the bytes of a guide file the user picked (plain or gzip) to Rust; no path is shared. */
export async function readGuideFile(id: string, file: File): Promise<GuideSummary | null> {
  if (!isTauri()) return null
  if (file.size > MAX_GUIDE_BYTES) throw new IngestError('too-large', 'That file is larger than the 64 MB guide limit.')
  return guideCall('import_guide_file', new Uint8Array(await file.arrayBuffer()), { headers: { 'x-guide-id': id } })
}

/** What Rust holds for a guide (from this session or its cache); `null` when nothing is held or outside the shell. */
export async function loadGuide(id: string): Promise<GuideSummary | null> {
  if (!isTauri()) return null
  let raw: unknown
  try {
    raw = await invoke('load_guide', { id })
  } catch (e) {
    throw toIngestError(e)
  }
  return raw === null ? null : parseGuideSummary(raw)
}

/** Mirrors `GuideChannel` in src-tauri/src/xmltv.rs. */
export interface GuideChannel { id: string; name: string }

export async function guideChannels(id: string): Promise<GuideChannel[]> {
  if (!isTauri()) return []
  const raw: unknown = await invoke('guide_channels', { id })
  if (!Array.isArray(raw) || raw.length > 20_000) throw new Error('The native shell returned guide channels in an unexpected shape.')
  return raw.map((c: unknown) => {
    const v = c as Record<string, unknown> | null
    if (typeof v !== 'object' || v === null || !isText(v.id, 1024) || !isText(v.name, 1024)) throw new Error('The native shell returned a guide channel in an unexpected shape.')
    return { id: v.id, name: v.name }
  })
}

/** Mirrors `Listed` in src-tauri/src/guides.rs: one programme, with the guide channel id it belongs to. */
export interface GuideProgramme {
  channel: string
  start: number
  stop: number
  /** The guide gave no stop time; it is the next programme's start. */
  stopEstimated: boolean
  title: string
  subtitle: string | null
  desc: string | null
  category: string | null
  episode: string | null
}

/** Mirrors `Answer` in guides.rs. */
export interface GuideAnswer {
  guide: string
  /** False when Rust holds no data for the guide. */
  loaded: boolean
  matches: { id: string; channel: string | null }[]
  programmes: GuideProgramme[]
}

export interface GuideQuery { guide: string; ids: string[] }

function parseGuideProgramme(raw: unknown): GuideProgramme {
  const v = raw as Record<string, unknown> | null
  if (typeof v !== 'object' || v === null || !isText(v.channel, 1024) || !isTime(v.start) || !isTime(v.stop) || v.stop <= v.start ||
      typeof v.stopEstimated !== 'boolean' || !isText(v.title, 1000) || !isOptText(v.subtitle, 1000) || !isOptText(v.desc, 3000) ||
      !isOptText(v.category, 300) || !isOptText(v.episode, 200)) {
    throw new Error('The native shell returned a programme in an unexpected shape.')
  }
  return { channel: v.channel, start: v.start, stop: v.stop, stopEstimated: v.stopEstimated, title: v.title, subtitle: v.subtitle, desc: v.desc, category: v.category, episode: v.episode }
}

export function parseGuideAnswers(raw: unknown): GuideAnswer[] {
  if (!Array.isArray(raw) || raw.length > MAX_GUIDES) throw new Error('The native shell returned guide data in an unexpected shape.')
  return raw.map((a: unknown) => {
    const v = a as Record<string, unknown> | null
    if (typeof v !== 'object' || v === null || !isText(v.guide, 48) || typeof v.loaded !== 'boolean' || !Array.isArray(v.matches) || !Array.isArray(v.programmes)) {
      throw new Error('The native shell returned guide data in an unexpected shape.')
    }
    const matches = v.matches.map((m: unknown) => {
      const x = m as Record<string, unknown> | null
      if (typeof x !== 'object' || x === null || !isText(x.id, 1024) || !isOptText(x.channel, 1024)) throw new Error('The native shell returned a guide match in an unexpected shape.')
      return { id: x.id, channel: x.channel }
    })
    return { guide: v.guide, loaded: v.loaded, matches, programmes: v.programmes.map(parseGuideProgramme) }
  })
}

/** Programmes overlapping `[from, to)` for the channel ids asked about, per guide. `null` outside the native shell. */
export async function guideProgrammes(queries: GuideQuery[], from: number, to: number): Promise<GuideAnswer[] | null> {
  if (!isTauri()) return null
  let raw: unknown
  try {
    raw = await invoke('guide_programmes', { queries, from, to })
  } catch (e) {
    throw toIngestError(e)
  }
  return parseGuideAnswers(raw)
}

/** Deletes what Rust holds for a guide (programmes and cache); any import still running is dropped. */
export async function removeGuide(id: string): Promise<void> {
  if (!isTauri()) return
  try {
    await invoke('remove_guide', { id })
  } catch (e) {
    throw toIngestError(e)
  }
}
