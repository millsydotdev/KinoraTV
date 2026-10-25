import { useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { demoValidation } from '../data/sources'
import type { Source, SourceKind } from '../data/types'
import { Dialog } from '../components/Dialog'
import { Icon, type IconName } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { useToast } from '../components/Toast'
import { DemoNote, ProgressBar, Segmented, StateBlock, Switch } from '../components/ui'
import { clock, relative, useNow } from '../lib/time'
import { fetchPlaylist, readPlaylistFile, type PlaylistReport } from '../lib/native'
import {
  NOT_TESTED, UNCATEGORISED, addressLabel, channelGroups, checkPlaylistUrl, defaultName, fileLabel, readForPreview, statusText, statusTone, toChannels,
  type PlaylistSource,
} from '../state/playlists'
import { useStore } from '../state/store'
import './Sources.css'

/** File picker filter: M3U extensions and the MIME types servers commonly use for them. */
const PLAYLIST_ACCEPT = '.m3u,.m3u8,audio/x-mpegurl,audio/mpegurl,application/vnd.apple.mpegurl,application/x-mpegurl'

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
  const playlistDetail = store.playlists.find((s) => s.id === detailId)
  const toRemove = store.sources.find((s) => s.id === removeId)
  const playlistToRemove = store.playlists.find((s) => s.id === removeId)
  const refresh = (s: Source) => {
    store.queueRefresh(s.id)
    toast(`${s.name} is a sample source; nothing is fetched for it.`)
  }
  const remove = () => {
    if (playlistToRemove) {
      store.removePlaylist(playlistToRemove.id)
      toast(`Removed ${playlistToRemove.name} and its channels`)
    } else if (toRemove) {
      store.removeSource(toRemove.id)
      toast(`Removed ${toRemove.name}`)
    }
    setRemoveId(null)
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

        {tab === 'discovery' ? <Discovery /> : store.sources.length + store.playlists.length === 0 ? (
          <StateBlock icon="sources" title="No sources yet" action={<Link to="/sources/add" className="btn btn-primary"><Icon name="plus" size={18} />Add Source</Link>}>
            Add an M3U playlist you are allowed to use, such as your own tuner's channel lineup, or an XMLTV guide feed.
          </StateBlock>
        ) : (
          <ul className="source-list">
            {store.playlists.map((s) => <PlaylistRow key={s.id} source={s} now={now} onOpen={() => setDetailId(s.id)} />)}
            {store.sources.map((s) => (
              <li key={s.id} className="source-row">
                <button type="button" className="source-main" onClick={() => setDetailId(s.id)} aria-label={`${s.name}, sample source, ${statusLabel[s.status]}. Open details`}>
                  <span className="source-icon"><Icon name={kindIcon[s.kind]} /></span>
                  <span className="source-id">
                    <strong>{s.name} <span className="pending-tag">Sample</span></strong>
                    <span className="faint">{s.lastChecked ? `Last checked: ${relative(s.lastChecked, now)}` : 'Not checked yet'}</span>
                  </span>
                  <span className={`pill pill-${s.status}`}>{statusPill(s)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="sources-foot">
          <DemoNote>
            {store.playlists.length > 0 && 'Imported playlists are kept only until Kinora closes, and their streams have not been playback-tested. '}
            Sources marked Sample are demonstration data: nothing is fetched, scanned or validated for them, and their counts are sample values. Open a source to refresh or remove it.
          </DemoNote>
        </div>

        <Dialog open={!!detail || !!playlistDetail} onClose={() => setDetailId(null)} title={playlistDetail?.name ?? detail?.name ?? ''} variant="sheet">
          {playlistDetail && <PlaylistDetail source={playlistDetail} onRemove={() => { setDetailId(null); setRemoveId(playlistDetail.id) }} />}
          {detail && <SourceDetail source={detail} onRefresh={() => refresh(detail)} onRemove={() => { setDetailId(null); setRemoveId(detail.id) }} />}
        </Dialog>

        <Dialog
          open={!!toRemove || !!playlistToRemove}
          onClose={() => setRemoveId(null)}
          title="Remove this source?"
          footer={<>
            <button type="button" className="btn btn-secondary" onClick={() => setRemoveId(null)}>Keep it</button>
            <button type="button" className="btn btn-danger" onClick={remove}>Remove source</button>
          </>}
        >
          {playlistToRemove && <p className="muted">{playlistToRemove.name} and its {playlistToRemove.channels.length} channels will be removed from Live TV. Imported playlists are not saved, so you would need to add it again to get them back.</p>}
          {toRemove && <p className="muted">{toRemove.name} will be removed{toRemove.streams ? `, along with the ${toRemove.streams.total} streams it lists` : ''}. Channels other sources provide are not affected.</p>}
        </Dialog>
      </div>
    </>
  )
}

/** One imported playlist in the source list. Exported for tests. */
export function PlaylistRow({ source: s, now, onOpen }: { source: PlaylistSource; now: number; onOpen: () => void }) {
  return (
    <li className="source-row">
      <button type="button" className="source-main" onClick={onOpen} aria-label={`${s.name}, ${statusText(s)}. Open details`}>
        <span className="source-icon"><Icon name={s.origin === 'file' ? 'folder' : 'live'} /></span>
        <span className="source-id">
          <strong>{s.name}</strong>
          <span className="faint">{s.lastSuccess ? `Imported ${relative(s.lastSuccess, now)}` : 'Not imported'} · {NOT_TESTED}</span>
        </span>
        <span className={`pill pill-${statusTone(s)}`}>{statusText(s)}</span>
      </button>
    </li>
  )
}

/** Details of an imported playlist: what was read, and nothing about playback. Exported for tests. */
export function PlaylistDetail({ source: s, onRemove }: { source: PlaylistSource; onRemove: () => void }) {
  const now = useNow()
  const store = useStore()
  const fileInput = useRef<HTMLInputElement>(null)
  const busy = s.status === 'importing'
  const groups = channelGroups(s.channels).length
  return (
    <div className="source-detail">
      <p><span className={`pill pill-${statusTone(s)}`}>{statusText(s)}</span></p>
      {s.status === 'failed' && s.error && (
        <p className="field-error" role="alert">{s.error}{s.lastSuccess ? ' The channels from the last successful import are still shown.' : ''}</p>
      )}
      <dl className="detail-facts">
        <div><dt>Type</dt><dd>{s.origin === 'url' ? 'M3U playlist from an address' : 'M3U playlist file'}</dd></div>
        <div><dt>{s.origin === 'url' ? 'Address' : 'File'}</dt><dd className="source-url-full">{s.label}</dd></div>
        <div><dt>Added</dt><dd>{relative(s.addedAt, now)}</dd></div>
        <div><dt>Last import</dt><dd>{s.lastSuccess ? relative(s.lastSuccess, now) : 'Never'}</dd></div>
        <div><dt>Channels</dt><dd className="tnum">{s.channels.length} in {groups} {groups === 1 ? 'group' : 'groups'}</dd></div>
        <div><dt>Skipped</dt><dd className="tnum">{s.skipped} malformed, {s.duplicates} exact repeats</dd></div>
        <div><dt>Playback</dt><dd>Not tested. Kinora has read the channel list; it has not tried to play any stream.</dd></div>
        <div><dt>Kept</dt><dd>Until Kinora closes</dd></div>
      </dl>
      <div className="title-actions">
        {s.origin === 'url' ? (
          <button type="button" className="btn btn-ghost btn-small" onClick={() => void store.refreshPlaylist(s)} disabled={busy}>
            <Icon name="refresh" size={16} />{busy ? 'Refreshing…' : 'Refresh now'}
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => fileInput.current?.click()} disabled={busy}>
              <Icon name="refresh" size={16} />{busy ? 'Importing…' : 'Choose the file again'}
            </button>
            <input ref={fileInput} type="file" accept={PLAYLIST_ACCEPT} hidden onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void store.reimportPlaylist(s.id, file)
            }} />
          </>
        )}
        <button type="button" className="btn btn-ghost btn-small" onClick={onRemove} disabled={busy}><Icon name="trash" size={16} />Remove</button>
      </div>
      {s.origin === 'file' && <p className="faint">A file cannot be refreshed on its own: choose it again to read its current contents.</p>}
      {s.warnings.length > 0 && (
        <section>
          <h3 className="label">Import notes</h3>
          <ul className="check-list">{s.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </section>
      )}
    </div>
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

/** Full-page add flow from the mockup: Discover, Validate, Add. Validate is a real import through Rust. */
export function AddSource() {
  const store = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [kind, setKind] = useState<SourceKind>('m3u')
  const [errors, setErrors] = useState<{ name?: string; url?: string }>({})
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<{ origin: PlaylistSource['origin']; url: string | null; label: string; report: PlaylistReport } | null>(null)
  // Each import attempt gets a token; a result only lands if no newer attempt started since.
  const attempt = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)

  const checkUrl = () => {
    const checked = checkPlaylistUrl(url, kind, store.playlists.map((s) => s.url))
    setErrors({ url: 'error' in checked ? checked.error : undefined })
    return 'url' in checked ? checked.url : null
  }
  const checkName = () => {
    const n = name.trim()
    const taken = [...store.playlists, ...store.sources].some((s) => s.name.toLowerCase() === n.toLowerCase())
    const error = !n ? 'Give the source a name you will recognise.' : taken ? 'You already have a source with this name.' : undefined
    setErrors({ name: error })
    return !error
  }

  const load = async (next: { origin: PlaylistSource['origin']; url: string | null; label: string; name: string }, read: () => Promise<PlaylistReport | null>) => {
    const token = ++attempt.current
    setBusy(true)
    setErrors({})
    const result = await readForPreview(read)
    if (token !== attempt.current) return // a newer attempt started; this result is stale
    setBusy(false)
    if ('error' in result) return setErrors({ url: result.error })
    setPreview({ origin: next.origin, url: next.url, label: next.label, report: result.report })
    if (!name.trim()) setName(next.name)
    setStep(2)
  }
  const scanUrl = () => {
    const href = checkUrl()
    if (!href) return
    void load({ origin: 'url', url: href, label: addressLabel(href), name: defaultName('url', href) }, () => fetchPlaylist(href))
  }
  const scanFile = (file: File) =>
    void load({ origin: 'file', url: null, label: fileLabel(file.name), name: defaultName('file', file.name) }, () => readPlaylistFile(file))

  const add = () => {
    if (!preview) return
    store.addPlaylist({ name: name.trim(), origin: preview.origin, url: preview.url, label: preview.label }, preview.report)
    const n = preview.report.channels.length
    toast(`Added ${name.trim()}: ${n} channels. Streams have not been playback-tested.`)
    navigate('/sources')
  }

  const report = preview?.report
  const groups = report ? channelGroups(toChannels('preview', report)) : []
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
          <form className="add-form" onSubmit={(e) => { e.preventDefault(); scanUrl() }} aria-busy={busy}>
            <label className="field">
              <span>Paste a playlist URL</span>
              <input className="input input-lg" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="e.g. https://example.com/playlist.m3u" aria-invalid={errors.url ? true : undefined} disabled={busy} autoFocus />
              {errors.url ? <span className="field-error" role="alert">{errors.url}</span> : <span className="field-hint">Only add sources you have permission to use.</span>}
            </label>
            <div className="field">
              <span>Source Type</span>
              <Segmented label="Source type" value={kind} onChange={setKind} options={typeOptions} className="type-picker" />
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Reading playlist…' : 'Scan & Validate'}</button>
            <button type="button" className="btn btn-secondary btn-block" onClick={() => fileInput.current?.click()} disabled={busy}>
              <Icon name="folder" size={18} />Import a playlist file
            </button>
            <input ref={fileInput} type="file" accept={PLAYLIST_ACCEPT} hidden onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) scanFile(file)
            }} />
            <p className="faint add-note">Kinora downloads or reads the playlist and lists its channels. It does not open or test any stream, and sources are kept only until Kinora closes.</p>
          </form>
        )}

        {step === 2 && report && preview && (
          <form className="add-form" onSubmit={(e) => { e.preventDefault(); if (checkName()) setStep(3) }}>
            <div className="validate-box">
              <p className="validate-status is-ok"><Icon name="check" size={18} />Playlist read: {report.channels.length} channels</p>
              <ul className="check-list">
                <li><Icon name="check" size={16} />{groups.length} {groups.length === 1 ? 'group' : 'groups'}{groups.includes(UNCATEGORISED) ? `, including ${UNCATEGORISED}` : ''}</li>
                {report.skipped > 0 && <li><Icon name="warning" size={16} />{report.skipped} malformed {report.skipped === 1 ? 'entry was' : 'entries were'} skipped</li>}
                {report.duplicates > 0 && <li><Icon name="info" size={16} />{report.duplicates} exact {report.duplicates === 1 ? 'repeat was' : 'repeats were'} dropped</li>}
                <li><Icon name="info" size={16} />Streams have not been playback-tested.</li>
              </ul>
            </div>
            <label className="field">
              <span>Name</span>
              <input className="input" value={name} maxLength={48} onChange={(e) => setName(e.target.value)} placeholder="For example: Living room tuner" aria-invalid={errors.name ? true : undefined} />
              {errors.name && <span className="field-error">{errors.name}</span>}
            </label>
            <div className="add-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>Back</button>
              <button type="submit" className="btn btn-primary">Continue</button>
            </div>
          </form>
        )}

        {step === 3 && report && preview && (
          <div className="add-form">
            <dl className="detail-facts">
              <div><dt>Name</dt><dd>{name.trim()}</dd></div>
              <div><dt>{preview.origin === 'url' ? 'Address' : 'File'}</dt><dd className="source-url-full">{preview.label}</dd></div>
              <div><dt>Type</dt><dd>{preview.origin === 'url' ? kindLabel[kind] : 'M3U playlist file'}</dd></div>
              <div><dt>Channels</dt><dd className="tnum">{report.channels.length}</dd></div>
              <div><dt>Playback</dt><dd>Not tested</dd></div>
              <div><dt>Kept</dt><dd>Until Kinora closes</dd></div>
            </dl>
            <p className="muted">Its channels replace the demonstration channels in Live TV while you have imported playlists.</p>
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
