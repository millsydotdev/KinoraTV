import type { Channel, StreamVariant } from '../data/types'
import { extractChannelLocation, formatServerLabel } from '../data/channelCategories'
import type { PlaylistSource } from './playlists'
import { cleanChannelTitle } from './playlists'
import type { GuideMatch } from './guides'

export interface ChannelSourceLike {
  id: string
  name: string
  origin?: string
}

type MatchMap = ReadonlyMap<string, GuideMatch>

const GENERIC_NAMES = new Set(['same', 'test', 'channel', 'tv', 'hd', 'live', 'stream', 'backup', 'null', 'undefined'])

export function regionalFeed(id: string | null | undefined): string {
  const raw = id?.trim() ?? ''
  if (!raw) return ''
  const [, feed = ''] = raw.split('@')
  const feedClean = feed.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  if (!feedClean || /^(sd|hd|fhd|uhd|4k|ukhd|uksd|ushd|ussd)$/.test(feedClean)) return ''
  return feedClean
}

/**
 * Canonicalises a `tvg-id` so equivalent channel identifiers across playlists
 * (such as `BBCOne.uk@HD`, `bbc.one.uk`, `BBCOne.uk`, or `QVCUK.uk` and `QVC.uk@SD`)
 * resolve to the same deterministic key immediately, without depending on whether
 * background XMLTV guides have finished loading. Regional feeds (`@Scotland`, `@Wales`,
 * `@London`) remain distinct so regional channels are never collapsed together.
 */
export function canonicalTvgId(id: string | null | undefined): string {
  const raw = id?.trim() ?? ''
  if (!raw) return ''
  const [channel = ''] = raw.split('@')
  const effectiveFeed = regionalFeed(raw)
  const dot = channel.lastIndexOf('.')
  if (dot > 0) {
    const stem = channel.slice(0, dot)
    const country = channel.slice(dot + 1).replace(/[0-9]+$/, '')
    if (country.length === 2 && /^[a-zA-Z]{2}$/.test(country)) {
      let plain = stem.replace(/\[[^\]]*\]/g, '').replace(/[^a-zA-Z0-9]/g, '')
      for (const q of ['FHD', 'UHD', 'HD', 'SD', '4K']) {
        if (plain.endsWith(q) && plain.length > q.length) {
          plain = plain.slice(0, -q.length)
          break
        }
      }
      const cc = country.toLowerCase()
      let low = plain.toLowerCase()
      if (low.endsWith(cc) && low.length > cc.length + 2) {
        low = low.slice(0, -cc.length)
      }
      if (low) {
        return `${low}.${cc}${effectiveFeed ? `@${effectiveFeed}` : ''}`
      }
    }
  }
  return `${channel.toLowerCase()}${effectiveFeed ? `@${effectiveFeed}` : ''}`
}

/** Collapse channels with a shared canonical tvg-id, unambiguous XMLTV identity, or strong multi-evidence metadata. */
export function combineChannels(channels: Channel[], sources: (PlaylistSource | ChannelSourceLike)[], matches: MatchMap): Channel[] {
  // Union-find over identity keys. A channel's canonical tvg-id is its base identity and does
  // not depend on guides. A resolved guide channel joins identities together, keyed by the
  // canonical guide channel id (not the guide that supplied it, so the same channel resolved
  // through two guides stays one channel). The only split is a genuine conflict: a channel
  // whose tvg-id group already resolved to a different guide channel is kept apart.
  const parent = new Map<string, string>()
  const identities = new Map<string, Set<string>>()
  const find = (key: string): string => {
    let root = key
    while (parent.get(root) !== root) root = parent.get(root)!
    let node = key
    while (node !== root) {
      const next = parent.get(node)!
      parent.set(node, root)
      node = next
    }
    return root
  }
  const add = (key: string, identity?: string) => {
    if (parent.has(key)) return
    parent.set(key, key)
    identities.set(key, new Set(identity ? [identity] : []))
  }
  const compatible = (a: Set<string>, b: Set<string>) => a.size === 0 || b.size === 0 || [...a].some((id) => b.has(id))
  const union = (a: string, b: string): boolean => {
    const ra = find(a)
    const rb = find(b)
    if (ra === rb) return true
    const ia = identities.get(ra)!
    const ib = identities.get(rb)!
    if (!compatible(ia, ib)) return false
    parent.set(rb, ra)
    for (const id of ib) ia.add(id)
    identities.delete(rb)
    return true
  }

  const keys: string[] = []
  channels.forEach((channel, index) => {
    const tvg = canonicalTvgId(channel.tvgId)
    const loc = extractChannelLocation(channel)
    const cleanName = cleanChannelTitle(channel.name).toLowerCase().replace(/[^a-z0-9]/g, '')
    const countryCode = loc.countryCode?.toLowerCase()
    const hasStrongEvidence = cleanName.length >= 3 && !GENERIC_NAMES.has(cleanName) && Boolean(countryCode)
    const nameKey = hasStrongEvidence && countryCode
      ? `name:${cleanName}.${countryCode}${loc.region ? `@${loc.region.toLowerCase().replace(/[^a-z0-9]/g, '')}` : ''}`
      : null

    const base = tvg ? `tvg:${tvg}` : (nameKey ?? `single:${index}`)
    add(base)
    keys.push(base)

    if (tvg && nameKey) {
      add(nameKey)
      union(base, nameKey)
    }

    const match = matches.get(channel.id)
    if (match?.state !== 'matched') return
    const rf = regionalFeed(channel.tvgId)
    const mc = canonicalTvgId(match.channel).split('@')[0] + (rf ? `@${rf}` : '')
    const guideKey = `guide:${mc}`
    add(guideKey, mc)
    if (!union(base, guideKey)) keys[index] = guideKey
  })

  const buckets = new Map<string, Channel[]>()
  channels.forEach((channel, index) => {
    const root = find(keys[index]!)
    const group = buckets.get(root)
    if (group) group.push(channel)
    else buckets.set(root, [channel])
  })

  const sourceOrder = new Map(sources.map((source, index) => [source.id, index]))
  const groups = [...buckets.values()]
  const combined = groups.map((group): Channel => {
    group.sort((a, b) => (sourceOrder.get(a.sourceId ?? '') ?? Number.MAX_SAFE_INTEGER) - (sourceOrder.get(b.sourceId ?? '') ?? Number.MAX_SAFE_INTEGER))
    const primary = group[0]!
    const matchedMember = group.find((channel) => matches.get(channel.id)?.state === 'matched') ?? primary
    const preferredLogo =
      group.find((channel) => channel.logoUrl && !channel.logoUrl.includes('imgur.com'))?.logoUrl ??
      group.find((channel) => channel.logoUrl)?.logoUrl ??
      null
    const streamOptions: StreamVariant[] = group.map((channel, vIdx) => {
      const loc = extractChannelLocation(channel)
      const is4k = /\b(uhd|4k|2160p)\b/i.test(channel.name)
      const isFhd = /\b(fhd|1080p)\b/i.test(channel.name)
      const is720p = /\b720p\b/i.test(channel.name)
      const isHd = channel.hd || is720p || /\b(hd|fhd|1080p|uhd|4k)\b/i.test(channel.name)
      const quality = is4k ? '4K' : isFhd ? 'FHD' : is720p ? '720p' : isHd ? 'HD' : 'SD'
      const resolution = is4k ? '3840 × 2160' : isFhd ? '1920 × 1080' : isHd ? '1280 × 720' : '720 × 576'
      const src = sources.find((source) => source.id === channel.sourceId)
      const sourceName = src?.name ?? 'Unknown source'
      const variant: StreamVariant = {
        id: `${channel.sourceId ?? 'src'}:${channel.id}`,
        channelId: channel.id,
        sourceId: channel.sourceId ?? '',
        sourceName,
        providerChannelId: channel.id.split('~')[1] ?? channel.id,
        groupName: channel.group,
        country: loc.country ?? null,
        region: loc.region ?? null,
        language: null,
        protocol: 'HLS',
        format: 'HLS Stream',
        resolution,
        quality,
        tvgId: channel.tvgId,
        logoUrl: channel.logoUrl,
        availability: channel.streamUrl ? 'untested' : 'unavailable',
        lastChecked: null,
        lastCheckMessage: channel.streamUrl ? null : 'No stream address available',
        lastError: null,
        streamUrl: channel.streamUrl,
      }
      variant.name = formatServerLabel(variant, vIdx + 1)
      return variant
    })

    const categories = [...new Map(group.flatMap((channel) => channel.categories).map((label) => [label.toLocaleLowerCase(), label])).values()]
    const sourceIds = [...new Set(group.flatMap((channel) => channel.sourceId ? [channel.sourceId] : []))]
    const displayName = group.length > 1 && primary.name.includes('[') ? cleanChannelTitle(primary.name) : primary.name
    const archiveMember = group.find((channel) => channel.tvArchive === 1) ?? primary

    return {
      ...primary,
      name: displayName,
      tvgId: matchedMember.tvgId ?? primary.tvgId,
      logoUrl: preferredLogo,
      categories,
      group: categories.join('; '),
      memberIds: group.map((channel) => channel.id),
      sourceIds,
      streamOptions,
      tvArchive: archiveMember.tvArchive,
      tvArchiveDuration: archiveMember.tvArchiveDuration,
      xtreamStreamId: archiveMember.xtreamStreamId,
    }
  })

  // In large multi-playlist catalogues (> 20 channels) when EPG matches exist, surface channels
  // with active EPG listings first so the default Live TV view leads with scheduled broadcasts.
  if (combined.length > 20 && matches.size > 0) {
    const isMatched = (c: Channel) => (c.memberIds ?? [c.id]).some((id) => matches.get(id)?.state === 'matched')
    if (combined.some(isMatched)) {
      const matched: Channel[] = []
      const unmatched: Channel[] = []
      for (const c of combined) {
        if (isMatched(c)) matched.push(c)
        else unmatched.push(c)
      }
      return [...matched, ...unmatched]
    }
  }

  return combined
}
