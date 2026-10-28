import { describe, expect, it } from 'vitest'
import { channels as demoChannels } from '../data/channels'
import { resolve } from '../data/refs'
import { IngestError, type PlaylistChannel, type PlaylistReport } from '../lib/native'
import {
  DESKTOP_ONLY, UNCATEGORISED, activeChannels, addressLabel, channelGroups, checkPlaylistUrl, createSource, defaultName, fileLabel,
  filterChannels, readForPreview, removeSource, restoreSource, runImport, splitCategories, statusText, statusTone, toChannels, toSaved, unavailableReason, userMessage,
  type PlaylistSource,
} from './playlists'

const SECRET_URL = 'http://alice:pw1@provider.example:8080/live/alice/hunter2/1.ts?token=SECRET123'
const SECRETS = ['alice', 'pw1', 'hunter2', 'SECRET123', '/live', 'LOGOSIG']

const entry = (over: Partial<PlaylistChannel> = {}): PlaylistChannel => ({
  key: 'tvg:one.uk', tvgId: 'one.uk', name: 'One', group: 'News', logo: 'https://img.example/one.png?sig=LOGOSIG', language: null,
  country: null, chno: null, streamUrl: SECRET_URL, streamDisplay: 'http://provider.example:8080/…', ...over,
})
const report = (channels: PlaylistChannel[], over: Partial<PlaylistReport> = {}): PlaylistReport => ({
  channels, skipped: 0, duplicates: 0, warnings: [], host: 'playlists.example', ...over,
})
const urlSource = (id: string, r: PlaylistReport, now = 1_000) =>
  createSource(id, { name: id, origin: 'url', url: 'https://playlists.example/list.m3u?token=SECRET123', label: addressLabel('https://playlists.example/list.m3u?token=SECRET123') }, r, now)

/** A tiny state holder standing in for React's setState, for driving runImport. */
function holder(initial: PlaylistSource[]) {
  let state = initial
  return { update: (fn: (l: PlaylistSource[]) => PlaylistSource[]) => { state = fn(state) }, get: () => state }
}
function deferred<T>() {
  let settle!: { resolve: (v: T) => void; reject: (e: unknown) => void }
  const promise = new Promise<T>((resolve, reject) => { settle = { resolve, reject } })
  return { promise, ...settle }
}

describe('importing a playlist source', () => {
  it('adds a URL source with real counts, a redacted label and its channels', () => {
    const s = urlSource('pl-a', report([entry(), entry({ key: 'tvg:two', tvgId: 'two', name: 'Two', chno: 7 })], { skipped: 2, duplicates: 1, warnings: ['Line 4: entry has no stream address.'] }))
    expect([s.status, s.channels.length, s.skipped, s.duplicates, s.error]).toEqual(['parsed', 2, 2, 1, null])
    expect(s.label).toBe('https://playlists.example/…')
    expect(s.url).toContain('token=SECRET123') // kept in memory for Refresh only
    expect(statusText(s)).toBe('Parsed · 2 channels')
    expect(statusTone(s)).toBe('healthy')
    expect(s.channels.map((c) => [c.number, c.sourceId])).toEqual([[1, 'pl-a'], [7, 'pl-a']])
  })

  it('adds a local file source labelled by file name, with no address to refresh', () => {
    const s = createSource('pl-f', { name: defaultName('file', 'my lineup.m3u8'), origin: 'file', url: null, label: fileLabel('my lineup.m3u8') }, report([entry()]), 5)
    expect([s.name, s.label, s.url, s.channels.length]).toEqual(['my lineup', 'my lineup.m3u8', null, 1])
  })

  it('re-imports a file through the same import path', async () => {
    const h = holder([createSource('pl-f', { name: 'f', origin: 'file', url: null, label: 'f.m3u' }, report([entry()]), 5)])
    await runImport(h.update, 'pl-f', 1, async () => report([entry({ key: 'tvg:b', tvgId: 'b', name: 'B' }), entry({ key: 'tvg:c', tvgId: 'c', name: 'C' })]))
    expect(h.get()[0]?.channels.map((c) => c.name)).toEqual(['B', 'C'])
  })

  it('records unsupported or invalid playlists as failures with the message Rust wrote', async () => {
    const h = holder([urlSource('pl-a', report([]))])
    await runImport(h.update, 'pl-a', 1, async () => { throw new IngestError('hls-media', 'This is an HLS media playlist (video segments of one stream), not a channel list.') })
    const s = h.get()[0]!
    expect([s.status, s.error, statusText(s), statusTone(s)]).toEqual(['failed', 'This is an HLS media playlist (video segments of one stream), not a channel list.', 'Refresh failed · 0 channels kept', 'failing'])
    expect(statusText({ ...s, lastSuccess: null })).toBe('Import failed')
  })

  it('never shows unexpected error text, which could contain addresses or tokens', async () => {
    const h = holder([urlSource('pl-a', report([]))])
    await runImport(h.update, 'pl-a', 1, async () => { throw new Error(`GET ${SECRET_URL} failed`) })
    expect(h.get()[0]?.error).toBe('Kinora could not read that playlist.')
    expect(userMessage(new IngestError('internal', 'x'))).toBe('Kinora could not read that playlist.')
    expect(userMessage(new IngestError('timeout', 'playlists.example did not send the playlist in time.'))).toBe('playlists.example did not send the playlist in time.')
  })

  it('reports clearly when the native shell is not there (browser preview)', async () => {
    const h = holder([urlSource('pl-a', report([]))])
    await runImport(h.update, 'pl-a', 1, async () => null)
    expect([h.get()[0]?.status, h.get()[0]?.error]).toEqual(['failed', DESKTOP_ONLY])
  })
})

describe('refresh and removal', () => {
  it('replaces channels on refresh without leaving stale entries, keeping ids of channels that stay', async () => {
    const h = holder([urlSource('pl-a', report([entry({ key: 'tvg:a', tvgId: 'a', name: 'A' }), entry({ key: 'tvg:b', tvgId: 'b', name: 'B' })]))])
    const before = h.get()[0]!.channels.find((c) => c.name === 'B')!.id
    await runImport(h.update, 'pl-a', 1, async () => report([entry({ key: 'tvg:b', tvgId: 'b', name: 'B' }), entry({ key: 'tvg:c', tvgId: 'c', name: 'C' })]))
    const s = h.get()[0]!
    expect(s.channels.map((c) => c.name)).toEqual(['B', 'C'])
    expect(s.channels[0]?.id).toBe(before)
    expect(activeChannels(h.get(), demoChannels)).toHaveLength(2)
  })

  it('a failed refresh keeps the last good channels and says so, without claiming success', async () => {
    const h = holder([urlSource('pl-a', report([entry(), entry({ key: 'tvg:two', tvgId: 'two', name: 'Two' })]), 100)])
    await runImport(h.update, 'pl-a', 1, async () => { throw new IngestError('timeout', 'playlists.example did not send the playlist in time.') }, () => 200)
    const s = h.get()[0]!
    expect([s.status, s.lastSuccess, s.lastAttempt, s.channels.length]).toEqual(['failed', 100, 200, 2])
    expect(statusText(s)).toBe('Refresh failed · 2 channels kept')
    expect(statusTone(s)).toBe('failing')
  })

  it('removing a source removes its channels from the active catalogue', () => {
    const list = [urlSource('pl-a', report([entry()])), urlSource('pl-b', report([entry({ key: 'tvg:x', tvgId: 'x', name: 'X' })]))]
    const after = removeSource(list, 'pl-a')
    expect(activeChannels(after, demoChannels).map((c) => c.name)).toEqual(['X'])
    expect(activeChannels(removeSource(after, 'pl-b'), demoChannels)).toBe(demoChannels)
  })
})

describe('the active catalogue', () => {
  it('keeps channels from different sources apart, even with the same guide id and name', () => {
    const list = [urlSource('pl-a', report([entry()])), urlSource('pl-b', report([entry()]))]
    const all = activeChannels(list, demoChannels)
    expect(all.map((c) => [c.sourceId, c.name])).toEqual([['pl-a', 'One'], ['pl-b', 'One']])
    expect(new Set(all.map((c) => c.id)).size).toBe(2)
  })

  it('shows only playlist channels while any playlist source exists, and the demo set otherwise', () => {
    const list = [urlSource('pl-a', report([entry()]))]
    expect(activeChannels(list, demoChannels).every((c) => c.sourceId === 'pl-a')).toBe(true)
    expect(activeChannels([], demoChannels)).toBe(demoChannels)
    // A source that is still importing or failed with nothing still means "playlist mode": no demo channels mixed in.
    expect(activeChannels([{ ...list[0]!, channels: [] }], demoChannels)).toEqual([])
  })

  it('resolves library refs to playlist channels without breaking ids that contain colons or slashes', () => {
    const [c] = toChannels('pl-a', report([entry({ key: 'tvg:odd:id/with#bits', tvgId: 'odd:id/with#bits' })]).channels)
    const r = resolve(`channel:${c!.id}`, Date.now(), (id) => (id === c!.id ? c : undefined))
    expect(r?.kind === 'channel' && r.item.id).toBe(c!.id)
    expect(c!.id).not.toMatch(/[:/#]/)
  })

  it('makes channel ids that survive links and query strings unchanged, and stay distinct', () => {
    const keys = ['tvg:odd:id/with#bits', 'tvg:a%3Ab', 'tvg:a:b', 'tvg:a_3a_b', 'tvg:sp ace&x=1?y+z', 'name:00ff00ff00ff00ff#2', 'tvg:ニュース']
    const ids = toChannels('pl-a', report(keys.map((key) => entry({ key }))).channels).map((c) => c.id)
    for (const id of ids) {
      expect(id).toMatch(/^[A-Za-z0-9._~-]+$/)
      expect(new URLSearchParams(`channel=${id}`).get('channel')).toBe(id) // as in `/live?channel=${c.id}` links
      expect(decodeURIComponent(encodeURIComponent(`channel:${id}`)).split(':')[1]).toBe(id) // as in `/watch/<ref>`
    }
    expect(new Set(ids).size).toBe(keys.length)
  })

  it('uses safe fallbacks for missing metadata', () => {
    const [a, b] = toChannels('pl-a', report([entry({ group: null, chno: null, name: '   ' }), entry({ key: 'tvg:k', group: '  ', name: '(HD) 24/7 News', chno: 12 })]).channels)
    expect([a?.group, a?.name, a?.number, a?.mark.text]).toEqual([UNCATEGORISED, 'Unnamed channel', 1, 'UC'])
    expect([b?.group, b?.number, b?.mark.text]).toEqual([UNCATEGORISED, 12, 'H2'])
    expect(channelGroups([...toChannels('x', report([entry({ group: 'Sport' }), entry({ group: null }), entry({ group: 'Kids' })]).channels)])).toEqual(['Kids', 'Sport', UNCATEGORISED])
  })

  it('never puts stream or logo addresses, credentials or tokens into anything a screen shows', () => {
    const [c] = toChannels('pl-a', report([entry({ key: 'name:00ff00ff00ff00ff', tvgId: null })]).channels)
    const shown = JSON.stringify({ id: c!.id, name: c!.name, group: c!.group, mark: c!.mark, number: c!.number, logo: c!.logoUrl })
    for (const s of SECRETS) expect(shown).not.toContain(s)
    expect(c!.logoUrl).toBeNull() // remote logos stay blocked; initials instead
    expect(c!.streamUrl).toBe(SECRET_URL) // kept, unshown, for a future player
    expect(addressLabel(SECRET_URL)).toBe('http://provider.example:8080/…')
    expect(addressLabel('not a url')).toBe('Playlist address')
  })
})

describe('overlapping operations', () => {
  it('drops the result of an older operation that finishes after a newer one', async () => {
    const h = holder([urlSource('pl-a', report([entry()]))])
    const slow = deferred<PlaylistReport>()
    const fast = deferred<PlaylistReport>()
    const first = runImport(h.update, 'pl-a', 1, () => slow.promise)
    const second = runImport(h.update, 'pl-a', 2, () => fast.promise)
    fast.resolve(report([entry({ key: 'tvg:new', tvgId: 'new', name: 'Newest' })]))
    await second
    slow.resolve(report([entry({ key: 'tvg:old', tvgId: 'old', name: 'Stale' })]))
    await first
    expect(h.get()[0]?.channels.map((c) => c.name)).toEqual(['Newest'])
    expect(h.get()[0]?.status).toBe('parsed')
  })

  it('an older failure cannot overwrite a newer success', async () => {
    const h = holder([urlSource('pl-a', report([entry()]))])
    const slow = deferred<PlaylistReport>()
    const first = runImport(h.update, 'pl-a', 1, () => slow.promise)
    await runImport(h.update, 'pl-a', 2, async () => report([entry({ key: 'tvg:z', tvgId: 'z', name: 'Z' })]))
    slow.reject(new IngestError('network', 'Could not connect to playlists.example.'))
    await first
    expect([h.get()[0]?.status, h.get()[0]?.error]).toEqual(['parsed', null])
  })

  it('a result arriving after the source was removed does not bring it back', async () => {
    const h = holder([urlSource('pl-a', report([entry()]))])
    const slow = deferred<PlaylistReport>()
    const pending = runImport(h.update, 'pl-a', 1, () => slow.promise)
    h.update((l) => removeSource(l, 'pl-a'))
    slow.resolve(report([entry()]))
    await pending
    expect(h.get()).toEqual([])
  })

  it('shows the source as importing while an operation is in flight', async () => {
    const h = holder([urlSource('pl-a', report([entry()]))])
    const slow = deferred<PlaylistReport>()
    const pending = runImport(h.update, 'pl-a', 1, () => slow.promise)
    expect([h.get()[0]?.status, statusText(h.get()[0]!), h.get()[0]?.channels.length]).toEqual(['importing', 'Importing…', 1])
    slow.resolve(report([entry()]))
    await pending
  })
})

describe('multiple categories', () => {
  const chans = (groups: (string | null)[]) => toChannels('pl-a', report(groups.map((group, i) => entry({ key: `tvg:c${i}`, tvgId: `c${i}`, name: `C${i}`, group }))).channels)

  it('splits semicolon lists, trimming and dropping empty entries and repeats', () => {
    expect(splitCategories('Animation;Comedy')).toEqual(['Animation', 'Comedy'])
    expect(splitCategories('  Animation ;  Comedy  ')).toEqual(['Animation', 'Comedy'])
    expect(splitCategories('News;;Sport;')).toEqual(['News', 'Sport'])
    expect(splitCategories('Comedy;comedy; COMEDY ;Kids')).toEqual(['Comedy', 'Kids'])
  })

  it('treats missing or empty categories as Uncategorised', () => {
    for (const raw of [null, '', '   ', ';', ' ; ;; ']) expect(splitCategories(raw)).toEqual([UNCATEGORISED])
  })

  it('keeps the source group as written and the channel id independent of categories', () => {
    const [a] = chans(['Animation;Comedy'])
    const [b] = chans(['Something else'])
    expect([a?.group, a?.categories]).toEqual(['Animation;Comedy', ['Animation', 'Comedy']])
    expect(a?.id).toBe(b?.id) // same key → same id, whatever the category text
  })

  it('offers each category once, whatever its spelling or how many channels share it', () => {
    expect(channelGroups(chans(['Animation;Comedy', 'comedy', 'Kids; Animation', null, ' ;']))).toEqual(['Animation', 'Comedy', 'Kids', UNCATEGORISED])
  })

  it('lists a multi-category channel once under each of its categories and once overall', () => {
    const list = chans(['Animation;Comedy', 'Comedy', null])
    expect(filterChannels(list, 'All', []).map((c) => c.name)).toEqual(['C0', 'C1', 'C2'])
    expect(filterChannels(list, 'Comedy', []).map((c) => c.name)).toEqual(['C0', 'C1'])
    expect(filterChannels(list, 'comedy', []).map((c) => c.name)).toEqual(['C0', 'C1'])
    expect(filterChannels(list, 'Animation', []).map((c) => c.name)).toEqual(['C0'])
    expect(filterChannels(list, UNCATEGORISED, []).map((c) => c.name)).toEqual(['C2'])
    expect(filterChannels(list, 'Favourites', [list[2]!.id]).map((c) => c.name)).toEqual(['C2'])
  })

  it('keeps demo channel categories as they were', () => {
    expect(demoChannels.every((c) => c.categories.length === 1 && c.categories[0] === c.group)).toBe(true)
    expect(filterChannels(demoChannels, 'News', []).map((c) => c.name)).toEqual(['Meridian News', 'Civic'])
  })
})

describe('Add Source checks', () => {
  it('accepts a well-formed http(s) M3U address and normalises it', () => {
    expect(checkPlaylistUrl('  https://Playlists.Example/list.m3u ', 'm3u', [])).toEqual({ url: 'https://playlists.example/list.m3u' })
    expect(checkPlaylistUrl('http://playlists.example/a.m3u8', 'm3u8', [])).toEqual({ url: 'http://playlists.example/a.m3u8' })
  })

  it('refuses empty, malformed, non-http, credentialed, duplicate and unsupported inputs', () => {
    const error = (raw: string, kind: 'm3u' | 'xmltv' | 'url-list' = 'm3u', existing: string[] = []) => {
      const r = checkPlaylistUrl(raw, kind, existing)
      return 'error' in r ? r.error : null
    }
    expect(error('')).toBe('Paste the playlist address.')
    expect(error('not a url')).toMatch(/http:\/\/ or https:\/\//)
    expect(error('ftp://playlists.example/a.m3u')).toMatch(/http:\/\/ or https:\/\//)
    expect(error('file:///home/me/a.m3u')).toMatch(/http:\/\/ or https:\/\//)
    expect(error('https://alice:hunter2@playlists.example/a.m3u')).toMatch(/Remove the username and password/)
    expect(error('https://playlists.example/a.m3u', 'm3u', ['https://playlists.example/a.m3u'])).toMatch(/already one of your sources/)
    expect(error('https://lists.example/sport.txt', 'url-list')).toMatch(/not supported yet/)
  })

  it('turns every read outcome into the report or a safe message, without throwing', async () => {
    expect(await readForPreview(async () => report([entry()]))).toEqual({ report: report([entry()]) })
    expect(await readForPreview(async () => null)).toEqual({ error: DESKTOP_ONLY })
    expect(await readForPreview(async () => report([]))).toEqual({ error: 'The playlist was read, but it lists no channels to add.' })
    expect(await readForPreview(async () => { throw new IngestError('not-playlist', 'No #EXTM3U header or channel entries were found.') })).toEqual({ error: 'No #EXTM3U header or channel entries were found.' })
    const leaky = await readForPreview(async () => { throw new Error(`GET ${SECRET_URL} failed`) })
    expect(leaky).toEqual({ error: 'Kinora could not read that playlist.' })
  })
})

describe('saving and restoring', () => {
  it('saves metadata only: no stream or logo addresses, and an address only for URL sources', () => {
    const s = urlSource('pl-a', report([entry(), entry({ key: 'name:00ff00ff00ff00ff', tvgId: null, name: 'Two', group: null, chno: 5 })]))
    const saved = toSaved(s)
    expect(saved.url).toContain('token=SECRET123') // the playlist address is saved so it can be refreshed
    expect(saved.channels).toEqual([
      { key: 'tvg:one.uk', tvgId: 'one.uk', name: 'One', group: 'News', chno: null },
      { key: 'name:00ff00ff00ff00ff', tvgId: null, name: 'Two', group: null, chno: 5 },
    ])
    const json = JSON.stringify(saved)
    for (const s of ['hunter2', '/live', 'LOGOSIG', 'streamUrl', 'logo']) expect(json).not.toContain(s)
    expect(toSaved({ ...createSource('pl-f', { name: 'F', origin: 'file', url: null, label: 'f.m3u' }, report([entry()]), 1), url: 'https://x.example/?t=1' }).url).toBeNull()
  })

  it('restores a source with the same channel ids, listed but not playable until refreshed', async () => {
    const fresh = urlSource('pl-a', report([entry(), entry({ key: 'tvg:odd:id/#2', tvgId: 'odd', name: 'Odd' })]))
    const restored = restoreSource(toSaved(fresh))
    expect(restored.channels.map((c) => c.id)).toEqual(fresh.channels.map((c) => c.id))
    expect(restored.channels.map((c) => c.name)).toEqual(['One', 'Odd'])
    expect(restored.channels.every((c) => c.streamUrl === null)).toBe(true)
    expect([restored.status, statusText(restored), statusTone(restored)]).toEqual(['saved', 'Saved · 2 channels', 'pending'])
    expect(unavailableReason(restored)).toContain('not been refreshed')
    // Refreshing brings the stream addresses back under the same ids.
    const h = holder([restored])
    await runImport(h.update, 'pl-a', 1, async () => report([entry(), entry({ key: 'tvg:odd:id/#2', tvgId: 'odd', name: 'Odd' })]))
    expect(h.get()[0]!.channels.map((c) => c.id)).toEqual(fresh.channels.map((c) => c.id))
    expect(h.get()[0]!.channels[0]?.streamUrl).toBe(SECRET_URL)
    expect(unavailableReason(h.get()[0]!)).toBeNull()
  })

  it('a failed startup refresh keeps the saved channels and says why they cannot play', async () => {
    const h = holder([restoreSource(toSaved(urlSource('pl-a', report([entry()]), 100)))])
    await runImport(h.update, 'pl-a', 1, async () => { throw new IngestError('network', 'Could not connect to playlists.example.') })
    const s = h.get()[0]!
    expect([s.status, statusText(s), s.channels.length]).toEqual(['failed', 'Refresh failed · 1 channel kept', 1])
    expect(unavailableReason(s)).toContain('could not be refreshed')
    const file = restoreSource(toSaved(createSource('pl-f', { name: 'F', origin: 'file', url: null, label: 'f.m3u' }, report([entry()]), 1)))
    expect(unavailableReason(file)).toContain('Choose the file again')
  })
})
