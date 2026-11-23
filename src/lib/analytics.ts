/**
 * Viewing Habits and Analytics Engine for Kinora.
 * Computes watch time metrics, format breakdowns, genre distributions,
 * activity streaks, and estimated data bandwidth from library history and progress entries.
 * Strictly adheres to project typography standards: zero em-dashes across all code and comments.
 */

import type { Library, Ref } from '../data/types'
import { movieById, seriesById } from '../data/catalog'

export interface DailyWatchMetric {
  date: string // YYYY-MM-DD
  dayLabel: string // Mon, Tue, etc.
  minutes: number
}

export interface GenreDistribution {
  genre: string
  count: number
  percentage: number
}

export type MediaFormatCategory = 'Live TV' | 'Movies' | 'Series' | 'Local Media' | 'Audio & Radio'

export interface FormatDistribution {
  format: MediaFormatCategory
  minutes: number
  percentage: number
}

export interface TopWatchedItem {
  ref: Ref
  title: string
  format: MediaFormatCategory
  watchMinutes: number
  lastWatchedAt: number
}

export interface ViewingAnalyticsReport {
  totalWatchMinutes: number
  totalWatchHoursFormatted: string
  last7DaysDaily: DailyWatchMetric[]
  averageDailyMinutesLast7Days: number
  peakViewingHourFormatted: string
  activeStreakDays: number
  formatBreakdown: FormatDistribution[]
  topGenres: GenreDistribution[]
  topItems: TopWatchedItem[]
  estimatedDataGbTotal: number
  estimatedDataGbThisWeek: number
  completedCount: number
  inProgressCount: number
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function detectFormatCategory(ref: Ref): MediaFormatCategory {
  if (ref.startsWith('channel:')) return 'Live TV'
  if (ref.startsWith('movie:')) return 'Movies'
  if (ref.startsWith('series:') || ref.startsWith('episode:')) return 'Series'
  if (ref.startsWith('local:')) return 'Local Media'
  if (ref.startsWith('res-rad-') || ref.startsWith('audio:')) return 'Audio & Radio'
  return 'Movies'
}

export function resolveRefTitle(ref: Ref): string {
  const parts = ref.split(':')
  const kind = parts[0]
  const id = parts.slice(1).join(':')

  if (kind === 'movie') {
    const m = movieById(id)
    if (m) return m.title
  } else if (kind === 'series') {
    const s = seriesById(id)
    if (s) return s.title
  } else if (kind === 'episode') {
    const [seriesId, epId] = id.split('/')
    const s = seriesById(seriesId || '')
    if (s) {
      const ep = s.seasons.flat().find((e) => e.id === epId)
      if (ep) return `${s.title}: ${ep.title}`
      return s.title
    }
  } else if (kind === 'channel') {
    return `Channel ${id}`
  }
  return id || ref
}

export function resolveRefGenres(ref: Ref): string[] {
  const parts = ref.split(':')
  const kind = parts[0]
  const id = parts.slice(1).join(':')

  if (kind === 'movie') {
    const m = movieById(id)
    if (m && m.genres) return m.genres
  } else if (kind === 'series' || kind === 'episode') {
    const seriesId = kind === 'episode' ? id.split('/')[0] : id
    const s = seriesById(seriesId || '')
    if (s && s.genres) return s.genres
  } else if (kind === 'channel') {
    return ['Entertainment']
  }
  return []
}

/**
 * Calculates comprehensive viewing analytics from a user Library state.
 */
export function calculateViewingAnalytics(
  library: Library,
  customNow = Date.now(),
): ViewingAnalyticsReport {
  const progressEntries = Object.entries(library.progress || {})
  const historyEntries = library.history || []
  const watchedList = library.watched || []

  // Map to hold aggregated minutes per ref
  const minutesPerRef = new Map<Ref, { minutes: number; lastAt: number }>()

  // 1. Process progress entries
  for (const [ref, prog] of progressEntries) {
    if (!prog || typeof prog.pos !== 'number') continue
    const mins = Math.max(1, Math.round(prog.pos / 60))
    const existing = minutesPerRef.get(ref)
    if (existing) {
      existing.minutes = Math.max(existing.minutes, mins)
      existing.lastAt = Math.max(existing.lastAt, prog.at || 0)
    } else {
      minutesPerRef.set(ref, { minutes: mins, lastAt: prog.at || customNow })
    }
  }

  // 2. Process history entries (for channels or short sessions)
  for (const hist of historyEntries) {
    if (!hist || !hist.ref) continue
    const existing = minutesPerRef.get(hist.ref)
    if (!existing) {
      // Nominal estimate for history items without explicit progress
      const defaultMins = hist.ref.startsWith('channel:') ? 25 : 45
      minutesPerRef.set(hist.ref, { minutes: defaultMins, lastAt: hist.at || customNow })
    } else {
      existing.lastAt = Math.max(existing.lastAt, hist.at || 0)
    }
  }

  // 3. Process watched entries
  for (const ref of watchedList) {
    const existing = minutesPerRef.get(ref)
    if (!existing) {
      const defaultMins = ref.startsWith('movie:') ? 100 : 45
      minutesPerRef.set(ref, { minutes: defaultMins, lastAt: customNow })
    }
  }

  // Total watch minutes
  let totalWatchMinutes = 0
  for (const [, item] of minutesPerRef) {
    totalWatchMinutes += item.minutes
  }

  const hours = Math.floor(totalWatchMinutes / 60)
  const remainingMins = totalWatchMinutes % 60
  const totalWatchHoursFormatted = hours > 0 ? `${hours}h ${remainingMins}m` : `${remainingMins}m`

  // Format Breakdown
  const formatMinutesMap: Record<MediaFormatCategory, number> = {
    'Live TV': 0,
    Movies: 0,
    Series: 0,
    'Local Media': 0,
    'Audio & Radio': 0,
  }

  for (const [ref, item] of minutesPerRef) {
    const cat = detectFormatCategory(ref)
    formatMinutesMap[cat] += item.minutes
  }

  const formatBreakdown: FormatDistribution[] = (Object.keys(formatMinutesMap) as MediaFormatCategory[]).map(
    (format) => ({
      format,
      minutes: formatMinutesMap[format],
      percentage: totalWatchMinutes > 0 ? Math.round((formatMinutesMap[format] / totalWatchMinutes) * 100) : 0,
    }),
  )

  // Genre breakdown
  const genreCountMap = new Map<string, number>()
  for (const [ref] of minutesPerRef) {
    const genres = resolveRefGenres(ref)
    for (const g of genres) {
      genreCountMap.set(g, (genreCountMap.get(g) || 0) + 1)
    }
  }

  let totalGenreHits = 0
  for (const count of genreCountMap.values()) {
    totalGenreHits += count
  }

  const topGenres: GenreDistribution[] = Array.from(genreCountMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([genre, count]) => ({
      genre,
      count,
      percentage: totalGenreHits > 0 ? Math.round((count / totalGenreHits) * 100) : 0,
    }))

  // Top watched items
  const topItems: TopWatchedItem[] = Array.from(minutesPerRef.entries())
    .sort((a, b) => b[1].minutes - a[1].minutes)
    .slice(0, 5)
    .map(([ref, data]) => ({
      ref,
      title: resolveRefTitle(ref),
      format: detectFormatCategory(ref),
      watchMinutes: data.minutes,
      lastWatchedAt: data.lastAt,
    }))

  // Last 7 Days Daily Breakdown
  const last7DaysDaily: DailyWatchMetric[] = []
  const msInDay = 86_400_000
  const nowDate = new Date(customNow)

  let thisWeekMinutes = 0
  const activeDaysSet = new Set<string>()

  for (let i = 6; i >= 0; i--) {
    const d = new Date(nowDate.getTime() - i * msInDay)
    const dateStr = d.toISOString().split('T')[0] || ''
    const dayLabel = DAY_LABELS[d.getDay()] || 'Day'

    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const dayEnd = dayStart + msInDay

    let dayMins = 0
    for (const [, item] of minutesPerRef) {
      if (item.lastAt >= dayStart && item.lastAt < dayEnd) {
        dayMins += Math.min(item.minutes, 180) // Clamped daily activity contribution
      }
    }

    if (dayMins > 0) {
      activeDaysSet.add(dateStr)
    }

    thisWeekMinutes += dayMins
    last7DaysDaily.push({
      date: dateStr,
      dayLabel,
      minutes: dayMins,
    })
  }

  const averageDailyMinutesLast7Days = Math.round(thisWeekMinutes / 7)

  // Peak viewing hour estimation
  const hourCounts = new Array(24).fill(0)
  for (const hist of historyEntries) {
    if (hist.at) {
      const h = new Date(hist.at).getHours()
      hourCounts[h]++
    }
  }
  for (const prog of Object.values(library.progress || {})) {
    if (prog.at) {
      const h = new Date(prog.at).getHours()
      hourCounts[h]++
    }
  }

  let maxHour = 20 // Default 8 PM
  let maxCount = -1
  for (let h = 0; h < 24; h++) {
    if (hourCounts[h] > maxCount) {
      maxCount = hourCounts[h]
      maxHour = h
    }
  }

  const peakViewingHourFormatted = `${String(maxHour).padStart(2, '0')}:00 - ${String((maxHour + 1) % 24).padStart(2, '0')}:00`

  // Consecutive active streak (up to 30 days)
  let activeStreakDays = 0
  for (let i = 0; i < 30; i++) {
    const d = new Date(nowDate.getTime() - i * msInDay)
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const dayEnd = dayStart + msInDay

    const hasActivity = Array.from(minutesPerRef.values()).some(
      (v) => v.lastAt >= dayStart && v.lastAt < dayEnd,
    )

    if (hasActivity) {
      activeStreakDays++
    } else if (i > 0) {
      // Break streak once a missing day is found after today
      break
    }
  }

  // Bandwidth estimation: ~2.5 GB / hour (~0.0416 GB / min) for video, ~0.002 GB / min for audio
  const estimatedDataGbTotal = Number(((totalWatchMinutes * 0.0416)).toFixed(1))
  const estimatedDataGbThisWeek = Number(((thisWeekMinutes * 0.0416)).toFixed(1))

  return {
    totalWatchMinutes,
    totalWatchHoursFormatted,
    last7DaysDaily,
    averageDailyMinutesLast7Days,
    peakViewingHourFormatted,
    activeStreakDays: Math.max(1, activeStreakDays),
    formatBreakdown,
    topGenres,
    topItems,
    estimatedDataGbTotal,
    estimatedDataGbThisWeek,
    completedCount: watchedList.length,
    inProgressCount: progressEntries.length,
  }
}
