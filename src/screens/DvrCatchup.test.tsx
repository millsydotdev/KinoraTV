// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ToastProvider } from '../components/Toast'
import { catchupRef, channelRef, recordingRef, resolve } from '../data/refs'
import { ProfileProvider } from '../state/profiles'
import { StoreProvider } from '../state/store'
import { LiveTV } from './LiveTV'
import { Player } from './Player'
import { Recordings } from './Recordings'
import { Settings } from './Settings'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function mount(initialEntry: string) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)

  act(() => {
    root.render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <ToastProvider>
          <ProfileProvider>
            <StoreProvider initialDemo={true}>
              <Routes>
                <Route path="/recordings" element={<Recordings />} />
                <Route path="/live" element={<LiveTV />} />
                <Route path="/watch/:ref" element={<Player />} />
                <Route path="/settings/:section" element={<Settings />} />
              </Routes>
            </StoreProvider>
          </ProfileProvider>
        </ToastProvider>
      </MemoryRouter>,
    )
  })

  return {
    host,
    unmount: () => {
      act(() => root.unmount())
      host.remove()
    },
  }
}

describe('DVR, Live TV Recording, Catch-up TV & Timeshift', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('resolves recording and catchup refs cleanly for HLS playback', () => {
    const recRef = recordingRef('rec_1731636000_abcd1234')
    expect(recRef).toBe('recording:rec_1731636000_abcd1234')

    const recResolved = resolve(recRef, Date.now(), undefined, undefined, false)
    expect(recResolved).toBeDefined()
    expect(recResolved?.kind).toBe('recording')
    if (recResolved?.kind === 'recording') {
      expect(recResolved.streamUrl).toBe('kstream://localhost/dvr/rec_1731636000_abcd1234/playlist.m3u8')
    }

    const cuRef = catchupRef('xt-src-1', '1001', 1731636000, 60)
    expect(cuRef).toBe('catchup:xt:xt-src-1:1001:1731636000:60')

    const cuResolved = resolve(cuRef, Date.now(), undefined, undefined, false)
    expect(cuResolved).toBeDefined()
    expect(cuResolved?.kind).toBe('catchup')
    if (cuResolved?.kind === 'catchup') {
      expect(cuResolved.streamUrl).toBe('catchup://xt-src-1/1001/1731636000/60')
      expect(cuResolved.item.durationMins).toBe(60)
      expect(cuResolved.item.startTimestamp).toBe(1731636000)
    }
  })

  it('starts and stops a manual live recording from Player and displays it in Recordings', async () => {
    const { host, unmount } = mount(`/watch/${encodeURIComponent(channelRef('northlight-one'))}`)

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    const recordBtn = host.querySelector('[data-testid="player-record-btn"]') as HTMLButtonElement | null
    expect(recordBtn).not.toBeNull()
    expect(recordBtn?.getAttribute('aria-label')).toBe('Record live TV')

    // Start recording
    await act(async () => {
      recordBtn?.click()
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(recordBtn?.getAttribute('aria-label')).toBe('Stop recording')

    // Stop recording
    await act(async () => {
      recordBtn?.click()
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(recordBtn?.getAttribute('aria-label')).toBe('Record live TV')
    unmount()

    // Verify completed recording appears in Recordings screen
    const recScreen = mount('/recordings')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(recScreen.host.textContent).toContain('Recordings & DVR')
    expect(recScreen.host.textContent).toContain('DVR Storage:')
    const grid = recScreen.host.querySelector('[data-testid="recordings-grid"]')
    expect(grid).not.toBeNull()
    expect(grid?.textContent).toContain('completed')
    expect(grid?.textContent).toContain('Watch')
    expect(grid?.textContent).toContain('Protect')

    // Protect the recording
    const protectBtn = Array.from(recScreen.host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Protect'),
    )
    expect(protectBtn).toBeDefined()
    await act(async () => {
      protectBtn?.click()
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(recScreen.host.textContent).toContain('Protected')
    expect(recScreen.host.textContent).toContain('Unprotect')

    recScreen.unmount()
  })

  it('supports live TV timeshift rewind, delay indicator, and jump to live edge', async () => {
    const { host, unmount } = mount(`/watch/${encodeURIComponent(channelRef('northlight-one'))}`)

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    // Initially at live edge
    expect(host.querySelector('[data-testid="live-edge-badge"]')?.textContent).toBe('Live')
    expect(host.querySelector('[data-testid="timeshift-delay-badge"]')).toBeNull()

    const rewindBtn = host.querySelector('[data-testid="timeshift-rewind-btn"]') as HTMLButtonElement | null
    expect(rewindBtn).not.toBeNull()

    // Rewind 15s twice (-30s)
    await act(async () => {
      rewindBtn?.click()
      rewindBtn?.click()
    })

    const delayBadge = host.querySelector('[data-testid="timeshift-delay-badge"]')
    expect(delayBadge).not.toBeNull()
    expect(delayBadge?.textContent).toContain('-0:30')

    // Jump to Live
    const jumpLiveBtn = host.querySelector('[data-testid="jump-to-live-btn"]') as HTMLButtonElement | null
    expect(jumpLiveBtn).not.toBeNull()
    await act(async () => {
      jumpLiveBtn?.click()
    })

    expect(host.querySelector('[data-testid="timeshift-delay-badge"]')).toBeNull()
    expect(host.querySelector('[data-testid="live-edge-badge"]')?.textContent).toBe('Live')

    unmount()
  })

  it('creates, pauses, and deletes recurring Series Rules in the Recordings screen', async () => {
    const { host, unmount } = mount('/recordings')

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    // Open New Series Rule modal
    const newRuleBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('New Series Rule'),
    )
    expect(newRuleBtn).toBeDefined()
    await act(async () => {
      newRuleBtn?.click()
    })

    const titleInput = host.querySelector('#rule-title-input') as HTMLInputElement | null
    expect(titleInput).not.toBeNull()

    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      nativeSetter?.call(titleInput, 'Planet Earth')
      titleInput?.dispatchEvent(new Event('input', { bubbles: true }))
      titleInput?.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const form = host.querySelector('form.series-rule-modal') as HTMLFormElement | null
    expect(form).not.toBeNull()
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await new Promise((r) => setTimeout(r, 50))
    })

    // Should switch to Series Rules tab and display the new rule
    expect(host.textContent).toContain('Planet Earth')
    expect(host.textContent).toContain('Active Rule')
    expect(host.textContent).toContain('All Episodes')

    // Pause rule
    const pauseRuleBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Pause Rule'),
    )
    expect(pauseRuleBtn).toBeDefined()
    await act(async () => {
      pauseRuleBtn?.click()
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(host.textContent).toContain('Paused')

    // Delete rule
    const deleteRuleBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Delete Rule'),
    )
    expect(deleteRuleBtn).toBeDefined()
    await act(async () => {
      deleteRuleBtn?.click()
      await new Promise((r) => setTimeout(r, 50))
    })
    expect(host.textContent).toContain('No series rules configured')

    unmount()
  })

  it('renders DVR & Recording settings section cleanly', async () => {
    const { host, unmount } = mount('/settings/dvr')

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(host.textContent).toContain('DVR & Recording')
    expect(host.textContent).toContain('Maximum storage allocation')
    expect(host.textContent).toContain('Default start padding')
    expect(host.textContent).toContain('Default end padding')
    expect(host.textContent).toContain('Timeshift buffer window')

    unmount()
  })

  it('schedules and cancels upcoming programme recordings from the Live TV EPG', async () => {
    const { host, unmount } = mount('/live')

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    // Find an upcoming programme cell in the EPG grid (one that is not past and not on now)
    const cells = Array.from(host.querySelectorAll('button.prog')) as HTMLButtonElement[]
    const futureCell = cells.find((c) => !c.classList.contains('is-past') && !c.classList.contains('is-now'))
    expect(futureCell).toBeDefined()

    // Select future programme to open detail sheet
    await act(async () => {
      futureCell?.click()
      await new Promise((r) => setTimeout(r, 50))
    })

    const scheduleBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Schedule Recording'),
    )
    expect(scheduleBtn).toBeDefined()

    // Schedule recording
    await act(async () => {
      scheduleBtn?.click()
      await new Promise((r) => setTimeout(r, 50))
    })

    // Button should now offer Cancel Recording
    const cancelBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Cancel Recording'),
    )
    expect(cancelBtn).toBeDefined()

    // Cancel recording
    await act(async () => {
      cancelBtn?.click()
      await new Promise((r) => setTimeout(r, 50))
    })

    const scheduleAgainBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Schedule Recording'),
    )
    expect(scheduleAgainBtn).toBeDefined()

    unmount()
  })
})
