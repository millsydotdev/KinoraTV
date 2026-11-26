import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  IngestError, MAX_GUIDE_BYTES, loadCatalogue, parseCatalogue, refreshCatalogue, MAX_PLAYLIST_BYTES, closeStream, fetchGuide, fetchPlaylist, getAppInfo, guideChannels, guideProgrammes, loadGuide, loadSources, openStream,
  loadChannelLogo, loadProgrammeArtwork, loadXtreamArtwork, parseAppInfo, parseArtwork, parseChannelLogo, parseGuideAnswers, parseGuideSummary, parseOpenedStream, parsePlaylistReport, parseSavedGuide, parseSavedMapping, parseSavedSource, readGuideFile,
  readPlaylistFile, removeGuide, saveSources, toIngestError, parseConnectionTestResult, testSourceConnection, parseStoredPin, parseVerifyPinResult, hashParentalPin, verifyParentalPin, checkForUpdates, type ConnectionTestResult, type SavedGuide, type SavedMapping, type SavedSource, type SavedState, type StoredPinV2, type VerifyPinResult, type UpdateCheckResult,
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

  it('accepts only bounded, recognised raster image bytes from the logo command', () => {
    const png = [137, 80, 78, 71, 13, 10, 26, 10]
    expect(parseChannelLogo({ mimeType: 'image/png', bytes: png })).toEqual({ mimeType: 'image/png', bytes: new Uint8Array(png) })
    expect(parseChannelLogo(null)).toBeNull()
    expect(() => parseChannelLogo({ mimeType: 'image/svg+xml', bytes: [60, 115, 118, 103] })).toThrow()
    expect(() => parseChannelLogo({ mimeType: 'image/png', bytes: [256] })).toThrow()
    expect(() => parseChannelLogo({ mimeType: 'image/png', bytes: Array(256 * 1024 + 1).fill(0) })).toThrow()
  })

  it('accepts larger artwork images up to 4MB for programmes and posters', () => {
    const jpeg = [255, 216, 255, 224]
    expect(parseArtwork({ mimeType: 'image/jpeg', bytes: jpeg })).toEqual({ mimeType: 'image/jpeg', bytes: new Uint8Array(jpeg) })
    expect(parseArtwork(null)).toBeNull()
    // 500 KB image exceeds logo limit (256 KB) but is valid for artwork (up to 4 MB)
    const largeArt = Array(500 * 1024).fill(128)
    expect(parseArtwork({ mimeType: 'image/jpeg', bytes: largeArt })?.bytes.length).toBe(500 * 1024)
    expect(() => parseArtwork({ mimeType: 'image/jpeg', bytes: Array(4 * 1024 * 1024 + 1).fill(0) })).toThrow()
  })

  it('resolves to null outside the native shell instead of throwing', async () => {
    await expect(getAppInfo()).resolves.toBeNull()
    await expect(loadChannelLogo('https://img.example/logo.png', 'tvg:bbcone.uk', 'bbcone.uk')).resolves.toBeNull()
    await expect(loadXtreamArtwork('art-key-1')).resolves.toBeNull()
    await expect(loadProgrammeArtwork('https://img.example/prog.jpg')).resolves.toBeNull()
  })

  it('fetches and converts channel logo, xtream artwork and programme artwork to data URLs inside native shell', async () => {
    shell.inside = true
    const pngBytes = [137, 80, 78, 71, 13, 10, 26, 10]
    shell.invoke.mockResolvedValueOnce({ mimeType: 'image/png', bytes: pngBytes })
    const dataUrl = await loadChannelLogo('https://img.example/bbc.png', 'tvg:bbcone.uk', 'bbcone.uk')
    expect(shell.invoke).toHaveBeenCalledWith('fetch_channel_logo', {
      url: 'https://img.example/bbc.png',
      channelKey: 'tvg:bbcone.uk',
      tvgId: 'bbcone.uk',
    })
    expect(dataUrl).toContain('data:image/png;base64,')

    // Second call with same key should be served from memory cache without invoking again
    const cached = await loadChannelLogo('https://img.example/bbc.png', 'tvg:bbcone.uk', 'bbcone.uk')
    expect(cached).toBe(dataUrl)
    expect(shell.invoke).toHaveBeenCalledTimes(1)

    shell.invoke.mockResolvedValueOnce({ mimeType: 'image/png', bytes: pngBytes })
    const artUrl = await loadXtreamArtwork('art-key-1')
    expect(shell.invoke).toHaveBeenCalledWith('xtream_artwork', { artworkKey: 'art-key-1' })
    expect(artUrl).toContain('data:image/png;base64,')

    shell.invoke.mockResolvedValueOnce({ mimeType: 'image/jpeg', bytes: [255, 216, 255, 224] })
    const progUrl = await loadProgrammeArtwork('https://img.example/prog.jpg')
    expect(shell.invoke).toHaveBeenCalledWith('fetch_programme_artwork', { url: 'https://img.example/prog.jpg' })
    expect(progUrl).toContain('data:image/jpeg;base64,')

    const cachedProg = await loadProgrammeArtwork('https://img.example/prog.jpg')
    expect(cachedProg).toBe(progUrl)
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
    expect(parseOpenedStream({ ...ok, format: 'direct' })).toEqual({ ...ok, format: 'direct' })
    expect(parseOpenedStream({ ...ok, format: 'dash' })).toEqual({ ...ok, format: 'dash' })
    expect(parseOpenedStream({ ...ok, format: 'hls' })).toEqual({ ...ok, format: 'hls' })
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

  it('passes custom stream options to Rust open_stream command', async () => {
    shell.inside = true
    shell.invoke.mockResolvedValueOnce(ok)
    const opts = { userAgent: 'CustomVLC/3.0', referrer: 'https://ref.example/', headers: { 'X-Auth': '123' } }
    await expect(openStream('https://cdn.example/custom.m3u8', opts)).resolves.toEqual(ok)
    expect(shell.invoke).toHaveBeenLastCalledWith('open_stream', {
      url: 'https://cdn.example/custom.m3u8',
      options: opts,
    })
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
  const programme = { channel: 'One.uk', start: 1000, stop: 2000, stopEstimated: false, title: 'News', subtitle: null, desc: 'Text', category: 'News', episode: null, icon: null }

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

  it('parses valid connection test results and validates categories', () => {
    const rawSuccess = {
      ok: true,
      status: 200,
      host: 'iptv.example.com',
      roundTripMs: 42,
      message: 'Host reachable (HTTP 200 OK, 42ms)',
      category: 'success',
    }
    expect(parseConnectionTestResult(rawSuccess)).toEqual(rawSuccess)

    const rawBlocked = {
      ok: false,
      status: null,
      host: '127.0.0.1',
      roundTripMs: 1,
      message: '127.0.0.1 is a prohibited local address.',
      category: 'security-blocked',
    }
    expect(parseConnectionTestResult(rawBlocked)).toEqual(rawBlocked)

    // Unrecognised category falls back to 'unknown'
    const unknownCat = { ...rawSuccess, category: 'nonexistent-category' }
    expect(parseConnectionTestResult(unknownCat).category).toBe('unknown')

    // Malformed input throws
    expect(() => parseConnectionTestResult(null)).toThrow()
    expect(() => parseConnectionTestResult('not-an-object')).toThrow()
  })

  it('runs testSourceConnection via invoke when inside Tauri', async () => {
    shell.inside = true
    const expected: ConnectionTestResult = {
      ok: true,
      status: 200,
      host: 'iptv.example.com',
      roundTripMs: 55,
      message: 'Host reachable (HTTP 200 OK, 55ms)',
      category: 'success',
    }
    shell.invoke.mockResolvedValueOnce(expected)

    const res = await testSourceConnection('https://iptv.example.com/playlist.m3u')
    expect(res).toEqual(expected)
    expect(shell.invoke).toHaveBeenCalledWith('test_source_connection', { url: 'https://iptv.example.com/playlist.m3u' })
  })

  it('testSourceConnection returns null outside Tauri', async () => {
    const res = await testSourceConnection('https://iptv.example.com/playlist.m3u')
    expect(res).toBeNull()
    expect(shell.invoke).not.toHaveBeenCalled()
  })

  it('parses stored PBKDF2 PIN objects and validates structure', () => {
    const valid: StoredPinV2 = {
      algorithm: 'pbkdf2-sha256',
      salt: '0123456789abcdef0123456789abcdef',
      hash: 'a'.repeat(64),
      iterations: 100000,
      version: 2,
    }
    expect(parseStoredPin(valid)).toEqual(valid)
    expect(() => parseStoredPin(null)).toThrow()
    expect(() => parseStoredPin({ ...valid, version: 1 })).toThrow()
    expect(() => parseStoredPin({ ...valid, iterations: '100000' })).toThrow()
  })

  it('parses PIN verification results with optional upgraded PIN', () => {
    const resWithoutUpgrade: VerifyPinResult = { valid: true, upgradedPin: null }
    expect(parseVerifyPinResult(resWithoutUpgrade)).toEqual(resWithoutUpgrade)

    const upgraded: StoredPinV2 = {
      algorithm: 'pbkdf2-sha256',
      salt: '0123456789abcdef0123456789abcdef',
      hash: 'b'.repeat(64),
      iterations: 100000,
      version: 2,
    }
    const resWithUpgrade = { valid: true, upgradedPin: upgraded }
    expect(parseVerifyPinResult(resWithUpgrade)).toEqual(resWithUpgrade)
    expect(() => parseVerifyPinResult(null)).toThrow()
    expect(() => parseVerifyPinResult({ valid: 'true' })).toThrow()
  })

  it('interacts with hashParentalPin and verifyParentalPin over IPC', async () => {
    shell.inside = true
    const storedPin: StoredPinV2 = {
      algorithm: 'pbkdf2-sha256',
      salt: '0123456789abcdef0123456789abcdef',
      hash: 'c'.repeat(64),
      iterations: 100000,
      version: 2,
    }
    shell.invoke.mockResolvedValueOnce(storedPin)
    const hashed = await hashParentalPin('5678')
    expect(hashed).toEqual(storedPin)
    expect(shell.invoke).toHaveBeenCalledWith('hash_parental_pin', { pin: '5678' })

    const verifyRes: VerifyPinResult = { valid: true, upgradedPin: null }
    shell.invoke.mockResolvedValueOnce(verifyRes)
    const verified = await verifyParentalPin('5678', storedPin)
    expect(verified).toEqual(verifyRes)
    expect(shell.invoke).toHaveBeenCalledWith('verify_parental_pin', { pin: '5678', stored: storedPin })

    shell.inside = false
    expect(await hashParentalPin('5678')).toBeNull()
    expect(await verifyParentalPin('5678', storedPin)).toBeNull()
  })
})

describe('platform and device management boundary', () => {
  it('handles platform mode queries and updates', async () => {
    const { getPlatformMode, setPlatformMode } = await import('./native')

    // Web fallback
    shell.inside = false
    const webMode = await getPlatformMode()
    expect(webMode?.mode).toBe('standalone')

    // Inside Tauri
    shell.inside = true
    shell.invoke.mockResolvedValueOnce({
      mode: 'server',
      serverUrl: null,
      isServerActive: true,
      trustedDevicesCount: 2,
      activeConnections: 1,
    })

    const serverMode = await getPlatformMode()
    expect(serverMode?.mode).toBe('server')
    expect(serverMode?.isServerActive).toBe(true)

    shell.invoke.mockResolvedValueOnce({
      mode: 'client',
      serverUrl: 'http://192.168.1.100:5198',
      isServerActive: false,
      trustedDevicesCount: 0,
      activeConnections: 0,
    })

    const clientMode = await setPlatformMode('client', 'http://192.168.1.100:5198')
    expect(clientMode?.mode).toBe('client')
    expect(shell.invoke).toHaveBeenCalledWith('set_platform_mode', {
      mode: 'client',
      serverUrl: 'http://192.168.1.100:5198',
    })
  })

  it('handles trusted devices queries and revocations', async () => {
    const { getTrustedDevices, revokeTrustedDevice, renameTrustedDevice } = await import('./native')

    shell.inside = true
    shell.invoke.mockResolvedValueOnce([
      {
        id: 'dev-1',
        name: 'Living Room TV',
        deviceType: 'tv',
        capabilities: ['remoteControl'],
        authToken: 'tok-1',
        pairedAt: 1700000000,
        lastSeenAt: 1700000050,
        revoked: false,
      },
    ])

    const devs = await getTrustedDevices()
    expect(devs.length).toBe(1)
    expect(devs[0]!.name).toBe('Living Room TV')

    shell.invoke.mockResolvedValueOnce(true)
    const revoked = await revokeTrustedDevice('dev-1')
    expect(revoked).toBe(true)
    expect(shell.invoke).toHaveBeenCalledWith('revoke_trusted_device', { deviceId: 'dev-1' })

    shell.invoke.mockResolvedValueOnce(true)
    const renamed = await renameTrustedDevice('dev-1', 'Bedroom TV')
    expect(renamed).toBe(true)
    expect(shell.invoke).toHaveBeenCalledWith('rename_trusted_device', { deviceId: 'dev-1', newName: 'Bedroom TV' })
  })

  it('handles audit log and remote channels updates', async () => {
    const { getAuditLog, updateRemoteChannels, updateRemoteSources, updateRemoteLibrary, discoverKinoraServers } = await import('./native')

    shell.inside = true
    shell.invoke.mockResolvedValueOnce([
      {
        id: 'aud-1',
        timestamp: 1700000000,
        deviceId: 'dev-1',
        deviceName: 'Mobile Remote',
        capability: 'RemoteControl',
        action: 'dpad_up',
        details: '{}',
        status: 'success',
      },
    ])

    const audit = await getAuditLog()
    expect(audit.length).toBe(1)
    expect(audit[0]!.action).toBe('dpad_up')

    shell.invoke.mockResolvedValueOnce(true)
    const updated = await updateRemoteChannels([
      { id: 'ch-1', name: 'BBC One', number: 101 },
    ])
    expect(updated).toBe(true)

    shell.invoke.mockResolvedValueOnce(true)
    const updatedSources = await updateRemoteSources([
      { id: 'src-1', label: 'UK Freeview', origin: 'https://example.com/playlist.m3u', channelCount: 40, kind: 'playlist' },
    ])
    expect(updatedSources).toBe(true)

    shell.invoke.mockResolvedValueOnce(true)
    const updatedLib = await updateRemoteLibrary({
      favourites: ['ch-1'],
      watchlist: ['mov-1'],
      watchProgress: [{ itemRef: 'mov-1', title: 'Movie 1', position: 100, duration: 5000, updatedAt: 1700000000 }],
    })
    expect(updatedLib).toBe(true)

    shell.invoke.mockResolvedValueOnce([
      {
        name: 'Kinora Server',
        ip: '192.168.1.50',
        port: 5198,
        version: '0.6.0',
        mode: 'server',
      },
    ])
    const discovered = await discoverKinoraServers(1)
    expect(discovered.length).toBe(1)
    expect(discovered[0]!.ip).toBe('192.168.1.50')
  })
})

describe('updater boundary', () => {
  it('reports up to date outside the native shell', async () => {
    shell.inside = false
    const res = await checkForUpdates()
    expect(res).not.toBeNull()
    expect(res?.status).toBe('upToDate')
    expect(res?.platformKey).toBe('web')
  })

  it('invokes check_for_updates over IPC inside the native shell', async () => {
    shell.inside = true
    const mockResult: UpdateCheckResult = {
      status: 'available',
      currentVersion: '0.1.0',
      latestVersion: '0.2.0',
      releaseDate: '2026-11-15T19:00:00Z',
      releaseNotes: 'Cross-platform release candidate',
      downloadUrl: 'https://example.com/update.tar.gz',
      hasSignature: true,
      platformKey: 'linux-x86_64',
      platformSupported: true,
      error: null,
    }
    shell.invoke.mockResolvedValueOnce(mockResult)
    const res = await checkForUpdates()
    expect(res).toEqual(mockResult)
    expect(shell.invoke).toHaveBeenCalledWith('check_for_updates', {})
  })

  it('handles IPC errors gracefully with safe fallback', async () => {
    shell.inside = true
    shell.invoke.mockRejectedValueOnce(new Error('Network unreachable'))
    const res = await checkForUpdates()
    expect(res?.status).toBe('error')
    expect(res?.error).toBe('Network unreachable')
  })

  it('forwards allowPrereleases, force, and extended manifest metadata over IPC', async () => {
    shell.inside = true
    shell.invoke.mockResolvedValueOnce({
      status: 'available',
      currentVersion: '0.6.0',
      latestVersion: '0.7.0-rc.1',
      releaseDate: '2026-12-01T10:00:00Z',
      releaseNotes: 'Release candidate',
      downloadUrl: 'https://github.com/millsydotdev/KinoraTV/releases/download/v0.7.0-rc.1/Kinora.AppImage',
      hasSignature: true,
      platformKey: 'linux-x86_64',
      platformSupported: true,
      error: null,
      manifestUrl: 'https://github.com/millsydotdev/KinoraTV/releases/download/v0.7.0-rc.1/latest.json',
      assetSizeBytes: 64_000_000,
      releaseUrl: 'https://github.com/millsydotdev/KinoraTV/releases/tag/v0.7.0-rc.1',
      cached: false,
    })

    const res = await checkForUpdates(null, true, true)
    expect(shell.invoke).toHaveBeenCalledWith('check_for_updates', {
      allowPrereleases: true,
      force: true,
    })
    expect(res?.manifestUrl).toContain('v0.7.0-rc.1/latest.json')
    expect(res?.assetSizeBytes).toBe(64_000_000)
    expect(res?.releaseUrl).toContain('/releases/tag/v0.7.0-rc.1')
    expect(res?.cached).toBe(false)
  })

  it('invokes install_discovered_update and restart_app inside the native shell', async () => {
    const { installUpdate, restartApp } = await import('./native')
    shell.inside = true
    shell.invoke.mockResolvedValueOnce({
      success: true,
      restartRequired: true,
      installedVersion: '0.6.5',
      error: null,
    })
    const outcome = await installUpdate(
      undefined,
      'https://github.com/millsydotdev/KinoraTV/releases/download/v0.6.5/latest.json',
    )
    expect(shell.invoke).toHaveBeenCalledWith('install_discovered_update', {
      manifestUrl: 'https://github.com/millsydotdev/KinoraTV/releases/download/v0.6.5/latest.json',
    })
    expect(outcome).toEqual({
      success: true,
      restartRequired: true,
      installedVersion: '0.6.5',
      error: undefined,
    })

    shell.invoke.mockResolvedValueOnce(undefined)
    await restartApp()
    expect(shell.invoke).toHaveBeenCalledWith('restart_app')
  })
})
