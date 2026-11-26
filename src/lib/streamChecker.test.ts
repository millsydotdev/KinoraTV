// streamChecker.test.ts - Unit tests for stream health inspector and availability engine.
// Strictly adheres to typography standards: zero em-dashes across all code and comments.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  probeChannelStream,
  StreamHealthChecker,
  filterHealthyChannelIds,
  type StreamProbeResult,
} from './streamChecker'
import * as nativeModule from './native'
import type { Channel } from '../data/types'

vi.mock('./native', () => ({
  testSourceConnection: vi.fn(),
  isTauri: vi.fn(() => true),
}))

const mockChannel1: Channel = {
  id: 'ch-1',
  name: 'BBC One HD',
  number: 101,
  group: 'General',
  categories: ['General'],
  logoUrl: null,
  mark: { text: 'B1', tone: 'emerald' },
  streamUrl: 'https://stream.example/bbc1.m3u8',
  hd: true,
  sourceId: 'src-1',
  tvgId: 'bbc1.uk',
}

const mockChannel2: Channel = {
  id: 'ch-2',
  name: 'ITV 1',
  number: 102,
  group: 'General',
  categories: ['General'],
  logoUrl: null,
  mark: { text: 'ITV', tone: 'solar' },
  streamUrl: 'https://stream.example/itv1.m3u8',
  hd: true,
  sourceId: 'src-1',
  tvgId: 'itv1.uk',
}

const mockChannelEmpty: Channel = {
  id: 'ch-3',
  name: 'Dead Channel',
  number: 103,
  group: 'General',
  categories: ['General'],
  logoUrl: null,
  mark: { text: 'DC', tone: 'slate' },
  streamUrl: '',
  hd: false,
  sourceId: 'src-1',
  tvgId: 'dead.uk',
}

describe('probeChannelStream', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('marks channel as offline if stream address is missing', async () => {
    const res = await probeChannelStream(mockChannelEmpty)
    expect(res.status).toBe('offline')
    expect(res.errorMessage).toContain('No stream address assigned')
  })

  it('marks channel as online when native check succeeds', async () => {
    vi.mocked(nativeModule.testSourceConnection).mockResolvedValueOnce({
      ok: true,
      status: 200,
      host: 'stream.example',
      roundTripMs: 85,
      message: 'OK',
      category: 'success',
    })

    const res = await probeChannelStream(mockChannel1)
    expect(res.status).toBe('online')
    expect(res.latencyMs).toBe(85)
    expect(res.httpStatus).toBe(200)
  })

  it('marks channel as blocked when destination is forbidden by security policy', async () => {
    vi.mocked(nativeModule.testSourceConnection).mockResolvedValueOnce({
      ok: false,
      status: null,
      host: '127.0.0.1',
      roundTripMs: 2,
      message: 'Blocked by security policy',
      category: 'security-blocked',
    })

    const res = await probeChannelStream(mockChannel1)
    expect(res.status).toBe('blocked')
    expect(res.errorMessage).toContain('security policy')
  })

  it('marks channel as timeout when stream times out', async () => {
    vi.mocked(nativeModule.testSourceConnection).mockResolvedValueOnce({
      ok: false,
      status: null,
      host: 'slow.example',
      roundTripMs: 10000,
      message: 'Connection timed out',
      category: 'timeout',
    })

    const res = await probeChannelStream(mockChannel1)
    expect(res.status).toBe('timeout')
    expect(res.errorMessage).toContain('timed out')
  })

  it('marks channel as offline when server returns an HTTP error code', async () => {
    vi.mocked(nativeModule.testSourceConnection).mockResolvedValueOnce({
      ok: false,
      status: 404,
      host: 'stream.example',
      roundTripMs: 120,
      message: 'Not found',
      category: 'http-error',
    })

    const res = await probeChannelStream(mockChannel1)
    expect(res.status).toBe('offline')
    expect(res.httpStatus).toBe(404)
  })
})

describe('StreamHealthChecker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initializes results to pending for all channels', () => {
    const checker = new StreamHealthChecker([mockChannel1, mockChannel2])
    const prog = checker.getProgress()
    expect(prog.total).toBe(2)
    expect(prog.checked).toBe(0)
    expect(prog.percent).toBe(0)
    expect(prog.isRunning).toBe(false)
  })

  it('runs probe on all channels and calculates progress', async () => {
    vi.mocked(nativeModule.testSourceConnection)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        host: 'stream.example',
        roundTripMs: 50,
        message: 'OK',
        category: 'success',
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        host: 'stream.example',
        roundTripMs: 90,
        message: 'Service Unavailable',
        category: 'http-error',
      })

    const checker = new StreamHealthChecker([mockChannel1, mockChannel2], 2)
    let lastProgress = checker.getProgress()

    checker.subscribe((p) => {
      lastProgress = p
    })

    await checker.start()

    expect(lastProgress.checked).toBe(2)
    expect(lastProgress.online).toBe(1)
    expect(lastProgress.offline).toBe(1)
    expect(lastProgress.percent).toBe(100)
    expect(lastProgress.isRunning).toBe(false)
    expect(lastProgress.avgLatencyMs).toBe(50)
  })

  it('supports cancellation during run', async () => {
    vi.mocked(nativeModule.testSourceConnection).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, status: 200, host: 'h', roundTripMs: 10, message: 'OK', category: 'success' }), 50)),
    )

    const checker = new StreamHealthChecker([mockChannel1, mockChannel2], 1)
    const runPromise = checker.start()
    checker.cancel()
    await runPromise

    const prog = checker.getProgress()
    expect(prog.isRunning).toBe(false)
  })
})

describe('filterHealthyChannelIds', () => {
  it('extracts only online channel IDs from probe results', () => {
    const results: StreamProbeResult[] = [
      { channelId: 'ch-1', channelName: 'BBC', status: 'online', timestamp: 1 },
      { channelId: 'ch-2', channelName: 'ITV', status: 'offline', timestamp: 2 },
      { channelId: 'ch-3', channelName: 'Sky', status: 'online', timestamp: 3 },
      { channelId: 'ch-4', channelName: 'CNN', status: 'blocked', timestamp: 4 },
    ]

    const healthy = filterHealthyChannelIds(results)
    expect(healthy).toEqual(['ch-1', 'ch-3'])
  })
})
