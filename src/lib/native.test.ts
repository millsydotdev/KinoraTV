import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  IngestError, MAX_GUIDE_BYTES, loadCatalogue, parseCatalogue, refreshCatalogue, MAX_PLAYLIST_BYTES, closeStream, fetchGuide, fetchPlaylist, getAppInfo, guideChannels, guideProgrammes, loadGuide, loadSources, openStream,
  parseAppInfo, parseGuideAnswers, parseGuideSummary, parseOpenedStream, parsePlaylistReport, parseSavedGuide, parseSavedMapping, parseSavedSource, readGuideFile,
  readPlaylistFile, removeGuide, saveSources, toIngestError, type SavedGuide, type SavedMapping, type SavedSource, type SavedState,
} from './native'

// `inside` undefined keeps the real isTauri() (false under Vitest); tests set it to drive the shell path.
const shell = vi.hoisted(() => ({ inside: undefined as boolean | undefined, invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tauri-apps/api/core')>()
  return { ...actual, isTauri: () => shell.inside ?? actual.isTauri(), invoke: shell.invoke }
})
beforeEach(() => {
  shell.inside = undefined
  shell.invoke.mockReset()
})

const valid = { name: 'Kinora', version: '0.1.0', profile: 'release', os: 'linux', arch: 'x86_64', tauriVersion: '2.12.5' }

describe('native boundary', () => {
  it('accepts the shape the Rust app_info command serialises', () => {
    expect(parseAppInfo(valid)).toEqual(valid)
  })

  it('rejects malformed or unexpected responses', () => {
    expect(() => parseAppInfo(null)).toThrow()
    expect(() => parseAppInfo({ ...valid, profile: 'staging' })).toThrow()
    expect(() => parseAppInfo({ ...valid, version: 1 })).toThrow()
    expect(() => parseAppInfo({ ...valid, os: 'x'.repeat(65) })).toThrow()
    const { arch: _arch, ...missing } = valid
    expect(() => parseAppInfo(missing)).toThrow()
  })

  it('drops fields the frontend does not know about', () => {
    expect(parseAppInfo({ ...valid, injected: '<script>' })).toEqual(valid)
  })

  it('resolves to null outside the native shell instead of throwing', async () => {
    await expect(getAppInfo()).resolves.toBeNull()
  })
})

const channel = { key: 'tvg:news.uk', tvgId: 'news.uk', name: 'News HD', group: 'News', logo: 'https://img.example/n.png', language: 'English', country: 'GB', chno: 101, streamUrl: 'https://s.example/news.m3u8', streamDisplay: 'https://s.example/…' }
const report = { channels: [channel, { ...channel, key: 'name:00ff00ff00ff00ff', tvgId: null, group: null, logo: null, language: null, country: null, chno: null }], skipped: 1, duplicates: 2, warnings: ['Line 4: entry has no stream address.'], host: 'playlists.example' }

describe('playlist boundary', () => {
  it('accepts the report shape the Rust ingest commands serialise', () => {
    expect(parsePlaylistReport(report)).toEqual(report)
  })

  it('drops fields it does not know about, on the report and on each channel', () => {
    const parsed = parsePlaylistReport({ ...report, extra: 1, channels: [{ ...channel, injected: '<script>' }] })
    expect(parsed.channels[0]).toEqual(channel)
    expect('extra' in parsed).toBe(false)
  })

  it('rejects malformed reports and channels', () => {
    const bad: unknown[] = [
      null, 'text', { ...report, channels: 'many' }, { ...report, skipped: -1 }, { ...report, duplicates: 1.5 },
      { ...report, warnings: Array(21).fill('w') }, { ...report, host: 5 },
      { ...report, channels: [{ ...channel, name: 7 }] }, { ...report, channels: [{ ...channel, name: '' }] },
      { ...report, channels: [{ ...channel, chno: 0 }] }, { ...report, channels: [{ ...channel, chno: 2.5 }] },
      { ...report, channels: [{ ...channel, logo: 'x'.repeat(2049) }] }, { ...report, channels: [{ ...channel, streamUrl: null }] }, { ...report, channels: [{ ...channel, streamDisplay: undefined }] },
      { ...report, channels: Array(50_001).fill(channel) },
    ]
    for (const raw of bad) expect(() => parsePlaylistReport(raw)).toThrow()
  })

  it('maps Rust errors to typed errors and never echoes unrecognised ones', () => {
    const e = toIngestError({ code: 'blocked', message: '10.0.0.1 is a local, private or reserved network address.' })
    expect(e).toBeInstanceOf(IngestError)
    expect([e.code, e.message]).toEqual(['blocked', '10.0.0.1 is a local, private or reserved network address.'])
    for (const raw of [{ code: 'teapot', message: 'x' }, { code: 'timeout', message: 'x'.repeat(501) }, 'Command fetch_playlist not allowed by ACL', null]) {
      const unknown = toIngestError(raw)
      expect(unknown.code).toBe('internal')
      expect(unknown.message).not.toContain('ACL')
    }
  })

  it('resolves to null outside the native shell', async () => {
    await expect(fetchPlaylist('https://playlists.example/list.m3u')).resolves.toBeNull()
    await expect(readPlaylistFile(new File(['#EXTM3U'], 'list.m3u'))).resolves.toBeNull()
    expect(shell.invoke).not.toHaveBeenCalled()
  })

  it('calls the Rust commands and validates what comes back', async () => {
    shell.inside = true
    shell.invoke.mockResolvedValue(report)
    await expect(fetchPlaylist('https://playlists.example/list.m3u')).resolves.toEqual(report)
    expect(shell.invoke).toHaveBeenLastCalledWith('fetch_playlist', { url: 'https://playlists.example/list.m3u' })

    await expect(readPlaylistFile(new File(['#EXTM3U\n'], 'list.m3u'))).resolves.toEqual(report)
    expect(shell.invoke).toHaveBeenLastCalledWith('parse_playlist_text', { text: '#EXTM3U\n' })

    shell.invoke.mockResolvedValue({ ...report, channels: [{ ...channel, name: null }] })
    await expect(fetchPlaylist('https://playlists.example/list.m3u')).rejects.toThrow('unexpected shape')
  })

  it('surfaces Rust refusals as IngestError', async () => {
    shell.inside = true
    shell.invoke.mockRejectedValue({ code: 'timeout', message: 'playlists.example did not send the playlist in time.' })
    await expect(fetchPlaylist('https://playlists.example/list.m3u')).rejects.toMatchObject({ name: 'IngestError', code: 'timeout' })
  })

  it('refuses oversized files before reading them or calling Rust', async () => {
    shell.inside = true
    const big = new File([new Uint8Array(MAX_PLAYLIST_BYTES + 1)], 'big.m3u')
    await expect(readPlaylistFile(big)).rejects.toMatchObject({ code: 'too-large' })
    expect(shell.invoke).not.toHaveBeenCalled()
  })
})

describe('stream session boundary', () => {
  const ok = { url: `kstream://localhost/${'0123456789abcdef'.repeat(2)}`, session: 3 }

  it('accepts only an opaque kstream address and a positive session id', () => {
    expect(parseOpenedStream({ ...ok, extra: 'https://cdn.example/a.m3u8' })).toEqual(ok)
    for (const bad of [
      null, { ...ok, url: 'https://cdn.example/a.m3u8' }, { ...ok, url: 'kstream://localhost/abc' },
      { ...ok, url: `kstream://localhost/${'A'.repeat(32)}` }, { ...ok, url: `kstream://evil.example/${'0'.repeat(32)}` },
      { ...ok, url: `${ok.url}?u=https://cdn.example` }, { ...ok, session: 0 }, { ...ok, session: 1.5 }, { ...ok, session: '3' },
    ]) expect(() => parseOpenedStream(bad)).toThrow()
  })

  it('calls the Rust commands and surfaces refusals as IngestError', async () => {
    shell.inside = true
    shell.invoke.mockResolvedValueOnce(ok)
    await expect(openStream('https://cdn.example/a.m3u8')).resolves.toEqual(ok)
    expect(shell.invoke).toHaveBeenLastCalledWith('open_stream', { url: 'https://cdn.example/a.m3u8' })
    shell.invoke.mockRejectedValueOnce({ code: 'unsupported-stream', message: 'This stream is not HLS.' })
    await expect(openStream('rtmp://x')).rejects.toMatchObject({ name: 'IngestError', code: 'unsupported-stream' })
    shell.invoke.mockResolvedValueOnce(undefined)
    await closeStream(3)
    expect(shell.invoke).toHaveBeenLastCalledWith('close_stream', { session: 3 })
  })

  it('sends stream commands one at a time, so the session Rust keeps is the last one asked for', async () => {
    shell.inside = true
    let finishFirst!: (v: unknown) => void
    shell.invoke.mockImplementationOnce(() => new Promise((r) => { finishFirst = r })).mockResolvedValueOnce({ ...ok, session: 4 }).mockResolvedValueOnce(undefined)
    const first = openStream('https://cdn.example/one.m3u8')
    const second = openStream('https://cdn.example/two.m3u8')
    const close = closeStream(3)
    await Promise.resolve(); await Promise.resolve()
    expect(shell.invoke).toHaveBeenCalledTimes(1) // the second open waits for the first to finish
    finishFirst(ok)
    await expect(first).resolves.toEqual(ok)
    await expect(second).resolves.toEqual({ ...ok, session: 4 })
    await close
    expect(shell.invoke.mock.calls.map((c) => c[0])).toEqual(['open_stream', 'open_stream', 'close_stream'])
  })

  it('a failed command does not block the ones after it', async () => {
    shell.inside = true
    shell.invoke.mockRejectedValueOnce({ code: 'network', message: 'x' }).mockResolvedValueOnce(ok)
    await expect(openStream('https://cdn.example/one.m3u8')).rejects.toMatchObject({ code: 'network' })
    await expect(openStream('https://cdn.example/two.m3u8')).resolves.toEqual(ok)
  })

  it('does nothing outside the native shell', async () => {
    await expect(openStream('https://cdn.example/a.m3u8')).resolves.toBeNull()
    await closeStream(3)
    expect(shell.invoke).not.toHaveBeenCalled()
  })
})

describe('saved sources boundary', () => {
  const empty: SavedState = { sources: [], guides: [], mappings: [] }
  const guide: SavedGuide = {
    id: 'gd-g1', name: 'Guide', origin: 'url', url: 'https://guides.example/epg.xml.gz?token=GUIDETOKEN', label: 'https://guides.example/…',
    addedAt: 1000, lastSuccess: null, playlists: ['pl-a1'],
  }
  const mapping: SavedMapping = { channel: 'pl-a1~tvg_3a_one', guide: 'gd-g1', xmltvId: 'One.uk' }
  const saved: SavedSource = {
    id: 'pl-a1', name: 'My lineup', origin: 'url', url: 'https://playlists.example/get.php?token=SECRET123', label: 'https://playlists.example/…',
    addedAt: 1000, lastSuccess: 2000, skipped: 0, duplicates: 1,
    channels: [{ key: 'tvg:one', tvgId: 'one', name: 'One', group: 'News', chno: 7 }, { key: 'name:00ff', tvgId: null, name: 'Two', group: null, chno: null }],
  }

  it('accepts what Rust saves and drops unknown fields', () => {
    expect(parseSavedSource({ ...saved, streamUrl: 'x', channels: saved.channels.map((c) => ({ ...c, streamUrl: 'x' })) })).toEqual(saved)
    expect(parseSavedSource({ ...saved, origin: 'file', url: null, label: 'f.m3u' }).url).toBeNull()
  })

  it('rejects malformed saved data', () => {
    for (const bad of [
      null, { ...saved, id: '../x' }, { ...saved, origin: 'url', url: null }, { ...saved, origin: 'file', url: 'https://x' }, { ...saved, origin: 'ftp' },
      { ...saved, addedAt: -1 }, { ...saved, lastSuccess: 'yesterday' }, { ...saved, channels: [{ ...saved.channels[0], chno: 0 }] },
      { ...saved, channels: [{ ...saved.channels[0], name: '' }] }, { ...saved, channels: 'many' },
    ]) expect(() => parseSavedSource(bad)).toThrow()
  })

  it('loads through Rust, validating the notice too', async () => {
    shell.inside = true
    shell.invoke.mockResolvedValueOnce({ sources: [saved], guides: [guide], mappings: [mapping], notice: 'recovered' })
    await expect(loadSources()).resolves.toEqual({ sources: [saved], guides: [guide], mappings: [mapping], notice: 'recovered' })
    shell.invoke.mockResolvedValueOnce({ sources: [saved], guides: [], mappings: [], notice: 'wiped' })
    await expect(loadSources()).rejects.toThrow()
    shell.invoke.mockResolvedValueOnce({ sources: [saved], notice: null })
    await expect(loadSources()).rejects.toThrow()
  })

  it('saves in order, and surfaces refusals as IngestError', async () => {
    shell.inside = true
    let finishFirst!: (v: unknown) => void
    shell.invoke.mockImplementationOnce(() => new Promise((r) => { finishFirst = r })).mockResolvedValueOnce(undefined)
    const first = saveSources(empty)
    const second = saveSources({ ...empty, sources: [saved] })
    await Promise.resolve(); await Promise.resolve()
    expect(shell.invoke).toHaveBeenCalledTimes(1)
    finishFirst(undefined)
    await first; await second
    expect(shell.invoke.mock.calls.map((c) => c[1])).toEqual([{ saved: empty }, { saved: { ...empty, sources: [saved] } }])
    shell.invoke.mockRejectedValueOnce({ code: 'storage', message: 'Kinora could not save your sources.' })
    await expect(saveSources(empty)).rejects.toMatchObject({ code: 'storage' })
  })

  it('does nothing outside the native shell', async () => {
    await expect(loadSources()).resolves.toBeNull()
    await saveSources(empty)
    expect(shell.invoke).not.toHaveBeenCalled()
  })

  it('accepts saved guides and matches, and rejects malformed ones', () => {
    expect(parseSavedGuide({ ...guide, extra: 1 })).toEqual(guide)
    expect(parseSavedMapping(mapping)).toEqual(mapping)
    for (const bad of [
      null, { ...guide, id: 'pl-a1' }, { ...guide, id: 'gd-../x' }, { ...guide, origin: 'file' }, { ...guide, playlists: 'pl-a1' },
      { ...guide, playlists: [''] }, { ...guide, addedAt: Number.NaN },
    ]) expect(() => parseSavedGuide(bad)).toThrow()
    for (const bad of [null, { ...mapping, xmltvId: '' }, { ...mapping, channel: 3 }]) expect(() => parseSavedMapping(bad)).toThrow()
  })
})

describe('guide boundary', () => {
  const summary = { channels: 2, programmes: 3, first: 1000, last: 9000, fetchedAt: 500, skipped: 1, duplicates: 0, warnings: ['1 programme had no title and was skipped.'] }
  const programme = { channel: 'One.uk', start: 1000, stop: 2000, stopEstimated: false, title: 'News', subtitle: null, desc: 'Text', category: 'News', episode: null }

  it('validates guide summaries', () => {
    expect(parseGuideSummary(summary)).toEqual(summary)
    expect(parseGuideSummary({ ...summary, first: null, last: null })).toMatchObject({ first: null })
    for (const bad of [null, { ...summary, programmes: -1 }, { ...summary, fetchedAt: 'now' }, { ...summary, warnings: [1] }]) expect(() => parseGuideSummary(bad)).toThrow()
  })

  it('validates programme answers', () => {
    const answer = { guide: 'gd-a', loaded: true, matches: [{ id: 'one.uk', channel: 'One.uk' }, { id: 'x', channel: null }], programmes: [programme] }
    expect(parseGuideAnswers([answer])).toEqual([answer])
    for (const bad of [
      { ...answer, loaded: 'yes' }, { ...answer, matches: [{ id: '', channel: null }] }, { ...answer, programmes: [{ ...programme, stop: 1000 }] },
      { ...answer, programmes: [{ ...programme, title: '' }] }, { ...answer, programmes: [{ ...programme, stopEstimated: 1 }] },
    ]) expect(() => parseGuideAnswers([bad])).toThrow()
    expect(() => parseGuideAnswers({})).toThrow()
  })

  it('sends guide files as raw bytes with the id in a header, never a path', async () => {
    shell.inside = true
    shell.invoke.mockResolvedValueOnce(summary)
    const file = new File([new Uint8Array([0x1f, 0x8b, 1, 2])], '/home/alice/epg.xml.gz')
    await expect(readGuideFile('gd-a', file)).resolves.toEqual(summary)
    const [command, body, options] = shell.invoke.mock.calls[0] ?? []
    expect(command).toBe('import_guide_file')
    expect(body).toBeInstanceOf(Uint8Array)
    expect([...(body as Uint8Array)]).toEqual([0x1f, 0x8b, 1, 2])
    expect(options).toEqual({ headers: { 'x-guide-id': 'gd-a' } })
    expect(JSON.stringify(shell.invoke.mock.calls)).not.toContain('alice')
  })

  it('refuses oversized guide files before reading them', async () => {
    shell.inside = true
    const big = new File([], 'big.xml')
    Object.defineProperty(big, 'size', { value: MAX_GUIDE_BYTES + 1 })
    big.arrayBuffer = () => { throw new Error('the file must not be read') }
    await expect(readGuideFile('gd-a', big)).rejects.toMatchObject({ code: 'too-large' })
    expect(shell.invoke).not.toHaveBeenCalled()
  })

  it('maps guide errors and returns null for nothing held', async () => {
    shell.inside = true
    shell.invoke.mockRejectedValueOnce({ code: 'not-guide', message: 'This is XML, but not an XMLTV guide (it does not start with <tv>).' })
    await expect(fetchGuide('gd-a', 'https://guides.example/epg.xml')).rejects.toMatchObject({ code: 'not-guide' })
    shell.invoke.mockResolvedValueOnce(null)
    await expect(loadGuide('gd-a')).resolves.toBeNull()
  })

  it('does nothing outside the native shell', async () => {
    await expect(fetchGuide('gd-a', 'https://guides.example/epg.xml')).resolves.toBeNull()
    await expect(guideProgrammes([], 0, 1)).resolves.toBeNull()
    await expect(guideChannels('gd-a')).resolves.toEqual([])
    await removeGuide('gd-a')
    expect(shell.invoke).not.toHaveBeenCalled()
  })
})

describe('catalogue boundary', () => {
  const uk = { id: 'countries/uk', kind: 'country', code: 'uk', name: 'United Kingdom', flag: '🇬🇧', parent: null, channels: null, url: 'https://iptv-org.github.io/iptv/countries/uk.m3u' }
  const good = { fetchedAt: 1000, entries: [uk], skipped: 2 }

  it('accepts only entries whose address, kind, code and id agree', () => {
    expect(parseCatalogue(good)).toEqual(good)
    for (const bad of [
      { ...uk, url: 'https://evil.example/iptv/countries/uk.m3u' },
      { ...uk, url: 'http://iptv-org.github.io/iptv/countries/uk.m3u' },
      { ...uk, url: 'https://iptv-org.github.io/iptv/countries/uk.m3u?token=SECRET' },
      { ...uk, url: 'https://user:pw@iptv-org.github.io/iptv/countries/uk.m3u' },
      { ...uk, url: 'https://iptv-org.github.io/iptv/raw/uk.m3u' },
      { ...uk, kind: 'language' }, { ...uk, code: 'gb' }, { ...uk, id: 'countries/gb' }, { ...uk, name: '' }, { ...uk, channels: -1 },
    ]) expect(() => parseCatalogue({ ...good, entries: [bad] }), JSON.stringify(bad)).toThrow()
    expect(() => parseCatalogue({ ...good, entries: Array(5001).fill(uk) })).toThrow()
    expect(() => parseCatalogue(null)).toThrow()
  })

  it('loads the cache, refreshes through Rust and maps refusals', async () => {
    shell.inside = true
    shell.invoke.mockResolvedValueOnce(null)
    await expect(loadCatalogue()).resolves.toBeNull()
    shell.invoke.mockResolvedValueOnce(good)
    await expect(refreshCatalogue()).resolves.toEqual(good)
    expect(shell.invoke.mock.calls.map((c) => c.slice(0, 2))).toEqual([['load_catalogue'], ['refresh_catalogue']])
    shell.invoke.mockRejectedValueOnce({ code: 'not-catalogue', message: 'The catalogue could not be read. Its format may have changed; your sources are not affected.' })
    await expect(refreshCatalogue()).rejects.toMatchObject({ code: 'not-catalogue' })
  })

  it('does nothing outside the native shell', async () => {
    await expect(loadCatalogue()).resolves.toBeNull()
    await expect(refreshCatalogue()).resolves.toBeNull()
    expect(shell.invoke).not.toHaveBeenCalled()
  })
})
