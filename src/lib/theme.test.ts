import { describe, expect, it } from 'vitest'
import { ACCENTS, THEME_BG, accentTokens, contrast, safeHex } from './theme'

describe('accent tokens', () => {
  for (const theme of Object.keys(THEME_BG) as (keyof typeof THEME_BG)[]) {
    for (const [name, hex] of Object.entries(ACCENTS)) {
      it(`${name} on ${theme} keeps text and button labels readable`, () => {
        const t = accentTokens(hex, theme)
        expect(contrast(t.ink, t.accent)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(t.text, THEME_BG[theme])).toBeGreaterThanOrEqual(4.5)
      })
    }
  }

  it('rescues an unreadable custom accent', () => {
    const t = accentTokens('#151515', 'dark')
    expect(contrast(t.text, THEME_BG.dark)).toBeGreaterThanOrEqual(4.5)
    const l = accentTokens('#fafafa', 'light')
    expect(contrast(l.text, THEME_BG.light)).toBeGreaterThanOrEqual(4.5)
  })

  it('rejects anything that is not a 6-digit hex colour', () => {
    expect(safeHex('#12ab9F')).toBe('#12ab9f')
    expect(safeHex('red')).toBeNull()
    expect(safeHex('#fff')).toBeNull()
    expect(safeHex('#12345g')).toBeNull()
  })
})
