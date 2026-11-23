// @vitest-environment happy-dom
// Unit tests for VirtualKeyboard on-screen remote navigation input.
// Adheres strictly to typography standards: zero em-dashes.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VirtualKeyboard } from './VirtualKeyboard'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('VirtualKeyboard component', () => {
  let root: Root | null = null
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount()
      })
      root = null
    }
    document.body.replaceChildren()
  })

  it('renders nothing when closed', () => {
    act(() => {
      root!.render(
        <VirtualKeyboard
          open={false}
          value=""
          onChange={vi.fn()}
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />,
      )
    })

    expect(document.querySelector('.virtual-kb-backdrop')).toBeNull()
  })

  it('renders title, placeholder, and character keys when open', () => {
    act(() => {
      root!.render(
        <VirtualKeyboard
          open={true}
          value=""
          title="Remote Search Keyboard"
          placeholder="Type here..."
          onChange={vi.fn()}
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />,
      )
    })

    const backdrop = document.querySelector('.virtual-kb-backdrop')
    expect(backdrop).not.toBeNull()
    expect(backdrop?.textContent).toContain('Remote Search Keyboard')
    expect(backdrop?.textContent).toContain('Type here...')

    // Check that keys are rendered
    const keys = document.querySelectorAll('.virtual-kb-key')
    expect(keys.length).toBeGreaterThan(30)
  })

  it('appends characters on key click', () => {
    const onChange = vi.fn()
    act(() => {
      root!.render(
        <VirtualKeyboard
          open={true}
          value="kin"
          onChange={onChange}
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />,
      )
    })

    const oKey = Array.from(document.querySelectorAll('.virtual-kb-key')).find(
      (el) => el.textContent?.trim() === 'o',
    ) as HTMLButtonElement | undefined
    expect(oKey).toBeDefined()

    act(() => {
      oKey!.click()
    })

    expect(onChange).toHaveBeenCalledWith('kino')
  })

  it('appends URL shortcut macros on shortcut button click', () => {
    const onChange = vi.fn()
    act(() => {
      root!.render(
        <VirtualKeyboard
          open={true}
          value=""
          urlMode={true}
          onChange={onChange}
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />,
      )
    })

    const httpsBtn = Array.from(
      document.querySelectorAll('.virtual-kb-shortcut-btn'),
    ).find((el) => el.textContent?.trim() === 'https://') as HTMLButtonElement | undefined
    expect(httpsBtn).toBeDefined()

    act(() => {
      httpsBtn!.click()
    })

    expect(onChange).toHaveBeenCalledWith('https://')
  })

  it('handles backspace delete action', () => {
    const onChange = vi.fn()
    act(() => {
      root!.render(
        <VirtualKeyboard
          open={true}
          value="hello!"
          onChange={onChange}
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />,
      )
    })

    const delBtn = document.querySelector('.virtual-kb-key-danger') as HTMLButtonElement | null
    expect(delBtn).not.toBeNull()

    act(() => {
      delBtn!.click()
    })

    expect(onChange).toHaveBeenCalledWith('hello')
  })

  it('clears text when Clear All is clicked', () => {
    const onChange = vi.fn()
    act(() => {
      root!.render(
        <VirtualKeyboard
          open={true}
          value="some long text to clear"
          onChange={onChange}
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />,
      )
    })

    const clearBtn = document.querySelector('.virtual-kb-btn-clear') as HTMLButtonElement | null
    expect(clearBtn).not.toBeNull()

    act(() => {
      clearBtn!.click()
    })

    expect(onChange).toHaveBeenCalledWith('')
  })

  it('toggles uppercase letters when Shift is active', () => {
    const onChange = vi.fn()
    act(() => {
      root!.render(
        <VirtualKeyboard
          open={true}
          value=""
          onChange={onChange}
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />,
      )
    })

    const shiftBtn = Array.from(document.querySelectorAll('.virtual-kb-key-wide')).find(
      (el) => el.textContent?.trim() === 'shift',
    ) as HTMLButtonElement | undefined
    expect(shiftBtn).toBeDefined()

    act(() => {
      shiftBtn!.click()
    })

    expect(shiftBtn?.textContent?.trim()).toBe('CAPS')

    // Find key 'A'
    const aKey = Array.from(document.querySelectorAll('.virtual-kb-key')).find(
      (el) => el.textContent?.trim() === 'A',
    ) as HTMLButtonElement | undefined
    expect(aKey).toBeDefined()

    act(() => {
      aKey!.click()
    })

    expect(onChange).toHaveBeenCalledWith('A')
  })

  it('triggers onSubmit when Submit button is clicked', () => {
    const onSubmit = vi.fn()
    act(() => {
      root!.render(
        <VirtualKeyboard
          open={true}
          value="ready text"
          onChange={vi.fn()}
          onSubmit={onSubmit}
          onClose={vi.fn()}
        />,
      )
    })

    const submitBtn = document.querySelector('.virtual-kb-btn-submit') as HTMLButtonElement | null
    expect(submitBtn).not.toBeNull()

    act(() => {
      submitBtn!.click()
    })

    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('dismisses when Escape key is pressed', () => {
    const onClose = vi.fn()
    act(() => {
      root!.render(
        <VirtualKeyboard
          open={true}
          value=""
          onChange={vi.fn()}
          onSubmit={vi.fn()}
          onClose={onClose}
        />,
      )
    })

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
