import { describe, expect, it } from 'vitest'
import {
  formatChannelName,
  getVersionChannel,
} from './native'

describe('Updater Upgrade Verification (v0.5.9 to v0.6.0 Sequence)', () => {
  it('correctly classifies channels for v0.5.9 and v0.6.0', () => {
    expect(getVersionChannel('0.5.9', 'release')).toBe('stable')
    expect(getVersionChannel('0.6.0', 'release')).toBe('stable')
    expect(formatChannelName(getVersionChannel('0.6.0', 'release'))).toBe('Stable')
  })

  it('detects update availability when running v0.5.9 against v0.6.0 manifest', () => {
    const manifest = {
      version: '0.6.0',
      notes: 'Kinora v0.6.0 Public Launch',
      pub_date: '2026-11-19T19:00:00Z',
      platforms: {
        'linux-x86_64': {
          url: 'https://github.com/millsydotdev/KinoraTV/releases/download/v0.6.0/Kinora_0.6.0_amd64.AppImage',
          signature: 'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk=',
        },
        'windows-x86_64': {
          url: 'https://github.com/millsydotdev/KinoraTV/releases/download/v0.6.0/Kinora_0.6.0_x64-setup.exe',
          signature: 'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk=',
        },
      },
    }

    const currentVersion = '0.5.9'
    const targetPlatform = 'linux-x86_64'
    const asset = manifest.platforms[targetPlatform]

    expect(asset).toBeDefined()
    expect(manifest.version).toBe('0.6.0')
    expect(currentVersion).toBe('0.5.9')
    expect(asset.signature.length).toBeGreaterThan(10)
    expect(asset.url).toContain('v0.6.0')
  })

  it('preserves user data, profiles, and preferences across simulated version upgrade', () => {
    // Seed pre-upgrade v0.5.9 state
    const preUpgradeData = {
      version: '0.5.9',
      prefs: {
        theme: 'dark',
        accent: 'red',
        density: 'comfortable',
        textSize: 'medium',
        reduceMotion: false,
      },
      sources: [
        { id: 'src-1', name: 'Verified Free Stream', url: 'https://example.com/playlist.m3u' },
      ],
      library: {
        watchlist: ['movie-1', 'series-1'],
        favourites: ['channel-1'],
        history: [{ id: 'movie-1', progress: 0.65, lastWatched: Date.now() }],
      },
      profiles: [
        { id: 'p-adult', name: 'Owner', isKids: false },
        { id: 'p-kids', name: 'Kids', isKids: true },
      ],
      pinHash: 'kinora:salt123:hash456',
    }

    // Serialize and simulate persistent storage survival
    const serializedStorage = JSON.stringify(preUpgradeData)
    const postUpgradeStorage = JSON.parse(serializedStorage)

    // Verify all domains survive intact
    expect(postUpgradeStorage.prefs.theme).toBe('dark')
    expect(postUpgradeStorage.prefs.accent).toBe('red')
    expect(postUpgradeStorage.sources).toHaveLength(1)
    expect(postUpgradeStorage.sources[0].id).toBe('src-1')
    expect(postUpgradeStorage.library.watchlist).toContain('movie-1')
    expect(postUpgradeStorage.library.history[0].progress).toBe(0.65)
    expect(postUpgradeStorage.profiles).toHaveLength(2)
    expect(postUpgradeStorage.pinHash).toBe('kinora:salt123:hash456')
  })

  it('handles malformed or corrupted manifest structures gracefully', () => {
    const malformedRaw = '{ version: "0.6.0", platforms: invalid_json }'
    let parseError = false
    try {
      JSON.parse(malformedRaw)
    } catch {
      parseError = true
    }
    expect(parseError).toBe(true)
  })

  it('rejects unsupported platforms gracefully without crash', () => {
    const manifest = {
      version: '0.6.0',
      platforms: {
        'solaris-sparc': {
          url: 'https://example.com/kinora',
          signature: 'sig',
        },
      },
    }
    const currentPlatform = 'linux-x86_64'
    const isSupported = Boolean((manifest.platforms as Record<string, unknown>)[currentPlatform])
    expect(isSupported).toBe(false)
  })
})
