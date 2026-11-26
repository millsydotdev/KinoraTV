/**
 * Reusable Cinematic Genre Card & Hero Banner Components for Kinora.
 *
 * Provides responsive landscape genre tiles, subgenre pill previews,
 * item count badges, provenance indicators, and wide featured banners.
 * Strictly adheres to project typography standards: zero em-dashes across all code and comments.
 */

import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { GenreDefinition } from '../data/genreTaxonomy'
import { getGenreById } from '../data/genreTaxonomy'
import { useGenreCustomizations } from '../state/genreCustomizations'
import { Icon } from './Icon'
import './GenreCard.css'

export interface GenreCardProps {
  genre: GenreDefinition
  count?: number
  variant?: 'landscape' | 'portrait'
  to?: string
  onClick?: () => void
  showSubgenres?: boolean
  className?: string
}

export function GenreCard({
  genre,
  count,
  variant = 'landscape',
  to,
  onClick,
  showSubgenres = true,
  className = '',
}: GenreCardProps) {
  const { resolveArtwork, getEffectiveGenreName } = useGenreCustomizations()
  const resolved = resolveArtwork(genre, variant)
  const effectiveName = getEffectiveGenreName(genre)
  const targetUrl = to ?? `/genres/${genre.id}`

  const subgenres = showSubgenres && genre.subgenreIds.length > 0
    ? genre.subgenreIds.slice(0, 3).map((id) => getGenreById(id)?.name || id)
    : []

  const content = (
    <>
      <div
        className="genre-card-media"
        style={{
          background: resolved.cssGradient,
        }}
      >
        <img
          src={resolved.url}
          alt={effectiveName}
          className="genre-card-img"
          loading="lazy"
        />
        <div className="genre-card-overlay">
          {typeof count === 'number' && count > 0 && (
            <div className="genre-card-top-badges">
              <span className="genre-card-badge badge-count">
                {count} {count === 1 ? 'title' : 'titles'}
              </span>
            </div>
          )}

          <div className="genre-card-bottom-info">
            <h3 className="genre-card-title">{effectiveName}</h3>
            {subgenres.length > 0 && (
              <p className="genre-card-subtitle">{subgenres.join(' • ')}</p>
            )}
          </div>
        </div>
      </div>
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        className={`genre-card ${className}`.trim()}
        onClick={onClick}
        aria-label={`Browse ${effectiveName} genre`}
      >
        {content}
      </button>
    )
  }

  return (
    <Link
      to={targetUrl}
      className={`genre-card ${className}`.trim()}
      aria-label={`Browse ${effectiveName} genre`}
    >
      {content}
    </Link>
  )
}

export interface GenreHeroBannerProps {
  genre: GenreDefinition
  count?: number
  kicker?: string
  to?: string
  actions?: ReactNode
}

export function GenreHeroBanner({
  genre,
  count,
  kicker = 'Featured Genre',
  to,
  actions,
}: GenreHeroBannerProps) {
  const { resolveArtwork, getEffectiveGenreName } = useGenreCustomizations()
  const resolved = resolveArtwork(genre, 'banner')
  const effectiveName = getEffectiveGenreName(genre)
  const targetUrl = to ?? `/genres/${genre.id}`

  return (
    <section className="genre-hero-banner" aria-labelledby="genre-hero-title">
      <img
        src={resolved.url}
        alt=""
        className="genre-hero-banner-bg"
        aria-hidden="true"
      />
      <div className="genre-hero-banner-overlay">
        <span className="genre-hero-kicker">
          <Icon name={genre.artwork.icon} size={14} />
          {kicker}
        </span>
        <h2 id="genre-hero-title" className="genre-hero-title">{effectiveName}</h2>
        <p className="genre-hero-desc">{genre.description}</p>

        <div className="genre-hero-actions">
          {actions || (
            <Link to={targetUrl} className="streaming-btn-watch">
              <Icon name="play" size={16} />
              <span>Explore {effectiveName}</span>
              {typeof count === 'number' && (
                <span style={{ opacity: 0.8, fontSize: '0.8125rem', marginLeft: 4 }}>
                  ({count})
                </span>
              )}
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}
