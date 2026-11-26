// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addMirror,
  getAccountFallbackConfig,
  getNextFailoverUrl,
  normalizeServerUrl,
  removeMirror,
  replaceStreamUrlHost,
  setActiveServer,
  testAllAccountMirrors,
  testMirrorLatency,
  toggleAutoFailover,
} from './xtreamFallback'

describe('Xtream Multi-DNS / Server Failover Engine', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('normalizes server URLs with protocols and without trailing slashes', () => {
    expect(normalizeServerUrl('http://example.com:8080/')).toBe('http://example.com:8080')
    expect(normalizeServerUrl('https://secure.example.com///')).toBe('https://secure.example.com')
    expect(normalizeServerUrl('iptv.provider.net:25461')).toBe('http://iptv.provider.net:25461')
    expect(normalizeServerUrl('   ')).toBe('')
  })

  it('initializes default fallback config for a source', () => {
    const config = getAccountFallbackConfig('src-1', 'http://primary.iptv:8080')
    expect(config.sourceId).toBe('src-1')
    expect(config.primaryServer).toBe('http://primary.iptv:8080')
    expect(config.activeServerUrl).toBe('http://primary.iptv:8080')
    expect(config.mirrors).toHaveLength(0)
    expect(config.autoFailoverEnabled).toBe(true)
  })

  it('adds and prevents duplicate mirrors', () => {
    let config = addMirror('src-1', 'http://mirror1.iptv:8080', 'Backup 1', 'http://primary.iptv:8080')
    expect(config.mirrors).toHaveLength(1)
    expect(config.mirrors[0]?.url).toBe('http://mirror1.iptv:8080')
    expect(config.mirrors[0]?.label).toBe('Backup 1')
    expect(config.mirrors[0]?.status).toBe('standby')

    // Duplicate add should be ignored
    config = addMirror('src-1', 'http://mirror1.iptv:8080/', 'Duplicate Backup')
    expect(config.mirrors).toHaveLength(1)

    // Second mirror
    config = addMirror('src-1', 'https://mirror2.iptv', 'EU Mirror')
    expect(config.mirrors).toHaveLength(2)
  })

  it('removes a mirror and reverts active server if needed', () => {
    addMirror('src-1', 'http://mirror1.iptv:8080', 'Backup 1', 'http://primary.iptv:8080')
    let config = addMirror('src-1', 'http://mirror2.iptv:8080', 'Backup 2')

    const mirror1Id = config.mirrors[0]?.id ?? ''
    const mirror2Id = config.mirrors[1]?.id ?? ''

    // Switch active to mirror 1
    config = setActiveServer('src-1', 'http://mirror1.iptv:8080')
    expect(config.activeServerUrl).toBe('http://mirror1.iptv:8080')
    expect(config.mirrors[0]?.status).toBe('active')

    // Removing mirror 1 should fall back activeServerUrl to primaryServer
    config = removeMirror('src-1', mirror1Id)
    expect(config.mirrors).toHaveLength(1)
    expect(config.mirrors[0]?.id).toBe(mirror2Id)
    expect(config.activeServerUrl).toBe('http://primary.iptv:8080')
  })

  it('sets active server and adjusts mirror statuses correctly', () => {
    addMirror('src-1', 'http://mirror1.iptv:8080', 'Mirror 1', 'http://primary.iptv:8080')
    addMirror('src-1', 'http://mirror2.iptv:8080', 'Mirror 2')

    let config = setActiveServer('src-1', 'http://mirror2.iptv:8080')
    expect(config.activeServerUrl).toBe('http://mirror2.iptv:8080')
    expect(config.mirrors[0]?.status).toBe('standby')
    expect(config.mirrors[1]?.status).toBe('active')

    // Switch back to primary
    config = setActiveServer('src-1', 'http://primary.iptv:8080')
    expect(config.activeServerUrl).toBe('http://primary.iptv:8080')
    expect(config.mirrors[1]?.status).toBe('standby')
  })

  it('toggles auto failover setting', () => {
    let config = getAccountFallbackConfig('src-1', 'http://primary.iptv:8080')
    expect(config.autoFailoverEnabled).toBe(true)

    config = toggleAutoFailover('src-1', false)
    expect(config.autoFailoverEnabled).toBe(false)

    config = toggleAutoFailover('src-1', true)
    expect(config.autoFailoverEnabled).toBe(true)
  })

  it('computes next failover candidate url based on health and priority', () => {
    addMirror('src-1', 'http://mirror1.iptv:8080', 'Mirror 1', 'http://primary.iptv:8080')
    addMirror('src-1', 'http://mirror2.iptv:8080', 'Mirror 2')

    // When primary fails, should failover to mirror 1
    const next1 = getNextFailoverUrl('src-1', 'http://primary.iptv:8080')
    expect(next1).toBe('http://mirror1.iptv:8080')

    // When mirror 1 fails, should return primary server
    const next2 = getNextFailoverUrl('src-1', 'http://mirror1.iptv:8080')
    expect(next2).toBe('http://primary.iptv:8080')

    // When auto failover is disabled, should return null
    toggleAutoFailover('src-1', false)
    expect(getNextFailoverUrl('src-1', 'http://primary.iptv:8080')).toBeNull()
  })

  it('replaces stream URL host dynamically while preserving credentials and paths', () => {
    const original = 'http://old-server.com:8000/live/user123/pass456/1001.ts'
    const newHost = 'https://fast-mirror.provider.net:8443/'

    const replaced = replaceStreamUrlHost(original, newHost)
    expect(replaced).toBe('https://fast-mirror.provider.net:8443/live/user123/pass456/1001.ts')

    // Gracefully handles invalid URLs
    expect(replaceStreamUrlHost('not-a-valid-url', newHost)).toBe('not-a-valid-url')
  })

  it('tests mirror latency and updates health state', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('good-server')) {
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200 })
      }
      throw new Error('Network timeout')
    })

    const goodRes = await testMirrorLatency('http://good-server.com:8080')
    expect(goodRes.ok).toBe(true)
    expect(goodRes.latencyMs).toBeGreaterThanOrEqual(0)

    const badRes = await testMirrorLatency('http://bad-server.com:8080')
    expect(badRes.ok).toBe(false)
    expect(badRes.error).toBe('Connection failed')
  })

  it('tests all mirrors for an account and persists statuses', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('mirror1')) {
        return new Response('{}', { status: 200 })
      }
      throw new Error('Network error')
    })

    addMirror('src-1', 'http://mirror1.iptv:8080', 'Mirror 1', 'http://primary.iptv:8080')
    addMirror('src-1', 'http://mirror2.iptv:8080', 'Mirror 2')

    const updated = await testAllAccountMirrors('src-1')
    expect(updated.mirrors[0]?.status).toBe('standby')
    expect(updated.mirrors[0]?.latencyMs).toBeDefined()
    expect(updated.mirrors[1]?.status).toBe('error')
    expect(updated.mirrors[1]?.errorMessage).toBe('Connection failed')
  })
})
