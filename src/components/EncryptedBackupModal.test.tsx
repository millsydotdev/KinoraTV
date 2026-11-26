// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EncryptedBackupModal } from './EncryptedBackupModal'
import { StoreContext } from '../state/store'
import type { KinoraBackupPayload } from '../lib/encryptedBackup'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('EncryptedBackupModal UI Component', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
  })

  const mockImportPrefs = vi.fn()
  const mockImportLibrary = vi.fn()
  const mockStore = {
    prefs: { theme: 'dark' },
    library: { watchlist: [], favourites: [] },
    importPrefs: mockImportPrefs,
    importLibrary: mockImportLibrary,
  } as unknown as Parameters<typeof StoreContext.Provider>[0]['value']

  it('renders export mode with passphrase fields and export action', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    act(() => {
      root.render(
        <StoreContext.Provider value={mockStore}>
          <EncryptedBackupModal open={true} onClose={() => undefined} mode="export" />
        </StoreContext.Provider>,
      )
    })

    expect(host.textContent).toContain('Create Encrypted Backup (.kinorabackup)')
    expect(host.textContent).toContain('Passphrase (minimum 4 characters)')
    expect(host.textContent).toContain('Confirm Passphrase')

    act(() => root.unmount())
    host.remove()
  })

  it('renders restore mode with file selector and decryption field', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    act(() => {
      root.render(
        <StoreContext.Provider value={mockStore}>
          <EncryptedBackupModal open={true} onClose={() => undefined} mode="restore" />
        </StoreContext.Provider>,
      )
    })

    expect(host.textContent).toContain('Restore Encrypted Backup (.kinorabackup)')
    expect(host.textContent).toContain('Select Backup File')
    expect(host.textContent).toContain('Decryption Passphrase')

    act(() => root.unmount())
    host.remove()
  })

  it('progresses to step 2 review and migration options upon successful inspection', async () => {
    const encModule = await import('../lib/encryptedBackup')
    const samplePayload: KinoraBackupPayload = {
      app: 'Kinora',
      version: 3,
      exportedAt: '2026-11-23T12:00:00Z',
      prefs: { theme: 'dark' },
      library: { favourites: ['ch-1'], watchlist: ['mov-1'], history: [] },
      bouquets: { bouquets: [{ id: 'b-1', name: 'Sports' }] },
    }

    vi.spyOn(encModule, 'decryptBackupPayload').mockResolvedValue(samplePayload)

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <StoreContext.Provider value={mockStore}>
          <EncryptedBackupModal open={true} onClose={() => undefined} mode="restore" />
        </StoreContext.Provider>,
      )
    })

    const fileInput = host.querySelector<HTMLInputElement>('input[type="file"]')
    const passInput = host.querySelector<HTMLInputElement>('#restore-pass')
    const form = host.querySelector('form')

    expect(fileInput).not.toBeNull()
    expect(passInput).not.toBeNull()

    // Simulate file selection and password entry
    const mockFile = new File(['mock content'], 'test.kinorabackup', { type: 'application/octet-stream' })
    Object.defineProperty(fileInput, 'files', { value: [mockFile] })
    await act(async () => {
      fileInput?.dispatchEvent(new Event('change', { bubbles: true }))
    })

    if (passInput) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      setter?.call(passInput, 'Secret1234')
      await act(async () => {
        passInput.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }

    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(host.textContent).toContain('Step 2 of 2: Pre-Flight Review & Migration')
    expect(host.textContent).toContain('Favourites')
    expect(host.textContent).toContain('Watchlist Items')
    expect(host.textContent).toContain('Apply Restoration & Migrate')

    const restoreBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Apply Restoration & Migrate')
    )
    expect(restoreBtn).toBeDefined()

    await act(async () => {
      restoreBtn?.click()
    })

    expect(mockImportPrefs).toHaveBeenCalled()
    expect(mockImportLibrary).toHaveBeenCalled()

    act(() => root.unmount())
    host.remove()
  })
})
