// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { StoreProvider } from '../state/store'
import { ProfileProvider } from '../state/profiles'
import { LocalMediaProvider } from '../state/localMedia'
import { ToastProvider } from '../components/Toast'
import { NotificationProvider } from '../components/Notifications'
import { Home, HomeQuickJump } from './Home'

describe('Home TV Launcher & Screen Hierarchy (Phase 3)', () => {
  it('renders HomeQuickJump ribbon with all core destinations', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/']}>
        <HomeQuickJump />
      </MemoryRouter>,
    )

    expect(html).toContain('home-quick-jump')
    expect(html).toContain('home-quick-jump-track')
    expect(html).toContain('href="/live"')
    expect(html).toContain('Live TV')
    expect(html).toContain('href="/movies"')
    expect(html).toContain('Movies')
    expect(html).toContain('href="/series"')
    expect(html).toContain('Series')
    expect(html).toContain('href="/recordings"')
    expect(html).toContain('Recordings')
    expect(html).toContain('href="/library"')
    expect(html).toContain('Library')
    expect(html).toContain('href="/sources"')
    expect(html).toContain('Sources')
  })

  it('renders Hero Spotlight with cinematic actions and metadata', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/']}>
        <ProfileProvider>
          <StoreProvider>
            <LocalMediaProvider>
              <NotificationProvider>
                <ToastProvider>
                  <Home />
                </ToastProvider>
              </NotificationProvider>
            </LocalMediaProvider>
          </StoreProvider>
        </ProfileProvider>
      </MemoryRouter>,
    )

    // Hero element and actions
    expect(html).toContain('home-hero-cinematic')
    expect(html).toContain('home-btn-watch')
    expect(html).toContain('home-btn-info')
    expect(html).toContain('home-btn-bookmark')

    // Quick jump ribbon rendered under hero
    expect(html).toContain('home-quick-jump')
  })

  it('enforces television launcher rail hierarchy in TV Mode (Continue Watching -> Live TV -> Trending)', () => {
    // Set localStorage preference to tv mode and demo mode
    localStorage.setItem('kinora.prefs.v2', JSON.stringify({ viewMode: 'tv', demoMode: true }))

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/']}>
        <ProfileProvider>
          <StoreProvider initialDemo={true}>
            <LocalMediaProvider>
              <NotificationProvider>
                <ToastProvider>
                  <Home />
                </ToastProvider>
              </NotificationProvider>
            </LocalMediaProvider>
          </StoreProvider>
        </ProfileProvider>
      </MemoryRouter>,
    )

    // Extract position of rail IDs
    const continueIdx = html.indexOf('id="continue-watching"')
    const liveIdx = html.indexOf('id="live-tv-right-now"')
    const trendingIdx = html.indexOf('id="trending-popular"')

    // All 3 primary rails must be present in demo mode
    expect(continueIdx).toBeGreaterThan(-1)
    expect(liveIdx).toBeGreaterThan(-1)
    expect(trendingIdx).toBeGreaterThan(-1)

    // Verify TV launcher strict hierarchy: Continue Watching -> Live TV -> Trending
    expect(continueIdx).toBeLessThan(liveIdx)
    expect(liveIdx).toBeLessThan(trendingIdx)

    // Clean up
    localStorage.removeItem('kinora.prefs.v2')
  })

  it('preserves Desktop Mode companion sidebar and custom section order', () => {
    // Set localStorage preference to desktop mode
    localStorage.setItem('kinora.prefs.v2', JSON.stringify({ viewMode: 'desktop' }))

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/']}>
        <ProfileProvider>
          <StoreProvider>
            <LocalMediaProvider>
              <NotificationProvider>
                <ToastProvider>
                  <Home />
                </ToastProvider>
              </NotificationProvider>
            </LocalMediaProvider>
          </StoreProvider>
        </ProfileProvider>
      </MemoryRouter>,
    )

    // Companion hub present in DOM for desktop mode
    expect(html).toContain('home-side-hub')
    expect(html).toContain('home-mini-live-card')
    expect(html).toContain('home-channels-box')
    expect(html).toContain('home-quick-actions-bar')
    expect(html).toContain('home-library-hud')

    // Clean up
    localStorage.removeItem('kinora.prefs.v2')
  })
})
