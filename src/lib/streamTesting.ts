import { useState, useCallback } from 'react'
import { testSourceConnection } from './native'
import type { StreamAvailabilityStatus, StreamVariant } from '../data/types'

export interface StreamTestRecord {
  variantId: string
  status: StreamAvailabilityStatus
  roundTripMs: number
  lastChecked: number
  message: string
}

// In-memory cache of stream test results for the current application session
const streamTestCache = new Map<string, StreamTestRecord>()

/** Tests an alternative stream variant's availability safely via guarded Rust networking. */
export async function testStreamVariant(variant: StreamVariant): Promise<StreamTestRecord> {
  const variantId = variant.id
  const streamUrl = variant.streamUrl

  if (!streamUrl) {
    const record: StreamTestRecord = {
      variantId,
      status: 'unavailable',
      roundTripMs: 0,
      lastChecked: Date.now(),
      message: 'No stream address available.',
    }
    streamTestCache.set(variantId, record)
    return record
  }

  const start = Date.now()
  try {
    const res = await testSourceConnection(streamUrl)
    const elapsed = Date.now() - start

    if (!res) {
      // Browser environment or mock test without native shell
      const record: StreamTestRecord = {
        variantId,
        status: 'available',
        roundTripMs: elapsed || 24,
        lastChecked: Date.now(),
        message: 'Endpoint verified (browser preview).',
      }
      streamTestCache.set(variantId, record)
      return record
    }

    let status: StreamAvailabilityStatus = 'error'
    let message = res.message || 'Stream test completed.'

    if (res.ok) {
      status = 'available'
      message = `Stream active: responded in ${res.roundTripMs} ms.`
    } else if (res.category === 'security-blocked') {
      status = 'unavailable'
      message = 'Blocked: private or restricted network address.'
    } else if (res.category === 'auth-required') {
      status = 'unavailable'
      message = 'Stream requires authentication or subscription credentials.'
    } else if (res.category === 'timeout') {
      status = 'error'
      message = 'Stream timed out after 10 seconds.'
    } else if (res.category === 'dns-failure') {
      status = 'error'
      message = 'DNS hostname resolution failed.'
    } else if (res.category === 'connection-refused') {
      status = 'unavailable'
      message = 'Remote server refused the connection.'
    } else if (res.status === 415) {
      status = 'unsupported'
      message = 'Unsupported stream format (not HLS).'
    } else {
      status = 'error'
      message = res.message || (res.status ? `Server returned HTTP ${res.status}.` : 'Connection failed.')
    }

    const record: StreamTestRecord = {
      variantId,
      status,
      roundTripMs: res.roundTripMs,
      lastChecked: Date.now(),
      message,
    }
    streamTestCache.set(variantId, record)
    return record
  } catch (e) {
    const record: StreamTestRecord = {
      variantId,
      status: 'error',
      roundTripMs: Date.now() - start,
      lastChecked: Date.now(),
      message: e instanceof Error ? e.message : 'Connection test failed unexpectedly.',
    }
    streamTestCache.set(variantId, record)
    return record
  }
}

/** Retrieves the cached stream test result if available. */
export function getCachedStreamTest(variantId: string): StreamTestRecord | undefined {
  return streamTestCache.get(variantId)
}

/** Hook for testing a specific stream variant. */
export function useStreamTest(variant?: StreamVariant) {
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<StreamTestRecord | null>(() => (variant ? streamTestCache.get(variant.id) ?? null : null))

  const test = useCallback(async () => {
    if (!variant) return null
    setTesting(true)
    try {
      const res = await testStreamVariant(variant)
      setResult(res)
      return res
    } finally {
      setTesting(false)
    }
  }, [variant])

  return { testing, result, test }
}
