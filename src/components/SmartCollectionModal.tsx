import { useState, useMemo } from 'react'
import { Dialog } from './Dialog'
import { Icon, type IconName } from './Icon'
import {
  loadSmartCollections,
  createSmartCollection,
  updateSmartCollection,
  deleteSmartCollection,
  evaluateSmartCollection,
  type SmartCollection,
  type SmartCollectionRule,
  type SmartRuleField,
  type UnifiedMediaItem,
} from '../lib/smartCollections'
import { useProfiles } from '../state/profiles'
import { useToast } from './Toast'
import './SmartCollectionModal.css'

export interface SmartCollectionModalProps {
  open: boolean
  onClose: () => void
  allMediaItems: UnifiedMediaItem[]
  onSelectCollection?: (collection: SmartCollection) => void
}

const AVAILABLE_ICONS: IconName[] = ['sparkles', 'film', 'series', 'star', 'flame', 'tag', 'heart']

const RULE_FIELDS: { field: SmartRuleField; label: string; placeholder: string }[] = [
  { field: 'genre', label: 'Genre contains', placeholder: 'e.g. Sci-Fi, Action' },
  { field: 'mediaType', label: 'Media Type', placeholder: 'movie, series, channel' },
  { field: 'yearMin', label: 'Released After / In (Year)', placeholder: 'e.g. 1980' },
  { field: 'yearMax', label: 'Released Before / In (Year)', placeholder: 'e.g. 1989' },
  { field: 'minRating', label: 'Minimum Rating (1-10)', placeholder: 'e.g. 8.0' },
  { field: 'watchedStatus', label: 'Watch Status', placeholder: 'unwatched, watched, in-progress' },
  { field: 'resolution', label: 'Resolution', placeholder: '4k, hd, sd' },
  { field: 'keyword', label: 'Title / Description Keyword', placeholder: 'e.g. alien, war' },
]

export function SmartCollectionModal({
  open,
  onClose,
  allMediaItems,
  onSelectCollection,
}: SmartCollectionModalProps) {
  const toast = useToast()
  const { activeProfile } = useProfiles()
  const profileId = activeProfile?.id ?? 'default'

  const [collections, setCollections] = useState<SmartCollection[]>(() => loadSmartCollections(profileId))
  const [editingCollection, setEditingCollection] = useState<SmartCollection | null>(null)
  const [isCreatingNew, setIsCreatingNew] = useState(false)

  // Editor form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState<IconName>('sparkles')
  const [matchMode, setMatchMode] = useState<'all' | 'any'>('all')
  const [rules, setRules] = useState<SmartCollectionRule[]>([])
  const [sortBy, setSortBy] = useState<'rating' | 'year' | 'title'>('rating')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // Live preview matching for editing form
  const livePreviewCount = useMemo(() => {
    if (!isCreatingNew && !editingCollection) return 0
    const temp: SmartCollection = {
      id: 'temp',
      name: name || 'Preview',
      matchMode,
      rules,
      sortBy,
      sortOrder,
      createdAt: 0,
      updatedAt: 0,
    }
    return evaluateSmartCollection(temp, allMediaItems).length
  }, [name, matchMode, rules, sortBy, sortOrder, allMediaItems, isCreatingNew, editingCollection])

  if (!open) return null

  const refreshCollections = () => {
    setCollections(loadSmartCollections(profileId))
  }

  const handleStartCreate = () => {
    setIsCreatingNew(true)
    setEditingCollection(null)
    setName('')
    setDescription('')
    setIcon('sparkles')
    setMatchMode('all')
    setRules([{ field: 'genre', value: 'Action' }])
    setSortBy('rating')
    setSortOrder('desc')
  }

  const handleStartEdit = (col: SmartCollection) => {
    setIsCreatingNew(false)
    setEditingCollection(col)
    setName(col.name)
    setDescription(col.description || '')
    setIcon((col.icon as IconName) || 'sparkles')
    setMatchMode(col.matchMode)
    setRules([...col.rules])
    setSortBy(col.sortBy || 'rating')
    setSortOrder(col.sortOrder || 'desc')
  }

  const handleCancelEdit = () => {
    setIsCreatingNew(false)
    setEditingCollection(null)
  }

  const handleAddRule = () => {
    setRules((prev) => [...prev, { field: 'genre', value: '' }])
  }

  const handleUpdateRule = (index: number, updates: Partial<SmartCollectionRule>) => {
    setRules((prev) => {
      const next = [...prev]
      next[index] = { ...next[index]!, ...updates }
      return next
    })
  }

  const handleRemoveRule = (index: number) => {
    setRules((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSave = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast('Please enter a collection name')
      return
    }

    if (isCreatingNew) {
      createSmartCollection({
        name: trimmed,
        description: description.trim() || undefined,
        icon,
        matchMode,
        rules: rules.filter((r) => String(r.value).trim() !== ''),
        sortBy,
        sortOrder,
      }, profileId)
      toast(`Created smart collection "${trimmed}"`)
    } else if (editingCollection) {
      updateSmartCollection(editingCollection.id, {
        name: trimmed,
        description: description.trim() || undefined,
        icon,
        matchMode,
        rules: rules.filter((r) => String(r.value).trim() !== ''),
        sortBy,
        sortOrder,
      }, profileId)
      toast(`Updated smart collection "${trimmed}"`)
    }

    handleCancelEdit()
    refreshCollections()
  }

  const handleDelete = (id: string, colName: string) => {
    deleteSmartCollection(id, profileId)
    toast(`Deleted collection "${colName}"`)
    refreshCollections()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Dynamic Smart Collections"
      variant="dialog"
      wide
    >
      {!isCreatingNew && !editingCollection ? (
        <div className="sc-modal-body">
          <div className="sc-modal-header-bar">
            <p className="sc-modal-desc">
              Smart Collections automatically aggregate movies, series, and channels based on dynamic rules like genres, release eras, ratings, and unwatched status.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-small"
              onClick={handleStartCreate}
            >
              <Icon name="plus" size={14} />
              <span>Create Collection</span>
            </button>
          </div>

          <div className="sc-card-grid">
            {collections.map((col) => {
              const matches = evaluateSmartCollection(col, allMediaItems)
              return (
                <div key={col.id} className="sc-card">
                  <div className="sc-card-top">
                    <div className="sc-card-title-group">
                      <Icon name={(col.icon as IconName) || 'sparkles'} size={18} className="sc-card-icon" />
                      <strong className="sc-card-title">{col.name}</strong>
                    </div>
                    <span className="sc-badge-count">{matches.length} titles</span>
                  </div>

                  {col.description && (
                    <p className="sc-card-desc">{col.description}</p>
                  )}

                  <div className="sc-card-rules-preview">
                    {col.rules.map((r, i) => (
                      <span key={i} className="sc-rule-pill">
                        {r.field}: {String(r.value)}
                      </span>
                    ))}
                  </div>

                  <div className="sc-card-actions">
                    {onSelectCollection && (
                      <button
                        type="button"
                        className="btn btn-primary btn-small"
                        onClick={() => {
                          onSelectCollection(col)
                          onClose()
                        }}
                      >
                        <Icon name="play" size={13} />
                        <span>View ({matches.length})</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary btn-small"
                      onClick={() => handleStartEdit(col)}
                    >
                      <Icon name="edit" size={13} />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-small danger-hover"
                      onClick={() => handleDelete(col.id, col.name)}
                      aria-label={`Delete ${col.name}`}
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="sc-editor-form">
          <div className="sc-editor-header">
            <h3>{isCreatingNew ? 'Create Smart Collection' : `Edit: ${editingCollection?.name}`}</h3>
            <div className="sc-editor-header-actions">
              <span className="sc-live-preview-badge">
                <Icon name="checkCircle" size={14} />
                Matches {livePreviewCount} items currently
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={handleCancelEdit}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary btn-small"
                onClick={handleSave}
              >
                <Icon name="check" size={14} />
                <span>Save Collection</span>
              </button>
            </div>
          </div>

          <div className="sc-form-grid">
            <div className="sc-form-field">
              <label htmlFor="sc-name-input">Collection Name</label>
              <input
                id="sc-name-input"
                type="text"
                className="sc-text-input"
                placeholder="e.g. 80s Sci-Fi Classics"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="sc-form-field">
              <label htmlFor="sc-desc-input">Description (Optional)</label>
              <input
                id="sc-desc-input"
                type="text"
                className="sc-text-input"
                placeholder="Brief summary of this collection"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="sc-form-field">
              <label>Icon</label>
              <div className="sc-icon-selector">
                {AVAILABLE_ICONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    className={`sc-icon-btn ${icon === ic ? 'is-active' : ''}`}
                    onClick={() => setIcon(ic)}
                    aria-label={`Icon ${ic}`}
                  >
                    <Icon name={ic} size={16} />
                  </button>
                ))}
              </div>
            </div>

            <div className="sc-form-field">
              <label>Rule Matching Logic</label>
              <div className="sc-match-mode-selector">
                <button
                  type="button"
                  className={`sc-mode-btn ${matchMode === 'all' ? 'is-active' : ''}`}
                  onClick={() => setMatchMode('all')}
                >
                  Match ALL rules (AND)
                </button>
                <button
                  type="button"
                  className={`sc-mode-btn ${matchMode === 'any' ? 'is-active' : ''}`}
                  onClick={() => setMatchMode('any')}
                >
                  Match ANY rule (OR)
                </button>
              </div>
            </div>
          </div>

          <div className="sc-rules-builder">
            <div className="sc-rules-head">
              <label>Filter Rules ({rules.length})</label>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={handleAddRule}
              >
                <Icon name="plus" size={13} />
                <span>Add Rule</span>
              </button>
            </div>

            <div className="sc-rules-list">
              {rules.map((rule, idx) => {
                const fieldDef = RULE_FIELDS.find((f) => f.field === rule.field)
                return (
                  <div key={idx} className="sc-rule-row">
                    <select
                      className="sc-rule-field-select"
                      value={rule.field}
                      onChange={(e) => handleUpdateRule(idx, { field: e.target.value as SmartRuleField })}
                    >
                      {RULE_FIELDS.map((f) => (
                        <option key={f.field} value={f.field}>{f.label}</option>
                      ))}
                    </select>

                    {rule.field === 'mediaType' ? (
                      <select
                        className="sc-rule-value-select"
                        value={String(rule.value)}
                        onChange={(e) => handleUpdateRule(idx, { value: e.target.value })}
                      >
                        <option value="movie">Movie</option>
                        <option value="series">Series / TV Show</option>
                        <option value="channel">Live Channel</option>
                      </select>
                    ) : rule.field === 'watchedStatus' ? (
                      <select
                        className="sc-rule-value-select"
                        value={String(rule.value)}
                        onChange={(e) => handleUpdateRule(idx, { value: e.target.value })}
                      >
                        <option value="unwatched">Unwatched</option>
                        <option value="in-progress">In-Progress</option>
                        <option value="watched">Watched</option>
                      </select>
                    ) : rule.field === 'resolution' ? (
                      <select
                        className="sc-rule-value-select"
                        value={String(rule.value)}
                        onChange={(e) => handleUpdateRule(idx, { value: e.target.value })}
                      >
                        <option value="4k">4K Ultra HD</option>
                        <option value="hd">HD (1080p / 720p)</option>
                        <option value="sd">Standard Definition</option>
                      </select>
                    ) : (
                      <input
                        type="text"
                        className="sc-rule-value-input"
                        placeholder={fieldDef?.placeholder || 'Value'}
                        value={String(rule.value)}
                        onChange={(e) => handleUpdateRule(idx, { value: e.target.value })}
                      />
                    )}

                    <button
                      type="button"
                      className="icon-btn-micro danger-hover"
                      onClick={() => handleRemoveRule(idx)}
                      title="Remove rule"
                      aria-label="Remove rule"
                    >
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </Dialog>
  )
}
