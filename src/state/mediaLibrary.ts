import { useCallback, useEffect, useMemo, useState } from 'react'
import { isTauri, testSourceConnection } from '../lib/native'
import { DISCOVERED_RESOURCES } from '../data/discoveredResources'
import type { MediaResource, PersonalMediaLibraryState, PersonalResourceItem, VerificationStatus } from '../data/personalLibrary'
import { initialPersonalLibraryState } from '../data/personalLibrary'

const STORAGE_KEY = 'kinora.personalMediaLibrary.v1'

function getPersonalLibraryStorageKey(profileId: string): string {
  return profileId === 'default' ? STORAGE_KEY : `${STORAGE_KEY}.${profileId}`
}

function loadPersonalLibrary(profileId: string): PersonalMediaLibraryState {
  const key = getPersonalLibraryStorageKey(profileId)
  try {
    const saved = localStorage.getItem(key)
    if (saved) {
      const parsed = JSON.parse(saved) as PersonalMediaLibraryState
      if (parsed && parsed.version === 1 && typeof parsed.items === 'object') return parsed
    }
  } catch {
    // Storage unavailable or corrupted: fallback to empty initial state
  }
  return initialPersonalLibraryState
}

export interface AudioTrackState {
  id: string
  name: string
  provider: string
  streamUrl: string
  artworkUrl?: string
  accentHue?: number
  mediaType?: 'radio' | 'podcast' | 'audiobook' | 'music' | 'stream'
  lyrics?: string
}

function getQueueStorageKey(profileId: string): string {
  return profileId === 'default' ? 'kinora.audio_queue.v1' : `kinora.audio_queue.v1.${profileId}`
}

function getRecentStationsStorageKey(profileId: string): string {
  return profileId === 'default' ? 'kinora.recently_played_stations.v1' : `kinora.recently_played_stations.v1.${profileId}`
}

function loadAudioQueue(profileId: string): AudioTrackState[] {
  try {
    const raw = localStorage.getItem(getQueueStorageKey(profileId))
    if (raw) return JSON.parse(raw) as AudioTrackState[]
  } catch {}
  return []
}

function loadRecentStations(profileId: string): AudioTrackState[] {
  try {
    const raw = localStorage.getItem(getRecentStationsStorageKey(profileId))
    if (raw) return JSON.parse(raw) as AudioTrackState[]
  } catch {}
  return []
}

export function usePersonalMediaLibrary(profileId = 'default') {
  const [libraryState, setLibraryState] = useState<PersonalMediaLibraryState>(() => loadPersonalLibrary(profileId))

  // Reload when profileId changes
  useEffect(() => {
    setLibraryState(loadPersonalLibrary(profileId))
  }, [profileId])

  // Synchronize to localStorage
  useEffect(() => {
    try {
      const key = getPersonalLibraryStorageKey(profileId)
      localStorage.setItem(key, JSON.stringify(libraryState))
    } catch {
      // Storage full or private mode
    }
  }, [libraryState, profileId])

  // Real-time verification status cache (in-memory per session)
  const [verificationOverrides, setVerificationOverrides] = useState<Record<string, { status: VerificationStatus; lastVerified: string; notes?: string }>>({})

  // Audio playback state
  const [currentAudio, setCurrentAudio] = useState<AudioTrackState | null>(null)
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)
  const [audioVolume, setAudioVolume] = useState(0.8)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [audioQueue, setAudioQueue] = useState<AudioTrackState[]>(() => loadAudioQueue(profileId))
  const [recentlyPlayedStations, setRecentlyPlayedStations] = useState<AudioTrackState[]>(() => loadRecentStations(profileId))

  useEffect(() => {
    setAudioQueue(loadAudioQueue(profileId))
    setRecentlyPlayedStations(loadRecentStations(profileId))
  }, [profileId])

  useEffect(() => {
    try {
      localStorage.setItem(getQueueStorageKey(profileId), JSON.stringify(audioQueue))
    } catch {}
  }, [audioQueue, profileId])

  useEffect(() => {
    try {
      localStorage.setItem(getRecentStationsStorageKey(profileId), JSON.stringify(recentlyPlayedStations))
    } catch {}
  }, [recentlyPlayedStations, profileId])
  const [sleepTimerRemaining, setSleepTimerRemaining] = useState<number | null>(null)

  const stopAudio = useCallback(() => {
    setIsAudioPlaying(false)
    setCurrentAudio(null)
    setAudioError(null)
  }, [])

  useEffect(() => {
    if (sleepTimerRemaining === null || sleepTimerRemaining <= 0) return
    const interval = window.setInterval(() => {
      setSleepTimerRemaining((prev) => {
        if (prev === null || prev <= 1) {
          stopAudio()
          return null
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [sleepTimerRemaining, stopAudio])

  const setSleepTimer = useCallback((minutes: number | null) => {
    if (minutes === null) {
      setSleepTimerRemaining(null)
    } else {
      setSleepTimerRemaining(minutes * 60)
    }
  }, [])

  const addToQueue = useCallback((track: AudioTrackState) => {
    setAudioQueue((prev) => [...prev, track])
  }, [])

  const removeFromQueue = useCallback((index: number) => {
    setAudioQueue((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const clearQueue = useCallback(() => {
    setAudioQueue([])
  }, [])

  const updateAudioLyrics = useCallback((lyrics: string) => {
    setCurrentAudio((prev) => (prev ? { ...prev, lyrics } : null))
  }, [])

  const playAudio = useCallback((track: AudioTrackState) => {
    setCurrentAudio(track)
    setIsAudioPlaying(true)
    setAudioError(null)
    setRecentlyPlayedStations((prev) => [track, ...prev.filter((t) => t.id !== track.id)].slice(0, 10))
  }, [])

  const playNextInQueue = useCallback(() => {
    setAudioQueue((prev) => {
      if (prev.length === 0) return prev
      const [nextTrack, ...rest] = prev
      if (nextTrack) {
        playAudio(nextTrack)
      }
      return rest
    })
  }, [playAudio])

  const toggleAudioPlay = useCallback(() => {
    setIsAudioPlaying((prev) => !prev)
  }, [])

  // Merged view of all available resources (discovered + custom user additions)
  const allResources = useMemo(() => {
    const list: MediaResource[] = [...DISCOVERED_RESOURCES]
    for (const custom of Object.values(libraryState.customResources)) {
      if (!list.some((r) => r.id === custom.id)) {
        list.push(custom)
      }
    }
    // Apply runtime verification overrides if any
    return list.map((res) => {
      const override = verificationOverrides[res.id]
      if (override) {
        return {
          ...res,
          verificationStatus: override.status,
          lastVerified: override.lastVerified,
          compatibilityNotes: override.notes ? `${res.compatibilityNotes ?? ''} (Recent check: ${override.notes})` : res.compatibilityNotes,
        }
      }
      return res
    })
  }, [libraryState.customResources, verificationOverrides])

  // Resolve personal library items with full resource details
  const mySources = useMemo(() => {
    return Object.values(libraryState.items).map((item) => {
      const resource = allResources.find((r) => r.id === item.resourceId) ?? item.customResource
      return {
        ...item,
        resource,
      }
    }).filter((item): item is PersonalResourceItem & { resource: MediaResource } => !!item.resource)
  }, [libraryState.items, allResources])

  const isInPersonalLibrary = useCallback((resourceId: string): boolean => {
    return !!libraryState.items[resourceId]
  }, [libraryState.items])

  const isResourceFavourite = useCallback((resourceId: string): boolean => {
    return !!libraryState.items[resourceId]?.isFavourite
  }, [libraryState.items])

  const getResourceNotes = useCallback((resourceId: string): string => {
    return libraryState.items[resourceId]?.notes ?? ''
  }, [libraryState.items])

  const addToPersonalLibrary = useCallback((resourceId: string, notes?: string) => {
    setLibraryState((prev) => {
      if (prev.items[resourceId]) {
        if (notes !== undefined) {
          return {
            ...prev,
            items: {
              ...prev.items,
              [resourceId]: { ...prev.items[resourceId], notes },
            },
            lastUpdated: Date.now(),
          }
        }
        return prev
      }
      const newItem: PersonalResourceItem = {
        resourceId,
        addedAt: Date.now(),
        notes: notes ?? '',
        isFavourite: false,
      }
      return {
        ...prev,
        items: { ...prev.items, [resourceId]: newItem },
        lastUpdated: Date.now(),
      }
    })
  }, [])

  const removeFromPersonalLibrary = useCallback((resourceId: string) => {
    setLibraryState((prev) => {
      const nextItems = { ...prev.items }
      delete nextItems[resourceId]
      const nextCustom = { ...prev.customResources }
      // If it was a custom resource, remove it as well
      delete nextCustom[resourceId]
      return {
        ...prev,
        items: nextItems,
        customResources: nextCustom,
        lastUpdated: Date.now(),
      }
    })
  }, [])

  const toggleResourceFavourite = useCallback((resourceId: string) => {
    setLibraryState((prev) => {
      const existing = prev.items[resourceId]
      if (existing) {
        return {
          ...prev,
          items: {
            ...prev.items,
            [resourceId]: { ...existing, isFavourite: !existing.isFavourite },
          },
          lastUpdated: Date.now(),
        }
      }
      // If not yet in personal library, add it directly as favourite
      return {
        ...prev,
        items: {
          ...prev.items,
          [resourceId]: {
            resourceId,
            addedAt: Date.now(),
            isFavourite: true,
            notes: '',
          },
        },
        lastUpdated: Date.now(),
      }
    })
  }, [])

  const updateResourceNotes = useCallback((resourceId: string, notes: string) => {
    setLibraryState((prev) => {
      const existing = prev.items[resourceId]
      if (existing) {
        return {
          ...prev,
          items: {
            ...prev.items,
            [resourceId]: { ...existing, notes },
          },
          lastUpdated: Date.now(),
        }
      }
      return {
        ...prev,
        items: {
          ...prev.items,
          [resourceId]: {
            resourceId,
            addedAt: Date.now(),
            notes,
            isFavourite: false,
          },
        },
        lastUpdated: Date.now(),
      }
    })
  }, [])

  const addCustomResource = useCallback((resource: Omit<MediaResource, 'id'>, notes?: string): string => {
    const id = `custom-res-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const fullResource: MediaResource = {
      ...resource,
      id,
      dateDiscovered: new Date().toISOString().slice(0, 10),
      lastVerified: new Date().toISOString().slice(0, 10),
    }

    setLibraryState((prev) => ({
      ...prev,
      customResources: { ...prev.customResources, [id]: fullResource },
      items: {
        ...prev.items,
        [id]: {
          resourceId: id,
          addedAt: Date.now(),
          notes: notes ?? '',
          isFavourite: false,
          customResource: fullResource,
        },
      },
      lastUpdated: Date.now(),
    }))
    return id
  }, [])

  const toggleSourceEnabled = useCallback((resourceId: string) => {
    setLibraryState((prev) => {
      const item = prev.items[resourceId]
      if (!item) return prev
      const current = item.enabled !== false
      return {
        ...prev,
        items: {
          ...prev.items,
          [resourceId]: {
            ...item,
            enabled: !current,
          },
        },
        lastUpdated: Date.now(),
      }
    })
  }, [])

  const isSourceEnabled = useCallback((resourceId: string): boolean => {
    const item = libraryState.items[resourceId]
    return item ? item.enabled !== false : true
  }, [libraryState.items])

  const updateSourceConfig = useCallback((resourceId: string, updates: Partial<MediaResource>, notes?: string) => {
    setLibraryState((prev) => {
      const nextCustom = { ...prev.customResources }
      const custom = nextCustom[resourceId]
      if (custom) {
        nextCustom[resourceId] = { ...custom, ...updates }
      }

      const item = prev.items[resourceId]
      const nextItems = { ...prev.items }
      if (item) {
        nextItems[resourceId] = {
          ...item,
          notes: notes !== undefined ? notes : item.notes,
          customResource: custom ? { ...custom, ...updates } : item.customResource,
        }
      }

      return {
        ...prev,
        customResources: nextCustom,
        items: nextItems,
        lastUpdated: Date.now(),
      }
    })
  }, [])

  const verifyResourceNow = useCallback(async (resourceId: string) => {
    const res = allResources.find((r) => r.id === resourceId)
    if (!res) return

    setVerificationOverrides((prev) => ({
      ...prev,
      [resourceId]: {
        status: 'discovered',
        lastVerified: 'Verifying...',
        notes: 'Checking endpoint availability...',
      },
    }))

    let ok = false
    let status: VerificationStatus = res.verificationStatus

    try {
      if (isTauri()) {
      const targetUrl = res.playbackUrl ?? res.url
      try {
        const testRes = await testSourceConnection(targetUrl)
        if (testRes && testRes.ok) {
          ok = true
          status = res.playbackUrl ? 'working' : 'verified'
        } else {
          ok = false
          status = 'unavailable'
        }
      } catch {
        ok = false
        status = 'unavailable'
      }
    } else {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 6000)

        try {
          await fetch(res.playbackUrl ?? res.url, {
            method: 'HEAD',
            signal: controller.signal,
            mode: 'no-cors',
          })
          clearTimeout(timer)
          ok = true
          status = res.playbackUrl ? 'working' : 'verified'
        } catch (err) {
          clearTimeout(timer)
          if (err instanceof Error && err.name === 'AbortError') {
            status = 'unavailable'
            ok = false
          } else {
            status = res.playbackUrl ? 'working' : 'verified'
            ok = true
          }
        }
      } catch {
        status = 'unavailable'
        ok = false
      }
    }

      const today = new Date().toISOString().slice(0, 10)
      setVerificationOverrides((prev) => ({
        ...prev,
        [resourceId]: {
          status,
          lastVerified: today,
          notes: ok ? 'Endpoint responded successfully.' : 'Connection timed out or unreachable.',
        },
      }))

      setLibraryState((prev) => {
        const item = prev.items[resourceId]
        if (!item) return prev
        return {
          ...prev,
          items: {
            ...prev.items,
            [resourceId]: {
              ...item,
              lastChecked: Date.now(),
              checkStatus: ok ? 'online' : 'offline',
            },
          },
          lastUpdated: Date.now(),
        }
      })
    } catch {
      const today = new Date().toISOString().slice(0, 10)
      setVerificationOverrides((prev) => ({
        ...prev,
        [resourceId]: {
          status: 'unavailable',
          lastVerified: today,
          notes: 'Probe failed to reach destination server.',
        },
      }))

      setLibraryState((prev) => {
        const item = prev.items[resourceId]
        if (!item) return prev
        return {
          ...prev,
          items: {
            ...prev.items,
            [resourceId]: {
              ...item,
              lastChecked: Date.now(),
              checkStatus: 'offline',
            },
          },
          lastUpdated: Date.now(),
        }
      })
    }
  }, [allResources])

  const exportPersonalLibrary = useCallback((): string => {
    const exportData = {
      app: 'Kinora',
      version: 1,
      exportedAt: new Date().toISOString(),
      items: libraryState.items,
      customResources: libraryState.customResources,
    }
    return JSON.stringify(exportData, null, 2)
  }, [libraryState])

  const importPersonalLibrary = useCallback((jsonString: string): { success: boolean; count: number; error?: string } => {
    try {
      const data = JSON.parse(jsonString)
      if (!data || typeof data !== 'object') {
        return { success: false, count: 0, error: 'Invalid JSON file format.' }
      }
      const importedItems = (data.items || {}) as Record<string, PersonalResourceItem>
      const importedCustom = (data.customResources || {}) as Record<string, MediaResource>
      const count = Object.keys(importedItems).length

      setLibraryState((prev) => ({
        ...prev,
        items: { ...prev.items, ...importedItems },
        customResources: { ...prev.customResources, ...importedCustom },
        lastUpdated: Date.now(),
      }))

      return { success: true, count }
    } catch (e) {
      return { success: false, count: 0, error: e instanceof Error ? e.message : 'Unknown JSON parse error' }
    }
  }, [])

  return {
    allResources,
    mySources,
    isInPersonalLibrary,
    isResourceFavourite,
    getResourceNotes,
    addToPersonalLibrary,
    removeFromPersonalLibrary,
    toggleResourceFavourite,
    updateResourceNotes,
    toggleSourceEnabled,
    isSourceEnabled,
    updateSourceConfig,
    addCustomResource,
    verifyResourceNow,
    exportPersonalLibrary,
    importPersonalLibrary,
    // Audio Player controls
    currentAudio,
    isAudioPlaying,
    audioVolume,
    audioError,
    audioQueue,
    recentlyPlayedStations,
    sleepTimerRemaining,
    playAudio,
    stopAudio,
    toggleAudioPlay,
    setAudioVolume,
    setAudioError,
    addToQueue,
    removeFromQueue,
    clearQueue,
    playNextInQueue,
    setSleepTimer,
    updateAudioLyrics,
  }
}

export type PersonalMediaLibrary = ReturnType<typeof usePersonalMediaLibrary>
