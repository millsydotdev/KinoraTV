import { Icon } from './Icon'
import { useOptionalUpdater } from '../state/updater'
import { describeUpdaterStage, formatDownloadSize } from '../lib/updaterState'
import { inNativeShell } from '../lib/native'
import './UpdateNotificationBanner.css'

export interface UpdateNotificationBannerProps {
  onViewReleaseNotes: () => void
}

/**
 * Global non-intrusive update notification banner shown when a compatible signed
 * Kinora release is discovered, actively downloading/installing, or ready for restart.
 * Respects user dismissal per version and keeps keyboard accessibility intact.
 */
export function UpdateNotificationBanner({ onViewReleaseNotes }: UpdateNotificationBannerProps) {
  const updater = useOptionalUpdater()
  if (!updater || !updater.notificationVisible) return null

  const { state, isBusy, downloadAndInstall, restartNow, dismissNotification } = updater
  const sizeLabel = formatDownloadSize(state.assetSizeBytes ?? state.totalBytes)
  const releaseDateShort = state.releaseDate ? state.releaseDate.slice(0, 10) : null
  const summaryLine = state.releaseNotes
    ? state.releaseNotes.split('\n').map((s) => s.trim()).find(Boolean)?.slice(0, 160) ?? null
    : null

  return (
    <aside
      className="update-banner"
      role="status"
      aria-live="polite"
      aria-label="Kinora software update notification"
      data-testid="update-notification-banner"
    >
      <div className="update-banner-main">
        <div className="update-banner-icon" aria-hidden="true">
          <Icon name={state.stage === 'restartRequired' ? 'check' : 'download'} size={18} />
        </div>
        <div className="update-banner-copy">
          <div className="update-banner-title-row">
            <strong className="update-banner-title">
              {state.stage === 'restartRequired'
                ? `Kinora v${state.targetVersion ?? 'latest'} installed: restart required`
                : `Update available: Kinora v${state.targetVersion ?? 'latest'}`}
            </strong>
            <span className="update-banner-meta">
              Installed v{state.currentVersion}
              {releaseDateShort ? ` | Released ${releaseDateShort}` : ''}
              {sizeLabel ? ` | ${sizeLabel}` : ''}
              {state.hasSignature ? ' | Signed' : ' | Unsigned'}
              {state.stage === 'available' ? ' | Restart required after install' : ''}
            </span>
          </div>
          {summaryLine && state.stage === 'available' && (
            <p className="update-banner-summary">{summaryLine}</p>
          )}
          {state.stage !== 'available' && (
            <p className="update-banner-summary">
              {describeUpdaterStage(state.stage)}: {state.message}
            </p>
          )}
          {state.stage === 'downloading' && state.percent !== null && (
            <div
              className="update-banner-progress"
              role="progressbar"
              aria-valuenow={state.percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="update-banner-progress-fill" style={{ width: `${state.percent}%` }} />
            </div>
          )}
        </div>
      </div>

      <div className="update-banner-actions">
        <button
          type="button"
          className="btn btn-ghost btn-small"
          onClick={onViewReleaseNotes}
        >
          Release Notes
        </button>

        {state.stage === 'restartRequired' && inNativeShell() && (
          <button
            type="button"
            className="btn btn-primary btn-small"
            onClick={() => void restartNow()}
          >
            Restart Now
          </button>
        )}

        {state.stage === 'available' && inNativeShell() && state.hasSignature && (
          <button
            type="button"
            className="btn btn-primary btn-small"
            disabled={isBusy}
            onClick={() => void downloadAndInstall()}
          >
            Download &amp; Install
          </button>
        )}

        {state.stage === 'available' && !inNativeShell() && state.downloadUrl && (
          <a
            href={state.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-small"
          >
            Download
          </a>
        )}

        {!isBusy && state.stage !== 'restartRequired' && (
          <button
            type="button"
            className="update-banner-dismiss"
            onClick={dismissNotification}
            aria-label="Dismiss update notification"
            title="Dismiss until next release or manual check"
          >
            <Icon name="close" size={14} />
          </button>
        )}
      </div>
    </aside>
  )
}
