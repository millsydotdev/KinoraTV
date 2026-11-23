import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { movies, series } from '../data/catalog'
import type { Channel } from '../data/types'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { ChannelCard, PosterCard, WideCard, XtreamArt, XtreamPosterCard, idleLabel } from '../components/Tiles'
import { ContentRail } from '../components/ContentRail'
import { useToast } from '../components/Toast'
import { ChannelMark, Art } from '../components/ui'
import { type TechnicalFormat } from '../components/TechnicalBadges'
import { useNow, clock } from '../lib/time'
import { NOT_TESTED } from '../state/playlists'
import { useProfiles } from '../state/profiles'
import { useStore } from '../state/store'
import { useUniversalPlayback } from '../state/playbackContext'
import { useLocalMedia } from '../state/localMedia'
import { isLogoArtwork } from '../components/ResourceCard'
import type { MediaResource } from '../data/personalLibrary'
import { HomeCustomizeModal } from '../components/HomeCustomizeModal'
import { DEFAULT_HOME_SECTIONS } from '../state/userPreferences'
import {
  buildHomeFeed,
  type FeaturedSlide,
  type HomeFeedData,
} from '../lib/homeFeed'
import { useArtwork } from '../lib/useArtwork'
import './Home.css'

interface HomeHeroProps {
  slides: FeaturedSlide[]
  previewChannel?: Channel
}

function HomeHero({
  slides,
  previewChannel,
}: HomeHeroProps) {
  const store = useStore()
  const toast = useToast()
  const [carouselIndex, setCarouselIndex] = useState(0)

  const currentSlide = slides[carouselIndex % Math.max(1, slides.length)]

  const heroArtType = currentSlide?.kind === 'series' ? 'series-backdrop' : 'movie-backdrop'
  const resolvedHero = useArtwork({
    contentId: currentSlide?.ref,
    title: currentSlide?.title || '',
    type: heroArtType,
    providerArt: currentSlide?.backdropUrl || currentSlide?.art,
    imdbId: currentSlide?.imdbId,
    year: typeof currentSlide?.yearOrYears === 'number' ? currentSlide.yearOrYears : Number(String(currentSlide?.yearOrYears ?? '').slice(0, 4)) || null,
    autoEnrich: Boolean(currentSlide && (currentSlide.kind === 'movie' || currentSlide.kind === 'series' || (currentSlide.kind === 'live' && currentSlide.title))),
  })

  // Guard against title logos, wordmarks, or portrait covers being enlarged to fill the hero background.
  // Backdrops must strictly be genuine landscape visuals.
  const candidateHeroArt = resolvedHero.src || currentSlide?.backdropUrl || currentSlide?.art
  const isInvalidBackdrop = Boolean(
    candidateHeroArt && (
      /\/logos?\/|title[-_]logo|wordmark|clearart/i.test(candidateHeroArt) ||
      (/\/cover$|poster|folder\.jpg/i.test(candidateHeroArt) && !candidateHeroArt.includes('/16-9') && !candidateHeroArt.includes('backdrop'))
    )
  )
  const effectiveHeroArt = isInvalidBackdrop ? null : candidateHeroArt

  // Only genuine transparent wordmarks and clearart graphics can serve as hero title logos.
  // Posters, album covers, and photographic stills must never be used as title logos.
  const isWordmarkLogo = (url?: string | null): boolean => {
    if (!url) return false
    if (/poster|cover|backdrop|still|thumb|fanart|banner|folder|\.jpg|\.jpeg/i.test(url)) return false
    return /\/logos?\/|title[-_]logo|wordmark|clearart|\.svg/i.test(url)
  }
  const heroTitleLogo = isWordmarkLogo(currentSlide?.logoUrl)
    ? currentSlide?.logoUrl
    : (isWordmarkLogo(candidateHeroArt) ? candidateHeroArt : null)

  const inLibrary = currentSlide ? (
    currentSlide.kind === 'live'
      ? store.library.favourites.includes(currentSlide.ref)
      : store.library.watchlist.includes(currentSlide.ref)
  ) : false

  return (
    <section className="hero home-hero-cinematic" aria-labelledby="hero-title">
      {currentSlide && (
        <div className="home-hero-art-layer">
          {effectiveHeroArt ? (
            <Art src={effectiveHeroArt} alt={currentSlide.title} contentId={currentSlide.ref} eager className="home-hero-art" />
          ) : currentSlide.artworkKey ? (
            <XtreamArt
              artworkKey={currentSlide.artworkKey}
              contentId={currentSlide.ref}
              artType={heroArtType}
              fallbackTitle={currentSlide.title}
              fallbackIcon={currentSlide.kind === 'series' ? 'series' : 'film'}
              eager
            />
          ) : (
            <div className="home-hero-cinematic-stage">
              <div className="home-hero-stage-glow" />
              <div className="home-hero-stage-grid" />
              <div className="home-hero-stage-watermark" aria-hidden="true">
                {currentSlide.channel?.name ? currentSlide.channel.name.toUpperCase() : 'KINORA BROADCAST'}
              </div>
              <div className="home-hero-stage-medallion">
                <div className="home-hero-stage-radar" />
                {currentSlide.channel && <ChannelMark channel={currentSlide.channel} size={96} />}
                <div className="home-hero-stage-status">
                  <span className="home-hero-stage-live-dot" />
                  <span>LIVE BROADCAST</span>
                </div>
                <span className="home-hero-stage-caption">
                  {currentSlide.channel?.name || 'Kinora Direct Feed'}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="home-hero-inner">
        <span className="home-hero-tag">
          <Icon name="play" size={11} />
          {currentSlide?.kicker ?? 'Featured'}
        </span>
        {heroTitleLogo ? (
          <div className="home-hero-title-graphic-wrapper">
            <img
              src={heroTitleLogo}
              alt={currentSlide?.title ?? ''}
              className="home-hero-title-logo"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
                const fallbackH1 = document.getElementById('hero-title')
                if (fallbackH1) fallbackH1.classList.remove('sr-only')
              }}
            />
            <h1 id="hero-title" className="home-hero-main-title sr-only">
              {currentSlide?.title ?? (previewChannel?.name ? `${previewChannel.name} Live` : 'Kinora')}
            </h1>
          </div>
        ) : (
          <h1 id="hero-title" className="home-hero-main-title">
            {currentSlide?.title ?? (previewChannel?.name ? `${previewChannel.name} Live` : 'Kinora')}
          </h1>
        )}
        <div className="home-hero-meta">
          {currentSlide?.yearOrYears && <span>{currentSlide.yearOrYears}</span>}
          {currentSlide?.runtime && (
            <>
              <span>•</span>
              <span>{currentSlide.runtime}</span>
            </>
          )}
          {currentSlide?.certificate && (
            <span className="badge-tech">{currentSlide.certificate}</span>
          )}
          {currentSlide?.isLive && (
            <span className="badge-live">LIVE</span>
          )}
          {currentSlide?.genres && currentSlide.genres.length > 0 && (
            <div className="home-hero-genre-tags" aria-label="Genres">
              {currentSlide.genres.slice(0, 3).map((g: string) => (
                <span key={g} className="home-hero-genre-chip">
                  {g}
                </span>
              ))}
            </div>
          )}
        </div>
        <p className="home-hero-desc">
          {currentSlide?.synopsis ??
            'Stream live television, browse guides and discover curated media.'}
        </p>
        <div className="home-hero-btns">
          <Link to={currentSlide?.playUrl ?? (previewChannel ? `/live?channel=${previewChannel.id}` : '/live')} className="home-btn-watch">
            <Icon name="play" size={18} />
            <span>{currentSlide?.kind === 'live' || !currentSlide ? 'Watch Live' : 'Watch Now'}</span>
          </Link>
          <Link to={currentSlide?.to ?? '/live'} className="home-btn-info" title="More Info" aria-label="More Info">
            <Icon name="info" size={18} />
            <span className="home-btn-info-text">More Info</span>
            <span className="sr-only">View Details</span>
          </Link>
          <button
            type="button"
            className={`home-btn-bookmark${inLibrary ? ' is-active' : ''}`}
            title={inLibrary ? 'Remove from watchlist' : 'Add to Library'}
            aria-label={inLibrary ? 'Remove from watchlist' : 'Add to Library'}
            onClick={() => {
              if (currentSlide) {
                store.toggleWatchlist(currentSlide.ref)
                toast(inLibrary ? 'Removed from watchlist' : 'Added to watchlist')
              }
            }}
          >
            <Icon name={inLibrary ? 'check' : 'plus'} size={18} />
            <span className="sr-only">Add to Library</span>
          </button>
        </div>
      </div>

      {/* Carousel arrow buttons and dots */}
      {slides.length > 1 && (
        <>
          <button
            type="button"
            className="home-hero-nav-arrow prev"
            onClick={() => setCarouselIndex((i) => (i - 1 + slides.length) % slides.length)}
            aria-label="Previous slide"
            title="Previous slide"
          >
            <Icon name="left" size={18} />
          </button>
          <button
            type="button"
            className="home-hero-nav-arrow next"
            onClick={() => setCarouselIndex((i) => (i + 1) % slides.length)}
            aria-label="Next slide"
            title="Next slide"
          >
            <Icon name="right" size={18} />
          </button>
          <div className="home-hero-dots" role="tablist" aria-label="Hero slides">
            {slides.slice(0, 5).map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                className={`home-hero-dot hero-carousel-dot ${i === (carouselIndex % slides.length) ? 'is-active' : ''}`}
                onClick={() => setCarouselIndex(i)}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  )
}

interface HomeSideHubProps {
  channels: Channel[]
  now: number
  previewChannel?: Channel
  totalMovies: number
  totalSeries: number
  totalChannels: number
  storageText: string
  collapsed?: boolean
  onToggleCollapse?: () => void
}

function HomeSideHub({
  channels,
  now,
  previewChannel,
  totalMovies,
  totalSeries,
  totalChannels,
  storageText,
  collapsed = false,
  onToggleCollapse,
}: HomeSideHubProps) {
  const store = useStore()
  const navigate = useNavigate()
  const playbackCtx = useUniversalPlayback()
  const [channelsTab, setChannelsTab] = useState<'now' | 'next'>('now')

  const previewProg = previewChannel ? store.programmeAt(previewChannel, now) : undefined
  const isThisActive = playbackCtx.activeStream?.channel?.id === previewChannel?.id
  const isPlaying = isThisActive && playbackCtx.playbackState.status === 'playing'

  const progProgress = previewProg && previewProg.stop > previewProg.start
    ? Math.min(1, Math.max(0, (now - previewProg.start) / (previewProg.stop - previewProg.start)))
    : 0.5
  const minsLeft = previewProg && previewProg.stop > now
    ? Math.max(1, Math.round((previewProg.stop - now) / 60000))
    : 0

  return (
    <aside
      id="home-side-hub"
      className={`home-side-hub${collapsed ? ' is-collapsed' : ''}`}
      role="dialog"
      aria-modal={!collapsed}
      aria-hidden={collapsed}
      aria-label="Live TV and Library"
    >
      <div className="home-side-hub-header">
        <div className="home-side-hub-title-wrap">
          <span className="home-side-hub-live-dot" aria-hidden="true" />
          <span className="home-side-hub-title">Live &amp; Library</span>
        </div>
        {onToggleCollapse && (
          <button
            type="button"
            className="home-side-hub-collapse-btn"
            onClick={onToggleCollapse}
            aria-label="Close panel"
            title="Close (Esc)"
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      <div className="home-mini-live-card">
        <div className="home-mini-live-preview">
          <span className="home-mini-live-badge">LIVE</span>
          {previewProg?.art ? (
            <Art src={previewProg.art} alt={previewProg.title} className="home-mini-live-video" />
          ) : previewChannel ? (
            <div className="home-mini-live-stage">
              <div className="home-mini-live-stage-crt" />
              <span className="home-mini-live-corner-tag">HD 1080p</span>
              <div className="home-mini-live-center">
                <ChannelMark channel={previewChannel} size={54} />
                <div className="home-mini-live-status-pill">
                  <span className="home-mini-live-dot" />
                  <span>BROADCAST ON AIR</span>
                </div>
                <div className="home-mini-signal-bars" aria-hidden="true">
                  <span className="bar b1" /><span className="bar b2" /><span className="bar b3" /><span className="bar b4" />
                </div>
              </div>
            </div>
          ) : (
            <div className="home-mini-live-stage is-empty">
              <div className="home-mini-live-center">
                <Icon name="live" size={40} />
                <div className="home-mini-live-status-pill">
                  <span>NO LIVE FEED</span>
                </div>
              </div>
            </div>
          )}

          <div className="home-mini-live-overlay">
            {previewChannel && (
              <button
                type="button"
                className="home-mini-play-btn"
                onClick={() => {
                  if (isPlaying) {
                    playbackCtx.pause()
                  } else {
                    navigate(`/live?channel=${encodeURIComponent(previewChannel.id)}`)
                  }
                }}
                aria-label={isPlaying ? 'Pause live playback' : `Play ${previewChannel.name}`}
              >
                <Icon name={isPlaying ? 'pause' : 'play'} size={24} />
              </button>
            )}
          </div>
        </div>

        <div className="home-mini-live-details">
          <div className="home-mini-live-header">
            <span className="home-mini-ch-name">{previewChannel?.name ?? 'Live Television'}</span>
            <span className="badge badge-accent">ON AIR</span>
          </div>
          <p className="home-mini-prog-title">
            {previewProg?.title ?? (previewChannel ? idleLabel(previewChannel) : 'Connect source to stream live TV')}
          </p>
          <p className="home-mini-prog-time">
            <span>{previewProg ? `${clock(previewProg.start, store.prefs.timeFormat)} - ${clock(previewProg.stop, store.prefs.timeFormat)}` : previewChannel ? 'On air' : 'Connect source'}</span>
          </p>
          {previewProg && (
            <div className="home-mini-live-progress" title={`${minsLeft} min left`}>
              <div className="home-mini-live-progress-fill" style={{ width: `${Math.round(progProgress * 100)}%` }} />
            </div>
          )}
        </div>
      </div>

      <div className="home-channels-box">
        <div className="home-channels-subtabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={`home-channels-tab-btn ${channelsTab === 'now' ? 'is-active' : ''}`}
            onClick={() => setChannelsTab('now')}
            aria-selected={channelsTab === 'now'}
          >
            On Now
          </button>
          <button
            type="button"
            role="tab"
            className={`home-channels-tab-btn ${channelsTab === 'next' ? 'is-active' : ''}`}
            onClick={() => setChannelsTab('next')}
            aria-selected={channelsTab === 'next'}
          >
            Next
          </button>
        </div>
        <div className="home-channels-list">
          {channels.length > 0 ? (
            channels.slice(0, 4).map((c) => {
              const prog = channelsTab === 'now' ? store.programmeAt(c, now) : store.nextProgramme(c, now)
              return (
                <Link
                  key={c.id}
                  to={`/live?channel=${encodeURIComponent(c.id)}`}
                  className="home-quick-channel-row"
                >
                  <span className="home-quick-ch-badge">{c.name.slice(0, 8)}</span>
                  <div className="home-quick-ch-info">
                    <span className="home-quick-ch-title">{prog?.title ?? c.name}</span>
                    <span className="home-quick-ch-time">
                      {prog ? `${clock(prog.start, store.prefs.timeFormat)} - ${clock(prog.stop, store.prefs.timeFormat)}` : 'Live broadcast'}
                    </span>
                  </div>
                  {channelsTab === 'now' && <span className="home-quick-live-tag">LIVE</span>}
                </Link>
              )
            })
          ) : (
            <div style={{ padding: '24px 12px', textAlign: 'center', color: '#8c93a3', fontSize: '0.8125rem' }}>
              No channels available yet.
            </div>
          )}
        </div>
      </div>

      <div className="home-quick-actions-bar" role="group" aria-label="Quick Navigation">
        <Link to="/live" className="home-quick-act-btn">
          <Icon name="calendar" size={18} />
          <span>TV Guide</span>
        </Link>
        <Link to="/recordings" className="home-quick-act-btn">
          <Icon name="record" size={18} />
          <span>Recordings</span>
        </Link>
        <Link to="/live?tab=reminders" className="home-quick-act-btn">
          <Icon name="bell" size={18} />
          <span>Reminders</span>
        </Link>
        <Link to="/library?tab=watchlist" className="home-quick-act-btn">
          <Icon name="star" size={18} />
          <span>Favourites</span>
        </Link>
      </div>

      <div className="home-library-hud">
        <Link to="/library" className="home-library-hud-header">
          <span>Your Library at a Glance</span>
          <Icon name="chevronRight" size={16} />
        </Link>
        <div className="home-library-hud-grid">
          <div className="home-library-hud-item">
            <Icon name="film" size={20} className="home-library-hud-icon" />
            <span className="home-library-hud-num">{totalMovies.toLocaleString()}</span>
            <span className="home-library-hud-label">Movies</span>
          </div>
          <div className="home-library-hud-item">
            <Icon name="tv" size={20} className="home-library-hud-icon" />
            <span className="home-library-hud-num">{totalSeries.toLocaleString()}</span>
            <span className="home-library-hud-label">TV Series</span>
          </div>
          <div className="home-library-hud-item">
            <Icon name="live" size={20} className="home-library-hud-icon" />
            <span className="home-library-hud-num">{totalChannels.toLocaleString()}</span>
            <span className="home-library-hud-label">Channels</span>
          </div>
          <div className="home-library-hud-item">
            <Icon name="database" size={20} className="home-library-hud-icon" />
            <span className="home-library-hud-num">{storageText}</span>
            <span className="home-library-hud-label">Local Media</span>
          </div>
        </div>
      </div>
    </aside>
  )
}

interface HomeQuickJumpProps {
  className?: string
}

const QUICK_JUMP_DESTINATIONS = [
  { to: '/live', label: 'Live TV', icon: 'live' as const, badge: 'On Air' },
  { to: '/movies', label: 'Movies', icon: 'film' as const },
  { to: '/series', label: 'Series', icon: 'series' as const },
  { to: '/recordings', label: 'Recordings', icon: 'record' as const },
  { to: '/library', label: 'Library', icon: 'library' as const },
  { to: '/sources', label: 'Sources', icon: 'sources' as const },
]

export function HomeQuickJump({ className = '' }: HomeQuickJumpProps) {
  return (
    <nav className={`home-quick-jump ${className}`.trim()} aria-label="Quick Jump Navigation">
      <div className="home-quick-jump-track">
        {QUICK_JUMP_DESTINATIONS.map((dest) => (
          <Link
            key={dest.to}
            to={dest.to}
            className="home-quick-jump-pill"
            aria-label={dest.label}
          >
            <span className="home-quick-jump-icon">
              <Icon name={dest.icon} size={18} />
            </span>
            <span className="home-quick-jump-label">{dest.label}</span>
            {dest.badge && <span className="home-quick-jump-badge">{dest.badge}</span>}
          </Link>
        ))}
      </div>
    </nav>
  )
}

function HomeAudioCard({
  resource,
  onPlay,
  isPlaying,
}: {
  resource: MediaResource
  onPlay: (r: MediaResource) => void
  isPlaying: boolean
}) {
  const isLogo = isLogoArtwork(resource)
  return (
    <button
      type="button"
      className={`card channel-card home-audio-card${isPlaying ? ' is-selected' : ''}`}
      onClick={() => onPlay(resource)}
      aria-label={`${resource.name}, ${resource.provider || 'Radio'}${isPlaying ? ', playing' : ''}`}
    >
      <div
        className="card-media card-shade home-audio-card-media"
        style={{
          background: `radial-gradient(ellipse at 70% 30%, ${
            resource.accentHue ? `hsl(${resource.accentHue} 40% 25% / 0.5)` : 'var(--surface-2)'
          } 0%, var(--surface) 100%)`,
        }}
      >
        <div className="home-audio-artwork-frame">
          {resource.artworkUrl ? (
            <Art
              src={resource.artworkUrl}
              alt={resource.name}
              contentId={resource.id}
              className={`home-audio-img${isLogo ? ' is-logo' : ''}`}
              fallbackIcon="radio"
            />
          ) : (
            <Icon name="radio" size={32} />
          )}
        </div>
        <span className="card-top">
          <span className="badge badge-accent">
            <Icon name="radio" size={12} />
            Radio
          </span>
          <span className="card-top-badges">
            {isPlaying && <span className="badge badge-live">Playing</span>}
          </span>
        </span>
        <span className="card-overlay home-audio-card-caption">
          <strong>{resource.name}</strong>
          <span className="faint">{resource.provider || 'Live Broadcast'}</span>
        </span>
        <span className="home-audio-play-badge" aria-hidden="true">
          <Icon name={isPlaying ? 'pause' : 'play'} size={16} />
        </span>
      </div>
    </button>
  )
}

function HomeLiveTvSetupBanner({ onLookAround }: { onLookAround?: () => void }) {
  return (
    <section className="home-setup-banner" aria-label="Connect Live Television">
      <div className="home-setup-banner-card">
        <div className="home-setup-banner-content">
          <span className="badge badge-accent">
            <Icon name="live" size={12} />
            Live TV Setup
          </span>
          <h2 className="home-setup-banner-title">Nothing to watch yet: Connect Playlists & Tuners</h2>
          <p className="home-setup-banner-desc">
            Kinora has no channels or films of its own. It plays the sources you add, such as your own TV tuner lineup or personal M3U playlists.
          </p>
          <div className="home-setup-banner-actions">
            <Link to="/setup" className="btn btn-primary">
              <Icon name="cog" size={16} />
              Set up Kinora
            </Link>
            <Link to="/sources/add" className="btn btn-secondary">
              <Icon name="plus" size={16} />
              Add your own source
            </Link>
            {onLookAround && (
              <button type="button" className="btn btn-ghost" onClick={onLookAround}>
                Look around with sample data
              </button>
            )}
          </div>
        </div>
        <div className="home-setup-banner-visual" aria-hidden="true">
          <div className="home-setup-timeline-wireframe">
            <div className="wireframe-row"><span className="wireframe-ch" /><span className="wireframe-prog w-40" /><span className="wireframe-prog w-60" /></div>
            <div className="wireframe-row"><span className="wireframe-ch" /><span className="wireframe-prog w-70" /><span className="wireframe-prog w-30" /></div>
            <div className="wireframe-row"><span className="wireframe-ch" /><span className="wireframe-prog w-50" /><span className="wireframe-prog w-50" /></div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function Home() {
  const now = useNow()
  const store = useStore()
  const toast = useToast()
  const { storageSummary, catalogue: localCatalogue } = useLocalMedia()
  const {
    library,
    prefs,
    setPref,
    channels,
    findChannel,
    channelMode,
    programmeAt,
    nextProgramme,
    demoTitles,
    xtreamSources,
    xtreamCatalogue,
    mediaLibrary,
    userPreferences,
  } = store

  const [customizeOpen, setCustomizeOpen] = useState(false)
  const { isKidsMode, activeProfile } = useProfiles()
  const profileId = activeProfile?.id ?? 'default'

  const homeSections = useMemo(() => {
    try {
      const raw = localStorage.getItem(`kinora.home_sections.v1.${profileId}`)
      if (raw) return JSON.parse(raw)
    } catch {}
    return userPreferences?.preferences.homeSectionsConfig ?? DEFAULT_HOME_SECTIONS
  }, [profileId, userPreferences?.preferences.homeSectionsConfig])

  const cardDensity = userPreferences?.preferences.cardDensity ?? 'comfortable'
  const isTvMode = store.prefs.viewMode === 'tv' || userPreferences?.preferences.viewMode === 'tv'

  // Central home feed data preparation with global deduplication
  const feed: HomeFeedData = useMemo(() => {
    return buildHomeFeed({
      now,
      demoTitles,
      isKidsMode,
      library,
      channels,
      findChannel,
      programmeAt,
      nextProgramme,
      allMovies: movies,
      allSeries: series,
      xtreamCatalogue,
      mediaLibrary,
      localCatalogue,
      userPreferences: {
        ratings: userPreferences?.preferences.ratings,
        dislikeFeedback: userPreferences?.preferences.dislikeFeedback,
        hiddenItems: userPreferences?.preferences.hiddenItems,
        cardDensity: userPreferences?.preferences.cardDensity,
      },
      prefsTimeFormat: prefs.timeFormat,
    })
  }, [
    now,
    demoTitles,
    isKidsMode,
    library,
    channels,
    findChannel,
    programmeAt,
    nextProgramme,
    xtreamCatalogue,
    mediaLibrary,
    localCatalogue,
    userPreferences?.preferences,
    prefs.timeFormat,
  ])

  const previewChannel = useMemo(() => {
    return feed.liveChannels[0]?.channel ?? channels[0]
  }, [feed.liveChannels, channels])

  // Map section IDs to renderers, strictly adhering to deduplicated feed data
  const sectionRenderers: Record<string, () => React.ReactNode> = {
    'continue-watching': () => {
      if (feed.continueWatching.length === 0) {
        return null
      }
      return (
        <ContentRail
          key="continue-watching"
          id="continue-watching"
          icon="play"
          title={demoTitles ? 'Continue Watching' : 'Jump Back In'}
          sub="Pick up where you left off"
          viewAll="/library?tab=history"
          layout="wide"
        >
          {feed.continueWatching.map((r) => (
            <WideCard
              key={r.ref}
              to={r.play}
              title={r.title}
              sub={`${r.kind === 'episode' ? r.meta : 'Movie'} · ${r.remainingFormatted}`}
              art={r.art}
              focus={r.focus}
              progress={r.progress}
              itemRef={r.ref}
              onDismiss={() => {
                const saved = library.progress[r.ref]
                store.removeProgress(r.ref)
                toast(`Removed “${r.title}” from Jump Back In`, {
                  label: 'Undo',
                  run: () => {
                    if (saved) {
                      store.restoreProgress(r.ref, saved)
                      toast(`Restored “${r.title}” to Jump Back In`)
                    }
                  },
                })
              }}
              playable
            />
          ))}
        </ContentRail>
      )
    },

    'live-tv-right-now': () => {
      if (feed.liveChannels.length > 0) {
        return (
          <ContentRail
            key="live-tv-right-now"
            id="live-tv-right-now"
            icon="live"
            title="Live TV Right Now"
            sub="Broadcasts on air right now"
            viewAll="/live"
            layout="wide"
          >
            {feed.liveChannels.slice(0, 16).map((item) => (
              <ChannelCard
                key={item.channel.id}
                channel={item.channel}
                now={item.now}
                next={item.next}
                to={`/live?channel=${item.channel.id}`}
                format={prefs.timeFormat}
                at={now}
              />
            ))}
          </ContentRail>
        )
      }
      if (!demoTitles) {
        return <HomeLiveTvSetupBanner key="live-tv-setup" onLookAround={() => setPref('demoMode', true)} />
      }
      return null
    },

    'trending-popular': () => {
      if (feed.movies.length === 0) return null
      return (
        <ContentRail
          key="trending-popular"
          id="trending-popular"
          icon="film"
          title="Movies"
          sub="Critically acclaimed and popular films"
          viewAll="/movies"
          layout="poster"
        >
          {feed.movies.map((m) => (
            m.isXtream ? (
              <XtreamPosterCard
                key={m.ref}
                to={m.to}
                title={m.title}
                artworkKey={m.artworkKey}
                line={m.line}
                year={typeof m.year === 'number' ? m.year : undefined}
              />
            ) : (
              <PosterCard
                key={m.ref}
                to={m.to}
                title={m.title}
                art={m.art}
                badges={m.badges}
                line={m.line}
              />
            )
          ))}
        </ContentRail>
      )
    },

    'series-rail': () => {
      if (feed.series.length === 0) return null
      return (
        <ContentRail
          key="series-rail"
          id="series-rail"
          icon="series"
          title="Series &amp; TV Shows"
          sub="Complete seasons and episodic archives"
          viewAll="/series"
          layout="poster"
        >
          {feed.series.map((s) => (
            s.isXtream ? (
              <XtreamPosterCard
                key={s.ref}
                to={s.to}
                title={s.title}
                artworkKey={s.artworkKey}
                line={s.line}
                year={typeof s.year === 'number' ? s.year : undefined}
              />
            ) : (
              <PosterCard
                key={s.ref}
                to={s.to}
                title={s.title}
                art={s.art}
                line={s.line}
              />
            )
          ))}
        </ContentRail>
      )
    },

    'cultural-vault': () => {
      if (feed.culturalVault.length === 0) return null
      return (
        <ContentRail
          key="cultural-vault"
          id="cultural-vault"
          icon="library"
          title="Cultural Film Vault &amp; Archives"
          sub="Curated classic cinema and national registries"
          viewAll="/movies"
          layout="poster"
        >
          {feed.culturalVault.map((r) => (
            <PosterCard
              key={r.id}
              to={r.to}
              title={r.title}
              art={r.art}
              line={r.line}
              flag={<><Icon name="library" size={10} />Archive</>}
            />
          ))}
        </ContentRail>
      )
    },

    'radio-audio': () => {
      if (feed.audioItems.length === 0) return null
      return (
        <ContentRail
          key="radio-audio"
          id="radio-audio"
          icon="radio"
          title="Live Radio &amp; Spoken Audio"
          sub="Personal Media Library"
          viewAll="/radio"
          layout="wide"
        >
          {feed.audioItems.slice(0, 8).map((r) => (
            <HomeAudioCard
              key={r.id}
              resource={r}
              onPlay={(res) => {
                if (mediaLibrary.currentAudio?.id === res.id) {
                  mediaLibrary.toggleAudioPlay()
                } else {
                  mediaLibrary.playAudio({
                    id: res.id,
                    name: res.name,
                    provider: res.provider,
                    streamUrl: res.playbackUrl ?? res.url,
                    artworkUrl: res.artworkUrl,
                    accentHue: res.accentHue,
                    mediaType: 'radio',
                  })
                }
              }}
              isPlaying={mediaLibrary.currentAudio?.id === r.id && mediaLibrary.isAudioPlaying}
            />
          ))}
        </ContentRail>
      )
    },

    'recommended-for-you': () => {
      const items = demoTitles ? feed.masterRecommendations.slice(0, 6) : feed.recommendations.recommendedForYou
      if (items.length === 0) return null
      return (
        <ContentRail
          key="recommended-for-you"
          id="recommended-for-you"
          icon="clapperboard"
          title="Recommended for You"
          sub="Personalised based on your ratings and library"
          viewAll="/movies"
          layout="poster"
        >
          {items.map((r) =>
            demoTitles ? (
              <PosterCard
                key={r.ref}
                to={r.to}
                title={r.title}
                art={r.art}
                focus={r.focus}
                badges={'badges' in r ? (r.badges as TechnicalFormat[]) : undefined}
                line={'year' in r && r.year ? `${r.year}` : undefined}
              />
            ) : (
              <XtreamPosterCard
                key={r.ref}
                to={r.to}
                title={r.title}
                artworkKey={'artworkKey' in r ? r.artworkKey : undefined}
                line={r.reason}
              />
            ),
          )}
        </ContentRail>
      )
    },

    'because-you-watched': () => {
      if (!feed.recommendations.becauseYouWatched) return null
      const filteredItems = feed.recommendations.becauseYouWatched.items.filter(
        (r) => (Boolean(r.art) || Boolean(r.artworkKey)) && !feed.continueWatching.some((cw) => cw.ref === r.ref),
      )
      if (filteredItems.length === 0) return null
      return (
        <ContentRail
          key="because-you-watched"
          id="because-you-watched"
          icon="sparkles"
          title={`Because You Watched ${feed.recommendations.becauseYouWatched.sourceTitle}`}
          sub="Titles sharing similar themes and genres"
          viewAll="/movies"
          layout="poster"
        >
          {filteredItems.map((r) =>
            demoTitles ? (
              <PosterCard
                key={r.ref}
                to={r.to}
                title={r.title}
                art={r.art}
                focus={r.focus}
                line={r.meta}
              />
            ) : (
              <XtreamPosterCard
                key={r.ref}
                to={r.to}
                title={r.title}
                artworkKey={r.artworkKey}
                line={r.meta}
              />
            ),
          )}
        </ContentRail>
      )
    },

    'favourites-rail': () => {
      const liveTopIds = new Set(feed.liveChannels.slice(0, 8).map((l) => l.channel.id))
      const uniqueFavourites = feed.favouriteChannels.filter((c) => !liveTopIds.has(c.id))
      if (uniqueFavourites.length === 0) return null
      return (
        <ContentRail
          key="favourites-rail"
          id="favourites-rail"
          icon="heart"
          title="Your Favourite Channels"
          sub="Quick access to channels you love"
          viewAll="/live?group=Favourites"
          layout="wide"
        >
          {uniqueFavourites.map((c) => (
            <ChannelCard
              key={c.id}
              channel={c}
              now={programmeAt(c, now)}
              next={nextProgramme(c, now)}
              to={`/live?channel=${c.id}`}
              format={prefs.timeFormat}
              at={now}
            />
          ))}
        </ContentRail>
      )
    },

    // Legacy section mapping for existing profile compatibility
    'recently-added': () => {
      // If cultural vault is already an active section, render recently added titles
      if (feed.recentlyAdded.length === 0) return null
      return (
        <ContentRail
          key="recently-added"
          id="recently-added"
          icon="film"
          title="Recently Added"
          sub="Latest arrivals across all genres"
          viewAll="/movies"
          layout="poster"
        >
          {feed.recentlyAdded.map((t) => (
            <PosterCard
              key={t.id}
              to={t.kind === 'movie' ? `/movies/${t.id}` : `/series/${t.id}`}
              title={t.title}
              art={t.art}
              focus={t.focus}
              line={t.kind === 'movie' ? `${t.year} · ${t.genres[0]}` : `${t.seasons.length} ${t.seasons.length === 1 ? 'Season' : 'Seasons'} · ${t.genres[0]}`}
            />
          ))}
        </ContentRail>
      )
    },

    'scifi-space': () => null,
    'crime-drama': () => null,
    'action-adventure': () => null,
    'comedy-entertainment': () => null,
  }

  const activeSections = useMemo(() => {
    const visibleSections = [...homeSections].filter((s) => s.visible !== false)

    // Ensure series-rail and cultural-vault exist in the list if missing from an older saved profile
    if (!visibleSections.some((s) => s.id === 'series-rail')) {
      const movieIdx = visibleSections.findIndex((s) => s.id === 'trending-popular')
      const insertAt = movieIdx >= 0 ? movieIdx + 1 : visibleSections.length
      visibleSections.splice(insertAt, 0, { id: 'series-rail', title: 'Series & TV Shows', visible: true, order: 4 })
    }
    if (!visibleSections.some((s) => s.id === 'cultural-vault')) {
      visibleSections.push({ id: 'cultural-vault', title: 'Cultural Film Vault & Archives', visible: true, order: 7 })
    }

    if (isTvMode) {
      // In TV Mode, enforce television launcher hierarchy:
      // 1. Continue Watching
      // 2. Live On Air
      // 3. Movies
      // 4. Series & TV Shows
      // Followed by remaining enabled sections in their configured order
      const tvPriorityOrder = ['continue-watching', 'live-tv-right-now', 'trending-popular', 'series-rail']
      const prioritized: typeof homeSections = []

      for (const id of tvPriorityOrder) {
        const found = visibleSections.find((s) => s.id === id)
        if (found) {
          prioritized.push(found)
        }
      }

      const remaining = visibleSections
        .filter((s) => !tvPriorityOrder.includes(s.id))
        .sort((a, b) => a.order - b.order)

      return [...prioritized, ...remaining]
    }

    return visibleSections.sort((a, b) => a.order - b.order)
  }, [homeSections, isTvMode])

  const renderedSections = activeSections
    .map((s) => sectionRenderers[s.id]?.())
    .filter(Boolean)

  // Drawer state: transient, starts closed, never saved open
  const [hubOpen, setHubOpen] = useState(false)
  const hubCollapsed = !hubOpen
  const hubToggleRef = useRef<HTMLButtonElement>(null)
  const toggleHub = () => setHubOpen((o) => !o)
  const closeHub = () => {
    setHubOpen(false)
    hubToggleRef.current?.focus()
  }

  useEffect(() => {
    if (!hubOpen) return
    document.querySelector<HTMLButtonElement>('.home-side-hub-collapse-btn')?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setHubOpen(false)
        hubToggleRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [hubOpen])

  return (
    <div className="home-smarttv-wrapper">
      <PageHeader
        actions={
          <button
            type="button"
            ref={hubToggleRef}
            className={`header-hub-toggle-btn${hubCollapsed ? '' : ' is-active'}`}
            aria-label={hubCollapsed ? 'Open Live & Library panel' : 'Close Live & Library panel'}
            aria-expanded={!hubCollapsed}
            aria-controls="home-side-hub"
            onClick={toggleHub}
          >
            <Icon name="live" size={18} />
            <span className="header-hub-btn-label">Live &amp; Library</span>
          </button>
        }
      />
      <div className="home-layout-container">
        <div className="home-main-flow">
          <HomeHero
            slides={feed.featuredSlides}
            previewChannel={previewChannel}
          />
          <HomeQuickJump />
          <div className={`page stack home-body home-density-${cardDensity}`}>
            {!demoTitles && (
              <div className="home-rails-header">
                <span className="home-rails-kicker">Curated For You</span>
                <button
                  type="button"
                  className="home-customise-btn"
                  onClick={() => setCustomizeOpen(true)}
                  title="Personalise Discovery Rails and Display Density"
                >
                  <Icon name="cog" size={13} />
                  Personalise Home
                </button>
              </div>
            )}

            {renderedSections}

            <p className="footer-note faint">
              {channelMode === 'playlists'
                ? `Channels come from your imported playlists (${NOT_TESTED.toLowerCase()}). ${xtreamSources.length > 0 ? 'Films and series come from your provider.' : 'Kinora has no source for films and series yet.'}`
                : 'Sample mode: movies, series, channels and the guide are fictional, and nothing is streamed. Add a source, or turn sample mode off in Settings › Data.'}
            </p>

            <HomeCustomizeModal open={customizeOpen} onClose={() => setCustomizeOpen(false)} />
          </div>
        </div>

        {/* Overlay backdrop when companion drawer is open */}
        {!hubCollapsed && (
          <div
            className="home-side-hub-backdrop"
            onClick={closeHub}
            aria-hidden="true"
          />
        )}

        <HomeSideHub
          channels={channels}
          now={now}
          previewChannel={previewChannel}
          totalMovies={(demoTitles ? movies.length : 0) + xtreamCatalogue.movies.length + (localCatalogue?.movies?.length || 0)}
          totalSeries={(demoTitles ? series.length : 0) + xtreamCatalogue.series.length + (localCatalogue?.series?.length || 0)}
          totalChannels={channels.length || (demoTitles ? 45 : 0)}
          storageText={
            storageSummary
              ? storageSummary.availableDiskBytes >= 1024 ** 4
                ? `${(storageSummary.availableDiskBytes / 1024 ** 4).toFixed(1)} TB Free`
                : `${Math.round(storageSummary.availableDiskBytes / 1024 ** 3)} GB Free`
              : '0 B Indexed'
          }
          collapsed={hubCollapsed}
          onToggleCollapse={closeHub}
        />
      </div>
    </div>
  )
}
