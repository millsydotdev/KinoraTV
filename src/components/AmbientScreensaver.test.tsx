// @vitest-environment happy-dom
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AmbientScreensaver } from './AmbientScreensaver'

let root: Root
let container: HTMLDivElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
})

describe('AmbientScreensaver', () => {
  it('renders nothing when visible is false', () => {
    act(() => {
      root.render(<AmbientScreensaver visible={false} onDismiss={() => {}} />)
    })
    expect(container.querySelector('.ambient-screensaver-backdrop')).toBeNull()
  })

  it('renders clock, title, and backdrop image when visible', () => {
    act(() => {
      root.render(
        <AmbientScreensaver
          visible={true}
          onDismiss={() => {}}
          title="Northlight One Live"
          weatherInfo="14°C Clear"
          backdropUrl="https://example.com/art.jpg"
        />
      )
    })
    const backdrop = container.querySelector('.ambient-screensaver-backdrop')
    expect(backdrop).not.toBeNull()
    expect(container.textContent).toContain('Northlight One Live')
    expect(container.textContent).toContain('14°C Clear')
    expect(container.textContent).toContain('Press any button or move mouse to wake')
  })

  it('triggers onDismiss when clicked or when key is pressed', () => {
    const onDismiss = vi.fn()
    act(() => {
      root.render(<AmbientScreensaver visible={true} onDismiss={onDismiss} />)
    })

    const backdrop = container.querySelector('.ambient-screensaver-backdrop') as HTMLElement
    act(() => {
      backdrop.click()
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    })
    expect(onDismiss).toHaveBeenCalledTimes(2)
  })
})
