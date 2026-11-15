import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { ResourceCard } from '../components/ResourceCard'
import { ResourceDetailModal } from '../components/ResourceDetailModal'
import { useStore } from '../state/store'
import type { MediaResource } from '../data/personalLibrary'
import type { Programme } from '../data/types'
import { auditCatalogueHealth } from '../data/lifecycle'
import { artworkEngine, type ArtworkCategoryMetrics } from '../data/artworkEngine'
import { addDays, startOfDay } from '../data/channels'
import { METADATA_ATTRIBUTIONS, loadMetadataConfig, testProviderConnection } from '../data/metadataProviders'
import type { GuideMatch } from '../state/guides'

export function SourcesTechnicalTab() {
  const store = useStore()
  const [selectedSubTab, setSelectedSubTab] = useState<'audit' | 'artwork' | 'epg' | 'metadata' | 'subtitles'>('audit')
  const [artworkSubFilter, setArtworkSubFilter] = useState<'overview' | 'missing' | 'failed' | 'ambiguous' | 'providers'>('overview')
  const [enrichmentRunning, setEnrichmentRunning] = useState(false)
  const [enrichmentPaused, setEnrichmentPaused] = useState(false)
  const [enrichmentStage, setEnrichmentStage] = useState('Idle')
  const [enrichmentProgress, setEnrichmentProgress] = useState({ processed: 0, total: 0 })
  const [detailResourceId, setDetailResourceId] = useState<string | null>(null)
  const [showDiagnostics, setShowDiagnostics] = useState(false)

  useEffect(() => {
    return artworkEngine.subscribe((progress) => {
      setEnrichmentRunning(progress.isRunning)
      setEnrichmentPaused(progress.isPaused)
      setEnrichmentStage(progress.currentStage)
      setEnrichmentProgress({ processed: progress.processed, total: progress.totalEligible })
    })
  }, [])

  const matchMap = useMemo(() => {
    const map = new Map<string, GuideMatch>()
    for (const c of store.channels) {
      const m = store.guideMatch(c)
      if (m) map.set(c.id, m)
    }
    return map
  }, [store.channels, store.guideMatch])

  const audit = useMemo(() => {
    return auditCatalogueHealth(store.channels, matchMap)
  }, [store.channels, matchMap])

  const totalProgrammes = useMemo(() => {
    return store.guides.reduce((acc, g) => acc + (g.summary?.programmes ?? 0), 0)
  }, [store.guides])

  const activeProgrammes = useMemo(() => {
    const today = startOfDay(Date.now())
    const tomorrow = addDays(today, 1)
    const progs: Programme[] = []
    for (const c of store.channels) {
      const day1 = store.schedule(c, today)
      const day2 = store.schedule(c, tomorrow)
      if (day1.length > 0 || day2.length > 0) {
        progs.push(...day1, ...day2)
      } else {
        const p = store.programmeAt(c, Date.now())
        if (p) progs.push(p)
      }
    }
    return progs
  }, [store.channels, store.schedule, store.programmeAt])

  const artworkAudit = useMemo(() => {
    return artworkEngine.auditCompleteness(
      store.channels,
      activeProgrammes,
      store.xtreamCatalogue.movies,
      store.xtreamCatalogue.series,
      totalProgrammes,
    )
  }, [store.channels, activeProgrammes, store.xtreamCatalogue.movies, store.xtreamCatalogue.series, totalProgrammes])

  const sourceBreakdowns = useMemo(() => {
    return store.playlists.map((source) => {
      const sourceChannels = store.channels.filter((c) => (c.sourceIds ?? [c.sourceId]).includes(source.id))
      const withLogo = sourceChannels.filter((c) => Boolean(c.logoUrl)).length
      const withGuide = sourceChannels.filter((c) => matchMap.get(c.id)?.state === 'matched').length
      return {
        id: source.id,
        name: source.name,
        total: sourceChannels.length,
        withLogo,
        logoPercent: sourceChannels.length ? Math.round((withLogo / sourceChannels.length) * 100) : 0,
        withGuide,
        guidePercent: sourceChannels.length ? Math.round((withGuide / sourceChannels.length) * 100) : 0,
        categories: [...new Set(sourceChannels.flatMap((c) => c.categories))].slice(0, 3).join(', ') || 'General',
      }
    })
  }, [store.playlists, store.channels, matchMap])

  const epgResources = useMemo(() => {
    return store.mediaLibrary.allResources.filter((r) => r.category === 'epg')
  }, [store.mediaLibrary.allResources])

  const metadataResources = useMemo(() => {
    return store.mediaLibrary.allResources.filter((r) => r.category === 'metadata')
  }, [store.mediaLibrary.allResources])

  const subtitleResources = useMemo(() => {
    return store.mediaLibrary.allResources.filter((r) => r.category === 'subtitles')
  }, [store.mediaLibrary.allResources])

  const activeList = selectedSubTab === 'epg' ? epgResources : selectedSubTab === 'metadata' ? metadataResources : subtitleResources

  const detailResource = useMemo(() => {
    if (!detailResourceId) return null
    return store.mediaLibrary.allResources.find((r) => r.id === detailResourceId) ?? null
  }, [detailResourceId, store.mediaLibrary.allResources])

  return (
    <div className="technical-sources-tab">
      {/* Sub-navigation tabs */}
      <div className="technical-subtabs" role="tablist" aria-label="Technical Infrastructure Sections">
        <button
          type="button"
          className={`technical-subtab-btn ${selectedSubTab === 'audit' ? 'active' : ''}`}
          onClick={() => setSelectedSubTab('audit')}
        >
          <Icon name="check" size={16} />
          <span>Catalogue Health & Scale Audit</span>
        </button>

        <button
          type="button"
          className={`technical-subtab-btn ${selectedSubTab === 'artwork' ? 'active' : ''}`}
          onClick={() => setSelectedSubTab('artwork')}
        >
          <Icon name="film" size={16} />
          <span>Artwork Completeness & Enrichment</span>
        </button>

        <button
          type="button"
          className={`technical-subtab-btn ${selectedSubTab === 'epg' ? 'active' : ''}`}
          onClick={() => setSelectedSubTab('epg')}
        >
          <Icon name="guide" size={16} />
          <span>Electronic Programme Guides ({epgResources.length})</span>
        </button>

        <button
          type="button"
          className={`technical-subtab-btn ${selectedSubTab === 'metadata' ? 'active' : ''}`}
          onClick={() => setSelectedSubTab('metadata')}
        >
          <Icon name="database" size={16} />
          <span>Media Metadata & Artwork ({metadataResources.length})</span>
        </button>

        <button
          type="button"
          className={`technical-subtab-btn ${selectedSubTab === 'subtitles' ? 'active' : ''}`}
          onClick={() => setSelectedSubTab('subtitles')}
        >
          <Icon name="subtitles" size={16} />
          <span>Subtitles & Accessibility ({subtitleResources.length})</span>
        </button>
      </div>

      {selectedSubTab === 'artwork' ? (
        <div className="audit-dashboard" role="region" aria-label="Artwork Completeness Dashboard">
          {/* Executive KPI Cards */}
          <div className="audit-kpi-grid">
            <div className="audit-kpi-card">
              <span className="audit-kpi-lbl">Total Eligible Media</span>
              <span className="audit-kpi-val">{artworkAudit.overallCoverage.totalEligible.toLocaleString()}</span>
              <span className="audit-kpi-sub">Across films, series, episodes & EPG</span>
            </div>

            <div className="audit-kpi-card">
              <span className="audit-kpi-lbl">Genuine Artwork Found</span>
              <span className="audit-kpi-val">{artworkAudit.overallCoverage.totalGenuine.toLocaleString()}</span>
              <span className="audit-kpi-sub">{artworkAudit.overallCoverage.genuinePercent}% verified visual coverage</span>
            </div>

            <div className="audit-kpi-card">
              <span className="audit-kpi-lbl">Missing Artwork</span>
              <span className="audit-kpi-val">{artworkAudit.overallCoverage.totalMissing.toLocaleString()}</span>
              <span className="audit-kpi-sub">Identified with transparent diagnosis</span>
            </div>

            <div className="audit-kpi-card">
              <span className="audit-kpi-lbl">Match Confidence</span>
              <span className="audit-kpi-val">{Math.round(artworkAudit.overallCoverage.averageConfidence * 100)}%</span>
              <span className="audit-kpi-sub">Zero guesswork on remakes/ambiguities</span>
            </div>
          </div>

          {/* Background Enrichment Control Bar */}
          <div className="artwork-enrichment-bar">
            <div className="artwork-enrichment-info" style={{ flex: 1 }}>
              <span className="artwork-enrichment-title">
                <Icon name="cog" size={16} />
                <span>Background Enrichment Service</span>
                {enrichmentRunning && <span className="pill pill-pending">Running</span>}
                {enrichmentPaused && <span className="pill pill-ghost">Paused</span>}
              </span>
              <span className="artwork-enrichment-desc">
                Status: {enrichmentStage} (Cached locally in Rust engine; zero unauthorized third-party tracking)
              </span>
              {(enrichmentRunning || enrichmentPaused) && enrichmentProgress.total > 0 && (
                <div style={{ marginTop: 6, width: '100%', maxWidth: 360, background: 'var(--surface-3, rgba(255, 255, 255, 0.1))', height: 4, borderRadius: 2, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(100, Math.round((enrichmentProgress.processed / enrichmentProgress.total) * 100))}%`,
                      background: 'var(--accent)',
                      transition: 'width 0.2s ease',
                    }}
                  />
                </div>
              )}
            </div>
            <div className="artwork-enrichment-actions">
              {enrichmentRunning ? (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    onClick={() => artworkEngine.pauseEnrichment()}
                  >
                    <Icon name="pause" size={14} />
                    <span>Pause</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    onClick={() => artworkEngine.cancelEnrichment()}
                  >
                    <Icon name="close" size={14} />
                    <span>Cancel</span>
                  </button>
                </>
              ) : enrichmentPaused ? (
                <>
                  <button
                    type="button"
                    className="btn btn-primary btn-small"
                    onClick={() => artworkEngine.resumeEnrichment()}
                  >
                    <Icon name="play" size={14} />
                    <span>Resume</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    onClick={() => artworkEngine.cancelEnrichment()}
                  >
                    <Icon name="close" size={14} />
                    <span>Cancel</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-primary btn-small"
                    onClick={() => artworkEngine.runEnrichment()}
                  >
                    <Icon name="refresh" size={14} />
                    <span>Run Background Enrichment</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    onClick={() => artworkEngine.retryFailed()}
                  >
                    <Icon name="check" size={14} />
                    <span>Retry Failed Artwork</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Sub-navigation pills */}
          <div className="artwork-nav-pills" role="tablist" aria-label="Artwork Audit Views">
            <button
              type="button"
              className={`artwork-nav-pill ${artworkSubFilter === 'overview' ? 'active' : ''}`}
              onClick={() => setArtworkSubFilter('overview')}
            >
              Completeness Overview ({Object.keys(artworkAudit.categories).length} Categories)
            </button>
            <button
              type="button"
              className={`artwork-nav-pill ${artworkSubFilter === 'missing' ? 'active' : ''}`}
              onClick={() => setArtworkSubFilter('missing')}
            >
              Missing Items ({artworkAudit.missingItems.length})
            </button>
            <button
              type="button"
              className={`artwork-nav-pill ${artworkSubFilter === 'failed' ? 'active' : ''}`}
              onClick={() => setArtworkSubFilter('failed')}
            >
              Failed Downloads ({artworkAudit.failedDownloads.length})
            </button>
            <button
              type="button"
              className={`artwork-nav-pill ${artworkSubFilter === 'ambiguous' ? 'active' : ''}`}
              onClick={() => setArtworkSubFilter('ambiguous')}
            >
              Ambiguous Matches ({artworkAudit.ambiguousMatches.length})
            </button>
            <button
              type="button"
              className={`artwork-nav-pill ${artworkSubFilter === 'providers' ? 'active' : ''}`}
              onClick={() => setArtworkSubFilter('providers')}
            >
              Metadata Providers & Security
            </button>
          </div>

          {/* View: Completeness Overview (11-Category Table) */}
          {artworkSubFilter === 'overview' && (
            <>
              {/* EPG Schedule & Database Scale Reconciliation Card */}
              <div className="audit-table-card" style={{ marginBottom: 18 }}>
                <h4 className="audit-section-title">
                  <Icon name="guide" size={16} />
                  <span>EPG Schedule & Database Scale Reconciliation</span>
                </h4>
                <p className="section-sub" style={{ margin: '0 0 12px', fontSize: '0.84rem' }}>
                  {artworkAudit.epgInventory.reconciliationExplanation}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                  <div style={{ background: 'var(--surface-2)', padding: '12px 14px', borderRadius: 'var(--r-m)' }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>Total Cached XMLTV Records</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)' }}>
                      {artworkAudit.epgInventory.totalCachedRecords.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Historical Multi-Week Database</div>
                  </div>
                  <div style={{ background: 'var(--surface-2)', padding: '12px 14px', borderRadius: 'var(--r-m)' }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>Active Schedule Window (48h)</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)' }}>
                      {artworkAudit.epgInventory.activeWindowProgrammes.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Mapped Live TV Broadcasts</div>
                  </div>
                  <div style={{ background: 'var(--surface-2)', padding: '12px 14px', borderRadius: 'var(--r-m)' }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>Broadcast Airings with Art</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent)' }}>
                      {artworkAudit.epgInventory.broadcastsWithArtwork.toLocaleString()} ({artworkAudit.epgInventory.broadcastLevelPercent}%)
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Individual Airings with Visual Art</div>
                  </div>
                  <div style={{ background: 'var(--surface-2)', padding: '12px 14px', borderRadius: 'var(--r-m)' }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>Unique Programme Titles</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)' }}>
                      {artworkAudit.epgInventory.uniqueProgrammeIdentities.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Deduplicated Content Entities</div>
                  </div>
                  <div style={{ background: 'var(--surface-2)', padding: '12px 14px', borderRadius: 'var(--r-m)' }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>Unique Titles with Artwork</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent)' }}>
                      {artworkAudit.epgInventory.uniqueTitlesWithArtwork.toLocaleString()} ({artworkAudit.epgInventory.uniqueTitlePercent}%)
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Unique Identities Covered</div>
                  </div>
                  <div style={{ background: 'var(--surface-2)', padding: '12px 14px', borderRadius: 'var(--r-m)' }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>Native Broadcaster Icons</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)' }}>
                      {artworkAudit.epgInventory.nativeIconCount.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>XMLTV Broadcaster Provided</div>
                  </div>
                  <div style={{ background: 'var(--surface-2)', padding: '12px 14px', borderRadius: 'var(--r-m)' }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>Cross-Guide Resolved Airings</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent)' }}>
                      {artworkAudit.epgInventory.crossGuideResolvedCount.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Cross-Channel Broadcaster Match</div>
                  </div>
                  <div style={{ background: 'var(--surface-2)', padding: '12px 14px', borderRadius: 'var(--r-m)' }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>Eligible for Enrichment</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent-light, #f87171)' }}>
                      {artworkAudit.epgInventory.eligibleForEnrichment.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Missing Key Art or Stills</div>
                  </div>
                </div>
              </div>

              <div className="audit-table-card">
                <h4 className="audit-section-title">
                  <Icon name="film" size={16} />
                  <span>Distinct Artwork Categories & Completeness Breakdown</span>
                </h4>
                <p className="section-sub" style={{ margin: '0 0 10px', fontSize: '0.84rem' }}>
                  Truthful metrics separating channel logos from genuine movie posters, backdrops, episode stills, and broadcast EPG artwork.
                </p>
                <div style={{ overflowX: 'auto' }}>
                  <table className="audit-table">
                    <thead>
                      <tr>
                        <th>Artwork Category</th>
                        <th>Ratio</th>
                        <th>Total Eligible</th>
                        <th>Already Present</th>
                        <th>Newly Retrieved</th>
                        <th>Total Genuine Found</th>
                        <th>Missing</th>
                        <th>Failed</th>
                        <th>Ambiguous</th>
                        <th>Excluded</th>
                        <th>Coverage %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.values(artworkAudit.categories).map((cat: ArtworkCategoryMetrics) => (
                        <tr key={cat.artworkType}>
                          <td style={{ fontWeight: 600, color: 'var(--text)' }}>{cat.label}</td>
                          <td>
                            <span className="artwork-aspect-badge">{cat.aspectRatio}</span>
                          </td>
                          <td>{cat.totalEligible.toLocaleString()}</td>
                          <td>{cat.alreadyPresent.toLocaleString()}</td>
                          <td style={{ color: cat.newlyRetrieved > 0 ? 'var(--accent)' : 'var(--text-3)' }}>
                            {cat.newlyRetrieved.toLocaleString()}
                          </td>
                          <td style={{ fontWeight: 600, color: cat.genuineFound > 0 ? 'var(--text)' : 'var(--text-3)' }}>
                            {cat.genuineFound.toLocaleString()}
                          </td>
                          <td style={{ color: cat.missing > 0 ? 'var(--accent-light, #f87171)' : 'var(--text-3)' }}>
                            {cat.missing.toLocaleString()}
                          </td>
                          <td>{cat.failed}</td>
                          <td style={{ color: cat.ambiguous > 0 ? 'var(--accent-gold, #fbbf24)' : 'var(--text-3)' }}>
                            {cat.ambiguous}
                          </td>
                          <td style={{ color: cat.excluded > 0 ? 'var(--text-3)' : 'inherit' }} title={cat.excludedReason}>
                            {cat.excluded > 0 ? `${cat.excluded.toLocaleString()}*` : 0}
                          </td>
                          <td>
                            <span
                              className={`pill ${cat.genuinePercent >= 80 ? 'pill-healthy' : cat.genuinePercent > 0 ? 'pill-pending' : 'pill-ghost'}`}
                              style={{ fontSize: '0.74rem' }}
                            >
                              {cat.genuinePercent}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="faint" style={{ margin: '8px 0 0', fontSize: '0.74rem', color: 'var(--text-3)' }}>
                  * Channel logos are managed via the guarded M3U logo path and strictly excluded from programme artwork counts.
                </p>
              </div>

              {/* Metadata Provider & Source Results Table */}
              <div className="audit-table-card" style={{ marginTop: 20 }}>
                <h4 className="audit-section-title">
                  <Icon name="database" size={16} />
                  <span>Metadata Provider & Source Results</span>
                </h4>
                <p className="section-sub" style={{ margin: '0 0 10px', fontSize: '0.84rem' }}>
                  Transparent accounting of external metadata queries, matches, and images retrieved per provider.
                </p>
                <div style={{ overflowX: 'auto' }}>
                  <table className="audit-table">
                    <thead>
                      <tr>
                        <th>Provider / Source</th>
                        <th>Queries</th>
                        <th>Matches</th>
                        <th>Images Retrieved</th>
                        <th>Failed</th>
                        <th>Rejected</th>
                        <th>Status & Authorization</th>
                      </tr>
                    </thead>
                    <tbody>
                      {artworkAudit.providerMetrics.map((p) => (
                        <tr key={p.providerKey}>
                          <td style={{ fontWeight: 600, color: 'var(--text)' }}>{p.providerName}</td>
                          <td>{p.queries.toLocaleString()}</td>
                          <td style={{ color: p.matches > 0 ? 'var(--text)' : 'var(--text-3)' }}>
                            {p.matches.toLocaleString()}
                          </td>
                          <td style={{ color: p.imagesRetrieved > 0 ? 'var(--text)' : 'var(--text-3)' }}>
                            {p.imagesRetrieved.toLocaleString()}
                          </td>
                          <td>{p.failed}</td>
                          <td>{p.rejected}</td>
                          <td>
                            <span
                              className={`pill ${p.statusNote.startsWith('Active') || p.statusNote.startsWith('Enabled') ? 'pill-healthy' : 'pill-ghost'}`}
                              style={{ fontSize: '0.74rem' }}
                            >
                              {p.statusNote}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Source-by-Source Artwork Breakdown Table */}
              <div className="audit-table-card" style={{ marginTop: 20 }}>
                <h4 className="audit-section-title">
                  <Icon name="sources" size={16} />
                  <span>Artwork Ingestion Coverage by Source</span>
                </h4>
                <table className="audit-table">
                  <thead>
                    <tr>
                      <th>Source Name</th>
                      <th>Primary Artwork Type</th>
                      <th>Total Eligible</th>
                      <th>Genuine Found</th>
                      <th>Missing</th>
                      <th>Coverage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {artworkAudit.sourceBreakdowns.map((s) => (
                      <tr key={s.sourceId}>
                        <td style={{ fontWeight: 600, color: 'var(--text)' }}>{s.sourceName}</td>
                        <td>{s.primaryType}</td>
                        <td>{s.totalEligible.toLocaleString()}</td>
                        <td>{s.genuineFound.toLocaleString()}</td>
                        <td>{s.missing.toLocaleString()}</td>
                        <td>
                          <span className={`pill ${s.genuinePercent >= 80 ? 'pill-healthy' : 'pill-pending'}`} style={{ fontSize: '0.74rem' }}>
                            {s.genuinePercent}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* View: Missing Items */}
          {artworkSubFilter === 'missing' && (
            <div className="audit-table-card">
              <h4 className="audit-section-title">
                <Icon name="info" size={16} />
                <span>Missing Artwork Diagnostics ({artworkAudit.missingItems.length} items logged)</span>
              </h4>
              <p className="section-sub" style={{ margin: '0 0 12px', fontSize: '0.84rem' }}>
                Transparent reasons why specific catalogue entries or broadcast listings lack genuine visual artwork.
              </p>
              {artworkAudit.missingItems.length === 0 ? (
                <p style={{ color: 'var(--text-3)', fontSize: '0.86rem', padding: '16px 0' }}>
                  No missing artwork detected in current catalogue.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {artworkAudit.missingItems.slice(0, 30).map((item, idx) => (
                    <div key={`${item.contentId}-${idx}`} className="artwork-item-card">
                      <div className="artwork-item-meta">
                        <span className="artwork-item-title">{item.title}</span>
                        <span className="artwork-item-sub">
                          {item.category} · {item.artworkType} · Source: {item.sourceName}
                        </span>
                        <span className="artwork-item-reason">Reason: {item.reason}</span>
                      </div>
                      <span className="pill pill-pending">Missing Asset</span>
                    </div>
                  ))}
                  {artworkAudit.missingItems.length > 30 && (
                    <p style={{ color: 'var(--text-3)', fontSize: '0.8rem', textAlign: 'center', marginTop: 8 }}>
                      Showing first 30 of {artworkAudit.missingItems.length} missing items.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* View: Failed Downloads */}
          {artworkSubFilter === 'failed' && (
            <div className="audit-table-card">
              <h4 className="audit-section-title">
                <Icon name="close" size={16} />
                <span>Failed Image Downloads ({artworkAudit.failedDownloads.length})</span>
              </h4>
              {artworkAudit.failedDownloads.length === 0 ? (
                <p style={{ color: 'var(--text-3)', fontSize: '0.86rem', padding: '16px 0' }}>
                  Zero failed downloads recorded. All retrieved image signatures passed raster validation.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {artworkAudit.failedDownloads.map((fail, idx) => (
                    <div key={`${fail.url}-${idx}`} className="artwork-item-card">
                      <div className="artwork-item-meta">
                        <span className="artwork-item-title">{fail.title}</span>
                        <span className="artwork-item-sub">URL: {fail.url}</span>
                        <span className="artwork-item-reason">Error: {fail.failureReason} (Tries: {fail.retryCount})</span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        onClick={() => artworkEngine.retryFailed()}
                      >
                        Retry
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* View: Ambiguous Matches */}
          {artworkSubFilter === 'ambiguous' && (
            <div className="audit-table-card">
              <h4 className="audit-section-title">
                <Icon name="search" size={16} />
                <span>Ambiguous Title Matches & Disambiguation Review</span>
              </h4>
              <p className="section-sub" style={{ margin: '0 0 12px', fontSize: '0.84rem' }}>
                Multi-edition films and remakes where automatic association was safely refused to prevent incorrect artwork assignment.
              </p>
              {artworkAudit.ambiguousMatches.length === 0 ? (
                <p style={{ color: 'var(--text-3)', fontSize: '0.86rem', padding: '16px 0' }}>
                  Zero ambiguous matches pending. All catalogue titles resolved with high confidence.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {artworkAudit.ambiguousMatches.map((amb, idx) => (
                    <div key={`${amb.contentId}-${idx}`} className="artwork-item-card">
                      <div className="artwork-item-meta" style={{ flex: 1 }}>
                        <span className="artwork-item-title">{amb.title}</span>
                        <span className="artwork-item-sub">
                          Confidence: {Math.round(amb.confidence * 100)}% · Reason: {amb.reason}
                        </span>
                        {amb.candidates && amb.candidates.length > 0 && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                            {amb.candidates.map((cand, cIdx) => (
                              <button
                                key={`${amb.contentId}-cand-${cIdx}`}
                                type="button"
                                className="btn btn-secondary btn-small"
                                style={{ fontSize: '0.74rem', padding: '4px 8px' }}
                                onClick={() => artworkEngine.resolveAmbiguous(amb.contentId, cand)}
                              >
                                Resolve as {cand.title}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="pill pill-pending">Review Required</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* View: Provider Status & Security */}
          {artworkSubFilter === 'providers' && (
            <div className="audit-table-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <h4 className="audit-section-title" style={{ margin: 0 }}>
                    <Icon name="settings" size={16} />
                    <span>External Metadata Providers & Security Architecture</span>
                  </h4>
                  <p className="section-sub" style={{ margin: '4px 0 0', fontSize: '0.84rem' }}>
                    Guarded native boundary integrations with explicit user opt-in, strict privacy, and zero telemetry.
                  </p>
                </div>
                <Link to="/settings/metadata" className="btn btn-primary btn-small">
                  Open Metadata Settings
                </Link>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
                <div style={{ background: 'var(--surface-2)', padding: '14px 16px', borderRadius: 'var(--r-m)', border: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <strong>The Movie Database (TMDB)</strong>
                    <span className={`pill ${loadMetadataConfig().tmdbEnabled ? 'pill-healthy' : 'pill-ghost'}`}>
                      {loadMetadataConfig().tmdbEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <p className="faint" style={{ fontSize: '0.8rem', margin: '0 0 10px', lineHeight: 1.4 }}>
                    {METADATA_ATTRIBUTIONS.tmdb.privacyNote}
                  </p>
                  <p className="faint" style={{ fontSize: '0.74rem', margin: '0 0 10px', color: 'var(--text-3)' }}>
                    {METADATA_ATTRIBUTIONS.tmdb.attributionText}
                  </p>
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    onClick={async (e) => {
                      const btn = e.currentTarget
                      btn.textContent = 'Testing...'
                      btn.disabled = true
                      const res = await testProviderConnection('tmdb', loadMetadataConfig().tmdbApiKey)
                      btn.textContent = res.ok ? 'Connected' : 'Check Key'
                      btn.disabled = false
                    }}
                  >
                    Test Connection
                  </button>
                </div>

                <div style={{ background: 'var(--surface-2)', padding: '14px 16px', borderRadius: 'var(--r-m)', border: '1px solid var(--line)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <strong>TVmaze Television API</strong>
                    <span className={`pill ${loadMetadataConfig().tvmazeEnabled ? 'pill-healthy' : 'pill-ghost'}`}>
                      {loadMetadataConfig().tvmazeEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <p className="faint" style={{ fontSize: '0.8rem', margin: '0 0 10px', lineHeight: 1.4 }}>
                    {METADATA_ATTRIBUTIONS.tvmaze.privacyNote}
                  </p>
                  <p className="faint" style={{ fontSize: '0.74rem', margin: '0 0 10px', color: 'var(--text-3)' }}>
                    {METADATA_ATTRIBUTIONS.tvmaze.attributionText}
                  </p>
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    onClick={async (e) => {
                      const btn = e.currentTarget
                      btn.textContent = 'Testing...'
                      btn.disabled = true
                      const res = await testProviderConnection('tvmaze')
                      btn.textContent = res.ok ? 'Connected' : 'Unavailable'
                      btn.disabled = false
                    }}
                  >
                    Test Connection
                  </button>
                </div>
              </div>

              <div className="tech-diag-grid">
                <div className="tech-diag-item">
                  <strong>XMLTV Broadcaster Icons:</strong> Strictly verified through Rust guarded client; tracking pixels and non-raster payloads rejected.
                </div>
                <div className="tech-diag-item">
                  <strong>Private Local Cache:</strong> Artwork stored with 0700/0600 POSIX permissions in sources/artwork/, surviving app restarts and offline sessions.
                </div>
                <div className="tech-diag-item">
                  <strong>Strict Rate Limiting:</strong> Enforces token-bucket throttling (TVmaze: max 20 req/10s; TMDB: max 4 req/s) to ensure polite API consumption.
                </div>
                <div className="tech-diag-item">
                  <strong>Zero Leakage:</strong> Stream URLs, auth tokens, and user credentials never touch external metadata providers.
                </div>
              </div>
            </div>
          )}
        </div>
      ) : selectedSubTab === 'audit' ? (
        <div className="audit-dashboard" role="region" aria-label="Catalogue Health Audit">
          {/* KPI Summary Cards */}
          <div className="audit-kpi-grid">
            <div className="audit-kpi-card">
              <span className="audit-kpi-lbl">Imported Channels</span>
              <span className="audit-kpi-val">{audit.totalChannels.toLocaleString()}</span>
              <span className="audit-kpi-sub">Across {store.playlists.length} active playlists</span>
            </div>

            <div className="audit-kpi-card">
              <span className="audit-kpi-lbl">Logo Coverage</span>
              <span className="audit-kpi-val">{audit.artworkEnrichedPercent}%</span>
              <span className="audit-kpi-sub">{audit.artworkEnrichedChannels.toLocaleString()} channels with verified logos</span>
            </div>

            <div className="audit-kpi-card">
              <span className="audit-kpi-lbl">Guide Matching</span>
              <span className="audit-kpi-val">{audit.guideMatchedPercent}%</span>
              <span className="audit-kpi-sub">{audit.guideMatchedChannels.toLocaleString()} channels with active XMLTV</span>
            </div>

            <div className="audit-kpi-card">
              <span className="audit-kpi-lbl">Total EPG Programmes</span>
              <span className="audit-kpi-val">{totalProgrammes.toLocaleString()}</span>
              <span className="audit-kpi-sub">Across {store.guides.length} cached guide feeds</span>
            </div>

            <div className="audit-kpi-card">
              <span className="audit-kpi-lbl">Genuine Content Artwork</span>
              <span className="audit-kpi-val">{artworkAudit.overallCoverage.genuinePercent}%</span>
              <span className="audit-kpi-sub">{artworkAudit.overallCoverage.totalGenuine.toLocaleString()} verified content assets</span>
            </div>
          </div>

          {/* Source-by-Source Breakdown */}
          {sourceBreakdowns.length > 0 && (
            <div className="audit-table-card">
              <h4 className="audit-section-title">
                <Icon name="live" size={16} />
                <span>Source-by-Source Ingestion & Coverage</span>
              </h4>
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Source Name</th>
                    <th>Channels</th>
                    <th>Logo Coverage</th>
                    <th>Guide Coverage</th>
                    <th>Sample Categories</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceBreakdowns.map((s) => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 600, color: 'var(--text)' }}>{s.name}</td>
                      <td>{s.total.toLocaleString()}</td>
                      <td>
                        <span className={`pill ${s.logoPercent > 80 ? 'pill-healthy' : 'pill-pending'}`} style={{ fontSize: '0.74rem' }}>
                          {s.logoPercent}% ({s.withLogo})
                        </span>
                      </td>
                      <td>
                        <span className={`pill ${s.guidePercent > 50 ? 'pill-healthy' : s.guidePercent > 0 ? 'pill-pending' : 'pill-ghost'}`} style={{ fontSize: '0.74rem' }}>
                          {s.guidePercent}% ({s.withGuide})
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-3)', fontSize: '0.78rem' }}>{s.categories}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Transparent Unmatched Channel Diagnosis */}
          <div className="audit-table-card">
            <h4 className="audit-section-title">
              <Icon name="info" size={16} />
              <span>Unmatched Channels Technical Diagnosis</span>
            </h4>
            <p className="section-sub" style={{ margin: '0 0 10px', fontSize: '0.84rem' }}>
              Truthful breakdown of the exact cause for channels without XMLTV television schedule listings.
            </p>
            <div className="audit-reasons-grid">
              <div className="audit-reason-item">
                <span className="audit-reason-count">{audit.unmatchedReasons.radioStreams}</span>
                <span className="audit-reason-label">Radio & Audio Broadcasts</span>
                <span className="audit-reason-desc">Audio-only radio streams included in playlist sources; television EPG listings are not published for radio stations.</span>
              </div>

              <div className="audit-reason-item">
                <span className="audit-reason-count">{audit.unmatchedReasons.fastChannelsNoFeed}</span>
                <span className="audit-reason-label">Digital FAST Channels</span>
                <span className="audit-reason-desc">Internet-only linear streams without regional terrestrial broadcaster XMLTV schedules.</span>
              </div>

              <div className="audit-reason-item">
                <span className="audit-reason-count">{audit.unmatchedReasons.missingTvgId}</span>
                <span className="audit-reason-label">Missing Source Identifier</span>
                <span className="audit-reason-desc">M3U channel entry does not provide a tvg-id attribute; manual mapping can be assigned in Live TV.</span>
              </div>

              <div className="audit-reason-item">
                <span className="audit-reason-count">{audit.unmatchedReasons.unlistedInGuide}</span>
                <span className="audit-reason-label">Unlisted in Loaded Guides</span>
                <span className="audit-reason-desc">Channel identifier was not found in the current set of imported XMLTV guide files.</span>
              </div>
            </div>
          </div>

          {/* Engine & Security Architecture Panel */}
          <div className="technical-info-card">
            <h4 className="audit-section-title">
              <Icon name="settings" size={16} />
              <span>Engine Architecture, Memory & Security Safeguards</span>
            </h4>
            <div className="tech-diag-grid" style={{ marginTop: 12 }}>
              <div className="tech-diag-item">
                <strong>HLS Playback Proxy:</strong> All streaming passes through Rust guarded handles (kstream://localhost/) with DRM and unknown encryption rejected.
              </div>
              <div className="tech-diag-item">
                <strong>XMLTV Parser Security:</strong> Rust quick-xml engine with entity attacks blocked, DTD expansion disabled, and 35MB memory cap.
              </div>
              <div className="tech-diag-item">
                <strong>Artwork Caching:</strong> Private POSIX 0700/0600 disk cache bounded at 150MB LRU, with strict magic-byte raster validation.
              </div>
              <div className="tech-diag-item">
                <strong>Storage Privacy:</strong> Plaintext credentials and token URLs are stripped from disk persistence in sources.json.
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Consumer-Facing Overview Card */}
          <div className="technical-info-card">
            {selectedSubTab === 'epg' && (
              <div>
                <h3 className="technical-card-title">Electronic Programme Guide (EPG) Schedules</h3>
                <p className="technical-card-desc">
                  XMLTV schedules provide programme titles, descriptions, and airtimes for your live TV channels.
                  Kinora automatically links schedules to your imported channels using broadcaster identifiers.
                </p>
              </div>
            )}

            {selectedSubTab === 'metadata' && (
              <div>
                <h3 className="technical-card-title">Programme Artwork & Metadata Services</h3>
                <p className="technical-card-desc">
                  Metadata services provide authentic promotional posters, artist imagery, and episode details.
                  Artwork is validated and stored on your device to keep your browsing responsive, private, and offline-capable.
                </p>
              </div>
            )}

            {selectedSubTab === 'subtitles' && (
              <div>
                <h3 className="technical-card-title">Captions, Subtitles & Accessibility</h3>
                <p className="technical-card-desc">
                  Kinora supports standard closed-caption formats including WebVTT and stream-embedded subtitles,
                  rendered with high-contrast type conforming to WCAG 2.2 accessibility standards.
                </p>
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => setShowDiagnostics((v) => !v)}
                aria-expanded={showDiagnostics}
              >
                <Icon name="settings" size={14} />
                <span>{showDiagnostics ? 'Hide Technical Diagnostics' : 'Show Engine & Diagnostics Details'}</span>
              </button>
            </div>
          </div>

          {/* Technical Diagnostics Panel (Cleanly Separated) */}
          {showDiagnostics && (
            <div className="technical-diagnostics-panel" role="region" aria-label="Technical Diagnostics">
              <h4 className="tech-diag-title">Native Engine & Security Architecture</h4>
              <div className="tech-diag-grid">
                <div className="tech-diag-item">
                  <strong>XMLTV Parser:</strong> Rust quick-xml engine with DTD entity blocking & 35MB memory ceiling.
                </div>
                <div className="tech-diag-item">
                  <strong>Disk Storage:</strong> Private user data directory with POSIX 0600 file permissions and atomic writes.
                </div>
                <div className="tech-diag-item">
                  <strong>Artwork Pipeline:</strong> Native magic-byte raster validation (PNG, JPEG, WebP) via Rust guarded client.
                </div>
                <div className="tech-diag-item">
                  <strong>Channel Matching:</strong> Normalised ASCII key matching with timezone-aware daylight saving handling.
                </div>
              </div>
            </div>
          )}

          {/* Resources Grid */}
          <div className="media-resources-grid">
            {activeList.map((res: MediaResource) => (
              <ResourceCard
                key={res.id}
                resource={res}
                inLibrary={store.mediaLibrary.isInPersonalLibrary(res.id)}
                isFavourite={store.mediaLibrary.isResourceFavourite(res.id)}
                onToggleLibrary={() => store.mediaLibrary.isInPersonalLibrary(res.id) ? store.mediaLibrary.removeFromPersonalLibrary(res.id) : store.mediaLibrary.addToPersonalLibrary(res.id)}
                onToggleFavourite={() => store.mediaLibrary.toggleResourceFavourite(res.id)}
                onOpenDetails={() => setDetailResourceId(res.id)}
              />
            ))}
          </div>

          {/* Detail Modal */}
          {detailResource && (
            <ResourceDetailModal
              resource={detailResource}
              inLibrary={store.mediaLibrary.isInPersonalLibrary(detailResource.id)}
              isFavourite={store.mediaLibrary.isResourceFavourite(detailResource.id)}
              userNotes={store.mediaLibrary.getResourceNotes(detailResource.id)}
              onClose={() => setDetailResourceId(null)}
              onToggleLibrary={() => store.mediaLibrary.isInPersonalLibrary(detailResource.id) ? store.mediaLibrary.removeFromPersonalLibrary(detailResource.id) : store.mediaLibrary.addToPersonalLibrary(detailResource.id)}
              onToggleFavourite={() => store.mediaLibrary.toggleResourceFavourite(detailResource.id)}
              onSaveNotes={(notes) => store.mediaLibrary.updateResourceNotes(detailResource.id, notes)}
              onVerifyNow={(id) => store.mediaLibrary.verifyResourceNow(id)}
            />
          )}
        </>
      )}
    </div>
  )
}
