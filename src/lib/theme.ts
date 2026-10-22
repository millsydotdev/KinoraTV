// Accent maths for the theme system: CSS can mix colours but cannot check contrast, so the
// readable variants are computed here and handed to CSS as custom properties.

export const ACCENTS = {
  red: '#d6202e',
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
export const THEME_BG = { dark: '#1d222d', dim: '#2d3440', light: '#eef0f4' } as const
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
