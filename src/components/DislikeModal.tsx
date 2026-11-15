import { Dialog } from './Dialog'
import { Icon } from './Icon'
import type { DislikeReason } from '../state/userPreferences'
import './DislikeModal.css'

interface DislikeModalProps {
  open: boolean
  title: string
  onClose: () => void
  onSelectReason: (reason: DislikeReason) => void
}

const REASONS: { id: DislikeReason; label: string; icon: string }[] = [
  { id: 'not-my-type', label: 'Not my type of content', icon: 'eyeOff' },
  { id: 'not-interested-in-genre', label: 'Not interested in this genre', icon: 'film' },
  { id: 'already-watched', label: 'Already watched elsewhere', icon: 'check' },
  { id: 'poor-quality', label: 'Poor stream or audio quality', icon: 'warning' },
  { id: 'dont-recommend-similar', label: 'Do not recommend similar titles', icon: 'close' },
]

export function DislikeModal({ open, title, onClose, onSelectReason }: DislikeModalProps) {
  return (
    <Dialog open={open} onClose={onClose} title={`Tell us why you disliked "${title}"`}>
      <div className="ds-dislike-dialog">
        <p className="ds-dislike-hint">
          Your feedback tunes your local recommendations. Nothing is sent to third parties.
        </p>

        <div className="ds-dislike-list">
          {REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              className="ds-dislike-btn"
              onClick={() => {
                onSelectReason(r.id)
                onClose()
              }}
            >
              <span className="ds-dislike-btn-label">{r.label}</span>
              <Icon name="right" size={16} className="ds-dislike-chevron" />
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  )
}
