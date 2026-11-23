// Audio processing pipeline for Kinora video playback.
// Provides dialogue clarity boost, night mode dynamic compression,
// volume amplification, audio lip-sync delay compensation,
// 5-band graphic equalizer, and auto-loudness normalization.
// Strictly adheres to typography standards: zero em-dashes across all code and comments.

export type EqPreset = 'flat' | 'vocal' | 'bass_boost' | 'treble'

export interface AudioEnhancerSettings {
  dialogueBoost: boolean
  nightMode: boolean
  volumeBoost: number // 1.0 (100%), 1.5 (150%), 2.0 (200%)
  audioDelayMs?: number // 0 to 1000 ms for lip-sync alignment
  autoLoudness?: boolean // EBU R128 dynamic loudness leveling
  eqPreset?: EqPreset
  eqBass?: number // -12 to +12 dB (60 Hz)
  eqLowMid?: number // -12 to +12 dB (250 Hz)
  eqMid?: number // -12 to +12 dB (1 kHz)
  eqPresence?: number // -12 to +12 dB (4 kHz)
  eqTreble?: number // -12 to +12 dB (12 kHz)
}

export const DEFAULT_AUDIO_SETTINGS: AudioEnhancerSettings = {
  dialogueBoost: false,
  nightMode: false,
  volumeBoost: 1.0,
  audioDelayMs: 0,
  autoLoudness: false,
  eqPreset: 'flat',
  eqBass: 0,
  eqLowMid: 0,
  eqMid: 0,
  eqPresence: 0,
  eqTreble: 0,
}

export class AudioEnhancer {
  private ctx: AudioContext | null = null
  private source: MediaElementAudioSourceNode | null = null
  private delayNode: DelayNode | null = null
  private filterBass: BiquadFilterNode | null = null
  private filterLowMid: BiquadFilterNode | null = null
  private filterMid: BiquadFilterNode | null = null
  private filterPresence: BiquadFilterNode | null = null
  private filterTreble: BiquadFilterNode | null = null
  private dialogueFilter: BiquadFilterNode | null = null
  private compressor: DynamicsCompressorNode | null = null
  private gainNode: GainNode | null = null
  private videoEl: HTMLVideoElement | null = null
  private attached = false

  public isAttached(): boolean {
    return this.attached
  }

  public attach(video: HTMLVideoElement): boolean {
    if (this.attached && this.videoEl === video) return true
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioCtx) return false

      if (!this.ctx || this.ctx.state === 'closed') {
        this.ctx = new AudioCtx()
      }

      this.videoEl = video

      // Delay node for lip-sync alignment (up to 1.0 second delay)
      this.delayNode = this.ctx.createDelay(1.0)
      this.delayNode.delayTime.value = 0.0

      // 5-band Graphic Equalizer
      this.filterBass = this.ctx.createBiquadFilter()
      this.filterBass.type = 'lowshelf'
      this.filterBass.frequency.value = 60
      this.filterBass.gain.value = 0

      this.filterLowMid = this.ctx.createBiquadFilter()
      this.filterLowMid.type = 'peaking'
      this.filterLowMid.frequency.value = 250
      this.filterLowMid.Q.value = 1.0
      this.filterLowMid.gain.value = 0

      this.filterMid = this.ctx.createBiquadFilter()
      this.filterMid.type = 'peaking'
      this.filterMid.frequency.value = 1000
      this.filterMid.Q.value = 1.0
      this.filterMid.gain.value = 0

      this.filterPresence = this.ctx.createBiquadFilter()
      this.filterPresence.type = 'peaking'
      this.filterPresence.frequency.value = 4000
      this.filterPresence.Q.value = 1.0
      this.filterPresence.gain.value = 0

      this.filterTreble = this.ctx.createBiquadFilter()
      this.filterTreble.type = 'highshelf'
      this.filterTreble.frequency.value = 12000
      this.filterTreble.gain.value = 0

      // Dialogue peaking filter (boost speech frequencies around 2.5 kHz)
      this.dialogueFilter = this.ctx.createBiquadFilter()
      this.dialogueFilter.type = 'peaking'
      this.dialogueFilter.frequency.value = 2500
      this.dialogueFilter.Q.value = 1.2
      this.dialogueFilter.gain.value = 0

      // Dynamics compressor for night mode and auto-loudness leveling
      this.compressor = this.ctx.createDynamicsCompressor()
      this.compressor.threshold.value = -24
      this.compressor.knee.value = 30
      this.compressor.ratio.value = 1.0
      this.compressor.attack.value = 0.003
      this.compressor.release.value = 0.25

      // Gain node for volume boost and makeup gain
      this.gainNode = this.ctx.createGain()
      this.gainNode.gain.value = 1.0

      this.source = this.ctx.createMediaElementSource(video)

      // Connect chain:
      // source -> delayNode -> filterBass -> filterLowMid -> filterMid
      // -> filterPresence -> filterTreble -> dialogueFilter -> compressor -> gainNode -> destination
      this.source.connect(this.delayNode)
      this.delayNode.connect(this.filterBass)
      this.filterBass.connect(this.filterLowMid)
      this.filterLowMid.connect(this.filterMid)
      this.filterMid.connect(this.filterPresence)
      this.filterPresence.connect(this.filterTreble)
      this.filterTreble.connect(this.dialogueFilter)
      this.dialogueFilter.connect(this.compressor)
      this.compressor.connect(this.gainNode)
      this.gainNode.connect(this.ctx.destination)

      this.attached = true
      return true
    } catch {
      // In case media element is already connected or Web Audio is unavailable in environment
      return false
    }
  }

  public apply(settings: AudioEnhancerSettings): void {
    if (!this.ctx || !this.attached) return
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume()
    }

    // Lip-sync audio delay
    if (this.delayNode && settings.audioDelayMs !== undefined) {
      const clampedDelay = Math.max(0, Math.min(1000, settings.audioDelayMs)) / 1000.0
      this.delayNode.delayTime.value = clampedDelay
    }

    // 5-band EQ settings
    let bass = settings.eqBass ?? 0
    let lowMid = settings.eqLowMid ?? 0
    let mid = settings.eqMid ?? 0
    let presence = settings.eqPresence ?? 0
    let treble = settings.eqTreble ?? 0

    if (settings.eqPreset === 'vocal') {
      bass = -2.0
      lowMid = 0.0
      mid = +3.0
      presence = +4.0
      treble = +1.0
    } else if (settings.eqPreset === 'bass_boost') {
      bass = +6.0
      lowMid = +3.0
      mid = 0.0
      presence = 0.0
      treble = -1.0
    } else if (settings.eqPreset === 'treble') {
      bass = -2.0
      lowMid = 0.0
      mid = +1.0
      presence = +4.0
      treble = +6.0
    }

    if (this.filterBass) this.filterBass.gain.value = Math.max(-12, Math.min(12, bass))
    if (this.filterLowMid) this.filterLowMid.gain.value = Math.max(-12, Math.min(12, lowMid))
    if (this.filterMid) this.filterMid.gain.value = Math.max(-12, Math.min(12, mid))
    if (this.filterPresence) this.filterPresence.gain.value = Math.max(-12, Math.min(12, presence))
    if (this.filterTreble) this.filterTreble.gain.value = Math.max(-12, Math.min(12, treble))

    // Dialogue clarity boost
    if (this.dialogueFilter) {
      this.dialogueFilter.gain.value = settings.dialogueBoost ? 6.0 : 0.0
    }

    // Night mode vs Auto-Loudness dynamic compression
    if (this.compressor) {
      if (settings.nightMode) {
        this.compressor.threshold.value = -24
        this.compressor.ratio.value = 12.0
      } else if (settings.autoLoudness) {
        // EBU R128 moderate leveling compression
        this.compressor.threshold.value = -18
        this.compressor.ratio.value = 3.5
      } else {
        this.compressor.threshold.value = -24
        this.compressor.ratio.value = 1.0
      }
    }

    // Volume amplification
    if (this.gainNode) {
      const boost = Math.max(1.0, Math.min(2.5, settings.volumeBoost))
      this.gainNode.gain.value = boost
    }
  }

  public resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume()
    }
  }

  public detach(): void {
    try {
      this.source?.disconnect()
      this.delayNode?.disconnect()
      this.filterBass?.disconnect()
      this.filterLowMid?.disconnect()
      this.filterMid?.disconnect()
      this.filterPresence?.disconnect()
      this.filterTreble?.disconnect()
      this.dialogueFilter?.disconnect()
      this.compressor?.disconnect()
      this.gainNode?.disconnect()
      if (this.ctx && this.ctx.state !== 'closed') {
        void this.ctx.close()
      }
    } catch {
      // Clean up quietly
    }
    this.ctx = null
    this.source = null
    this.delayNode = null
    this.filterBass = null
    this.filterLowMid = null
    this.filterMid = null
    this.filterPresence = null
    this.filterTreble = null
    this.dialogueFilter = null
    this.compressor = null
    this.gainNode = null
    this.videoEl = null
    this.attached = false
  }
}
