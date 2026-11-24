/**
 * Dedicated Genre Artwork Library & Fallback Engine for Kinora.
 *
 * Implements strict 5-stage artwork priority:
 * 1. User-selected genre artwork
 * 2. Verified dedicated genre artwork
 * 3. Verified subgenre artwork
 * 4. Parent genre artwork (inherited)
 * 5. Genre-specific procedural visual fallback
 *
 * Strictly adheres to project typography standards: zero em-dashes across all code and comments.
 */

import {
  getGenreById,
  getParentForSubgenre,
  type ArtworkProvenance,
  type GenreDefinition,
} from './genreTaxonomy'

export interface ResolvedGenreArt {
  url: string
  variant: 'landscape' | 'portrait' | 'banner'
  provenance: ArtworkProvenance
  ambient: {
    primaryHue: number
    secondaryHue: number
    saturation: number
    lightness: number
  }
  cssGradient: string
}

/**
 * Generates an SVG data URI procedural fallback with genre-specific ambient hues.
 * Never displays random movie stills, posters, or channel logos.
 */
export function generateGenreFallbackSvg(
  _name: string,
  primaryHue: number,
  secondaryHue: number,
  saturation = 80,
  lightness = 16,
): string {
  const bg1 = `hsl(${primaryHue}, ${saturation}%, ${Math.max(6, lightness - 8)}%)`
  const bg2 = `hsl(${secondaryHue}, ${saturation}%, ${lightness}%)`
  const acc = `hsl(${primaryHue}, ${saturation}%, ${Math.min(65, lightness + 35)}%)`

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bg1}"/>
        <stop offset="60%" stop-color="${bg2}"/>
        <stop offset="100%" stop-color="#020306"/>
      </linearGradient>
      <radialGradient id="glow" cx="65%" cy="35%" r="60%">
        <stop offset="0%" stop-color="${acc}" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="grid-grad" x1="0%" y1="100%" x2="0%" y2="0%">
        <stop offset="0%" stop-color="${acc}" stop-opacity="0.2"/>
        <stop offset="100%" stop-color="${acc}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="1280" height="720" fill="url(#bg)"/>
    <rect width="1280" height="720" fill="url(#glow)"/>
    <line x1="0" y1="520" x2="1280" y2="520" stroke="url(#grid-grad)" stroke-width="2"/>
    <circle cx="640" cy="340" r="180" stroke="${acc}" stroke-width="2" stroke-dasharray="12,8" fill="none" opacity="0.3"/>
    <circle cx="640" cy="340" r="120" stroke="${acc}" stroke-width="1.5" fill="none" opacity="0.2"/>
  </svg>`

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/**
 * Resolves genre artwork adhering to the strict priority chain and variant sizing.
 */
export function resolveGenreArtwork(
  genreOrId: GenreDefinition | string,
  variant: 'landscape' | 'portrait' | 'banner' = 'landscape',
  userCustomArtwork?: Record<string, { landscape?: string; banner?: string; portrait?: string }>,
): ResolvedGenreArt {
  const genre = typeof genreOrId === 'string' ? getGenreById(genreOrId) : genreOrId

  // Fallback defaults if genre is completely unknown
  if (!genre) {
    const defaultHue1 = 220
    const defaultHue2 = 240
    return {
      url: generateGenreFallbackSvg('Genre', defaultHue1, defaultHue2),
      variant,
      provenance: 'fallback',
      ambient: { primaryHue: defaultHue1, secondaryHue: defaultHue2, saturation: 70, lightness: 15 },
      cssGradient: `linear-gradient(135deg, hsl(${defaultHue1} 70% 12%) 0%, hsl(${defaultHue2} 70% 18%) 100%)`,
    }
  }

  const { ambient } = genre.artwork
  const cssGradient = `radial-gradient(ellipse at 70% 30%, hsl(${ambient.primaryHue} ${ambient.saturation}% ${ambient.lightness + 6}% / 0.6) 0%, hsl(${ambient.secondaryHue} ${ambient.saturation}% ${ambient.lightness - 4}%) 70%, #030407 100%)`

  // Priority 1: User-selected custom genre artwork
  if (userCustomArtwork && userCustomArtwork[genre.id]) {
    const custom = userCustomArtwork[genre.id]
    const customUrl = custom?.[variant] || custom?.landscape || custom?.banner || custom?.portrait
    if (customUrl && customUrl.trim()) {
      return {
        url: customUrl.trim(),
        variant,
        provenance: 'user',
        ambient,
        cssGradient,
      }
    }
  }

  // Priority 2: Verified dedicated genre artwork
  const dedicated = genre.artwork[variant] || genre.artwork.landscape
  if (dedicated && !dedicated.includes('default')) {
    return {
      url: dedicated,
      variant,
      provenance: 'verified',
      ambient,
      cssGradient,
    }
  }

  // Priority 3 & 4: Parent genre artwork (inherited)
  if (genre.parentId) {
    const parent = getParentForSubgenre(genre.id)
    if (parent) {
      // Check user custom on parent first
      if (userCustomArtwork && userCustomArtwork[parent.id]) {
        const parentCustom = userCustomArtwork[parent.id]
        const customUrl = parentCustom?.[variant] || parentCustom?.landscape || parentCustom?.banner
        if (customUrl && customUrl.trim()) {
          return {
            url: customUrl.trim(),
            variant,
            provenance: 'inherited',
            ambient: parent.artwork.ambient,
            cssGradient,
          }
        }
      }

      const parentArt = parent.artwork[variant] || parent.artwork.landscape
      if (parentArt) {
        return {
          url: parentArt,
          variant,
          provenance: 'inherited',
          ambient: parent.artwork.ambient,
          cssGradient,
        }
      }
    }
  }

  // Priority 5: Carefully designed genre-specific visual fallback
  return {
    url: generateGenreFallbackSvg(genre.name, ambient.primaryHue, ambient.secondaryHue, ambient.saturation, ambient.lightness),
    variant,
    provenance: 'fallback',
    ambient,
    cssGradient,
  }
}
