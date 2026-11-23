import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QuickSearchModal } from './QuickSearchModal'
import { StoreProvider } from '../state/store'

describe('QuickSearchModal Spotlight Search Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('QUICK-SEARCH-01: returns null when closed', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <StoreProvider>
          <QuickSearchModal open={false} onClose={() => {}} />
        </StoreProvider>
      </MemoryRouter>,
    )

    expect(html).toBe('')
  })

  it('QUICK-SEARCH-02: renders modal dialog, input row, and category filter pills when open', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <StoreProvider>
          <QuickSearchModal open={true} onClose={() => {}} />
        </StoreProvider>
      </MemoryRouter>,
    )

    expect(html).toContain('quick-search-backdrop')
    expect(html).toContain('quick-search-modal')
    expect(html).toContain('quick-search-input')
    expect(html).toContain('quick-search-category-pills')
    expect(html).toContain('Live TV')
    expect(html).toContain('Movies')
    expect(html).toContain('Series')
  })

  it('QUICK-SEARCH-03: finds and renders matching items for initial query', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <StoreProvider>
          <QuickSearchModal open={true} onClose={() => {}} initialQuery="Harbour" />
        </StoreProvider>
      </MemoryRouter>,
    )

    expect(html).toContain('quick-search-results-list')
    expect(html).toContain('Harbour')
    expect(html).toContain('Lights')
    expect(html).toContain('Movie')
  })

  it('QUICK-SEARCH-04: shows helpful empty message when no items match query', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <StoreProvider>
          <QuickSearchModal open={true} onClose={() => {}} initialQuery="NonExistentTitleX99Z" />
        </StoreProvider>
      </MemoryRouter>,
    )

    expect(html).toContain('quick-search-empty')
    expect(html).toContain('No matches found for &quot;NonExistentTitleX99Z&quot;')
  })
})
