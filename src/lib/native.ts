// The typed boundary between React and the Rust shell (src-tauri/src/lib.rs). In a plain browser
// (Vite dev server, Vitest) there is no shell, so calls resolve to null instead of failing.
import { invoke, isTauri } from '@tauri-apps/api/core'
import packageInfo from '../../package.json'

/** Single authoritative application version read directly from root package.json. */
export const AUTHORITATIVE_VERSION: string = packageInfo.version
export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : AUTHORITATIVE_VERSION

export type VersionChannel = 'stable' | 'rc' | 'beta' | 'alpha' | 'development'

export function getVersionChannel(version: string, profile?: string): VersionChannel {
  if (profile === 'debug') return 'development'
  const lower = version.toLowerCase()
  if (lower.includes('-dev')) return 'development'
  if (lower.includes('-alpha')) return 'alpha'
  if (lower.includes('-beta')) return 'beta'
  if (lower.includes('-rc')) return 'rc'
  return 'stable'
}

export function formatChannelName(channel: VersionChannel): string {
  switch (channel) {
    case 'stable': return 'Stable'
    case 'rc': return 'Release Candidate'
    case 'beta': return 'Beta'
    case 'alpha': return 'Alpha'
    case 'development': return 'Development'
  }
}

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
  'not-guide', 'not-catalogue',
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

export interface XtreamCategory {
  id: string
  name: string
  parentId: string | null
}

export interface XtreamLiveStream {
  id: string
  num: number | null
  name: string
  streamType: string
  streamIcon: string | null
  epgChannelId: string | null
  categoryId: string | null
  categoryIds: string[]
  tvArchive: number
  tvArchiveDuration: number
  artworkKey: string
}

export interface XtreamUserInfo {
  username: string
  status: string
  expDate: string | null
  isTrial: string | null
  activeCons: string | null
  maxConnections: string | null
  createdAt: string | null
  auth: number
}

export interface XtreamServerInfo {
  url: string | null
  port: string | null
  httpsPort: string | null
  serverProtocol: string | null
  rtmpPort: string | null
  timezone: string | null
  timeNow: string | null
}

export interface XtreamCapabilities {
  hasLive: boolean
  hasVod: boolean
  hasSeries: boolean
  hasEpg: boolean
  hasCatchup: boolean
  liveCount: number
  vodCount: number
  seriesCount: number
  liveCategoriesCount: number
  vodCategoriesCount: number
  seriesCategoriesCount: number
}

export interface XtreamMovieDetails {
  id: string
  name: string
  plot: string | null
  cast: string | null
  director: string | null
  genre: string | null
  releaseDate: string | null
  durationSecs: number | null
  rating: number | null
  backdrop: string | null
  streamIcon: string | null
  containerExtension: string
  artworkKey: string
}

export interface XtreamEpgListing {
  id: string
  epgId: string | null
  title: string
  lang: string | null
  start: string
  end: string
  description: string | null
  channelId: string | null
  startTimestamp: number | null
  stopTimestamp: number | null
}

export interface XtreamConnectionReport {
  success: boolean
  message: string
  userInfo: XtreamUserInfo | null
  serverInfo: XtreamServerInfo | null
  capabilities: XtreamCapabilities | null
}

export interface XtreamEntry {
  id: string
  name: string
  categoryId: string | null
  categoryName?: string | null
  year: number | null
  rating?: number | null
  plot: string | null
  extension: string
  artworkKey: string
}

export interface XtreamCatalogue {
  movies: XtreamEntry[]
  series: XtreamEntry[]
  liveStreams?: XtreamLiveStream[]
  liveCategories?: XtreamCategory[]
  vodCategories?: XtreamCategory[]
  seriesCategories?: XtreamCategory[]
  userInfo?: XtreamUserInfo | null
  serverInfo?: XtreamServerInfo | null
  capabilities?: XtreamCapabilities | null
}
export interface XtreamEpisode {
  id: string; number: number; title: string; plot: string | null; runtimeSeconds: number | null; extension: string; artworkKey: string
}
export interface XtreamSeason { number: number; episodes: XtreamEpisode[] }
export interface XtreamSeriesDetails { plot: string | null; seasons: XtreamSeason[] }

const parseXtreamEntry = (raw: unknown): XtreamEntry => {
  const v = raw as Record<string, unknown> | null
  if (typeof v !== 'object' || v === null || !isText(v.id, 128) || !isText(v.name, 2048) ||
      !isOptText(v.categoryId, 128) || !(v.year === null || (typeof v.year === 'number' && Number.isInteger(v.year))) ||
      !isOptText(v.plot, 8192) || !isText(v.extension, 12) || !isText(v.artworkKey, 256)) {
    throw new Error('The native shell returned provider catalogue data in an unexpected shape.')
  }
  return {
    id: v.id,
    name: v.name,
    categoryId: v.categoryId,
    categoryName: isOptText(v.categoryName, 2048) ? v.categoryName : null,
    year: v.year,
    rating: typeof v.rating === 'number' ? v.rating : null,
    plot: v.plot,
    extension: v.extension,
    artworkKey: v.artworkKey,
  }
}

const parseXtreamCategory = (raw: unknown): XtreamCategory => {
  const v = raw as Record<string, unknown> | null
  if (typeof v !== 'object' || v === null || !isText(v.id, 128) || !isText(v.name, 2048)) {
    throw new Error('The native shell returned category data in an unexpected shape.')
  }
  return {
    id: v.id,
    name: v.name,
    parentId: typeof v.parentId === 'string' ? v.parentId : null,
  }
}

const parseXtreamLiveStream = (raw: unknown): XtreamLiveStream => {
  const v = raw as Record<string, unknown> | null
  if (typeof v !== 'object' || v === null || !isText(v.id, 128) || !isText(v.name, 2048) || !isText(v.artworkKey, 256)) {
    throw new Error('The native shell returned provider live stream data in an unexpected shape.')
  }
  return {
    id: v.id,
    num: typeof v.num === 'number' ? v.num : null,
    name: v.name,
    streamType: typeof v.streamType === 'string' ? v.streamType : 'live',
    streamIcon: typeof v.streamIcon === 'string' ? v.streamIcon : null,
    epgChannelId: typeof v.epgChannelId === 'string' ? v.epgChannelId : null,
    categoryId: typeof v.categoryId === 'string' ? v.categoryId : null,
    categoryIds: Array.isArray(v.categoryIds) ? v.categoryIds.filter((x): x is string => typeof x === 'string') : [],
    tvArchive: typeof v.tvArchive === 'number' ? v.tvArchive : 0,
    tvArchiveDuration: typeof v.tvArchiveDuration === 'number' ? v.tvArchiveDuration : 0,
    artworkKey: v.artworkKey,
  }
}

const parseXtreamUserInfo = (raw: unknown): XtreamUserInfo => {
  const v = raw as Record<string, unknown>
  return {
    username: typeof v.username === 'string' ? v.username : '',
    status: typeof v.status === 'string' ? v.status : 'Unknown',
    expDate: typeof v.expDate === 'string' ? v.expDate : null,
    isTrial: typeof v.isTrial === 'string' ? v.isTrial : null,
    activeCons: typeof v.activeCons === 'string' ? v.activeCons : null,
    maxConnections: typeof v.maxConnections === 'string' ? v.maxConnections : null,
    createdAt: typeof v.createdAt === 'string' ? v.createdAt : null,
    auth: typeof v.auth === 'number' ? v.auth : 0,
  }
}

const parseXtreamServerInfo = (raw: unknown): XtreamServerInfo => {
  const v = raw as Record<string, unknown>
  return {
    url: typeof v.url === 'string' ? v.url : null,
    port: typeof v.port === 'string' ? v.port : null,
    httpsPort: typeof v.httpsPort === 'string' ? v.httpsPort : null,
    serverProtocol: typeof v.serverProtocol === 'string' ? v.serverProtocol : null,
    rtmpPort: typeof v.rtmpPort === 'string' ? v.rtmpPort : null,
    timezone: typeof v.timezone === 'string' ? v.timezone : null,
    timeNow: typeof v.timeNow === 'string' ? v.timeNow : null,
  }
}

const parseXtreamCapabilities = (raw: unknown): XtreamCapabilities => {
  const v = raw as Record<string, unknown>
  return {
    hasLive: Boolean(v.hasLive),
    hasVod: Boolean(v.hasVod),
    hasSeries: Boolean(v.hasSeries),
    hasEpg: Boolean(v.hasEpg),
    hasCatchup: Boolean(v.hasCatchup),
    liveCount: typeof v.liveCount === 'number' ? v.liveCount : 0,
    vodCount: typeof v.vodCount === 'number' ? v.vodCount : 0,
    seriesCount: typeof v.seriesCount === 'number' ? v.seriesCount : 0,
    liveCategoriesCount: typeof v.liveCategoriesCount === 'number' ? v.liveCategoriesCount : 0,
    vodCategoriesCount: typeof v.vodCategoriesCount === 'number' ? v.vodCategoriesCount : 0,
    seriesCategoriesCount: typeof v.seriesCategoriesCount === 'number' ? v.seriesCategoriesCount : 0,
  }
}

const parseXtreamMovieDetails = (raw: unknown): XtreamMovieDetails => {
  const v = raw as Record<string, unknown>
  return {
    id: typeof v.id === 'string' ? v.id : '',
    name: typeof v.name === 'string' ? v.name : '',
    plot: typeof v.plot === 'string' ? v.plot : null,
    cast: typeof v.cast === 'string' ? v.cast : null,
    director: typeof v.director === 'string' ? v.director : null,
    genre: typeof v.genre === 'string' ? v.genre : null,
    releaseDate: typeof v.releaseDate === 'string' ? v.releaseDate : null,
    durationSecs: typeof v.durationSecs === 'number' ? v.durationSecs : null,
    rating: typeof v.rating === 'number' ? v.rating : null,
    backdrop: typeof v.backdrop === 'string' ? v.backdrop : null,
    streamIcon: typeof v.streamIcon === 'string' ? v.streamIcon : null,
    containerExtension: typeof v.containerExtension === 'string' ? v.containerExtension : 'mp4',
    artworkKey: typeof v.artworkKey === 'string' ? v.artworkKey : '',
  }
}

const parseXtreamEpgListing = (raw: unknown): XtreamEpgListing => {
  const v = raw as Record<string, unknown>
  return {
    id: typeof v.id === 'string' ? v.id : '',
    epgId: typeof v.epgId === 'string' ? v.epgId : null,
    title: typeof v.title === 'string' ? v.title : '',
    lang: typeof v.lang === 'string' ? v.lang : null,
    start: typeof v.start === 'string' ? v.start : '',
    end: typeof v.end === 'string' ? v.end : '',
    description: typeof v.description === 'string' ? v.description : null,
    channelId: typeof v.channelId === 'string' ? v.channelId : null,
    startTimestamp: typeof v.startTimestamp === 'number' ? v.startTimestamp : null,
    stopTimestamp: typeof v.stopTimestamp === 'number' ? v.stopTimestamp : null,
  }
}

export const parseXtreamConnectionReport = (raw: unknown): XtreamConnectionReport => {
  const v = raw as Record<string, unknown>
  return {
    success: Boolean(v?.success),
    message: typeof v?.message === 'string' ? v.message : '',
    userInfo: v?.userInfo ? parseXtreamUserInfo(v.userInfo) : null,
    serverInfo: v?.serverInfo ? parseXtreamServerInfo(v.serverInfo) : null,
    capabilities: v?.capabilities ? parseXtreamCapabilities(v.capabilities) : null,
  }
}

const parseXtreamCatalogue = (raw: unknown): XtreamCatalogue => {
  const v = raw as Record<string, unknown> | null
  if (typeof v !== 'object' || v === null || !Array.isArray(v.movies) || !Array.isArray(v.series) || v.movies.length > 25_000 || v.series.length > 25_000) {
    throw new Error('The native shell returned provider catalogue data in an unexpected shape.')
  }
  return {
    movies: v.movies.map(parseXtreamEntry),
    series: v.series.map(parseXtreamEntry),
    liveStreams: Array.isArray(v.liveStreams) ? v.liveStreams.map(parseXtreamLiveStream) : [],
    liveCategories: Array.isArray(v.liveCategories) ? v.liveCategories.map(parseXtreamCategory) : [],
    vodCategories: Array.isArray(v.vodCategories) ? v.vodCategories.map(parseXtreamCategory) : [],
    seriesCategories: Array.isArray(v.seriesCategories) ? v.seriesCategories.map(parseXtreamCategory) : [],
    userInfo: v.userInfo ? parseXtreamUserInfo(v.userInfo) : null,
    serverInfo: v.serverInfo ? parseXtreamServerInfo(v.serverInfo) : null,
    capabilities: v.capabilities ? parseXtreamCapabilities(v.capabilities) : null,
  }
}

export async function connectXtream(sourceId: string, server: string, username: string, password: string): Promise<XtreamCatalogue | null> {
  if (!isTauri()) return null
  try { return parseXtreamCatalogue(await invoke('connect_xtream', { sourceId, server, username, password })) }
  catch (e) { throw toIngestError(e, 'Kinora could not read this provider catalogue.') }
}

export async function refreshXtream(sourceId: string): Promise<XtreamCatalogue | null> {
  if (!isTauri()) return null
  try { return parseXtreamCatalogue(await invoke('refresh_xtream', { sourceId })) }
  catch (e) { throw toIngestError(e, 'Kinora could not refresh this provider catalogue.') }
}

export async function loadXtreamCatalogue(sourceId: string): Promise<XtreamCatalogue | null> {
  if (!isTauri()) return null
  try {
    const raw = await invoke('load_xtream_catalogue', { sourceId })
    return raw ? parseXtreamCatalogue(raw) : null
  } catch {
    return null
  }
}

export async function loadXtreamSeries(sourceId: string, seriesId: string): Promise<XtreamSeriesDetails | null> {
  if (!isTauri()) return null
  try {
    const raw = await invoke('xtream_series_details', { sourceId, seriesId }) as Record<string, unknown>
    if (!isOptText(raw.plot, 8192) || !Array.isArray(raw.seasons) || raw.seasons.length > 200) throw new Error('The native shell returned series data in an unexpected shape.')
    const seasons = raw.seasons.map((s: unknown): XtreamSeason => {
      const v = s as Record<string, unknown>
      if (!isCount(v.number, 1000) || !Array.isArray(v.episodes) || v.episodes.length > 25_000) throw new Error('The native shell returned series data in an unexpected shape.')
      const episodes = v.episodes.map((e: unknown): XtreamEpisode => {
        const ep = e as Record<string, unknown>
        if (!isText(ep.id, 128) || !isCount(ep.number, 100_000) || !isText(ep.title, 2048) || !isOptText(ep.plot, 8192) ||
            !(ep.runtimeSeconds === null || isCount(ep.runtimeSeconds, 86_400)) || !isText(ep.extension, 12) || !isText(ep.artworkKey, 256)) {
          throw new Error('The native shell returned episode data in an unexpected shape.')
        }
        return { id: ep.id, number: ep.number, title: ep.title, plot: ep.plot, runtimeSeconds: ep.runtimeSeconds, extension: ep.extension, artworkKey: ep.artworkKey }
      })
      return { number: v.number, episodes }
    })
    return { plot: raw.plot, seasons }
  } catch (e) { throw toIngestError(e, 'Kinora could not read this provider series.') }
}

export async function loadXtreamArtwork(artworkKey: string): Promise<string | null> {
  if (!isTauri()) return null
  try {
    const raw = await invoke('xtream_artwork', { artworkKey }) as { mimeType?: unknown; bytes?: unknown } | null
    if (!raw) return null
    const parsed = parseArtwork(raw)
    if (!parsed) return null
    let binary = ''
    for (let i = 0; i < parsed.bytes.length; i += 0x8000) binary += String.fromCharCode(...parsed.bytes.subarray(i, i + 0x8000))
    return `data:${parsed.mimeType};base64,${btoa(binary)}`
  } catch { return null }
}

export async function disconnectXtream(sourceId: string): Promise<void> {
  if (!isTauri()) return
  await invoke('disconnect_xtream', { sourceId })
}

export async function isXtreamConnected(sourceId: string): Promise<boolean> {
  if (!isTauri()) return false
  try {
    return Boolean(await invoke('is_xtream_connected', { sourceId }))
  } catch {
    return false
  }
}

export async function testXtreamConnection(server: string, username: string, password: string): Promise<XtreamConnectionReport | null> {
  if (!isTauri()) return null
  try {
    const raw = await invoke('test_xtream_connection', { server, username, password })
    return parseXtreamConnectionReport(raw)
  } catch (e) {
    throw toIngestError(e, 'Kinora could not test this provider connection.')
  }
}

export async function loadXtreamVodDetails(sourceId: string, vodId: string): Promise<XtreamMovieDetails | null> {
  if (!isTauri()) return null
  try {
    const raw = await invoke('xtream_vod_details', { sourceId, vodId })
    return parseXtreamMovieDetails(raw)
  } catch (e) {
    throw toIngestError(e, 'Kinora could not read movie details from provider.')
  }
}

export async function loadXtreamEpg(sourceId: string, streamId: string): Promise<XtreamEpgListing[] | null> {
  if (!isTauri()) return null
  try {
    const raw = await invoke('xtream_epg', { sourceId, streamId })
    if (!Array.isArray(raw)) return []
    return raw.map(parseXtreamEpgListing)
  } catch (e) {
    throw toIngestError(e, 'Kinora could not read guide listings from provider.')
  }
}

export async function openXtreamStream(
  sourceId: string,
  streamType: string,
  itemId: string,
  extension?: string,
): Promise<OpenedStream | null> {
  if (!isTauri()) return null
  return queued(async () => {
    let raw: unknown
    try {
      raw = await invoke('open_xtream_stream', { sourceId, streamType, itemId, extension })
    } catch (e) {
      throw toIngestError(e)
    }
    return parseOpenedStream(raw)
  })
}

export async function openXtreamCatchup(
  sourceId: string,
  streamId: string,
  startTimestamp: number,
  durationMins: number,
): Promise<OpenedStream | null> {
  if (!isTauri()) {
    return {
      url: `kstream://localhost/mock-catchup-${streamId}`,
      session: 1,
    }
  }
  return queued(async () => {
    let raw: unknown
    try {
      raw = await invoke('open_xtream_catchup', { sourceId, streamId, startTimestamp, durationMins })
    } catch (e) {
      throw toIngestError(e)
    }
    return parseOpenedStream(raw)
  })
}

export type RecordingStatus = 'scheduled' | 'recording' | 'completed' | 'failed' | 'cancelled'

export interface Recording {
  id: string
  channelId: string
  channelName: string
  channelLogo: string | null
  programmeId: string | null
  title: string
  description: string | null
  startTime: number
  endTime: number
  durationSecs: number
  paddingStartMins: number
  paddingEndMins: number
  status: RecordingStatus
  errorMessage: string | null
  filePath: string | null
  fileSizeBytes: number
  isProtected: boolean
  seriesRuleId: string | null
  createdAt: number
}

export interface SeriesRule {
  id: string
  title: string
  channelId: string | null
  recordType: 'all_episodes' | 'new_only'
  paddingStartMins: number
  paddingEndMins: number
  retentionDays: number | null
  keepMaxEpisodes: number | null
  isActive: boolean
  createdAt: number
}

export interface DvrConfig {
  storagePath: string
  maxStorageBytes: number
  minFreeDiskSpaceBytes: number
  defaultPaddingStartMins: number
  defaultPaddingEndMins: number
  retentionDays: number
  autoDeleteUnprotected: boolean
  timeshiftBufferMins: number
}

export interface StorageInfo {
  storagePath: string
  totalDiskBytes: number
  availableDiskBytes: number
  usedByRecordingsBytes: number
  recordingCount: number
  isLowDisk: boolean
}

let mockRecordings: Recording[] = []
let mockRules: SeriesRule[] = []
let mockDvrConfig: DvrConfig = {
  storagePath: '/mock/kinora/recordings',
  maxStorageBytes: 100 * 1024 * 1024 * 1024,
  minFreeDiskSpaceBytes: 5 * 1024 * 1024 * 1024,
  defaultPaddingStartMins: 2,
  defaultPaddingEndMins: 5,
  retentionDays: 30,
  autoDeleteUnprotected: true,
  timeshiftBufferMins: 60,
}

export async function dvrGetRecordings(): Promise<Recording[]> {
  if (!isTauri()) return [...mockRecordings]
  try {
    const raw = await invoke('dvr_get_recordings')
    return Array.isArray(raw) ? (raw as Recording[]) : []
  } catch (e) {
    throw toIngestError(e, 'Kinora could not read recordings.')
  }
}

export async function dvrStartRecording(
  channelId: string,
  channelName: string,
  title: string,
  opts?: {
    channelLogo?: string | null
    programmeId?: string | null
    description?: string | null
    durationSecs?: number
  },
): Promise<Recording> {
  if (!isTauri()) {
    const now = Math.floor(Date.now() / 1000)
    const rec: Recording = {
      id: `rec_${now}_${Math.random().toString(16).slice(2, 8)}`,
      channelId,
      channelName,
      channelLogo: opts?.channelLogo ?? null,
      programmeId: opts?.programmeId ?? null,
      title,
      description: opts?.description ?? null,
      startTime: now,
      endTime: now + (opts?.durationSecs ?? 3600),
      durationSecs: opts?.durationSecs ?? 3600,
      paddingStartMins: 0,
      paddingEndMins: 0,
      status: 'recording',
      errorMessage: null,
      filePath: `/mock/recordings/${channelName}/${title}/playlist.m3u8`,
      fileSizeBytes: 1024 * 1024 * 25,
      isProtected: false,
      seriesRuleId: null,
      createdAt: now,
    }
    mockRecordings.unshift(rec)
    return rec
  }
  try {
    const raw = await invoke('dvr_start_recording', {
      channelId,
      channelName,
      channelLogo: opts?.channelLogo ?? null,
      programmeId: opts?.programmeId ?? null,
      title,
      description: opts?.description ?? null,
      durationSecs: opts?.durationSecs ?? null,
    })
    return raw as Recording
  } catch (e) {
    throw toIngestError(e, 'Kinora could not start recording.')
  }
}

export async function dvrStopRecording(recordingId: string): Promise<Recording> {
  if (!isTauri()) {
    const rec = mockRecordings.find((r) => r.id === recordingId)
    if (!rec) throw new IngestError('storage', 'Recording not found.')
    rec.status = 'completed'
    rec.endTime = Math.floor(Date.now() / 1000)
    rec.durationSecs = Math.max(1, rec.endTime - rec.startTime)
    return { ...rec }
  }
  try {
    const raw = await invoke('dvr_stop_recording', { recordingId })
    return raw as Recording
  } catch (e) {
    throw toIngestError(e, 'Kinora could not stop recording.')
  }
}

export async function dvrScheduleRecording(
  channelId: string,
  channelName: string,
  title: string,
  startTime: number,
  endTime: number,
  opts?: {
    channelLogo?: string | null
    programmeId?: string | null
    description?: string | null
    paddingStart?: number
    paddingEnd?: number
    seriesRuleId?: string | null
  },
): Promise<Recording> {
  if (!isTauri()) {
    const now = Math.floor(Date.now() / 1000)
    const rec: Recording = {
      id: `rec_${startTime}_${Math.random().toString(16).slice(2, 8)}`,
      channelId,
      channelName,
      channelLogo: opts?.channelLogo ?? null,
      programmeId: opts?.programmeId ?? null,
      title,
      description: opts?.description ?? null,
      startTime,
      endTime,
      durationSecs: Math.max(60, endTime - startTime),
      paddingStartMins: opts?.paddingStart ?? 2,
      paddingEndMins: opts?.paddingEnd ?? 5,
      status: 'scheduled',
      errorMessage: null,
      filePath: null,
      fileSizeBytes: 0,
      isProtected: false,
      seriesRuleId: opts?.seriesRuleId ?? null,
      createdAt: now,
    }
    mockRecordings.unshift(rec)
    return rec
  }
  try {
    const raw = await invoke('dvr_schedule_recording', {
      channelId,
      channelName,
      channelLogo: opts?.channelLogo ?? null,
      programmeId: opts?.programmeId ?? null,
      title,
      description: opts?.description ?? null,
      startTime,
      endTime,
      paddingStart: opts?.paddingStart ?? null,
      paddingEnd: opts?.paddingEnd ?? null,
      seriesRuleId: opts?.seriesRuleId ?? null,
    })
    return raw as Recording
  } catch (e) {
    throw toIngestError(e, 'Kinora could not schedule recording.')
  }
}

export async function dvrCancelRecording(recordingId: string): Promise<Recording> {
  if (!isTauri()) {
    const rec = mockRecordings.find((r) => r.id === recordingId)
    if (!rec) throw new IngestError('storage', 'Recording not found.')
    rec.status = 'cancelled'
    return { ...rec }
  }
  try {
    const raw = await invoke('dvr_cancel_recording', { recordingId })
    return raw as Recording
  } catch (e) {
    throw toIngestError(e, 'Kinora could not cancel recording.')
  }
}

export async function dvrDeleteRecording(recordingId: string, deleteFiles = true): Promise<void> {
  if (!isTauri()) {
    mockRecordings = mockRecordings.filter((r) => r.id !== recordingId)
    return
  }
  try {
    await invoke('dvr_delete_recording', { recordingId, deleteFiles })
  } catch (e) {
    throw toIngestError(e, 'Kinora could not delete recording.')
  }
}

export async function dvrProtectRecording(recordingId: string, isProtected: boolean): Promise<Recording> {
  if (!isTauri()) {
    const rec = mockRecordings.find((r) => r.id === recordingId)
    if (!rec) throw new IngestError('storage', 'Recording not found.')
    rec.isProtected = isProtected
    return { ...rec }
  }
  try {
    const raw = await invoke('dvr_protect_recording', { recordingId, isProtected })
    return raw as Recording
  } catch (e) {
    throw toIngestError(e, 'Kinora could not update recording protection.')
  }
}

export async function dvrOpenRecording(recordingId: string): Promise<OpenedStream> {
  if (!isTauri()) {
    return {
      url: `kstream://localhost/dvr/${recordingId}/playlist.m3u8`,
      session: 0,
    }
  }
  return queued(async () => {
    let raw: unknown
    try {
      raw = await invoke('dvr_open_recording', { recordingId })
    } catch (e) {
      throw toIngestError(e)
    }
    return parseOpenedStream(raw)
  })
}

export async function dvrGetRules(): Promise<SeriesRule[]> {
  if (!isTauri()) return [...mockRules]
  try {
    const raw = await invoke('dvr_get_rules')
    return Array.isArray(raw) ? (raw as SeriesRule[]) : []
  } catch (e) {
    throw toIngestError(e, 'Kinora could not read series recording rules.')
  }
}

export async function dvrSaveRule(rule: SeriesRule): Promise<SeriesRule> {
  if (!isTauri()) {
    const idx = mockRules.findIndex((r) => r.id === rule.id)
    if (idx >= 0) {
      mockRules[idx] = { ...rule }
    } else {
      mockRules.unshift({ ...rule })
    }
    return { ...rule }
  }
  try {
    const raw = await invoke('dvr_save_rule', { rule })
    return raw as SeriesRule
  } catch (e) {
    throw toIngestError(e, 'Kinora could not save series rule.')
  }
}

export async function dvrDeleteRule(ruleId: string): Promise<void> {
  if (!isTauri()) {
    mockRules = mockRules.filter((r) => r.id !== ruleId)
    return
  }
  try {
    await invoke('dvr_delete_rule', { ruleId })
  } catch (e) {
    throw toIngestError(e, 'Kinora could not delete series rule.')
  }
}

export async function dvrGetConfig(): Promise<DvrConfig> {
  if (!isTauri()) return { ...mockDvrConfig }
  try {
    const raw = await invoke('dvr_get_config')
    return raw as DvrConfig
  } catch (e) {
    throw toIngestError(e, 'Kinora could not read DVR settings.')
  }
}

export async function dvrSaveConfig(config: DvrConfig): Promise<DvrConfig> {
  if (!isTauri()) {
    mockDvrConfig = { ...config }
    return { ...mockDvrConfig }
  }
  try {
    const raw = await invoke('dvr_save_config', { config })
    return raw as DvrConfig
  } catch (e) {
    throw toIngestError(e, 'Kinora could not save DVR settings.')
  }
}

export async function dvrGetStorageInfo(): Promise<StorageInfo> {
  if (!isTauri()) {
    const usedBytes = mockRecordings.reduce((acc, r) => acc + r.fileSizeBytes, 0)
    return {
      storagePath: mockDvrConfig.storagePath,
      totalDiskBytes: 500 * 1024 * 1024 * 1024,
      availableDiskBytes: 250 * 1024 * 1024 * 1024,
      usedByRecordingsBytes: usedBytes,
      recordingCount: mockRecordings.length,
      isLowDisk: false,
    }
  }
  try {
    const raw = await invoke('dvr_get_storage_info')
    return raw as StorageInfo
  } catch (e) {
    throw toIngestError(e, 'Kinora could not check storage space.')
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
export function toIngestError(raw: unknown, fallback = 'Kinora could not read that playlist.'): IngestError {
  const v = raw as Record<string, unknown> | null
  if (typeof v === 'object' && v !== null && isIngestCode(v.code) && isText(v.message, 500)) {
    return new IngestError(v.code, v.message)
  }
  return new IngestError('internal', fallback)
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

const LOGO_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const
const MAX_LOGO_BYTES = 256 * 1024
/** Mirrors Policy::artwork().max_bytes (4 MB) in src-tauri/src/fetch.rs */
export const MAX_ARTWORK_BYTES = 4 * 1024 * 1024
type ChannelLogo = { mimeType: (typeof LOGO_MIMES)[number]; bytes: Uint8Array }

export function parseChannelLogo(raw: unknown): ChannelLogo | null {
  if (raw === null) return null
  const value = raw as Record<string, unknown> | null
  if (typeof value !== 'object' || value === null || !LOGO_MIMES.includes(value.mimeType as ChannelLogo['mimeType']) ||
    !Array.isArray(value.bytes) || value.bytes.length === 0 || value.bytes.length > MAX_LOGO_BYTES ||
    !value.bytes.every((byte) => isCount(byte, 255))) {
    throw new Error('The native shell returned an image in an unexpected shape.')
  }
  return { mimeType: value.mimeType as ChannelLogo['mimeType'], bytes: Uint8Array.from(value.bytes as number[]) }
}

export function parseArtwork(raw: unknown): ChannelLogo | null {
  if (raw === null) return null
  const value = raw as Record<string, unknown> | null
  if (typeof value !== 'object' || value === null || !LOGO_MIMES.includes(value.mimeType as ChannelLogo['mimeType']) ||
    !Array.isArray(value.bytes) || value.bytes.length === 0 || value.bytes.length > MAX_ARTWORK_BYTES ||
    !value.bytes.every((byte) => isCount(byte, 255))) {
    throw new Error('The native shell returned an image in an unexpected shape.')
  }
  return { mimeType: value.mimeType as ChannelLogo['mimeType'], bytes: Uint8Array.from(value.bytes as number[]) }
}

const logoCache = new Map<string, Promise<string | null>>()

/** Fetches, caches and validates one small playlist logo in Rust; addresses stay out of the DOM. */
export async function loadChannelLogo(
  url: string | null,
  channelKey?: string | null,
  tvgId?: string | null,
): Promise<string | null> {
  if (!isTauri()) return null
  const cacheKey = channelKey ?? url ?? tvgId
  if (!cacheKey) return null
  let pending = logoCache.get(cacheKey)
  if (!pending) {
    pending = invoke('fetch_channel_logo', {
      url: url || null,
      channelKey: channelKey || null,
      tvgId: tvgId || null,
    }).then((raw) => {
      const logo = parseChannelLogo(raw)
      if (!logo) return null
      let binary = ''
      for (let i = 0; i < logo.bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...logo.bytes.subarray(i, i + 0x8000))
      }
      return `data:${logo.mimeType};base64,${btoa(binary)}`
    })
    logoCache.set(cacheKey, pending)
    if (logoCache.size > 4096) {
      const oldest = logoCache.keys().next().value
      if (oldest) logoCache.delete(oldest)
    }
  }
  try {
    return await pending
  } catch {
    logoCache.delete(cacheKey)
    return null
  }
}

const programmeArtCache = new Map<string, Promise<string | null>>()

/** Fetches, caches and validates programme artwork in Rust; returns base64 data URI or null. */
export async function loadProgrammeArtwork(url: string | null): Promise<string | null> {
  if (!isTauri() || !url) return null
  let pending = programmeArtCache.get(url)
  if (!pending) {
    pending = invoke('fetch_programme_artwork', { url }).then((raw) => {
      const art = parseArtwork(raw)
      if (!art) return null
      let binary = ''
      for (let i = 0; i < art.bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...art.bytes.subarray(i, i + 0x8000))
      }
      return `data:${art.mimeType};base64,${btoa(binary)}`
    })
    programmeArtCache.set(url, pending)
    if (programmeArtCache.size > 4096) {
      const oldest = programmeArtCache.keys().next().value
      if (oldest) programmeArtCache.delete(oldest)
    }
  }
  try {
    return await pending
  } catch {
    programmeArtCache.delete(url)
    return null
  }
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
  format?: 'hls' | 'dash'
}

const STREAM_ADDRESS = /^kstream:\/\/localhost\/[0-9a-f]{32}$/

export function parseOpenedStream(raw: unknown): OpenedStream {
  const v = raw as Record<string, unknown> | null
  if (typeof v !== 'object' || v === null || typeof v.url !== 'string' || !STREAM_ADDRESS.test(v.url) || !isCount(v.session, Number.MAX_SAFE_INTEGER) || v.session < 1) {
    throw new Error('The native shell returned a stream session in an unexpected shape.')
  }
  const format = v.format === 'dash' ? 'dash' as const : v.format === 'hls' ? 'hls' as const : undefined
  return format ? { url: v.url, session: v.session, format } : { url: v.url, session: v.session }
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
      if (streamUrl.startsWith('xtream://')) {
        const withoutPrefix = streamUrl.slice('xtream://'.length)
        const [hostAndPath, search] = withoutPrefix.split('?')
        const [sourceId = '', streamType = 'live', itemId = ''] = (hostAndPath ?? '').split('/')
        const params = new URLSearchParams(search ?? '')
        const extension = params.get('ext') ?? undefined
        raw = await invoke('open_xtream_stream', { sourceId, streamType, itemId, extension })
      } else {
        raw = await invoke('open_stream', { url: streamUrl })
      }
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
  logo?: string | null
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
      !(v.group === null || (typeof v.group === 'string' && v.group.length <= 1024)) || !(v.chno === null || (isCount(v.chno, 99_999) && v.chno > 0)) ||
      !(v.logo === undefined || v.logo === null || isText(v.logo, 2048))) {
    throw new Error('Saved channel data is in an unexpected shape.')
  }
  return { key: v.key, tvgId: v.tvgId, name: v.name, group: v.group, chno: v.chno, ...(v.logo ? { logo: v.logo as string } : {}) }
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

export interface SavedXtreamSource {
  id: string
  name: string
  addedAt: number
  lastSuccess: number | null
  movies: number
  series: number
  liveChannels?: number
  hasLive?: boolean
  hasVod?: boolean
  hasSeries?: boolean
  hasEpg?: boolean
  hasCatchup?: boolean
  status?: string | null
  expDate?: string | null
  enabled?: boolean
}

function parseSavedXtreamSource(raw: unknown): SavedXtreamSource {
  const v = raw as Record<string, unknown> | null
  if (typeof v !== 'object' || v === null || !isText(v.id, 48) || !/^xt-[a-z0-9-]+$/.test(v.id) || !isText(v.name, 48) ||
      !isTime(v.addedAt) || !(v.lastSuccess === null || isTime(v.lastSuccess)) ||
      !isCount(v.movies, 25_000) || !isCount(v.series, 25_000)) {
    throw new Error('Saved provider data is in an unexpected shape.')
  }
  return {
    id: v.id,
    name: v.name,
    addedAt: v.addedAt,
    lastSuccess: v.lastSuccess,
    movies: v.movies,
    series: v.series,
    liveChannels: typeof v.liveChannels === 'number' && isCount(v.liveChannels, 25_000) ? v.liveChannels : 0,
    hasLive: Boolean(v.hasLive),
    hasVod: typeof v.hasVod === 'boolean' ? v.hasVod : v.movies > 0,
    hasSeries: typeof v.hasSeries === 'boolean' ? v.hasSeries : v.series > 0,
    hasEpg: Boolean(v.hasEpg),
    hasCatchup: Boolean(v.hasCatchup),
    status: typeof v.status === 'string' ? v.status : null,
    expDate: typeof v.expDate === 'string' ? v.expDate : null,
    enabled: typeof v.enabled === 'boolean' ? v.enabled : true,
  }
}

/** Everything Rust saves (sources.rs `Saved`). */
export interface SavedState {
  sources: SavedSource[]
  guides: SavedGuide[]
  mappings: SavedMapping[]
  xtreamSources?: SavedXtreamSource[]
}

const MAX_GUIDES = 32
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
      !Array.isArray(raw.mappings) || raw.mappings.length > 50_000 || !(raw.xtreamSources === undefined || (Array.isArray(raw.xtreamSources) && raw.xtreamSources.length <= 100)) || !(notice === null || isNotice(notice))) {
    throw new Error('Saved sources arrived in an unexpected shape.')
  }
  return {
    sources: raw.sources.map(parseSavedSource), guides: raw.guides.map(parseSavedGuide), mappings: raw.mappings.map(parseSavedMapping), notice,
    ...(Array.isArray(raw.xtreamSources) ? { xtreamSources: raw.xtreamSources.map(parseSavedXtreamSource) } : {}),
  }
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
  icon?: string | null
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
      !isOptText(v.category, 300) || !isOptText(v.episode, 200) || (v.icon !== undefined && !isOptText(v.icon, 2048))) {
    throw new Error('The native shell returned a programme in an unexpected shape.')
  }
  return { channel: v.channel, start: v.start, stop: v.stop, stopEstimated: v.stopEstimated, title: v.title, subtitle: v.subtitle, desc: v.desc, category: v.category, episode: v.episode, icon: (v.icon as string | undefined) ?? null }
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

/** Mirrors `Kind` in src-tauri/src/catalogue.rs: how a catalogue playlist groups its channels. */
export type CatalogueKind = 'category' | 'language' | 'country' | 'region' | 'subdivision' | 'city'
const CATALOGUE_FOLDERS: Record<string, CatalogueKind> = {
  categories: 'category', languages: 'language', countries: 'country', regions: 'region', subdivisions: 'subdivision', cities: 'city',
}

/** Mirrors `Entry` in catalogue.rs. Provider-supplied facts only: nothing here has been checked by Kinora. */
export interface CatalogueEntry {
  /** `<folder>/<code>`: the entry's stable identity. */
  id: string
  kind: CatalogueKind
  code: string
  name: string
  flag: string | null
  /** The entry this one is listed under, by id. */
  parent: string | null
  /** The channel count the provider prints; null where it gives none. */
  channels: number | null
  url: string
}

/** Mirrors `Catalogue` in catalogue.rs. */
export interface Catalogue {
  /** When Kinora fetched it (UTC ms). */
  fetchedAt: number
  entries: CatalogueEntry[]
  skipped: number
}

/** The only playlist addresses a catalogue entry may have; Rust applies the same rule. */
const CATALOGUE_ADDRESS = /^https:\/\/iptv-org\.github\.io\/iptv\/([a-z]+)\/([a-z0-9-]{1,32})\.m3u$/

function parseCatalogueEntry(raw: unknown): CatalogueEntry {
  const v = raw as Record<string, unknown> | null
  const m = typeof v?.url === 'string' ? CATALOGUE_ADDRESS.exec(v.url) : null
  const kind = m ? CATALOGUE_FOLDERS[m[1] ?? ''] : undefined
  if (typeof v !== 'object' || v === null || !m || !kind || v.kind !== kind || v.code !== m[2] || v.id !== `${m[1]}/${m[2]}` ||
      typeof v.url !== 'string' || !isText(v.name, 200) || !isOptText(v.flag, 16) || !isOptText(v.parent, 64) ||
      !(v.channels === null || isCount(v.channels, 10_000_000))) {
    throw new Error('The native shell returned a catalogue entry in an unexpected shape.')
  }
  return { id: v.id, kind, code: m[2] ?? '', name: v.name, flag: v.flag, parent: v.parent, channels: v.channels, url: v.url }
}

export function parseCatalogue(raw: unknown): Catalogue {
  const v = raw as Record<string, unknown> | null
  if (typeof v !== 'object' || v === null || !isTime(v.fetchedAt) || !Array.isArray(v.entries) || v.entries.length > 5000 || !isCount(v.skipped, 2 ** 32)) {
    throw new Error('The native shell returned a catalogue in an unexpected shape.')
  }
  return { fetchedAt: v.fetchedAt, entries: v.entries.map(parseCatalogueEntry), skipped: v.skipped }
}

/** The cached catalogue; `null` when there is none, or outside the native shell. */
export async function loadCatalogue(): Promise<Catalogue | null> {
  if (!isTauri()) return null
  const raw: unknown = await invoke('load_catalogue')
  return raw === null ? null : parseCatalogue(raw)
}

/** Fetches the catalogue in Rust from its one fixed address. `null` outside the native shell. */
export async function refreshCatalogue(): Promise<Catalogue | null> {
  if (!isTauri()) return null
  let raw: unknown
  try {
    raw = await invoke('refresh_catalogue')
  } catch (e) {
    throw toIngestError(e)
  }
  return parseCatalogue(raw)
}

export type ConnectionResultCategory =
  | 'success'
  | 'auth-required'
  | 'http-error'
  | 'dns-failure'
  | 'connection-refused'
  | 'timeout'
  | 'invalid-url'
  | 'security-blocked'
  | 'network-unavailable'
  | 'unknown'

export interface ConnectionTestResult {
  ok: boolean
  status: number | null
  host: string
  roundTripMs: number
  message: string
  category: ConnectionResultCategory
}

export function parseConnectionTestResult(raw: unknown): ConnectionTestResult {
  const v = raw as Record<string, unknown> | null
  if (typeof v !== 'object' || v === null) {
    throw new Error('The native shell returned a connection test result in an unexpected shape.')
  }
  const ok = typeof v.ok === 'boolean' ? v.ok : false
  const status = typeof v.status === 'number' && Number.isInteger(v.status) ? v.status : null
  const host = typeof v.host === 'string' ? v.host : 'unknown'
  const roundTripMs = typeof v.roundTripMs === 'number' && v.roundTripMs >= 0 ? Math.round(v.roundTripMs) : 0
  const message = typeof v.message === 'string' ? v.message : ''
  const validCategories: ConnectionResultCategory[] = [
    'success',
    'auth-required',
    'http-error',
    'dns-failure',
    'connection-refused',
    'timeout',
    'invalid-url',
    'security-blocked',
    'network-unavailable',
    'unknown',
  ]
  const category: ConnectionResultCategory = typeof v.category === 'string' && validCategories.includes(v.category as ConnectionResultCategory)
    ? (v.category as ConnectionResultCategory)
    : 'unknown'

  return { ok, status, host, roundTripMs, message, category }
}

/**
 * Safely tests connectivity to a remote source address in Rust using guarded network checks.
 * Returns null outside the native shell (mocking browser dev).
 */
export async function testSourceConnection(url: string): Promise<ConnectionTestResult | null> {
  if (!isTauri()) return null
  try {
    const raw: unknown = await invoke('test_source_connection', { url })
    return parseConnectionTestResult(raw)
  } catch (e) {
    const err = toIngestError(e)
    return {
      ok: false,
      status: null,
      host: 'unknown',
      roundTripMs: 0,
      message: err.message,
      category: err.code === 'blocked' ? 'security-blocked' : 'invalid-url',
    }
  }
}

/** Mirrors `StoredPin` in src-tauri/src/pin.rs (serde camelCase). */
export interface StoredPinV2 {
  algorithm: string
  salt: string
  hash: string
  iterations: number
  version: 2
}

/** Mirrors `VerifyPinResponse` in src-tauri/src/pin.rs. */
export interface VerifyPinResult {
  valid: boolean
  upgradedPin: StoredPinV2 | null
}

export function parseStoredPin(raw: unknown): StoredPinV2 {
  const v = raw as Record<string, unknown> | null
  if (
    typeof v !== 'object' || v === null ||
    typeof v.algorithm !== 'string' ||
    typeof v.salt !== 'string' ||
    typeof v.hash !== 'string' ||
    typeof v.iterations !== 'number' ||
    v.version !== 2
  ) {
    throw new Error('The native shell returned a stored PIN in an unexpected shape.')
  }
  return {
    algorithm: v.algorithm,
    salt: v.salt,
    hash: v.hash,
    iterations: v.iterations,
    version: 2,
  }
}

export function parseVerifyPinResult(raw: unknown): VerifyPinResult {
  const v = raw as Record<string, unknown> | null
  if (typeof v !== 'object' || v === null || typeof v.valid !== 'boolean') {
    throw new Error('The native shell returned a PIN verification result in an unexpected shape.')
  }
  const upgradedPin = v.upgradedPin ? parseStoredPin(v.upgradedPin) : null
  return { valid: v.valid, upgradedPin }
}

/**
 * Hashes a 4-digit parental PIN using PBKDF2-HMAC-SHA256 (100,000 iterations) in Rust.
 * Returns null outside the native shell.
 */
export async function hashParentalPin(pin: string): Promise<StoredPinV2 | null> {
  if (!isTauri()) return null
  const raw = await invoke('hash_parental_pin', { pin })
  return parseStoredPin(raw)
}

/**
 * Verifies a 4-digit parental PIN in Rust with constant-time equality and automatic migration.
 * Returns null outside the native shell.
 */
export async function verifyParentalPin(pin: string, stored: unknown): Promise<VerifyPinResult | null> {
  if (!isTauri()) return null
  const raw = await invoke('verify_parental_pin', { pin, stored })
  return parseVerifyPinResult(raw)
}

/**
 * Queries an approved metadata provider (The Movie Database or TVmaze) via Rust IPC.
 * Strictly bounded by Policy::metadata(), with no URL leaking and direct connections only.
 * Returns null outside the native shell or when request fails.
 */
export async function fetchMetadata(url: string, authHeader?: string | null): Promise<string | null> {
  if (!isTauri()) {
    try {
      const headers: Record<string, string> = { Accept: 'application/json' }
      if (authHeader) headers['Authorization'] = authHeader
      const res = await fetch(url, { headers })
      if (!res.ok) return null
      return await res.text()
    } catch {
      return null
    }
  }
  try {
    return await invoke('fetch_metadata', { url, authHeader: authHeader ?? null })
  } catch {
    return null
  }
}

export interface UpdateCheckResult {
  status: 'upToDate' | 'available' | 'unsupportedPlatform' | 'error'
  currentVersion: string
  latestVersion: string | null
  releaseDate: string | null
  releaseNotes: string | null
  downloadUrl: string | null
  hasSignature: boolean
  platformKey: string
  platformSupported: boolean
  error: string | null
}

/**
 * Checks for application updates from the official release manifest via Rust IPC.
 * Evaluates current platform, architecture and semver numbers.
 */
export async function checkForUpdates(endpoint?: string | null): Promise<UpdateCheckResult | null> {
  if (!inNativeShell()) {
    return {
      status: 'upToDate',
      currentVersion: '0.1.0',
      latestVersion: '0.1.0',
      releaseDate: null,
      releaseNotes: 'Web interface preview mode: native updater unavailable.',
      downloadUrl: null,
      hasSignature: false,
      platformKey: 'web',
      platformSupported: true,
      error: null,
    }
  }
  try {
    const payload: { endpoint?: string } = {}
    if (endpoint) payload.endpoint = endpoint
    const raw = await invoke('check_for_updates', payload)
    if (!raw || typeof raw !== 'object') return null
    const r = raw as Record<string, unknown>
    return {
      status: (r.status as UpdateCheckResult['status']) ?? 'error',
      currentVersion: typeof r.currentVersion === 'string' ? r.currentVersion : '0.1.0',
      latestVersion: typeof r.latestVersion === 'string' ? r.latestVersion : null,
      releaseDate: typeof r.releaseDate === 'string' ? r.releaseDate : null,
      releaseNotes: typeof r.releaseNotes === 'string' ? r.releaseNotes : null,
      downloadUrl: typeof r.downloadUrl === 'string' ? r.downloadUrl : null,
      hasSignature: Boolean(r.hasSignature),
      platformKey: typeof r.platformKey === 'string' ? r.platformKey : 'unknown',
      platformSupported: Boolean(r.platformSupported),
      error: typeof r.error === 'string' ? r.error : null,
    }
  } catch (e) {
    return {
      status: 'error',
      currentVersion: '0.1.0',
      latestVersion: null,
      releaseDate: null,
      releaseNotes: null,
      downloadUrl: null,
      hasSignature: false,
      platformKey: 'unknown',
      platformSupported: false,
      error: e instanceof Error ? e.message : 'Could not reach update service',
    }
  }
}

if (typeof window !== 'undefined') {
  ;(window as unknown as { __kinora_native?: Record<string, unknown> }).__kinora_native = {
    fetchPlaylist,
    fetchGuide,
    saveSources,
  }
}



