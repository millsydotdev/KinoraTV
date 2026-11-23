import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { getEqPresetGains } from './AudioPlayerBar'
import { AudioNowPlayingModal, EQ_PRESETS } from './AudioNowPlayingModal'
import type { AudioTrackState } from '../state/mediaLibrary'

describe('Parametric Audio Equalizer DSP Presets', () => {
  it('EQ-01: calculates correct gains across all equalizer presets', () => {
    // Flat
    expect(getEqPresetGains('Flat')).toEqual({ bass: 0, mid: 0, treble: 0 })

    // Bass Boost
    expect(getEqPresetGains('Bass Boost')).toEqual({ bass: 6, mid: 0, treble: -1 })

    // Treble Boost
    expect(getEqPresetGains('Treble Boost')).toEqual({ bass: -2, mid: 0, treble: 6 })

    // Vocal Boost
    expect(getEqPresetGains('Vocal')).toEqual({ bass: -3, mid: 4, treble: 2 })

    // Spoken Word
    expect(getEqPresetGains('Spoken Word')).toEqual({ bass: -5, mid: 5, treble: 1 })

    // Acoustic
    expect(getEqPresetGains('Acoustic')).toEqual({ bass: 2, mid: 1, treble: 3 })

    // Club
    expect(getEqPresetGains('Club')).toEqual({ bass: 5, mid: 2, treble: 4 })
  })

  it('EQ-02: EQ_PRESETS includes all 7 presets including Treble Boost and Spoken Word', () => {
    expect(EQ_PRESETS).toContain('Flat')
    expect(EQ_PRESETS).toContain('Bass Boost')
    expect(EQ_PRESETS).toContain('Treble Boost')
    expect(EQ_PRESETS).toContain('Vocal')
    expect(EQ_PRESETS).toContain('Spoken Word')
    expect(EQ_PRESETS).toContain('Acoustic')
    expect(EQ_PRESETS).toContain('Club')
    expect(EQ_PRESETS.length).toBe(7)
  })

  it('EQ-03: renders equalizer preset buttons inside AudioNowPlayingModal', () => {
    const mockTrack: AudioTrackState = {
      id: 'trk-1',
      streamUrl: 'https://example.com/radio.mp3',
      name: 'BBC Radio 6 Music',
      provider: 'BBC',
      accentHue: 200,
    }

    const html = renderToStaticMarkup(
      <AudioNowPlayingModal
        isOpen={true}
        onClose={() => {}}
        track={mockTrack}
        isPlaying={true}
        volume={0.8}
        onTogglePlay={() => {}}
        onVolumeChange={() => {}}
        eqPreset="Spoken Word"
      />,
    )

    expect(html).toContain('anp-eq-container')
    expect(html).toContain('Spoken Word')
    expect(html).toContain('Treble Boost')
    expect(html).toContain('Bass Boost')
    expect(html).toContain('is-active')
  })
})
