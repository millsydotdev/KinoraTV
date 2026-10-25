import { describe, expect, it } from 'vitest'
import { getAppInfo, parseAppInfo } from './native'

const valid = { name: 'Kinora', version: '0.1.0', profile: 'release', os: 'linux', arch: 'x86_64', tauriVersion: '2.12.5' }

describe('native boundary', () => {
  it('accepts the shape the Rust app_info command serialises', () => {
    expect(parseAppInfo(valid)).toEqual(valid)
  })

  it('rejects malformed or unexpected responses', () => {
    expect(() => parseAppInfo(null)).toThrow()
    expect(() => parseAppInfo({ ...valid, profile: 'staging' })).toThrow()
    expect(() => parseAppInfo({ ...valid, version: 1 })).toThrow()
    expect(() => parseAppInfo({ ...valid, os: 'x'.repeat(65) })).toThrow()
    const { arch: _arch, ...missing } = valid
    expect(() => parseAppInfo(missing)).toThrow()
  })

  it('drops fields the frontend does not know about', () => {
    expect(parseAppInfo({ ...valid, injected: '<script>' })).toEqual(valid)
  })

  it('resolves to null outside the native shell instead of throwing', async () => {
    await expect(getAppInfo()).resolves.toBeNull()
  })
})
