import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { featured, movies, series } from '../data/catalog'
import { movieRef, seriesRef, channelRef } from '../data/refs'
import type { Movie, Programme, Series } from '../data/types'
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
import { clock, useNow } from '../lib/time'
import { categoryLabel, NOT_TESTED } from '../state/playlists'
import { useProfiles } from '../state/profiles'
import { useStore } from '../state/store'
import { isLogoArtwork } from '../components/ResourceCard'
import type { MediaResource } from '../data/personalLibrary'
import { computeRecommendations } from '../lib/recommendations'
import { HomeCustomizeModal } from '../components/HomeCustomizeModal'
import { DEFAULT_HOME_SECTIONS } from '../state/userPreferences'
import './Home.css'

function Hero() {
  const store = useStore()
  const toast = useToast()
  const { isKidsMode } = useProfiles()
  const [carouselIndex, setCarouselIndex] = useState(0)

  const featuredList = useMemo(() => {
    if (isKidsMode) return filterKidSafeTitles([...movies, ...series], true)
    const harbour = movies.find((m) => m.id === 'harbour-lights')
    const others = featured.filter((f) => f.id !== 'harbour-lights')
    return harbour ? [harbour, ...others] : featured
  }, [isKidsMode])

  const t = featuredList[carouselIndex % Math.max(1, featuredList.length)]
  if (!t) return null

  const ref = t.kind === 'movie' ? movieRef(t.id) : seriesRef(t.id)
  const inLibrary = store.library.watchlist.includes(ref)
  const play = t.kind === 'movie' ? `/watch/${encodeURIComponent(ref)}` : `/series/${t.id}`
  const detailUrl = t.kind === 'movie' ? `/movies/${t.id}` : `/series/${t.id}`

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

  const hours = t.kind === 'movie' ? Math.floor(t.runtime / 60) : null
  const mins = t.kind === 'movie' ? t.runtime % 60 : null
  const formattedRuntime = hours != null && mins != null ? `${hours}h ${mins}m` : null

  return (
    <section className="hero" aria-labelledby="hero-title">
      <Art src={t.art} focus={t.focus} eager className="hero-art" />
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
          <span>{t.kind === 'movie' ? 'FEATURED MOVIE' : 'FEATURED SERIES'}</span>
        </div>
        <h1 id="hero-title" className="hero-title title-xl">
          <Link to={detailUrl} className="hero-title-link">
            {renderTitle(t.title)}
          </Link>
        </h1>
        {t.tagline && <p className="hero-tagline">{t.tagline}</p>}
        <div className="hero-meta-row">
          {t.genres.map((g, idx) => (
            <Fragment key={g}>
              {idx > 0 && <span className="meta-sep">|</span>}
              <span>{g}</span>
            </Fragment>
          ))}
          <span className="meta-sep">|</span>
          <span>{t.kind === 'movie' ? t.year : t.years}</span>
          {formattedRuntime && (
            <>
              <span className="meta-sep">|</span>
              <span className="meta-time">
                <Icon name="clock" size={14} />
                <span>{formattedRuntime}</span>
              </span>
            </>
          )}
          <span className="meta-sep">|</span>
          <AgeRatingBadge rating={t.certificate} system="bbfc" />
        </div>
        <p className="hero-synopsis">{t.synopsis}</p>
        <div className="hero-actions">
          <Link to={play} className="btn btn-hero-watch btn-primary">
            <Icon name="play" size={18} />
            <span>Watch Now</span>
          </Link>
          <button
            type="button"
            className="btn btn-hero-secondary"
            aria-pressed={inLibrary}
            onClick={() => {
              store.toggleWatchlist(ref)
              toast(inLibrary ? `Removed ${t.title} from your library` : `Added ${t.title} to your library`, { label: 'Undo', run: () => store.toggleWatchlist(ref) })
            }}
          >
            <Icon name={inLibrary ? 'check' : 'plus'} size={18} />
            <span>{inLibrary ? 'In Library' : 'Add to Library'}</span>
          </button>
          <Link to={detailUrl} className="btn btn-hero-details">
            <Icon name="info" size={18} />
            <span>Details</span>
          </Link>
        </div>
      </div>

      {/* Carousel indicators and controls */}
      <div className="hero-carousel-controls">
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {`Slide ${(carouselIndex % featuredList.length) + 1} of ${featuredList.length}: ${t.title}`}
        </div>
        <div className="hero-carousel-indicators" role="tablist" aria-label="Featured titles carousel">
          {featuredList.slice(0, 4).map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === (carouselIndex % featuredList.length)}
              className={`hero-carousel-dot ${i === (carouselIndex % featuredList.length) ? 'is-active' : ''}`}
              onClick={() => setCarouselIndex(i)}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
        <div className="hero-carousel-nav">
          <button
            type="button"
            className="hero-nav-btn"
            onClick={() => setCarouselIndex((p) => (p - 1 + featuredList.length) % featuredList.length)}
            aria-label="Previous featured title"
          >
            <Icon name="left" size={16} />
          </button>
          <button
            type="button"
            className="hero-nav-btn"
            onClick={() => setCarouselIndex((p) => (p + 1) % featuredList.length)}
            aria-label="Next featured title"
          >
            <Icon name="right" size={16} />
          </button>
        </div>
      </div>
    </section>
  )
}

function isValidProgrammeTitle(p: Programme | undefined): boolean {
  const t = p?.title?.trim() ?? ''
  if (!t || t.startsWith('.')) return false
  const lower = t.toLowerCase()
  return !lower.includes('programmes start at') && !lower.includes('off air') && !lower.includes('close down')
}

function hasGenuineProgrammeArt(p: Programme | undefined): boolean {
  return Boolean(p?.icon || p?.art)
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

function RealHero() {
  const store = useStore()
  const toast = useToast()
  const now = useNow()
  const { xtreamCatalogue, channels, programmeAt, prefs } = store

  if (xtreamCatalogue.movies.length > 0) {
    const m = xtreamCatalogue.movies[0]
    if (!m) return <PageHeader title="Home" />
    const routeId = `xt:${m.sourceId}:${m.id}`
    const ref = `movie:${routeId}`
    const inLibrary = store.library.watchlist.includes(ref)
    const play = `/movies/${encodeURIComponent(routeId)}`
    return (
      <section className="hero" aria-labelledby="hero-title">
        <XtreamArt artworkKey={m.artworkKey} fallbackTitle={m.name} fallbackYear={m.year} eager className="hero-art" />
        <PageHeader overlay />
        <div className="hero-content">
          <p className="kicker"><Icon name="film" size={16} />Featured movie</p>
          <h1 id="hero-title" className="title-xl"><Link to={play} className="hero-title-link">{m.name}</Link></h1>
          <div className="meta">
            {m.year && <span>{m.year}</span>}
            <span>{m.extension ? m.extension.toUpperCase() : 'VOD'}</span>
            <span>Provider catalogue</span>
          </div>
          {m.plot && <p className="hero-synopsis">{m.plot}</p>}
          <div className="hero-actions">
            <Link to={play} className="btn btn-hero-watch btn-primary"><Icon name="info" size={16} />View Details</Link>
            <button
              type="button"
              className="btn btn-hero-secondary"
              aria-pressed={inLibrary}
              onClick={() => {
                store.toggleWatchlist(ref)
                toast(inLibrary ? `Removed ${m.name} from your library` : `Added ${m.name} to your library`, { label: 'Undo', run: () => store.toggleWatchlist(ref) })
              }}
            >
              <Icon name={inLibrary ? 'check' : 'plus'} size={18} /><span>{inLibrary ? 'In Library' : 'Add to Library'}</span>
            </button>
          </div>
        </div>
      </section>
    )
  }

  if (channels.length > 0) {
    const top =
      channels.find((c) => {
        const p = programmeAt(c, now)
        return hasGenuineProgrammeArt(p) && isValidProgrammeTitle(p) && Boolean(p?.desc?.trim())
      }) ??
      channels.find((c) => {
        const p = programmeAt(c, now)
        return hasGenuineProgrammeArt(p) && isValidProgrammeTitle(p)
      }) ??
      channels.find((c) => isValidProgrammeTitle(programmeAt(c, now))) ??
      channels.find((c) => programmeAt(c, now)) ??
      channels[0]
    if (!top) return <PageHeader title="Home" />
    const p = programmeAt(top, now)
    const hasArt = hasGenuineProgrammeArt(p)
    return (
      <section className="hero real-channel-hero" aria-labelledby="hero-title">
        <div className="hero-art real-channel-hero-art" style={{ background: `radial-gradient(ellipse at 75% 35%, ${top.mark.tone}35 0%, var(--bg) 75%)` }}>
          {hasArt ? (
            <ProgrammeArt programme={p!} channel={top} alt={p!.title} eager backdropOnly className="hero-prog-art" />
          ) : (
            <div className="hero-atmospheric-art" style={{ '--channel-tone': top.mark.tone } as React.CSSProperties}>
              <div className="hero-atmospheric-mesh" />
              <div className="hero-atmospheric-watermark-mark">{top.mark.text}</div>
            </div>
          )}
        </div>
        <PageHeader overlay />
        <div className="hero-content">
          <p className="kicker">
            <ChannelMark channel={top} size={20} />
            <span className="live-dot" style={{ marginLeft: 6 }}>Live</span>
            Now on {top.name}
          </p>
          <h1 id="hero-title" className="title-xl">
            <Link to={`/live?channel=${top.id}`} className="hero-title-link">
              {p ? p.title : top.name}
            </Link>
          </h1>
          <div className="meta">
            <span>{categoryLabel(top)}</span>
            {p && <span>until {clock(p.stop, prefs.timeFormat)}</span>}
          </div>
          {p?.desc && <p className="hero-synopsis">{p.desc}</p>}
          <div className="hero-actions">
            <Link to={`/live?channel=${top.id}`} className="btn btn-primary"><Icon name="play" size={16} />Watch Live</Link>
            <Link to="/live" className="btn btn-secondary"><Icon name="guide" size={16} />TV Guide</Link>
          </div>
        </div>
      </section>
    )
  }

  return <PageHeader title="Home" />
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
  ) : null

  const renderedSections = [...homeSections]
    .sort((a, b) => a.order - b.order)
    .filter((s) => s.visible !== false)
    .map((s) => sectionRenderers[s.id]?.())
    .filter(Boolean)

  return (
    <>
      {demoTitles ? <Hero /> : <RealHero />}
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
