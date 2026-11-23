import type { Episode, Series } from '../data/types'
import { episodeRef } from '../data/refs'

export interface BingeSettings {
  enabled: boolean
  countdownSeconds: number
  skipIntroSeconds: number
  autoSkipCredits: boolean
  promptThresholdSeconds: number
}

export const DEFAULT_BINGE_SETTINGS: BingeSettings = {
  enabled: true,
  countdownSeconds: 10,
  skipIntroSeconds: 0,
  autoSkipCredits: false,
  promptThresholdSeconds: 45,
}

export function getBingeSettingsKey(profileId?: string): string {
  return profileId && profileId !== 'default'
    ? `kinora.binge_settings.v1.${profileId}`
    : 'kinora.binge_settings.v1'
}

export function loadBingeSettings(profileId?: string): BingeSettings {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_BINGE_SETTINGS }
  try {
    const raw = localStorage.getItem(getBingeSettingsKey(profileId))
    if (!raw) return { ...DEFAULT_BINGE_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<BingeSettings>
    return {
      enabled: parsed.enabled ?? DEFAULT_BINGE_SETTINGS.enabled,
      countdownSeconds: typeof parsed.countdownSeconds === 'number' ? parsed.countdownSeconds : 10,
      skipIntroSeconds: typeof parsed.skipIntroSeconds === 'number' ? parsed.skipIntroSeconds : 0,
      autoSkipCredits: Boolean(parsed.autoSkipCredits),
      promptThresholdSeconds: typeof parsed.promptThresholdSeconds === 'number' ? parsed.promptThresholdSeconds : 45,
    }
  } catch {
    return { ...DEFAULT_BINGE_SETTINGS }
  }
}

export function saveBingeSettings(settings: BingeSettings, profileId?: string): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(getBingeSettingsKey(profileId), JSON.stringify(settings))
  } catch {
    // Graceful error handling
  }
}

export function shouldShowNextEpisodePrompt(
  currentTime: number,
  duration: number,
  threshold = 45,
): boolean {
  if (!duration || duration <= 0 || currentTime <= 0) return false
  const remaining = duration - currentTime
  return remaining > 0 && remaining <= threshold
}

export function canSkipIntro(currentTime: number, skipSeconds: number): boolean {
  if (!skipSeconds || skipSeconds <= 0) return false
  return currentTime >= 0 && currentTime < skipSeconds
}

export interface NextEpisodeResult {
  series: Series
  nextEpisode: Episode
  nextRef: string
}

export function findNextEpisode(
  currentRef: string,
  seriesList: Series[],
): NextEpisodeResult | null {
  if (!currentRef.startsWith('episode:')) return null

  // format: "episode:seriesId/episodeId"
  const payload = currentRef.slice(8)
  const slashIdx = payload.indexOf('/')
  if (slashIdx === -1) return null

  const seriesId = payload.slice(0, slashIdx)
  const episodeId = payload.slice(slashIdx + 1)

  const s = seriesList.find((item) => item.id === seriesId)
  if (!s || !s.seasons) return null

  const allEpisodes = s.seasons.flat()
  const currentEpIndex = allEpisodes.findIndex((e) => e.id === episodeId)
  if (currentEpIndex === -1 || currentEpIndex >= allEpisodes.length - 1) return null

  const nextEp = allEpisodes[currentEpIndex + 1]!
  return {
    series: s,
    nextEpisode: nextEp,
    nextRef: episodeRef(s.id, nextEp.id),
  }
}
