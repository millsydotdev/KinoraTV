import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { GENRE_ARTWORK, DEFAULT_GENRE_ARTWORK, matchGenreArtwork } from './genre-art'

describe('genre-art', () => {
  it('every mapped asset file exists on disk in public/art/', () => {
    const publicDir = path.resolve(process.cwd(), 'public')
    for (const [genre, relativePath] of Object.entries(GENRE_ARTWORK)) {
      const diskPath = path.join(publicDir, relativePath)
      expect(fs.existsSync(diskPath), `Asset for ${genre} (${relativePath}) must exist on disk`).toBe(true)
    }
  })

  it('neutral default asset exists on disk', () => {
    const diskPath = path.resolve(process.cwd(), 'public', DEFAULT_GENRE_ARTWORK.replace(/^\//, ''))
    expect(fs.existsSync(diskPath)).toBe(true)
  })

  it('matches sport categories accurately', () => {
    expect(matchGenreArtwork('Sport')).toBe(GENRE_ARTWORK.sport)
    expect(matchGenreArtwork('Sports')).toBe(GENRE_ARTWORK.sport)
    expect(matchGenreArtwork('Live Football')).toBe(GENRE_ARTWORK.sport)
    expect(matchGenreArtwork('motorsport')).toBe(GENRE_ARTWORK.sport)
    expect(matchGenreArtwork('Formula 1')).toBe(GENRE_ARTWORK.sport)
  })

  it('matches news and current affairs', () => {
    expect(matchGenreArtwork('News')).toBe(GENRE_ARTWORK.news)
    expect(matchGenreArtwork('News & Weather')).toBe(GENRE_ARTWORK.news)
    expect(matchGenreArtwork('Current affairs')).toBe(GENRE_ARTWORK.news)
    expect(matchGenreArtwork('Politics')).toBe(GENRE_ARTWORK.news)
    expect(matchGenreArtwork('Financial Bulletin')).toBe(GENRE_ARTWORK.news)
  })

  it('matches kids and animation', () => {
    expect(matchGenreArtwork('Kids')).toBe(GENRE_ARTWORK.kids)
    expect(matchGenreArtwork('Children')).toBe(GENRE_ARTWORK.kids)
    expect(matchGenreArtwork('Cartoon')).toBe(GENRE_ARTWORK.kids)
    expect(matchGenreArtwork('Animation')).toBe(GENRE_ARTWORK.kids)
  })

  it('matches entertainment, quiz, comedy', () => {
    expect(matchGenreArtwork('Entertainment')).toBe(GENRE_ARTWORK.entertainment)
    expect(matchGenreArtwork('Quiz')).toBe(GENRE_ARTWORK.entertainment)
    expect(matchGenreArtwork('Comedy')).toBe(GENRE_ARTWORK.entertainment)
    expect(matchGenreArtwork('Sitcom')).toBe(GENRE_ARTWORK.entertainment)
    expect(matchGenreArtwork('Game show')).toBe(GENRE_ARTWORK.entertainment)
  })

  it('matches movie and drama categories', () => {
    expect(matchGenreArtwork('Movie')).toBe(GENRE_ARTWORK.movie)
    expect(matchGenreArtwork('Film / Cinema')).toBe(GENRE_ARTWORK.movie)
    expect(matchGenreArtwork('Drama')).toBe(GENRE_ARTWORK.drama)
    expect(matchGenreArtwork('Crime Drama')).toBe(GENRE_ARTWORK.drama)
    expect(matchGenreArtwork('Mystery')).toBe(GENRE_ARTWORK.drama)
  })

  it('falls back to neutral default for unmapped or empty categories', () => {
    expect(matchGenreArtwork(null)).toBe(DEFAULT_GENRE_ARTWORK)
    expect(matchGenreArtwork(undefined)).toBe(DEFAULT_GENRE_ARTWORK)
    expect(matchGenreArtwork('')).toBe(DEFAULT_GENRE_ARTWORK)
    expect(matchGenreArtwork('   ')).toBe(DEFAULT_GENRE_ARTWORK)
    expect(matchGenreArtwork('UnmappedCategoryxyz')).toBe(DEFAULT_GENRE_ARTWORK)
  })
})
