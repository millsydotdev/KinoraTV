// @vitest-environment happy-dom
// Unit tests for RemoteHintBar contextual TV remote legend bar.
// Adheres strictly to typography standards: zero em-dashes.

import { act } from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RemoteHintBar } from './RemoteHintBar'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('RemoteHintBar component', () => {
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

  it('renders nothing when visible is false', () => {
    act(() => {
      root!.render(<RemoteHintBar visible={false} red="Favorites" ok="Tune" />)
    })

    expect(document.querySelector('.remote-hint-bar')).toBeNull()
  })

  it('renders default OK and BACK navigation action hints', () => {
    act(() => {
      root!.render(<RemoteHintBar />)
    })

    const bar = document.querySelector('.remote-hint-bar')
    expect(bar).not.toBeNull()
    expect(document.querySelector('[data-testid="remote-hint-ok"]')?.textContent).toContain('Select')
    expect(document.querySelector('[data-testid="remote-hint-back"]')?.textContent).toContain('Back')
  })

  it('renders color button hints when provided', () => {
    act(() => {
      root!.render(
        <RemoteHintBar
          red="Add to Favorites"
          green="All Categories"
          yellow="Audio Languages"
          blue="Subtitles"
        />,
      )
    })

    expect(document.querySelector('[data-testid="remote-hint-red"]')?.textContent).toContain('Add to Favorites')
    expect(document.querySelector('[data-testid="remote-hint-green"]')?.textContent).toContain('All Categories')
    expect(document.querySelector('[data-testid="remote-hint-yellow"]')?.textContent).toContain('Audio Languages')
    expect(document.querySelector('[data-testid="remote-hint-blue"]')?.textContent).toContain('Subtitles')
  })

  it('renders custom hints with custom badges', () => {
    act(() => {
      root!.render(
        <RemoteHintBar
          info="Guide Details"
          playPause="Play / Pause"
          customHints={[
            { keyName: 'ZAP', label: 'Quick Switch' },
            { keyName: 'CH+/-', label: 'Change Channel' },
          ]}
        />,
      )
    })

    expect(document.querySelector('[data-testid="remote-hint-info"]')?.textContent).toContain('Guide Details')
    expect(document.querySelector('[data-testid="remote-hint-playpause"]')?.textContent).toContain('Play / Pause')
    expect(document.querySelector('[data-testid="remote-hint-zap"]')?.textContent).toContain('Quick Switch')
    expect(document.querySelector('[data-testid="remote-hint-ch---"]')?.textContent).toContain('Change Channel')
  })

  it('bounds the hint bar strictly to the main content inset and below sidebar z-index', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/components/RemoteHintBar.css'), 'utf8')
    const globalCss = readFileSync(resolve(process.cwd(), 'src/styles/global.css'), 'utf8')
    const appTsx = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8')

    // Must track the dynamic shell content inset rather than hard-coded left: 0
    expect(css).toContain('left: var(--content-inset-left')
    expect(css).toContain('justify-content: flex-end')
    expect(css).toContain('width: fit-content')
    expect(css).toContain('z-index: 30')
    expect(css).toContain('pointer-events: none')

    // Global shell defines the dynamic content inset and resets it at mobile drawer width
    expect(globalCss).toContain('--content-inset-left: var(--side-w)')
    expect(globalCss).toContain('--content-inset-left: 0px')
    expect(globalCss).toContain('.shell.has-remote-hint .page')

    // App mounts RemoteHintBar inside <main> and hides it when overlays are open
    const mainBlock = appTsx.slice(appTsx.indexOf('<main id="main"'), appTsx.indexOf('</main>'))
    expect(mainBlock).toContain('<RemoteHintBar')
    expect(appTsx).toContain('!anyOverlayOpen')
  })
})
