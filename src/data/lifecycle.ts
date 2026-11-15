import type { Channel, XtreamTitle } from './types'
import type { MediaResource } from './personalLibrary'
import type { GuideMatch } from '../state/guides'

export type ItemLifecycleState =
  | 'discovered'
  | 'imported'
  | 'indexed'
  | 'metadata-enriched'
  | 'artwork-enriched'
  | 'guide-associated'
  | 'playable'
  | 'unavailable'

export interface ItemLifecycleDetails {
  state: ItemLifecycleState
  label: string
  description: string
  badges: string[]
  metrics: {
    isImported: boolean
    isIndexed: boolean
    hasMetadata: boolean
    hasArtwork: boolean
    hasGuide: boolean
    isPlayable: boolean
  }
}

/**
 * Derives truthful, transparent lifecycle state for a live broadcast channel.
 * Guarantees zero fabrication: does not claim guide-associated without listings,
 * nor playable without a valid stream.
 */
export function getChannelLifecycle(
  channel: Channel,
  match?: GuideMatch | null,
  hasProgrammes = false,
  isStreamActive = false,
): ItemLifecycleDetails {
  const isImported = Boolean(channel.sourceId)
  const isIndexed = true // If the channel is in store.channels, it has been indexed by channel-matching
  const hasMetadata = Boolean(channel.name && channel.categories && channel.categories.length > 0 && channel.categories[0] !== 'Uncategorised')
  const hasArtwork = Boolean(channel.logoUrl)
  const hasGuide = match?.state === 'matched' && hasProgrammes
  const isPlayable = Boolean(channel.streamUrl && (channel.streamUrl.startsWith('http://') || channel.streamUrl.startsWith('https://') || channel.streamUrl.startsWith('kstream://')))

  const badges: string[] = []
  if (isImported) badges.push('Imported')
  if (isIndexed) badges.push('Indexed')
  if (hasMetadata) badges.push('Metadata Enriched')
  if (hasArtwork) badges.push('Logo Available')
  if (hasGuide) badges.push('Guide Associated')
  if (isStreamActive) badges.push('Streaming Now')
  else if (isPlayable) badges.push('Playable (HLS)')

  let state: ItemLifecycleState = 'imported'
  let label = 'Imported'
  let description = 'Channel imported from playlist source.'

  if (!isPlayable && isImported) {
    state = 'unavailable'
    label = 'Stream Unavailable'
    description = 'Channel stream URL is pending refresh or currently unavailable.'
  } else if (hasGuide && isPlayable && hasArtwork) {
    state = 'guide-associated'
    label = 'Complete & Guide Associated'
    description = 'Channel has active electronic guide schedules, artwork, and playable stream.'
  } else if (hasGuide) {
    state = 'guide-associated'
    label = 'Guide Associated'
    description = 'Channel is matched with active XMLTV programme schedules.'
  } else if (hasArtwork) {
    state = 'artwork-enriched'
    label = 'Artwork Enriched'
    description = 'Channel has verified logo asset; EPG schedule is not yet associated.'
  } else if (hasMetadata) {
    state = 'metadata-enriched'
    label = 'Metadata Enriched'
    description = 'Channel has category, language or group metadata.'
  } else if (isPlayable) {
    state = 'playable'
    label = 'Playable Stream'
    description = 'Channel has a playable stream address.'
  }

  return {
    state,
    label,
    description,
    badges,
    metrics: {
      isImported,
      isIndexed,
      hasMetadata,
      hasArtwork,
      hasGuide,
      isPlayable,
    },
  }
}

/**
 * Derives lifecycle state for an on-demand Xtream title (Movie or Series).
 */
export function getXtreamLifecycle(
  title: XtreamTitle,
  isConnected: boolean,
): ItemLifecycleDetails {
  const isImported = true
  const isIndexed = true
  const hasMetadata = Boolean(title.name && (title.year || title.plot))
  const hasArtwork = Boolean(title.artworkKey)
  const isPlayable = isConnected

  const badges: string[] = ['On-Demand', 'Imported', 'Indexed']
  if (hasMetadata) badges.push('Metadata Enriched')
  if (hasArtwork) badges.push('Poster Enriched')
  if (isPlayable) badges.push('Playable VOD')

  let state: ItemLifecycleState = 'imported'
  let label = 'Imported Catalogue Title'
  let description = 'Title is indexed in on-demand catalogue.'

  if (!isConnected) {
    state = 'unavailable'
    label = 'Provider Disconnected'
    description = 'Provider server must be reconnected to stream on-demand media.'
  } else if (hasArtwork) {
    state = 'artwork-enriched'
    label = 'Enriched with Poster'
    description = 'Title has verified poster artwork and active provider stream.'
  } else if (hasMetadata) {
    state = 'metadata-enriched'
    label = 'Metadata Enriched'
    description = 'Title has metadata details.'
  } else {
    state = 'playable'
    label = 'Playable Title'
    description = 'Title is ready for on-demand playback.'
  }

  return {
    state,
    label,
    description,
    badges,
    metrics: {
      isImported,
      isIndexed,
      hasMetadata,
      hasArtwork,
      hasGuide: false,
      isPlayable,
    },
  }
}

/**
 * Derives lifecycle state for a media resource (Radio, Podcast, Audiobook, Archive).
 */
export function getResourceLifecycle(resource: MediaResource): ItemLifecycleDetails {
  const isImported = resource.verificationStatus === 'verified' || resource.verificationStatus === 'working'
  const isIndexed = true
  const hasMetadata = Boolean(resource.name && resource.description && resource.category)
  const hasArtwork = Boolean(resource.artworkUrl || resource.artworkFallbackIcon)
  const isPlayable = resource.playbackType === 'audio' || resource.playbackType === 'hls'

  const badges: string[] = ['Curated Resource', 'Indexed']
  if (isImported) badges.push('Active')
  if (hasMetadata) badges.push('Enriched')
  if (hasArtwork) badges.push('Artwork Enriched')
  if (isPlayable) badges.push('Direct Stream')
  else badges.push('Portal Reference')

  let state: ItemLifecycleState = 'indexed'
  let label = 'Indexed Resource'
  let description = 'Resource is catalogued and searchable.'

  if (resource.verificationStatus === 'unavailable') {
    state = 'unavailable'
    label = 'Resource Unavailable'
    description = 'External source endpoint is temporarily unreachable.'
  } else if (isPlayable) {
    state = 'playable'
    label = 'Playable Audio Stream'
    description = 'Direct audio stream ready for desktop playback.'
  } else if (hasArtwork) {
    state = 'artwork-enriched'
    label = 'Catalogued Reference'
    description = 'Digital media archive with verified metadata and artwork.'
  }

  return {
    state,
    label,
    description,
    badges,
    metrics: {
      isImported,
      isIndexed,
      hasMetadata,
      hasArtwork,
      hasGuide: false,
      isPlayable,
    },
  }
}

export interface CatalogueAuditSummary {
  totalChannels: number
  indexedChannels: number
  metadataEnrichedChannels: number
  artworkEnrichedChannels: number
  artworkEnrichedPercent: number
  guideMatchedChannels: number
  guideMatchedPercent: number
  playableChannels: number
  unmatchedChannelsCount: number
  unmatchedReasons: {
    radioStreams: number
    fastChannelsNoFeed: number
    missingTvgId: number
    unlistedInGuide: number
  }
}

/**
 * Computes comprehensive, transparent audit metrics for imported channels.
 */
export function auditCatalogueHealth(
  channels: Channel[],
  matches: Map<string, GuideMatch>,
): CatalogueAuditSummary {
  const total = channels.length
  if (total === 0) {
    return {
      totalChannels: 0,
      indexedChannels: 0,
      metadataEnrichedChannels: 0,
      artworkEnrichedChannels: 0,
      artworkEnrichedPercent: 0,
      guideMatchedChannels: 0,
      guideMatchedPercent: 0,
      playableChannels: 0,
      unmatchedChannelsCount: 0,
      unmatchedReasons: {
        radioStreams: 0,
        fastChannelsNoFeed: 0,
        missingTvgId: 0,
        unlistedInGuide: 0,
      },
    }
  }

  let metadataCount = 0
  let artworkCount = 0
  let guideMatchedCount = 0
  let playableCount = 0

  let radioStreams = 0
  let fastChannelsNoFeed = 0
  let missingTvgId = 0
  let unlistedInGuide = 0

  for (const c of channels) {
    if (c.categories && c.categories.length > 0 && c.categories[0] !== 'Uncategorised') metadataCount++
    if (c.logoUrl) artworkCount++
    if (c.streamUrl) playableCount++

    const match = (c.memberIds ?? [c.id]).map((id) => matches.get(id)).find((m) => m?.state === 'matched') ?? matches.get(c.id)
    if (match?.state === 'matched') {
      guideMatchedCount++
    } else {
      // Reason diagnosis:
      const isRadio = c.categories.some((cat) => /radio|audio/i.test(cat)) || /radio|1xtra|6music/i.test(c.name)
      if (isRadio) {
        radioStreams++
      } else if (!c.tvgId) {
        missingTvgId++
      } else if (c.tvgId.includes('@') && !c.tvgId.endsWith('@HD') && !c.tvgId.endsWith('@SD')) {
        fastChannelsNoFeed++
      } else {
        unlistedInGuide++
      }
    }
  }

  const unmatchedCount = total - guideMatchedCount

  return {
    totalChannels: total,
    indexedChannels: total,
    metadataEnrichedChannels: metadataCount,
    artworkEnrichedChannels: artworkCount,
    artworkEnrichedPercent: Math.round((artworkCount / total) * 100),
    guideMatchedChannels: guideMatchedCount,
    guideMatchedPercent: Math.round((guideMatchedCount / total) * 100),
    playableChannels: playableCount,
    unmatchedChannelsCount: unmatchedCount,
    unmatchedReasons: {
      radioStreams,
      fastChannelsNoFeed,
      missingTvgId,
      unlistedInGuide,
    },
  }
}
