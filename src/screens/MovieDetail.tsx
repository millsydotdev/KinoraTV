import { Link, useParams } from 'react-router-dom'
import { NoTitles } from './Movies'
import { movieById, movies } from '../data/catalog'
import { movieRef, runtimeLabel } from '../data/refs'
import { Icon } from '../components/Icon'
import { TitleActions } from '../components/TitleActions'
import { PageHeader } from '../components/PageHeader'
import { PosterCard, Section } from '../components/Tiles'
import { useToast } from '../components/Toast'
import { Art, ProgressBar, StateBlock } from '../components/ui'
import { progressOf, useStore } from '../state/store'
import './Detail.css'

export function MovieDetail() {
  const { id = '' } = useParams()
  const movie = movieById(id)
  const store = useStore()
  const toast = useToast()

  if (!store.demoTitles) return <NoTitles kind="films" />
  if (!movie) {
    return (
      <div className="page">
        <PageHeader title="Movies" />
        <StateBlock icon="film" title="Film not found" action={<Link to="/movies" className="btn btn-primary">Browse films</Link>}>
          There is no film at this address in the demonstration catalogue.
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
          <Link to="/movies" className="text-link detail-back"><Icon name="back" size={16} />Movies</Link>
          <p className="kicker"><Icon name="film" size={16} />Movie · {movie.genres.join(' / ')}</p>
          <h1 className="title-xl">{movie.title}</h1>
          <p className="detail-tagline">{movie.tagline}</p>
          <div className="meta">
            <span>{movie.year}</span>
            <span>{runtimeLabel(movie.runtime)}</span>
            <span><span className="cert">{movie.certificate}</span></span>
            {watched && <span className="watched-mark"><Icon name="check" size={14} />Watched</span>}
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
        <section className="detail-story" aria-labelledby="story">
          <h2 id="story" className="section-title"><Icon name="info" size={18} />Story</h2>
          <p>{movie.synopsis}</p>
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
        <dl className="detail-facts">
          <div><dt>Genres</dt><dd>{movie.genres.join(', ')}</dd></div>
          <div><dt>Running time</dt><dd>{runtimeLabel(movie.runtime)}</dd></div>
          <div><dt>Certificate</dt><dd>{movie.certificate}</dd></div>
          <div><dt>Audio</dt><dd>{movie.audio.join(', ')}</dd></div>
          <div><dt>Subtitles</dt><dd>{movie.subtitles.join(', ')}</dd></div>
          <div><dt>Catalogue</dt><dd>Fictional demonstration title</dd></div>
        </dl>
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
    </article>
  )
}
