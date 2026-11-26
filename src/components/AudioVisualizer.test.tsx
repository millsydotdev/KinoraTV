// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AudioVisualizer } from './AudioVisualizer'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('AudioVisualizer component', () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)

    // Mock HTMLCanvasElement.getContext
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      scale: vi.fn(),
      clearRect: vi.fn(),
      createLinearGradient: vi.fn().mockReturnValue({
        addColorStop: vi.fn(),
      }),
      createRadialGradient: vi.fn().mockReturnValue({
        addColorStop: vi.fn(),
      }),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      rect: vi.fn(),
      roundRect: vi.fn(),
      set fillStyle(_val: unknown) {},
      set strokeStyle(_val: unknown) {},
      set lineWidth(_val: unknown) {},
      set shadowBlur(_val: unknown) {},
      set shadowColor(_val: unknown) {},
    }) as unknown as typeof HTMLCanvasElement.prototype.getContext
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('renders canvas and visualizer mode controls by default', async () => {
    await act(async () => {
      root.render(<AudioVisualizer isPlaying={true} />)
    })

    const canvas = host.querySelector('canvas.audio-vis-canvas')
    expect(canvas).toBeTruthy()

    const controls = host.querySelector('.audio-vis-modes')
    expect(controls).toBeTruthy()

    const modeButtons = host.querySelectorAll('.audio-vis-mode-btn')
    expect(modeButtons.length).toBe(4) // Bars, Wave, Halo, Glow
  })

  it('hides controls when showControls is false', async () => {
    await act(async () => {
      root.render(<AudioVisualizer isPlaying={true} showControls={false} />)
    })

    const controls = host.querySelector('.audio-vis-modes')
    expect(controls).toBeNull()
  })

  it('switches visualizer mode when a mode button is clicked', async () => {
    await act(async () => {
      root.render(<AudioVisualizer isPlaying={true} defaultMode="bars" />)
    })

    const waveBtn = Array.from(host.querySelectorAll('.audio-vis-mode-btn')).find(
      (btn) => btn.textContent === 'Wave'
    ) as HTMLButtonElement
    expect(waveBtn).toBeTruthy()

    await act(async () => {
      waveBtn.click()
    })

    expect(waveBtn.classList.contains('is-active')).toBe(true)
  })

  it('supports simulated procedural harmonic synthesis when analyserNode is null', async () => {
    await act(async () => {
      root.render(<AudioVisualizer isPlaying={true} analyserNode={null} defaultMode="glow" />)
    })

    const canvas = host.querySelector('canvas')
    expect(canvas).toBeTruthy()
  })
})
