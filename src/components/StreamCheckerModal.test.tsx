// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StreamCheckerModal } from './StreamCheckerModal'
import * as nativeModule from '../lib/native'
import * as bouquetManager from '../lib/bouquetManager'
import type { Channel } from '../data/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../lib/native', () => ({
  testSourceConnection: vi.fn(),
  isTauri: vi.fn(() => true),
}))

vi.mock('../lib/bouquetManager', () => ({
  createBouquet: vi.fn(),
}))

const mockChannels: Channel[] = [
  {
    id: 'ch-1',
    name: 'BBC One HD',
    number: 101,
    group: 'General',
    categories: ['General'],
    logoUrl: null,
    mark: { text: 'B1', tone: 'emerald' },
    streamUrl: 'https://stream.example/bbc1.m3u8',
    hd: true,
    sourceId: 'src-1',
    tvgId: 'bbc1.uk',
  },
  {
    id: 'ch-2',
    name: 'ITV 1',
    number: 102,
    group: 'Entertainment',
    categories: ['Entertainment'],
    logoUrl: null,
    mark: { text: 'ITV', tone: 'solar' },
    streamUrl: 'https://stream.example/itv1.m3u8',
    hd: true,
    sourceId: 'src-1',
    tvgId: 'itv1.uk',
  },
]

describe('StreamCheckerModal', () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(() => {
    vi.clearAllMocks()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    host.remove()
  })

  it('renders nothing when open is false', async () => {
    await act(async () => {
      root.render(
        <StreamCheckerModal
          open={false}
          onClose={() => {}}
          channels={mockChannels}
        />,
      )
    })

    expect(host.querySelector('.stream-checker-overlay')).toBeNull()
  })

  it('renders dialog and channels when open is true', async () => {
    await act(async () => {
      root.render(
        <StreamCheckerModal
          open={true}
          onClose={() => {}}
          channels={mockChannels}
        />,
      )
    })

    const title = host.querySelector('.stream-checker-title')
    expect(title?.textContent).toBe('Stream Health Inspector')

    const rows = host.querySelectorAll('.stream-checker-table tbody tr')
    expect(rows.length).toBe(2)
    expect(rows[0]?.textContent).toContain('BBC One HD')
    expect(rows[1]?.textContent).toContain('ITV 1')
  })

  it('filters channels using the search input', async () => {
    await act(async () => {
      root.render(
        <StreamCheckerModal
          open={true}
          onClose={() => {}}
          channels={mockChannels}
        />,
      )
    })

    const searchInput = host.querySelector('.stream-checker-search input') as HTMLInputElement
    expect(searchInput).not.toBeNull()

    await act(async () => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set
      nativeInputValueSetter?.call(searchInput, 'BBC')
      searchInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const rows = host.querySelectorAll('.stream-checker-table tbody tr')
    expect(rows.length).toBe(1)
    expect(rows[0]?.textContent).toContain('BBC One HD')
  })

  it('starts inspection and updates results when native checks resolve', async () => {
    vi.mocked(nativeModule.testSourceConnection)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        host: 'stream.example',
        roundTripMs: 45,
        message: 'OK',
        category: 'success',
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        host: 'stream.example',
        roundTripMs: 80,
        message: 'Internal Server Error',
        category: 'http-error',
      })

    await act(async () => {
      root.render(
        <StreamCheckerModal
          open={true}
          onClose={() => {}}
          channels={mockChannels}
        />,
      )
    })

    const startBtn = host.querySelector('.stream-checker-actions button') as HTMLButtonElement
    expect(startBtn.textContent).toContain('Start Inspection')

    await act(async () => {
      startBtn.click()
    })

    // Allow async workers to complete
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    const onlinePill = host.querySelector('.stream-stat-pill.online')
    expect(onlinePill?.textContent).toContain('Online: 1')

    const offlinePill = host.querySelector('.stream-stat-pill.offline')
    expect(offlinePill?.textContent).toContain('Offline: 1')
  })

  it('creates verified bouquet when Create Verified Bouquet is clicked', async () => {
    vi.mocked(nativeModule.testSourceConnection).mockResolvedValue({
      ok: true,
      status: 200,
      host: 'stream.example',
      roundTripMs: 45,
      message: 'OK',
      category: 'success',
    })

    const handleBouquetCreated = vi.fn()

    await act(async () => {
      root.render(
        <StreamCheckerModal
          open={true}
          onClose={() => {}}
          channels={mockChannels}
          onBouquetCreated={handleBouquetCreated}
        />,
      )
    })

    const startBtn = host.querySelector('.stream-checker-actions button') as HTMLButtonElement
    await act(async () => {
      startBtn.click()
    })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    const createBouquetBtn = Array.from(host.querySelectorAll('.stream-checker-actions button')).find(
      (b) => b.textContent?.includes('Create Verified Bouquet'),
    ) as HTMLButtonElement

    expect(createBouquetBtn).not.toBeNull()
    expect(createBouquetBtn.disabled).toBe(false)

    await act(async () => {
      createBouquetBtn.click()
    })

    expect(bouquetManager.createBouquet).toHaveBeenCalled()
    expect(handleBouquetCreated).toHaveBeenCalled()
  })
})
