import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  discoverDlnaRenderers,
  castDlnaMedia,
  controlDlnaPlayback,
  type DlnaDevice,
} from './native'
import { castingManager } from './casting/manager'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}))

describe('DLNA & UPnP Discovery and Casting', () => {
  const mockDevice: DlnaDevice = {
    id: 'sony-bravia-1234',
    name: 'Sony Bravia OLED',
    model: 'XR-65A80J',
    manufacturer: 'Sony',
    location: 'http://192.168.1.55:8080/description.xml',
    ip: '192.168.1.55',
    port: 8080,
    avTransportUrl: 'http://192.168.1.55:8080/upnp/control/AVTransport',
    renderingControlUrl: 'http://192.168.1.55:8080/upnp/control/RenderingControl',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    castingManager.disconnect()
  })

  it('handles discoverDlnaRenderers gracefully outside native shell', async () => {
    const devices = await discoverDlnaRenderers()
    expect(devices).toEqual([])
  })

  it('handles castDlnaMedia outside native shell', async () => {
    const result = await castDlnaMedia(
      'http://192.168.1.55:8080/upnp/control/AVTransport',
      'https://example.com/video.mp4',
      'Demo Title'
    )
    expect(result).toBe(false)
  })

  it('handles controlDlnaPlayback outside native shell', async () => {
    const result = await controlDlnaPlayback(
      'http://192.168.1.55:8080/upnp/control/AVTransport',
      'play'
    )
    expect(result).toBe(false)
  })

  it('casting manager handles connection lifecycle and state transitions', async () => {
    castingManager.registerDevice({
      id: 'test-device-1',
      name: 'Sony Bravia OLED',
      protocol: 'dlna',
      model: 'XR-65A80J',
      location: 'http://192.168.1.55:8080/upnp/control/AVTransport',
      ip: '192.168.1.55',
      port: 8080,
      status: 'available',
      signalStrength: 95,
    })

    const devices = castingManager.getDevices()
    expect(devices.length).toBeGreaterThan(0)

    const targetDevice = devices[0]
    expect(targetDevice).toBeDefined()
    if (!targetDevice) return

    const connected = await castingManager.connect(targetDevice, {
      title: 'BBC One News',
      streamUrl: 'https://cdn.example/live.m3u8',
      duration: 3600,
      position: 120,
    })

    expect(connected).toBe(true)
    const session = castingManager.getSession()
    expect(session).not.toBeNull()
    expect(session?.state).toBe('connected')
    expect(session?.media?.title).toBe('BBC One News')

    // Playback state transitions
    castingManager.play()
    expect(castingManager.getSession()?.state).toBe('playing')

    castingManager.pause()
    expect(castingManager.getSession()?.state).toBe('paused')

    // Volume adjustment
    castingManager.setVolume(65)
    expect(castingManager.getSession()?.volume).toBe(65)
    expect(castingManager.getSession()?.isMuted).toBe(false)

    castingManager.setVolume(0)
    expect(castingManager.getSession()?.volume).toBe(0)
    expect(castingManager.getSession()?.isMuted).toBe(true)

    // Disconnect cleans up session
    castingManager.disconnect()
    expect(castingManager.getSession()).toBeNull()
  })

  it('invokes backend commands when running inside native shell', async () => {
    const core = await import('@tauri-apps/api/core')
    vi.mocked(core.isTauri).mockReturnValue(true)
    vi.mocked(core.invoke).mockResolvedValueOnce([mockDevice])

    const found = await discoverDlnaRenderers()
    expect(core.invoke).toHaveBeenCalledWith('discover_dlna_renderers')
    expect(found).toEqual([mockDevice])

    vi.mocked(core.invoke).mockResolvedValueOnce(true)
    const castOk = await castDlnaMedia(
      mockDevice.avTransportUrl!,
      'https://cdn.example/live.m3u8',
      'BBC News'
    )
    expect(core.invoke).toHaveBeenCalledWith('cast_dlna_media', {
      controlUrl: mockDevice.avTransportUrl,
      mediaUrl: 'https://cdn.example/live.m3u8',
      title: 'BBC News',
    })
    expect(castOk).toBe(true)

    vi.mocked(core.invoke).mockResolvedValueOnce(true)
    const ctrlOk = await controlDlnaPlayback(
      mockDevice.avTransportUrl!,
      'pause'
    )
    expect(core.invoke).toHaveBeenCalledWith('control_dlna_playback', {
      controlUrl: mockDevice.avTransportUrl,
      action: 'pause',
      volume: null,
    })
    expect(ctrlOk).toBe(true)
  })
})
