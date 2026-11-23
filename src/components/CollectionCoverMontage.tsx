import type { CSSProperties } from 'react'
import { useStore } from '../state/store'
import { resolve, type Resolved } from '../data/refs'
import { Art, ChannelMark } from './ui'
import { XtreamArt } from './Tiles'
import { Icon } from './Icon'
import './CollectionCoverMontage.css'

export interface CollectionCoverMontageProps {
  items?: string[]
  resolvedItems?: Resolved[]
  className?: string
  aspectRatio?: string
  style?: CSSProperties
}

function MontageTile({ item }: { item: Resolved }) {
  if (item.kind === 'channel' && item.item) {
    return (
      <div className="montage-tile montage-tile-channel">
        <ChannelMark channel={item.item} size={36} />
      </div>
    )
  }
  if ('artworkKey' in item && (item as { artworkKey?: string | null }).artworkKey) {
    return (
      <div className="montage-tile">
        <XtreamArt
          artworkKey={(item as { artworkKey: string }).artworkKey}
          alt={item.title}
          className="montage-tile-img"
        />
      </div>
    )
  }
  if (item.art) {
    return (
      <div className="montage-tile">
        <Art
          src={item.art}
          focus={item.focus}
          alt={item.title}
          className="montage-tile-img"
          fallbackIcon={item.kind === 'series' ? 'series' : 'film'}
        />
      </div>
    )
  }
  return (
    <div className="montage-tile montage-tile-fallback">
      <Icon name={item.kind === 'series' ? 'series' : 'film'} size={20} />
    </div>
  )
}

export function CollectionCoverMontage({
  items = [],
  resolvedItems,
  className = '',
  aspectRatio,
  style,
}: CollectionCoverMontageProps) {
  let resolved: Resolved[] = []

  if (resolvedItems) {
    resolved = resolvedItems.slice(0, 4)
  } else if (items.length > 0) {
    try {
      const store = useStore()
      const findMovie = (sId: string, id: string) =>
        store.xtreamCatalogue?.movies?.find((m) => m.sourceId === sId && m.id === id)
      const findSeries = (sId: string, id: string) =>
        store.xtreamCatalogue?.series?.find((s) => s.sourceId === sId && s.id === id)
      const now = Date.now()
      resolved = items
        .slice(0, 4)
        .map((r) =>
          resolve(
            r,
            now,
            store.findChannel,
            store.programmeAt,
            store.demoTitles,
            findMovie,
            findSeries,
          ),
        )
        .filter((r): r is Resolved => !!r)
    } catch {
      // In case useStore is rendered outside StoreProvider context
      const now = Date.now()
      resolved = items
        .slice(0, 4)
        .map((r) => resolve(r, now))
        .filter((r): r is Resolved => !!r)
    }
  }

  const count = resolved.length
  const dynamicStyle = aspectRatio ? { aspectRatio, ...style } : style

  if (count === 0) {
    return (
      <div
        className={`collection-montage is-empty ${className}`}
        style={dynamicStyle}
        aria-hidden="true"
      >
        <span className="collection-empty">
          <Icon name="folder" size={32} />
        </span>
      </div>
    )
  }

  if (count === 1) {
    return (
      <div
        className={`collection-montage count-1 ${className}`}
        style={dynamicStyle}
        aria-hidden="true"
      >
        <MontageTile item={resolved[0]!} />
      </div>
    )
  }

  if (count === 2) {
    return (
      <div
        className={`collection-montage count-2 ${className}`}
        style={dynamicStyle}
        aria-hidden="true"
      >
        <MontageTile item={resolved[0]!} />
        <MontageTile item={resolved[1]!} />
      </div>
    )
  }

  if (count === 3) {
    return (
      <div
        className={`collection-montage count-3 ${className}`}
        style={dynamicStyle}
        aria-hidden="true"
      >
        <MontageTile item={resolved[0]!} />
        <div className="montage-col-stack">
          <MontageTile item={resolved[1]!} />
          <MontageTile item={resolved[2]!} />
        </div>
      </div>
    )
  }

  return (
    <div
      className={`collection-montage count-4 ${className}`}
      style={dynamicStyle}
      aria-hidden="true"
    >
      <MontageTile item={resolved[0]!} />
      <MontageTile item={resolved[1]!} />
      <MontageTile item={resolved[2]!} />
      <MontageTile item={resolved[3]!} />
    </div>
  )
}
