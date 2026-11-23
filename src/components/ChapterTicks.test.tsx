// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ChapterTicks } from './ChapterTicks'
import type { ChapterMarker } from '../lib/chapters'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('ChapterTicks', () => {
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

  it('renders nothing when markers list is empty', () => {
    act(() => {
      root!.render(<ChapterTicks markers={[]} />)
    })
    expect(container.firstChild).toBeNull()
  })

  it('renders tick marks positioned by relative percentage', () => {
    const markers: ChapterMarker[] = [
      { startSec: 300, percent: 25, title: 'Chapter 2' },
      { startSec: 900, percent: 75, title: 'Chapter 3' },
    ]

    act(() => {
      root!.render(<ChapterTicks markers={markers} activePercent={30} />)
    })

    const ticks = container.querySelectorAll('.chapter-tick-mark')
    expect(ticks).toHaveLength(2)

    expect((ticks[0] as HTMLElement).style.left).toBe('25%')
    expect((ticks[0] as HTMLElement).className).toContain('is-passed')

    expect((ticks[1] as HTMLElement).style.left).toBe('75%')
    expect((ticks[1] as HTMLElement).className).not.toContain('is-passed')
  })
})
