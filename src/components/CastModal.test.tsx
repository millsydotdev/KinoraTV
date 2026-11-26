// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CastModal } from './CastModal'
import { castingManager } from '../lib/casting/manager'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('CastModal component', () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    castingManager.setDevices([])
    castingManager.disconnect()
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    castingManager.disconnect()
    host.remove()
  })

  it('renders nothing when open is false', async () => {
    await act(async () => {
      root.render(
        <CastModal
          open={false}
          onClose={() => {}}
        />
      )
    })

    expect(host.innerHTML).toBe('')
  })

  it('renders honest empty state when no receivers are detected', async () => {
    await act(async () => {
      root.render(
        <CastModal
          open={true}
          onClose={() => {}}
        />
      )
    })

    const title = host.querySelector('.cast-modal-title')
    expect(title?.textContent).toContain('Cast to Device')

    const emptyText = host.textContent
    expect(emptyText).toContain('No cast receivers found')
    expect(emptyText).toContain('Ensure your smart TV or DLNA MediaRenderer is powered on')
  })

  it('renders device items when genuine devices are registered', async () => {
    castingManager.registerDevice({
      id: 'living-room-bravia',
      name: 'Living Room Bravia OLED',
      protocol: 'dlna',
      model: 'Sony XR-65A80J',
      location: 'Living Room',
      ip: '192.168.1.55',
      port: 8080,
      status: 'available',
      signalStrength: 95,
    })

    await act(async () => {
      root.render(
        <CastModal
          open={true}
          onClose={() => {}}
        />
      )
    })

    const deviceName = host.querySelector('.cast-device-name')
    expect(deviceName?.textContent).toBe('Living Room Bravia OLED')
    const protoBadge = host.querySelector('.cast-proto-badge')
    expect(protoBadge?.textContent).toBe('dlna')
  })
})
