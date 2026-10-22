import { useEffect, useState } from 'react'

/** Current time, re-rendering every `everyMs` (aligned to the wall-clock boundary). */
export function useNow(everyMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    let timer: number
    const tick = () => {
      setNow(Date.now())
      timer = window.setTimeout(tick, everyMs - (Date.now() % everyMs))
    }
    timer = window.setTimeout(tick, everyMs - (Date.now() % everyMs))
    return () => window.clearTimeout(timer)
  }, [everyMs])
  return now
}

export function clock(t: number, format: '24h' | '12h' = '24h') {
  return new Date(t).toLocaleTimeString('en-GB', { hour: format === '24h' ? '2-digit' : 'numeric', minute: '2-digit', hour12: format === '12h' })
}

export function relative(t: number, now = Date.now()) {
  const mins = Math.round((now - t) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  // Calendar days, so this agrees with the day headings from dayLabel().
  const days = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / 86_400_000)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

export function dayLabel(t: number, now = Date.now()) {
  const d = new Date(t)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - today.getTime()) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export const minutesLeft = (pos: number, dur: number) => Math.max(1, Math.round((dur - pos) / 60))

export function timecode(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
