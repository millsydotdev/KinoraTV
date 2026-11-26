/**
 * Platform-independent casting types for Kinora.
 * Supports Google Cast / Chromecast, Apple AirPlay, and DLNA / UPnP AV.
 * Strictly adheres to typography standard: zero em-dashes.
 */

export type CastProtocol = 'chromecast' | 'airplay' | 'dlna' | 'kinora' | 'local'

export type CastDeviceStatus = 'available' | 'connecting' | 'connected' | 'busy'

export interface CastDevice {
  id: string
  name: string
  protocol: CastProtocol
  model?: string
  location?: string
  ip?: string
  port?: number
  status: CastDeviceStatus
  signalStrength?: number
}

export type CastSessionState = 'idle' | 'connecting' | 'connected' | 'playing' | 'paused' | 'buffering' | 'error'

export interface CastMedia {
  title: string
  subtitle?: string
  streamUrl: string
  artUrl?: string
  duration?: number
  position?: number
  live?: boolean
}

export interface CastSession {
  sessionId: string
  device: CastDevice
  state: CastSessionState
  media: CastMedia | null
  volume: number
  isMuted: boolean
  currentTime: number
  duration: number
  error?: string
}
