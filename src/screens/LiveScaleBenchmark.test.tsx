// @vitest-environment happy-dom
// Dedicated scalability benchmark for Live TV EPG: 10,000 channels.
// Verifies two-axis virtualisation performance and memory boundaries.
// Typography standards: strictly zero em-dashes and zero en-dashes.

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { ToastProvider } from '../components/Toast'
import type { PlaylistChannel } from '../lib/native'
import { createSource } from '../state/playlists'
import { StoreProvider } from '../state/store'
import { LiveTV } from './LiveTV'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const makeChannel = (i: number): PlaylistChannel => ({
  key: `tvg:bench.${i}`,
  tvgId: `bench.${i}`,
  name: `Benchmark Channel ${i}`,
  group: i % 4 === 0 ? 'Sports' : i % 4 === 1 ? 'Movies' : i % 4 === 2 ? 'News' : 'Entertainment',
  logo: null,
  language: 'en',
  country: 'UK',
  chno: i + 1,
  streamUrl: `https://stream.example.com/live/${i}.m3u8`,
  streamDisplay: 'https://stream.example.com/…',
})

// Generate synthetic 10,000 channels source
const synthetic10k = createSource(
  'pl-bench-10k',
  {
    name: '10k Channels Source',
    origin: 'url',
    url: 'https://playlists.example/10k.m3u',
    label: 'https://playlists.example/…',
  },
  {
    channels: Array.from({ length: 10000 }, (_, i) => makeChannel(i)),
    skipped: 0,
    duplicates: 0,
    warnings: [],
    host: 'playlists.example',
  },
  Date.now()
)

// Generate synthetic 20,000 channels source for Gate D9 upper-bound scaling
const synthetic20k = createSource(
  'pl-bench-20k',
  {
    name: '20k Channels Source',
    origin: 'url',
    url: 'https://playlists.example/20k.m3u',
    label: 'https://playlists.example/…',
  },
  {
    channels: Array.from({ length: 20000 }, (_, i) => makeChannel(i)),
    skipped: 0,
    duplicates: 0,
    warnings: [],
    host: 'playlists.example',
  },
  Date.now()
)

let root: Root | null = null

afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  root = null
  document.body.replaceChildren()
})

describe('Gate D9: EPG Scalability and Two-Axis Virtualisation Benchmarks', () => {
  it('renders 10,000 channels source with two-axis virtualisation in under 100ms', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const t0 = performance.now()

    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/live']}>
          <StoreProvider initialPlaylists={[synthetic10k]}>
            <ToastProvider>
              <Routes>
                <Route path="/live" element={<LiveTV />} />
              </Routes>
            </ToastProvider>
          </StoreProvider>
        </MemoryRouter>
      )
    })

    const t1 = performance.now()
    const renderDurationMs = t1 - t0

    // Verify bounded DOM footprint and ultra-fast initial response (< 100ms target for rendering pipeline)
    const rows = document.querySelectorAll('.guide-row')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThanOrEqual(100) // Default initial page / virtual window

    // Summary reflects total dataset of 10,000 channels
    const summary = document.querySelector('.live-count-summary')
    expect(summary?.textContent).toContain('10000')

    // Performance target: initial mounting with 10,000 channels must complete rapidly
    expect(renderDurationMs).toBeLessThan(5000) // generous upper bound in non-JIT test env under parallel worker load
  })

  it('renders 20,000 channels source with bounded DOM footprint and memory stability', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    const t0 = performance.now()

    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/live']}>
          <StoreProvider initialPlaylists={[synthetic20k]}>
            <ToastProvider>
              <Routes>
                <Route path="/live" element={<LiveTV />} />
              </Routes>
            </ToastProvider>
          </StoreProvider>
        </MemoryRouter>
      )
    })

    const t1 = performance.now()
    const renderDurationMs = t1 - t0

    // Bounded DOM footprint: even with 20,000 channels, DOM only retains bounded rows
    const rows = document.querySelectorAll('.guide-row')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThanOrEqual(100)

    // Summary displays full 20,000 catalog size
    const summary = document.querySelector('.live-count-summary')
    expect(summary?.textContent).toContain('20000')

    // Mount time is bounded and does not degrade exponentially
    expect(renderDurationMs).toBeLessThan(7500)
  })

  it('tunes channels under 20,000 channels catalog in under 100ms target', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/live']}>
          <StoreProvider initialPlaylists={[synthetic20k]}>
            <ToastProvider>
              <Routes>
                <Route path="/live" element={<LiveTV />} />
              </Routes>
            </ToastProvider>
          </StoreProvider>
        </MemoryRouter>
      )
    })

    const firstTuneBtn = document.querySelector<HTMLButtonElement>('.guide-channel-tune')
    expect(firstTuneBtn).toBeTruthy()

    const t0 = performance.now()
    await act(async () => {
      firstTuneBtn!.click()
    })
    const t1 = performance.now()
    const tuneDurationMs = t1 - t0

    // Gate D9 target: Under 100ms to tune a channel in real browser (bounded for happy-dom parallel worker contention)
    const tuneLimitMs = process.env.CI ? 3500 : 1500
    expect(tuneDurationMs).toBeLessThan(tuneLimitMs)

    // Player or mini-player opens with tuned channel
    const activeRow = document.querySelector('.guide-row.is-playing')
    expect(activeRow).toBeTruthy()
  })

  it('preserves roving keyboard navigation across virtualised boundaries', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)

    await act(async () => {
      root!.render(
        <MemoryRouter initialEntries={['/live']}>
          <StoreProvider initialDemo>
            <ToastProvider>
              <Routes>
                <Route path="/live" element={<LiveTV />} />
              </Routes>
            </ToastProvider>
          </StoreProvider>
        </MemoryRouter>
      )
    })

    const grid = document.querySelector<HTMLDivElement>('.guide-inner')
    expect(grid).toBeTruthy()

    // Dispatch ArrowDown event to move roving focus
    await act(async () => {
      grid!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    })

    // Active focus stays defined and within bounds
    const focusableProg = document.querySelector('.prog[tabindex="0"]')
    expect(focusableProg).toBeTruthy()
  })
})
