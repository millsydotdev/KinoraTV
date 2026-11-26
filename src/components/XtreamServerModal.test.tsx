// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { XtreamServerModal } from './XtreamServerModal'
import { addMirror, getAccountFallbackConfig } from '../lib/xtreamFallback'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('XtreamServerModal UI Component', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
  })

  it('renders server failover modal with primary and mirrors', () => {
    addMirror('xt-test-1', 'http://backup.iptv:8080', 'Backup Mirror', 'http://primary.iptv:8080')

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    act(() => {
      root.render(
        <XtreamServerModal
          open={true}
          onClose={() => undefined}
          sourceId="xt-test-1"
          sourceName="Skyline IPTV"
          primaryServer="http://primary.iptv:8080"
        />,
      )
    })

    expect(host.textContent).toContain('Server Mirrors & DNS Failover: Skyline IPTV')
    expect(host.textContent).toContain('http://primary.iptv:8080')
    expect(host.textContent).toContain('Backup Mirror')
    expect(host.textContent).toContain('http://backup.iptv:8080')

    act(() => root.unmount())
    host.remove()
  })

  it('allows adding a new mirror via the form', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    act(() => {
      root.render(
        <XtreamServerModal
          open={true}
          onClose={() => undefined}
          sourceId="xt-test-2"
          sourceName="Stream Direct"
          primaryServer="http://primary.iptv:8080"
        />,
      )
    })

    const inputs = host.querySelectorAll('input')
    const urlInput = inputs[0]
    const labelInput = inputs[1]
    const form = host.querySelector('form')

    act(() => {
      if (urlInput && labelInput) {
        setInputValue(urlInput, 'http://asia-mirror.iptv:8080')
        setInputValue(labelInput, 'Asia Fast Node')
        form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      }
    })

    const config = getAccountFallbackConfig('xt-test-2')
    expect(config.mirrors.some((m) => m.url === 'http://asia-mirror.iptv:8080')).toBe(true)

    act(() => root.unmount())
    host.remove()
  })

  it('calls onServerSwitched when switching active endpoint', () => {
    addMirror('xt-test-3', 'http://mirror-eu.iptv:8080', 'EU Node', 'http://primary.iptv:8080')
    const switchSpy = vi.fn()

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    act(() => {
      root.render(
        <XtreamServerModal
          open={true}
          onClose={() => undefined}
          sourceId="xt-test-3"
          sourceName="Global Streams"
          primaryServer="http://primary.iptv:8080"
          onServerSwitched={switchSpy}
        />,
      )
    })

    const makeActiveBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Make Active'),
    )
    expect(makeActiveBtn).toBeDefined()

    act(() => {
      makeActiveBtn?.click()
    })

    expect(switchSpy).toHaveBeenCalledWith('http://mirror-eu.iptv:8080')

    act(() => root.unmount())
    host.remove()
  })
})
