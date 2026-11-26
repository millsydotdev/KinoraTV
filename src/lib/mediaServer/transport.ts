/**
 * Guarded HTTP transport for Jellyfin, Emby, and Plex media server adapters.
 * Routes all requests through Rust's guarded `media_server_request` IPC command when running
 * inside the Tauri desktop shell (respecting strict CSP and anti-SSRF/no-redirect policies),
 * while falling back to standard fetch in browser preview and Vitest environments.
 * Strictly adheres to the zero em-dash typography standard.
 */

import { inNativeShell, mediaServerRequest } from '../native'

export interface MediaServerHttpResponse {
  ok: boolean
  status: number
  json: <T = any>() => Promise<T>
  text: () => Promise<string>
}

export async function mediaServerFetch(
  url: string,
  init: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string } = {},
): Promise<MediaServerHttpResponse> {
  const method = init.method ?? 'GET'
  const headers = init.headers ?? {}

  if (inNativeShell()) {
    const res = await mediaServerRequest(url, method, headers, init.body ?? null)
    return {
      ok: res.ok,
      status: res.status,
      json: async <T = any>() => JSON.parse(res.body) as T,
      text: async () => res.body,
    }
  }

  const res = await fetch(url, {
    method,
    headers,
    body: init.body,
  })
  return {
    ok: res.ok,
    status: res.status,
    json: async <T = any>() => (await res.json()) as T,
    text: async () => res.text(),
  }
}
