import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { demoValidation } from '../data/sources'
import type { Source, SourceKind } from '../data/types'
import { Dialog } from '../components/Dialog'
import { Icon, type IconName } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { useToast } from '../components/Toast'
import { DemoNote, ProgressBar, Segmented, StateBlock, Switch } from '../components/ui'
import { clock, relative, useNow } from '../lib/time'
import { useStore } from '../state/store'
import './Sources.css'

const kindLabel: Record<SourceKind, string> = { m3u: 'M3U playlist', m3u8: 'M3U8 playlist', xmltv: 'XMLTV guide', 'url-list': 'URL list' }
const kindIcon: Record<SourceKind, IconName> = { m3u: 'live', m3u8: 'live', xmltv: 'guide', 'url-list': 'link' }
const statusLabel: Record<Source['status'], string> = {
  healthy: 'Active', degraded: 'Some streams failing', failing: 'Failing', scanning: 'Checking streams', pending: 'Not checked yet', queued: 'Refresh queued',
}

function statusPill(s: Source) {
  const label = statusLabel[s.status]
  if (s.scan) return `${label} · ${s.scan.done} of ${s.scan.total}`
  if (s.streams) return `${label} · ${s.streams.working} channels`
  return s.kind === 'xmltv' && s.status === 'healthy' ? `${label} · guide feed` : label
}

export function Sources() {
  const now = useNow()
  const store = useStore()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'discovery' ? 'discovery' : 'active'
  const [detailId, setDetailId] = useState<string | null>(null)
  const [removeId, setRemoveId] = useState<string | null>(null)

  const detail = store.sources.find((s) => s.id === detailId)
  const toRemove = store.sources.find((s) => s.id === removeId)
  const refresh = (s: Source) => {
    store.queueRefresh(s.id)
    toast(`${s.name} queued for refresh. Checking runs once the source service is connected.`)
  }

  const tabs = (
    <div className="tabs" role="tablist" aria-label="Sources">
      <button type="button" role="tab" className="tab" aria-selected={tab === 'active'} onClick={() => setParams({}, { replace: true })}>Active Sources</button>
      <button type="button" role="tab" className="tab" aria-selected={tab === 'discovery'} onClick={() => setParams({ tab: 'discovery' }, { replace: true })}>Discovery</button>
    </div>
  )

  return (
    <>
      <PageHeader title="Sources" tabs={tabs} search={false} actions={<Link to="/sources/add" className="btn btn-primary btn-small"><Icon name="plus" size={16} />Add Source</Link>} />
      <div className="page sources">

        {tab === 'discovery' ? <Discovery /> : store.sources.length === 0 ? (
          <StateBlock icon="sources" title="No sources yet" action={<Link to="/sources/add" className="btn btn-primary"><Icon name="plus" size={18} />Add Source</Link>}>
            Add an M3U playlist you are allowed to use, such as your own tuner's channel lineup, or an XMLTV guide feed.
          </StateBlock>
        ) : (
          <ul className="source-list">
            {store.sources.map((s) => (
              <li key={s.id} className="source-row">
                <button type="button" className="source-main" onClick={() => setDetailId(s.id)} aria-label={`${s.name}, ${statusLabel[s.status]}. Open details`}>
                  <span className="source-icon"><Icon name={kindIcon[s.kind]} /></span>
                  <span className="source-id">
                    <strong>{s.name}</strong>
                    <span className="faint">{s.lastChecked ? `Last checked: ${relative(s.lastChecked, now)}` : 'Not checked yet'}</span>
                  </span>
                  <span className={`pill pill-${s.status}`}>{statusPill(s)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="sources-foot"><DemoNote>Demonstration data. Nothing is fetched, scanned or validated in this build; counts are sample values. Open a source to refresh or remove it.</DemoNote></div>

        <Dialog open={!!detail} onClose={() => setDetailId(null)} title={detail?.name ?? ''} variant="sheet">
          {detail && <SourceDetail source={detail} onRefresh={() => refresh(detail)} onRemove={() => { setDetailId(null); setRemoveId(detail.id) }} />}
        </Dialog>

        <Dialog
          open={!!toRemove}
          onClose={() => setRemoveId(null)}
          title="Remove this source?"
          footer={<>
            <button type="button" className="btn btn-secondary" onClick={() => setRemoveId(null)}>Keep it</button>
            <button type="button" className="btn btn-danger" onClick={() => { if (toRemove) { store.removeSource(toRemove.id); toast(`Removed ${toRemove.name}`) } setRemoveId(null) }}>Remove source</button>
          </>}
        >
          {toRemove && <p className="muted">{toRemove.name} will be removed{toRemove.streams ? `, along with the ${toRemove.streams.total} streams it lists` : ''}. Channels other sources provide are not affected.</p>}
        </Dialog>
      </div>
    </>
  )
}

function SourceDetail({ source: s, onRefresh, onRemove }: { source: Source; onRefresh: () => void; onRemove: () => void }) {
  const now = useNow()
  const { prefs } = useStore()
  const [filter, setFilter] = useState<'all' | 'working' | 'failed'>('all')
  const rows = demoValidation(s).filter((r) => filter === 'all' || (filter === 'working' ? r.status === 'working' : r.status !== 'working'))
  const max = Math.max(1, ...s.history.map((h) => h.working + h.failed))

  return (
    <div className="source-detail">
      <p><span className={`pill pill-${s.status}`}>{statusLabel[s.status]}</span></p>
      <dl className="detail-facts">
        <div><dt>Type</dt><dd>{kindLabel[s.kind]}</dd></div>
        <div><dt>Address</dt><dd className="source-url-full">{s.url}</dd></div>
        <div><dt>Added</dt><dd>{relative(s.addedAt, now)}</dd></div>
        <div><dt>Last checked</dt><dd>{s.lastChecked ? relative(s.lastChecked, now) : 'Never'}</dd></div>
        <div><dt>Refresh</dt><dd>{s.refreshInterval === 'manual' ? 'Manual only' : `Every ${s.refreshInterval}`}</dd></div>
      </dl>
      <div className="title-actions">
        <button type="button" className="btn btn-ghost btn-small" onClick={onRefresh} disabled={s.status === 'queued' || s.status === 'scanning'}><Icon name="refresh" size={16} />Refresh now</button>
        <button type="button" className="btn btn-ghost btn-small" onClick={onRemove}><Icon name="trash" size={16} />Remove</button>
      </div>

      {s.scan && (
        <section>
          <h3 className="label">Scan in progress</h3>
          <ProgressBar value={s.scan.done / s.scan.total} label="Scan progress" />
          <p className="faint tnum" style={{ marginTop: 8 }}>{s.scan.done} of {s.scan.total} streams checked. Sample snapshot; no scan is running.</p>
        </section>
      )}

      {s.history.length > 0 && (
        <section>
          <h3 className="label">Health over the last 7 days</h3>
          <div className="health-chart" role="img" aria-label={`Working and failed streams across the last ${s.history.length} checks. Latest: ${s.history.at(-1)?.working} working, ${s.history.at(-1)?.failed} failed.`}>
            {s.history.map((h) => (
              <span key={h.at} className="health-col" title={`${new Date(h.at).toLocaleDateString('en-GB', { weekday: 'short' })} ${clock(h.at, prefs.timeFormat)}: ${h.working} working, ${h.failed} failed`}>
                <i className="bad-seg" style={{ height: `${(h.failed / max) * 100}%` }} />
                <i className="ok-seg" style={{ height: `${(h.working / max) * 100}%` }} />
              </span>
            ))}
          </div>
          <p className="chart-legend faint"><span className="ok">Working</span><span className="bad">Failed</span><span>One bar per check, every 12 hours</span></p>
        </section>
      )}

      {s.streams && (
        <section>
          <div className="section-head">
            <h3 className="label">Validation results</h3>
            <Segmented label="Show" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'working', label: 'Working' }, { value: 'failed', label: 'Failed' }]} />
          </div>
          <p className="faint" style={{ marginBottom: 10, fontSize: '0.8125rem' }}>Sample of matched channels. Real results list every stream in the playlist.</p>
          {rows.length === 0 ? (
            <p className="muted">No {filter} streams in this sample.</p>
          ) : (
            <table className="validation">
              <thead><tr><th scope="col">Channel</th><th scope="col">Result</th><th scope="col">Detail</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.channel}>
                    <td><span className="cell-stack">{r.channel}<span className="faint">{r.group}</span></span></td>
                    <td><span className={`pill pill-${r.status === 'working' ? 'healthy' : 'failing'}`}>{r.status === 'working' ? 'Working' : r.status === 'timeout' ? 'Timed out' : 'Failed'}</span></td>
                    <td className="faint tnum">{r.responseMs ? `${r.detail} · ${r.responseMs} ms` : r.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  )
}

function Discovery() {
  const store = useStore()
  const toast = useToast()
  return (
    <div className="discovery">
      <p className="muted" style={{ maxWidth: '64ch' }}>
        Discovery providers suggest sources for you to review. Nothing is added without your confirmation, and only sources whose owners publish them for reuse are considered.
      </p>
      <ul className="provider-list">
        {store.providers.map((p) => (
          <li key={p.id} className="provider">
            <span className="source-icon"><Icon name="radar" /></span>
            <div>
              <strong id={`prov-${p.id}`}>{p.name}</strong>
              <p className="muted">{p.description}</p>
              <span className="pending-tag">Not connected yet</span>
            </div>
            <Switch
              checked={p.enabled}
              label={p.name}
              onChange={() => { store.toggleProvider(p.id); toast(`${p.name} ${p.enabled ? 'turned off' : 'turned on'}. Takes effect once discovery is connected.`) }}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

const typeOptions: { value: SourceKind; label: string; icon: IconName }[] = [
  { value: 'm3u', label: 'M3U Playlist', icon: 'live' },
  { value: 'm3u8', label: 'M3U8', icon: 'live' },
  { value: 'url-list', label: 'URL List', icon: 'link' },
  { value: 'xmltv', label: 'XMLTV Guide', icon: 'guide' },
]

/** Full-page add flow from the mockup: Discover, Validate, Add. */
export function AddSource() {
  const store = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [kind, setKind] = useState<SourceKind>('m3u')
  const [interval, setRefreshEvery] = useState(store.prefs.refreshInterval)
  const [validate, setValidate] = useState(store.prefs.validateOnAdd)
  const [errors, setErrors] = useState<{ name?: string; url?: string }>({})

  // Trust boundary: only well-formed http(s) addresses get through; credentials in URLs are refused.
  const checkUrl = () => {
    let parsed: URL | null = null
    try { parsed = new URL(url.trim()) } catch { parsed = null }
    let error: string | undefined
    if (!url.trim()) error = 'Paste the playlist or guide address.'
    else if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) error = 'Use a full address starting with http:// or https://'
    else if (parsed.username || parsed.password) error = 'Remove the username and password from the address. Sign-in details are not stored in URLs.'
    else if (store.sources.some((s) => s.url === parsed?.href)) error = 'This address is already one of your sources.'
    setErrors({ url: error })
    if (!error && parsed && !name.trim()) setName(parsed.hostname.replace(/^www\./, ''))
    return !error
  }
  const checkName = () => {
    const n = name.trim()
    const error = !n ? 'Give the source a name you will recognise.' : store.sources.some((s) => s.name.toLowerCase() === n.toLowerCase()) ? 'You already have a source with this name.' : undefined
    setErrors({ name: error })
    return !error
  }

  const add = () => {
    store.addSource({
      id: `src-${Date.now().toString(36)}`, name: name.trim(), kind, url: new URL(url.trim()).href, addedAt: Date.now(),
      lastChecked: null, status: 'pending', streams: null, scan: null, history: [], refreshInterval: interval,
    })
    toast(`Added ${name.trim()}. It will be checked once the source service is connected.`)
    navigate('/sources')
  }

  const steps = ['Discover', 'Validate', 'Add']
  return (
    <>
      <PageHeader title="Add Source" tabs={<Link to="/sources" className="text-link"><Icon name="back" size={16} />Back to Sources</Link>} />
      <div className="page add-source">
        <ol className="steps" aria-label="Progress">
          {steps.map((label, i) => (
            <li key={label} aria-current={step === i + 1 ? 'step' : undefined} className={step > i + 1 ? 'done' : ''}>
              <span className="step-no">{step > i + 1 ? <Icon name="check" size={14} /> : i + 1}</span>{label}
            </li>
          ))}
        </ol>

        {step === 1 && (
          <form className="add-form" onSubmit={(e) => { e.preventDefault(); if (checkUrl()) setStep(2) }}>
            <label className="field">
              <span>Paste a playlist or guide URL</span>
              <input className="input input-lg" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="e.g. https://example.com/playlist.m3u" aria-invalid={errors.url ? true : undefined} autoFocus />
              {errors.url ? <span className="field-error">{errors.url}</span> : <span className="field-hint">Only add sources you have permission to use.</span>}
            </label>
            <div className="field">
              <span>Source Type</span>
              <Segmented label="Source type" value={kind} onChange={setKind} options={typeOptions} className="type-picker" />
            </div>
            <button type="submit" className="btn btn-primary btn-block">Scan &amp; Validate</button>
            <p className="faint add-note">Every stream is checked before channels are added. Checking is not connected in this build, so new sources are saved as “Not checked yet”.</p>
          </form>
        )}

        {step === 2 && (
          <form className="add-form" onSubmit={(e) => { e.preventDefault(); if (checkName()) setStep(3) }}>
            <div className="validate-box">
              <p className="validate-status"><Icon name="warning" size={18} />Validation service not connected</p>
              <p className="muted">Once connected, Kinora will check this {kindLabel[kind]} before adding it:</p>
              <ul className="check-list">
                <li><Icon name="check" size={16} />The address responds and is a valid {kindLabel[kind]}</li>
                {kind !== 'xmltv' && <li><Icon name="check" size={16} />Each stream is opened briefly to see whether it plays</li>}
                {kind !== 'xmltv' && <li><Icon name="check" size={16} />Duplicates of channels you already have are merged</li>}
                {kind === 'xmltv' && <li><Icon name="check" size={16} />Programmes are matched to your channels by tvg-id, then by name</li>}
              </ul>
            </div>
            <label className="field">
              <span>Name</span>
              <input className="input" value={name} maxLength={48} onChange={(e) => setName(e.target.value)} placeholder="For example: Living room tuner" aria-invalid={errors.name ? true : undefined} />
              {errors.name && <span className="field-error">{errors.name}</span>}
            </label>
            <label className="field">
              <span>Refresh</span>
              <select className="select" value={interval} onChange={(e) => setRefreshEvery(e.target.value as typeof interval)}>
                <option value="6h">Every 6 hours</option>
                <option value="12h">Every 12 hours</option>
                <option value="24h">Every day</option>
                <option value="manual">Only when I refresh it</option>
              </select>
            </label>
            <div className="setting-line">
              <span><strong>Check before adding</strong><span className="faint">Off adds the source straight away and checks it later.</span></span>
              <Switch checked={validate} onChange={setValidate} label="Check before adding" />
            </div>
            <div className="add-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>Back</button>
              <button type="submit" className="btn btn-primary">Continue</button>
            </div>
          </form>
        )}

        {step === 3 && (
          <div className="add-form">
            <dl className="detail-facts">
              <div><dt>Name</dt><dd>{name.trim()}</dd></div>
              <div><dt>Address</dt><dd className="source-url-full">{url.trim()}</dd></div>
              <div><dt>Type</dt><dd>{kindLabel[kind]}</dd></div>
              <div><dt>Checks</dt><dd>{validate ? 'Before adding' : 'After adding'}</dd></div>
              <div><dt>Refresh</dt><dd>{interval === 'manual' ? 'Manual only' : `Every ${interval}`}</dd></div>
            </dl>
            <p className="muted">The source is saved now and shown as “Not checked yet” until checking is available.</p>
            <div className="add-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setStep(2)}>Back</button>
              <button type="button" className="btn btn-primary" onClick={add}><Icon name="plus" size={18} />Add Source</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
