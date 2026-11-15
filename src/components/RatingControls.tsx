import { useState } from 'react'
import { Icon } from './Icon'
import { DislikeModal } from './DislikeModal'
import { useToast } from './Toast'
import { useStore } from '../state/store'
import type { DislikeReason, RatingValue } from '../state/userPreferences'
import './RatingControls.css'

interface RatingControlsProps {
  itemRef: string
  title: string
  compact?: boolean
  showStars?: boolean
  className?: string
}

export function RatingControls({
  itemRef,
  title,
  compact = false,
  showStars = false,
  className = '',
}: RatingControlsProps) {
  const store = useStore()
  const toast = useToast()
  const [dislikeModalOpen, setDislikeModalOpen] = useState(false)

  const currentRating = store.userPreferences?.preferences.ratings[itemRef] ?? null
  const isHidden = store.userPreferences?.isItemHidden(itemRef) ?? false

  const handleRate = (value: RatingValue) => {
    if (currentRating === value) {
      store.userPreferences?.setRating(itemRef, null)
      toast(`Removed rating for ${title}`)
      return
    }

    if (value === 'dislike') {
      setDislikeModalOpen(true)
      return
    }

    store.userPreferences?.setRating(itemRef, value)
    const label = value === 'strong-like' ? 'Loved' : 'Liked'
    toast(`${label} "${title}"`, {
      label: 'Undo',
      run: () => store.userPreferences?.setRating(itemRef, null),
    })
  }

  const handleDislikeReason = (reason: DislikeReason) => {
    store.userPreferences?.setDislikeFeedback(itemRef, reason)
    toast(`Marked "${title}" as not for you`, {
      label: 'Undo',
      run: () => store.userPreferences?.setRating(itemRef, null),
    })
  }

  const handleToggleHide = () => {
    if (isHidden) {
      store.userPreferences?.unhideItem(itemRef)
      toast(`Unhid "${title}"`)
    } else {
      store.userPreferences?.hideItem(itemRef)
      toast(`Hidden "${title}" from discovery`, {
        label: 'Undo',
        run: () => store.userPreferences?.unhideItem(itemRef),
      })
    }
  }

  return (
    <div className={`ds-rating-controls ${compact ? 'is-compact' : ''} ${className}`}>
      {/* Thumbs Down */}
      <button
        type="button"
        className={`ds-rate-btn ds-rate-dislike ${currentRating === 'dislike' ? 'is-active' : ''}`}
        aria-label={currentRating === 'dislike' ? 'Remove dislike' : 'Dislike this'}
        title="Dislike this"
        onClick={() => handleRate('dislike')}
      >
        <Icon name="thumbsDown" size={compact ? 16 : 18} />
      </button>

      {/* Thumbs Up (Like) */}
      <button
        type="button"
        className={`ds-rate-btn ds-rate-like ${currentRating === 'like' ? 'is-active' : ''}`}
        aria-label={currentRating === 'like' ? 'Remove like' : 'Like this'}
        title="Like this"
        onClick={() => handleRate('like')}
      >
        <Icon name="thumbsUp" size={compact ? 16 : 18} />
      </button>

      {/* Double Thumbs Up (Love / Strong Like) */}
      <button
        type="button"
        className={`ds-rate-btn ds-rate-strong ${currentRating === 'strong-like' ? 'is-active' : ''}`}
        aria-label={currentRating === 'strong-like' ? 'Remove love' : 'Love this'}
        title="Love this (Strong recommendation)"
        onClick={() => handleRate('strong-like')}
      >
        <span className="ds-rate-double-icon" aria-hidden="true">
          <Icon name="sparkles" size={compact ? 16 : 18} />
        </span>
      </button>

      {/* Hide Toggle */}
      <button
        type="button"
        className={`ds-rate-btn ds-rate-hide ${isHidden ? 'is-hidden-active' : ''}`}
        aria-label={isHidden ? 'Unhide this' : 'Hide from discovery'}
        title={isHidden ? 'Unhide this' : 'Hide from discovery'}
        onClick={handleToggleHide}
      >
        <Icon name={isHidden ? 'eye' : 'eyeOff'} size={compact ? 16 : 18} />
      </button>

      {/* Optional 1-5 Stars */}
      {showStars && (
        <div className="ds-star-rating" role="radiogroup" aria-label="1 to 5 star rating">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              className={`ds-star-btn ${typeof currentRating === 'number' && currentRating >= star ? 'is-active' : ''}`}
              aria-label={`${star} star${star > 1 ? 's' : ''}`}
              onClick={() => handleRate(star as RatingValue)}
            >
              <Icon name="star" size={16} />
            </button>
          ))}
        </div>
      )}

      <DislikeModal
        open={dislikeModalOpen}
        title={title}
        onClose={() => setDislikeModalOpen(false)}
        onSelectReason={handleDislikeReason}
      />
    </div>
  )
}
