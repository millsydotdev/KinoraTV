import { findEpisode, movieById, seriesById } from './catalog'
import { channelById, programmeAt } from './channels'
import type { Channel, Episode, Movie, Series } from './types'

export type Resolved =
  | { kind: 'movie'; ref: string; title: string; meta: string; art: string; focus: number; href: string; play: string; item: Movie }
  | { kind: 'series'; ref: string; title: string; meta: string; art: string; focus: number; href: string; play: string; item: Series }
  | { kind: 'episode'; ref: string; title: string; meta: string; art: string; focus: number; href: string; play: string; item: Episode; series: Series }
  | { kind: 'channel'; ref: string; title: string; meta: string; art: string; focus: number; href: string; play: string; item: Channel }

export const movieRef = (id: string) => `movie:${id}`
export const seriesRef = (id: string) => `series:${id}`
export const channelRef = (id: string) => `channel:${id}`
export const episodeRef = (seriesId: string, episodeId: string) => `episode:${seriesId}/${episodeId}`

export const runtimeLabel = (mins: number) => (mins >= 60 ? `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m` : `${mins}m`)
export const episodeCode = (e: Episode) => `S${e.season} E${e.number}`

/** `findChannel` defaults to the demonstration catalogue; screens pass the store's active catalogue. */
export function resolve(ref: string, now = Date.now(), findChannel: (id: string) => Channel | undefined = channelById): Resolved | undefined {
  const [kind, rest = ''] = ref.split(':') as [string, string | undefined]
  const play = `/watch/${encodeURIComponent(ref)}`
  if (kind === 'movie') {
    const m = movieById(rest)
    return m && { kind, ref, title: m.title, meta: `${m.year} · ${runtimeLabel(m.runtime)}`, art: m.art, focus: m.focus, href: `/movies/${m.id}`, play, item: m }
  }
  if (kind === 'series') {
    const s = seriesById(rest)
    return s && { kind, ref, title: s.title, meta: `${s.seasons.length} season${s.seasons.length > 1 ? 's' : ''}`, art: s.art, focus: s.focus, href: `/series/${s.id}`, play, item: s }
  }
  if (kind === 'episode') {
    const [sid = '', eid = ''] = rest.split('/')
    const f = findEpisode(sid, eid)
    return f && {
      kind, ref, title: f.series.title, meta: `${episodeCode(f.episode)} · ${f.episode.title}`, art: f.episode.still, focus: f.episode.stillFocus,
      href: `/series/${sid}?season=${f.episode.season}`, play, item: f.episode, series: f.series,
    }
  }
  if (kind === 'channel') {
    const c = findChannel(rest)
    const p = c && programmeAt(c, now)
    return c && { kind, ref, title: c.name, meta: p ? `Now: ${p.title}` : c.group, art: p?.art ?? '', focus: 50, href: `/live?channel=${c.id}`, play: `/live?channel=${c.id}`, item: c }
  }
  return undefined
}
