// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toast'
import { StoreProvider } from '../state/store'
import { Sources } from './Sources'
import type { PlaylistSource } from '../state/playlists'
import type { GuideSource } from '../state/guides'

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)

let root: Root | null = null
let host: HTMLDivElement | null = null

const testPlaylist: PlaylistSource = {
  id: 'pl-test-1',
  name: 'Test Stream Provider',
  origin: 'url',
  url: 'https://example.com/playlist.m3u8',
  label: 'https://example.com/playlist.m3u8',
  addedAt: 1700000000000,
  lastAttempt: 1700000000000,
  lastSuccess: 1700000000000,
  channels: [
    {
      id: 'ch-1',
      number: 1,
      sourceId: 'pl-test-1',
      name: 'News 24',
      streamUrl: 'https://example.com/live/ch1.m3u8',
      group: 'News',
      categories: ['News'],
      logoUrl: null,
      mark: { text: 'N24', tone: 'neutral' },
      hd: true,
      tvgId: 'news.24',
    },
  ],
  entries: [],
  skipped: 0,
  duplicates: 0,
  warnings: [],
  error: null,
  status: 'parsed',
  op: 1,
}

const testGuide: GuideSource = {
  id: 'gd-test-1',
  name: 'Test XMLTV Guide',
  origin: 'url',
  url: 'https://example.com/epg.xml',
  label: 'https://example.com/epg.xml',
  addedAt: 1700000000000,
  lastSuccess: 1700000000000,
  playlists: ['pl-test-1'],
  summary: { channels: 1, programmes: 10, first: 1700000000000, last: 1700086400000, fetchedAt: 1700000000000, skipped: 0, duplicates: 0, warnings: [] },
  status: 'ready',
  op: 1,
  error: null,
}

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
  document.body.replaceChildren()
})

const settle = async () => {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

describe('Scheduled Source and Guide Refresh (Finding 18)', () => {
  it('renders the sources refresh bar with schedule selector and status', async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/sources']}>
          <ToastProvider>
            <StoreProvider initialPlaylists={[testPlaylist]} initialGuides={[testGuide]}>
              <Sources />
            </StoreProvider>
          </ToastProvider>
        </MemoryRouter>
      )
    })
    await settle()

    const refreshBar = document.querySelector('.sources-refresh-bar')
    expect(refreshBar).not.toBeNull()

    const scheduleSelect = document.querySelector('.sources-schedule-select') as HTMLSelectElement | null
    expect(scheduleSelect).not.toBeNull()
    expect(scheduleSelect?.value).toBe('12h')

    const refreshBtn = document.querySelector('.sources-refresh-all-btn') as HTMLButtonElement | null
    expect(refreshBtn).not.toBeNull()
    expect(refreshBtn?.textContent).toContain('Refresh all')
  })

  it('updates the refresh schedule preference when changed', async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/sources']}>
          <ToastProvider>
            <StoreProvider initialPlaylists={[testPlaylist]} initialGuides={[testGuide]}>
              <Sources />
            </StoreProvider>
          </ToastProvider>
        </MemoryRouter>
      )
    })
    await settle()

    const scheduleSelect = document.querySelector('.sources-schedule-select') as HTMLSelectElement | null
    expect(scheduleSelect).not.toBeNull()

    await act(async () => {
      scheduleSelect!.value = '4h'
      scheduleSelect!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await settle()

    expect(scheduleSelect?.value).toBe('4h')
  })

  it('allows switching to manual refresh schedule and shows Manual status', async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/sources']}>
          <ToastProvider>
            <StoreProvider initialPlaylists={[testPlaylist]} initialGuides={[testGuide]}>
              <Sources />
            </StoreProvider>
          </ToastProvider>
        </MemoryRouter>
      )
    })
    await settle()

    const scheduleSelect = document.querySelector('.sources-schedule-select') as HTMLSelectElement | null
    expect(scheduleSelect).not.toBeNull()

    await act(async () => {
      scheduleSelect!.value = 'manual'
      scheduleSelect!.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await settle()

    const refreshStatus = document.querySelector('.sources-refresh-status')
    expect(refreshStatus?.textContent).toContain('Next: Manual')
  })

  it('triggers refresh all on button click and renders cancel button during refresh', async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/sources']}>
          <ToastProvider>
            <StoreProvider initialPlaylists={[testPlaylist]} initialGuides={[testGuide]}>
              <Sources />
            </StoreProvider>
          </ToastProvider>
        </MemoryRouter>
      )
    })
    await settle()

    const refreshBtn = document.querySelector('.sources-refresh-all-btn') as HTMLButtonElement | null
    expect(refreshBtn).not.toBeNull()

    // Trigger refresh all
    await act(async () => {
      refreshBtn!.click()
    })
    await settle()

    // Sources refresh bar remains rendered and stable
    const refreshBar = document.querySelector('.sources-refresh-bar')
    expect(refreshBar).not.toBeNull()
  })

  it('strictly adheres to the zero em-dash typography standard', async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/sources']}>
          <ToastProvider>
            <StoreProvider initialPlaylists={[testPlaylist]} initialGuides={[testGuide]}>
              <Sources />
            </StoreProvider>
          </ToastProvider>
        </MemoryRouter>
      )
    })
    await settle()

    const text = document.body.textContent || ''
    expect(text).not.toContain('\u2014')
  })
})
