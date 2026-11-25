/**
 * Dedicated Genre & Subgenre Browse Screen for Kinora.
 *
 * Implements a complete genre destination experience with cinematic header artwork,
 * subgenre navigation, real media grid, content counts, sorting/filtering,
 * and related genre recommendations.
 * Strictly adheres to project typography standards: zero em-dashes across all code and comments.
 */

import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  getGenreById,
  getParentForSubgenre,
  getSubgenresForParent,
  getRelatedGenres,
  type MediaType,
} from '../data/genreTaxonomy'
import { useGenreCustomizations } from '../state/genreCustomizations'
import { useGenreCatalogue } from '../lib/useGenreCatalogue'
import { PageHeader } from '../components/PageHeader'
import { GenreCard } from '../components/GenreCard'
import { PosterCard } from '../components/Tiles'
import { Icon } from '../components/Icon'
import './Browse.css'
import './MediaStreaming.css'

export function GenreBrowseScreen() {
  const { genreId, subgenreId } = useParams<{ genreId: string; subgenreId?: string }>()
  const navigate = useNavigate()
  const { getEffectiveGenreName, resolveArtwork } = useGenreCustomizations()
  const { getEntriesForGenre, countsByGenre, countsBySubgenre } = useGenreCatalogue()

  const [activeMediaType, setActiveMediaType] = useState<MediaType | 'all'>('all')
  const [activeSort, setActiveSort] = useState<'title' | 'newest' | 'oldest'>('title')

  const genre = useMemo(() => {
    return genreId ? getGenreById(genreId) : undefined
  }, [genreId])

  const subgenre = useMemo(() => {
    return subgenreId ? getGenreById(subgenreId) : undefined
  }, [subgenreId])

  const activeGenre = subgenre || genre
  const parentGenre = subgenre ? getParentForSubgenre(subgenre.id) : undefined
  const subgenres = useMemo(() => {
    return genre ? getSubgenresForParent(genre.id) : []
  }, [genre])

  const effectiveName = activeGenre ? getEffectiveGenreName(activeGenre) : 'Genre'
  const resolvedArt = activeGenre ? resolveArtwork(activeGenre, 'banner') : null

  // Fetch real media matching this genre / subgenre
  const items = useMemo(() => {
    if (!genre) return []
    const raw = getEntriesForGenre(genre.id, subgenre?.id, activeMediaType)

    return [...raw].sort((a, b) => {
      if (activeSort === 'newest') {
        const yA = typeof a.year === 'number' ? a.year : parseInt(String(a.year || 0), 10) || 0
        const yB = typeof b.year === 'number' ? b.year : parseInt(String(b.year || 0), 10) || 0
        return yB - yA
      }
      if (activeSort === 'oldest') {
        const yA = typeof a.year === 'number' ? a.year : parseInt(String(a.year || 0), 10) || 0
        const yB = typeof b.year === 'number' ? b.year : parseInt(String(b.year || 0), 10) || 0
        return yA - yB
      }
      return a.title.localeCompare(b.title)
    })
  }, [genre, subgenre, activeMediaType, activeSort, getEntriesForGenre])

  const relatedGenres = useMemo(() => {
    return genre ? getRelatedGenres(genre.id) : []
  }, [genre])

  if (!genre) {
    return (
      <div className="streaming-page">
        <PageHeader title="Genre Not Found" />
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <h2>Genre Not Found</h2>
          <p className="faint">The requested genre collection does not exist in Kinora.</p>
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: 16 }}
            onClick={() => navigate('/discover')}
          >
            Back to Discover
          </button>
        </div>
      </div>
    )
  }

  const totalCount = subgenre
    ? (countsBySubgenre.get(subgenre.id) || items.length)
    : (countsByGenre.get(genre.id) || items.length)

  return (
    <div className="streaming-page genre-browse-screen">
      <PageHeader
        title={effectiveName}
        searchPlaceholder={`Search within ${effectiveName}...`}
      />

      <div className="streaming-content-container" style={{ padding: '0 24px 60px' }}>
        {/* Full-width Cinematic Genre Header */}
        <header
          className="genre-hero-banner"
          style={{ minHeight: 340, marginBottom: 24 }}
          aria-labelledby="genre-page-title"
        >
          {resolvedArt && (
            <img
              src={resolvedArt.url}
              alt=""
              className="genre-hero-banner-bg"
              aria-hidden="true"
            />
          )}

          <div className="genre-hero-banner-overlay" style={{ maxWidth: 760 }}>
            {/* Breadcrumb Navigation */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Link
                to="/discover"
                className="faint"
                style={{ fontSize: '0.8125rem', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
              >
                <Icon name="chevronLeft" size={12} />
                <span>Discover</span>
              </Link>

              {parentGenre && (
                <>
                  <span className="faint">/</span>
                  <Link
                    to={`/genres/${parentGenre.id}`}
                    className="faint"
                    style={{ fontSize: '0.8125rem', textDecoration: 'none' }}
                  >
                    {getEffectiveGenreName(parentGenre)}
                  </Link>
                </>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="genre-hero-kicker" style={{ margin: 0 }}>
                <Icon name={genre.artwork.icon} size={14} />
                {parentGenre ? `Subgenre of ${getEffectiveGenreName(parentGenre)}` : 'Canonical Genre'}
              </span>

              {resolvedArt && (
                <span
                  style={{
                    fontSize: '0.6875rem',
                    padding: '2px 8px',
                    borderRadius: 9999,
                    background: 'rgba(0, 0, 0, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: 'var(--text-2)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {resolvedArt.provenance === 'user'
                    ? 'Custom Artwork'
                    : resolvedArt.provenance === 'verified'
                      ? 'Verified Art'
                      : resolvedArt.provenance === 'inherited'
                        ? 'Inherited Art'
                        : 'Stylized Fallback'}
                </span>
              )}
            </div>

            <h1 id="genre-page-title" className="genre-hero-title" style={{ marginTop: 8 }}>
              {effectiveName}
            </h1>

            <p className="genre-hero-desc">
              {activeGenre?.description || genre.description}
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)' }}>
                {totalCount} {totalCount === 1 ? 'title available' : 'titles available'}
              </span>
            </div>
          </div>
        </header>

        {/* Subgenres Navigation Bar (if parent genre has subgenres) */}
        {subgenres.length > 0 && (
          <nav
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
              padding: '12px 0 20px',
              borderBottom: '1px solid var(--border)',
              marginBottom: 20,
            }}
            aria-label="Subgenres navigation"
          >
            <Link
              to={`/genres/${genre.id}`}
              className={`streaming-nav-pill ${!subgenreId ? 'is-active' : ''}`}
            >
              <span>All {getEffectiveGenreName(genre)}</span>
              <span style={{ fontSize: '0.75rem', opacity: 0.75 }}>
                ({countsByGenre.get(genre.id) || 0})
              </span>
            </Link>

            {subgenres.map((sub) => {
              const isActive = subgenreId === sub.id
              const count = countsBySubgenre.get(sub.id) || 0
              return (
                <Link
                  key={sub.id}
                  to={`/genres/${genre.id}/${sub.id}`}
                  className={`streaming-nav-pill ${isActive ? 'is-active' : ''}`}
                >
                  <span>{getEffectiveGenreName(sub)}</span>
                  <span style={{ fontSize: '0.75rem', opacity: 0.75 }}>({count})</span>
                </Link>
              )
            })}
          </nav>
        )}

        {/* Filtering & Sorting Toolbar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 24,
          }}
        >
          {/* Media Format Filter Pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(['all', 'movies', 'series', 'live', 'audio', 'books'] as const).map((m) => {
              const isActive = activeMediaType === m
              return (
                <button
                  key={m}
                  type="button"
                  className={`btn btn-small ${isActive ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setActiveMediaType(m)}
                >
                  {m === 'all'
                    ? 'All Formats'
                    : m === 'movies'
                      ? 'Movies'
                      : m === 'series'
                        ? 'Series'
                        : m === 'live'
                          ? 'Channels'
                          : m === 'audio'
                            ? 'Audio'
                            : 'Books'}
                </button>
              )
            })}
          </div>

          {/* Sort Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="faint" style={{ fontSize: '0.8125rem' }}>Sort:</span>
            <select
              className="select"
              style={{ padding: '6px 12px', fontSize: '0.8125rem' }}
              value={activeSort}
              onChange={(e) => setActiveSort(e.target.value as 'title' | 'newest' | 'oldest')}
              aria-label="Sort media within genre"
            >
              <option value="title">Title (A to Z)</option>
              <option value="newest">Release Year (Newest)</option>
              <option value="oldest">Release Year (Oldest)</option>
            </select>
          </div>
        </div>

        {/* Real Media Content Grid */}
        {items.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(160px, 15vw, 240px), 1fr))',
              gap: 20,
            }}
          >
            {items.map((it) => {
              if (it.mediaType === 'live') {
                return (
                  <Link
                    key={it.id}
                    to={`/live?channel=${it.channelId}`}
                    className="card channel-card"
                    style={{ textDecoration: 'none' }}
                  >
                    <div className="card-media card-shade" style={{ aspectRatio: '16/9' }}>
                      {it.posterUrl && <img src={it.posterUrl} alt={it.title} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 12 }} />}
                      <span className="card-overlay">
                        <strong>{it.title}</strong>
                        <span className="faint">{effectiveName} Broadcast</span>
                      </span>
                    </div>
                  </Link>
                )
              }

              return (
                <PosterCard
                  key={it.id}
                  to={it.mediaType === 'movies' ? `/movies/${it.id}` : `/series/${it.id}`}
                  title={it.title}
                  art={it.posterUrl || it.backdropUrl || undefined}
                  line={`${it.year || 'Title'} · ${it.genres[0] || effectiveName}`}
                />
              )
            })}
          </div>
        ) : (
          <div
            style={{
              textAlign: 'center',
              padding: '60px 20px',
              background: 'var(--surface)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
            }}
          >
            <Icon name="film" size={32} style={{ color: 'var(--text-3)', marginBottom: 12 }} />
            <h3 style={{ margin: '0 0 8px', fontSize: '1.125rem' }}>No matching titles in your library</h3>
            <p className="faint" style={{ maxWidth: 440, margin: '0 auto 16px', fontSize: '0.875rem' }}>
              No media matching {effectiveName} was found in your currently enabled sources.
            </p>
            <Link to="/discover" className="btn btn-secondary btn-small">
              Explore Other Genres
            </Link>
          </div>
        )}

        {/* Related Genres Rail */}
        {relatedGenres.length > 0 && (
          <section style={{ marginTop: 56 }} aria-label="Related Genres">
            <h2 className="streaming-rail-title" style={{ marginBottom: 16 }}>
              <Icon name="compass" size={18} />
              <span>Related Genres &amp; Themes</span>
            </h2>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: 16,
              }}
            >
              {relatedGenres.map((rel) => (
                <GenreCard
                  key={rel.id}
                  genre={rel}
                  count={countsByGenre.get(rel.id) || 0}
                  showSubgenres={false}
                  to={`/genres/${rel.id}`}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
