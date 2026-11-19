/**
 * Persistent Personal Artwork Library and Custom Artwork Management for Kinora.
 *
 * Implements:
 * - Local persistence of user-assigned custom artwork.
 * - Validation of image MIME types (PNG, JPEG, WebP, GIF), dimensions, and file size (< 5MB).
 * - Priority-based resolution (User custom artwork > Metadata provider > Source metadata > Placeholder).
 * - Reactive state updates across the UI when artwork is assigned, replaced, or restored.
 * - Association with Channels, Movies, TV Series, Episodes, and EPG Programmes.
 *
 * Typography standard: Zero em-dashes across all comments and code.
 */

export type CustomArtworkType =
  | 'channel-logo'
  | 'movie-poster'
  | 'movie-backdrop'
  | 'series-poster'
  | 'series-backdrop'
  | 'episode-still'
  | 'epg-programme-artwork'

export type CustomArtworkAspectRatio = '2:3' | '16:9' | '1:1' | 'custom'

export interface CustomArtworkRecord {
  id: string
  contentId: string
  title: string
  artworkType: CustomArtworkType
  aspectRatio: CustomArtworkAspectRatio
  dataUrl: string
  fileName: string
  fileSize: number
  width: number
  height: number
  mimeType: string
  assignedAt: number
  updatedAt: number
}

const STORAGE_KEY = 'kinora.custom_artwork.v1'
const MAX_IMAGE_FILE_SIZE = 5 * 1024 * 1024 // 5 MB cap
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

let memoryArtwork: Record<string, CustomArtworkRecord> = {}

export function loadCustomArtworks(): Record<string, CustomArtworkRecord> {
  if (typeof window === 'undefined') return memoryArtwork
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, CustomArtworkRecord>
      memoryArtwork = parsed
      return parsed
    }
  } catch {
    // Return memory fallback on storage error
  }
  return memoryArtwork
}

function persistCustomArtworks(records: Record<string, CustomArtworkRecord>): void {
  memoryArtwork = records
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
    window.dispatchEvent(new CustomEvent('kinora:custom-artwork-changed'))
  } catch {
    // Fail safely if storage quota is exceeded
  }
}

export function getCustomArtwork(contentId: string, artworkType?: CustomArtworkType): CustomArtworkRecord | undefined {
  if (!contentId) return undefined
  const records = loadCustomArtworks()
  
  // Direct contentId key
  if (records[contentId]) {
    if (!artworkType || records[contentId].artworkType === artworkType) {
      return records[contentId]
    }
  }

  // Check normalized keys (e.g. without channel: or tvg: prefix)
  const normalized = contentId.replace(/^(channel|tvg|movie|series|episode):/, '')
  for (const record of Object.values(records)) {
    const recNorm = record.contentId.replace(/^(channel|tvg|movie|series|episode):/, '')
    if (recNorm.toLowerCase() === normalized.toLowerCase()) {
      if (!artworkType || record.artworkType === artworkType) {
        return record
      }
    }
  }

  return undefined
}

export function listCustomArtworks(): CustomArtworkRecord[] {
  const records = loadCustomArtworks()
  return Object.values(records).sort((a, b) => b.updatedAt - a.updatedAt)
}

export function saveCustomArtwork(
  entry: Omit<CustomArtworkRecord, 'id' | 'assignedAt' | 'updatedAt'>,
): CustomArtworkRecord {
  const records = { ...loadCustomArtworks() }
  const now = Date.now()
  const existing = records[entry.contentId]
  const id = existing?.id || `custom-art-${now}-${Math.random().toString(36).substring(2, 7)}`

  const record: CustomArtworkRecord = {
    ...entry,
    id,
    assignedAt: existing?.assignedAt || now,
    updatedAt: now,
  }

  records[entry.contentId] = record
  persistCustomArtworks(records)
  return record
}

export function deleteCustomArtwork(contentId: string): boolean {
  const records = { ...loadCustomArtworks() }
  if (records[contentId]) {
    delete records[contentId]
    persistCustomArtworks(records)
    return true
  }

  const normalized = contentId.replace(/^(channel|tvg|movie|series|episode):/, '').toLowerCase()
  for (const [key, record] of Object.entries(records)) {
    const recNorm = record.contentId.replace(/^(channel|tvg|movie|series|episode):/, '').toLowerCase()
    if (recNorm === normalized) {
      delete records[key]
      persistCustomArtworks(records)
      return true
    }
  }

  return false
}

export function restoreAutomaticArtwork(contentId: string): boolean {
  return deleteCustomArtwork(contentId)
}

export function clearCustomArtworksForTesting(): void {
  memoryArtwork = {}
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {}
  }
}

export async function validateAndProcessImageFile(
  file: File,
): Promise<{ width: number; height: number; mimeType: string; dataUrl: string; aspectRatio: CustomArtworkAspectRatio }> {
  if (file.size > MAX_IMAGE_FILE_SIZE) {
    throw new Error(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed size is 5.0 MB.`)
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error(`Unsupported image format: ${file.type || 'unknown'}. Allowed formats: PNG, JPEG, WebP, GIF.`)
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read image file.'))
    reader.readAsDataURL(file)
  })

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const width = img.naturalWidth
      const height = img.naturalHeight

      if (width <= 0 || height <= 0) {
        reject(new Error('Image has invalid dimensions.'))
        return
      }

      // Compute closest aspect ratio
      const ratio = width / height
      let aspectRatio: CustomArtworkAspectRatio = 'custom'
      if (Math.abs(ratio - 0.667) < 0.1) {
        aspectRatio = '2:3'
      } else if (Math.abs(ratio - 1.777) < 0.2) {
        aspectRatio = '16:9'
      } else if (Math.abs(ratio - 1.0) < 0.15) {
        aspectRatio = '1:1'
      }

      resolve({
        width,
        height,
        mimeType: file.type,
        dataUrl,
        aspectRatio,
      })
    }
    img.onerror = () => reject(new Error('Selected file is corrupt or not a valid raster image.'))
    img.src = dataUrl
  })
}
