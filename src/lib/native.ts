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
  'http-status', 'web-page', 'hls-media', 'hls-master', 'not-playlist', 'network', 'busy', 'unsupported-stream',
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

// Rust keeps one stream session: each open ends the previous one. The commands are async in Rust and
// may finish out of order, so they are sent one at a time: the session Rust keeps is then always the
// last one the page asked for (rapid channel changes, React's double-run effects in development).
let streamQueue: Promise<unknown> = Promise.resolve()
function queued<T>(run: () => Promise<T>): Promise<T> {
  const next = streamQueue.then(run, run)
  streamQueue = next.catch(() => undefined)
  return next
}

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
