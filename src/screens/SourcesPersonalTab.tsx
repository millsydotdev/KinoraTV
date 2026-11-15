import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { ResourceCard } from '../components/ResourceCard'
import { ResourceDetailModal } from '../components/ResourceDetailModal'
import { StateBlock } from '../components/ui'
import { useStore } from '../state/store'
import { MEDIA_TAXONOMY } from '../data/mediaTaxonomy'
import type { MediaResource } from '../data/personalLibrary'

export function SourcesPersonalTab() {
  const store = useStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled' | 'online' | 'offline'>('all')
  const [favouriteOnly, setFavouriteOnly] = useState(false)
  const [detailResourceId, setDetailResourceId] = useState<string | null>(null)
  const [importMessage, setImportMessage] = useState<string | null>(null)

  const mySources = store.mediaLibrary.mySources

  const filtered = useMemo(() => {
    let list = [...mySources]
    if (selectedCategory !== 'all') {
      list = list.filter((item) => item.resource.category === selectedCategory)
    }
    if (statusFilter === 'enabled') {
      list = list.filter((item) => item.enabled !== false)
    } else if (statusFilter === 'disabled') {
      list = list.filter((item) => item.enabled === false)
    } else if (statusFilter === 'online') {
      list = list.filter((item) => item.checkStatus === 'online')
    } else if (statusFilter === 'offline') {
      list = list.filter((item) => item.checkStatus === 'offline')
    }
    if (favouriteOnly) {
      list = list.filter((item) => item.isFavourite)
    }
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter((item) =>
        item.resource.name.toLowerCase().includes(q) ||
        item.resource.description.toLowerCase().includes(q) ||
        item.resource.provider.toLowerCase().includes(q) ||
        item.notes?.toLowerCase().includes(q) ||
        item.resource.tags.some((t) => t.toLowerCase().includes(q))
      )
    }
    return list
  }, [mySources, selectedCategory, statusFilter, favouriteOnly, query])

  const detailResource = useMemo(() => {
    if (!detailResourceId) return null
    return store.mediaLibrary.allResources.find((r) => r.id === detailResourceId) ?? null
  }, [detailResourceId, store.mediaLibrary.allResources])

  const selectedItem = useMemo(() => {
    if (!detailResourceId) return null
    return mySources.find((i) => i.resourceId === detailResourceId) ?? null
  }, [detailResourceId, mySources])

  const handleExport = () => {
    const json = store.mediaLibrary.exportPersonalLibrary()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kinora-personal-library-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      const res = store.mediaLibrary.importPersonalLibrary(text)
      if (res.success) {
        setImportMessage(`Successfully imported ${res.count} personal resources.`)
      } else {
        setImportMessage(`Failed to import library: ${res.error}`)
      }
      setTimeout(() => setImportMessage(null), 5000)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handlePlay = (res: MediaResource) => {
    if (res.playbackUrl || res.playbackType === 'audio') {
      store.mediaLibrary.playAudio({
        id: res.id,
        name: res.name,
        provider: res.provider,
        streamUrl: res.playbackUrl ?? res.url,
        artworkUrl: res.artworkUrl,
        accentHue: res.accentHue,
        mediaType: res.category === 'radio' ? 'radio' : res.category === 'podcasts' ? 'podcast' : res.category === 'audiobooks' ? 'audiobook' : res.category === 'music' ? 'music' : 'stream',
      })
    } else {
      setDetailResourceId(res.id)
    }
  }

  const enabledCount = mySources.filter((i) => i.enabled !== false).length
  const onlineCount = mySources.filter((i) => i.checkStatus === 'online').length
  const favCount = mySources.filter((i) => i.isFavourite).length

  return (
    <div className="personal-sources-tab">
      {/* Header & Stats Banner */}
      <div className="personal-sources-hero">
        <div className="personal-sources-facts">
          <div>
            <span className="personal-stat-num">{mySources.length}</span>
            <span className="personal-stat-lbl">Personal Resources</span>
          </div>
          <div className="personal-stat-divider" aria-hidden="true" />
          <div>
            <span className="personal-stat-num">{enabledCount}</span>
            <span className="personal-stat-lbl">Active / Enabled</span>
          </div>
          <div className="personal-stat-divider" aria-hidden="true" />
          <div>
            <span className="personal-stat-num">{onlineCount}</span>
            <span className="personal-stat-lbl">Checked Online</span>
          </div>
          <div className="personal-stat-divider" aria-hidden="true" />
          <div>
            <span className="personal-stat-num">{favCount}</span>
            <span className="personal-stat-lbl">Favourites</span>
          </div>
        </div>

        <div className="personal-sources-actions">
          <Link to="/sources/add?kind=custom" className="btn btn-primary btn-small">
            <Icon name="plus" size={16} /> Add Personal Resource
          </Link>
          <button type="button" className="btn btn-secondary btn-small" onClick={handleExport} disabled={mySources.length === 0}>
            <Icon name="download" size={16} /> Export JSON
          </button>
          <button type="button" className="btn btn-secondary btn-small" onClick={() => fileInputRef.current?.click()}>
            <Icon name="folder" size={16} /> Import JSON
          </button>
          <input ref={fileInputRef} type="file" accept=".json,application/json" hidden onChange={handleFileSelect} />
        </div>
      </div>

      {importMessage && (
        <p className="personal-import-banner" role="status">{importMessage}</p>
      )}

      {/* Filter and Search Bar */}
      <div className="personal-toolbar">
        <div className="personal-search-wrap">
          <Icon name="search" size={16} className="personal-search-icon" />
          <input
            type="search"
            placeholder="Search personal resources or notes..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="personal-search-input"
          />
        </div>

        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="personal-select"
          aria-label="Filter personal resources by category"
        >
          <option value="all">All Categories ({mySources.length})</option>
          {MEDIA_TAXONOMY.map((cat) => {
            const count = mySources.filter((i) => i.resource.category === cat.id).length
            if (count === 0) return null
            return (
              <option key={cat.id} value={cat.id}>
                {cat.name} ({count})
              </option>
            )
          })}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="personal-select"
          aria-label="Filter personal resources by status"
        >
          <option value="all">All Statuses</option>
          <option value="enabled">Active / Enabled ({enabledCount})</option>
          <option value="disabled">Disabled ({mySources.length - enabledCount})</option>
          <option value="online">Online ({onlineCount})</option>
          <option value="offline">Offline ({mySources.filter((i) => i.checkStatus === 'offline').length})</option>
        </select>

        <button
          type="button"
          className={`btn btn-small ${favouriteOnly ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setFavouriteOnly((v) => !v)}
          title={favouriteOnly ? 'Showing favourites only' : 'Filter by favourites'}
        >
          <Icon name="heart" size={14} />
          <span>Favourites {favCount > 0 ? `(${favCount})` : ''}</span>
        </button>
      </div>

      {/* Resource Cards */}
      {mySources.length === 0 ? (
        <StateBlock
          icon="library"
          title="Your personal media library is empty"
          action={
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link to="/sources?tab=discovery" className="btn btn-primary">
                <Icon name="radar" size={16} /> Browse Discovery
              </Link>
              <Link to="/sources/add?kind=custom" className="btn btn-secondary">
                <Icon name="plus" size={16} /> Add Custom Resource
              </Link>
            </div>
          }
        >
          Curate genuine media streams, documented APIs, radio stations, podcast feeds, and digital archives.
          Import verified public resources with one click, or browse the master directory.
        </StateBlock>
      ) : filtered.length === 0 ? (
        <StateBlock
          icon="search"
          title="No personal resources match your query"
          action={
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => { setQuery(''); setSelectedCategory('all'); setStatusFilter('all'); setFavouriteOnly(false) }}
            >
              Reset filters
            </button>
          }
        >
          Try searching for a different name, provider, or category.
        </StateBlock>
      ) : (
        <div className="media-resources-grid variant-wide">
          {filtered.map((item) => (
            <ResourceCard
              key={item.resourceId}
              resource={item.resource}
              variant="wide"
              inLibrary={true}
              isFavourite={item.isFavourite}
              isEnabled={item.enabled !== false}
              checkStatus={item.checkStatus}
              lastChecked={item.lastChecked}
              onToggleLibrary={() => store.mediaLibrary.removeFromPersonalLibrary(item.resourceId)}
              onToggleFavourite={() => store.mediaLibrary.toggleResourceFavourite(item.resourceId)}
              onToggleEnabled={() => store.mediaLibrary.toggleSourceEnabled(item.resourceId)}
              onOpenDetails={() => setDetailResourceId(item.resourceId)}
              onPlay={handlePlay}
              isPlaying={store.mediaLibrary.currentAudio?.id === item.resourceId && store.mediaLibrary.isAudioPlaying}
            />
          ))}
        </div>
      )}

      {/* Details Modal */}
      {detailResource && (
        <ResourceDetailModal
          resource={detailResource}
          inLibrary={true}
          isFavourite={store.mediaLibrary.isResourceFavourite(detailResource.id)}
          userNotes={store.mediaLibrary.getResourceNotes(detailResource.id)}
          isEnabled={selectedItem?.enabled !== false}
          checkStatus={selectedItem?.checkStatus}
          lastChecked={selectedItem?.lastChecked}
          isCustomResource={!!selectedItem?.customResource}
          onClose={() => setDetailResourceId(null)}
          onToggleLibrary={() => store.mediaLibrary.removeFromPersonalLibrary(detailResource.id)}
          onToggleFavourite={() => store.mediaLibrary.toggleResourceFavourite(detailResource.id)}
          onToggleEnabled={() => store.mediaLibrary.toggleSourceEnabled(detailResource.id)}
          onSaveNotes={(notes) => store.mediaLibrary.updateResourceNotes(detailResource.id, notes)}
          onSaveConfig={(updates) => store.mediaLibrary.updateSourceConfig(detailResource.id, updates)}
          onVerifyNow={(id) => store.mediaLibrary.verifyResourceNow(id)}
          onPlay={handlePlay}
          isPlaying={store.mediaLibrary.currentAudio?.id === detailResource.id && store.mediaLibrary.isAudioPlaying}
        />
      )}
    </div>
  )
}
