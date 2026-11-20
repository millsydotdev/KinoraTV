import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import { Art, ProgressBar } from './ui'
import { XtreamArt } from './Tiles'
import { progressOf, useStore } from '../state/store'
import { useToast } from './Toast'
import { AgeRatingBadge } from './AgeRatingBadge'
import { artworkEngine } from '../data/artworkEngine'
import './EpisodeDetailModal.css'

export interface EpisodeModalItem {
  id: string
  number: number
  title: string
  synopsis?: string
  runtime?: number | null
  airDate?: string | null
  still?: string
  artworkKey?: string | null
}

export interface EpisodeDetailModalProps {
  open: boolean
  onClose: () => void
  seriesId: string
  seriesTitle: string
  seriesBackdropUrl?: string
  seriesCertificate?: string
  seriesGenres?: string[]
  cast?: string[]
  seasonNumber: number
  totalSeasons?: number
  episodesInSeason: EpisodeModalItem[]
  currentEpisodeId: string
  onSelectEpisode: (episodeId: string) => void
  onSelectSeason?: (seasonNumber: number) => void
}

export function EpisodeDetailModal({
  open,
  onClose,
  seriesId,
  seriesTitle,
  seriesBackdropUrl,
  seriesCertificate,
  seriesGenres,
  cast = [],
  seasonNumber,
  totalSeasons = 1,
  episodesInSeason,
  currentEpisodeId,
  onSelectEpisode,
  onSelectSeason,
}: EpisodeDetailModalProps) {
  const store = useStore()
  const toast = useToast()

  const episodeIndex = useMemo(() => {
    const idx = episodesInSeason.findIndex((e) => String(e.id) === String(currentEpisodeId))
    return idx >= 0 ? idx : 0
  }, [episodesInSeason, currentEpisodeId])

  const episode = episodesInSeason[episodeIndex] ?? episodesInSeason[0]
  const prevEpisode = episodeIndex > 0 ? episodesInSeason[episodeIndex - 1] : null
  const nextEpisode = episodeIndex < episodesInSeason.length - 1 ? episodesInSeason[episodeIndex + 1] : null

  // Keyboard navigation: Escape closes modal, Left/Right arrow navigates episodes
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowLeft' && prevEpisode) {
        e.preventDefault()
        onSelectEpisode(prevEpisode.id)
      } else if (e.key === 'ArrowRight' && nextEpisode) {
        e.preventDefault()
        onSelectEpisode(nextEpisode.id)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose, prevEpisode, nextEpisode, onSelectEpisode])

  if (!open || !episode) return null

  const isXtream = seriesId.startsWith('xt:')
  const epRef = isXtream
    ? `episode:${seriesId}/${episode.id}`
    : `episode:${seriesId}/${episode.id}`

  const watched = store.library.watched.includes(epRef)
  const inWatchlist = store.library.watchlist.includes(epRef)
  const prog = progressOf(store.library, epRef)
  const playRoute = `/watch/${encodeURIComponent(epRef)}`

  // Artwork resolution
  let resolvedStill = episode.still
  if (!resolvedStill && !episode.artworkKey) {
    const engineStill = artworkEngine.getArtwork(`episode:still:${seriesId}:${seasonNumber}:${episode.number}`)?.sourceUrl
      || artworkEngine.findArtwork(`${seriesTitle} S${seasonNumber}E${episode.number}`, 'episode-still')?.sourceUrl
    if (engineStill) resolvedStill = engineStill
  }

  const isFallback = !resolvedStill && !episode.artworkKey && Boolean(seriesBackdropUrl)
  const displayStill = resolvedStill || seriesBackdropUrl || ''
  const epCode = `S${String(seasonNumber).padStart(2, '0')} E${String(episode.number).padStart(2, '0')}`

  return (
    <div
      className="episode-detail-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`${epCode}: ${episode.title}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="episode-detail-modal">
        {/* TOP BAR / BREADCRUMB */}
        <div className="episode-detail-topbar">
          <div className="episode-detail-breadcrumbs">
            <span className="breadcrumb-series">{seriesTitle}</span>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-season">Season {seasonNumber}</span>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-episode">{epCode}</span>
          </div>
          <button
            type="button"
            className="episode-detail-close-btn"
            aria-label="Close episode details"
            onClick={onClose}
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* DOMINANT 16:9 HERO STILL */}
        <div className="episode-detail-hero">
          {episode.artworkKey ? (
            <XtreamArt
              artworkKey={episode.artworkKey}
              alt={episode.title}
              className="episode-detail-hero-media"
              fallbackTitle={episode.title}
              fallbackIcon="series"
            />
          ) : (
            <Art
              src={displayStill}
              alt={episode.title}
              eager
              fallbackIcon="series"
              className="episode-detail-hero-media"
            />
          )}

          <div className="episode-detail-hero-scrim" />

          {/* Fallback indicator */}
          {isFallback && (
            <span className="episode-detail-fallback-badge">
              <Icon name="info" size={14} />
              <span>Episode-specific still unavailable (series backdrop shown)</span>
            </span>
          )}

          {/* Episode code badge */}
          <span className="episode-detail-code-badge">{epCode}</span>

          {/* Centered Large Play Button */}
          <Link
            to={playRoute}
            className="episode-detail-hero-play"
            aria-label={`Play ${epCode}: ${episode.title}`}
          >
            <span className="hero-play-circle">
              <Icon name="play" size={28} />
            </span>
            <span className="hero-play-label">
              {prog != null ? `Resume (${Math.round(prog * 100)}%)` : 'Watch Episode'}
            </span>
          </Link>

          {/* Watch Progress Bar */}
          {prog != null && (
            <div className="episode-detail-progress-bar">
              <ProgressBar value={prog} label={`${Math.round(prog * 100)}% watched`} />
            </div>
          )}
        </div>

        {/* EPISODE CONTENT BODY */}
        <div className="episode-detail-body">
          <div className="episode-detail-meta-row">
            <span className="episode-pill-code">{epCode}</span>
            {episode.airDate && <span className="episode-meta-tag">{episode.airDate}</span>}
            {episode.runtime != null && <span className="episode-meta-tag">{episode.runtime} min</span>}
            {seriesCertificate && <AgeRatingBadge rating={seriesCertificate} system="bbfc" />}
            <span className="badge-tech">HD 1080p</span>
            <span className="badge-tech">Stereo</span>
            {watched && <span className="episode-meta-tag is-watched-tag"><Icon name="check" size={12} /> Watched</span>}
          </div>

          <h1 className="episode-detail-title">{episode.title}</h1>

          {seriesGenres && seriesGenres.length > 0 && (
            <p className="episode-detail-genres">{seriesGenres.join(' · ')}</p>
          )}

          {/* PRIMARY ACTIONS */}
          <div className="episode-detail-actions">
            <Link to={playRoute} className="btn btn-primary">
              <Icon name="play" size={18} />
              <span>{prog != null ? 'Resume Episode' : 'Watch Now'}</span>
            </Link>

            <button
              type="button"
              className={`btn btn-secondary ${watched ? 'is-active' : ''}`}
              onClick={() => {
                store.setWatched([epRef], !watched)
                toast(watched ? `Marked ${epCode} as unwatched` : `Marked ${epCode} as watched`)
              }}
            >
              <Icon name="check" size={16} />
              <span>{watched ? 'Watched' : 'Mark as Watched'}</span>
            </button>

            <button
              type="button"
              className={`btn btn-secondary ${inWatchlist ? 'is-active' : ''}`}
              onClick={() => {
                store.toggleWatchlist(epRef)
                toast(inWatchlist ? `Removed ${episode.title} from watchlist` : `Added ${episode.title} to watchlist`)
              }}
            >
              <Icon name={inWatchlist ? 'check' : 'bookmark'} size={16} />
              <span>{inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}</span>
            </button>
          </div>

          {/* SYNOPSIS */}
          <div className="episode-detail-synopsis-section">
            <h3 className="episode-section-heading">Synopsis</h3>
            <p className="episode-detail-synopsis-text">
              {episode.synopsis || 'No detailed plot synopsis is currently recorded for this broadcast episode.'}
            </p>
          </div>

          {/* CAST SECTION */}
          {cast.length > 0 && (
            <div className="episode-detail-cast-section">
              <h3 className="episode-section-heading">Cast & Characters</h3>
              <div className="episode-cast-tags">
                {cast.map((actor) => (
                  <Link
                    key={actor}
                    to={`/search?q=${encodeURIComponent(actor)}`}
                    className="episode-cast-pill"
                    onClick={onClose}
                    title={`Search for titles involving ${actor}`}
                  >
                    <Icon name="user" size={14} />
                    <span>{actor}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* SEASON NAVIGATION */}
          {totalSeasons > 1 && onSelectSeason && (
            <div className="episode-detail-season-switch">
              <h3 className="episode-section-heading">Season</h3>
              <div className="episode-season-tabs">
                {Array.from({ length: totalSeasons }, (_, i) => i + 1).map((sNum) => (
                  <button
                    key={sNum}
                    type="button"
                    className={`btn btn-small ${sNum === seasonNumber ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => onSelectSeason(sNum)}
                  >
                    Season {sNum}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* PREVIOUS & NEXT EPISODE NAVIGATION */}
          <div className="episode-detail-nav">
            {prevEpisode ? (
              <button
                type="button"
                className="episode-nav-link is-prev"
                onClick={() => onSelectEpisode(prevEpisode.id)}
              >
                <span className="nav-arrow"><Icon name="left" size={18} /></span>
                <div className="nav-info">
                  <span className="nav-label">Previous Episode</span>
                  <strong className="nav-title">S{seasonNumber} E{prevEpisode.number}: {prevEpisode.title}</strong>
                </div>
              </button>
            ) : (
              <div className="episode-nav-placeholder">
                <span className="faint">First episode of season</span>
              </div>
            )}

            {nextEpisode ? (
              <button
                type="button"
                className="episode-nav-link is-next"
                onClick={() => onSelectEpisode(nextEpisode.id)}
              >
                <div className="nav-info">
                  <span className="nav-label">Next Episode</span>
                  <strong className="nav-title">S{seasonNumber} E{nextEpisode.number}: {nextEpisode.title}</strong>
                </div>
                <span className="nav-arrow"><Icon name="right" size={18} /></span>
              </button>
            ) : (
              <div className="episode-nav-placeholder">
                <span className="faint">Season finale</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
