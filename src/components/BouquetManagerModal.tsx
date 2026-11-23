import { useState, useMemo } from 'react'
import { Dialog } from './Dialog'
import { Icon, type IconName } from './Icon'
import {
  loadBouquetConfig,
  saveBouquetConfig,
  createBouquet,
  updateBouquet,
  deleteBouquet,
  reorderCategories,
  setCategoryVisibility,
  type Bouquet,
  type BouquetConfig,
} from '../lib/bouquetManager'
import { useProfiles } from '../state/profiles'
import { useToast } from './Toast'
import type { Channel } from '../data/types'
import './BouquetManagerModal.css'

interface BouquetManagerModalProps {
  open: boolean
  onClose: () => void
  categories: string[]
  channels: Channel[]
  onConfigChange?: () => void
}

const AVAILABLE_ICONS: { name: IconName; label: string }[] = [
  { name: 'sparkles', label: 'Sparkles' },
  { name: 'star', label: 'Star' },
  { name: 'sports', label: 'Sports' },
  { name: 'flame', label: 'Flame' },
  { name: 'heart', label: 'Heart' },
  { name: 'tv', label: 'TV' },
  { name: 'news', label: 'News' },
  { name: 'film', label: 'Film' },
]

export function BouquetManagerModal({
  open,
  onClose,
  categories,
  channels,
  onConfigChange,
}: BouquetManagerModalProps) {
  const toast = useToast()
  const { activeProfile } = useProfiles()
  const profileId = activeProfile?.id ?? 'default'

  const [activeTab, setActiveTab] = useState<'categories' | 'bouquets'>('categories')
  const [config, setConfig] = useState<BouquetConfig>(() => loadBouquetConfig(profileId))
  const [categorySearch, setCategorySearch] = useState('')

  // Bouquet editor state
  const [editingBouquet, setEditingBouquet] = useState<Bouquet | null>(null)
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [bouquetName, setBouquetName] = useState('')
  const [bouquetIcon, setBouquetIcon] = useState<IconName>('sparkles')
  const [selectedChannelIds, setSelectedChannelIds] = useState<Set<string>>(new Set())
  const [channelSearch, setChannelSearch] = useState('')

  // Compute channel count per category
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of channels) {
      const groups = c.categories && c.categories.length > 0 ? c.categories : c.group ? [c.group] : ['General']
      for (const g of groups) {
        counts.set(g, (counts.get(g) ?? 0) + 1)
      }
    }
    return counts
  }, [channels])

  // Ordered and filtered categories for display
  const orderedCategories = useMemo(() => {
    const orderMap = new Map<string, number>()
    config.categoryOrder.forEach((cat, idx) => orderMap.set(cat, idx))

    const list = [...categories].sort((a, b) => {
      const idxA = orderMap.has(a) ? orderMap.get(a)! : 9999
      const idxB = orderMap.has(b) ? orderMap.get(b)! : 9999
      if (idxA !== idxB) return idxA - idxB
      return a.localeCompare(b)
    })

    if (!categorySearch.trim()) return list
    const q = categorySearch.toLowerCase()
    return list.filter((c) => c.toLowerCase().includes(q))
  }, [categories, config.categoryOrder, categorySearch])

  if (!open) return null

  const refreshConfig = () => {
    const fresh = loadBouquetConfig(profileId)
    setConfig(fresh)
    onConfigChange?.()
  }

  const handleToggleCategory = (cat: string) => {
    const isHidden = config.hiddenCategories.includes(cat)
    setCategoryVisibility(cat, isHidden, profileId)
    refreshConfig()
    toast(isHidden ? `Category "${cat}" is now visible` : `Category "${cat}" is now hidden`)
  }

  const handleMoveCategory = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= orderedCategories.length) return

    const currentOrder = orderedCategories.length === categories.length
      ? [...orderedCategories]
      : Array.from(new Set([...orderedCategories, ...categories]))

    const item = currentOrder[index]!
    currentOrder.splice(index, 1)
    currentOrder.splice(targetIndex, 0, item)

    reorderCategories(currentOrder, profileId)
    refreshConfig()
  }

  const handleResetCategories = () => {
    saveBouquetConfig({
      ...config,
      hiddenCategories: [],
      categoryOrder: [],
    }, profileId)
    refreshConfig()
    toast('Categories restored to default order and visibility')
  }

  const handleStartCreateBouquet = () => {
    setIsCreatingNew(true)
    setEditingBouquet(null)
    setBouquetName('')
    setBouquetIcon('sparkles')
    setSelectedChannelIds(new Set())
    setChannelSearch('')
  }

  const handleStartEditBouquet = (b: Bouquet) => {
    setIsCreatingNew(false)
    setEditingBouquet(b)
    setBouquetName(b.name)
    setBouquetIcon((b.icon as IconName) || 'sparkles')
    setSelectedChannelIds(new Set(b.channelIds))
    setChannelSearch('')
  }

  const handleCancelBouquetEdit = () => {
    setIsCreatingNew(false)
    setEditingBouquet(null)
    setBouquetName('')
    setSelectedChannelIds(new Set())
  }

  const handleSaveBouquet = () => {
    const name = bouquetName.trim()
    if (!name) {
      toast('Please enter a bouquet name')
      return
    }

    if (isCreatingNew) {
      createBouquet(name, Array.from(selectedChannelIds), bouquetIcon, profileId)
      toast(`Created bouquet "${name}"`)
    } else if (editingBouquet) {
      updateBouquet(editingBouquet.id, {
        name,
        icon: bouquetIcon,
        channelIds: Array.from(selectedChannelIds),
      }, profileId)
      toast(`Updated bouquet "${name}"`)
    }

    handleCancelBouquetEdit()
    refreshConfig()
  }

  const handleDeleteBouquet = (id: string, name: string) => {
    deleteBouquet(id, profileId)
    toast(`Deleted bouquet "${name}"`)
    refreshConfig()
  }

  const handleToggleChannelSelect = (channelId: string) => {
    setSelectedChannelIds((prev) => {
      const next = new Set(prev)
      if (next.has(channelId)) {
        next.delete(channelId)
      } else {
        next.add(channelId)
      }
      return next
    })
  }

  const filteredChannelsForPicker = channels.filter((c) => {
    if (!channelSearch.trim()) return true
    const q = channelSearch.toLowerCase()
    return c.name.toLowerCase().includes(q) || (c.group && c.group.toLowerCase().includes(q))
  })

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Category & Bouquet Manager"
      variant="dialog"
      wide
    >
      <div className="bouquet-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={`bouquet-tab-btn ${activeTab === 'categories' ? 'is-active' : ''}`}
          aria-selected={activeTab === 'categories'}
          onClick={() => {
            setActiveTab('categories')
            handleCancelBouquetEdit()
          }}
        >
          <Icon name="tag" size={16} />
          <span>Category Visibility & Order</span>
        </button>
        <button
          type="button"
          role="tab"
          className={`bouquet-tab-btn ${activeTab === 'bouquets' ? 'is-active' : ''}`}
          aria-selected={activeTab === 'bouquets'}
          onClick={() => setActiveTab('bouquets')}
        >
          <Icon name="sparkles" size={16} />
          <span>Custom Bouquets ({config.bouquets.length})</span>
        </button>
      </div>

      {activeTab === 'categories' && (
        <div className="bouquet-tab-panel">
          <div className="bouquet-bar">
            <div className="bouquet-search-wrap">
              <Icon name="search" size={14} className="bouquet-search-icon" />
              <input
                type="text"
                className="bouquet-search-input"
                placeholder="Filter categories..."
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                aria-label="Filter categories"
              />
              {categorySearch && (
                <button
                  type="button"
                  className="icon-btn-micro"
                  onClick={() => setCategorySearch('')}
                  aria-label="Clear filter"
                >
                  <Icon name="x" size={12} />
                </button>
              )}
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={handleResetCategories}
            >
              <Icon name="refresh" size={14} />
              <span>Reset to Defaults</span>
            </button>
          </div>

          <div className="bouquet-category-list" role="list">
            {orderedCategories.length === 0 ? (
              <div className="bouquet-empty">No categories match your search.</div>
            ) : (
              orderedCategories.map((cat, idx) => {
                const isHidden = config.hiddenCategories.includes(cat)
                const count = categoryCounts.get(cat) ?? 0
                return (
                  <div
                    key={cat}
                    className={`bouquet-category-row ${isHidden ? 'is-hidden-row' : ''}`}
                    role="listitem"
                  >
                    <div className="bouquet-category-info">
                      <span className="bouquet-category-name">{cat}</span>
                      <span className="bouquet-count-badge">{count} channels</span>
                    </div>

                    <div className="bouquet-category-actions">
                      <button
                        type="button"
                        className="btn-reorder"
                        disabled={idx === 0}
                        onClick={() => handleMoveCategory(idx, 'up')}
                        aria-label={`Move ${cat} up`}
                        title="Move Up"
                      >
                        <Icon name="up" size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn-reorder"
                        disabled={idx === orderedCategories.length - 1}
                        onClick={() => handleMoveCategory(idx, 'down')}
                        aria-label={`Move ${cat} down`}
                        title="Move Down"
                      >
                        <Icon name="down" size={14} />
                      </button>
                      <button
                        type="button"
                        className={`btn-visibility ${isHidden ? 'is-off' : 'is-on'}`}
                        onClick={() => handleToggleCategory(cat)}
                        aria-label={isHidden ? `Show ${cat}` : `Hide ${cat}`}
                        title={isHidden ? 'Click to show' : 'Click to hide'}
                      >
                        <Icon name={isHidden ? 'eyeOff' : 'eye'} size={15} />
                        <span>{isHidden ? 'Hidden' : 'Visible'}</span>
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {activeTab === 'bouquets' && (
        <div className="bouquet-tab-panel">
          {!isCreatingNew && !editingBouquet ? (
            <>
              <div className="bouquet-bar">
                <p className="bouquet-desc">
                  Create custom channel bouquets (e.g. "Weekend Sports", "News Only", "Kids Cartoons") to filter your channels into dedicated custom groups.
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-small"
                  onClick={handleStartCreateBouquet}
                >
                  <Icon name="plus" size={14} />
                  <span>Create Bouquet</span>
                </button>
              </div>

              <div className="bouquet-list">
                {config.bouquets.length === 0 ? (
                  <div className="bouquet-empty">
                    <Icon name="sparkles" size={32} />
                    <p>No custom bouquets created yet.</p>
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      onClick={handleStartCreateBouquet}
                    >
                      Create your first bouquet
                    </button>
                  </div>
                ) : (
                  config.bouquets.map((b) => (
                    <div key={b.id} className="bouquet-card">
                      <div className="bouquet-card-header">
                        <div className="bouquet-card-title">
                          <Icon name={(b.icon as IconName) || 'sparkles'} size={18} className="bouquet-icon" />
                          <strong>{b.name}</strong>
                          <span className="bouquet-count-badge">{b.channelIds.length} channels</span>
                        </div>
                        <div className="bouquet-card-actions">
                          <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            onClick={() => handleStartEditBouquet(b)}
                          >
                            <Icon name="edit" size={13} />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-small danger-hover"
                            onClick={() => handleDeleteBouquet(b.id, b.name)}
                            aria-label={`Delete ${b.name}`}
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="bouquet-editor">
              <div className="bouquet-editor-header">
                <h3>{isCreatingNew ? 'Create New Bouquet' : `Edit Bouquet: ${editingBouquet?.name}`}</h3>
                <div className="bouquet-editor-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    onClick={handleCancelBouquetEdit}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-small"
                    onClick={handleSaveBouquet}
                  >
                    <Icon name="check" size={14} />
                    <span>Save Bouquet</span>
                  </button>
                </div>
              </div>

              <div className="bouquet-form-row">
                <div className="bouquet-form-group">
                  <label htmlFor="bq-name-input">Bouquet Name</label>
                  <input
                    id="bq-name-input"
                    type="text"
                    className="bouquet-text-input"
                    placeholder="e.g. Weekend Sports"
                    value={bouquetName}
                    onChange={(e) => setBouquetName(e.target.value)}
                  />
                </div>

                <div className="bouquet-form-group">
                  <label>Icon</label>
                  <div className="bouquet-icon-selector">
                    {AVAILABLE_ICONS.map((ic) => (
                      <button
                        key={ic.name}
                        type="button"
                        className={`bouquet-icon-btn ${bouquetIcon === ic.name ? 'is-selected' : ''}`}
                        onClick={() => setBouquetIcon(ic.name)}
                        title={ic.label}
                        aria-label={ic.label}
                      >
                        <Icon name={ic.name} size={16} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bouquet-channel-picker-section">
                <div className="bouquet-picker-head">
                  <label>Select Channels ({selectedChannelIds.size} selected)</label>
                  <div className="bouquet-picker-actions">
                    <button
                      type="button"
                      className="btn-link-action"
                      onClick={() => {
                        const allIds = new Set(filteredChannelsForPicker.map((c) => c.id))
                        setSelectedChannelIds(allIds)
                      }}
                    >
                      Select All Filtered
                    </button>
                    <span className="dot-sep">·</span>
                    <button
                      type="button"
                      className="btn-link-action"
                      onClick={() => setSelectedChannelIds(new Set())}
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                <div className="bouquet-search-wrap">
                  <Icon name="search" size={14} className="bouquet-search-icon" />
                  <input
                    type="text"
                    className="bouquet-search-input"
                    placeholder="Search channels to include..."
                    value={channelSearch}
                    onChange={(e) => setChannelSearch(e.target.value)}
                  />
                </div>

                <div className="bouquet-channel-picker-list">
                  {filteredChannelsForPicker.map((c) => {
                    const isSelected = selectedChannelIds.has(c.id)
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`bouquet-channel-row ${isSelected ? 'is-checked' : ''}`}
                        onClick={() => handleToggleChannelSelect(c.id)}
                      >
                        <span className={`bouquet-checkbox ${isSelected ? 'is-checked' : ''}`}>
                          {isSelected && <Icon name="check" size={12} />}
                        </span>
                        <span className="bouquet-ch-name">{c.name}</span>
                        {c.group && <span className="bouquet-ch-group">{c.group}</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}
