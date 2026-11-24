// @vitest-environment happy-dom
// Codec support and missing decoder guidance test suite (Finding 5).
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { codecSupport, CODEC_HELP } from '../lib/playback'
import { Settings } from './Settings'
import { StoreProvider } from '../state/store'
import { ToastProvider } from '../components/Toast'

let root: Root
let host: HTMLDivElement

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(async () => {
  if (root) {
    await act(async () => root.unmount())
  }
  if (host) {
    host.remove()
  }
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

const settle = async () => { for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve() }) }

describe('Codec detection and diagnostics (Finding 5)', () => {
  it('detects H.264, AAC, HEVC, and AV1 support via MediaSource when available', () => {
    const isTypeSupportedMock = vi.fn().mockImplementation((type: string) => {
      if (type.includes('avc1')) return true
      if (type.includes('mp4a')) return true
      if (type.includes('hvc1')) return false
      if (type.includes('av01')) return false
      return false
    })

    const originalMediaSource = window.MediaSource
    ;(window as unknown as { MediaSource: unknown }).MediaSource = {
      isTypeSupported: isTypeSupportedMock,
    }

    const result = codecSupport()
    expect(result).not.toBeNull()
    expect(result?.h264).toBe(true)
    expect(result?.aac).toBe(true)
    expect(result?.hevc).toBe(false)
    expect(result?.av1).toBe(false)

    ;(window as unknown as { MediaSource: unknown }).MediaSource = originalMediaSource
  })

  it('renders missing H.264 alert and actionable package install guidance in Settings', async () => {
    // Mock MediaSource where H.264 is unavailable (clean Fedora baseline)
    const originalMediaSource = window.MediaSource
    ;(window as unknown as { MediaSource: unknown }).MediaSource = {
      isTypeSupported: (type: string) => !type.includes('avc1'),
    }

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/settings/playback']}>
          <StoreProvider initialDemo={false}>
            <ToastProvider>
              <Routes>
                <Route path="/settings/:section" element={<Settings />} />
              </Routes>
            </ToastProvider>
          </StoreProvider>
        </MemoryRouter>,
      )
    })
    await settle()

    const text = document.body.textContent ?? ''
    expect(text).toContain('What this system can play')
    expect(text).toContain('H.264 video')
    expect(text).toContain('Not available')
    expect(text).toContain('gstreamer1-plugin-openh264')
    expect(text).toContain('sudo dnf install -y')
    expect(text).toContain('sudo apt-get install -y')

    ;(window as unknown as { MediaSource: unknown }).MediaSource = originalMediaSource
  })

  it('provides honest codec assistance copy without em-dashes', () => {
    expect(CODEC_HELP).not.toContain('—')
    expect(CODEC_HELP).toContain('Fedora')
    expect(CODEC_HELP).toContain('Debian or Ubuntu')
  })
})
