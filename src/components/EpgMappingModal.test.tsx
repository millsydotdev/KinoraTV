// @vitest-environment happy-dom
// EpgMappingModal.test.tsx - Tests for interactive EPG channel mapping modal.
// Strictly adheres to typography standards: zero em-dashes across all code and comments.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EpgMappingModal } from './EpgMappingModal'
import { StoreProvider } from '../state/store'
import type { Channel } from '../data/types'

// Mock guideChannels from native.ts
vi.mock('../lib/native', async () => {
  const actual = await vi.importActual<typeof import('../lib/native')>('../lib/native')
  return {
    ...actual,
    guideChannels: vi.fn(async () => [
      { id: 'bbcone.uk', name: 'BBC One' },
      { id: 'bbctwo.uk', name: 'BBC Two' },
      { id: 'itv1.uk', name: 'ITV 1' },
    ]),
  }
})

const mockChannel: Channel = {
  id: 'ch-bbc-1',
  name: 'UK: BBC One HD',
  number: 101,
  group: 'Entertainment',
  categories: ['Entertainment'],
  logoUrl: null,
  mark: { text: 'BBC1', tone: '#d00' },
  streamUrl: 'https://example.com/live/bbc1.m3u8',
  hd: true,
  sourceId: 'src-1',
  tvgId: 'bbcone.uk',
}

describe('EpgMappingModal', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
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

  it('renders modal with channel details when open', () => {
    act(() => {
      root.render(
        <StoreProvider>
          <EpgMappingModal
            open={true}
            channel={mockChannel}
            onClose={vi.fn()}
            onSaveMapping={vi.fn()}
            onClearMapping={vi.fn()}
          />
        </StoreProvider>
      )
    })

    const title = container.querySelector('#epg-mapping-title')
    expect(title).not.toBeNull()
    expect(title?.textContent).toBe('Map EPG Channel')
    expect(container.textContent).toContain('UK: BBC One HD')
  })

  it('does not render when open is false', () => {
    act(() => {
      root.render(
        <StoreProvider>
          <EpgMappingModal
            open={false}
            channel={mockChannel}
            onClose={vi.fn()}
            onSaveMapping={vi.fn()}
            onClearMapping={vi.fn()}
          />
        </StoreProvider>
      )
    })

    expect(container.innerHTML).toBe('')
  })

  it('triggers onClearMapping when Clear button is clicked on existing mapping', () => {
    const clearSpy = vi.fn()
    act(() => {
      root.render(
        <StoreProvider>
          <EpgMappingModal
            open={true}
            channel={mockChannel}
            currentMapping={{ channel: 'ch-bbc-1', guide: 'gd-1', xmltvId: 'bbcone.uk' }}
            onClose={vi.fn()}
            onSaveMapping={vi.fn()}
            onClearMapping={clearSpy}
          />
        </StoreProvider>
      )
    })

    const clearBtn = container.querySelector('.epg-mapping-current-banner button') as HTMLButtonElement | null
    expect(clearBtn).not.toBeNull()
    act(() => {
      clearBtn?.click()
    })
    expect(clearSpy).toHaveBeenCalledWith('ch-bbc-1')
  })
})
