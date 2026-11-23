import type { ChapterMarker } from '../lib/chapters'
import './ChapterTicks.css'

export interface ChapterTicksProps {
  markers: ChapterMarker[]
  activePercent?: number
}

export function ChapterTicks({ markers, activePercent = 0 }: ChapterTicksProps) {
  // If no markers or only one boundary marker, render nothing
  if (!markers || markers.length === 0) {
    return null
  }

  return (
    <div className="chapter-ticks-container" aria-hidden="true">
      {markers.map((marker, idx) => {
        const isPassed = activePercent >= marker.percent
        return (
          <div
            key={idx}
            className={`chapter-tick-mark${isPassed ? ' is-passed' : ''}`}
            style={{ left: `${marker.percent}%` }}
            title={marker.title}
          />
        )
      })}
    </div>
  )
}
