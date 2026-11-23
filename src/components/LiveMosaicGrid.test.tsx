// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveMosaicGrid } from './LiveMosaicGrid'
import type { Channel } from '../data/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockChannels: Channel[] = [
  {
    id: 'ch-1',
    name: 'Sports 1',
    number: 101,
    group: 'Sports',
    categories: ['Sports'],
    logoUrl: null,
    mark: { text: 'S1', tone: 'emerald' },
    streamUrl: 'http://example.com/s1',
    hd: true,
    sourceId: null,
    tvgId: null,
  },
  {
    id: 'ch-2',
    name: 'Sports 2',
    number: 102,
    group: 'Sports',
    categories: ['Sports'],
    logoUrl: null,
    mark: { text: 'S2', tone: 'emerald' },
    streamUrl: 'http://example.com/s2',
    hd: true,
    sourceId: null,
    tvgId: null,
  },
  {
    id: 'ch-3',
    name: 'News 24',
    number: 103,
    group: 'News',
    categories: ['News'],
    logoUrl: null,
    mark: { text: 'N2', tone: 'rose' },
    streamUrl: 'http://example.com/s3',
    hd: false,
    sourceId: null,
    tvgId: null,
  },
  {
    id: 'ch-4',
    name: 'Movies HD',
    number: 104,
    group: 'Movies',
    categories: ['Movies'],
    logoUrl: null,
    mark: { text: 'MH', tone: 'solar' },
    streamUrl: 'http://example.com/s4',
    hd: true,
    sourceId: null,
    tvgId: null,
  },
]

describe('LiveMosaicGrid', () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(() => {
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
        <LiveMosaicGrid
          open={false}
          onClose={() => {}}
          channels={mockChannels}
          onTuneFullChannel={() => {}}
        />,
      )
    })
    expect(host.querySelector('.mosaic-backdrop')).toBeNull()
  })

  it('renders 4 tiles and layout controls when open', async () => {
    await act(async () => {
      root.render(
        <LiveMosaicGrid
          open={true}
          onClose={() => {}}
          channels={mockChannels}
          onTuneFullChannel={() => {}}
        />,
      )
    })

    const title = host.querySelector('.mosaic-title')
    expect(title?.textContent).toBe('Multi-Screen Mosaic')

    const tiles = host.querySelectorAll('.mosaic-tile')
    expect(tiles.length).toBe(4)

    // Slot 0 is focused by default
    expect(tiles[0]?.classList.contains('is-focused')).toBe(true)
  })

  it('switches layout mode between 2x2 and 1+3', async () => {
    await act(async () => {
      root.render(
        <LiveMosaicGrid
          open={true}
          onClose={() => {}}
          channels={mockChannels}
          onTuneFullChannel={() => {}}
        />,
      )
    })

    const grid = host.querySelector('.mosaic-grid')
    expect(grid?.classList.contains('layout-2x2')).toBe(true)

    const focusModeBtn = host.querySelectorAll('.mosaic-btn-mode')[1] as HTMLButtonElement
    await act(async () => {
      focusModeBtn.click()
    })

    expect(grid?.classList.contains('layout-1+3')).toBe(true)
  })

  it('switches audio focus on tile click', async () => {
    await act(async () => {
      root.render(
        <LiveMosaicGrid
          open={true}
          onClose={() => {}}
          channels={mockChannels}
          onTuneFullChannel={() => {}}
        />,
      )
    })

    const tiles = host.querySelectorAll('.mosaic-tile')
    const tile2 = tiles[1] as HTMLElement

    await act(async () => {
      tile2.click()
    })

    expect(tile2.classList.contains('is-focused')).toBe(true)
  })

  it('calls onTuneFullChannel when full screen action is clicked', async () => {
    const handleTune = vi.fn()
    const handleClose = vi.fn()

    await act(async () => {
      root.render(
        <LiveMosaicGrid
          open={true}
          onClose={handleClose}
          channels={mockChannels}
          onTuneFullChannel={handleTune}
        />,
      )
    })

    const fullscreenBtn = host.querySelector(
      '.mosaic-tile.slot-0 .mosaic-tile-action-btn[title="Watch Fullscreen"]',
    ) as HTMLButtonElement
    expect(fullscreenBtn).not.toBeNull()

    await act(async () => {
      fullscreenBtn.click()
    })

    expect(handleTune).toHaveBeenCalledWith(mockChannels[0])
    expect(handleClose).toHaveBeenCalled()
  })

  it('switches layout mode to 2x1 Dual Split and displays dual mode', async () => {
    await act(async () => {
      root.render(
        <LiveMosaicGrid
          open={true}
          onClose={() => {}}
          channels={mockChannels}
          onTuneFullChannel={() => {}}
        />,
      )
    })

    const grid = host.querySelector('.mosaic-grid')
    expect(grid?.classList.contains('layout-2x2')).toBe(true)

    const dualBtn = host.querySelectorAll('.mosaic-btn-mode')[2] as HTMLButtonElement
    expect(dualBtn?.textContent).toContain('2×1 Dual')
    await act(async () => {
      dualBtn.click()
    })

    expect(grid?.classList.contains('layout-2x1')).toBe(true)
  })

  it('swaps a secondary tile to primary slot 0 on swap button click', async () => {
    await act(async () => {
      root.render(
        <LiveMosaicGrid
          open={true}
          onClose={() => {}}
          channels={mockChannels}
          onTuneFullChannel={() => {}}
        />,
      )
    })

    // Initially slot 0 has Sports 1 and slot 1 has Sports 2
    expect(host.querySelector('.mosaic-tile.slot-0 .mosaic-ch-title')?.textContent).toBe('Sports 1')
    expect(host.querySelector('.mosaic-tile.slot-1 .mosaic-ch-title')?.textContent).toBe('Sports 2')

    // Find swap button on slot 1
    const swapBtn = host.querySelector(
      '.mosaic-tile.slot-1 .mosaic-tile-action-btn[title="Swap to Primary Screen"]',
    ) as HTMLButtonElement
    expect(swapBtn).not.toBeNull()

    await act(async () => {
      swapBtn.click()
    })

    // After swapping, slot 0 has Sports 2 and slot 1 has Sports 1
    expect(host.querySelector('.mosaic-tile.slot-0 .mosaic-ch-title')?.textContent).toBe('Sports 2')
    expect(host.querySelector('.mosaic-tile.slot-1 .mosaic-ch-title')?.textContent).toBe('Sports 1')
  })
})
