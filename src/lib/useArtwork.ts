/**
 * Reactive React hooks for Kinora's unified artwork and metadata enrichment system.
 *
 * Subscribes components to:
 * - artworkEngine updates (when background or on-demand metadata enrichment completes)
 * - custom artwork edits (kinora:custom-artwork-changed)
 * - metadata provider configuration changes (kinora:metadata-config-changed)
 *
 * Also triggers throttled, playback-yielding on-demand enrichment when an enabled provider
 * can supply missing posters, backdrops, or episode stills.
 *
 * Strictly adheres to typography standard: zero em-dashes across all comments and text.
 */

import { useEffect, useMemo, useState } from 'react'
import { artworkEngine } from '../data/artworkEngine'
import { resolveArtwork, type ArtworkResolution, type ResolveArtworkOptions } from './artworkResolver'
import { loadLocalMediaArtwork, inNativeShell } from './native'

export interface UseArtworkOptions extends ResolveArtworkOptions {
  /** Optional local media ID when rendering a scanned local movie, series, or episode. */
  localMediaId?: string | null
  /** Whether to request on-demand external enrichment when artwork is missing or metadata-first is active. */
  autoEnrich?: boolean
}

export function useArtwork(options: UseArtworkOptions): ArtworkResolution {
  const {
    contentId,
    title,
    type,
    providerArt,
    localArt,
    localMediaId,
    imdbId,
    year,
    seasonNumber,
    episodeNumber,
    autoEnrich = true,
  } = options

  const [revision, setRevision] = useState(0)
  const [localDataUri, setLocalDataUri] = useState<string | null>(null)

  // Subscribe to artwork engine, custom artwork, and metadata settings updates
  useEffect(() => {
    const bump = () => setRevision((v) => v + 1)
    const unsubEngine = artworkEngine.subscribeArtwork(bump)
    if (typeof window !== 'undefined') {
      window.addEventListener('kinora:custom-artwork-changed', bump)
      window.addEventListener('kinora:metadata-config-changed', bump)
    }
    return () => {
      unsubEngine()
      if (typeof window !== 'undefined') {
        window.removeEventListener('kinora:custom-artwork-changed', bump)
        window.removeEventListener('kinora:metadata-config-changed', bump)
      }
    }
  }, [])

  // Load validated local sidecar/folder artwork safely via Rust IPC when localMediaId is provided
  useEffect(() => {
    let active = true
    if (!localMediaId) {
      setLocalDataUri(null)
      return
    }
    if (!inNativeShell()) {
      // Browser preview fallback: only use non-filesystem paths (data:, http:, /)
      if (localArt && (localArt.startsWith('data:') || localArt.startsWith('http') || localArt.startsWith('/art/'))) {
        setLocalDataUri(localArt)
      } else {
        setLocalDataUri(null)
      }
      return
    }
    const variant: 'poster' | 'backdrop' | 'still' =
      type.includes('backdrop') ? 'backdrop' : type === 'episode-still' ? 'still' : 'poster'
    void loadLocalMediaArtwork(localMediaId, variant).then((uri) => {
      if (active) setLocalDataUri(uri)
    })
    return () => {
      active = false
    }
  }, [localMediaId, localArt, type])

  const effectiveLocalArt = localMediaId
    ? localDataUri
    : localArt && !localArt.startsWith('/') || (localArt && localArt.startsWith('/art/'))
      ? localArt
      : null

  const resolution = useMemo(
    () =>
      resolveArtwork({
        contentId,
        title,
        type,
        providerArt,
        localArt: effectiveLocalArt,
        imdbId,
        year,
        seasonNumber,
        episodeNumber,
      }),
    // revision triggers recomputation after enrichment or custom override changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contentId, title, type, providerArt, effectiveLocalArt, imdbId, year, seasonNumber, episodeNumber, revision],
  )

  // Request throttled on-demand enrichment if artwork is missing or only fallback/bundled
  useEffect(() => {
    if (!autoEnrich || !title.trim()) return
    const isMovie = type === 'movie-poster' || type === 'movie-backdrop' || type === 'movie-logo'
    const isSeries =
      type === 'series-poster' ||
      type === 'series-backdrop' ||
      type === 'series-logo' ||
      type === 'season-artwork' ||
      type === 'episode-still'
    if (!isMovie && !isSeries) return

    if (resolution.provider === 'fallback' || resolution.provider === 'provider') {
      const id = contentId || `${isMovie ? 'movie' : 'series'}:${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
      artworkEngine.requestEnrichment({
        id,
        title,
        year: typeof year === 'number' ? year : undefined,
        imdbId: imdbId ?? undefined,
        type: isMovie ? 'movie' : 'series',
      })
    }
  }, [autoEnrich, contentId, title, type, year, imdbId, resolution.provider])

  return resolution
}
