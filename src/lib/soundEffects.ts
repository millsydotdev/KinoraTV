/**
 * Synthesized Web Audio feedback tones for navigation and channel switching.
 * Zero external audio assets: works completely offline and avoids media element muting.
 */

let audioContext: AudioContext | null = null
let soundEnabled = true

function getAudioContext(): AudioContext | null {
  const AudioCtx =
    typeof window !== 'undefined'
      ? window.AudioContext
      : (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext
  if (typeof AudioCtx !== 'function') {
    return null
  }
  if (!audioContext) {
    audioContext = new AudioCtx()
  }
  return audioContext
}

export function resetAudioContextForTesting(): void {
  audioContext = null
}

export function setSoundFeedbackEnabled(enabled: boolean): void {
  soundEnabled = enabled
}

export function isSoundFeedbackEnabled(): boolean {
  return soundEnabled
}

/**
 * Resumes audio context if suspended by browser autoplay policy.
 */
function ensureRunningContext(context: AudioContext): void {
  if (context.state === 'suspended') {
    void context.resume().catch(() => undefined)
  }
}

/**
 * Rising confirmation chime on channel switch (660 Hz to 990 Hz over 70ms).
 */
export function playChannelSwitchSound(): void {
  if (!soundEnabled) return
  const context = getAudioContext()
  if (!context) return

  ensureRunningContext(context)

  const now = context.currentTime
  const osc = context.createOscillator()
  const gain = context.createGain()

  osc.type = 'sine'
  osc.frequency.setValueAtTime(660, now)
  osc.frequency.exponentialRampToValueAtTime(990, now + 0.07)

  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.15, now + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11)

  osc.connect(gain)
  gain.connect(context.destination)

  osc.start(now)
  osc.stop(now + 0.12)
  osc.addEventListener('ended', () => {
    osc.disconnect()
    gain.disconnect()
  })
}

/**
 * Soft tactile micro-click for TV remote D-pad navigation.
 */
export function playNavTickSound(): void {
  if (!soundEnabled) return
  const context = getAudioContext()
  if (!context) return

  ensureRunningContext(context)

  const now = context.currentTime
  const osc = context.createOscillator()
  const gain = context.createGain()

  osc.type = 'triangle'
  osc.frequency.setValueAtTime(1200, now)
  osc.frequency.exponentialRampToValueAtTime(800, now + 0.012)

  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.linearRampToValueAtTime(0.05, now + 0.003)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.018)

  osc.connect(gain)
  gain.connect(context.destination)

  osc.start(now)
  osc.stop(now + 0.02)
  osc.addEventListener('ended', () => {
    osc.disconnect()
    gain.disconnect()
  })
}

/**
 * Cheerful two-tone chime when starring or favoriting an item (C5 -> E5).
 */
export function playFavoriteSound(): void {
  if (!soundEnabled) return
  const context = getAudioContext()
  if (!context) return

  ensureRunningContext(context)

  const now = context.currentTime

  // First tone: 523.25 Hz (C5)
  const osc1 = context.createOscillator()
  const gain1 = context.createGain()
  osc1.type = 'sine'
  osc1.frequency.setValueAtTime(523.25, now)
  gain1.gain.setValueAtTime(0.0001, now)
  gain1.gain.exponentialRampToValueAtTime(0.12, now + 0.01)
  gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.08)
  osc1.connect(gain1)
  gain1.connect(context.destination)
  osc1.start(now)
  osc1.stop(now + 0.09)
  osc1.addEventListener('ended', () => {
    osc1.disconnect()
    gain1.disconnect()
  })

  // Second tone: 659.25 Hz (E5)
  const osc2 = context.createOscillator()
  const gain2 = context.createGain()
  osc2.type = 'sine'
  osc2.frequency.setValueAtTime(659.25, now + 0.07)
  gain2.gain.setValueAtTime(0.0001, now + 0.07)
  gain2.gain.exponentialRampToValueAtTime(0.14, now + 0.08)
  gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.16)
  osc2.connect(gain2)
  gain2.connect(context.destination)
  osc2.start(now + 0.07)
  osc2.stop(now + 0.17)
  osc2.addEventListener('ended', () => {
    osc2.disconnect()
    gain2.disconnect()
  })
}
