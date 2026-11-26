// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TraktSettingsModal } from './TraktSettingsModal'
import * as traktModule from '../lib/trakt'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../state/store', () => ({
  useStore: () => ({
    setWatched: vi.fn(),
    recordView: vi.fn(),
  }),
}))

vi.mock('../lib/trakt', async (importOriginal) => {
  const actual = await importOriginal<typeof traktModule>()
  return {
    ...actual,
    loadTraktConfig: vi.fn(),
    saveTraktConfig: vi.fn(),
    clearTraktTokens: vi.fn(),
    requestDeviceCode: vi.fn(),
    pollDeviceToken: vi.fn(),
    performTraktSync: vi.fn(),
  }
})

describe('TraktSettingsModal', () => {
  let root: Root
  let host: HTMLDivElement

  const disconnectedConfig: traktModule.TraktConfig = {
    enabled: false,
    autoScrobble: true,
    syncOnStartup: false,
    clientId: 'test-client',
    accessToken: '',
    refreshToken: '',
    expiresAt: 0,
    user: null,
  }

  const connectedConfig: traktModule.TraktConfig = {
    enabled: true,
    autoScrobble: true,
    syncOnStartup: true,
    clientId: 'test-client',
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    expiresAt: Date.now() + 100000,
    user: {
      username: 'kinorauser',
      name: 'Kinora Viewer',
      vip: true,
    },
    lastSyncAt: '2026-11-21T10:00:00Z',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(traktModule.loadTraktConfig).mockReturnValue(disconnectedConfig)
    vi.mocked(traktModule.clearTraktTokens).mockReturnValue(disconnectedConfig)

    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    host.remove()
  })

  it('renders nothing when closed', async () => {
    await act(async () => {
      root.render(<TraktSettingsModal open={false} onClose={() => {}} />)
    })
    expect(host.innerHTML).toBe('')
  })

  it('renders connect screen when disconnected', async () => {
    await act(async () => {
      root.render(<TraktSettingsModal open={true} onClose={() => {}} />)
    })

    expect(host.textContent).toContain('Trakt.tv Scrobbler & Sync')
    expect(host.textContent).toContain('Connect with Trakt')
  })

  it('starts device pairing and displays user code', async () => {
    vi.mocked(traktModule.requestDeviceCode).mockResolvedValue({
      deviceCode: 'dev-code-123',
      userCode: 'ABCD-1234',
      verificationUrl: 'https://trakt.tv/activate',
      expiresIn: 600,
      interval: 5,
    })

    await act(async () => {
      root.render(<TraktSettingsModal open={true} onClose={() => {}} />)
    })

    const connectBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Connect with Trakt')
    )
    expect(connectBtn).toBeDefined()

    await act(async () => {
      connectBtn?.click()
    })

    expect(traktModule.requestDeviceCode).toHaveBeenCalled()
    expect(host.textContent).toContain('ABCD-1234')
    expect(host.textContent).toContain('https://trakt.tv/activate')
  })

  it('renders user details and triggers manual sync when connected', async () => {
    vi.mocked(traktModule.loadTraktConfig).mockReturnValue(connectedConfig)
    vi.mocked(traktModule.performTraktSync).mockResolvedValue({
      moviesImported: 12,
      episodesImported: 45,
      timestamp: '2026-11-22T12:00:00Z',
    })

    await act(async () => {
      root.render(<TraktSettingsModal open={true} onClose={() => {}} />)
    })

    expect(host.textContent).toContain('Kinora Viewer')
    expect(host.textContent).toContain('@kinorauser')
    expect(host.textContent).toContain('VIP')

    const syncBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Sync History Now')
    )
    expect(syncBtn).toBeDefined()

    await act(async () => {
      syncBtn?.click()
    })

    expect(traktModule.performTraktSync).toHaveBeenCalled()
    expect(host.textContent).toContain('12 movies and 45 episodes synchronized')
  })

  it('disconnects user account when Disconnect is clicked', async () => {
    vi.mocked(traktModule.loadTraktConfig).mockReturnValue(connectedConfig)

    await act(async () => {
      root.render(<TraktSettingsModal open={true} onClose={() => {}} />)
    })

    const disconnectBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Disconnect')
    )
    expect(disconnectBtn).toBeDefined()

    await act(async () => {
      disconnectBtn?.click()
    })

    expect(traktModule.clearTraktTokens).toHaveBeenCalled()
  })
})
