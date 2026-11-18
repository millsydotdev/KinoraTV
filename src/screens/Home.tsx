import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { movies, series } from '../data/catalog'
import { movieRef, seriesRef, channelRef } from '../data/refs'
import type { Movie, Series } from '../data/types'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { ChannelCard, PosterCard, Section, WideCard, XtreamArt, XtreamPosterCard, idleLabel } from '../components/Tiles'
import { ContentRail } from '../components/ContentRail'
import { useToast } from '../components/Toast'
import { Art, ChannelMark, ProgrammeArt, StateBlock } from '../components/ui'
import { AgeRatingBadge } from '../components/AgeRatingBadge'
import { type TechnicalFormat } from '../components/TechnicalBadges'
import { filterKidSafeChannels, filterKidSafeTitles, filterKidSafeXtreamTitles, isRefKidSafe } from '../lib/kidsMode'
import { continueWatching } from '../lib/library'
import { useNow } from '../lib/time'
import { NOT_TESTED } from '../state/playlists'
import { useProfiles } from '../state/profiles'
import { useStore } from '../state/store'
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

function HomeHero({ slides }: { slides: FeaturedSlide[] }) {
  const store = useStore()
  const toast = useToast()
  const [carouselIndex, setCarouselIndex] = useState(0)

  if (slides.length === 0) return <PageHeader title="Home" />

  const currentSlide = slides[carouselIndex % Math.max(1, slides.length)]
  if (!currentSlide) return <PageHeader title="Home" />

  const isLive = currentSlide.kind === 'live'
  const inLibrary = isLive
    ? store.library.favourites.includes(currentSlide.ref)
    : store.library.watchlist.includes(currentSlide.ref)

  const renderTitle = (titleText: string) => {
    const parts = titleText.split(' ')
    if (parts.length > 1) {
      return (
        <>
          {parts.slice(0, -1).join(' ')}{' '}
          <span className="hero-title-accent">{parts[parts.length - 1]}</span>
        </>
      )
    }
    return titleText
  }

  const renderArtwork = () => {
    if (currentSlide.artworkKey) {
      return (
        <XtreamArt
          artworkKey={currentSlide.artworkKey}
          fallbackTitle={currentSlide.title}
          fallbackYear={typeof currentSlide.yearOrYears === 'number' ? currentSlide.yearOrYears : undefined}
          eager
          className="hero-art"
        />
      )
    }
    if (isLive && currentSlide.channel) {
      const p = currentSlide.programme
      const hasArt = hasGenuineProgrammeArt(p)
      return (
        <div
          className="hero-art real-channel-hero-art"
          style={{ background: `radial-gradient(ellipse at 75% 35%, ${currentSlide.channel.mark.tone}35 0%, var(--bg) 75%)` }}
        >
          {hasArt ? (
            <ProgrammeArt programme={p!} channel={currentSlide.channel} alt={p!.title} eager backdropOnly className="hero-prog-art" />
          ) : (
            <div className="hero-atmospheric-art" style={{ '--channel-tone': currentSlide.channel.mark.tone } as React.CSSProperties}>
              <div className="hero-atmospheric-mesh" />
              <div className="hero-atmospheric-watermark-mark">{currentSlide.channelMarkText || currentSlide.channel.mark.text}</div>
            </div>
          )}
        </div>
      )
    }
    if (currentSlide.art) {
      return <Art src={currentSlide.art} focus={currentSlide.focus} eager className="hero-art" />
    }
    return (
      <div className="hero-art real-channel-hero-art" style={{ background: 'radial-gradient(ellipse at 75% 35%, rgba(229, 9, 20, 0.25) 0%, var(--bg) 75%)' }}>
        <div className="hero-atmospheric-art">
          <div className="hero-atmospheric-mesh" />
        </div>
      </div>
    )
  }

  return (
    <section className="hero" aria-labelledby="hero-title">
      {renderArtwork()}
      <PageHeader overlay />

      {/* Genuine generated geometric framing artwork asset */}
      <div className="hero-geometric-artwork" aria-hidden="true">
        <img
          src="/art/hero-geometric-frame.png"
          alt=""
          className="hero-geometric-img"
          loading="eager"
        />
        <span className="hero-sky-laser" style={{ display: 'none' }} />
        <span className="hero-neon-line" style={{ display: 'none' }} />
      </div>

      <div className="hero-content">
        <div className="hero-kicker-badge">
          <span className="kicker-pill" />
          {currentSlide.channel && <ChannelMark channel={currentSlide.channel} size={16} />}
          <span>{currentSlide.kicker}</span>
        </div>
        <h1 id="hero-title" className="hero-title title-xl">
          <Link to={currentSlide.to} className="hero-title-link">
            {renderTitle(currentSlide.title)}
          </Link>
        </h1>
        {currentSlide.tagline && <p className="hero-tagline">{currentSlide.tagline}</p>}
        <div className="hero-meta-row">
          {currentSlide.yearOrYears && (
            <span>{currentSlide.yearOrYears}</span>
          )}
          {currentSlide.runtime && (
            <>
              <span className="meta-sep">•</span>
              <span className="meta-time">
                <span>{currentSlide.runtime}</span>
              </span>
            </>
          )}
          {currentSlide.timeRemaining && (
            <>
              <span className="meta-sep">•</span>
              <span className="meta-time">
                <span>{currentSlide.timeRemaining}</span>
              </span>
            </>
          )}
          <span className="badge-tech">4K HDR</span>
          <span className="badge-tech">DOLBY VISION</span>
          {currentSlide.genres && currentSlide.genres.slice(0, 2).map((g) => (
            <Fragment key={g}>
              <span className="meta-sep">•</span>
              <span>{g}</span>
            </Fragment>
          ))}
          {currentSlide.certificate && (
            <>
              <span className="meta-sep">•</span>
              <AgeRatingBadge rating={currentSlide.certificate} system="bbfc" />
            </>
          )}
          {currentSlide.isLive && (
            <>
              <span className="meta-sep">•</span>
              <span className="badge badge-live">Live</span>
            </>
          )}
        </div>
        {currentSlide.synopsis && <p className="hero-synopsis">{currentSlide.synopsis}</p>}
        <div className="hero-actions">
          <Link to={currentSlide.playUrl} className="btn btn-hero-watch btn-primary">
            <Icon
              name={!store.demoTitles && (currentSlide.kind === 'movie' || currentSlide.kind === 'series') ? 'info' : 'play'}
              size={18}
            />
            <span>
              {currentSlide.isLive
                ? 'Watch Live'
                : !store.demoTitles && (currentSlide.kind === 'movie' || currentSlide.kind === 'series')
                  ? 'View Details'
                  : 'Watch Now'}
            </span>
          </Link>
          <Link to={currentSlide.to} className="btn btn-hero-details">
            <Icon name={isLive ? 'guide' : 'info'} size={18} />
            <span>{isLive ? 'TV Guide' : 'Details'}</span>
          </Link>
          <button
            type="button"
            className="btn btn-hero-secondary"
            aria-pressed={inLibrary}
            onClick={() => {
              if (isLive) {
                store.toggleFavourite(currentSlide.ref)
                toast(inLibrary ? `Removed ${currentSlide.title} from favourites` : `Added ${currentSlide.title} to favourites`)
              } else {
                store.toggleWatchlist(currentSlide.ref)
                toast(inLibrary ? `Removed ${currentSlide.title} from your library` : `Added ${currentSlide.title} to your library`, {
                  label: 'Undo',
                  run: () => store.toggleWatchlist(currentSlide.ref),
                })
              }
            }}
          >
            <Icon name={inLibrary ? 'check' : 'plus'} size={18} />
            <span>{inLibrary ? (isLive ? 'In Favourites' : 'In Library') : (isLive ? 'Add to Favourites' : 'Add to Library')}</span>
          </button>
        </div>
      </div>

      {/* Carousel indicators and controls */}
      {slides.length > 1 && (
        <div className="hero-carousel-controls">
          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {`Slide ${(carouselIndex % slides.length) + 1} of ${slides.length}: ${currentSlide.title}`}
          </div>
          <div className="hero-carousel-indicators" role="tablist" aria-label="Featured content carousel">
            {slides.slice(0, 4).map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === (carouselIndex % slides.length)}
                className={`hero-carousel-dot ${i === (carouselIndex % slides.length) ? 'is-active' : ''}`}
                onClick={() => setCarouselIndex(i)}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
          <div className="hero-carousel-nav">
            <button
              type="button"
              className="hero-nav-btn"
              onClick={() => setCarouselIndex((p) => (p - 1 + slides.length) % slides.length)}
              aria-label="Previous featured title"
            >
              <Icon name="left" size={16} />
            </button>
            <button
              type="button"
              className="hero-nav-btn"
              onClick={() => setCarouselIndex((p) => (p + 1) % slides.length)}
              aria-label="Next featured title"
            >
              <Icon name="right" size={16} />
            </button>
          </div>
        </div>
      )}
    </section>
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
            <img
              src={resource.artworkUrl}
              alt=""
              className={`home-audio-img${isLogo ? ' is-logo' : ''}`}
              loading="lazy"
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



export function Home() {
  const now = useNow()
  const store = useStore()
  const toast = useToast()
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

  if (channelMode === 'none') {
    return (
      <>
        <PageHeader title="Home" />
        <div className="page home-empty">
          <StateBlock
            icon="tv"
            title="Nothing to watch yet"
            action={(
              <div className="home-empty-actions">
                <Link to="/setup" className="btn btn-primary">Set up Kinora</Link>
                <Link to="/sources/add" className="btn btn-secondary">Add your own source</Link>
                <button type="button" className="btn btn-ghost" onClick={() => setPref('demoMode', true)}>Look around with sample data</button>
              </div>
            )}
          >
            Kinora has no channels or films of its own. It plays the sources you add, such as a TV playlist you are allowed to use.
          </StateBlock>
        </div>
      </>
    )
  }

  const sectionRenderers: Record<string, () => React.ReactNode> = {
    'continue-watching': () => {
      const items = demoTitles ? safeResume.slice(0, 4) : safeResume
      if (items.length === 0) return null
      return (
        <ContentRail
          key="continue-watching"
          id="continue-watching"
          icon="play"
          title="Continue Watching"
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
                toast(`Removed “${r.title}” from Continue Watching`, {
                  label: 'Undo',
                  run: () => {
                    if (saved) {
                      store.restoreProgress(r.ref, saved)
                      toast(`Restored “${r.title}” to Continue Watching`)
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
          layout="tile"
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
                hideCaption
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

    'scifi-space': () =>
      demoTitles && scifiTitles.length > 0 ? (
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
      ) : null,

    'crime-drama': () =>
      demoTitles && crimeDramaTitles.length > 0 ? (
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
      ) : null,

    'action-adventure': () =>
      demoTitles && actionTitles.length > 0 ? (
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
      ) : null,

    'comedy-entertainment': () =>
      demoTitles && comedyTitles.length > 0 ? (
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
      ) : null,

    'recently-added': () =>
      demoTitles && recentlyAdded.length > 0 ? (
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
      ) : null,
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
      <HomeHero slides={featuredSlides} />
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
