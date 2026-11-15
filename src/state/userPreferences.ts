import { useCallback, useEffect, useState } from 'react'

export type RatingValue = 'like' | 'dislike' | 'strong-like' | 1 | 2 | 3 | 4 | 5

export type DislikeReason =
  | 'not-my-type'
  | 'already-watched'
  | 'poor-quality'
  | 'not-interested-in-genre'
  | 'dont-recommend-similar'
  | 'other'

export interface DislikeFeedback {
  reason: DislikeReason
  timestamp: number
}

export interface HomeSectionSetting {
  id: string
  title: string
  visible: boolean
  order: number
}

export interface UserPreferencesData {
  version: 1
  ratings: Record<string, RatingValue>
  dislikeFeedback: Record<string, DislikeFeedback>
  hiddenItems: string[]
  homeSectionsConfig: HomeSectionSetting[]
  cardDensity: 'compact' | 'comfortable' | 'spacious'
  channelSortOrder: 'number' | 'name' | 'epg'
  lastActiveScreen: string
  preferredServers?: Record<string, string>
  autoFallbackEnabled?: boolean
  liveTvGroupingMode?: 'canonical' | 'provider'
}

const STORAGE_KEY = 'kinora.userPreferences.v1'

export const DEFAULT_HOME_SECTIONS: HomeSectionSetting[] = [
  { id: 'continue-watching', title: 'Continue Watching', visible: true, order: 1 },
  { id: 'recommended-for-you', title: 'Recommended for You', visible: true, order: 2 },
  { id: 'live-tv-right-now', title: 'Live TV Right Now', visible: true, order: 3 },
  { id: 'because-you-watched', title: 'Because You Watched', visible: true, order: 4 },
  { id: 'trending-popular', title: 'Trending & Popular', visible: true, order: 5 },
  { id: 'radio-audio', title: 'Live Radio & Spoken Audio', visible: true, order: 6 },
  { id: 'favourites-rail', title: 'Your Favourites', visible: true, order: 7 },
  { id: 'scifi-space', title: 'Sci-Fi & Space', visible: true, order: 8 },
  { id: 'crime-drama', title: 'Crime & Drama', visible: true, order: 9 },
  { id: 'action-adventure', title: 'Action & Adventure', visible: true, order: 10 },
  { id: 'comedy-entertainment', title: 'Comedy & Entertainment', visible: true, order: 11 },
  { id: 'recently-added', title: 'Recently Added', visible: true, order: 12 },
]

export const initialUserPreferences: UserPreferencesData = {
  version: 1,
  ratings: {},
  dislikeFeedback: {},
  hiddenItems: [],
  homeSectionsConfig: DEFAULT_HOME_SECTIONS,
  cardDensity: 'comfortable',
  channelSortOrder: 'epg',
  lastActiveScreen: '/',
  preferredServers: {},
  autoFallbackEnabled: true,
  liveTvGroupingMode: 'provider',
}

export function loadUserPreferences(profileId = 'default'): UserPreferencesData {
  try {
    const key = profileId ? `kinora.userPreferences.v1.${profileId}` : STORAGE_KEY
    let raw = localStorage.getItem(key)
    if (!raw && profileId === 'default') {
      // Seamlessly migrate legacy global preferences into default profile
      raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        try {
          localStorage.setItem(key, raw)
        } catch {}
      }
    }
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UserPreferencesData>
      if (parsed && parsed.version === 1) {
        return {
          version: 1,
          ratings: parsed.ratings ?? {},
          dislikeFeedback: parsed.dislikeFeedback ?? {},
          hiddenItems: Array.isArray(parsed.hiddenItems) ? parsed.hiddenItems : [],
          homeSectionsConfig: Array.isArray(parsed.homeSectionsConfig) && parsed.homeSectionsConfig.length > 0
            ? parsed.homeSectionsConfig
            : DEFAULT_HOME_SECTIONS,
          cardDensity: parsed.cardDensity ?? 'comfortable',
          channelSortOrder: parsed.channelSortOrder ?? 'epg',
          lastActiveScreen: parsed.lastActiveScreen ?? '/',
          preferredServers: typeof parsed.preferredServers === 'object' && parsed.preferredServers !== null ? parsed.preferredServers : {},
          autoFallbackEnabled: typeof parsed.autoFallbackEnabled === 'boolean' ? parsed.autoFallbackEnabled : true,
          liveTvGroupingMode: parsed.liveTvGroupingMode === 'canonical' ? 'canonical' : 'provider',
        }
      }
    }
  } catch {
    // Fallback on corrupt or unavailable storage
  }
  return initialUserPreferences
}

export function useUserPreferencesStore(profileId = 'default') {
  const [data, setData] = useState<UserPreferencesData>(() => loadUserPreferences(profileId))
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => {
    setData(loadUserPreferences(profileId))
  }, [profileId])

  const persist = useCallback((next: UserPreferencesData) => {
    setData(next)
    setSaveState('saving')
    try {
      const key = profileId ? `kinora.userPreferences.v1.${profileId}` : STORAGE_KEY
      const json = JSON.stringify(next)
      localStorage.setItem(key, json)
      if (profileId === 'default') {
        localStorage.setItem(STORAGE_KEY, json)
      }
      setSaveState('saved')
      const timer = window.setTimeout(() => setSaveState('idle'), 1500)
      return () => clearTimeout(timer)
    } catch {
      setSaveState('error')
    }
  }, [profileId])

  const setRating = useCallback(
    (ref: string, val: RatingValue | null) => {
      setData((prev) => {
        const nextRatings = { ...prev.ratings }
        if (val === null) {
          delete nextRatings[ref]
        } else {
          nextRatings[ref] = val
        }
        const next = { ...prev, ratings: nextRatings }
        persist(next)
        return next
      })
    },
    [persist],
  )

  const setDislikeFeedback = useCallback(
    (ref: string, reason: DislikeReason) => {
      setData((prev) => {
        const nextDislike = {
          ...prev.dislikeFeedback,
          [ref]: { reason, timestamp: Date.now() },
        }
        const nextRatings = {
          ...prev.ratings,
          [ref]: 'dislike' as const,
        }
        const next = { ...prev, dislikeFeedback: nextDislike, ratings: nextRatings }
        persist(next)
        return next
      })
    },
    [persist],
  )

  const hideItem = useCallback(
    (ref: string) => {
      setData((prev) => {
        if (prev.hiddenItems.includes(ref)) return prev
        const next = { ...prev, hiddenItems: [...prev.hiddenItems, ref] }
        persist(next)
        return next
      })
    },
    [persist],
  )

  const unhideItem = useCallback(
    (ref: string) => {
      setData((prev) => {
        const next = { ...prev, hiddenItems: prev.hiddenItems.filter((id) => id !== ref) }
        persist(next)
        return next
      })
    },
    [persist],
  )

  const isItemHidden = useCallback(
    (ref: string) => data.hiddenItems.includes(ref),
    [data.hiddenItems],
  )

  const setHomeSectionsConfig = useCallback(
    (config: HomeSectionSetting[]) => {
      setData((prev) => {
        const next = { ...prev, homeSectionsConfig: config }
        persist(next)
        return next
      })
    },
    [persist],
  )

  const setCardDensity = useCallback(
    (density: 'compact' | 'comfortable' | 'spacious') => {
      setData((prev) => {
        const next = { ...prev, cardDensity: density }
        persist(next)
        return next
      })
    },
    [persist],
  )

  const setChannelSortOrder = useCallback(
    (order: 'number' | 'name' | 'epg') => {
      setData((prev) => {
        const next = { ...prev, channelSortOrder: order }
        persist(next)
        return next
      })
    },
    [persist],
  )

  const setLastActiveScreen = useCallback(
    (screen: string) => {
      setData((prev) => {
        const next = { ...prev, lastActiveScreen: screen }
        persist(next)
        return next
      })
    },
    [persist],
  )

  const setPreferredServer = useCallback(
    (channelId: string, variantId: string) => {
      setData((prev) => {
        const nextPreferred = { ...(prev.preferredServers ?? {}), [channelId]: variantId }
        const next = { ...prev, preferredServers: nextPreferred }
        persist(next)
        return next
      })
    },
    [persist],
  )

  const resetPreferredServer = useCallback(
    (channelId: string) => {
      setData((prev) => {
        const nextPreferred = { ...(prev.preferredServers ?? {}) }
        delete nextPreferred[channelId]
        const next = { ...prev, preferredServers: nextPreferred }
        persist(next)
        return next
      })
    },
    [persist],
  )

  const setAutoFallbackEnabled = useCallback(
    (enabled: boolean) => {
      setData((prev) => {
        const next = { ...prev, autoFallbackEnabled: enabled }
        persist(next)
        return next
      })
    },
    [persist],
  )

  const setLiveTvGroupingMode = useCallback(
    (mode: 'canonical' | 'provider') => {
      setData((prev) => {
        const next = { ...prev, liveTvGroupingMode: mode }
        persist(next)
        return next
      })
    },
    [persist],
  )

  return {
    preferences: data,
    saveState,
    setRating,
    setDislikeFeedback,
    hideItem,
    unhideItem,
    isItemHidden,
    setHomeSectionsConfig,
    setCardDensity,
    setChannelSortOrder,
    setLastActiveScreen,
    setPreferredServer,
    resetPreferredServer,
    setAutoFallbackEnabled,
    setLiveTvGroupingMode,
  }
}
