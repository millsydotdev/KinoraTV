import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { movieById, movies } from '../data/catalog'
import { movieRef, runtimeLabel } from '../data/refs'
import { Icon } from '../components/Icon'
import { TitleActions } from '../components/TitleActions'
import { PageHeader } from '../components/PageHeader'
import { PosterCard, Section, XtreamArt } from '../components/Tiles'
import { useToast } from '../components/Toast'
import { Art, ProgressBar, StateBlock } from '../components/ui'
import { progressOf, useStore, type XtreamTitle } from '../state/store'
import type { XtreamMovieDetails } from '../lib/native'
import { isTitleKidSafe } from '../lib/kidsMode'
import { AgeRatingBadge } from '../components/AgeRatingBadge'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { ArtworkLightboxModal } from '../components/ArtworkLightboxModal'
import { CollectionDialog } from '../components/CollectionDialog'
import { RatingControls } from '../components/RatingControls'
import { TrailerPlayerModal } from '../components/TrailerPlayerModal'
import type { MediaResource } from '../data/personalLibrary'
import { VERIFICATION_STATUS_META } from '../data/personalLibrary'
import { classifyMediaResource } from '../data/provenance'
import { OPEN_MOVIES } from '../data/openCatalogue'
import './Detail.css'

export function MovieDetail() {
  const { id = '' } = useParams()
  const movie = movieById(id)
  const store = useStore()
  const toast = useToast()
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [trailerOpen, setTrailerOpen] = useState(false)
  const [activeDetailTab, setActiveDetailTab] = useState<'overview' | 'cast' | 'trailers' | 'related'>('overview')

  if (movie && store.isKidsMode && !isTitleKidSafe(movie)) {
    return (
      <div className="page" style={{ padding: '48px 24px', textAlign: 'center' }}>
        <StateBlock
          icon="lock"
          title="Restricted in Kids Mode"
          action={<Link to="/movies" className="btn btn-primary">Browse Family Movies</Link>}
        >
          {movie.title} is rated {movie.certificate} and is blocked for child profiles.
        </StateBlock>
      </div>
    )
  }

  const imported = store.xtreamCatalogue.movies.find((item) => `xt:${item.sourceId}:${item.id}` === id || String(item.id) === id)

  if (imported) return <XtreamMovieDetail key={`${imported.sourceId}:${imported.id}`} movie={imported} />

  const cleanResId = id.replace(/^res:/, '')
  const publicRes = store.mediaLibrary.allResources.find((r) => r.id === cleanResId || r.id === id)
  if (publicRes && (publicRes.category === 'movies' || publicRes.subcategory.includes('film') || publicRes.subcategory.includes('cinema') || publicRes.subcategory.includes('archive') || publicRes.subcategory.includes('streaming'))) {
    return <PublicDiscoveryFilmDetail resource={publicRes} />
  }

  const isSampleProvider = typeof window !== 'undefined' && window.sessionStorage?.getItem('kinora.sample_provider_view') === '1'

  if (!store.demoTitles && !isSampleProvider) {
    const isOpenMovie = movie ? OPEN_MOVIES.some((om) => om.id === movie.id) : false
    if (movie && !isOpenMovie) {
      return (
        <div className="page detail-page">
          <PageHeader title="Movies" />
          <div style={{ maxWidth: 720, margin: '60px auto', padding: '0 20px' }}>
            <StateBlock
              icon="film"
              title="Movie Unavailable in Personal Sources"
              action={
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <Link to="/movies" className="btn btn-primary">
                    <Icon name="film" size={16} />
                    <span>Browse Movie Catalogue</span>
                  </Link>
                  <Link to="/sources?tab=active" className="btn btn-secondary">
                    <Icon name="plus" size={16} />
                    <span>Connect On-Demand Provider</span>
                  </Link>
                </div>
              }
            >
              "{movie.title}" is not available in your currently connected personal sources. You can connect an on-demand provider in Sources or explore Kinora's verified public discovery film archives to watch full-length feature films.
            </StateBlock>
          </div>
        </div>
      )
    }
    if (!movie) {
      return (
        <div className="page">
          <PageHeader title="Movies" />
          <StateBlock icon="film" title="Film not found" action={<Link to="/movies" className="btn btn-primary">Browse films</Link>}>
            There is no film at this address in the available catalogue.
          </StateBlock>
        </div>
      )
    }
  }
  if (!movie) {
    return (
      <div className="page">
        <PageHeader title="Movies" />
        <StateBlock icon="film" title="Film not found" action={<Link to="/movies" className="btn btn-primary">Browse films</Link>}>
          There is no film at this address in the available catalogue.
        </StateBlock>
      </div>
    )
  }

  const ref = movieRef(movie.id)
  const watched = store.library.watched.includes(ref)
  const progress = progressOf(store.library, ref)
  const similar = movies.filter((m) => m.id !== movie.id && m.genres.some((g) => movie.genres.includes(g)))

  return (
    <article className="detail">
      <header className="detail-hero">
        <Art
          src={movie.backdropUrl || movie.art}
          alt={movie.title}
          contentId={ref}
          focus={movie.focus}
          eager
          className="detail-backdrop"
          fallbackIcon="film"
          fallbackYear={movie.year}
        />
        <PageHeader overlay />
        <div className="detail-hero-content">
          <Breadcrumbs crumbs={[{ label: 'Home', to: '/' }, { label: 'Movies', to: '/movies' }, { label: movie.title }]} />
          <Link to="/movies" className="text-link detail-back"><Icon name="back" size={16} />Movies</Link>
          <p className="kicker"><Icon name="film" size={16} />Movie · {movie.genres.join(' / ')}</p>
          <h1 className="title-xl">{movie.title}</h1>
          <p className="detail-tagline">{movie.tagline}</p>
          <div className="meta">
            <span>{movie.year}</span>
            <span>{runtimeLabel(movie.runtime)}</span>
            <span className="badge-tech">4K HDR</span>
            <span className="badge-tech">DOLBY VISION</span>
            <AgeRatingBadge rating={movie.certificate} system="bbfc" />
            {watched && <span className="watched-mark"><Icon name="check" size={14} />Watched</span>}
            {(movie as unknown as { trailerUrl?: string }).trailerUrl && (
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => setTrailerOpen(true)}
                title="Watch trailer preview"
              >
                <Icon name="play" size={14} />
                <span>Trailer</span>
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => setLightboxOpen(true)}
              title="Inspect high resolution artwork"
            >
              <Icon name="fullscreen" size={14} />
              <span>Artwork</span>
            </button>
          </div>
          {progress !== null && (
            <div className="detail-progress">
              <ProgressBar value={progress} label="Watched so far" />
              <span className="faint tnum">{Math.round(progress * 100)}% watched</span>
            </div>
          )}
          <TitleActions title={movie} />
        </div>
      </header>

      <div className="detail-tabs-bar" role="tablist" aria-label="Movie detail navigation">
        <button
          type="button"
          role="tab"
          id="detail-tab-overview"
          aria-selected={activeDetailTab === 'overview'}
          className={`detail-tab-pill ${activeDetailTab === 'overview' ? 'is-active' : ''}`}
          onClick={() => setActiveDetailTab('overview')}
        >
          Overview
        </button>
        <button
          type="button"
          role="tab"
          id="detail-tab-cast"
          aria-selected={activeDetailTab === 'cast'}
          className={`detail-tab-pill ${activeDetailTab === 'cast' ? 'is-active' : ''}`}
          onClick={() => setActiveDetailTab('cast')}
        >
          Cast & Crew
        </button>
        <button
          type="button"
          role="tab"
          id="detail-tab-trailers"
          aria-selected={activeDetailTab === 'trailers'}
          className={`detail-tab-pill ${activeDetailTab === 'trailers' ? 'is-active' : ''}`}
          onClick={() => setActiveDetailTab('trailers')}
        >
          Trailers
        </button>
        <button
          type="button"
          role="tab"
          id="detail-tab-related"
          aria-selected={activeDetailTab === 'related'}
          className={`detail-tab-pill ${activeDetailTab === 'related' ? 'is-active' : ''}`}
          onClick={() => setActiveDetailTab('related')}
        >
          Related
        </button>
      </div>

      {(activeDetailTab === 'overview' || activeDetailTab === 'related') && (
        <div className="detail-body">
          <section className="detail-story" aria-labelledby="story-heading">
            <h2 id="story-heading" className="section-title">
              <Icon name="info" size={18} />
              Story & Synopsis
            </h2>
            <p>{movie.synopsis}</p>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              style={{ marginTop: '4px' }}
              onClick={() => {
                store.setWatched([ref], !watched)
                toast(watched ? 'Marked as not watched' : 'Marked as watched')
              }}
            >
              <Icon name={watched ? 'close' : 'check'} size={16} />
              {watched ? 'Mark as not watched' : 'Mark as watched'}
            </button>
          </section>
          <aside className="detail-facts-wrap" aria-labelledby="specs-heading">
            <h2 id="specs-heading" className="section-title" style={{ marginBottom: 12 }}>
              <Icon name="settings" size={18} />
              Technical Specifications
            </h2>
            <dl className="detail-facts">
              <div><dt>Genres</dt><dd>{movie.genres.join(', ')}</dd></div>
              <div><dt>Running time</dt><dd>{runtimeLabel(movie.runtime)}</dd></div>
              <div><dt>Certificate</dt><dd><AgeRatingBadge rating={movie.certificate} system="bbfc" /></dd></div>
              <div><dt>Audio</dt><dd>{movie.audio.join(', ')}</dd></div>
              <div><dt>Subtitles</dt><dd>{movie.subtitles.join(', ')}</dd></div>
            </dl>
          </aside>
        </div>
      )}

      {activeDetailTab === 'cast' && (
        <div className="detail-body">
          <section className="detail-story" style={{ width: '100%', gridColumn: '1 / -1' }}>
            <h2 className="section-title">
              <Icon name="user" size={18} />
              Cast & Crew Information
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, width: '100%', marginTop: 8 }}>
              <div style={{ background: 'var(--surface-2)', padding: '16px 18px', borderRadius: 'var(--r-m)', border: '1px solid var(--border-subtle)' }}>
                <strong style={{ display: 'block', color: 'var(--text-1)', fontSize: '1rem' }}>Elena Rostova</strong>
                <span className="faint" style={{ fontSize: '0.8125rem' }}>Director & Screenplay</span>
              </div>
              <div style={{ background: 'var(--surface-2)', padding: '16px 18px', borderRadius: 'var(--r-m)', border: '1px solid var(--border-subtle)' }}>
                <strong style={{ display: 'block', color: 'var(--text-1)', fontSize: '1rem' }}>Ines Calloway</strong>
                <span className="faint" style={{ fontSize: '0.8125rem' }}>Lead Role</span>
              </div>
              <div style={{ background: 'var(--surface-2)', padding: '16px 18px', borderRadius: 'var(--r-m)', border: '1px solid var(--border-subtle)' }}>
                <strong style={{ display: 'block', color: 'var(--text-1)', fontSize: '1rem' }}>Arthur Pendelton</strong>
                <span className="faint" style={{ fontSize: '0.8125rem' }}>Cinematography</span>
              </div>
              <div style={{ background: 'var(--surface-2)', padding: '16px 18px', borderRadius: 'var(--r-m)', border: '1px solid var(--border-subtle)' }}>
                <strong style={{ display: 'block', color: 'var(--text-1)', fontSize: '1rem' }}>Kinora Motion Pictures</strong>
                <span className="faint" style={{ fontSize: '0.8125rem' }}>Production Studio</span>
              </div>
            </div>
          </section>
        </div>
      )}

      {activeDetailTab === 'trailers' && (
        <div className="detail-body" style={{ gridTemplateColumns: '1fr' }}>
          <section className="detail-story" style={{ width: '100%' }}>
            <h2 className="section-title">
              <Icon name="film" size={18} />
              Official Theatrical Trailer
            </h2>
            <div style={{ position: 'relative', width: '100%', maxWidth: 760, aspectRatio: '16 / 9', background: '#000', borderRadius: 'var(--r-l)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-subtle)', marginTop: 8 }}>
              <Art
          src={movie.backdropUrl || movie.art}
          alt={movie.title}
          contentId={ref}
          focus={movie.focus}
          eager
          className="detail-backdrop"
          fallbackIcon="film"
          fallbackYear={movie.year}
        />
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setTrailerOpen(true)}
                style={{ zIndex: 2, borderRadius: 9999, padding: '12px 28px', background: 'var(--accent, #e50914)' }}
              >
                <Icon name="play" size={20} />
                <span>Play Official Trailer</span>
              </button>
            </div>
          </section>
        </div>
      )}

      {(activeDetailTab === 'overview' || activeDetailTab === 'related') && similar.length > 0 && (
        <div className="detail-more">
          <Section icon="film" title="More Like This" viewAll={`/movies?genre=${encodeURIComponent(movie.genres[0] ?? '')}`} grid="grid-posters">
            {similar.slice(0, 7).map((m) => (
              <PosterCard key={m.id} to={`/movies/${m.id}`} title={m.title} art={m.art} focus={m.focus} line={`${m.year} · ${m.genres[0]}`} />
            ))}
          </Section>
        </div>
      )}

      {lightboxOpen && (
        <ArtworkLightboxModal
          isOpen={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          imageUrl={movie.art}
          title={movie.title}
          dimensions="1920 x 1080 Cinema Backdrop"
          format="JPEG 4K Master"
        />
      )}

      {trailerOpen && (
        <TrailerPlayerModal
          open={trailerOpen}
          onClose={() => setTrailerOpen(false)}
          title={movie.title}
          trailerUrl={movie.trailerUrl}
          posterUrl={movie.art || movie.backdropUrl}
          playFullUrl={`/watch/${encodeURIComponent(ref)}`}
        />
      )}
    </article>
  )
}

function XtreamMovieDetail({ movie }: { movie: XtreamTitle }) {
  const store = useStore()
  const toast = useToast()
  const [details, setDetails] = useState<XtreamMovieDetails | null>(null)
  const [collecting, setCollecting] = useState(false)

  useEffect(() => {
    let active = true
    store.loadXtreamVodDetails(movie.sourceId, String(movie.id))
      .then((res) => {
        if (active) setDetails(res)
      })
      .catch(() => {
        // Fallback to basic catalogue metadata
      })
    return () => { active = false }
  }, [movie.sourceId, movie.id, store.loadXtreamVodDetails])

  const source = store.xtreamSources.find((item) => item.id === movie.sourceId)
  const ref = `movie:xt:${movie.sourceId}:${movie.id}`
  const inWatchlist = store.library.watchlist.includes(ref)
  const inFav = store.library.favourites.includes(ref)
  const watched = store.library.watched.includes(ref)
  const progress = progressOf(store.library, ref)

  const runtimeMins = details?.durationSecs ? Math.round(details.durationSecs / 60) : null
  const durationText = runtimeMins ? runtimeLabel(runtimeMins) : null
  const container = (details?.containerExtension || movie.extension || 'MP4').toUpperCase()
  const plot = details?.plot || movie.plot
  const rating = details?.rating ?? movie.rating
  const genres = details?.genre || movie.categoryName
  const effectiveArtwork = details?.backdrop || details?.artworkKey || movie.artworkKey

  const similar = useMemo(() => {
    return store.xtreamCatalogue.movies
      .filter((m) => m.sourceId === movie.sourceId && m.id !== movie.id && (m.categoryId === movie.categoryId || (m.categoryName && m.categoryName === movie.categoryName)))
      .slice(0, 6)
  }, [store.xtreamCatalogue.movies, movie.sourceId, movie.id, movie.categoryId, movie.categoryName])

  return (
    <article className="detail">
      <header className="detail-hero">
        <XtreamArt
          artworkKey={effectiveArtwork}
          alt={movie.name}
          fallbackTitle={movie.name}
          fallbackYear={movie.year}
          eager
          className="detail-backdrop"
        />
        <PageHeader overlay />
        <div className="detail-hero-content">
          <Link to="/movies" className="text-link detail-back">
            <Icon name="back" size={16} />Movies
          </Link>
          <p className="kicker">
            <Icon name="film" size={16} />Movie · {source?.name ?? 'Provider'}{genres ? ` · ${genres}` : ''}
          </p>
          <h1 className="title-xl">{details?.name || movie.name}</h1>
          <div className="meta">
            {movie.year !== null && <span>{movie.year}</span>}
            {durationText && <span>{durationText}</span>}
            {rating != null && rating > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name="star" size={13} fill="#fbbf24" style={{ color: '#fbbf24' }} />
                {typeof rating === 'number' ? rating.toFixed(1) : rating}
              </span>
            )}
            <span>{container}</span>
            <span>Provider catalogue</span>
            {watched && <span className="watched-mark"><Icon name="check" size={14} />Watched</span>}
          </div>
          {progress !== null && (
            <div className="detail-progress">
              <ProgressBar value={progress} label="Watched so far" />
              <span className="faint tnum">{Math.round(progress * 100)}% watched</span>
            </div>
          )}
          <div className="title-actions">
            <div className="title-actions-primary">
              <Link to={`/watch/${encodeURIComponent(ref)}`} className="btn btn-primary">
                <Icon name="play" size={18} />
                <span>Play Movie</span>
              </Link>
              <button
                type="button"
                className="btn btn-secondary"
                aria-pressed={inWatchlist}
                onClick={() => {
                  store.toggleWatchlist(ref)
                  toast(inWatchlist ? `Removed ${movie.name} from your watchlist` : `Added ${movie.name} to your watchlist`, {
                    label: 'Undo',
                    run: () => store.toggleWatchlist(ref),
                  })
                }}
              >
                <Icon name={inWatchlist ? 'check' : 'plus'} size={18} />
                <span>{inWatchlist ? 'In watchlist' : 'Add to watchlist'}</span>
              </button>
            </div>
            <div className="title-actions-feedback">
              <RatingControls itemRef={ref} title={details?.name || movie.name} />
            </div>
            <div className="title-actions-library">
              <button
                type="button"
                className="icon-btn ringed fav-toggle"
                aria-pressed={inFav}
                aria-label={inFav ? 'Remove from favourites' : 'Add to favourites'}
                title={inFav ? 'Favourite' : 'Add to favourites'}
                onClick={() => {
                  store.toggleFavourite(ref)
                  toast(inFav ? `Removed ${movie.name} from favourites` : `Added ${movie.name} to favourites`)
                }}
              >
                <Icon name="heart" size={18} />
              </button>
              <button
                type="button"
                className="icon-btn ringed collection-toggle"
                aria-label="Add to a collection"
                title="Add to a collection"
                onClick={() => setCollecting(true)}
              >
                <Icon name="folder" size={18} />
              </button>
              <CollectionDialog open={collecting} onClose={() => setCollecting(false)} itemRef={ref} itemTitle={details?.name || movie.name} />
            </div>
          </div>
        </div>
      </header>

      <div className="detail-body">
        {plot && (
          <section className="detail-story" aria-labelledby="xt-story-heading">
            <h2 id="xt-story-heading" className="section-title"><Icon name="info" size={18} />Story</h2>
            <p>{plot}</p>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => {
                store.setWatched([ref], !watched)
                toast(watched ? 'Marked as not watched' : 'Marked as watched')
              }}
            >
              <Icon name={watched ? 'close' : 'check'} size={16} />
              {watched ? 'Mark as not watched' : 'Mark as watched'}
            </button>
          </section>
        )}
        <aside className="detail-facts-wrap" aria-labelledby="xt-specs-heading">
          <h2 id="xt-specs-heading" className="section-title" style={{ marginBottom: 12 }}>
            <Icon name="settings" size={18} />
            Technical Specifications
          </h2>
          <dl className="detail-facts">
            <div><dt>Source</dt><dd>{source?.name ?? 'Provider'}</dd></div>
            {genres && <div><dt>Genre</dt><dd>{genres}</dd></div>}
            {details?.director && (
              <div>
                <dt>Director</dt>
                <dd>
                  <Link to={`/search?q=${encodeURIComponent(details.director.trim())}&type=films`} className="text-link">
                    {details.director}
                  </Link>
                </dd>
              </div>
            )}
            {details?.cast && (
              <div>
                <dt>Cast</dt>
                <dd>
                  {details.cast.split(',').map((actor, idx, arr) => {
                    const name = actor.trim()
                    return (
                      <span key={name}>
                        <Link to={`/search?q=${encodeURIComponent(name)}&type=films`} className="text-link">
                          {name}
                        </Link>
                        {idx < arr.length - 1 ? ', ' : ''}
                      </span>
                    )
                  })}
                </dd>
              </div>
            )}
            {details?.releaseDate && <div><dt>Release Date</dt><dd>{details.releaseDate}</dd></div>}
            <div><dt>Container</dt><dd>{container}</dd></div>
            <div><dt>Playback</dt><dd>Guarded HLS stream via Kinora engine</dd></div>
          </dl>
        </aside>
      </div>

      {similar.length > 0 && (
        <section className="detail-more" style={{ padding: '0 24px 32px' }}>
          <Section icon="film" title={`More in ${movie.categoryName || 'this category'}`} grid="grid-posters">
            {similar.map((sim) => (
              <PosterCard
                key={`${sim.sourceId}:${sim.id}`}
                to={`/movies/${encodeURIComponent(`xt:${sim.sourceId}:${sim.id}`)}`}
                title={sim.name}
                artworkKey={sim.artworkKey}
                line={[sim.year, source?.name].filter(Boolean).join(' · ')}
              />
            ))}
          </Section>
        </section>
      )}
    </article>
  )
}

function PublicDiscoveryFilmDetail({ resource }: { resource: MediaResource }) {
  const store = useStore()
  const toast = useToast()
  const [trailerOpen, setTrailerOpen] = useState(false)
  const inLibrary = store.mediaLibrary.isInPersonalLibrary(resource.id)
  const isFav = store.mediaLibrary.isResourceFavourite(resource.id)
  const { provenance, capability } = classifyMediaResource(resource, inLibrary)
  const statusMeta = VERIFICATION_STATUS_META[resource.verificationStatus] ?? VERIFICATION_STATUS_META.discovered

  const matchingOpenMovie = useMemo(
    () => OPEN_MOVIES.find((m) => m.id === resource.id || m.title.toLowerCase() === resource.name.toLowerCase()),
    [resource],
  )
  const trailerUrl = resource.trailerUrl || matchingOpenMovie?.trailerUrl || null

  const similarFilms = useMemo(() => {
    return store.mediaLibrary.allResources
      .filter((r) => r.id !== resource.id && (r.category === 'movies' || r.subcategory.includes('film') || r.subcategory.includes('cinema') || r.subcategory.includes('archive')))
      .slice(0, 6)
  }, [store.mediaLibrary.allResources, resource.id])

  const handleOpenLink = () => {
    const targetUrl = resource.url || resource.discoveryUrl
    if (targetUrl) {
      window.open(targetUrl, '_blank', 'noopener,noreferrer')
    }
  }

  const toggleLibrary = () => {
    if (inLibrary) {
      store.mediaLibrary.removeFromPersonalLibrary(resource.id)
      toast(`Removed ${resource.name} from My Sources`)
    } else {
      store.mediaLibrary.addToPersonalLibrary(resource.id)
      toast(`Saved ${resource.name} to My Sources`)
    }
  }

  const toggleFav = () => {
    store.mediaLibrary.toggleResourceFavourite(resource.id)
    toast(isFav ? `Removed ${resource.name} from favourites` : `Added ${resource.name} to favourites`)
  }

  return (
    <article className="detail">
      <header className="detail-hero">
        <Art
          src={resource.artworkUrl || ''}
          alt={resource.name}
          className="detail-backdrop"
          fallbackIcon="film"
          eager
        />
        <PageHeader overlay />
        <div className="detail-hero-content">
          <Breadcrumbs crumbs={[{ label: 'Home', to: '/' }, { label: 'Movies', to: '/movies' }, { label: resource.name }]} />
          <Link to="/movies" className="text-link detail-back"><Icon name="back" size={16} />Movies</Link>
          <p className="kicker">
            <Icon name="archive" size={16} />
            Public Discovery Cinema · {resource.subcategory.replace(/-/g, ' ').toUpperCase()}
          </p>
          <h1 className="title-xl">{resource.name}</h1>
          <p className="detail-tagline">{resource.provider}</p>

          <div className="meta detail-hero-meta">
            <span className={`res-provenance-pill ${inLibrary ? 'res-prov-personal' : 'res-prov-public'}`}>
              {provenance.label}
            </span>
            <span className="res-cap-pill">
              <Icon name={capability.icon} size={12} />
              <span>{capability.label}</span>
            </span>
            <span className="res-status-pill" style={{ '--pill-color': statusMeta.tone } as React.CSSProperties}>
              <span className="res-status-dot" aria-hidden="true" />
              {statusMeta.label}
            </span>
            {resource.country && <span>{resource.country}</span>}
            {resource.language && <span>{resource.language}</span>}
            {trailerUrl && (
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => setTrailerOpen(true)}
                title="Watch trailer preview"
              >
                <Icon name="play" size={14} />
                <span>Trailer</span>
              </button>
            )}
          </div>

          <p className="detail-synopsis">{resource.description}</p>

          <div className="title-actions-container">
            <div className="title-actions-primary">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleOpenLink}
              >
                <Icon name="link" size={16} />
                <span>Explore Archive Portal</span>
              </button>
              {trailerUrl && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setTrailerOpen(true)}
                >
                  <Icon name="film" size={16} />
                  <span>Preview Trailer</span>
                </button>
              )}
            </div>

            <div className="title-actions-feedback">
              <button
                type="button"
                className={`btn btn-ghost btn-small ${isFav ? 'is-active' : ''}`}
                onClick={toggleFav}
                aria-label={isFav ? 'Remove from favourites' : 'Add to favourites'}
                title={isFav ? 'Favourited' : 'Add to favourites'}
              >
                <Icon name="heart" size={16} />
                <span>{isFav ? 'Favourited' : 'Favourite'}</span>
              </button>
            </div>

            <div className="title-actions-library">
              <button
                type="button"
                className={`btn btn-secondary btn-small ${inLibrary ? 'is-active' : ''}`}
                onClick={toggleLibrary}
              >
                <Icon name={inLibrary ? 'check' : 'plus'} size={15} />
                <span>{inLibrary ? 'In My Sources' : 'Save to My Sources'}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="detail-body">
        <section className="detail-body-main" style={{ maxWidth: 860 }}>
          <h2 className="title-m" style={{ marginBottom: 12 }}>Resource Information & Access</h2>
          <div className="detail-body-specs" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
            <div className="panel" style={{ padding: 14 }}>
              <span className="faint" style={{ fontSize: '0.75rem', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Provider / Institution</span>
              <strong>{resource.provider}</strong>
            </div>
            <div className="panel" style={{ padding: 14 }}>
              <span className="faint" style={{ fontSize: '0.75rem', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Licence & Distribution</span>
              <strong>{resource.licence || 'Public Service / Cultural Preservation'}</strong>
            </div>
            <div className="panel" style={{ padding: 14 }}>
              <span className="faint" style={{ fontSize: '0.75rem', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Date Discovered</span>
              <strong>{resource.dateDiscovered}</strong>
            </div>
            <div className="panel" style={{ padding: 14 }}>
              <span className="faint" style={{ fontSize: '0.75rem', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Official Origin Portal</span>
              <a href={resource.discoveryUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', wordBreak: 'break-all', fontSize: '0.85rem' }}>
                {resource.discoveryUrl}
              </a>
            </div>
          </div>
        </section>
      </div>

      {similarFilms.length > 0 && (
        <section className="detail-similar" style={{ padding: '0 24px 32px' }}>
          <Section icon="film" title="Related Film Archives & Public Cinema" sub={`${similarFilms.length} titles`}>
            {similarFilms.map((sim) => (
              <PosterCard
                key={sim.id}
                to={`/movies/${encodeURIComponent(sim.id)}`}
                title={sim.name}
                art={sim.artworkUrl}
                line={[sim.provider, sim.country].filter(Boolean).join(' · ')}
              />
            ))}
          </Section>
        </section>
      )}

      {trailerOpen && (
        <TrailerPlayerModal
          open={trailerOpen}
          onClose={() => setTrailerOpen(false)}
          title={resource.name}
          trailerUrl={trailerUrl}
          posterUrl={resource.artworkUrl}
          playFullUrl={matchingOpenMovie ? `/watch/${encodeURIComponent(`movie:${matchingOpenMovie.id}`)}` : undefined}
        />
      )}
    </article>
  )
}
