// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Breadcrumbs } from './Breadcrumbs'
import { OfflineBanner } from './OfflineBanner'
import { ArtworkLightboxModal } from './ArtworkLightboxModal'
import { BookReaderModal } from './BookReaderModal'
import { AudioNowPlayingModal } from './AudioNowPlayingModal'
import { ToastProvider } from './Toast'
import type { AudioTrackState } from '../state/mediaLibrary'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('Kinora Frontend Expansion Features Suite', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  const mount = async (node: React.ReactNode) => {
    await act(async () => {
      root.render(node)
    })
  }

  it('Breadcrumbs: renders hierarchical path with links and current page', async () => {
    await mount(
      <MemoryRouter>
        <Breadcrumbs
          crumbs={[
            { label: 'Home', to: '/' },
            { label: 'Movies', to: '/movies' },
            { label: 'Solaris' },
          ]}
        />
      </MemoryRouter>
    )

    expect(container.textContent).toContain('Home')
    expect(container.textContent).toContain('Movies')
    expect(container.textContent).toContain('Solaris')

    const current = container.querySelector('.breadcrumb-current')
    expect(current).not.toBeNull()
    expect(current?.getAttribute('aria-current')).toBe('page')
  })

  it('OfflineBanner: responds to online and offline lifecycle events', async () => {
    await mount(<OfflineBanner />)

    // Trigger offline event
    await act(async () => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(container.querySelector('.offline-banner')).not.toBeNull()
    expect(container.textContent).toContain('You are currently offline')

    // Trigger online restoration event
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    expect(container.querySelector('.offline-banner.is-online-restored')).not.toBeNull()
    expect(container.textContent).toContain('Network connection restored')
  })

  it('ArtworkLightboxModal: renders high-res viewer and toggles zoom state', async () => {
    const handleClose = vi.fn()
    await mount(
      <ArtworkLightboxModal
        isOpen={true}
        onClose={handleClose}
        imageUrl="/art/neon-district.jpg"
        title="Neon District 4K"
        dimensions="3840 x 2160"
        format="PNG Master"
      />
    )

    expect(container.textContent).toContain('Neon District 4K')
    expect(container.textContent).toContain('3840 x 2160')

    const img = container.querySelector('.lightbox-img') as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.getAttribute('src')).toBe('/art/neon-district.jpg')

    // Press 'z' key to toggle zoom
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z' }))
    })
    const zoomedWrap = container.querySelector('.lightbox-image-wrap.is-zoomed')
    expect(zoomedWrap).not.toBeNull()

    // Press Escape key to close
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(handleClose).toHaveBeenCalled()
  })

  it('BookReaderModal: renders digital reader, navigates pages, and switches themes', async () => {
    const handleClose = vi.fn()
    await mount(
      <ToastProvider>
        <BookReaderModal
          isOpen={true}
          onClose={handleClose}
          title="The Odyssey"
          author="Homer"
          sourceName="Project Gutenberg"
        />
      </ToastProvider>
    )

    expect(container.textContent).toContain('The Odyssey')
    expect(container.textContent).toContain('Page 1 of 3')

    // Navigate to next page
    const nextBtn = container.querySelector('button[aria-label="Next page"]') as HTMLButtonElement
    expect(nextBtn).not.toBeNull()
    await act(async () => {
      nextBtn.click()
    })
    expect(container.textContent).toContain('Page 2 of 3')

    // Open typography settings and change theme
    const appearanceBtn = container.querySelector('button[title="Typography and appearance settings"]') as HTMLButtonElement
    expect(appearanceBtn).not.toBeNull()
    await act(async () => {
      appearanceBtn.click()
    })

    const sepiaBtn = container.querySelector('.swatch-sepia') as HTMLButtonElement
    expect(sepiaBtn).not.toBeNull()
    await act(async () => {
      sepiaBtn.click()
    })
    const overlay = container.querySelector('.book-reader-overlay.theme-sepia')
    expect(overlay).not.toBeNull()
  })

  it('AudioNowPlayingModal: displays visualizer bars, equalizer presets, and controls playback', async () => {
    const handleToggle = vi.fn()
    const handleVolume = vi.fn()
    const handleClose = vi.fn()

    const sampleTrack: AudioTrackState = {
      id: 'track-1',
      name: 'BBC Radio 4 Live',
      provider: 'BBC Sounds',
      streamUrl: 'https://stream.live.bbcsounds.uk/radio4.aac',
      accentHue: 215,
      mediaType: 'radio',
    }

    await mount(
      <AudioNowPlayingModal
        isOpen={true}
        onClose={handleClose}
        track={sampleTrack}
        isPlaying={true}
        volume={0.8}
        onTogglePlay={handleToggle}
        onVolumeChange={handleVolume}
      />
    )

    expect(container.textContent).toContain('BBC Radio 4 Live')
    expect(container.textContent).toContain('BBC Sounds')

    // Verify spectrum wave visualizer bars exist and are animated when playing
    const bars = container.querySelectorAll('.anp-bar.is-animated')
    expect(bars.length).toBe(24)

    // Switch Equalizer Preset
    const bassBtn = Array.from(container.querySelectorAll('.anp-eq-btn')).find(
      (btn) => btn.textContent?.trim() === 'Bass Boost'
    ) as HTMLButtonElement
    expect(bassBtn).not.toBeNull()
    await act(async () => {
      bassBtn.click()
    })
    expect(bassBtn.getAttribute('aria-pressed')).toBe('true')

    // Click Play/Pause toggle
    const playBtn = container.querySelector('.anp-btn-play') as HTMLButtonElement
    expect(playBtn).not.toBeNull()
    await act(async () => {
      playBtn.click()
    })
    expect(handleToggle).toHaveBeenCalled()
  })
})
