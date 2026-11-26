import { useState } from 'react'
import { Link } from 'react-router-dom'
import { episodeCode, episodeRef, movieRef, runtimeLabel, seriesRef } from '../data/refs'
import type { Title } from '../data/types'
import { seriesNextUp } from '../lib/library'
import { minutesLeft } from '../lib/time'
import { useStore } from '../state/store'
import { CollectionDialog } from './CollectionDialog'
import { Icon } from './Icon'
import { useToast } from './Toast'
import { RatingControls } from './RatingControls'
import { ShareModal } from './ShareModal'

/** Primary watch action plus library toggles, shared by the hero and both detail pages. */
export function TitleActions({ title, compact = false, infoHref }: { title: Title; compact?: boolean; infoHref?: string }) {
  const store = useStore()
  const toast = useToast()
  const [collecting, setCollecting] = useState(false)
  const [sharing, setSharing] = useState(false)
  const ref = title.kind === 'movie' ? movieRef(title.id) : seriesRef(title.id)

  let playRef = ref
  let playLabel = 'Watch now'
  let playSub: string | null = title.kind === 'movie' ? runtimeLabel(title.runtime) : null
  if (title.kind === 'movie') {
    const p = store.library.progress[ref]
    if (p) { playLabel = 'Resume'; playSub = `${minutesLeft(p.pos, p.dur)} min left` }
  } else {
    const up = seriesNextUp(store.library, title)
    playRef = episodeRef(title.id, up.episode.id)
    playLabel = { resume: 'Resume', next: 'Next episode', start: 'Start watching', rewatch: 'Watch again' }[up.state]
    playSub = episodeCode(up.episode)
  }

  const inList = store.library.watchlist.includes(ref)
  const fav = store.library.favourites.includes(ref)

  return (
    <div className="title-actions">
      <div className="title-actions-primary">
        <Link to={`/watch/${encodeURIComponent(playRef)}`} className="btn btn-primary">
          <Icon name="play" size={18} />
          <span>{playLabel}</span>
          {playSub && <span className="btn-sub">{playSub}</span>}
        </Link>
        {infoHref && (
          <Link to={infoHref} className="btn btn-secondary">
            <Icon name="info" size={18} />
            <span>More information</span>
          </Link>
        )}
        <button
          type="button"
          className={compact ? 'icon-btn ringed' : 'btn btn-secondary'}
          aria-pressed={inList}
          aria-label={compact ? (inList ? 'Remove from watchlist' : 'Add to watchlist') : undefined}
          onClick={() => {
            store.toggleWatchlist(ref)
            toast(inList ? `Removed ${title.title} from your watchlist` : `Added ${title.title} to your watchlist`, { label: 'Undo', run: () => store.toggleWatchlist(ref) })
          }}
        >
          <Icon name={inList ? 'check' : 'plus'} size={18} />
          {!compact && <span>{inList ? 'In watchlist' : 'Watchlist'}</span>}
        </button>
      </div>

      <div className="title-actions-feedback">
        <RatingControls itemRef={ref} title={title.title} compact={compact} />
        <button
          type="button"
          className="icon-btn ringed share-btn"
          aria-label={`Share ${title.title}`}
          title="Share title"
          onClick={() => setSharing(true)}
        >
          <Icon name="share" size={16} />
        </button>
      </div>

      <ShareModal
        open={sharing}
        onClose={() => setSharing(false)}
        item={{
          title: title.title,
          kind: title.kind,
          year: title.kind === 'movie' ? title.year : (title.years || undefined),
          certificate: title.certificate,
          genres: title.genres,
          art: title.art,
          imdbId: (title as { imdbId?: string }).imdbId,
          tmdbId: (title as { tmdbId?: number | string }).tmdbId,
          synopsis: title.synopsis,
          deepLinkPath: `/${title.kind === 'movie' ? 'movies' : 'series'}/${title.id}`,
        }}
      />

      {!compact && (
        <div className="title-actions-library">
          <button
            type="button"
            className="icon-btn ringed fav-toggle"
            aria-pressed={fav}
            aria-label={fav ? 'Remove from favourites' : 'Add to favourites'}
            title={fav ? 'Favourite' : 'Add to favourites'}
            onClick={() => {
              store.toggleFavourite(ref)
              toast(fav ? `Removed ${title.title} from favourites` : `Added ${title.title} to favourites`)
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
          <CollectionDialog open={collecting} onClose={() => setCollecting(false)} itemRef={ref} itemTitle={title.title} />
        </div>
      )}
    </div>
  )
}
