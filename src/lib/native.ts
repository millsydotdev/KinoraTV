// The typed boundary between React and the Rust shell (src-tauri/src/lib.rs). In a plain browser
// (Vite dev server, Vitest) there is no shell, so calls resolve to null instead of failing.
import { invoke, isTauri } from '@tauri-apps/api/core'

/** Mirrors `AppInfo` in src-tauri/src/lib.rs (serde camelCase). */
export interface AppInfo {
  name: string
  version: string
  profile: 'debug' | 'release'
  os: string
  arch: string
  tauriVersion: string
}

const isText = (v: unknown, max = 64): v is string => typeof v === 'string' && v.length > 0 && v.length <= max

/** Data crossing IPC is checked on arrival rather than trusted from the type annotation. */
export function parseAppInfo(raw: unknown): AppInfo {
  const v = raw as Record<string, unknown> | null
  if (
    typeof v !== 'object' || v === null ||
    !isText(v.name) || !isText(v.version) || !isText(v.os) || !isText(v.arch) || !isText(v.tauriVersion) ||
    (v.profile !== 'debug' && v.profile !== 'release')
  ) {
    throw new Error('The native shell returned app information in an unexpected shape.')
  }
  return { name: v.name, version: v.version, profile: v.profile, os: v.os, arch: v.arch, tauriVersion: v.tauriVersion }
}

export async function getAppInfo(): Promise<AppInfo | null> {
  if (!isTauri()) return null
  return parseAppInfo(await invoke('app_info'))
}
