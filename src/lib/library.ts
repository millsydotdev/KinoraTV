import { nextEpisode } from '../data/catalog'
import { episodeRef, resolve, type Resolved } from '../data/refs'
import type { Episode, Series } from '../data/types'
import type { Library } from '../state/store'

/** The episode a viewer should play next: one in progress, else the one after the last watched, else the first. */
export function seriesNextUp(library: Library, s: Series): { episode: Episode; state: 'resume' | 'next' | 'start' | 'rewatch' } {
  const all = s.seasons.flat()
  const first = all[0] as Episode
  const inProgress = all
    .map((e) => ({ e, p: library.progress[episodeRef(s.id, e.id)] }))
    .filter((x) => x.p)
    .sort((a, b) => (b.p?.at ?? 0) - (a.p?.at ?? 0))[0]
  if (inProgress) return { episode: inProgress.e, state: 'resume' }
  const watchedIdx = all.map((e, i) => (library.watched.includes(episodeRef(s.id, e.id)) ? i : -1)).filter((i) => i >= 0)
  if (watchedIdx.length === 0) return { episode: first, state: 'start' }
  const last = all[Math.max(...watchedIdx)] as Episode
  const next = nextEpisode(s, last)
  return next ? { episode: next, state: 'next' } : { episode: first, state: 'rewatch' }
}

export function continueWatching(library: Library): (Resolved & { progress: number; secondsLeft: number })[] {
  return Object.entries(library.progress)
    .sort(([, a], [, b]) => b.at - a.at)
    .flatMap(([ref, p]) => {
      const r = resolve(ref)
      if (!r || library.watched.includes(ref)) return []
      return [{ ...r, progress: Math.min(1, p.pos / p.dur), secondsLeft: p.dur - p.pos }]
    })
}

export const isIn = (list: string[], ref: string) => list.includes(ref)
