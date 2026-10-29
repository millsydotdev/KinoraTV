// @vitest-environment happy-dom
// Live TV with a large playlist renders a bounded number of rows and cards (D8: 10,000 channels made
// the unbounded guide take seconds per render and per scrolled frame), and still reaches every channel.
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

const channel = (i: number): PlaylistChannel => ({
  key: `tvg:ch.${i}`, tvgId: `ch.${i}`, name: `Channel ${i}`, group: i % 2 ? 'Odd' : 'Even', logo: null, language: null, country: null, chno: i + 1,
  streamUrl: `https://cdn.example/${i}.m3u8`, streamDisplay: 'https://cdn.example/…',
})
const big = createSource('pl-big', { name: 'Big', origin: 'url', url: 'https://playlists.example/big.m3u', label: 'https://playlists.example/…' },
  { channels: Array.from({ length: 250 }, (_, i) => channel(i)), skipped: 0, duplicates: 0, warnings: [], host: 'playlists.example' }, Date.now())

let root: Root | null = null
async function mount(path: string) {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={[path]}>
        <StoreProvider initialPlaylists={[big]}>
          <ToastProvider><Routes><Route path="/live" element={<LiveTV />} /></Routes></ToastProvider>
        </StoreProvider>
      </MemoryRouter>,
    )
  })
}
const click = (el: Element) => act(async () => { (el as HTMLElement).click() })
const button = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(label))
afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  root = null
  document.body.replaceChildren()
})

describe('Live TV with a large playlist', () => {
  it('the guide shows a page of rows, outside the grid a button for more, and resets per category', async () => {
    await mount('/live')
    expect(document.querySelectorAll('.guide-row')).toHaveLength(100)
    const more = button('Show 100 more of 150 channels')!
    expect(more.closest('[role="grid"]')).toBeNull()
    await click(more)
    expect(document.querySelectorAll('.guide-row')).toHaveLength(200)
    await click(button('Show 50 more of 50 channels')!)
    expect(document.querySelectorAll('.guide-row')).toHaveLength(250)
    expect(button('more of')).toBeUndefined()
    await act(async () => {
      const select = document.querySelector<HTMLSelectElement>('.corner-select')!
      select.value = 'Odd'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(document.querySelectorAll('.guide-row')).toHaveLength(100)
    expect(document.querySelector('.guide-row')?.textContent).toContain('Channel 1')
  })

  it('channel up and down still reach channels beyond the shown page', async () => {
    await mount('/live?channel=pl-big~tvg_3a_ch.199')
    expect(document.querySelectorAll('.guide-row')).toHaveLength(100)
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true })) })
    expect(document.querySelector('.mini-player')?.textContent).toContain('Channel 200')
  })

  it('the channels view shows a page of cards with a button for more', async () => {
    await mount('/live?view=channels')
    expect(document.querySelectorAll('a.channel-card')).toHaveLength(120)
    await click(button('Show 120 more of 130 channels')!)
    expect(document.querySelectorAll('a.channel-card')).toHaveLength(240)
  })
})
