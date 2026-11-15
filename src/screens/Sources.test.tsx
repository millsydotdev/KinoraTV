import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ChannelCard } from '../components/Tiles'
import { ToastProvider } from '../components/Toast'
import type { PlaylistReport } from '../lib/native'
import { addressLabel, createSource, type PlaylistSource } from '../state/playlists'
import { StoreProvider } from '../state/store'
import { PlaylistDetail, PlaylistRow } from './Sources'

// What users see, rendered from the real components. Everything a playlist can carry that might
// identify an account (credentials, tokens, paths, logo signatures) must stay out of the markup.
const SECRET_STREAM = 'http://alice:pw1@provider.example:8080/live/alice/hunter2/1.ts?token=SECRET123'
const SECRET_SOURCE = 'https://playlists.example/get.php?username=alice&password=hunter2&token=SECRET123'
const SECRETS = ['alice', 'pw1', 'hunter2', 'SECRET123', 'LOGOSIG', 'get.php', '/live/', 'provider.example', 'img.example']

const report: PlaylistReport = {
  channels: [
    { key: 'tvg:news.uk', tvgId: 'news.uk', name: 'News One', group: null, logo: 'https://img.example/n.png?sig=LOGOSIG', language: null, country: null, chno: null, streamUrl: SECRET_STREAM, streamDisplay: 'http://provider.example:8080/…' },
  ],
  skipped: 1, duplicates: 0, warnings: ['Line 9: entry has no stream address.'], host: 'playlists.example',
}
const source = createSource('pl-a', { name: 'My lineup', origin: 'url', url: SECRET_SOURCE, label: addressLabel(SECRET_SOURCE) }, report, Date.now())

const render = (node: React.ReactNode) =>
  renderToStaticMarkup(<MemoryRouter><StoreProvider><ToastProvider>{node}</ToastProvider></StoreProvider></MemoryRouter>)
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('imported playlist sources in the UI', () => {
  it('lists a source with its real channel count and says streams are not playback-tested', () => {
    const html = render(<ul><PlaylistRow source={source} now={Date.now()} onOpen={() => {}} /></ul>)
    expect(text(html)).toContain('Parsed · 1 channel')
    expect(text(html)).toContain('Streams not playback-tested')
    for (const s of SECRETS) expect(html).not.toContain(s)
  })

  it('shows source details with a redacted address and no playback claim', () => {
    const html = render(<PlaylistDetail source={source} onRemove={() => {}} />)
    const t = text(html)
    expect(t).toContain('https://playlists.example/…')
    expect(t).toContain('Not tested. Kinora has read the channel list; it has not tried to play any stream.')
    expect(t).toContain('1 malformed, 0 exact repeats')
    expect(t).toContain('Line 9: entry has no stream address.')
    expect(t).toContain('On this device, without stream addresses')
    expect(t).not.toMatch(/\b(working|playable|healthy|available|live)\b/i)
    for (const s of SECRETS) expect(html).not.toContain(s)
  })

  it('reports a failed refresh honestly and keeps saying which channels are still shown', () => {
    const failed: PlaylistSource = { ...source, status: 'failed', error: 'playlists.example did not send the playlist in time.' }
    const t = text(render(<PlaylistDetail source={failed} onRemove={() => {}} />))
    expect(t).toContain('Refresh failed · 1 channel kept')
    expect(t).toContain('playlists.example did not send the playlist in time. The channels from the last successful import are still shown.')
    expect(t).not.toContain('Parsed')
  })

  it('offers re-import, not refresh, for a local file', () => {
    const file = createSource('pl-f', { name: 'File', origin: 'file', url: null, label: 'lineup.m3u' }, report, Date.now())
    const t = text(render(<PlaylistDetail source={file} onRemove={() => {}} />))
    expect(t).toContain('Choose the file again')
    expect(t).toContain('A file cannot be refreshed on its own')
    expect(t).not.toContain('Refresh now')
  })

  it('disables actions while an import is running', () => {
    const html = render(<PlaylistDetail source={{ ...source, status: 'importing' }} onRemove={() => {}} />)
    expect(text(html)).toContain('Refreshing…')
    expect(html.match(/disabled=""/g)).toHaveLength(3)
  })

  it('shows a playlist channel with initials and an Uncategorised group, without guide or live claims', () => {
    const channel = source.channels[0]!
    expect(channel.group).toBe('Uncategorised')
    const html = render(<ChannelCard channel={channel} to="/live" format="24h" at={Date.now()} />)
    const t = text(html)
    expect(t).toContain('News One')
    expect(t).toContain('No guide information')
    expect(t).not.toMatch(/Off air|\bLive\b/)
    expect(html).not.toContain('<img')
    for (const s of SECRETS) expect(html).not.toContain(s)
  })
})
