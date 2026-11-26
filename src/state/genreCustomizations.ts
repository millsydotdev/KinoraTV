/**
 * Genre Customizations & Artwork Persistence Store for Kinora.
 *
 * Manages user-configured genre names, custom artwork overrides,
 * enabled/disabled state, discovery visibility, and custom provider mappings.
 * Ensures user-selected artwork takes absolute priority over automatic enrichment.
 * Persists changes across restarts and backups.
 * Strictly adheres to project typography standards: zero em-dashes across all code and comments.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  getGenreById,
  type GenreDefinition,
} from '../data/genreTaxonomy'
import {
  resolveGenreArtwork,
  type ResolvedGenreArt,
} from '../data/genreArtwork'

export interface GenreCustomizationState {
  version: 1
  customArtwork: Record<string, { landscape?: string; portrait?: string; banner?: string }>
  customNames: Record<string, string>
  customAliases: Record<string, string[]>
  disabledGenreIds: string[]
  hiddenGenreIds: string[]
  customProviderMappings: Record<string, string>
  lastRefreshedAt: number | null
}

const STORAGE_KEY = 'kinora.genreCustomizations.v1'

/**
 * Returns true if a cached/persisted genre artwork path points to a legacy demo asset
 * under `/art/` (outside the authoritative `/art/genres/` collection).
 * User uploads (`data:`), external URLs (`https://`), and `/art/genres/` overrides are preserved.
 */
export function isLegacyGenreArtworkPath(url: string | undefined | null): boolean {
  if (!url || typeof url !== 'string') return false
  const trimmed = url.trim()
  if (!trimmed.startsWith('/art/')) return false
  return !trimmed.startsWith('/art/genres/')
}

export function sanitizeCustomGenreArtwork(
  raw: Record<string, { landscape?: string; portrait?: string; banner?: string }> | undefined,
): {
  sanitized: Record<string, { landscape?: string; portrait?: string; banner?: string }>
  migrated: boolean
} {
  if (!raw || typeof raw !== 'object') return { sanitized: {}, migrated: false }
  let migrated = false
  const sanitized: Record<string, { landscape?: string; portrait?: string; banner?: string }> = {}
  for (const [genreId, entry] of Object.entries(raw)) {
    if (!entry || typeof entry !== 'object') continue
    const nextEntry: { landscape?: string; portrait?: string; banner?: string } = {}
    for (const key of ['landscape', 'portrait', 'banner'] as const) {
      const val = entry[key]
      if (!val) continue
      if (isLegacyGenreArtworkPath(val)) {
        migrated = true
      } else {
        nextEntry[key] = val
      }
    }
    if (Object.keys(nextEntry).length > 0) {
      sanitized[genreId] = nextEntry
    } else if (Object.keys(entry).length > 0) {
      migrated = true
    }
  }
  return { sanitized, migrated }
}

export const initialGenreCustomizations: GenreCustomizationState = {
  version: 1,
  customArtwork: {},
  customNames: {},
  customAliases: {},
  disabledGenreIds: [],
  hiddenGenreIds: [],
  customProviderMappings: {},
  lastRefreshedAt: null,
}

export function loadSavedCustomizations(): GenreCustomizationState {
  if (typeof window === 'undefined') return initialGenreCustomizations
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return initialGenreCustomizations
    const parsed = JSON.parse(raw) as Partial<GenreCustomizationState>
    const { sanitized, migrated } = sanitizeCustomGenreArtwork(parsed.customArtwork)
    const state: GenreCustomizationState = {
      version: 1,
      customArtwork: sanitized,
      customNames: parsed.customNames && typeof parsed.customNames === 'object' ? parsed.customNames : {},
      customAliases: parsed.customAliases && typeof parsed.customAliases === 'object' ? parsed.customAliases : {},
      disabledGenreIds: Array.isArray(parsed.disabledGenreIds) ? parsed.disabledGenreIds : [],
      hiddenGenreIds: Array.isArray(parsed.hiddenGenreIds) ? parsed.hiddenGenreIds : [],
      customProviderMappings: parsed.customProviderMappings && typeof parsed.customProviderMappings === 'object' ? parsed.customProviderMappings : {},
      lastRefreshedAt: typeof parsed.lastRefreshedAt === 'number' ? parsed.lastRefreshedAt : null,
    }
    if (migrated) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      } catch {
        // Ignore storage write failure during migration
      }
    }
    return state
  } catch {
    return initialGenreCustomizations
  }
}

export function saveGenreCustomizations(state: GenreCustomizationState): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    window.dispatchEvent(new CustomEvent('kinora:genre-customizations-changed', { detail: state }))
  } catch {}
}

export function useGenreCustomizations() {
  const [state, setState] = useState<GenreCustomizationState>(loadSavedCustomizations)

  useEffect(() => {
    const onSync = (ev: Event) => {
      const customEv = ev as CustomEvent<GenreCustomizationState>
      if (customEv.detail) {
        setState(customEv.detail)
      } else {
        setState(loadSavedCustomizations())
      }
    }
    window.addEventListener('kinora:genre-customizations-changed', onSync)
    window.addEventListener('storage', onSync)
    return () => {
      window.removeEventListener('kinora:genre-customizations-changed', onSync)
      window.removeEventListener('storage', onSync)
    }
  }, [])

  const updateState = useCallback((updater: (prev: GenreCustomizationState) => GenreCustomizationState) => {
    setState((prev) => {
      const next = updater(prev)
      saveGenreCustomizations(next)
      return next
    })
  }, [])

  const setCustomArtwork = useCallback((
    genreId: string,
    variants: { landscape?: string; portrait?: string; banner?: string },
  ) => {
    updateState((prev) => ({
      ...prev,
      customArtwork: {
        ...prev.customArtwork,
        [genreId]: {
          ...(prev.customArtwork[genreId] || {}),
          ...variants,
        },
      },
    }))
  }, [updateState])

  const setCustomName = useCallback((genreId: string, name: string) => {
    updateState((prev) => {
      const nextNames = { ...prev.customNames }
      if (!name || !name.trim() || (getGenreById(genreId)?.name === name.trim())) {
        delete nextNames[genreId]
      } else {
        nextNames[genreId] = name.trim()
      }
      return { ...prev, customNames: nextNames }
    })
  }, [updateState])

  const setCustomAliases = useCallback((genreId: string, aliases: string[]) => {
    updateState((prev) => ({
      ...prev,
      customAliases: {
        ...prev.customAliases,
        [genreId]: aliases.map((a) => a.trim()).filter(Boolean),
      },
    }))
  }, [updateState])

  const toggleGenreDisabled = useCallback((genreId: string) => {
    updateState((prev) => {
      const exists = prev.disabledGenreIds.includes(genreId)
      return {
        ...prev,
        disabledGenreIds: exists
          ? prev.disabledGenreIds.filter((id) => id !== genreId)
          : [...prev.disabledGenreIds, genreId],
      }
    })
  }, [updateState])

  const toggleGenreHidden = useCallback((genreId: string) => {
    updateState((prev) => {
      const exists = prev.hiddenGenreIds.includes(genreId)
      return {
        ...prev,
        hiddenGenreIds: exists
          ? prev.hiddenGenreIds.filter((id) => id !== genreId)
          : [...prev.hiddenGenreIds, genreId],
      }
    })
  }, [updateState])

  const setProviderMapping = useCallback((rawProviderString: string, canonicalGenreId: string) => {
    updateState((prev) => ({
      ...prev,
      customProviderMappings: {
        ...prev.customProviderMappings,
        [rawProviderString.trim().toLowerCase()]: canonicalGenreId,
      },
    }))
  }, [updateState])

  const removeProviderMapping = useCallback((rawProviderString: string) => {
    updateState((prev) => {
      const nextMappings = { ...prev.customProviderMappings }
      delete nextMappings[rawProviderString.trim().toLowerCase()]
      return { ...prev, customProviderMappings: nextMappings }
    })
  }, [updateState])

  const refreshMetadataAndArtwork = useCallback(async () => {
    const now = Date.now()
    updateState((prev) => ({ ...prev, lastRefreshedAt: now }))
    window.dispatchEvent(new CustomEvent('kinora:genre-metadata-refreshed', { detail: { timestamp: now } }))
  }, [updateState])

  const resetCustomizations = useCallback(() => {
    setState(initialGenreCustomizations)
    saveGenreCustomizations(initialGenreCustomizations)
  }, [])

  const isGenreEnabled = useCallback((genreId: string): boolean => {
    return !state.disabledGenreIds.includes(genreId)
  }, [state.disabledGenreIds])

  const isGenreVisible = useCallback((genreId: string): boolean => {
    return isGenreEnabled(genreId) && !state.hiddenGenreIds.includes(genreId)
  }, [isGenreEnabled, state.hiddenGenreIds])

  const getEffectiveGenreName = useCallback((genre: GenreDefinition): string => {
    return state.customNames[genre.id] || genre.name
  }, [state.customNames])

  const resolveArtwork = useCallback((
    genreOrId: GenreDefinition | string,
    variant: 'landscape' | 'portrait' | 'banner' = 'landscape',
  ): ResolvedGenreArt => {
    return resolveGenreArtwork(genreOrId, variant, state.customArtwork)
  }, [state.customArtwork])

  return {
    customizations: state,
    setCustomArtwork,
    setCustomName,
    setCustomAliases,
    toggleGenreDisabled,
    toggleGenreHidden,
    setProviderMapping,
    removeProviderMapping,
    refreshMetadataAndArtwork,
    resetCustomizations,
    isGenreEnabled,
    isGenreVisible,
    getEffectiveGenreName,
    resolveArtwork,
  }
}
