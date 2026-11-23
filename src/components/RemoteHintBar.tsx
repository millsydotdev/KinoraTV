import { Icon, type IconName } from './Icon'
import './RemoteHintBar.css'

export interface RemoteCustomHint {
  keyName: string
  label: string
  icon?: IconName
}

export interface RemoteHintBarProps {
  red?: string
  green?: string
  yellow?: string
  blue?: string
  ok?: string
  back?: string
  info?: string
  playPause?: string
  customHints?: RemoteCustomHint[]
  className?: string
  visible?: boolean
}

export function RemoteHintBar({
  red,
  green,
  yellow,
  blue,
  ok = 'Select',
  back = 'Back',
  info,
  playPause,
  customHints = [],
  className = '',
  visible = true,
}: RemoteHintBarProps) {
  if (!visible) return null

  return (
    <div
      className={`remote-hint-bar ${className}`}
      role="region"
      aria-label="Remote Control Navigation Legend"
      data-testid="remote-hint-bar"
    >
      <div className="remote-hint-container">
        {/* Color buttons group */}
        {(red || green || yellow || blue) && (
          <div className="remote-hint-group remote-hint-colors">
            {red && (
              <div className="remote-hint-item" data-testid="remote-hint-red">
                <span className="remote-color-dot color-red" aria-hidden="true" />
                <span className="remote-hint-label">{red}</span>
              </div>
            )}
            {green && (
              <div className="remote-hint-item" data-testid="remote-hint-green">
                <span className="remote-color-dot color-green" aria-hidden="true" />
                <span className="remote-hint-label">{green}</span>
              </div>
            )}
            {yellow && (
              <div className="remote-hint-item" data-testid="remote-hint-yellow">
                <span className="remote-color-dot color-yellow" aria-hidden="true" />
                <span className="remote-hint-label">{yellow}</span>
              </div>
            )}
            {blue && (
              <div className="remote-hint-item" data-testid="remote-hint-blue">
                <span className="remote-color-dot color-blue" aria-hidden="true" />
                <span className="remote-hint-label">{blue}</span>
              </div>
            )}
          </div>
        )}

        {/* Divider if both color keys and action keys exist */}
        {(red || green || yellow || blue) && (ok || back || info || playPause || customHints.length > 0) && (
          <div className="remote-hint-divider" aria-hidden="true" />
        )}

        {/* Navigation action buttons group */}
        <div className="remote-hint-group remote-hint-actions">
          {ok && (
            <div className="remote-hint-item" data-testid="remote-hint-ok">
              <span className="remote-badge-key">OK</span>
              <span className="remote-hint-label">{ok}</span>
            </div>
          )}
          {back && (
            <div className="remote-hint-item" data-testid="remote-hint-back">
              <span className="remote-badge-key">BACK</span>
              <span className="remote-hint-label">{back}</span>
            </div>
          )}
          {info && (
            <div className="remote-hint-item" data-testid="remote-hint-info">
              <span className="remote-badge-key">INFO</span>
              <span className="remote-hint-label">{info}</span>
            </div>
          )}
          {playPause && (
            <div className="remote-hint-item" data-testid="remote-hint-playpause">
              <span className="remote-badge-key">
                <Icon name="play" size={11} />
              </span>
              <span className="remote-hint-label">{playPause}</span>
            </div>
          )}
          {customHints.map((hint) => (
            <div
              key={hint.keyName}
              className="remote-hint-item"
              data-testid={`remote-hint-${hint.keyName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
            >
              <span className="remote-badge-key">
                {hint.icon && <Icon name={hint.icon} size={11} />}
                <span>{hint.keyName}</span>
              </span>
              <span className="remote-hint-label">{hint.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
