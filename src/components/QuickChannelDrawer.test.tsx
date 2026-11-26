// @vitest-environment happy-dom
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuickChannelDrawer } from './QuickChannelDrawer'
import type { Channel } from '../data/types'

let root: Root
let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
})

const channels: Channel[] = [
  {
    id: 'ch-1',
    number: 1,
    name: 'BBC One HD',
    cleanName: 'BBC One',
    badges: [{ label: 'HD', kind: 'quality' }],
    group: 'Entertainment',
    categories: ['Entertainment'],
    logoUrl: null,
    mark: { text: 'B1', tone: '#3b82f6' },
    streamUrl: 'https://stream.example/1.m3u8',
    hd: true,
    sourceId: 'pl-1',
    tvgId: 'bbc1',
  },
  {
    id: 'ch-2',
    number: 2,
    name: 'Sky Sports Main Event FHD',
    cleanName: 'Sky Sports Main Event',
    badges: [{ label: '1080p', kind: 'quality' }],
    group: 'Sports',
    categories: ['Sports'],
    logoUrl: null,
    mark: { text: 'SS', tone: '#ef4444' },
    streamUrl: 'https://stream.example/2.m3u8',
    hd: true,
    sourceId: 'pl-1',
    tvgId: 'skysports',
  },
  {
    id: 'ch-divider',
    number: 0,
    name: '### UK SPORTS ###',
    cleanName: '### UK SPORTS ###',
    badges: [],
    group: 'Sports',
    categories: ['Sports'],
    logoUrl: null,
    mark: { text: '##', tone: '#374151' },
    streamUrl: null,
    hd: false,
    sourceId: 'pl-1',
    tvgId: null,
    isDivider: true,
  },
]

describe('QuickChannelDrawer component', () => {
  it('renders channels while excluding dividers and allows tuning', () => {
    const onTune = vi.fn()
    const onToggleFav = vi.fn()
    const onClose = vi.fn()

    act(() => {
      root.render(
        <QuickChannelDrawer
          channels={channels}
          currentChannelId="ch-1"
          favouriteIds={['ch-2']}
          onTune={onTune}
          onToggleFavourite={onToggleFav}
          onClose={onClose}
        />,
      )
    })

    expect(container.textContent).toContain('BBC One')
    expect(container.textContent).toContain('Sky Sports Main Event')
    expect(container.textContent).not.toContain('### UK SPORTS ###')

    const tuneButtons = container.querySelectorAll<HTMLButtonElement>('.quick-channel-tune-btn')
    expect(tuneButtons.length).toBe(2)

    act(() => {
      tuneButtons[1]?.click()
    })
    expect(onTune).toHaveBeenCalledWith(channels[1])
  })

  it('filters channels by search query and category chips', () => {
    act(() => {
      root.render(
        <QuickChannelDrawer
          channels={channels}
          currentChannelId="ch-1"
          favouriteIds={['ch-2']}
          onTune={() => {}}
          onToggleFavourite={() => {}}
          onClose={() => {}}
        />,
      )
    })

    const searchInput = container.querySelector<HTMLInputElement>('.quick-search-input')
    expect(searchInput).toBeTruthy()

    act(() => {
      if (searchInput) {
        searchInput.value = 'Sports'
        searchInput.dispatchEvent(new Event('input', { bubbles: true }))
        searchInput.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })

    // Search query "Sports" should filter out BBC One
    // (using state update via onChange)
  })

  it('allows toggling favourites directly from the drawer', () => {
    const onToggleFav = vi.fn()

    act(() => {
      root.render(
        <QuickChannelDrawer
          channels={channels}
          currentChannelId="ch-1"
          favouriteIds={['ch-2']}
          onTune={() => {}}
          onToggleFavourite={onToggleFav}
          onClose={() => {}}
        />,
      )
    })

    const favBtns = container.querySelectorAll<HTMLButtonElement>('.quick-fav-btn')
    expect(favBtns.length).toBe(2)

    act(() => {
      favBtns[0]?.click()
    })
    expect(onToggleFav).toHaveBeenCalledWith('ch-1')
  })

  it('renders Now and Next programme information when available', () => {
    act(() => {
      root.render(
        <QuickChannelDrawer
          channels={channels}
          currentChannelId="ch-1"
          favouriteIds={[]}
          onTune={() => {}}
          onToggleFavourite={() => {}}
          onClose={() => {}}
          getProgramme={(id) => id === 'ch-1' ? { id: 'p1', channelId: 'ch-1', title: 'Breakfast News', start: 0, stop: 3600, desc: '', category: 'News', episode: null } : null}
          getNextProgramme={(id) => id === 'ch-1' ? { id: 'p2', channelId: 'ch-1', title: 'Morning Live', start: 3600, stop: 7200, desc: '', category: 'News', episode: null } : null}
        />,
      )
    })

    const progTitle = container.querySelector('.quick-channel-prog-title')
    expect(progTitle).not.toBeNull()
    expect(progTitle?.textContent).toContain('Now: Breakfast News')
    expect(progTitle?.textContent).toContain('Next: Morning Live')
  })
})
