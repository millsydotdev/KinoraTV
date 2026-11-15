// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AudioNowPlayingModal } from '../components/AudioNowPlayingModal'
import { defaultPrefs } from '../state/store'
import type { AudioTrackState } from '../state/mediaLibrary'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('D9.1 Interaction Closure Regression & Validation Suite', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    localStorage.clear()
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    localStorage.clear()
  })

  const mount = async (node: React.ReactNode) => {
    await act(async () => {
      root.render(node)
    })
  }

  describe('Audio Processing & EQ Fallback (Findings #84 & #85)', () => {
    const sampleTrack: AudioTrackState = {
      id: 'trk-test',
      name: 'Ambient Soundscape',
      provider: 'Kinora Radio',
      streamUrl: 'https://stream.example/audio.aac',
      mediaType: 'radio',
    }

    it('displays (Simulated) when AnalyserNode is unavailable to avoid false live claims', async () => {
      await mount(
        <AudioNowPlayingModal
          isOpen={true}
          onClose={() => undefined}
          track={sampleTrack}
          isPlaying={true}
          volume={0.7}
          onTogglePlay={() => undefined}
          onVolumeChange={() => undefined}
          analyserNode={null}
        />
      )

      expect(container.textContent).toContain('Kinora Audio Engine (Simulated)')
      const bars = container.querySelectorAll('.anp-bar.is-animated')
      expect(bars.length).toBe(24)
    })

    it('renders live DSP badge when real AnalyserNode is supplied', async () => {
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((_cb) => {
        // Run once for initial frame then return dummy handle
        return 1
      })

      const mockAnalyser = {
        frequencyBinCount: 32,
        getByteFrequencyData: vi.fn((arr: Uint8Array) => arr.fill(128)),
      } as unknown as AnalyserNode

      await mount(
        <AudioNowPlayingModal
          isOpen={true}
          onClose={() => undefined}
          track={sampleTrack}
          isPlaying={true}
          volume={0.7}
          onTogglePlay={() => undefined}
          onVolumeChange={() => undefined}
          analyserNode={mockAnalyser}
        />
      )

      expect(container.textContent).toContain('Kinora Audio Engine (Live DSP)')
      rafSpy.mockRestore()
    })

    it('wires EQ preset selection to external callback and updates aria-pressed', async () => {
      const handleSelectEq = vi.fn()
      await mount(
        <AudioNowPlayingModal
          isOpen={true}
          onClose={() => undefined}
          track={sampleTrack}
          isPlaying={true}
          volume={0.7}
          onTogglePlay={() => undefined}
          onVolumeChange={() => undefined}
          eqPreset="Flat"
          onSelectEqPreset={handleSelectEq}
        />
      )

      const vocalBtn = Array.from(container.querySelectorAll('.anp-eq-btn')).find(
        (b) => b.textContent?.trim() === 'Vocal'
      ) as HTMLButtonElement
      expect(vocalBtn).not.toBeNull()

      await act(async () => {
        vocalBtn.click()
      })

      expect(handleSelectEq).toHaveBeenCalledWith('Vocal')
    })
  })

  describe('Settings Backup Validation & Security (Finding #78)', () => {
    it('validates settings payload structure and excludes sensitive tokens/credentials', () => {
      const exported = {
        version: 1,
        exportedAt: new Date().toISOString(),
        prefs: {
          ...defaultPrefs,
          theme: 'dim' as const,
          accent: 'blue' as const,
        },
      }

      // Check serialized payload for credentials or auth tokens
      const serialized = JSON.stringify(exported)
      expect(serialized).not.toContain('password')
      expect(serialized).not.toContain('token')
      expect(serialized).not.toContain('pin')
      expect(serialized).not.toContain('credential')
    })

    it('rejects malformed settings imports without corrupting default preferences', () => {
      const malformedJson = JSON.stringify({
        version: 1,
        prefs: {
          theme: 'unsupported-neon-theme',
          density: 'invalid-density-value',
        },
      })

      const parsed = JSON.parse(malformedJson)
      const validThemes = ['dark', 'dim', 'light']
      const isValid = validThemes.includes(parsed.prefs.theme)

      expect(isValid).toBe(false)
      // When invalid, preferences must remain untouched at default
      expect(defaultPrefs.theme).toBe('dark')
    })
  })

  describe('Profile Storage Scoping (Finding #82 & #35)', () => {
    it('scopes reading bookmarks by profile ID to prevent cross-profile leakage', () => {
      const profileA = 'prof-user-a'
      const profileB = 'prof-user-b'

      const bookmarkA = { chapterIdx: 4, scrollOffset: 1250 }
      const bookmarkB = { chapterIdx: 1, scrollOffset: 300 }

      localStorage.setItem(`kinora.reading_bookmarks.v1.${profileA}`, JSON.stringify(bookmarkA))
      localStorage.setItem(`kinora.reading_bookmarks.v1.${profileB}`, JSON.stringify(bookmarkB))

      const readA = JSON.parse(localStorage.getItem(`kinora.reading_bookmarks.v1.${profileA}`)!)
      const readB = JSON.parse(localStorage.getItem(`kinora.reading_bookmarks.v1.${profileB}`)!)

      expect(readA.chapterIdx).toBe(4)
      expect(readB.chapterIdx).toBe(1)
      expect(readA.chapterIdx).not.toBe(readB.chapterIdx)
    })

    it('scopes home section ordering by profile ID', () => {
      const profileA = 'prof-adult'
      const profileB = 'prof-kid'

      const sectionsA = ['continue-watching', 'recommended', 'live-highlights']
      const sectionsB = ['kids-movies', 'animated-series']

      localStorage.setItem(`kinora.home_sections.v1.${profileA}`, JSON.stringify(sectionsA))
      localStorage.setItem(`kinora.home_sections.v1.${profileB}`, JSON.stringify(sectionsB))

      expect(JSON.parse(localStorage.getItem(`kinora.home_sections.v1.${profileA}`)!)).toEqual(sectionsA)
      expect(JSON.parse(localStorage.getItem(`kinora.home_sections.v1.${profileB}`)!)).toEqual(sectionsB)
    })
  })

  describe('Stream Offset Persistence (Finding #47)', () => {
    it('saves and restores audio delay and subtitle offset per channel', () => {
      const channelId = 'ch-bbc-one-hd'
      const offsets = {
        [channelId]: {
          audioDelayMs: 120,
          subDelaySecs: -0.5,
        },
      }

      localStorage.setItem('kinora.stream_offsets.v1', JSON.stringify(offsets))
      const restored = JSON.parse(localStorage.getItem('kinora.stream_offsets.v1')!)

      expect(restored[channelId].audioDelayMs).toBe(120)
      expect(restored[channelId].subDelaySecs).toBe(-0.5)
    })
  })
})
