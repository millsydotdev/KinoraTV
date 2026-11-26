/**
 * Multi-DNS and server mirror failover manager for Xtream IPTV providers.
 * Allows configuring alternative server addresses (mirrors/DNS endpoints),
 * testing round-trip latency, and automatic stream failover when primary servers degrade.
 */

export interface XtreamMirror {
  id: string
  url: string
  label: string
  latencyMs?: number
  lastChecked?: number
  status: 'active' | 'standby' | 'error' | 'untested'
  errorMessage?: string
}

export interface XtreamAccountFallbackConfig {
  sourceId: string
  primaryServer: string
  activeServerUrl: string
  mirrors: XtreamMirror[]
  autoFailoverEnabled: boolean
  failoverTimeoutMs: number
}

export interface XtreamFallbackStore {
  version: 1
  accounts: Record<string, XtreamAccountFallbackConfig>
}

const STORAGE_KEY = 'kinora.xtream_fallback.v1'
const DEFAULT_FAILOVER_TIMEOUT_MS = 6000

/**
 * Normalizes a server URL by trimming whitespace, stripping trailing slashes,
 * and ensuring an http/https protocol prefix.
 */
export function normalizeServerUrl(rawUrl: string): string {
  let trimmed = rawUrl.trim()
  if (!trimmed) return ''
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `http://${trimmed}`
  }
  return trimmed.replace(/\/+$/, '')
}

/**
 * Loads the complete Xtream fallback store from persistent local storage.
 */
export function loadXtreamFallbackStore(): XtreamFallbackStore {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (!raw) return { version: 1, accounts: {} }
    const parsed = JSON.parse(raw) as XtreamFallbackStore
    if (parsed && parsed.version === 1 && typeof parsed.accounts === 'object') {
      return parsed
    }
  } catch {
    // Return empty state on parse error
  }
  return { version: 1, accounts: {} }
}

/**
 * Saves the Xtream fallback store to persistent local storage.
 */
export function saveXtreamFallbackStore(store: XtreamFallbackStore): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
    }
  } catch {
    // Gracefully handle storage quota errors
  }
}

/**
 * Retrieves the fallback configuration for a specific Xtream source.
 */
export function getAccountFallbackConfig(
  sourceId: string,
  defaultServer = '',
): XtreamAccountFallbackConfig {
  const store = loadXtreamFallbackStore()
  const cleanDefault = normalizeServerUrl(defaultServer)

  if (store.accounts[sourceId]) {
    const account = store.accounts[sourceId]
    // Ensure activeServerUrl is populated
    if (!account.activeServerUrl) {
      account.activeServerUrl = account.primaryServer || cleanDefault
    }
    return account
  }

  const newConfig: XtreamAccountFallbackConfig = {
    sourceId,
    primaryServer: cleanDefault,
    activeServerUrl: cleanDefault,
    mirrors: [],
    autoFailoverEnabled: true,
    failoverTimeoutMs: DEFAULT_FAILOVER_TIMEOUT_MS,
  }

  return newConfig
}

/**
 * Saves or updates the fallback configuration for a specific Xtream source.
 */
export function saveAccountFallbackConfig(config: XtreamAccountFallbackConfig): void {
  const store = loadXtreamFallbackStore()
  store.accounts[config.sourceId] = {
    ...config,
    primaryServer: normalizeServerUrl(config.primaryServer),
    activeServerUrl: normalizeServerUrl(config.activeServerUrl),
    mirrors: config.mirrors.map((m) => ({
      ...m,
      url: normalizeServerUrl(m.url),
    })),
  }
  saveXtreamFallbackStore(store)
}

/**
 * Adds an alternative mirror or DNS endpoint to an account.
 */
export function addMirror(
  sourceId: string,
  url: string,
  label?: string,
  defaultServer = '',
): XtreamAccountFallbackConfig {
  const config = getAccountFallbackConfig(sourceId, defaultServer)
  const cleanUrl = normalizeServerUrl(url)
  if (!cleanUrl) return config

  // Avoid duplicates
  const existing = config.mirrors.find(
    (m) => m.url.toLowerCase() === cleanUrl.toLowerCase(),
  )
  if (existing) return config

  const mirrorLabel =
    label?.trim() ||
    `Mirror ${config.mirrors.length + 1} (${cleanUrl.replace(/^https?:\/\//, '').split('/')[0]})`

  const newMirror: XtreamMirror = {
    id: `mirror-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    url: cleanUrl,
    label: mirrorLabel,
    status: 'standby',
  }

  config.mirrors.push(newMirror)
  saveAccountFallbackConfig(config)
  return config
}

/**
 * Removes a mirror by ID.
 */
export function removeMirror(
  sourceId: string,
  mirrorId: string,
): XtreamAccountFallbackConfig {
  const config = getAccountFallbackConfig(sourceId)
  const mirror = config.mirrors.find((m) => m.id === mirrorId)

  // If the removed mirror was active, fall back to the primary server
  if (mirror && config.activeServerUrl === mirror.url) {
    config.activeServerUrl = config.primaryServer
  }

  config.mirrors = config.mirrors.filter((m) => m.id !== mirrorId)
  saveAccountFallbackConfig(config)
  return config
}

/**
 * Sets the currently active server URL (primary or one of the mirrors).
 */
export function setActiveServer(
  sourceId: string,
  serverUrl: string,
): XtreamAccountFallbackConfig {
  const config = getAccountFallbackConfig(sourceId)
  const cleanUrl = normalizeServerUrl(serverUrl)

  config.activeServerUrl = cleanUrl

  // Update statuses
  for (const m of config.mirrors) {
    if (m.url.toLowerCase() === cleanUrl.toLowerCase()) {
      m.status = 'active'
    } else if (m.status === 'active') {
      m.status = 'standby'
    }
  }

  saveAccountFallbackConfig(config)
  return config
}

/**
 * Toggles auto-failover behavior for an Xtream account.
 */
export function toggleAutoFailover(
  sourceId: string,
  enabled: boolean,
): XtreamAccountFallbackConfig {
  const config = getAccountFallbackConfig(sourceId)
  config.autoFailoverEnabled = enabled
  saveAccountFallbackConfig(config)
  return config
}

/**
 * Finds the next candidate server URL when the current one fails or times out.
 * Returns null if no other healthy candidate is available.
 */
export function getNextFailoverUrl(
  sourceId: string,
  currentFailedUrl: string,
): string | null {
  const config = getAccountFallbackConfig(sourceId)
  if (!config.autoFailoverEnabled) return null

  const cleanCurrent = normalizeServerUrl(currentFailedUrl).toLowerCase()
  const candidateUrls: string[] = []

  // Add primary if not the failed URL
  if (config.primaryServer && config.primaryServer.toLowerCase() !== cleanCurrent) {
    candidateUrls.push(config.primaryServer)
  }

  // Add standby mirrors with error-free or untested status
  for (const mirror of config.mirrors) {
    if (mirror.url.toLowerCase() !== cleanCurrent && mirror.status !== 'error') {
      candidateUrls.push(mirror.url)
    }
  }

  // If no candidates without error, consider any mirror other than current
  if (candidateUrls.length === 0) {
    for (const mirror of config.mirrors) {
      if (mirror.url.toLowerCase() !== cleanCurrent) {
        candidateUrls.push(mirror.url)
      }
    }
  }

  return candidateUrls.length > 0 ? (candidateUrls[0] ?? null) : null
}

/**
 * Replaces the host / base origin of an Xtream stream URL with a target server URL.
 */
export function replaceStreamUrlHost(
  originalStreamUrl: string,
  newServerUrl: string,
): string {
  try {
    const cleanNew = normalizeServerUrl(newServerUrl)
    if (!cleanNew) return originalStreamUrl

    const originalParsed = new URL(originalStreamUrl)
    const newParsed = new URL(cleanNew)

    originalParsed.protocol = newParsed.protocol
    originalParsed.hostname = newParsed.hostname
    originalParsed.port = newParsed.port

    return originalParsed.toString()
  } catch {
    return originalStreamUrl
  }
}

/**
 * Tests the round-trip latency to a server mirror URL using a fast fetch probe.
 */
export async function testMirrorLatency(
  serverUrl: string,
  timeoutMs = 4000,
): Promise<{ latencyMs: number; ok: boolean; error?: string }> {
  const cleanUrl = normalizeServerUrl(serverUrl)
  if (!cleanUrl) {
    return { latencyMs: -1, ok: false, error: 'Empty URL' }
  }

  const probeUrl = `${cleanUrl}/player_api.php`
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
  const start = Date.now()

  try {
    const res = await fetch(probeUrl, {
      method: 'GET',
      signal: controller?.signal,
      headers: { Accept: 'application/json, text/plain' },
    })

    if (timer) clearTimeout(timer)
    const latency = Date.now() - start
    return {
      latencyMs: latency,
      ok: res.status < 500, // 200, 401, 403 all mean the server responded
    }
  } catch (err: unknown) {
    if (timer) clearTimeout(timer)
    const isTimeout = err instanceof Error && err.name === 'AbortError'
    return {
      latencyMs: Date.now() - start,
      ok: false,
      error: isTimeout ? 'Timed out' : 'Connection failed',
    }
  }
}

/**
 * Runs latency checks across all mirrors and the primary server for an account.
 */
export async function testAllAccountMirrors(
  sourceId: string,
): Promise<XtreamAccountFallbackConfig> {
  const config = getAccountFallbackConfig(sourceId)
  const now = Date.now()

  // Test primary server
  if (config.primaryServer) {
    await testMirrorLatency(config.primaryServer)
  }

  // Test all configured mirrors
  for (const mirror of config.mirrors) {
    const res = await testMirrorLatency(mirror.url)
    mirror.lastChecked = now
    mirror.latencyMs = res.latencyMs
    if (res.ok) {
      mirror.status = mirror.url === config.activeServerUrl ? 'active' : 'standby'
      mirror.errorMessage = undefined
    } else {
      mirror.status = 'error'
      mirror.errorMessage = res.error || 'Check failed'
    }
  }

  saveAccountFallbackConfig(config)
  return config
}
