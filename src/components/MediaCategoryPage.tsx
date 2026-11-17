import { useMemo, useState } from 'react'
import { PageHeader } from './PageHeader'
import { Icon } from './Icon'
import { ResourceCard, type ResourceCardVariant } from './ResourceCard'
import { ResourceDetailModal } from './ResourceDetailModal'
import { StateBlock } from './ui'
import { filterKidSafeResources } from '../lib/kidsMode'
import { useProfiles } from '../state/profiles'
import { useStore } from '../state/store'
import { getCategory } from '../data/mediaTaxonomy'
import type { MediaResource } from '../data/personalLibrary'
import './MediaCategoryPage.css'

interface MediaCategoryPageProps {
  categoryId: string
  customBannerHero?: React.ReactNode
  featuredIds?: string[]
  cardVariant?: ResourceCardVariant
}

export function MediaCategoryPage({ categoryId, customBannerHero, featuredIds, cardVariant }: MediaCategoryPageProps) {
  const store = useStore()
  const { isKidsMode } = useProfiles()
  const categoryDef = getCategory(categoryId)

  const computedCardVariant: ResourceCardVariant = cardVariant ?? (
    categoryId === 'radio' || categoryId === 'podcasts' || categoryId === 'music' ? 'square' :
    categoryId === 'audiobooks' || categoryId === 'books' ? 'poster' : 'wide'
  )

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [viewFilter, setViewFilter] = useState<'all' | 'my-sources' | 'favourites'>('all')
  const [sortBy, setSortBy] = useState<'name' | 'recent' | 'status'>('name')
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null)

  // Resources belonging to this category
  const categoryResources = useMemo(() => {
    const raw = store.mediaLibrary.allResources.filter((r) => r.category === categoryId)
    return isKidsMode ? filterKidSafeResources(raw, true) : raw
  }, [store.mediaLibrary.allResources, categoryId, isKidsMode])

  // Filter and sort
  const filteredResources = useMemo(() => {
    let list = [...categoryResources]

    if (viewFilter === 'my-sources') {
      list = list.filter((r) => store.mediaLibrary.isInPersonalLibrary(r.id))
    } else if (viewFilter === 'favourites') {
      list = list.filter((r) => store.mediaLibrary.isResourceFavourite(r.id))
    }

    if (selectedSubcategory !== 'all') {
      list = list.filter((r) => r.subcategory === selectedSubcategory)
    }

    if (statusFilter !== 'all') {
      list = list.filter((r) => r.verificationStatus === statusFilter)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter((r) =>
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.provider.toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q))
      )
    }

    list.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (sortBy === 'recent') return b.dateDiscovered.localeCompare(a.dateDiscovered)
      if (sortBy === 'status') return a.verificationStatus.localeCompare(b.verificationStatus)
      return 0
    })

    return list
  }, [categoryResources, viewFilter, selectedSubcategory, statusFilter, searchQuery, sortBy, store.mediaLibrary])

  // Featured resources
  const featuredResources = useMemo(() => {
    if (!featuredIds || featuredIds.length === 0) return []
    return categoryResources.filter((r) => featuredIds.includes(r.id))
  }, [categoryResources, featuredIds])

  const selectedResource = useMemo(() => {
    if (!selectedResourceId) return null
    return store.mediaLibrary.allResources.find((r) => r.id === selectedResourceId) ?? null
  }, [selectedResourceId, store.mediaLibrary.allResources])

  const isFiltering = selectedSubcategory !== 'all' || searchQuery.trim() !== '' || viewFilter !== 'all' || statusFilter !== 'all'
  const showFeaturedSection = !isFiltering && featuredResources.length > 0 && categoryResources.length > featuredResources.length

  const mainList = useMemo(() => {
    if (showFeaturedSection && featuredIds) {
      return filteredResources.filter((r) => !featuredIds.includes(r.id))
    }
    return filteredResources
  }, [filteredResources, showFeaturedSection, featuredIds])

  const handlePlay = (res: MediaResource) => {
    if (res.playbackUrl || res.playbackType === 'audio') {
      const streamUrl = res.playbackUrl ?? res.url
      store.mediaLibrary.playAudio({
        id: res.id,
        name: res.name,
        provider: res.provider,
        streamUrl,
        artworkUrl: res.artworkUrl,
        accentHue: res.accentHue,
        mediaType: res.category === 'radio' ? 'radio' : res.category === 'podcasts' ? 'podcast' : res.category === 'audiobooks' ? 'audiobook' : res.category === 'music' ? 'music' : 'stream',
      })
    } else {
      setSelectedResourceId(res.id)
    }
  }

  const workingCount = categoryResources.filter((r) => r.verificationStatus === 'working').length

  return (
    <>
      <PageHeader
        title={categoryDef?.name ?? 'Media Category'}
        search={false}
      />

      <div className="page media-category-page">
        {/* Hero Section */}
        {customBannerHero ? (
          customBannerHero
        ) : (
          <div className="media-hero-banner">
            <div className="media-hero-content">
              <span className="media-hero-kicker">KINORA MEDIA LIBRARY</span>
              <h1 className="media-hero-title">{categoryDef?.name}</h1>
              <p className="media-hero-subtitle">{categoryDef?.description}</p>

              <div className="media-hero-stats">
                <span className="media-stat-item">
                  <strong>{categoryResources.length}</strong> Resources Catalogued
                </span>
                <span className="media-stat-separator" aria-hidden="true">·</span>
                <span className="media-stat-item">
                  <strong>{workingCount}</strong> Directly Operational
                </span>
                <span className="media-stat-separator" aria-hidden="true">·</span>
                <span className="media-stat-item">
                  <strong>{categoryDef?.subcategories.length ?? 0}</strong> Subcategories
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Featured Section (if any) */}
        {showFeaturedSection && (
          <section className="media-sec featured-sec" aria-label="Featured Resources">
            <h2 className="media-sec-heading">
              <Icon name="radar" size={18} />
              <span>Featured {categoryDef?.shortName} Resources</span>
            </h2>
            <div className={`media-resources-grid variant-${computedCardVariant}`}>
              {featuredResources.map((res) => (
                <ResourceCard
                  key={res.id}
                  resource={res}
                  variant={computedCardVariant}
                  inLibrary={store.mediaLibrary.isInPersonalLibrary(res.id)}
                  isFavourite={store.mediaLibrary.isResourceFavourite(res.id)}
                  onToggleLibrary={() => store.mediaLibrary.isInPersonalLibrary(res.id) ? store.mediaLibrary.removeFromPersonalLibrary(res.id) : store.mediaLibrary.addToPersonalLibrary(res.id)}
                  onToggleFavourite={() => store.mediaLibrary.toggleResourceFavourite(res.id)}
                  onOpenDetails={() => setSelectedResourceId(res.id)}
                  onPlay={handlePlay}
                  isPlaying={store.mediaLibrary.currentAudio?.id === res.id && store.mediaLibrary.isAudioPlaying}
                />
              ))}
            </div>
          </section>
        )}

        {/* Subcategories Filter Rail */}
        {categoryDef && categoryDef.subcategories.length > 0 && (
          <div className="media-subcategories-rail" role="tablist" aria-label="Filter by Subcategory">
            <button
              type="button"
              className={`media-subcat-chip ${selectedSubcategory === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedSubcategory('all')}
            >
              All ({categoryResources.length})
            </button>
            {categoryDef.subcategories.map((sub) => {
              const count = categoryResources.filter((r) => r.subcategory === sub.id).length
              return (
                <button
                  key={sub.id}
                  type="button"
                  className={`media-subcat-chip ${selectedSubcategory === sub.id ? 'active' : ''}`}
                  onClick={() => setSelectedSubcategory(sub.id)}
                >
                  {sub.name} {count > 0 && <span className="chip-count">({count})</span>}
                </button>
              )
            })}
          </div>
        )}

        {/* Controls Toolbar */}
        <div className="media-toolbar">
          <div className="media-search-wrap">
            <Icon name="search" size={16} className="media-search-icon" />
            <input
              type="search"
              placeholder={`Search ${categoryDef?.shortName.toLowerCase() ?? 'resources'}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="media-search-input"
            />
          </div>

          <div className="media-filters-group">
            {/* View filter: Public Discovery, My Sources, Favourites */}
            <div className="media-view-segmented" role="group" aria-label="View Filter">
              <button
                type="button"
                className={`media-seg-btn ${viewFilter === 'all' ? 'active' : ''}`}
                onClick={() => setViewFilter('all')}
              >
                Public Discovery
              </button>
              <button
                type="button"
                className={`media-seg-btn ${viewFilter === 'my-sources' ? 'active' : ''}`}
                onClick={() => setViewFilter('my-sources')}
              >
                My Sources ({categoryResources.filter((r) => store.mediaLibrary.isInPersonalLibrary(r.id)).length})
              </button>
              <button
                type="button"
                className={`media-seg-btn ${viewFilter === 'favourites' ? 'active' : ''}`}
                onClick={() => setViewFilter('favourites')}
              >
                Favourites
              </button>
            </div>

            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="media-select"
              aria-label="Filter by verification status"
            >
              <option value="all">All Verification Statuses</option>
              <option value="working">Working Only</option>
              <option value="verified">Verified Only</option>
              <option value="partially-working">Partially Working</option>
              <option value="unsupported">External / Unsupported</option>
            </select>

            {/* Sort order */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'name' | 'recent' | 'status')}
              className="media-select"
              aria-label="Sort resources"
            >
              <option value="name">Sort by Name</option>
              <option value="recent">Recently Discovered</option>
              <option value="status">Verification Status</option>
            </select>
          </div>
        </div>

        {/* Main Resource Cards Grid */}
        <section className="media-sec" aria-label="Catalogued Resources">
          <div className="media-sec-header">
            <h2 className="media-sec-title">
              {viewFilter === 'my-sources' ? 'My Saved Sources' : viewFilter === 'favourites' ? 'My Favourites' : 'Public Discovery Catalogue'}
              <span className="media-sec-count">({filteredResources.length})</span>
            </h2>
          </div>

          {mainList.length === 0 ? (
            viewFilter === 'my-sources' ? (
              <StateBlock
                icon="sources"
                title="No Personal Sources Saved in this Category"
                action={
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setViewFilter('all')}
                  >
                    Browse Public Discovery
                  </button>
                }
              >
                You have not added any {categoryDef?.shortName ?? 'media'} sources to your personal library yet. Switch to Public Discovery to explore verified open streams and catalogues, and click + on any card to save them to My Sources.
              </StateBlock>
            ) : viewFilter === 'favourites' ? (
              <StateBlock
                icon="heart"
                title="No Favourited Sources"
                action={
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setViewFilter('all')}
                  >
                    Browse Public Discovery
                  </button>
                }
              >
                You have not favourited any {categoryDef?.shortName ?? 'media'} resources yet. Click the heart icon on any card to add it to your favourites for quick access.
              </StateBlock>
            ) : (
              <StateBlock
                icon="search"
                title="No resources match your filters"
                action={
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setSearchQuery('')
                      setSelectedSubcategory('all')
                      setStatusFilter('all')
                      setViewFilter('all')
                    }}
                  >
                    Reset all filters
                  </button>
                }
              >
                Try clearing the search query or expanding the subcategory selection to view more available media.
              </StateBlock>
            )
          ) : (
            <div className={`media-resources-grid variant-${computedCardVariant}`}>
              {mainList.map((res) => (
                <ResourceCard
                  key={res.id}
                  resource={res}
                  variant={computedCardVariant}
                  inLibrary={store.mediaLibrary.isInPersonalLibrary(res.id)}
                  isFavourite={store.mediaLibrary.isResourceFavourite(res.id)}
                  onToggleLibrary={() => store.mediaLibrary.isInPersonalLibrary(res.id) ? store.mediaLibrary.removeFromPersonalLibrary(res.id) : store.mediaLibrary.addToPersonalLibrary(res.id)}
                  onToggleFavourite={() => store.mediaLibrary.toggleResourceFavourite(res.id)}
                  onOpenDetails={() => setSelectedResourceId(res.id)}
                  onPlay={handlePlay}
                  isPlaying={store.mediaLibrary.currentAudio?.id === res.id && store.mediaLibrary.isAudioPlaying}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Detail Modal */}
      {selectedResource && (
        <ResourceDetailModal
          resource={selectedResource}
          inLibrary={store.mediaLibrary.isInPersonalLibrary(selectedResource.id)}
          isFavourite={store.mediaLibrary.isResourceFavourite(selectedResource.id)}
          userNotes={store.mediaLibrary.getResourceNotes(selectedResource.id)}
          onClose={() => setSelectedResourceId(null)}
          onToggleLibrary={() => store.mediaLibrary.isInPersonalLibrary(selectedResource.id) ? store.mediaLibrary.removeFromPersonalLibrary(selectedResource.id) : store.mediaLibrary.addToPersonalLibrary(selectedResource.id)}
          onToggleFavourite={() => store.mediaLibrary.toggleResourceFavourite(selectedResource.id)}
          onSaveNotes={(notes) => store.mediaLibrary.updateResourceNotes(selectedResource.id, notes)}
          onVerifyNow={(id) => store.mediaLibrary.verifyResourceNow(id)}
          onPlay={handlePlay}
          isPlaying={store.mediaLibrary.currentAudio?.id === selectedResource.id && store.mediaLibrary.isAudioPlaying}
        />
      )}
    </>
  )
}
