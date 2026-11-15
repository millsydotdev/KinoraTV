import './AgeRatingBadge.css'

export type RatingSystem = 'bbfc' | 'mpa' | 'tv' | 'auto'

interface AgeRatingBadgeProps {
  rating: string
  system?: RatingSystem
  className?: string
  title?: string
}

interface ResolvedRating {
  type: 'bbfc' | 'mpa' | 'tv'
  assetUrl?: string
  alt: string
  description: string
  badgeText?: string
}

function resolveRating(rating: string, system: RatingSystem): ResolvedRating | null {
  const norm = rating.trim().toUpperCase()
  if (!norm) return null

  // UK BBFC official classifications (authoritative vector assets from 2019 guidelines)
  if (system === 'bbfc' || system === 'auto') {
    if (norm === 'U') {
      return { type: 'bbfc', assetUrl: '/assets/ratings/bbfc/u.svg', alt: 'BBFC U', description: 'BBFC Universal: Suitable for all' }
    }
    if (norm === 'PG') {
      return { type: 'bbfc', assetUrl: '/assets/ratings/bbfc/pg.svg', alt: 'BBFC PG', description: 'BBFC PG: Parental Guidance' }
    }
    if (norm === '12A') {
      return { type: 'bbfc', assetUrl: '/assets/ratings/bbfc/12a.svg', alt: 'BBFC 12A', description: 'BBFC 12A: Suitable for 12 years and over' }
    }
    if (norm === '12') {
      return { type: 'bbfc', assetUrl: '/assets/ratings/bbfc/12.svg', alt: 'BBFC 12', description: 'BBFC 12: Suitable for 12 years and over' }
    }
    if (norm === '15') {
      return { type: 'bbfc', assetUrl: '/assets/ratings/bbfc/15.svg', alt: 'BBFC 15', description: 'BBFC 15: Suitable only for 15 years and over' }
    }
    if (norm === '18') {
      return { type: 'bbfc', assetUrl: '/assets/ratings/bbfc/18.svg', alt: 'BBFC 18', description: 'BBFC 18: Suitable only for adults' }
    }
  }

  // US MPA official classifications
  if (system === 'mpa' || (system === 'auto' && !['U', 'PG', '12', '12A', '15', '18'].includes(norm))) {
    if (norm === 'G') {
      return { type: 'mpa', assetUrl: '/assets/ratings/mpa/g.svg', alt: 'MPA G', description: 'MPA G: General Audiences' }
    }
    if (norm === 'PG-13') {
      return { type: 'mpa', assetUrl: '/assets/ratings/mpa/pg-13.svg', alt: 'MPA PG-13', description: 'MPA PG-13: Parents Strongly Cautioned' }
    }
    if (norm === 'R') {
      return { type: 'mpa', assetUrl: '/assets/ratings/mpa/r.svg', alt: 'MPA R', description: 'MPA R: Restricted' }
    }
    if (norm === 'NC-17') {
      return { type: 'mpa', assetUrl: '/assets/ratings/mpa/nc-17.svg', alt: 'MPA NC-17', description: 'MPA NC-17: Adults Only' }
    }
  }

  // TV Parental Guidelines
  if (norm.startsWith('TV-')) {
    return { type: 'tv', alt: `TV Parental Guidelines: ${norm}`, description: `TV Parental Guidelines: ${norm}`, badgeText: norm }
  }

  // If no reliable classification exists, omit the mark per requirements
  return null
}

export function AgeRatingBadge({ rating, system = 'auto', className = '', title }: AgeRatingBadgeProps) {
  if (!rating) return null
  const resolved = resolveRating(rating, system)
  if (!resolved) return null

  if (resolved.assetUrl) {
    return (
      <img
        src={resolved.assetUrl}
        alt={resolved.alt}
        title={title || resolved.description}
        className={`age-rating-mark age-rating-${resolved.type} ${className}`.trim()}
        loading="lazy"
        decoding="async"
      />
    )
  }

  return (
    <span
      className={`age-rating-badge age-rating-tv ${className}`.trim()}
      title={title || resolved.description}
      role="status"
      aria-label={resolved.description}
    >
      {resolved.badgeText}
    </span>
  )
}
