import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Dialog } from '../components/Dialog'
import { Icon, type IconName } from '../components/Icon'
import { useToast } from '../components/Toast'
import { PageHeader } from '../components/PageHeader'
import { Segmented, StateBlock, Switch } from '../components/ui'
import { getAppInfo, type AppInfo } from '../lib/native'
import { ACCENTS, safeHex, type AccentName } from '../lib/theme'
import { useStore, type Prefs } from '../state/store'
import './Settings.css'

// Categories follow the mockup's Settings list (Playback, Interface, EPG, Sources, Library, Advanced),
// split further where the brief asks for Audio, Subtitles, Data and About.
const sections: { id: string; label: string; icon: IconName; blurb: string }[] = [
  { id: 'playback', label: 'Playback', icon: 'play', blurb: 'Video quality, resuming, hardware acceleration' },
  { id: 'audio', label: 'Audio', icon: 'audio', blurb: 'Language, output, loudness' },
  { id: 'subtitles', label: 'Subtitles', icon: 'subtitles', blurb: 'Language, size, style' },
  { id: 'appearance', label: 'Appearance', icon: 'palette', blurb: 'Theme, accent colour, density, text size, motion' },
  { id: 'epg', label: 'EPG', icon: 'guide', blurb: 'Guide settings, time format, timezone' },
  { id: 'sources', label: 'Sources', icon: 'link', blurb: 'How playlists are imported and refreshed' },
  { id: 'library', label: 'Library', icon: 'library', blurb: 'Layout, watched titles, watch history' },
  { id: 'data', label: 'Data', icon: 'database', blurb: 'Export, reset, clear saved data' },
  { id: 'about', label: 'About', icon: 'info', blurb: 'Version, licences, keyboard shortcuts' },
]

type BoolPref = { [K in keyof Prefs]: Prefs[K] extends boolean ? K : never }[keyof Prefs]

const PENDING = 'Saved now, applies once playback is connected'

function Row({ title, hint, pending, children, htmlFor }: { title: string; hint?: string; pending?: boolean; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="set-row">
      <div className="set-text">
        {htmlFor ? <label htmlFor={htmlFor} className="set-title">{title}</label> : <span className="set-title">{title}</span>}
        {hint && <span className="faint">{hint}</span>}
        {pending && <span className="pending-tag">{PENDING}</span>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="set-group" aria-label={title}>
      <h3 className="label">{title}</h3>
      {children}
    </section>
  )
}

export function Settings() {
  const { section } = useParams()
  const current = sections.find((x) => x.id === section)

  if (!section) {
    return (
      <>
        <PageHeader title={<><Icon name="cog" size={20} />Settings</>} />
        <div className="page settings">
          <p className="page-intro">Saved on this device as you change them.</p>
          <ul className="settings-list">
            {sections.map((x) => (
              <li key={x.id}>
                <Link to={`/settings/${x.id}`} className="card settings-item">
                  <span className="settings-icon"><Icon name={x.icon} /></span>
                  <span className="settings-text"><strong>{x.label}</strong><span className="faint">{x.blurb}</span></span>
                  <Icon name="right" size={18} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </>
    )
  }

  if (!current) {
    return (
      <>
        <PageHeader title="Settings" />
        <div className="page"><StateBlock icon="warning" title="No such settings page" action={<Link to="/settings" className="btn btn-primary">All settings</Link>} /></div>
      </>
    )
  }

  return (
    <>
      <PageHeader title={current.label} tabs={<Link to="/settings" className="text-link"><Icon name="back" size={16} />Settings</Link>} />
      <div className="page settings">
        <div className="settings-panel">
          <p className="page-intro">{current.blurb}.</p>
          <Section id={current.id} />
        </div>
      </div>
    </>
  )
}

function Section({ id }: { id: string }) {
  const store = useStore()
  const { prefs, setPref } = store
  const toggle = (key: BoolPref, title: string, hint?: string, pending?: boolean) => (
    <Row title={title} hint={hint} pending={pending}>
      <Switch checked={prefs[key]} onChange={(v) => setPref(key, v)} label={title} />
    </Row>
  )

  switch (id) {
    case 'appearance':
      return (
        <>
          <Group title="Theme">
            <Row title="Theme" hint="Dark suits a dim room, Dim lifts the surfaces a little, Light is for daytime.">
              <div className="theme-picks" role="group" aria-label="Theme">
                {(['dark', 'dim', 'light'] as const).map((t) => (
                  <button key={t} type="button" className="theme-pick" aria-pressed={prefs.theme === t} onClick={() => setPref('theme', t)}>
                    {/* Each preview carries its own data-theme, so it shows that theme's real tokens. */}
                    <span className="theme-preview" data-theme={t} aria-hidden="true">
                      <span className="tp-nav" /><span className="tp-card" /><span className="tp-card" /><span className="tp-accent" />
                    </span>
                    <span className="theme-name">{prefs.theme === t && <Icon name="check" size={14} />}{t[0]?.toUpperCase() + t.slice(1)}</span>
                  </button>
                ))}
              </div>
            </Row>
            <Row title="Accent colour" hint="Used for primary buttons, the active page, progress and what is playing. Text in the accent is adjusted automatically to stay readable.">
              <div className="swatches" role="group" aria-label="Accent colour">
                {(Object.entries(ACCENTS) as [AccentName, string][]).map(([name, hex]) => (
                  <button key={name} type="button" aria-pressed={prefs.accent === name} onClick={() => setPref('accent', name)}>
                    <span className="swatch" style={{ background: hex }}>{prefs.accent === name && <Icon name="check" size={13} />}</span>
                    {name[0]?.toUpperCase() + name.slice(1)}
                  </button>
                ))}
                <label className={`swatch-custom${prefs.accent === 'custom' ? ' is-on' : ''}`}>
                  <input
                    type="color"
                    value={prefs.customAccent}
                    onChange={(e) => { const hex = safeHex(e.target.value); if (hex) { setPref('customAccent', hex); setPref('accent', 'custom') } }}
                    onClick={() => setPref('accent', 'custom')}
                    aria-label="Custom accent colour"
                  />
                  {prefs.accent === 'custom' && <Icon name="check" size={13} />}Custom
                </label>
              </div>
            </Row>
          </Group>
          <Group title="Layout">
            <Row title="Density" hint="How much space surrounds cards, rows and guide entries.">
              <Segmented label="Density" value={prefs.density} onChange={(v) => setPref('density', v)} options={[{ value: 'compact', label: 'Compact' }, { value: 'comfortable', label: 'Comfortable' }, { value: 'spacious', label: 'Spacious' }]} />
            </Row>
            <Row title="Text size" hint="Large is easier to read from the sofa.">
              <Segmented label="Text size" value={prefs.textSize} onChange={(v) => setPref('textSize', v)} options={[{ value: 'standard', label: 'Standard' }, { value: 'large', label: 'Large' }]} />
            </Row>
            {toggle('reduceMotion', 'Reduce motion', 'Turns off artwork fades, card lifts and sliding panels. Your system setting is respected either way.')}
          </Group>
        </>
      )
    case 'playback':
      return (
        <>
          <Group title="Picture">
            <Row title="Streaming quality" hint="Auto picks the best quality your connection can hold." pending htmlFor="quality">
              <select id="quality" className="select" value={prefs.quality} onChange={(e) => setPref('quality', e.target.value as Prefs['quality'])}>
                <option value="auto">Auto</option><option value="2160p">4K (2160p)</option><option value="1080p">1080p</option><option value="720p">720p</option><option value="480p">480p, saves data</option>
              </select>
            </Row>
            {toggle('hardwareDecoding', 'Hardware decoding', 'Uses your graphics chip to decode video. Turn off if playback stutters or shows green frames.', true)}
          </Group>
          <Group title="Watching">
            <Row title="When reopening a title" hint="What happens when you play something you have started.">
              <Segmented label="Resume behaviour" value={prefs.resume} onChange={(v) => setPref('resume', v)} options={[{ value: 'resume', label: 'Resume' }, { value: 'ask', label: 'Ask' }, { value: 'start', label: 'Start over' }]} />
            </Row>
            {toggle('autoplayNext', 'Play next episode automatically', 'Starts the next episode after a short countdown.', true)}
            {toggle('skipIntros', 'Skip intros', 'Skips title sequences when the source marks them.', true)}
          </Group>
        </>
      )
    case 'audio':
      return (
        <Group title="Sound">
          <Row title="Preferred language" hint="Chosen when a title offers more than one." pending htmlFor="audio-lang">
            <select id="audio-lang" className="select" value={prefs.audioLanguage} onChange={(e) => setPref('audioLanguage', e.target.value)}>
              {['English', 'French', 'German', 'Spanish', 'Welsh', 'Original language'].map((l) => <option key={l}>{l}</option>)}
            </select>
          </Row>
          <Row title="Output" hint="Surround passes 5.1 and Atmos tracks through to your receiver." pending>
            <Segmented label="Audio output" value={prefs.audioOutput} onChange={(v) => setPref('audioOutput', v)} options={[{ value: 'stereo', label: 'Stereo' }, { value: 'surround', label: 'Surround' }]} />
          </Row>
          {toggle('dialogueBoost', 'Clearer dialogue', 'Lifts voices above music and effects.', true)}
          {toggle('normaliseVolume', 'Even out loudness', 'Keeps channels and adverts at a similar volume.', true)}
        </Group>
      )
    case 'subtitles':
      return (
        <>
          <Group title="Subtitles">
            {toggle('subtitles', 'Show subtitles by default')}
            <Row title="Language" htmlFor="sub-lang" pending>
              <select id="sub-lang" className="select" value={prefs.subtitleLanguage} onChange={(e) => setPref('subtitleLanguage', e.target.value)}>
                {['English', 'English (SDH)', 'French', 'Spanish', 'German'].map((l) => <option key={l}>{l}</option>)}
              </select>
            </Row>
            <Row title="Size">
              <Segmented label="Subtitle size" value={prefs.subtitleSize} onChange={(v) => setPref('subtitleSize', v)} options={[{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }]} />
            </Row>
            <Row title="Style">
              <Segmented label="Subtitle style" value={prefs.subtitleStyle} onChange={(v) => setPref('subtitleStyle', v)} options={[{ value: 'shadow', label: 'Shadow' }, { value: 'outline', label: 'Outline' }, { value: 'boxed', label: 'Boxed' }]} />
            </Row>
          </Group>
          <div className="sub-preview" aria-label="Subtitle preview">
            <img src="/art/kingsmoor-2.jpg" alt="" />
            <p className={`sub-line sub-${prefs.subtitleSize} sub-${prefs.subtitleStyle}`}>A letter, addressed to me. Dated forty years ago.</p>
          </div>
        </>
      )
    case 'library':
      return (
        <>
          <Group title="Browsing">
            <Row title="Film layout" hint="Also switchable from the Films page.">
              <Segmented label="Film layout" value={prefs.movieLayout} onChange={(v) => setPref('movieLayout', v)} options={[{ value: 'poster', label: 'Posters', icon: 'grid' }, { value: 'landscape', label: 'Wide', icon: 'rows' }]} />
            </Row>
            {toggle('hideWatched', 'Hide watched films', 'Keeps finished films out of the Films page.')}
          </Group>
          <Group title="History">
            {toggle('keepHistory', 'Keep viewing history', 'Powers Recently watched. Turning it off stops recording but keeps what is there.')}
          </Group>
        </>
      )
    case 'epg':
      return (
        <Group title="Live TV guide">
          <Row title="Time format">
            <Segmented label="Time format" value={prefs.timeFormat} onChange={(v) => setPref('timeFormat', v)} options={[{ value: '24h', label: '24-hour' }, { value: '12h', label: '12-hour' }]} />
          </Row>
          <Row title="Hours visible" hint="How much of the timeline fits across the guide.">
            <Segmented label="Hours visible" value={prefs.guideZoom} onChange={(v) => setPref('guideZoom', v)} options={[{ value: 2, label: '2 hours' }, { value: 3, label: '3 hours' }, { value: 4, label: '4 hours' }]} />
          </Row>
          <Row title="Open the guide at">
            <Segmented label="Open the guide at" value={prefs.guideStart} onChange={(v) => setPref('guideStart', v)} options={[{ value: 'now', label: 'Now' }, { value: 'day', label: 'Start of day' }]} />
          </Row>
          {toggle('guideArt', 'Programme artwork', 'Shows artwork in the programme details panel for demonstration programmes. Artwork listed in guides is never downloaded.')}
          <Row title="Programme guides" hint="XMLTV guides are added and matched to playlist channels in Sources, by guide id or by hand.">
            <Link to="/sources" className="text-link">{store.guides.length === 1 ? '1 guide' : `${store.guides.length} guides`}</Link>
          </Row>
          <Row title="Time zone" hint="Guide times follow this device, including clock changes.">
            <span className="muted">{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
          </Row>
        </Group>
      )
    case 'sources':
      return (
        <Group title="Importing and refreshing">
          <Row title="Refreshing" hint="Playlists and guides with an address are read when you add them, each time Kinora starts, and when you refresh one. Files are read only when you choose them. Automatic refresh is not available yet.">
            <span className="muted">Manual</span>
          </Row>
          <Row title="Stream checks" hint="Kinora reads channel lists but does not open or test streams. Checking streams is not available yet.">
            <span className="muted">Not available</span>
          </Row>
          <Row title="Keeping sources" hint="Imported playlists and guides are saved on this device, including their addresses, which can contain private tokens. Guide programmes are kept there too, so they show offline. Stream addresses are never saved, so restored channels play again once their source refreshes.">
            <span className="muted">On this device</span>
          </Row>
        </Group>
      )
    case 'data':
      return <DataSection />
    default:
      return <About />
  }
}

function DataSection() {
  const store = useStore()
  const toast = useToast()
  const [confirm, setConfirm] = useState<null | { title: string; body: string; action: string; run: () => void }>(null)

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), prefs: store.prefs, library: store.library, sources: store.sources }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `kinora-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    toast('Backup downloaded')
  }

  const ask = (title: string, body: string, action: string, run: () => void) => setConfirm({ title, body, action, run })

  return (
    <>
      <Group title="Your data">
        <Row title="Export a backup" hint="Settings, library and sources as a JSON file.">
          <button type="button" className="btn btn-ghost btn-small" onClick={exportData}><Icon name="download" size={16} />Export</button>
        </Row>
        <Row title="Clear viewing history" hint={`${store.library.history.length} items and all resume points.`}>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => ask('Clear viewing history?', 'Recently watched and resume points are removed. Favourites, watchlist and collections stay.', 'Clear history', () => store.clearHistory())}>Clear</button>
        </Row>
      </Group>
      <Group title="Demonstration data">
        <Row title="Empty the library" hint="Removes the sample favourites, watchlist, collections and history so you can see the empty states.">
          <button type="button" className="btn btn-ghost btn-small" onClick={() => ask('Empty the library?', 'Favourites, watchlist, collections, progress and history are all removed from this device.', 'Empty library', () => store.resetLibrary('empty'))}>Empty</button>
        </Row>
        <Row title="Restore sample library" hint="Puts the sample activity back.">
          <button type="button" className="btn btn-ghost btn-small" onClick={() => { store.resetLibrary('demo'); toast('Sample library restored') }}>Restore</button>
        </Row>
        <Row title="Restore sample sources" hint="Resets the Sources screen to its demonstration list.">
          <button type="button" className="btn btn-ghost btn-small" onClick={() => { store.resetSources(); toast('Sample sources restored') }}>Restore</button>
        </Row>
        <Row title="Reset all settings" hint="Every preference on this page goes back to its default.">
          <button type="button" className="btn btn-ghost btn-small" onClick={() => ask('Reset all settings?', 'Appearance, playback, subtitle and guide preferences return to their defaults. Your library is not touched.', 'Reset settings', () => store.resetPrefs())}>Reset</button>
        </Row>
      </Group>
      <Dialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.title ?? ''}
        footer={<>
          <button type="button" className="btn btn-secondary" onClick={() => setConfirm(null)}>Cancel</button>
          <button type="button" className="btn btn-danger" onClick={() => { confirm?.run(); toast('Done'); setConfirm(null) }}>{confirm?.action}</button>
        </>}
      >
        <p className="muted">{confirm?.body}</p>
      </Dialog>
    </>
  )
}

/** Version and shell details from Rust via the `app_info` IPC command; browser-only runs say so. */
function BuildRow() {
  const [state, setState] = useState<{ info: AppInfo | null } | { error: string } | 'loading'>('loading')
  useEffect(() => {
    let live = true
    getAppInfo()
      .then((info) => { if (live) setState({ info }) })
      .catch((e: unknown) => { if (live) setState({ error: e instanceof Error ? e.message : 'Could not read app information.' }) })
    return () => { live = false }
  }, [])

  if (state === 'loading') return <Row title="Kinora"><span className="muted">Reading build details…</span></Row>
  if ('error' in state) return <Row title="Kinora" hint={state.error}><span className="pending-tag">Unavailable</span></Row>
  if (!state.info) return <Row title="Kinora" hint="Running in a web browser, without the native shell."><span className="muted tnum">0.1.0, interface preview</span></Row>
  const { version, profile, os, arch, tauriVersion } = state.info
  return (
    <Row title="Kinora" hint={`Native shell: Tauri ${tauriVersion} on ${os} ${arch}.`}>
      <span className="muted tnum">{version}, {profile} build</span>
    </Row>
  )
}

function About() {
  const shortcuts: [string, string][] = [
    ['/', 'Search from anywhere'],
    ['Page Up / Page Down', 'Change channel in Live TV'],
    ['Arrow keys', 'Move through the guide, tabs and search results'],
    ['Enter', 'Open the focused programme or result'],
    ['Escape', 'Close a dialog, clear search, leave the player'],
    ['Left / Right', 'Move the resume point 10 seconds in the player'],
    ['C', 'Subtitles on or off in the player'],
    ['F', 'Full screen in the player'],
    ['M', 'Mute in the player'],
  ]
  return (
    <>
      <Group title="This build">
        <BuildRow />
        <Row title="What works" hint="In the desktop app: M3U playlists and XMLTV guides by address or file, saved on this device, a catalogue of public playlists to browse and add (Sources › Discovery), and HLS playback of playlist channels. Stream checking and other stream formats are not available yet." ><span className="pending-tag">In progress</span></Row>
        <Row title="Catalogue" hint="Films, series, channels, schedules and sources are fictional demonstration data. Artwork was generated for this project."><span className="muted">Demonstration</span></Row>
      </Group>
      <Group title="Typefaces">
        <Row title="Hanken Grotesk" hint="Interface text. SIL Open Font License 1.1."><span className="muted">OFL</span></Row>
      </Group>
      <Group title="Keyboard shortcuts">
        <dl className="shortcut-list">
          {shortcuts.map(([k, v]) => (
            <div key={k}><dt><span className="kbd">{k}</span></dt><dd>{v}</dd></div>
          ))}
        </dl>
      </Group>
    </>
  )
}
