// First-run setup: explains what Kinora is, then gets a new user to real channels without knowing what
// M3U or XMLTV are. Every step can be skipped, and Settings › Data opens it again. Nothing is fetched
// until the user moves past the first screen.
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Logo } from '../components/Sidebar'
import { StateBlock } from '../components/ui'
import { fetchPlaylist, getAppInfo, inNativeShell, type AppInfo, type CatalogueEntry } from '../lib/native'
import { filterEntries, importedAs, suggestedEntries, uniqueName, PROVIDER } from '../state/catalogue'
import { addressLabel, readForPreview } from '../state/playlists'
import { useStore } from '../state/store'
import './Setup.css'

type Step = 'welcome' | 'channels' | 'done'

const STEPS: { id: Step; label: string }[] = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'channels', label: 'Channels' },
  { id: 'done', label: 'Finish' },
]

export function Setup() {
  const store = useStore()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('welcome')
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
              <span className="muted">{appInfo ? `v${appInfo.version} (${appInfo.os} ${appInfo.arch})` : 'v0.1.0'}</span>
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
        {step === 'channels' && <ChannelsStep onNext={() => setStep('done')} />}
        {step === 'done' && (
          <section className="setup-card" aria-labelledby="setup-title">
            <h1 id="setup-title" className="title-xl">{store.playlists.length > 0 ? 'You are ready to watch' : 'You can do this later'}</h1>
            <p className="muted">
              {store.playlists.length > 0
                ? `${store.channels.length} channels are in Live TV. Not every public stream works, or works where you are: if one will not play, Kinora says why, so try another.`
                : 'Add a playlist at any time in Sources, or open this setup again from Settings › Data.'}
            </p>
            <div className="setup-actions">
              <button type="button" className="btn btn-primary" onClick={() => leave(store.playlists.length > 0 ? '/live' : '/')}>{store.playlists.length > 0 ? 'Open Live TV' : 'Go to Home'}</button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function ChannelsStep({ onNext }: { onNext: () => void }) {
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
