import { describe, expect, it } from 'vitest'
import { cleanChannelTitle, isDividerChannel, parseChannelMetadata } from './cleanTitle'

describe('cleanTitle engine', () => {
  it('cleans IPTV provider prefixes and technical tags', () => {
    const meta = parseChannelMetadata('UK| BBC ONE HD (FHD) [1080p] ⁶⁰ᶠᵖˢ')
    expect(meta.cleanTitle).toBe('BBC One')
    expect(meta.country).toBe('UK')
    expect(meta.resolution).toBe('1080p')
    expect(meta.framerate).toBe('60fps')
    expect(meta.badges).toEqual([
      { label: 'UK', kind: 'country' },
      { label: '1080p', kind: 'quality' },
      { label: '60fps', kind: 'framerate' },
    ])
  })

  it('handles bracketed and parenthesized country prefixes', () => {
    const meta1 = parseChannelMetadata('[UK] ITV1 HD')
    expect(meta1.cleanTitle).toBe('ITV1')
    expect(meta1.country).toBe('UK')
    expect(meta1.resolution).toBe('HD')

    const meta2 = parseChannelMetadata('(US) CNN INTERNATIONAL (1080p)')
    expect(meta2.cleanTitle).toBe('CNN International')
    expect(meta2.country).toBe('US')
    expect(meta2.resolution).toBe('1080p')
  })

  it('parses backup and alternate stream markers', () => {
    const meta = parseChannelMetadata('CA: TSN 1 HD (BACKUP)')
    expect(meta.cleanTitle).toBe('TSN 1')
    expect(meta.country).toBe('CA')
    expect(meta.isBackup).toBe(true)
    expect(meta.badges).toContainEqual({ label: 'Backup', kind: 'badge' })
  })

  it('parses prefix resolutions and movie quality tags', () => {
    const meta = parseChannelMetadata('4K-A+ - DUNE: PART TWO (2024)')
    expect(meta.cleanTitle).toBe('Dune: Part Two (2024)')
    expect(meta.resolution).toBe('4K')
    expect(meta.badges).toContainEqual({ label: '4K', kind: 'quality' })
  })

  it('preserves genuine regional broadcast variants in parentheses', () => {
    const meta1 = parseChannelMetadata('BBC One (South)')
    expect(meta1.cleanTitle).toBe('BBC One (South)')
    expect(meta1.resolution).toBeUndefined()

    const meta2 = parseChannelMetadata('ITV (London) HD')
    expect(meta2.cleanTitle).toBe('ITV (London)')
    expect(meta2.resolution).toBe('HD')
  })

  it('preserves legitimate channel punctuation and casing', () => {
    expect(cleanChannelTitle('M*A*S*H TV')).toBe('M*A*S*H TV')
    expect(cleanChannelTitle('E! Entertainment HD')).toBe('E! Entertainment')
    expect(cleanChannelTitle('France 24')).toBe('France 24')
  })

  it('identifies playlist divider and dummy spacer rows', () => {
    expect(isDividerChannel('### UK SPORTS ###')).toBe(true)
    expect(isDividerChannel('=== MOVIES & CINEMA ===')).toBe(true)
    expect(isDividerChannel('--- KIDS ENTERTAINMENT ---')).toBe(true)
    expect(isDividerChannel('*** VIP SECTION ***')).toBe(true)
    expect(isDividerChannel('..:: VIP CINEMA ::..')).toBe(true)
    expect(isDividerChannel('----------------')).toBe(true)
    expect(isDividerChannel('NOTICE: READ RULES', '#')).toBe(true)

    // Non-dividers
    expect(isDividerChannel('BBC One')).toBe(false)
    expect(isDividerChannel('Sky Sports Main Event')).toBe(false)
    expect(isDividerChannel('Channel 4')).toBe(false)
  })

  it('safely handles empty or missing channel strings', () => {
    expect(cleanChannelTitle('')).toBe('Unnamed channel')
    expect(cleanChannelTitle('   ')).toBe('Unnamed channel')
  })
})
