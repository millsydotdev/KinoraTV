// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatchupBrowserModal } from './CatchupBrowserModal'
import { StoreContext } from '../state/store'
import type { Channel, Programme } from '../data/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('CatchupBrowserModal UI Component', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  const testChannel: Channel = {
    id: 'ch-xt-bbc',
    number: 1,
    name: 'BBC One HD',
    group: 'Entertainment',
    categories: ['Entertainment'],
    logoUrl: null,
    mark: { text: 'BBC', tone: '#222' },
    streamUrl: 'xtream://src-1/live/1.ts',
    hd: true,
    sourceId: 'src-xtream-1',
    xtreamStreamId: '101',
    tvgId: 'bbc1.uk',
    tvArchive: 1,
    tvArchiveDuration: 7,
  }

  const now = Date.now()
  const testProgramme: Programme = {
    id: 'p-evening-news',
    channelId: 'ch-xt-bbc',
    title: 'Evening News Hour',
    desc: 'Comprehensive daily news coverage.',
    category: 'News',
    episode: null,
    start: now - 3600000,
    stop: now - 1800000,
  }

  const mockStore = {
    channels: [testChannel],
    schedule: (_c: Channel, _day: number) => [testProgramme],
  } as unknown as Parameters<typeof StoreContext.Provider>[0]['value']

  it('renders catch-up browser with day tabs and broadcasts', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    act(() => {
      root.render(
        <MemoryRouter>
          <StoreContext.Provider value={mockStore}>
            <CatchupBrowserModal open={true} onClose={() => undefined} />
          </StoreContext.Provider>
        </MemoryRouter>,
      )
    })

    expect(host.textContent).toContain('Catch-up TV Hub')
    expect(host.textContent).toContain('Today')
    expect(host.textContent).toContain('Yesterday')
    expect(host.textContent).toContain('BBC One HD')
    expect(host.textContent).toContain('Evening News Hour')

    act(() => root.unmount())
    host.remove()
  })

  it('filters programmes by search query', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    act(() => {
      root.render(
        <MemoryRouter>
          <StoreContext.Provider value={mockStore}>
            <CatchupBrowserModal open={true} onClose={() => undefined} />
          </StoreContext.Provider>
        </MemoryRouter>,
      )
    })

    const searchInput = host.querySelector('input[type="search"]') as HTMLInputElement
    expect(searchInput).toBeDefined()

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      setter?.call(searchInput, 'Nomatchquery')
      searchInput.dispatchEvent(new Event('input', { bubbles: true }))
      searchInput.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(host.textContent).toContain('No Catch-up Broadcasts Found')

    act(() => root.unmount())
    host.remove()
  })

  it('triggers onPlayCatchup callback when clicking Watch Replay', () => {
    const playSpy = vi.fn()
    const closeSpy = vi.fn()

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    act(() => {
      root.render(
        <MemoryRouter>
          <StoreContext.Provider value={mockStore}>
            <CatchupBrowserModal
              open={true}
              onClose={closeSpy}
              onPlayCatchup={playSpy}
            />
          </StoreContext.Provider>
        </MemoryRouter>,
      )
    })

    const replayBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Watch Replay'),
    )
    expect(replayBtn).toBeDefined()

    act(() => {
      replayBtn?.click()
    })

    expect(closeSpy).toHaveBeenCalled()
    expect(playSpy).toHaveBeenCalled()
    expect(playSpy.mock.calls[0]?.[0]).toContain('catchup:xt:src-xtream-1:101:')

    act(() => root.unmount())
    host.remove()
  })
})
