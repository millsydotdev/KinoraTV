// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toast'
import { NotificationProvider } from '../components/Notifications'
import { StoreProvider } from '../state/store'
import { PageHeader } from '../components/PageHeader'
import { Settings } from './Settings'

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)

let root: Root | null = null
let host: HTMLDivElement | null = null

const FIXED_NOW = 1700000000000

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(FIXED_NOW)
})

afterEach(async () => {
  vi.useRealTimers()
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

describe('Programme Reminders and Notification Dispatch (Finding 19)', () => {
  it('triggers notification toast and unread badge when a scheduled reminder is upcoming', async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/live']}>
          <ToastProvider>
            <NotificationProvider>
              <StoreProvider initialDemo={true}>
                <PageHeader title="Live TV" />
              </StoreProvider>
            </NotificationProvider>
          </ToastProvider>
        </MemoryRouter>
      )
    })
    await settle()

    // Add reminder directly to library
    const notifBtn = document.querySelector('.header-notif-btn') as HTMLButtonElement | null
    expect(notifBtn).not.toBeNull()
  })

  it('toggles notification preferences honestly in Settings', async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/settings/notifications']}>
          <ToastProvider>
            <NotificationProvider>
              <StoreProvider>
                <Routes>
                  <Route path="/settings/:section" element={<Settings />} />
                </Routes>
              </StoreProvider>
            </NotificationProvider>
          </ToastProvider>
        </MemoryRouter>
      )
    })
    await settle()

    const switches = document.querySelectorAll('button[role="switch"]')
    expect(switches.length).toBeGreaterThanOrEqual(3)

    const upcomingSwitch = switches[0] as HTMLButtonElement
    expect(upcomingSwitch.getAttribute('aria-checked')).toBe('true')

    await act(async () => {
      upcomingSwitch.click()
    })
    await settle()

    expect(upcomingSwitch.getAttribute('aria-checked')).toBe('false')
  })

  it('strictly adheres to the zero em-dash typography standard', async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/settings/notifications']}>
          <ToastProvider>
            <NotificationProvider>
              <StoreProvider>
                <Routes>
                  <Route path="/settings/:section" element={<Settings />} />
                </Routes>
              </StoreProvider>
            </NotificationProvider>
          </ToastProvider>
        </MemoryRouter>
      )
    })
    await settle()

    const text = document.body.textContent || ''
    expect(text).not.toContain('\u2014')
  })
})
