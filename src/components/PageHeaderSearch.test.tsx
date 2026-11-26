// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { PageHeader } from './PageHeader'
import { StoreProvider } from '../state/store'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('PageHeader Interactive Search Suite', () => {
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

  const mount = async () => {
    await act(async () => {
      root.render(
        <StoreProvider>
          <MemoryRouter initialEntries={['/']}>
            <PageHeader title="Test Page" search={true} />
          </MemoryRouter>
        </StoreProvider>
      )
    })
  }

  const typeIn = (input: HTMLInputElement, text: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    if (setter) {
      setter.call(input, text)
    } else {
      input.value = text
    }
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  it('renders a genuine interactive search input instead of a static button', async () => {
    await mount()
    const input = container.querySelector('#header-search-input') as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input.tagName).toBe('INPUT')
    expect(input.type).toBe('search')
    expect(input.placeholder).toContain('Search')
  })

  it('displays instant suggestions popover when typing a query', async () => {
    await mount()
    const input = container.querySelector('#header-search-input') as HTMLInputElement
    expect(input).not.toBeNull()

    // Type "Harbour"
    await act(async () => {
      typeIn(input, 'Harbour')
    })

    const dropdown = container.querySelector('#header-search-dropdown')
    expect(dropdown).not.toBeNull()

    // Harbour Lights is a curated movie in catalog
    const suggestions = container.querySelectorAll('.header-search-item')
    expect(suggestions.length).toBeGreaterThan(0)
    expect(dropdown?.textContent).toContain('Harbour Lights')
    expect(dropdown?.textContent).toContain('Movie')
  })

  it('navigates suggestions with ArrowDown and ArrowUp', async () => {
    await mount()
    const input = container.querySelector('#header-search-input') as HTMLInputElement

    await act(async () => {
      typeIn(input, 'a')
    })

    const suggestions = container.querySelectorAll('.header-search-item')
    expect(suggestions.length).toBeGreaterThan(0)

    // Press ArrowDown
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    })

    const firstItem = container.querySelector('.header-search-item')
    expect(firstItem?.classList.contains('is-selected')).toBe(true)

    // Press ArrowUp
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    })

    const lastItem = suggestions[suggestions.length - 1]
    expect(lastItem?.classList.contains('is-selected')).toBe(true)
  })

  it('dismisses suggestions popover when pressing Escape', async () => {
    await mount()
    const input = container.querySelector('#header-search-input') as HTMLInputElement

    await act(async () => {
      typeIn(input, 'test')
    })

    expect(container.querySelector('#header-search-dropdown')).not.toBeNull()

    // Press Escape
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(container.querySelector('#header-search-dropdown')).toBeNull()
  })

  it('clears query when clicking the clear button', async () => {
    await mount()
    const input = container.querySelector('#header-search-input') as HTMLInputElement

    await act(async () => {
      typeIn(input, 'query to clear')
    })

    const clearBtn = container.querySelector('.search-pill-clear') as HTMLButtonElement
    expect(clearBtn).not.toBeNull()

    await act(async () => {
      clearBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(input.value).toBe('')
    expect(container.querySelector('#header-search-dropdown')).toBeNull()
  })

  it('submits search query to full search page on Enter when no item is selected', async () => {
    await mount()
    const input = container.querySelector('#header-search-input') as HTMLInputElement

    await act(async () => {
      typeIn(input, 'Action')
    })

    const form = container.querySelector('.search-pill-form') as HTMLFormElement
    expect(form).not.toBeNull()

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    // Dropdown closes upon submission
    expect(container.querySelector('#header-search-dropdown')).toBeNull()
  })
})
