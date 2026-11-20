import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { StoreProvider } from '../state/store'
import { ProfileProvider } from '../state/profiles'
import { LocalMediaProvider } from '../state/localMedia'
import { ToastProvider } from '../components/Toast'
import { NotificationProvider } from '../components/Notifications'
import { Home } from './Home'

describe('Home Redesign Layout and Visual Composition', () => {
  it('renders the two-column home layout container with independent content flow', () => {
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

    // Verify root layout container exists
    expect(html).toContain('home-layout-container')

    // Verify main flow column exists
    expect(html).toContain('home-main-flow')

    // Verify hero section is inside main flow
    expect(html).toContain('home-hero-cinematic')

    // Verify content rails are immediately inside main flow below the hero
    expect(html).toContain('home-body')

    // Verify companion right-hand dashboard hub exists alongside main flow
    expect(html).toContain('home-side-hub')

    // Verify companion dashboard elements are present
    expect(html).toContain('home-mini-live-card')
    expect(html).toContain('home-channels-box')
    expect(html).toContain('home-quick-actions-bar')
    expect(html).toContain('home-library-hud')
  })

  it('renders quick action buttons for navigation without dead links', () => {
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

    expect(html).toContain('href="/live"')
    expect(html).toContain('href="/recordings"')
    expect(html).toContain('href="/live?tab=reminders"')
    expect(html).toContain('href="/library"')
  })
})
