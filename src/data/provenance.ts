import type { IconName } from '../components/Icon'
import type { MediaResource } from './personalLibrary'

/**
 * Kinora Data Provenance & Capability Taxonomy System.
 * Establishes strict data domain boundaries and operational classifications:
 * 1. Development Fixtures: isolated simulated mock data.
 * 2. Personal Sources: genuine user-configured providers and libraries.
 * 3. Shared Public Discovery: open catalogues and public broadcaster feeds.
 *
 * Typography standard: Strictly zero em-dashes throughout.
 */

export type DataProvenance =
  | 'dev-fixture'
  | 'personal-source'
  | 'public-discovery'
  | 'provider-catalogue'
  | 'live-broadcast'
  | 'local-media'
  | 'metadata-only'

export interface ProvenanceMeta {
  id: DataProvenance
  label: string
  shortLabel: string
  description: string
  badgeClass: string
  tone: string
}

export const PROVENANCE_REGISTRY: Record<DataProvenance, ProvenanceMeta> = {
  'dev-fixture': {
    id: 'dev-fixture',
    label: 'Development Fixture',
    shortLabel: 'Dev Fixture',
    description: 'Isolated test fixture provided for interface demonstration. Not stored in personal user profile.',
    badgeClass: 'provenance-dev-fixture',
    tone: 'var(--warn, #f59e0b)',
  },
  'personal-source': {
    id: 'personal-source',
    label: 'Personal Source',
    shortLabel: 'My Source',
    description: 'Explicitly configured, saved, or imported into your personal Kinora library.',
    badgeClass: 'provenance-personal-source',
    tone: 'var(--positive, #2ebd60)',
  },
  'public-discovery': {
    id: 'public-discovery',
    label: 'Public Discovery',
    shortLabel: 'Discovery',
    description: 'Open public directory, cultural collection, or public service broadcaster catalogue.',
    badgeClass: 'provenance-public-discovery',
    tone: 'var(--info, #38bdf8)',
  },
  'provider-catalogue': {
    id: 'provider-catalogue',
    label: 'Provider Catalogue',
    shortLabel: 'Provider',
    description: 'On-demand video or series catalogue provided by your authenticated Xtream service.',
    badgeClass: 'provenance-provider-catalogue',
    tone: 'var(--accent, #e53935)',
  },
  'live-broadcast': {
    id: 'live-broadcast',
    label: 'Live Broadcast',
    shortLabel: 'Live TV',
    description: 'Linear broadcast stream provided by an active M3U playlist or Xtream live stream.',
    badgeClass: 'provenance-live-broadcast',
    tone: 'var(--cyan, #06b6d4)',
  },
  'local-media': {
    id: 'local-media',
    label: 'Local Media',
    shortLabel: 'Local',
    description: 'Media file residing on your local filesystem or mounted storage volume.',
    badgeClass: 'provenance-local-media',
    tone: 'var(--purple, #a855f7)',
  },
  'metadata-only': {
    id: 'metadata-only',
    label: 'Metadata Only',
    shortLabel: 'Metadata',
    description: 'Informational database entry, schedule guide, or artwork without playable media.',
    badgeClass: 'provenance-metadata-only',
    tone: 'var(--text-muted, #94a3b8)',
  },
}

export type ResourceCapability =
  | 'playable-stream'
  | 'playable-vod'
  | 'live-audio'
  | 'podcast'
  | 'public-archive'
  | 'downloadable-book'
  | 'external-website'
  | 'metadata-provider'
  | 'epg-provider'
  | 'other'

export interface CapabilityMeta {
  id: ResourceCapability
  label: string
  description: string
  icon: IconName
  isPlayableInApp: boolean
  badgeClass: string
}

export const CAPABILITY_REGISTRY: Record<ResourceCapability, CapabilityMeta> = {
  'playable-stream': {
    id: 'playable-stream',
    label: 'Playable Live Stream',
    description: 'Guarded direct HLS video stream playable within Kinora native player.',
    icon: 'play',
    isPlayableInApp: true,
    badgeClass: 'capability-playable-stream',
  },
  'playable-vod': {
    id: 'playable-vod',
    label: 'On-Demand Video',
    description: 'Full-length feature film or episode playable via authenticated provider.',
    icon: 'film',
    isPlayableInApp: true,
    badgeClass: 'capability-playable-vod',
  },
  'live-audio': {
    id: 'live-audio',
    label: 'Live Audio Stream',
    description: 'Direct audio stream (MP3/AAC) playable in background audio player.',
    icon: 'radio',
    isPlayableInApp: true,
    badgeClass: 'capability-live-audio',
  },
  'podcast': {
    id: 'podcast',
    label: 'Podcast Show',
    description: 'Episodic podcast RSS feed with in-app audio playback support.',
    icon: 'podcast',
    isPlayableInApp: true,
    badgeClass: 'capability-podcast',
  },
  'public-archive': {
    id: 'public-archive',
    label: 'Public Archive Portal',
    description: 'Open public domain or historical archive for web-based browsing.',
    icon: 'archive',
    isPlayableInApp: false,
    badgeClass: 'capability-public-archive',
  },
  'downloadable-book': {
    id: 'downloadable-book',
    label: 'Digital Book / OPDS',
    description: 'Public domain literary publication or open educational textbook.',
    icon: 'book',
    isPlayableInApp: false,
    badgeClass: 'capability-downloadable-book',
  },
  'external-website': {
    id: 'external-website',
    label: 'External Web Resource',
    description: 'Official broadcaster portal or documentation directory.',
    icon: 'link',
    isPlayableInApp: false,
    badgeClass: 'capability-external-website',
  },
  'metadata-provider': {
    id: 'metadata-provider',
    label: 'Metadata Database',
    description: 'REST API or dataset providing title indexing, ratings, or credits.',
    icon: 'database',
    isPlayableInApp: false,
    badgeClass: 'capability-metadata-provider',
  },
  'epg-provider': {
    id: 'epg-provider',
    label: 'EPG Schedule Feed',
    description: 'XMLTV guide source providing broadcast schedule timings.',
    icon: 'guide',
    isPlayableInApp: false,
    badgeClass: 'capability-epg-provider',
  },
  'other': {
    id: 'other',
    label: 'Resource Directory',
    description: 'Media catalogue directory or specialized reference dataset.',
    icon: 'sources',
    isPlayableInApp: false,
    badgeClass: 'capability-other',
  },
}

/**
 * Classifies a MediaResource to determine its exact provenance and operational capability.
 */
export function classifyMediaResource(
  resource: MediaResource,
  isInPersonalLibrary: boolean,
  isDemoActive = false,
): { provenance: ProvenanceMeta; capability: CapabilityMeta } {
  // 1. Provenance Classification
  let provKey: DataProvenance = 'public-discovery'
  if (isDemoActive && resource.id.startsWith('demo-')) {
    provKey = 'dev-fixture'
  } else if (isInPersonalLibrary) {
    provKey = 'personal-source'
  } else if (resource.resourceType === 'dataset' || resource.resourceType === 'api') {
    provKey = 'metadata-only'
  }

  // 2. Capability Classification
  let capKey: ResourceCapability = 'other'
  if (resource.playbackUrl && resource.playbackType === 'hls') {
    capKey = 'playable-stream'
  } else if (resource.playbackUrl && resource.playbackType === 'audio') {
    capKey = 'live-audio'
  } else if (resource.resourceType === 'rss') {
    capKey = 'podcast'
  } else if (resource.resourceType === 'opds' || resource.category === 'books') {
    capKey = 'downloadable-book'
  } else if (resource.resourceType === 'archive') {
    capKey = 'public-archive'
  } else if (resource.resourceType === 'xmltv') {
    capKey = 'epg-provider'
  } else if (resource.resourceType === 'api' || resource.resourceType === 'dataset') {
    capKey = 'metadata-provider'
  } else if (resource.resourceType === 'web' || resource.resourceType === 'directory') {
    capKey = 'external-website'
  }

  return {
    provenance: PROVENANCE_REGISTRY[provKey],
    capability: CAPABILITY_REGISTRY[capKey],
  }
}
