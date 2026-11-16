import { useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Icon, type IconName } from './Icon'
import { useStore } from '../state/store'
import { useToast } from './Toast'
import { useCardContextMenu, XtreamArt } from './Tiles'
import '../screens/MediaStreaming.css'

export interface NavTabItem {
  id: string
  label: string
  icon: IconName
}

export function StreamingHeader({
  icon,
  title,
  subtitle,
  tabs,
  activeTab,
  onTabChange,
  actions,
}: {
  icon: IconName
  title: string
  subtitle: string
  tabs: NavTabItem[]
  activeTab: string
  onTabChange: (tabId: string) => void
  actions?: ReactNode
}) {
  return (
    <div className="streaming-header-wrap">
      <div className="streaming-header-top">
        <div className="streaming-title-group">
          <div className="streaming-icon-badge" aria-hidden="true">
            <Icon name={icon} size={22} />
          </div>
          <div className="streaming-title-meta">
            <h1 className="streaming-title">{title}</h1>
            <p className="streaming-subtitle">{subtitle}</p>
          </div>
        </div>
        <div className="streaming-header-actions">
          {actions}
        </div>
      </div>
      <nav className="streaming-nav-tabs" aria-label={`${title} navigation`}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              className={`streaming-nav-pill ${isActive ? 'is-active' : ''}`}
              aria-pressed={isActive}
              onClick={() => onTabChange(tab.id)}
            >
              <Icon name={tab.icon} size={15} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}

export interface HeroSlideData {
  id: string
  kicker: string
  title: string
  synopsis: string
  art: string
  backdropUrl?: string
  artworkKey?: string | null
  year: number | string
  genre: string
  runtime?: string
  ageRating?: string
  badges?: string[]
  playUrl: string
  detailUrl: string
  itemRef: string
}

export function StreamingHero({
  slides,
  activeIndex,
  onPrev,
  onNext,
  onSelectIndex,
  isTv = false,
}: {
  slides: HeroSlideData[]
  activeIndex: number
  onPrev: () => void
  onNext: () => void
  onSelectIndex: (idx: number) => void
  isTv?: boolean
}) {
  const store = useStore()
  const toast = useToast()

  if (slides.length === 0) return null
  const current = slides[activeIndex % slides.length]
  if (!current) return null

  const inWatchlist = store.library.watchlist.includes(current.itemRef)

  return (
    <section className="streaming-hero" aria-label={`Featured ${isTv ? 'TV Show' : 'Movie'}`}>
      <div className="streaming-hero-art">
        {current.artworkKey ? (
          <XtreamArt
            artworkKey={current.artworkKey}
            alt={current.title}
            eager
            className="hero-art"
            fallbackTitle={current.title}
          />
        ) : (
          <img
            src={current.backdropUrl || current.art}
            alt=""
            loading="eager"
          />
        )}
      </div>
      <div className="streaming-hero-scrim" aria-hidden="true" />

      <div className="streaming-hero-content">
        <div className="streaming-hero-kicker">
          <span className="streaming-kicker-dash" />
          <span>{current.kicker}</span>
        </div>

        <h2 className={isTv ? 'streaming-hero-title-tv' : 'streaming-hero-title-movie'}>
          {current.title}
        </h2>

        <p className="streaming-hero-synopsis">{current.synopsis}</p>

        <div className="streaming-hero-meta">
          {current.ageRating && (
            <span className="streaming-badge-gold">{current.ageRating}</span>
          )}
          {current.badges?.map((b) => (
            <span key={b} className="streaming-badge-gold">{b}</span>
          ))}
          <span className="streaming-badge-atmos">
            <Icon name="volume" size={14} /> Dolby Atmos
          </span>
          <span className="streaming-meta-sep">•</span>
          <span>{current.year}</span>
          {current.genre && (
            <>
              <span className="streaming-meta-sep">•</span>
              <span>{current.genre}</span>
            </>
          )}
          {current.runtime && (
            <>
              <span className="streaming-meta-sep">•</span>
              <span>{current.runtime}</span>
            </>
          )}
        </div>

        <div className="streaming-hero-actions">
          <Link to={current.playUrl} className="streaming-btn-watch">
            <Icon name="play" size={18} />
            <span>Watch Now</span>
          </Link>
          <Link to={current.detailUrl} className="streaming-btn-pill">
            <Icon name="info" size={17} />
            <span>Details</span>
          </Link>
          <button
            type="button"
            className="streaming-btn-pill"
            aria-pressed={inWatchlist}
            onClick={() => {
              store.toggleWatchlist(current.itemRef)
              toast(inWatchlist ? `Removed ${current.title} from your list` : `Added ${current.title} to your list`, {
                label: 'Undo',
                run: () => store.toggleWatchlist(current.itemRef),
              })
            }}
          >
            <Icon name={inWatchlist ? 'check' : 'plus'} size={17} />
            <span>{inWatchlist ? 'In My List' : 'Add to My List'}</span>
          </button>
        </div>
      </div>

      {slides.length > 1 && (
        <div className="streaming-hero-carousel">
          <div className="streaming-carousel-dots" role="tablist" aria-label="Featured carousel slides">
            {slides.slice(0, 5).map((s, idx) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={idx === (activeIndex % slides.length)}
                className={`streaming-dot ${idx === (activeIndex % slides.length) ? 'is-active' : ''}`}
                onClick={() => onSelectIndex(idx)}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>
          <div className="streaming-carousel-nav">
            <button
              type="button"
              className="streaming-nav-arrow"
              onClick={onPrev}
              aria-label="Previous slide"
              title="Previous slide"
            >
              <Icon name="left" size={16} />
            </button>
            <button
              type="button"
              className="streaming-nav-arrow"
              onClick={onNext}
              aria-label="Next slide"
              title="Next slide"
            >
              <Icon name="right" size={16} />
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

export interface GenreItem {
  id: string
  name: string
  art: string
}

export function StreamingGenreRow({
  genres,
  selectedGenre,
  onSelectGenre,
  onViewAll,
}: {
  genres: GenreItem[]
  selectedGenre: string | null
  onSelectGenre: (genreName: string) => void
  onViewAll: () => void
}) {
  return (
    <section className="streaming-genre-section" aria-label="Browse by Genre">
      <div className="streaming-genre-header">
        <div className="streaming-section-title-dash">
          <span className="streaming-title-dash-red" />
          <span>Browse by Genre</span>
        </div>
        <button
          type="button"
          className="streaming-view-all"
          onClick={onViewAll}
        >
          <span>View All Genres</span>
          <Icon name="right" size={14} />
        </button>
      </div>

      <div className="streaming-genre-track" role="list">
        {genres.map((g) => {
          const isActive = selectedGenre === g.name
          return (
            <button
              key={g.id}
              type="button"
              role="listitem"
              className={`streaming-genre-tile ${isActive ? 'is-active' : ''}`}
              onClick={() => onSelectGenre(g.name)}
              title={`Browse ${g.name}`}
            >
              <img src={g.art} alt="" className="streaming-genre-tile-art" loading="lazy" />
              <div className="streaming-genre-tile-scrim" />
              <span className="streaming-genre-tile-label">{g.name}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export function StreamingRail({
  title,
  iconName,
  iconColor = '#ff253b',
  onSeeAll,
  children,
}: {
  title: string
  iconName?: IconName
  iconColor?: string
  onSeeAll?: () => void
  children: ReactNode
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(true)

  const checkScroll = () => {
    const el = trackRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 10)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 10)
  }

  const scroll = (direction: -1 | 1) => {
    const el = trackRef.current
    if (!el) return
    const step = Math.max(300, Math.floor(el.clientWidth * 0.75))
    el.scrollBy({ left: direction * step, behavior: 'smooth' })
  }

  return (
    <section className="streaming-rail-wrap" aria-label={title}>
      <div className="streaming-rail-header">
        <h2 className="streaming-rail-title">
          {iconName && (
            <span className="streaming-rail-icon" style={{ color: iconColor }} aria-hidden="true">
              <Icon name={iconName} size={18} />
            </span>
          )}
          <span>{title}</span>
        </h2>
        {onSeeAll && (
          <button
            type="button"
            className="streaming-view-all"
            onClick={onSeeAll}
          >
            <span>See All</span>
            <Icon name="right" size={14} />
          </button>
        )}
      </div>

      <div className="streaming-rail-stage">
        <button
          type="button"
          className="streaming-rail-btn is-left"
          onClick={() => scroll(-1)}
          disabled={!canLeft}
          aria-label={`Scroll ${title} left`}
        >
          <Icon name="left" size={18} />
        </button>

        <div
          ref={trackRef}
          className="streaming-rail-track"
          onScroll={checkScroll}
        >
          {children}
        </div>

        <button
          type="button"
          className="streaming-rail-btn is-right"
          onClick={() => scroll(1)}
          disabled={!canRight}
          aria-label={`Scroll ${title} right`}
        >
          <Icon name="right" size={18} />
        </button>
      </div>
    </section>
  )
}

export function StreamingProviderPrompt({
  kind,
}: {
  kind: 'movies' | 'tv'
}) {
  const isMovies = kind === 'movies'
  return (
    <aside className="streaming-provider-prompt" aria-label="On-demand provider connection">
      <div className="streaming-provider-prompt-icon" aria-hidden="true">
        <Icon name={isMovies ? 'film' : 'tv'} size={22} />
      </div>
      <div className="streaming-provider-prompt-content">
        <strong className="streaming-provider-prompt-title">
          Connect an On-Demand Provider
        </strong>
        <p className="streaming-provider-prompt-desc">
          {isMovies
            ? 'Add an Xtream compatible provider in Sources to stream films on demand, or explore the digital preservation works below.'
            : 'Add an Xtream compatible provider in Sources to stream television series on demand, or explore the open broadcast archive below.'}
        </p>
      </div>
      <div className="streaming-provider-prompt-actions">
        <Link to="/sources/add?kind=xtream" className="btn btn-primary btn-small">
          <Icon name="plus" size={15} />
          <span>Add Provider</span>
        </Link>
        <Link to="/sources" className="btn btn-ghost btn-small">
          <Icon name="sources" size={15} />
          <span>Sources</span>
        </Link>
      </div>
    </aside>
  )
}

export function StreamingCard({
  to,
  title,
  sub,
  art,
  artworkKey,
  badges,
  episodeBadge,
  itemRef,
  watched = false,
  progress = null,
}: {
  to: string
  title: string
  sub?: string
  art?: string
  artworkKey?: string | null
  badges?: string[]
  episodeBadge?: string
  itemRef?: string
  watched?: boolean
  progress?: number | null
}) {
  const { onContextMenu, menu } = useCardContextMenu(to, title, itemRef)
  const [artFailed, setArtFailed] = useState(false)

  return (
    <>
      <Link
        to={to}
        className="streaming-card-wide"
        onContextMenu={onContextMenu}
        aria-label={`${title}${sub ? `, ${sub}` : ''}`}
      >
        {artworkKey ? (
          <XtreamArt
            artworkKey={artworkKey}
            alt={title}
            className="streaming-card-art"
            fallbackTitle={title}
          />
        ) : !artFailed && art ? (
          <img
            src={art}
            alt=""
            className="streaming-card-art"
            loading="lazy"
            onError={() => setArtFailed(true)}
          />
        ) : (
          <div className="streaming-card-fallback-art" aria-hidden="true">
            <div className="streaming-card-fallback-glow" />
            <Icon name={episodeBadge ? 'series' : 'film'} size={28} />
          </div>
        )}

        <div className="streaming-card-scrim" />

        <div className="streaming-card-top-badges">
          {episodeBadge && (
            <span className="streaming-card-badge is-episode">{episodeBadge}</span>
          )}
          {badges?.includes('4K') && (
            <span className="streaming-card-badge">4K</span>
          )}
          {badges?.includes('HDR') && (
            <span className="streaming-card-badge is-hdr">HDR</span>
          )}
          {watched && (
            <span className="streaming-card-badge" title="Watched">
              <Icon name="check" size={11} />
            </span>
          )}
        </div>

        <div className="streaming-card-bottom">
          <strong className="streaming-card-title">{title}</strong>
          {sub && <span className="streaming-card-sub">{sub}</span>}
        </div>

        {progress != null && progress > 0 && progress < 1 && (
          <div className="streaming-card-progress" aria-hidden="true">
            <div
              className="streaming-card-progress-fill"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        )}
      </Link>
      {menu}
    </>
  )
}

export function StreamingEmptyState({
  kind,
  disabledSources = false,
  onAddProvider,
  onOpenSources,
}: {
  kind: 'movies' | 'tv'
  disabledSources?: boolean
  onAddProvider: () => void
  onOpenSources: () => void
}) {
  const isMovies = kind === 'movies'
  return (
    <div className="streaming-empty-card" role="region" aria-label={`No ${isMovies ? 'movies' : 'TV shows'} connected`}>
      <div className="streaming-empty-icon-wrap" aria-hidden="true">
        <Icon name={isMovies ? 'film' : 'tv'} size={32} />
      </div>
      <h2 className="streaming-empty-title">
        {disabledSources
          ? (isMovies ? 'Movie Provider Disabled' : 'TV Show Provider Disabled')
          : (isMovies ? 'No Movie Provider Connected' : 'No TV Show Provider Connected')}
      </h2>
      <p className="streaming-empty-desc">
        {disabledSources
          ? `Your connected on-demand provider is currently disabled in Sources. Enable it in Sources to stream ${isMovies ? 'films' : 'series and episodes'}, or add an Xtream compatible provider in Sources.`
          : isMovies
            ? 'Your live TV playlists provide broadcast television, not on-demand movies. Add an Xtream compatible provider in Sources to stream films, or explore indexed media archives.'
            : 'Your live TV playlists provide broadcast television, not on-demand television series. Add an Xtream compatible provider in Sources to stream series and episodes.'}
      </p>
      <div className="streaming-empty-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onAddProvider}
        >
          <Icon name="plus" size={16} />
          <span>Add On-Demand Provider</span>
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onOpenSources}
        >
          <Icon name="sources" size={16} />
          <span>Manage Sources</span>
        </button>
        <Link to="/archives" className="btn btn-ghost">
          <span>Public Media Archives</span>
        </Link>
      </div>
    </div>
  )
}

/**
 * Genuine technical badge derivation from real title/metadata fields.
 * Never hardcodes fake 4K/HDR badges.
 */
export function getTechnicalBadges(item: {
  name?: string
  title?: string
  audio?: string[]
  extension?: string
  year?: number | string | null
}): string[] {
  const text = `${item.title ?? ''} ${item.name ?? ''}`
  const badges: string[] = []

  if (/\b(4k|2160p|uhd)\b/i.test(text)) {
    badges.push('4K')
  } else if (/\b(1080p|fhd|hd)\b/i.test(text)) {
    badges.push('HD')
  }

  if (/\b(hdr|hdr10|dv|dolby\s*vision)\b/i.test(text)) {
    badges.push('HDR')
  }

  if (item.audio?.some((a) => /atmos/i.test(a)) || /\batmos\b/i.test(text)) {
    badges.push('Dolby Atmos')
  } else if (item.audio?.some((a) => /5\.1/i.test(a)) || /\b5\.1\b/i.test(text)) {
    badges.push('5.1')
  }

  return badges
}

