// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import {
  captureVideoFrame,
  copyFrameToClipboard,
  downloadFrame,
  generateScreenshotFilename,
} from './screenshot'

describe('screenshot engine', () => {
  describe('generateScreenshotFilename', () => {
    it('creates sanitized filename with formatted timecode', () => {
      const filename = generateScreenshotFilename('Blade Runner 2049', 3725)
      expect(filename).toBe('Kinora_Blade_Runner_2049_01-02-05.png')
    })

    it('handles special characters and long titles', () => {
      const filename = generateScreenshotFilename('Special: Title / With #Symbols & Extras', 65)
      expect(filename).toBe('Kinora_Special_Title_With_Symbols_Extras_00-01-05.png')
    })

    it('defaults to Snapshot when title is empty', () => {
      const filename = generateScreenshotFilename('', 0)
      expect(filename).toBe('Kinora_Snapshot_00-00-00.png')
    })
  })

  describe('captureVideoFrame', () => {
    it('renders video onto canvas and returns encoded result', async () => {
      const mockDrawImage = vi.fn()
      const mockToBlob = vi.fn((cb: (blob: Blob) => void) => {
        cb(new Blob(['fake-image-bytes'], { type: 'image/png' }))
      })
      const mockToDataURL = vi.fn(() => 'data:image/png;base64,fake')

      // Mock canvas
      const originalCreateElement = document.createElement.bind(document)
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'canvas') {
          return {
            width: 0,
            height: 0,
            getContext: vi.fn(() => ({
              drawImage: mockDrawImage,
            })),
            toBlob: mockToBlob,
            toDataURL: mockToDataURL,
          } as any
        }
        return originalCreateElement(tagName)
      })

      const mockVideo = {
        videoWidth: 1920,
        videoHeight: 1080,
      } as HTMLVideoElement

      const result = await captureVideoFrame(mockVideo)

      expect(result.width).toBe(1920)
      expect(result.height).toBe(1080)
      expect(result.dataUrl).toBe('data:image/png;base64,fake')
      expect(result.blob).toBeDefined()
      expect(mockDrawImage).toHaveBeenCalledWith(mockVideo, 0, 0, 1920, 1080)
    })
  })

  describe('copyFrameToClipboard', () => {
    it('writes image blob to navigator.clipboard when supported', async () => {
      const mockWrite = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', {
        value: { write: mockWrite },
        writable: true,
        configurable: true,
      })
      globalThis.ClipboardItem = class MockClipboardItem {
        data: any
        constructor(data: any) {
          this.data = data
        }
      } as any

      const blob = new Blob(['bytes'], { type: 'image/png' })
      const success = await copyFrameToClipboard(blob)

      expect(success).toBe(true)
      expect(mockWrite).toHaveBeenCalledTimes(1)
    })

    it('returns false when clipboard API is unavailable', async () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: undefined,
        writable: true,
        configurable: true,
      })

      const blob = new Blob(['bytes'], { type: 'image/png' })
      const success = await copyFrameToClipboard(blob)

      expect(success).toBe(false)
    })
  })

  describe('downloadFrame', () => {
    it('creates temporary link and initiates download', () => {
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
      const appendChildSpy = vi.spyOn(document.body, 'appendChild')

      const blob = new Blob(['img'], { type: 'image/png' })
      downloadFrame(blob, 'test.png')

      expect(appendChildSpy).toHaveBeenCalled()
      expect(clickSpy).toHaveBeenCalledTimes(1)
    })
  })
})
