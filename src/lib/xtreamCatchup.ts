import { catchupRef, m3uCatchupRef } from '../data/refs'
import type { Channel, Programme } from '../data/types'

export interface CatchupProgrammeItem {
  ref: string
  channelId: string
  channelName: string
  channelLogo: string | null
  programmeId: string
  title: string
  description?: string
  category?: string
  start: number
  stop: number
  durationMins: number
  dayOffset: number // 0 for today, -1 for yesterday, -2 for 2 days ago, etc.
}

export interface CatchupDayBucket {
  dayOffset: number
  label: string
  dateString: string
  startOfDay: number
  endOfDay: number
}

/**
 * Checks whether a given channel supports live catch-up / timeshift replay.
 */
export function isCatchupSupportedChannel(channel: Channel | null | undefined): boolean {
  if (!channel) return false
  const hasArchive = channel.tvArchive === 1 || (typeof channel.tvArchive === 'number' && channel.tvArchive > 0)
  if (!hasArchive) return false

  // Must have an Xtream stream ID or valid M3U catch-up format
  const hasXtream = Boolean(channel.xtreamStreamId && channel.sourceId)
  const hasM3u = Boolean(channel.streamUrl && (channel.catchupType || channel.catchupSource))
  return hasXtream || hasM3u
}

/**
 * Checks whether a specific broadcast programme is currently playable via catch-up.
 */
export function isProgrammeCatchupAvailable(
  channel: Channel | null | undefined,
  programme: Programme | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!channel || !programme) return false
  if (!isCatchupSupportedChannel(channel)) return false

  // Programme must have already completed or at least started
  const hasStarted = programme.start < now
  if (!hasStarted) return false

  // Must be within archive retention duration (default 7 days)
  const archiveDays = channel.tvArchiveDuration && channel.tvArchiveDuration > 0
    ? channel.tvArchiveDuration
    : 7
  const archiveRetentionMs = archiveDays * 24 * 60 * 60 * 1000

  return (now - programme.start) <= archiveRetentionMs
}

/**
 * Creates the playback reference for a catch-up broadcast.
 */
export function getCatchupWatchRef(
  channel: Channel,
  programme: Programme,
): string | null {
  if (!isCatchupSupportedChannel(channel)) return null

  const startSec = Math.floor(programme.start / 1000)
  const stopSec = Math.floor(programme.stop / 1000)
  const durationMins = Math.max(1, Math.round((programme.stop - programme.start) / 60000))

  if (channel.xtreamStreamId && channel.sourceId) {
    return catchupRef(channel.sourceId, channel.xtreamStreamId, startSec, durationMins)
  }

  if (channel.streamUrl && (channel.catchupType || channel.catchupSource)) {
    return m3uCatchupRef(channel.id, startSec, durationMins, stopSec)
  }

  return null
}

/**
 * Computes the relative day buckets (from 0 = Today down to -7 = 7 days ago).
 */
export function getCatchupDayBuckets(
  maxDays = 7,
  now: number = Date.now(),
): CatchupDayBucket[] {
  const buckets: CatchupDayBucket[] = []
  const today = new Date(now)

  for (let offset = 0; offset >= -maxDays; offset--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset)
    const start = d.getTime()
    const end = start + 24 * 60 * 60 * 1000 - 1

    let label = `${Math.abs(offset)} days ago`
    if (offset === 0) label = 'Today'
    else if (offset === -1) label = 'Yesterday'

    const dateString = d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })

    buckets.push({
      dayOffset: offset,
      label,
      dateString,
      startOfDay: start,
      endOfDay: end,
    })
  }

  return buckets
}

/**
 * Collects and normalizes catch-up eligible programmes across channels.
 */
export function collectCatchupProgrammes(
  channels: Channel[],
  schedulesByChannel: Record<string, Programme[]>,
  options: {
    dayOffset?: number
    channelId?: string
    searchQuery?: string
    category?: string
    now?: number
  } = {},
): CatchupProgrammeItem[] {
  const now = options.now ?? Date.now()
  const dayBuckets = getCatchupDayBuckets(7, now)
  const targetBucket = options.dayOffset !== undefined
    ? dayBuckets.find((b) => b.dayOffset === options.dayOffset)
    : undefined

  const results: CatchupProgrammeItem[] = []
  const query = options.searchQuery?.trim().toLowerCase()

  for (const channel of channels) {
    if (!isCatchupSupportedChannel(channel)) continue
    if (options.channelId && channel.id !== options.channelId) continue
    if (options.category && options.category !== 'All' && !channel.categories?.includes(options.category)) {
      continue
    }

    const programmes = schedulesByChannel[channel.id] || []
    for (const prog of programmes) {
      if (!isProgrammeCatchupAvailable(channel, prog, now)) continue

      if (targetBucket) {
        if (prog.start < targetBucket.startOfDay || prog.start > targetBucket.endOfDay) {
          continue
        }
      }

      if (query) {
        const matchesTitle = prog.title.toLowerCase().includes(query)
        const matchesDesc = prog.desc?.toLowerCase().includes(query)
        const matchesChannel = channel.name.toLowerCase().includes(query)
        if (!matchesTitle && !matchesDesc && !matchesChannel) continue
      }

      const watchRef = getCatchupWatchRef(channel, prog)
      if (!watchRef) continue

      // Calculate which day offset bucket this belongs to
      let assignedOffset = 0
      for (const bucket of dayBuckets) {
        if (prog.start >= bucket.startOfDay && prog.start <= bucket.endOfDay) {
          assignedOffset = bucket.dayOffset
          break
        }
      }

      const durationMins = Math.max(1, Math.round((prog.stop - prog.start) / 60000))

      results.push({
        ref: watchRef,
        channelId: channel.id,
        channelName: channel.name,
        channelLogo: channel.logoUrl || null,
        programmeId: prog.id,
        title: prog.title,
        description: prog.desc,
        category: prog.category,
        start: prog.start,
        stop: prog.stop,
        durationMins,
        dayOffset: assignedOffset,
      })
    }
  }

  // Sort descending by broadcast start time (most recent first)
  results.sort((a, b) => b.start - a.start)
  return results
}
