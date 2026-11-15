import { useState } from 'react'
import { Dialog } from './Dialog'
import { Icon } from './Icon'
import { DEFAULT_HOME_SECTIONS, type HomeSectionSetting } from '../state/userPreferences'
import { useStore } from '../state/store'
import { useProfiles } from '../state/profiles'
import { useToast } from './Toast'
import './HomeCustomizeModal.css'

interface HomeCustomizeModalProps {
  open: boolean
  onClose: () => void
}

export function HomeCustomizeModal({ open, onClose }: HomeCustomizeModalProps) {
  const store = useStore()
  const toast = useToast()
  const { activeProfile } = useProfiles()
  const profileId = activeProfile?.id ?? 'default'
  const profileKey = `kinora.home_sections.v1.${profileId}`
  const userPrefs = store.userPreferences

  const currentSections = (() => {
    try {
      const raw = localStorage.getItem(profileKey)
      if (raw) return JSON.parse(raw) as HomeSectionSetting[]
    } catch {}
    return userPrefs?.preferences.homeSectionsConfig ?? DEFAULT_HOME_SECTIONS
  })()
  const currentDensity = userPrefs?.preferences.cardDensity ?? 'comfortable'

  const [sections, setSections] = useState<HomeSectionSetting[]>(currentSections)

  if (!open) return null

  const handleToggle = (id: string) => {
    const next = sections.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s))
    setSections(next)
    userPrefs?.setHomeSectionsConfig(next)
    try {
      localStorage.setItem(profileKey, JSON.stringify(next))
    } catch {}
  }

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= sections.length) return

    const next = [...sections]
    const temp = next[index]!
    next[index] = next[targetIndex]!
    next[targetIndex] = temp

    // Update order property
    const reordered = next.map((s, idx) => ({ ...s, order: idx + 1 }))
    setSections(reordered)
    userPrefs?.setHomeSectionsConfig(reordered)
    try {
      localStorage.setItem(profileKey, JSON.stringify(reordered))
    } catch {}
  }

  const handleReset = () => {
    setSections(DEFAULT_HOME_SECTIONS)
    userPrefs?.setHomeSectionsConfig(DEFAULT_HOME_SECTIONS)
    userPrefs?.setCardDensity('comfortable')
    try {
      localStorage.removeItem(profileKey)
    } catch {}
    toast('Home screen layout reset to default')
  }

  return (
    <Dialog open={open} onClose={onClose} title="Personalise Home Screen">
      <div className="home-customize-content">
        <section className="customize-section">
          <label className="customize-label">Card Display Density</label>
          <div className="density-toggle-group" role="group" aria-label="Card density">
            {(
              [
                { id: 'compact', label: 'Compact', desc: 'Smaller cards, more items visible' },
                { id: 'comfortable', label: 'Comfortable', desc: 'Standard balanced streaming layout' },
                { id: 'spacious', label: 'Spacious', desc: 'Larger artwork focus and larger text' },
              ] as const
            ).map((d) => (
              <button
                key={d.id}
                type="button"
                className={`density-btn ${currentDensity === d.id ? 'is-active' : ''}`}
                aria-pressed={currentDensity === d.id}
                onClick={() => {
                  userPrefs?.setCardDensity(d.id)
                  toast(`Density set to ${d.label}`)
                }}
              >
                <strong>{d.label}</strong>
                <span className="density-desc">{d.desc}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="customize-section">
          <div className="customize-section-header">
            <label className="customize-label">Discovery Rails & Ordering</label>
            <button type="button" className="btn btn-ghost btn-small" onClick={handleReset}>
              Reset Default
            </button>
          </div>
          <p className="faint customize-hint">
            Reorder discovery rails or hide ones you do not wish to see on your Home screen.
          </p>

          <ul className="customize-rail-list">
            {sections.map((s, idx) => (
              <li key={s.id} className={`customize-rail-item ${!s.visible ? 'is-hidden' : ''}`}>
                <button
                  type="button"
                  className="customize-visibility-btn"
                  aria-label={s.visible ? `Hide ${s.title}` : `Show ${s.title}`}
                  onClick={() => handleToggle(s.id)}
                  title={s.visible ? 'Visible on Home' : 'Hidden from Home'}
                >
                  <Icon name={s.visible ? 'eye' : 'eyeOff'} size={18} />
                </button>
                <span className="customize-rail-title">{s.title}</span>
                <div className="customize-move-btns">
                  <button
                    type="button"
                    className="icon-btn"
                    disabled={idx === 0}
                    aria-label={`Move ${s.title} up`}
                    onClick={() => handleMove(idx, 'up')}
                  >
                    <Icon name="up" size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    disabled={idx === sections.length - 1}
                    aria-label={`Move ${s.title} down`}
                    onClick={() => handleMove(idx, 'down')}
                  >
                    <Icon name="down" size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Dialog>
  )
}
