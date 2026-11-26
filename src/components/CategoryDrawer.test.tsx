// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CategoryDrawer } from './CategoryDrawer'
import type { Bouquet } from '../lib/bouquetManager'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockBouquets: Bouquet[] = [
  {
    id: 'bq-1',
    name: 'Weekend Sports',
    channelIds: ['ch-1', 'ch-2'],
    icon: 'sports',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
]

describe('CategoryDrawer', () => {
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
        <CategoryDrawer
          open={false}
          onClose={() => {}}
          groups={['All', 'Sports', 'News']}
          activeGroup="All"
          onSelectGroup={() => {}}
          categoryCounts={new Map([['Sports', 12]])}
          onOpenManager={() => {}}
        />,
      )
    })
    expect(host.querySelector('.category-drawer-backdrop')).toBeNull()
  })

  it('renders categories and custom bouquets when open', async () => {
    await act(async () => {
      root.render(
        <CategoryDrawer
          open={true}
          onClose={() => {}}
          groups={['All', 'Sports', 'News']}
          activeGroup="All"
          onSelectGroup={() => {}}
          categoryCounts={new Map([['Sports', 12]])}
          onOpenManager={() => {}}
          bouquets={mockBouquets}
        />,
      )
    })

    const title = host.querySelector('.category-drawer-title h2')
    expect(title?.textContent).toBe('Categories')

    // Bouquet should be present
    expect(host.textContent).toContain('Weekend Sports')

    // All categories should be present
    expect(host.textContent).toContain('Sports')
    expect(host.textContent).toContain('News')
  })

  it('calls onSelectGroup when a category is clicked', async () => {
    const handleSelect = vi.fn()
    const handleClose = vi.fn()

    await act(async () => {
      root.render(
        <CategoryDrawer
          open={true}
          onClose={handleClose}
          groups={['All', 'Sports', 'News']}
          activeGroup="All"
          onSelectGroup={handleSelect}
          categoryCounts={new Map([['Sports', 12]])}
          onOpenManager={() => {}}
          bouquets={mockBouquets}
        />,
      )
    })

    const buttons = host.querySelectorAll('.category-item-btn')
    // Click Sports
    const sportsBtn = Array.from(buttons).find((b) => b.querySelector('.cat-name')?.textContent === 'Sports') as HTMLButtonElement
    expect(sportsBtn).toBeDefined()

    await act(async () => {
      sportsBtn.click()
    })

    expect(handleSelect).toHaveBeenCalledWith('Sports')
    expect(handleClose).toHaveBeenCalled()
  })

  it('calls onOpenManager when manage button is clicked', async () => {
    const handleOpenManager = vi.fn()
    const handleClose = vi.fn()

    await act(async () => {
      root.render(
        <CategoryDrawer
          open={true}
          onClose={handleClose}
          groups={['All', 'Sports']}
          activeGroup="All"
          onSelectGroup={() => {}}
          categoryCounts={new Map()}
          onOpenManager={handleOpenManager}
        />,
      )
    })

    const manageBtn = host.querySelector('.category-manage-btn') as HTMLButtonElement
    expect(manageBtn).not.toBeNull()

    await act(async () => {
      manageBtn.click()
    })

    expect(handleClose).toHaveBeenCalled()
    expect(handleOpenManager).toHaveBeenCalled()
  })
})
