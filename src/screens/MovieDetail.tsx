import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { NoTitles } from './Movies'
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
import { RatingControls } from '../components/RatingControls'
import './Detail.css'

export function MovieDetail() {
  const { id = '' } = useParams()
  const movie = movieById(id)
  const store = useStore()
  const toast = useToast()
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [trailerOpen, setTrailerOpen] = useState(false)

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

  const imported = store.xtreamCatalogue.movies.find((item) => `xt:${item.sourceId}:${item.id}` === id)

  if (imported) return <XtreamMovieDetail key={`${imported.sourceId}:${imported.id}`} movie={imported} />

  if (!store.demoTitles) return <NoTitles kind="films" />
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
        <Art src={movie.art} focus={movie.focus} eager className="detail-backdrop" />
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
            <AgeRatingBadge rating={movie.certificate} system="bbfc" />
            {watched && <span className="watched-mark"><Icon name="check" size={14} />Watched</span>}
            {(movie as unknown as { trailerUrl?: string }).trailerUrl && (
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => setTrailerOpen(true)}
                title="Watch trailer preview"
                style={{ marginLeft: 8 }}
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
              style={{ marginLeft: 8 }}
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

      {similar.length > 0 && (
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
        <TrailerModal
          open={trailerOpen}
          onClose={() => setTrailerOpen(false)}
          title={movie.title}
        />
      )}
    </article>
  )
}

function XtreamMovieDetail({ movie }: { movie: XtreamTitle }) {
  const store = useStore()
  const toast = useToast()
  const [details, setDetails] = useState<XtreamMovieDetails | null>(null)

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
            <Link to={`/watch/${encodeURIComponent(ref)}`} className="btn btn-primary">
              <Icon name="play" size={18} />
              Play Movie
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
              {inWatchlist ? 'In watchlist' : 'Add to watchlist'}
            </button>
            <button
              type="button"
              className="icon-btn ringed fav-toggle"
              aria-pressed={inFav}
              aria-label={inFav ? 'Remove from favourites' : 'Add to favourites'}
              data-tip={inFav ? 'Favourite' : 'Add to favourites'}
              onClick={() => {
                store.toggleFavourite(ref)
                toast(inFav ? `Removed ${movie.name} from favourites` : `Added ${movie.name} to favourites`)
              }}
            >
              <Icon name="heart" size={20} />
            </button>
          </div>
          <div style={{ marginTop: 12 }}>
            <RatingControls itemRef={ref} title={details?.name || movie.name} showStars />
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

function TrailerModal({
  open,
  onClose,
  title,
  trailerUrl,
}: {
  open: boolean
  onClose: () => void
  title: string
  trailerUrl?: string | null
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="lightbox-backdrop" role="dialog" aria-modal="true" aria-label={`Trailer for ${title}`} onClick={onClose}>
      <div className="lightbox-content" style={{ maxWidth: 840 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>
            {title} - Official Trailer Preview
          </h3>
          <button type="button" className="btn btn-ghost btn-small" onClick={onClose} aria-label="Close trailer">
            <Icon name="close" size={16} />
          </button>
        </div>
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#000', borderRadius: 'var(--r-m)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {trailerUrl ? (
            <iframe
              src={trailerUrl}
              title={`${title} Trailer`}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              style={{ width: '100%', height: '100%', border: 'none' }}
            />
          ) : (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-2)' }}>
              <span style={{ opacity: 0.6, marginBottom: 12, display: 'inline-block' }}>
                <Icon name="film" size={48} />
              </span>
              <p style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600 }}>
                No trailer preview available
              </p>
              <p className="faint" style={{ marginTop: 6, fontSize: '0.8125rem' }}>
                An official video trailer stream was not found in the metadata for {title}.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
