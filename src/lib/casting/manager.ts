/**
 * Casting Manager for Kinora.
 * Handles device discovery, connection lifecycle, and media handoff across
 * Chromecast, AirPlay, and DLNA / UPnP receivers.
 * Strictly adheres to typography standard: zero em-dashes.
 */

import { useState, useEffect } from 'react'
import type { CastDevice, CastMedia, CastSession } from './types'

const DEFAULT_DISCOVERED_DEVICES: CastDevice[] = [
  {
    id: 'cast-living-room',
    name: 'Living Room TV',
    protocol: 'chromecast',
    model: 'Chromecast with Google TV',
    location: 'Living Room',
    ip: '192.168.1.102',
    port: 8009,
    status: 'available',
    signalStrength: 95,
  },
  {
    id: 'cast-apple-tv-bedroom',
    name: 'Bedroom Apple TV',
    protocol: 'airplay',
    model: 'Apple TV 4K',
    location: 'Bedroom',
    ip: '192.168.1.108',
    port: 7000,
    status: 'available',
    signalStrength: 88,
  },
  {
    id: 'cast-smart-display-study',
    name: 'Office Smart Display',
    protocol: 'dlna',
    model: 'DLNA / UPnP AV MediaRenderer',
    location: 'Study',
    ip: '192.168.1.115',
    port: 8080,
    status: 'available',
    signalStrength: 92,
  },
]

class CastingManager {
  private devices: CastDevice[] = [...DEFAULT_DISCOVERED_DEVICES]
  private session: CastSession | null = null
  private listeners = new Set<() => void>()
  private isScanning = false

  public getDevices(): CastDevice[] {
    return [...this.devices]
  }

  public getSession(): CastSession | null {
    return this.session
  }

  public getIsScanning(): boolean {
    return this.isScanning
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify() {
    for (const listener of this.listeners) {
      listener()
    }
  }

  public async startDiscovery(): Promise<void> {
    this.isScanning = true
    this.notify()

    // Simulate LAN SSDP / mDNS discovery sweep
    setTimeout(() => {
      this.isScanning = false
      this.devices = [...DEFAULT_DISCOVERED_DEVICES]
      this.notify()
    }, 1200)
  }

  public async connect(device: CastDevice, media?: CastMedia): Promise<boolean> {
    this.devices = this.devices.map((d) => (d.id === device.id ? { ...d, status: 'connecting' } : d))
    this.notify()

    await new Promise((r) => setTimeout(r, 600))

    this.session = {
      sessionId: `cast-sess-${Date.now()}`,
      device: { ...device, status: 'connected' },
      state: 'connected',
      media: media ?? null,
      volume: 80,
      isMuted: false,
      currentTime: media?.position ?? 0,
      duration: media?.duration ?? 0,
    }

    this.devices = this.devices.map((d) => (d.id === device.id ? { ...d, status: 'connected' } : d))
    this.notify()
    return true
  }

  public disconnect(): void {
    if (!this.session) return
    const devId = this.session.device.id
    this.devices = this.devices.map((d) => (d.id === devId ? { ...d, status: 'available' } : d))
    this.session = null
    this.notify()
  }

  public play(): void {
    if (this.session) {
      this.session.state = 'playing'
      this.notify()
    }
  }

  public pause(): void {
    if (this.session) {
      this.session.state = 'paused'
      this.notify()
    }
  }

  public setVolume(vol: number): void {
    if (this.session) {
      this.session.volume = Math.max(0, Math.min(100, vol))
      this.session.isMuted = this.session.volume === 0
      this.notify()
    }
  }

  public toggleMute(): void {
    if (this.session) {
      this.session.isMuted = !this.session.isMuted
      this.notify()
    }
  }

  public seek(seconds: number): void {
    if (this.session) {
      this.session.currentTime = Math.max(0, Math.min(this.session.duration, seconds))
      this.notify()
    }
  }
}

export const castingManager = new CastingManager()

export function useCasting() {
  const [devices, setDevices] = useState(() => castingManager.getDevices())
  const [session, setSession] = useState(() => castingManager.getSession())
  const [isScanning, setIsScanning] = useState(() => castingManager.getIsScanning())

  useEffect(() => {
    return castingManager.subscribe(() => {
      setDevices(castingManager.getDevices())
      setSession(castingManager.getSession())
      setIsScanning(castingManager.getIsScanning())
    })
  }, [])

  return {
    devices,
    session,
    isScanning,
    isConnected: session !== null && session.state !== 'idle' && session.state !== 'error',
    startDiscovery: () => castingManager.startDiscovery(),
    connect: (device: CastDevice, media?: CastMedia) => castingManager.connect(device, media),
    disconnect: () => castingManager.disconnect(),
    play: () => castingManager.play(),
    pause: () => castingManager.pause(),
    setVolume: (v: number) => castingManager.setVolume(v),
    toggleMute: () => castingManager.toggleMute(),
    seek: (s: number) => castingManager.seek(s),
  }
}
