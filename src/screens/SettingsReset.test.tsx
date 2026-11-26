// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toast'
import { StoreProvider } from '../state/store'
import { Settings } from './Settings'
import * as native from '../lib/native'

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)

vi.mock('../lib/native', async (original) => {
  const actual = await original<typeof import('../lib/native')>()
  return {
    ...actual,
    getAppInfo: vi.fn().mockResolvedValue({
      name: 'Kinora',
      version: '0.6.0',
      profile: 'release',
      os: 'linux',
      arch: 'x86_64',
      commitHash: 'test',
      dataDir: '/test/data',
    }),
    loadSources: vi.fn().mockResolvedValue({ sources: [], guides: [], mappings: [], notice: null }),
    saveSources: vi.fn().mockResolvedValue(undefined),
    getPlatformMode: vi.fn().mockResolvedValue({ mode: 'standalone' }),
  }
})

let root: Root | null = null
let host: HTMLDivElement | null = null

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

describe('Settings Factory Reset', () => {
  it('provides Factory Reset action and purges all data on confirmation', async () => {
    localStorage.setItem('kinora.test.key', 'sample-value')
    localStorage.setItem('kinora.prefs.v2', JSON.stringify({ theme: 'midnight' }))

    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/settings/data']}>
          <StoreProvider initialDemo>
            <ToastProvider>
              <Routes>
                <Route path="/settings" element={<Settings />} />
                <Route path="/settings/:section" element={<Settings />} />
                <Route path="/setup" element={<div data-testid="setup-screen">Setup Screen</div>} />
              </Routes>
            </ToastProvider>
          </StoreProvider>
        </MemoryRouter>,
      )
    })

    await settle()

    // Find the Factory reset row button
    const eraseBtn = Array.from(host!.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.trim() === 'Erase all',
    )
    expect(eraseBtn).toBeDefined()

    // Click Erase all to trigger confirmation dialog
    await act(async () => {
      eraseBtn!.click()
    })
    await settle()

    expect(host!.textContent).toContain('Erase all data on this device?')

    // Confirm erasure
    const confirmBtn = Array.from(host!.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.trim() === 'Erase everything',
    )
    expect(confirmBtn).toBeDefined()

    await act(async () => {
      confirmBtn!.click()
    })
    await settle()

    // Verify native sources were wiped
    expect(native.saveSources).toHaveBeenCalledWith({
      sources: [],
      guides: [],
      mappings: [],
    })

    // Verify localStorage kinora keys were cleared
    expect(localStorage.getItem('kinora.test.key')).toBeNull()

    // Verify redirected to /setup
    expect(host!.querySelector('[data-testid="setup-screen"]')).toBeTruthy()
  })
})
