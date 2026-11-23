// @vitest-environment happy-dom
// Unit tests for EpgStatusModal: EPG guide health, coverage metrics, and channel mapping diagnostics.
// Adheres strictly to typography standards: zero em-dashes.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EpgStatusModal } from './EpgStatusModal'
import type { Channel } from '../data/types'
import type { GuideSource, GuideMatch, Mapping } from '../state/guides'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockChannels: Channel[] = [
  {
    id: 'ch-1',
    number: 1,
    name: 'BBC One HD',
    cleanName: 'BBC One',
    group: 'Entertainment',
    categories: ['Entertainment'],
    logoUrl: null,
    mark: { text: 'BBC', tone: '#1e3a8a' },
    streamUrl: 'https://example.com/1.m3u8',
    hd: true,
    sourceId: null,
    tvgId: 'bbcone.uk',
    badges: [],
  },
  {
    id: 'ch-2',
    number: 2,
    name: 'BBC Two HD',
    cleanName: 'BBC Two',
    group: 'Entertainment',
    categories: ['Entertainment'],
    logoUrl: null,
    mark: { text: 'BBC', tone: '#1e3a8a' },
    streamUrl: 'https://example.com/2.m3u8',
    hd: true,
    sourceId: null,
    tvgId: null,
    badges: [],
  },
  {
    id: 'ch-3',
    number: 3,
    name: 'ITV 1',
    cleanName: 'ITV 1',
    group: 'Entertainment',
    categories: ['Entertainment'],
    logoUrl: null,
    mark: { text: 'ITV', tone: '#065f46' },
    streamUrl: 'https://example.com/3.m3u8',
    hd: false,
    sourceId: null,
    tvgId: 'itv1.uk',
    badges: [],
  },
]

const mockGuides: GuideSource[] = [
  {
    id: 'gd-1',
    name: 'UK Freeview EPG',
    origin: 'url',
    url: 'https://example.com/epg.xml',
    label: 'https://example.com/…',
    addedAt: 1000,
    lastSuccess: Date.now(),
    playlists: [],
    status: 'ready',
    op: 1,
    error: null,
    summary: {
      channels: 120,
      programmes: 4500,
      first: 1000,
      last: 2000,
      fetchedAt: Date.now(),
      skipped: 0,
      duplicates: 0,
      warnings: [],
    },
  },
]

const mockMappings: Mapping[] = [
  { channel: 'ch-3', guide: 'gd-1', xmltvId: 'itv1.uk' },
]

describe('EpgStatusModal component', () => {
  let root: Root | null = null
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount()
      })
      root = null
    }
    document.body.replaceChildren()
  })

  it('renders nothing when closed', () => {
    act(() => {
      root!.render(
        <EpgStatusModal
          open={false}
          onClose={vi.fn()}
          channels={mockChannels}
          guides={mockGuides}
          mappings={mockMappings}
          getMatch={() => ({ state: 'matched', guide: 'gd-1', channel: 'bbcone.uk', manual: false })}
        />,
      )
    })

    expect(document.querySelector('.epg-status-backdrop')).toBeNull()
  })

  it('calculates coverage percentage and metric totals accurately', () => {
    const getMatch = (ch: Channel): GuideMatch => {
      if (ch.id === 'ch-1') return { state: 'matched', guide: 'gd-1', channel: 'bbcone.uk', manual: false }
      if (ch.id === 'ch-2') return { state: 'no-id' }
      return { state: 'matched', guide: 'gd-1', channel: 'itv1.uk', manual: true }
    }

    act(() => {
      root!.render(
        <EpgStatusModal
          open={true}
          onClose={vi.fn()}
          channels={mockChannels}
          guides={mockGuides}
          mappings={mockMappings}
          getMatch={getMatch}
        />,
      )
    })

    const backdrop = document.querySelector('.epg-status-backdrop')
    expect(backdrop).not.toBeNull()
    // 2 out of 3 = 67%
    expect(backdrop?.textContent).toContain('67%')
    expect(backdrop?.textContent).toContain('2 of 3 channels')
    expect(backdrop?.textContent).toContain('UK Freeview EPG')
    expect(backdrop?.textContent).toContain('120 channels')
  })

  it('filters channel list when switching tabs', () => {
    const getMatch = (ch: Channel): GuideMatch => {
      if (ch.id === 'ch-1') return { state: 'matched', guide: 'gd-1', channel: 'bbcone.uk', manual: false }
      if (ch.id === 'ch-2') return { state: 'no-id' }
      return { state: 'matched', guide: 'gd-1', channel: 'itv1.uk', manual: true }
    }

    act(() => {
      root!.render(
        <EpgStatusModal
          open={true}
          onClose={vi.fn()}
          channels={mockChannels}
          guides={mockGuides}
          mappings={mockMappings}
          getMatch={getMatch}
        />,
      )
    })

    expect(document.querySelectorAll('.epg-channel-row').length).toBe(3)

    // Switch to Unmatched tab
    const unmatchedTab = Array.from(document.querySelectorAll('.epg-tab-btn')).find(
      (btn) => btn.textContent?.includes('Unmatched'),
    ) as HTMLButtonElement | undefined
    expect(unmatchedTab).toBeDefined()

    act(() => {
      unmatchedTab!.click()
    })

    // Only ch-2 should be visible
    expect(document.querySelectorAll('.epg-channel-row').length).toBe(1)
    expect(document.querySelector('[data-testid="epg-row-ch-2"]')).not.toBeNull()
    expect(document.querySelector('[data-testid="epg-row-ch-1"]')).toBeNull()
  })

  it('triggers manual mapping callback when Map button is clicked', () => {
    const onOpenManualMap = vi.fn()
    const getMatch = (ch: Channel): GuideMatch => {
      if (ch.id === 'ch-2') return { state: 'no-id' }
      return { state: 'matched', guide: 'gd-1', channel: 'bbcone.uk', manual: false }
    }

    act(() => {
      root!.render(
        <EpgStatusModal
          open={true}
          onClose={vi.fn()}
          channels={mockChannels}
          guides={mockGuides}
          mappings={mockMappings}
          getMatch={getMatch}
          onOpenManualMap={onOpenManualMap}
        />,
      )
    })

    const mapBtn = document.querySelector('[data-testid="epg-row-ch-2"] .epg-row-action-btn') as HTMLButtonElement | null
    expect(mapBtn).not.toBeNull()

    act(() => {
      mapBtn!.click()
    })

    expect(onOpenManualMap).toHaveBeenCalledWith(mockChannels[1])
  })
})
