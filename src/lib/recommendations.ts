import type { Movie, Series, Channel, Programme } from '../data/types'
import type { RatingValue, DislikeFeedback } from '../state/userPreferences'
import { movieRef, seriesRef } from '../data/refs'

export interface RecommendedItem {
  ref: string
  title: string
  kind: 'movie' | 'series' | 'channel'
  art: string
  artworkKey?: string | null
  focus?: number
  to: string
  meta: string
  score: number
  reason: string
}

export interface RecommendationResults {
  recommendedForYou: RecommendedItem[]
  becauseYouWatched: { sourceTitle: string; items: RecommendedItem[] } | null
  topInLibrary: RecommendedItem[]
}

interface RecommendationInputs {
  ratings: Record<string, RatingValue>
  dislikeFeedback?: Record<string, DislikeFeedback>
  history: Array<{ ref: string; at: number; progress?: number }>
  favourites: string[]
  watchlist: string[]
  hiddenItems: string[]
  demoTitles: boolean
  demoMovies: Movie[]
  demoSeries: Series[]
  channels: Channel[]
  xtreamMovies: Array<{ id: string; sourceId: string; name: string; year: number | null; artworkKey: string | null; extension: string }>
  xtreamSeries: Array<{ id: string; sourceId: string; name: string; year: number | null; artworkKey: string | null }>
  programmeAt?: (c: Channel, t: number) => Programme | undefined
  now?: number
}

export function computeRecommendations({
  ratings,
  dislikeFeedback = {},
  history,
  favourites,
  watchlist,
  hiddenItems,
  demoTitles,
  demoMovies,
  demoSeries,
  channels: _channels,
  xtreamMovies,
  xtreamSeries,
}: RecommendationInputs): RecommendationResults {
  const hiddenSet = new Set(hiddenItems)
  const dislikedSet = new Set<string>()

  // Build genre affinity map from user ratings and history
  const genreScores: Record<string, number> = {}

  if (dislikeFeedback) {
    for (const [ref, fb] of Object.entries(dislikeFeedback)) {
      dislikedSet.add(ref)
      if (fb.reason === 'not-interested-in-genre' || fb.reason === 'dont-recommend-similar' || fb.reason === 'not-my-type') {
        if (ref.startsWith('movie:')) {
          const m = demoMovies.find((item) => item.id === ref.slice(6))
          if (m) {
            m.genres.forEach((g) => {
              genreScores[g.toLowerCase()] = (genreScores[g.toLowerCase()] ?? 0) - 5
            })
          }
        } else if (ref.startsWith('series:')) {
          const s = demoSeries.find((item) => item.id === ref.slice(7))
          if (s) {
            s.genres.forEach((g) => {
              genreScores[g.toLowerCase()] = (genreScores[g.toLowerCase()] ?? 0) - 5
            })
          }
        }
      }
    }
  }

  for (const [ref, val] of Object.entries(ratings)) {
    if (val === 'dislike' || val === 1 || val === 2) {
      dislikedSet.add(ref)
      continue
    }
    const weight = val === 'strong-like' || val === 5 ? 5 : val === 'like' || val === 4 ? 3 : 1

    if (ref.startsWith('movie:')) {
      const id = ref.slice(6)
      const m = demoMovies.find((item) => item.id === id)
      if (m) {
        m.genres.forEach((g) => {
          genreScores[g.toLowerCase()] = (genreScores[g.toLowerCase()] ?? 0) + weight
        })
      }
    } else if (ref.startsWith('series:')) {
      const id = ref.slice(7)
      const s = demoSeries.find((item) => item.id === id)
      if (s) {
        s.genres.forEach((g) => {
          genreScores[g.toLowerCase()] = (genreScores[g.toLowerCase()] ?? 0) + weight
        })
      }
    }
  }

  // Boost genres from watch history (weight +2)
  for (const h of history.slice(0, 10)) {
    if (h.ref.startsWith('movie:')) {
      const m = demoMovies.find((item) => item.id === h.ref.slice(6))
      if (m) {
        m.genres.forEach((g) => {
          genreScores[g.toLowerCase()] = (genreScores[g.toLowerCase()] ?? 0) + 2
        })
      }
    } else if (h.ref.startsWith('series:')) {
      const s = demoSeries.find((item) => item.id === h.ref.slice(7))
      if (s) {
        s.genres.forEach((g) => {
          genreScores[g.toLowerCase()] = (genreScores[g.toLowerCase()] ?? 0) + 2
        })
      }
    }
  }

  // Identify most recent liked or watched title for "Because You Watched"
  let recentSource: { ref: string; title: string; genres: string[] } | null = null
  for (const h of history) {
    if (dislikedSet.has(h.ref) || hiddenSet.has(h.ref)) continue
    if (h.ref.startsWith('movie:')) {
      const m = demoMovies.find((item) => item.id === h.ref.slice(6))
      if (m) {
        recentSource = { ref: h.ref, title: m.title, genres: m.genres.map((g) => g.toLowerCase()) }
        break
      }
    } else if (h.ref.startsWith('series:')) {
      const s = demoSeries.find((item) => item.id === h.ref.slice(7))
      if (s) {
        recentSource = { ref: h.ref, title: s.title, genres: s.genres.map((g) => g.toLowerCase()) }
        break
      }
    }
  }

  // If no history, find highest rated title
  if (!recentSource) {
    for (const [ref, val] of Object.entries(ratings)) {
      if (val === 'strong-like' || val === 'like' || val === 5 || val === 4) {
        if (ref.startsWith('movie:')) {
          const m = demoMovies.find((item) => item.id === ref.slice(6))
          if (m) {
            recentSource = { ref, title: m.title, genres: m.genres.map((g) => g.toLowerCase()) }
            break
          }
        } else if (ref.startsWith('series:')) {
          const s = demoSeries.find((item) => item.id === ref.slice(7))
          if (s) {
            recentSource = { ref, title: s.title, genres: s.genres.map((g) => g.toLowerCase()) }
            break
          }
        }
      }
    }
  }

  // Build candidate pool
  const candidates: RecommendedItem[] = []

  if (demoTitles) {
    // Process demo movies
    for (const m of demoMovies) {
      const ref = movieRef(m.id)
      if (hiddenSet.has(ref) || dislikedSet.has(ref)) continue

      let score = 0
      let reason = 'Popular in your library'

      // Check rating
      const rating = ratings[ref]
      if (rating === 'strong-like' || rating === 5) {
        score += 30
        reason = 'Because you loved this'
      } else if (rating === 'like' || rating === 4) {
        score += 20
        reason = 'Because you liked this'
      }

      // Check watchlist & favourites
      if (watchlist.includes(ref)) {
        score += 15
        reason = 'From your watchlist'
      }
      if (favourites.includes(ref)) {
        score += 18
        reason = 'From your favourites'
      }

      // Check genre affinity
      let matchingGenre = ''
      for (const g of m.genres) {
        const gLow = g.toLowerCase()
        const aff = genreScores[gLow] ?? 0
        if (aff > 0) {
          score += aff * 3
          matchingGenre = g
        }
      }
      if (matchingGenre && score > 0 && !rating && !watchlist.includes(ref)) {
        reason = `Matches your taste in ${matchingGenre}`
      }

      candidates.push({
        ref,
        title: m.title,
        kind: 'movie',
        art: m.art,
        focus: m.focus,
        to: `/movies/${m.id}`,
        meta: `${m.year} · ${m.genres[0]}`,
        score,
        reason,
      })
    }

    // Process demo series
    for (const s of demoSeries) {
      const ref = seriesRef(s.id)
      if (hiddenSet.has(ref) || dislikedSet.has(ref)) continue

      let score = 0
      let reason = 'Critically acclaimed series'

      const rating = ratings[ref]
      if (rating === 'strong-like' || rating === 5) {
        score += 30
        reason = 'Because you loved this'
      } else if (rating === 'like' || rating === 4) {
        score += 20
        reason = 'Because you liked this'
      }

      if (watchlist.includes(ref)) {
        score += 15
        reason = 'From your watchlist'
      }
      if (favourites.includes(ref)) {
        score += 18
        reason = 'From your favourites'
      }

      let matchingGenre = ''
      for (const g of s.genres) {
        const gLow = g.toLowerCase()
        const aff = genreScores[gLow] ?? 0
        if (aff > 0) {
          score += aff * 3
          matchingGenre = g
        }
      }
      if (matchingGenre && score > 0 && !rating && !watchlist.includes(ref)) {
        reason = `Matches your taste in ${matchingGenre}`
      }

      candidates.push({
        ref,
        title: s.title,
        kind: 'series',
        art: s.art,
        focus: s.focus,
        to: `/series/${s.id}`,
        meta: `${s.seasons.length} seasons · ${s.genres[0]}`,
        score,
        reason,
      })
    }
  } else {
    // Real mode (Xtream content)
    for (const m of xtreamMovies) {
      const routeId = `xt:${m.sourceId}:${m.id}`
      const ref = `movie:${routeId}`
      if (hiddenSet.has(ref) || dislikedSet.has(ref)) continue

      let score = 5
      let reason = 'From your provider'

      const rating = ratings[ref]
      if (rating === 'strong-like' || rating === 5) {
        score += 30
        reason = 'Because you loved this'
      } else if (rating === 'like' || rating === 4) {
        score += 20
        reason = 'Because you liked this'
      }

      if (watchlist.includes(ref)) {
        score += 15
        reason = 'From your watchlist'
      }

      candidates.push({
        ref,
        title: m.name,
        kind: 'movie',
        art: '',
        artworkKey: m.artworkKey,
        to: `/movies/${encodeURIComponent(routeId)}`,
        meta: m.year ? `${m.year} · VOD` : 'Provider Movie',
        score,
        reason,
      })
    }

    for (const s of xtreamSeries) {
      const routeId = `xt:${s.sourceId}:${s.id}`
      const ref = `series:${routeId}`
      if (hiddenSet.has(ref) || dislikedSet.has(ref)) continue

      let score = 5
      let reason = 'From your provider'

      const rating = ratings[ref]
      if (rating === 'strong-like' || rating === 5) {
        score += 30
        reason = 'Because you loved this'
      } else if (rating === 'like' || rating === 4) {
        score += 20
        reason = 'Because you liked this'
      }

      if (watchlist.includes(ref)) {
        score += 15
        reason = 'From your watchlist'
      }

      candidates.push({
        ref,
        title: s.name,
        kind: 'series',
        art: '',
        artworkKey: s.artworkKey,
        to: `/series/${encodeURIComponent(routeId)}`,
        meta: s.year ? `${s.year} · Series` : 'Provider Series',
        score,
        reason,
      })
    }
  }

  // Sort candidates by score descending
  candidates.sort((a, b) => b.score - a.score)

  // Generate "Because You Watched" collection
  let becauseYouWatched: { sourceTitle: string; items: RecommendedItem[] } | null = null
  if (recentSource && demoTitles) {
    const targetGenres = new Set(recentSource.genres)
    const related = candidates
      .filter((c) => c.ref !== recentSource!.ref && (Boolean(c.art) || Boolean(c.artworkKey)))
      .map((c) => {
        let matchCount = 0
        if (c.kind === 'movie') {
          const m = demoMovies.find((item) => movieRef(item.id) === c.ref)
          m?.genres.forEach((g) => {
            if (targetGenres.has(g.toLowerCase())) matchCount++
          })
        } else if (c.kind === 'series') {
          const s = demoSeries.find((item) => seriesRef(item.id) === c.ref)
          s?.genres.forEach((g) => {
            if (targetGenres.has(g.toLowerCase())) matchCount++
          })
        }
        return {
          ...c,
          score: matchCount,
          reason: `Similar to ${recentSource!.title}`,
        }
      })
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)

    if (related.length > 0) {
      becauseYouWatched = {
        sourceTitle: recentSource.title,
        items: related,
      }
    }
  }

  // Top in library: items in watchlist or favourites with highest ratings
  const topInLibrary = candidates
    .filter((c) => watchlist.includes(c.ref) || favourites.includes(c.ref) || Boolean(ratings[c.ref]))
    .slice(0, 12)

  // Recommended for you: diverse candidates not yet completed or disliked
  const recommendedForYou = candidates.slice(0, 14)

  return {
    recommendedForYou,
    becauseYouWatched,
    topInLibrary,
  }
}
