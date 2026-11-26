// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import { getAllReleases, getReleaseByVersion, getReleaseCategories, getReleaseEntries } from './changelog'
import {
  createInitialUpdaterState,
  describeUpdaterStage,
  reduceUpdateCheckResult,
  saveUpdateChannel,
  loadUpdateChannel,
} from './updaterState'
import { evaluateServerCompatibility } from './clientSync'
import { APP_VERSION } from './native'
import { hasSeenWhatsNew, markWhatsNewSeen } from '../components/WhatsNewModal'

describe('Structured changelog, offline history, and updater state machine', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('loads complete offline version history starting with current version, 0.6.0, and 0.5.0', () => {
    const releases = getAllReleases()
    expect(releases.length).toBeGreaterThanOrEqual(10)
    expect(releases[0]?.version).toBe(APP_VERSION)
    expect(releases.some((r) => r.version === '0.6.0')).toBe(true)
    expect(releases.some((r) => r.version === '0.5.0')).toBe(true)

    const v060 = getReleaseByVersion('0.6.0')!
    const userEntries = getReleaseEntries(v060, { includeDeveloper: false })
    const allEntries = getReleaseEntries(v060, { includeDeveloper: true })
    expect(userEntries.length).toBeGreaterThanOrEqual(10)
    expect(allEntries.length).toBeGreaterThan(userEntries.length)

    // Ensure zero em-dashes in bundled release copy
    for (const rel of releases) {
      expect(rel.title).not.toContain('\u2014')
      expect(rel.summary).not.toContain('\u2014')
      for (const e of rel.entries) {
        expect(e.title).not.toContain('\u2014')
        expect(e.description).not.toContain('\u2014')
      }
    }

    const categories = getReleaseCategories(v060)
    expect(categories).toContain('Server and Devices')
    expect(categories).toContain('Security and Privacy')
  })

  it('tracks What is New seen state once per installed release version', () => {
    expect(hasSeenWhatsNew('0.6.0')).toBe(false)
    markWhatsNewSeen('0.6.0')
    expect(hasSeenWhatsNew('0.6.0')).toBe(true)
    expect(hasSeenWhatsNew('0.7.0')).toBe(false)
  })

  it('transitions updater states accurately without claiming download equals install', () => {
    const initial = createInitialUpdaterState('0.5.0')
    expect(initial.stage).toBe('idle')

    const available = reduceUpdateCheckResult(initial, {
      status: 'available',
      currentVersion: '0.5.0',
      latestVersion: '0.6.0',
      releaseDate: '2026-11-26T00:00:00Z',
      releaseNotes: 'Kinora v0.6.0',
      downloadUrl: 'https://github.com/millsydotdev/KinoraTV/releases/download/v0.6.0/Kinora.AppImage',
      hasSignature: true,
      platformKey: 'linux-x86_64',
      platformSupported: true,
      error: null,
    })
    expect(available.stage).toBe('available')
    expect(available.hasSignature).toBe(true)
    expect(describeUpdaterStage('downloaded')).toBe('Download completed')
    expect(describeUpdaterStage('restartRequired')).toBe('Restart required')
    expect(describeUpdaterStage('downloaded')).not.toBe(describeUpdaterStage('updated'))

    const failed = reduceUpdateCheckResult(initial, {
      status: 'error',
      currentVersion: '0.5.0',
      latestVersion: null,
      releaseDate: null,
      releaseNotes: null,
      downloadUrl: null,
      hasSignature: false,
      platformKey: 'linux-x86_64',
      platformSupported: false,
      error: 'Connection timed out',
    })
    expect(failed.stage).toBe('failed')
    expect(failed.message).toContain('Connection timed out')

    saveUpdateChannel('prerelease')
    expect(loadUpdateChannel()).toBe('prerelease')
  })

  it('evaluates Kinora client and server version compatibility accurately', () => {
    const compat = evaluateServerCompatibility('0.6.0', {
      appName: 'Kinora',
      version: '0.6.0',
      apiVersion: '1.0',
      minCompatibleClientVersion: '0.6.0',
      mode: 'server',
      localIp: '192.168.1.50',
      port: 5198,
      serverUrl: 'http://192.168.1.50:5198',
    })
    expect(compat.status).toBe('compatible')

    const clientOld = evaluateServerCompatibility('0.5.0', {
      appName: 'Kinora',
      version: '0.6.0',
      minCompatibleClientVersion: '0.6.0',
      mode: 'server',
      localIp: '192.168.1.50',
      port: 5198,
      serverUrl: 'http://192.168.1.50:5198',
    })
    expect(clientOld.status).toBe('clientOutdated')

    const serverOld = evaluateServerCompatibility('0.7.0', {
      appName: 'Kinora',
      version: '0.6.0',
      minCompatibleClientVersion: '0.6.0',
      mode: 'server',
      localIp: '192.168.1.50',
      port: 5198,
      serverUrl: 'http://192.168.1.50:5198',
    })
    expect(serverOld.status).toBe('serverOutdated')
  })
})
