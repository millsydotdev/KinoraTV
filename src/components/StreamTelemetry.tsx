import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import './StreamTelemetry.css'

export interface StreamTelemetryProps {
  videoElement: HTMLVideoElement | null
  hasRealStream: boolean
  playbackStatus: string
  playbackSpeed: number
  audioDelayMs: number
  subDelaySecs: number
  watchdogState?: 'healthy' | 'buffering' | 'reconnecting'
  onClose: () => void
}

interface FrameStats {
  dropped: number
  total: number
  dropRatePercent: number
}

export function StreamTelemetry({
  videoElement,
  hasRealStream,
  playbackStatus,
  playbackSpeed,
  audioDelayMs,
  subDelaySecs,
  watchdogState = 'healthy',
  onClose,
}: StreamTelemetryProps) {
  const [dimensions, setDimensions] = useState<{ width: number; height: number; aspect: string } | null>(null)
  const [frameStats, setFrameStats] = useState<FrameStats | null>(null)
  const [bufferAheadSec, setBufferAheadSec] = useState<number>(0)
  const [bitrateEstimateKbps, setBitrateEstimateKbps] = useState<number | null>(null)

  useEffect(() => {
    let lastBytes = 0
    let lastTime = performance.now()

    const interval = window.setInterval(() => {
      const el = videoElement
      if (!el) return

      // Dimensions & aspect ratio
      if (el.videoWidth && el.videoHeight) {
        const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
        const divisor = gcd(el.videoWidth, el.videoHeight)
        const aspect = `${el.videoWidth / divisor}:${el.videoHeight / divisor}`
        setDimensions({ width: el.videoWidth, height: el.videoHeight, aspect })
      }

      // Frame stats via getVideoPlaybackQuality
      if (typeof el.getVideoPlaybackQuality === 'function') {
        const quality = el.getVideoPlaybackQuality()
        const dropped = quality.droppedVideoFrames
        const total = quality.totalVideoFrames
        const dropRatePercent = total > 0 ? (dropped / total) * 100 : 0
        setFrameStats({ dropped, total, dropRatePercent })
      }

      // Buffer ahead calculation
      let bufSec = 0
      const cur = el.currentTime
      for (let i = 0; i < el.buffered.length; i++) {
        const start = el.buffered.start(i)
        const end = el.buffered.end(i)
        if (cur >= start && cur <= end) {
          bufSec = end - cur
          break
        }
      }
      setBufferAheadSec(Math.round(bufSec * 10) / 10)

      // Bitrate estimate via webkitVideoDecodedByteCount
      const now = performance.now()
      const anyEl = el as unknown as { webkitVideoDecodedByteCount?: number }
      if (typeof anyEl.webkitVideoDecodedByteCount === 'number') {
        const currentBytes = anyEl.webkitVideoDecodedByteCount
        const dt = (now - lastTime) / 1000
        if (lastBytes > 0 && dt >= 0.8) {
          const deltaBytes = currentBytes - lastBytes
          const kbps = Math.round((deltaBytes * 8) / dt / 1000)
          if (kbps > 0) setBitrateEstimateKbps(kbps)
        }
        lastBytes = currentBytes
        lastTime = now
      }
    }, 1000)

    return () => window.clearInterval(interval)
  }, [videoElement])

  return (
    <div className="stream-telemetry-hud" role="region" aria-label="Stream Telemetry Diagnostics">
      <div className="telemetry-header">
        <div className="telemetry-title">
          <Icon name="info" size={14} />
          <strong>STREAM TELEMETRY</strong>
        </div>
        <button
          type="button"
          className="icon-btn close-btn"
          onClick={onClose}
          aria-label="Close telemetry overlay"
        >
          <Icon name="close" size={12} />
        </button>
      </div>

      <div className="telemetry-grid">
        <div className="telemetry-item">
          <span className="telemetry-label">Resolution</span>
          <strong className="telemetry-value">
            {dimensions ? `${dimensions.width} × ${dimensions.height} (${dimensions.aspect})` : 'Detecting...'}
          </strong>
        </div>

        <div className="telemetry-item">
          <span className="telemetry-label">Frame Health</span>
          <strong className="telemetry-value">
            {frameStats
              ? `${frameStats.dropped} dropped / ${frameStats.total} (${frameStats.dropRatePercent.toFixed(2)}%)`
              : 'N/A'}
          </strong>
        </div>

        <div className="telemetry-item">
          <span className="telemetry-label">Buffer Ahead</span>
          <div className="telemetry-buffer-row">
            <strong className="telemetry-value">{bufferAheadSec}s</strong>
            <div className="telemetry-buffer-track">
              <div
                className={`telemetry-buffer-bar${bufferAheadSec < 3 ? ' low' : bufferAheadSec < 8 ? ' mid' : ' high'}`}
                style={{ width: `${Math.min(100, (bufferAheadSec / 20) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {bitrateEstimateKbps !== null && (
          <div className="telemetry-item">
            <span className="telemetry-label">Decoded Bitrate</span>
            <strong className="telemetry-value">
              {bitrateEstimateKbps > 1000
                ? `${(bitrateEstimateKbps / 1000).toFixed(2)} Mbps`
                : `${bitrateEstimateKbps} kbps`}
            </strong>
          </div>
        )}

        <div className="telemetry-item">
          <span className="telemetry-label">Playback State</span>
          <strong className="telemetry-value status-badge">
            <span className={`status-dot ${playbackStatus}`} />
            {playbackStatus.toUpperCase()} ({playbackSpeed}x)
          </strong>
        </div>

        <div className="telemetry-item">
          <span className="telemetry-label">Watchdog Monitor</span>
          <strong className={`telemetry-value watchdog-${watchdogState}`}>
            {watchdogState === 'healthy' ? 'Active (Healthy)' : watchdogState === 'buffering' ? 'Buffering Watchdog' : 'Auto-reconnecting...'}
          </strong>
        </div>

        <div className="telemetry-item">
          <span className="telemetry-label">Stream Pipeline</span>
          <strong className="telemetry-value">
            {hasRealStream ? 'HLS (kstream:// direct proxy)' : 'Demonstration Stream'}
          </strong>
        </div>

        {(audioDelayMs !== 0 || subDelaySecs !== 0) && (
          <div className="telemetry-item">
            <span className="telemetry-label">Sync Adjustments</span>
            <strong className="telemetry-value">
              Audio: {audioDelayMs}ms / Sub: {subDelaySecs.toFixed(1)}s
            </strong>
          </div>
        )}
      </div>
    </div>
  )
}
