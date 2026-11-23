import { findEpisode, movieById, seriesById } from './catalog'
import { OPEN_MOVIES, OPEN_SERIES } from './openCatalogue'
import { channelById, programmeAt } from './channels'
import type { Channel, Episode, Movie, Programme, Series } from './types'
import type { LocalEpisode, LocalMovie, LocalSeries } from '../lib/native'

let globalLocalMovieFinder: ((id: string) => LocalMovie | undefined) | null = null
let globalLocalEpisodeFinder: ((id: string) => { episode: LocalEpisode; series: LocalSeries } | undefined) | null = null
let globalRecordingFinder: ((id: string) => { id: string; title: string; channelName: string; durationSecs?: number } | undefined) | null = null

export interface PublicResourceLookupItem {
  id: string
  name: string
  description?: string
  category?: string
  subcategory?: string
  url?: string
  playbackUrl?: string
  playbackType?: string
  artworkUrl?: string
  provider?: string
}

let globalResourceFinder: ((id: string) => PublicResourceLookupItem | undefined) | null = null

export function registerLocalMediaLookups(
  findMovie: ((id: string) => LocalMovie | undefined) | null,
  findEpisode: ((id: string) => { episode: LocalEpisode; series: LocalSeries } | undefined) | null,
) {
  globalLocalMovieFinder = findMovie
  globalLocalEpisodeFinder = findEpisode
}

export function registerRecordingLookup(
  findRecording: ((id: string) => { id: string; title: string; channelName: string; durationSecs?: number } | undefined) | null,
) {
  globalRecordingFinder = findRecording
}

export function registerResourceLookup(
  findResource: ((id: string) => PublicResourceLookupItem | undefined) | null,
) {
  globalResourceFinder = findResource
}

export type Resolved =
  | { kind: 'movie'; ref: string; title: string; meta: string; art: string; artworkKey?: string | null; focus: number; href: string; play: string; item: Movie | { name: string; year: number | null; artworkKey: string | null; extension: string }; streamUrl?: string | null }
  | { kind: 'series'; ref: string; title: string; meta: string; art: string; artworkKey?: string | null; focus: number; href: string; play: string; item: Series | { name: string; year: number | null; artworkKey: string | null } }
  | { kind: 'episode'; ref: string; title: string; meta: string; art: string; artworkKey?: string | null; focus: number; href: string; play: string; item: Episode | { id: string; number: number; seasonNumber: number; title: string; plot: string | null; runtimeSeconds: number | null; extension: string; artworkKey: string | null }; series?: Series | { name: string; year: number | null; artworkKey: string | null }; streamUrl?: string | null }
  | { kind: 'channel'; ref: string; title: string; meta: string; art: string; focus: number; href: string; play: string; item: Channel }
  | { kind: 'recording'; ref: string; title: string; meta: string; art: string; focus: number; href: string; play: string; streamUrl: string; item: { id: string; title: string; channelName: string; durationSecs: number } }
  | { kind: 'catchup'; ref: string; title: string; meta: string; art: string; focus: number; href: string; play: string; streamUrl: string; item: { sourceId?: string; streamId?: string; channelId?: string; startTimestamp: number; durationMins: number; stopTimestamp?: number } }

export const movieRef = (id: string) => `movie:${id}`
export const seriesRef = (id: string) => `series:${id}`
export const downloadRef = (id: string, ext: string = 'mp4') => `download:${id}/video.${ext.replace(/^\./, '')}`
export const channelRef = (id: string) => `channel:${id}`
export const episodeRef = (seriesId: string, episodeId: string) => `episode:${seriesId}/${episodeId}`
export const recordingRef = (id: string) => `recording:${id}`
export const localMovieRef = (id: string) => `local-movie:${id}`
export const localEpisodeRef = (id: string) => `local-episode:${id}`
export const catchupRef = (sourceId: string, streamId: string, startTimestamp: number, durationMins: number) =>
  `catchup:xt:${sourceId}:${streamId}:${startTimestamp}:${durationMins}`
export const m3uCatchupRef = (channelId: string, startTimestamp: number, durationMins: number, stopTimestamp: number) =>
  `catchup:m3u:${channelId}:${startTimestamp}:${durationMins}:${stopTimestamp}`

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
  const isOpenMedia = OPEN_MOVIES.some((m) => m.id === rest) || OPEN_SERIES.some((s) => rest.startsWith(s.id + '/') || s.id === rest)
  if (!titles && kind !== 'channel' && kind !== 'recording' && kind !== 'download' && kind !== 'catchup' && kind !== 'local-movie' && kind !== 'local-episode' && kind !== 'res' && kind !== 'resource' && !isXtream && !isOpenMedia) return undefined // fictional titles are hidden next to real playlists
  const play = `/watch/${encodeURIComponent(ref)}`
  if (kind === 'res' || kind === 'resource') {
    const cleanId = rest.replace(/^res:/, '')
    const resItem = globalResourceFinder?.(cleanId) ?? globalResourceFinder?.(rest)
    if (resItem) {
      return {
        kind: 'movie',
        ref,
        title: resItem.name,
        meta: [resItem.provider, resItem.category].filter(Boolean).join(' · ') || 'Public Media Resource',
        art: resItem.artworkUrl ?? '',
        focus: 50,
        href: `/movies/${encodeURIComponent(ref)}`,
        play,
        streamUrl: resItem.playbackUrl || resItem.url || null,
        item: {
          kind: 'movie',
          id: resItem.id,
          title: resItem.name,
          year: 2026,
          runtime: 90,
          genres: [resItem.category ?? 'Archive', resItem.subcategory ?? 'Film'].filter(Boolean),
          certificate: 'PG',
          tagline: resItem.provider ?? 'Verified Public Media',
          synopsis: resItem.description ?? 'Verified public stream from open discovery catalogue.',
          art: resItem.artworkUrl ?? '',
          focus: 50,
          added: new Date().toISOString(),
          audio: ['Original stereo'],
          subtitles: [],
        },
      }
    }
  }
  if (kind === 'local-movie') {
    const movie = globalLocalMovieFinder?.(rest)
    return {
      kind: 'movie',
      ref,
      title: movie?.title ?? 'Local Film',
      meta: movie ? `${movie.resolution ?? 'HD'} · Local Media` : 'Local Media Library',
      art: movie?.artPath ?? '',
      focus: 50,
      href: `/movies/${encodeURIComponent(ref)}`,
      play,
      streamUrl: `kstream://localhost/local/${rest}/stream`,
      item: {
        kind: 'movie',
        id: rest,
        title: movie?.title ?? 'Local Film',
        year: movie?.year ?? 2026,
        runtime: movie?.durationSecs ? Math.round(movie.durationSecs / 60) : 120,
        genres: ['Local Media'],
        certificate: 'PG',
        tagline: movie?.edition ?? 'Personal Media Library',
        synopsis: 'Local media file streamed directly from personal storage.',
        art: movie?.artPath ?? '',
        focus: 50,
        added: movie?.discoveredAt ? new Date(movie.discoveredAt * 1000).toISOString() : new Date().toISOString(),
        audio: ['Original'],
        subtitles: [],
      },
    }
  }
  if (kind === 'local-episode') {
    const epData = globalLocalEpisodeFinder?.(rest)
    const ep = epData?.episode
    const series = epData?.series
    return {
      kind: 'episode',
      ref,
      title: ep?.title ?? 'Local Episode',
      meta: series ? `${series.title} · S${ep?.seasonNumber ?? 1} E${ep?.episodeNumber ?? 1}` : 'Local Series',
      art: ep?.artPath ?? series?.artPath ?? '',
      focus: 50,
      href: `/series/${encodeURIComponent(ref)}`,
      play,
      streamUrl: `kstream://localhost/local/${rest}/stream`,
      item: {
        seriesId: series?.id ?? 'local',
        season: ep?.seasonNumber ?? 1,
        id: rest,
        number: ep?.episodeNumber ?? 1,
        title: ep?.title ?? 'Local Episode',
        synopsis: 'Local series episode streamed directly from personal storage.',
        runtime: ep?.durationSecs ? Math.round(ep.durationSecs / 60) : 45,
        still: ep?.artPath ?? '',
        stillFocus: 50,
      },
      series: series ? {
        kind: 'series',
        id: series.id,
        title: series.title,
        years: series.year ? String(series.year) : '2026',
        genres: ['Local Media'],
        certificate: 'PG',
        tagline: 'Local Series',
        synopsis: 'Local series streamed directly from personal storage.',
        art: series.artPath ?? '',
        posterUrl: series.artPath ?? undefined,
        backdropUrl: series.backdropPath ?? undefined,
        focus: 50,
        added: new Date().toISOString(),
        seasons: series.seasons.map((sn) =>
          sn.episodes.map((e) => ({
            id: e.id,
            seriesId: series.id,
            number: e.episodeNumber,
            season: sn.seasonNumber,
            title: e.title ?? `Episode ${e.episodeNumber}`,
            synopsis: '',
            runtime: e.durationSecs ? Math.round(e.durationSecs / 60) : 45,
            still: e.artPath ?? '',
            stillFocus: 50,
          })),
        ),
      } : undefined,
    }
  }
  if (kind === 'recording') {
    const rec = globalRecordingFinder?.(rest)
    return {
      kind,
      ref,
      title: rec?.title ?? 'DVR Recording',
      meta: rec ? `${rec.channelName} · Recorded broadcast` : 'Recorded broadcast',
      art: '',
      focus: 50,
      href: '/recordings',
      play,
      streamUrl: `kstream://localhost/dvr/${rest}/playlist.m3u8`,
      item: { id: rest, title: rec?.title ?? 'DVR Recording', channelName: rec?.channelName ?? 'Live TV', durationSecs: rec?.durationSecs ?? 3600 },
    }
  }
  if (kind === 'download') {
    const [downloadId = '', fileName = 'video.mp4'] = rest.split('/')
    return {
      kind: 'movie',
      ref,
      title: 'Downloaded Media',
      meta: 'Offline Playback',
      art: '',
      focus: 50,
      href: '/library',
      play,
      streamUrl: `kstream://localhost/downloads/${downloadId}/${fileName}`,
      item: {
        kind: 'movie',
        id: downloadId,
        title: 'Offline Video',
        year: 2026,
        runtime: 120,
        genres: ['Offline'],
        certificate: 'PG',
        tagline: 'Downloaded for offline viewing',
        synopsis: 'Media downloaded for offline viewing.',
        art: '',
        focus: 50,
        added: new Date().toISOString(),
        audio: ['Stereo'],
        subtitles: [],
      },
    }
  }
  if (kind === 'catchup') {
    const parts = rest.split(':')
    const subkind = parts[0]
    if (subkind === 'm3u') {
      const [, channelId = '', startStr = '0', durStr = '60', stopStr = '0'] = parts
      const start = parseInt(startStr, 10) || 0
      const dur = parseInt(durStr, 10) || 60
      const stop = parseInt(stopStr, 10) || (start + dur * 60)
      const ch = findChannel ? findChannel(channelId) : undefined
      const title = ch ? `${ch.cleanName || ch.name} (Catch-up)` : 'Catch-up Programme'
      const query = new URLSearchParams()
      if (ch?.streamUrl) query.set('url', ch.streamUrl)
      if (ch?.catchupType) query.set('type', ch.catchupType)
      if (ch?.catchupSource) query.set('source', ch.catchupSource)
      query.set('start', String(start))
      query.set('dur', String(dur))
      query.set('stop', String(stop))
      return {
        kind,
        ref,
        title,
        meta: 'Past broadcast',
        art: ch?.logoUrl ?? '',
        focus: 50,
        href: '/live',
        play,
        streamUrl: `catchup://m3u/?${query.toString()}`,
        item: {
          channelId,
          startTimestamp: start,
          durationMins: dur,
          stopTimestamp: stop,
        },
      }
    }
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
