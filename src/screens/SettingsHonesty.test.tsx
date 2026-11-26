// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/Toast'
import { StoreProvider, sanitizePrefs, defaultPrefs } from '../state/store'
import { Settings } from './Settings'

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)

vi.mock('../lib/native', async (original) => {
  const actual = await original<typeof import('../lib/native')>()
  return {
    ...actual,
    getAppInfo: vi.fn().mockResolvedValue({
      name: 'Kinora',
      version: '0.6.0',
      profile: 'release',
      os: 'linux',
      arch: 'x86_64',
      commitHash: 'test-commit',
      dataDir: '/test/data',
    }),
    loadSources: vi.fn().mockResolvedValue({ sources: [], guides: [], mappings: [], notice: null }),
    saveSources: vi.fn().mockResolvedValue(undefined),
    getPlatformMode: vi.fn().mockResolvedValue({ mode: 'standalone' }),
    getArtworkCacheStats: vi.fn().mockResolvedValue({ totalCount: 12, totalSizeBytes: 1048576, failedCount: 0 }),
  }
})

let root: Root | null = null
let host: HTMLDivElement | null = null

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  localStorage.clear()
})

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount()
    })
  }
  root = null
  if (host) {
    host.remove()
    host = null
  }
  document.body.replaceChildren()
})

const settle = async () => {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

describe('Settings Honesty and Dead Toggle Audit (Finding 16)', () => {
  it('strips legacy removed preferences during sanitizePrefs', () => {
    const legacy = {
      ...defaultPrefs,
      hardwareDecoding: true,
      skipIntros: true,
      audioOutput: 'surround',
      dialogueBoost: true,
      normaliseVolume: true,
      autoRefresh: true,
      refreshInterval: 60,
      validateOnAdd: true,
      dropAfterFailures: 3,
      parallelChecks: 5,
    }

    const cleaned = sanitizePrefs(legacy as any)
    expect((cleaned as any).hardwareDecoding).toBeUndefined()
    expect((cleaned as any).skipIntros).toBeUndefined()
    expect((cleaned as any).audioOutput).toBeUndefined()
    expect((cleaned as any).dialogueBoost).toBeUndefined()
    expect((cleaned as any).normaliseVolume).toBeUndefined()
    expect((cleaned as any).autoRefresh).toBeUndefined()
    expect((cleaned as any).refreshInterval).toBeUndefined()
    expect((cleaned as any).validateOnAdd).toBeUndefined()
    expect((cleaned as any).dropAfterFailures).toBeUndefined()
    expect((cleaned as any).parallelChecks).toBeUndefined()
  })

  it('renders honest Sources settings with scheduled refresh selector and playback monitoring explanation', async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/settings/sources']}>
          <ToastProvider>
            <StoreProvider>
              <Routes>
                <Route path="/settings/:section" element={<Settings />} />
              </Routes>
            </StoreProvider>
          </ToastProvider>
        </MemoryRouter>
      )
    })
    await settle()

    const select = document.querySelector('select[aria-label="Automatic refresh schedule"]') as HTMLSelectElement | null
    expect(select).not.toBeNull()
    expect(select?.value).toBe('12h')

    const bodyText = document.body.textContent || ''
    expect(bodyText).toContain('Automatic refresh schedule')
    expect(bodyText).toContain('Monitored during playback')
    expect(bodyText).not.toContain('Automatic refresh is not available yet')
  })

  it('ensures dead toggles are not rendered in Playback settings', async () => {
    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/settings/playback']}>
          <ToastProvider>
            <StoreProvider>
              <Routes>
                <Route path="/settings/:section" element={<Settings />} />
              </Routes>
            </StoreProvider>
          </ToastProvider>
        </MemoryRouter>
      )
    })
    await settle()

    const bodyText = document.body.textContent || ''
    expect(bodyText).not.toContain('Hardware decoding')
    expect(bodyText).not.toContain('Dialogue boost')
    expect(bodyText).not.toContain('Even loudness')
    expect(bodyText).not.toContain('Audio output device')
  })

  it('strictly adheres to the zero em-dash typography standard across all sections', async () => {
    const sections = ['appearance', 'playback', 'audio', 'subtitles', 'epg', 'sources', 'privacy', 'about']
    for (const section of sections) {
      await act(async () => {
        root!.render(
          <MemoryRouter initialEntries={[`/settings/${section}`]}>
            <ToastProvider>
              <StoreProvider>
                <Routes>
                  <Route path="/settings/:section" element={<Settings />} />
                </Routes>
              </StoreProvider>
            </ToastProvider>
          </MemoryRouter>
        )
      })
      await settle()

      const text = document.body.textContent || ''
      expect(text).not.toContain('\u2014')
    }
  })
})
