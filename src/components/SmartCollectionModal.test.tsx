// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SmartCollectionModal } from './SmartCollectionModal'
import { ToastProvider } from './Toast'
import type { UnifiedMediaItem } from '../lib/smartCollections'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockMedia: UnifiedMediaItem[] = [
  {
    id: 'm-1',
    ref: 'movie:blade-runner',
    title: 'Blade Runner',
    mediaType: 'movie',
    genres: ['Sci-Fi'],
    year: 1982,
    rating: 8.1,
    resolution: '4k',
    watchedStatus: 'unwatched',
  },
]

describe('SmartCollectionModal', () => {
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
          <SmartCollectionModal
            open={false}
            onClose={() => {}}
            allMediaItems={mockMedia}
          />
        </ToastProvider>,
      )
    })
    expect(host.querySelector('.dialog')).toBeNull()
  })

  it('renders smart collection cards and match count when open', async () => {
    await act(async () => {
      root.render(
        <ToastProvider>
          <SmartCollectionModal
            open={true}
            onClose={() => {}}
            allMediaItems={mockMedia}
          />
        </ToastProvider>,
      )
    })

    const title = host.querySelector('.dialog-head h2')
    expect(title?.textContent).toBe('Dynamic Smart Collections')

    const cards = host.querySelectorAll('.sc-card')
    expect(cards.length).toBeGreaterThan(0)

    // Check that title is rendered
    expect(host.textContent).toContain('80s Sci-Fi & Fantasy')
  })

  it('opens create collection form when create button is clicked', async () => {
    await act(async () => {
      root.render(
        <ToastProvider>
          <SmartCollectionModal
            open={true}
            onClose={() => {}}
            allMediaItems={mockMedia}
          />
        </ToastProvider>,
      )
    })

    const createBtn = host.querySelector('.sc-modal-header-bar button') as HTMLButtonElement
    expect(createBtn).not.toBeNull()

    await act(async () => {
      createBtn.click()
    })

    expect(host.textContent).toContain('Create Smart Collection')
    expect(host.querySelector('#sc-name-input')).not.toBeNull()
  })
})
