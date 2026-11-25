// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  CANONICAL_GENRES,
  PARENT_GENRES,
  SUBGENRES,
  GENRES_BY_MEDIA_TYPE,
  getGenreById,
  getSubgenresForParent,
  getParentForSubgenre,
  getRelatedGenres,
} from '../data/genreTaxonomy'
import {
  resolveGenreArtwork,
  generateGenreFallbackSvg,
} from '../data/genreArtwork'
import {
  classifyGenre,
  classifyMedia,
} from './genreClassifier'
import {
  loadSavedCustomizations,
  saveGenreCustomizations,
  initialGenreCustomizations,
} from '../state/genreCustomizations'

describe('Canonical Genre Taxonomy & Hierarchy Suite', () => {
  it('defines comprehensive canonical parent genres covering all supported media formats', () => {
    expect(CANONICAL_GENRES.length).toBeGreaterThanOrEqual(80)
    expect(SUBGENRES.length).toBeGreaterThanOrEqual(50)
    expect(PARENT_GENRES.length).toBeGreaterThanOrEqual(25)

    const parentIds = PARENT_GENRES.map((g) => g.id)
    expect(parentIds).toContain('action')
    expect(parentIds).toContain('comedy')
    expect(parentIds).toContain('crime')
    expect(parentIds).toContain('documentary')
    expect(parentIds).toContain('drama')
    expect(parentIds).toContain('horror')
    expect(parentIds).toContain('science-fiction')
    expect(parentIds).toContain('thriller')
    expect(parentIds).toContain('western')
    expect(parentIds).toContain('musical')
    expect(parentIds).toContain('live-news')
    expect(parentIds).toContain('live-sports')
  })

  it('provides media-type restricted genre subsets without forcing invalid genres', () => {
    const movieGenres = GENRES_BY_MEDIA_TYPE.movies
    const audioGenres = GENRES_BY_MEDIA_TYPE.audio
    const bookGenres = GENRES_BY_MEDIA_TYPE.books

    expect(movieGenres.some((g) => g.id === 'science-fiction')).toBe(true)
    expect(movieGenres.some((g) => g.id === 'audio-rock')).toBe(false)

    expect(audioGenres.some((g) => g.id === 'audio-rock')).toBe(true)
    expect(audioGenres.some((g) => g.id === 'audio-jazz')).toBe(true)
    expect(audioGenres.some((g) => g.id === 'audio-classical')).toBe(true)

    expect(bookGenres.some((g) => g.id === 'books-fiction')).toBe(true)
  })

  it('maintains strict bidirectional parent-child subgenre relationships', () => {
    const sciFi = getGenreById('science-fiction')
    expect(sciFi).toBeDefined()
    expect(sciFi?.subgenreIds.length).toBeGreaterThan(0)

    const subgenres = getSubgenresForParent('science-fiction')
    expect(subgenres.length).toBe(sciFi?.subgenreIds.length)

    for (const sub of subgenres) {
      expect(sub.parentId).toBe('science-fiction')
      const parent = getParentForSubgenre(sub.id)
      expect(parent?.id).toBe('science-fiction')
    }
  })

  it('supplies related genres and international translations for localization', () => {
    const crime = getGenreById('crime')
    expect(crime).toBeDefined()
    expect(crime?.internationalNames.fr).toBe('Policier / Crime')
    expect(crime?.internationalNames.es).toBe('Crimen')
    expect(crime?.internationalNames.de).toBe('Krimi')

    const related = getRelatedGenres('crime')
    expect(related.some((g) => g.id === 'thriller' || g.id === 'mystery')).toBe(true)
  })
})

describe('Genre Artwork Engine & Strict Fallback Priority', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('resolves verified dedicated landscape, portrait, and banner artwork', () => {
    const resolved = resolveGenreArtwork('horror', 'landscape')
    expect(resolved.provenance).toBe('verified')
    expect(resolved.url).toBe('/art/genres/horror.jpg')
    expect(resolved.variant).toBe('landscape')
    expect(resolved.ambient.primaryHue).toBe(350)
  })

  it('inherits parent artwork for subgenres that do not have dedicated individual assets', () => {
    const subgenreId = 'scifi-space-opera'
    const resolved = resolveGenreArtwork(subgenreId, 'landscape')

    expect(resolved.provenance).toBe('verified')
    expect(resolved.url).toBe('/art/genres/science-fiction.jpg')
    expect(resolved.ambient.primaryHue).toBe(200)
  })

  it('generates procedural ambient SVG fallback for unknown genres', () => {
    const fallbackSvg = generateGenreFallbackSvg('Experimental Avant-Garde', 260, 290)
    expect(fallbackSvg).toContain('%3Csvg')
    expect(fallbackSvg).toContain('data:image/svg+xml;utf8,')
  })

  it('prioritizes user-selected custom artwork overrides above all automatic enrichment', () => {
    const userCustom = {
      comedy: { landscape: 'https://images.example.com/custom-comedy.jpg' },
    }
    const custom = resolveGenreArtwork('comedy', 'landscape', userCustom)

    expect(custom.provenance).toBe('user')
    expect(custom.url).toBe('https://images.example.com/custom-comedy.jpg')

    // Without user custom artwork, reverts cleanly to verified
    const reverted = resolveGenreArtwork('comedy', 'landscape')
    expect(reverted.provenance).toBe('verified')
    expect(reverted.url).toBe('/art/genres/comedy.jpg')
  })
})

describe('Real Media Normalization & Classification Layer', () => {
  it('maps common provider terminology with high confidence', () => {
    const resSciFi = classifyGenre('Sci-Fi & Fantasy')
    expect(resSciFi.canonical?.id).toBe('science-fiction')
    expect(resSciFi.confidence).toBeGreaterThanOrEqual(0.8)

    const resPolice = classifyGenre('Police Procedural')
    expect(resPolice.canonical?.id).toBe('crime-procedural')

    const resKids = classifyGenre('Animation')
    expect(resKids.canonical?.id).toBe('animation')
  })

  it('preserves unknown categories without fabricating false genre assignments', () => {
    const unknown = classifyGenre('Obscure XZ99-Unclassified Category')
    expect(unknown.canonical).toBeNull()
    expect(unknown.confidence).toBe(0)
  })

  it('classifies media items from categories list', () => {
    const classified = classifyMedia(['Space Opera', 'Science Fiction', 'Cinema'])

    expect(classified.canonicalGenres.some((g) => g.id === 'science-fiction')).toBe(true)
    expect(classified.overallConfidence).toBeGreaterThanOrEqual(0.8)
  })
})

describe('Genre Customizations & Persistence Suite', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('persists custom aliases, visibility toggles, and provider category mappings', () => {
    saveGenreCustomizations({
      ...initialGenreCustomizations,
      customAliases: {
        thriller: ['Psychological Tension', 'Nerve-Wracker'],
      },
      hiddenGenreIds: ['western'],
      customProviderMappings: {
        'gangland-specials': 'crime',
      },
    })

    const config = loadSavedCustomizations()
    expect(config.customAliases['thriller']).toContain('Psychological Tension')
    expect(config.hiddenGenreIds).toContain('western')
    expect(config.customProviderMappings['gangland-specials']).toBe('crime')
  })

  it('resets all customizations cleanly back to factory canonical state', () => {
    saveGenreCustomizations({
      ...initialGenreCustomizations,
      customArtwork: {
        action: { landscape: 'https://example.com/test.jpg' },
      },
      hiddenGenreIds: ['horror'],
    })
    expect(loadSavedCustomizations().hiddenGenreIds).toContain('horror')

    saveGenreCustomizations(initialGenreCustomizations)
    const clean = loadSavedCustomizations()
    expect(clean.hiddenGenreIds.length).toBe(0)
    expect(Object.keys(clean.customArtwork).length).toBe(0)
  })
})
