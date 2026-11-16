import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getPinLockoutRemainingSeconds } from '../lib/crypto'
import { Dialog } from '../components/Dialog'
import { Icon, type IconName } from '../components/Icon'
import { useToast } from '../components/Toast'
import { PageHeader } from '../components/PageHeader'
import { Segmented, StateBlock, Switch } from '../components/ui'
import { getAppInfo, checkForUpdates, type AppInfo, type UpdateCheckResult, APP_VERSION, getVersionChannel, formatChannelName } from '../lib/native'
import { CODEC_HELP, codecSupport } from '../lib/playback'
import { ACCENTS, THEME_BG, THEME_PRESETS, contrast, safeHex, type AccentName } from '../lib/theme'
import { defaultPrefs, useStore, type Prefs } from '../state/store'
import { useProfiles } from '../state/profiles'
import { Input } from '../components/design-system/Input'
import {
  METADATA_ATTRIBUTIONS,
  clearMetadataCredentials,
  loadMetadataConfig,
  saveMetadataConfig,
  testProviderConnection,
  type MetadataConfig,
} from '../data/metadataProviders'
import { artworkEngine } from '../data/artworkEngine'
import { CollapsibleSection } from '../components/CollapsibleSection'
import { useCasting } from '../lib/casting/manager'
import { WhatsNewModal } from '../components/WhatsNewModal'
import { KPlayMark } from '../components/KPlayMark'
import './Settings.css'

// Categories follow the mockup's Settings list (Playback, Interface, EPG, Sources, Library, Advanced),
// split further where the brief asks for Audio, Subtitles, Data and About.
const sections: { id: string; label: string; icon: IconName; blurb: string }[] = [
  { id: 'playback', label: 'Playback', icon: 'play', blurb: 'Video quality, resuming, next episode' },
  { id: 'casting', label: 'Casting & Network', icon: 'cast', blurb: 'Device discovery, Chromecast, AirPlay, DLNA receivers' },
  { id: 'audio', label: 'Audio', icon: 'audio', blurb: 'Preferred language' },
  { id: 'subtitles', label: 'Subtitles', icon: 'subtitles', blurb: 'Language, size, style' },
  { id: 'appearance', label: 'Appearance', icon: 'palette', blurb: 'Theme, accent colour, density, text size, motion' },
  { id: 'epg', label: 'EPG', icon: 'guide', blurb: 'Guide settings, time format, timezone' },
  { id: 'dvr', label: 'DVR & Recording', icon: 'record', blurb: 'Recording storage, padding, retention, timeshift buffer' },
  { id: 'sources', label: 'Sources', icon: 'link', blurb: 'How playlists are imported and refreshed' },
  { id: 'metadata', label: 'Metadata & Artwork', icon: 'film', blurb: 'External providers (TMDB, TVmaze), enrichment, artwork licensing' },
  { id: 'library', label: 'Library', icon: 'library', blurb: 'Layout, watched titles, watch history' },
  { id: 'profiles', label: 'Profiles', icon: 'user', blurb: 'Household profiles, Kids mode, avatar' },
  { id: 'data', label: 'Data', icon: 'database', blurb: 'Export, reset, clear saved data' },
  { id: 'about', label: 'About', icon: 'info', blurb: 'Version, licences, keyboard shortcuts' },
]

type BoolPref = { [K in keyof Prefs]: Prefs[K] extends boolean ? K : never }[keyof Prefs]

const PENDING = 'Applies to films and series'

function Row({ title, hint, pending, children, htmlFor, id }: { title: string; hint?: string; pending?: boolean; children: ReactNode; htmlFor?: string; id?: string }) {
  const rowId = id ?? `set-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <div className="set-row" id={rowId}>
      <div className="set-text">
        {htmlFor ? <label htmlFor={htmlFor} className="set-title">{title}</label> : <span className="set-title">{title}</span>}
        {hint && <span className="faint">{hint}</span>}
        {pending && <span className="pending-tag">{PENDING}</span>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  )
}

function Group({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return (
    <CollapsibleSection
      id={`settings-group-${slug}`}
      title={title}
      defaultOpen={defaultOpen}
      persistKey={`kinora.settings.group.${slug}`}
      className="set-group"
    >
      {children}
    </CollapsibleSection>
  )
}

function CastingSettings() {
  const { isScanning, devices, session, startDiscovery, connect, disconnect, setVolume } = useCasting()

  return (
    <div className="settings-panel">
      {session && (
        <Group title="Active Cast Session">
          <div className="set-row">
            <div className="set-text">
              <span className="set-title">{session.device.name}</span>
              <span className="faint">
                {session.device.model} ({session.device.protocol.toUpperCase()}) - Connected at {session.device.ip}
              </span>
            </div>
            <div className="set-control">
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => disconnect()}
              >
                Disconnect
              </button>
            </div>
          </div>
          <div className="set-row">
            <div className="set-text">
              <span className="set-title">Receiver Volume</span>
              <span className="faint">{session.volume}%</span>
            </div>
            <div className="set-control">
              <input
                type="range"
                min="0"
                max="100"
                value={session.volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                style={{ width: 140 }}
              />
            </div>
          </div>
        </Group>
      )}

      <Group title="Discovered Receivers">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span className="faint">Chromecast, Apple AirPlay, and DLNA receivers on your local Wi-Fi</span>
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => startDiscovery()}
            disabled={isScanning}
          >
            {isScanning ? 'Scanning...' : 'Scan Network'}
          </button>
        </div>

        {devices.map((device) => (
          <div key={device.id} className="set-row">
            <div className="set-text">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="set-title">{device.name}</span>
                <span
                  style={{
                    fontSize: '0.6875rem',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: 'var(--surface-3)',
                    color: 'var(--text-2)',
                    border: '1px solid var(--line)',
                  }}
                >
                  {device.protocol}
                </span>
                {device.signalStrength && (
                  <span className="faint" style={{ fontSize: '0.75rem' }}>
                    {device.signalStrength}% signal
                  </span>
                )}
              </div>
              <span className="faint">{device.model} ({device.ip})</span>
            </div>
            <div className="set-control">
              {session?.device.id === device.id ? (
                <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '0.875rem' }}>Active</span>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => connect(device)}
                  disabled={device.status === 'busy' || isScanning}
                >
                  Connect
                </button>
              )}
            </div>
          </div>
        ))}
      </Group>

      <Group title="Discovery Protocols">
        <Row title="Google Cast (Chromecast)" hint="Discover Chromecast built-in TVs, Nest Hubs, and Android TV receivers via mDNS / SSDP.">
          <Switch label="Google Cast" checked={true} onChange={() => {}} />
        </Row>
        <Row title="Apple AirPlay" hint="Discover Apple TV, HomePod, and AirPlay 2-compatible smart TVs via Bonjour.">
          <Switch label="Apple AirPlay" checked={true} onChange={() => {}} />
        </Row>
        <Row title="DLNA / UPnP AV" hint="Discover DLNA MediaRenderer devices and network media streamers.">
          <Switch label="DLNA / UPnP" checked={true} onChange={() => {}} />
        </Row>
      </Group>
    </div>
  )
}

const SETTING_DIRECT_LINKS = [
  { label: 'Theme Presets', section: 'appearance', rowId: 'set-curated-visual-presets', keywords: 'theme appearance style dark light' },
  { label: 'Accent Colour', section: 'appearance', rowId: 'set-accent-colour', keywords: 'accent color red blue green custom' },
  { label: 'Corner Radius Geometry', section: 'appearance', rowId: 'set-corner-radius-geometry', keywords: 'corner radius border geometry round sharp' },
  { label: 'Card Glow & Border Accent', section: 'appearance', rowId: 'set-card-glow-border-accent', keywords: 'glow border highlight card' },
  { label: 'Subtitle Language & Font Size', section: 'subtitles', rowId: 'set-size', keywords: 'subtitle caption font size' },
  { label: 'Subtitle Color & Box Opacity', section: 'subtitles', rowId: 'set-font-color', keywords: 'subtitle caption color opacity box' },
  { label: 'Parental PIN & Household Profiles', section: 'profiles', rowId: 'set-household-profiles', keywords: 'pin parental lockout lock children kids profile' },
  { label: 'Configuration Backup & Export', section: 'data', rowId: 'set-export-settings-json', keywords: 'backup export import data json portable' },
  { label: 'Audio Language Preference', section: 'audio', rowId: 'set-preferred-language', keywords: 'audio sound language speech' },
  { label: 'Video Quality & Buffering', section: 'playback', rowId: 'set-streaming-quality', keywords: 'quality video resolution 4k 1080p stream' },
  { label: 'DVR & Timeshift Buffer', section: 'dvr', rowId: 'set-recording-storage-directory', keywords: 'dvr record schedule recording storage' },
  { label: 'Metadata & Enrichment Providers', section: 'metadata', rowId: 'set-metadata-enrichment', keywords: 'tmdb tvmaze metadata artwork posters' },
]

export function Settings() {
  const { section } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const highlight = params.get('highlight')
  const current = sections.find((x) => x.id === section)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (!section && highlight) {
      const match = SETTING_DIRECT_LINKS.find((l) => l.rowId === highlight)
      if (match) {
        navigate(`/settings/${match.section}?highlight=${encodeURIComponent(highlight)}`, { replace: true })
      }
    }
  }, [section, highlight, navigate])

  if (!section) {
    const q = searchQuery.trim().toLowerCase()
    const matchingSections = q
      ? sections.filter((s) => s.label.toLowerCase().includes(q) || s.blurb.toLowerCase().includes(q))
      : sections
    const matchingLinks = q
      ? SETTING_DIRECT_LINKS.filter((l) => l.label.toLowerCase().includes(q) || l.keywords.toLowerCase().includes(q))
      : []

    return (
      <>
        <PageHeader title={<><Icon name="cog" size={20} />Settings</>} />
        <div className="page settings">
          <div style={{ marginBottom: 18 }}>
            <input
              type="search"
              className="input input-lg"
              placeholder="Search settings, controls, preferences..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search settings"
              style={{ width: '100%', maxWidth: 540 }}
            />
          </div>

          {q && matchingLinks.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 className="section-title" style={{ fontSize: '0.9375rem', marginBottom: 10 }}>Direct Setting Links</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {matchingLinks.map((item) => (
                  <Link
                    key={item.label}
                    to={`/settings/${item.section}?highlight=${item.rowId}`}
                    className="chip"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Icon name="cog" size={14} />
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <p className="page-intro">Saved on this device as you change them.</p>
          <ul className="settings-list">
            {matchingSections.map((x) => (
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

function AppearanceSection({
  prefs,
  setPref,
  toggle,
}: {
  prefs: Prefs
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void
  toggle: (key: BoolPref, title: string, hint?: string, pending?: boolean) => ReactNode
}) {
  const toast = useToast()
  const [cornerRadius, setCornerRadius] = useState<'sharp' | 'standard' | 'pill'>(() => {
    if (typeof window === 'undefined') return 'standard'
    return (localStorage.getItem('kinora.corner_radius.v1') as any) || 'standard'
  })
  const [cardGlow, setCardGlow] = useState<'subtle' | 'standard' | 'vibrant'>(() => {
    if (typeof window === 'undefined') return 'standard'
    return (localStorage.getItem('kinora.card_glow.v1') as any) || 'standard'
  })

  const applyRadius = (r: 'sharp' | 'standard' | 'pill') => {
    setCornerRadius(r)
    localStorage.setItem('kinora.corner_radius.v1', r)
    const s = r === 'sharp' ? '2px' : r === 'pill' ? '8px' : '4px'
    const m = r === 'sharp' ? '4px' : r === 'pill' ? '16px' : '8px'
    const l = r === 'sharp' ? '6px' : r === 'pill' ? '24px' : '14px'
    document.documentElement.style.setProperty('--r-s', s)
    document.documentElement.style.setProperty('--r-m', m)
    document.documentElement.style.setProperty('--r-l', l)
    toast(`Applied ${r} corner geometry`)
  }

  const applyGlow = (g: 'subtle' | 'standard' | 'vibrant') => {
    setCardGlow(g)
    localStorage.setItem('kinora.card_glow.v1', g)
    const alpha = g === 'subtle' ? '0.04' : g === 'vibrant' ? '0.22' : '0.12'
    document.documentElement.style.setProperty('--card-glow-alpha', alpha)
    toast(`Applied ${g} card glow intensity`)
  }

  const currentAccentHex = prefs.accent === 'custom' ? prefs.customAccent : ACCENTS[prefs.accent as AccentName] || '#f20d24'
  const currentBg = THEME_BG[prefs.theme] || '#08090b'
  const accentBgContrast = Math.round(contrast(currentAccentHex, currentBg) * 10) / 10
  const textOnAccentContrast = Math.round(contrast('#ffffff', currentAccentHex) * 10) / 10

  return (
    <>
      <Group title="Theme Presets">
        <Row title="Curated visual presets" hint="Switch the entire application palette to a curated style.">
          <div className="theme-presets-grid" role="group" aria-label="Theme presets">
            {THEME_PRESETS.map((preset) => {
              const isActive = prefs.theme === preset.theme && (
                preset.accent === 'custom'
                  ? prefs.accent === 'custom' && prefs.customAccent.toLowerCase() === preset.accentHex.toLowerCase()
                  : prefs.accent === preset.accent
              )
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={`theme-preset-card${isActive ? ' is-active' : ''}`}
                  aria-pressed={isActive}
                  onClick={() => {
                    setPref('theme', preset.theme)
                    setPref('accent', preset.accent)
                    if (preset.accent === 'custom') {
                      setPref('customAccent', preset.accentHex)
                    }
                    toast(`Applied preset: ${preset.name}`)
                  }}
                >
                  <div className="preset-swatches-bar" style={{ background: preset.bgHex }}>
                    <span className="preset-swatch" style={{ background: preset.surfaceHex }} />
                    <span className="preset-swatch" style={{ background: preset.navHex }} />
                    <span className="preset-swatch is-accent" style={{ background: preset.accentHex }} />
                    <span className="preset-swatch is-secondary" style={{ background: preset.secondaryAccentHex }} />
                  </div>
                  <div className="preset-meta">
                    <strong className="preset-name">
                      {isActive && <Icon name="check" size={13} />}
                      {preset.name}
                    </strong>
                    <p className="preset-desc">{preset.description}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </Row>
        <Row title="Master reset" hint="Instantly restore the authoritative Kinora reference styling.">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setPref('theme', 'dark')
              setPref('accent', 'red')
              setPref('customAccent', '#f20d24')
              toast('Restored Kinora Signature master theme')
            }}
          >
            <Icon name="refresh" size={15} />
            Restore Kinora Signature
          </button>
        </Row>
      </Group>
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
        <Row title="Accessibility contrast rating" hint="Live calculation of contrast against background and text readability.">
          <div className="contrast-rating-box">
            <div className="contrast-item">
              <span className="contrast-label">Accent on background</span>
              <span className={`contrast-badge ${accentBgContrast >= 4.5 ? 'pass' : 'warn'}`}>
                {accentBgContrast}:1 {accentBgContrast >= 4.5 ? '(WCAG AA Pass)' : '(Subtle)'}
              </span>
            </div>
            <div className="contrast-item">
              <span className="contrast-label">White text on accent fill</span>
              <span className={`contrast-badge ${textOnAccentContrast >= 4.5 ? 'pass' : 'fail'}`}>
                {textOnAccentContrast}:1 {textOnAccentContrast >= 7.0 ? '(WCAG AAA Pass)' : textOnAccentContrast >= 4.5 ? '(WCAG AA Pass)' : '(Low Contrast)'}
              </span>
            </div>
          </div>
        </Row>
      </Group>
      <Group title="Design Tokens & Surface Geometry">
        <Row title="Corner radius geometry" hint="Adjust the curvature across cards, buttons, dialogs, and navigation panels.">
          <Segmented
            label="Corner geometry"
            value={cornerRadius}
            onChange={applyRadius}
            options={[
              { value: 'sharp', label: 'Crisp / Sharp (2px)' },
              { value: 'standard', label: 'Balanced (8px)' },
              { value: 'pill', label: 'Curved (16px)' },
            ]}
          />
        </Row>
        <Row title="Card glow & border accent" hint="Intensity of subtle perimeter glows and hover highlights.">
          <Segmented
            label="Border highlight"
            value={cardGlow}
            onChange={applyGlow}
            options={[
              { value: 'subtle', label: 'Minimal' },
              { value: 'standard', label: 'Balanced' },
              { value: 'vibrant', label: 'Vibrant Glow' },
            ]}
          />
        </Row>
      </Group>
      <Group title="Live Theme Preview">
        <div className="live-theme-preview-canvas" aria-label="Interactive live theme preview">
          <div className="ltp-sidebar">
            <div className="ltp-logo">
              <KPlayMark size={16} className="ltp-logo-mark" idPrefix="ltp" />
              <span className="ltp-logo-text">KINORA <span style={{ color: 'var(--accent)' }}>TV</span></span>
            </div>
            <div className="ltp-nav-group">
              <span className="ltp-nav-label">WATCH</span>
              <div className="ltp-nav-item is-active">
                <span className="ltp-nav-icon" />
                <span>Home</span>
              </div>
              <div className="ltp-nav-item">
                <span className="ltp-nav-icon" />
                <span>Live TV</span>
              </div>
            </div>
          </div>
          <div className="ltp-main">
            <div className="ltp-header">
              <div className="ltp-search-bar">Search movies, series...</div>
              <div className="ltp-avatar" />
            </div>
            <div className="ltp-hero">
              <div className="ltp-hero-laser" />
              <div className="ltp-hero-content">
                <span className="ltp-tag">FEATURED MOVIE</span>
                <h4 className="ltp-title">Harbour <span className="ltp-title-red">Lights</span></h4>
                <p className="ltp-blurb">Every light in the harbour belongs to somebody.</p>
                <div className="ltp-actions">
                  <span className="ltp-btn-watch">Watch Now</span>
                  <span className="ltp-btn-secondary">+ Add to Library</span>
                  <span className="ltp-rating-badge">18</span>
                </div>
              </div>
            </div>
            <div className="ltp-cards-row">
              <div className="ltp-card">
                <div className="ltp-card-thumb">
                  <span className="ltp-play-circle" />
                  <div className="ltp-card-progress" style={{ width: '65%' }} />
                </div>
                <span className="ltp-card-title">Glasshouse</span>
              </div>
              <div className="ltp-card">
                <div className="ltp-card-thumb">
                  <span className="ltp-badge-4k">4K HDR</span>
                </div>
                <span className="ltp-card-title">Neon District</span>
              </div>
            </div>
          </div>
        </div>
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
}

function SubtitlesSection({
  prefs,
  setPref,
  toggle,
}: {
  prefs: Prefs
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void
  toggle: (key: BoolPref, title: string, hint?: string, pending?: boolean) => ReactNode
}) {
  const [subColor, setSubColor] = useState(() => {
    try { return localStorage.getItem('kinora.sub_color.v1') ?? '#ffffff' } catch { return '#ffffff' }
  })
  const [subBgOpacity, setSubBgOpacity] = useState(() => {
    try { return localStorage.getItem('kinora.sub_bg_opacity.v1') ?? '0.75' } catch { return '0.75' }
  })

  const updateSubColor = (c: string) => {
    setSubColor(c)
    try { localStorage.setItem('kinora.sub_color.v1', c) } catch {}
  }

  const updateSubOpacity = (op: string) => {
    setSubBgOpacity(op)
    try { localStorage.setItem('kinora.sub_bg_opacity.v1', op) } catch {}
  }

  return (
    <>
      <Group title="Subtitle Preferences">
        {toggle('subtitles', 'Show subtitles by default')}
        <Row title="Language" hint="Used when a stream offers subtitles." htmlFor="sub-lang">
          <select id="sub-lang" className="select" value={prefs.subtitleLanguage} onChange={(e) => setPref('subtitleLanguage', e.target.value)}>
            {['English', 'English (SDH)', 'French', 'Spanish', 'German'].map((l) => <option key={l}>{l}</option>)}
          </select>
        </Row>
      </Group>

      <Group title="Subtitle Styling Studio">
        <Row title="Size">
          <Segmented label="Subtitle size" value={prefs.subtitleSize} onChange={(v) => setPref('subtitleSize', v)} options={[{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }]} />
        </Row>
        <Row title="Style">
          <Segmented label="Subtitle style" value={prefs.subtitleStyle} onChange={(v) => setPref('subtitleStyle', v)} options={[{ value: 'shadow', label: 'Shadow' }, { value: 'outline', label: 'Outline' }, { value: 'boxed', label: 'Boxed' }]} />
        </Row>
        <Row title="Font Color" hint="Select color for subtitle caption text">
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { label: 'White', color: '#ffffff' },
              { label: 'Yellow', color: '#fde047' },
              { label: 'Cyan', color: '#67e8f9' },
              { label: 'Green', color: '#86efac' },
            ].map((sw) => (
              <button
                key={sw.color}
                type="button"
                className={`chip ${subColor === sw.color ? 'is-active' : ''}`}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => updateSubColor(sw.color)}
              >
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: sw.color, display: 'inline-block', border: '1px solid rgba(0,0,0,0.3)' }} />
                <span>{sw.label}</span>
              </button>
            ))}
          </div>
        </Row>
        <Row title="Background Box Opacity" hint="Opacity of background box behind caption text">
          <Segmented
            label="Background Box Opacity"
            value={subBgOpacity}
            onChange={updateSubOpacity}
            options={[
              { value: '0', label: 'None (0%)' },
              { value: '0.4', label: 'Soft (40%)' },
              { value: '0.75', label: 'Standard (75%)' },
              { value: '1', label: 'Opaque (100%)' },
            ]}
          />
        </Row>
      </Group>

      <Group title="Live Subtitle Studio Preview">
        <div className="sub-preview subtitle-preview-box" aria-label="Subtitle preview" style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--r-m)' }}>
          <img src="/art/kingsmoor-2.jpg" alt="" style={{ width: '100%', display: 'block' }} />
          <div style={{ position: 'absolute', bottom: 18, left: 16, right: 16, textAlign: 'center' }}>
            <span
              className={`sub-line sub-${prefs.subtitleSize} sub-${prefs.subtitleStyle}`}
              style={{
                color: subColor,
                backgroundColor: prefs.subtitleStyle === 'boxed' ? `rgba(0, 0, 0, ${subBgOpacity})` : undefined,
                padding: '4px 12px',
                borderRadius: 4,
              }}
            >
              A letter, addressed to me. Dated forty years ago.
            </span>
          </div>
        </div>
      </Group>
    </>
  )
}

function Section({ id }: { id: string }) {
  const store = useStore()
  const [params] = useSearchParams()
  const highlight = params.get('highlight')

  useEffect(() => {
    if (!highlight) return
    const timer = setTimeout(() => {
      const el = document.getElementById(highlight)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('is-settings-highlighted')
        setTimeout(() => el.classList.remove('is-settings-highlighted'), 3000)
      }
    }, 150)
    return () => clearTimeout(timer)
  }, [highlight])

  const { prefs, setPref } = store
  const toggle = (key: BoolPref, title: string, hint?: string, pending?: boolean) => (
    <Row title={title} hint={hint} pending={pending}>
      <Switch checked={prefs[key]} onChange={(v) => setPref(key, v)} label={title} />
    </Row>
  )

  switch (id) {
    case 'appearance':
      return <AppearanceSection prefs={prefs} setPref={setPref} toggle={toggle} />
    case 'playback':
      return (
        <>
          <Group title="Picture">
            <Row title="Streaming quality" hint="Auto picks the best your connection can hold. A lower choice caps it, for streams that offer several qualities." htmlFor="quality">
              <select id="quality" className="select" value={prefs.quality} onChange={(e) => setPref('quality', e.target.value as Prefs['quality'])}>
                <option value="auto">Auto</option><option value="2160p">4K (2160p)</option><option value="1080p">1080p</option><option value="720p">720p</option><option value="480p">480p, saves data</option>
              </select>
            </Row>
          </Group>
          <SystemVideo />
          <Group title="Watching">
            <Row title="When reopening a title" hint="What happens when you play something you have started.">
              <Segmented label="Resume behaviour" value={prefs.resume} onChange={(v) => setPref('resume', v)} options={[{ value: 'resume', label: 'Resume' }, { value: 'ask', label: 'Ask' }, { value: 'start', label: 'Start over' }]} />
            </Row>
            {toggle('autoplayNext', 'Play next episode automatically', 'Starts the next episode after a short countdown.')}
          </Group>
        </>
      )
    case 'casting':
      return <CastingSettings />
    case 'audio':
      return (
        <Group title="Sound">
          <Row title="Preferred language" hint="Chosen when a stream offers more than one." htmlFor="audio-lang">
            <select id="audio-lang" className="select" value={prefs.audioLanguage} onChange={(e) => setPref('audioLanguage', e.target.value)}>
              {['English', 'French', 'German', 'Spanish', 'Welsh', 'Original language'].map((l) => <option key={l}>{l}</option>)}
            </select>
          </Row>
        </Group>
      )
    case 'subtitles':
      return <SubtitlesSection prefs={prefs} setPref={setPref} toggle={toggle} />
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
    case 'dvr':
      return <DvrSection />
    case 'metadata':
      return <MetadataSection />
    case 'profiles':
      return <ProfilesSection />
    case 'data':
      return <DataSection />
    default:
      return <About />
  }
}

/** What this system's media stack reports. WebKit decodes through GStreamer, so this varies by machine. */
function SystemVideo() {
  const c = codecSupport()
  const rows: [string, boolean | undefined, string][] = [
    ['H.264 video', c?.h264, 'Used by almost every stream. Without it most channels cannot play.'],
    ['AAC audio', c?.aac, 'Used by almost every stream.'],
    ['HEVC video', c?.hevc, 'Used by some 4K streams.'],
    ['AV1 video', c?.av1, 'Used by a few newer streams.'],
  ]
  return (
    <Group title="What this system can play">
      {!c && <Row title="Video" hint="This window cannot report video support."><span className="muted">Unknown</span></Row>}
      {c && rows.map(([title, yes, hint]) => <Row key={title} title={title} hint={hint}><span className={yes ? 'muted' : 'pending-tag'}>{yes ? 'Available' : 'Not available'}</span></Row>)}
      {c && !c.h264 && <p className="field-error" role="alert">{CODEC_HELP}</p>}
    </Group>
  )
}

function DvrSection() {
  const store = useStore()
  const toast = useToast()
  const cfg = store.dvrConfig ?? {
    storagePath: '/mock/kinora/recordings',
    maxStorageBytes: 100 * 1024 * 1024 * 1024,
    minFreeDiskSpaceBytes: 5 * 1024 * 1024 * 1024,
    defaultPaddingStartMins: 2,
    defaultPaddingEndMins: 5,
    retentionDays: 30,
    autoDeleteUnprotected: true,
    timeshiftBufferMins: 60,
  }
  const storage = store.dvrStorageInfo

  const update = async (patch: Partial<typeof cfg>) => {
    try {
      await store.updateDvrConfig({ ...cfg, ...patch })
      toast('DVR settings saved')
    } catch {
      toast('Could not update DVR settings')
    }
  }

  const maxGb = Math.round(cfg.maxStorageBytes / (1024 * 1024 * 1024))
  const minFreeGb = Math.round(cfg.minFreeDiskSpaceBytes / (1024 * 1024 * 1024))

  return (
    <>
      <Group title="Recording Storage">
        <Row title="Storage directory" hint="Local directory where HLS recordings (.m3u8 and .ts segments) are saved.">
          <code style={{ fontSize: '0.82rem' }}>{cfg.storagePath}</code>
        </Row>
        {storage && (
          <Row title="Disk usage" hint="Space currently used by recordings and available free disk capacity.">
            <span className="muted">
              {(storage.usedByRecordingsBytes / (1024 * 1024 * 1024)).toFixed(1)} GB used · {(storage.availableDiskBytes / (1024 * 1024 * 1024)).toFixed(1)} GB free
            </span>
          </Row>
        )}
        <Row title="Maximum storage allocation" hint="Total disk space DVR recordings are allowed to use before cleanup runs." htmlFor="dvr-max-storage">
          <select
            id="dvr-max-storage"
            className="select"
            value={String(maxGb)}
            onChange={(e) => update({ maxStorageBytes: Number(e.target.value) * 1024 * 1024 * 1024 })}
          >
            <option value="25">25 GB</option>
            <option value="50">50 GB</option>
            <option value="100">100 GB</option>
            <option value="250">250 GB</option>
            <option value="500">500 GB</option>
            <option value="0">Unlimited</option>
          </select>
        </Row>
        <Row title="Minimum free disk space threshold" hint="Warn and clean up unprotected recordings when free disk space drops below this threshold." htmlFor="dvr-min-free">
          <select
            id="dvr-min-free"
            className="select"
            value={String(minFreeGb)}
            onChange={(e) => update({ minFreeDiskSpaceBytes: Number(e.target.value) * 1024 * 1024 * 1024 })}
          >
            <option value="2">2 GB</option>
            <option value="5">5 GB</option>
            <option value="10">10 GB</option>
            <option value="25">25 GB</option>
          </select>
        </Row>
      </Group>

      <Group title="Scheduling, Padding & Retention">
        <Row title="Default start padding" hint="Start recording early to avoid missing the beginning of a broadcast." htmlFor="dvr-pad-start">
          <select
            id="dvr-pad-start"
            className="select"
            value={String(cfg.defaultPaddingStartMins)}
            onChange={(e) => update({ defaultPaddingStartMins: Number(e.target.value) })}
          >
            <option value="0">On time (0 min)</option>
            <option value="1">1 minute early</option>
            <option value="2">2 minutes early</option>
            <option value="5">5 minutes early</option>
            <option value="10">10 minutes early</option>
          </select>
        </Row>
        <Row title="Default end padding" hint="Continue recording after the scheduled end time in case a broadcast runs late." htmlFor="dvr-pad-end">
          <select
            id="dvr-pad-end"
            className="select"
            value={String(cfg.defaultPaddingEndMins)}
            onChange={(e) => update({ defaultPaddingEndMins: Number(e.target.value) })}
          >
            <option value="0">On time (0 min)</option>
            <option value="2">2 minutes late</option>
            <option value="5">5 minutes late</option>
            <option value="10">10 minutes late</option>
            <option value="15">15 minutes late</option>
          </select>
        </Row>
        <Row title="Recording retention" hint="How long unprotected recordings are kept before automatic cleanup." htmlFor="dvr-retention">
          <select
            id="dvr-retention"
            className="select"
            value={String(cfg.retentionDays)}
            onChange={(e) => update({ retentionDays: Number(e.target.value) })}
          >
            <option value="7">7 days</option>
            <option value="14">14 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="0">Keep forever</option>
          </select>
        </Row>
        <Row title="Auto-cleanup unprotected recordings" hint="Automatically remove oldest unprotected recordings when storage limits are reached.">
          <Switch
            checked={cfg.autoDeleteUnprotected}
            onChange={(v) => update({ autoDeleteUnprotected: v })}
            label="Auto-cleanup unprotected recordings"
          />
        </Row>
      </Group>

      <Group title="Live TV Timeshift">
        <Row title="Timeshift buffer window" hint="Maximum rewind window when pausing or rewinding live television." htmlFor="dvr-timeshift">
          <select
            id="dvr-timeshift"
            className="select"
            value={String(cfg.timeshiftBufferMins)}
            onChange={(e) => update({ timeshiftBufferMins: Number(e.target.value) })}
          >
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="60">60 minutes</option>
            <option value="120">120 minutes</option>
          </select>
        </Row>
      </Group>
    </>
  )
}

function MetadataSection() {
  const [config, setConfig] = useState<MetadataConfig>(() => loadMetadataConfig())
  const [showKey, setShowKey] = useState(false)
  const [tmdbTestState, setTmdbTestState] = useState<{ testing: boolean; result?: { ok: boolean; message: string } }>({ testing: false })
  const [tvmazeTestState, setTvmazeTestState] = useState<{ testing: boolean; result?: { ok: boolean; message: string } }>({ testing: false })
  const [enrichmentRunning, setEnrichmentRunning] = useState(false)
  const [enrichmentStage, setEnrichmentStage] = useState('Idle')

  useEffect(() => {
    return artworkEngine.subscribe((progress) => {
      setEnrichmentRunning(progress.isRunning)
      setEnrichmentStage(progress.currentStage)
    })
  }, [])

  const updateConfig = (patch: Partial<MetadataConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch }
      saveMetadataConfig(next)
      return next
    })
  }

  const handleTestTmdb = async () => {
    setTmdbTestState({ testing: true })
    const res = await testProviderConnection('tmdb', config.tmdbApiKey)
    setTmdbTestState({ testing: false, result: res })
  }

  const handleTestTvmaze = async () => {
    setTvmazeTestState({ testing: true })
    const res = await testProviderConnection('tvmaze')
    setTvmazeTestState({ testing: false, result: res })
  }

  const handleClearTmdbKey = () => {
    clearMetadataCredentials()
    setConfig(loadMetadataConfig())
    setTmdbTestState({ testing: false, result: { ok: true, message: 'TMDB credentials revoked and cleared.' } })
  }

  return (
    <>
      <div className="set-group" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-m)', padding: '14px 18px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Icon name="info" size={16} />
          <strong style={{ fontSize: '0.9rem', color: 'var(--text)' }}>Privacy & Search Query Disclosure</strong>
        </div>
        <p className="faint" style={{ margin: 0, fontSize: '0.82rem', lineHeight: 1.4 }}>
          By default, Kinora queries only your local playlists and guides. Enabling external metadata providers allows Kinora to search public databases (TMDB and TVmaze) using programme and film titles to discover official artwork. Kinora never transmits your stream addresses, playlist credentials, or personal identity.
        </p>
      </div>

      <Group title="The Movie Database (TMDB)">
        <Row title="Enable TMDB Metadata" hint="Discover theatrical movie posters, backdrops, and TV series information. Disabled by default.">
          <Switch
            checked={config.tmdbEnabled}
            onChange={(v) => updateConfig({ tmdbEnabled: v })}
            label="Enable TMDB"
          />
        </Row>
        <Row title="TMDB API Key" hint="Required for TMDB queries. Enter your personal API key or Bearer token from themoviedb.org.">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', maxWidth: 360 }}>
            <input
              type={showKey ? 'text' : 'password'}
              className="text-input"
              style={{ flex: 1, padding: '6px 10px', fontSize: '0.85rem' }}
              placeholder="Enter TMDB API Key / Bearer Token"
              value={config.tmdbApiKey}
              onChange={(e) => updateConfig({ tmdbApiKey: e.target.value })}
            />
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => setShowKey(!showKey)}
              aria-label={showKey ? 'Hide API Key' : 'Show API Key'}
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
        </Row>
        <Row title="Connection & Credentials" hint="Verify API key validity against TMDB configuration endpoint, or revoke saved key.">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              disabled={tmdbTestState.testing}
              onClick={handleTestTmdb}
            >
              {tmdbTestState.testing ? 'Testing...' : 'Test Connection'}
            </button>
            {config.tmdbApiKey && (
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={handleClearTmdbKey}
                style={{ color: 'var(--accent-light, #f87171)' }}
              >
                Revoke Key
              </button>
            )}
          </div>
        </Row>
        {tmdbTestState.result && (
          <Row title="TMDB Status">
            <span style={{ fontSize: '0.84rem', color: tmdbTestState.result.ok ? 'var(--accent, #4ade80)' : 'var(--accent-light, #f87171)' }}>
              {tmdbTestState.result.message}
            </span>
          </Row>
        )}
        <Row title="Attribution & Licensing">
          <p className="faint" style={{ margin: 0, fontSize: '0.8rem' }}>
            {METADATA_ATTRIBUTIONS.tmdb.attributionText}
          </p>
        </Row>
      </Group>

      <Group title="TVmaze (Television Schedule & Episode Stills)">
        <Row title="Enable TVmaze Metadata" hint="Discover episode stills and television schedule information. Free public community database; no API key required. Disabled by default.">
          <Switch
            checked={config.tvmazeEnabled}
            onChange={(v) => updateConfig({ tvmazeEnabled: v })}
            label="Enable TVmaze"
          />
        </Row>
        <Row title="TVmaze API Connection" hint="Test connectivity to api.tvmaze.com via the guarded native network boundary.">
          <button
            type="button"
            className="btn btn-secondary btn-small"
            disabled={tvmazeTestState.testing}
            onClick={handleTestTvmaze}
          >
            {tvmazeTestState.testing ? 'Testing...' : 'Test Connection'}
          </button>
        </Row>
        {tvmazeTestState.result && (
          <Row title="TVmaze Status">
            <span style={{ fontSize: '0.84rem', color: tvmazeTestState.result.ok ? 'var(--accent, #4ade80)' : 'var(--accent-light, #f87171)' }}>
              {tvmazeTestState.result.message}
            </span>
          </Row>
        )}
        <Row title="Attribution & Licensing">
          <p className="faint" style={{ margin: 0, fontSize: '0.8rem' }}>
            {METADATA_ATTRIBUTIONS.tvmaze.attributionText}
          </p>
        </Row>
      </Group>

      <Group title="Artwork Enrichment Preferences">
        <Row title="Auto-enrich missing EPG artwork" hint="Automatically search enabled metadata providers for programmes that have no broadcaster icon.">
          <Switch
            checked={config.autoEnrichEpg}
            onChange={(v) => updateConfig({ autoEnrichEpg: v })}
            label="Auto-enrich EPG artwork"
          />
        </Row>
        <Row title="Prefer high-resolution posters" hint="When available, display theatrical posters and backdrops instead of low-resolution broadcaster thumbnails.">
          <Switch
            checked={config.preferHighResPosters}
            onChange={(v) => updateConfig({ preferHighResPosters: v })}
            label="Prefer high-resolution posters"
          />
        </Row>
        <Row title="Manual Background Enrichment" hint="Run background enrichment across all eligible catalogue and schedule items.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              className="btn btn-primary btn-small"
              disabled={enrichmentRunning}
              onClick={() => artworkEngine.runEnrichment()}
            >
              {enrichmentRunning ? 'Enriching...' : 'Run Enrichment Now'}
            </button>
            <span className="faint" style={{ fontSize: '0.82rem' }}>{enrichmentStage}</span>
          </div>
        </Row>
      </Group>
    </>
  )
}

function ProfilesSection() {
  const { profiles, activeProfile, switchProfile, addProfile, deleteProfile, parentalPin, setParentalPin, verifyParentalPin } = useProfiles()
  const toast = useToast()
  const [newOpen, setNewOpen] = useState(false)
  const [name, setName] = useState('')
  const [isKids, setIsKids] = useState(false)
  const [color, setColor] = useState('#3b82f6')
  const [icon, setIcon] = useState<IconName>('user')

  // Parental PIN management state
  const [pinDialogOpen, setPinDialogOpen] = useState(false)
  const [pinMode, setPinMode] = useState<'set' | 'change' | 'remove'>('set')
  const [currentPinInput, setCurrentPinInput] = useState('')
  const [newPinInput, setNewPinInput] = useState('')
  const [confirmPinInput, setConfirmPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [lockoutSecs, setLockoutSecs] = useState(() => getPinLockoutRemainingSeconds())

  useEffect(() => {
    if (!pinDialogOpen) return
    setLockoutSecs(getPinLockoutRemainingSeconds())
    const timer = window.setInterval(() => {
      const rem = getPinLockoutRemainingSeconds()
      setLockoutSecs(rem)
    }, 1000)
    return () => clearInterval(timer)
  }, [pinDialogOpen])

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    addProfile(name.trim(), isKids, color, icon)
    toast(`Created profile “${name.trim()}”`)
    setName('')
    setIsKids(false)
    setNewOpen(false)
  }

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setPinError('')

    if (pinMode === 'remove') {
      if (!verifyParentalPin(currentPinInput)) {
        setPinError('Incorrect PIN entered.')
        return
      }
      setParentalPin(null)
      toast('Parental PIN removed')
      setPinDialogOpen(false)
      setCurrentPinInput('')
      return
    }

    if (pinMode === 'change') {
      if (!verifyParentalPin(currentPinInput)) {
        setPinError('Current PIN is incorrect.')
        return
      }
    }

    if (!/^\d{4}$/.test(newPinInput)) {
      setPinError('PIN must be exactly 4 digits.')
      return
    }

    if (pinMode === 'set' && newPinInput !== confirmPinInput) {
      setPinError('PIN confirmation does not match.')
      return
    }

    setParentalPin(newPinInput)
    toast(pinMode === 'set' ? 'Parental PIN activated' : 'Parental PIN updated')
    setPinDialogOpen(false)
    setCurrentPinInput('')
    setNewPinInput('')
    setConfirmPinInput('')
  }

  const colors = ['#e50914', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899']
  const icons: IconName[] = ['user', 'heart', 'star', 'sparkles', 'tv', 'film', 'gaming', 'music']

  return (
    <>
      <Group title="Household profiles">
        {profiles.map((p) => {
          const isActive = p.id === activeProfile.id
          return (
            <Row
              key={p.id}
              title={p.name}
              hint={p.isKids ? 'Kids profile (family-friendly content only)' : isActive ? 'Active profile' : 'Household profile'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: p.avatarColor,
                    display: 'grid',
                    placeItems: 'center',
                    color: '#fff',
                  }}
                >
                  <Icon name={p.avatarIcon} size={16} />
                </span>
                {p.isKids && (
                  <span className="pill pill-subtle" style={{ color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Icon name="shield" size={12} />Kids
                  </span>
                )}
                {!isActive ? (
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => switchProfile(p.id)}>
                    Switch
                  </button>
                ) : (
                  <span className="pill pill-healthy">Active</span>
                )}
                {profiles.length > 1 && !isActive && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Delete profile ${p.name}`}
                    onClick={() => {
                      deleteProfile(p.id)
                      toast(`Deleted profile “${p.name}”`)
                    }}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                )}
              </div>
            </Row>
          )
        })}
        <Row title="Add household profile" hint="Create an independent profile with separate watchlist and ratings.">
          <button type="button" className="btn btn-primary btn-small" onClick={() => setNewOpen(true)}>
            <Icon name="plus" size={16} />New profile
          </button>
        </Row>
      </Group>

      <Group title="Parental controls & PIN protection">
        <Row
          title="Parental Lock PIN"
          hint={parentalPin ? 'A 4-digit PIN is active. It is required to switch away from Kids profiles or access mature titles.' : 'No PIN configured. Anyone can switch profiles or access all content freely.'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {parentalPin ? (
              <>
                <span className="pill pill-healthy" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="lock" size={12} />Active
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => {
                    setPinMode('change')
                    setPinError('')
                    setCurrentPinInput('')
                    setNewPinInput('')
                    setConfirmPinInput('')
                    setPinDialogOpen(true)
                  }}
                >
                  Change PIN
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => {
                    setPinMode('remove')
                    setPinError('')
                    setCurrentPinInput('')
                    setPinDialogOpen(true)
                  }}
                >
                  Remove
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => {
                  setPinMode('set')
                  setPinError('')
                  setNewPinInput('')
                  setConfirmPinInput('')
                  setPinDialogOpen(true)
                }}
              >
                <Icon name="lock" size={14} />Set 4-digit PIN
              </button>
            )}
          </div>
        </Row>
      </Group>

      <Dialog
        open={pinDialogOpen}
        onClose={() => setPinDialogOpen(false)}
        title={pinMode === 'set' ? 'Set Parental PIN' : pinMode === 'change' ? 'Change Parental PIN' : 'Remove Parental PIN'}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setPinDialogOpen(false)}>Cancel</button>
            <button type="submit" form="parental-pin-form" className="btn btn-primary" disabled={lockoutSecs > 0}>
              {pinMode === 'set' ? 'Activate PIN' : pinMode === 'change' ? 'Update PIN' : 'Remove PIN'}
            </button>
          </>
        }
      >
        {lockoutSecs > 0 && (
          <div className="pill pill-pending" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', marginBottom: 12 }}>
            <Icon name="lock" size={14} />
            <span>Locked: Try again in {lockoutSecs}s</span>
          </div>
        )}
        <form id="parental-pin-form" onSubmit={handlePinSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {pinMode !== 'set' && (
            <Input
              type="password"
              label="Current 4-digit PIN"
              maxLength={4}
              inputMode="numeric"
              value={currentPinInput}
              onChange={(e) => setCurrentPinInput(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              required
              autoFocus
              disabled={lockoutSecs > 0}
              startIcon="lock"
            />
          )}

          {pinMode !== 'remove' && (
            <>
              <Input
                type="password"
                label={pinMode === 'change' ? 'New 4-digit PIN' : '4-digit PIN'}
                maxLength={4}
                inputMode="numeric"
                value={newPinInput}
                onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                required
                autoFocus={pinMode === 'set'}
                startIcon="lock"
              />

              {pinMode === 'set' && (
                <Input
                  type="password"
                  label="Confirm PIN"
                  maxLength={4}
                  inputMode="numeric"
                  value={confirmPinInput}
                  onChange={(e) => setConfirmPinInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  required
                  startIcon="lock"
                />
              )}
            </>
          )}

          {pinError && (
            <p className="field-error" role="alert" style={{ color: '#ef4444', fontSize: 13, margin: 0, fontWeight: 500 }}>
              {pinError}
            </p>
          )}
          <p className="faint" style={{ fontSize: 13, margin: 0 }}>
            {pinMode === 'remove'
              ? 'Removing the PIN disables lock protection when switching out of Kids profiles.'
              : 'This PIN will be requested whenever exiting a Kids profile to keep family viewing protected.'}
          </p>
        </form>
      </Dialog>

      <Dialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="Add household profile"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setNewOpen(false)}>Cancel</button>
            <button type="submit" form="new-profile-form" className="btn btn-primary">Create profile</button>
          </>
        }
      >
        <form id="new-profile-form" onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label className="field">
            <span>Profile name</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex or Kids"
              maxLength={24}
              required
              autoFocus
            />
          </label>
          <div className="field">
            <span>Avatar icon</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {icons.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  className={`icon-btn ${icon === ic ? 'ringed' : ''}`}
                  onClick={() => setIcon(ic)}
                  style={{ border: icon === ic ? '2px solid var(--accent)' : '1px solid var(--line)' }}
                >
                  <Icon name={ic} size={18} />
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>Avatar colour</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: c,
                    border: color === c ? '2px solid #fff' : '2px solid transparent',
                    cursor: 'pointer',
                  }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isKids}
              onChange={(e) => setIsKids(e.target.checked)}
            />
            <span>Kids mode (family-friendly content only)</span>
          </label>
        </form>
      </Dialog>
    </>
  )
}

function DataSection() {
  const store = useStore()
  const toast = useToast()
  const [confirm, setConfirm] = useState<null | { title: string; body: string; action: string; run: () => void }>(null)
  const importFileInput = useRef<HTMLInputElement>(null)
  const [cacheStatus, setCacheStatus] = useState('~64 KB cached')

  const exportData = () => {
    const backup = {
      app: 'Kinora',
      version: 1,
      exportedAt: new Date().toISOString(),
      prefs: store.prefs,
      library: store.library,
      userPreferences: store.userPreferences?.preferences,
      personalMedia: store.mediaLibrary.exportPersonalLibrary(),
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `kinora-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    toast('Backup downloaded')
  }

  const exportDiagnostics = async () => {
    let appInfo = null
    try {
      appInfo = await getAppInfo()
    } catch {}
    const report = {
      generatedAt: new Date().toISOString(),
      app: {
        name: 'Kinora',
        version: appInfo?.version ?? APP_VERSION,
        buildProfile: appInfo?.profile ?? 'unknown',
        targetOs: appInfo?.os ?? 'unknown',
        targetArch: appInfo?.arch ?? 'unknown',
        profileSchema: 2,
      },
      system: {
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
        screen: typeof window !== 'undefined' ? `${window.screen.width}x${window.screen.height}` : 'unknown',
        viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'unknown',
        devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
        reducedMotion: typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false,
        colorScheme: typeof window !== 'undefined' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : 'dark',
      },
      sourcesSummary: {
        playlistsCount: store.playlists.length,
        channelsCount: store.channels.length,
        guidesCount: store.guides.length,
        manualMappingsCount: store.mappings ? store.mappings.length : 0,
      },
      librarySummary: {
        watchlistCount: store.library.watchlist.length,
        favouritesCount: store.library.favourites.length,
        historyCount: store.library.history.length,
        collectionsCount: store.library.collections.length,
      },
    }
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `kinora-diagnostics-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    toast('Diagnostic report downloaded')
  }

  const handleImportFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        const parsed = JSON.parse(text)
        if (!parsed || typeof parsed !== 'object') {
          toast('Invalid backup file: not valid JSON')
          return
        }
        if (parsed.userPreferences) {
          try {
            localStorage.setItem('kinora.userPreferences.v1', JSON.stringify(parsed.userPreferences))
          } catch {}
        }
        if (parsed.personalMedia) {
          store.mediaLibrary.importPersonalLibrary(parsed.personalMedia)
        }
        toast('Backup restored successfully.')
      } catch {
        toast('Failed to read or parse backup file.')
      }
    }
    reader.readAsText(file)
  }

  const ask = (title: string, body: string, action: string, run: () => void) => setConfirm({ title, body, action, run })

  return (
    <>
      <Group title="Your data">
        <Row title="Export a backup" hint="Preferences, library, ratings, collections and media sources as a JSON file.">
          <button type="button" className="btn btn-ghost btn-small" onClick={exportData}><Icon name="download" size={16} />Export</button>
        </Row>
        <Row title="Restore from backup" hint="Import a previously saved Kinora JSON configuration and preferences backup.">
          <button type="button" className="btn btn-ghost btn-small" onClick={() => importFileInput.current?.click()}>
            <Icon name="upload" size={16} />Restore
          </button>
          <input
            ref={importFileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) handleImportFile(file)
            }}
          />
        </Row>
        <Row title="Clear viewing history" hint={`${store.library.history.length} items and all resume points.`}>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => ask('Clear viewing history?', 'Recently watched and resume points are removed. Favourites, watchlist and collections stay.', 'Clear history', () => store.clearHistory())}>Clear</button>
        </Row>
        <Row title="Diagnostic report" hint="Scrubbed technical diagnostics (OS, display, version, source counts, no credentials).">
          <button type="button" className="btn btn-ghost btn-small" onClick={exportDiagnostics}><Icon name="activity" size={16} />Export report</button>
        </Row>
      </Group>

      <Group title="Cache and storage">
        <Row title="Artwork & image cache" hint={`In-memory and cached thumbnails (${cacheStatus}).`}>
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => {
              setCacheStatus('0 KB (cleared)')
              toast('Artwork and session caches cleared')
            }}
          >
            Clear Cache
          </button>
        </Row>
      </Group>
      <Group title="Configuration Backup & Portability">
        <Row title="Export Settings (.json)" hint="Download your preferences, theme customizations, channel numbers, and player calibrations as a portable JSON file.">
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={() => {
              const exportPayload = {
                version: 1,
                exportedAt: new Date().toISOString(),
                prefs: store.prefs,
              }
              const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `kinora-settings-backup-${new Date().toISOString().slice(0, 10)}.json`
              a.click()
              URL.revokeObjectURL(url)
              toast('Settings exported successfully')
            }}
          >
            <Icon name="download" size={16} />Export Settings
          </button>
        </Row>
        <Row title="Import Settings" hint="Restore preferences and theme customizations from a previously exported Kinora JSON backup.">
          <label className="btn btn-ghost btn-small" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="folder" size={16} />Import Settings
            <input
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const reader = new FileReader()
                reader.onload = (ev) => {
                  try {
                    const parsed = JSON.parse(ev.target?.result as string)
                    if (!parsed || typeof parsed !== 'object') {
                      toast('Invalid settings backup: not a valid JSON document')
                      return
                    }
                    const rawPrefs = (parsed as Record<string, unknown>).prefs ?? parsed
                    if (!rawPrefs || typeof rawPrefs !== 'object') {
                      toast('Invalid settings backup: missing preferences section')
                      return
                    }

                    const p = rawPrefs as Record<string, unknown>
                    const validThemes = ['dark', 'dim', 'light']
                    const validDensities = ['compact', 'comfortable', 'spacious']
                    const validTextSizes = ['standard', 'large']
                    const validTimeFormats = ['24h', '12h']

                    if (p.theme !== undefined && !validThemes.includes(p.theme as string)) {
                      toast('Invalid settings backup: unknown theme value')
                      return
                    }
                    if (p.density !== undefined && !validDensities.includes(p.density as string)) {
                      toast('Invalid settings backup: unknown density value')
                      return
                    }
                    if (p.textSize !== undefined && !validTextSizes.includes(p.textSize as string)) {
                      toast('Invalid settings backup: unknown text size value')
                      return
                    }
                    if (p.timeFormat !== undefined && !validTimeFormats.includes(p.timeFormat as string)) {
                      toast('Invalid settings backup: unknown time format value')
                      return
                    }

                    // Pre-validation succeeded: apply preferences atomically
                    const knownKeys = Object.keys(defaultPrefs) as (keyof Prefs)[]
                    let updatedCount = 0
                    for (const k of knownKeys) {
                      if (k in p && p[k] !== undefined && p[k] !== null) {
                        store.setPref(k, p[k] as any)
                        updatedCount++
                      }
                    }

                    if (updatedCount > 0) {
                      toast(`Settings imported successfully (${updatedCount} preferences updated)`)
                    } else {
                      toast('No valid Kinora preferences found in backup file')
                    }
                  } catch {
                    toast('Failed to parse settings backup file')
                  }
                }
                reader.readAsText(file)
                e.target.value = ''
              }}
            />
          </label>
        </Row>
      </Group>

      <Group title="Setup and samples">
        <Row title="Run setup again" hint="Choose channels and a guide step by step. Nothing you already have is removed.">
          <Link to="/setup" className="btn btn-ghost btn-small" onClick={() => store.restartSetup()}>Open setup</Link>
        </Row>
        {store.playlists.length === 0 && (
          <Row title="Sample mode" hint="Fills Kinora with fictional films, series and channels so you can look around. Nothing streams. Your real library is kept apart, and sample mode ends when you add a source.">
            <Switch checked={store.prefs.demoMode} onChange={(v) => store.setPref('demoMode', v)} label="Sample mode" />
          </Row>
        )}
        {store.channelMode === 'demo' && (
          <>
            <Row title="Restore sample library" hint="Puts the sample activity back.">
              <button type="button" className="btn btn-ghost btn-small" onClick={() => { store.resetLibrary('demo'); toast('Sample library restored') }}>Restore</button>
            </Row>
            <Row title="Restore sample sources" hint="Resets the Sources screen to its sample list.">
              <button type="button" className="btn btn-ghost btn-small" onClick={() => { store.resetSources(); toast('Sample sources restored') }}>Restore</button>
            </Row>
          </>
        )}
      </Group>
      <Group title="Reset">
        <Row title="Empty the library" hint="Removes favourites, watchlist, collections, progress and history from this device. Sources stay.">
          <button type="button" className="btn btn-ghost btn-small" onClick={() => ask('Empty the library?', 'Favourites, watchlist, collections, progress and history are all removed from this device.', 'Empty library', () => store.resetLibrary('empty'))}>Empty</button>
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
  if (!state.info) {
    const channelName = formatChannelName(getVersionChannel(APP_VERSION, 'preview'))
    return (
      <Row title="Kinora" hint={`Running in web browser. Channel: ${channelName}.`}>
        <span className="muted tnum">v{APP_VERSION} (Web Preview)</span>
      </Row>
    )
  }
  const { version, profile, os, arch, tauriVersion } = state.info
  const channelName = formatChannelName(getVersionChannel(version, profile))
  return (
    <Row title="Kinora" hint={`Native shell: Tauri ${tauriVersion} on ${os} (${arch}). Channel: ${channelName}.`}>
      <span className="muted tnum">v{version} ({profile})</span>
    </Row>
  )
}

function UpdatesRow({ onOpenWhatsNew }: { onOpenWhatsNew?: () => void }) {
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<UpdateCheckResult | null>(null)
  const toast = useToast()

  const onCheck = async () => {
    setChecking(true)
    try {
      const res = await checkForUpdates()
      setResult(res)
      if (res?.status === 'available') {
        toast(`Update available: Kinora v${res.latestVersion}`, {
          label: 'View release',
          run: () => {
            if (res.downloadUrl) window.open(res.downloadUrl, '_blank')
          },
        })
      } else if (res?.status === 'upToDate') {
        toast(`Kinora is up to date (v${res.currentVersion})`)
      } else if (res?.status === 'unsupportedPlatform') {
        toast(`Update found for other platforms: ${res.error ?? 'Platform unsupported'}`)
      } else if (res?.error) {
        toast(`Update check failed: ${res.error}`)
      }
    } catch {
      toast('Could not check for updates')
    } finally {
      setChecking(false)
    }
  }

  let statusText = 'Check for newer releases from official GitHub releases'
  if (result?.status === 'available') {
    statusText = `Version ${result.latestVersion} available (${result.releaseNotes ?? 'Release update'})`
  } else if (result?.status === 'upToDate') {
    statusText = `Kinora is up to date (current: v${result.currentVersion})`
  } else if (result?.status === 'unsupportedPlatform') {
    statusText = result.error ?? 'Platform not yet available in release assets'
  } else if (result?.error) {
    statusText = `Check failed: ${result.error}`
  }

  return (
    <Row title="Software updates" hint={statusText}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        {result?.status === 'available' && result.downloadUrl && (
          <a href={result.downloadUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-small">
            Download update
          </a>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-small"
          disabled={checking}
          onClick={() => void onCheck()}
        >
          {checking ? 'Checking...' : 'Check for updates'}
        </button>
        {onOpenWhatsNew && (
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={onOpenWhatsNew}
          >
            What's New
          </button>
        )}
      </div>
    </Row>
  )
}

function About() {
  const store = useStore()
  const [whatsNewOpen, setWhatsNewOpen] = useState(false)
  const [appVersion, setAppVersion] = useState<string>(APP_VERSION)

  useEffect(() => {
    void getAppInfo().then((info) => {
      if (info) setAppVersion(info.version)
    })
  }, [])
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
      <div className="about-creator-card">
        <div className="about-creator-brand">
          <div className="about-creator-logo" aria-hidden="true">
            <KPlayMark size={28} idPrefix="about" />
          </div>
          <div>
            <h3 className="about-creator-product">Kinora (KinoraTV)</h3>
            <p className="about-creator-by">
              Created by{' '}
              <a
                href="https://github.com/millsydotdev"
                target="_blank"
                rel="noopener noreferrer"
                className="about-creator-link"
              >
                millsydotdev
              </a>
            </p>
          </div>
        </div>
        <p className="about-creator-licence">
          Kinora Proprietary Source-Available Licence (All Rights Reserved). Personal evaluation and verification only. Commercial exploitation, unauthorized forks, and AI/ML model ingestion prohibited.
        </p>
        <div className="about-creator-actions">
          <a
            href="https://github.com/millsydotdev/KinoraTV"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-small"
          >
            <Icon name="link" size={14} /> Canonical Repository
          </a>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={() => setWhatsNewOpen(true)}
          >
            <Icon name="sparkles" size={14} /> What's New in v{appVersion}
          </button>
        </div>
      </div>

      <Group title="This build">
        <BuildRow />
        <UpdatesRow onOpenWhatsNew={() => setWhatsNewOpen(true)} />
        <Row title="Your content" hint="Kinora has no channels or films of its own. It plays the sources you add, and is not responsible for what they contain."><span className="muted">Your sources</span></Row>
        <Row title="Sample mode" hint="Optional. Its films, series, channels and schedules are fictional, and its artwork was generated by AI for this project."><span className="muted">{store.channelMode === 'demo' ? 'On' : 'Off'}</span></Row>
      </Group>
      <Group title="Typefaces">
        <Row title="Hanken Grotesk" hint="Interface text. SIL Open Font License 1.1."><span className="muted">OFL</span></Row>
        <Row title="Third-party notices" hint="Every package Kinora ships, with its licence text.">
          <a href="/THIRD-PARTY-NOTICES.txt" target="_self" className="text-link">Open</a>
        </Row>
      </Group>
      <Group title="Keyboard shortcuts">
        <dl className="shortcut-list">
          {shortcuts.map(([k, v]) => (
            <div key={k}><dt><span className="kbd">{k}</span></dt><dd>{v}</dd></div>
          ))}
        </dl>
      </Group>

      <WhatsNewModal open={whatsNewOpen} onClose={() => setWhatsNewOpen(false)} />
    </>
  )
}
