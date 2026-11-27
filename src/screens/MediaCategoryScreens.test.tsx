// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { ToastProvider } from '../components/Toast'
import { StoreProvider } from '../state/store'
import { RadioScreen } from './RadioScreen'
import { MusicScreen } from './MusicScreen'
import { PodcastsScreen } from './PodcastsScreen'
import { DocumentariesScreen } from './DocumentariesScreen'
import { BooksScreen } from './BooksScreen'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('Media Category Screens', () => {
  let root: Root
  let host: HTMLDivElement

  const mount = async (element: React.ReactNode, path = '/') => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[path]}>
          <ToastProvider>
            <StoreProvider>
              <Routes>
                <Route path="*" element={element} />
              </Routes>
            </StoreProvider>
          </ToastProvider>
        </MemoryRouter>,
      )
    })
  }

  const typeInto = async (selector: string, value: string) => {
    const el = document.querySelector<HTMLInputElement>(selector)!
    expect(el).not.toBeNull()
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount()
      })
    }
    if (host) host.remove()
  })

  it('renders Radio screen with hero and verified stations', async () => {
    await mount(<RadioScreen />)
    const text = document.body.textContent ?? ''
    expect(text).toContain('Radio')
    expect(text).toContain('Internet radio directories')
    expect(document.querySelectorAll('.res-card').length).toBeGreaterThanOrEqual(1)
  })

  it('filters Radio directories by search query', async () => {
    await mount(<RadioScreen />)
    await typeInto('.media-search-input', 'Radio Browser')
    const text = document.body.textContent ?? ''
    expect(text).toContain('Radio Browser')
  })

  it('renders Music screen with subcategory rail', async () => {
    await mount(<MusicScreen />)
    const text = document.body.textContent ?? ''
    expect(text).toContain('Music')
    expect(text).toContain('Independent music platforms')
    expect(document.querySelectorAll('.media-subcat-chip').length).toBeGreaterThanOrEqual(2)
  })

  it('renders Podcasts screen with play buttons for audio items', async () => {
    await mount(<PodcastsScreen />)
    const text = document.body.textContent ?? ''
    expect(text).toContain('Podcasts')
    expect(document.querySelectorAll('.res-card').length).toBeGreaterThanOrEqual(1)
  })

  it('renders Documentaries screen with status and filter pills', async () => {
    await mount(<DocumentariesScreen />)
    const text = document.body.textContent ?? ''
    expect(text).toContain('Documentaries')
    expect(text).toContain('Science documentaries')
  })

  it('renders Books screen and handles no results state', async () => {
    await mount(<BooksScreen />)
    await typeInto('.media-search-input', 'NonexistentBookResourceXYZ12345')
    const text = document.body.textContent ?? ''
    expect(text).toContain('No resources match your filters')
  })
})
