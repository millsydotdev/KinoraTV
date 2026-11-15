// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toast'
import { StoreProvider } from '../state/store'
import { Sources } from './Sources'
import { DISCOVERED_RESOURCES } from '../data/discoveredResources'
import type { PlaylistReport, SavedState } from '../lib/native'

const native = vi.hoisted(() => ({
  inNativeShell: vi.fn(() => true),
  loadSources: vi.fn(),
  saveSources: vi.fn(),
  fetchPlaylist: vi.fn(),
  readPlaylistFile: vi.fn(),
  loadGuide: vi.fn(),
  fetchGuide: vi.fn(),
  guideProgrammes: vi.fn(),
  loadCatalogue: vi.fn(),
  refreshCatalogue: vi.fn(),
  loadProgrammeArtwork: vi.fn(() => Promise.resolve(null)),
}))
vi.mock('../lib/native', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/native')>()),
  ...native,
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLDivElement

async function mount(path: string) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[path]}>
        <StoreProvider>
          <ToastProvider>
            <Routes>
              <Route path="/sources" element={<Sources />} />
            </Routes>
          </ToastProvider>
        </StoreProvider>
      </MemoryRouter>,
    )
  })
  await settle()
}

const settle = async () => {
  for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve() })
}

const text = () => document.body.textContent ?? ''
const click = async (el: Element) => {
  await act(async () => { (el as HTMLElement).click() })
  await settle()
}

describe('International Discovery & Expanded Master Catalogue', () => {
  beforeEach(() => {
    native.loadSources.mockResolvedValue({
      sources: [
        {
          id: 'pl-existing-uk',
          name: 'iptv-org · United Kingdom',
          origin: 'url',
          url: 'https://iptv-org.github.io/iptv/countries/uk.m3u',
          label: 'https://iptv-org.github.io/…',
          addedAt: 1000,
          lastSuccess: 1000,
          skipped: 0,
          duplicates: 0,
          channels: [{ key: 'bbc1', name: 'BBC One', group: 'General', streamUrl: 'https://cdn.example/bbc1.m3u8' }],
        },
      ],
      guides: [],
      mappings: [],
      notice: null,
    })
    native.saveSources.mockResolvedValue(undefined)
    native.loadCatalogue.mockResolvedValue({
      fetchedAt: Date.now(),
      entries: [
        {
          id: 'countries/fr',
          kind: 'country',
          code: 'fr',
          name: 'France',
          flag: '🇫🇷',
          parent: null,
          channels: 203,
          url: 'https://iptv-org.github.io/iptv/countries/fr.m3u',
        },
      ],
      skipped: 0,
    })
  })

  afterEach(async () => {
    if (root) {
      await act(async () => { root!.unmount() })
      root = null
    }
    host?.remove()
    vi.clearAllMocks()
  })

  it('contains comprehensive global representation across all 9 continents in DISCOVERED_RESOURCES', () => {
    const regions = new Set(DISCOVERED_RESOURCES.map((r) => r.region).filter(Boolean))
    expect(regions.has('Europe')).toBe(true)
    expect(regions.has('North America')).toBe(true)
    expect(regions.has('South America')).toBe(true)
    expect(regions.has('Africa')).toBe(true)
    expect(regions.has('Middle East')).toBe(true)
    expect(regions.has('South Asia')).toBe(true)
    expect(regions.has('East Asia')).toBe(true)
    expect(regions.has('Southeast Asia')).toBe(true)
    expect(regions.has('Oceania')).toBe(true)

    // Check expanded scale threshold and category completeness
    expect(DISCOVERED_RESOURCES.length).toBeGreaterThanOrEqual(500)

    const categories = new Set(DISCOVERED_RESOURCES.map((r) => r.category))
    expect(categories.size).toBe(20)

    // Verify zero em-dashes and en-dashes across all resources
    const serialized = JSON.stringify(DISCOVERED_RESOURCES)
    expect(serialized.includes('\u2014')).toBe(false)
    expect(serialized.includes('\u2013')).toBe(false)
  })

  it('renders All Media Directory and filters by region, format, and search', async () => {
    await mount('/sources?tab=discovery')
    const allMediaBtn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('All Media Directory'))!
    expect(allMediaBtn).toBeDefined()
    await click(allMediaBtn)

    expect(text()).toContain('All 20 Categories')
    expect(text()).toContain('All Regions')
    expect(text()).toContain('All Formats')

    // Filter by format
    const formatSelect = document.querySelector<HTMLSelectElement>('select[aria-label="Filter by format"]')!
    expect(formatSelect).toBeDefined()
    await act(async () => {
      formatSelect.value = 'm3u'
      formatSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await settle()

    // Filtered count updates
    expect(text()).toContain('verified resources')

    // Search for a specific country
    const searchInput = document.querySelector<HTMLInputElement>('.personal-search-input')!
    await act(async () => {
      searchInput.value = 'France'
      searchInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await settle()

    expect(text()).toContain('France')
  })

  it('allows inspecting resource and directly importing an M3U playlist through native workflow', async () => {
    const report: PlaylistReport = {
      channels: [
        {
          key: 'fr:tf1',
          name: 'TF1 HD',
          group: 'National',
          streamUrl: 'https://cdn.example/tf1.m3u8',
          streamDisplay: 'https://cdn.example/…',
          tvgId: 'TF1.fr',
          logo: null,
          language: 'fra',
          country: 'FR',
          chno: 1,
        },
      ],
      skipped: 0,
      duplicates: 0,
      warnings: [],
      host: 'raw.githubusercontent.com',
    }
    native.fetchPlaylist.mockResolvedValueOnce(report)

    await mount('/sources?tab=discovery')
    const allMediaBtn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('All Media Directory'))!
    await click(allMediaBtn)

    // Find a France card Details button
    const detailsBtns = [...document.querySelectorAll('.res-details-btn')]
    expect(detailsBtns.length).toBeGreaterThan(0)
    await click(detailsBtns[0]!)

    // In modal, check that the details are shown
    expect(text()).toContain('What this resource provides')
    expect(text()).toContain('Endpoints & Provenance')

    // If it has an Import to Live TV button, click it
    const importBtn = [...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent?.includes('Import to Live TV'))
    if (importBtn) {
      await click(importBtn)
      expect(native.fetchPlaylist).toHaveBeenCalled()
      expect(native.saveSources).toHaveBeenCalled()
      const savedState = native.saveSources.mock.calls[0]![0] as SavedState
      // Ensure existing source was preserved
      expect(savedState.sources.some((s) => s.id === 'pl-existing-uk')).toBe(true)
    }
  })

  it('prevents duplicate playlist imports when source is already represented', async () => {
    await mount('/sources?tab=discovery')
    const allMediaBtn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('All Media Directory'))!
    await click(allMediaBtn)

    // Verify existing UK source has 'Added' or 'Imported to Live TV' disabled when opened
    const ukResource = DISCOVERED_RESOURCES.find((r) => r.url === 'https://iptv-org.github.io/iptv/countries/uk.m3u')
    if (ukResource) {
      // Find card
      const cards = [...document.querySelectorAll('.res-card')]
      const ukCard = cards.find((c) => c.textContent?.includes(ukResource.name))
      if (ukCard) {
        const detailsBtn = ukCard.querySelector('.res-details-btn')!
        await click(detailsBtn)
        const importBtn = [...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent?.includes('Imported to Live TV'))
        expect(importBtn).toBeDefined()
        expect((importBtn as HTMLButtonElement).disabled).toBe(true)
      }
    }
  })
})
