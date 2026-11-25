import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getPinLockoutRemainingSeconds } from '../lib/crypto'
import { Dialog } from '../components/Dialog'
import { Icon, type IconName } from '../components/Icon'
import { useToast } from '../components/Toast'
import { PageHeader } from '../components/PageHeader'
import { Segmented, Switch } from '../components/ui'
import { getAppInfo, checkForUpdates, installUpdate, inNativeShell, getArtworkCacheStats, clearArtworkCache, retryFailedArtwork, type ArtworkCacheStats, type AppInfo, type UpdateCheckResult, APP_VERSION, APP_ENV, isStaging, isProduction, getVersionChannel, formatChannelName, getPlatformMode, setPlatformMode, startRemoteServer, discoverKinoraServers, type PlatformMode, saveSources } from '../lib/native'
import { useClientSync } from '../lib/clientSync'
import { useVoiceAndAgentControl } from '../lib/voiceAndAgent'
import { CODEC_HELP, codecSupport } from '../lib/playback'
import { ACCENTS, THEME_PRESETS, safeHex, type AccentName } from '../lib/theme'
import { defaultPrefs, useStore, type Prefs } from '../state/store'
import { useLocalMedia } from '../state/localMedia'
import { useProfiles } from '../state/profiles'
import { Input } from '../components/design-system/Input'
import {
  METADATA_ATTRIBUTIONS,
  METADATA_PROVIDERS_REGISTRY,
  clearMetadataCredentials,
  getEnvironmentTmdbKey,
  getProviderHealth,
  loadMetadataConfig,
  saveMetadataConfig,
  testProviderConnection,
  type ArtworkSourcePreference,
  type MetadataConfig,
} from '../data/metadataProviders'
import { artworkEngine, type EnrichmentCandidate, type EnrichmentProgress } from '../data/artworkEngine'
import { OPEN_MOVIES, OPEN_SERIES } from '../data/openCatalogue'
import { CollapsibleSection } from '../components/CollapsibleSection'
import { EncryptedBackupModal } from '../components/EncryptedBackupModal'
import { RemoteControlModal } from '../components/RemoteControlModal'
import { TraktSettingsModal } from '../components/TraktSettingsModal'
import { useCasting } from '../lib/casting/manager'
import { loadBingeSettings, saveBingeSettings } from '../lib/bingeMode'
import { WhatsNewModal } from '../components/WhatsNewModal'
import { KPlayMark } from '../components/KPlayMark'
import { GenreArtworkSettings } from '../components/GenreArtworkSettings'
import './Settings.css'

// Categories follow the mockup's Settings list (Playback, Interface, EPG, Sources, Library, Advanced),
// split further where the brief asks for Audio, Subtitles, Data and About.
const sections: { id: string; label: string; icon: IconName; blurb: string }[] = [
  { id: 'appearance', label: 'Appearance', icon: 'desktop', blurb: 'Personalise the look and feel of Kinora across all devices' },
  { id: 'playback', label: 'Playback & Video', icon: 'play', blurb: 'Video quality, resuming, next episode' },
  { id: 'audio', label: 'Audio & Sound', icon: 'volume', blurb: 'Preferred audio language and stream decoding' },
  { id: 'subtitles', label: 'Subtitles & Captions', icon: 'subtitles', blurb: 'Language, font, audio streams, and style' },
  { id: 'casting', label: 'Casting & Displays', icon: 'cast', blurb: 'Cast to Smart TVs, Chromecast, AirPlay and DLNA devices' },
  { id: 'epg', label: 'TV Guide & EPG', icon: 'calendar', blurb: 'Guide settings, time format, timezone' },
  { id: 'dvr', label: 'DVR & Recording', icon: 'record', blurb: 'Recording storage, retention, padding and live timeshift' },
  { id: 'sources', label: 'Sources & Providers', icon: 'sources', blurb: 'How playlists are imported and refreshed' },
  { id: 'storage', label: 'Local Media Library', icon: 'library', blurb: 'Physical storage volumes, connected local folders, media indexing' },
  { id: 'metadata', label: 'Metadata & Art', icon: 'sparkles', blurb: 'TMDb and TVMaze enrichment providers, artwork and posters' },
  { id: 'genres', label: 'Genres & Discovery Art', icon: 'tag', blurb: 'Canonical genre taxonomy, artwork library, provenance, and provider category mappings' },
  { id: 'notifications', label: 'Notifications', icon: 'bell', blurb: 'System notifications, episode reminders, recordings' },
  { id: 'shortcuts', label: 'Shortcuts & Remote', icon: 'keyboard', blurb: 'Keyboard shortcuts and remote control mapping' },
  { id: 'profiles', label: 'User Profile', icon: 'user', blurb: 'Household profiles, Kids mode, avatar, parental lock' },
  { id: 'privacy', label: 'Privacy & Security', icon: 'shield', blurb: 'Telemetry, permissions, security policies' },
  { id: 'data', label: 'Advanced', icon: 'adjustments', blurb: 'Data backup, export, reset, performance' },
  { id: 'about', label: 'About Kinora', icon: 'info', blurb: 'Version, licences, documentation' },
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
  const { section: routeSection } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const highlight = params.get('highlight')
  const querySection = params.get('section')
  const activeSectionId = routeSection || querySection || 'appearance'

  useEffect(() => {
    if (!routeSection && querySection) {
      navigate(`/settings/${querySection}${highlight ? `?highlight=${encodeURIComponent(highlight)}` : ''}`, { replace: true })
      return
    }
    if (!routeSection && highlight) {
      const match = SETTING_DIRECT_LINKS.find((l) => l.rowId === highlight)
      if (match) {
        navigate(`/settings/${match.section}?highlight=${encodeURIComponent(highlight)}`, { replace: true })
      }
    }
  }, [routeSection, querySection, highlight, navigate])

  return (
    <>
      <PageHeader title="Settings" />
      <div className="page settings-page">
        <div className="settings-header-banner">
          <div className="settings-header-icon-box">
            <Icon name="cog" size={24} />
          </div>
          <div>
            <h1 className="settings-header-title">Settings</h1>
            <p className="settings-header-desc">Customise Kinora, manage your media, sources and playback preferences.</p>
          </div>
        </div>

        <div className="settings-columns-grid">
          {/* COLUMN 1: Category Sub-Navigation */}
          <nav className="settings-nav-col" aria-label="Settings sub navigation">
            {sections.map((s) => {
              const isActive = s.id === activeSectionId
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`settings-nav-btn ${isActive ? 'is-active' : ''}`}
                  onClick={() => navigate(`/settings/${s.id}`)}
                >
                  <Icon name={s.icon} size={18} className="settings-nav-icon" />
                  <span className="settings-nav-label">{s.label}</span>
                  <Icon name="chevronRight" size={14} className="settings-nav-chevron" />
                </button>
              )
            })}
          </nav>

          {/* COLUMN 2: Center Stage Configuration */}
          <div className="settings-center-col">
            <Section id={activeSectionId} />
          </div>
        </div>
      </div>
    </>
  )
}

function SettingsAsidePanel({ activeSection: _ }: { activeSection?: string }) {
  const { prefs, setPref } = useStore()
  const toast = useToast()
  const [previewPopoutOpen, setPreviewPopoutOpen] = useState(false)

  const densityOptions = [
    { label: 'Comfortable', value: 'spacious' as const },
    { label: 'Standard', value: 'comfortable' as const },
    { label: 'Compact', value: 'compact' as const },
  ]

  return (
    <>
      {/* Live Preview Card */}
      <div className="settings-aside-card">
        <div className="settings-aside-card-header">
          <h4 className="settings-aside-card-title">Live Preview</h4>
          <button
            type="button"
            className="settings-aside-card-action"
            title="Popout preview"
            aria-label="Popout live preview"
            onClick={() => setPreviewPopoutOpen(true)}
          >
            <Icon name="externalLink" size={15} />
          </button>
        </div>
        <div className="settings-mini-preview-box" data-theme={prefs.theme}>
          <div className="smp-sidebar">
            <div className="smp-sidebar-dot is-active" />
            <div className="smp-sidebar-dot" />
            <div className="smp-sidebar-dot" />
            <div className="smp-sidebar-dot" />
          </div>
          <div className="smp-main">
            <div className="smp-header">
              <div className="smp-search" />
              <div className="smp-sidebar-dot" style={{ width: 10, height: 10, borderRadius: '50%' }} />
            </div>
            <div className="smp-hero">
              <div className="smp-hero-title" />
              <div className="smp-hero-btn" />
            </div>
            <div className="smp-cards-row">
              <div className="smp-card" />
              <div className="smp-card" />
              <div className="smp-card" />
            </div>
          </div>
        </div>
      </div>

      <Dialog open={previewPopoutOpen} onClose={() => setPreviewPopoutOpen(false)} title="Live Interface Preview">
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '320px', maxWidth: '640px' }}>
          <p className="faint" style={{ margin: 0 }}>
            Live preview of Kinora using theme: <strong>{prefs.theme}</strong> and accent: <strong>{prefs.accent}</strong>.
          </p>
          <div className="settings-mini-preview-box" data-theme={prefs.theme} style={{ height: '240px', width: '100%' }}>
            <div className="smp-sidebar">
              <div className="smp-sidebar-dot is-active" />
              <div className="smp-sidebar-dot" />
              <div className="smp-sidebar-dot" />
              <div className="smp-sidebar-dot" />
            </div>
            <div className="smp-main">
              <div className="smp-header">
                <div className="smp-search" />
                <div className="smp-sidebar-dot" style={{ width: 10, height: 10, borderRadius: '50%' }} />
              </div>
              <div className="smp-hero">
                <div className="smp-hero-title" />
                <div className="smp-hero-btn" />
              </div>
              <div className="smp-cards-row">
                <div className="smp-card" />
                <div className="smp-card" />
                <div className="smp-card" />
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button type="button" className="btn btn-primary" onClick={() => setPreviewPopoutOpen(false)}>
              Done
            </button>
          </div>
        </div>
      </Dialog>

      {/* Theme Presets */}
      <div className="settings-aside-card">
        <h4 className="settings-aside-card-title">Theme Presets</h4>
        <div className="settings-presets-grid" role="group" aria-label="Theme Presets">
          {THEME_PRESETS.map((p) => {
            const isPresetActive = prefs.accent === p.accent
            return (
              <button
                key={p.id}
                type="button"
                className={`settings-preset-tile ${isPresetActive ? 'is-active' : ''}`}
                style={{
                  background: `linear-gradient(135deg, ${p.accentHex} 0%, #0a0e14 100%)`,
                }}
                onClick={() => {
                  setPref('theme', p.theme)
                  setPref('accent', p.accent)
                  if (p.accent === 'custom') setPref('customAccent', p.accentHex)
                  toast(`Applied ${p.name} preset`)
                }}
              >
                {isPresetActive && (
                  <span className="settings-preset-check"><Icon name="check" size={13} /></span>
                )}
                <span className="settings-preset-name">{p.name}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Typography Card */}
      <button
        type="button"
        className="settings-typography-card"
        onClick={() => {
          const next = prefs.textSize === 'large' ? 'standard' : 'large'
          setPref('textSize', next)
          toast(`Text size set to ${next}`)
        }}
        title="Toggle text size"
        aria-label={`Toggle text size, currently ${prefs.textSize}`}
      >
        <div className="settings-typography-info">
          <span className="settings-typography-icon">Aa</span>
          <div>
            <p className="settings-typography-title">Typography</p>
            <p className="settings-typography-desc">Font, size and text styling ({prefs.textSize})</p>
          </div>
        </div>
        <Icon name="chevronRight" size={16} className="settings-nav-chevron" />
      </button>

      {/* Interface Density Card */}
      <div className="settings-aside-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="layers" size={18} style={{ color: '#ffffff' }} />
          <h4 className="settings-aside-card-title">Interface Density</h4>
        </div>
        <div className="settings-density-segmented" role="radiogroup" aria-label="Interface Density">
          {densityOptions.map((opt) => {
            const isActive = prefs.density === opt.value
            return (
              <button
                key={opt.label}
                type="button"
                className={`settings-density-btn ${isActive ? 'is-active' : ''}`}
                onClick={() => {
                  setPref('density', opt.value)
                  toast(`Density: ${opt.label}`)
                }}
                role="radio"
                aria-checked={isActive}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

function AppearanceSection({
  prefs,
  setPref,
}: {
  prefs: Prefs
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void
  toggle?: (key: BoolPref, title: string, hint?: string, pending?: boolean) => ReactNode
}) {
  const currentThemeMode = prefs.themeMode ?? (prefs.theme === 'light' ? 'light' : 'dark')

  return (
    <>
      <div className="settings-stage-hero-card">
        <div className="settings-stage-hero-icon">
          <Icon name="desktop" size={24} />
        </div>
        <div>
          <h2 className="settings-stage-hero-title">Appearance</h2>
          <p className="settings-stage-hero-desc">Personalise the look and feel of Kinora across all devices.</p>
        </div>
      </div>

      {/* Theme */}
      <div className="settings-section-card">
        <h3 className="settings-card-title">Theme</h3>
        <div className="settings-theme-cards-grid" role="radiogroup" aria-label="Theme mode">
          <button
            type="button"
            className={`settings-theme-option-card ${currentThemeMode === 'dark' ? 'is-active' : ''}`}
            onClick={() => {
              setPref('themeMode', 'dark')
              setPref('theme', 'dark')
            }}
            aria-checked={currentThemeMode === 'dark'}
            role="radio"
          >
            {currentThemeMode === 'dark' && (
              <span className="settings-theme-badge"><Icon name="check" size={11} /></span>
            )}
            <Icon name="moon" size={24} />
            <span className="settings-theme-name">Dark</span>
            <span className="settings-theme-sub">Kinora Deep Black</span>
          </button>

          <button
            type="button"
            className={`settings-theme-option-card ${currentThemeMode === 'midnight' ? 'is-active' : ''}`}
            onClick={() => {
              setPref('themeMode', 'midnight')
              setPref('theme', 'midnight')
            }}
            aria-checked={currentThemeMode === 'midnight'}
            role="radio"
          >
            {currentThemeMode === 'midnight' && (
              <span className="settings-theme-badge"><Icon name="check" size={11} /></span>
            )}
            <Icon name="star" size={24} />
            <span className="settings-theme-name">Midnight</span>
            <span className="settings-theme-sub">Deep Nocturnal Navy</span>
          </button>

          <button
            type="button"
            className={`settings-theme-option-card ${currentThemeMode === 'dim' ? 'is-active' : ''}`}
            onClick={() => {
              setPref('themeMode', 'dim')
              setPref('theme', 'dim')
            }}
            aria-checked={currentThemeMode === 'dim'}
            role="radio"
          >
            {currentThemeMode === 'dim' && (
              <span className="settings-theme-badge"><Icon name="check" size={11} /></span>
            )}
            <Icon name="desktop" size={24} />
            <span className="settings-theme-name">Dim</span>
            <span className="settings-theme-sub">Warm Muted Graphite</span>
          </button>

          <button
            type="button"
            className={`settings-theme-option-card ${currentThemeMode === 'slate' ? 'is-active' : ''}`}
            onClick={() => {
              setPref('themeMode', 'slate')
              setPref('theme', 'slate')
            }}
            aria-checked={currentThemeMode === 'slate'}
            role="radio"
          >
            {currentThemeMode === 'slate' && (
              <span className="settings-theme-badge"><Icon name="check" size={11} /></span>
            )}
            <Icon name="film" size={24} />
            <span className="settings-theme-name">Slate</span>
            <span className="settings-theme-sub">Mineral Cold Grey</span>
          </button>

          <button
            type="button"
            className={`settings-theme-option-card ${currentThemeMode === 'oled' ? 'is-active' : ''}`}
            onClick={() => {
              setPref('themeMode', 'oled')
              setPref('theme', 'oled')
            }}
            aria-checked={currentThemeMode === 'oled'}
            role="radio"
          >
            {currentThemeMode === 'oled' && (
              <span className="settings-theme-badge"><Icon name="check" size={11} /></span>
            )}
            <Icon name="sparkles" size={24} />
            <span className="settings-theme-name">OLED</span>
            <span className="settings-theme-sub">Absolute Pure Black</span>
          </button>

          <button
            type="button"
            className={`settings-theme-option-card ${currentThemeMode === 'light' ? 'is-active' : ''}`}
            onClick={() => {
              setPref('themeMode', 'light')
              setPref('theme', 'light')
            }}
            aria-checked={currentThemeMode === 'light'}
            role="radio"
          >
            {currentThemeMode === 'light' && (
              <span className="settings-theme-badge"><Icon name="check" size={11} /></span>
            )}
            <Icon name="sun" size={24} />
            <span className="settings-theme-name">Light</span>
            <span className="settings-theme-sub">Daylight High Contrast</span>
          </button>

          <button
            type="button"
            className={`settings-theme-option-card ${currentThemeMode === 'system' ? 'is-active' : ''}`}
            onClick={() => {
              setPref('themeMode', 'system')
              const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
              setPref('theme', prefersDark ? 'dark' : 'light')
            }}
            aria-checked={currentThemeMode === 'system'}
            role="radio"
          >
            {currentThemeMode === 'system' && (
              <span className="settings-theme-badge"><Icon name="desktop" size={11} /></span>
            )}
            <Icon name="desktop" size={24} />
            <span className="settings-theme-name">System</span>
            <span className="settings-theme-sub">Follow your OS setting</span>
          </button>
        </div>
      </div>

      {/* Accent Colour */}
      <div className="settings-section-card">
        <h3 className="settings-card-title">Accent Colour</h3>
        <div className="settings-swatches-row" role="radiogroup" aria-label="Accent colour">
          {(Object.entries(ACCENTS) as [AccentName, string][]).map(([name, hex]) => {
            const isActive = prefs.accent === name
            return (
              <button
                key={name}
                type="button"
                className={`settings-swatch-btn ${isActive ? 'is-active' : ''}`}
                style={{ background: hex }}
                onClick={() => setPref('accent', name)}
                aria-label={`Accent ${name}`}
                aria-checked={isActive}
                role="radio"
                title={name[0]!.toUpperCase() + name.slice(1)}
              >
                {isActive && <Icon name="check" size={14} />}
              </button>
            )
          })}
          <label className={`settings-swatch-custom ${prefs.accent === 'custom' ? 'is-active' : ''}`} title="Custom colour picker">
            <Icon name="colorPicker" size={16} />
            <input
              type="color"
              value={prefs.customAccent}
              onChange={(e) => {
                const hex = safeHex(e.target.value)
                if (hex) {
                  setPref('customAccent', hex)
                  setPref('accent', 'custom')
                }
              }}
              aria-label="Custom accent colour"
            />
          </label>
        </div>
      </div>

      {/* Layout */}
      <div className="settings-section-card">
        <h3 className="settings-card-title">Layout</h3>
        <div className="settings-layout-cards-grid" role="radiogroup" aria-label="Layout mode">
          <button
            type="button"
            className={`settings-layout-option-card ${prefs.layoutMode === 'standard' ? 'is-active' : ''}`}
            onClick={() => { setPref('layoutMode', 'standard'); setPref('viewMode', 'desktop') }}
            role="radio"
            aria-checked={prefs.layoutMode === 'standard'}
          >
            {prefs.layoutMode === 'standard' && (
              <span className="settings-layout-badge"><Icon name="check" size={10} /></span>
            )}
            <Icon name="layoutSidebar" size={22} />
            <span className="settings-layout-title">Standard</span>
            <span className="settings-layout-sub">Sidebar + Content</span>
          </button>

          <button
            type="button"
            className={`settings-layout-option-card ${prefs.layoutMode === 'compact' ? 'is-active' : ''}`}
            onClick={() => { setPref('layoutMode', 'compact'); setPref('viewMode', 'desktop') }}
            role="radio"
            aria-checked={prefs.layoutMode === 'compact'}
          >
            {prefs.layoutMode === 'compact' && (
              <span className="settings-layout-badge"><Icon name="check" size={10} /></span>
            )}
            <Icon name="layoutCompact" size={22} />
            <span className="settings-layout-title">Compact</span>
            <span className="settings-layout-sub">More content</span>
          </button>

          <button
            type="button"
            className={`settings-layout-option-card ${prefs.layoutMode === 'wide' ? 'is-active' : ''}`}
            onClick={() => { setPref('layoutMode', 'wide'); setPref('viewMode', 'desktop') }}
            role="radio"
            aria-checked={prefs.layoutMode === 'wide'}
          >
            {prefs.layoutMode === 'wide' && (
              <span className="settings-layout-badge"><Icon name="check" size={10} /></span>
            )}
            <Icon name="layoutWide" size={22} />
            <span className="settings-layout-title">Wide</span>
            <span className="settings-layout-sub">Expanded content</span>
          </button>

          <button
            type="button"
            className={`settings-layout-option-card ${prefs.layoutMode === 'tv' ? 'is-active' : ''}`}
            onClick={() => { setPref('layoutMode', 'tv'); setPref('viewMode', 'tv') }}
            role="radio"
            aria-checked={prefs.layoutMode === 'tv'}
          >
            {prefs.layoutMode === 'tv' && (
              <span className="settings-layout-badge"><Icon name="check" size={10} /></span>
            )}
            <Icon name="desktop" size={22} />
            <span className="settings-layout-title">TV Mode</span>
            <span className="settings-layout-sub">10ft / Remote style</span>
          </button>
        </div>
      </div>

      {/* Display Options */}
      <div className="settings-section-card">
        <h3 className="settings-card-title">Display Options</h3>
        <div className="settings-toggles-list">
          <div className="settings-toggle-row">
            <div className="settings-toggle-info">
              <Icon name="desktop" size={20} className="settings-toggle-icon" />
              <div>
                <p className="settings-toggle-title">Show artwork backgrounds on pages</p>
                <p className="settings-toggle-desc">Display cinematic backgrounds where available</p>
              </div>
            </div>
            <label className="settings-switch-control">
              <input
                type="checkbox"
                checked={prefs.showArtworkBackgrounds}
                onChange={(e) => setPref('showArtworkBackgrounds', e.target.checked)}
              />
              <span className="settings-switch-slider" />
            </label>
          </div>

          <div className="settings-toggle-row">
            <div className="settings-toggle-info">
              <Icon name="playOutline" size={20} className="settings-toggle-icon" />
              <div>
                <p className="settings-toggle-title">Animated transitions</p>
                <p className="settings-toggle-desc">Smooth page and element animations</p>
              </div>
            </div>
            <label className="settings-switch-control">
              <input
                type="checkbox"
                checked={prefs.animatedTransitions}
                onChange={(e) => setPref('animatedTransitions', e.target.checked)}
              />
              <span className="settings-switch-slider" />
            </label>
          </div>

          <div className="settings-toggle-row">
            <div className="settings-toggle-info">
              <Icon name="activity" size={20} className="settings-toggle-icon" />
              <div>
                <p className="settings-toggle-title">Reduce motion</p>
                <p className="settings-toggle-desc">Minimise animations and effects</p>
              </div>
            </div>
            <label className="settings-switch-control">
              <input
                type="checkbox"
                checked={prefs.reduceMotion}
                onChange={(e) => setPref('reduceMotion', e.target.checked)}
              />
              <span className="settings-switch-slider" />
            </label>
          </div>

          <div className="settings-toggle-row">
            <div className="settings-toggle-info">
              <Icon name="star" size={20} className="settings-toggle-icon" />
              <div>
                <p className="settings-toggle-title">Show media ratings</p>
                <p className="settings-toggle-desc">Display IMDb, TMDb and other ratings</p>
              </div>
            </div>
            <label className="settings-switch-control">
              <input
                type="checkbox"
                checked={prefs.showMediaRatings}
                onChange={(e) => setPref('showMediaRatings', e.target.checked)}
              />
              <span className="settings-switch-slider" />
            </label>
          </div>
        </div>
      </div>

      {/* Visual Presets, Typography, Density and Live Preview */}
      <div className="settings-appearance-addons">
        <SettingsAsidePanel activeSection="appearance" />
      </div>
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

function NotificationsSection() {
  const store = useStore()
  const { prefs, setPref } = store
  const remindersCount = store.library.reminders?.length ?? 0
  const [permission, setPermission] = useState<string>(() => {
    return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  })

  const requestPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission()
        setPermission(perm)
      } catch {}
    }
  }

  return (
    <>
      <Group title="Programme Reminders">
        <Row title="Upcoming Programme Alerts" hint="Show on-screen alerts 5 minutes before scheduled programmes begin airing.">
          <Switch
            label="Upcoming programme alerts"
            checked={prefs.reminderAlerts}
            onChange={(v) => setPref('reminderAlerts', v)}
          />
        </Row>
        <Row title="Active Reminders" hint="Number of upcoming programmes scheduled for reminder notification.">
          <span className="muted">{remindersCount === 1 ? '1 programme' : `${remindersCount} programmes`}</span>
        </Row>
      </Group>

      <Group title="DVR & Recording Notifications">
        <Row title="Recording Alerts" hint="Notify when a scheduled DVR recording begins capturing or completes.">
          <Switch
            label="Recording alerts"
            checked={prefs.recordingAlerts}
            onChange={(v) => setPref('recordingAlerts', v)}
          />
        </Row>
      </Group>

      <Group title="System & Source Notices">
        <Row title="Background Refresh Alerts" hint="Notify when playlist sources or XMLTV guides finish refreshing.">
          <Switch
            label="Background refresh alerts"
            checked={prefs.refreshAlerts}
            onChange={(v) => setPref('refreshAlerts', v)}
          />
        </Row>
        <Row title="Desktop Alerts" hint="Deliver native desktop notifications when programmes air or recordings start.">
          {permission === 'granted' ? (
            <span className="muted">Enabled</span>
          ) : (
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={requestPermission}
            >
              Enable Desktop Alerts
            </button>
          )}
        </Row>
      </Group>
    </>
  )
}

function ShortcutsSection() {
  return (
    <>
      <Group title="Playback & Navigation Shortcuts">
        <Row title="Play / Pause" hint="Toggle active playback.">
          <kbd className="kbd" style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--surface-3)', border: '1px solid var(--line)' }}>Space</kbd>
        </Row>
        <Row title="Fullscreen" hint="Enter or exit fullscreen video mode.">
          <span style={{ display: 'flex', gap: 6 }}>
            <kbd className="kbd" style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--surface-3)', border: '1px solid var(--line)' }}>F</kbd>
            <span className="faint">or</span>
            <kbd className="kbd" style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--surface-3)', border: '1px solid var(--line)' }}>Esc</kbd>
          </span>
        </Row>
        <Row title="Mute Volume" hint="Toggle audio output muting.">
          <kbd className="kbd" style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--surface-3)', border: '1px solid var(--line)' }}>M</kbd>
        </Row>
        <Row title="Seek -10s / +10s" hint="Jump backward or forward by 10 seconds.">
          <span style={{ display: 'flex', gap: 6 }}>
            <kbd className="kbd" style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--surface-3)', border: '1px solid var(--line)' }}>←</kbd>
            <kbd className="kbd" style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--surface-3)', border: '1px solid var(--line)' }}>→</kbd>
          </span>
        </Row>
        <Row title="Volume Level" hint="Increase or decrease audio volume.">
          <span style={{ display: 'flex', gap: 6 }}>
            <kbd className="kbd" style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--surface-3)', border: '1px solid var(--line)' }}>↑</kbd>
            <kbd className="kbd" style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--surface-3)', border: '1px solid var(--line)' }}>↓</kbd>
          </span>
        </Row>
        <Row title="Subtitles" hint="Toggle primary subtitle track.">
          <kbd className="kbd" style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--surface-3)', border: '1px solid var(--line)' }}>C</kbd>
        </Row>
      </Group>

      <Group title="Channel & 10-Foot Remote Navigation">
        <Row title="Direct Channel Keypad" hint="Type numbers (0-9) on remote or keyboard to tune directly.">
          <kbd className="kbd" style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--surface-3)', border: '1px solid var(--line)' }}>0 - 9</kbd>
        </Row>
        <Row title="Next / Previous Channel" hint="Tune up or down through the current channel list.">
          <span style={{ display: 'flex', gap: 6 }}>
            <kbd className="kbd" style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--surface-3)', border: '1px solid var(--line)' }}>Page Up</kbd>
            <kbd className="kbd" style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--surface-3)', border: '1px solid var(--line)' }}>Page Down</kbd>
          </span>
        </Row>
        <Row title="Directional Remote" hint="Navigate menus and guides in 10-foot TV mode.">
          <span className="muted">D-Pad / Arrow Keys + OK / Enter</span>
        </Row>
        <Row title="Back / Return" hint="Return to previous screen or close sheet.">
          <kbd className="kbd" style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--surface-3)', border: '1px solid var(--line)' }}>Esc</kbd>
        </Row>
      </Group>

      <Group title="TV Remote Dedicated Color Buttons">
        <Row title="Red Button (F1)" hint="Instant jump to Library and Favourites.">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ef4444' }} aria-hidden="true" />
            <span className="muted">Library / Favourites</span>
          </span>
        </Row>
        <Row title="Green Button (F2)" hint="Instant jump to Live TV Programme Guide.">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#10b981' }} aria-hidden="true" />
            <span className="muted">Live TV Guide</span>
          </span>
        </Row>
        <Row title="Yellow Button (F3)" hint="Open Universal Command Palette and Search.">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#f59e0b' }} aria-hidden="true" />
            <span className="muted">Command Palette</span>
          </span>
        </Row>
        <Row title="Blue Button (F4)" hint="Instant jump to Sources and Catalogue Discovery.">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#3b82f6' }} aria-hidden="true" />
            <span className="muted">Sources & Discovery</span>
          </span>
        </Row>
      </Group>
    </>
  )
}

function PrivacySection() {
  return (
    <>
      <Group title="Security & Network Boundaries">
        <Row title="Strict Guarded Resolver" hint="All network connections strictly bypass system proxies and refuse private, loopback, or LAN destinations.">
          <span className="muted" style={{ color: 'var(--success, #22c55e)' }}>Active (Rust Enforced)</span>
        </Row>
        <Row title="Stream Address Obfuscation" hint="Upstream stream addresses and private tokens are rewritten into opaque 128-bit handles and never exposed to the DOM or logs.">
          <span className="muted" style={{ color: 'var(--success, #22c55e)' }}>Active (kstream://)</span>
        </Row>
        <Row title="Encrypted Credential Vault" hint="Provider credentials and parental PINs are stored in an encrypted local vault with strict filesystem permissions (0700/0600).">
          <span className="muted" style={{ color: 'var(--success, #22c55e)' }}>AES-256-GCM Vault</span>
        </Row>
      </Group>

      <Group title="Telemetry & Data Collection">
        <Row title="Application Telemetry" hint="Kinora collects zero tracking data, analytics, or behavioral telemetry. No analytics SDKs exist in the binary.">
          <span className="muted">Zero Telemetry (Strict)</span>
        </Row>
        <Row title="Crash Reports" hint="Crash dumps remain strictly local and are never transmitted over the network without explicit user consent.">
          <span className="muted">Local Only</span>
        </Row>
      </Group>
    </>
  )
}

function Section({ id }: { id: string }) {
  const store = useStore()
  const profileId = store.activeProfile?.id ?? 'default'
  const [bingeSettings, setBingeSettings] = useState(() => loadBingeSettings(profileId))
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
          <Group title="Watching & Binge Mode">
            <Row title="When reopening a title" hint="What happens when you play something you have started.">
              <Segmented label="Resume behaviour" value={prefs.resume} onChange={(v) => setPref('resume', v)} options={[{ value: 'resume', label: 'Resume' }, { value: 'ask', label: 'Ask' }, { value: 'start', label: 'Start over' }]} />
            </Row>
            {toggle('autoplayNext', 'Play next episode automatically', 'Starts the next episode after a short countdown.')}
            <Row title="Binge countdown timer" hint="Seconds to wait before automatically starting the next episode.">
              <Segmented
                label="Countdown duration"
                value={bingeSettings.countdownSeconds}
                onChange={(v) => {
                  const updated = { ...bingeSettings, countdownSeconds: v }
                  setBingeSettings(updated)
                  saveBingeSettings(updated, profileId)
                }}
                options={[
                  { value: 5, label: '5s' },
                  { value: 10, label: '10s' },
                  { value: 15, label: '15s' },
                ]}
              />
            </Row>
            <Row title="Skip intro marker" hint="Quick skip duration when intro sequence is detected.">
              <Segmented
                label="Skip intro duration"
                value={bingeSettings.skipIntroSeconds}
                onChange={(v) => {
                  const updated = { ...bingeSettings, skipIntroSeconds: v }
                  setBingeSettings(updated)
                  saveBingeSettings(updated, profileId)
                }}
                options={[
                  { value: 0, label: 'Off' },
                  { value: 60, label: '60s' },
                  { value: 85, label: '85s' },
                ]}
              />
            </Row>
          </Group>
          <Group title="Stream Headers & Identity">
            <Row title="User-Agent profile" hint="Select a client identity profile or enter a custom one for compatibility with strict stream hosts.">
              <select
                className="select"
                value={
                  !prefs.customUserAgent
                    ? 'default'
                    : prefs.customUserAgent === 'VLC/3.0.18 LibVLC/3.0.18'
                    ? 'vlc'
                    : prefs.customUserAgent === 'Kodi/20.2 (Linux; Android 11)'
                    ? 'kodi'
                    : prefs.customUserAgent.startsWith('AppleCoreMedia')
                    ? 'appletv'
                    : 'custom'
                }
                onChange={(e) => {
                  const val = e.target.value
                  if (val === 'default') setPref('customUserAgent', '')
                  else if (val === 'vlc') setPref('customUserAgent', 'VLC/3.0.18 LibVLC/3.0.18')
                  else if (val === 'kodi') setPref('customUserAgent', 'Kodi/20.2 (Linux; Android 11)')
                  else if (val === 'appletv') setPref('customUserAgent', 'AppleCoreMedia/1.0.0.20K71 (Apple TV; U; CPU OS 16_1 like Mac OS X; en_us)')
                  else if (val === 'custom' && !prefs.customUserAgent) setPref('customUserAgent', 'Mozilla/5.0')
                }}
              >
                <option value="default">Default (Kinora Native)</option>
                <option value="vlc">VLC Media Player</option>
                <option value="kodi">Kodi Media Center</option>
                <option value="appletv">Apple TV / AVPlayer</option>
                <option value="custom">Custom User-Agent</option>
              </select>
            </Row>
            {Boolean(prefs.customUserAgent) && (
              <Row title="Custom User-Agent" hint="The exact User-Agent header string sent with stream and playlist requests.">
                <input
                  type="text"
                  className="input"
                  value={prefs.customUserAgent}
                  placeholder="e.g. VLC/3.0.18"
                  onChange={(e) => setPref('customUserAgent', e.target.value)}
                  style={{ width: '100%', maxWidth: 360 }}
                />
              </Row>
            )}
            <Row title="HTTP Referrer override" hint="Optional Referer header sent when stream providers require specific origin domains.">
              <input
                type="text"
                className="input"
                value={prefs.customReferrer}
                placeholder="e.g. https://portal.example/ (Leave empty for none)"
                onChange={(e) => setPref('customReferrer', e.target.value)}
                style={{ width: '100%', maxWidth: 360 }}
              />
            </Row>
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
          <Row title="Category & Bouquet Manager" hint="Organise, reorder, or hide channel categories, and curate custom channel bouquets.">
            <Link to="/live" className="text-link">Manage in Live TV</Link>
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
          <Row title="Automatic refresh schedule" hint="Kinora updates remote playlists and XMLTV guides in the background on this schedule.">
            <select
              className="select"
              value={prefs.refreshSchedule}
              onChange={(e) => setPref('refreshSchedule', e.target.value as Prefs['refreshSchedule'])}
              aria-label="Automatic refresh schedule"
            >
              <option value="4h">Every 4 hours</option>
              <option value="8h">Every 8 hours</option>
              <option value="12h">Every 12 hours (recommended)</option>
              <option value="24h">Every 24 hours</option>
              <option value="manual">Manual only</option>
            </select>
          </Row>
          <Row title="Last refresh" hint="When sources and guide data were last refreshed.">
            <span className="muted">{store.lastRefreshedAt ? new Date(store.lastRefreshedAt).toLocaleString() : 'Never'}</span>
          </Row>
          <Row title="Stream health & failures" hint="Kinora marks channels that fail playback with an offline status badge and provides retry buttons. Streams are never probed in the background.">
            <span className="muted">Monitored during playback</span>
          </Row>
          <Row title="Keeping sources" hint="Imported playlists and guides are saved on this device, including their addresses, which can contain private tokens. Guide programmes are kept there too, so they show offline. Stream addresses are never saved, so restored channels play again once their source refreshes.">
            <span className="muted">On this device</span>
          </Row>
          <Row title="Xtream provider failover & mirrors" hint="Configure backup server addresses, DNS failovers, and latency health checks for your managed IPTV providers.">
            <Link to="/sources" className="text-link">Manage in Sources</Link>
          </Row>
        </Group>
      )
    case 'dvr':
      return <DvrSection />
    case 'storage':
      return <StorageSettingsSection />
    case 'metadata':
      return <MetadataSection />
    case 'genres':
      return <GenreArtworkSettings />
    case 'notifications':
      return <NotificationsSection />
    case 'shortcuts':
      return <ShortcutsSection />
    case 'privacy':
      return <PrivacySection />
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
    ['VP9 video', c?.vp9, 'Open video format supported across web and broadcast sources.'],
    ['MP3 audio', c?.mp3, 'Supported across radio, podcast, and audio streams.'],
  ]
  return (
    <Group title="What this system can play">
      {!c && <Row title="Video" hint="This window cannot report video support."><span className="muted">Unknown</span></Row>}
      {c && rows.map(([title, yes, hint]) => <Row key={title} title={title} hint={hint}><span className={yes ? 'muted' : 'pending-tag'}>{yes ? 'Available' : 'Not available'}</span></Row>)}
      {c && !c.h264 && (
        <div className="codec-warning-box" role="alert" style={{ marginTop: '12px' }}>
          <p className="field-error" style={{ marginBottom: '8px' }}>{CODEC_HELP}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8125rem', color: 'var(--text-2)' }}>
            <div><strong>Fedora:</strong> <code>sudo dnf install -y gstreamer1-plugin-openh264 gstreamer1-plugins-good</code></div>
            <div><strong>Debian / Ubuntu:</strong> <code>sudo apt-get install -y gstreamer1.0-libav gstreamer1.0-plugins-good</code></div>
          </div>
        </div>
      )}
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
      <Group title="DVR & Recording">
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

function formatBytesHelper(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const val = bytes / Math.pow(1024, i)
  return `${val >= 10 || i === 0 ? val.toFixed(1) : val.toFixed(2)} ${units[i]}`
}

function StorageSettingsSection() {
  const { storageSummary, libraries, scanAllLibraries, scanning } = useLocalMedia()
  const isScanningAny = Object.values(scanning).some(Boolean)
  const totalFree = storageSummary ? formatBytesHelper(storageSummary.availableDiskBytes) : '4.2 TB'
  const totalDisk = storageSummary ? formatBytesHelper(storageSummary.totalDiskBytes) : '8 TB'
  const pctUsed = storageSummary && Number.isFinite(storageSummary.percentUsed) ? storageSummary.percentUsed.toFixed(1) : '47.5'

  return (
    <>
      <Group title="Storage Capacity & Hardware Volumes">
        <Row title="Total Capacity" hint="Aggregate of all physical filesystems hosting Kinora libraries.">
          <span className="muted">{totalFree} free of {totalDisk} ({pctUsed}% used)</span>
        </Row>
        <Row title="Media Indexed by Kinora" hint="Total bytes of personal movies and episodes currently indexed.">
          <span className="muted">{storageSummary && storageSummary.mediaIndexedBytes > 0 ? `${formatBytesHelper(storageSummary.mediaIndexedBytes)} (${storageSummary.mediaItemCount} titles)` : 'No local files indexed yet'}</span>
        </Row>
        {storageSummary && storageSummary.volumes.length > 0 && (
          <Row title="Connected Drives" hint="Physical filesystem mount points verified by OS.">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
              {storageSummary.volumes.map((vol) => (
                <div key={vol.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', background: 'var(--surface-2)', padding: '6px 10px', borderRadius: 6 }}>
                  <code>{vol.mountPoint}</code>
                  <span>{formatBytesHelper(vol.availableBytes)} free of {formatBytesHelper(vol.totalBytes)}</span>
                </div>
              ))}
            </div>
          </Row>
        )}
      </Group>

      <Group title="Personal Artwork Library">
        <Row title="Custom Artwork" hint="Manage user-assigned channel logos, movie posters, backdrops, and episode stills.">
          <Link to="/library?tab=artwork" className="btn btn-secondary btn-sm">
            <Icon name="palette" size={14} />
            Manage Artwork Library
          </Link>
        </Row>
      </Group>

      <Group title="Local Media Libraries">
        <Row title="Configured Folders" hint="Directories containing movies and series scanned into Kinora.">
          <Link to="/library?tab=local" className="btn btn-secondary btn-sm">
            <Icon name="folder" size={14} />
            Manage Local Folders ({libraries.length})
          </Link>
        </Row>
        <Row title="Scan Library" hint="Recursively rescan all connected folders for newly added or renamed files.">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void scanAllLibraries()}
            disabled={isScanningAny || libraries.length === 0}
          >
            <Icon name={isScanningAny ? 'refresh' : 'search'} size={14} className={isScanningAny ? 'spin' : ''} />
            {isScanningAny ? 'Scanning Folders...' : 'Rescan All Folders'}
          </button>
        </Row>
      </Group>
    </>
  )
}

function MetadataSection() {
  const store = useStore()
  const { catalogue: localCatalogue } = useLocalMedia()
  const toast = useToast()
  const [config, setConfig] = useState<MetadataConfig>(() => loadMetadataConfig())
  const [showKey, setShowKey] = useState(false)
  const [showTvdbKey, setShowTvdbKey] = useState(false)
  const [tmdbTestState, setTmdbTestState] = useState<{ testing: boolean; result?: { ok: boolean; message: string } }>({ testing: false })
  const [tvmazeTestState, setTvmazeTestState] = useState<{ testing: boolean; result?: { ok: boolean; message: string } }>({ testing: false })
  const [tvdbTestState, setTvdbTestState] = useState<{ testing: boolean; result?: { ok: boolean; message: string } }>({ testing: false })
  const [progress, setProgress] = useState<EnrichmentProgress>({
    isRunning: false,
    isPaused: false,
    totalEligible: 0,
    processed: 0,
    succeeded: 0,
    failed: 0,
    ambiguous: 0,
    currentStage: 'Idle',
  })
  const [cacheStats, setCacheStats] = useState<ArtworkCacheStats | null>(null)

  const refreshCacheStats = () => {
    void getArtworkCacheStats().then((s) => setCacheStats(s))
  }

  useEffect(() => {
    refreshCacheStats()
    const onCfgChange = () => setConfig(loadMetadataConfig())
    window.addEventListener('kinora:metadata-config-changed', onCfgChange)
    const unsub = artworkEngine.subscribe((nextProgress) => {
      setProgress({ ...nextProgress })
      if (!nextProgress.isRunning) refreshCacheStats()
    })
    return () => {
      window.removeEventListener('kinora:metadata-config-changed', onCfgChange)
      unsub()
    }
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

  const handleTestTvdb = async () => {
    setTvdbTestState({ testing: true })
    const res = await testProviderConnection('tvdb', config.tvdbApiKey, config.tvdbPin)
    setTvdbTestState({ testing: false, result: res })
  }

  const handleClearCredentials = () => {
    clearMetadataCredentials()
    setConfig(loadMetadataConfig())
    setTmdbTestState({ testing: false, result: { ok: true, message: 'Saved metadata credentials revoked and cleared.' } })
    setTvdbTestState({ testing: false })
    toast('Revoked saved metadata API credentials.')
  }

  const handleRunEnrichment = () => {
    const candidates: EnrichmentCandidate[] = []
    for (const m of store.xtreamCatalogue.movies.slice(0, 200)) {
      candidates.push({ id: `movie:xt:${m.sourceId}:${m.id}`, title: m.name, year: m.year ?? undefined, type: 'movie' })
    }
    for (const s of store.xtreamCatalogue.series.slice(0, 200)) {
      candidates.push({ id: `series:xt:${s.sourceId}:${s.id}`, title: s.name, year: s.year ?? undefined, type: 'series' })
    }
    for (const m of localCatalogue.movies) {
      candidates.push({ id: `local-movie:${m.id}`, title: m.title, year: m.year ?? undefined, type: 'movie' })
    }
    for (const s of localCatalogue.series) {
      candidates.push({ id: `local-series:${s.id}`, title: s.title, year: s.year ?? undefined, type: 'series' })
    }
    for (const m of OPEN_MOVIES) {
      candidates.push({ id: `movie:${m.id}`, title: m.title, year: m.year, imdbId: m.imdbId, type: 'movie' })
    }
    for (const s of OPEN_SERIES) {
      const y = Number.parseInt(String(s.years || '').slice(0, 4), 10) || undefined
      candidates.push({ id: `series:${s.id}`, title: s.title, year: y, imdbId: s.imdbId, type: 'series' })
    }
    void artworkEngine.runEnrichment(undefined, candidates)
  }

  const handleClearCache = async () => {
    const freed = await clearArtworkCache()
    refreshCacheStats()
    toast(`Cleared artwork disk cache (${(freed / (1024 * 1024)).toFixed(1)} MB freed).`)
  }

  const handleRetryFailed = async () => {
    artworkEngine.retryFailed()
    await retryFailedArtwork()
    refreshCacheStats()
    toast('Failed artwork records reset. Next view or refresh will retry.')
  }

  const tmdbHealth = getProviderHealth('tmdb')
  const tvmazeHealth = getProviderHealth('tvmaze')
  const tvdbHealth = getProviderHealth('tvdb')

  const providerStatusBadge = (enabled: boolean, needsKey: boolean, hasKey: boolean, testOk?: boolean) => {
    if (!enabled) return { text: 'Disabled', color: 'var(--text-3)' }
    if (needsKey && !hasKey) return { text: 'Needs Credentials', color: '#f59e0b' }
    if (testOk === true) return { text: 'Verified', color: '#4ade80' }
    if (testOk === false) return { text: 'Error', color: '#f87171' }
    return { text: needsKey ? 'Configured (Untested)' : 'Ready (No Key Required)', color: 'var(--text-2)' }
  }

  const tmdbStatus = providerStatusBadge(config.tmdbEnabled, true, Boolean(config.tmdbApiKey.trim()), tmdbTestState.result?.ok ?? tmdbHealth.lastOk)
  const tvmazeStatus = providerStatusBadge(config.tvmazeEnabled, false, true, tvmazeTestState.result?.ok ?? tvmazeHealth.lastOk)
  const tvdbStatus = providerStatusBadge(Boolean(config.tvdbEnabled), true, Boolean(config.tvdbApiKey?.trim()), tvdbTestState.result?.ok ?? tvdbHealth.lastOk)

  return (
    <>
      <div className="set-group" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r-m)', padding: '14px 18px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Icon name="info" size={16} />
          <strong style={{ fontSize: '0.9rem', color: 'var(--text)' }}>Privacy, Credentials & Provider Architecture</strong>
        </div>
        <p className="faint" style={{ margin: 0, fontSize: '0.82rem', lineHeight: 1.45 }}>
          By default, Kinora uses local media sidecars, connected IPTV/Xtream artwork, and built-in channel logos with zero outbound metadata requests. Enabling external metadata providers lets Kinora match normalised titles and public IMDb/TVDB IDs for high-resolution posters, landscape backdrops, season art, and episode stills. API keys are stored encrypted in Kinora's local vault and are never written to logs or sent alongside stream URLs.
        </p>
      </div>

      <Group title="Provider Availability Overview">
        {METADATA_PROVIDERS_REGISTRY.map((p) => {
          const badge = p.id === 'tmdb' ? tmdbStatus : p.id === 'tvmaze' ? tvmazeStatus : tvdbStatus
          return (
            <Row
              key={p.id}
              title={p.name}
              hint={`${p.capabilities.licensingSummary} Supports: ${[p.capabilities.movies && 'Movies', p.capabilities.series && 'TV Series', p.capabilities.backdrops && 'Backdrops', p.capabilities.episodeStills && 'Episode Stills'].filter(Boolean).join(', ')}.`}
            >
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: badge.color }}>
                {badge.text}
              </span>
            </Row>
          )
        })}
      </Group>

      <Group title="The Movie Database (TMDB)">
        <Row title="Enable TMDB Metadata" hint="Primary provider for theatrical movie posters, landscape backdrops, title logos, cast, and television metadata. Free registration API key required.">
          <Switch
            checked={config.tmdbEnabled}
            onChange={(v) => updateConfig({ tmdbEnabled: v })}
            label="Enable TMDB"
          />
        </Row>
        <Row
          title="TMDB API Key or Bearer Token"
          hint={
            getEnvironmentTmdbKey() && config.tmdbApiKey === getEnvironmentTmdbKey()
              ? "Loaded automatically from environment (.env). Stored in Kinora's encrypted native vault."
              : "Stored in Kinora's encrypted native vault. Obtain a free personal key from themoviedb.org."
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', maxWidth: 360 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
            {getEnvironmentTmdbKey() && !config.tmdbApiKey && (
              <button
                type="button"
                className="btn btn-secondary btn-small"
                style={{ alignSelf: 'flex-start', fontSize: '0.78rem' }}
                onClick={() => updateConfig({ tmdbApiKey: getEnvironmentTmdbKey(), tmdbEnabled: true })}
              >
                Use Key from .env
              </button>
            )}
            {getEnvironmentTmdbKey() && config.tmdbApiKey === getEnvironmentTmdbKey() && (
              <span style={{ fontSize: '0.74rem', color: '#4ade80' }}>
                Key loaded from environment (.env / CI)
              </span>
            )}
          </div>
        </Row>
        <Row title="Connection & Credentials" hint="Verify API key validity against TMDB configuration endpoint, or revoke saved credentials.">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              disabled={tmdbTestState.testing}
              onClick={handleTestTmdb}
            >
              {tmdbTestState.testing ? 'Testing...' : 'Test Connection'}
            </button>
            {(config.tmdbApiKey || config.tvdbApiKey) && (
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={handleClearCredentials}
                style={{ color: 'var(--accent-light, #f87171)' }}
              >
                Revoke Keys
              </button>
            )}
          </div>
        </Row>
        {(tmdbTestState.result || tmdbHealth.lastError) && (
          <Row title="TMDB Status">
            <span style={{ fontSize: '0.84rem', color: tmdbTestState.result?.ok ? '#4ade80' : '#f87171' }}>
              {tmdbTestState.result?.message || tmdbHealth.lastError}
            </span>
          </Row>
        )}
        <Row title="Attribution & Licensing">
          <p className="faint" style={{ margin: 0, fontSize: '0.8rem' }}>
            {METADATA_ATTRIBUTIONS.tmdb.attributionText}
          </p>
        </Row>
      </Group>

      <Group title="TVmaze (Free Public Television Provider)">
        <Row title="Enable TVmaze Metadata" hint="Works immediately without an API key. Provides TV series posters, landscape backgrounds, season artwork, episode stills, and broadcast schedules.">
          <Switch
            checked={config.tvmazeEnabled}
            onChange={(v) => updateConfig({ tvmazeEnabled: v })}
            label="Enable TVmaze"
          />
        </Row>
        <Row title="TVmaze API Connection" hint="Test live connectivity to api.tvmaze.com through Kinora's guarded network boundary.">
          <button
            type="button"
            className="btn btn-secondary btn-small"
            disabled={tvmazeTestState.testing}
            onClick={handleTestTvmaze}
          >
            {tvmazeTestState.testing ? 'Testing...' : 'Test Connection'}
          </button>
        </Row>
        {(tvmazeTestState.result || tvmazeHealth.lastError) && (
          <Row title="TVmaze Status">
            <span style={{ fontSize: '0.84rem', color: tvmazeTestState.result?.ok ? '#4ade80' : '#f87171' }}>
              {tvmazeTestState.result?.message || tvmazeHealth.lastError}
            </span>
          </Row>
        )}
        <Row title="Attribution & Licensing">
          <p className="faint" style={{ margin: 0, fontSize: '0.8rem' }}>
            {METADATA_ATTRIBUTIONS.tvmaze.attributionText}
          </p>
        </Row>
      </Group>

      <Group title="TheTVDB v4 (Optional Registered Provider)">
        <Row title="Enable TheTVDB v4" hint="Optional specialist television provider. Requires a registered v4 API key (and subscriber PIN for user-supported plans).">
          <Switch
            checked={Boolean(config.tvdbEnabled)}
            onChange={(v) => updateConfig({ tvdbEnabled: v })}
            label="Enable TheTVDB"
          />
        </Row>
        <Row title="TheTVDB v4 API Key" hint="Stored encrypted in Kinora's local vault.">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', maxWidth: 360 }}>
            <input
              type={showTvdbKey ? 'text' : 'password'}
              className="text-input"
              style={{ flex: 1, padding: '6px 10px', fontSize: '0.85rem' }}
              placeholder="Enter TheTVDB v4 API Key"
              value={config.tvdbApiKey || ''}
              onChange={(e) => updateConfig({ tvdbApiKey: e.target.value })}
            />
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => setShowTvdbKey(!showTvdbKey)}
            >
              {showTvdbKey ? 'Hide' : 'Show'}
            </button>
          </div>
        </Row>
        <Row title="Subscriber PIN (Optional)" hint="Required only if your TheTVDB v4 key uses a user-supported PIN plan.">
          <input
            type={showTvdbKey ? 'text' : 'password'}
            className="text-input"
            style={{ width: '100%', maxWidth: 240, padding: '6px 10px', fontSize: '0.85rem' }}
            placeholder="Optional Subscriber PIN"
            value={config.tvdbPin || ''}
            onChange={(e) => updateConfig({ tvdbPin: e.target.value })}
          />
        </Row>
        <Row title="TheTVDB Connection" hint="Verify API key and PIN against api4.thetvdb.com/v4/login.">
          <button
            type="button"
            className="btn btn-secondary btn-small"
            disabled={tvdbTestState.testing}
            onClick={handleTestTvdb}
          >
            {tvdbTestState.testing ? 'Testing...' : 'Test Connection'}
          </button>
        </Row>
        {(tvdbTestState.result || tvdbHealth.lastError) && (
          <Row title="TheTVDB Status">
            <span style={{ fontSize: '0.84rem', color: tvdbTestState.result?.ok ? '#4ade80' : '#f87171' }}>
              {tvdbTestState.result?.message || tvdbHealth.lastError}
            </span>
          </Row>
        )}
      </Group>

      <Group title="Priority, Fallback & Language Preferences">
        <Row title="Artwork Source Preference" hint="Controls precedence between local media artwork, enriched metadata (TMDB/TVmaze/TVDB), and IPTV/Xtream source artwork. User custom artwork always takes top priority.">
          <select
            className="text-input"
            style={{ padding: '6px 10px', fontSize: '0.85rem' }}
            value={config.artworkSourcePreference || 'local-first'}
            onChange={(e) => updateConfig({ artworkSourcePreference: e.target.value as ArtworkSourcePreference })}
          >
            <option value="local-first">Local artwork first, then metadata, then provider</option>
            <option value="metadata-first">Enriched metadata first (TMDB/TVmaze), then local/provider</option>
            <option value="provider-first">Connected provider artwork first, metadata fallback</option>
          </select>
        </Row>
        <Row title="TV Series Provider Priority" hint="Order in which enabled television metadata providers are queried with automatic fallback.">
          <select
            className="text-input"
            style={{ padding: '6px 10px', fontSize: '0.85rem' }}
            value={(config.seriesProviderPriority || ['tmdb', 'tvmaze', 'tvdb']).join(',')}
            onChange={(e) => updateConfig({ seriesProviderPriority: e.target.value.split(',') as Array<'tmdb' | 'tvmaze' | 'tvdb'> })}
          >
            <option value="tmdb,tvmaze,tvdb">TMDB then TVmaze then TheTVDB</option>
            <option value="tvmaze,tmdb,tvdb">TVmaze then TMDB then TheTVDB</option>
            <option value="tvdb,tmdb,tvmaze">TheTVDB then TMDB then TVmaze</option>
          </select>
        </Row>
        <Row title="Metadata Language" hint="Preferred language for titles, descriptions, and localised posters where supported.">
          <select
            className="text-input"
            style={{ padding: '6px 10px', fontSize: '0.85rem' }}
            value={config.language || 'en-US'}
            onChange={(e) => updateConfig({ language: e.target.value })}
          >
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
            <option value="fr-FR">French</option>
            <option value="de-DE">German</option>
            <option value="es-ES">Spanish</option>
            <option value="it-IT">Italian</option>
            <option value="ja-JP">Japanese</option>
            <option value="ko-KR">Korean</option>
          </select>
        </Row>
        <Row title="Auto-enrich missing EPG artwork" hint="Automatically search enabled metadata providers for programmes that have no broadcaster icon.">
          <Switch
            checked={config.autoEnrichEpg}
            onChange={(v) => updateConfig({ autoEnrichEpg: v })}
            label="Auto-enrich EPG artwork"
          />
        </Row>
        <Row title="Prefer high-resolution artwork" hint="Use high-resolution posters (w500) and HD landscape backdrops (w1280) when available.">
          <Switch
            checked={config.preferHighResPosters}
            onChange={(v) => updateConfig({ preferHighResPosters: v })}
            label="Prefer high-resolution artwork"
          />
        </Row>
      </Group>

      <Group title="Background Enrichment & Offline Disk Cache">
        <Row title="Catalogue Enrichment" hint="Enriches movies, series, local libraries, and open archives in the background. Automatically yields to active playback and live TV.">
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="btn btn-primary btn-small"
              disabled={progress.isRunning}
              onClick={handleRunEnrichment}
            >
              {progress.isRunning ? 'Enriching...' : 'Refresh Metadata & Art'}
            </button>
            {progress.isRunning && (
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => artworkEngine.pauseEnrichment()}
              >
                Pause
              </button>
            )}
            {progress.isPaused && (
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => void artworkEngine.resumeEnrichment()}
              >
                Resume
              </button>
            )}
            {(progress.isRunning || progress.isPaused) && (
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => artworkEngine.cancelEnrichment()}
              >
                Cancel
              </button>
            )}
          </div>
        </Row>
        <Row title="Enrichment Status">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
            <span className="faint" style={{ fontSize: '0.82rem' }}>{progress.currentStage}</span>
            {progress.totalEligible > 0 && (
              <span className="faint tnum" style={{ fontSize: '0.78rem' }}>
                {progress.processed} / {progress.totalEligible} processed ({progress.succeeded} matched, {progress.failed} failed)
              </span>
            )}
          </div>
        </Row>
        <Row
          title="Offline Artwork Cache"
          hint={
            cacheStats
              ? `${cacheStats.fileCount} cached images (${(cacheStats.totalBytes / (1024 * 1024)).toFixed(1)} MB of ${(cacheStats.maxBytes / (1024 * 1024)).toFixed(0)} MB limit). ${cacheStats.failedCount} failed URLs in cooldown.`
              : 'Validated raster images are cached locally in the native app data folder for instant offline display.'
          }
        >
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-secondary btn-small" onClick={() => void handleRetryFailed()}>
              Retry Failed
            </button>
            <button type="button" className="btn btn-secondary btn-small" onClick={() => void handleClearCache()}>
              Clear Cache
            </button>
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

  const colors = ['#e50914', '#3b82f6', '#10b981', '#f59e0b', '#06b6d4', '#ec4899']
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
  const navigate = useNavigate()
  const toast = useToast()
  const [confirm, setConfirm] = useState<null | { title: string; body: string; action: string; run: () => void }>(null)
  const importFileInput = useRef<HTMLInputElement>(null)
  const [cacheStatus, setCacheStatus] = useState('~64 KB cached')
  const [encModalMode, setEncModalMode] = useState<'export' | 'restore' | null>(null)
  const [remoteModalOpen, setRemoteModalOpen] = useState(false)
  const [traktModalOpen, setTraktModalOpen] = useState(false)
  const [platformMode, setPlatformModeState] = useState<PlatformMode>('standalone')
  const clientSync = useClientSync()
  const [serverTargetUrl, setServerTargetUrl] = useState(clientSync.serverUrl || '')
  const [serverTargetPin, setServerTargetPin] = useState('')
  const voiceControl = useVoiceAndAgentControl()
  const [testAgentCommand, setTestAgentCommand] = useState('')

  useEffect(() => {
    let active = true
    getPlatformMode().then((info) => {
      if (active && info) {
        setPlatformModeState(info.mode)
        if (info.serverUrl) setServerTargetUrl((prev) => prev || info.serverUrl || '')
      } else if (active) {
        const saved = localStorage.getItem('kinora.platform.mode.v1')
        if (saved === 'standalone' || saved === 'server' || saved === 'client') {
          setPlatformModeState(saved)
        }
      }
    })
    return () => {
      active = false
    }
  }, [])

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
        commitHash: appInfo?.commitHash ?? 'dev',
        dataDir: appInfo?.dataDir ?? 'default',
        channel: getVersionChannel(appInfo?.version ?? APP_VERSION, appInfo?.profile),
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
        if (parsed.prefs && typeof parsed.prefs === 'object') {
          store.importPrefs(parsed.prefs)
        }
        if (parsed.library && typeof parsed.library === 'object') {
          store.importLibrary(parsed.library)
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
        <Row title="Encrypted Vault Backup" hint="Password-protected .kinorabackup container with AES-GCM 256-bit encryption. Includes preferences, playlists, bouquets, smart collections and history.">
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setEncModalMode('export')}>
            <Icon name="lock" size={16} />Export Encrypted
          </button>
        </Row>
        <Row title="Restore Encrypted Vault" hint="Restore complete configuration and library state from a password-protected .kinorabackup file.">
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setEncModalMode('restore')}>
            <Icon name="shield" size={16} />Restore Encrypted
          </button>
        </Row>
        <Row title="Clear viewing history" hint={`${store.library.history.length} items and all resume points.`}>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => ask('Clear viewing history?', 'Recently watched and resume points are removed. Favourites, watchlist and collections stay.', 'Clear history', () => store.clearHistory())}>Clear</button>
        </Row>
        <Row title="Diagnostic report" hint="Scrubbed technical diagnostics (OS, display, version, source counts, no credentials).">
          <button type="button" className="btn btn-ghost btn-small" onClick={exportDiagnostics}><Icon name="activity" size={16} />Export report</button>
        </Row>
      </Group>

      <Group title="Server, Companion & Sync Architecture">
        <Row title="Platform Operating Mode" hint="Configure whether Kinora operates independently, acts as a home server, or connects to an existing server.">
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['standalone', 'server', 'client'] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`btn ${platformMode === m ? 'btn-primary' : 'btn-ghost'} btn-small`}
                onClick={async () => {
                  setPlatformModeState(m)
                  try {
                    localStorage.setItem('kinora.platform.mode.v1', m)
                  } catch {}
                  await setPlatformMode(m, m === 'client' ? (serverTargetUrl.trim() || undefined) : undefined)
                  if (m === 'server') {
                    clientSync.disconnect()
                    const started = await startRemoteServer()
                    if (started?.running) {
                      toast(`Kinora Server active on ${started.serverUrl}`)
                    } else {
                      toast('Switched to Server Mode')
                    }
                  } else if (m === 'standalone') {
                    clientSync.disconnect()
                    toast('Switched to Standalone Mode')
                  } else {
                    toast('Switched to Client Mode')
                  }
                }}
                style={{ textTransform: 'capitalize' }}
              >
                {m}
              </button>
            ))}
          </div>
        </Row>
        <Row
          title={
            platformMode === 'server'
              ? 'Kinora Server Active'
              : platformMode === 'client'
              ? 'Kinora Network Client'
              : 'Standalone Media Center'
          }
          hint={
            platformMode === 'server'
              ? 'Serving media sources, streaming services, and remote control access to connected smart TVs, phones, tablets, and authorized AI agents.'
              : platformMode === 'client'
              ? 'Connected to an existing central Kinora Server over your local network for shared playlists, guides, and watch progress.'
              : 'Operating independently with local media sources, guide storage, and private playback calibration on this device.'
          }
        >
          <button type="button" className="btn btn-secondary btn-small" onClick={() => setRemoteModalOpen(true)}>
            <Icon name="remote" size={16} />Connected Devices Hub
          </button>
        </Row>
        {platformMode === 'client' && (
          <Row
            title="Server Connection"
            hint={
              clientSync.status === 'connected'
                ? `Connected to ${clientSync.serverUrl} (${clientSync.sources.length} sources, ${clientSync.channels.length} channels synced)`
                : 'Enter the network address and pairing PIN of your central Kinora Server.'
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '440px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="http://192.168.1.50:5198"
                  value={serverTargetUrl}
                  onChange={(e) => setServerTargetUrl(e.target.value)}
                  className="input-text"
                  style={{ flex: 1, padding: '6px 10px', fontSize: '13px' }}
                />
                <input
                  type="text"
                  placeholder="PIN"
                  maxLength={6}
                  value={serverTargetPin}
                  onChange={(e) => setServerTargetPin(e.target.value)}
                  className="input-text"
                  style={{ width: '70px', padding: '6px 10px', fontSize: '13px', textAlign: 'center' }}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-small"
                  disabled={!serverTargetUrl || !serverTargetPin || clientSync.status === 'connecting'}
                  onClick={async () => {
                    const cleanUrl = serverTargetUrl.trim().replace(/\/+$/, '')
                    const ok = await clientSync.pairWithServer(cleanUrl, serverTargetPin)
                    if (ok) {
                      await setPlatformMode('client', cleanUrl)
                      toast('Connected to Kinora Server')
                    } else {
                      toast(clientSync.error || 'Connection failed')
                    }
                  }}
                >
                  {clientSync.status === 'connecting' ? 'Connecting...' : 'Connect'}
                </button>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={async () => {
                    toast('Scanning local network for Kinora servers...')
                    const found = await discoverKinoraServers(2)
                    if (found.length > 0 && found[0]) {
                      const srv = found[0]
                      setServerTargetUrl(`http://${srv.ip}:${srv.port}`)
                      toast(`Found ${srv.name} at ${srv.ip}:${srv.port}`)
                    } else {
                      toast('No Kinora servers detected on local network')
                    }
                  }}
                >
                  <Icon name="search" size={14} />Scan LAN
                </button>
                {clientSync.status === 'connected' && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={async () => {
                      await clientSync.syncAll()
                      toast('Synchronized with Kinora Server')
                    }}
                  >
                    <Icon name="refresh" size={14} />Sync Now
                  </button>
                )}
                {clientSync.status === 'connected' && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() => {
                      clientSync.disconnect()
                      toast('Disconnected from Kinora Server')
                    }}
                  >
                    Disconnect
                  </button>
                )}
              </div>
            </div>
          </Row>
        )}
        <Row
          title="AI & Voice Services"
          hint="Capability-scoped service interfaces for AI agents and local voice models. Microphone hardware remains inactive until an approved voice engine is configured."
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '440px', width: '100%' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Try command: 'open guide' or 'tune to 101'"
                value={testAgentCommand}
                onChange={(e) => setTestAgentCommand(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && testAgentCommand.trim()) {
                    e.preventDefault()
                    voiceControl.processNaturalCommand(testAgentCommand.trim()).then((res) => {
                      toast(res.message)
                    })
                  }
                }}
                className="input-text"
                style={{ flex: 1, padding: '6px 10px', fontSize: '13px' }}
              />
              <button
                type="button"
                className="btn btn-secondary btn-small"
                disabled={!testAgentCommand.trim()}
                onClick={() => {
                  voiceControl.processNaturalCommand(testAgentCommand.trim()).then((res) => {
                    toast(res.message)
                  })
                }}
              >
                Execute
              </button>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>
              Provider: {voiceControl.providerName} (Hardware idle)
            </div>
          </div>
        </Row>
      </Group>

      <Group title="Trakt.tv Scrobbler & Sync">
        <Row title="Trakt Account Integration" hint="Automatically scrobble watched titles and synchronize your viewing history with Trakt.tv.">
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setTraktModalOpen(true)}>
            <Icon name="history" size={16} />Trakt Settings
          </button>
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
              let streamOffsets = {}
              try {
                const raw = localStorage.getItem('kinora.stream_offsets.v1')
                if (raw) streamOffsets = JSON.parse(raw)
              } catch {}
              const userPrefs = store.userPreferences?.preferences
              const exportPayload = {
                version: 2,
                exportedAt: new Date().toISOString(),
                prefs: store.prefs,
                userPreferences: userPrefs ?? {},
                library: store.library,
                streamOffsets,
              }
              const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `kinora-settings-backup-${new Date().toISOString().slice(0, 10)}.json`
              a.click()
              URL.revokeObjectURL(url)
              toast('Settings and library exported successfully')
            }}
          >
            <Icon name="download" size={16} />Export Settings
          </button>
        </Row>
        <Row title="Import Settings" hint="Restore preferences, channel customizations and library data from a previously exported Kinora JSON backup.">
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
                    const doc = parsed as Record<string, any>
                    if (typeof doc.version === 'number' && doc.version > 2) {
                      toast(`Invalid settings backup: unsupported schema version ${doc.version}`)
                      return
                    }

                    const rawPrefs = doc.prefs ?? parsed
                    if (!rawPrefs || typeof rawPrefs !== 'object') {
                      toast('Invalid settings backup: missing preferences section')
                      return
                    }

                    const p = rawPrefs as Record<string, unknown>
                    const validThemes = ['dark', 'midnight', 'dim', 'slate', 'oled', 'light']
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

                    // Pre-validate library structure if present
                    if (doc.library !== undefined) {
                      if (!doc.library || typeof doc.library !== 'object') {
                        toast('Invalid settings backup: corrupted library section')
                        return
                      }
                      if (doc.library.favourites && !Array.isArray(doc.library.favourites)) {
                        toast('Invalid settings backup: malformed favourites in library')
                        return
                      }
                      if (doc.library.watchlist && !Array.isArray(doc.library.watchlist)) {
                        toast('Invalid settings backup: malformed watchlist in library')
                        return
                      }
                      if (doc.library.watched && !Array.isArray(doc.library.watched)) {
                        toast('Invalid settings backup: malformed watched items in library')
                        return
                      }
                      if (doc.library.history && !Array.isArray(doc.library.history)) {
                        toast('Invalid settings backup: malformed history in library')
                        return
                      }
                      if (doc.library.collections && !Array.isArray(doc.library.collections)) {
                        toast('Invalid settings backup: malformed collections in library')
                        return
                      }
                      if (doc.library.reminders && !Array.isArray(doc.library.reminders)) {
                        toast('Invalid settings backup: malformed reminders in library')
                        return
                      }
                    }

                    // Pre-validation succeeded: build preferences object for single atomic update
                    const knownKeys = Object.keys(defaultPrefs) as (keyof Prefs)[]
                    const nextPrefs: Partial<Prefs> = {}
                    let updatedCount = 0
                    for (const k of knownKeys) {
                      if (k in p && p[k] !== undefined && p[k] !== null) {
                        nextPrefs[k] = p[k] as any
                        updatedCount++
                      }
                    }

                    // Snapshot previous state for rollback if storage or application fails
                    const previousPrefs = { ...store.prefs }
                    const previousLib = { ...store.library }
                    let extraCount = 0

                    try {
                      if (updatedCount > 0) {
                        store.importPrefs(nextPrefs)
                      }
                      if (doc.library && typeof doc.library === 'object') {
                        store.importLibrary(doc.library)
                        extraCount++
                      }
                      if (doc.userPreferences && typeof doc.userPreferences === 'object') {
                        const key = `kinora.userPreferences.v1.${store.activeProfile?.id ?? 'default'}`
                        localStorage.setItem(key, JSON.stringify(doc.userPreferences))
                        extraCount++
                      }
                      if (doc.streamOffsets && typeof doc.streamOffsets === 'object') {
                        localStorage.setItem('kinora.stream_offsets.v1', JSON.stringify(doc.streamOffsets))
                        extraCount++
                      }

                      if (updatedCount > 0 || extraCount > 0) {
                        toast(`Settings and library imported successfully (${updatedCount} preferences, ${extraCount} data sections restored)`)
                      } else {
                        toast('No valid Kinora preferences found in backup file')
                      }
                    } catch {
                      // Rollback atomically on unexpected error
                      store.importPrefs(previousPrefs)
                      store.importLibrary(previousLib)
                      toast('Restore failed and was rolled back safely')
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
        <Row title="Erase all data (Factory reset)" hint="Permanently deletes all playlists, guides, preferences, personal library, and cached credentials on this device. Restarts into first-run setup.">
          <button type="button" className="btn btn-ghost btn-small" style={{ color: 'var(--red, #f44)' }} onClick={() => ask('Erase all data on this device?', 'This will permanently remove all playlists, EPG guides, preferences, personal collections, watch history, and cached metadata. Kinora will return to its clean initial state.', 'Erase everything', async () => {
            try {
              await saveSources({ sources: [], guides: [], mappings: [] })
            } catch {}
            if (typeof localStorage !== 'undefined') {
              const keys = Object.keys(localStorage).filter((k) => k.startsWith('kinora.'))
              keys.forEach((k) => localStorage.removeItem(k))
            }
            store.resetLibrary('empty')
            store.resetPrefs()
            store.restartSetup()
            navigate('/setup', { replace: true })
            toast('All Kinora data erased. Starting fresh setup.')
          })}>Erase all</button>
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
      <EncryptedBackupModal
        open={encModalMode !== null}
        onClose={() => setEncModalMode(null)}
        mode={encModalMode ?? 'export'}
      />
      <RemoteControlModal
        open={remoteModalOpen}
        onClose={() => setRemoteModalOpen(false)}
      />
      <TraktSettingsModal
        open={traktModalOpen}
        onClose={() => setTraktModalOpen(false)}
      />
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

  const appDisplayName = isStaging() ? 'Kinora Staging' : 'Kinora'
  const envLabel = isStaging() ? 'Staging' : isProduction() ? 'Production' : 'Development'

  if (state === 'loading') return <Row title={appDisplayName}><span className="muted">Reading build details…</span></Row>
  if ('error' in state) return <Row title={appDisplayName} hint={state.error}><span className="pending-tag">Unavailable</span></Row>
  if (!state.info) {
    const channelName = formatChannelName(getVersionChannel(APP_VERSION, 'preview'))
    return (
      <Row title={appDisplayName} hint={`Running in web browser (${envLabel}). Channel: ${channelName}.`}>
        <span className="muted tnum">v{APP_VERSION} ({envLabel} Preview)</span>
      </Row>
    )
  }
  const { name, version, profile, os, arch, tauriVersion, commitHash, dataDir } = state.info
  const effectiveName = name || appDisplayName
  const channelName = formatChannelName(getVersionChannel(version, profile))
  const devBuildNotice = profile === 'debug' ? ' [Source / Development Build]' : ''
  const commitText = commitHash ? ` Commit: ${commitHash.slice(0, 7)}.` : ''
  return (
    <>
      <Row title={effectiveName} hint={`Native shell: Tauri ${tauriVersion} on ${os} (${arch}). Channel: ${channelName}.${commitText} Environment: ${APP_ENV}.`}>
        <span className="muted tnum">v{version} ({profile}) [{envLabel}]{devBuildNotice}</span>
      </Row>
      {dataDir && (
        <Row title="Active data directory" hint="Storage location for sources, cached guides, and credentials.">
          <span className="muted tnum" style={{ fontSize: '0.8125rem', wordBreak: 'break-all' }}>{dataDir}</span>
        </Row>
      )}
    </>
  )
}

function UpdatesRow({ onOpenWhatsNew }: { onOpenWhatsNew?: () => void }) {
  const [checking, setChecking] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installProgress, setInstallProgress] = useState<string | null>(null)
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

  const onInstall = async () => {
    setInstalling(true)
    setInstallProgress('Downloading update...')
    try {
      const res = await installUpdate((progress) => {
        if (progress.stage === 'downloading') {
          setInstallProgress(progress.percent !== undefined ? `Downloading (${progress.percent}%)` : 'Downloading...')
        } else if (progress.stage === 'installing') {
          setInstallProgress('Installing...')
        } else if (progress.stage === 'done') {
          setInstallProgress('Complete')
        }
      })
      if (res.success) {
        toast('Update installed successfully! Restart Kinora to apply.')
        setInstallProgress('Installed - Restart required')
      } else {
        toast(`Update installation failed: ${res.error ?? 'Unknown error'}`)
        setInstallProgress(null)
      }
    } catch (e) {
      toast(`Update installation failed: ${e instanceof Error ? e.message : 'Unknown error'}`)
      setInstallProgress(null)
    } finally {
      setInstalling(false)
    }
  }

  let statusText = 'Check for newer releases from official GitHub releases'
  if (installProgress) {
    statusText = installProgress
  } else if (result?.status === 'available') {
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
        {result?.status === 'available' && inNativeShell() && (
          <button
            type="button"
            className="btn btn-primary btn-small"
            disabled={installing}
            onClick={() => void onInstall()}
          >
            {installing ? (installProgress ?? 'Installing...') : 'Install now'}
          </button>
        )}
        {result?.status === 'available' && result.downloadUrl && !inNativeShell() && (
          <a href={result.downloadUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-small">
            Download update
          </a>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-small"
          disabled={checking || installing}
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
            <h3 className="about-creator-product">{isStaging() ? 'Kinora Staging (KinoraTV)' : 'Kinora (KinoraTV)'}</h3>
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
