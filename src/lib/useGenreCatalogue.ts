/**
 * Unified Genre Catalogue & Media Indexing Hook for Kinora.
 *
 * Scans available movies, series, live TV channels, and audio resources
 * across configured sources and builds an efficient inverted index of
 * canonical genre and subgenre associations.
 * Strictly adheres to project typography standards: zero em-dashes across all code and comments.
 */

import { useMemo } from 'react'
import { useStore } from '../state/store'
import { movies, series } from '../data/catalog'
import { OPEN_MOVIES, OPEN_SERIES } from '../data/openCatalogue'
import {
  CANONICAL_GENRES,
  getGenreById,
  type MediaType,
} from '../data/genreTaxonomy'
import {
  classifyMovie,
  classifySeries,
  classifyChannel,
  classifyAudioResource,
} from './genreClassifier'
import { useGenreCustomizations } from '../state/genreCustomizations'

export interface GenreMediaEntry {
  id: string
  ref: string
  title: string
  mediaType: MediaType
  year?: number | string
  posterUrl?: string | null
  backdropUrl?: string | null
  overview?: string
  genres: string[]
  canonicalGenreIds: string[]
  subgenreIds: string[]
  rating?: string | number | null
  channelId?: string
  streamUrl?: string | null
  itemRef: string
}

export interface GenreCatalogueIndex {
  entriesByGenre: Map<string, GenreMediaEntry[]>
  entriesBySubgenre: Map<string, GenreMediaEntry[]>
  countsByGenre: Map<string, number>
  countsBySubgenre: Map<string, number>
  allEntries: GenreMediaEntry[]
  getEntriesForGenre: (
    genreId: string,
    subgenreId?: string | null,
    mediaType?: MediaType | 'all',
  ) => GenreMediaEntry[]
}

export function useGenreCatalogue(): GenreCatalogueIndex {
  const store = useStore()
  const { customizations } = useGenreCustomizations()
  const { customProviderMappings } = customizations

  return useMemo(() => {
    const allEntries: GenreMediaEntry[] = []
    const entriesByGenre = new Map<string, GenreMediaEntry[]>()
    const entriesBySubgenre = new Map<string, GenreMediaEntry[]>()
    const countsByGenre = new Map<string, number>()
    const countsBySubgenre = new Map<string, number>()

    for (const g of CANONICAL_GENRES) {
      entriesByGenre.set(g.id, [])
      entriesBySubgenre.set(g.id, [])
    }

    // 1. Process Movie Titles (Demo, Open Catalogue, and Xtream VOD)
    const standardMovies = [
      ...(store.demoTitles ? movies : []),
      ...OPEN_MOVIES,
    ]

    for (const m of standardMovies) {
      const classified = classifyMovie(m, customProviderMappings)
      const canonicalIds = classified.canonicalGenres.map((g) => g.id)
      const subIds = classified.subgenres.map((g) => g.id)
      const entry: GenreMediaEntry = {
        id: m.id,
        ref: `movie:${m.id}`,
        title: m.title,
        mediaType: 'movies',
        year: m.year,
        posterUrl: m.posterUrl || m.art,
        backdropUrl: m.backdropUrl || m.art,
        overview: m.synopsis,
        genres: classified.canonicalGenres.map((g) => g.name),
        canonicalGenreIds: canonicalIds,
        subgenreIds: subIds,
        itemRef: `movie:${m.id}`,
      }
      allEntries.push(entry)

      for (const gid of canonicalIds) {
        entriesByGenre.get(gid)?.push(entry)
      }
      for (const sid of subIds) {
        entriesBySubgenre.get(sid)?.push(entry)
      }
    }

    for (const m of (store.xtreamCatalogue?.movies || [])) {
      const classified = classifyMovie(
        {
          title: m.name,
          categoryName: m.categoryName ?? undefined,
          genres: m.categoryName ? [m.categoryName] : [],
        },
        customProviderMappings,
      )
      const canonicalIds = classified.canonicalGenres.map((g) => g.id)
      const subIds = classified.subgenres.map((g) => g.id)
      const entry: GenreMediaEntry = {
        id: m.id,
        ref: `xtream:movie:${m.id}`,
        title: m.name,
        mediaType: 'movies',
        year: m.year ?? undefined,
        overview: m.plot ?? undefined,
        genres: classified.canonicalGenres.map((g) => g.name),
        canonicalGenreIds: canonicalIds,
        subgenreIds: subIds,
        rating: m.rating ?? undefined,
        itemRef: `xtream:movie:${m.id}`,
      }
      allEntries.push(entry)

      for (const gid of canonicalIds) {
        entriesByGenre.get(gid)?.push(entry)
      }
      for (const sid of subIds) {
        entriesBySubgenre.get(sid)?.push(entry)
      }
    }

    // 2. Process TV Series
    const standardSeries = [
      ...(store.demoTitles ? series : []),
      ...OPEN_SERIES,
    ]

    for (const s of standardSeries) {
      const classified = classifySeries(s, customProviderMappings)
      const canonicalIds = classified.canonicalGenres.map((g) => g.id)
      const subIds = classified.subgenres.map((g) => g.id)
      const entry: GenreMediaEntry = {
        id: s.id,
        ref: `series:${s.id}`,
        title: s.title,
        mediaType: 'series',
        year: s.years,
        posterUrl: s.posterUrl || s.art,
        backdropUrl: s.backdropUrl || s.art,
        overview: s.synopsis,
        genres: classified.canonicalGenres.map((g) => g.name),
        canonicalGenreIds: canonicalIds,
        subgenreIds: subIds,
        itemRef: `series:${s.id}`,
      }
      allEntries.push(entry)

      for (const gid of canonicalIds) {
        entriesByGenre.get(gid)?.push(entry)
      }
      for (const sid of subIds) {
        entriesBySubgenre.get(sid)?.push(entry)
      }
    }

    for (const s of (store.xtreamCatalogue?.series || [])) {
      const classified = classifySeries(
        {
          title: s.name,
          categoryName: s.categoryName ?? undefined,
          genres: s.categoryName ? [s.categoryName] : [],
        },
        customProviderMappings,
      )
      const canonicalIds = classified.canonicalGenres.map((g) => g.id)
      const subIds = classified.subgenres.map((g) => g.id)
      const entry: GenreMediaEntry = {
        id: s.id,
        ref: `xtream:series:${s.id}`,
        title: s.name,
        mediaType: 'series',
        year: s.year ?? undefined,
        overview: s.plot ?? undefined,
        genres: classified.canonicalGenres.map((g) => g.name),
        canonicalGenreIds: canonicalIds,
        subgenreIds: subIds,
        rating: s.rating ?? undefined,
        itemRef: `xtream:series:${s.id}`,
      }
      allEntries.push(entry)

      for (const gid of canonicalIds) {
        entriesByGenre.get(gid)?.push(entry)
      }
      for (const sid of subIds) {
        entriesBySubgenre.get(sid)?.push(entry)
      }
    }

    // 3. Process Live TV Channels
    for (const ch of store.channels) {
      const classified = classifyChannel(ch, customProviderMappings)
      const canonicalIds = classified.canonicalGenres.map((g) => g.id)
      const subIds = classified.subgenres.map((g) => g.id)
      const entry: GenreMediaEntry = {
        id: ch.id,
        ref: `channel:${ch.id}`,
        title: ch.name,
        mediaType: 'live',
        posterUrl: ch.logoUrl,
        backdropUrl: ch.logoUrl,
        genres: classified.canonicalGenres.map((g) => g.name),
        canonicalGenreIds: canonicalIds,
        subgenreIds: subIds,
        channelId: ch.id,
        streamUrl: ch.streamUrl,
        itemRef: `channel:${ch.id}`,
      }
      allEntries.push(entry)

      for (const gid of canonicalIds) {
        entriesByGenre.get(gid)?.push(entry)
      }
      for (const sid of subIds) {
        entriesBySubgenre.get(sid)?.push(entry)
      }
    }

    // 4. Process Personal Audio Resources
    for (const r of store.mediaLibrary.allResources) {
      const classified = classifyAudioResource(r, customProviderMappings)
      const canonicalIds = classified.canonicalGenres.map((g) => g.id)
      const subIds = classified.subgenres.map((g) => g.id)
      const entry: GenreMediaEntry = {
        id: r.id,
        ref: `res:${r.id}`,
        title: r.name,
        mediaType: 'audio',
        posterUrl: r.artworkUrl,
        backdropUrl: r.artworkUrl,
        genres: classified.canonicalGenres.map((g) => g.name),
        canonicalGenreIds: canonicalIds,
        subgenreIds: subIds,
        itemRef: `res:${r.id}`,
      }
      allEntries.push(entry)

      for (const gid of canonicalIds) {
        entriesByGenre.get(gid)?.push(entry)
      }
      for (const sid of subIds) {
        entriesBySubgenre.get(sid)?.push(entry)
      }
    }

    // Compute counts
    for (const [gid, list] of entriesByGenre.entries()) {
      countsByGenre.set(gid, list.length)
    }
    for (const [sid, list] of entriesBySubgenre.entries()) {
      countsBySubgenre.set(sid, list.length)
    }

    const getEntriesForGenre = (
      genreId: string,
      subgenreId?: string | null,
      mediaType: MediaType | 'all' = 'all',
    ): GenreMediaEntry[] => {
      let results: GenreMediaEntry[] = []

      if (subgenreId) {
        results = entriesBySubgenre.get(subgenreId) || []
      } else {
        const parentList = entriesByGenre.get(genreId) || []
        // Also include items belonging to any subgenre of this parent
        const subgenreIds = getGenreById(genreId)?.subgenreIds || []
        const combined = new Map<string, GenreMediaEntry>()
        for (const it of parentList) combined.set(it.id, it)
        for (const subId of subgenreIds) {
          const subItems = entriesBySubgenre.get(subId) || []
          for (const it of subItems) combined.set(it.id, it)
        }
        results = Array.from(combined.values())
      }

      if (mediaType !== 'all') {
        results = results.filter((it) => it.mediaType === mediaType)
      }

      return results
    }

    return {
      entriesByGenre,
      entriesBySubgenre,
      countsByGenre,
      countsBySubgenre,
      allEntries,
      getEntriesForGenre,
    }
  }, [store.demoTitles, store.xtreamCatalogue.movies, store.xtreamCatalogue.series, store.channels, store.mediaLibrary.allResources, customProviderMappings])
}
