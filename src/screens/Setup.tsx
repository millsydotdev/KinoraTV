// First-run setup: explains what Kinora is, then gets a new user to real channels without knowing what
// M3U or XMLTV are. Every step can be skipped, and Settings › Data opens it again. Nothing is fetched
// until the user moves past the first screen.
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Logo } from '../components/Sidebar'
import { StateBlock, Switch } from '../components/ui'
import { fetchGuide, fetchPlaylist, getAppInfo, inNativeShell, type AppInfo, type CatalogueEntry, APP_VERSION } from '../lib/native'
import { filterEntries, importedAs, suggestedEntries, uniqueName, PROVIDER } from '../state/catalogue'
import { readGuideForPreview } from '../state/guides'
import { addressLabel, readForPreview } from '../state/playlists'
import { useStore } from '../state/store'
import { loadMetadataConfig, saveMetadataConfig } from '../data/metadataProviders'
import './Setup.css'

type Step = 'welcome' | 'channels' | 'guide' | 'artwork' | 'done'

const STEPS: { id: Step; label: string }[] = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'channels', label: 'Channels' },
  { id: 'guide', label: 'Guide' },
  { id: 'artwork', label: 'Artwork' },
  { id: 'done', label: 'Finish' },
]

export function Setup() {
  const store = useStore()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('welcome')
  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>(null)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const leave = (to: string) => { store.finishSetup(); navigate(to, { replace: true }) }

  useEffect(() => {
    void getAppInfo().then(setAppInfo)
  }, [])

  return (
    <div className="setup">
      <header className="setup-head">
        <Logo />
        <ol className="setup-steps" aria-label="Setup progress">
          {STEPS.map((s) => <li key={s.id} aria-current={s.id === step ? 'step' : undefined}>{s.label}</li>)}
        </ol>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => leave('/')}>Skip setup</button>
      </header>
      <div className="setup-body">
        {step === 'welcome' && (
          <section className="setup-card" aria-labelledby="setup-title">
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '4px 10px', background: 'var(--surface)', borderRadius: 'var(--r-s)', border: '1px solid var(--line)', width: 'fit-content', fontSize: '0.8125rem' }}>
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>Kinora</span>
              <span className="muted">{appInfo ? `v${appInfo.version} (${appInfo.os} ${appInfo.arch})` : `v${APP_VERSION}`}</span>
            </div>
            <h1 id="setup-title" className="title-xl">Your TV, from sources you choose</h1>
            <p className="muted">Kinora has no channels or films of its own. It plays TV playlists you add, shows their schedule, and keeps your favourites on this device.</p>
            <p className="muted">Kinora collects nothing about you and has no account. The hosts you add do see your IP address when Kinora contacts them.</p>
            <p className="muted" style={{ fontSize: '0.8125rem', borderLeft: '2px solid var(--line-strong)', paddingLeft: '10px' }}>
              Playback requirement: Kinora uses direct HTTP Live Streaming (HLS). DRM is refused. Stream tokens remain in memory and are never persisted in logs or analytics.
            </p>
            <div className="setup-actions">
              <button type="button" className="btn btn-primary" onClick={() => setStep('channels')}>Find channels<Icon name="right" size={18} /></button>
              <button type="button" className="btn btn-secondary" onClick={() => leave('/sources/add')}>I have my own playlist</button>
              <button type="button" className="btn btn-ghost" onClick={() => { store.setPref('demoMode', true); leave('/') }}>Look around with sample data</button>
            </div>
          </section>
        )}
        {step === 'channels' && (
          <ChannelsStep
            onNext={() => setStep('guide')}
            onSelectCountry={(code) => setSelectedCountryCode(code)}
          />
        )}
        {step === 'guide' && (
          <GuideStep
            lastCountryCode={selectedCountryCode}
            onNext={() => setStep('artwork')}
            onBack={() => setStep('channels')}
          />
        )}
        {step === 'artwork' && (
          <ArtworkStep
            onNext={() => setStep('done')}
            onBack={() => setStep('guide')}
          />
        )}
        {step === 'done' && (
          <section className="setup-card" aria-labelledby="setup-title">
            <h1 id="setup-title" className="title-xl">{store.playlists.length > 0 ? 'You are ready to watch' : 'You can do this later'}</h1>
            <p className="muted">
              {store.playlists.length > 0
                ? 'Your channels, programme guide, and artwork preferences are saved on this device. You can adjust them anytime in Settings.'
                : 'Add a playlist at any time in Sources, or open this setup again from Settings › Data.'}
            </p>

            {store.playlists.length > 0 && (
              <div className="setup-recap-grid">
                <div className="setup-recap-card">
                  <span className="setup-recap-val">{store.channels.length}</span>
                  <span className="setup-recap-lbl">Channels ({store.playlists.length} source{store.playlists.length === 1 ? '' : 's'})</span>
                </div>
                <div className="setup-recap-card">
                  <span className="setup-recap-val">{store.guides.length}</span>
                  <span className="setup-recap-lbl">EPG Guides</span>
                </div>
                <div className="setup-recap-card">
                  <span className="setup-recap-val">{store.prefs.guideArt ? 'Active' : 'Local Only'}</span>
                  <span className="setup-recap-lbl">Artwork Mode</span>
                </div>
              </div>
            )}

            <div className="setup-actions">
              <button type="button" className="btn btn-primary" onClick={() => leave(store.playlists.length > 0 ? '/live' : '/')}>{store.playlists.length > 0 ? 'Open Live TV' : 'Go to Home'}</button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function ChannelsStep({
  onNext,
  onSelectCountry,
}: {
  onNext: () => void
  onSelectCountry: (code: string) => void
}) {
  const store = useStore()
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { openCatalogue, catalogue } = store
  useEffect(() => { void openCatalogue() }, [openCatalogue])
  const entries = catalogue.catalogue?.entries
  const region = useMemo(() => { try { return new Intl.Locale(navigator.language).region ?? null } catch { return null } }, [])
  const results = useMemo(() => {
    if (!entries) return []
    return query.trim() ? filterEntries(entries, 'country', query).slice(0, 12) : suggestedEntries(entries, region)
  }, [entries, query, region])

  const add = async (entry: CatalogueEntry) => {
    setBusy(entry.id)
    setError(null)
    const result = await readForPreview(() => fetchPlaylist(entry.url))
    setBusy(null)
    if ('error' in result) return setError(result.error)
    const taken = [...store.playlists, ...store.guides].map((x) => x.name)
    store.addPlaylist({ name: uniqueName(entry, taken), origin: 'url', url: entry.url, label: addressLabel(entry.url) }, result.report)
    onSelectCountry(entry.code)
  }

  return (
    <section className="setup-card setup-wide" aria-labelledby="setup-title">
      <h1 id="setup-title" className="title-l">Choose a country</h1>
      <p className="muted">
        These are public lists from the {PROVIDER} project. Kinora does not run, check or endorse them and cannot tell you whether a stream is legal to watch where you live.
        Only add what you are allowed to use.
      </p>
      {!inNativeShell() ? (
        <StateBlock icon="warning" title="This needs the desktop app">Channel lists are read by the Kinora desktop app.</StateBlock>
      ) : !entries ? (
        catalogue.status === 'failed'
          ? (
            <StateBlock icon="warning" title="The list could not be loaded" action={<button type="button" className="btn btn-secondary" onClick={() => void store.refreshCatalogue()}>Try again</button>}>
              {catalogue.error} You can skip this and add a playlist later.
            </StateBlock>
          )
          : <StateBlock icon="radar" title="Loading the list of countries" />
      ) : (
        <>
          <label className="setup-search">
            <span className="sr-only">Search countries</span>
            <Icon name="search" size={18} />
            <input className="input" type="search" placeholder="Search countries" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          {error && <p className="field-error" role="alert">{error}</p>}
          <ul className="setup-list">
            {results.map((e) => {
              const added = !!importedAs(e, store.playlists)
              return (
                <li key={e.id}>
                  <button type="button" className="setup-row" disabled={added || busy !== null} onClick={() => void add(e)}>
                    <span aria-hidden="true" className="setup-flag">{e.flag ?? <Icon name="live" />}</span>
                    <strong>{e.name}</strong>
                    <span className="faint">{added ? 'Added' : busy === e.id ? 'Reading…' : e.channels !== null ? `${e.channels} listed` : 'Add'}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          {results.length === 0 && <p className="muted">No country matches that search.</p>}
        </>
      )}
      <div className="setup-actions">
        <button type="button" className="btn btn-primary" onClick={onNext}>{store.playlists.length > 0 ? 'Continue' : 'Skip this step'}<Icon name="right" size={18} /></button>
        <Link to="/sources?tab=discovery" className="text-link" onClick={() => store.finishSetup()}>Browse languages, categories and regions in Discovery</Link>
      </div>
    </section>
  )
}

function GuideStep({
  lastCountryCode,
  onNext,
  onBack,
}: {
  lastCountryCode: string | null
  onNext: () => void
  onBack: () => void
}) {
  const store = useStore()
  const [guideUrl, setGuideUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const detectedCode = lastCountryCode?.toLowerCase() ?? null
  const suggestedUrl = detectedCode ? `https://iptv-org.github.io/epg/guides/${detectedCode}.xml.gz` : null
  const suggestedName = detectedCode ? `${detectedCode.toUpperCase()} Guide (iptv-org)` : null

  const add = async (url: string, name: string) => {
    if (!url.trim()) return
    setBusy(true)
    setError(null)
    const guideId = `gd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const result = await readGuideForPreview(
      () => fetchGuide(guideId, url.trim()),
      async () => ({ matched: 0, wanted: 0 }),
    )
    setBusy(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    const taken = [...store.playlists, ...store.guides].map((x) => x.name)
    const finalName = taken.includes(name) ? `${name} (${store.guides.length + 1})` : name
    store.addGuide(
      guideId,
      {
        name: finalName,
        origin: 'url',
        url: url.trim(),
        label: addressLabel(url.trim()),
        playlists: store.playlists.map((p) => p.id),
      },
      result.summary,
    )
    onNext()
  }

  const existingGuides = store.guides

  return (
    <section className="setup-card setup-wide" aria-labelledby="setup-title">
      <h1 id="setup-title" className="title-l">Electronic Programme Guide (EPG)</h1>
      <p className="muted">
        An XMLTV guide supplies broadcast schedules, programme titles, and start/stop times for your Live TV channels.
        Like playlists, guides are retrieved directly by Kinora without intermediate tracking.
      </p>

      {existingGuides.length > 0 && (
        <div className="setup-card-box">
          <strong>Connected Guides ({existingGuides.length})</strong>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            {existingGuides.map((g) => (
              <li key={g.id}>
                {g.name} ({g.summary?.programmes ?? 0} programmes listed)
              </li>
            ))}
          </ul>
        </div>
      )}

      {suggestedUrl && suggestedName && !existingGuides.some((g) => g.url === suggestedUrl) && (
        <div className="setup-card-box">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <strong>Suggested for your channels</strong>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.8125rem' }}>{suggestedName}</p>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => void add(suggestedUrl, suggestedName)}
            >
              {busy ? 'Reading guide...' : 'Add Suggested Guide'}
            </button>
          </div>
        </div>
      )}

      <div className="setup-card-box">
        <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <strong>Add Custom XMLTV Guide URL</strong>
          <input
            className="input"
            type="url"
            placeholder="https://example.com/epg.xml.gz"
            value={guideUrl}
            onChange={(e) => setGuideUrl(e.target.value)}
          />
        </label>
        {error && <p className="field-error" role="alert">{error}</p>}
        <div>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || !guideUrl.trim()}
            onClick={() => void add(guideUrl, 'Custom Guide')}
          >
            {busy ? 'Reading guide...' : 'Add XMLTV Guide'}
          </button>
        </div>
      </div>

      <div className="setup-actions">
        <button type="button" className="btn btn-primary" onClick={onNext}>
          {store.guides.length > 0 ? 'Continue' : 'Skip guide'}
          <Icon name="right" size={18} />
        </button>
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          <Icon name="back" size={18} />
          Back
        </button>
      </div>
    </section>
  )
}

function ArtworkStep({
  onNext,
  onBack,
}: {
  onNext: () => void
  onBack: () => void
}) {
  const store = useStore()
  const { prefs, setPref } = store
  const [metaConfig, setMetaConfig] = useState(() => loadMetadataConfig())

  const updateMetaEnrichment = (enabled: boolean) => {
    const updated = { ...metaConfig, autoEnrichEpg: enabled }
    setMetaConfig(updated)
    saveMetadataConfig(updated)
  }

  return (
    <section className="setup-card setup-wide" aria-labelledby="setup-title">
      <h1 id="setup-title" className="title-l">Logos & Artwork Privacy</h1>
      <p className="muted">
        Kinora can retrieve channel logos and programme stills to provide rich visuals. Images are verified for safety,
        converted to local raster formats, and stored in an on-device cache. Stream tokens are never saved.
      </p>
      <p className="muted" style={{ fontSize: '0.8125rem', borderLeft: '2px solid var(--line-strong)', paddingLeft: '10px' }}>
        Privacy disclosure: When Kinora fetches an image, the hosting server sees your IP address. You can disable remote images
        here to keep Kinora completely local-only.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div className="setup-option-card">
          <div className="set-text">
            <strong>Show Programme Artwork</strong>
            <span className="faint">Displays programme thumbnails and stills inside Live TV and guides.</span>
          </div>
          <Switch
            checked={prefs.guideArt}
            onChange={(v) => setPref('guideArt', v)}
            label="Show Programme Artwork"
          />
        </div>

        <div className="setup-option-card">
          <div className="set-text">
            <strong>Cinematic Artwork Backgrounds</strong>
            <span className="faint">Atmospheric backdrop imagery on details sheets, hero stages, and cards.</span>
          </div>
          <Switch
            checked={prefs.showArtworkBackgrounds}
            onChange={(v) => setPref('showArtworkBackgrounds', v)}
            label="Cinematic Artwork Backgrounds"
          />
        </div>

        <div className="setup-option-card">
          <div className="set-text">
            <strong>Open Metadata Enrichment (TVMaze / TMDb)</strong>
            <span className="faint">Optional lookup for synopsis, episode names, and poster art for known titles.</span>
          </div>
          <Switch
            checked={metaConfig.autoEnrichEpg}
            onChange={updateMetaEnrichment}
            label="Open Metadata Enrichment"
          />
        </div>
      </div>

      <div className="setup-actions">
        <button type="button" className="btn btn-primary" onClick={onNext}>
          Finish setup
          <Icon name="right" size={18} />
        </button>
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          <Icon name="back" size={18} />
          Back
        </button>
      </div>
    </section>
  )
}
