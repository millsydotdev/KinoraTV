// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toast'
import { StoreProvider } from '../state/store'
import { DiscoverScreen } from './DiscoverScreen'
import { GenreBrowseScreen } from './GenreBrowseScreen'
import { GenreArtworkSettings } from '../components/GenreArtworkSettings'

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)

let root: Root | null = null
let host: HTMLDivElement | null = null

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  localStorage.clear()
})

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount()
    })
  }
  root = null
  if (host) {
    host.remove()
    host = null
  }
})

describe('Genre System Screens & UI Acceptance Suite', () => {
  it('renders DiscoverScreen with parent genre grid, hero banner and format selector', async () => {
    await act(async () => {
      root!.render(
        <StoreProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={['/discover']}>
              <Routes>
                <Route path="/discover" element={<DiscoverScreen />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </StoreProvider>,
      )
    })

    const title = host?.querySelector('.page-header h1')
    expect(title?.textContent).toBe('Discover')

    // Format selector pills
    const pills = host?.querySelectorAll('.streaming-nav-pill')
    expect(pills?.length).toBeGreaterThanOrEqual(5)

    // Genre cards in the grid
    const cards = host?.querySelectorAll('.genre-card')
    expect(cards?.length).toBeGreaterThanOrEqual(10)

    // Featured Hero Banner
    const banner = host?.querySelector('.genre-hero-banner')
    expect(banner).not.toBeNull()
  })

  it('renders GenreBrowseScreen for a canonical parent genre with subgenre chips and sorting', async () => {
    await act(async () => {
      root!.render(
        <StoreProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={['/genres/science-fiction']}>
              <Routes>
                <Route path="/genres/:genreId" element={<GenreBrowseScreen />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </StoreProvider>,
      )
    })

    const heading = host?.querySelector('.genre-hero-title')
    expect(heading?.textContent).toBe('Science Fiction')

    // Subgenres navigation row pills
    const subChips = host?.querySelectorAll('.streaming-nav-pill')
    expect(subChips?.length).toBeGreaterThan(0)

    // Description
    const desc = host?.querySelector('.genre-hero-desc')
    expect(desc?.textContent).toContain('futuristic science')

    // Controls
    const sortSelect = host?.querySelector('select[aria-label="Sort media within genre"]')
    expect(sortSelect).not.toBeNull()
  })

  it('renders GenreBrowseScreen with breadcrumbs when browsing a specific subgenre', async () => {
    await act(async () => {
      root!.render(
        <StoreProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={['/genres/science-fiction/scifi-cyberpunk']}>
              <Routes>
                <Route path="/genres/:genreId/:subgenreId" element={<GenreBrowseScreen />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </StoreProvider>,
      )
    })

    const heading = host?.querySelector('.genre-hero-title')
    expect(heading?.textContent).toBe('Cyberpunk')

    // Breadcrumb navigation back to parent genre
    const parentBreadcrumb = host?.querySelector('a[href="/genres/science-fiction"]')
    expect(parentBreadcrumb?.textContent).toContain('Science Fiction')
  })

  it('renders GenreArtworkSettings management panel with live classifier and mappings', async () => {
    await act(async () => {
      root!.render(
        <StoreProvider>
          <ToastProvider>
            <MemoryRouter>
              <GenreArtworkSettings />
            </MemoryRouter>
          </ToastProvider>
        </StoreProvider>,
      )
    })

    // Header content
    expect(host?.textContent).toContain('Live Normalisation Classifier Test')
    expect(host?.textContent).toContain('Provider Category Normalisation & Mappings')

    // Live classifier sandbox
    const testInput = host?.querySelector('#genre-mapping-test-input') as HTMLInputElement
    expect(testInput).not.toBeNull()

    // Test typing a classification
    await act(async () => {
      testInput.value = 'Police Drama'
      testInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    // Classification result pill
    expect(host?.textContent).toContain('Crime')

    // Genre items in the cards
    const cards = host?.querySelectorAll('.genre-settings-card')
    expect(cards?.length).toBeGreaterThan(0)
  })
})
