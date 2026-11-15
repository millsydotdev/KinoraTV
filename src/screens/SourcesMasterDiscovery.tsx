import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { ResourceCard } from '../components/ResourceCard'
import { ResourceDetailModal } from '../components/ResourceDetailModal'
import { StateBlock } from '../components/ui'
import { useToast } from '../components/Toast'
import { useStore } from '../state/store'
import { MEDIA_TAXONOMY } from '../data/mediaTaxonomy'
import type { MediaResource } from '../data/personalLibrary'
import { fetchGuide, fetchPlaylist, guideProgrammes } from '../lib/native'
import { addressLabel, readForPreview } from '../state/playlists'
import { readGuideForPreview } from '../state/guides'

const PAGE_SIZE = 24

const REGIONS = [
  'all',
  'Europe',
  'North America',
  'South America',
  'Africa',
  'Middle East',
  'South Asia',
  'East Asia',
  'Southeast Asia',
  'Oceania',
  'Global',
]

const FORMATS = [
  { value: 'all', label: 'All Formats' },
  { value: 'm3u', label: 'M3U Playlists' },
  { value: 'stream', label: 'Live Streams' },
  { value: 'xmltv', label: 'XMLTV Guides' },
  { value: 'audio', label: 'Radio Streams' },
  { value: 'rss', label: 'Podcasts & RSS' },
  { value: 'api', label: 'Metadata APIs' },
  { value: 'archive', label: 'Digital Archives' },
]

export function SourcesMasterDiscovery() {
  const store = useStore()
  const toast = useToast()

  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedRegion, setSelectedRegion] = useState<string>('all')
  const [selectedCountry, setSelectedCountry] = useState<string>('all')
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all')
  const [selectedFormat, setSelectedFormat] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState<number>(PAGE_SIZE)
  const [detailResourceId, setDetailResourceId] = useState<string | null>(null)
  const [importingId, setImportingId] = useState<string | null>(null)

  const allResources = store.mediaLibrary.allResources

  // Extract unique countries and languages for dropdowns
  const availableCountries = useMemo(() => {
    const set = new Set<string>()
    for (const r of allResources) {
      if (r.country && r.country !== 'International' && r.country !== 'Global') {
        set.add(r.country)
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [allResources])

  const availableLanguages = useMemo(() => {
    const set = new Set<string>()
    for (const r of allResources) {
      if (r.language && r.language !== 'Multilingual') {
        set.add(r.language)
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [allResources])

  const isPlaylistImported = (url: string) => store.playlists.some((p) => p.url === url)
  const isGuideImported = (url: string) => store.guides.some((g) => g.url === url)

  const filtered = useMemo(() => {
    let list = [...allResources]

    if (selectedCategory !== 'all') {
      list = list.filter((r) => r.category === selectedCategory)
    }

    if (selectedRegion !== 'all') {
      list = list.filter((r) => r.region?.toLowerCase() === selectedRegion.toLowerCase())
    }

    if (selectedCountry !== 'all') {
      list = list.filter((r) => r.country?.toLowerCase() === selectedCountry.toLowerCase())
    }

    if (selectedLanguage !== 'all') {
      list = list.filter((r) => r.language?.toLowerCase() === selectedLanguage.toLowerCase())
    }

    if (selectedFormat !== 'all') {
      if (selectedFormat === 'audio') {
        list = list.filter((r) => r.playbackType === 'audio' || r.category === 'radio')
      } else {
        list = list.filter((r) => r.resourceType === selectedFormat)
      }
    }

    if (statusFilter !== 'all') {
      list = list.filter((r) => r.verificationStatus === statusFilter)
    }

    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter((r) =>
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.provider.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        (r.country && r.country.toLowerCase().includes(q)) ||
        (r.language && r.language.toLowerCase().includes(q)) ||
        r.tags.some((t) => t.toLowerCase().includes(q))
      )
    }

    return list
  }, [allResources, selectedCategory, selectedRegion, selectedCountry, selectedLanguage, selectedFormat, statusFilter, query])

  const detailResource = useMemo(() => {
    if (!detailResourceId) return null
    return allResources.find((r) => r.id === detailResourceId) ?? null
  }, [detailResourceId, allResources])

  const handlePlay = (res: MediaResource) => {
    if (res.playbackUrl || res.playbackType === 'audio') {
      store.mediaLibrary.playAudio({
        id: res.id,
        name: res.name,
        provider: res.provider,
        streamUrl: res.playbackUrl ?? res.url,
        artworkUrl: res.artworkUrl,
        accentHue: res.accentHue,
      })
    } else {
      setDetailResourceId(res.id)
    }
  }

  const handleImportPlaylist = async (res: MediaResource) => {
    if (isPlaylistImported(res.url) || importingId) return
    setImportingId(res.id)
    try {
      const result = await readForPreview(() => fetchPlaylist(res.url))
      if ('error' in result) {
        toast(`Failed to read playlist: ${result.error}`)
        return
      }
      const taken = [...store.playlists, ...store.sources, ...store.guides].map((s) => s.name.toLowerCase())
      let name = res.name.slice(0, 44).trim()
      if (taken.includes(name.toLowerCase())) {
        for (let i = 2; ; i++) {
          if (!taken.includes(`${name} ${i}`.toLowerCase())) {
            name = `${name} ${i}`
            break
          }
        }
      }
      store.addPlaylist({ name, origin: 'url', url: res.url, label: addressLabel(res.url) }, result.report)
      toast(`Added ${name} to Live TV: ${result.report.channels.length} channels.`)
    } catch (e) {
      toast(`Failed to import: ${e instanceof Error ? e.message : 'Unknown error'}`)
    } finally {
      setImportingId(null)
    }
  }

  const handleImportGuide = async (res: MediaResource) => {
    if (isGuideImported(res.url) || importingId) return
    setImportingId(res.id)
    const guideId = `gd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    try {
      const ids = [...new Set(store.channels.flatMap((c) => (c.sourceId && c.tvgId ? [c.tvgId] : [])))]
      const result = await readGuideForPreview(
        () => fetchGuide(guideId, res.url),
        async () => {
          if (ids.length === 0) return { matched: 0, wanted: 0 }
          const t = Date.now()
          const answers = await guideProgrammes([{ guide: guideId, ids }], t, t + 60_000)
          return answers ? { matched: answers[0]?.matches.filter((m) => m.channel).length ?? 0, wanted: ids.length } : null
        }
      )
      if ('error' in result) {
        toast(`Failed to read guide: ${result.error}`)
        return
      }
      const forPlaylists = store.playlists.map((p) => p.id)
      store.addGuide(guideId, { name: res.name.trim(), origin: 'url', url: res.url, label: addressLabel(res.url), playlists: forPlaylists }, result.summary)
      toast(`Added ${res.name.trim()}: ${result.summary.programmes} programmes.`)
    } catch (e) {
      toast(`Failed to import guide: ${e instanceof Error ? e.message : 'Unknown error'}`)
    } finally {
      setImportingId(null)
    }
  }

  const resetAllFilters = () => {
    setSelectedCategory('all')
    setSelectedRegion('all')
    setSelectedCountry('all')
    setSelectedLanguage('all')
    setSelectedFormat('all')
    setStatusFilter('all')
    setQuery('')
    setShown(PAGE_SIZE)
  }

  const hasActiveFilters = selectedCategory !== 'all' || selectedRegion !== 'all' || selectedCountry !== 'all' || selectedLanguage !== 'all' || selectedFormat !== 'all' || statusFilter !== 'all' || query.trim() !== ''

  return (
    <div className="master-discovery-section">
      <div className="master-discovery-toolbar">
        <div className="personal-search-wrap">
          <Icon name="search" size={16} className="personal-search-icon" />
          <input
            type="search"
            placeholder="Search across all categories, countries, broadcasters, and tags..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShown(PAGE_SIZE) }}
            className="personal-search-input"
          />
        </div>

        <div className="master-discovery-filters">
          {/* Category */}
          <select
            value={selectedCategory}
            onChange={(e) => { setSelectedCategory(e.target.value); setShown(PAGE_SIZE) }}
            className="personal-select"
            aria-label="Filter by category"
          >
            <option value="all">All 20 Categories ({allResources.length})</option>
            {MEDIA_TAXONOMY.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name} ({allResources.filter((r) => r.category === cat.id).length})
              </option>
            ))}
          </select>

          {/* Region */}
          <select
            value={selectedRegion}
            onChange={(e) => { setSelectedRegion(e.target.value); setShown(PAGE_SIZE) }}
            className="personal-select"
            aria-label="Filter by region"
          >
            <option value="all">All Regions</option>
            {REGIONS.filter((r) => r !== 'all').map((r) => (
              <option key={r} value={r}>
                {r} ({allResources.filter((res) => res.region?.toLowerCase() === r.toLowerCase()).length})
              </option>
            ))}
          </select>

          {/* Country */}
          <select
            value={selectedCountry}
            onChange={(e) => { setSelectedCountry(e.target.value); setShown(PAGE_SIZE) }}
            className="personal-select"
            aria-label="Filter by country"
          >
            <option value="all">All Countries ({availableCountries.length})</option>
            {availableCountries.map((c) => (
              <option key={c} value={c}>
                {c} ({allResources.filter((res) => res.country === c).length})
              </option>
            ))}
          </select>

          {/* Language */}
          <select
            value={selectedLanguage}
            onChange={(e) => { setSelectedLanguage(e.target.value); setShown(PAGE_SIZE) }}
            className="personal-select"
            aria-label="Filter by language"
          >
            <option value="all">All Languages ({availableLanguages.length})</option>
            {availableLanguages.map((l) => (
              <option key={l} value={l}>
                {l} ({allResources.filter((res) => res.language === l).length})
              </option>
            ))}
          </select>

          {/* Format / Type */}
          <select
            value={selectedFormat}
            onChange={(e) => { setSelectedFormat(e.target.value); setShown(PAGE_SIZE) }}
            className="personal-select"
            aria-label="Filter by format"
          >
            {FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>

          {/* Status */}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setShown(PAGE_SIZE) }}
            className="personal-select"
            aria-label="Filter by status"
          >
            <option value="all">All Statuses</option>
            <option value="working">Working Only</option>
            <option value="verified">Verified Only</option>
            <option value="partially-working">Partially Working</option>
          </select>
        </div>
      </div>

      <div className="master-discovery-count-bar">
        <span>
          Showing <strong>{filtered.length}</strong> verified resources
          {filtered.length > shown ? ` (displaying 1 to ${shown})` : ''}
        </span>
        {hasActiveFilters && (
          <button type="button" className="text-link" onClick={resetAllFilters}>
            Reset all filters
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <StateBlock
          icon="search"
          title="No resources found"
          action={
            <button
              type="button"
              className="btn btn-secondary"
              onClick={resetAllFilters}
            >
              Reset filters
            </button>
          }
        >
          No resources matched your search terms and filters. Try clearing country or category filters to broaden your search.
        </StateBlock>
      ) : (
        <>
          <div className="media-resources-grid">
            {filtered.slice(0, shown).map((res) => (
              <ResourceCard
                key={res.id}
                resource={res}
                inLibrary={store.mediaLibrary.isInPersonalLibrary(res.id)}
                isFavourite={store.mediaLibrary.isResourceFavourite(res.id)}
                onToggleLibrary={() =>
                  store.mediaLibrary.isInPersonalLibrary(res.id)
                    ? store.mediaLibrary.removeFromPersonalLibrary(res.id)
                    : store.mediaLibrary.addToPersonalLibrary(res.id)
                }
                onToggleFavourite={() => store.mediaLibrary.toggleResourceFavourite(res.id)}
                onOpenDetails={() => setDetailResourceId(res.id)}
                onPlay={handlePlay}
                isPlaying={store.mediaLibrary.currentAudio?.id === res.id && store.mediaLibrary.isAudioPlaying}
              />
            ))}
          </div>

          {filtered.length > shown && (
            <div style={{ display: 'flex', justifyContent: 'center', margin: '24px 0' }}>
              <button
                type="button"
                className="btn btn-secondary catalogue-more"
                onClick={() => setShown((n) => n + PAGE_SIZE)}
              >
                Show {Math.min(PAGE_SIZE, filtered.length - shown)} more of {filtered.length - shown}
              </button>
            </div>
          )}
        </>
      )}

      {detailResource && (
        <ResourceDetailModal
          resource={detailResource}
          inLibrary={store.mediaLibrary.isInPersonalLibrary(detailResource.id)}
          isFavourite={store.mediaLibrary.isResourceFavourite(detailResource.id)}
          userNotes={store.mediaLibrary.getResourceNotes(detailResource.id)}
          onClose={() => setDetailResourceId(null)}
          onToggleLibrary={() =>
            store.mediaLibrary.isInPersonalLibrary(detailResource.id)
              ? store.mediaLibrary.removeFromPersonalLibrary(detailResource.id)
              : store.mediaLibrary.addToPersonalLibrary(detailResource.id)
          }
          onToggleFavourite={() => store.mediaLibrary.toggleResourceFavourite(detailResource.id)}
          onSaveNotes={(notes) => store.mediaLibrary.updateResourceNotes(detailResource.id, notes)}
          onVerifyNow={(id) => store.mediaLibrary.verifyResourceNow(id)}
          onPlay={handlePlay}
          isPlaying={store.mediaLibrary.currentAudio?.id === detailResource.id && store.mediaLibrary.isAudioPlaying}
          isPlaylistImported={isPlaylistImported(detailResource.url)}
          isGuideImported={isGuideImported(detailResource.url)}
          onImportPlaylist={handleImportPlaylist}
          onImportGuide={handleImportGuide}
          importingNative={importingId === detailResource.id}
        />
      )}
    </div>
  )
}
