import { describe, expect, it } from 'vitest'
import type { Channel } from '../data/types'
import type { GuideMatch } from './guides'
import { canonicalTvgId, combineChannels } from './channel-matching'
import type { PlaylistSource } from './playlists'

const channel = (sourceId: string, id: string, tvgId: string | null, name = id, logoUrl: string | null = null): Channel => ({
  id: `${sourceId}~${id}`,
  number: 1,
  name,
  group: 'News',
  categories: ['News'],
  logoUrl,
  mark: { text: 'C', tone: 'blue' },
  streamUrl: `https://stream.example/${sourceId}/${id}.m3u8`,
  hd: false,
  sourceId,
  tvgId,
})

const sources = [
  { id: 'pl-uk', name: 'UK' },
  { id: 'pl-world', name: 'Worldwide' },
] as PlaylistSource[]

describe('automatic channel matching', () => {
  it('combines trimmed, case-insensitive tvg-ids and keeps every source in preferred order', () => {
    const worldwide = channel('pl-world', 'one', ' BBC.One.UK ', 'BBC One HD')
    const uk = channel('pl-uk', 'one', 'bbc.one.uk', 'BBC One')

    const [combined] = combineChannels([worldwide, uk], sources, new Map())

    expect(combined?.name).toBe('BBC One')
    expect(combined?.memberIds).toEqual([uk.id, worldwide.id])
    expect(combined?.sourceIds).toEqual(['pl-uk', 'pl-world'])
    expect(combined?.streamOptions?.map((option) => option.sourceName)).toEqual(['UK', 'Worldwide'])
    expect(combined?.streamOptions?.map((option) => option.streamUrl)).toEqual([uk.streamUrl, worldwide.streamUrl])
  })

  it('combines channels resolved to the same XMLTV identity even when their playlist ids differ', () => {
    const uk = channel('pl-uk', 'one', 'bbc-one', 'BBC One')
    const worldwide = channel('pl-world', 'bbc', 'bbc1', 'BBC 1')
    const matches = new Map<string, GuideMatch>([
      [uk.id, { state: 'matched', guide: 'gd-main', channel: 'bbc1.uk', manual: false }],
      [worldwide.id, { state: 'matched', guide: 'gd-main', channel: 'bbc1.uk', manual: false }],
    ])

    expect(combineChannels([uk, worldwide], sources, matches)).toHaveLength(1)
  })

  it('does not match by display name or merge conflicting resolved XMLTV identities', () => {
    const uk = channel('pl-uk', 'one', 'bbc1', 'BBC One')
    const worldwide = channel('pl-world', 'one', 'bbc1', 'BBC One')
    const matches = new Map<string, GuideMatch>([
      [uk.id, { state: 'matched', guide: 'gd-uk', channel: 'bbc1.uk', manual: false }],
      [worldwide.id, { state: 'matched', guide: 'gd-world', channel: 'bbc1.world', manual: false }],
    ])

    expect(combineChannels([uk, worldwide], sources, matches)).toHaveLength(2)
    expect(combineChannels([channel('pl-uk', 'a', null, 'Same'), channel('pl-world', 'b', null, 'Same')], sources, new Map())).toHaveLength(2)
  })

  it('canonicalises quality feeds and country suffixes deterministically without collapsing regional feeds', () => {
    expect(canonicalTvgId('BBCOne.uk@HD')).toBe('bbcone.uk')
    expect(canonicalTvgId('bbc.one.uk')).toBe('bbcone.uk')
    expect(canonicalTvgId('QVCUK.uk')).toBe('qvc.uk')
    expect(canonicalTvgId('QVC.uk@SD')).toBe('qvc.uk')
    expect(canonicalTvgId('BBCOne.uk@Scotland')).toBe('bbcone.uk@scotland')
    expect(canonicalTvgId('BBCOne.uk@Wales')).toBe('bbcone.uk@wales')

    const scotland = channel('pl-world', 'scot', 'BBCOne.uk@Scotland', 'BBC One Scotland')
    const wales = channel('pl-world', 'wales', 'BBCOne.uk@Wales', 'BBC One Wales')
    const matches = new Map<string, GuideMatch>([
      [scotland.id, { state: 'matched', guide: 'gd-uk', channel: 'BBCOne.uk', manual: false }],
      [wales.id, { state: 'matched', guide: 'gd-uk', channel: 'BBCOne.uk', manual: false }],
    ])
    expect(combineChannels([scotland, wales], sources, new Map())).toHaveLength(2)
    expect(combineChannels([scotland, wales], sources, matches)).toHaveLength(2)
  })

  it('keeps unique channel count stable before and after guide resolution and prefers non-imgur logos', () => {
    const ukQvc = channel('pl-uk', 'qvc', 'QVCUK.uk', 'QVC UK', 'https://i.imgur.com/blocked.png')
    const worldQvc = channel('pl-world', 'qvc', 'QVC.uk@SD', 'QVC', 'https://upload.wikimedia.org/qvc.png')
    const beforeGuides = combineChannels([ukQvc, worldQvc], sources, new Map())
    const afterGuides = combineChannels(
      [ukQvc, worldQvc],
      sources,
      new Map([[worldQvc.id, { state: 'matched', guide: 'gd-uk', channel: 'QVC.uk', manual: false }]]),
    )
    expect(beforeGuides).toHaveLength(1)
    expect(afterGuides).toHaveLength(1)
    expect(afterGuides[0]?.logoUrl).toBe('https://upload.wikimedia.org/qvc.png')
  })

  it('keeps one channel when its members resolve to the same channel through different guides', () => {
    const freeview = channel('pl-uk', 'one', 'BBCOne.uk', 'BBC One')
    const worldwide = channel('pl-world', 'one', 'BBCOne.uk@HD', 'BBC One HD')
    const noGuides = combineChannels([freeview, worldwide], sources, new Map())
    const twoGuides = combineChannels([freeview, worldwide], sources, new Map<string, GuideMatch>([
      [freeview.id, { state: 'matched', guide: 'gd-freeview', channel: 'BBCOne.uk', manual: false }],
      [worldwide.id, { state: 'matched', guide: 'gd-epg-uk', channel: 'BBC.One.HD.uk', manual: false }],
    ]))
    expect(noGuides).toHaveLength(1)
    expect(twoGuides).toHaveLength(1)
  })

  it('generates rich StreamVariants with meaningful server names and metadata', () => {
    const s1 = channel('pl-uk', 'bbc1', 'BBCOne.uk', 'BBC One [UK] HD')
    const s2 = channel('pl-world', 'bbc1-alt', 'BBCOne.uk@HD', 'BBC One FHD')
    const [combined] = combineChannels([s1, s2], sources, new Map())

    expect(combined).toBeDefined()
    expect(combined?.streamOptions).toHaveLength(2)
    const var1 = combined?.streamOptions?.[0]
    const var2 = combined?.streamOptions?.[1]
    expect(var1).toBeDefined()
    expect(var2).toBeDefined()
    expect(var1?.name).toContain('Server 1')
    expect(var1?.name).toContain('UK')
    expect(var1?.name).toContain('United Kingdom')
    expect(var1?.quality).toBe('HD')
    expect(var1?.availability).toBe('untested')

    expect(var2?.name).toContain('Server 2')
    expect(var2?.name).toContain('Worldwide')
    expect(var2?.quality).toBe('FHD')
  })

  it('combines channels with strong matching normalised title and country without merging unrelated generic names', () => {
    const sky1 = channel('pl-uk', 'sky1', null, 'Sky News [UK]')
    const sky2 = channel('pl-world', 'sky2', null, 'Sky News HD [UK]')
    const [combinedSky] = combineChannels([sky1, sky2], sources, new Map())

    expect(combinedSky?.name).toBe('Sky News')
    expect(combinedSky?.streamOptions).toHaveLength(2)

    // Unrelated channels with generic name 'Same' without country or tvgId remain separate
    const generic1 = channel('pl-uk', 'g1', null, 'Same')
    const generic2 = channel('pl-world', 'g2', null, 'Same')
    expect(combineChannels([generic1, generic2], sources, new Map())).toHaveLength(2)
  })
})
