import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { movies, series } from '../data/catalog'
import { movieRef, seriesRef, channelRef } from '../data/refs'
import type { Movie, Series, Channel } from '../data/types'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { ChannelCard, PosterCard, Section, WideCard, XtreamArt, XtreamPosterCard, idleLabel } from '../components/Tiles'
import { ContentRail } from '../components/ContentRail'
import { useToast } from '../components/Toast'
import { ChannelMark, Art } from '../components/ui'
import { type TechnicalFormat } from '../components/TechnicalBadges'
import { filterKidSafeChannels, filterKidSafeTitles, filterKidSafeXtreamTitles, isRefKidSafe } from '../lib/kidsMode'
import { continueWatching } from '../lib/library'
import { useNow, clock } from '../lib/time'
import { NOT_TESTED } from '../state/playlists'
import { useProfiles } from '../state/profiles'
import { useStore } from '../state/store'
import { useLocalMedia } from '../state/localMedia'
import { isLogoArtwork } from '../components/ResourceCard'
import type { MediaResource } from '../data/personalLibrary'
import { computeRecommendations } from '../lib/recommendations'
import { HomeCustomizeModal } from '../components/HomeCustomizeModal'
import { DEFAULT_HOME_SECTIONS } from '../state/userPreferences'
import {
  selectFeaturedSlides,
  hasGenuineProgrammeArt,
  isValidProgrammeTitle,
  type FeaturedSlide,
} from '../lib/featuredSelection'
import './Home.css'

interface HomeHeroProps {
  slides: FeaturedSlide[]
  channels: Channel[]
  now: number
  totalMovies: number
  totalSeries: number
  totalChannels: number
  storageText: string
}

function HomeHero({
  slides,
  channels,
  now,
  totalMovies,
  totalSeries,
  totalChannels,
  storageText,
}: HomeHeroProps) {
  const store = useStore()
  const toast = useToast()
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [channelsTab, setChannelsTab] = useState<'now' | 'next'>('now')

  const currentSlide = slides[carouselIndex % Math.max(1, slides.length)]
  const previewChannel = useMemo(() => {
    return channels.find((c) => Boolean(store.programmeAt(c, now))) ?? channels[0]
  }, [channels, store, now])
  const previewProg = previewChannel ? store.programmeAt(previewChannel, now) : undefined

  const inLibrary = currentSlide ? (
    currentSlide.kind === 'live'
      ? store.library.favourites.includes(currentSlide.ref)
      : store.library.watchlist.includes(currentSlide.ref)
  ) : false

  const progProgress = previewProg && previewProg.stop > previewProg.start
    ? Math.min(1, Math.max(0, (now - previewProg.start) / (previewProg.stop - previewProg.start)))
    : 0.5
  const minsLeft = previewProg && previewProg.stop > now
    ? Math.max(1, Math.round((previewProg.stop - now) / 60000))
    : 0

  return (
    <div className="home-smarttv-wrapper">
      <PageHeader />
      <div className="home-smarttv-top-stage">
        {/* Left Column: Cinematic Hero */}
        <section className="hero home-hero-cinematic" aria-labelledby="hero-title">
          {currentSlide && (
            <div className="home-hero-art-layer">
              {currentSlide.art ? (
                <Art src={currentSlide.art} alt={currentSlide.title} contentId={currentSlide.ref} eager className="home-hero-art" />
              ) : currentSlide.artworkKey ? (
                <XtreamArt artworkKey={currentSlide.artworkKey} fallbackTitle={currentSlide.title} eager />
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
              {currentSlide?.kicker ?? 'Featured'}
            </span>
            <h1 id="hero-title" className="home-hero-main-title">
              {currentSlide?.title ?? (previewChannel?.name ? `${previewChannel.name} Live` : 'Kinora')}
            </h1>
            <div className="home-hero-meta">
              {currentSlide?.yearOrYears && <span>{currentSlide.yearOrYears}</span>}
              {currentSlide?.genres?.length ? (
                <>
                  {currentSlide.yearOrYears && <span>•</span>}
                  <span>{currentSlide.genres.slice(0, 2).join(', ')}</span>
                </>
              ) : null}
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
                <Icon name={inLibrary ? 'check' : 'bookmark'} size={18} />
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

        {/* Right Column: Live TV & Library Hub */}
        <aside className="home-side-hub" aria-label="Live TV and Library Hub">
          {/* Mini Live Player Preview */}
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
                <div style={{ width: '100%', height: '100%', background: '#0a0d12' }} />
              )}
              <div className="home-mini-live-controls">
                <div className="home-mini-live-controls-left">
                  <button type="button" className="home-mini-ctrl-btn" aria-label="Play or pause stream">
                    <Icon name="play" size={16} />
                  </button>
                  <button type="button" className="home-mini-ctrl-btn" aria-label="Mute volume">
                    <Icon name="volume" size={16} />
                  </button>
                </div>
                <div className="home-mini-live-controls-right">
                  <button type="button" className="home-mini-ctrl-btn" aria-label="Subtitles">
                    <Icon name="subtitles" size={16} />
                  </button>
                  <button type="button" className="home-mini-ctrl-btn" aria-label="Picture in Picture">
                    <Icon name="pip" size={16} />
                  </button>
                  {previewChannel && (
                    <Link to={`/watch/${encodeURIComponent(channelRef(previewChannel.id))}`} className="home-mini-ctrl-btn" aria-label="Fullscreen">
                      <Icon name="fullscreen" size={16} />
                    </Link>
                  )}
                </div>
              </div>
            </div>
            <div className="home-mini-live-meta">
              <h3 className="home-mini-live-title">
                {previewProg?.title ?? (previewChannel ? `${previewChannel.name} Live` : 'Live Broadcast')}
              </h3>
              <p className="home-mini-live-sub">
                <span>{previewChannel?.name ?? 'Live Channel'}{previewProg?.category ? ` • ${previewProg.category}` : ''}</span>
                <span>{previewProg ? `${clock(previewProg.start, store.prefs.timeFormat)} - ${clock(previewProg.stop, store.prefs.timeFormat)}` : 'On air'}</span>
              </p>
              {previewProg && (
                <div className="home-mini-live-progress" title={`${minsLeft} min left`}>
                  <div className="home-mini-live-progress-fill" style={{ width: `${Math.round(progProgress * 100)}%` }} />
                </div>
              )}
            </div>
          </div>

          {/* Quick Channels Card with On Now / Next Sub-tabs */}
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
              {channels.slice(0, 4).map((c) => {
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
              })}
            </div>
          </div>

          {/* Quick Actions Row */}
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

          {/* Your Library at a Glance HUD */}
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
      </div>
    </div>
  )
}


function formatRemainingTime(seconds: number): string {
  const totalMins = Math.max(1, Math.round(seconds / 60))
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  if (h > 0) {
    return `${h}h ${String(m).padStart(2, '0')} min left`
  }
  return `${m} min left`
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
    <div
      className={`card channel-card home-audio-card${isPlaying ? ' is-selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onPlay(resource)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onPlay(resource)
        }
      }}
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
        <button
          type="button"
          className="home-audio-play-badge"
          aria-label={isPlaying ? `Pause ${resource.name}` : `Play ${resource.name}`}
          onClick={(e) => {
            e.stopPropagation()
            onPlay(resource)
          }}
        >
          <Icon name={isPlaying ? 'pause' : 'play'} size={16} />
        </button>
      </div>
    </div>
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

  const safeMovies = useMemo(() => filterKidSafeTitles(movies, isKidsMode), [isKidsMode])
  const safeSeries = useMemo(() => filterKidSafeTitles(series, isKidsMode), [isKidsMode])
  const safeXtreamMovies = useMemo(() => filterKidSafeXtreamTitles(xtreamCatalogue.movies, isKidsMode), [xtreamCatalogue.movies, isKidsMode])
  const safeXtreamSeries = useMemo(() => filterKidSafeXtreamTitles(xtreamCatalogue.series, isKidsMode), [xtreamCatalogue.series, isKidsMode])

  const publicFilms = useMemo(() => {
    return mediaLibrary.allResources.filter(
      (r) =>
        r.category === 'movies' ||
        r.category === 'films' ||
        r.subcategory.includes('film') ||
        r.subcategory.includes('cinema') ||
        r.subcategory.includes('archive'),
    )
  }, [mediaLibrary.allResources])

  const publicSeries = useMemo(() => {
    return mediaLibrary.allResources.filter(
      (r) =>
        r.category === 'series' ||
        r.category === 'tv' ||
        r.subcategory.includes('series') ||
        r.subcategory.includes('broadcasting'),
    )
  }, [mediaLibrary.allResources])

  const ratings = userPreferences?.preferences.ratings ?? {}
  const hiddenItems = userPreferences?.preferences.hiddenItems ?? []
  const homeSections = useMemo(() => {
    try {
      const raw = localStorage.getItem(`kinora.home_sections.v1.${profileId}`)
      if (raw) return JSON.parse(raw)
    } catch {}
    return userPreferences?.preferences.homeSectionsConfig ?? DEFAULT_HOME_SECTIONS
  }, [profileId, userPreferences?.preferences.homeSectionsConfig])
  const cardDensity = userPreferences?.preferences.cardDensity ?? 'comfortable'

  const resume = continueWatching(library, demoTitles)
  const safeResume = useMemo(() => {
    if (!isKidsMode) return resume
    const findTitle = (id: string) => movies.find((m) => m.id === id) ?? series.find((s) => s.id === id)
    return resume.filter((item) => isRefKidSafe(item.ref, true, findChannel, findTitle))
  }, [resume, isKidsMode, findChannel])

  const safeChannelsList = useMemo(() => filterKidSafeChannels(channels, isKidsMode), [channels, isKidsMode])

  const featuredSlides = useMemo(() => {
    return selectFeaturedSlides({
      now,
      demoTitles,
      isKidsMode,
      demoMovies: safeMovies,
      demoSeries: safeSeries,
      channels: safeChannelsList,
      programmeAt,
      xtreamCatalogue,
      mediaLibrary:
        mediaLibrary.mySources.length > 0
          ? mediaLibrary.mySources.map((s) => s.resource)
          : mediaLibrary.allResources,
      favourites: library.favourites,
      timeFormat: prefs.timeFormat,
    })
  }, [
    now,
    demoTitles,
    isKidsMode,
    safeMovies,
    safeSeries,
    safeChannelsList,
    programmeAt,
    xtreamCatalogue,
    mediaLibrary.mySources,
    mediaLibrary.allResources,
    library.favourites,
    prefs.timeFormat,
  ])

  // Channels with active programmes and genuine EPG artwork first, followed by remaining on-air and other channels
  const onNowChannels = [
    ...safeChannelsList.filter((c) => {
      const p = programmeAt(c, now)
      return hasGenuineProgrammeArt(p) && isValidProgrammeTitle(p)
    }),
    ...safeChannelsList.filter((c) => {
      const p = programmeAt(c, now)
      return Boolean(p) && !(hasGenuineProgrammeArt(p) && isValidProgrammeTitle(p))
    }),
    ...safeChannelsList.filter((c) => !programmeAt(c, now)),
  ]

  // Filter hidden channels out of onNowChannels
  const visibleOnNow = onNowChannels.filter((c) => !hiddenItems.includes(channelRef(c.id)))

  // Deterministic local recommendation engine
  const recs = computeRecommendations({
    ratings,
    dislikeFeedback: userPreferences?.preferences.dislikeFeedback ?? {},
    history: library.history,
    favourites: library.favourites,
    watchlist: library.watchlist,
    hiddenItems,
    demoTitles,
    demoMovies: safeMovies,
    demoSeries: safeSeries,
    channels: safeChannelsList,
    xtreamMovies: safeXtreamMovies,
    xtreamSeries: safeXtreamSeries,
    programmeAt,
    now,
  })

  // Master reference curated recommendations for 100% visual parity
  const masterRefRecommendations = useMemo(() => {
    if (!demoTitles) return []
    const masterDefs: Array<{ id: string; badges: TechnicalFormat[] }> = [
      { id: 'the-outpost', badges: ['4K'] },
      { id: 'neon-district', badges: ['4K', 'HDR'] },
      { id: 'silent-tide', badges: ['4K'] },
      { id: 'the-archive', badges: ['4K'] },
      { id: 'valley-of-ashes', badges: ['4K'] },
      { id: 'redline', badges: ['4K', 'HDR'] },
    ]
    const list = masterDefs
      .map(({ id, badges }) => {
        const m = movies.find((item) => item.id === id)
        if (!m) return null
        return {
          ref: movieRef(m.id),
          to: `/movies/${m.id}`,
          title: m.title.toUpperCase(),
          art: m.art,
          focus: m.focus,
          badges,
          reason: undefined as string | undefined,
        }
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))

    const masterIds = new Set(masterDefs.map((d) => `movie:${d.id}`))
    for (const r of recs.recommendedForYou) {
      if (!masterIds.has(r.ref) && !hiddenItems.includes(r.ref)) {
        list.push({
          ref: r.ref,
          to: r.to,
          title: r.title,
          art: r.art,
          focus: r.focus ?? 50,
          badges: ['4K'],
          reason: r.reason,
        })
      }
    }
    return list.filter((item) => !hiddenItems.includes(item.ref))
  }, [demoTitles, hiddenItems, recs.recommendedForYou])

  // Data-driven content collections from genuine catalogue items
  const trendingTitles = [
    safeMovies.find((m) => m.id === 'salt-meridian'),
    safeSeries.find((s) => s.id === 'ninth-ward'),
    safeMovies.find((m) => m.id === 'harbour-lights'),
    safeSeries.find((s) => s.id === 'fathom'),
    safeMovies.find((m) => m.id === 'low-orbit'),
    safeSeries.find((s) => s.id === 'kingsmoor'),
    safeMovies.find((m) => m.id === 'undertow'),
    safeSeries.find((s) => s.id === 'static'),
    safeMovies.find((m) => m.id === 'glasshouse'),
    safeSeries.find((s) => s.id === 'wildfire-season'),
    safeMovies.find((m) => m.id === 'copper-saints'),
    safeSeries.find((s) => s.id === 'understudies'),
  ]
    .filter((t): t is Movie | Series => Boolean(t))
    .filter((t) => !hiddenItems.includes(t.kind === 'movie' ? movieRef(t.id) : seriesRef(t.id)))

  const scifiTitles = [...safeMovies, ...safeSeries].filter((t) =>
    t.genres.some((g) => {
      const lower = g.toLowerCase()
      return lower.includes('science') || lower.includes('space') || lower.includes('fantasy')
    }) && !hiddenItems.includes(t.kind === 'movie' ? movieRef(t.id) : seriesRef(t.id))
  )

  const crimeDramaTitles = isKidsMode ? [] : [...safeMovies, ...safeSeries].filter((t) =>
    t.genres.some((g) => ['crime', 'drama', 'mystery'].includes(g.toLowerCase())) &&
    !t.genres.some((g) => g.toLowerCase().includes('science')) &&
    !hiddenItems.includes(t.kind === 'movie' ? movieRef(t.id) : seriesRef(t.id))
  )

  const actionTitles = [...safeMovies, ...safeSeries].filter((t) =>
    t.genres.some((g) => ['action', 'thriller', 'western', 'adventure'].includes(g.toLowerCase())) &&
    !t.genres.some((g) => g.toLowerCase().includes('science')) &&
    !hiddenItems.includes(t.kind === 'movie' ? movieRef(t.id) : seriesRef(t.id))
  )

  const comedyTitles = [...safeMovies, ...safeSeries].filter((t) =>
    t.genres.some((g) => ['comedy', 'animation', 'family'].includes(g.toLowerCase())) &&
    !hiddenItems.includes(t.kind === 'movie' ? movieRef(t.id) : seriesRef(t.id))
  )

  const recentlyAdded = [...safeMovies, ...safeSeries]
    .filter((t) => !hiddenItems.includes(t.kind === 'movie' ? movieRef(t.id) : seriesRef(t.id)))
    .sort((a, b) => b.added.localeCompare(a.added))
    .slice(0, 12)

  const favChannels = library.favourites
    .filter((r) => r.startsWith('channel:') && !hiddenItems.includes(r))
    .map((r) => findChannel(r.slice(8)))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))

  const shortcuts = [
    { to: '/library?tab=watchlist', label: 'Watchlist', count: library.watchlist.length, icon: 'bookmark' as const },
    { to: '/library?tab=favourites', label: 'Favourites', count: library.favourites.length, icon: 'heart' as const },
    { to: '/library?tab=collections', label: 'Collections', count: library.collections.length, icon: 'folder' as const },
    { to: '/library?tab=history', label: 'Recently watched', count: library.history.length, icon: 'history' as const },
  ]

  const sectionRenderers: Record<string, () => React.ReactNode> = {
    'continue-watching': () => {
      const items = demoTitles ? safeResume.slice(0, 4) : safeResume
      if (items.length > 0) {
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
            {items.map((r) => (
              <WideCard
                key={r.ref}
                to={r.play}
                title={r.title}
                sub={`${r.kind === 'episode' ? r.meta : 'Movie'} · ${formatRemainingTime(r.secondsLeft)}`}
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
      }
      if (!demoTitles) {
        return (
          <ContentRail
            key="jump-back-in"
            id="jump-back-in"
            icon="play"
            title="Jump Back In"
            sub="Quick access across your media lineup"
            layout="wide"
          >
            <Link to="/live" className="card wide-card home-empty-action-card">
              <div className="card-media card-shade home-action-card-media">
                <div className="home-action-icon"><Icon name="calendar" size={28} /></div>
                <span className="card-top"><span className="badge badge-accent">Live TV</span></span>
                <span className="card-overlay">
                  <strong>Full TV Guide & Channels</strong>
                  <span className="faint">Browse complete electronic programme guide</span>
                </span>
              </div>
            </Link>
            <Link to="/movies" className="card wide-card home-empty-action-card">
              <div className="card-media card-shade home-action-card-media">
                <div className="home-action-icon"><Icon name="film" size={28} /></div>
                <span className="card-top"><span className="badge badge-accent">Cinema</span></span>
                <span className="card-overlay">
                  <strong>Browse Movies & Cinema</strong>
                  <span className="faint">Explore full film catalogue and archives</span>
                </span>
              </div>
            </Link>
            <Link to="/radio" className="card wide-card home-empty-action-card">
              <div className="card-media card-shade home-action-card-media">
                <div className="home-action-icon"><Icon name="radio" size={28} /></div>
                <span className="card-top"><span className="badge badge-accent">Audio</span></span>
                <span className="card-overlay">
                  <strong>Live Radio & Audio</strong>
                  <span className="faint">Listen to world radio streams and broadcasts</span>
                </span>
              </div>
            </Link>
            <Link to="/sources" className="card wide-card home-empty-action-card">
              <div className="card-media card-shade home-action-card-media">
                <div className="home-action-icon"><Icon name="plus" size={28} /></div>
                <span className="card-top"><span className="badge badge-accent">Sources</span></span>
                <span className="card-overlay">
                  <strong>Sources & Playlists</strong>
                  <span className="faint">Add M3U playlists, guides or Xtream accounts</span>
                </span>
              </div>
            </Link>
          </ContentRail>
        )
      }
      return null
    },

    'recommended-for-you': () => {
      const items = demoTitles ? masterRefRecommendations.slice(0, 6) : recs.recommendedForYou
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

    'live-tv-right-now': () =>
      visibleOnNow.length > 0 ? (
        <ContentRail
          key="live-tv-right-now"
          id="live-tv-right-now"
          icon="live"
          title="Live TV Right Now"
          sub="Broadcasts on air right now"
          viewAll="/live"
          layout="wide"
        >
          {visibleOnNow.slice(0, 16).map((c) => (
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
      ) : !demoTitles ? (
        <HomeLiveTvSetupBanner key="live-tv-setup" onLookAround={() => setPref('demoMode', true)} />
      ) : null,

    'because-you-watched': () =>
      recs.becauseYouWatched ? (
        <ContentRail
          key="because-you-watched"
          id="because-you-watched"
          icon="sparkles"
          title={`Because You Watched ${recs.becauseYouWatched.sourceTitle}`}
          sub="Titles sharing similar themes and genres"
          viewAll="/movies"
          layout="poster"
        >
          {recs.becauseYouWatched.items.map((r) =>
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
      ) : null,

    'trending-popular': () =>
      demoTitles
        ? trendingTitles.length > 0 ? (
            <ContentRail
              key="trending-popular"
              id="trending-popular"
              icon="film"
              title="Trending & Popular"
              sub="Critically acclaimed movies and series"
              viewAll="/movies"
              layout="poster"
            >
              {trendingTitles.map((t) => (
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
          ) : null
        : safeXtreamMovies.length > 0 ? (
            <ContentRail
              key="xtream-movies"
              id="xtream-movies"
              icon="film"
              title="Movies"
              sub="From your provider"
              viewAll="/movies"
              layout="poster"
            >
              {safeXtreamMovies.map((m) => (
                <XtreamPosterCard
                  key={`${m.sourceId}:${m.id}`}
                  to={`/movies/${encodeURIComponent(`xt:${m.sourceId}:${m.id}`)}`}
                  title={m.name}
                  artworkKey={m.artworkKey}
                  line={m.year ? String(m.year) : undefined}
                  year={m.year}
                />
              ))}
            </ContentRail>
          ) : publicFilms.length > 0 ? (
            <ContentRail
              key="public-cinema"
              id="public-cinema"
              icon="film"
              title="Public Cinema & Cultural Film Archives"
              sub="Curated classic cinema and national registries"
              viewAll="/movies"
              layout="poster"
            >
              {publicFilms.slice(0, 10).map((r) => (
                <PosterCard
                  key={r.id}
                  to={`/movies/${encodeURIComponent(r.id)}`}
                  title={r.name}
                  art={r.artworkUrl}
                  line={[r.provider, r.subcategory].filter(Boolean).join(' · ')}
                  flag={<><Icon name="library" size={10} />Archive</>}
                />
              ))}
            </ContentRail>
          ) : null,

    'radio-audio': () =>
      mediaLibrary.allResources.length > 0 ? (
        <ContentRail
          key="radio-audio"
          id="radio-audio"
          icon="radio"
          title="Live Radio & Spoken Audio"
          sub="Personal Media Library"
          viewAll="/radio"
          layout="wide"
        >
          {mediaLibrary.allResources.filter((r) => r.category === 'radio' && r.playbackUrl).slice(0, 8).map((r) => (
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
      ) : null,

    'favourites-rail': () =>
      favChannels.length > 0 ? (
        <ContentRail
          key="favourites-rail"
          id="favourites-rail"
          icon="heart"
          title="Your Favourite Channels"
          sub="Quick access to channels you love"
          viewAll="/live?group=Favourites"
          layout="wide"
        >
          {favChannels.map((c) => (
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
      ) : null,

    'scifi-space': () => {
      if (demoTitles) {
        if (scifiTitles.length === 0) return null
        return (
          <ContentRail
            key="scifi-space"
            id="scifi-space"
            icon="film"
            title="Sci-Fi & Space Exploration"
            sub="Distant worlds and future frontiers"
            viewAll="/movies?genre=Science%20fiction"
            layout="poster"
          >
            {scifiTitles.map((t) => (
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
      }
      const realScifi = publicFilms.filter(
        (r) =>
          r.tags?.some((tag) => ['space', 'science', 'scifi', 'nasa', 'astronomy', 'cosmos'].includes(tag.toLowerCase())) ||
          r.subcategory.toLowerCase().includes('space') ||
          r.subcategory.toLowerCase().includes('science'),
      )
      if (realScifi.length === 0) return null
      return (
        <ContentRail
          key="scifi-space"
          id="scifi-space"
          icon="film"
          title="Sci-Fi & Space Exploration"
          sub="Science fiction archives and deep space exploration"
          viewAll="/movies"
          layout="poster"
        >
          {realScifi.slice(0, 10).map((r) => (
            <PosterCard
              key={r.id}
              to={`/movies/${encodeURIComponent(r.id)}`}
              title={r.name}
              art={r.artworkUrl}
              line={[r.provider, r.subcategory].filter(Boolean).join(' · ')}
              flag={<><Icon name="library" size={10} />Archive</>}
            />
          ))}
        </ContentRail>
      )
    },

    'crime-drama': () => {
      if (demoTitles) {
        if (crimeDramaTitles.length === 0) return null
        return (
          <ContentRail
            key="crime-drama"
            id="crime-drama"
            icon="film"
            title="Crime & Psychological Drama"
            sub="Gripping investigations and moral dilemmas"
            viewAll="/movies?genre=Crime"
            layout="poster"
          >
            {crimeDramaTitles.map((t) => (
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
      }
      const realDrama = publicFilms.filter(
        (r) =>
          r.tags?.some((tag) => ['mystery', 'crime', 'drama', 'thriller', 'detective', 'film-noir'].includes(tag.toLowerCase())) ||
          r.subcategory.toLowerCase().includes('drama') ||
          r.subcategory.toLowerCase().includes('mystery'),
      )
      if (realDrama.length === 0) return null
      return (
        <ContentRail
          key="crime-drama"
          id="crime-drama"
          icon="film"
          title="Mystery & Classical Drama"
          sub="Suspense, film noir and psychological narratives"
          viewAll="/movies"
          layout="poster"
        >
          {realDrama.slice(0, 10).map((r) => (
            <PosterCard
              key={r.id}
              to={`/movies/${encodeURIComponent(r.id)}`}
              title={r.name}
              art={r.artworkUrl}
              line={[r.provider, r.subcategory].filter(Boolean).join(' · ')}
              flag={<><Icon name="library" size={10} />Archive</>}
            />
          ))}
        </ContentRail>
      )
    },

    'action-adventure': () => {
      if (demoTitles) {
        if (actionTitles.length === 0) return null
        return (
          <ContentRail
            key="action-adventure"
            id="action-adventure"
            icon="film"
            title="Action & Adventure"
            sub="High-octane missions, chases and survival"
            viewAll="/movies?genre=Action"
            layout="poster"
          >
            {actionTitles.map((t) => (
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
      }
      const realAction = publicFilms.filter(
        (r) =>
          r.tags?.some((tag) => ['action', 'adventure', 'western', 'thriller', 'expedition'].includes(tag.toLowerCase())) ||
          r.subcategory.toLowerCase().includes('action') ||
          r.subcategory.toLowerCase().includes('adventure'),
      )
      if (realAction.length === 0) return null
      return (
        <ContentRail
          key="action-adventure"
          id="action-adventure"
          icon="film"
          title="Action & Classical Adventure"
          sub="High-stakes epics and cinematic expeditions"
          viewAll="/movies"
          layout="poster"
        >
          {realAction.slice(0, 10).map((r) => (
            <PosterCard
              key={r.id}
              to={`/movies/${encodeURIComponent(r.id)}`}
              title={r.name}
              art={r.artworkUrl}
              line={[r.provider, r.subcategory].filter(Boolean).join(' · ')}
              flag={<><Icon name="library" size={10} />Archive</>}
            />
          ))}
        </ContentRail>
      )
    },

    'comedy-entertainment': () => {
      if (demoTitles) {
        if (comedyTitles.length === 0) return null
        return (
          <ContentRail
            key="comedy-entertainment"
            id="comedy-entertainment"
            icon="film"
            title="Comedy & Family Entertainment"
            sub="Lighter moments and animated tales"
            viewAll="/movies?genre=Animation"
            layout="poster"
          >
            {comedyTitles.map((t) => (
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
      }
      const realComedy = publicFilms.filter(
        (r) =>
          r.tags?.some((tag) => ['comedy', 'animation', 'humor', 'family', 'silent-comedy'].includes(tag.toLowerCase())) ||
          r.subcategory.toLowerCase().includes('comedy') ||
          r.subcategory.toLowerCase().includes('animation'),
      )
      if (realComedy.length === 0) return null
      return (
        <ContentRail
          key="comedy-entertainment"
          id="comedy-entertainment"
          icon="film"
          title="Comedy & Animation Classics"
          sub="Timeless humor and foundational animation"
          viewAll="/movies"
          layout="poster"
        >
          {realComedy.slice(0, 10).map((r) => (
            <PosterCard
              key={r.id}
              to={`/movies/${encodeURIComponent(r.id)}`}
              title={r.name}
              art={r.artworkUrl}
              line={[r.provider, r.subcategory].filter(Boolean).join(' · ')}
              flag={<><Icon name="library" size={10} />Archive</>}
            />
          ))}
        </ContentRail>
      )
    },

    'recently-added': () => {
      if (demoTitles) {
        if (recentlyAdded.length === 0) return null
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
            {recentlyAdded.map((t) => (
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
      }
      const recentItems = [...publicFilms, ...publicSeries].slice(0, 12)
      if (recentItems.length === 0) return null
      return (
        <ContentRail
          key="recently-added"
          id="recently-added"
          icon="film"
          title="Curated Public Cinema & Archives"
          sub="Selected historical works and restored media"
          viewAll="/movies"
          layout="poster"
        >
          {recentItems.map((r) => (
            <PosterCard
              key={r.id}
              to={r.category === 'series' ? `/series/${encodeURIComponent(r.id)}` : `/movies/${encodeURIComponent(r.id)}`}
              title={r.name}
              art={r.artworkUrl}
              line={[r.provider, r.subcategory].filter(Boolean).join(' · ')}
              flag={<><Icon name="library" size={10} />Archive</>}
            />
          ))}
        </ContentRail>
      )
    },
  }

  // Real mode series rail renderer
  const realSeriesRail = !demoTitles && safeXtreamSeries.length > 0 ? (
    <ContentRail
      key="xtream-series"
      id="xtream-series"
      icon="series"
      title="Series"
      sub="From your provider"
      viewAll="/series"
      layout="poster"
    >
      {safeXtreamSeries.map((s) => (
        <XtreamPosterCard
          key={`${s.sourceId}:${s.id}`}
          to={`/series/${encodeURIComponent(`xt:${s.sourceId}:${s.id}`)}`}
          title={s.name}
          artworkKey={s.artworkKey}
          line={s.year ? String(s.year) : undefined}
          year={s.year}
        />
      ))}
    </ContentRail>
  ) : !demoTitles && publicSeries.length > 0 ? (
    <ContentRail
      key="public-series"
      id="public-series"
      icon="series"
      title="Television Series Archives"
      sub="Public broadcasts and episodic retrospective collections"
      viewAll="/series"
      layout="poster"
    >
      {publicSeries.slice(0, 10).map((r) => (
        <PosterCard
          key={r.id}
          to={`/series/${encodeURIComponent(r.id)}`}
          title={r.name}
          art={r.artworkUrl}
          line={[r.provider, r.subcategory].filter(Boolean).join(' · ')}
          flag={<><Icon name="library" size={10} />Archive</>}
        />
      ))}
    </ContentRail>
  ) : null

  const renderedSections = [...homeSections]
    .sort((a, b) => a.order - b.order)
    .filter((s) => s.visible !== false)
    .map((s) => sectionRenderers[s.id]?.())
    .filter(Boolean)

  return (
    <>
      <HomeHero
        slides={featuredSlides}
        channels={safeChannelsList}
        now={now}
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
      />
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
        {realSeriesRail}

        <div className="home-pair">
          {favChannels.length > 0 && (
            <Section icon="heart" title="Your Channels" viewAll="/live?group=Favourites" grid="channel-chips">
              {favChannels.map((c) => {
                const p = programmeAt(c, now)
                return (
                  <Link key={c.id} to={`/live?channel=${c.id}`} className="card channel-chip">
                    <ChannelMark channel={c} size={40} />
                    <span><strong>{c.name}</strong><span className="faint">{p ? p.title : idleLabel(c)}</span></span>
                  </Link>
                )
              })}
            </Section>
          )}
          <Section icon="library" title="Your Library" viewAll="/library" grid="shortcut-grid">
            {shortcuts.map((s) => (
              <Link key={s.label} to={s.to} className="card shortcut">
                <span className="shortcut-icon"><Icon name={s.icon} /></span>
                <span><strong>{s.label}</strong><span className="faint tnum">{s.count} {s.count === 1 ? 'item' : 'items'}</span></span>
                <Icon name="right" size={18} />
              </Link>
            ))}
          </Section>
        </div>

        <p className="footer-note faint">
          {channelMode === 'playlists'
            ? `Channels come from your imported playlists (${NOT_TESTED.toLowerCase()}). ${xtreamSources.length > 0 ? 'Films and series come from your provider.' : 'Kinora has no source for films and series yet.'}`
            : 'Sample mode: movies, series, channels and the guide are fictional, and nothing is streamed. Add a source, or turn sample mode off in Settings › Data.'}
        </p>

        <HomeCustomizeModal open={customizeOpen} onClose={() => setCustomizeOpen(false)} />
      </div>
    </>
  )
}
