// @vitest-environment happy-dom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdaterProvider, useUpdater } from './updater'
import { UpdateNotificationBanner } from '../components/UpdateNotificationBanner'
import { WhatsNewModal, hasSeenWhatsNew } from '../components/WhatsNewModal'
import {
  UPDATE_AUTO_CHECK_KEY,
  UPDATE_CHANNEL_KEY,
  UPDATE_DISMISSED_KEY,
  UPDATE_HISTORY_KEY,
  UPDATE_PENDING_VERSION_KEY,
  loadUpdateHistory,
} from '../lib/updaterState'
import type { UpdateCheckResult, UpdateInstallProgress, UpdateInstallResult } from '../lib/native'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const nativeMocks = vi.hoisted(() => ({
  inside: true,
  checkForUpdates: vi.fn<
    (endpoint?: string | null, allowPrereleases?: boolean, force?: boolean) => Promise<UpdateCheckResult | null>
  >(),
  installUpdate: vi.fn<
    (onProgress?: (p: UpdateInstallProgress) => void, manifestUrl?: string | null) => Promise<UpdateInstallResult>
  >(),
  restartApp: vi.fn<() => Promise<void>>(),
}))

vi.mock('../lib/native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/native')>()
  return {
    ...actual,
    inNativeShell: () => nativeMocks.inside,
    checkForUpdates: (...args: [string | null | undefined, boolean | undefined, boolean | undefined]) =>
      nativeMocks.checkForUpdates(...args),
    installUpdate: (...args: [((p: UpdateInstallProgress) => void) | undefined, string | null | undefined]) =>
      nativeMocks.installUpdate(...args),
    restartApp: () => nativeMocks.restartApp(),
  }
})

let root: Root | null = null
let host: HTMLDivElement | null = null

async function mount(node: ReactNode) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(node)
  })
}

async function clickButton(textOrLabel: string) {
  const buttons = Array.from(document.querySelectorAll('button'))
  const btn = buttons.find(
    (b) => b.textContent?.trim() === textOrLabel || b.getAttribute('aria-label') === textOrLabel,
  )
  if (!btn) {
    throw new Error(`Button "${textOrLabel}" not found. Found: ${buttons.map((b) => b.textContent?.trim()).join(', ')}`)
  }
  await act(async () => {
    btn.click()
    await Promise.resolve()
    await Promise.resolve()
  })
}

function textOf(testId: string): string {
  return document.querySelector(`[data-testid="${testId}"]`)?.textContent ?? ''
}

function UpdaterHarness({ onViewReleaseNotes }: { onViewReleaseNotes?: () => void }) {
  const upd = useUpdater()
  return (
    <div>
      <UpdateNotificationBanner onViewReleaseNotes={onViewReleaseNotes ?? (() => {})} />
      <div data-testid="stage">{upd.state.stage}</div>
      <div data-testid="message">{upd.state.message}</div>
      <div data-testid="channel">{upd.state.channel}</div>
      <div data-testid="autocheck">{String(upd.state.autoCheckEnabled)}</div>
      <div data-testid="visible">{String(upd.notificationVisible)}</div>
      <button type="button" onClick={() => void upd.checkNow({ force: true, silent: false })}>
        Manual Check
      </button>
      <button type="button" onClick={() => void upd.checkNow({ force: false, silent: true })}>
        Silent Check
      </button>
      <button type="button" onClick={() => upd.setChannel('prerelease')}>
        Switch Prerelease
      </button>
      <button type="button" onClick={() => upd.setAutoCheckEnabled(false)}>
        Disable Auto Check
      </button>
      <button type="button" onClick={() => void upd.downloadAndInstall()}>
        Trigger Install
      </button>
    </div>
  )
}

const SIGNED_AVAILABLE: UpdateCheckResult = {
  status: 'available',
  currentVersion: '0.6.0',
  latestVersion: '0.6.5',
  releaseDate: '2026-12-01T10:00:00Z',
  releaseNotes: 'Signed desktop release with performance and reliability fixes.',
  downloadUrl: 'https://github.com/millsydotdev/KinoraTV/releases/download/v0.6.5/Kinora_0.6.5_amd64.AppImage',
  hasSignature: true,
  platformKey: 'linux-x86_64',
  platformSupported: true,
  error: null,
  manifestUrl: 'https://github.com/millsydotdev/KinoraTV/releases/download/v0.6.5/latest.json',
  assetSizeBytes: 52_428_800,
  releaseUrl: 'https://github.com/millsydotdev/KinoraTV/releases/tag/v0.6.5',
  cached: false,
}

beforeEach(() => {
  localStorage.clear()
  nativeMocks.inside = true
  nativeMocks.checkForUpdates.mockReset()
  nativeMocks.installUpdate.mockReset()
  nativeMocks.restartApp.mockReset()
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
})

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount()
    })
    root = null
  }
  host?.remove()
  host = null
})

describe('UpdaterProvider and UpdateNotificationBanner lifecycle', () => {
  it('shows notification banner on signed update, persists dismissal, and re-shows on newer version or manual check', async () => {
    nativeMocks.checkForUpdates.mockResolvedValueOnce(SIGNED_AVAILABLE)
    const onViewNotes = vi.fn()

    await mount(
      <UpdaterProvider>
        <UpdaterHarness onViewReleaseNotes={onViewNotes} />
      </UpdaterProvider>,
    )

    await clickButton('Silent Check')

    const banner = document.querySelector('[data-testid="update-notification-banner"]')
    expect(banner).not.toBeNull()
    expect(banner?.textContent).toContain('Update available: Kinora v0.6.5')
    expect(banner?.textContent).toContain('50.0 MB')
    expect(banner?.textContent).toContain('Signed')

    await clickButton('Release Notes')
    expect(onViewNotes).toHaveBeenCalledTimes(1)

    await clickButton('Dismiss update notification')
    expect(document.querySelector('[data-testid="update-notification-banner"]')).toBeNull()
    expect(localStorage.getItem(UPDATE_DISMISSED_KEY)).toBe('0.6.5')

    // Another silent check for the same version remains dismissed
    nativeMocks.checkForUpdates.mockResolvedValueOnce(SIGNED_AVAILABLE)
    await clickButton('Silent Check')
    expect(nativeMocks.checkForUpdates).toHaveBeenCalledTimes(2)
    expect(document.querySelector('[data-testid="update-notification-banner"]')).toBeNull()

    // Manual check clears dismissal so user sees the update immediately
    nativeMocks.checkForUpdates.mockResolvedValueOnce(SIGNED_AVAILABLE)
    await clickButton('Manual Check')
    expect(document.querySelector('[data-testid="update-notification-banner"]')).not.toBeNull()

    // Dismiss again, then a newer version (0.6.6) surfaces the notification again
    await clickButton('Dismiss update notification')
    expect(document.querySelector('[data-testid="update-notification-banner"]')).toBeNull()

    nativeMocks.checkForUpdates.mockResolvedValueOnce({
      ...SIGNED_AVAILABLE,
      latestVersion: '0.6.6',
    })
    await clickButton('Silent Check')
    const nextBanner = document.querySelector('[data-testid="update-notification-banner"]')
    expect(nextBanner?.textContent).toContain('Update available: Kinora v0.6.6')
  })

  it('refuses installation if signature is missing and never calls native installUpdate', async () => {
    nativeMocks.checkForUpdates.mockResolvedValueOnce({
      ...SIGNED_AVAILABLE,
      hasSignature: false,
    })

    await mount(
      <UpdaterProvider>
        <UpdaterHarness />
      </UpdaterProvider>,
    )

    await clickButton('Manual Check')
    expect(textOf('stage')).toBe('available')

    // Banner must not expose Download & Install when unsigned
    const allBtns = Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.trim())
    expect(allBtns).not.toContain('Download & Install')

    // Direct install invocation refuses unsigned update
    await clickButton('Trigger Install')
    expect(textOf('stage')).toBe('failed')
    expect(textOf('message')).toContain('missing cryptographic Minisign signature')
    expect(nativeMocks.installUpdate).not.toHaveBeenCalled()
  })

  it('tracks download, verification, installation, restart prompt, and pending upgrade version', async () => {
    nativeMocks.checkForUpdates.mockResolvedValueOnce(SIGNED_AVAILABLE)
    nativeMocks.installUpdate.mockImplementationOnce(async (onProgress, manifestUrl) => {
      expect(manifestUrl).toBe(SIGNED_AVAILABLE.manifestUrl)
      onProgress?.({ stage: 'downloading', percent: 45, downloadedBytes: 22_000_000, totalBytes: 52_428_800 })
      onProgress?.({ stage: 'verifying', percent: 100, downloadedBytes: 52_428_800, totalBytes: 52_428_800 })
      onProgress?.({ stage: 'verified', percent: 100, downloadedBytes: 52_428_800, totalBytes: 52_428_800 })
      onProgress?.({ stage: 'installing', percent: 100, downloadedBytes: 52_428_800, totalBytes: 52_428_800 })
      onProgress?.({ stage: 'restartRequired', percent: 100, downloadedBytes: 52_428_800, totalBytes: 52_428_800 })
      return { success: true, restartRequired: true, installedVersion: '0.6.5' }
    })
    nativeMocks.restartApp.mockResolvedValueOnce()

    await mount(
      <UpdaterProvider>
        <UpdaterHarness />
      </UpdaterProvider>,
    )

    await clickButton('Manual Check')
    await clickButton('Download & Install')

    expect(textOf('stage')).toBe('restartRequired')
    expect(localStorage.getItem(UPDATE_PENDING_VERSION_KEY)).toBe('0.6.5')
    const history = loadUpdateHistory()
    expect(history[0]?.stage).toBe('restartRequired')
    expect(history[0]?.toVersion).toBe('0.6.5')

    await clickButton('Restart Now')
    expect(nativeMocks.restartApp).toHaveBeenCalledTimes(1)
  })

  it('keeps installed version intact and records failure history when installation fails', async () => {
    nativeMocks.checkForUpdates.mockResolvedValueOnce(SIGNED_AVAILABLE)
    nativeMocks.installUpdate.mockResolvedValueOnce({
      success: false,
      error: 'Minisign signature mismatch on downloaded archive.',
    })

    await mount(
      <UpdaterProvider>
        <UpdaterHarness />
      </UpdaterProvider>,
    )

    await clickButton('Manual Check')
    await clickButton('Download & Install')

    expect(textOf('stage')).toBe('failed')
    expect(textOf('message')).toContain('current version v0.6.0 remains intact')
    expect(textOf('message')).toContain('Minisign signature mismatch')
    expect(localStorage.getItem(UPDATE_PENDING_VERSION_KEY)).toBeNull()
    const history = loadUpdateHistory()
    expect(history[0]?.stage).toBe('failed')
  })

  it('confirms post-restart upgrade when pending version matches running APP_VERSION', async () => {
    localStorage.setItem(UPDATE_PENDING_VERSION_KEY, '0.6.0')
    localStorage.setItem(UPDATE_DISMISSED_KEY, '0.6.0')

    await mount(
      <UpdaterProvider>
        <UpdaterHarness />
      </UpdaterProvider>,
    )

    expect(textOf('stage')).toBe('updated')
    expect(localStorage.getItem(UPDATE_PENDING_VERSION_KEY)).toBeNull()
    expect(localStorage.getItem(UPDATE_DISMISSED_KEY)).toBeNull()
    const history = JSON.parse(localStorage.getItem(UPDATE_HISTORY_KEY) ?? '[]')
    expect(history[0]?.stage).toBe('updated')
    expect(history[0]?.toVersion).toBe('0.6.0')
  })

  it('deduplicates concurrent checks, persists channel & auto-check settings, and handles offline state', async () => {
    let resolveFirst: ((val: UpdateCheckResult) => void) | null = null
    nativeMocks.checkForUpdates.mockImplementationOnce(
      () =>
        new Promise<UpdateCheckResult>((resolve) => {
          resolveFirst = resolve
        }),
    )

    await mount(
      <UpdaterProvider>
        <UpdaterHarness />
      </UpdaterProvider>,
    )

    await clickButton('Switch Prerelease')
    await clickButton('Disable Auto Check')
    expect(localStorage.getItem(UPDATE_CHANNEL_KEY)).toBe('prerelease')
    expect(localStorage.getItem(UPDATE_AUTO_CHECK_KEY)).toBe('false')

    // Trigger two concurrent checks; second must be ignored while first is in flight
    await clickButton('Manual Check')
    await clickButton('Manual Check')
    expect(nativeMocks.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(nativeMocks.checkForUpdates).toHaveBeenCalledWith(null, true, true)

    await act(async () => {
      resolveFirst?.({
        ...SIGNED_AVAILABLE,
        status: 'upToDate',
        latestVersion: '0.6.0',
      })
      await Promise.resolve()
    })

    expect(textOf('stage')).toBe('upToDate')

    // Offline check fails cleanly without calling IPC
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    await clickButton('Manual Check')
    expect(textOf('stage')).toBe('failed')
    expect(textOf('message')).toContain('offline')
    expect(nativeMocks.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('renders What\'s New offline release history alongside an online update notice and marks version seen', async () => {
    expect(hasSeenWhatsNew('0.6.0')).toBe(false)
    await mount(
      <WhatsNewModal
        open={true}
        onClose={() => {}}
        onlineReleaseNotice={{
          version: '0.6.5',
          releaseDate: '2026-12-01T10:00:00Z',
          notes: 'Signed desktop release ready to install.',
        }}
      />,
    )

    const bodyText = document.body.textContent ?? ''
    expect(bodyText).toContain('Newer release available online: v0.6.5')
    expect(bodyText).toContain('Signed desktop release ready to install.')
    expect(bodyText).toContain('Automatic Update Notifications, Signed Updater')
    expect(hasSeenWhatsNew('0.6.0')).toBe(true)
  })
})
