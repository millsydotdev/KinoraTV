import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IngestError, MAX_PLAYLIST_BYTES, closeStream, fetchPlaylist, getAppInfo, openStream, parseAppInfo, parseOpenedStream, parsePlaylistReport, readPlaylistFile, toIngestError } from './native'

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
