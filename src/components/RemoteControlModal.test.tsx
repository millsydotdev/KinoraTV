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

  it('allows switching to trusted devices tab and revoking a device', async () => {
    const mockDevice: nativeModule.TrustedDevice = {
      id: 'dev-123',
      name: 'Test iPhone',
      deviceType: 'phone',
      capabilities: ['remoteControl', 'playbackControl'],
      authToken: 'token-abc',
      pairedAt: 1700000000,
      lastSeenAt: 1700000100,
      ipAddress: '192.168.1.50',
      revoked: false,
    }

    vi.spyOn(nativeModule, 'getTrustedDevices').mockResolvedValue([mockDevice])
    const revokeSpy = vi.spyOn(nativeModule, 'revokeTrustedDevice').mockResolvedValue(true)

    await act(async () => {
      root.render(<RemoteControlModal open={true} onClose={() => {}} />)
    })

    const devTabBtn = Array.from(host.querySelectorAll<HTMLButtonElement>('.remote-tab-btn')).find((b) =>
      b.textContent?.includes('Trusted Devices')
    )
    expect(devTabBtn).toBeDefined()

    await act(async () => {
      devTabBtn?.click()
    })

    expect(host.textContent).toContain('Test iPhone')
    expect(host.textContent).toContain('192.168.1.50')

    const revokeBtn = host.querySelector<HTMLButtonElement>('button[title="Revoke device access"]')
    expect(revokeBtn).not.toBeNull()

    await act(async () => {
      revokeBtn?.click()
    })

    expect(revokeSpy).toHaveBeenCalledWith('dev-123')
  })

  it('allows switching to audit log tab', async () => {
    const mockAudit: nativeModule.AuditedAction = {
      id: 'aud-1',
      timestamp: 1700000000,
      deviceId: 'dev-123',
      deviceName: 'Test Phone',
      capability: 'RemoteControl',
      action: 'dpad_select',
      details: '{}',
      status: 'success',
    }

    vi.spyOn(nativeModule, 'getAuditLog').mockResolvedValue([mockAudit])

    await act(async () => {
      root.render(<RemoteControlModal open={true} onClose={() => {}} />)
    })

    const auditTabBtn = Array.from(host.querySelectorAll<HTMLButtonElement>('.remote-tab-btn')).find((b) =>
      b.textContent?.includes('Audit Log')
    )
    expect(auditTabBtn).toBeDefined()

    await act(async () => {
      auditTabBtn?.click()
    })

    expect(host.textContent).toContain('dpad_select')
    expect(host.textContent).toContain('Test Phone')
  })

  it('allows renaming a trusted device inline and regenerating a 6-digit PIN', async () => {
    const mockDevice: nativeModule.TrustedDevice = {
      id: 'dev-456',
      name: 'Old Tablet',
      deviceType: 'tablet',
      capabilities: ['remoteControl'],
      authToken: 'token-def',
      pairedAt: 1700000000,
      lastSeenAt: 1700000100,
      ipAddress: '192.168.1.77',
      revoked: false,
    }

    vi.spyOn(nativeModule, 'getTrustedDevices').mockResolvedValue([mockDevice])
    const renameSpy = vi.spyOn(nativeModule, 'renameTrustedDevice').mockResolvedValue(true)

    await act(async () => {
      root.render(<RemoteControlModal open={true} onClose={() => {}} />)
    })

    // Regenerate PIN should produce a 6-digit numeric PIN
    const newPinBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('New PIN')
    )
    expect(newPinBtn).toBeDefined()
    await act(async () => {
      newPinBtn?.click()
    })
    expect(nativeModule.startRemoteServer).toHaveBeenCalledWith(5198, expect.stringMatching(/^\d{6}$/))

    // Switch to Trusted Devices and rename
    const devTabBtn = Array.from(host.querySelectorAll<HTMLButtonElement>('.remote-tab-btn')).find((b) =>
      b.textContent?.includes('Trusted Devices')
    )
    await act(async () => {
      devTabBtn?.click()
    })

    const renameBtn = host.querySelector<HTMLButtonElement>('button[title="Rename device"]')
    expect(renameBtn).not.toBeNull()
    await act(async () => {
      renameBtn?.click()
    })

    const nameInput = host.querySelector<HTMLInputElement>('input[aria-label="New device name"]')
    expect(nameInput).not.toBeNull()
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      setter?.call(nameInput, 'Kitchen iPad')
      nameInput?.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const saveBtn = host.querySelector<HTMLButtonElement>('button[title="Save device name"]')
    await act(async () => {
      saveBtn?.click()
    })

    expect(renameSpy).toHaveBeenCalledWith('dev-456', 'Kitchen iPad')
    expect(host.textContent).toContain('Kitchen iPad')
  })
})
