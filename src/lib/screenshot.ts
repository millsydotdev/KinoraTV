/**
 * Video frame screenshot capture and clipboard exporter for Kinora.
 * Captures clean video frames at native resolution with zero UI chrome.
 */

export interface ScreenshotOptions {
  format?: 'image/png' | 'image/jpeg'
  quality?: number // 0.0 to 1.0 (for JPEG)
}

export interface ScreenshotResult {
  blob: Blob
  dataUrl: string
  width: number
  height: number
}

/**
 * Generates a clean, filesystem-safe filename for the captured screenshot.
 */
export function generateScreenshotFilename(title: string, timeSec = 0): string {
  const safeTitle = (title || 'Snapshot')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 40)

  const safeSec = Math.max(0, Math.floor(timeSec))
  const hours = Math.floor(safeSec / 3600)
  const minutes = Math.floor((safeSec % 3600) / 60)
  const seconds = safeSec % 60

  const pad = (n: number) => n.toString().padStart(2, '0')
  const timeStr = `${pad(hours)}-${pad(minutes)}-${pad(seconds)}`

  return `Kinora_${safeTitle}_${timeStr}.png`
}

/**
 * Captures the current video frame into a canvas at native video resolution.
 */
export async function captureVideoFrame(
  video: HTMLVideoElement,
  options: ScreenshotOptions = {}
): Promise<ScreenshotResult> {
  const format = options.format || 'image/png'
  const quality = options.quality ?? 0.95

  const width = video.videoWidth || video.clientWidth || 1280
  const height = video.videoHeight || video.clientHeight || 720

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable for screenshot capture')
  }

  // Draw video frame onto canvas:
  ctx.drawImage(video, 0, 0, width, height)

  return new Promise<ScreenshotResult>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to encode video frame blob'))
          return
        }
        const dataUrl = canvas.toDataURL(format, quality)
        resolve({
          blob,
          dataUrl,
          width,
          height,
        })
      },
      format,
      quality
    )
  })
}

/**
 * Copies a PNG screenshot blob directly to the system clipboard.
 */
export async function copyFrameToClipboard(blob: Blob): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard || typeof ClipboardItem === 'undefined') {
    return false
  }

  try {
    const item = new ClipboardItem({ [blob.type || 'image/png']: blob })
    await navigator.clipboard.write([item])
    return true
  } catch {
    return false
  }
}

/**
 * Downloads a screenshot blob as a file in the user's browser / desktop environment.
 */
export function downloadFrame(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'

  document.body.appendChild(link)
  link.click()

  window.setTimeout(() => {
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, 1000)
}
