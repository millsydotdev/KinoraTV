import type { IconName } from '../components/Icon'

export type VerificationStatus =
  | 'discovered'
  | 'verified'
  | 'working'
  | 'partially-working'
  | 'unavailable'
  | 'unsupported'
  | 'requires-configuration'

export type ResourceType =
  | 'stream'
  | 'm3u'
  | 'xmltv'
  | 'api'
  | 'directory'
  | 'rss'
  | 'archive'
  | 'web'
  | 'dataset'
  | 'opds'

export interface MediaResource {
  id: string
  name: string
  description: string
  resourceType: ResourceType
  category: string // matches category id in MEDIA_TAXONOMY
  subcategory: string // matches subcategory id
  url: string // direct stream, API, or official resource portal
  country?: string
  region?: string
  language?: string
  provider: string
  discoveryUrl: string // provenance documentation or official repository
  licence?: string
  dateDiscovered: string
  lastVerified: string
  verificationStatus: VerificationStatus
  provides: string
  supportedByKinora: boolean
  playbackUrl?: string
  playbackType?: 'audio' | 'hls' | 'web' | 'api'
  compatibilityNotes?: string
  tags: string[]
  artworkUrl?: string
  artworkFallbackIcon?: IconName
  trailerUrl?: string
  accentHue?: number
  channelCount?: number
  epgAvailable?: boolean
  epgUrl?: string
}

export interface PersonalResourceItem {
  resourceId: string
  addedAt: number
  notes?: string
  isFavourite: boolean
  tags?: string[]
  customResource?: MediaResource
  enabled?: boolean
  lastChecked?: number
  checkStatus?: 'online' | 'offline' | 'degraded' | 'unchecked'
}

export interface PersonalMediaLibraryState {
  version: 1
  items: Record<string, PersonalResourceItem>
  customResources: Record<string, MediaResource>
  lastUpdated: number
}

export const initialPersonalLibraryState: PersonalMediaLibraryState = {
  version: 1,
  items: {},
  customResources: {},
  lastUpdated: Date.now(),
}

export const VERIFICATION_STATUS_META: Record<VerificationStatus, { label: string; tone: string; description: string }> = {
  working: {
    label: 'Working',
    tone: 'var(--positive, #2ebd60)',
    description: 'Reachable, verified, and operational within Kinora or via standard media protocols.',
  },
  verified: {
    label: 'Verified',
    tone: 'var(--info, #38bdf8)',
    description: 'Authoritative origin, valid documentation, and active upstream service confirmed.',
  },
  'partially-working': {
    label: 'Partially Working',
    tone: 'var(--warn, #f59e0b)',
    description: 'Catalogue or metadata available, but certain streams or regional endpoints may have restrictions.',
  },
  'requires-configuration': {
    label: 'Needs Config',
    tone: 'var(--accent, #e53935)',
    description: 'Requires an API token, user key, or external companion setting to connect.',
  },
  discovered: {
    label: 'Discovered',
    tone: 'var(--text-2, #a1a1aa)',
    description: 'Catalogued and indexed for exploration; awaiting in-depth verification.',
  },
  unsupported: {
    label: 'Unsupported',
    tone: 'var(--text-3, #71717a)',
    description: 'Proprietary format, DRM restriction, or out of current desktop player scope; saved for reference.',
  },
  unavailable: {
    label: 'Unavailable',
    tone: 'var(--negative, #ef4444)',
    description: 'Currently offline, discontinued, or unreachable during last verification.',
  },
}
