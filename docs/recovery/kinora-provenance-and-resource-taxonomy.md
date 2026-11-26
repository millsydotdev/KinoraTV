# Kinora Provenance and Resource Taxonomy Specification

This document provides a comprehensive reference for the Data Provenance and Resource Capability Taxonomy implemented in `src/data/provenance.ts`. It establishes strict definitions, UI presentation rules, and classification algorithms for all media assets handled by Kinora.

## 1. Data Provenance Classifications

Provenance indicates the authoritative origin and trust level of every record rendered in the user interface.

| Provenance ID | Label | Short Label | Description | Badge Class | Tone / Token |
|---|---|---|---|---|---|
| `dev-fixture` | Development Fixture | Dev Fixture | Synthetic test fixture generated for UI demonstration. Never saved to user profile. | `provenance-dev-fixture` | `var(--warn, #f59e0b)` |
| `personal-source` | Personal Source | My Source | Source explicitly configured, imported, or bookmarked by the user into their personal profile. | `provenance-personal-source` | `var(--positive, #2ebd60)` |
| `public-discovery` | Public Discovery | Discovery | Curated public domain archive, open educational directory, or open cultural collection. | `provenance-public-discovery` | `var(--info, #38bdf8)` |
| `provider-catalogue` | Provider Catalogue | Provider | On-demand movie or TV series catalogue served via authenticated Xtream service. | `provenance-provider-catalogue` | `var(--accent, #e53935)` |
| `live-broadcast` | Live Broadcast | Live TV | Linear television broadcast from an active M3U playlist or live Xtream channel. | `provenance-live-broadcast` | `var(--cyan, #06b6d4)` |
| `local-media` | Local Media | Local | Personal file residing on local filesystem storage or connected network share. | `provenance-local-media` | `var(--purple, #a855f7)` |
| `metadata-only` | Metadata Only | Metadata | Informational catalogue listing, schedule index, or database entry without direct media playback. | `provenance-metadata-only` | `var(--text-muted, #94a3b8)` |

---

## 2. Resource Capability Classifications

Capability indicates the exact operational behavior and playback readiness of a given resource when engaged by the user.

| Capability ID | Label | Icon | Playable in App | Description |
|---|---|---|---|---|
| `playable-stream` | Live Video Stream | `play` | Yes | Live HLS/DASH video stream served through the guarded native proxy (`kstream://`). |
| `playable-vod` | On-Demand Video | `film` | Yes | Feature film or episodic video stream played via the native player engine. |
| `live-audio` | Live Audio Broadcast | `radio` | Yes | Real-time audio stream (e.g. icecast/shoutcast) played through the HTML5 audio subsystem. |
| `podcast` | Episodic Podcast | `podcast` | Yes | RSS podcast feed containing downloadable or streamable audio episodes. |
| `public-archive` | Public Domain Archive | `archive` | Contextual | Preserved classic cinema, historical audio, or cultural document repository. |
| `downloadable-book` | Digital Book / OPDS | `book` | No | Public domain literature, Open Library catalogue, or Gutenberg text distribution. |
| `external-website` | External Web Resource | `link` | No | Official broadcaster web portal, reference documentation, or institutional index. |
| `metadata-provider` | Metadata Database | `database` | No | REST API endpoint or structured dataset providing credits, ratings, or artwork. |
| `epg-provider` | EPG Schedule Feed | `guide` | No | XMLTV guide source providing linear programme timings and channel metadata. |
| `other` | Resource Directory | `sources` | No | General directory or composite media catalogue. |

---

## 3. Classification Engine Implementation

Classification logic is centralized in `src/data/provenance.ts` through `classifyMediaResource()`:

```typescript
export function classifyMediaResource(
  resource: MediaResource,
  isInPersonalLibrary: boolean,
  isDemoActive = false,
): { provenance: ProvenanceMeta; capability: CapabilityMeta } {
  // 1. Provenance Resolution
  let provKey: DataProvenance = 'public-discovery'
  if (isDemoActive && resource.id.startsWith('demo-')) {
    provKey = 'dev-fixture'
  } else if (isInPersonalLibrary) {
    provKey = 'personal-source'
  } else if (resource.resourceType === 'dataset' || resource.resourceType === 'api') {
    provKey = 'metadata-only'
  }

  // 2. Capability Resolution
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
```

---

## 4. UI Design Tokens and Badging Guidelines

1. **Card Overlays**: In `ResourceCard.tsx`, the provenance badge is pinned to the top-left of the artwork thumbnail (`.res-provenance-pill`).
2. **Capability Badges**: Capability pills (`.res-cap-pill`) are rendered inline within the metadata footer to clearly communicate whether clicking the card initiates in-app playback or launches an external portal.
3. **Detail Sheets**: Detail headers (`ResourceDetailModal.tsx`, `MovieDetail.tsx`, `SeriesDetail.tsx`) display both pills adjacent to the category tags.
4. **Search Results**: Search rows (`Search.tsx`) display the compact provenance badge beside the item title.
