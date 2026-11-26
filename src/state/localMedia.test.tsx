// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { LocalMediaProvider, useLocalMedia } from './localMedia'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('LocalMediaProvider and real-time watcher integration', () => {
  it('provides default catalogue and exposes checkForChanges', async () => {
    let capturedState: ReturnType<typeof useLocalMedia> | null = null

    function TestConsumer() {
      capturedState = useLocalMedia()
      return (
        <div data-testid="consumer">
          <span data-testid="movies-count">{capturedState.catalogue.movies.length}</span>
          <span data-testid="libs-count">{capturedState.libraries.length}</span>
        </div>
      )
    }

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <LocalMediaProvider>
          <TestConsumer />
        </LocalMediaProvider>
      )
    })

    expect(capturedState).toBeTruthy()
    expect(capturedState!.catalogue.movies).toEqual([])
    expect(capturedState!.libraries).toEqual([])
    expect(typeof capturedState!.checkForChanges).toBe('function')

    // Exercise checkForChanges in non-Tauri / test environment (gracefully returns empty list)
    let checkResult: any = null
    await act(async () => {
      checkResult = await capturedState!.checkForChanges()
    })
    expect(Array.isArray(checkResult)).toBe(true)

    await act(async () => {
      root.unmount()
    })
    host.remove()
  })
})
