import { useEffect, useMemo, useState } from 'react'
import { Icon } from './Icon'
import { APP_VERSION } from '../lib/native'
import {
  categoryBadgeTone,
  getAllReleases,
  getReleaseByVersion,
  getReleaseCategories,
  getReleaseEntries,
  type ChangelogEntry,
} from '../lib/changelog'
import './WhatsNewModal.css'

export const CURRENT_RELEASE_VERSION = APP_VERSION
const STORAGE_KEY = 'kinora.whats_new_seen.v1'

export interface ReleaseHighlight {
  category: 'Feature' | 'Improvement' | 'Fix' | 'Security'
  title: string
  description: string
}

function mapEntriesToLegacyHighlights(version: string): ReleaseHighlight[] {
  const rel = getReleaseByVersion(version)
  if (!rel) return []
  return getReleaseEntries(rel).map((entry) => {
    const tone = categoryBadgeTone(entry.category)
    const category: ReleaseHighlight['category'] =
      tone === 'security' ? 'Security' : tone === 'fix' ? 'Fix' : tone === 'feature' ? 'Feature' : 'Improvement'
    return {
      category,
      title: entry.title,
      description: entry.description,
    }
  })
}

export const V060_HIGHLIGHTS: ReleaseHighlight[] = mapEntriesToLegacyHighlights('0.6.0')
export const V050_HIGHLIGHTS: ReleaseHighlight[] = mapEntriesToLegacyHighlights('0.5.0')

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
  /** Optional fresh online release note banner fetched from the trusted updater manifest. */
  onlineReleaseNotice?: { version: string; releaseDate?: string | null; notes?: string | null } | null
}

export function WhatsNewModal({
  open,
  onClose,
  version = CURRENT_RELEASE_VERSION,
  onlineReleaseNotice = null,
}: WhatsNewModalProps) {
  const releases = useMemo(() => getAllReleases(), [])
  const initialRelease = useMemo(() => getReleaseByVersion(version) ?? releases[0]!, [version, releases])

  const [selectedVersion, setSelectedVersion] = useState<string>(initialRelease.version)
  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [showTechnical, setShowTechnical] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (open) {
      setSelectedVersion(initialRelease.version)
      setSelectedCategory('All')
      markWhatsNewSeen(version)
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose()
      }
      window.addEventListener('keydown', onKeyDown)
      return () => window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose, version, initialRelease.version])

  const activeRelease = useMemo(
    () => releases.find((r) => r.version === selectedVersion) ?? initialRelease,
    [releases, selectedVersion, initialRelease],
  )

  const categories = useMemo(
    () => getReleaseCategories(activeRelease, showTechnical),
    [activeRelease, showTechnical],
  )

  const entries: ChangelogEntry[] = useMemo(
    () =>
      getReleaseEntries(activeRelease, {
        includeDeveloper: showTechnical,
        category: selectedCategory === 'All' ? null : selectedCategory,
      }),
    [activeRelease, showTechnical, selectedCategory],
  )

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  if (!open) return null

  return (
    <div
      className="whats-new-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="whats-new-title"
      onClick={onClose}
    >
      <div className="whats-new-modal" onClick={(e) => e.stopPropagation()}>
        <header className="whats-new-header">
          <div className="whats-new-badge">
            <Icon name="info" size={14} />
            <span>Release Notes &amp; Version History</span>
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

        <div className="whats-new-version-bar" role="tablist" aria-label="Kinora version history">
          {releases.map((rel) => {
            const isCurrentInstalled = rel.version === CURRENT_RELEASE_VERSION
            const isSelected = rel.version === activeRelease.version
            return (
              <button
                key={rel.version}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={`whats-new-version-chip ${isSelected ? 'is-active' : ''}`}
                onClick={() => {
                  setSelectedVersion(rel.version)
                  setSelectedCategory('All')
                }}
              >
                <span>v{rel.version}</span>
                {isCurrentInstalled && <span className="whats-new-installed-dot" title="Installed version" />}
              </button>
            )
          })}
        </div>

        <div className="whats-new-title-block">
          <div className="whats-new-title-row">
            <h2 id="whats-new-title" className="whats-new-title">
              Kinora v{activeRelease.version}
            </h2>
            <span className="whats-new-date">
              Released {activeRelease.releaseDate} ({activeRelease.channel})
            </span>
          </div>
          <p className="whats-new-subtitle">{activeRelease.title}</p>
          <p className="whats-new-summary">{activeRelease.summary}</p>
        </div>

        {onlineReleaseNotice && onlineReleaseNotice.version !== CURRENT_RELEASE_VERSION && (
          <div className="whats-new-online-banner">
            <strong>Newer release available online: v{onlineReleaseNotice.version}</strong>
            {onlineReleaseNotice.notes && <span> ({onlineReleaseNotice.notes.slice(0, 140)})</span>}
          </div>
        )}

        <div className="whats-new-filters">
          <div className="whats-new-category-chips" role="group" aria-label="Filter release changes by category">
            <button
              type="button"
              className={`whats-new-cat-chip ${selectedCategory === 'All' ? 'is-active' : ''}`}
              onClick={() => setSelectedCategory('All')}
            >
              All ({getReleaseEntries(activeRelease, { includeDeveloper: showTechnical }).length})
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`whats-new-cat-chip ${selectedCategory === cat ? 'is-active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          <label className="whats-new-tech-toggle">
            <input
              type="checkbox"
              checked={showTechnical}
              onChange={(e) => {
                setShowTechnical(e.target.checked)
                setSelectedCategory('All')
              }}
            />
            <span>Engineering notes</span>
          </label>
        </div>

        <div className="whats-new-content">
          <ul className="whats-new-list">
            {entries.map((item) => {
              const tone = categoryBadgeTone(item.category)
              const isExpanded = Boolean(expandedIds[item.id])
              return (
                <li key={item.id} className="whats-new-item">
                  <span className={`whats-new-tag tag-${tone}`}>
                    {item.category}
                  </span>
                  <div className="whats-new-item-body">
                    <h4 className="whats-new-item-title">{item.title}</h4>
                    <p className="whats-new-item-desc">{item.description}</p>
                    {item.details && (
                      <div className="whats-new-details-wrap">
                        <button
                          type="button"
                          className="whats-new-details-btn"
                          onClick={() => toggleExpanded(item.id)}
                          aria-expanded={isExpanded}
                        >
                          {isExpanded ? 'Hide details' : 'More details'}
                        </button>
                        {isExpanded && <p className="whats-new-item-details">{item.details}</p>}
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        <footer className="whats-new-footer">
          <div className="whats-new-creator-credit">
            Installed: <strong>v{CURRENT_RELEASE_VERSION}</strong> (offline history bundled) | Created by{' '}
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
