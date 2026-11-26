// @vitest-environment happy-dom
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandPalette } from './CommandPalette'
import { StoreProvider } from '../../state/store'

let root: Root
let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  localStorage.clear()
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
})

describe('CommandPalette component', () => {
  it('does not render when open is false', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <StoreProvider initialPlaylists={[]}>
            <CommandPalette open={false} onClose={() => {}} />
          </StoreProvider>
        </MemoryRouter>,
      )
    })

    expect(container.querySelector('.ds-command-dialog')).toBeNull()
  })

  it('renders navigation commands and quick actions when open is true', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <StoreProvider initialPlaylists={[]}>
            <CommandPalette open={true} onClose={() => {}} />
          </StoreProvider>
        </MemoryRouter>,
      )
    })

    expect(container.querySelector('.ds-command-dialog')).toBeTruthy()
    expect(container.textContent).toContain('Go to Home')
    expect(container.textContent).toContain('Go to Live TV')
    expect(container.textContent).toContain('Toggle Full Screen')
  })

  it('filters commands, channels, and titles based on search input', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <StoreProvider initialPlaylists={[]}>
            <CommandPalette open={true} onClose={() => {}} />
          </StoreProvider>
        </MemoryRouter>,
      )
    })

    const input = container.querySelector<HTMLInputElement>('.ds-command-input')
    expect(input).toBeTruthy()

    await act(async () => {
      if (input) {
        input.value = 'Settings'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
      }
    })

    expect(container.textContent).toContain('Go to Settings')
    expect(container.textContent).toContain('Settings: Playback')
  })

  it('closes when Escape key is pressed', async () => {
    const onClose = vi.fn()

    await act(async () => {
      root.render(
        <MemoryRouter>
          <StoreProvider initialPlaylists={[]}>
            <CommandPalette open={true} onClose={onClose} />
          </StoreProvider>
        </MemoryRouter>,
      )
    })

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('executes selected command and saves it to recent history on Enter', async () => {
    const onClose = vi.fn()

    await act(async () => {
      root.render(
        <MemoryRouter>
          <StoreProvider initialPlaylists={[]}>
            <CommandPalette open={true} onClose={onClose} />
          </StoreProvider>
        </MemoryRouter>,
      )
    })

    const dialog = container.querySelector('.ds-command-dialog')
    expect(dialog).toBeTruthy()

    await act(async () => {
      dialog?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    expect(onClose).toHaveBeenCalledTimes(1)
    const stored = localStorage.getItem('kinora.recent_commands.v1')
    expect(stored).toBeTruthy()
  })
})
