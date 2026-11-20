// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { StoreProvider } from '../state/store'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('Kinora Premium Sidebar Component Suite', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
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

  const mount = async (initialPath = '/') => {
    await act(async () => {
      root.render(
        <StoreProvider>
          <MemoryRouter initialEntries={[initialPath]}>
            <Sidebar open={false} onClose={() => {}} />
          </MemoryRouter>
        </StoreProvider>
      )
    })
  }

  it('renders Kinora branding area with logo mark, wordmark and TV badge', async () => {
    await mount('/')
    const brand = container.querySelector('.sidebar-brand')
    expect(brand).not.toBeNull()

    const word = container.querySelector('.logo-word')
    expect(word?.textContent).toBe('KINORA')

    const badge = container.querySelector('.logo-badge')
    expect(badge?.textContent).toBe('TV')
  })

  it('renders grouped navigation structure with primary, audio/books and discover sections', async () => {
    await mount('/')
    const labels = Array.from(container.querySelectorAll('.sidebar-group-label')).map((el) => el.textContent?.trim())
    expect(labels).toContain('Audio & Books')
    expect(labels).toContain('Discover')

    // Primary items present
    expect(container.textContent).toContain('Home')
    expect(container.textContent).toContain('Live TV')
    expect(container.textContent).toContain('Movies & Series')
    expect(container.textContent).toContain('Media Library')
    expect(container.textContent).toContain('Sources')
  })

  it('renders Movies & Series as an expandable navigation group', async () => {
    await mount('/movies')
    // On /movies, movies-series should be auto-expanded
    const moviesLink = container.querySelector('a[href="/movies"]')
    const seriesLink = container.querySelector('a[href="/series"]')

    expect(moviesLink).not.toBeNull()
    expect(seriesLink).not.toBeNull()
    expect(moviesLink?.classList.contains('is-active')).toBe(true)
    expect(seriesLink?.classList.contains('is-active')).toBe(false)
  })

  it('prevents multiple active items when a child item is active and group is expanded', async () => {
    await mount('/live')
    // On /live with TV Guide active and Live TV expanded
    const activeItems = container.querySelectorAll('.is-active')
    // Only the TV Guide link should be active, not the parent button
    const activeTexts = Array.from(activeItems).map((el) => el.textContent?.trim())
    expect(activeTexts).toContain('TV Guide')
    expect(activeTexts).not.toContain('Live TV')
  })

  it('toggles collapse mode via the collapse button', async () => {
    await mount('/')
    const sidebar = container.querySelector('.sidebar')
    expect(sidebar?.classList.contains('is-collapsed')).toBe(false)

    const toggleBtn = container.querySelector<HTMLButtonElement>('.sidebar-collapse-btn')
    expect(toggleBtn).not.toBeNull()

    await act(async () => {
      toggleBtn?.click()
    })

    expect(sidebar?.classList.contains('is-collapsed')).toBe(true)
  })

  it('supports Ctrl+B keyboard shortcut to toggle sidebar collapse', async () => {
    await mount('/')
    const sidebar = container.querySelector('.sidebar')
    expect(sidebar?.classList.contains('is-collapsed')).toBe(false)

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true }))
    })

    expect(sidebar?.classList.contains('is-collapsed')).toBe(true)

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true }))
    })

    expect(sidebar?.classList.contains('is-collapsed')).toBe(false)
  })

  it('displays group divider lines when collapsed', async () => {
    await mount('/')
    const toggleBtn = container.querySelector<HTMLButtonElement>('.sidebar-collapse-btn')

    await act(async () => {
      toggleBtn?.click()
    })

    const dividers = container.querySelectorAll('.sidebar-group-divider')
    expect(dividers.length).toBeGreaterThan(0)
  })
})
