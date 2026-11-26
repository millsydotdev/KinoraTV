import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { series, seriesById } from '../data/catalog'
import { episodeRef } from '../data/refs'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { EpisodeCard, PosterCard, Section, XtreamArt } from '../components/Tiles'
import { EpisodeDetailModal } from '../components/EpisodeDetailModal'
import { TitleActions } from '../components/TitleActions'
import { useToast } from '../components/Toast'
import { Art, ProgressBar, StateBlock } from '../components/ui'
import { seriesNextUp } from '../lib/library'
import { progressOf, useStore, type XtreamTitle } from '../state/store'
import { isTitleKidSafe } from '../lib/kidsMode'
import type { XtreamSeriesDetails as ProviderSeriesDetails } from '../lib/native'
import { AgeRatingBadge } from '../components/AgeRatingBadge'
import { Breadcrumbs } from '../components/Breadcrumbs'
import { CollectionDialog } from '../components/CollectionDialog'
import { RatingControls } from '../components/RatingControls'
import { TrailerPlayerModal } from '../components/TrailerPlayerModal'
import type { MediaResource } from '../data/personalLibrary'
import { VERIFICATION_STATUS_META } from '../data/personalLibrary'
import { classifyMediaResource } from '../data/provenance'
import { OPEN_SERIES } from '../data/openCatalogue'
import { findAlternateVodVariants } from '../lib/vodAggregation'
import { useArtwork } from '../lib/useArtwork'
import { resolveRichSeriesDetails, type SeriesMetadataDetails } from '../data/metadataProviders'
import { artworkEngine } from '../data/artworkEngine'
import './Detail.css'

export function SeriesDetail() {
  const { id = '', epId } = useParams()
  const [params, setParams] = useSearchParams()
  const store = useStore()
  const toast = useToast()
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const [trailerOpen, setTrailerOpen] = useState(false)
  const s = seriesById(id)

  if (s && store.isKidsMode && !isTitleKidSafe(s)) {
    return (
      <div className="page" style={{ padding: '48px 24px', textAlign: 'center' }}>
        <StateBlock
          icon="lock"
          title="Restricted in Kids Mode"
          action={<Link to="/series" className="btn btn-primary">Browse Family Shows</Link>}
        >
          {s.title} is rated {s.certificate} and is blocked for child profiles.
        </StateBlock>
      </div>
    )
  }

  const imported = store.xtreamCatalogue.series.find((item) => `xt:${item.sourceId}:${item.id}` === id || String(item.id) === id)

  if (imported) return <XtreamSeriesDetail key={`${imported.sourceId}:${imported.id}`} show={imported} initialEpisodeId={epId || params.get('episode') || null} />

  const cleanResId = id.replace(/^res:/, '')
  const publicRes = store.mediaLibrary.allResources.find((r) => r.id === cleanResId || r.id === id)
  if (publicRes && (publicRes.category === 'series' || publicRes.subcategory.includes('tv') || publicRes.subcategory.includes('series') || publicRes.subcategory.includes('broadcasting'))) {
    return <PublicDiscoverySeriesDetail resource={publicRes} initialEpisodeId={epId || params.get('episode') || null} />
  }

  const isSampleProvider = typeof window !== 'undefined' && window.sessionStorage?.getItem('kinora.sample_provider_view') === '1'

  if (!store.demoTitles && !isSampleProvider) {
    const isOpenSeries = s ? OPEN_SERIES.some((item) => item.id === s.id) : false
    if (s && !isOpenSeries) {
      return (
        <div className="page detail-page">
          <PageHeader title="TV Shows" />
          <div style={{ maxWidth: 720, margin: '60px auto', padding: '0 20px' }}>
            <StateBlock
              icon="series"
              title="Series Unavailable in Personal Sources"
              action={
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <Link to="/series" className="btn btn-primary">
                    <Icon name="series" size={16} />
                    <span>Browse TV Series Catalogue</span>
                  </Link>
                  <Link to="/sources?tab=active" className="btn btn-secondary">
                    <Icon name="plus" size={16} />
                    <span>Connect On-Demand Provider</span>
                  </Link>
                </div>
              }
            >
              "{s.title}" is not available in your currently connected personal sources. Connect an on-demand provider in Sources or explore Kinora's verified public discovery television archives.
            </StateBlock>
          </div>
        </div>
      )
    }
    if (!s) {
      return (
        <div className="page">
          <PageHeader title="TV Shows" />
          <StateBlock icon="series" title="TV show not found" action={<Link to="/series" className="btn btn-primary">Browse TV shows</Link>}>
            There is no TV show at this address in the available catalogue.
          </StateBlock>
        </div>
      )
    }
  }
  if (!s) {
    return (
      <div className="page">
        <PageHeader title="TV Shows" />
        <StateBlock icon="series" title="TV show not found" action={<Link to="/series" className="btn btn-primary">Browse TV shows</Link>}>
          There is no TV show at this address in the available catalogue.
        </StateBlock>
      </div>
    )
  }

  const up = seriesNextUp(store.library, s)
  const seasonNo = Math.min(s.seasons.length, Math.max(1, Number(params.get('season')) || up.episode.season))
  const episodes = s.seasons[seasonNo - 1] ?? []
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(params.get('episode') || null)
  const seasonRefs = episodes.map((e) => episodeRef(s.id, e.id))
  const seasonWatched = seasonRefs.every((r) => store.library.watched.includes(r))
  const totalEps = s.seasons.flat().length
  const watchedEps = s.seasons.flat().filter((e) => store.library.watched.includes(episodeRef(s.id, e.id))).length

  const relatedSeries = useMemo(() => {
    return series.filter((item) => item.id !== s.id && item.genres.some((g) => s.genres.includes(g)))
  }, [s.id, s.genres])

  const seriesCast = useMemo(() => {
    if (s.id === 'ninth-ward') return ['Ines Calloway', 'Elena Rostova', 'Arthur Pendelton']
    if (s.id === 'fathom') return ['Marcus Vance', 'Dr. Lena Chen', 'Jonas Ray']
    if (s.id === 'beverly-hillbillies') return ['Buddy Ebsen', 'Irene Ryan', 'Donna Douglas', 'Max Baer Jr.']
    if (s.id === 'dragnet-1951') return ['Jack Webb', 'Ben Alexander', 'Harry Morgan']
    if (s.id === 'one-step-beyond') return ['John Newland']
    return ['Elena Rostova', 'Ines Calloway']
  }, [s.id])

  const pickSeason = (n: number) => setParams({ season: String(n) }, { replace: true })
  const onTabKey = (e: KeyboardEvent) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    const n = ((seasonNo - 1 + dir + s.seasons.length) % s.seasons.length) + 1
    pickSeason(n)
    tabs.current[n - 1]?.focus()
  }

  const seriesContentId = `series:${s.id}`
  const firstYear = Number.parseInt(String(s.years || '').slice(0, 4), 10) || undefined
  const [richSeriesMeta, setRichSeriesMeta] = useState<SeriesMetadataDetails | null>(() => {
    const cached = artworkEngine.getMetadataDetails(seriesContentId)
    return cached && 'seasons' in cached ? cached : null
  })

  useEffect(() => {
    let active = true
    void resolveRichSeriesDetails({
      title: s.title,
      year: firstYear,
      imdbId: s.imdbId,
      seasonNumber: seasonNo,
    }).then((details) => {
      if (active && details) {
        artworkEngine.setMetadataDetails(seriesContentId, details)
        setRichSeriesMeta(details)
      }
    })
    return () => {
      active = false
    }
  }, [seriesContentId, s.title, firstYear, s.imdbId, seasonNo])

  const resolvedBackdrop = useArtwork({
    contentId: seriesContentId,
    title: s.title,
    type: 'series-backdrop',
    providerArt: richSeriesMeta?.backdropUrl || s.backdropUrl || episodes[0]?.still || s.art,
    imdbId: richSeriesMeta?.imdbId || s.imdbId,
    year: firstYear,
  })
  const resolvedPoster = useArtwork({
    contentId: seriesContentId,
    title: s.title,
    type: 'series-poster',
    providerArt: richSeriesMeta?.posterUrl || s.posterUrl || s.art,
    imdbId: richSeriesMeta?.imdbId || s.imdbId,
    year: firstYear,
  })
  const resolvedSeasonPoster = useArtwork({
    contentId: seriesContentId,
    title: `${s.title} - Season ${seasonNo}`,
    type: 'season-artwork',
    seasonNumber: seasonNo,
    autoEnrich: false,
  })

  const seasonBackdrop = resolvedBackdrop.src || episodes[0]?.still || s.backdropUrl || ''
  const effectiveSeriesPoster = resolvedPoster.src || s.posterUrl || s.art
  const effectiveSeriesGenres = richSeriesMeta?.genres?.length ? richSeriesMeta.genres : s.genres
  const effectiveSeriesSynopsis = richSeriesMeta?.overview || s.synopsis
  const activeMetaSeason = richSeriesMeta?.seasons?.find((sn) => sn.seasonNumber === seasonNo)
  const effectiveSeasonPoster = activeMetaSeason?.posterUrl || resolvedSeasonPoster.src

  return (
    <article className="detail">
      <header className="detail-hero">
        <Art
          src={seasonBackdrop}
          alt={s.title}
          contentId={seriesContentId}
          focus={s.focus}
          fitMode="backdrop"
          eager
          className="detail-backdrop"
          fallbackIcon="series"
        />
        <PageHeader overlay />
        <div className="detail-hero-content">
          <div className="detail-hero-layout">
            {effectiveSeriesPoster && (
              <div className="detail-hero-poster-wrap">
                <Art
                  src={effectiveSeriesPoster}
                  alt={`${s.title} poster`}
                  contentId={`${seriesContentId}:poster`}
                  fitMode="poster"
                  eager
                  fallbackIcon="series"
                  fallbackYear={firstYear}
                />
              </div>
            )}
            <div className="detail-hero-meta-col">
              <Breadcrumbs crumbs={[{ label: 'Home', to: '/' }, { label: 'TV Shows', to: '/series' }, { label: s.title }]} />
              <Link to="/series" className="text-link detail-back"><Icon name="back" size={16} />TV Shows</Link>
              <p className="kicker"><Icon name="series" size={16} />TV Show · {effectiveSeriesGenres.join(' / ')}</p>
              <h1 className="title-xl">{s.title}</h1>
              <p className="detail-tagline">{s.tagline}</p>
              <div className="meta">
                <span>{s.years}</span>
                <span>{s.seasons.length} season{s.seasons.length > 1 ? 's' : ''}</span>
                <span>{totalEps} episodes</span>
                {richSeriesMeta?.network && <span>{richSeriesMeta.network}</span>}
                <span className="badge-tech">4K HDR</span>
                <AgeRatingBadge rating={s.certificate} system="bbfc" />
                {s.trailerUrl && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() => setTrailerOpen(true)}
                    title="Watch series preview"
                  >
                    <Icon name="play" size={14} />
                    <span>Trailer</span>
                  </button>
                )}
              </div>
              <p className="detail-synopsis">{effectiveSeriesSynopsis}</p>
              {watchedEps > 0 && (
                <div className="detail-progress">
                  <ProgressBar value={watchedEps / totalEps} label="Series progress" />
                  <span className="faint tnum">{watchedEps} of {totalEps} episodes watched</span>
                </div>
              )}
              <TitleActions title={s} />
            </div>
          </div>
        </div>
      </header>

      <section className="episodes" aria-label="Episodes">
        <div className="episodes-head">
          <div className="tabs" role="tablist" aria-label="Seasons" onKeyDown={onTabKey}>
            {s.seasons.map((_, i) => (
              <button
                key={i}
                ref={(el) => { tabs.current[i] = el }}
                type="button"
                role="tab"
                id={`season-tab-${i + 1}`}
                aria-selected={seasonNo === i + 1}
                aria-controls="season-panel"
                tabIndex={seasonNo === i + 1 ? 0 : -1}
                className="tab"
                onClick={() => pickSeason(i + 1)}
              >
                Season {i + 1}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => {
              const before = seasonRefs.filter((r) => store.library.watched.includes(r))
              store.setWatched(seasonRefs, !seasonWatched)
              toast(seasonWatched ? `Season ${seasonNo} marked as not watched` : `Season ${seasonNo} marked as watched`, {
                label: 'Undo',
                run: () => {
                  store.setWatched(seasonRefs, false)
                  store.setWatched(before, true)
                },
              })
            }}
          >
            <Icon name={seasonWatched ? 'close' : 'check'} size={16} />
            {seasonWatched ? 'Mark season unwatched' : 'Mark season watched'}
          </button>
        </div>

        {effectiveSeasonPoster && (
          <div className="season-poster-strip">
            <div className="season-poster-thumb">
              <Art
                src={effectiveSeasonPoster}
                alt={`${s.title} Season ${seasonNo} poster`}
                contentId={`season:${s.id}:${seasonNo}`}
                fitMode="poster"
                eager
                fallbackIcon="series"
              />
            </div>
            <div>
              <strong>{activeMetaSeason?.name || `Season ${seasonNo}`}</strong>
              <p className="faint" style={{ margin: '4px 0 0', fontSize: '0.84rem' }}>
                {activeMetaSeason?.overview || `${episodes.length} episodes in Season ${seasonNo}.`}
              </p>
            </div>
          </div>
        )}

        <ol id="season-panel" role="tabpanel" aria-labelledby={`season-tab-${seasonNo}`} className="episode-list">
          {episodes.map((e) => {
            const ref = episodeRef(s.id, e.id)
            const watched = store.library.watched.includes(ref)
            const prog = progressOf(store.library, ref)
            const isNext = up.episode.id === e.id && up.state !== 'rewatch'
            return (
              <li key={e.id} className="episode-item">
                <EpisodeCard
                  to={`/watch/${encodeURIComponent(ref)}`}
                  seriesId={s.id}
                  seriesTitle={s.title}
                  episodeId={e.id}
                  episodeTitle={e.title}
                  seasonNumber={e.season}
                  episodeNumber={e.number}
                  stillUrl={e.still}
                  seriesBackdropUrl={s.backdropUrl || ''}
                  runtimeMin={e.runtime}
                  synopsis={e.synopsis}
                  progress={prog}
                  watched={watched}
                  isNext={isNext}
                  itemRef={ref}
                  onToggleWatched={() => store.setWatched([ref], !watched)}
                  onOpenDetails={() => setSelectedEpisodeId(e.id)}
                />
              </li>
            )
          })}
        </ol>
      </section>

      {relatedSeries.length > 0 && (
        <div className="detail-more">
          <Section icon="series" title="More Like This" viewAll={`/series?genre=${encodeURIComponent(s.genres[0] ?? '')}`} grid="grid-posters">
            {relatedSeries.slice(0, 7).map((item) => (
              <PosterCard key={item.id} to={`/series/${item.id}`} title={item.title} art={item.art || item.backdropUrl} focus={item.focus} line={`${item.years} · ${item.genres[0]}`} />
            ))}
          </Section>
        </div>
      )}

      <EpisodeDetailModal
        open={Boolean(selectedEpisodeId)}
        onClose={() => setSelectedEpisodeId(null)}
        seriesId={s.id}
        seriesTitle={s.title}
        seriesBackdropUrl={s.backdropUrl || ''}
        seriesCertificate={s.certificate}
        seriesGenres={s.genres}
        cast={seriesCast}
        seasonNumber={seasonNo}
        totalSeasons={s.seasons.length}
        episodesInSeason={episodes.map((e) => ({
          id: e.id,
          number: e.number,
          title: e.title,
          synopsis: e.synopsis,
          runtime: e.runtime,
          still: e.still,
        }))}
        currentEpisodeId={selectedEpisodeId || episodes[0]?.id || ''}
        onSelectEpisode={(id) => setSelectedEpisodeId(id)}
        onSelectSeason={(n) => pickSeason(n)}
      />

      {trailerOpen && (
        <TrailerPlayerModal
          open={trailerOpen}
          onClose={() => setTrailerOpen(false)}
          title={s.title}
          trailerUrl={s.trailerUrl}
          posterUrl={s.backdropUrl || s.art}
          playFullUrl={`/watch/${encodeURIComponent(episodeRef(s.id, up.episode.id))}`}
        />
      )}
    </article>
  )
}

function XtreamSeriesDetail({ show, initialEpisodeId }: { show: XtreamTitle; initialEpisodeId?: string | null }) {
  const store = useStore()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const [details, setDetails] = useState<ProviderSeriesDetails | null>(store.xtreamSeriesDetails[`${show.sourceId}:${show.id}`] ?? null)
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(initialEpisodeId || params.get('episode') || null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [trailerOpen, setTrailerOpen] = useState(false)

  useEffect(() => {
    let active = true
    if (details) return () => { active = false }
    void store.loadXtreamSeries(show.sourceId, show.id).then((value) => {
      if (active) setDetails(value)
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Kinora could not load this series.')
    })
    return () => { active = false }
  }, [show.sourceId, show.id, details, retry, store.loadXtreamSeries])

  const source = store.xtreamSources.find((item) => item.id === show.sourceId)
  const seasons = details?.seasons ?? []
  const initialSeasonNo = seasons[0]?.number ?? 1
  const paramSeason = Number(params.get('season'))
  const activeSeason = seasons.find((s) => s.number === paramSeason) ?? seasons[0]
  const seasonNo = activeSeason?.number ?? initialSeasonNo

  const pickSeason = (n: number) => setParams({ season: String(n) }, { replace: true })

  const onTabKey = (e: KeyboardEvent) => {
    if (seasons.length <= 1) return
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!dir) return
    e.preventDefault()
    const currentIndex = seasons.findIndex((s) => s.number === seasonNo)
    const nextIndex = (currentIndex + dir + seasons.length) % seasons.length
    const nextSeason = seasons[nextIndex]
    if (nextSeason) {
      pickSeason(nextSeason.number)
      tabs.current[nextIndex]?.focus()
    }
  }

  const episodes = activeSeason?.episodes ?? []
  const seasonRefs = episodes.map((e) => `episode:xt:${show.sourceId}:${show.id}/${e.id}`)
  const seasonWatched = seasonRefs.length > 0 && seasonRefs.every((r) => store.library.watched.includes(r))

  const allEpisodes = seasons.flatMap((s) => s.episodes.map((e) => ({ ...e, seasonNumber: s.number })))
  const totalEps = allEpisodes.length
  const watchedEps = allEpisodes.filter((e) => store.library.watched.includes(`episode:xt:${show.sourceId}:${show.id}/${e.id}`)).length
  const nextUnwatchedEpisode = allEpisodes.find((e) => !store.library.watched.includes(`episode:xt:${show.sourceId}:${show.id}/${e.id}`)) ?? allEpisodes[0]
  const isStarted = watchedEps > 0
  const playLabel = isStarted ? (nextUnwatchedEpisode && watchedEps < totalEps ? 'Resume' : 'Watch again') : 'Play Series'
  const playSub = nextUnwatchedEpisode && isStarted && watchedEps < totalEps ? `S${nextUnwatchedEpisode.seasonNumber}·E${nextUnwatchedEpisode.number}` : null
  const targetEpisode = nextUnwatchedEpisode || allEpisodes[0]

  const ref = `series:xt:${show.sourceId}:${show.id}`
  const inWatchlist = store.library.watchlist.includes(ref)
  const inFav = store.library.favourites.includes(ref)
  const [collecting, setCollecting] = useState(false)

  const relatedSeries = useMemo(() => {
    return store.xtreamCatalogue.series.filter((item) => item.id !== show.id && item.categoryId === show.categoryId).slice(0, 7)
  }, [store.xtreamCatalogue.series, show.id, show.categoryId])

  const sourceNames = useMemo(() => {
    const map: Record<string, string> = {}
    for (const s of store.xtreamSources) {
      map[s.id] = s.name
    }
    return map
  }, [store.xtreamSources])

  const variants = useMemo(() => {
    return findAlternateVodVariants(show.name, show.year, store.xtreamCatalogue.series, sourceNames)
  }, [show.name, show.year, store.xtreamCatalogue.series, sourceNames])

  return (
    <article className="detail">
      <header className="detail-hero">
        <XtreamArt
          artworkKey={activeSeason?.episodes[0]?.artworkKey || show.artworkKey}
          alt={show.name}
          fallbackTitle={show.name}
          fallbackYear={show.year}
          eager
          className="detail-backdrop"
        />
        <PageHeader overlay />
        <div className="detail-hero-content">
          <Link to="/series" className="text-link detail-back">
            <Icon name="back" size={16} />TV Shows
          </Link>
          <p className="kicker">
            <Icon name="series" size={16} />TV Show · {source?.name ?? 'Provider'}
          </p>
          <h1 className="title-xl">{show.name}</h1>
          <div className="meta">
            {show.year !== null && <span>{show.year}</span>}
            {seasons.length > 0 && <span>{seasons.length} season{seasons.length > 1 ? 's' : ''}</span>}
            {totalEps > 0 && <span>{totalEps} episodes</span>}
            <span>Provider catalogue</span>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => setTrailerOpen(true)}
              title="Watch series preview"
            >
              <Icon name="play" size={14} />
              <span>Trailer</span>
            </button>
          </div>
          {(details?.plot || show.plot) && (
            <p className="detail-synopsis">{details?.plot || show.plot}</p>
          )}
          {watchedEps > 0 && totalEps > 0 && (
            <div className="detail-progress">
              <ProgressBar value={watchedEps / totalEps} label="Series progress" />
              <span className="faint tnum">{watchedEps} of {totalEps} episodes watched</span>
            </div>
          )}
          <div className="title-actions">
            <div className="title-actions-primary">
              {targetEpisode && (
                <Link
                  to={`/watch/${encodeURIComponent(`episode:xt:${show.sourceId}:${show.id}/${targetEpisode.id}`)}`}
                  className="btn btn-primary"
                >
                  <Icon name="play" size={18} />
                  <span>{playLabel}</span>
                  {playSub && <span className="btn-sub">{playSub}</span>}
                </Link>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                aria-pressed={inWatchlist}
                onClick={() => {
                  store.toggleWatchlist(ref)
                  toast(inWatchlist ? `Removed ${show.name} from your watchlist` : `Added ${show.name} to your watchlist`, {
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
              <RatingControls itemRef={ref} title={show.name} />
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
                  toast(inFav ? `Removed ${show.name} from favourites` : `Added ${show.name} to favourites`)
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
              <CollectionDialog open={collecting} onClose={() => setCollecting(false)} itemRef={ref} itemTitle={show.name} />
            </div>
          </div>
          {variants.length > 1 && (
            <div className="detail-variants" style={{ marginTop: 20 }}>
              <p style={{ fontSize: '0.85rem', color: 'rgb(var(--fg-muted-rgb))', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="hardDrive" size={14} />
                <span>Available across {variants.length} server sources:</span>
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {variants.map((v) => {
                  const targetStreamId = v.providerChannelId || v.id.split(':')[1] || ''
                  const isCurrent = v.sourceId === show.sourceId && targetStreamId === String(show.id)
                  return isCurrent ? (
                    <span
                      key={v.id}
                      className="badge badge-primary"
                      style={{ padding: '6px 12px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <span>{v.name}</span>
                      <span style={{ opacity: 0.75 }}>(Active)</span>
                    </span>
                  ) : (
                    <Link
                      key={v.id}
                      to={`/series/${encodeURIComponent(`xt:${v.sourceId}:${targetStreamId}`)}`}
                      className="btn btn-secondary btn-small"
                      style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                    >
                      <Icon name="play" size={12} />
                      <span>Switch to {v.name}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </header>

      <section className="episodes" aria-label="Episodes">
        {error && (
          <StateBlock
            icon="warning"
            title="Could not load episodes"
            action={
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => { setError(''); setRetry((value) => value + 1) }}
              >
                Try again
              </button>
            }
          >
            {error}
          </StateBlock>
        )}

        {!details && !error && (
          <p className="faint" role="status">Loading seasons and episodes...</p>
        )}

        {seasons.length > 0 && (
          <div className="episodes-head">
            <div className="tabs" role="tablist" aria-label="Seasons" onKeyDown={onTabKey}>
              {seasons.map((season, i) => (
                <button
                  key={season.number}
                  ref={(el) => { tabs.current[i] = el }}
                  type="button"
                  role="tab"
                  id={`xt-season-tab-${season.number}`}
                  aria-selected={seasonNo === season.number}
                  aria-controls="xt-season-panel"
                  tabIndex={seasonNo === season.number ? 0 : -1}
                  className="tab"
                  onClick={() => pickSeason(season.number)}
                >
                  Season {season.number}
                </button>
              ))}
            </div>

            {seasonRefs.length > 0 && (
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => {
                  const before = seasonRefs.filter((r) => store.library.watched.includes(r))
                  store.setWatched(seasonRefs, !seasonWatched)
                  toast(seasonWatched ? `Season ${seasonNo} marked as not watched` : `Season ${seasonNo} marked as watched`, {
                    label: 'Undo',
                    run: () => {
                      store.setWatched(seasonRefs, false)
                      store.setWatched(before, true)
                    },
                  })
                }}
              >
                <Icon name={seasonWatched ? 'close' : 'check'} size={16} />
                {seasonWatched ? 'Mark season unwatched' : 'Mark season watched'}
              </button>
            )}
          </div>
        )}

        {episodes.length > 0 && (
          <ol id="xt-season-panel" role="tabpanel" aria-labelledby={`xt-season-tab-${seasonNo}`} className="episode-list">
            {episodes.map((episode) => {
              const epRef = `episode:xt:${show.sourceId}:${show.id}/${episode.id}`
              const isWatched = store.library.watched.includes(epRef)
              const prog = progressOf(store.library, epRef)
              const runtimeMin = episode.runtimeSeconds != null ? Math.round(episode.runtimeSeconds / 60) : null
              return (
                <li key={episode.id} className="episode-item">
                  <EpisodeCard
                    to={`/watch/${encodeURIComponent(epRef)}`}
                    seriesId={`xt:${show.sourceId}:${show.id}`}
                    seriesTitle={show.name}
                    episodeId={String(episode.id)}
                    episodeTitle={episode.title}
                    seasonNumber={seasonNo}
                    episodeNumber={episode.number}
                    artworkKey={episode.artworkKey || show.artworkKey || null}
                    runtimeMin={runtimeMin}
                    synopsis={episode.plot || undefined}
                    progress={prog}
                    watched={isWatched}
                    itemRef={epRef}
                    onToggleWatched={() => store.setWatched([epRef], !isWatched)}
                    onOpenDetails={() => setSelectedEpisodeId(String(episode.id))}
                  />
                </li>
              )
            })}
          </ol>
        )}

        {details && seasons.length === 0 && (
          <StateBlock icon="series" title="No episodes listed">
            The provider returned no season or episode entries for this series.
          </StateBlock>
        )}
      </section>

      {relatedSeries.length > 0 && (
        <div className="detail-more">
          <Section icon="series" title="More In This Category" grid="grid-posters">
            {relatedSeries.map((item) => (
              <PosterCard
                key={item.id}
                to={`/series/xt:${item.sourceId}:${item.id}`}
                title={item.name}
                art=""
                artworkKey={item.artworkKey || undefined}
                line={item.year != null ? String(item.year) : undefined}
              />
            ))}
          </Section>
        </div>
      )}

      <EpisodeDetailModal
        open={Boolean(selectedEpisodeId)}
        onClose={() => setSelectedEpisodeId(null)}
        seriesId={`xt:${show.sourceId}:${show.id}`}
        seriesTitle={show.name}
        seasonNumber={seasonNo}
        totalSeasons={seasons.length}
        episodesInSeason={episodes.map((e) => ({
          id: String(e.id),
          number: e.number,
          title: e.title,
          synopsis: e.plot || undefined,
          runtime: e.runtimeSeconds != null ? Math.round(e.runtimeSeconds / 60) : undefined,
          artworkKey: e.artworkKey || show.artworkKey || null,
        }))}
        currentEpisodeId={selectedEpisodeId || String(episodes[0]?.id || '')}
        onSelectEpisode={(id) => setSelectedEpisodeId(id)}
        onSelectSeason={(n) => pickSeason(n)}
      />

      {trailerOpen && (
        <TrailerPlayerModal
          open={trailerOpen}
          onClose={() => setTrailerOpen(false)}
          title={show.name}
          playFullUrl={allEpisodes[0] ? `/watch/${encodeURIComponent(`episode:xt:${show.sourceId}:${show.id}/${allEpisodes[0].id}`)}` : undefined}
        />
      )}
    </article>
  )
}

function PublicDiscoverySeriesDetail({ resource, initialEpisodeId }: { resource: MediaResource; initialEpisodeId?: string | null }) {
  const store = useStore()
  const toast = useToast()
  const inLibrary = store.mediaLibrary.isInPersonalLibrary(resource.id)
  const isFav = store.mediaLibrary.isResourceFavourite(resource.id)
  const { provenance, capability } = classifyMediaResource(resource, inLibrary)
  const statusMeta = VERIFICATION_STATUS_META[resource.verificationStatus] ?? VERIFICATION_STATUS_META.discovered

  const matchingOpenSeries = useMemo(() => {
    return OPEN_SERIES.find(
      (s) =>
        s.id === resource.id ||
        resource.id.includes(s.id) ||
        s.id.includes(resource.id.replace(/^res-tv-/, '')) ||
        s.title.toLowerCase() === resource.name.toLowerCase(),
    )
  }, [resource.id, resource.name])
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(initialEpisodeId || null)
  const [trailerOpen, setTrailerOpen] = useState(false)
  const trailerUrl = resource.trailerUrl || matchingOpenSeries?.trailerUrl || null
  const openEpisodes = matchingOpenSeries?.seasons[0] ?? []

  const similarSeries = useMemo(() => {
    return store.mediaLibrary.allResources
      .filter((r) => r.id !== resource.id && (r.category === 'series' || r.subcategory.includes('tv') || r.subcategory.includes('series') || r.subcategory.includes('broadcasting')))
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
          fallbackIcon="series"
          eager
        />
        <PageHeader overlay />
        <div className="detail-hero-content">
          <Breadcrumbs crumbs={[{ label: 'Home', to: '/' }, { label: 'TV Shows', to: '/series' }, { label: resource.name }]} />
          <Link to="/series" className="text-link detail-back"><Icon name="back" size={16} />TV Shows</Link>
          <p className="kicker">
            <Icon name="archive" size={16} />
            Public Discovery Television · {resource.subcategory.replace(/-/g, ' ').toUpperCase()}
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
                title="Watch series trailer"
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
                <span>Explore Series Archive</span>
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
          <h2 className="title-m" style={{ marginBottom: 12 }}>Series & Archive Information</h2>
          <div className="detail-body-specs" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
            <div className="panel" style={{ padding: 14 }}>
              <span className="faint" style={{ fontSize: '0.75rem', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Broadcaster / Archive</span>
              <strong>{resource.provider}</strong>
            </div>
            <div className="panel" style={{ padding: 14 }}>
              <span className="faint" style={{ fontSize: '0.75rem', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Licence & Distribution</span>
              <strong>{resource.licence || 'Public Service Broadcaster / Heritage'}</strong>
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

      {openEpisodes.length > 0 && matchingOpenSeries && (
        <section className="episodes" aria-label="Episodes" style={{ padding: '0 24px 32px' }}>
          <h2 className="title-m" style={{ marginBottom: 16 }}>Available Episodes ({openEpisodes.length})</h2>
          <ol className="episode-list">
            {openEpisodes.map((e) => {
              const ref = episodeRef(matchingOpenSeries.id, e.id)
              const watched = store.library.watched.includes(ref)
              const prog = progressOf(store.library, ref)
              return (
                <li key={e.id} className="episode-item">
                  <EpisodeCard
                    to={`/watch/${encodeURIComponent(ref)}`}
                    seriesId={matchingOpenSeries.id}
                    seriesTitle={matchingOpenSeries.title}
                    episodeId={e.id}
                    episodeTitle={e.title}
                    seasonNumber={e.season}
                    episodeNumber={e.number}
                    stillUrl={e.still}
                    seriesBackdropUrl={matchingOpenSeries.backdropUrl || matchingOpenSeries.art}
                    runtimeMin={e.runtime}
                    synopsis={e.synopsis}
                    progress={prog}
                    watched={watched}
                    itemRef={ref}
                    onToggleWatched={() => store.setWatched([ref], !watched)}
                    onOpenDetails={() => setSelectedEpisodeId(e.id)}
                  />
                </li>
              )
            })}
          </ol>
        </section>
      )}

      {similarSeries.length > 0 && (
        <section className="detail-similar" style={{ padding: '0 24px 32px' }}>
          <Section icon="series" title="Related Television Archives & Open Series" sub={`${similarSeries.length} titles`}>
            {similarSeries.map((sim) => (
              <PosterCard
                key={sim.id}
                to={`/series/${encodeURIComponent(sim.id)}`}
                title={sim.name}
                art={sim.artworkUrl}
                line={[sim.provider, sim.country].filter(Boolean).join(' · ')}
              />
            ))}
          </Section>
        </section>
      )}

      {matchingOpenSeries && (
        <EpisodeDetailModal
          open={Boolean(selectedEpisodeId)}
          onClose={() => setSelectedEpisodeId(null)}
          seriesId={matchingOpenSeries.id}
          seriesTitle={matchingOpenSeries.title}
          seriesBackdropUrl={matchingOpenSeries.backdropUrl || matchingOpenSeries.art}
          seriesCertificate={matchingOpenSeries.certificate}
          seriesGenres={matchingOpenSeries.genres}
          seasonNumber={1}
          totalSeasons={matchingOpenSeries.seasons.length}
          episodesInSeason={openEpisodes.map((e) => ({
            id: e.id,
            number: e.number,
            title: e.title,
            synopsis: e.synopsis,
            runtime: e.runtime,
            still: e.still,
          }))}
          currentEpisodeId={selectedEpisodeId || openEpisodes[0]?.id || ''}
          onSelectEpisode={(id) => setSelectedEpisodeId(id)}
        />
      )}

      {trailerOpen && (
        <TrailerPlayerModal
          open={trailerOpen}
          onClose={() => setTrailerOpen(false)}
          title={resource.name}
          trailerUrl={trailerUrl}
          posterUrl={resource.artworkUrl}
          playFullUrl={openEpisodes[0] ? `/watch/${encodeURIComponent(episodeRef(matchingOpenSeries!.id, openEpisodes[0].id))}` : undefined}
        />
      )}
    </article>
  )
}
