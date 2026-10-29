import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { demoValidation } from '../data/sources'
import type { Channel, Source, SourceKind } from '../data/types'
import { Dialog } from '../components/Dialog'
import { Icon, type IconName } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { useToast } from '../components/Toast'
import { DemoNote, ProgressBar, Segmented, StateBlock, Switch } from '../components/ui'
import { clock, dayLabel, relative, useNow } from '../lib/time'
import {
  fetchGuide, fetchPlaylist, guideChannels, guideProgrammes, readGuideFile, readPlaylistFile, removeGuide,
  type Catalogue, type CatalogueEntry, type GuideChannel, type GuideSummary, type PlaylistReport, type StorageNotice,
} from '../lib/native'
import { FILTERS, KIND_LABEL, PAGE_SIZE, PROVIDER, PROVIDER_URL, filterEntries, importedAs, isStale, placeOf, uniqueName, type CatalogueFilter } from '../state/catalogue'
import { GUIDE_ACCEPT, checkGuideUrl, guideFileName, guideStatusText, guideStatusTone, readGuideForPreview, type GuideSource } from '../state/guides'
import {
  NOT_TESTED, UNCATEGORISED, addressLabel, channelGroups, checkPlaylistUrl, defaultName, fileLabel, readForPreview, statusText, statusTone, toChannels, unavailableReason,
  type PlaylistSource,
} from '../state/playlists'
import { useStore } from '../state/store'
import './Sources.css'

/** Why saved sources could not simply be used; none of these lose data. */
const STORAGE_NOTICES: Record<StorageNotice | 'save-failed', string> = {
  recovered: 'Your saved sources file was damaged. It was set aside, not deleted, and Kinora started without it.',
  'newer-version': 'Your saved sources were written by a newer version of Kinora. They are left untouched, and changes are not saved this session.',
  unreadable: 'Your saved sources could not be read. They are left untouched, and changes are not saved this session.',
  'save-failed': 'Recent changes to your sources could not be saved.',
}

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
  const guideDetail = store.guides.find((g) => g.id === detailId)
  const toRemove = store.sources.find((s) => s.id === removeId)
  const playlistToRemove = store.playlists.find((s) => s.id === removeId)
  const guideToRemove = store.guides.find((g) => g.id === removeId)
  const refresh = (s: Source) => {
    store.queueRefresh(s.id)
    toast(`${s.name} is a sample source; nothing is fetched for it.`)
  }
  const remove = () => {
    if (playlistToRemove) {
      store.removePlaylist(playlistToRemove.id)
      toast(`Removed ${playlistToRemove.name} and its channels`)
    } else if (guideToRemove) {
      store.removeGuide(guideToRemove.id)
      toast(`Removed ${guideToRemove.name} and its programmes`)
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

        {store.storageNotice && (
          <div className="sources-foot" role="status"><DemoNote>{STORAGE_NOTICES[store.storageNotice]}</DemoNote></div>
        )}

        {tab === 'discovery' ? <Discovery /> : store.sources.length + store.playlists.length + store.guides.length === 0 ? (
          <StateBlock icon="sources" title="No sources yet" action={<Link to="/sources/add" className="btn btn-primary"><Icon name="plus" size={18} />Add Source</Link>}>
            Add an M3U playlist you are allowed to use, such as your own tuner's channel lineup, or an XMLTV guide feed.
          </StateBlock>
        ) : (
          <ul className="source-list">
            {store.playlists.map((s) => <PlaylistRow key={s.id} source={s} now={now} onOpen={() => setDetailId(s.id)} />)}
            {store.guides.map((g) => <GuideRow key={g.id} guide={g} now={now} onOpen={() => setDetailId(g.id)} />)}
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
            {store.playlists.length + store.guides.length > 0 && 'Imported playlists and guides are saved on this device, including their addresses, which can contain private tokens. Guide programmes are kept on this device too. Streams are only fetched when you play a channel. '}
            Sources marked Sample are demonstration data: nothing is fetched, scanned or validated for them, and their counts are sample values. Open a source to refresh or remove it.
          </DemoNote>
        </div>

        <Dialog open={!!detail || !!playlistDetail || !!guideDetail} onClose={() => setDetailId(null)} title={playlistDetail?.name ?? guideDetail?.name ?? detail?.name ?? ''} variant="sheet">
          {playlistDetail && <PlaylistDetail source={playlistDetail} onRemove={() => { setDetailId(null); setRemoveId(playlistDetail.id) }} />}
          {guideDetail && <GuideDetail guide={guideDetail} onRemove={() => { setDetailId(null); setRemoveId(guideDetail.id) }} />}
          {detail && <SourceDetail source={detail} onRefresh={() => refresh(detail)} onRemove={() => { setDetailId(null); setRemoveId(detail.id) }} />}
        </Dialog>

        <Dialog
          open={!!toRemove || !!playlistToRemove || !!guideToRemove}
          onClose={() => setRemoveId(null)}
          title="Remove this source?"
          footer={<>
            <button type="button" className="btn btn-secondary" onClick={() => setRemoveId(null)}>Keep it</button>
            <button type="button" className="btn btn-danger" onClick={remove}>Remove source</button>
          </>}
        >
          {playlistToRemove && <p className="muted">{playlistToRemove.name} and its {playlistToRemove.channels.length} channels will be removed from Live TV, and from your favourites, history and collections. Other sources are not affected.</p>}
          {guideToRemove && <p className="muted">{guideToRemove.name} and the programmes Kinora keeps from it will be removed, with any channels you matched to it by hand. Your channels, favourites and history are not affected.</p>}
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
        <div><dt>Saved</dt><dd>On this device, without stream addresses</dd></div>
      </dl>
      {unavailableReason(s) && s.status !== 'importing' && <p className="faint">{unavailableReason(s)}</p>}
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

/** When a guide's listings run, in local time. */
function listings(summary: GuideSummary, now: number, format: '24h' | '12h') {
  if (summary.first === null || summary.last === null) return 'None in the next 8 days'
  const at = (t: number) => `${dayLabel(t, now)} ${clock(t, format)}`
  return `${at(summary.first)} to ${at(summary.last)}`
}

/** One XMLTV guide in the source list. Exported for tests. */
export function GuideRow({ guide: g, now, onOpen }: { guide: GuideSource; now: number; onOpen: () => void }) {
  const { prefs } = useStore()
  const until = g.summary?.last
  return (
    <li className="source-row">
      <button type="button" className="source-main" onClick={onOpen} aria-label={`${g.name}, programme guide, ${guideStatusText(g, now)}. Open details`}>
        <span className="source-icon"><Icon name="guide" /></span>
        <span className="source-id">
          <strong>{g.name}</strong>
          <span className="faint">
            {g.lastSuccess ? `Updated ${relative(g.lastSuccess, now)}` : 'Not updated yet'}
            {until && until > now ? ` · Listings until ${dayLabel(until, now)} ${clock(until, prefs.timeFormat)}` : ''}
          </span>
        </span>
        <span className={`pill pill-${guideStatusTone(g, now)}`}>{guideStatusText(g, now)}</span>
      </button>
    </li>
  )
}

const MISSING_REASON = {
  'no-id': 'No guide id in the playlist',
  unmatched: 'Its guide id is not in this guide',
  'match-lost': 'Matched by hand to an id this guide no longer lists',
} as const

/** Details of a guide: what Kinora holds, which playlists use it, and which channels it could not match. Exported for tests. */
export function GuideDetail({ guide: g, onRemove }: { guide: GuideSource; onRemove: () => void }) {
  const now = useNow()
  const store = useStore()
  const fileInput = useRef<HTMLInputElement>(null)
  const [picking, setPicking] = useState<string | null>(null)
  const busy = g.status === 'importing'
  const s = g.summary
  const mine = store.channels.filter((c) => c.sourceId !== null && g.playlists.includes(c.sourceId))
  const state = (c: Channel) => store.guideMatch(c)
  const here = mine.filter((c) => { const m = state(c); return m?.state === 'matched' && m.guide === g.id })
  const elsewhere = mine.filter((c) => { const m = state(c); return m?.state === 'matched' && m.guide !== g.id })
  const missing = mine.filter((c) => { const m = state(c)?.state; return m === 'no-id' || m === 'unmatched' || m === 'match-lost' })
  const checking = s !== null && mine.some((c) => state(c)?.state === 'no-data')
  const handMatched = store.mappings.filter((m) => m.guide === g.id).map((m) => ({ m, c: store.findChannel(m.channel) }))
  const togglePlaylist = (id: string, on: boolean) => store.setGuidePlaylists(g.id, on ? [...g.playlists, id] : g.playlists.filter((p) => p !== id))
  return (
    <div className="source-detail">
      <p><span className={`pill pill-${guideStatusTone(g, now)}`}>{guideStatusText(g, now)}</span></p>
      {g.status === 'failed' && g.error && (
        <p className="field-error" role="alert">{g.error}{s ? ' The programmes from the last successful update are still shown.' : ''}</p>
      )}
      <dl className="detail-facts">
        <div><dt>Type</dt><dd>{g.origin === 'url' ? 'XMLTV guide from an address' : 'XMLTV guide file'}</dd></div>
        <div><dt>{g.origin === 'url' ? 'Address' : 'File'}</dt><dd className="source-url-full">{g.label}</dd></div>
        <div><dt>Added</dt><dd>{relative(g.addedAt, now)}</dd></div>
        <div><dt>Last update</dt><dd>{g.lastSuccess ? relative(g.lastSuccess, now) : 'Never'}</dd></div>
        <div><dt>Listings</dt><dd className="tnum">{s ? listings(s, now, store.prefs.timeFormat) : 'Not loaded'}</dd></div>
        {s && <div><dt>Guide</dt><dd className="tnum">{s.channels} channels, {s.programmes} programmes kept (from 12 hours ago to 8 days ahead)</dd></div>}
        {s && <div><dt>Skipped</dt><dd className="tnum">{s.skipped} unusable, {s.duplicates} repeats</dd></div>}
        <div><dt>Saved</dt><dd>On this device, with its programmes. Icons and links in the guide are never downloaded.</dd></div>
      </dl>
      <div className="title-actions">
        {g.origin === 'url' ? (
          <button type="button" className="btn btn-ghost btn-small" onClick={() => void store.refreshGuide(g)} disabled={busy}>
            <Icon name="refresh" size={16} />{busy ? 'Updating…' : 'Update now'}
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => fileInput.current?.click()} disabled={busy}>
              <Icon name="refresh" size={16} />{busy ? 'Reading…' : 'Choose the file again'}
            </button>
            <input ref={fileInput} type="file" accept={GUIDE_ACCEPT} hidden onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void store.reimportGuide(g.id, file)
            }} />
          </>
        )}
        <button type="button" className="btn btn-ghost btn-small" onClick={onRemove} disabled={busy}><Icon name="trash" size={16} />Remove</button>
      </div>

      <section>
        <h3 className="label">Used for</h3>
        {store.playlists.length === 0 ? (
          <p className="faint">Add a playlist to see programmes for its channels.</p>
        ) : (
          <div className="guide-for">
            {store.playlists.map((p) => (
              <div key={p.id} className="setting-line">
                <span><strong>{p.name}</strong><span className="faint"> · {p.channels.length} channels</span></span>
                <Switch checked={g.playlists.includes(p.id)} label={`Use ${g.name} for ${p.name}`} onChange={(on) => togglePlaylist(p.id, on)} />
              </div>
            ))}
          </div>
        )}
      </section>

      {mine.length > 0 && (
        <section>
          <h3 className="label">Matching</h3>
          {!s ? (
            <p className="faint">Channels are matched once the guide has programmes.</p>
          ) : checking ? (
            <p className="faint" role="status">Checking which channels this guide lists…</p>
          ) : (
            <ul className="check-list">
              <li><Icon name="check" size={16} />{here.length} of {mine.length} channels matched to this guide by guide id{handMatched.length ? `, ${handMatched.length} of them by hand` : ''}</li>
              {elsewhere.length > 0 && <li><Icon name="info" size={16} />{elsewhere.length} matched to another of your guides first</li>}
              {missing.length > 0 && <li><Icon name="warning" size={16} />{missing.length} not matched, so they show no programmes</li>}
            </ul>
          )}
          {s && missing.length > 0 && (
            <ul className="guide-missing">
              {missing.slice(0, 50).map((c) => {
                const why = state(c)?.state
                return (
                  <li key={c.id}>
                    <span className="cell-stack">{c.name}<span className="faint">{why === 'no-id' || why === 'unmatched' || why === 'match-lost' ? MISSING_REASON[why] : ''}</span></span>
                    {picking === c.id
                      ? <MatchPicker guide={g} channel={c} onDone={() => setPicking(null)} />
                      : <button type="button" className="btn btn-ghost btn-small" onClick={() => setPicking(c.id)}>Match by hand</button>}
                  </li>
                )
              })}
              {missing.length > 50 && <li className="faint">and {missing.length - 50} more</li>}
            </ul>
          )}
          {handMatched.length > 0 && (
            <ul className="guide-missing">
              {handMatched.map(({ m, c }) => (
                <li key={m.channel}>
                  <span className="cell-stack">{c?.name ?? 'Channel'}<span className="faint">Matched by hand to {m.xmltvId}</span></span>
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => store.clearMapping(m.channel)}>Undo match</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {s && s.warnings.length > 0 && (
        <section>
          <h3 className="label">Import notes</h3>
          <ul className="check-list">{s.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </section>
      )}
    </div>
  )
}

/** Search a guide's channels and match one to a playlist channel. Nothing is matched until a result is chosen. */
function MatchPicker({ guide, channel, onDone }: { guide: GuideSource; channel: Channel; onDone: () => void }) {
  const store = useStore()
  const [list, setList] = useState<GuideChannel[] | null>(null)
  const [query, setQuery] = useState('')
  useEffect(() => {
    let live = true
    guideChannels(guide.id).then((l) => { if (live) setList(l) }, () => { if (live) setList([]) })
    return () => { live = false }
  }, [guide.id])
  const q = query.trim().toLowerCase()
  const results = (list ?? []).filter((c) => !q || c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)).slice(0, 12)
  return (
    <div className="match-picker">
      <label className="field">
        <span>Search {guide.name} for {channel.name}</span>
        <input className="input" value={query} placeholder="Channel name or id" onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') onDone() }} autoFocus />
      </label>
      {list === null ? <p className="faint" role="status">Loading the guide’s channels…</p> : results.length === 0 ? <p className="faint">No guide channel matches that search.</p> : (
        <ul>
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => { store.setMapping(channel.id, guide.id, r.id); onDone() }}>
                {r.name}<span className="faint"> · {r.id}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="text-link" onClick={onDone}>Cancel</button>
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

const channelCount = (n: number) => `${n} ${n === 1 ? 'channel' : 'channels'}`

/** The public catalogue: iptv-org's playlists, listed for browsing. Nothing is fetched from a playlist until one is chosen. */
function Discovery() {
  const store = useStore()
  const now = useNow()
  const { openCatalogue } = store
  const [filter, setFilter] = useState<CatalogueFilter>('country')
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(PAGE_SIZE)
  const [openId, setOpenId] = useState<string | null>(null)
  useEffect(() => { void openCatalogue() }, [openCatalogue])
  const { status, catalogue: c, error } = store.catalogue
  const results = c ? filterEntries(c.entries, filter, query) : []
  const open = c?.entries.find((e) => e.id === openId)
  const changeFilter = (f: CatalogueFilter) => { setFilter(f); setShown(PAGE_SIZE) }

  return (
    <div className="discovery">
      <DemoNote>
        These playlists come from the {PROVIDER} project ({PROVIDER_URL.replace('https://', '')}),
        which collects links to publicly available streams and puts its lists in the public domain. Kinora does not run, check or endorse
        them or the streams they list, and cannot tell you whether they are legal to watch where you live. A playlist is only downloaded
        when you choose to read it, and streams only when you play a channel.
      </DemoNote>

      <div className="catalogue-bar" role="status">
        <span className="faint">
          {status === 'loading' ? (c ? 'Checking for an updated catalogue…' : 'Loading the catalogue…')
            : c ? `${c.entries.length} playlists · catalogue fetched ${relative(c.fetchedAt, now)}${isStale(c, now) ? ', so it may be out of date' : ''}` : ''}
        </span>
        {(c || status === 'failed') && (
          <button type="button" className="btn btn-ghost btn-small" onClick={() => void store.refreshCatalogue()} disabled={status === 'loading'}>
            <Icon name="refresh" size={16} />{c ? 'Check for updates' : 'Try again'}
          </button>
        )}
      </div>
      {status === 'failed' && error && c && <p className="field-error" role="alert">{error} The copy fetched {relative(c.fetchedAt, now)} is shown.</p>}

      {!c ? (
        status === 'failed'
          ? <StateBlock icon="warning" title="The catalogue is not available">{error} Your sources, guides and favourites are not affected.</StateBlock>
          : <StateBlock icon="radar" title="Loading the catalogue" />
      ) : (
        <>
          <div className="catalogue-filters">
            <Segmented label="Show" value={filter} onChange={changeFilter} options={FILTERS} />
            <label className="field catalogue-search">
              <span className="sr-only">Search the catalogue</span>
              <input className="input" type="search" value={query} placeholder="Search by name or code" onChange={(e) => { setQuery(e.target.value); setShown(PAGE_SIZE) }} />
            </label>
          </div>
          {results.length === 0 ? (
            <p className="muted" role="status">{query.trim() ? `No ${FILTERS.find((f) => f.value === filter)?.label.toLowerCase()} match “${query.trim()}”.` : 'The catalogue lists none of these.'}</p>
          ) : (
            <>
              <p className="faint" role="status">{results.length} {results.length === 1 ? 'playlist' : 'playlists'}</p>
              <ul className="source-list">
                {results.slice(0, shown).map((e) => {
                  const added = importedAs(e, store.playlists)
                  const place = placeOf(e, c.entries)
                  return (
                    <li key={e.id} className="source-row">
                      <button type="button" className="source-main" onClick={() => setOpenId(e.id)} aria-label={`${e.name}, ${KIND_LABEL[e.kind]}${added ? ', added' : ''}. Open details`}>
                        <span className="source-icon" aria-hidden="true">{e.flag ?? <Icon name="live" />}</span>
                        <span className="source-id">
                          <strong>{e.name}</strong>
                          <span className="faint">{[KIND_LABEL[e.kind], place, e.channels !== null ? `${channelCount(e.channels)} listed by ${PROVIDER}` : null].filter(Boolean).join(' · ')}</span>
                        </span>
                        {added && <span className="pill pill-healthy">Added</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
              {results.length > shown && (
                <button type="button" className="btn btn-secondary catalogue-more" onClick={() => setShown((n) => n + PAGE_SIZE)}>
                  Show {Math.min(PAGE_SIZE, results.length - shown)} more of {results.length - shown}
                </button>
              )}
            </>
          )}
        </>
      )}

      <Dialog open={!!open} onClose={() => setOpenId(null)} title={open?.name ?? ''} variant="sheet">
        {open && c && <CatalogueDetail key={open.id} entry={open} catalogue={c} />}
      </Dialog>
    </div>
  )
}

/** One catalogue playlist: the provider's facts, then an explicit read and add through the guarded import. Exported for tests. */
export function CatalogueDetail({ entry, catalogue }: { entry: CatalogueEntry; catalogue: Catalogue }) {
  const store = useStore()
  const toast = useToast()
  const now = useNow()
  const [state, setState] = useState<{ phase: 'idle' | 'reading' } | { phase: 'preview'; report: PlaylistReport } | { phase: 'error'; error: string }>({ phase: 'idle' })
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const attempt = useRef(0)
  const added = importedAs(entry, store.playlists)
  const place = placeOf(entry, catalogue.entries)
  const taken = () => [...store.playlists, ...store.sources, ...store.guides].map((x) => x.name)

  const read = async () => {
    const token = ++attempt.current
    setState({ phase: 'reading' })
    const result = await readForPreview(() => fetchPlaylist(entry.url))
    if (token !== attempt.current) return // cancelled, or a newer read started
    if ('error' in result) return setState({ phase: 'error', error: result.error })
    setName(uniqueName(entry, taken()))
    setState({ phase: 'preview', report: result.report })
  }
  const cancel = () => { attempt.current++; setState({ phase: 'idle' }); setNameError(null) }
  const add = () => {
    if (state.phase !== 'preview' || importedAs(entry, store.playlists)) return
    const n = name.trim()
    if (!n) return setNameError('Give the source a name you will recognise.')
    if (taken().some((t) => t.toLowerCase() === n.toLowerCase())) return setNameError('You already have a source with this name.')
    store.addPlaylist({ name: n, origin: 'url', url: entry.url, label: addressLabel(entry.url) }, state.report)
    toast(`Added ${n}: ${channelCount(state.report.channels.length)}. Streams have not been playback-tested.`)
    setState({ phase: 'idle' })
  }
  const groups = state.phase === 'preview' ? channelGroups(toChannels('preview', state.report.channels)).length : 0

  return (
    <div className="source-detail">
      <dl className="detail-facts">
        <div><dt>Type</dt><dd>{KIND_LABEL[entry.kind]}</dd></div>
        {place && <div><dt>Part of</dt><dd>{place}</dd></div>}
        <div><dt>Channels</dt><dd className="tnum">{entry.channels !== null ? `${entry.channels}, as listed by ${PROVIDER}` : `Not stated by ${PROVIDER}`}</dd></div>
        <div><dt>Provider</dt><dd>{PROVIDER}, public domain (Unlicense). Not checked or endorsed by Kinora.</dd></div>
        <div><dt>Address</dt><dd className="source-url-full">{entry.url}</dd></div>
        <div><dt>Catalogue</dt><dd>Fetched {relative(catalogue.fetchedAt, now)}. The provider does not publish when it last changed.</dd></div>
      </dl>

      {added ? (
        <div className="validate-box">
          <p className="validate-status is-ok"><Icon name="check" size={18} />Added as {added.name}</p>
          <p className="muted">It is one of your sources now. Open Live TV to see its channels, or Sources to refresh or remove it.</p>
          <div className="title-actions"><Link to="/live?view=channels" className="btn btn-ghost btn-small"><Icon name="live" size={16} />Open Live TV</Link></div>
        </div>
      ) : state.phase === 'preview' ? (
        <form className="validate-box" onSubmit={(e) => { e.preventDefault(); add() }}>
          <p className="validate-status is-ok"><Icon name="check" size={18} />Kinora read the playlist: {channelCount(state.report.channels.length)}</p>
          <ul className="check-list">
            <li><Icon name="check" size={16} />{groups} {groups === 1 ? 'group' : 'groups'}</li>
            {state.report.skipped > 0 && <li><Icon name="warning" size={16} />{state.report.skipped} malformed {state.report.skipped === 1 ? 'entry was' : 'entries were'} skipped</li>}
            <li><Icon name="info" size={16} />Streams have not been playback-tested.</li>
          </ul>
          <label className="field">
            <span>Name</span>
            <input className="input" value={name} maxLength={48} onChange={(e) => { setName(e.target.value); setNameError(null) }} aria-invalid={nameError ? true : undefined} />
            {nameError && <span className="field-error">{nameError}</span>}
          </label>
          <div className="add-actions">
            <button type="button" className="btn btn-secondary" onClick={cancel}>Cancel</button>
            <button type="submit" className="btn btn-primary"><Icon name="plus" size={18} />Add to my sources</button>
          </div>
        </form>
      ) : (
        <div className="validate-box">
          {state.phase === 'error' && <p className="field-error" role="alert">{state.error}</p>}
          <p className="muted">Kinora downloads the playlist through its guarded fetcher and lists its channels, so you can check it before adding it. No stream is opened.</p>
          <div className="title-actions">
            {state.phase === 'reading' ? (
              <>
                <span className="faint" role="status">Reading playlist…</span>
                <button type="button" className="btn btn-ghost btn-small" onClick={cancel}>Cancel</button>
              </>
            ) : (
              <button type="button" className="btn btn-primary btn-small" onClick={() => void read()}>
                <Icon name="download" size={16} />{state.phase === 'error' ? 'Try again' : 'Read this playlist'}
              </button>
            )}
          </div>
        </div>
      )}
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
  const reading = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const isGuide = kind === 'xmltv'
  // A guide is read under the id it keeps when added, so Rust's parsed copy is reused; if it is never
  // added, Rust forgets it when this page closes.
  const [guideId] = useState(() => `gd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`)
  const guideAdded = useRef(false)
  useEffect(() => () => { if (!guideAdded.current) void removeGuide(guideId).catch(() => undefined) }, [guideId])
  const [guidePreview, setGuidePreview] = useState<{
    origin: GuideSource['origin']; url: string | null; label: string; summary: GuideSummary; matches: { matched: number; wanted: number } | null
  } | null>(null)
  const [forPlaylists, setForPlaylists] = useState(() => store.playlists.map((p) => p.id))

  const checkUrl = () => {
    const checked = isGuide ? checkGuideUrl(url, store.guides.map((g) => g.url)) : checkPlaylistUrl(url, kind, store.playlists.map((s) => s.url))
    setErrors({ url: 'error' in checked ? checked.error : undefined })
    return 'url' in checked ? checked.url : null
  }
  const checkName = () => {
    const n = name.trim()
    const taken = [...store.playlists, ...store.sources, ...store.guides].some((s) => s.name.toLowerCase() === n.toLowerCase())
    const error = !n ? 'Give the source a name you will recognise.' : taken ? 'You already have a source with this name.' : undefined
    setErrors({ name: error })
    return !error
  }

  const load = async (next: { origin: PlaylistSource['origin']; url: string | null; label: string; name: string }, read: () => Promise<PlaylistReport | null>) => {
    // Disabled controls stop clicks, but not every way of submitting a form: refuse a second read outright.
    if (reading.current) return
    reading.current = true
    const token = ++attempt.current
    setBusy(true)
    setErrors({})
    const result = await readForPreview(read)
    reading.current = false
    if (token !== attempt.current) return // a newer attempt started; this result is stale
    setBusy(false)
    if ('error' in result) return setErrors({ url: result.error })
    setPreview({ origin: next.origin, url: next.url, label: next.label, report: result.report })
    setGuidePreview(null)
    if (!name.trim()) setName(next.name)
    setStep(2)
  }
  const loadGuide = async (next: { origin: GuideSource['origin']; url: string | null; label: string; name: string }, read: () => Promise<GuideSummary | null>) => {
    if (reading.current) return
    reading.current = true
    const token = ++attempt.current
    setBusy(true)
    setErrors({})
    const ids = [...new Set(store.channels.flatMap((c) => (c.sourceId && c.tvgId ? [c.tvgId] : [])))]
    const result = await readGuideForPreview(read, async () => {
      if (ids.length === 0) return { matched: 0, wanted: 0 }
      const t = Date.now()
      const answers = await guideProgrammes([{ guide: guideId, ids }], t, t + 60_000)
      return answers ? { matched: answers[0]?.matches.filter((m) => m.channel).length ?? 0, wanted: ids.length } : null
    })
    reading.current = false
    if (token !== attempt.current) return
    setBusy(false)
    if ('error' in result) return setErrors({ url: result.error })
    setGuidePreview({ origin: next.origin, url: next.url, label: next.label, ...result })
    setPreview(null)
    if (!name.trim()) setName(next.name)
    setStep(2)
  }
  const scanUrl = () => {
    const href = checkUrl()
    if (!href) return
    if (isGuide) void loadGuide({ origin: 'url', url: href, label: addressLabel(href), name: defaultName('url', href) }, () => fetchGuide(guideId, href))
    else void load({ origin: 'url', url: href, label: addressLabel(href), name: defaultName('url', href) }, () => fetchPlaylist(href))
  }
  const scanFile = (file: File) => isGuide
    ? void loadGuide({ origin: 'file', url: null, label: fileLabel(file.name), name: guideFileName(file.name) }, () => readGuideFile(guideId, file))
    : void load({ origin: 'file', url: null, label: fileLabel(file.name), name: defaultName('file', file.name) }, () => readPlaylistFile(file))

  const add = () => {
    if (guidePreview) {
      store.addGuide(guideId, { name: name.trim(), origin: guidePreview.origin, url: guidePreview.url, label: guidePreview.label, playlists: forPlaylists }, guidePreview.summary)
      guideAdded.current = true
      toast(`Added ${name.trim()}: ${guidePreview.summary.programmes} programmes.`)
      navigate('/sources')
      return
    }
    if (!preview) return
    store.addPlaylist({ name: name.trim(), origin: preview.origin, url: preview.url, label: preview.label }, preview.report)
    const n = preview.report.channels.length
    toast(`Added ${name.trim()}: ${n} channels. Streams have not been playback-tested.`)
    navigate('/sources')
  }

  const report = preview?.report
  const groups = report ? channelGroups(toChannels('preview', report.channels)) : []
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
              <span>{isGuide ? 'Paste a guide URL' : 'Paste a playlist URL'}</span>
              <input className="input input-lg" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={isGuide ? 'e.g. https://example.com/guide.xml.gz' : 'e.g. https://example.com/playlist.m3u'} aria-invalid={errors.url ? true : undefined} disabled={busy} autoFocus />
              {errors.url ? <span className="field-error" role="alert">{errors.url}</span> : <span className="field-hint">Only add sources you have permission to use.</span>}
            </label>
            <div className="field">
              <span>Source Type</span>
              <Segmented label="Source type" value={kind} onChange={setKind} options={typeOptions} className="type-picker" />
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>{busy ? (isGuide ? 'Reading guide…' : 'Reading playlist…') : 'Scan & Validate'}</button>
            <button type="button" className="btn btn-secondary btn-block" onClick={() => fileInput.current?.click()} disabled={busy}>
              <Icon name="folder" size={18} />{isGuide ? 'Import a guide file' : 'Import a playlist file'}
            </button>
            <input ref={fileInput} type="file" accept={isGuide ? GUIDE_ACCEPT : PLAYLIST_ACCEPT} hidden onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) scanFile(file)
            }} />
            <p className="faint add-note">
              {isGuide
                ? 'Kinora downloads or reads the XMLTV guide (plain or .gz) and matches its channels to your playlists by guide id. Icons and links in the guide are never downloaded. Guides are saved on this device.'
                : 'Kinora downloads or reads the playlist and lists its channels. It does not open or test any stream. Sources are saved on this device.'}
            </p>
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

        {step === 2 && guidePreview && (
          <form className="add-form" onSubmit={(e) => { e.preventDefault(); if (checkName()) setStep(3) }}>
            <div className="validate-box">
              <p className="validate-status is-ok"><Icon name="check" size={18} />Guide read: {guidePreview.summary.channels} channels, {guidePreview.summary.programmes} programmes</p>
              <ul className="check-list">
                {guidePreview.summary.programmes > 0
                  ? <li><Icon name="check" size={16} />Listings {listings(guidePreview.summary, Date.now(), store.prefs.timeFormat)}</li>
                  : <li><Icon name="warning" size={16} />No programmes from 12 hours ago to 8 days ahead</li>}
                {guidePreview.matches && (guidePreview.matches.wanted === 0
                  ? <li><Icon name="info" size={16} />None of your playlist channels has a guide id. You can match channels by hand once the guide is added.</li>
                  : <li><Icon name={guidePreview.matches.matched > 0 ? 'check' : 'warning'} size={16} />{guidePreview.matches.matched} of {guidePreview.matches.wanted} guide ids in your playlists are in this guide</li>)}
                {guidePreview.summary.skipped > 0 && <li><Icon name="warning" size={16} />{guidePreview.summary.skipped} unusable {guidePreview.summary.skipped === 1 ? 'programme was' : 'programmes were'} skipped</li>}
                <li><Icon name="info" size={16} />Icons and links in the guide are not downloaded.</li>
              </ul>
            </div>
            <label className="field">
              <span>Name</span>
              <input className="input" value={name} maxLength={48} onChange={(e) => setName(e.target.value)} placeholder="For example: UK guide" aria-invalid={errors.name ? true : undefined} />
              {errors.name && <span className="field-error">{errors.name}</span>}
            </label>
            {store.playlists.length > 0 && (
              <div className="field">
                <span>Use for</span>
                <div className="guide-for">
                  {store.playlists.map((p) => (
                    <div key={p.id} className="setting-line">
                      <span><strong>{p.name}</strong><span className="faint"> · {p.channels.length} channels</span></span>
                      <Switch checked={forPlaylists.includes(p.id)} label={`Use this guide for ${p.name}`} onChange={(on) => setForPlaylists((l) => (on ? [...l, p.id] : l.filter((x) => x !== p.id)))} />
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="add-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>Back</button>
              <button type="submit" className="btn btn-primary">Continue</button>
            </div>
          </form>
        )}

        {step === 3 && guidePreview && (
          <div className="add-form">
            <dl className="detail-facts">
              <div><dt>Name</dt><dd>{name.trim()}</dd></div>
              <div><dt>{guidePreview.origin === 'url' ? 'Address' : 'File'}</dt><dd className="source-url-full">{guidePreview.label}</dd></div>
              <div><dt>Type</dt><dd>{guidePreview.origin === 'url' ? 'XMLTV guide' : 'XMLTV guide file'}</dd></div>
              <div><dt>Programmes</dt><dd className="tnum">{guidePreview.summary.programmes}</dd></div>
              <div><dt>Used for</dt><dd>{store.playlists.filter((p) => forPlaylists.includes(p.id)).map((p) => p.name).join(', ') || 'No playlists yet'}</dd></div>
              <div><dt>Saved</dt><dd>On this device, with its programmes</dd></div>
            </dl>
            <p className="muted">Live TV shows its programmes for the channels it matches, in your local time.</p>
            <div className="add-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setStep(2)}>Back</button>
              <button type="button" className="btn btn-primary" onClick={add}><Icon name="plus" size={18} />Add Source</button>
            </div>
          </div>
        )}

        {step === 3 && report && preview && (
          <div className="add-form">
            <dl className="detail-facts">
              <div><dt>Name</dt><dd>{name.trim()}</dd></div>
              <div><dt>{preview.origin === 'url' ? 'Address' : 'File'}</dt><dd className="source-url-full">{preview.label}</dd></div>
              <div><dt>Type</dt><dd>{preview.origin === 'url' ? kindLabel[kind] : 'M3U playlist file'}</dd></div>
              <div><dt>Channels</dt><dd className="tnum">{report.channels.length}</dd></div>
              <div><dt>Playback</dt><dd>Not tested</dd></div>
              <div><dt>Saved</dt><dd>On this device</dd></div>
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
