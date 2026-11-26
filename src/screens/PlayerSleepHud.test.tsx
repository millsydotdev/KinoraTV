// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ToastProvider } from '../components/Toast'
import { StoreProvider } from '../state/store'
import { Player } from './Player'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLDivElement | null = null

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
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

describe('Player Sleep Timer HUD and Options', () => {
  it('allows activating sleep timer from settings menu and displays live countdown badge', async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/watch/channel:northlight-one']}>
          <StoreProvider initialDemo>
            <ToastProvider>
              <Routes>
                <Route path="/watch/:ref" element={<Player />} />
              </Routes>
            </ToastProvider>
          </StoreProvider>
        </MemoryRouter>
      )
    })

    // Initially sleep timer badge is not present
    let sleepBadge = host!.querySelector('[data-testid="player-sleep-timer-badge"]')
    expect(sleepBadge).toBeNull()

    // Open settings menu
    const settle = async () => { for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve() }) }
    await settle()

    const settingsBtn = host!.querySelector<HTMLButtonElement>('button[aria-label="Playback options"]')
    expect(settingsBtn).toBeTruthy()

    await act(async () => {
      settingsBtn!.click()
    })

    // Find and select 60 minutes sleep timer option
    const options = Array.from(host!.querySelectorAll<HTMLButtonElement>('.menu-item'))
    const option60 = options.find((opt) => opt.textContent?.includes('60 minutes'))
    expect(option60).toBeTruthy()

    await act(async () => {
      option60!.click()
    })

    // Live countdown badge now appears in player-top
    sleepBadge = host!.querySelector('[data-testid="player-sleep-timer-badge"]')
    expect(sleepBadge).toBeTruthy()
    expect(sleepBadge!.textContent).toContain('60m')

    // Clicking the live HUD badge turns off the sleep timer
    await act(async () => {
      ;(sleepBadge as HTMLButtonElement).click()
    })

    // Badge should now be dismissed
    sleepBadge = host!.querySelector('[data-testid="player-sleep-timer-badge"]')
    expect(sleepBadge).toBeNull()
  })

  it('provides extended sleep timer options including 90 and 120 minutes', async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/watch/channel:northlight-one']}>
          <StoreProvider initialDemo>
            <ToastProvider>
              <Routes>
                <Route path="/watch/:ref" element={<Player />} />
              </Routes>
            </ToastProvider>
          </StoreProvider>
        </MemoryRouter>
      )
    })

    const settle = async () => { for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve() }) }
    await settle()

    const settingsBtn = host!.querySelector<HTMLButtonElement>('button[aria-label="Playback options"]')
    expect(settingsBtn).toBeTruthy()

    await act(async () => {
      settingsBtn!.click()
    })

    const options = Array.from(host!.querySelectorAll<HTMLButtonElement>('.menu-item'))
    const option90 = options.find((opt) => opt.textContent?.includes('90 minutes'))
    const option120 = options.find((opt) => opt.textContent?.includes('120 minutes'))

    expect(option90).toBeTruthy()
    expect(option120).toBeTruthy()

    await act(async () => {
      option90!.click()
    })

    const sleepBadge = host!.querySelector('[data-testid="player-sleep-timer-badge"]')
    expect(sleepBadge).toBeTruthy()
    expect(sleepBadge!.textContent).toContain('90m')
  })
})
