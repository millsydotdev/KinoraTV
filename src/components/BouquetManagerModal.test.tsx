// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BouquetManagerModal } from './BouquetManagerModal'
import { ToastProvider } from './Toast'
import type { Channel } from '../data/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockChannels: Channel[] = [
  {
    id: 'ch-1',
    name: 'Sky Sports Premier League',
    number: 101,
    group: 'Sports',
    categories: ['Sports'],
    logoUrl: null,
    mark: { text: 'SS', tone: 'emerald' },
    streamUrl: 'http://example.com/stream1',
    hd: true,
    sourceId: null,
    tvgId: null,
  },
  {
    id: 'ch-2',
    name: 'BBC News 24',
    number: 102,
    group: 'News',
    categories: ['News'],
    logoUrl: null,
    mark: { text: 'BN', tone: 'rose' },
    streamUrl: 'http://example.com/stream2',
    hd: false,
    sourceId: null,
    tvgId: null,
  },
]

describe('BouquetManagerModal', () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(() => {
    localStorage.clear()
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
        <ToastProvider>
          <BouquetManagerModal
            open={false}
            onClose={() => {}}
            categories={['Sports', 'News']}
            channels={mockChannels}
          />
        </ToastProvider>,
      )
    })
    expect(host.querySelector('.dialog')).toBeNull()
  })

  it('renders category rows and tab controls when open', async () => {
    await act(async () => {
      root.render(
        <ToastProvider>
          <BouquetManagerModal
            open={true}
            onClose={() => {}}
            categories={['Sports', 'News']}
            channels={mockChannels}
          />
        </ToastProvider>,
      )
    })

    const title = host.querySelector('.dialog-head h2')
    expect(title?.textContent).toContain('Category & Bouquet Manager')

    const tabs = host.querySelectorAll('.bouquet-tab-btn')
    expect(tabs.length).toBe(2)

    const categoryNames = Array.from(host.querySelectorAll('.bouquet-category-name')).map(
      (el) => el.textContent,
    )
    expect(categoryNames).toContain('Sports')
    expect(categoryNames).toContain('News')
  })

  it('switches to bouquets tab and starts creation mode', async () => {
    await act(async () => {
      root.render(
        <ToastProvider>
          <BouquetManagerModal
            open={true}
            onClose={() => {}}
            categories={['Sports', 'News']}
            channels={mockChannels}
          />
        </ToastProvider>,
      )
    })

    const bouquetsTab = host.querySelectorAll('.bouquet-tab-btn')[1] as HTMLButtonElement
    await act(async () => {
      bouquetsTab.click()
    })

    expect(host.textContent).toContain('No custom bouquets created yet')

    const createBtn = host.querySelector('.bouquet-empty button') as HTMLButtonElement
    expect(createBtn).not.toBeNull()

    await act(async () => {
      createBtn.click()
    })

    expect(host.textContent).toContain('Create New Bouquet')
    expect(host.querySelector('#bq-name-input')).not.toBeNull()
  })
})
