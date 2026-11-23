// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { StoreProvider } from '../state/store'
import { ProfileProvider } from '../state/profiles'
import { LocalMediaProvider } from '../state/localMedia'
import { ToastProvider } from '../components/Toast'
import { NotificationProvider } from '../components/Notifications'
import { Home } from './Home'

describe('Home Redesign Functional Acceptance Review', () => {
  it('verifies featured hero playback and details navigation routes', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/']}>
        <ProfileProvider>
          <StoreProvider initialDemo>
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

    // Verify hero watch button links to real playback route or live stream
    expect(html).toContain('home-btn-watch')
    expect(html).toMatch(/href="(\/watch\/[^"]+|\/live\?channel=[^"]+)"/)

    // Verify hero details button links to item details route
    expect(html).toContain('home-btn-info')
    expect(html).toMatch(/href="(\/movies\/[^"]+|\/series\/[^"]+|\/live\?channel=[^"]+)"/)

    // Verify hero bookmark toggle button
    expect(html).toContain('home-btn-bookmark')
  })

  it('verifies movie cards and series cards render with correct navigation links', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/']}>
        <ProfileProvider>
          <StoreProvider initialDemo>
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

    // Movies rail and Series rail both exist
    expect(html).toContain('id="trending-popular"')
    expect(html).toContain('id="series-rail"')

    // Verify movie cards have movie navigation targets
    expect(html).toMatch(/href="\/movies\/[^"]+"/)

    // Verify series cards have series navigation targets
    expect(html).toMatch(/href="\/series\/[^"]+"/)
  })

  it('verifies Live TV cards render with valid playback targets and time indicators', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/']}>
        <ProfileProvider>
          <StoreProvider initialDemo>
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

    // Live TV rail exists
    expect(html).toContain('id="live-tv-right-now"')

    // Verify live cards link to live channels
    expect(html).toMatch(/href="\/live\?channel=[^"]+"/)

    // Verify remaining broadcast time is displayed
    expect(html).toContain('channel-card-time-left')
  })

  it('verifies Continue Watching cards contain resume route and remaining time', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/']}>
        <ProfileProvider>
          <StoreProvider initialDemo>
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

    // Verify continue watching section renders
    expect(html).toContain('id="continue-watching"')

    // Verify resume links exist
    expect(html).toMatch(/href="\/watch\/[^"]+"/)

    // Verify remaining time indicator exists
    expect(html).toContain('left')
  })

  it('verifies Quick Jump pill navigation bar in TV mode', () => {
    localStorage.setItem('kinora.prefs.v2', JSON.stringify({ viewMode: 'tv', demoMode: true }))
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/']}>
        <ProfileProvider>
          <StoreProvider initialDemo>
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
    localStorage.removeItem('kinora.prefs.v2')

    // Quick jump container
    expect(html).toContain('home-quick-jump')

    // Quick navigation destinations
    expect(html).toContain('href="/live"')
    expect(html).toContain('href="/movies"')
    expect(html).toContain('href="/series"')
    expect(html).toContain('href="/recordings"')
    expect(html).toContain('href="/library"')
    expect(html).toContain('href="/sources"')
  })

  it('verifies empty catalogue renders clean fallback without crashing', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/']}>
        <ProfileProvider>
          <StoreProvider initialDemo={false}>
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

    // Empty catalogue should render without throwing
    expect(html).toContain('home-smarttv-wrapper')
    // Continue watching auto-hides when empty
    expect(html).not.toContain('id="continue-watching"')
  })
})
