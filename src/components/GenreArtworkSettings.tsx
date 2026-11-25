/**
 * Genre & Artwork Management Settings Panel for Kinora.
 *
 * Allows full inspection and user configuration of the canonical genre taxonomy,
 * custom artwork overrides, provenance inspection, enabled/disabled states,
 * discovery visibility, and provider category normalization mappings.
 * Strictly adheres to project typography standards: zero em-dashes across all code and comments.
 */

import { useMemo, useState } from 'react'
import {
  CANONICAL_GENRES,
  getGenreById,
  type GenreDefinition,
  type MediaType,
} from '../data/genreTaxonomy'
import {
  useGenreCustomizations,
} from '../state/genreCustomizations'
import { classifyGenre } from '../lib/genreClassifier'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { useToast } from './Toast'
import './GenreArtworkSettings.css'

export function GenreArtworkSettings() {
  const {
    customizations,
    setCustomArtwork,
    setCustomName,
    setCustomAliases,
    toggleGenreDisabled,
    toggleGenreHidden,
    setProviderMapping,
    removeProviderMapping,
    refreshMetadataAndArtwork,
    resetCustomizations,
    isGenreEnabled,
    isGenreVisible,
    getEffectiveGenreName,
    resolveArtwork,
  } = useGenreCustomizations()

  const toast = useToast()
  const [selectedType, setSelectedType] = useState<MediaType | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [editingArtworkGenre, setEditingArtworkGenre] = useState<GenreDefinition | null>(null)
  const [customArtUrl, setCustomArtUrl] = useState('')
  const [customBannerUrl, setCustomBannerUrl] = useState('')
  const [editingAliasesGenre, setEditingAliasesGenre] = useState<GenreDefinition | null>(null)
  const [customNameInput, setCustomNameInput] = useState('')
  const [customAliasesInput, setCustomAliasesInput] = useState('')
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Provider mapping state
  const [newRawCategory, setNewRawCategory] = useState('')
  const [newTargetGenreId, setNewTargetGenreId] = useState(CANONICAL_GENRES[0]?.id ?? 'action')
  const [testCategoryQuery, setTestCategoryQuery] = useState('Sci-Fi & Fantasy')

  const filteredGenres = useMemo(() => {
    let list = CANONICAL_GENRES
    if (selectedType !== 'all') {
      list = list.filter((g) => g.mediaTypes.includes(selectedType))
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter((g) => {
        const effectiveName = getEffectiveGenreName(g).toLowerCase()
        return (
          effectiveName.includes(q) ||
          g.id.includes(q) ||
          g.aliases.some((a) => a.toLowerCase().includes(q))
        )
      })
    }
    return list
  }, [selectedType, searchQuery, getEffectiveGenreName])

  const testClassification = useMemo(() => {
    return classifyGenre(testCategoryQuery, undefined, customizations.customProviderMappings)
  }, [testCategoryQuery, customizations.customProviderMappings])

  const handleOpenArtworkDialog = (genre: GenreDefinition) => {
    setEditingArtworkGenre(genre)
    const current = customizations.customArtwork[genre.id]
    setCustomArtUrl(current?.landscape || '')
    setCustomBannerUrl(current?.banner || '')
  }

  const handleSaveArtwork = () => {
    if (!editingArtworkGenre) return
    setCustomArtwork(editingArtworkGenre.id, {
      landscape: customArtUrl.trim() || undefined,
      banner: customBannerUrl.trim() || undefined,
    })
    toast(`Artwork updated for ${editingArtworkGenre.name}`)
    setEditingArtworkGenre(null)
  }

  const handleOpenAliasesDialog = (genre: GenreDefinition) => {
    setEditingAliasesGenre(genre)
    setCustomNameInput(customizations.customNames[genre.id] || genre.name)
    const aliases = customizations.customAliases[genre.id] || genre.aliases
    setCustomAliasesInput(aliases.join(', '))
  }

  const handleSaveAliases = () => {
    if (!editingAliasesGenre) return
    setCustomName(editingAliasesGenre.id, customNameInput.trim())
    const parsedAliases = customAliasesInput.split(',').map((a) => a.trim()).filter(Boolean)
    setCustomAliases(editingAliasesGenre.id, parsedAliases)
    toast(`Custom name & aliases saved for ${editingAliasesGenre.name}`)
    setEditingAliasesGenre(null)
  }

  const handleAddMapping = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRawCategory.trim()) return
    setProviderMapping(newRawCategory.trim(), newTargetGenreId)
    toast(`Category "${newRawCategory.trim()}" mapped to ${getGenreById(newTargetGenreId)?.name}`)
    setNewRawCategory('')
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await refreshMetadataAndArtwork()
      toast('Genre metadata and artwork definitions refreshed')
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleReset = () => {
    resetCustomizations()
    setResetConfirmOpen(false)
    toast('All genre customisations have been reset to factory defaults')
  }

  const customMappingEntries = Object.entries(customizations.customProviderMappings)

  return (
    <div className="genre-settings-wrap">
      {/* Top Controls Toolbar */}
      <div className="genre-settings-topbar">
        <div className="genre-settings-tabs" role="tablist" aria-label="Genre media categories">
          {(['all', 'movies', 'series', 'live', 'audio', 'books'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={selectedType === t}
              className={`genre-settings-tab ${selectedType === t ? 'is-active' : ''}`}
              onClick={() => setSelectedType(t)}
            >
              {t === 'all' ? 'All Genres' : t === 'movies' ? 'Movies' : t === 'series' ? 'TV Shows' : t === 'live' ? 'Live TV' : t === 'audio' ? 'Audio' : 'Books'}
            </button>
          ))}
        </div>

        <div className="genre-settings-actions">
          <input
            type="search"
            className="genre-settings-search"
            placeholder="Search genres, subgenres, aliases..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Filter genre list"
          />

          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh genre definitions and artwork cache"
          >
            <Icon name="rotateCw" size={14} className={isRefreshing ? 'spin' : ''} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => setResetConfirmOpen(true)}
            title="Reset custom artwork and aliases to default"
          >
            <Icon name="trash" size={14} />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {customizations.lastRefreshedAt && (
        <p className="faint" style={{ margin: '0 4px', fontSize: '0.75rem' }}>
          Last refreshed: {new Date(customizations.lastRefreshedAt).toLocaleTimeString()}
        </p>
      )}

      {/* Grid of Canonical Genres */}
      <div className="genre-settings-list" role="list" aria-label="Canonical Genres">
        {filteredGenres.map((genre) => {
          const resolved = resolveArtwork(genre, 'landscape')
          const effectiveName = getEffectiveGenreName(genre)
          const enabled = isGenreEnabled(genre.id)
          const visible = isGenreVisible(genre.id)

          return (
            <article
              key={genre.id}
              className={`genre-settings-card ${!enabled ? 'is-disabled' : ''}`}
              role="listitem"
            >
              <div className="genre-settings-card-media" style={{ background: resolved.cssGradient }}>
                <img
                  src={resolved.url}
                  alt={effectiveName}
                  className="genre-settings-card-img"
                  loading="lazy"
                />
                <span className={`genre-settings-provenance prov-${resolved.provenance}`}>
                  {resolved.provenance === 'user'
                    ? 'User-Selected'
                    : resolved.provenance === 'verified'
                      ? 'Verified'
                      : resolved.provenance === 'inherited'
                        ? 'Inherited'
                        : 'Fallback'}
                </span>
              </div>

              <div className="genre-settings-card-body">
                <div className="genre-settings-card-head">
                  <div>
                    <h3 className="genre-settings-card-title">
                      {effectiveName}
                      {genre.name !== effectiveName && (
                        <span className="faint" style={{ fontSize: '0.75rem', marginLeft: 6 }}>
                          ({genre.name})
                        </span>
                      )}
                    </h3>
                    <span className="faint" style={{ fontSize: '0.6875rem', textTransform: 'uppercase' }}>
                      {genre.parentId ? `Subgenre of ${getGenreById(genre.parentId)?.name || genre.parentId}` : 'Parent Genre'} · {genre.mediaTypes.join(', ')}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => handleOpenArtworkDialog(genre)}
                      title="Configure custom artwork"
                      aria-label={`Customise artwork for ${effectiveName}`}
                    >
                      <Icon name="camera" size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => handleOpenAliasesDialog(genre)}
                      title="Edit name and aliases"
                      aria-label={`Edit aliases for ${effectiveName}`}
                    >
                      <Icon name="edit" size={14} />
                    </button>
                  </div>
                </div>

                <p className="genre-settings-card-desc">{genre.description}</p>

                {genre.subgenreIds.length > 0 && (
                  <div className="genre-settings-subgenres-list">
                    {genre.subgenreIds.map((subId) => (
                      <span key={subId} className="genre-settings-subgenre-chip">
                        {getGenreById(subId)?.name || subId}
                      </span>
                    ))}
                  </div>
                )}

                <div className="genre-settings-card-footer">
                  <div className="genre-settings-toggles">
                    <label className="genre-settings-toggle-label">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() => toggleGenreDisabled(genre.id)}
                      />
                      <span>Active</span>
                    </label>

                    <label className="genre-settings-toggle-label">
                      <input
                        type="checkbox"
                        checked={visible}
                        disabled={!enabled}
                        onChange={() => toggleGenreHidden(genre.id)}
                      />
                      <span>In Discover</span>
                    </label>
                  </div>

                  <span className="faint" style={{ fontSize: '0.75rem' }}>
                    {genre.aliases.length} aliases
                  </span>
                </div>
              </div>
            </article>
          )
        })}
      </div>

      {/* Provider Normalization & Mapping Section */}
      <div className="genre-mapping-box">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Provider Category Normalisation &amp; Mappings</h3>
            <p className="faint" style={{ margin: '4px 0 0', fontSize: '0.8125rem' }}>
              Map broadcaster M3U, XMLTV, and server categories to canonical Kinora genres.
            </p>
          </div>
        </div>

        {/* Live Mapping Tester */}
        <div className="genre-mapping-test-box">
          <label htmlFor="genre-mapping-test-input" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-2)' }}>
            Live Normalisation Classifier Test:
          </label>
          <div className="genre-mapping-test-row">
            <input
              id="genre-mapping-test-input"
              type="text"
              className="input"
              style={{ flex: 1, padding: '6px 10px' }}
              value={testCategoryQuery}
              onChange={(e) => setTestCategoryQuery(e.target.value)}
              placeholder="Type any raw provider category..."
            />
            <div className="genre-mapping-test-result">
              <span>Canonical:</span>
              <strong style={{ color: testClassification.canonical ? 'var(--accent)' : 'var(--text-3)' }}>
                {testClassification.canonical ? testClassification.canonical.name : 'Unassigned (Preserved)'}
              </strong>
              <span className="faint" style={{ fontSize: '0.75rem' }}>
                ({Math.round(testClassification.confidence * 100)}% via {testClassification.matchedBy})
              </span>
            </div>
          </div>
        </div>

        {/* Add Custom Mapping Form */}
        <form className="genre-mapping-form" onSubmit={handleAddMapping}>
          <input
            type="text"
            className="input"
            placeholder="Raw provider string (e.g. 'Action &amp; Adventure HD')"
            value={newRawCategory}
            onChange={(e) => setNewRawCategory(e.target.value)}
            required
            aria-label="Raw provider category text"
          />

          <select
            className="select"
            value={newTargetGenreId}
            onChange={(e) => setNewTargetGenreId(e.target.value)}
            aria-label="Target canonical genre"
          >
            {CANONICAL_GENRES.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.mediaTypes.join(', ')})
              </option>
            ))}
          </select>

          <button type="submit" className="btn btn-primary btn-small">
            <Icon name="plus" size={14} />
            <span>Add Mapping</span>
          </button>
        </form>

        {/* Existing Custom Mappings Table */}
        {customMappingEntries.length > 0 && (
          <table className="genre-mapping-table">
            <thead>
              <tr>
                <th>Raw Provider Category</th>
                <th>Target Canonical Genre</th>
                <th style={{ width: 80 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {customMappingEntries.map(([raw, targetId]) => {
                const target = getGenreById(targetId)
                return (
                  <tr key={raw}>
                    <td><code>{raw}</code></td>
                    <td><strong>{target?.name || targetId}</strong></td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        onClick={() => removeProviderMapping(raw)}
                        title="Remove mapping"
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit Artwork Modal */}
      {editingArtworkGenre && (
        <Dialog
          open={Boolean(editingArtworkGenre)}
          onClose={() => setEditingArtworkGenre(null)}
          title={`Custom Artwork: ${editingArtworkGenre.name}`}
          footer={
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setEditingArtworkGenre(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveArtwork}
              >
                Save Artwork
              </button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p className="faint" style={{ margin: 0, fontSize: '0.8125rem' }}>
              Specify custom image URLs or data URIs for this genre. User-selected artwork takes absolute precedence over automatic enrichment and bundled defaults.
            </p>

            <div>
              <label htmlFor="custom-art-landscape" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>
                Primary Landscape Artwork (16:9):
              </label>
              <input
                id="custom-art-landscape"
                type="text"
                className="input"
                style={{ width: '100%' }}
                placeholder="/art/custom-image.jpg or https://..."
                value={customArtUrl}
                onChange={(e) => setCustomArtUrl(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="custom-art-banner" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>
                Wide Hero Banner Artwork (21:9):
              </label>
              <input
                id="custom-art-banner"
                type="text"
                className="input"
                style={{ width: '100%' }}
                placeholder="/art/custom-banner.jpg or https://..."
                value={customBannerUrl}
                onChange={(e) => setCustomBannerUrl(e.target.value)}
              />
            </div>
          </div>
        </Dialog>
      )}

      {/* Edit Names & Aliases Modal */}
      {editingAliasesGenre && (
        <Dialog
          open={Boolean(editingAliasesGenre)}
          onClose={() => setEditingAliasesGenre(null)}
          title={`Edit Name & Aliases: ${editingAliasesGenre.name}`}
          footer={
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setEditingAliasesGenre(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveAliases}
              >
                Save
              </button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label htmlFor="custom-genre-name-input" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>
                Display Name Override:
              </label>
              <input
                id="custom-genre-name-input"
                type="text"
                className="input"
                style={{ width: '100%' }}
                value={customNameInput}
                onChange={(e) => setCustomNameInput(e.target.value)}
                placeholder={editingAliasesGenre.name}
              />
            </div>

            <div>
              <label htmlFor="custom-genre-aliases-input" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>
                Alternative Spellings and Aliases (comma-separated):
              </label>
              <input
                id="custom-genre-aliases-input"
                type="text"
                className="input"
                style={{ width: '100%' }}
                value={customAliasesInput}
                onChange={(e) => setCustomAliasesInput(e.target.value)}
                placeholder="Alias 1, Alias 2, Alias 3"
              />
            </div>
          </div>
        </Dialog>
      )}

      {/* Reset Confirmation Dialog */}
      <Dialog
        open={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        title="Reset Genre Customisations"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setResetConfirmOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleReset}
            >
              Reset to Defaults
            </button>
          </>
        }
      >
        <p className="muted">
          Are you sure you want to reset all genre artwork overrides, custom names, visibility rules, and provider mappings? This will restore factory defaults immediately.
        </p>
      </Dialog>
    </div>
  )
}
