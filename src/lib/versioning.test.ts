import { describe, expect, it } from 'vitest'
import {
  APP_VERSION,
  AUTHORITATIVE_VERSION,
  formatChannelName,
  getVersionChannel,
} from './native'
import packageJson from '../../package.json'

describe('Centralised Versioning System (Frontend)', () => {
  it('exposes the authoritative version from package.json', () => {
    expect(AUTHORITATIVE_VERSION).toBe(packageJson.version)
    expect(APP_VERSION).toBe(packageJson.version)
  })

  it('validates semantic version format (MAJOR.MINOR.PATCH)', () => {
    const semverRegex = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/
    expect(APP_VERSION).toMatch(semverRegex)
  })

  it('classifies release channels correctly according to semver tags', () => {
    expect(getVersionChannel('1.0.0', 'release')).toBe('stable')
    expect(getVersionChannel('1.0.0-rc.1', 'release')).toBe('rc')
    expect(getVersionChannel('1.0.0-beta.2', 'release')).toBe('beta')
    expect(getVersionChannel('1.0.0-alpha.5', 'release')).toBe('alpha')
    expect(getVersionChannel('1.0.0-dev.12', 'release')).toBe('development')
    // Debug profile always marks build as development
    expect(getVersionChannel('1.0.0', 'debug')).toBe('development')
  })

  it('formats channel names appropriately for presentation', () => {
    expect(formatChannelName('stable')).toBe('Stable')
    expect(formatChannelName('rc')).toBe('Release Candidate')
    expect(formatChannelName('beta')).toBe('Beta')
    expect(formatChannelName('alpha')).toBe('Alpha')
    expect(formatChannelName('development')).toBe('Development')
  })
})
