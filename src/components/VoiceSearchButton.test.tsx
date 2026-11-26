// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { VoiceSearchButton } from './VoiceSearchButton'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('VoiceSearchButton component', () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    host.remove()
  })

  it('renders gracefully in default state', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <VoiceSearchButton />
        </MemoryRouter>
      )
    })

    const btn = host.querySelector('.voice-search-btn')
    expect(btn).toBeTruthy()
    expect(btn?.getAttribute('aria-label')).toBe('Search by voice')
  })

  it('displays tooltip message when clicked outside speech recognition support', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <VoiceSearchButton />
        </MemoryRouter>
      )
    })

    const btn = host.querySelector('.voice-search-btn') as HTMLButtonElement
    expect(btn).toBeTruthy()

    await act(async () => {
      btn.click()
    })

    const notice = host.querySelector('.voice-hud')
    expect(notice).toBeTruthy()
    expect(notice?.textContent).toContain('Voice search is not supported')
  })
})
