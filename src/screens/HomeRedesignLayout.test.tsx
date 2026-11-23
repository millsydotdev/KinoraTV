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

    // Live & Library drawer is in the DOM, closed by default
    expect(html).toContain('home-side-hub')
    expect(html).toContain('home-side-hub-header')
    expect(html).toContain('home-side-hub-collapse-btn')

    // Verify companion dashboard elements are present
    expect(html).toContain('home-mini-live-card')
    expect(html).toContain('home-channels-box')
    expect(html).toContain('home-quick-actions-bar')
    expect(html).toContain('home-library-hud')

    // Verify PageHeader has the hub toggle button
    expect(html).toContain('header-hub-toggle-btn')
    expect(html).toContain('home-side-hub is-collapsed')
    expect(html).not.toContain('home-side-hub-backdrop')
  })

  it('opens the Live & Library drawer as an overlay and closes it with Escape', async () => {
    const { createRoot } = await import('react-dom/client')
    const { act } = await import('react')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/']}>
          <ProfileProvider><StoreProvider><LocalMediaProvider><NotificationProvider><ToastProvider>
            <Home />
          </ToastProvider></NotificationProvider></LocalMediaProvider></StoreProvider></ProfileProvider>
        </MemoryRouter>,
      )
    })
    const toggle = host.querySelector<HTMLButtonElement>('.header-hub-toggle-btn')!
    const hub = () => host.querySelector('.home-side-hub')!
    expect(hub().classList.contains('is-collapsed')).toBe(true)
    // The page keeps one full-width column whether the drawer is open or not
    expect(host.querySelector('.home-layout-container')!.className).toBe('home-layout-container')
    await act(async () => { toggle.click() })
    expect(hub().classList.contains('is-collapsed')).toBe(false)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(host.querySelector('.home-side-hub-backdrop')).not.toBeNull()
    expect(host.querySelector('.home-side-hub-edge-tab')).toBeNull()
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(hub().classList.contains('is-collapsed')).toBe(true)
    expect(host.querySelector('.home-side-hub-backdrop')).toBeNull()
    await act(async () => { toggle.click() })
    await act(async () => { host.querySelector<HTMLElement>('.home-side-hub-backdrop')!.click() })
    expect(hub().classList.contains('is-collapsed')).toBe(true)
    act(() => root.unmount())
    host.remove()
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
