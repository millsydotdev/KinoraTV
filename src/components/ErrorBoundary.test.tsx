// @vitest-environment happy-dom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function Bomb({ shouldThrow, message }: { shouldThrow: boolean; message?: string }) {
  if (shouldThrow) {
    throw new Error(message || 'Explosion in component render!')
  }
  return <div data-testid="bomb-safe">Component rendered safely</div>
}

describe('ErrorBoundary component', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    // Suppress console.error output from React during intentional throw tests
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    host.remove()
    vi.restoreAllMocks()
  })

  it('renders children without error when no exception occurs', async () => {
    await act(async () => {
      root.render(
        <ErrorBoundary>
          <Bomb shouldThrow={false} />
        </ErrorBoundary>,
      )
    })

    expect(host.querySelector('[data-testid="bomb-safe"]')).not.toBeNull()
    expect(host.textContent).toContain('Component rendered safely')
  })

  it('catches render errors and displays fallback UI', async () => {
    await act(async () => {
      root.render(
        <ErrorBoundary>
          <Bomb shouldThrow={true} message="Test error occurred" />
        </ErrorBoundary>,
      )
    })

    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    expect(host.textContent).toContain('Something went wrong')
    expect(host.textContent).toContain('Test error occurred')
  })

  it('sanitizes and redacts sensitive URLs and tokens from error display', async () => {
    const sensitive = 'Failed connecting to https://user:secret@example.com/stream?token=abcdef0123456789abcdef0123456789 at 192.168.1.1'
    await act(async () => {
      root.render(
        <ErrorBoundary>
          <Bomb shouldThrow={true} message={sensitive} />
        </ErrorBoundary>,
      )
    })

    const text = host.textContent || ''
    expect(text).not.toContain('https://user:secret@example.com')
    expect(text).not.toContain('abcdef0123456789')
    expect(text).not.toContain('192.168.1.1')
    expect(text).toContain('[redacted URL]')
  })

  it('supports custom fallback function and reset callback', async () => {
    const onResetSpy = vi.fn()

    function Wrapper() {
      const [throwing, setThrowing] = useState(true)
      return (
        <ErrorBoundary
          onReset={onResetSpy}
          fallback={(_err, reset) => (
            <div data-testid="custom-fallback">
              <button
                type="button"
                id="reset-btn"
                onClick={() => {
                  setThrowing(false)
                  reset()
                }}
              >
                Reset
              </button>
            </div>
          )}
        >
          <Bomb shouldThrow={throwing} message="Custom error" />
        </ErrorBoundary>
      )
    }

    await act(async () => {
      root.render(<Wrapper />)
    })

    expect(host.querySelector('[data-testid="custom-fallback"]')).not.toBeNull()

    const btn = host.querySelector('#reset-btn') as HTMLButtonElement
    expect(btn).not.toBeNull()

    await act(async () => {
      btn.click()
    })

    expect(onResetSpy).toHaveBeenCalled()
    expect(host.querySelector('[data-testid="bomb-safe"]')).not.toBeNull()
  })
})
