// @vitest-environment happy-dom
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ToastProvider } from '../components/Toast'
import { StoreProvider } from '../state/store'
import { Settings } from './Settings'
import { LiveTV } from './LiveTV'
import { registerResourceLookup, resolve } from '../data/refs'

let root: Root
let container: HTMLDivElement

beforeEach(() => {
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

describe('Stage 4 Core Subsystems Verification', () => {
  it('supports deep linking via query parameter /settings?section=audio', () => {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/settings?section=audio']}>
          <ToastProvider>
            <StoreProvider>
              <Routes>
                <Route path="/settings" element={<Settings />} />
                <Route path="/settings/:section" element={<Settings />} />
              </Routes>
            </StoreProvider>
          </ToastProvider>
        </MemoryRouter>,
      )
    })

    const activeNav = container.querySelector('.settings-nav-btn.is-active')
    expect(activeNav?.textContent).toContain('Audio')
    const groupHeadings = Array.from(container.querySelectorAll('.collapsible-title')).map((el) => el.textContent)
    expect(groupHeadings).toContain('Sound')
  })

  it('supports deep linking via query parameter /settings?section=playback', () => {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/settings?section=playback']}>
          <ToastProvider>
            <StoreProvider>
              <Routes>
                <Route path="/settings" element={<Settings />} />
                <Route path="/settings/:section" element={<Settings />} />
              </Routes>
            </StoreProvider>
          </ToastProvider>
        </MemoryRouter>,
      )
    })

    const activeNav = container.querySelector('.settings-nav-btn.is-active')
    expect(activeNav?.textContent).toContain('Playback')
    const groupHeadings = Array.from(container.querySelectorAll('.collapsible-title')).map((el) => el.textContent)
    expect(groupHeadings).toContain('Picture')
  })

  it('deep links /live?tab=catchup and filters by catch-up channels', () => {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/live?tab=catchup']}>
          <ToastProvider>
            <StoreProvider>
              <Routes>
                <Route path="/live" element={<LiveTV />} />
              </Routes>
            </StoreProvider>
          </ToastProvider>
        </MemoryRouter>,
      )
    })

    const activeChip = container.querySelector('.chip[aria-pressed="true"]')
    expect(activeChip?.textContent).toBe('Catch-up')
  })

  it('deep links /live?tab=reminders and filters by programme reminders', () => {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/live?tab=reminders']}>
          <ToastProvider>
            <StoreProvider>
              <Routes>
                <Route path="/live" element={<LiveTV />} />
              </Routes>
            </StoreProvider>
          </ToastProvider>
        </MemoryRouter>,
      )
    })

    const activeChip = container.querySelector('.chip[aria-pressed="true"]')
    expect(activeChip?.textContent).toBe('Reminders')
  })

  it('resolves public discovery resources and creates playable movie metadata', () => {
    registerResourceLookup((id) => {
      if (id === 'public_film_test') {
        return {
          id: 'public_film_test',
          name: 'The Great Train Robbery',
          description: 'Early landmark film from 1903',
          category: 'movies',
          subcategory: 'action',
          provider: 'Open Film Registry',
          playbackUrl: 'https://archive.example/train.m3u8',
          artworkUrl: 'https://archive.example/poster.jpg',
        }
      }
      return undefined
    })

    const resolved = resolve('res:public_film_test')
    expect(resolved).toBeDefined()
    expect(resolved?.kind).toBe('movie')
    if (resolved && resolved.kind === 'movie') {
      expect(resolved.title).toBe('The Great Train Robbery')
      expect(resolved.streamUrl).toBe('https://archive.example/train.m3u8')
      expect(resolved.meta).toContain('Open Film Registry')
    }

    const unresolvable = resolve('res:non_existent_404')
    expect(unresolvable).toBeUndefined()
  })
})
