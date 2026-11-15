// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { ToastProvider } from '../components/Toast'
import { StoreProvider } from '../state/store'
import { AddSource, Sources } from './Sources'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('Add Personal Media Sources Flow', () => {
  let root: Root
  let host: HTMLDivElement

  const mount = async (initialPath = '/sources/add') => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={[initialPath]}>
          <ToastProvider>
            <StoreProvider>
              <Routes>
                <Route path="/sources" element={<Sources />} />
                <Route path="/sources/add" element={<AddSource />} />
              </Routes>
            </StoreProvider>
          </ToastProvider>
        </MemoryRouter>,
      )
    })
  }

  const clickButton = async (textMatch: string) => {
    const buttons = Array.from(document.querySelectorAll('button'))
    const btn = buttons.find((b) => b.textContent?.includes(textMatch))
    expect(btn, `Button with text "${textMatch}" should exist`).toBeDefined()
    await act(async () => {
      btn!.click()
    })
  }

  const setInputValue = async (selector: string, value: string) => {
    const el = document.querySelector<HTMLInputElement>(selector)!
    expect(el, `Element "${selector}" should exist`).not.toBeNull()
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount()
      })
    }
    if (host) host.remove()
  })

  it('validates radio stream input and prevents submission with invalid URL', async () => {
    await mount('/sources/add')

    // Click on Radio Stream type
    await clickButton('Radio Stream')

    // Expect radio fields
    expect(document.body.textContent).toContain('Station Name')
    expect(document.body.textContent).toContain('Audio Stream URL')

    // Try to submit empty form
    await clickButton('Validate & Review')
    expect(document.body.textContent).toContain('Enter a valid web or stream address.')

    // Try with invalid URL
    await setInputValue('input[inputmode="url"]', 'not-a-valid-url')
    await clickButton('Validate & Review')
    expect(document.body.textContent).toContain('Address must begin with http:// or https://')
  })

  it('completes the 3-step wizard for adding a new radio stream source', async () => {
    await mount('/sources/add')

    // Step 1: Discover / Input
    await clickButton('Radio Stream')
    await setInputValue('input[type="text"]', 'Worldwide FM Live')
    await setInputValue('input[inputmode="url"]', 'https://worldwidefm.out.airtime.pro/worldwidefm_a')

    await clickButton('Validate & Review')

    // Step 2: Validate
    expect(document.body.textContent).toContain('Resource verified & configured')
    expect(document.body.textContent).toContain('Type: STREAM')

    await clickButton('Continue')

    // Step 3: Add confirmation
    expect(document.body.textContent).toContain('Address')
    expect(document.body.textContent).toContain('https://worldwidefm.out.airtime.pro/worldwidefm_a')

    await clickButton('Add Source')

    // Navigates to sources tab=my-sources
    expect(document.body.textContent).toContain('Worldwide FM Live')
  })

  it('adds a custom resource with category taxonomy selector', async () => {
    await mount('/sources/add')

    // Select Custom Resource
    await clickButton('Custom Resource')
    expect(document.body.textContent).toContain('Resource Name')
    expect(document.body.textContent).toContain('Category')

    await setInputValue('input[type="text"]', 'European Space Agency Video Portal')
    await setInputValue('input[inputmode="url"]', 'https://www.esa.int/ESA_Multimedia/Videos')

    await clickButton('Validate & Review')
    expect(document.body.textContent).toContain('Resource verified & configured')

    await clickButton('Continue')
    await clickButton('Add Source')

    expect(document.body.textContent).toContain('European Space Agency Video Portal')
  })
})
