// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toast'
import type {
  XtreamCatalogue,
  XtreamConnectionReport,
} from '../lib/native'
import { StoreProvider, useStore } from '../state/store'
import { AddSource, Sources } from './Sources'

const mockNative = vi.hoisted(() => ({
  testXtreamConnection: vi.fn(),
  connectXtream: vi.fn(),
  disconnectXtream: vi.fn(),
  openXtreamStream: vi.fn(),
  openStream: vi.fn(),
  loadXtreamVodDetails: vi.fn(),
  loadXtreamEpg: vi.fn(),
  loadSources: vi.fn(),
  saveSources: vi.fn(),
}))

vi.mock('../lib/native', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/native')>()),
  testXtreamConnection: mockNative.testXtreamConnection,
  connectXtream: mockNative.connectXtream,
  disconnectXtream: mockNative.disconnectXtream,
  openXtreamStream: mockNative.openXtreamStream,
  openStream: mockNative.openStream,
  loadXtreamVodDetails: mockNative.loadXtreamVodDetails,
  loadXtreamEpg: mockNative.loadXtreamEpg,
  loadSources: mockNative.loadSources,
  saveSources: mockNative.saveSources,
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let host: HTMLDivElement

function TestInspector({ onStore }: { onStore: (s: ReturnType<typeof useStore>) => void }) {
  const s = useStore()
  onStore(s)
  return null
}

const sampleReport: XtreamConnectionReport = {
  success: true,
  message: 'Provider connected successfully.',
  capabilities: {
    hasLive: true,
    hasVod: true,
    hasSeries: true,
    hasEpg: true,
    hasCatchup: true,
    liveCount: 120,
    vodCount: 450,
    seriesCount: 35,
    liveCategoriesCount: 8,
    vodCategoriesCount: 12,
    seriesCategoriesCount: 5,
  },
  userInfo: {
    username: 'testuser',
    status: 'Active',
    expDate: '2027-12-31',
    isTrial: '0',
    activeCons: '1',
    maxConnections: '2',
    createdAt: '1600000000',
    auth: 1,
  },
  serverInfo: {
    url: 'provider.example',
    port: '8080',
    httpsPort: '8080',
    serverProtocol: 'https',
    rtmpPort: '8880',
    timezone: 'UTC',
    timeNow: '2026-11-15 00:00:00',
  },
}

const sampleCatalogue: XtreamCatalogue = {
  movies: [
    {
      id: '101',
      name: 'Inception',
      categoryId: '10',
      categoryName: 'Sci-Fi',
      rating: 8.8,
      plot: 'A thief steals corporate secrets through dream-sharing technology.',
      extension: 'mp4',
      artworkKey: 'xtream:vod:101',
      year: 2010,
    },
  ],
  series: [
    {
      id: '201',
      name: 'Planet Earth',
      categoryId: '20',
      categoryName: 'Documentary',
      rating: 9.5,
      plot: 'A documentary series exploring natural habitats.',
      extension: 'mp4',
      artworkKey: 'xtream:series:201',
      year: 2006,
    },
  ],
  liveStreams: [
    {
      id: '301',
      num: 1,
      name: 'BBC News HD',
      streamType: 'live',
      streamIcon: 'https://img.example/bbc.png',
      epgChannelId: 'bbc.news.uk',
      categoryId: '1',
      categoryIds: ['1'],
      tvArchive: 1,
      tvArchiveDuration: 7,
      artworkKey: 'xtream:live:301',
    },
    {
      id: '302',
      num: 2,
      name: 'Sky Sports Premier League',
      streamType: 'live',
      streamIcon: 'https://img.example/skysports.png',
      epgChannelId: 'sky.sports.uk',
      categoryId: '2',
      categoryIds: ['2'],
      tvArchive: 0,
      tvArchiveDuration: 0,
      artworkKey: 'xtream:live:302',
    },
  ],
  liveCategories: [
    { id: '1', name: 'News', parentId: null },
    { id: '2', name: 'Sports', parentId: null },
  ],
  vodCategories: [
    { id: '10', name: 'Sci-Fi', parentId: null },
  ],
  seriesCategories: [
    { id: '20', name: 'Documentary', parentId: null },
  ],
  capabilities: sampleReport.capabilities,
  userInfo: sampleReport.userInfo,
  serverInfo: sampleReport.serverInfo,
}

describe('Xtream Codes IPTV Provider Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNative.loadSources.mockResolvedValue({
      version: 2,
      playlists: [],
      sources: [],
      guides: [],
      mappings: [],
      xtream: [],
    })
    mockNative.saveSources.mockResolvedValue(undefined)
    mockNative.disconnectXtream.mockResolvedValue(undefined)
  })

  afterEach(() => {
    if (root) {
      act(() => { root.unmount() })
    }
    if (host && host.parentNode) {
      host.parentNode.removeChild(host)
    }
  })

  it('tests connection and reports provider capabilities honestly', async () => {
    mockNative.testXtreamConnection.mockResolvedValue(sampleReport)

    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/sources/add?kind=xtream']}>
          <StoreProvider>
            <ToastProvider>
              <Routes>
                <Route path="/sources/add" element={<AddSource />} />
              </Routes>
            </ToastProvider>
          </StoreProvider>
        </MemoryRouter>,
      )
    })

    const urlInput = host.querySelector<HTMLInputElement>('input[type="url"]')!
    const textInputs = host.querySelectorAll<HTMLInputElement>('input[type="text"]')
    const passInput = host.querySelector<HTMLInputElement>('input[type="password"]')!
    const usernameInput = textInputs[0]!

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(urlInput, 'https://provider.example:8080')
      urlInput.dispatchEvent(new Event('input', { bubbles: true }))

      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(usernameInput, 'testuser')
      usernameInput.dispatchEvent(new Event('input', { bubbles: true }))

      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(passInput, 'secret123')
      passInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const testBtn = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Test Connection'))!
    expect(testBtn).toBeDefined()

    await act(async () => {
      testBtn.click()
    })

    expect(mockNative.testXtreamConnection).toHaveBeenCalledWith('https://provider.example:8080', 'testuser', 'secret123')

    const bodyText = host.textContent ?? ''
    expect(bodyText).toContain('Provider connected successfully.')
    expect(bodyText).toContain('Live TV: 120 channels across 8 categories')
    expect(bodyText).toContain('Movies / VOD: 450 titles across 12 categories')
    expect(bodyText).toContain('Series: 35 series across 5 categories')
    expect(bodyText).toContain('EPG Guide: Available')
    expect(bodyText).toContain('Catch-up TV: Supported')
    expect(bodyText).toContain('Account Status: Active (Expires: 2027-12-31)')
  })

  it('imports an Xtream provider as ONE managed source and integrates Live TV into store.channels', async () => {
    mockNative.connectXtream.mockResolvedValue(sampleCatalogue)

    let storeRef: ReturnType<typeof useStore> | null = null

    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/sources/add?kind=xtream']}>
          <StoreProvider>
            <ToastProvider>
              <TestInspector onStore={(s) => { storeRef = s }} />
              <Routes>
                <Route path="/sources/add" element={<AddSource />} />
                <Route path="/sources" element={<Sources />} />
              </Routes>
            </ToastProvider>
          </StoreProvider>
        </MemoryRouter>,
      )
    })

    const urlInput = host.querySelector<HTMLInputElement>('input[type="url"]')!
    const usernameInput = host.querySelectorAll<HTMLInputElement>('input[type="text"]')[0]!
    const passInput = host.querySelector<HTMLInputElement>('input[type="password"]')!

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(urlInput, 'https://provider.example:8080')
      urlInput.dispatchEvent(new Event('input', { bubbles: true }))

      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(usernameInput, 'testuser')
      usernameInput.dispatchEvent(new Event('input', { bubbles: true }))

      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(passInput, 'secret123')
      passInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const submitBtn = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Connect & Import Provider Services'))!
    await act(async () => {
      submitBtn.click()
    })

    // Advance to Step 2
    expect(host.textContent).toContain('Provider services discovered')
    expect(host.textContent).toContain('Live TV: 2 channels across 2 categories')
    expect(host.textContent).toContain('Movies / VOD: 1 titles across 1 categories')
    expect(host.textContent).toContain('Series: 1 series across 1 categories')

    const continueBtn = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Continue'))!
    await act(async () => {
      continueBtn.click()
    })

    // Advance to Step 3
    expect(host.textContent).toContain('Single unified provider source')
    const addBtn = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Add Provider Source'))!
    await act(async () => {
      addBtn.click()
    })

    // Verify unified managed source exists in store
    expect(storeRef).not.toBeNull()
    const xtSources = storeRef!.xtreamSources
    expect(xtSources).toHaveLength(1)
    const src = xtSources[0]!
    expect(src.name).toBe('My provider')
    expect(src.liveChannels).toBe(2)
    expect(src.movies).toBe(1)
    expect(src.series).toBe(1)
    expect(src.hasLive).toBe(true)
    expect(src.hasVod).toBe(true)
    expect(src.hasSeries).toBe(true)
    expect(src.hasEpg).toBe(true)
    expect(src.hasCatchup).toBe(true)
    expect(src.enabled).toBe(true)

    // Verify Live TV channels are populated in store.channels
    const liveChannels = storeRef!.channels
    expect(liveChannels.some((c) => c.name === 'BBC News HD')).toBe(true)
    expect(liveChannels.some((c) => c.name === 'Sky Sports Premier League')).toBe(true)

    const bbc = liveChannels.find((c) => c.name === 'BBC News HD')!
    expect(bbc.group).toBe('News')
    expect(bbc.tvgId).toBe('bbc.news.uk')
    expect(bbc.streamUrl).toBe(`xtream://${src.id}/live/301`)
  })

  it('toggles provider enabled state and updates Live TV channel availability', async () => {
    mockNative.connectXtream.mockResolvedValue(sampleCatalogue)

    let storeRef: ReturnType<typeof useStore> | null = null

    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/sources']}>
          <StoreProvider>
            <ToastProvider>
              <TestInspector onStore={(s) => { storeRef = s }} />
              <Routes>
                <Route path="/sources" element={<Sources />} />
              </Routes>
            </ToastProvider>
          </StoreProvider>
        </MemoryRouter>,
      )
    })

    // Add source directly through store
    const providerSource = {
      id: 'xt-source-1',
      name: 'Omni Provider',
      addedAt: Date.now(),
      lastSuccess: Date.now(),
      movies: 1,
      series: 1,
      liveChannels: 2,
      hasLive: true,
      hasVod: true,
      hasSeries: true,
      hasEpg: true,
      hasCatchup: true,
      status: 'Active',
      expDate: '2028-01-01',
      capabilities: sampleCatalogue.capabilities,
      userInfo: sampleCatalogue.userInfo,
      serverInfo: sampleCatalogue.serverInfo,
      connected: true,
      server: 'https://provider.example:8080',
      enabled: true,
    }

    await act(async () => {
      storeRef!.addXtreamSource(providerSource, sampleCatalogue)
    })

    // Enabled: Channels are present
    expect(storeRef!.channels.some((c) => c.name === 'BBC News HD')).toBe(true)

    // Disable provider
    await act(async () => {
      storeRef!.toggleXtreamSource('xt-source-1', false)
    })

    // Disabled: Channels should no longer appear in store.channels
    expect(storeRef!.channels.some((c) => c.name === 'BBC News HD')).toBe(false)

    // Re-enable provider
    await act(async () => {
      storeRef!.toggleXtreamSource('xt-source-1', true)
    })

    // Channels are present again
    expect(storeRef!.channels.some((c) => c.name === 'BBC News HD')).toBe(true)
  })

  it('removes an Xtream provider cleanly and evicts all associated media', async () => {
    let storeRef: ReturnType<typeof useStore> | null = null

    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/sources']}>
          <StoreProvider>
            <ToastProvider>
              <TestInspector onStore={(s) => { storeRef = s }} />
              <Routes>
                <Route path="/sources" element={<Sources />} />
              </Routes>
            </ToastProvider>
          </StoreProvider>
        </MemoryRouter>,
      )
    })

    const providerSource = {
      id: 'xt-source-evict',
      name: 'Evictable Provider',
      addedAt: Date.now(),
      lastSuccess: Date.now(),
      movies: 1,
      series: 1,
      liveChannels: 2,
      hasLive: true,
      hasVod: true,
      hasSeries: true,
      hasEpg: true,
      hasCatchup: false,
      status: 'Active',
      expDate: null,
      capabilities: sampleCatalogue.capabilities,
      userInfo: sampleCatalogue.userInfo,
      serverInfo: sampleCatalogue.serverInfo,
      connected: true,
      server: 'https://provider.example:8080',
      enabled: true,
    }

    await act(async () => {
      storeRef!.addXtreamSource(providerSource, sampleCatalogue)
    })

    expect(storeRef!.xtreamSources).toHaveLength(1)
    expect(storeRef!.channels.some((c) => c.name === 'BBC News HD')).toBe(true)

    // Remove provider
    await act(async () => {
      storeRef!.removeXtreamSource('xt-source-evict')
    })

    expect(mockNative.disconnectXtream).toHaveBeenCalledWith('xt-source-evict')
    expect(storeRef!.xtreamSources).toHaveLength(0)
    expect(storeRef!.channels.some((c) => c.name === 'BBC News HD')).toBe(false)
  })
})
