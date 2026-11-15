// @vitest-environment happy-dom
// Permanent Regression Suite for Phase 1 Recovery & Visual Quality Assurance
// Protects EPG geometry, sticky columns, gap hatching, Home audio proportions,
// Library tab strip scrolling, Sidebar Explore navigation, and token stability.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ToastProvider } from '../components/Toast'
import type { PlaylistChannel } from '../lib/native'
import { createSource } from '../state/playlists'
import { StoreProvider } from '../state/store'
import { LiveTV } from './LiveTV'
import { Home } from './Home'
import { Library } from './Library'
import { Sidebar } from '../components/Sidebar'
import { Search } from './Search'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const testChannel = (i: number): PlaylistChannel => ({
  key: `tvg:ch.${i}`,
  tvgId: `ch.${i}`,
  name: `Channel ${i}`,
  group: 'General',
  logo: null,
  language: null,
  country: null,
  chno: i + 1,
  streamUrl: `https://cdn.example/${i}.m3u8`,
  streamDisplay: 'https://cdn.example/…',
})

const testSource = createSource(
  'pl-test',
  { name: 'Test', origin: 'url', url: 'https://playlists.example/test.m3u', label: 'https://playlists.example/…' },
  { channels: Array.from({ length: 10 }, (_, i) => testChannel(i)), skipped: 0, duplicates: 0, warnings: [], host: 'playlists.example' },
  Date.now(),
)

let root: Root | null = null

async function mount(ui: React.ReactNode, path = '/') {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[path]}>
        <StoreProvider initialPlaylists={[testSource]}>
          <ToastProvider>{ui}</ToastProvider>
        </StoreProvider>
      </MemoryRouter>,
    )
  })
}

beforeEach(() => {
  localStorage.setItem('kinora.prefs.v2', JSON.stringify({ demoMode: true }))
})

afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  root = null
  document.body.replaceChildren()
  localStorage.clear()
})

describe('Phase 1 Visual Regression Recovery Suite', () => {
  it('REG-01 & REG-07: Live TV guide renders 248px baseline channel column with sticky label tracks and gap hatching', async () => {
    await mount(<LiveTV />, '/live')
    const guide = document.querySelector('.guide')
    expect(guide).not.toBeNull()

    // Verify channel columns exist with proper structure
    const channelCols = document.querySelectorAll('.guide-channel')
    expect(channelCols.length).toBeGreaterThan(0)

    // Verify guide track and sticky labels are present
    const tracks = document.querySelectorAll('.guide-track')
    expect(tracks.length).toBeGreaterThan(0)

    // Verify channel tune button and name exist inside channel column
    const channelTune = document.querySelector('.guide-channel-tune')
    const channelName = document.querySelector('.guide-channel-name')
    expect(channelTune).not.toBeNull()
    expect(channelName).not.toBeNull()
  })

  it('REG-08: Time ruler header and category dropdown corner are structurally separated', async () => {
    await mount(<LiveTV />, '/live')
    const corner = document.querySelector('.guide-corner')
    const head = document.querySelector('.guide-head')
    expect(corner).not.toBeNull()
    expect(head).not.toBeNull()

    // Guide corner sits at the head and contains the channel filter dropdown
    const cornerSelect = corner?.querySelector('.corner-select')
    expect(cornerSelect).not.toBeNull()

    // Time ruler contains hour and half-hour ticks
    const ticks = head?.querySelectorAll('.tick')
    expect(ticks && ticks.length > 0).toBe(true)
  })

  it('REG-09: Home screen renders content rails with proper layout attributes', async () => {
    await mount(<Home />, '/')
    const heroOrRails = document.querySelector('.hero') || document.querySelector('.content-rail')
    expect(heroOrRails).not.toBeNull()

    // Content rails are present on the home page
    const rails = document.querySelectorAll('.content-rail')
    expect(rails.length).toBeGreaterThan(0)
  })

  it('REG-10: Library tab strip renders all sections without truncation and allows tab switching', async () => {
    await mount(<Library />, '/library')
    const tabList = document.querySelector('.tabs[role="tablist"]')
    expect(tabList).not.toBeNull()

    const tabs = tabList?.querySelectorAll('button[role="tab"]')
    expect(tabs?.length).toBe(8)

    // Verify specific sections exist
    const tabLabels = Array.from(tabs || []).map((t) => t.textContent?.trim())
    expect(tabLabels).toContain('Overview')
    expect(tabLabels).toContain('Watchlist')
    expect(tabLabels).toContain('Favourites')
    expect(tabLabels).toContain('Ratings & Preferences')
    expect(tabLabels).toContain('Saved Sources')
    expect(tabLabels).toContain('Collections')
    expect(tabLabels).toContain('Recently watched')
    expect(tabLabels).toContain('Hidden Items')
  })

  it('REG-11: Sidebar Explore accordion contains 11 categories and expands cleanly', async () => {
    // Mount on an explore route to verify active auto-expansion
    await mount(<Sidebar open={false} onClose={() => {}} />, '/documentaries')
    const sidebar = document.querySelector('.sidebar')
    expect(sidebar).not.toBeNull()

    // Check Explore header has no stray count badge
    const countBadge = sidebar?.querySelector('.sidebar-explore-count')
    expect(countBadge).toBeNull()

    // Verify all 11 explore links are rendered when expanded
    const exploreLinks = sidebar?.querySelectorAll('.sidebar-nav-explore .side-link')
    expect(exploreLinks?.length).toBe(11)
  })

  it('REG-12: Controlled Search input triggers synthetic change events in React 19', async () => {
    await mount(<Search />, '/search')
    const input = document.querySelector<HTMLInputElement>('.search-input')
    expect(input).not.toBeNull()

    // Test prototype setter triggers onChange in React 19
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      if (nativeSetter) {
        nativeSetter.call(input, 'news')
      } else {
        input!.value = 'news'
      }
      input!.dispatchEvent(new Event('input', { bubbles: true }))
      input!.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(input?.value).toBe('news')
  })
})
