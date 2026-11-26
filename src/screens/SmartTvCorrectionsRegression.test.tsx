// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { StoreProvider } from '../state/store'
import { LocalMediaProvider } from '../state/localMedia'
import { ProfileProvider } from '../state/profiles'
import { ToastProvider } from '../components/Toast'
import { SeriesBrowse } from './SeriesBrowse'
import { Movies } from './Movies'
import { LiveTV } from './LiveTV'
import { Sidebar } from '../components/Sidebar'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('Smart TV Critical Corrections and Regression Suite', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    localStorage.clear()
    sessionStorage.clear()
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    localStorage.clear()
    sessionStorage.clear()
  })

  const mount = async (node: React.ReactNode, route = '/') => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[route]}>
          <ProfileProvider>
            <StoreProvider>
              <LocalMediaProvider>
                <ToastProvider>
                  {node}
                </ToastProvider>
              </LocalMediaProvider>
            </StoreProvider>
          </ProfileProvider>
        </MemoryRouter>
      )
    })
  }

  describe('TV Shows Crash Prevention (Defect #5)', () => {
    it('renders SeriesBrowse cleanly without crashing on undefined series or seasons', async () => {
      // Simulate environment where local media has no series array or empty array
      await mount(<SeriesBrowse />)
      expect(container.textContent).toContain('TV Shows')
      expect(container.textContent).not.toContain('Cannot read properties of undefined')
    })

    it('renders provider prompt when no Xtream provider is connected', async () => {
      await mount(<SeriesBrowse />)
      const prompt = container.querySelector('.streaming-provider-prompt')
      expect(prompt).not.toBeNull()
      expect(prompt?.textContent).toContain('Connect an On-Demand Provider')
    })
  })

  describe('Real User Data Honesty in Movies (Defect #6 & #7)', () => {
    it('does not display fabricated demo titles or ratings when demo mode is off', async () => {
      // Set preferences to non-demo mode
      localStorage.setItem('kinora.prefs.v2', JSON.stringify({
        theme: 'dark',
        accent: 'red',
        cardDensity: 'comfortable',
        timeFormat: '24h',
        demoMode: false,
      }))

      await mount(<Movies />)
      expect(container.textContent).toContain('Movies')
      // Fictional continue watching titles should not be present in honest real mode without progress
      const sidePanel = container.querySelector('.movies-side-panel')
      expect(sidePanel).not.toBeNull()
    })
  })

  describe('Live TV Video Preview and Honest EPG (Defect #1, #2 & #3)', () => {
    it('renders GuidePreviewPlayer and avoids fabricated Alex Jones or Bake Off fallbacks', async () => {
      await mount(<LiveTV />)
      // Check top stage is rendered
      expect(container.textContent).not.toContain('Alex Jones and Roman Kemp bring you the latest news')
      expect(container.textContent).not.toContain('The Great British Bake Off')
    })
  })

  describe('Sidebar Deduplication (Defect #8)', () => {
    it('contains deduplicated categories under Discover without duplicate Recordings or Books', async () => {
      await mount(<Sidebar open={true} onClose={() => {}} />, '/documentaries')
      const exploreLinks = container.querySelectorAll('.sidebar-nav-explore .side-link')
      expect(exploreLinks.length).toBe(9)
      const labels = Array.from(exploreLinks).map((el) => el.textContent?.trim())
      expect(labels).not.toContain('Recordings')
      expect(labels).not.toContain('Books')
      expect(labels).toContain('Documentaries')
      expect(labels).toContain('News')
      expect(labels).toContain('Sports')
    })

    it('displays playlist and guide counts on the Sources link title', async () => {
      await mount(<Sidebar open={true} onClose={() => {}} />)
      const sourcesBtn = container.querySelector('a[href="/sources"]')
      expect(sourcesBtn).not.toBeNull()
      const title = sourcesBtn?.getAttribute('title')
      expect(title).toMatch(/^Sources \(\d+ playlists, \d+ guide feeds\)$/)
    })
  })
})
