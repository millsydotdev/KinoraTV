// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toast'
import type { Catalogue, PlaylistReport } from '../lib/native'
import { suggestedEntries } from '../state/catalogue'
import { StoreProvider } from '../state/store'
import { Home } from './Home'
import { LiveTV } from './LiveTV'
import { Setup } from './Setup'

const native = vi.hoisted(() => ({
  inNativeShell: vi.fn(), loadSources: vi.fn(), saveSources: vi.fn(), loadCatalogue: vi.fn(), refreshCatalogue: vi.fn(), fetchPlaylist: vi.fn(),
  openStream: vi.fn(), closeStream: vi.fn(),
}))
vi.mock('../lib/native', async (original) => ({ ...(await original<typeof import('../lib/native')>()), ...native }))
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)

const entry = (code: string, name: string, channels: number | null) => ({ id: `countries/${code}`, kind: 'country' as const, code, name, flag: null, parent: null, channels, url: `https://iptv-org.github.io/iptv/countries/${code}.m3u` })
const catalogue: Catalogue = { fetchedAt: Date.now(), entries: [entry('fr', 'France', 100), entry('uk', 'United Kingdom', null), entry('us', 'United States', 900)] } as unknown as Catalogue
const report: PlaylistReport = {
  channels: [{ key: 'tvg:one', tvgId: 'one', name: 'Real One', group: 'News', logo: null, language: null, country: null, chno: null, streamUrl: 'https://cdn.example/1.m3u8', streamDisplay: 'https://cdn.example/…' }],
  skipped: 0, duplicates: 0, warnings: [], host: 'iptv-org.github.io',
}

let root: Root
const settle = async () => { for (let i = 0; i < 10; i++) await act(async () => { await Promise.resolve() }) }
async function mount(path: string) {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <StoreProvider><ToastProvider><Routes>
          <Route path="/setup" element={<Setup />} />
          <Route path="/" element={<Home />} />
          <Route path="/live" element={<LiveTV />} />
        </Routes></ToastProvider></StoreProvider>
      </MemoryRouter>,
    )
  })
  await settle()
}
const text = () => document.body.textContent ?? ''
const click = async (label: string) => {
  const el = [...document.querySelectorAll<HTMLElement>('button, a')].find((b) => b.textContent?.includes(label))
  if (!el) throw new Error(`no ${label} in: ${text().slice(0, 200)}`)
  await act(async () => { el.click() })
  await settle()
}

beforeEach(() => {
  localStorage.clear()
  for (const fn of Object.values(native)) fn.mockReset()
  native.inNativeShell.mockReturnValue(true)
  native.loadSources.mockResolvedValue({ sources: [], guides: [], mappings: [], notice: null })
  native.saveSources.mockResolvedValue(undefined)
  native.loadCatalogue.mockResolvedValue(catalogue)
  native.refreshCatalogue.mockResolvedValue(catalogue)
  native.fetchPlaylist.mockResolvedValue(report)
})
afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
})

describe('a new user', () => {
  it('sees no fictional content and no network request before choosing to continue', async () => {
    await mount('/setup')
    expect(text()).toContain('Kinora has no channels or films of its own')
    expect(native.loadCatalogue).not.toHaveBeenCalled()
    expect(native.refreshCatalogue).not.toHaveBeenCalled()
    expect(native.fetchPlaylist).not.toHaveBeenCalled()
    expect(text()).not.toContain('Harbour Lights')
  })

  it('reaches real channels: country, read, Live TV', async () => {
    await mount('/setup')
    await click('Find channels')
    await click('United States')
    expect(native.fetchPlaylist).toHaveBeenCalledWith('https://iptv-org.github.io/iptv/countries/us.m3u')
    await click('Continue')
    expect(text()).toContain('You are ready to watch')
    await click('Open Live TV')
    expect(text()).toContain('Real One')
    expect(JSON.parse(localStorage.getItem('kinora.setup.v1') ?? '{}')).toEqual({ done: true })
  })

  it('can skip every step and is told how to come back', async () => {
    await mount('/setup')
    await click('Find channels')
    await click('Skip this step')
    expect(text()).toContain('open this setup again from Settings')
    await click('Go to Home')
    expect(text()).toContain('Nothing to watch yet')
  })

  it('a failed read says so and keeps the step usable', async () => {
    native.fetchPlaylist.mockRejectedValueOnce(new Error('offline'))
    await mount('/setup')
    await click('Find channels')
    await click('United States')
    expect(document.querySelector('[role="alert"]')).not.toBeNull()
    await click('United States')
    expect(text()).toContain('Added')
  })

  it('offline with no catalogue, setup can still be skipped', async () => {
    native.loadCatalogue.mockResolvedValue(null)
    native.refreshCatalogue.mockRejectedValue(new Error('offline'))
    await mount('/setup')
    await click('Find channels')
    expect(text()).toContain('could not be loaded')
    await click('Skip this step')
    expect(text()).toContain('You can do this later')
  })

  it('sample data is a choice, labelled, and goes away with the first real source', async () => {
    await mount('/')
    expect(text()).toContain('Nothing to watch yet')
    await click('Look around with sample data')
    expect(text()).toContain('Harbour Lights')
    expect(text()).toContain('Sample mode')
    expect(JSON.parse(localStorage.getItem('kinora.library.v2') ?? '{}').favourites).toEqual([]) // real library untouched
  })

  it('suggests the system country first, writing GB as iptv-org does', () => {
    const list = suggestedEntries(catalogue.entries, 'GB')
    expect(list.map((e) => e.code)).toEqual(['uk', 'us', 'fr'])
  })
})

describe('Watching follows the player, not the selection', () => {
  it('a new Live TV page marks nothing, and choosing a channel is not watching until media plays', async () => {
    localStorage.setItem('kinora.setup.v1', JSON.stringify({ done: true }))
    native.loadSources.mockResolvedValue({
      sources: [{ id: 'pl-a', name: 'A', origin: 'url', url: 'https://x.example/a.m3u', label: 'x', addedAt: 1, lastSuccess: 1, skipped: 0, duplicates: 0, channels: [{ key: 'tvg:one', tvgId: 'one', name: 'Real One', group: 'News', chno: null }] }],
      guides: [], mappings: [], notice: null,
    })
    native.openStream.mockReturnValue(new Promise(() => undefined)) // never opens
    await mount('/live')
    expect(text()).not.toContain('Watching')
    expect(document.querySelector('[aria-current="true"]')).toBeNull()
    await settle()
    const tune = document.querySelector<HTMLElement>('.guide-channel-tune')!
    await act(async () => { tune.click() })
    await settle()
    expect(document.querySelector('[aria-current="true"]')).not.toBeNull()
    expect(text()).not.toContain('Watching')
    expect(text()).not.toContain('Now Playing')
    expect(text()).toContain('Opening: Real One')
  })
})
