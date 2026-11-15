import { useEffect } from 'react'
import { Icon } from './Icon'
import './WhatsNewModal.css'

export const CURRENT_RELEASE_VERSION = '0.5.0'
const STORAGE_KEY = 'kinora.whats_new_seen.v1'

export interface ReleaseHighlight {
  category: 'Feature' | 'Improvement' | 'Fix' | 'Security'
  title: string
  description: string
}

export const V050_HIGHLIGHTS: ReleaseHighlight[] = [
  {
    category: 'Feature',
    title: 'Proprietary Source-Available Licence',
    description: 'Kinora is published under an explicit All Rights Reserved source-available licence prohibiting unauthorised redistribution, commercial use, and AI/ML model ingestion.',
  },
  {
    category: 'Feature',
    title: 'Original Creator Attribution',
    description: 'Official attribution to creator millsydotdev embedded in Settings > About with direct links to the official GitHub profile (https://github.com/millsydotdev).',
  },
  {
    category: 'Feature',
    title: 'Integrated Tauri 2 Updater',
    description: 'Automatic update checks over guarded HTTPS connections against the canonical KinoraTV repository, complete with download verification and release notes.',
  },
  {
    category: 'Improvement',
    title: 'Cinematic Card Visual Parity',
    description: 'Restored authentic high-resolution mock artworks from the master reference in the Home Recommended for You rail with 220x185 tile framing.',
  },
  {
    category: 'Fix',
    title: 'Multi-Platform Compatibility',
    description: 'Standardised atomic storage and directory synchronisation across Windows, macOS, and Linux desktop environments.',
  },
  {
    category: 'Security',
    title: 'SSRF & Secret Protection',
    description: 'Rigorous destination verification for all network calls, loopback restrictions in production, and zero exposed credentials.',
  },
]

export function hasSeenWhatsNew(version: string = CURRENT_RELEASE_VERSION): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.includes(version)
  } catch {
    return false
  }
}

export function markWhatsNewSeen(version: string = CURRENT_RELEASE_VERSION): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const set = new Set<string>(raw ? JSON.parse(raw) : [])
    set.add(version)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)))
  } catch {
    // Ignore storage errors
  }
}

interface WhatsNewModalProps {
  open: boolean
  onClose: () => void
  version?: string
}

export function WhatsNewModal({ open, onClose, version = CURRENT_RELEASE_VERSION }: WhatsNewModalProps) {
  useEffect(() => {
    if (open) {
      markWhatsNewSeen(version)
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose()
      }
      window.addEventListener('keydown', onKeyDown)
      return () => window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose, version])

  if (!open) return null

  return (
    <div className="whats-new-backdrop" role="dialog" aria-modal="true" aria-labelledby="whats-new-title">
      <div className="whats-new-modal">
        <header className="whats-new-header">
          <div className="whats-new-badge">
            <Icon name="sparkles" size={14} />
            <span>What's New in Kinora</span>
          </div>
          <button
            type="button"
            className="whats-new-close-btn"
            onClick={onClose}
            aria-label="Close release notes"
          >
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="whats-new-title-block">
          <h2 id="whats-new-title" className="whats-new-title">
            Kinora v{version}
          </h2>
          <p className="whats-new-subtitle">
            Release Candidate: Public Repository & Multi-Platform Update
          </p>
        </div>

        <div className="whats-new-content">
          <ul className="whats-new-list">
            {V050_HIGHLIGHTS.map((item, idx) => (
              <li key={idx} className="whats-new-item">
                <span className={`whats-new-tag tag-${item.category.toLowerCase()}`}>
                  {item.category}
                </span>
                <div className="whats-new-item-body">
                  <h4 className="whats-new-item-title">{item.title}</h4>
                  <p className="whats-new-item-desc">{item.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <footer className="whats-new-footer">
          <div className="whats-new-creator-credit">
            Created by{' '}
            <a
              href="https://github.com/millsydotdev"
              target="_blank"
              rel="noopener noreferrer"
              className="whats-new-creator-link"
            >
              millsydotdev
            </a>
          </div>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Got It
          </button>
        </footer>
      </div>
    </div>
  )
}
