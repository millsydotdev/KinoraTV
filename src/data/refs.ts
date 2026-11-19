import { findEpisode, movieById, seriesById } from './catalog'
import { channelById, programmeAt } from './channels'
import type { Channel, Episode, Movie, Programme, Series } from './types'

export type Resolved =
  | { kind: 'movie'; ref: string; title: string; meta: string; art: string; artworkKey?: string | null; focus: number; href: string; play: string; item: Movie | { name: string; year: number | null; artworkKey: string | null; extension: string }; streamUrl?: string | null }
  | { kind: 'series'; ref: string; title: string; meta: string; art: string; artworkKey?: string | null; focus: number; href: string; play: string; item: Series | { name: string; year: number | null; artworkKey: string | null } }
  | { kind: 'episode'; ref: string; title: string; meta: string; art: string; artworkKey?: string | null; focus: number; href: string; play: string; item: Episode | { id: string; number: number; seasonNumber: number; title: string; plot: string | null; runtimeSeconds: number | null; extension: string; artworkKey: string | null }; series?: Series | { name: string; year: number | null; artworkKey: string | null }; streamUrl?: string | null }
  | { kind: 'channel'; ref: string; title: string; meta: string; art: string; focus: number; href: string; play: string; item: Channel }
  | { kind: 'recording'; ref: string; title: string; meta: string; art: string; focus: number; href: string; play: string; streamUrl: string; item: { id: string; title: string; channelName: string; durationSecs: number } }
  | { kind: 'catchup'; ref: string; title: string; meta: string; art: string; focus: number; href: string; play: string; streamUrl: string; item: { sourceId: string; streamId: string; startTimestamp: number; durationMins: number } }

export const movieRef = (id: string) => `movie:${id}`
export const seriesRef = (id: string) => `series:${id}`
export const channelRef = (id: string) => `channel:${id}`
export const episodeRef = (seriesId: string, episodeId: string) => `episode:${seriesId}/${episodeId}`
export const recordingRef = (id: string) => `recording:${id}`
export const localMovieRef = (id: string) => `local-movie:${id}`
export const localEpisodeRef = (id: string) => `local-episode:${id}`
export const catchupRef = (sourceId: string, streamId: string, startTimestamp: number, durationMins: number) =>
  `catchup:xt:${sourceId}:${streamId}:${startTimestamp}:${durationMins}`

export const runtimeLabel = (mins: number) => (mins >= 60 ? `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m` : `${mins}m`)
export const episodeCode = (e: Episode | { number: number; seasonNumber?: number }) => {
  const season = 'season' in e ? e.season : (e.seasonNumber ?? 1)
  return `S${season} E${e.number}`
}

/** `findChannel` and `at` default to the demonstration catalogue; screens pass the store's catalogue and guide. */
export function resolve(
  ref: string, now = Date.now(), findChannel: (id: string) => Channel | undefined = channelById,
  at: (c: Channel, t: number) => Programme | undefined = programmeAt,
  titles = true,
  findXtreamMovie?: (sourceId: string, id: string) => { name: string; year: number | null; artworkKey: string | null; extension: string } | undefined,
  findXtreamSeries?: (sourceId: string, id: string) => { name: string; year: number | null; artworkKey: string | null } | undefined,
  findXtreamEpisode?: (sourceId: string, seriesId: string, episodeId: string) => { id: string; number: number; seasonNumber: number; title: string; plot: string | null; runtimeSeconds: number | null; extension: string; artworkKey: string | null } | undefined,
): Resolved | undefined {
  const colonIndex = ref.indexOf(':')
  const kind = colonIndex >= 0 ? ref.slice(0, colonIndex) : ref
  const rest = colonIndex >= 0 ? ref.slice(colonIndex + 1) : ''
  const isXtream = rest.startsWith('xt:')
  if (!titles && kind !== 'channel' && kind !== 'recording' && kind !== 'catchup' && kind !== 'local-movie' && kind !== 'local-episode' && !isXtream) return undefined // fictional titles are hidden next to real playlists
  const play = `/watch/${encodeURIComponent(ref)}`
  if (kind === 'local-movie') {
    return {
      kind: 'movie',
      ref,
      title: 'Local Film',
      meta: 'Local Media Library',
      art: '',
      focus: 50,
      href: `/movies/${encodeURIComponent(ref)}`,
      play,
      streamUrl: `kstream://localhost/local/${rest}/playlist.m3u8`,
      item: {
        kind: 'movie',
        id: rest,
        title: 'Local Film',
        year: 2026,
        runtime: 120,
        genres: ['Local Media'],
        certificate: 'PG',
        tagline: 'Personal Media Library',
        synopsis: 'Local media file streamed directly from personal storage.',
        art: '',
        focus: 50,
        added: new Date().toISOString(),
        audio: ['Original'],
        subtitles: [],
      },
    }
  }
  if (kind === 'local-episode') {
    return {
      kind: 'episode',
      ref,
      title: 'Local Episode',
      meta: 'Local Series',
      art: '',
      focus: 50,
      href: `/series/${encodeURIComponent(ref)}`,
      play,
      streamUrl: `kstream://localhost/local/${rest}/playlist.m3u8`,
      item: {
        seriesId: 'local',
        season: 1,
        id: rest,
        number: 1,
        title: 'Local Episode',
        synopsis: 'Local series episode streamed directly from personal storage.',
        runtime: 45,
        still: '',
        stillFocus: 50,
      },
    }
  }
  if (kind === 'recording') {
    return {
      kind,
      ref,
      title: 'DVR Recording',
      meta: 'Recorded broadcast',
      art: '',
      focus: 50,
      href: '/recordings',
      play,
      streamUrl: `kstream://localhost/dvr/${rest}/playlist.m3u8`,
      item: { id: rest, title: 'DVR Recording', channelName: 'Live TV', durationSecs: 3600 },
    }
  }
  if (kind === 'catchup') {
    const parts = rest.split(':')
    const [, sourceId = '', streamId = '', startStr = '0', durStr = '60'] = parts
    return {
      kind,
      ref,
      title: 'Catch-up Programme',
      meta: 'Past broadcast',
      art: '',
      focus: 50,
      href: '/live',
      play,
      streamUrl: `catchup://${sourceId}/${streamId}/${startStr}/${durStr}`,
      item: {
        sourceId,
        streamId,
        startTimestamp: parseInt(startStr, 10) || 0,
        durationMins: parseInt(durStr, 10) || 60,
      },
    }
  }
  if (kind === 'movie') {
    if (isXtream && findXtreamMovie) {
      const [, sourceId = '', idStr = ''] = rest.split(':')
      const m = findXtreamMovie(sourceId, idStr)
      if (m) {
        return {
          kind, ref, title: m.name, meta: m.year ? `${m.year} · Provider` : 'Provider catalogue',
          art: '', artworkKey: m.artworkKey, focus: 50, href: `/movies/${encodeURIComponent(rest)}`, play,
          item: m,
          streamUrl: `xtream://${sourceId}/movie/${idStr}${m.extension ? `?ext=${m.extension}` : ''}`,
        }
      }
    }
    const m = movieById(rest)
    return m && { kind, ref, title: m.title, meta: `${m.year} · ${runtimeLabel(m.runtime)}`, art: m.art, focus: m.focus, href: `/movies/${m.id}`, play, item: m }
  }
  if (kind === 'series') {
    if (isXtream && findXtreamSeries) {
      const [, sourceId = '', idStr = ''] = rest.split(':')
      const s = findXtreamSeries(sourceId, idStr)
      if (s) {
        return {
          kind, ref, title: s.name, meta: s.year ? `${s.year} · Provider` : 'Provider catalogue',
          art: '', artworkKey: s.artworkKey, focus: 50, href: `/series/${encodeURIComponent(rest)}`, play: `/series/${encodeURIComponent(rest)}`,
          item: s,
        }
      }
    }
    const s = seriesById(rest)
    return s && { kind, ref, title: s.title, meta: `${s.seasons.length} season${s.seasons.length > 1 ? 's' : ''}`, art: s.art, focus: s.focus, href: `/series/${s.id}`, play, item: s }
  }
  if (kind === 'episode') {
    if (isXtream && findXtreamEpisode) {
      const withoutPrefix = rest.slice('xt:'.length)
      const [seriesPart = '', episodeId = ''] = withoutPrefix.split('/')
      const [sourceId = '', seriesId = ''] = seriesPart.split(':')
      const ep = findXtreamEpisode(sourceId, seriesId, episodeId)
      const s = findXtreamSeries ? findXtreamSeries(sourceId, seriesId) : undefined
      if (ep) {
        return {
          kind, ref, title: s ? s.name : 'Series', meta: `S${ep.seasonNumber} E${ep.number} · ${ep.title}`,
          art: '', artworkKey: ep.artworkKey, focus: 50,
          href: `/series/${encodeURIComponent(`xt:${sourceId}:${seriesId}`)}?season=${ep.seasonNumber}`, play,
          item: ep, series: s,
          streamUrl: `xtream://${sourceId}/series/${episodeId}${ep.extension ? `?ext=${ep.extension}` : ''}`,
        }
      }
    }
    const [sid = '', eid = ''] = rest.split('/')
    const f = findEpisode(sid, eid)
    return f && {
      kind, ref, title: f.series.title, meta: `${episodeCode(f.episode)} · ${f.episode.title}`, art: f.episode.still, focus: f.episode.stillFocus,
      href: `/series/${sid}?season=${f.episode.season}`, play, item: f.episode, series: f.series,
    }
  }
  if (kind === 'channel') {
    const c = findChannel(rest)
    const p = c && at(c, now)
    return c && { kind, ref, title: c.name, meta: p ? `Now: ${p.title}` : c.categories.join(' · '), art: p?.art ?? '', focus: 50, href: `/live?channel=${c.id}`, play: `/live?channel=${c.id}`, item: c }
  }
  return undefined
}
