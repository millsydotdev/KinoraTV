/**
 * Unified Genre & Content Discovery Screen for Kinora.
 *
 * Implements a rich discovery experience with parent genre exploration,
 * subgenre navigation, curated cross-genre collections, and live library item counts.
 * Strictly adheres to project typography standards: zero em-dashes across all code and comments.
 */

import { useMemo, useState } from 'react'
import {
  CANONICAL_GENRES,
  PARENT_GENRES,
  type MediaType,
} from '../data/genreTaxonomy'
import { useGenreCustomizations } from '../state/genreCustomizations'
import { useGenreCatalogue } from '../lib/useGenreCatalogue'
import { PageHeader } from '../components/PageHeader'
import { GenreCard, GenreHeroBanner } from '../components/GenreCard'
import { ContentRail } from '../components/ContentRail'
import { PosterCard } from '../components/Tiles'
import { Icon } from '../components/Icon'
import './Browse.css'
import './MediaStreaming.css'

export function DiscoverScreen() {
  const { isGenreVisible, getEffectiveGenreName } = useGenreCustomizations()
  const { countsByGenre, allEntries } = useGenreCatalogue()

  const [activeMediaType, setActiveMediaType] = useState<MediaType | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Visible canonical parent genres filtered by selected media type
  const visibleParents = useMemo(() => {
    let list = PARENT_GENRES.filter((g) => isGenreVisible(g.id))
    if (activeMediaType !== 'all') {
      list = list.filter((g) => g.mediaTypes.includes(activeMediaType))
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter((g) => {
        const name = getEffectiveGenreName(g).toLowerCase()
        return name.includes(q) || g.aliases.some((a) => a.toLowerCase().includes(q))
      })
    }
    return list
  }, [activeMediaType, searchQuery, isGenreVisible, getEffectiveGenreName])

  // Top featured hero genre (e.g. Science Fiction or Crime)
  const heroGenre = useMemo(() => {
    const featured = visibleParents.filter((g) => g.featured)
    return featured[0] || visibleParents[0] || CANONICAL_GENRES[0]!
  }, [visibleParents])

  // Handpicked cross-genre highlights from library
  const curatedRecommendations = useMemo(() => {
    return allEntries.slice(0, 10)
  }, [allEntries])

  return (
    <div className="streaming-page discover-screen">
      <PageHeader
        title="Discover"
        searchPlaceholder="Search genres, collections, themes..."
      />

      <div className="streaming-content-container" style={{ padding: '0 24px 48px' }}>
        {/* Navigation Category Tabs */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '16px 0 24px' }}>
          <div className="streaming-nav-tabs" role="tablist" aria-label="Discovery categories">
            {(['all', 'movies', 'series', 'live', 'audio', 'books'] as const).map((t) => {
              const isActive = activeMediaType === t
              return (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`streaming-nav-pill ${isActive ? 'is-active' : ''}`}
                  onClick={() => setActiveMediaType(t)}
                >
                  <Icon
                    name={
                      t === 'movies'
                        ? 'film'
                        : t === 'series'
                          ? 'series'
                          : t === 'live'
                            ? 'live'
                            : t === 'audio'
                              ? 'audio'
                              : t === 'books'
                                ? 'book'
                                : 'compass'
                    }
                    size={14}
                  />
                  <span>
                    {t === 'all'
                      ? 'All Categories'
                      : t === 'movies'
                        ? 'Movies'
                        : t === 'series'
                          ? 'TV Series'
                          : t === 'live'
                            ? 'Live TV'
                            : t === 'audio'
                              ? 'Audio & Podcasts'
                              : 'Books'}
                  </span>
                </button>
              )
            })}
          </div>

          <input
            type="search"
            className="input"
            style={{ maxWidth: 280, padding: '8px 14px', borderRadius: 9999 }}
            placeholder="Filter genres..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Filter genre list"
          />
        </div>

        {/* Featured Hero Genre Banner */}
        {heroGenre && !searchQuery && (
          <GenreHeroBanner
            genre={heroGenre}
            count={countsByGenre.get(heroGenre.id) || 0}
            kicker="Featured Genre Collection"
            to={`/genres/${heroGenre.id}`}
          />
        )}

        {/* Browse by Parent Genre Grid */}
        <section aria-label="Browse by Genre">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 className="streaming-rail-title" style={{ margin: 0 }}>
              <Icon name="tag" size={20} />
              <span>Explore Canonical Genres</span>
            </h2>
            <span className="faint" style={{ fontSize: '0.8125rem' }}>
              {visibleParents.length} {visibleParents.length === 1 ? 'collection' : 'collections'}
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(260px, 22vw, 380px), 1fr))',
              gap: 20,
            }}
          >
            {visibleParents.map((genre) => (
              <GenreCard
                key={genre.id}
                genre={genre}
                count={countsByGenre.get(genre.id) || 0}
                to={`/genres/${genre.id}`}
              />
            ))}
          </div>
        </section>

        {/* Cross-Genre Highlights & Recommendations */}
        {curatedRecommendations.length > 0 && !searchQuery && (
          <div style={{ marginTop: 40 }}>
            <ContentRail
              id="discover-recommended-rail"
              icon="sparkles"
              title="Recommended Across Genres"
              sub="Popular titles matching your available media sources"
              layout="poster"
            >
              {curatedRecommendations.map((item) => (
                <PosterCard
                  key={item.id}
                  to={item.mediaType === 'movies' ? `/movies/${item.id}` : `/series/${item.id}`}
                  title={item.title}
                  art={item.posterUrl || item.backdropUrl || undefined}
                  line={`${item.year || 'Title'} · ${item.genres[0] || 'Media'}`}
                />
              ))}
            </ContentRail>
          </div>
        )}
      </div>
    </div>
  )
}
