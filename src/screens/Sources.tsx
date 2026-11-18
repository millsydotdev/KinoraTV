import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { Channel, Source, SourceKind } from '../data/types'
import { Dialog } from '../components/Dialog'
import { Icon, type IconName } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { useToast } from '../components/Toast'
import { DemoNote, Segmented, StateBlock, Switch } from '../components/ui'
import { clock, dayLabel, relative, useNow } from '../lib/time'
import {
  connectXtream, disconnectXtream, fetchGuide, fetchPlaylist, guideChannels, guideProgrammes, readGuideFile, readPlaylistFile, removeGuide, testSourceConnection, testXtreamConnection,
  type Catalogue, type CatalogueEntry, type ConnectionTestResult, type GuideChannel, type GuideSummary, type PlaylistReport, type StorageNotice, type XtreamConnectionReport,
} from '../lib/native'
import { FILTERS, KIND_LABEL, PAGE_SIZE, PROVIDER, PROVIDER_URL, filterEntries, importedAs, isStale, placeOf, uniqueName, type CatalogueFilter } from '../state/catalogue'
import { GUIDE_ACCEPT, checkGuideUrl, guideFileName, guideStatusText, guideStatusTone, readGuideForPreview, type GuideSource } from '../state/guides'
import {
  NOT_TESTED, UNCATEGORISED, addressLabel, channelGroups, checkPlaylistUrl, defaultName, fileLabel, readForPreview, statusText, statusTone, toChannels, unavailableReason,
  type PlaylistSource,
} from '../state/playlists'
import { useStore, type XtreamSource } from '../state/store'
import { SourcesPersonalTab } from './SourcesPersonalTab'
import { SourcesTechnicalTab } from './SourcesTechnicalTab'
import { SourcesMasterDiscovery } from './SourcesMasterDiscovery'
import { MEDIA_TAXONOMY, getCategory } from '../data/mediaTaxonomy'
import type { MediaResource } from '../data/personalLibrary'
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

export function Sources() {
  const now = useNow()
  const store = useStore()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const highlightId = params.get('highlight')
  const tab = tabParam === 'discovery' ? 'discovery' : tabParam === 'my-sources' ? 'my-sources' : tabParam === 'technical' ? 'technical' : 'active'
  const [detailId, setDetailId] = useState<string | null>(null)
  const [removeId, setRemoveId] = useState<string | null>(null)

  const detail = store.sources.find((s) => s.id === detailId)
  const playlistDetail = store.playlists.find((s) => s.id === detailId)
  const guideDetail = store.guides.find((g) => g.id === detailId)
  const xtreamDetail = store.xtreamSources.find((s) => s.id === detailId)
  const toRemove = store.sources.find((s) => s.id === removeId)
  const playlistToRemove = store.playlists.find((s) => s.id === removeId)
  const guideToRemove = store.guides.find((g) => g.id === removeId)
  const xtreamToRemove = store.xtreamSources.find((s) => s.id === removeId)
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
    } else if (xtreamToRemove) {
      void store.removeXtreamSource(xtreamToRemove.id).then(() => toast(`Removed ${xtreamToRemove.name}`)).catch(() => toast('Kinora could not disconnect this provider.'))
    } else if (toRemove) {
      store.removeSource(toRemove.id)
      toast(`Removed ${toRemove.name}`)
    }
    setRemoveId(null)
  }

  const totalActive = store.playlists.length + store.guides.length + store.xtreamSources.length + (store.demoTitles ? store.sources.length : 0)
  const tabs = (
    <div className="tabs" role="tablist" aria-label="Sources">
      <button type="button" role="tab" className="tab" aria-selected={tab === 'active'} onClick={() => setParams({}, { replace: true })}>
        Active Sources {totalActive > 0 ? `(${totalActive})` : ''}
      </button>
      <button type="button" role="tab" className="tab" aria-selected={tab === 'my-sources'} onClick={() => setParams({ tab: 'my-sources' }, { replace: true })}>
        My Sources ({store.mediaLibrary.mySources.length})
      </button>
      <button type="button" role="tab" className="tab" aria-selected={tab === 'discovery'} onClick={() => setParams({ tab: 'discovery' }, { replace: true })}>Discovery</button>
      <button type="button" role="tab" className="tab" aria-selected={tab === 'technical'} onClick={() => setParams({ tab: 'technical' }, { replace: true })}>Technical & EPG</button>
    </div>
  )

  return (
    <>
      <PageHeader title="Sources" tabs={tabs} search={false} actions={<Link to="/sources/add" className="btn btn-primary btn-small"><Icon name="plus" size={16} />Add Source</Link>} />
      <div className="page sources">

        {store.storageNotice && (
          <div className="sources-foot" role="status"><DemoNote>{STORAGE_NOTICES[store.storageNotice]}</DemoNote></div>
        )}

        {tab === 'my-sources' ? (
          <SourcesPersonalTab />
        ) : tab === 'technical' ? (
          <SourcesTechnicalTab />
        ) : tab === 'discovery' ? (
          <Discovery />
        ) : store.sources.length + store.playlists.length + store.guides.length + store.xtreamSources.length === 0 ? (
          <StateBlock icon="sources" title="No sources yet" action={<Link to="/sources/add" className="btn btn-primary"><Icon name="plus" size={18} />Add Source</Link>}>
            Add an M3U playlist you are allowed to use, such as your own tuner's channel lineup, or an XMLTV guide feed.
          </StateBlock>
        ) : (
          <>
            {store.playlists.length > 0 && (
              <p className="sources-count-bar faint tnum" role="status">
                {store.playlists.length} {store.playlists.length === 1 ? 'playlist' : 'playlists'} · {store.totalPlaylistEntries} playlist entries · {store.channels.length} unique {store.channels.length === 1 ? 'channel' : 'channels'} · {store.guides.length} XMLTV {store.guides.length === 1 ? 'guide' : 'guides'}
              </p>
            )}
            <ul className="source-list">
            {store.playlists.map((s) => <PlaylistRow key={s.id} source={s} now={now} onOpen={() => setDetailId(s.id)} highlighted={highlightId === s.id} />)}
            {store.guides.map((g) => <GuideRow key={g.id} guide={g} now={now} onOpen={() => setDetailId(g.id)} />)}
            {store.xtreamSources.map((source) => (
              <li key={source.id} className="source-row">
                <button type="button" className="source-main" onClick={() => setDetailId(source.id)} aria-label={`${source.name}, IPTV provider. Open details`}>
                  <span className="source-icon"><Icon name="live" /></span>
                  <span className="source-id">
                    <strong>{source.name}</strong>
                    <span className="faint">
                      {[
                        source.hasLive || (source.liveChannels ?? 0) > 0 ? `${source.liveChannels ?? 0} live channels` : null,
                        source.hasVod || source.movies > 0 ? `${source.movies} movies` : null,
                        source.hasSeries || source.series > 0 ? `${source.series} series` : null,
                        source.hasEpg ? 'EPG' : null,
                        source.hasCatchup ? 'Catch-up' : null,
                      ].filter(Boolean).join(' · ')}
                      {source.expDate ? ` · Expires: ${source.expDate}` : ''}
                    </span>
                  </span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {source.enabled === false && <span className="pill pill-pending">Disabled</span>}
                    <span className={`pill pill-${source.connected ? 'healthy' : 'pending'}`}>
                      {source.connected ? 'Active' : 'Offline'}
                    </span>
                  </div>
                </button>
              </li>
            ))}
            {store.sources.map((s) => (
              <li key={s.id} className="source-row">
                <button type="button" className="source-main" onClick={() => setDetailId(s.id)} aria-label={`${s.name}, sample demonstration source. Streams not checked. Open details`}>
                  <span className="source-icon"><Icon name={kindIcon[s.kind]} /></span>
                  <span className="source-id">
                    <strong>{s.name} <span className="pending-tag">Sample</span></strong>
                    <span className="faint">Illustrative sample · Streams not scanned or validated</span>
                  </span>
                  <span className="pill pill-pending">Sample · Not scanned</span>
                </button>
              </li>
            ))}
          </ul>
          </>
        )}

        <div className="sources-foot">
          <DemoNote>
            {store.playlists.length + store.guides.length > 0 && 'Imported playlists and guides are saved on this device, including their addresses, which can contain private tokens. Guide programmes are kept on this device too. Streams are only fetched when you play a channel. '}
            {store.xtreamSources.length > 0 && 'Provider names and catalogue counts are saved on this device. Provider addresses and login details remain in memory for this app session and must be entered again after restart. '}
            {store.sources.length > 0 && ' Sources marked Sample are demonstration data: nothing is fetched, scanned or validated for them, and their counts are sample values.'}
            {' '}Open a source to refresh or remove it.
          </DemoNote>
        </div>

        <Dialog open={!!detail || !!playlistDetail || !!guideDetail || !!xtreamDetail} onClose={() => setDetailId(null)} title={playlistDetail?.name ?? guideDetail?.name ?? xtreamDetail?.name ?? detail?.name ?? ''} variant="sheet">
          {playlistDetail && <PlaylistDetail source={playlistDetail} onRemove={() => { setDetailId(null); setRemoveId(playlistDetail.id) }} />}
          {guideDetail && <GuideDetail guide={guideDetail} onRemove={() => { setDetailId(null); setRemoveId(guideDetail.id) }} />}
          {xtreamDetail && <XtreamDetail source={xtreamDetail} onRemove={() => { setDetailId(null); setRemoveId(xtreamDetail.id) }} />}
          {detail && <SourceDetail source={detail} onRefresh={() => refresh(detail)} onRemove={() => { setDetailId(null); setRemoveId(detail.id) }} />}
        </Dialog>

        <Dialog
          open={!!toRemove || !!playlistToRemove || !!guideToRemove || !!xtreamToRemove}
          onClose={() => setRemoveId(null)}
          title="Remove this source?"
          footer={<>
            <button type="button" className="btn btn-secondary" onClick={() => setRemoveId(null)}>Keep it</button>
            <button type="button" className="btn btn-danger" onClick={remove}>Remove source</button>
          </>}
        >
          {playlistToRemove && <p className="muted">{playlistToRemove.name} and its {playlistToRemove.channels.length} channels will be removed from Live TV, and from your favourites, history and collections. Other sources are not affected.</p>}
          {guideToRemove && <p className="muted">{guideToRemove.name} and the programmes Kinora keeps from it will be removed, with any channels you matched to it by hand. Your channels, favourites and history are not affected.</p>}
          {xtreamToRemove && <p className="muted">{xtreamToRemove.name} and its imported movies and series will be removed. Your M3U playlists and XMLTV guides are not affected.</p>}
          {toRemove && <p className="muted">{toRemove.name} will be removed{toRemove.streams ? `, along with the ${toRemove.streams.total} streams it lists` : ''}. Channels other sources provide are not affected.</p>}
        </Dialog>
      </div>
    </>
  )
}

/** One imported playlist in the source list. Exported for tests. */
export function PlaylistRow({ source: s, now, onOpen, highlighted = false }: { source: PlaylistSource; now: number; onOpen: () => void; highlighted?: boolean }) {
  return (
    <li className={`source-row ${highlighted ? 'is-highlighted-source' : ''}`}>
      <button type="button" className="source-main" onClick={onOpen} aria-label={`${s.name}, ${statusText(s)}. Open details`}>
        <span className="source-icon"><Icon name={s.origin === 'file' ? 'folder' : 'live'} /></span>
        <span className="source-id">
          <strong>{s.name}</strong>
          <span className="faint">{s.lastSuccess ? `Imported ${relative(s.lastSuccess, now)}` : 'Not imported'} · {NOT_TESTED}</span>
        </span>
        {highlighted && <span className="pill pill-pending">Source already active</span>}
        <span className={`pill pill-${statusTone(s)}`}>{statusText(s)}</span>
      </button>
    </li>
  )
}

function ConnectionStatusDisplay({ result }: { result: ConnectionTestResult }) {
  if (result.category === 'success') {
    return (
      <div className="connection-result" style={{ marginBottom: 12 }}>
        <p className="pill pill-healthy" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <Icon name="checkCircle" size={14} />
          <span>Host reachable (HTTP {result.status ?? 200} OK) · {result.roundTripMs} ms</span>
        </p>
      </div>
    )
  }
  if (result.category === 'auth-required') {
    return (
      <div className="connection-result" style={{ marginBottom: 12 }}>
        <p className="pill pill-degraded" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <Icon name="warning" size={14} />
          <span>Authentication required (HTTP {result.status})</span>
        </p>
        <p className="field-error" style={{ marginTop: 4 }}>{result.message}</p>
      </div>
    )
  }
  return (
    <div className="connection-result" style={{ marginBottom: 12 }}>
      <p className="pill pill-failing" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        <Icon name="warning" size={14} />
        <span>Connection test failed</span>
      </p>
      <p className="field-error" style={{ marginTop: 4 }}>{result.message}</p>
    </div>
  )
}

/** Details of an imported playlist: what was read, and nothing about playback. Exported for tests. */
export function PlaylistDetail({ source: s, onRemove }: { source: PlaylistSource; onRemove: () => void }) {
  const now = useNow()
  const store = useStore()
  const toast = useToast()
  const fileInput = useRef<HTMLInputElement>(null)
  const connTokenRef = useRef(0)
  const [testingConn, setTestingConn] = useState(false)
  const [connResult, setConnResult] = useState<ConnectionTestResult | null>(null)
  const busy = s.status === 'importing'
  const groups = channelGroups(s.channels).length

  const handleTestConnection = async () => {
    if (!s.url) return
    const token = ++connTokenRef.current
    setTestingConn(true)
    setConnResult(null)
    try {
      const res = await testSourceConnection(s.url)
      if (connTokenRef.current === token) {
        if (res) {
          setConnResult(res)
        } else {
          setConnResult({
            ok: false,
            status: null,
            host: 'desktop-shell-required',
            roundTripMs: 0,
            message: 'Testing source connection requires the Kinora desktop app.',
            category: 'unknown',
          })
        }
      }
    } finally {
      if (connTokenRef.current === token) {
        setTestingConn(false)
      }
    }
  }

  return (
    <div className="source-detail">
      <p><span className={`pill pill-${statusTone(s)}`}>{statusText(s)}</span></p>
      {s.status === 'failed' && s.error && (
        <p className="field-error" role="alert">{s.error}{s.lastSuccess ? ' The channels from the last successful import are still shown.' : ''}</p>
      )}
      {testingConn && (
        <p className="pill pill-pending" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginBottom: 12 }}>
          <Icon name="refresh" size={14} className="spin" />
          <span>Testing connection…</span>
        </p>
      )}
      {connResult && <ConnectionStatusDisplay result={connResult} />}
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
          <>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => void store.refreshPlaylist(s)} disabled={busy}>
              <Icon name="refresh" size={16} />{busy ? 'Refreshing…' : 'Refresh now'}
            </button>
            {busy && (
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => {
                  store.cancelRefreshPlaylist(s.id)
                  toast(`Cancelled refresh for ${s.name}`)
                }}
              >
                <Icon name="close" size={16} />Cancel
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => void handleTestConnection()}
              disabled={testingConn || busy}
            >
              <Icon name="activity" size={16} />{testingConn ? 'Testing…' : 'Test Connection'}
            </button>
          </>
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

function XtreamDetail({ source, onRemove }: { source: XtreamSource; onRemove: () => void }) {
  const store = useStore()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  return (
    <div className="source-detail">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <span className={`pill pill-${source.connected ? 'healthy' : 'pending'}`}>
          {source.connected ? 'Connected' : 'Offline / Reconnect required'}
        </span>
        {source.enabled === false && <span className="pill pill-pending">Disabled</span>}
      </div>

      <div style={{ marginBottom: 16 }}>
        <Switch
          checked={source.enabled !== false}
          label={source.enabled !== false ? 'Provider Enabled' : 'Provider Disabled'}
          onChange={(on) => {
            store.toggleXtreamSource(source.id, on)
            toast(on ? `Enabled ${source.name}` : `Disabled ${source.name}`)
          }}
        />
      </div>

      <dl className="detail-facts">
        <div><dt>Type</dt><dd>Managed IPTV Provider (Live TV, VOD, Series, EPG)</dd></div>
        <div><dt>Live TV</dt><dd className="tnum">{source.liveChannels ?? 0} channels</dd></div>
        <div><dt>Movies</dt><dd className="tnum">{source.movies} titles</dd></div>
        <div><dt>Series</dt><dd className="tnum">{source.series} series</dd></div>
        <div><dt>EPG Guide</dt><dd>{source.hasEpg ? 'Supported' : 'Not reported'}</dd></div>
        <div><dt>Catch-up TV</dt><dd>{source.hasCatchup ? 'Supported' : 'Not reported'}</dd></div>
        {source.status && <div><dt>Account Status</dt><dd>{source.status}</dd></div>}
        {source.expDate && <div><dt>Account Expiration</dt><dd>{source.expDate}</dd></div>}
        {source.serverInfo?.url && <div><dt>Server</dt><dd>{source.serverInfo.url}</dd></div>}
        {source.serverInfo?.timezone && <div><dt>Timezone</dt><dd>{source.serverInfo.timezone}</dd></div>}
        <div><dt>Last read</dt><dd>{source.lastSuccess ? relative(source.lastSuccess, Date.now()) : 'Never'}</dd></div>
        <div><dt>Saved</dt><dd>Provider configuration is saved on this device. Credentials stay in app memory.</dd></div>
      </dl>

      <div className="title-actions">
        {source.connected && (
          <button
            type="button"
            className="btn btn-ghost btn-small"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void store.refreshXtreamSource(source.id)
                .then(() => toast(`Refreshed ${source.name} catalogue and channels`))
                .catch((error: unknown) => toast(error instanceof Error ? error.message : 'Could not refresh this provider.'))
                .finally(() => setBusy(false))
            }}
          >
            <Icon name="refresh" size={16} />
            {busy ? 'Refreshing…' : 'Refresh all services'}
          </button>
        )}
        <Link to={`/sources/add?kind=xtream&source=${encodeURIComponent(source.id)}`} className="btn btn-ghost btn-small">
          <Icon name="link" size={16} />
          {source.connected ? 'Reconnect / Edit' : 'Enter login to reconnect'}
        </Link>
        <button type="button" className="btn btn-ghost btn-small" onClick={onRemove} disabled={busy}>
          <Icon name="trash" size={16} />
          Remove Provider
        </button>
      </div>
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
  const [missingFilter, setMissingFilter] = useState('')
  const connTokenRef = useRef(0)
  const [testingConn, setTestingConn] = useState(false)
  const [connResult, setConnResult] = useState<ConnectionTestResult | null>(null)
  const busy = g.status === 'importing'

  const handleTestConnection = async () => {
    if (!g.url) return
    const token = ++connTokenRef.current
    setTestingConn(true)
    setConnResult(null)
    try {
      const res = await testSourceConnection(g.url)
      if (connTokenRef.current === token) {
        if (res) {
          setConnResult(res)
        } else {
          setConnResult({
            ok: false,
            status: null,
            host: 'desktop-shell-required',
            roundTripMs: 0,
            message: 'Testing source connection requires the Kinora desktop app.',
            category: 'unknown',
          })
        }
      }
    } finally {
      if (connTokenRef.current === token) {
        setTestingConn(false)
      }
    }
  }
  const s = g.summary
  const mine = store.channels.filter((c) => (c.sourceIds ?? (c.sourceId ? [c.sourceId] : [])).some((id) => g.playlists.includes(id)))
  const state = (c: Channel) => store.guideMatch(c)
  const here = mine.filter((c) => { const m = state(c); return m?.state === 'matched' && m.guide === g.id })
  const elsewhere = mine.filter((c) => { const m = state(c); return m?.state === 'matched' && m.guide !== g.id })
  const missing = mine.filter((c) => { const m = state(c)?.state; return m === 'no-id' || m === 'unmatched' || m === 'match-lost' })
  const mf = missingFilter.trim().toLowerCase()
  const filteredMissing = mf
    ? missing.filter((c) => c.name.toLowerCase().includes(mf) || (c.tvgId ?? '').toLowerCase().includes(mf))
    : missing
  const checking = s !== null && mine.some((c) => state(c)?.state === 'no-data')
  const handMatched = [...new Map(store.mappings.filter((m) => m.guide === g.id).map((m) => {
    const c = store.findChannel(m.channel)
    return [`${c?.id ?? m.channel}:${m.xmltvId}`, { m, c }] as const
  })).values()]
  const togglePlaylist = (id: string, on: boolean) => store.setGuidePlaylists(g.id, on ? [...g.playlists, id] : g.playlists.filter((p) => p !== id))
  return (
    <div className="source-detail">
      <p><span className={`pill pill-${guideStatusTone(g, now)}`}>{guideStatusText(g, now)}</span></p>
      {g.status === 'failed' && g.error && (
        <p className="field-error" role="alert">{g.error}{s ? ' The programmes from the last successful update are still shown.' : ''}</p>
      )}
      {testingConn && (
        <p className="pill pill-pending" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginBottom: 12 }}>
          <Icon name="refresh" size={14} className="spin" />
          <span>Testing connection…</span>
        </p>
      )}
      {connResult && <ConnectionStatusDisplay result={connResult} />}
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
          <>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => void store.refreshGuide(g)} disabled={busy}>
              <Icon name="refresh" size={16} />{busy ? 'Updating…' : 'Update now'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => void handleTestConnection()}
              disabled={testingConn || busy}
            >
              <Icon name="activity" size={16} />{testingConn ? 'Testing…' : 'Test Connection'}
            </button>
          </>
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
            <>
              {missing.length > 10 && (
                <label className="field">
                  <span className="faint">Filter unmatched channels ({filteredMissing.length} of {missing.length})</span>
                  <input
                    className="input"
                    value={missingFilter}
                    placeholder="Filter unmatched channels by name or guide id"
                    onChange={(e) => setMissingFilter(e.target.value)}
                  />
                </label>
              )}
              <ul className="guide-missing">
                {filteredMissing.slice(0, 50).map((c) => {
                  const why = state(c)?.state
                  return (
                    <li key={c.id}>
                      <span className="cell-stack">{c.name}<span className="faint">{why === 'no-id' || why === 'unmatched' || why === 'match-lost' ? MISSING_REASON[why] : ''}{c.tvgId ? ` · ${c.tvgId}` : ''}</span></span>
                      {picking === c.id
                        ? <MatchPicker guide={g} channel={c} onDone={() => setPicking(null)} />
                        : <button type="button" className="btn btn-ghost btn-small" onClick={() => setPicking(c.id)}>Match by hand</button>}
                    </li>
                  )
                })}
                {filteredMissing.length > 50 && <li className="faint">and {filteredMissing.length - 50} more</li>}
              </ul>
            </>
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

  return (
    <div className="source-detail">
      <p><span className="pill pill-pending">Sample demonstration source</span></p>
      <dl className="detail-facts">
        <div><dt>Type</dt><dd>{kindLabel[s.kind]} (Demonstration)</dd></div>
        <div><dt>Address</dt><dd className="source-url-full">{s.url}</dd></div>
        <div><dt>Status</dt><dd>Illustrative only. Kinora does not probe or validate sample streams.</dd></div>
        <div><dt>Channels</dt><dd className="tnum">{s.streams?.total ?? 0} illustrative entries</dd></div>
        <div><dt>Added</dt><dd>{relative(s.addedAt, now)}</dd></div>
      </dl>
      <div className="title-actions">
        <button type="button" className="btn btn-ghost btn-small" onClick={onRefresh}><Icon name="refresh" size={16} />Reset sample</button>
        <button type="button" className="btn btn-ghost btn-small" onClick={onRemove}><Icon name="trash" size={16} />Remove</button>
      </div>

      <section className="sample-source-notice" style={{ marginTop: 16 }}>
        <p className="faint" style={{ fontSize: '0.8125rem', lineHeight: 1.5 }}>
          This is a sample demonstration source for previewing Kinora layout and UI structure.
          In accordance with privacy and security policy, Kinora never probes or fetches external streams automatically.
          Add an authentic playlist or XMLTV guide in the Discovery or Add Source tabs to view genuine source data.
        </p>
      </section>
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
  const [discoveryMode, setDiscoveryMode] = useState<'playlists' | 'all-media'>('playlists')
  useEffect(() => { void openCatalogue() }, [openCatalogue])
  const { status, catalogue: c, error } = store.catalogue
  const results = c ? filterEntries(c.entries, filter, query) : []
  const open = c?.entries.find((e) => e.id === openId)
  const changeFilter = (f: CatalogueFilter) => { setFilter(f); setShown(PAGE_SIZE) }

  return (
    <div className="discovery">
      <div className="catalogue-mode-bar" style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <button
          type="button"
          className={`btn btn-small ${discoveryMode === 'playlists' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setDiscoveryMode('playlists')}
        >
          <Icon name="live" size={16} /> Public IPTV Playlists ({c?.entries.length ?? 0})
        </button>
        <button
          type="button"
          className={`btn btn-small ${discoveryMode === 'all-media' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setDiscoveryMode('all-media')}
        >
          <Icon name="radar" size={16} /> All Media Directory
        </button>
      </div>

      {discoveryMode === 'all-media' ? (
        <SourcesMasterDiscovery />
      ) : (
        <>
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
        </>
      )}
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
          <div className="title-actions">
            <Link to={`/sources?highlight=${encodeURIComponent(added.id)}`} className="btn btn-secondary btn-small">
              <Icon name="sources" size={16} />View in Active Sources
            </Link>
            <Link to="/live?view=channels" className="btn btn-ghost btn-small">
              <Icon name="live" size={16} />Open Live TV
            </Link>
          </div>
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

export type ExtendedSourceKind = SourceKind | 'xtream' | 'radio' | 'podcast' | 'api' | 'custom'

const typeOptions: { value: ExtendedSourceKind; label: string; icon: IconName }[] = [
  { value: 'm3u', label: 'M3U Playlist', icon: 'live' },
  { value: 'm3u8', label: 'M3U8', icon: 'live' },
  { value: 'url-list', label: 'URL List', icon: 'link' },
  { value: 'xmltv', label: 'XMLTV Guide', icon: 'guide' },
  { value: 'xtream', label: 'Movies & Series', icon: 'film' },
  { value: 'radio', label: 'Radio Stream', icon: 'audio' },
  { value: 'podcast', label: 'Podcast RSS', icon: 'audio' },
  { value: 'api', label: 'Metadata API', icon: 'database' },
  { value: 'custom', label: 'Custom Resource', icon: 'sources' },
]

/** Full-page add flow from the mockup: Discover, Validate, Add. Validate is a real import through Rust. */
export function AddSource() {
  const store = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const sourceParam = searchParams.get('source')
  const [step, setStep] = useState(1)
  const [url, setUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [kind, setKind] = useState<ExtendedSourceKind>(sourceParam || searchParams.get('kind') === 'xtream' ? 'xtream' : 'm3u')
  const [category, setCategory] = useState('radio')
  const [subcategory, setSubcategory] = useState('')
  const [provider, setProvider] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [customPreview, setCustomPreview] = useState<Omit<MediaResource, 'id'> | null>(null)
  const [errors, setErrors] = useState<{ name?: string; url?: string }>({})
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<{ origin: PlaylistSource['origin']; url: string | null; label: string; report: PlaylistReport } | null>(null)
  // Each import attempt gets a token; a result only lands if no newer attempt started since.
  const attempt = useRef(0)
  const reading = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const isGuide = kind === 'xmltv'
  const isPersonalMedia = kind === 'radio' || kind === 'podcast' || kind === 'api' || kind === 'custom'
  // A guide is read under the id it keeps when added, so Rust's parsed copy is reused; if it is never
  // added, Rust forgets it when this page closes.
  const [guideId] = useState(() => `gd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`)
  const guideAdded = useRef(false)
  useEffect(() => () => { if (!guideAdded.current) void removeGuide(guideId).catch(() => undefined) }, [guideId])
  const [guidePreview, setGuidePreview] = useState<{
    origin: GuideSource['origin']; url: string | null; label: string; summary: GuideSummary; matches: { matched: number; wanted: number } | null
  } | null>(null)
  const [forPlaylists, setForPlaylists] = useState(() => store.playlists.map((p) => p.id))
  const [xtreamPreview, setXtreamPreview] = useState<{ server: string; catalogue: Awaited<ReturnType<typeof connectXtream>> } | null>(null)
  const [testingXtream, setTestingXtream] = useState(false)
  const [xtreamTestResult, setXtreamTestResult] = useState<XtreamConnectionReport | null>(null)
  const xtreamId = useRef(sourceParam ?? `xt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`)
  const xtreamAdded = useRef(false)
  const xtreamPageActive = useRef(true)
  const isXtream = kind === 'xtream'
  const sourceToReconnect = store.xtreamSources.find((source) => source.id === sourceParam)
  useEffect(() => {
    if (sourceToReconnect) setName(sourceToReconnect.name)
  }, [sourceToReconnect?.id])
  useEffect(() => {
    xtreamPageActive.current = true
    return () => {
      xtreamPageActive.current = false
      if (!xtreamAdded.current) void disconnectXtream(xtreamId.current).catch(() => undefined)
    }
  }, [])

  const handleTestXtream = async () => {
    if (!url.trim() || !username.trim() || !password) {
      setErrors({
        url: !url.trim() ? 'Enter your provider server address.' : undefined,
        name: !username.trim() || !password ? 'Enter the provider username and password.' : undefined,
      })
      return
    }
    setTestingXtream(true)
    setXtreamTestResult(null)
    setErrors({})
    try {
      const res = await testXtreamConnection(url.trim(), username, password)
      setXtreamTestResult(res)
      if (res && !res.success) {
        setErrors({ url: res.message })
      }
    } catch (e) {
      setErrors({ url: e instanceof Error ? e.message : 'Connection test failed.' })
    } finally {
      setTestingXtream(false)
    }
  }

  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false)
  const isDirty = (url.trim() !== '' || name.trim() !== '' || username.trim() !== '') && !busy

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  const handleBack = () => {
    if (isDirty) {
      setShowUnsavedConfirm(true)
    } else {
      navigate('/sources')
    }
  }

  const checkUrl = () => {
    const playlistKind: SourceKind = kind === 'm3u8' || kind === 'url-list' ? kind : 'm3u'
    const checked = isGuide ? checkGuideUrl(url, store.guides.map((g) => g.url)) : checkPlaylistUrl(url, playlistKind, store.playlists.map((s) => s.url))
    setErrors({ url: 'error' in checked ? checked.error : undefined })
    return 'url' in checked ? checked.url : null
  }
  const checkName = () => {
    const n = name.trim()
    const taken = [...store.playlists, ...store.sources, ...store.guides, ...store.xtreamSources.filter((s) => s.id !== sourceParam)].some((s) => s.name.toLowerCase() === n.toLowerCase())
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
    if (isPersonalMedia) {
      const trimmedUrl = url.trim()
      const trimmedName = name.trim()
      if (!trimmedUrl) {
        setErrors({ url: 'Enter a valid web or stream address.' })
        return
      }
      if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
        setErrors({ url: 'Address must begin with http:// or https://' })
        return
      }
      if (!trimmedName) {
        setErrors({ name: 'Give the source a name you will recognise.' })
        return
      }
      setErrors({})
      const targetCat = kind === 'radio' ? 'radio' : kind === 'podcast' ? 'podcasts' : kind === 'api' ? 'metadata' : (category || 'other')
      const resType = kind === 'radio' ? 'stream' : kind === 'podcast' ? 'rss' : kind === 'api' ? 'api' : 'web'
      const isAudio = kind === 'radio' || kind === 'podcast'
      const previewRes: Omit<MediaResource, 'id'> = {
        name: trimmedName,
        description: description.trim() || `${trimmedName} (${kind.toUpperCase()}) added to personal sources.`,
        resourceType: resType,
        category: targetCat,
        subcategory: subcategory.trim() || (kind === 'radio' ? 'Live Stream' : kind === 'podcast' ? 'Audio Feed' : 'General'),
        url: trimmedUrl,
        provider: provider.trim() || 'Personal Source',
        discoveryUrl: trimmedUrl,
        dateDiscovered: new Date().toISOString().slice(0, 10),
        lastVerified: new Date().toISOString().slice(0, 10),
        verificationStatus: 'verified',
        provides: kind === 'radio' ? 'Live audio stream' : kind === 'podcast' ? 'Podcast audio feed' : kind === 'api' ? 'Metadata endpoint' : 'Web media resource',
        supportedByKinora: true,
        playbackUrl: isAudio ? trimmedUrl : undefined,
        playbackType: isAudio ? 'audio' : 'web',
        tags: [kind, targetCat, 'personal'].filter(Boolean),
      }
      setCustomPreview(previewRes)
      setStep(2)
      return
    }
    if (isXtream) {
      if (!url.trim() || !username.trim() || !password) {
        setErrors({ url: !url.trim() ? 'Enter your provider server address.' : undefined, name: !username.trim() || !password ? 'Enter the provider username and password.' : undefined })
        return
      }
      if (reading.current) return
      reading.current = true
      const token = ++attempt.current
      setBusy(true)
      setErrors({})
      void connectXtream(xtreamId.current, url.trim(), username, password).then(async (catalogue) => {
        if (!xtreamPageActive.current || token !== attempt.current) {
          await disconnectXtream(xtreamId.current).catch(() => undefined)
          return
        }
        setUsername('')
        setPassword('')
        reading.current = false
        setBusy(false)
        if (!catalogue) return setErrors({ url: 'Kinora could not connect to this provider. Check the address and login, then try again.' })
        setXtreamPreview({ server: url.trim(), catalogue })
        if (!name.trim()) setName(sourceToReconnect?.name ?? 'My provider')
        setStep(2)
      }).catch((error: unknown) => {
        if (!xtreamPageActive.current || token !== attempt.current) return
        setUsername('')
        setPassword('')
        reading.current = false
        setBusy(false)
        setErrors({ url: error instanceof Error ? error.message : 'Kinora could not connect to this provider.' })
      })
      return
    }
    const href = checkUrl()
    if (!href) return
    if (isGuide) void loadGuide({ origin: 'url', url: href, label: addressLabel(href), name: defaultName('url', href) }, () => fetchGuide(guideId, href))
    else void load({ origin: 'url', url: href, label: addressLabel(href), name: defaultName('url', href) }, () => fetchPlaylist(href))
  }
  const scanFile = (file: File) => isGuide
    ? void loadGuide({ origin: 'file', url: null, label: fileLabel(file.name), name: guideFileName(file.name) }, () => readGuideFile(guideId, file))
    : void load({ origin: 'file', url: null, label: fileLabel(file.name), name: defaultName('file', file.name) }, () => readPlaylistFile(file))

  const add = () => {
    if (customPreview) {
      store.mediaLibrary.addCustomResource(customPreview, notes.trim() || undefined)
      toast(`Added ${name.trim()} to your personal sources.`)
      navigate('/sources?tab=my-sources')
      return
    }
    if (xtreamPreview?.catalogue) {
      if (!checkName()) return
      const cat = xtreamPreview.catalogue
      const liveCount = cat.liveStreams?.length ?? 0
      const source: XtreamSource = {
        id: xtreamId.current,
        name: name.trim(),
        addedAt: sourceToReconnect?.addedAt ?? Date.now(),
        lastSuccess: Date.now(),
        movies: cat.movies.length,
        series: cat.series.length,
        liveChannels: liveCount,
        hasLive: Boolean(cat.capabilities?.hasLive ?? liveCount > 0),
        hasVod: Boolean(cat.capabilities?.hasVod ?? cat.movies.length > 0),
        hasSeries: Boolean(cat.capabilities?.hasSeries ?? cat.series.length > 0),
        hasEpg: Boolean(cat.capabilities?.hasEpg),
        hasCatchup: Boolean(cat.capabilities?.hasCatchup),
        status: cat.userInfo?.status ?? 'Active',
        expDate: cat.userInfo?.expDate ?? null,
        capabilities: cat.capabilities ?? null,
        userInfo: cat.userInfo ?? null,
        serverInfo: cat.serverInfo ?? null,
        connected: true,
        server: xtreamPreview.server,
        enabled: true,
      }
      store.addXtreamSource(source, cat)
      xtreamAdded.current = true
      toast(`Added ${name.trim()}: ${liveCount} channels, ${source.movies} movies and ${source.series} series.`)
      navigate('/sources')
      return
    }
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
      <PageHeader title="Add Source" tabs={<button type="button" className="text-link" onClick={handleBack}><Icon name="back" size={16} />Back to Sources</button>} />
      <div className="page add-source">
        <ol className="steps" aria-label="Progress">
          {steps.map((label, i) => (
            <li key={label} aria-current={step === i + 1 ? 'step' : undefined} className={step > i + 1 ? 'done' : ''}>
              <span className="step-no">{step > i + 1 ? <Icon name="check" size={14} /> : i + 1}</span>{label}
            </li>
          ))}
        </ol>

        {step === 1 && isXtream && (
          <form className="add-form" onSubmit={(e) => { e.preventDefault(); scanUrl() }} aria-busy={busy}>
            <label className="field">
              <span>Provider server address</span>
              <input className="input input-lg" type="url" inputMode="url" autoComplete="url" value={url} onChange={(e) => { setUrl(e.target.value); setXtreamTestResult(null) }} placeholder="https://provider.example:8080" aria-invalid={errors.url ? true : undefined} disabled={busy} autoFocus />
              {errors.url ? <span className="field-error" role="alert">{errors.url}</span> : <span className="field-hint">Enter the server address from your IPTV provider.</span>}
            </label>
            <label className="field">
              <span>Username</span>
              <input className="input" type="text" autoComplete="username" value={username} onChange={(e) => { setUsername(e.target.value); setXtreamTestResult(null) }} disabled={busy} />
            </label>
            <label className="field">
              <span>Password</span>
              <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setXtreamTestResult(null) }} disabled={busy} />
              {errors.name && <span className="field-error" role="alert">{errors.name}</span>}
            </label>

            {xtreamTestResult && (
              <div className={`validate-box ${xtreamTestResult.success ? '' : 'is-error'}`} style={{ marginTop: 8, marginBottom: 8 }}>
                <p className={`validate-status ${xtreamTestResult.success ? 'is-ok' : 'is-error'}`}>
                  <Icon name={xtreamTestResult.success ? 'check' : 'warning'} size={18} />
                  {xtreamTestResult.message}
                </p>
                {xtreamTestResult.success && xtreamTestResult.capabilities && (
                  <ul className="check-list">
                    <li><Icon name="check" size={16} />Live TV: {xtreamTestResult.capabilities.liveCount} channels across {xtreamTestResult.capabilities.liveCategoriesCount} categories</li>
                    <li><Icon name="check" size={16} />Movies / VOD: {xtreamTestResult.capabilities.vodCount} titles across {xtreamTestResult.capabilities.vodCategoriesCount} categories</li>
                    <li><Icon name="check" size={16} />Series: {xtreamTestResult.capabilities.seriesCount} series across {xtreamTestResult.capabilities.seriesCategoriesCount} categories</li>
                    <li><Icon name={xtreamTestResult.capabilities.hasEpg ? 'check' : 'info'} size={16} />EPG Guide: {xtreamTestResult.capabilities.hasEpg ? 'Available' : 'None detected'}</li>
                    <li><Icon name={xtreamTestResult.capabilities.hasCatchup ? 'check' : 'info'} size={16} />Catch-up TV: {xtreamTestResult.capabilities.hasCatchup ? 'Supported' : 'Not supported'}</li>
                    {xtreamTestResult.userInfo?.status && <li><Icon name="info" size={16} />Account Status: {xtreamTestResult.userInfo.status}{xtreamTestResult.userInfo.expDate ? ` (Expires: ${xtreamTestResult.userInfo.expDate})` : ''}</li>}
                  </ul>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy || testingXtream}
                onClick={handleTestXtream}
              >
                <Icon name="activity" size={16} />
                {testingXtream ? 'Testing connection…' : 'Test Connection'}
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ flex: 1 }}
                disabled={busy || testingXtream}
              >
                {busy ? 'Connecting and importing…' : sourceToReconnect ? 'Reconnect & Refresh' : 'Connect & Import Provider Services'}
              </button>
            </div>
            <p className="faint add-note">A single provider connection provides access to Live TV channels, categories, VOD movies, series, and EPG guide data as ONE managed source. Credentials stay in memory and are not stored in plain text or saved to disk.</p>
          </form>
        )}

        {step === 1 && isPersonalMedia && (
          <form className="add-form" onSubmit={(e) => { e.preventDefault(); scanUrl() }}>
            <div className="field">
              <span>Source Type</span>
              <Segmented label="Source type" value={kind} onChange={setKind} options={typeOptions} className="type-picker" />
            </div>

            <label className="field">
              <span>{kind === 'radio' ? 'Station Name' : kind === 'podcast' ? 'Podcast Title' : kind === 'api' ? 'API / Service Name' : 'Resource Name'}</span>
              <input
                className="input input-lg"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={kind === 'radio' ? 'e.g. BBC Radio 6 Music' : kind === 'podcast' ? 'e.g. Hardcore History' : kind === 'api' ? 'e.g. TMDb API' : 'e.g. NASA Open Media'}
                aria-invalid={errors.name ? true : undefined}
                autoFocus
              />
              {errors.name && <span className="field-error" role="alert">{errors.name}</span>}
            </label>

            <label className="field">
              <span>{kind === 'radio' ? 'Audio Stream URL' : kind === 'podcast' ? 'RSS Feed URL' : kind === 'api' ? 'API Endpoint URL' : 'Resource URL'}</span>
              <input
                className="input"
                type="text"
                inputMode="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={kind === 'radio' ? 'https://stream.example.com/live.mp3' : kind === 'podcast' ? 'https://feeds.example.com/feed.xml' : 'https://api.example.com'}
                aria-invalid={errors.url ? true : undefined}
              />
              {errors.url ? <span className="field-error" role="alert">{errors.url}</span> : <span className="field-hint">Must begin with http:// or https://. Sources are kept locally.</span>}
            </label>

            {(kind === 'custom' || kind === 'api') && (
              <label className="field">
                <span>Category</span>
                <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {MEDIA_TAXONOMY.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label className="field">
                <span>Provider / Network</span>
                <input
                  className="input"
                  type="text"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  placeholder="e.g. Public broadcaster, Creator, Archive"
                />
              </label>
              <label className="field">
                <span>Subcategory / Topic</span>
                <input
                  className="input"
                  type="text"
                  value={subcategory}
                  onChange={(e) => setSubcategory(e.target.value)}
                  placeholder={kind === 'radio' ? 'e.g. Indie Rock · 128 kbps' : 'e.g. Documentary, News, Space'}
                />
              </label>
            </div>

            <label className="field">
              <span>Description</span>
              <input
                className="input"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief summary of content and coverage"
              />
            </label>

            <button type="submit" className="btn btn-primary btn-block">
              Validate & Review
            </button>
            <p className="faint add-note">
              Personal sources are saved into your device library ({store.mediaLibrary.mySources.length} saved). Audio streams can be played instantly in the Kinora audio bar.
            </p>
          </form>
        )}

        {step === 1 && !isXtream && !isPersonalMedia && (
          <form className="add-form" onSubmit={(e) => { e.preventDefault(); scanUrl() }} aria-busy={busy}>
            <label className="field">
              <span>{isGuide ? 'Paste a guide URL' : 'Paste a playlist URL'}</span>
              <input className="input input-lg" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} onBlur={checkUrl} placeholder={isGuide ? 'e.g. https://example.com/guide.xml.gz' : 'e.g. https://example.com/playlist.m3u'} aria-invalid={errors.url ? true : undefined} disabled={busy} autoFocus />
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

        {step === 2 && xtreamPreview?.catalogue && (
          <form className="add-form" onSubmit={(e) => { e.preventDefault(); if (checkName()) setStep(3) }}>
            <div className="validate-box">
              <p className="validate-status is-ok"><Icon name="check" size={18} />Provider services discovered</p>
              <ul className="check-list">
                <li><Icon name="check" size={16} />Live TV: {xtreamPreview.catalogue.liveStreams?.length ?? 0} channels across {xtreamPreview.catalogue.liveCategories?.length ?? 0} categories</li>
                <li><Icon name="check" size={16} />Movies / VOD: {xtreamPreview.catalogue.movies.length} titles across {xtreamPreview.catalogue.vodCategories?.length ?? 0} categories</li>
                <li><Icon name="check" size={16} />Series: {xtreamPreview.catalogue.series.length} series across {xtreamPreview.catalogue.seriesCategories?.length ?? 0} categories</li>
                <li><Icon name={xtreamPreview.catalogue.capabilities?.hasEpg ? 'check' : 'info'} size={16} />EPG Guide: {xtreamPreview.catalogue.capabilities?.hasEpg ? 'Available' : 'None detected'}</li>
                <li><Icon name={xtreamPreview.catalogue.capabilities?.hasCatchup ? 'check' : 'info'} size={16} />Catch-up TV: {xtreamPreview.catalogue.capabilities?.hasCatchup ? 'Supported' : 'Not supported'}</li>
                {xtreamPreview.catalogue.userInfo?.status && (
                  <li><Icon name="info" size={16} />Account Status: {xtreamPreview.catalogue.userInfo.status}{xtreamPreview.catalogue.userInfo.expDate ? ` (Expires: ${xtreamPreview.catalogue.userInfo.expDate})` : ''}</li>
                )}
                <li><Icon name="info" size={16} />Provider credentials stay protected in Rust memory. All services are managed as one unified source.</li>
              </ul>
            </div>
            <label className="field"><span>Source name</span><input className="input" value={name} maxLength={48} onChange={(e) => setName(e.target.value)} aria-invalid={errors.name ? true : undefined} />{errors.name && <span className="field-error" role="alert">{errors.name}</span>}</label>
            <div className="add-actions"><button type="button" className="btn btn-secondary" onClick={() => { setStep(1); setXtreamPreview(null) }}>Back</button><button type="submit" className="btn btn-primary">Continue</button></div>
          </form>
        )}

        {step === 3 && xtreamPreview?.catalogue && (
          <div className="add-form">
            <dl className="detail-facts">
              <div><dt>Name</dt><dd>{name.trim()}</dd></div>
              <div><dt>Server</dt><dd className="source-url-full">{xtreamPreview.server}</dd></div>
              <div><dt>Live TV</dt><dd>{xtreamPreview.catalogue.liveStreams?.length ?? 0} channels ({xtreamPreview.catalogue.liveCategories?.length ?? 0} categories)</dd></div>
              <div><dt>Movies / VOD</dt><dd>{xtreamPreview.catalogue.movies.length} titles ({xtreamPreview.catalogue.vodCategories?.length ?? 0} categories)</dd></div>
              <div><dt>Series</dt><dd>{xtreamPreview.catalogue.series.length} series ({xtreamPreview.catalogue.seriesCategories?.length ?? 0} categories)</dd></div>
              <div><dt>EPG Guide</dt><dd>{xtreamPreview.catalogue.capabilities?.hasEpg ? 'Included' : 'Not detected'}</dd></div>
              <div><dt>Catch-up</dt><dd>{xtreamPreview.catalogue.capabilities?.hasCatchup ? 'Supported' : 'Not supported'}</dd></div>
              {xtreamPreview.catalogue.userInfo?.status && <div><dt>Account</dt><dd>{xtreamPreview.catalogue.userInfo.status}</dd></div>}
              <div><dt>Managed As</dt><dd>Single unified provider source</dd></div>
            </dl>
            <p className="muted">All provider services (Live TV channels, VOD movies, TV series, and EPG listings) are managed as one unified source. Disabling, refreshing, or removing this source handles all services together.</p>
            <div className="add-actions"><button type="button" className="btn btn-secondary" onClick={() => setStep(2)}>Back</button><button type="button" className="btn btn-primary" onClick={add}><Icon name="plus" size={18} />Add Provider Source</button></div>
          </div>
        )}

        {step === 2 && customPreview && (
          <form className="add-form" onSubmit={(e) => { e.preventDefault(); if (checkName()) setStep(3) }}>
            <div className="validate-box">
              <p className="validate-status is-ok"><Icon name="check" size={18} />Resource verified & configured</p>
              <ul className="check-list">
                <li><Icon name="check" size={16} />Type: {customPreview.resourceType.toUpperCase()} ({getCategory(customPreview.category)?.name ?? customPreview.category})</li>
                <li><Icon name="check" size={16} />Provider: {customPreview.provider}</li>
                <li><Icon name="info" size={16} />Saved on this device in your Personal Media Library.</li>
              </ul>
            </div>
            <label className="field">
              <span>Display Name</span>
              <input className="input" value={name} maxLength={48} onChange={(e) => { setName(e.target.value); setCustomPreview({ ...customPreview, name: e.target.value }) }} aria-invalid={errors.name ? true : undefined} />
              {errors.name && <span className="field-error" role="alert">{errors.name}</span>}
            </label>
            <label className="field">
              <span>Personal Notes</span>
              <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Favourite station, morning news" />
            </label>
            <div className="add-actions">
              <button type="button" className="btn btn-secondary" onClick={() => { setStep(1); setCustomPreview(null) }}>Back</button>
              <button type="submit" className="btn btn-primary">Continue</button>
            </div>
          </form>
        )}

        {step === 3 && customPreview && (
          <div className="add-form">
            <dl className="detail-facts">
              <div><dt>Name</dt><dd>{name.trim()}</dd></div>
              <div><dt>Address</dt><dd className="source-url-full">{customPreview.url}</dd></div>
              <div><dt>Category</dt><dd>{getCategory(customPreview.category)?.name ?? customPreview.category}</dd></div>
              <div><dt>Subcategory</dt><dd>{customPreview.subcategory}</dd></div>
              <div><dt>Provider</dt><dd>{customPreview.provider}</dd></div>
              <div><dt>Playback</dt><dd>{customPreview.playbackType === 'audio' ? 'Live audio stream (AudioPlayerBar)' : 'Web resource'}</dd></div>
              {notes.trim() && <div><dt>Notes</dt><dd>{notes.trim()}</dd></div>}
              <div><dt>Saved</dt><dd>On this device in Personal Media Library</dd></div>
            </dl>
            <p className="muted">This resource will be available in your personal library and under its category destination.</p>
            <div className="add-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setStep(2)}>Back</button>
              <button type="button" className="btn btn-primary" onClick={add}><Icon name="plus" size={18} />Add Source</button>
            </div>
          </div>
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
              <div><dt>Type</dt><dd>{preview.origin === 'url' && (kind === 'm3u' || kind === 'm3u8' || kind === 'xmltv' || kind === 'url-list') ? kindLabel[kind] : 'M3U playlist file'}</dd></div>
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

        <Dialog open={showUnsavedConfirm} onClose={() => setShowUnsavedConfirm(false)} title="Unsaved changes">
          <div className="unsaved-changes-dialog">
            <p>You have entered source details that have not been saved. If you leave now, these details will be discarded.</p>
            <div className="title-actions" style={{ marginTop: 20 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowUnsavedConfirm(false)}>
                Keep editing
              </button>
              <button type="button" className="btn btn-primary" onClick={() => navigate('/sources')}>
                Discard and leave
              </button>
            </div>
          </div>
        </Dialog>
      </div>
    </>
  )
}
