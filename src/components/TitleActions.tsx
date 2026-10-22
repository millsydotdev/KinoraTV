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

/** Primary watch action plus library toggles, shared by the hero and both detail pages. */
export function TitleActions({ title, compact = false, infoHref }: { title: Title; compact?: boolean; infoHref?: string }) {
  const store = useStore()
  const toast = useToast()
  const [collecting, setCollecting] = useState(false)
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
      <Link to={`/watch/${encodeURIComponent(playRef)}`} className="btn btn-primary">
        <Icon name="play" size={18} />
        {playLabel}
        {playSub && <span className="btn-sub">{playSub}</span>}
      </Link>
      {infoHref && (
        <Link to={infoHref} className="btn btn-secondary">
          <Icon name="info" size={18} />
          More information
        </Link>
      )}
      <button
        type="button"
        className={compact ? 'icon-btn ringed' : 'btn btn-ghost'}
        aria-pressed={inList}
        aria-label={compact ? (inList ? 'Remove from watchlist' : 'Add to watchlist') : undefined}
        onClick={() => {
          store.toggleWatchlist(ref)
          toast(inList ? `Removed ${title.title} from your watchlist` : `Added ${title.title} to your watchlist`, { label: 'Undo', run: () => store.toggleWatchlist(ref) })
        }}
      >
        <Icon name={inList ? 'check' : 'plus'} size={18} />
        {!compact && (inList ? 'In watchlist' : 'Watchlist')}
      </button>
      {!compact && (
        <>
          <button
            type="button"
            className="icon-btn ringed fav-toggle"
            aria-pressed={fav}
            aria-label={fav ? 'Remove from favourites' : 'Add to favourites'}
            data-tip={fav ? 'Favourite' : 'Add to favourites'}
            onClick={() => {
              store.toggleFavourite(ref)
              toast(fav ? 'Removed from favourites' : 'Added to favourites')
            }}
          >
            <Icon name="heart" size={20} />
          </button>
          <button type="button" className="icon-btn ringed" aria-label="Add to a collection" onClick={() => setCollecting(true)}>
            <Icon name="folder" size={20} />
          </button>
          <CollectionDialog open={collecting} onClose={() => setCollecting(false)} itemRef={ref} itemTitle={title.title} />
        </>
      )}
    </div>
  )
}
