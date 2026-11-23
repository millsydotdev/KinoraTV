// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RemoteControlModal } from './RemoteControlModal'
import * as nativeModule from '../lib/native'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../lib/native', async (importOriginal) => {
  const actual = await importOriginal<typeof nativeModule>()
  return {
    ...actual,
    getRemoteServerStatus: vi.fn(),
    startRemoteServer: vi.fn(),
    stopRemoteServer: vi.fn(),
  }
})

describe('RemoteControlModal', () => {
  let root: Root
  let host: HTMLDivElement

  const mockStatus: nativeModule.RemoteServerStatus = {
    running: true,
    port: 5198,
    localIp: '192.168.1.120',
    pairingPin: '7492',
    serverUrl: 'http://192.168.1.120:5198',
    connectedClients: 1,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(nativeModule.getRemoteServerStatus).mockResolvedValue(mockStatus)
    vi.mocked(nativeModule.startRemoteServer).mockResolvedValue(mockStatus)
    vi.mocked(nativeModule.stopRemoteServer).mockResolvedValue(true)

    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    host.remove()
  })

  it('renders nothing when closed', async () => {
    await act(async () => {
      root.render(<RemoteControlModal open={false} onClose={() => {}} />)
    })
    expect(host.innerHTML).toBe('')
  })

  it('renders pairing PIN, server URL and QR code when open and running', async () => {
    await act(async () => {
      root.render(<RemoteControlModal open={true} onClose={() => {}} />)
    })

    expect(host.textContent).toContain('Wireless Remote Control')
    expect(host.textContent).toContain('7492')
    expect(host.textContent).toContain('Server Online')
    expect(host.textContent).toContain('1 client connected')

    const input = host.querySelector<HTMLInputElement>('.remote-url-input')
    expect(input?.value).toBe('http://192.168.1.120:5198')

    const svg = host.querySelector('svg')
    expect(svg).not.toBeNull()
  })

  it('allows copying the server URL to clipboard', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: writeTextMock,
      },
      configurable: true,
    })

    await act(async () => {
      root.render(<RemoteControlModal open={true} onClose={() => {}} />)
    })

    const copyBtn = host.querySelector<HTMLButtonElement>('button[title="Copy URL"]')
    expect(copyBtn).not.toBeNull()

    await act(async () => {
      copyBtn?.click()
    })

    expect(writeTextMock).toHaveBeenCalledWith('http://192.168.1.120:5198')
    expect(host.textContent).toContain('Copied')
  })

  it('allows stopping the server', async () => {
    await act(async () => {
      root.render(<RemoteControlModal open={true} onClose={() => {}} />)
    })

    const buttons = Array.from(host.querySelectorAll('button'))
    const stopBtn = buttons.find((b) => b.textContent?.includes('Stop Server'))
    expect(stopBtn).toBeDefined()

    await act(async () => {
      stopBtn?.click()
    })

    expect(nativeModule.stopRemoteServer).toHaveBeenCalled()
    expect(host.textContent).toContain('Start Server')
    expect(host.textContent).toContain('Server Stopped')
  })

  it('allows regenerating the PIN', async () => {
    await act(async () => {
      root.render(<RemoteControlModal open={true} onClose={() => {}} />)
    })

    const buttons = Array.from(host.querySelectorAll('button'))
    const newPinBtn = buttons.find((b) => b.textContent?.includes('New PIN'))
    expect(newPinBtn).toBeDefined()

    await act(async () => {
      newPinBtn?.click()
    })

    expect(nativeModule.stopRemoteServer).toHaveBeenCalled()
    expect(nativeModule.startRemoteServer).toHaveBeenCalled()
  })
})
