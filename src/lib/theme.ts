// Accent maths for the theme system: CSS can mix colours but cannot check contrast, so the
// readable variants are computed here and handed to CSS as custom properties.

export const ACCENTS = {
  red: '#e50d24',
  amber: '#e8a33a',
  blue: '#2f6fd6',
  violet: '#7c4ddb',
  teal: '#0b7d74',
} as const
export type AccentName = keyof typeof ACCENTS

/**
 * Worst-case surface that accent text sits on per theme (--surface-2 in global.css): lighter than the
 * page in the dark themes, darker than white cards in light. Keep in sync with the CSS tokens.
 */
export const THEME_BG = { dark: '#12151A', dim: '#232730', light: '#eef0f4' } as const
export type ThemeName = keyof typeof THEME_BG

export function safeHex(value: string): string | null {
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const toHex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`

function luminance(hex: string) {
  const [r = 0, g = 0, b = 0] = rgb(hex).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

const mix = (a: string, b: string, t: number) => toHex(rgb(a).map((v, i) => v + ((rgb(b)[i] ?? 0) - v) * t))

/**
 * accent: the chosen colour, used for fills.
 * ink: label colour on accent fills (white or near-black, whichever reads better).
 * text: accent shifted toward white (dark themes) or black (light) until it reaches 4.5:1 on the page.
 */
export function accentTokens(accent: string, theme: ThemeName) {
  const bg = THEME_BG[theme]
  const ink = contrast('#ffffff', accent) >= contrast('#111318', accent) ? '#ffffff' : '#111318'
  const toward = theme === 'light' ? '#000000' : '#ffffff'
  let text = accent
  for (let t = 0.05; contrast(text, bg) < 4.5 && t <= 1; t += 0.05) text = mix(accent, toward, t)
  return { accent, ink, text }
}

export interface ThemePreset {
  id: string
  name: string
  description: string
  theme: ThemeName
  accent: AccentName | 'custom'
  accentHex: string
  secondaryAccentHex: string
  bgHex: string
  surfaceHex: string
  navHex: string
  glowIntensity: number
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'kinora-default',
    name: 'Kinora Signature',
    description: 'The master reference design: cinematic black, dark charcoal surfaces and luminous crimson accent.',
    theme: 'dark',
    accent: 'red',
    accentHex: '#e50d24',
    secondaryAccentHex: '#FF253B',
    bgHex: '#08090B',
    surfaceHex: '#0D0F12',
    navHex: '#08090B',
    glowIntensity: 1.0,
  },
  {
    id: 'cyber-crimson',
    name: 'Cyber Crimson',
    description: 'High-contrast neo-Tokyo styling with deep void black and laser-sharp crimson.',
    theme: 'dark',
    accent: 'custom',
    accentHex: '#ff003c',
    secondaryAccentHex: '#ff3366',
    bgHex: '#040507',
    surfaceHex: '#12141a',
    navHex: '#0a0c10',
    glowIntensity: 1.2,
  },
  {
    id: 'midnight-slate',
    name: 'Midnight Slate',
    description: 'Refined deep navy and cobalt blue palette designed for late-night viewing.',
    theme: 'dark',
    accent: 'blue',
    accentHex: '#2f6fd6',
    secondaryAccentHex: '#60a5fa',
    bgHex: '#0a0d14',
    surfaceHex: '#131a29',
    navHex: '#0e131f',
    glowIntensity: 0.9,
  },
  {
    id: 'amber-cinema',
    name: 'Amber Cinema',
    description: 'Warm 35mm film projection tones with rich amber accents and dark espresso surfaces.',
    theme: 'dark',
    accent: 'amber',
    accentHex: '#e8a33a',
    secondaryAccentHex: '#fbbf24',
    bgHex: '#0d0b09',
    surfaceHex: '#1a1612',
    navHex: '#14100d',
    glowIntensity: 0.85,
  },
  {
    id: 'emerald-noir',
    name: 'Emerald Noir',
    description: 'Luminescent jade and emerald green over obsidian charcoal.',
    theme: 'dark',
    accent: 'teal',
    accentHex: '#0b7d74',
    secondaryAccentHex: '#34d399',
    bgHex: '#070d0b',
    surfaceHex: '#101a16',
    navHex: '#0b1411',
    glowIntensity: 0.85,
  },
  {
    id: 'violet-night',
    name: 'Violet Night',
    description: 'Atmospheric neon violet and deep amethyst for an immersive digital look.',
    theme: 'dark',
    accent: 'violet',
    accentHex: '#7c4ddb',
    secondaryAccentHex: '#a78bfa',
    bgHex: '#0c0a14',
    surfaceHex: '#181427',
    navHex: '#120f1f',
    glowIntensity: 0.95,
  },
]

export function applyThemeTokensToElement(
  el: HTMLElement,
  theme: ThemeName,
  accent: AccentName | 'custom',
  customAccent: string,
) {
  const hex = accent === 'custom' ? customAccent : ACCENTS[accent]
  const t = accentTokens(hex, theme)
  el.style.setProperty('--accent', t.accent)
  el.style.setProperty('--accent-ink', t.ink)
  el.style.setProperty('--accent-text', t.text)
  el.style.setProperty('--accent-primary', t.accent)
  el.style.setProperty('--accent-hover', `color-mix(in oklab, ${t.accent} 86%, ${theme === 'light' ? '#000' : '#fff'})`)
  el.style.setProperty('--accent-soft', `color-mix(in oklab, ${t.accent} 16%, transparent)`)
  el.style.setProperty('--accent-deep', `color-mix(in oklab, ${t.accent} 40%, ${THEME_BG[theme]})`)
  el.style.setProperty('--accent-glow', `0 0 16px color-mix(in oklab, ${t.accent} 65%, transparent)`)
  el.style.setProperty('--focus', t.text)
  el.style.setProperty('--live', t.text)
  el.style.setProperty('--progress-fill', t.accent)
  el.style.setProperty('--nav-selected-bg', `linear-gradient(90deg, ${t.accent} 0%, color-mix(in oklab, ${t.accent} 80%, black) 100%)`)
}
