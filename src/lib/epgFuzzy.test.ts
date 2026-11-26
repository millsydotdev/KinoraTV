// epgFuzzy.test.ts - Test suite for EPG channel fuzzy matching and title normalization.
// Strictly adheres to typography standards: zero em-dashes across all code and comments.

import { describe, expect, it } from 'vitest'
import {
  cleanChannelForMatching,
  levenshteinDistance,
  computeMatchScore,
  rankGuideChannels,
} from './epgFuzzy'

describe('cleanChannelForMatching', () => {
  it('strips regional country prefixes and quality suffixes', () => {
    expect(cleanChannelForMatching('UK: BBC One HD')).toBe('bbc one')
    expect(cleanChannelForMatching('[US] HBO 1080p')).toBe('hbo')
    expect(cleanChannelForMatching('CA: TSN 1 4K UHD')).toBe('tsn 1')
    expect(cleanChannelForMatching('DE | ZDF HD 50fps')).toBe('zdf')
  })

  it('removes timeshift markers like +1 or plus 1', () => {
    expect(cleanChannelForMatching('Film4 +1 HD')).toBe('film4')
    expect(cleanChannelForMatching('ITV2 plus 1')).toBe('itv2')
  })

  it('handles punctuation and collapses whitespace', () => {
    expect(cleanChannelForMatching('Eurosport-1.HD')).toBe('eurosport 1')
  })
})

describe('levenshteinDistance', () => {
  it('returns zero for identical strings', () => {
    expect(levenshteinDistance('bbc one', 'bbc one')).toBe(0)
  })

  it('computes correct edit distance for substitutions and insertions', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3)
    expect(levenshteinDistance('bbc', 'bb')).toBe(1)
  })
})

describe('computeMatchScore', () => {
  it('scores exact normalized names at 1.0', () => {
    const score = computeMatchScore('UK: BBC One HD', 'BBC One', 'bbcone.uk')
    expect(score).toBe(1.0)
  })

  it('scores id match cleanly', () => {
    const score = computeMatchScore('Sky Sports News', 'Sports News', 'skysportsnews.uk')
    expect(score).toBeGreaterThan(0.7)
  })

  it('gives low or zero score to completely unrelated channels', () => {
    const score = computeMatchScore('BBC One', 'Cartoon Network', 'cn.us')
    expect(score).toBe(0)
  })
})

describe('rankGuideChannels', () => {
  const guideChannels = [
    { id: 'bbcone.uk', name: 'BBC One' },
    { id: 'bbctwo.uk', name: 'BBC Two' },
    { id: 'bbcfour.uk', name: 'BBC Four' },
    { id: 'skynews.uk', name: 'Sky News' },
    { id: 'itv1.uk', name: 'ITV1' },
  ]

  it('ranks BBC One at the top when searching for UK: BBC One HD', () => {
    const results = rankGuideChannels('UK: BBC One HD', guideChannels)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]?.id).toBe('bbcone.uk')
    expect(results[0]?.score).toBe(1.0)
  })

  it('returns empty array when query is blank or no candidates match', () => {
    expect(rankGuideChannels('', guideChannels)).toEqual([])
    expect(rankGuideChannels('UnobtainableChannelXYZ', guideChannels)).toEqual([])
  })
})
