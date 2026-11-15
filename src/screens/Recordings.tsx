import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon, type IconName } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { useToast } from '../components/Toast'
import { StateBlock } from '../components/ui'
import { recordingRef } from '../data/refs'
import type { Recording, SeriesRule } from '../lib/native'
import { useStore } from '../state/store'
import './Recordings.css'

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="chip" aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  )
}

function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: ReactNode }) {
  return (
    <StateBlock icon={icon} title={title} action={action}>
      {body}
    </StateBlock>
  )
}

type TabKind = 'all' | 'recording' | 'scheduled' | 'completed' | 'failed' | 'rules'

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 MB'
  const gb = bytes / (1024 * 1024 * 1024)
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  const mb = bytes / (1024 * 1024)
  return `${Math.max(0.1, mb).toFixed(1)} MB`
}

function formatDuration(secs: number): string {
  const mins = Math.max(1, Math.round(secs / 60))
  if (mins >= 60) {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }
  return `${mins}m`
}

function formatDateTime(unixSecs: number): string {
  try {
    const d = new Date(unixSecs * 1000)
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export function Recordings() {
  const store = useStore()
  const toast = useToast()
  const navigate = useNavigate()

  const [tab, setTab] = useState<TabKind>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [ruleModalOpen, setRuleModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Recording | null>(null)
  const [diagnosticTarget, setDiagnosticTarget] = useState<Recording | null>(null)

  // New series rule form state
  const [ruleTitle, setRuleTitle] = useState('')
  const [ruleChannelId, setRuleChannelId] = useState<string>('all')
  const [ruleRecordType, setRuleRecordType] = useState<'all_episodes' | 'new_only'>('all_episodes')
  const [rulePadStart, setRulePadStart] = useState(store.dvrConfig?.defaultPaddingStartMins ?? 2)
  const [rulePadEnd, setRulePadEnd] = useState(store.dvrConfig?.defaultPaddingEndMins ?? 5)
  const [ruleRetention, setRuleRetention] = useState(store.dvrConfig?.retentionDays ?? 30)

  const recordings = store.recordings
  const rules = store.seriesRules

  const executeDelete = async (rec: Recording) => {
    try {
      await store.deleteRecording(rec.id, true)
      toast(`Deleted "${rec.title}"`)
      setDeleteTarget(null)
    } catch {
      toast('Could not delete recording')
    }
  }
  const storage = store.dvrStorageInfo
  const config = store.dvrConfig

  const counts = useMemo(() => {
    return {
      all: recordings.length,
      recording: recordings.filter((r) => r.status === 'recording').length,
      scheduled: recordings.filter((r) => r.status === 'scheduled').length,
      completed: recordings.filter((r) => r.status === 'completed').length,
      failed: recordings.filter((r) => r.status === 'failed' || r.status === 'cancelled').length,
      rules: rules.length,
    }
  }, [recordings, rules])

  const filteredRecordings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return recordings.filter((r) => {
      if (tab === 'recording' && r.status !== 'recording') return false
      if (tab === 'scheduled' && r.status !== 'scheduled') return false
      if (tab === 'completed' && r.status !== 'completed') return false
      if (tab === 'failed' && r.status !== 'failed' && r.status !== 'cancelled') return false
      if (q) {
        const matchTitle = r.title.toLowerCase().includes(q)
        const matchChannel = r.channelName.toLowerCase().includes(q)
        if (!matchTitle && !matchChannel) return false
      }
      return true
    })
  }, [recordings, tab, searchQuery])

  const filteredRules = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return rules
    return rules.filter((r) => r.title.toLowerCase().includes(q))
  }, [rules, searchQuery])

  const handlePlay = (rec: Recording) => {
    navigate(`/watch/${encodeURIComponent(recordingRef(rec.id))}`)
  }

  const handleStop = async (rec: Recording) => {
    try {
      await store.stopRecording(rec.id)
      toast(`Stopped recording "${rec.title}"`)
    } catch {
      toast('Could not stop recording')
    }
  }

  const handleCancel = async (rec: Recording) => {
    try {
      await store.cancelRecording(rec.id)
      toast(`Cancelled scheduled recording "${rec.title}"`)
    } catch {
      toast('Could not cancel recording')
    }
  }

  const handleProtect = async (rec: Recording) => {
    try {
      const next = !rec.isProtected
      await store.protectRecording(rec.id, next)
      toast(next ? `"${rec.title}" is now protected from auto-cleanup` : `Removed protection from "${rec.title}"`)
    } catch {
      toast('Could not update protection')
    }
  }

  const handleDelete = (rec: Recording) => {
    setDeleteTarget(rec)
  }

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ruleTitle.trim()) return
    const now = Math.floor(Date.now() / 1000)
    const newRule: SeriesRule = {
      id: `rule_${now}_${Math.random().toString(16).slice(2, 7)}`,
      title: ruleTitle.trim(),
      channelId: ruleChannelId === 'all' ? null : ruleChannelId,
      recordType: ruleRecordType,
      paddingStartMins: rulePadStart,
      paddingEndMins: rulePadEnd,
      retentionDays: ruleRetention > 0 ? ruleRetention : null,
      keepMaxEpisodes: null,
      isActive: true,
      createdAt: now,
    }
    try {
      await store.saveSeriesRule(newRule)
      toast(`Created series rule for "${newRule.title}"`)
      setRuleTitle('')
      setRuleModalOpen(false)
      setTab('rules')
    } catch {
      toast('Could not save series rule')
    }
  }

  const handleToggleRule = async (rule: SeriesRule) => {
    try {
      await store.saveSeriesRule({ ...rule, isActive: !rule.isActive })
      toast(rule.isActive ? `Paused series rule "${rule.title}"` : `Resumed series rule "${rule.title}"`)
    } catch {
      toast('Could not update series rule')
    }
  }

  const handleDeleteRule = async (rule: SeriesRule) => {
    try {
      await store.deleteSeriesRule(rule.id)
      toast(`Removed series rule "${rule.title}"`)
    } catch {
      toast('Could not remove series rule')
    }
  }

  const maxCap = config?.maxStorageBytes && config.maxStorageBytes > 0
    ? config.maxStorageBytes
    : storage?.totalDiskBytes ?? (100 * 1024 * 1024 * 1024)
  const usedBytes = storage?.usedByRecordingsBytes ?? 0
  const usagePct = Math.min(100, Math.round((usedBytes / Math.max(1, maxCap)) * 100))

  return (
    <div className="screen recordings-screen">
      <PageHeader
        title="Recordings & DVR"
        actions={
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              type="button"
              className="btn primary"
              onClick={() => setRuleModalOpen(true)}
            >
              <Icon name="plus" size={16} /> New Series Rule
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => navigate('/live')}
            >
              <Icon name="guide" size={16} /> Open TV Guide
            </button>
          </div>
        }
      />

      {storage && (
        <div className={`dvr-storage-banner ${storage.isLowDisk ? 'is-low-disk' : ''}`} data-testid="dvr-storage-banner">
          <div className="dvr-storage-metrics">
            <div className="dvr-storage-row">
              <span>
                <strong>DVR Storage:</strong> {formatBytes(usedBytes)} used of {formatBytes(maxCap)} limit
              </span>
              <span>
                {formatBytes(storage.availableDiskBytes)} free on disk ({storage.recordingCount} recordings)
              </span>
            </div>
            <div className="dvr-storage-bar-track">
              <div
                className={`dvr-storage-bar-fill ${storage.isLowDisk || usagePct > 85 ? 'is-warning' : ''}`}
                style={{ width: `${Math.max(2, usagePct)}%` }}
              />
            </div>
            {storage.isLowDisk && (
              <div style={{ color: '#f87171', fontSize: '0.8rem', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Icon name="warning" size={14} /> Low disk space detected. Unprotected recordings will be cleaned up automatically according to retention settings.
              </div>
            )}
          </div>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => navigate('/settings')}
          >
            <Icon name="cog" size={15} /> Storage Settings
          </button>
        </div>
      )}

      <div className="recordings-toolbar">
        <div className="recordings-tabs" role="tablist" aria-label="Recording filters">
          <Chip active={tab === 'all'} onClick={() => setTab('all')}>
            All ({counts.all})
          </Chip>
          <Chip active={tab === 'recording'} onClick={() => setTab('recording')}>
            Recording ({counts.recording})
          </Chip>
          <Chip active={tab === 'scheduled'} onClick={() => setTab('scheduled')}>
            Scheduled ({counts.scheduled})
          </Chip>
          <Chip active={tab === 'completed'} onClick={() => setTab('completed')}>
            Completed ({counts.completed})
          </Chip>
          <Chip active={tab === 'failed'} onClick={() => setTab('failed')}>
            Failed / Cancelled ({counts.failed})
          </Chip>
          <Chip active={tab === 'rules'} onClick={() => setTab('rules')}>
            Series Rules ({counts.rules})
          </Chip>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="search"
            placeholder="Filter recordings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Filter recordings"
            style={{
              padding: '7px 12px',
              borderRadius: '8px',
              border: '1px solid var(--line)',
              background: 'var(--bg-elevated)',
              color: 'var(--fg)',
              fontSize: '0.875rem',
              minWidth: '220px',
            }}
          />
        </div>
      </div>

      {tab === 'rules' ? (
        filteredRules.length === 0 ? (
          <EmptyState
            icon="record"
            title="No series rules configured"
            body="Create a series rule to automatically record future episodes of a programme when they appear in the TV guide."
            action={
              <button type="button" className="btn primary" onClick={() => setRuleModalOpen(true)}>
                <Icon name="plus" size={16} /> Create Series Rule
              </button>
            }
          />
        ) : (
          <div className="recordings-grid" data-testid="series-rules-grid">
            {filteredRules.map((rule) => {
              const ch = rule.channelId ? store.findChannel(rule.channelId) : undefined
              return (
                <article key={rule.id} className="recording-card" data-testid={`series-rule-card-${rule.id}`}>
                  <div>
                    <div className="recording-card-header">
                      <div className="recording-badges">
                        <span className={`rec-badge ${rule.isActive ? 'status-completed' : 'status-cancelled'}`}>
                          {rule.isActive ? 'Active Rule' : 'Paused'}
                        </span>
                        <span className="rec-badge status-scheduled">
                          {rule.recordType === 'new_only' ? 'New Episodes Only' : 'All Episodes'}
                        </span>
                      </div>
                    </div>
                    <h3 className="recording-title" style={{ marginTop: '10px' }}>{rule.title}</h3>
                    <div className="recording-channel" style={{ marginTop: '4px' }}>
                      Channel: {ch ? ch.name : 'All Channels'}
                    </div>
                    <div className="recording-meta" style={{ marginTop: '10px' }}>
                      <span>Padding: -{rule.paddingStartMins}m / +{rule.paddingEndMins}m</span>
                      <span>Retention: {rule.retentionDays ? `${rule.retentionDays} days` : 'Keep forever'}</span>
                    </div>
                  </div>
                  <div className="recording-actions">
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => handleToggleRule(rule)}
                    >
                      <Icon name={rule.isActive ? 'pause' : 'play'} size={14} />
                      {rule.isActive ? 'Pause Rule' : 'Resume Rule'}
                    </button>
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => handleDeleteRule(rule)}
                    >
                      <Icon name="trash" size={14} /> Delete Rule
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )
      ) : filteredRecordings.length === 0 ? (
        <EmptyState
          icon="record"
          title={searchQuery ? 'No matching recordings' : 'No recordings in this view'}
          body="Start recording directly from any live channel player, or schedule upcoming broadcasts from the Live TV guide."
          action={
            <button type="button" className="btn primary" onClick={() => navigate('/live')}>
              <Icon name="live" size={16} /> Browse Live TV Guide
            </button>
          }
        />
      ) : (
        <div className="recordings-grid" data-testid="recordings-grid">
          {filteredRecordings.map((rec) => (
            <article key={rec.id} className="recording-card" data-testid={`recording-card-${rec.id}`}>
              <div>
                <div className="recording-card-header">
                  <div className="recording-badges">
                    {rec.status === 'failed' ? (
                      <button
                        type="button"
                        className="rec-badge status-failed"
                        style={{ cursor: 'pointer', border: 'none', background: '#ef4444', color: '#ffffff', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        onClick={() => setDiagnosticTarget(rec)}
                        title="Click to view failure diagnostics"
                      >
                        <Icon name="warning" size={11} /> failed (Diagnostics)
                      </button>
                    ) : (
                      <span className={`rec-badge status-${rec.status}`}>
                        {rec.status === 'recording' && <span className="rec-dot-pulse" />}
                        {rec.status}
                      </span>
                    )}
                    {rec.isProtected && (
                      <span className="rec-badge protected" title="Protected from automatic cleanup">
                        <Icon name="lock" size={11} /> Protected
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '0.78rem', color: 'var(--fg-muted)' }}>
                    {formatDuration(rec.durationSecs)}
                  </span>
                </div>

                <h3 className="recording-title" style={{ marginTop: '10px' }}>{rec.title}</h3>
                <div className="recording-channel" style={{ marginTop: '4px' }}>{rec.channelName}</div>

                {rec.description && (
                  <p className="recording-desc" style={{ marginTop: '8px' }}>{rec.description}</p>
                )}

                <div className="recording-meta" style={{ marginTop: '10px' }}>
                  <span>{formatDateTime(rec.startTime)}</span>
                  {rec.fileSizeBytes > 0 && <span>{formatBytes(rec.fileSizeBytes)}</span>}
                  {rec.status === 'scheduled' && (
                    <span>Padding: -{rec.paddingStartMins}m / +{rec.paddingEndMins}m</span>
                  )}
                </div>

                {rec.errorMessage && (
                  <div style={{ color: '#f87171', fontSize: '0.8rem', marginTop: '8px' }}>
                    {rec.errorMessage}
                  </div>
                )}
              </div>

              <div className="recording-actions">
                {(rec.status === 'completed' || rec.status === 'recording') && (
                  <button
                    type="button"
                    className="btn primary sm"
                    onClick={() => handlePlay(rec)}
                  >
                    <Icon name="play" size={14} /> Watch
                  </button>
                )}

                {rec.status === 'recording' && (
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => handleStop(rec)}
                  >
                    <Icon name="close" size={14} /> Stop
                  </button>
                )}

                {rec.status === 'scheduled' && (
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => handleCancel(rec)}
                  >
                    <Icon name="close" size={14} /> Cancel
                  </button>
                )}

                {rec.status === 'completed' && (
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => handleProtect(rec)}
                  >
                    <Icon name="lock" size={14} /> {rec.isProtected ? 'Unprotect' : 'Protect'}
                  </button>
                )}

                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => handleDelete(rec)}
                  aria-label={`Delete ${rec.title}`}
                >
                  <Icon name="trash" size={14} /> Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {ruleModalOpen && (
        <div className="series-rule-modal-backdrop" role="dialog" aria-modal="true" aria-label="New Series Recording Rule">
          <form className="series-rule-modal" onSubmit={handleSaveRule}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem' }}>New Series Recording Rule</h2>
              <button type="button" className="btn ghost sm" onClick={() => setRuleModalOpen(false)}>
                <Icon name="close" size={16} />
              </button>
            </div>

            <div className="series-rule-field">
              <label htmlFor="rule-title-input">Series or Programme Title</label>
              <input
                id="rule-title-input"
                type="text"
                required
                placeholder="e.g. Planet Earth"
                value={ruleTitle}
                onChange={(e) => setRuleTitle(e.target.value)}
              />
            </div>

            <div className="series-rule-field">
              <label htmlFor="rule-channel-select">Channel Filter</label>
              <select
                id="rule-channel-select"
                value={ruleChannelId}
                onChange={(e) => setRuleChannelId(e.target.value)}
              >
                <option value="all">All Channels</option>
                {store.channels.slice(0, 100).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {ruleChannelId !== 'all' && rules.some((r) => r.isActive && r.channelId === ruleChannelId) && (
              <div style={{ padding: '8px 12px', background: 'rgba(234, 179, 8, 0.12)', border: '1px solid rgba(234, 179, 8, 0.35)', borderRadius: 'var(--r-s)', fontSize: '0.8125rem', color: '#facc15' }}>
                <span style={{ fontWeight: 600 }}>Tuner overlap notice:</span> An active series rule already records from this channel. Overlapping broadcasts share available tuner capacity.
              </div>
            )}

            <div className="series-rule-field">
              <label htmlFor="rule-type-select">Episodes to Record</label>
              <select
                id="rule-type-select"
                value={ruleRecordType}
                onChange={(e) => setRuleRecordType(e.target.value as 'all_episodes' | 'new_only')}
              >
                <option value="all_episodes">All Episodes (Including Repeats)</option>
                <option value="new_only">New Episodes Only</option>
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="series-rule-field">
                <label htmlFor="rule-pad-start">Start Early (Minutes)</label>
                <input
                  id="rule-pad-start"
                  type="number"
                  min={0}
                  max={30}
                  value={rulePadStart}
                  onChange={(e) => setRulePadStart(Number(e.target.value))}
                />
              </div>
              <div className="series-rule-field">
                <label htmlFor="rule-pad-end">End Late (Minutes)</label>
                <input
                  id="rule-pad-end"
                  type="number"
                  min={0}
                  max={60}
                  value={rulePadEnd}
                  onChange={(e) => setRulePadEnd(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="series-rule-field">
              <label htmlFor="rule-retention">Keep Recordings For (Days, 0 = Forever)</label>
              <input
                id="rule-retention"
                type="number"
                min={0}
                max={365}
                value={ruleRetention}
                onChange={(e) => setRuleRetention(Number(e.target.value))}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button type="button" className="btn ghost" onClick={() => setRuleModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn primary">
                Save Series Rule
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <div className="lightbox-backdrop" role="dialog" aria-modal="true" aria-label="Confirm Delete Recording" onClick={() => setDeleteTarget(null)}>
          <div className="lightbox-content" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Icon name="trash" size={20} />
              <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>
                Delete Recording
              </h3>
            </div>
            <p style={{ margin: '8px 0', fontSize: '0.875rem', color: 'var(--text-1)' }}>
              Are you sure you want to permanently delete <strong>{deleteTarget.title}</strong> from disk?
            </p>
            <p className="faint" style={{ margin: '4px 0 16px', fontSize: '0.8125rem' }}>
              This will remove the file from your local storage. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: '#e50914' }}
                onClick={() => executeDelete(deleteTarget)}
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {diagnosticTarget && (
        <div className="lightbox-backdrop" role="dialog" aria-modal="true" aria-label="Recording Failure Diagnostics" onClick={() => setDiagnosticTarget(null)}>
          <div className="lightbox-content" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="warning" size={20} /> Recording Diagnostics
              </h3>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setDiagnosticTarget(null)} aria-label="Close diagnostics">
                <Icon name="close" size={16} />
              </button>
            </div>
            <p style={{ margin: '6px 0', fontSize: '0.875rem' }}>
              <strong>Title:</strong> {diagnosticTarget.title}
            </p>
            <p style={{ margin: '6px 0', fontSize: '0.875rem' }}>
              <strong>Channel:</strong> {diagnosticTarget.channelName}
            </p>
            <p style={{ margin: '6px 0', fontSize: '0.875rem' }}>
              <strong>Recorded:</strong> {formatDateTime(diagnosticTarget.startTime)}
            </p>
            <div style={{ marginTop: 12, padding: 12, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 'var(--r-s)' }}>
              <strong style={{ display: 'block', fontSize: '0.8125rem', color: '#f87171', marginBottom: 4 }}>
                Diagnostic Failure Reason:
              </strong>
              <span style={{ fontSize: '0.875rem', color: 'var(--text-1)' }}>
                {diagnosticTarget.errorMessage || 'No specific error message was recorded by the recording backend.'}
              </span>
            </div>
            <p className="faint" style={{ marginTop: 12, fontSize: '0.8125rem' }}>
              Recommended Recovery: Test upstream source connectivity in Sources, ensure storage limit is not reached, and verify concurrent tuner limits.
            </p>
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setDiagnosticTarget(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
