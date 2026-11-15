import type { ReactNode } from 'react'
import './TechnicalBadges.css'

export type ResolutionFormat = '8K' | '4K' | 'UHD' | 'FHD' | '1080p' | 'HD' | '720p' | 'SD'
export type HdrFormat = 'HDR' | 'HDR10' | 'HDR10+' | 'Dolby Vision' | 'HLG'
export type AudioFormat = 'Dolby Atmos' | 'Dolby Audio' | '5.1' | '7.1' | 'DTS:X' | 'DTS-HD' | 'DTS' | 'Lossless' | 'Stereo' | 'Mono'
export type CodecFormat = 'AV1' | 'HEVC' | 'AVC' | 'VP9'
export type IndicatorFormat = '3D' | 'CC' | 'Subtitles' | 'AD' | 'Live' | 'Catch-up' | 'Rec'

export type TechnicalFormat = ResolutionFormat | HdrFormat | AudioFormat | CodecFormat | IndicatorFormat

interface TechnicalBadgeProps {
  format: TechnicalFormat
  compact?: boolean
  className?: string
}

function getBadgeClass(format: TechnicalFormat): string {
  switch (format) {
    case '4K':
    case '8K':
    case 'UHD':
      return 'tech-badge-res-4k'
    case 'HDR':
    case 'HDR10':
    case 'HDR10+':
    case 'HLG':
      return 'tech-badge-hdr'
    case 'Dolby Vision':
      return 'tech-badge-dolby-vision'
    case 'Dolby Atmos':
    case 'Dolby Audio':
      return 'tech-badge-audio-atmos'
    case 'DTS':
    case 'DTS-HD':
    case 'DTS:X':
      return 'tech-badge-audio-dts'
    case '3D':
      return 'tech-badge-3d'
    case 'Live':
      return 'tech-badge-live'
    case 'Rec':
      return 'tech-badge-rec'
    default:
      return ''
  }
}

export function TechnicalBadge({ format, compact = false, className = '' }: TechnicalBadgeProps) {
  const specificClass = getBadgeClass(format)
  const compactClass = compact ? 'tech-badge-compact' : ''
  return (
    <span
      className={`tech-badge ${specificClass} ${compactClass} ${className}`.trim()}
      role="status"
      aria-label={`Technical format: ${format}`}
    >
      {format}
    </span>
  )
}

export function TechnicalBadgeGroup({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={`tech-badge-group ${className}`.trim()}>{children}</div>
}
