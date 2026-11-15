// XMLTV guide sources (Gate D6). Rust parses and holds each guide (src-tauri/src/guides.rs) and keeps
// a cached copy; the page keeps only definitions, matches and the programmes of the days it shows.
// Matching is by `tvg-id` (Rust compares ids after trimming and ASCII case-folding; an iptv-org
// `channel@feed` id that matches nothing exactly is tried by its channel part) or
// by a match the user picked by hand. Display names are never used to match.
import type { Channel, Programme } from '../data/types'
import { IngestError, type GuideAnswer, type GuideQuery, type GuideSummary, type SavedGuide, type SavedMapping } from '../lib/native'
import { DESKTOP_ONLY } from './playlists'

/** Only messages Rust wrote for the user (host at most) are shown; anything else is replaced. */
const guideMessage = (e: unknown) => (e instanceof IngestError && e.code !== 'internal' ? e.message : 'Kinora could not read that guide.')

export interface GuideSource {
  id: string
  name: string
  origin: 'url' | 'file'
  /** URL guides only, so Refresh can fetch it again. Saved by Rust; never shown or logged. */
  url: string | null
  /** Safe to show: `https://host/…` or the file name. */
  label: string
  addedAt: number
  lastSuccess: number | null
  /** Playlist sources whose channels are matched against this guide. */
  playlists: string[]
  /** `saved`: restored from disk, not refreshed this session (its cached programmes may be shown). */
  status: 'saved' | 'importing' | 'ready' | 'failed'
  /** Latest operation started for this guide; results of older operations are dropped. */
  op: number
  /** What Rust holds: this session's import or the cached copy. A failed refresh keeps it. */
  summary: GuideSummary | null
  error: string | null
}

export type Mapping = SavedMapping

/** Why a playlist channel has guide data, or why it does not. */
export type GuideMatch =
  | { state: 'matched'; guide: string; channel: string; manual: boolean }
  /** None of the channel's guides has programme data loaded (yet). */
  | { state: 'no-data' }
  /** No guide is used for the channel's playlist. */
  | { state: 'no-guide' }
  /** The channel has no `tvg-id` and has not been matched by hand. */
  | { state: 'no-id' }
  /** Its `tvg-id` is not a channel of any of its guides. */
  | { state: 'unmatched' }
  /** Matched by hand to a guide channel that the guide no longer lists. */
  | { state: 'match-lost' }

export const GUIDE_ACCEPT = '.xml,.xmltv,.gz,application/xml,text/xml,application/gzip'

/** Validates a guide address the same way playlist addresses are (Rust checks it again). */
export function checkGuideUrl(raw: string, existing: (string | null)[]): { url: string } | { error: string } {
  if (!raw.trim()) return { error: 'Paste the guide address.' }
  let parsed: URL
  try {
    parsed = new URL(raw.trim())
  } catch {
    return { error: 'Use a full address starting with http:// or https://' }
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return { error: 'Use a full address starting with http:// or https://' }
  if (parsed.username || parsed.password) return { error: 'Remove the username and password from the address. Sign-in details are not stored in URLs.' }
  if (existing.includes(parsed.href)) return { error: 'This guide address is already one of your sources.' }
  return { url: parsed.href }
}

export const guideFileName = (name: string) => name.replace(/\.(xml|xmltv)(\.gz)?$/i, '').replace(/\.gz$/i, '') || 'Guide file'

export function createGuide(
  id: string,
  input: { name: string; origin: GuideSource['origin']; url: string | null; label: string; playlists: string[] },
  summary: GuideSummary,
  now: number,
): GuideSource {
  return { id, ...input, addedAt: now, lastSuccess: now, status: 'ready', op: 0, summary, error: null }
}

export function restoreGuide(saved: SavedGuide): GuideSource {
  return { ...saved, playlists: [...saved.playlists], status: 'saved', op: 0, summary: null, error: null }
}

/** Keep every saved guide available to every imported playlist; id matching determines actual coverage. */
export function includePlaylistsInGuides(guides: GuideSource[], playlistIds: string[]): GuideSource[] {
  if (playlistIds.length === 0) return guides
  return guides.map((guide) => {
    const playlists = [...new Set([...guide.playlists, ...playlistIds])]
    return playlists.length === guide.playlists.length ? guide : { ...guide, playlists }
  })
}

/** What is written to disk: no programmes (Rust caches those), an address only for URL guides. */
export function toSavedGuide(g: GuideSource): SavedGuide {
  return {
    id: g.id, name: g.name, origin: g.origin, url: g.origin === 'url' ? g.url : null, label: g.label, addedAt: g.addedAt,
    lastSuccess: g.lastSuccess, playlists: [...g.playlists],
  }
}

type Update = (fn: (list: GuideSource[]) => GuideSource[]) => void

/**
 * Fetches or reads a guide and applies the result, unless a newer operation on the same guide started
 * meanwhile or it was removed. A failure keeps the programmes Rust already holds.
 */
export async function runGuideImport(update: Update, id: string, op: number, load: () => Promise<GuideSummary | null>, now: () => number = Date.now): Promise<void> {
  update((l) => l.map((g) => (g.id === id ? { ...g, status: 'importing', op } : g)))
  let summary: GuideSummary | null
  try {
    summary = await load()
  } catch (e) {
    const error = guideMessage(e)
    update((l) => l.map((g) => (g.id === id && g.op === op ? { ...g, status: 'failed', error } : g)))
    return
  }
  const t = now()
  update((l) => l.map((g) => (g.id !== id || g.op !== op ? g : summary
    ? { ...g, status: 'ready', summary, error: null, lastSuccess: t }
    : { ...g, status: 'failed', error: DESKTOP_ONLY })))
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function guideStatusText(g: GuideSource, now: number): string {
  const s = g.summary
  if (g.status === 'importing') return 'Updating guide…'
  if (g.status === 'failed') return s ? `Refresh failed · ${plural(s.programmes, 'programme')} kept` : 'Import failed'
  if (!s) return g.origin === 'file' ? 'No programmes · choose the file again' : 'No programmes yet'
  if (s.programmes === 0) return 'No programmes listed'
  if (s.last !== null && s.last <= now) return 'Listings have ended'
  return `${g.status === 'ready' ? 'Guide' : 'Saved'} · ${plural(s.programmes, 'programme')}`
}

export function guideStatusTone(g: GuideSource, now: number) {
  const s = g.summary
  if (g.status === 'importing') return 'scanning'
  if (g.status === 'failed') return 'failing'
  if (!s || s.programmes === 0 || (s.last !== null && s.last <= now)) return 'degraded'
  return g.status === 'ready' ? 'healthy' : 'pending'
}

/** The ids each loaded guide is asked about: `tvg-id`s of its playlists' channels, and hand-picked ids. */
export function guideQueries(channels: Channel[], guides: GuideSource[], mappings: Mapping[]): GuideQuery[] {
  const mapped = new Set(mappings.map((m) => m.channel))
  return guides.filter((g) => g.summary).map((g) => {
    const ids = new Set<string>()
    for (const c of channels) if (c.sourceId && g.playlists.includes(c.sourceId) && c.tvgId && !mapped.has(c.id)) ids.add(c.tvgId)
    for (const m of mappings) if (m.guide === g.id) ids.add(m.xmltvId)
    return { guide: g.id, ids: [...ids] }
  })
}

/**
 * Each playlist channel's guide match. A hand-picked match wins; otherwise the first of the channel's
 * guides (in the order they were added) that lists its `tvg-id`.
 */
export function resolveMatches(channels: Channel[], guides: GuideSource[], mappings: Mapping[], answers: GuideAnswer[]): Map<string, GuideMatch> {
  const found = new Map<string, Map<string, string | null>>()
  for (const a of answers) if (a.loaded) found.set(a.guide, new Map(a.matches.map((m) => [m.id, m.channel])))
  const manual = new Map(mappings.map((m) => [m.channel, m]))
  const out = new Map<string, GuideMatch>()
  for (const c of channels) {
    if (!c.sourceId) continue
    const m = manual.get(c.id)
    if (m) {
      const answer = found.get(m.guide)
      const channel = answer?.get(m.xmltvId)
      out.set(c.id, !answer ? { state: 'no-data' } : channel ? { state: 'matched', guide: m.guide, channel, manual: true } : { state: 'match-lost' })
      continue
    }
    const mine = guides.filter((g) => c.sourceId && g.playlists.includes(c.sourceId))
    if (mine.length === 0) { out.set(c.id, { state: 'no-guide' }); continue }
    if (!c.tvgId) { out.set(c.id, { state: 'no-id' }); continue }
    const loaded = mine.filter((g) => found.has(g.id))
    const hit = loaded.map((g) => ({ guide: g.id, channel: found.get(g.id)?.get(c.tvgId ?? '') })).find((x) => x.channel)
    out.set(c.id, hit?.channel ? { state: 'matched', guide: hit.guide, channel: hit.channel, manual: false } : loaded.length === 0 ? { state: 'no-data' } : { state: 'unmatched' })
  }
  return out
}

/** Programmes per playlist channel, from the answers for one window. Ids are `<channel id>@<start>`. */
export function programmesFor(matches: Map<string, GuideMatch>, answers: GuideAnswer[]): Map<string, Programme[]> {
  const byGuideChannel = new Map<string, GuideAnswer['programmes']>()
  for (const a of answers) {
    for (const p of a.programmes) {
      const key = `${a.guide}\n${p.channel}`
      const list = byGuideChannel.get(key)
      if (list) list.push(p)
      else byGuideChannel.set(key, [p])
    }
  }
  const out = new Map<string, Programme[]>()
  for (const [channelId, m] of matches) {
    if (m.state !== 'matched') continue
    const list = byGuideChannel.get(`${m.guide}\n${m.channel}`) ?? []
    out.set(channelId, list.map((p) => ({
      id: `${channelId}@${p.start}`, channelId, start: p.start, stop: p.stop, title: p.title, desc: p.desc ?? '', category: p.category ?? '',
      episode: p.episode, art: undefined, subtitle: p.subtitle, stopEstimated: p.stopEstimated,
      icon: p.icon ?? null,
    })))
  }
  return out
}

/**
 * One Add Source read of a guide, turned into what the Validate step shows: the summary and how many
 * of the playlists' guide ids it lists, or a safe message.
 */
export async function readGuideForPreview(
  read: () => Promise<GuideSummary | null>,
  countMatches: () => Promise<{ matched: number; wanted: number } | null>,
): Promise<{ summary: GuideSummary; matches: { matched: number; wanted: number } | null } | { error: string }> {
  try {
    const summary = await read()
    if (!summary) return { error: DESKTOP_ONLY }
    if (summary.channels === 0) return { error: 'The guide was read, but it lists no channels.' }
    return { summary, matches: await countMatches().catch(() => null) }
  } catch (e) {
    return { error: guideMessage(e) }
  }
}

/** Short, honest label for a channel row with no programmes in view. */
export function noListingsText(m: GuideMatch | undefined, loading: boolean): string {
  if (loading) return 'Loading guide…'
  switch (m?.state) {
    case 'matched': return 'No listings in this period'
    case 'no-guide': return 'No guide for this playlist'
    case 'no-id': return 'No guide id; match it in Sources'
    case 'unmatched': return 'Not found in its guide; match it in Sources'
    case 'match-lost': return 'Its guide match is no longer listed'
    case 'no-data': return 'Guide not loaded'
    default: return 'No guide information'
  }
}
