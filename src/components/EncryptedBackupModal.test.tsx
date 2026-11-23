// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EncryptedBackupModal } from './EncryptedBackupModal'
import { StoreContext } from '../state/store'

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

  const mockStore = {
    prefs: { theme: 'dark' },
    library: { watchlist: [], favourites: [] },
    importPrefs: vi.fn(),
    importLibrary: vi.fn(),
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
})
