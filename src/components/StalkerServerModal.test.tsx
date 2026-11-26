// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StalkerServerModal } from './StalkerServerModal'
import * as nativeModule from '../lib/native'
import * as stalkerModule from '../lib/stalker'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../lib/native', async (importOriginal) => {
  const actual = await importOriginal<typeof nativeModule>()
  return {
    ...actual,
    connectStalker: vi.fn(),
    disconnectStalker: vi.fn(),
    isStalkerConnected: vi.fn(),
    loadStalkerCatalogue: vi.fn(),
  }
})

describe('StalkerServerModal', () => {
  let root: Root
  let host: HTMLDivElement

  const setInputValue = (input: HTMLInputElement, value: string) => {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set
    nativeInputValueSetter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  beforeEach(() => {
    localStorage.clear()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    vi.mocked(nativeModule.isStalkerConnected).mockResolvedValue(false)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    host.remove()
    vi.clearAllMocks()
  })

  it('does not render when open is false', () => {
    act(() => {
      root.render(<StalkerServerModal open={false} onClose={vi.fn()} />)
    })
    expect(host.innerHTML).toBe('')
  })

  it('renders modal dialog when open is true', async () => {
    await act(async () => {
      root.render(<StalkerServerModal open={true} onClose={vi.fn()} />)
    })
    expect(host.querySelector('.stalker-modal')).not.toBeNull()
    expect(host.textContent).toContain('Stalker / MAG Portal')
    expect(host.querySelector('#stalker-url-input')).not.toBeNull()
    expect(host.querySelector('#stalker-mac-input')).not.toBeNull()
  })

  it('auto-formats MAC address as user inputs characters', async () => {
    await act(async () => {
      root.render(<StalkerServerModal open={true} onClose={vi.fn()} />)
    })

    const macInput = host.querySelector('#stalker-mac-input') as HTMLInputElement
    expect(macInput).not.toBeNull()

    act(() => {
      setInputValue(macInput, '001A79AABBCC')
    })

    expect(macInput.value).toBe('00:1A:79:AA:BB:CC')
  })

  it('shows error if invalid MAC address or URL is entered upon submission', async () => {
    await act(async () => {
      root.render(<StalkerServerModal open={true} onClose={vi.fn()} />)
    })

    const form = host.querySelector('.stalker-form') as HTMLFormElement
    const urlInput = host.querySelector('#stalker-url-input') as HTMLInputElement
    const macInput = host.querySelector('#stalker-mac-input') as HTMLInputElement

    act(() => {
      setInputValue(urlInput, 'http://portal.example.com')
      setInputValue(macInput, 'invalid-mac')
    })

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(host.textContent).toContain('Please provide a valid 6-byte hexadecimal MAC address')
  })

  it('connects successfully and displays profile card and catalogue statistics', async () => {
    const mockProfile: nativeModule.StalkerProfile = {
      mac: '00:1A:79:12:34:56',
      name: 'John Doe MAG',
      status: 'Active',
      expDate: '2027-01-01',
      phone: null,
    }

    const mockCatalogue: nativeModule.StalkerCatalogue = {
      portalUrl: 'http://portal.example.com/c',
      mac: '00:1A:79:12:34:56',
      profile: mockProfile,
      genres: [{ id: '1', title: 'News', alias: 'news' }],
      channels: [
        {
          id: '1',
          number: 1,
          name: 'BBC News',
          cmd: 'ffmpeg http://example.com/live.m3u8',
          logo: null,
          genreId: '1',
        },
      ],
      vod: [
        {
          id: '10',
          name: 'Inception',
          cmd: 'ffrt http://example.com/vod.mp4',
          poster: null,
          year: '2010',
          categoryId: '1',
        },
      ],
    }

    vi.mocked(nativeModule.connectStalker).mockResolvedValue(mockProfile)
    vi.mocked(nativeModule.loadStalkerCatalogue).mockResolvedValue(mockCatalogue)

    const onConnected = vi.fn()

    act(() => {
      root.render(<StalkerServerModal open={true} onClose={vi.fn()} onPortalConnected={onConnected} />)
    })

    const form = host.querySelector('.stalker-form') as HTMLFormElement
    const urlInput = host.querySelector('#stalker-url-input') as HTMLInputElement
    const macInput = host.querySelector('#stalker-mac-input') as HTMLInputElement

    act(() => {
      setInputValue(urlInput, 'http://portal.example.com/c')
      setInputValue(macInput, '00:1A:79:12:34:56')
    })

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(nativeModule.connectStalker).toHaveBeenCalledWith('http://portal.example.com/c', '00:1A:79:12:34:56')
    expect(nativeModule.loadStalkerCatalogue).toHaveBeenCalled()
    expect(onConnected).toHaveBeenCalledWith(mockCatalogue)

    expect(host.textContent).toContain('John Doe MAG')
    expect(host.textContent).toContain('Active')
    expect(host.textContent).toContain('Channels:')
    expect(host.textContent).toContain('VOD Titles:')
  })

  it('loads saved portals and triggers disconnect', async () => {
    stalkerModule.saveStalkerPortal({
      id: 'saved-1',
      portalUrl: 'http://saved.example.com',
      mac: '00:1A:79:99:99:99',
      label: 'My Saved Portal',
    })

    vi.mocked(nativeModule.isStalkerConnected).mockResolvedValue(true)

    act(() => {
      root.render(<StalkerServerModal open={true} onClose={vi.fn()} />)
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(host.textContent).toContain('My Saved Portal')
    expect(host.textContent).toContain('00:1A:79:99:99:99')

    const disconnectBtn = host.querySelector('.btn-secondary') as HTMLButtonElement
    expect(disconnectBtn).not.toBeNull()

    await act(async () => {
      disconnectBtn.click()
    })

    expect(nativeModule.disconnectStalker).toHaveBeenCalled()
  })
})
