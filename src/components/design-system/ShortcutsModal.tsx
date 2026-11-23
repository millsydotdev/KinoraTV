import { Dialog } from '../Dialog'
import './ShortcutsModal.css'

interface ShortcutRow {
  key: string
  action: string
}

interface ShortcutSection {
  title: string
  items: ShortcutRow[]
}

const sections: ShortcutSection[] = [
  {
    title: 'Global Navigation',
    items: [
      { key: 'Ctrl + K / ⌘K', action: 'Open Command Palette' },
      { key: '/', action: 'Focus Global Search' },
      { key: '?', action: 'Open Keyboard Shortcuts' },
      { key: 'Esc', action: 'Close dialog, sheet, or player' },
      { key: '1 to 8', action: 'Jump directly to sidebar screens' },
    ],
  },
  {
    title: 'Live TV & Guide',
    items: [
      { key: '0 - 9', action: 'Direct channel keypad tuning' },
      { key: 'Z', action: 'Cycle timeline zoom (2h, 3h, 4h)' },
      { key: 'N', action: 'Jump timeline to current time' },
      { key: 'P', action: 'Switch to previous channel' },
      { key: 'Arrow Keys', action: 'Navigate channels and timeline' },
      { key: 'Enter', action: 'Open selected programme or channel' },
    ],
  },
  {
    title: 'Media Playback',
    items: [
      { key: 'Space', action: 'Play / Pause' },
      { key: 'F', action: 'Toggle Fullscreen' },
      { key: 'M', action: 'Mute / Unmute audio' },
      { key: 'C', action: 'Toggle Subtitles' },
      { key: '← / →', action: 'Seek backward / forward 10s' },
      { key: 'A', action: 'Cycle display aspect ratio' },
      { key: 'D', action: 'Toggle playback diagnostics overlay' },
      { key: 'Shift + D', action: 'Toggle real-time stream telemetry' },
      { key: 'Shift + C / L', action: 'Toggle in-player quick channel drawer' },
    ],
  },
  {
    title: 'Television & Remote Controls',
    items: [
      { key: '0 - 9', action: 'Direct numeric channel entry' },
      { key: 'Red / F1', action: 'Jump to Library and Favourites' },
      { key: 'Green / F2', action: 'Jump to Live TV Guide' },
      { key: 'Yellow / F3', action: 'Open Search and Command Palette' },
      { key: 'Blue / F4', action: 'Jump to Sources and Discovery' },
    ],
  },
]

export function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard Shortcuts">
      <div className="ds-shortcuts-container">
        {sections.map((sec) => (
          <section key={sec.title} className="ds-shortcuts-section">
            <h3 className="ds-shortcuts-sec-title">{sec.title}</h3>
            <div className="ds-shortcuts-grid">
              {sec.items.map((item) => (
                <div key={item.key} className="ds-shortcuts-row">
                  <span className="ds-shortcuts-action">{item.action}</span>
                  <kbd className="ds-shortcuts-kbd">{item.key}</kbd>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Dialog>
  )
}
