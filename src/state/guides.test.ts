import { describe, expect, it } from 'vitest'
import type { Channel } from '../data/types'
import { IngestError, type GuideAnswer, type GuideSummary } from '../lib/native'
import {
  checkGuideUrl, createGuide, guideQueries, guideStatusText, guideStatusTone, noListingsText, programmesFor, readGuideForPreview, resolveMatches,
  restoreGuide, runGuideImport, toSavedGuide, type GuideSource, type Mapping,
} from './guides'
import { DESKTOP_ONLY } from './playlists'

const NOW = 1_800_000_000_000
const HOUR = 3_600_000
const summary = (over: Partial<GuideSummary> = {}): GuideSummary => ({
  channels: 2, programmes: 10, first: NOW - HOUR, last: NOW + 48 * HOUR, fetchedAt: NOW, skipped: 0, duplicates: 0, warnings: [], ...over,
})
const guide = (id: string, playlists: string[], over: Partial<GuideSource> = {}): GuideSource => ({
  ...createGuide(id, { name: id, origin: 'url', url: `https://guides.example/${id}.xml?token=GUIDETOKEN`, label: 'https://guides.example/…', playlists }, summary(), NOW),
  ...over,
})
const channel = (sourceId: string | null, key: string, tvgId: string | null, name = key): Channel => ({
  id: sourceId ? `${sourceId}~${key}` : key, number: 1, name, group: 'News', categories: ['News'], logoUrl: null, mark: { text: 'X', tone: '#000' },
  streamUrl: null, hd: false, sourceId, tvgId,
})
const answer = (g: string, matches: [string, string | null][], programmes: GuideAnswer['programmes'] = [], loaded = true): GuideAnswer =>
  ({ guide: g, loaded, matches: matches.map(([id, c]) => ({ id, channel: c })), programmes })
const prog = (channel: string, start: number, title: string): GuideAnswer['programmes'][number] =>
  ({ channel, start, stop: start + HOUR, stopEstimated: false, title, subtitle: null, desc: null, category: null, episode: null })

function harness(initial: GuideSource[]) {
  let list = initial
  return { update: (fn: (l: GuideSource[]) => GuideSource[]) => { list = fn(list) }, get: () => list }
}

describe('guide addresses', () => {
  it('accepts http(s) and refuses sign-in details, other schemes and repeats', () => {
    expect(checkGuideUrl(' https://guides.example/epg.xml.gz?token=abc ', [])).toEqual({ url: 'https://guides.example/epg.xml.gz?token=abc' })
    expect(checkGuideUrl('', [])).toMatchObject({ error: 'Paste the guide address.' })
    expect(checkGuideUrl('https://u:p@guides.example/epg.xml', [])).toMatchObject({ error: expect.stringContaining('username and password') })
    expect(checkGuideUrl('file:///home/me/epg.xml', [])).toMatchObject({ error: expect.stringContaining('http://') })
    expect(checkGuideUrl('not a url', [])).toMatchObject({ error: expect.stringContaining('http://') })
    expect(checkGuideUrl('https://guides.example/a.xml', ['https://guides.example/a.xml'])).toMatchObject({ error: expect.stringContaining('already') })
  })
})

describe('saving and restoring guides', () => {
  it('saves definitions only, with an address only for address guides', () => {
    const g = guide('gd-a', ['pl-1'])
    expect(toSavedGuide(g)).toEqual({ id: 'gd-a', name: 'gd-a', origin: 'url', url: g.url, label: g.label, addedAt: NOW, lastSuccess: NOW, playlists: ['pl-1'] })
    expect(toSavedGuide({ ...g, origin: 'file' }).url).toBeNull()
    expect(JSON.stringify(toSavedGuide(g))).not.toMatch(/programmes|summary|warnings/)
  })

  it('restores as saved, with no programme data until Rust reports its cache', () => {
    const r = restoreGuide(toSavedGuide(guide('gd-a', ['pl-1'])))
    expect(r).toMatchObject({ status: 'saved', summary: null, error: null, playlists: ['pl-1'] })
    expect(guideStatusText(r, NOW)).toBe('No programmes yet')
    expect(guideStatusText({ ...r, origin: 'file' }, NOW)).toBe('No programmes · choose the file again')
  })
})

describe('refreshing a guide', () => {
  it('a success replaces the summary and stamps the time', async () => {
    const h = harness([guide('gd-a', [], { status: 'saved', summary: summary({ programmes: 3 }), lastSuccess: 1 })])
    await runGuideImport(h.update, 'gd-a', 1, async () => summary({ programmes: 7 }), () => 99)
    expect(h.get()[0]).toMatchObject({ status: 'ready', summary: { programmes: 7 }, lastSuccess: 99, error: null })
    expect(guideStatusText(h.get()[0]!, NOW)).toBe('Guide · 7 programmes')
  })

  it('a failure keeps the last good programmes and says so', async () => {
    const h = harness([guide('gd-a', [], { status: 'saved', summary: summary({ programmes: 3 }) })])
    await runGuideImport(h.update, 'gd-a', 1, async () => { throw new IngestError('network', 'Could not connect to guides.example.') })
    const g = h.get()[0]!
    expect(g).toMatchObject({ status: 'failed', error: 'Could not connect to guides.example.', summary: { programmes: 3 } })
    expect(guideStatusText(g, NOW)).toBe('Refresh failed · 3 programmes kept')
    expect(guideStatusTone(g, NOW)).toBe('failing')
  })

  it('a raw error is never shown', async () => {
    const h = harness([guide('gd-a', [])])
    await runGuideImport(h.update, 'gd-a', 1, async () => { throw new Error('https://guides.example/epg.xml?token=GUIDETOKEN failed') })
    expect(h.get()[0]?.error).toBe('Kinora could not read that guide.')
  })

  it('an older refresh that finishes last is dropped', async () => {
    const h = harness([guide('gd-a', [])])
    let finishOld!: (s: GuideSummary) => void
    const older = runGuideImport(h.update, 'gd-a', 1, () => new Promise((r) => { finishOld = r }))
    await runGuideImport(h.update, 'gd-a', 2, async () => summary({ programmes: 2 }))
    finishOld(summary({ programmes: 1 }))
    await older
    expect(h.get()[0]?.summary?.programmes).toBe(2)
  })

  it('a removed guide stays removed', async () => {
    const h = harness([guide('gd-a', [])])
    let finish!: (s: GuideSummary) => void
    const pending = runGuideImport(h.update, 'gd-a', 1, () => new Promise((r) => { finish = r }))
    h.update((l) => l.filter((g) => g.id !== 'gd-a'))
    finish(summary())
    await pending
    expect(h.get()).toEqual([])
  })

  it('outside the desktop app says so', async () => {
    const h = harness([guide('gd-a', [])])
    await runGuideImport(h.update, 'gd-a', 1, async () => null)
    expect(h.get()[0]?.error).toBe(DESKTOP_ONLY)
  })
})

describe('guide status', () => {
  it('distinguishes updating, current, saved, empty and ended listings', () => {
    const g = guide('gd-a', [])
    expect(guideStatusText({ ...g, status: 'importing' }, NOW)).toBe('Updating guide…')
    expect(guideStatusText(g, NOW)).toBe('Guide · 10 programmes')
    expect(guideStatusText({ ...g, status: 'saved' }, NOW)).toBe('Saved · 10 programmes')
    expect(guideStatusTone({ ...g, status: 'saved' }, NOW)).toBe('pending')
    expect(guideStatusText({ ...g, summary: summary({ programmes: 0, first: null, last: null }) }, NOW)).toBe('No programmes listed')
    const ended = { ...g, summary: summary({ last: NOW - 1 }) }
    expect(guideStatusText(ended, NOW)).toBe('Listings have ended')
    expect(guideStatusTone(ended, NOW)).toBe('degraded')
    expect(guideStatusText({ ...g, status: 'failed', summary: null }, NOW)).toBe('Import failed')
  })
})

describe('matching playlist channels to guides', () => {
  const channels = [
    channel('pl-1', 'a', 'One.uk', 'One'),
    channel('pl-1', 'b', null, 'No Id'),
    channel('pl-1', 'c', 'missing.uk', 'Two'), // same name as a guide channel, but its id is not listed
    channel('pl-2', 'd', 'one.uk'),
    channel('pl-3', 'e', 'one.uk'),
    channel(null, 'demo', 'one.uk'),
  ]
  const guides = [guide('gd-first', ['pl-1', 'pl-2']), guide('gd-second', ['pl-1'])]

  it('asks each loaded guide only about its own playlists, and about hand-picked ids', () => {
    const mappings: Mapping[] = [{ channel: 'pl-1~b', guide: 'gd-second', xmltvId: 'Picked.uk' }]
    expect(guideQueries(channels, guides, mappings)).toEqual([
      { guide: 'gd-first', ids: ['One.uk', 'missing.uk', 'one.uk'] },
      { guide: 'gd-second', ids: ['One.uk', 'missing.uk', 'Picked.uk'] },
    ])
    expect(guideQueries(channels, [{ ...guides[0]!, summary: null }], [])).toEqual([])
  })

  it('takes a hand-picked match first, then the first guide that lists the id; never a name', () => {
    const mappings: Mapping[] = [{ channel: 'pl-1~b', guide: 'gd-second', xmltvId: 'Picked.uk' }]
    const answers = [
      answer('gd-first', [['One.uk', 'one.UK'], ['missing.uk', null], ['one.uk', 'one.UK']]),
      answer('gd-second', [['One.uk', 'One.uk'], ['missing.uk', null], ['Picked.uk', 'Picked.uk']]),
    ]
    const m = resolveMatches(channels, guides, mappings, answers)
    expect(m.get('pl-1~a')).toEqual({ state: 'matched', guide: 'gd-first', channel: 'one.UK', manual: false })
    expect(m.get('pl-1~b')).toEqual({ state: 'matched', guide: 'gd-second', channel: 'Picked.uk', manual: true })
    expect(m.get('pl-1~c')).toEqual({ state: 'unmatched' })
    expect(m.get('pl-2~d')).toMatchObject({ state: 'matched', guide: 'gd-first' })
    expect(m.get('pl-3~e')).toEqual({ state: 'no-guide' })
    expect(m.has('demo')).toBe(false)
  })

  it('reports channels without an id, lost hand matches, and guides not loaded yet', () => {
    const lost: Mapping[] = [{ channel: 'pl-1~a', guide: 'gd-first', xmltvId: 'Gone.uk' }]
    const answers = [answer('gd-first', [['Gone.uk', null]]), answer('gd-second', [])]
    const m = resolveMatches(channels, guides, lost, answers)
    expect(m.get('pl-1~a')).toEqual({ state: 'match-lost' })
    expect(m.get('pl-1~b')).toEqual({ state: 'no-id' })
    const none = resolveMatches(channels, guides, [], [])
    expect(none.get('pl-1~a')).toEqual({ state: 'no-data' })
    expect(resolveMatches(channels, guides, [], [answer('gd-first', [], [], false), answer('gd-second', [], [], false)]).get('pl-1~a')).toEqual({ state: 'no-data' })
  })

  it('turns answers into programmes for each matched channel, ids stable per channel and start', () => {
    const answers = [answer('gd-first', [['One.uk', 'one.UK']], [
      { ...prog('one.UK', NOW, 'News'), subtitle: 'Midday', desc: 'Headlines', category: 'News', episode: 'S1 E2', stopEstimated: true },
      prog('other', NOW, 'Not ours'),
    ])]
    const m = resolveMatches(channels.slice(0, 1), guides, [], answers)
    expect(programmesFor(m, answers).get('pl-1~a')).toEqual([{
      id: `pl-1~a@${NOW}`, channelId: 'pl-1~a', start: NOW, stop: NOW + HOUR, title: 'News', subtitle: 'Midday', desc: 'Headlines',
      category: 'News', episode: 'S1 E2', art: '', stopEstimated: true,
    }])
  })

  it('labels empty guide rows honestly', () => {
    expect(noListingsText({ state: 'matched', guide: 'g', channel: 'c', manual: false }, false)).toBe('No listings in this period')
    expect(noListingsText({ state: 'unmatched' }, false)).toContain('Not found in its guide')
    expect(noListingsText({ state: 'no-id' }, false)).toContain('No guide id')
    expect(noListingsText({ state: 'no-guide' }, false)).toBe('No guide for this playlist')
    expect(noListingsText({ state: 'matched', guide: 'g', channel: 'c', manual: false }, true)).toBe('Loading guide…')
  })
})

describe('reading a guide in Add Source', () => {
  it('returns the summary and match count, or a safe message', async () => {
    const counted = async () => ({ matched: 3, wanted: 4 })
    await expect(readGuideForPreview(async () => summary(), counted)).resolves.toEqual({ summary: summary(), matches: { matched: 3, wanted: 4 } })
    await expect(readGuideForPreview(async () => summary(), async () => { throw new Error('x') })).resolves.toMatchObject({ matches: null })
    await expect(readGuideForPreview(async () => null, counted)).resolves.toEqual({ error: DESKTOP_ONLY })
    await expect(readGuideForPreview(async () => summary({ channels: 0 }), counted)).resolves.toEqual({ error: 'The guide was read, but it lists no channels.' })
    await expect(readGuideForPreview(async () => { throw new IngestError('not-guide', 'The guide is not well-formed XML (near byte 12).') }, counted))
      .resolves.toEqual({ error: 'The guide is not well-formed XML (near byte 12).' })
  })
})
